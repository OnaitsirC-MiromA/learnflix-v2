import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { transaction, type Db } from '../db';
import type { AppConfig } from '../config';

// Reset de progresso e da biblioteca. Progresso é o bem mais valioso do app,
// então cada alcance tem sua rota explícita (nada de DELETE genérico) e a UI
// sempre confirma antes. Nenhuma rota aqui toca nos vídeos do acervo.
export async function resetRoutes(app: FastifyInstance, opts: { db: Db; config: AppConfig }): Promise<void> {
  const { db, config } = opts;

  // Zera o progresso de UM curso (posições, concluídas). Aulas e curso ficam.
  app.post('/api/courses/:id/progress/reset', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!db.prepare('SELECT 1 FROM courses WHERE id=?').get(id)) return reply.code(404).send({ error: 'not_found' });
    const r = db.prepare('DELETE FROM progress WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id=?)').run(id);
    return { deleted: r.changes };
  });

  // Zera o progresso de TODOS os cursos de uma vez.
  app.post('/api/progress/reset', async () => {
    const r = db.prepare('DELETE FROM progress').run();
    return { deleted: r.changes };
  });

  // Reset TOTAL: apaga cursos (cascade: aulas, progresso, materiais), coleções
  // e os caches derivados (thumbs/convertidos — ficariam órfãos: os IDs de aula
  // que os nomeiam morrem junto). settings sobrevive; o acervo nunca é tocado.
  app.post('/api/library/reset', async () => {
    const before = (db.prepare('SELECT COUNT(*) c FROM courses').get() as { c: number }).c;
    transaction(db, () => {
      db.prepare('DELETE FROM courses').run();
      db.prepare('DELETE FROM collections').run();
    });
    for (const dir of [config.thumbsDir, config.convertedDir]) {
      try {
        for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
      } catch {
        // diretório pode não existir (ex.: ffmpeg ausente) — nada a limpar
      }
    }
    return { courses: before };
  });
}
