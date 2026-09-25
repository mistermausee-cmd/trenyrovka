import type { FastifyReply, FastifyRequest } from 'fastify';

import { config } from './config.js';
import { cleanupExpiredSessions, db, nowIso } from './db.js';
import { secureToken, sha256 } from './security.js';

const COOKIE_NAME = 'trenyrovka_session';
const SESSION_DAYS = 30;

interface AuthSessionRow {
  token_hash: string;
  csrf_token: string;
  expires_at: string;
}

const requestSessions = new WeakMap<FastifyRequest, AuthSessionRow>();

export function userExists(): boolean {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE id = 1').get());
}

export function createSession(reply: FastifyReply): string {
  cleanupExpiredSessions();
  const rawToken = secureToken();
  const csrfToken = secureToken(24);
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO auth_sessions (token_hash, csrf_token, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sha256(rawToken), csrfToken, timestamp, timestamp, expiresAt);

  reply.setCookie(COOKIE_NAME, rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: config.COOKIE_SECURE,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return csrfToken;
}

export function clearSession(request: FastifyRequest, reply: FastifyReply): void {
  const rawToken = request.cookies[COOKIE_NAME];
  if (rawToken) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sha256(rawToken));
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

export function resolveSession(request: FastifyRequest): AuthSessionRow | null {
  const existing = requestSessions.get(request);
  if (existing) return existing;

  const rawToken = request.cookies[COOKIE_NAME];
  if (!rawToken) return null;

  const row = db.prepare(`
    SELECT token_hash, csrf_token, expires_at
    FROM auth_sessions
    WHERE token_hash = ? AND expires_at > ?
  `).get(sha256(rawToken), nowIso()) as AuthSessionRow | undefined;

  if (!row) return null;
  requestSessions.set(request, row);
  db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?').run(nowIso(), row.token_hash);
  return row;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!resolveSession(request)) {
    await reply.code(401).send({ error: 'unauthorized', message: 'Войдите, чтобы продолжить' });
  }
}

function originMatches(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (!origin) return request.headers['sec-fetch-site'] !== 'cross-site';

  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers['x-forwarded-host'];
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : (forwardedHost ?? request.headers.host);
    return Boolean(host && originUrl.host === host);
  } catch {
    return false;
  }
}

export async function requireCsrf(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = resolveSession(request);
  const csrf = request.headers['x-csrf-token'];
  if (!session || typeof csrf !== 'string' || csrf !== session.csrf_token || !originMatches(request)) {
    await reply.code(403).send({ error: 'csrf_rejected', message: 'Защитный токен устарел. Обновите страницу.' });
  }
}
