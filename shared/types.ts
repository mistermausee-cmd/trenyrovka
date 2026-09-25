import type { ExerciseId } from './exercises.js';
import type { ProgramDay, ProgramEquipment, WorkoutTemplate } from './program.js';

export type WorkoutCode = 'A' | 'B';
export type WorkoutStatus = 'in_progress' | 'completed' | 'abandoned';
export type SetStatus = 'completed' | 'skipped';
export type MeasurementKind = 'reps' | 'seconds';

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface AuthState {
  setupRequired: boolean;
  authenticated: boolean;
  csrfToken: string | null;
  timezone: string;
}

export interface UserSettings {
  startDate: string;
  timezone: string;
  trainingDays: number[];
  equipment: ProgramEquipment[];
  displayName: string;
}

export interface WorkoutSetLog {
  id: string;
  exerciseId: ExerciseId;
  exerciseIndex: number;
  setNumber: number;
  actualValue: number | null;
  loadKg: number | null;
  rir: number | null;
  status: SetStatus;
  notes: string;
  completedAt: string;
}

export interface WorkoutSessionSummary {
  id: string;
  code: WorkoutCode;
  week: number;
  scheduledDate: string;
  plannedSlotDate: string | null;
  startedAt: string;
  completedAt: string | null;
  status: WorkoutStatus;
  readiness: number | null;
  sleepHours: number | null;
  overallEffort: number | null;
  pain: number | null;
  durationMinutes: number | null;
  completedSets: number;
  totalSets: number;
}

export interface WorkoutSessionDetail extends WorkoutSessionSummary {
  template: WorkoutTemplate;
  preNotes: string;
  postNotes: string;
  sets: WorkoutSetLog[];
}

export interface DashboardResponse {
  localDate: string;
  localTime: string;
  timezone: string;
  greeting: string;
  settings: UserSettings;
  programDay: ProgramDay;
  nextWorkoutCode: WorkoutCode;
  completedCount: number;
  weekCompletedCount: number;
  weekTarget: number;
  currentStreakWeeks: number;
  nextTemplate: WorkoutTemplate;
  activeWorkout: WorkoutSessionSummary | null;
  lastWorkout: WorkoutSessionSummary | null;
}

export interface StartWorkoutInput {
  readiness: number;
  sleepHours?: number | null;
  notes?: string;
}

export interface SaveSetInput {
  exerciseId: ExerciseId;
  exerciseIndex: number;
  setNumber: number;
  actualValue?: number | null;
  loadKg?: number | null;
  rir?: number | null;
  status: SetStatus;
  notes?: string;
}

export interface CompleteWorkoutInput {
  overallEffort: number;
  pain: number;
  notes?: string;
}

export interface MeasurementRecord {
  id: string;
  measuredAt: string;
  weightKg: number | null;
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  sleepHours: number | null;
  notes: string;
  createdAt: string;
}

export interface AnalyticsResponse {
  adherencePercent: number;
  completedWorkouts: number;
  completedSets: number;
  totalTrainingMinutes: number;
  currentStreakWeeks: number;
  measurements: MeasurementRecord[];
  recentWorkouts: WorkoutSessionSummary[];
  exerciseProgress: Array<{
    exerciseId: ExerciseId;
    title: string;
    points: Array<{ date: string; bestValue: number; loadKg: number | null }>;
  }>;
}
