import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { buildExport } from '../backup/export';
import { applyImport, planImport } from '../backup/import';
import { parseExport } from '../backup/format';
import { APP_VERSION } from './info';

// Uma biblioteca grande gera um arquivo de alguns megabytes — bem acima do
// limite padrão de 1 MB do Fastify. Sem isto, quem mais precisa do import (quem
// tem centenas de cursos) é justamente quem seria barrado.
const LIMITE_DO_ARQUIVO = 64 * 1024 * 1024;

export async function backupRoutes(app: FastifyInstance, opts: { db: Database.Database }): Promise<void> {
  const { db } = opts;

  app.get('/api/library/export', async (_req, reply) => {
    const data = buildExport(db, APP_VERSION);
    const nome = `learnflix-${data.exportedAt.slice(0, 10)}.json`;
    return reply.header('content-disposition', `attachment; filename="${nome}"`).send(data);
  });

  // Prévia e importação compartilham a validação e o cálculo: o que a tela
  // promete é, por construção, o que a importação faz.
  app.post('/api/library/import/preview', { bodyLimit: LIMITE_DO_ARQUIVO }, async (req, reply) => {
    const lido = parseExport(req.body);
    if (!lido.ok) return reply.code(400).send({ error: lido.error });
    return planImport(db, lido.data);
  });

  app.post('/api/library/import', { bodyLimit: LIMITE_DO_ARQUIVO }, async (req, reply) => {
    const lido = parseExport(req.body);
    if (!lido.ok) return reply.code(400).send({ error: lido.error });
    // O resumo é calculado ANTES de aplicar: depois, todo curso já existiria e a
    // contagem de "novos" viraria zero.
    const resumo = planImport(db, lido.data);
    applyImport(db, lido.data);
    return resumo;
  });
}
