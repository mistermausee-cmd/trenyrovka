import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

const KEY_LENGTH = 64;
// OWASP minimum profile: N=2^17, r=8, p=1 (~128 MiB plus overhead).
const SCRYPT_COST = 131_072;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEMORY = 192 * 1024 * 1024;

interface ScryptHashParts {
  cost: number;
  blockSize: number;
  parallelization: number;
  salt: Buffer;
  expected: Buffer;
}

function parseScryptHash(encoded: string): ScryptHashParts | null {
  const [algorithm, costText, blockText, parallelText, saltText, hashText] = encoded.split('$');
  if (algorithm !== 'scrypt' || !costText || !blockText || !parallelText || !saltText || !hashText) return null;
  const cost = Number(costText);
  const blockSize = Number(blockText);
  const parallelization = Number(parallelText);
  if (![cost, blockSize, parallelization].every(Number.isSafeInteger)) return null;
  // Refuse attacker-controlled parameters outside the profiles this app has issued.
  if (cost < 16_384 || cost > 262_144 || blockSize !== 8 || parallelization < 1 || parallelization > 5) return null;
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(hashText, 'base64url');
  if (expected.length !== KEY_LENGTH || salt.length < 16) return null;
  return { cost, blockSize, parallelization, salt, expected };
}

export function secureToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function constantTimeTextEqual(first: string, second: string): boolean {
  const firstDigest = createHash('sha256').update(first).digest();
  const secondDigest = createHash('sha256').update(second).digest();
  return timingSafeEqual(firstDigest, secondDigest);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  return ['scrypt', SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELIZATION, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

export function passwordNeedsRehash(encoded: string): boolean {
  const parts = parseScryptHash(encoded);
  return !parts || parts.cost !== SCRYPT_COST || parts.blockSize !== SCRYPT_BLOCK_SIZE || parts.parallelization !== SCRYPT_PARALLELIZATION;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = parseScryptHash(encoded);
  if (!parts) return false;
  try {
    const actual = await scrypt(password, parts.salt, parts.expected.length, {
      N: parts.cost,
      r: parts.blockSize,
      p: parts.parallelization,
      maxmem: Math.max(SCRYPT_MAX_MEMORY, 128 * parts.cost * parts.blockSize + 32 * 1024 * 1024),
    });
    return timingSafeEqual(actual, parts.expected);
  } catch {
    return false;
  }
}
