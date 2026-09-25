import type { FastifyInstance } from 'fastify';

import { EXERCISES, isExerciseId } from '../../shared/exercises.js';
import { requireAuth } from '../auth.js';

export async function exerciseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/exercises', { preHandler: requireAuth }, async () => Object.values(EXERCISES));

  app.get<{ Params: { id: string } }>('/api/exercises/:id', { preHandler: requireAuth }, async (request, reply) => {
    if (!isExerciseId(request.params.id)) {
      return reply.code(404).send({ error: 'not_found', message: 'Упражнение не найдено' });
    }
    return EXERCISES[request.params.id];
  });
}
