import { DateTime } from 'luxon';

import { config } from './config.js';

export function localNow(timezone = config.APP_TIMEZONE): DateTime {
  return DateTime.now().setZone(timezone);
}

export function localDateIso(timezone = config.APP_TIMEZONE): string {
  return localNow(timezone).toISODate() ?? new Date().toISOString().slice(0, 10);
}

export function localTimeLabel(timezone = config.APP_TIMEZONE): string {
  return localNow(timezone).setLocale('ru').toFormat('HH:mm');
}

export function greetingForHour(hour: number): string {
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function startOfWeekIso(dateIso: string, timezone = config.APP_TIMEZONE): string {
  const date = DateTime.fromISO(dateIso, { zone: timezone });
  return (date.isValid ? date : localNow(timezone)).startOf('week').toISODate()!;
}

export function endOfWeekIso(dateIso: string, timezone = config.APP_TIMEZONE): string {
  const date = DateTime.fromISO(dateIso, { zone: timezone });
  return (date.isValid ? date : localNow(timezone)).endOf('week').toISODate()!;
}


export function localDayUtcBounds(dateIso: string, timezone = config.APP_TIMEZONE): { start: string; end: string } {
  const localStart = DateTime.fromISO(dateIso, { zone: timezone }).startOf('day');
  if (!localStart.isValid) throw new RangeError('Некорректная локальная дата');
  return {
    start: localStart.toUTC().toISO()!,
    end: localStart.plus({ days: 1 }).toUTC().toISO()!,
  };
}
