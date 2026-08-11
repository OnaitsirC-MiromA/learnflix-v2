import Database from 'better-sqlite3';
import { SCHEMA_V1 } from './schema';

// Runner de migrações guardado por PRAGMA user_version. Para evoluir o schema,
// acrescente um bloco `if (version < N)` novo — nunca edite o SCHEMA_V1 no lugar,
// senão os bancos já existentes ficam para trás.
export function migrate(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < 1) {
    db.exec(SCHEMA_V1);
    db.pragma('user_version = 1');
  }
}

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
