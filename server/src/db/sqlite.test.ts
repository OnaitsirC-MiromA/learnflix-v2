import { describe, it, expect } from 'vitest';
import { openDb, transaction, pragma } from './index';

function bancoDeTeste() {
  const db = openDb(':memory:');
  db.exec('CREATE TABLE t (id INTEGER)');
  return db;
}

const quantas = (db: ReturnType<typeof openDb>) =>
  (db.prepare('SELECT COUNT(*) AS c FROM t').get() as { c: number }).c;

describe('transaction', () => {
  it('grava tudo quando termina sem erro', () => {
    const db = bancoDeTeste();

    transaction(db, () => {
      db.prepare('INSERT INTO t VALUES (1)').run();
      db.prepare('INSERT INTO t VALUES (2)').run();
    });

    expect(quantas(db)).toBe(2);
    db.close();
  });

  it('desfaz tudo quando algo falha no meio', () => {
    const db = bancoDeTeste();

    expect(() =>
      transaction(db, () => {
        db.prepare('INSERT INTO t VALUES (1)').run();
        throw new Error('parou aqui');
      }),
    ).toThrow('parou aqui');

    expect(quantas(db)).toBe(0);
    db.close();
  });

  // O import chama createCourseFromPath, que já abre a própria transação. Sem
  // aninhamento por savepoint, isso vira "cannot start a transaction within a
  // transaction" e a importação inteira morre.
  it('aceita transação dentro de transação', () => {
    const db = bancoDeTeste();

    transaction(db, () => {
      db.prepare('INSERT INTO t VALUES (1)').run();
      transaction(db, () => {
        db.prepare('INSERT INTO t VALUES (2)').run();
      });
    });

    expect(quantas(db)).toBe(2);
    db.close();
  });

  it('desfaz também a transação de fora quando a de dentro falha', () => {
    const db = bancoDeTeste();

    expect(() =>
      transaction(db, () => {
        db.prepare('INSERT INTO t VALUES (1)').run();
        transaction(db, () => {
          db.prepare('INSERT INTO t VALUES (2)').run();
          throw new Error('estourou dentro');
        });
      }),
    ).toThrow('estourou dentro');

    expect(quantas(db)).toBe(0);
    db.close();
  });

  // Dois bancos abertos ao mesmo tempo é o normal na suíte de testes: a
  // profundidade de aninhamento não pode ser global, ou um banco confundiria o
  // estado do outro.
  it('conta o aninhamento por banco, não globalmente', () => {
    const a = bancoDeTeste();
    const b = bancoDeTeste();

    transaction(a, () => {
      a.prepare('INSERT INTO t VALUES (1)').run();
      transaction(b, () => {
        b.prepare('INSERT INTO t VALUES (1)').run();
      });
    });

    expect(quantas(a)).toBe(1);
    expect(quantas(b)).toBe(1);
    a.close();
    b.close();
  });

  it('volta ao normal depois de uma falha, aceitando a próxima transação', () => {
    const db = bancoDeTeste();

    expect(() => transaction(db, () => { throw new Error('falhou'); })).toThrow();
    transaction(db, () => { db.prepare('INSERT INTO t VALUES (1)').run(); });

    expect(quantas(db)).toBe(1);
    db.close();
  });
});

describe('pragma', () => {
  // openDb já roda migrate, então um banco recém-aberto nasce na versão atual do
  // schema — é isso que a leitura tem de mostrar.
  it('lê um valor', () => {
    const db = bancoDeTeste();

    expect(pragma(db, 'user_version')).toBe(1);

    db.close();
  });

  it('escreve e relê', () => {
    const db = bancoDeTeste();

    pragma(db, 'user_version = 7');

    expect(pragma(db, 'user_version')).toBe(7);
    db.close();
  });

  it('openDb liga foreign keys', () => {
    const db = bancoDeTeste();

    expect(pragma(db, 'foreign_keys')).toBe(1);

    db.close();
  });
});
