import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

// Coleções: grupos nomeados de cursos, criados manualmente pelo dono do acervo.
// Excluir uma coleção nunca toca nos cursos (FK ON DELETE SET NULL na migração v3).
export async function collectionsRoutes(app: FastifyInstance, opts: { db: Database.Database }): Promise<void> {
  const { db } = opts;

  app.get('/api/collections', async () => {
    const rows = db
      .prepare(
        `SELECT c.id, c.name, COUNT(co.id) AS n
         FROM collections c
         LEFT JOIN courses co ON co.collection_id = c.id AND co.archived = 0
         GROUP BY c.id
         ORDER BY c.name COLLATE NOCASE`,
      )
      .all() as any[];
    return rows.map((r) => ({ id: r.id, name: r.name, courseCount: r.n }));
  });

  app.post('/api/collections', async (req, reply) => {
    const b = req.body as { name?: unknown };
    if (typeof b?.name !== 'string' || b.name.trim() === '') {
      return reply.code(400).send({ error: 'invalid_name' });
    }
    const id = randomUUID();
    db.prepare('INSERT INTO collections (id, name, created_at) VALUES (?, ?, ?)').run(
      id,
      b.name.trim(),
      new Date().toISOString(),
    );
    return reply.code(201).send({ id, name: b.name.trim() });
  });

  app.patch('/api/collections/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!db.prepare('SELECT 1 FROM collections WHERE id=?').get(id)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const b = req.body as { name?: unknown };
    if (typeof b?.name !== 'string' || b.name.trim() === '') {
      return reply.code(400).send({ error: 'invalid_name' });
    }
    db.prepare('UPDATE collections SET name=? WHERE id=?').run(b.name.trim(), id);
    return { ok: true };
  });

  app.delete('/api/collections/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!db.prepare('SELECT 1 FROM collections WHERE id=?').get(id)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    db.prepare('DELETE FROM collections WHERE id=?').run(id); // cursos ficam (SET NULL)
    return reply.code(204).send();
  });
}
