import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { EXERCISES } from '../../shared/exercises.js';
import { areTrainingDaysSpaced, type ProgramEquipment } from '../../shared/program.js';
import type { UserSettings } from '../../shared/types.js';
import { getAnalytics, listMeasurements, mapMeasurement } from '../analytics.js';
import { createBackup, listBackups } from '../backup.js';
import { createSession, requireAuth, requireCsrf } from '../auth.js';
import { db, logActivity, nowIso } from '../db.js';
import { hashPassword, verifyPassword } from '../security.js';
import { getSettings, updateSettings } from '../settings.js';
import { getWorkoutDetail, listRecentWorkouts } from '../workouts.js';
import { parseBody } from '../validation.js';

const measurementSchema = z.object({
  measuredAt: z.iso.date(),
  weightKg: z.number().min(20).max(350).nullable().optional(),
  waistCm: z.number().min(30).max(250).nullable().optional(),
  chestCm: z.number().min(30).max(250).nullable().optional(),
  armCm: z.number().min(10).max(100).nullable().optional(),
  thighCm: z.number().min(20).max(150).nullable().optional(),
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  notes: z.string().trim().max(500).default(''),
}).refine((input) => [input.weightKg, input.waistCm, input.chestCm, input.armCm, input.thighCm, input.sleepHours].some((value) => value != null), {
  message: 'Укажите хотя бы один замер',
});

const equipmentValues = [
  'bodyweight', 'chair', 'stable-elevated-surface', 'backpack', 'floor-mat',
  'wall-support', 'long-resistance-band', 'secure-high-anchor', 'bands', 'resistance-bands',
] as const;

const settingsSchema = z.object({
  startDate: z.iso.date(),
  timezone: z.literal('Europe/Oslo'),
  trainingDays: z.array(z.number().int().min(0).max(6)).length(3).refine(areTrainingDaysSpaced, 'Между силовыми тренировками должен быть хотя бы один день отдыха'),
  equipment: z.array(z.enum(equipmentValues)).max(10),
  displayName: z.string().trim().min(1).max(40),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10, 'Минимум 10 символов').max(128),
});

function mutationOptions() {
  return { preHandler: [requireAuth, requireCsrf] };
}

function safeText(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function coachMarkdown(payload: ReturnType<typeof buildExportPayload>): string {
  const settings = payload.settings;
  const lines = [
    '# Отчёт Trenyrovka для тренера',
    '',
    `Сформирован: ${payload.generatedAt}`,
    `Часовой пояс: ${settings.timezone}`,
    `Дата старта программы: ${settings.startDate}`,
    `Тренировочные дни: ${settings.trainingDays.join(', ')}`,
    `Оборудование: ${settings.equipment.length ? settings.equipment.join(', ') : 'вес тела и рюкзак'}`,
    '',
    '## Краткая статистика',
    '',
    `- Завершено тренировок: ${payload.analytics.completedWorkouts}`,
    `- Завершено подходов: ${payload.analytics.completedSets}`,
    `- Соблюдение плана: ${payload.analytics.adherencePercent}%`,
    `- Тренировочное время: ${payload.analytics.totalTrainingMinutes} мин`,
    `- Серия полных недель: ${payload.analytics.currentStreakWeeks}`,
    '',
    '## Замеры',
    '',
    '| Дата | Вес, кг | Талия, см | Грудь, см | Рука, см | Бедро, см | Сон, ч | Заметка |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
    ...payload.measurements.map((item) => `| ${item.measuredAt} | ${item.weightKg ?? '—'} | ${item.waistCm ?? '—'} | ${item.chestCm ?? '—'} | ${item.armCm ?? '—'} | ${item.thighCm ?? '—'} | ${item.sleepHours ?? '—'} | ${safeText(item.notes)} |`),
    '',
    '## Тренировки (новые сверху)',
    '',
  ];

  for (const workout of payload.workouts) {
    lines.push(
      `### ${workout.scheduledDate} · Тренировка ${workout.code} · неделя ${workout.week}`,
      '',
      `Статус: ${workout.status}; длительность: ${workout.durationMinutes ?? '—'} мин; готовность: ${workout.readiness ?? '—'}/5; сон: ${workout.sleepHours ?? '—'} ч; сложность: ${workout.overallEffort ?? '—'}/10; боль: ${workout.pain ?? '—'}/10.`,
      '',
      '| Упражнение | Подход | Результат | Нагрузка, кг | RIR | Статус |',
      '|---|---:|---:|---:|---:|---|',
      ...workout.sets.map((set) => `| ${safeText(EXERCISES[set.exerciseId].title)} | ${set.setNumber} | ${set.actualValue ?? '—'} | ${set.loadKg ?? '—'} | ${set.rir ?? '—'} | ${set.status} |`),
      '',
    );
    if (workout.preNotes) lines.push(`До тренировки: ${workout.preNotes}`, '');
    if (workout.postNotes) lines.push(`После тренировки: ${workout.postNotes}`, '');
  }

  lines.push('## Научная основа', '', '- ACSM 2026 Resistance Training Position Stand: https://doi.org/10.1249/mss.0000000000003897', '- Программа использует 2–3 подхода, прогрессию нагрузки и 1–3 повтора в запасе.', '');
  return lines.join('\n');
}

function buildExportPayload() {
  const workouts = listRecentWorkouts(1000).map((summary) => getWorkoutDetail(summary.id)).filter((item) => item !== null);
  const analytics = getAnalytics();
  const events = db.prepare(`
    SELECT event_type AS eventType, entity_id AS entityId, payload_json AS payloadJson, created_at AS createdAt
    FROM activity_events
    WHERE event_type NOT IN ('login_success', 'account_created')
    ORDER BY created_at ASC
  `).all() as Array<{ eventType: string; entityId: string | null; payloadJson: string; createdAt: string }>;

  return {
    formatVersion: 1,
    generatedAt: nowIso(),
    settings: getSettings(),
    analytics: {
      adherencePercent: analytics.adherencePercent,
      completedWorkouts: analytics.completedWorkouts,
      completedSets: analytics.completedSets,
      totalTrainingMinutes: analytics.totalTrainingMinutes,
      currentStreakWeeks: analytics.currentStreakWeeks,
    },
    measurements: listMeasurements(),
    workouts,
    activityEvents: events.map((event) => ({ ...event, payload: JSON.parse(event.payloadJson) as unknown, payloadJson: undefined })),
  };
}

export async function dataRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { limit?: string } }>('/api/workouts', { preHandler: requireAuth }, async (request) => {
    const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 50));
    return listRecentWorkouts(limit);
  });

  app.get('/api/measurements', { preHandler: requireAuth }, async () => listMeasurements());

  app.post('/api/measurements', mutationOptions(), async (request, reply) => {
    const input = parseBody(measurementSchema, request.body, reply);
    if (!input) return;
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO measurements (
        id, measured_at, weight_kg, waist_cm, chest_cm, arm_cm, thigh_cm, sleep_hours, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.measuredAt, input.weightKg ?? null, input.waistCm ?? null, input.chestCm ?? null, input.armCm ?? null, input.thighCm ?? null, input.sleepHours ?? null, input.notes, createdAt);
    logActivity('measurement_added', id, { measuredAt: input.measuredAt });
    const row = db.prepare('SELECT * FROM measurements WHERE id = ?').get(id) as Parameters<typeof mapMeasurement>[0];
    return reply.code(201).send(mapMeasurement(row));
  });

  app.delete<{ Params: { id: string } }>('/api/measurements/:id', mutationOptions(), async (request, reply) => {
    const result = db.prepare('DELETE FROM measurements WHERE id = ?').run(request.params.id);
    if (result.changes === 0) return reply.code(404).send({ error: 'not_found', message: 'Замер не найден' });
    logActivity('measurement_deleted', request.params.id);
    return reply.code(204).send();
  });

  app.get('/api/analytics', { preHandler: requireAuth }, async () => getAnalytics());
  app.get('/api/settings', { preHandler: requireAuth }, async () => getSettings());

  app.put('/api/settings', mutationOptions(), async (request, reply) => {
    const input = parseBody(settingsSchema, request.body, reply);
    if (!input) return;
    const settings: UserSettings = {
      startDate: input.startDate,
      timezone: input.timezone,
      trainingDays: [...input.trainingDays].sort((a, b) => a - b),
      equipment: input.equipment as ProgramEquipment[],
      displayName: input.displayName,
    };
    const updated = updateSettings(settings);
    logActivity('settings_updated', null, { trainingDays: updated.trainingDays, equipment: updated.equipment });
    return updated;
  });

  app.put('/api/settings/password', mutationOptions(), async (request, reply) => {
    const input = parseBody(passwordSchema, request.body, reply);
    if (!input) return;
    const user = db.prepare('SELECT password_hash FROM users WHERE id = 1').get() as { password_hash: string } | undefined;
    if (!user || !(await verifyPassword(input.currentPassword, user.password_hash))) {
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Текущий пароль указан неверно' });
    }
    const newHash = await hashPassword(input.newPassword);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = 1').run(newHash, nowIso());
    db.prepare('DELETE FROM auth_sessions').run();
    const csrfToken = createSession(reply);
    logActivity('password_changed');
    return { authenticated: true, csrfToken };
  });

  app.get<{ Querystring: { format?: string } }>('/api/export', { preHandler: requireAuth }, async (request, reply) => {
    const payload = buildExportPayload();
    if (request.query.format === 'markdown') {
      reply.header('content-disposition', 'attachment; filename="trenyrovka-coach-report.md"');
      return reply.type('text/markdown; charset=utf-8').send(coachMarkdown(payload));
    }
    reply.header('content-disposition', 'attachment; filename="trenyrovka-export.json"');
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(payload, null, 2));
  });

  app.get('/api/backups', { preHandler: requireAuth }, async () => listBackups());
  app.post('/api/backups', mutationOptions(), async (_request, reply) => {
    const backup = await createBackup();
    logActivity('backup_created', backup.fileName, { sizeBytes: backup.sizeBytes });
    return reply.code(201).send(backup);
  });
}
