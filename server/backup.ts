import { chmodSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import { config } from './config.js';
import { db } from './db.js';

export interface BackupInfo {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

function ensureBackupDirectory(): string {
  const directory = path.resolve(config.BACKUP_DIR);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

export function listBackups(): BackupInfo[] {
  const directory = ensureBackupDirectory();
  return readdirSync(directory)
    .filter((name) => /^trenyrovka-\d{8}T\d{6}Z\.db$/u.test(name))
    .map((fileName) => {
      const stats = statSync(path.join(directory, fileName));
      return { fileName, sizeBytes: stats.size, createdAt: stats.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBackup(retain = 14): Promise<BackupInfo> {
  const directory = ensureBackupDirectory();
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, '');
  const fileName = `trenyrovka-${stamp}.db`;
  const destination = path.join(directory, fileName);
  await db.backup(destination);
  chmodSync(destination, 0o600);

  for (const old of listBackups().slice(Math.max(1, retain))) {
    unlinkSync(path.join(directory, old.fileName));
  }

  const stats = statSync(destination);
  return { fileName, sizeBytes: stats.size, createdAt: stats.mtime.toISOString() };
}
