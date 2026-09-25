import type { FastifyInstance } from 'fastify';

import { getProgramDay, getNextWorkoutCode, getWorkoutTemplate } from '../../shared/program.js';
import type { DashboardResponse } from '../../shared/types.js';
import { requireAuth } from '../auth.js';
import { calculateCurrentStreakWeeks } from '../analytics.js';
import { getSettings } from '../settings.js';
import { endOfWeekIso, greetingForHour, localDateIso, localNow, localTimeLabel, startOfWeekIso } from '../time.js';
import { countCompletedBetween, countCompletedWorkouts, getActiveWorkout, getLastCompletedWorkout } from '../workouts.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard', { preHandler: requireAuth }, async (): Promise<DashboardResponse> => {
    const settings = getSettings();
    const now = localNow(settings.timezone);
    const today = localDateIso(settings.timezone);
    const programDay = getProgramDay(settings.startDate, today, settings.trainingDays);
    const completedCount = countCompletedWorkouts();
    const nextWorkoutCode = getNextWorkoutCode(completedCount);
    const week = programDay.week ?? (programDay.status === 'before-start' ? 1 : 12);

    return {
      localDate: today,
      localTime: localTimeLabel(settings.timezone),
      timezone: settings.timezone,
      greeting: greetingForHour(now.hour),
      settings,
      programDay,
      nextWorkoutCode,
      completedCount,
      weekCompletedCount: countCompletedBetween(startOfWeekIso(today, settings.timezone), endOfWeekIso(today, settings.timezone)),
      weekTarget: 3,
      currentStreakWeeks: calculateCurrentStreakWeeks(),
      nextTemplate: getWorkoutTemplate(nextWorkoutCode, week, settings.equipment),
      activeWorkout: getActiveWorkout(),
      lastWorkout: getLastCompletedWorkout(),
    };
  });
}
