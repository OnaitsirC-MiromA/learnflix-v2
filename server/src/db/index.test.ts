import { describe, it, expect } from 'vitest';
import { openDb, pragma } from './index';

describe('openDb', () => {
  it('cria as tabelas e é idempotente', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining(['collections', 'course_roots', 'courses', 'lessons', 'materials', 'progress', 'settings']),
    );
    expect(pragma(db, 'user_version')).toBe(1);
    const cols = db.prepare('PRAGMA table_info(courses)').all().map((r: any) => r.name);
    expect(cols).toContain('cover_path');
    expect(cols).toContain('collection_id');
    db.close();
  });

  it('excluir coleção mantém os cursos (collection_id vira NULL)', () => {
    const db = openDb(':memory:');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO collections (id, name, created_at) VALUES (?,?,?)').run('col1', 'Programação', now);
    db.prepare(
      "INSERT INTO courses (id, title, root_path, structure, archived, created_at, updated_at, collection_id) VALUES ('c1','X','/x','flat',0,?,?, 'col1')",
    ).run(now, now);
    db.prepare('DELETE FROM collections WHERE id=?').run('col1');
    const c = db.prepare('SELECT collection_id FROM courses WHERE id=?').get('c1') as any;
    expect(c.collection_id).toBeNull();
    db.close();
  });

  it('aplica FK on e WAL', () => {
    const db = openDb(':memory:');
    expect(pragma(db, 'foreign_keys')).toBe(1);
    db.close();
  });
});
