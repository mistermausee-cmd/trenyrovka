import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { config } from './config.js';
import { closeDatabase } from './db.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { exerciseRoutes } from './routes/exercises.js';
import { workoutRoutes } from './routes/workouts.js';
import { dataRoutes } from './routes/data.js';

export function buildApp() {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
  });

  app.register(cookie);
  app.register(rateLimit, { global: false });
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://i.ytimg.com'],
        frameSrc: ['https://www.youtube-nocookie.com'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    timezone: config.APP_TIMEZONE,
    now: new Date().toISOString(),
  }));

  app.register(authRoutes);
  app.register(dashboardRoutes);
  app.register(exerciseRoutes);
  app.register(workoutRoutes);
  app.register(dataRoutes);

  app.addHook('onClose', async () => {
    closeDatabase();
  });

  const clientRoot = path.resolve(process.cwd(), 'dist/client');
  if (existsSync(clientRoot)) {
    app.register(fastifyStatic, {
      root: clientRoot,
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found', message: 'Маршрут API не найден' });
      }
      return reply.type('text/html').sendFile('index.html');
    });
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const knownError = error as { statusCode?: number; message?: string };
    const statusCode = knownError.statusCode && knownError.statusCode < 500 ? knownError.statusCode : 500;
    return reply.code(statusCode).send({
      error: statusCode === 500 ? 'internal_error' : 'request_error',
      message: statusCode === 500 ? 'Внутренняя ошибка сервера' : (knownError.message ?? 'Некорректный запрос'),
    });
  });

  return app;
}
