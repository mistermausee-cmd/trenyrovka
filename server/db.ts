import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { config } from './config.js';

const databaseDirectory = path.dirname(path.resolve(config.DATABASE_PATH));
mkdirSync(databaseDirectory, { recursive: true, mode: 0o700 });

export const db = new Database(config.DATABASE_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

const CURRENT_SCHEMA_VERSION = 3;

const migrations: Record<number, () => void> = {
  1: () => db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE auth_sessions (
      token_hash TEXT PRIMARY KEY,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX idx_auth_sessions_expires ON auth_sessions(expires_at);

    CREATE TABLE settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      start_date TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Europe/Oslo',
      training_days_json TEXT NOT NULL DEFAULT '[1,3,5]',
      equipment_json TEXT NOT NULL DEFAULT '[]',
      display_name TEXT NOT NULL DEFAULT 'Атлет',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL CHECK (code IN ('A', 'B')),
      week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 12),
      scheduled_date TEXT NOT NULL,
      template_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
      readiness INTEGER CHECK (readiness BETWEEN 1 AND 5),
      sleep_hours REAL CHECK (sleep_hours BETWEEN 0 AND 24),
      pre_notes TEXT NOT NULL DEFAULT '',
      overall_effort INTEGER CHECK (overall_effort BETWEEN 1 AND 10),
      pain INTEGER CHECK (pain BETWEEN 0 AND 10),
      post_notes TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_workout_sessions_date ON workout_sessions(scheduled_date DESC, started_at DESC);
    CREATE INDEX idx_workout_sessions_status ON workout_sessions(status);

    CREATE TABLE set_logs (
      id TEXT PRIMARY KEY,
      workout_session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
      exercise_id TEXT NOT NULL,
      exercise_index INTEGER NOT NULL CHECK (exercise_index >= 0),
      set_number INTEGER NOT NULL CHECK (set_number BETWEEN 1 AND 10),
      actual_value REAL,
      load_kg REAL CHECK (load_kg IS NULL OR load_kg BETWEEN 0 AND 500),
      rir INTEGER CHECK (rir IS NULL OR rir BETWEEN 0 AND 10),
      status TEXT NOT NULL CHECK (status IN ('completed', 'skipped')),
      notes TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL,
      UNIQUE(workout_session_id, exercise_index, set_number)
    );
    CREATE INDEX idx_set_logs_workout ON set_logs(workout_session_id, exercise_index, set_number);
    CREATE INDEX idx_set_logs_exercise ON set_logs(exercise_id, completed_at);

    CREATE TABLE measurements (
      id TEXT PRIMARY KEY,
      measured_at TEXT NOT NULL,
      weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 350),
      waist_cm REAL CHECK (waist_cm IS NULL OR waist_cm BETWEEN 30 AND 250),
      chest_cm REAL CHECK (chest_cm IS NULL OR chest_cm BETWEEN 30 AND 250),
      arm_cm REAL CHECK (arm_cm IS NULL OR arm_cm BETWEEN 10 AND 100),
      thigh_cm REAL CHECK (thigh_cm IS NULL OR thigh_cm BETWEEN 20 AND 150),
      sleep_hours REAL CHECK (sleep_hours IS NULL OR sleep_hours BETWEEN 0 AND 24),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_measurements_date ON measurements(measured_at DESC);

    CREATE TABLE activity_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_activity_events_date ON activity_events(created_at DESC);
  `),
  2: () => db.exec(`
    ALTER TABLE workout_sessions ADD COLUMN planned_slot_date TEXT;
    UPDATE workout_sessions
      SET planned_slot_date = scheduled_date
      WHERE status IN ('completed', 'in_progress') AND planned_slot_date IS NULL;
    CREATE INDEX idx_workout_sessions_planned_slot
      ON workout_sessions(planned_slot_date, status);
  `),
  3: () => db.exec(`
    ALTER TABLE settings ADD COLUMN schedule_revision INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE workout_sessions ADD COLUMN schedule_revision INTEGER NOT NULL DEFAULT 1;
    UPDATE workout_sessions
      SET planned_slot_date = scheduled_date
      WHERE status IN ('completed', 'in_progress') AND planned_slot_date IS NULL;
    CREATE INDEX idx_workout_sessions_schedule_revision
      ON workout_sessions(schedule_revision, planned_slot_date, status);
  `),
};

const existingVersion = db.pragma('user_version', { simple: true }) as number;
if (existingVersion > CURRENT_SCHEMA_VERSION) {
  db.close();
  throw new Error(`Database schema ${existingVersion} is newer than supported schema ${CURRENT_SCHEMA_VERSION}`);
}

for (let version = existingVersion + 1; version <= CURRENT_SCHEMA_VERSION; version += 1) {
  const migrate = migrations[version];
  if (!migrate) throw new Error(`Missing database migration ${version}`);
  db.transaction(() => {
    migrate();
    db.pragma(`user_version = ${version}`);
  })();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function cleanupExpiredSessions(): void {
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(nowIso());
}

export function logActivity(eventType: string, entityId?: string | null, payload: Record<string, unknown> = {}): void {
  db.prepare(`
    INSERT INTO activity_events (id, event_type, entity_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), eventType, entityId ?? null, JSON.stringify(payload), nowIso());
}

export function closeDatabase(): void {
  if (db.open) db.close();
}
