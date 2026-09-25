import type { ProgramEquipment } from '../shared/program.js';
import type { UserSettings } from '../shared/types.js';
import { db, nowIso } from './db.js';
import { config } from './config.js';
import { localDateIso } from './time.js';

interface SettingsRow {
  start_date: string;
  timezone: string;
  training_days_json: string;
  equipment_json: string;
  display_name: string;
  schedule_revision: number;
}

export function getSettings(): UserSettings {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as SettingsRow | undefined;
  if (!row) {
    return {
      startDate: localDateIso(),
      timezone: config.APP_TIMEZONE,
      trainingDays: [1, 3, 5],
      equipment: [],
      displayName: 'Атлет',
    };
  }

  return {
    startDate: row.start_date,
    timezone: row.timezone,
    trainingDays: JSON.parse(row.training_days_json) as number[],
    equipment: JSON.parse(row.equipment_json) as ProgramEquipment[],
    displayName: row.display_name,
  };
}

export function createInitialSettings(input: Partial<UserSettings> = {}): UserSettings {
  const timestamp = nowIso();
  const settings: UserSettings = {
    startDate: input.startDate ?? localDateIso(),
    timezone: input.timezone ?? config.APP_TIMEZONE,
    trainingDays: input.trainingDays ?? [1, 3, 5],
    equipment: input.equipment ?? [],
    displayName: input.displayName?.trim() || 'Атлет',
  };

  db.prepare(`
    INSERT INTO settings (
      id, start_date, timezone, training_days_json, equipment_json, display_name, created_at, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    settings.startDate,
    settings.timezone,
    JSON.stringify(settings.trainingDays),
    JSON.stringify(settings.equipment),
    settings.displayName,
    timestamp,
    timestamp,
  );

  return settings;
}


export function getScheduleRevision(): number {
  const row = db.prepare('SELECT schedule_revision FROM settings WHERE id = 1').get() as { schedule_revision: number } | undefined;
  return row?.schedule_revision ?? 1;
}

export function updateSettings(settings: UserSettings): UserSettings {
  const current = getSettings();
  const scheduleChanged = current.startDate !== settings.startDate
    || JSON.stringify([...current.trainingDays].sort()) !== JSON.stringify([...settings.trainingDays].sort());
  const nextRevision = getScheduleRevision() + (scheduleChanged ? 1 : 0);
  db.prepare(`
    UPDATE settings
    SET start_date = ?, timezone = ?, training_days_json = ?, equipment_json = ?, display_name = ?, schedule_revision = ?, updated_at = ?
    WHERE id = 1
  `).run(
    settings.startDate,
    settings.timezone,
    JSON.stringify(settings.trainingDays),
    JSON.stringify(settings.equipment),
    settings.displayName,
    nextRevision,
    nowIso(),
  );
  return getSettings();
}
