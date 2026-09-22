import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IDatabase, getDb } from './index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

export async function ensureMigrationTable(db: IDatabase): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(64) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}

export async function getAppliedMigrations(db: IDatabase): Promise<string[]> {
  await ensureMigrationTable(db);
  const result = await db.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY id ASC;'
  );
  return result.rows.map((r) => r.version);
}

export async function migrateUp(db: IDatabase = getDb()): Promise<string[]> {
  await ensureMigrationTable(db);
  const applied = await getAppliedMigrations(db);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_rollback.sql'))
    .sort();

  const newlyApplied: string[] = [];

  for (const file of files) {
    const version = path.basename(file, '.sql');
    if (!applied.includes(version)) {
      logger.info(`Applying migration: ${version}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      // Execute migration script
      await db.exec(sqlContent);
      await db.query('INSERT INTO schema_migrations (version) VALUES ($1);', [version]);
      logger.info(`Migration ${version} applied successfully.`);
      newlyApplied.push(version);
    }
  }

  return newlyApplied;
}

export async function migrateDown(db: IDatabase = getDb()): Promise<string | null> {
  await ensureMigrationTable(db);
  const applied = await getAppliedMigrations(db);

  if (applied.length === 0) {
    logger.info('No migrations to roll back.');
    return null;
  }

  const lastVersion = applied[applied.length - 1];
  if (!lastVersion) return null;

  const rollbackFile = `${lastVersion}_rollback.sql`;
  const rollbackPath = path.join(MIGRATIONS_DIR, rollbackFile);

  if (!fs.existsSync(rollbackPath)) {
    throw new Error(`Rollback script not found for migration ${lastVersion} at ${rollbackPath}`);
  }

  logger.warn(`Rolling back migration: ${lastVersion}...`);
  const sqlContent = fs.readFileSync(rollbackPath, 'utf-8');

  await db.exec(sqlContent);
  // If schema_migrations was dropped by full rollback, ensure table exists or catch
  try {
    await db.query('DELETE FROM schema_migrations WHERE version = $1;', [lastVersion]);
  } catch {
    // schema_migrations may have been dropped in full rollback
  }

  logger.info(`Migration ${lastVersion} rolled back successfully.`);
  return lastVersion;
}

// CLI entrypoint
if (process.argv[1] === __filename) {
  const command = process.argv[2] ?? 'up';
  const db = getDb();

  (async () => {
    try {
      if (command === 'up') {
        const applied = await migrateUp(db);
        logger.info(`Applied ${applied.length} migration(s).`);
      } else if (command === 'down') {
        const rolledBack = await migrateDown(db);
        logger.info(`Rolled back migration: ${rolledBack ?? 'none'}`);
      } else if (command === 'status') {
        const applied = await getAppliedMigrations(db);
        logger.info(`Applied migrations: ${JSON.stringify(applied)}`);
      } else {
        logger.error(`Unknown command: ${command}. Use 'up', 'down', or 'status'.`);
        process.exit(1);
      }
      await db.close();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Migration failed');
      await db.close();
      process.exit(1);
    }
  })();
}
