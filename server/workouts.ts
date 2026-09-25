import type { WorkoutSessionDetail, WorkoutSessionSummary, WorkoutSetLog } from '../shared/types.js';
import type { WorkoutTemplate } from '../shared/program.js';
import type { ExerciseId } from '../shared/exercises.js';
import { db } from './db.js';

interface WorkoutRow {
  id: string;
  code: 'A' | 'B';
  week: number;
  scheduled_date: string;
  planned_slot_date: string | null;
  template_json: string;
  started_at: string;
  completed_at: string | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  readiness: number | null;
  sleep_hours: number | null;
  pre_notes: string;
  overall_effort: number | null;
  pain: number | null;
  post_notes: string;
  completed_sets: number;
}

interface SetRow {
  id: string;
  exercise_id: ExerciseId;
  exercise_index: number;
  set_number: number;
  actual_value: number | null;
  load_kg: number | null;
  rir: number | null;
  status: 'completed' | 'skipped';
  notes: string;
  completed_at: string;
}

const workoutSelect = `
  SELECT w.*,
    (SELECT COUNT(*) FROM set_logs s WHERE s.workout_session_id = w.id AND s.status = 'completed') AS completed_sets
  FROM workout_sessions w
`;

function mapSummary(row: WorkoutRow): WorkoutSessionSummary {
  const template = JSON.parse(row.template_json) as WorkoutTemplate;
  const totalSets = template.exercises.length * template.prescription.sets;
  const durationMinutes = row.completed_at
    ? Math.max(1, Math.round((Date.parse(row.completed_at) - Date.parse(row.started_at)) / 60_000))
    : null;

  return {
    id: row.id,
    code: row.code,
    week: row.week,
    scheduledDate: row.scheduled_date,
    plannedSlotDate: row.planned_slot_date,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    readiness: row.readiness,
    sleepHours: row.sleep_hours,
    overallEffort: row.overall_effort,
    pain: row.pain,
    durationMinutes,
    completedSets: row.completed_sets,
    totalSets,
  };
}

function mapSet(row: SetRow): WorkoutSetLog {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    exerciseIndex: row.exercise_index,
    setNumber: row.set_number,
    actualValue: row.actual_value,
    loadKg: row.load_kg,
    rir: row.rir,
    status: row.status,
    notes: row.notes,
    completedAt: row.completed_at,
  };
}

export function getWorkoutSummary(id: string): WorkoutSessionSummary | null {
  const row = db.prepare(`${workoutSelect} WHERE w.id = ?`).get(id) as WorkoutRow | undefined;
  return row ? mapSummary(row) : null;
}

export function getWorkoutDetail(id: string): WorkoutSessionDetail | null {
  const row = db.prepare(`${workoutSelect} WHERE w.id = ?`).get(id) as WorkoutRow | undefined;
  if (!row) return null;

  const sets = db.prepare(`
    SELECT * FROM set_logs WHERE workout_session_id = ? ORDER BY exercise_index, set_number
  `).all(id) as SetRow[];

  return {
    ...mapSummary(row),
    template: JSON.parse(row.template_json) as WorkoutTemplate,
    preNotes: row.pre_notes,
    postNotes: row.post_notes,
    sets: sets.map(mapSet),
  };
}

export function getActiveWorkout(): WorkoutSessionSummary | null {
  const row = db.prepare(`${workoutSelect} WHERE w.status = 'in_progress' ORDER BY w.started_at DESC LIMIT 1`).get() as WorkoutRow | undefined;
  return row ? mapSummary(row) : null;
}

export function getLastCompletedWorkout(): WorkoutSessionSummary | null {
  const row = db.prepare(`${workoutSelect} WHERE w.status = 'completed' ORDER BY w.completed_at DESC LIMIT 1`).get() as WorkoutRow | undefined;
  return row ? mapSummary(row) : null;
}

export function countCompletedWorkouts(): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM workout_sessions WHERE status = 'completed'").get() as { count: number };
  return row.count;
}

export function countCompletedBetween(startDate: string, endDate: string): number {
  const row = db.prepare(`
    SELECT COUNT(DISTINCT scheduled_date) AS count FROM workout_sessions
    WHERE status = 'completed' AND scheduled_date BETWEEN ? AND ?
  `).get(startDate, endDate) as { count: number };
  return row.count;
}

export function listRecentWorkouts(limit = 20): WorkoutSessionSummary[] {
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
  const rows = db.prepare(`${workoutSelect} ORDER BY w.started_at DESC LIMIT ?`).all(safeLimit) as WorkoutRow[];
  return rows.map(mapSummary);
}
