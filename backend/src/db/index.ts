import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface IDatabase {
  query<T = any>(sqlText: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sqlText: string): Promise<void>;
  close(): Promise<void>;
  isClosed(): boolean;
}

export class PgDatabase implements IDatabase {
  private pool: pg.Pool;
  private closed = false;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    this.pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
    });
  }

  async query<T = any>(sqlText: string, params?: unknown[]): Promise<QueryResult<T>> {
    const res = await this.pool.query(sqlText, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? 0
    };
  }

  async exec(sqlText: string): Promise<void> {
    await this.pool.query(sqlText);
  }

  async close(): Promise<void> {
    if (!this.closed) {
      await this.pool.end();
      this.closed = true;
    }
  }

  isClosed(): boolean {
    return this.closed;
  }
}

export class PGliteDatabase implements IDatabase {
  private pglite: PGlite;
  private closed = false;

  constructor(pgliteInstance?: PGlite) {
    this.pglite = pgliteInstance ?? new PGlite();
  }

  async query<T = any>(sqlText: string, params?: unknown[]): Promise<QueryResult<T>> {
    const res =
      params && params.length > 0
        ? await this.pglite.query<T>(sqlText, params as any[])
        : await this.pglite.query<T>(sqlText);
    return {
      rows: res.rows,
      rowCount: res.affectedRows ?? res.rows.length
    };
  }

  async exec(sqlText: string): Promise<void> {
    await this.pglite.exec(sqlText);
  }

  async close(): Promise<void> {
    if (!this.closed) {
      await this.pglite.close();
      this.closed = true;
    }
  }

  isClosed(): boolean {
    return this.closed;
  }

  getInternalInstance(): PGlite {
    return this.pglite;
  }
}

export async function createTestDatabase(): Promise<PGliteDatabase> {
  const pglite = new PGlite();
  await pglite.waitReady;
  return new PGliteDatabase(pglite);
}

let dbInstance: IDatabase | null = null;

export function setDb(customDb: IDatabase | null): void {
  dbInstance = customDb;
}

export function getDb(): IDatabase {
  if (!dbInstance || dbInstance.isClosed()) {
    if (config.DATABASE_URL) {
      logger.info('Connecting to PostgreSQL using DATABASE_URL pool');
      dbInstance = new PgDatabase(config.DATABASE_URL);
    } else {
      logger.info('Initializing embedded PGlite PostgreSQL engine');
      dbInstance = new PGliteDatabase();
    }
  }
  return dbInstance;
}

export const db: IDatabase = new Proxy({} as IDatabase, {
  get(_target, prop) {
    const instance = getDb();
    const val = (instance as any)[prop];
    if (typeof val === 'function') {
      return val.bind(instance);
    }
    return val;
  }
});

