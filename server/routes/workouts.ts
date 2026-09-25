import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { EXERCISES, isExerciseId } from '../../shared/exercises.js';
import { getNextWorkoutCode, getProgramDay, getWorkoutTemplate } from '../../shared/program.js';
import { requireAuth, requireCsrf } from '../auth.js';
import { getNextAvailablePlannedSlot } from '../analytics.js';
import { db, logActivity, nowIso } from '../db.js';
import { getScheduleRevision, getSettings } from '../settings.js';
import { localDateIso, localDayUtcBounds } from '../time.js';
import { parseBody } from '../validation.js';
import { countCompletedWorkouts, getActiveWorkout, getWorkoutDetail } from '../workouts.js';

const startSchema = z.object({
  readiness: z.number().int().min(1).max(5),
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  notes: z.string().trim().max(500).default(''),
});

const setSchema = z.object({
  exerciseId: z.string().refine(isExerciseId, 'Неизвестное упражнение'),
  exerciseIndex: z.number().int().min(0).max(30),
  setNumber: z.number().int().min(1).max(10),
  actualValue: z.number().min(0).max(1000).nullable().optional(),
  loadKg: z.number().min(0).max(500).nullable().optional(),
  rir: z.number().int().min(0).max(10).nullable().optional(),
  status: z.enum(['completed', 'skipped']),
  notes: z.string().trim().max(300).default(''),
});

const completeSchema = z.object({
  overallEffort: z.number().int().min(1).max(10),
  pain: z.number().int().min(0).max(10),
  notes: z.string().trim().max(1000).default(''),
});

function protectedMutation() {
  return { preHandler: [requireAuth, requireCsrf] };
}

export async function workoutRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/workouts', protectedMutation(), async (request, reply) => {
    const input = parseBody(startSchema, request.body, reply);
    if (!input) return;

    const active = getActiveWorkout();
    if (active) return reply.code(409).send({ error: 'active_workout_exists', message: 'Сначала продолжите текущую тренировку', workoutId: active.id });

    const settings = getSettings();
    const today = localDateIso(settings.timezone);
    const dayBounds = localDayUtcBounds(today, settings.timezone);
    const completedToday = db.prepare(`
      SELECT 1 FROM workout_sessions
      WHERE status = 'completed'
        AND (scheduled_date = ? OR (completed_at >= ? AND completed_at < ?))
      LIMIT 1
    `).get(today, dayBounds.start, dayBounds.end);
    if (completedToday) {
      return reply.code(409).send({
        error: 'recovery_day_required',
        message: 'Сегодня уже есть завершённая силовая тренировка. Дай мышцам восстановиться до следующего дня.',
      });
    }
    const programDay = getProgramDay(settings.startDate, today, settings.trainingDays);
    if (programDay.status === 'before-start') {
      return reply.code(409).send({
        error: 'program_not_started',
        message: `Программа начнётся ${settings.startDate}. Измените дату старта в настройках, если хотите начать раньше.`,
      });
    }
    const week = programDay.week ?? 12;
    const code = getNextWorkoutCode(countCompletedWorkouts());
    const template = getWorkoutTemplate(code, week, settings.equipment);
    const plannedSlotDate = programDay.status === 'active' ? getNextAvailablePlannedSlot(today) : null;
    const scheduleRevision = getScheduleRevision();
    const id = crypto.randomUUID();
    const timestamp = nowIso();

    db.prepare(`
      INSERT INTO workout_sessions (
        id, code, week, scheduled_date, planned_slot_date, schedule_revision, template_json, started_at, status, readiness, sleep_hours, pre_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?)
    `).run(id, code, week, today, plannedSlotDate, scheduleRevision, JSON.stringify(template), timestamp, input.readiness, input.sleepHours ?? null, input.notes);
    logActivity('workout_started', id, { code, week, readiness: input.readiness, plannedSlotDate });

    return reply.code(201).send(getWorkoutDetail(id));
  });

  app.get<{ Params: { id: string } }>('/api/workouts/:id', { preHandler: requireAuth }, async (request, reply) => {
    const workout = getWorkoutDetail(request.params.id);
    if (!workout) return reply.code(404).send({ error: 'not_found', message: 'Тренировка не найдена' });
    return workout;
  });

  app.put<{ Params: { id: string } }>('/api/workouts/:id/sets', protectedMutation(), async (request, reply) => {
    const input = parseBody(setSchema, request.body, reply);
    if (!input) return;
    const workout = getWorkoutDetail(request.params.id);
    if (!workout) return reply.code(404).send({ error: 'not_found', message: 'Тренировка не найдена' });
    if (workout.status !== 'in_progress') return reply.code(409).send({ error: 'workout_closed', message: 'Эта тренировка уже закрыта' });

    const planned = workout.template.exercises[input.exerciseIndex];
    if (!planned || planned.exerciseId !== input.exerciseId || !EXERCISES[input.exerciseId]) {
      return reply.code(400).send({ error: 'exercise_mismatch', message: 'Упражнение не входит в эту тренировку' });
    }
    if (input.setNumber > workout.template.prescription.sets) {
      return reply.code(400).send({ error: 'set_out_of_range', message: 'Номер подхода превышает план' });
    }
    if (input.status === 'completed' && (input.actualValue == null || input.actualValue <= 0)) {
      return reply.code(400).send({ error: 'value_required', message: 'Укажите выполненные повторения или секунды' });
    }

    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO set_logs (
        id, workout_session_id, exercise_id, exercise_index, set_number,
        actual_value, load_kg, rir, status, notes, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workout_session_id, exercise_index, set_number) DO UPDATE SET
        actual_value = excluded.actual_value,
        load_kg = excluded.load_kg,
        rir = excluded.rir,
        status = excluded.status,
        notes = excluded.notes,
        completed_at = excluded.completed_at
    `).run(
      crypto.randomUUID(), request.params.id, input.exerciseId, input.exerciseIndex, input.setNumber,
      input.actualValue ?? null, input.loadKg ?? null, input.rir ?? null, input.status, input.notes, timestamp,
    );
    logActivity(input.status === 'completed' ? 'set_completed' : 'set_skipped', request.params.id, {
      exerciseId: input.exerciseId,
      setNumber: input.setNumber,
    });
    return getWorkoutDetail(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/workouts/:id/complete', protectedMutation(), async (request, reply) => {
    const input = parseBody(completeSchema, request.body, reply);
    if (!input) return;
    const workout = getWorkoutDetail(request.params.id);
    if (!workout) return reply.code(404).send({ error: 'not_found', message: 'Тренировка не найдена' });
    if (workout.status !== 'in_progress') return reply.code(409).send({ error: 'workout_closed', message: 'Эта тренировка уже закрыта' });
    if (!workout.sets.some((set) => set.status === 'completed')) {
      return reply.code(400).send({ error: 'empty_workout', message: 'Сначала отметьте хотя бы один выполненный подход' });
    }

    const completedAt = nowIso();
    db.prepare(`
      UPDATE workout_sessions
      SET status = 'completed', completed_at = ?, overall_effort = ?, pain = ?, post_notes = ?
      WHERE id = ?
    `).run(completedAt, input.overallEffort, input.pain, input.notes, request.params.id);
    logActivity('workout_completed', request.params.id, { overallEffort: input.overallEffort, pain: input.pain });
    return getWorkoutDetail(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/workouts/:id/abandon', protectedMutation(), async (request, reply) => {
    const workout = getWorkoutDetail(request.params.id);
    if (!workout) return reply.code(404).send({ error: 'not_found', message: 'Тренировка не найдена' });
    if (workout.status !== 'in_progress') return reply.code(409).send({ error: 'workout_closed', message: 'Эта тренировка уже закрыта' });
    db.prepare("UPDATE workout_sessions SET status = 'abandoned', completed_at = ? WHERE id = ?").run(nowIso(), request.params.id);
    logActivity('workout_abandoned', request.params.id);
    return reply.code(204).send();
  });
}
