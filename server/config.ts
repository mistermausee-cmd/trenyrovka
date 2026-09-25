import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().default('./data/trenyrovka.db'),
  BACKUP_DIR: z.string().default('./backups'),
  APP_TIMEZONE: z.string().default('Europe/Oslo'),
  SETUP_TOKEN: z.string().min(24).optional(),
  COOKIE_SECURE: booleanFromEnv,
  TRUST_PROXY: booleanFromEnv,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const developmentToken = 'development-setup-token-change-me';
const rejectedProductionTokens = new Set([
  developmentToken,
  'replace-with-a-long-random-token',
]);
const setupToken = parsed.data.SETUP_TOKEN ?? (parsed.data.NODE_ENV === 'production' ? '' : developmentToken);

if (parsed.data.NODE_ENV === 'production' && (!setupToken || rejectedProductionTokens.has(setupToken))) {
  console.error('SETUP_TOKEN must be explicitly set to a unique random value in production');
  process.exit(1);
}

export const config = {
  ...parsed.data,
  SETUP_TOKEN: setupToken,
};
