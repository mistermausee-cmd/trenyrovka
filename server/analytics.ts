import { DateTime } from 'luxon';

import { EXERCISES, isExerciseId, type ExerciseId } from '../shared/exercises.js';
import type { AnalyticsResponse, MeasurementRecord } from '../shared/types.js';
import { db } from './db.js';
import { getScheduleRevision, getSettings } from './settings.js';
import { listRecentWorkouts } from './workouts.js';

interface MeasurementRow {
  id: string;
  measured_at: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  sleep_hours: number | null;
  notes: string;
  created_at: string;
}

export function mapMeasurement(row: MeasurementRow): MeasurementRecord {
  return {
    id: row.id,
    measuredAt: row.measured_at,
    weightKg: row.weight_kg,
    waistCm: row.waist_cm,
    chestCm: row.chest_cm,
    armCm: row.arm_cm,
    thighCm: row.thigh_cm,
    sleepHours: row.sleep_hours,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function listMeasurements(): MeasurementRecord[] {
  const rows = db.prepare('SELECT * FROM measurements ORDER BY measured_at ASC, created_at ASC').all() as MeasurementRow[];
  return rows.map(mapMeasurement);
}

export function listExpectedWorkoutSlots(todayOverride?: string): string[] {
  const settings = getSettings();
  let day = DateTime.fromISO(settings.startDate, { zone: settings.timezone }).startOf('day');
  const today = todayOverride
    ? DateTime.fromISO(todayOverride, { zone: settings.timezone }).startOf('day')
    : DateTime.now().setZone(settings.timezone).startOf('day');
  if (!day.isValid || !today.isValid || day > today) return [];
  const end = DateTime.min(today, day.plus({ days: 83 }));
  const slots: string[] = [];
  while (day <= end) {
    if (settings.trainingDays.includes(day.weekday % 7)) slots.push(day.toISODate()!);
    day = day.plus({ days: 1 });
  }
  return slots;
}

export function expectedWorkoutsToDate(): number {
  return listExpectedWorkoutSlots().length;
}

export function getNextAvailablePlannedSlot(todayIso: string): string | null {
  const scheduleRevision = getScheduleRevision();
  const alreadyClaimedToday = db.prepare(`
    SELECT 1 FROM workout_sessions
    WHERE scheduled_date = ? AND schedule_revision = ? AND planned_slot_date IS NOT NULL AND status IN ('in_progress', 'completed')
    LIMIT 1
  `).get(todayIso, scheduleRevision);
  if (alreadyClaimedToday) return null;

  const usedRows = db.prepare(`
    SELECT DISTINCT planned_slot_date
    FROM workout_sessions
    WHERE planned_slot_date IS NOT NULL AND schedule_revision = ? AND status IN ('in_progress', 'completed')
  `).all(scheduleRevision) as Array<{ planned_slot_date: string }>;
  const used = new Set(usedRows.map((row) => row.planned_slot_date));
  return listExpectedWorkoutSlots(todayIso).find((slot) => !used.has(slot)) ?? null;
}

export function calculateCurrentStreakWeeks(): number {
  const settings = getSettings();
  const scheduleRevision = getScheduleRevision();
  const rows = db.prepare(`
    SELECT DISTINCT planned_slot_date
    FROM workout_sessions
    WHERE status = 'completed' AND planned_slot_date IS NOT NULL AND schedule_revision = ?
  `).all(scheduleRevision) as Array<{ planned_slot_date: string }>;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = DateTime.fromISO(row.planned_slot_date, { zone: settings.timezone });
    if (!date.isValid) continue;
    const key = `${date.weekYear}-W${String(date.weekNumber).padStart(2, '0')}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let cursor = DateTime.now().setZone(settings.timezone).startOf('week');
  const currentKey = `${cursor.weekYear}-W${String(cursor.weekNumber).padStart(2, '0')}`;
  if ((counts.get(currentKey) ?? 0) < 3) cursor = cursor.minus({ weeks: 1 });
  let streak = 0;
  while (streak < 52) {
    const key = `${cursor.weekYear}-W${String(cursor.weekNumber).padStart(2, '0')}`;
    if ((counts.get(key) ?? 0) < 3) break;
    streak += 1;
    cursor = cursor.minus({ weeks: 1 });
  }
  return streak;
}

export function getAnalytics(): AnalyticsResponse {
  const recentWorkouts = listRecentWorkouts(1000);
  const completed = recentWorkouts.filter((workout) => workout.status === 'completed');
  const completedSetsRow = db.prepare("SELECT COUNT(*) AS count FROM set_logs WHERE status = 'completed'").get() as { count: number };
  const scheduleRevision = getScheduleRevision();
  const countedRow = db.prepare(`
    SELECT COUNT(DISTINCT planned_slot_date) AS count
    FROM workout_sessions
    WHERE status = 'completed' AND planned_slot_date IS NOT NULL AND schedule_revision = ?
  `).get(scheduleRevision) as { count: number };
  const expected = expectedWorkoutsToDate();
  const progressRows = db.prepare(`
    SELECT s.exercise_id, w.scheduled_date, MAX(s.actual_value) AS best_value, MAX(s.load_kg) AS load_kg
    FROM set_logs s
    JOIN workout_sessions w ON w.id = s.workout_session_id
    WHERE s.status = 'completed' AND w.status = 'completed' AND s.actual_value IS NOT NULL
    GROUP BY s.exercise_id, w.scheduled_date
    ORDER BY w.scheduled_date ASC
  `).all() as Array<{ exercise_id: string; scheduled_date: string; best_value: number; load_kg: number | null }>;

  const byExercise = new Map<ExerciseId, Array<{ date: string; bestValue: number; loadKg: number | null }>>();
  for (const row of progressRows) {
    if (!isExerciseId(row.exercise_id)) continue;
    const points = byExercise.get(row.exercise_id) ?? [];
    points.push({ date: row.scheduled_date, bestValue: row.best_value, loadKg: row.load_kg });
    byExercise.set(row.exercise_id, points);
  }

  return {
    adherencePercent: expected === 0 ? 100 : Math.min(100, Math.round((countedRow.count / expected) * 100)),
    completedWorkouts: completed.length,
    completedSets: completedSetsRow.count,
    totalTrainingMinutes: completed.reduce((total, workout) => total + (workout.durationMinutes ?? 0), 0),
    currentStreakWeeks: calculateCurrentStreakWeeks(),
    measurements: listMeasurements(),
    recentWorkouts: recentWorkouts.slice(0, 30),
    exerciseProgress: Array.from(byExercise, ([exerciseId, points]) => ({ exerciseId, title: EXERCISES[exerciseId].title, points })),
  };
}
