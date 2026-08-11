import { createRequire } from 'node:module';
import type { DatabaseSync as TipoDoBanco } from 'node:sqlite';
import { SCHEMA_V1 } from './schema';

// node:sqlite entra por require(), e não por import estático, para o aviso de
// "feature experimental" poder ser silenciado (ver quiet.ts).
//
// O motivo é sutil: em ESM, os módulos embutidos são instanciados na fase de
// LIGAÇÃO, antes de qualquer corpo de módulo rodar — inclusive o do quiet.ts.
// Um require() é chamada de execução, então acontece depois do filtro estar de
// pé. O `import type` acima não conta: tipos somem na compilação e não criam
// dependência nenhuma em tempo de execução.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (caminho: string) => TipoDoBanco;
};

/**
 * O banco do Learnflix usa o SQLite que já vem dentro do Node (`node:sqlite`),
 * e não um módulo nativo.
 *
 * O motivo é a embalagem: um `.node` compilado não entra num executável único,
 * então enquanto o SQLite fosse um módulo nativo o app jamais viraria "baixe um
 * arquivo e rode". Sem ele, o servidor inteiro é JavaScript puro.
 *
 * Em troca, faltam dois açúcares que o better-sqlite3 dava de graça — `pragma()`
 * e `transaction()`. Estão aqui embaixo, e são a única coisa que o resto do
 * código precisa saber sobre a diferença.
 */
export type Db = TipoDoBanco;

/**
 * Lê ou escreve um PRAGMA.
 *
 * `pragma(db, 'user_version')` lê; `pragma(db, 'user_version = 2')` escreve.
 * Leitura devolve o primeiro (e único) valor da linha, como o better-sqlite3
 * fazia com `{ simple: true }`.
 */
export function pragma(db: Db, expr: string): unknown {
  if (expr.includes('=')) {
    db.exec(`PRAGMA ${expr}`);
    return undefined;
  }
  const row = db.prepare(`PRAGMA ${expr}`).get() as Record<string, unknown> | undefined;
  return row ? Object.values(row)[0] : undefined;
}

// Profundidade POR BANCO, não global: a suíte de testes mantém vários bancos
// abertos ao mesmo tempo, e um contador único faria um confundir o estado do
// outro. WeakMap para o banco poder ser coletado normalmente.
const profundidade = new WeakMap<Db, number>();

/**
 * Roda `fn` dentro de uma transação, desfazendo tudo se algo falhar.
 *
 * Aninhamento usa SAVEPOINT porque o SQLite recusa BEGIN dentro de BEGIN — e
 * aninhar acontece de verdade: o import chama createCourseFromPath, que já abre
 * a própria transação.
 */
export function transaction(db: Db, fn: () => void): void {
  const nivel = profundidade.get(db) ?? 0;
  const ponto = `learnflix_sp_${nivel}`;

  db.exec(nivel === 0 ? 'BEGIN' : `SAVEPOINT ${ponto}`);
  profundidade.set(db, nivel + 1);

  try {
    fn();
    db.exec(nivel === 0 ? 'COMMIT' : `RELEASE ${ponto}`);
  } catch (err) {
    // ROLLBACK TO não encerra o savepoint — sem o RELEASE em seguida, ele
    // continuaria aberto e o próximo nível reusaria o mesmo nome.
    if (nivel === 0) db.exec('ROLLBACK');
    else {
      db.exec(`ROLLBACK TO ${ponto}`);
      db.exec(`RELEASE ${ponto}`);
    }
    throw err;
  } finally {
    profundidade.set(db, nivel);
  }
}

// Runner de migrações guardado por PRAGMA user_version. Para evoluir o schema,
// acrescente um bloco `if (version < N)` novo — nunca edite o SCHEMA_V1 no lugar,
// senão os bancos já existentes ficam para trás.
export function migrate(db: Db): void {
  const version = pragma(db, 'user_version') as number;
  if (version < 1) {
    db.exec(SCHEMA_V1);
    pragma(db, 'user_version = 1');
  }
}

export function openDb(dbPath: string): Db {
  const db = new DatabaseSync(dbPath);
  pragma(db, 'journal_mode = WAL');
  pragma(db, 'foreign_keys = ON');
  migrate(db);
  return db;
}
