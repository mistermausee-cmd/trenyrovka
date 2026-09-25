import type { Equipment, ExerciseId } from './exercises.js';
import type { WorkoutCode } from './types.js';

export type ProgramWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type ProgramPhase = 'adaptation' | 'build' | 'consolidation';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RirRange {
  readonly min: number;
  readonly max: number;
}

export interface RestRange {
  readonly minSeconds: number;
  readonly maxSeconds: number;
}

export interface WeekPrescription {
  readonly week: ProgramWeek;
  readonly phase: ProgramPhase;
  readonly phaseTitle: string;
  readonly sets: 2 | 3;
  readonly rir: RirRange;
  readonly rest: RestRange;
  readonly guidance: readonly string[];
}

export interface RepetitionTarget {
  readonly measurement: 'reps';
  readonly min: number;
  readonly max: number;
  readonly perSide: boolean;
}

export interface TimeTarget {
  readonly measurement: 'seconds';
  readonly min: number;
  readonly max: number;
  readonly perSide: boolean;
}

export type ExerciseTarget = RepetitionTarget | TimeTarget;

export interface WorkoutExercise {
  readonly exerciseId: ExerciseId;
  readonly target: ExerciseTarget;
  readonly notes: readonly string[];
}

/**
 * `bands` и `resistance-bands` — удобные входные псевдонимы для UI.
 * В каталоге упражнений используется каноническое `long-resistance-band`.
 */
export type ProgramEquipment = Equipment | 'bands' | 'resistance-bands';

export interface WorkoutTemplate {
  readonly code: WorkoutCode;
  readonly title: string;
  readonly week: ProgramWeek;
  readonly prescription: WeekPrescription;
  readonly equipmentMode: 'bodyweight-backpack' | 'bands-available';
  readonly usesBands: boolean;
  readonly exercises: readonly WorkoutExercise[];
  readonly notes: readonly string[];
}

export type ProgramDayStatus = 'before-start' | 'active' | 'finished';

export interface ProgramDay {
  readonly status: ProgramDayStatus;
  readonly startDateISO: string;
  readonly dateISO: string;
  readonly daysSinceStart: number;
  /** Номер календарного дня программы (1–84), только пока программа активна. */
  readonly programDay: number | null;
  readonly week: ProgramWeek | null;
  readonly weekday: Weekday;
  readonly scheduled: boolean;
  readonly weekdays: readonly Weekday[];
  readonly prescription: WeekPrescription | null;
}

export const PROGRAM_LENGTH_WEEKS = 12 as const;
export const PROGRAM_LENGTH_DAYS = PROGRAM_LENGTH_WEEKS * 7;
export const DEFAULT_TRAINING_WEEKDAYS = [1, 3, 5] as const satisfies readonly Weekday[];

function toProgramWeek(week: number): ProgramWeek {
  switch (week) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
    case 10:
    case 11:
    case 12:
      return week;
    default:
      throw new RangeError('Неделя программы должна быть целым числом от 1 до 12.');
  }
}

function toWeekday(day: number): Weekday {
  switch (day) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
      return day;
    default:
      throw new RangeError('День недели должен быть целым числом от 0 (воскресенье) до 6 (суббота).');
  }
}

export function getWeekPrescription(week: number): WeekPrescription {
  if (!Number.isInteger(week)) {
    throw new RangeError('Неделя программы должна быть целым числом от 1 до 12.');
  }

  const programWeek = toProgramWeek(week);

  if (programWeek <= 2) {
    return {
      week: programWeek,
      phase: 'adaptation',
      phaseTitle: 'Адаптация и техника',
      sets: 2,
      rir: { min: 3, max: 3 },
      rest: { minSeconds: 60, maxSeconds: 90 },
      guidance: [
        'Останавливайтесь, когда могли бы сделать ещё примерно 3 чистых повторения.',
        'Не добавляйте резинку: первые две недели нужны для освоения движений.',
        'Сначала увеличивайте повторения внутри диапазона, а не вес рюкзака.',
      ],
    };
  }

  if (programWeek <= 8) {
    return {
      week: programWeek,
      phase: 'build',
      phaseTitle: 'Наращивание объёма',
      sets: 3,
      rir: { min: 2, max: 3 },
      rest: { minSeconds: 75, maxSeconds: 120 },
      guidance: [
        'Завершайте подход с запасом 2–3 технически чистых повторения.',
        'Когда во всех подходах достигнут верх диапазона, немного усложните упражнение.',
        'Резинки используйте только целыми и надёжно закреплёнными.',
      ],
    };
  }

  return {
    week: programWeek,
    phase: 'consolidation',
    phaseTitle: 'Закрепление прогресса',
    sets: 3,
    rir: { min: 1, max: 2 },
    rest: { minSeconds: 90, maxSeconds: 150 },
    guidance: [
      'Останавливайтесь с запасом 1–2 чистых повторения — отказ не требуется.',
      'Используйте усложнённый вариант только при стабильной технике во всех подходах.',
      'Если форма ухудшается, вернитесь к варианту недель 3–8 без снижения качества.',
    ],
  };
}

function reps(
  exerciseId: ExerciseId,
  min: number,
  max: number,
  perSide: boolean,
  notes: readonly string[] = [],
): WorkoutExercise {
  return {
    exerciseId,
    target: { measurement: 'reps', min, max, perSide },
    notes,
  };
}

function seconds(
  exerciseId: ExerciseId,
  min: number,
  max: number,
  perSide: boolean,
  notes: readonly string[] = [],
): WorkoutExercise {
  return {
    exerciseId,
    target: { measurement: 'seconds', min, max, perSide },
    notes,
  };
}

function bandsAreAvailable(equipment: readonly ProgramEquipment[]): boolean {
  return equipment.some(
    (item) =>
      item === 'long-resistance-band' ||
      item === 'bands' ||
      item === 'resistance-bands',
  );
}

function workoutA(week: ProgramWeek, useBands: boolean): readonly WorkoutExercise[] {
  const lowerBody =
    week >= 9
      ? reps('bulgarian-split-squat', 6, 10, true, [
          'Если равновесие или техника нестабильны, оставьте chair-squat.',
        ])
      : reps('chair-squat', 8, 12, false);

  const horizontalPush =
    week >= 9
      ? reps('feet-elevated-pushup', 6, 10, false, [
          'Используйте этот вариант только после уверенных 12 повторений incline-pushup.',
          'Если полной амплитуды нет, вернитесь к incline-pushup.',
        ])
      : reps('incline-pushup', 6, 12, false, [
          'Снижайте высоту опоры только после чистого верхнего диапазона.',
        ]);

  const verticalPull = useBands
    ? reps('band-lat-pulldown', 10, 15, false, [
        'Высокое крепление должно быть проверено до первого подхода.',
      ])
    : reps('one-arm-backpack-row', 8, 12, true);

  const shoulderOrCalfAccessory = useBands
    ? reps('band-lateral-raise', 10, 15, false, [
        'Выберите лёгкую ленту и не поднимайте руки через боль.',
      ])
    : reps('calf-raise', 12, 20, false);

  return [
    lowerBody,
    horizontalPush,
    verticalPull,
    reps('backpack-rdl', 8, 12, false),
    reps('reverse-crunch', 8, 15, false),
    shoulderOrCalfAccessory,
  ];
}

function workoutB(week: ProgramWeek, useBands: boolean): readonly WorkoutExercise[] {
  const hipExtension =
    week >= 9
      ? reps('single-leg-glute-bridge', 8, 12, true, [
          'Если таз разворачивается, оставьте glute-bridge на двух ногах.',
        ])
      : reps('glute-bridge', 10, 15, false);

  const upperBackAccessory = useBands
    ? reps('band-face-pull', 12, 15, false, [
        'Крепление должно находиться примерно на уровне лица и быть проверено.',
      ])
    : reps('calf-raise', 12, 20, false);

  return [
    reps('reverse-lunge', 6, 10, true, [
      'При необходимости касайтесь рукой стены для равновесия.',
    ]),
    reps('backpack-bent-row', 8, 12, false),
    hipExtension,
    reps('incline-pike-pushup', 5, 10, false, [
      'Высота опоры должна позволять двигаться без боли в плечах.',
    ]),
    seconds('side-plank', 15, 40, true),
    upperBackAccessory,
  ];
}

/**
 * Возвращает шаблон конкретной тренировки.
 *
 * Даже если резинки переданы в `equipment`, недели 1–2 всегда используют только
 * вес тела и рюкзак как тренировочное сопротивление. Начиная с недели 3 наличие
 * длинной резинки автоматически включает lat pulldown в A, lateral raise в A и
 * face pull в B.
 */
export function getWorkoutTemplate(
  code: WorkoutCode,
  week: number,
  equipment: readonly ProgramEquipment[] = [],
): WorkoutTemplate {
  if (code !== 'A' && code !== 'B') {
    throw new RangeError('Код тренировки должен быть A или B.');
  }

  const prescription = getWeekPrescription(week);
  const useBands = prescription.week >= 3 && bandsAreAvailable(equipment);
  const exercises =
    code === 'A'
      ? workoutA(prescription.week, useBands)
      : workoutB(prescription.week, useBands);

  return {
    code,
    title: `Тренировка ${code}`,
    week: prescription.week,
    prescription,
    equipmentMode: useBands ? 'bands-available' : 'bodyweight-backpack',
    usesBands: useBands,
    exercises,
    notes: [
      'Сделайте 5–8 минут лёгкой разминки перед первым рабочим подходом.',
      'Указанное число подходов применяется к каждому упражнению.',
      'Для одностороннего упражнения выполните целевой диапазон на каждую сторону.',
      'Острая боль, головокружение или необычная одышка — причина остановить тренировку.',
    ],
  };
}

/**
 * Единственный источник фактического чередования A/B. Пропущенная дата не
 * увеличивает completedCount, поэтому следующая тренировка сохраняет нужный код.
 */
export function getNextWorkoutCode(completedCount: number): WorkoutCode {
  if (!Number.isSafeInteger(completedCount) || completedCount < 0) {
    throw new RangeError('completedCount должен быть неотрицательным целым числом.');
  }

  return completedCount % 2 === 0 ? 'A' : 'B';
}

/** Явный алиас для мест, где имя должно подчёркивать источник чередования. */
export const getWorkoutCodeForCompletedCount = getNextWorkoutCode;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

interface ParsedISODate {
  readonly epochDay: number;
  readonly weekday: Weekday;
}

function parseISODateOnly(value: string, fieldName: string): ParsedISODate {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`${fieldName} должен иметь формат YYYY-MM-DD.`);
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`${fieldName} содержит недопустимую календарную дату.`);
  }

  // setUTCFullYear корректно обрабатывает годы 0001–0099, в отличие от Date.UTC.
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`${fieldName} содержит недопустимую календарную дату.`);
  }

  return {
    epochDay: Math.floor(date.getTime() / MILLISECONDS_PER_DAY),
    weekday: toWeekday(date.getUTCDay()),
  };
}

function normalizeWeekdays(weekdays: readonly number[]): readonly Weekday[] {
  if (weekdays.length === 0) {
    throw new RangeError('weekdays должен содержать хотя бы один день недели.');
  }

  const normalized: Weekday[] = [];

  for (const value of weekdays) {
    if (!Number.isInteger(value)) {
      throw new RangeError('Каждый элемент weekdays должен быть целым числом от 0 до 6.');
    }

    const weekday = toWeekday(value);
    if (!normalized.includes(weekday)) {
      normalized.push(weekday);
    }
  }

  return normalized;
}

/**
 * Возвращает только календарное состояние программы. Код A/B намеренно здесь не
 * вычисляется: на тренировочный день вызовите getNextWorkoutCode(completedCount).
 * Поэтому отдых и пропуски не сдвигают фактическое чередование.
 *
 * Даты интерпретируются как календарные UTC-даты в формате YYYY-MM-DD, а дни
 * недели следуют Date.getUTCDay(): 0 — воскресенье, 1 — понедельник, …, 6 — суббота.
 */
export function getProgramDay(
  startDateISO: string,
  todayISO: string,
  weekdays: readonly number[] = DEFAULT_TRAINING_WEEKDAYS,
): ProgramDay {
  const start = parseISODateOnly(startDateISO, 'startDateISO');
  const today = parseISODateOnly(todayISO, 'todayISO');
  const normalizedWeekdays = normalizeWeekdays(weekdays);
  const daysSinceStart = today.epochDay - start.epochDay;

  if (daysSinceStart < 0) {
    return {
      status: 'before-start',
      startDateISO,
      dateISO: todayISO,
      daysSinceStart,
      programDay: null,
      week: null,
      weekday: today.weekday,
      scheduled: false,
      weekdays: normalizedWeekdays,
      prescription: null,
    };
  }

  if (daysSinceStart >= PROGRAM_LENGTH_DAYS) {
    return {
      status: 'finished',
      startDateISO,
      dateISO: todayISO,
      daysSinceStart,
      programDay: null,
      week: null,
      weekday: today.weekday,
      scheduled: false,
      weekdays: normalizedWeekdays,
      prescription: null,
    };
  }

  const week = toProgramWeek(Math.floor(daysSinceStart / 7) + 1);
  return {
    status: 'active',
    startDateISO,
    dateISO: todayISO,
    daysSinceStart,
    programDay: daysSinceStart + 1,
    week,
    weekday: today.weekday,
    scheduled: normalizedWeekdays.includes(today.weekday),
    weekdays: normalizedWeekdays,
    prescription: getWeekPrescription(week),
  };
}


/** Проверяет три силовых дня: между каждой парой по кругу есть хотя бы день отдыха. */
export function areTrainingDaysSpaced(days: readonly number[]): boolean {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length !== 3 || sorted.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return false;
  return sorted.every((day, index) => {
    const next = sorted[(index + 1) % sorted.length];
    if (next === undefined) return false;
    const gap = (next - day + 7) % 7;
    return gap >= 2;
  });
}
