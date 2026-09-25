import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuthState } from '../../shared/types.js';
import { clearSession, createSession, requireAuth, requireCsrf, resolveSession, userExists } from '../auth.js';
import { config } from '../config.js';
import { db, logActivity, nowIso } from '../db.js';
import { hashPassword, constantTimeTextEqual, passwordNeedsRehash, verifyPassword } from '../security.js';
import { createInitialSettings, getSettings } from '../settings.js';
import { localDateIso } from '../time.js';
import { parseBody } from '../validation.js';

const passwordSchema = z.string().min(10, 'Минимум 10 символов').max(128, 'Максимум 128 символов');

const setupSchema = z.object({
  setupToken: z.string().min(1),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(40).default('Атлет'),
  startDate: z.iso.date().optional(),
  hasBands: z.boolean().default(false),
});

const loginSchema = z.object({ password: z.string().min(1).max(128) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/status', async (request): Promise<AuthState> => {
    const setupRequired = !userExists();
    const session = setupRequired ? null : resolveSession(request);
    return {
      setupRequired,
      authenticated: Boolean(session),
      csrfToken: session?.csrf_token ?? null,
      timezone: userExists() ? getSettings().timezone : config.APP_TIMEZONE,
    };
  });

  app.post('/api/auth/setup', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    if (userExists()) return reply.code(409).send({ error: 'already_configured', message: 'Приложение уже настроено' });
    const input = parseBody(setupSchema, request.body, reply);
    if (!input) return;
    if (!constantTimeTextEqual(input.setupToken, config.SETUP_TOKEN)) {
      return reply.code(403).send({ error: 'invalid_setup_token', message: 'Неверный токен первоначальной настройки' });
    }

    const passwordHash = await hashPassword(input.password);
    const timestamp = nowIso();
    const transaction = db.transaction(() => {
      db.prepare('INSERT INTO users (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)')
        .run(passwordHash, timestamp, timestamp);
      createInitialSettings({
        displayName: input.displayName,
        startDate: input.startDate ?? localDateIso(),
        equipment: input.hasBands ? ['long-resistance-band', 'secure-high-anchor'] : [],
      });
      logActivity('account_created');
    });
    transaction();

    const csrfToken = createSession(reply);
    return reply.code(201).send({ authenticated: true, csrfToken });
  });

  app.post('/api/auth/login', {
    config: { rateLimit: { max: 8, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const input = parseBody(loginSchema, request.body, reply);
    if (!input) return;

    const user = db.prepare('SELECT password_hash FROM users WHERE id = 1').get() as { password_hash: string } | undefined;
    if (!user || !(await verifyPassword(input.password, user.password_hash))) {
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Неверный пароль' });
    }
    if (passwordNeedsRehash(user.password_hash)) {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = 1')
        .run(await hashPassword(input.password), nowIso());
    }

    const csrfToken = createSession(reply);
    logActivity('login_success');
    return { authenticated: true, csrfToken };
  });

  app.post('/api/auth/logout', { preHandler: [requireAuth, requireCsrf] }, async (request, reply) => {
    clearSession(request, reply);
    return reply.code(204).send();
  });
}
