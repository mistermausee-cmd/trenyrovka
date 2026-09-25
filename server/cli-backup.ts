import { createBackup } from './backup.js';
import { closeDatabase } from './db.js';

try {
  const backup = await createBackup();
  process.stdout.write(`${JSON.stringify(backup)}\n`);
  closeDatabase();
} catch (error) {
  console.error('Backup failed:', error instanceof Error ? error.message : error);
  closeDatabase();
  process.exit(1);
}
