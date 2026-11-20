import type { FastifyInstance } from 'fastify';
import type { Db } from '../db';
import type { AppConfig } from '../config';
import { bridgeFetch } from '../telegram/bridge';
import { saveCatalog, validCatalog, sourceAddress } from '../telegram/catalog';

export async function telegramRoutes(app: FastifyInstance, { db, config }: { db: Db; config: AppConfig }): Promise<void> {
  app.get('/api/telegram/status', async () => {
    if (!config.telegramBridgeUrl || !config.telegramBridgeToken) return { connected: false };
    try { const r = await bridgeFetch(config, '/health'); return { connected: r.ok }; }
    catch { return { connected: false }; }
  });
  app.post('/api/telegram/courses/:id/refresh', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const course = db.prepare("SELECT root_path FROM courses WHERE id=? AND source_kind='telegram'").get(id) as { root_path: string } | undefined;
    const source = course && sourceAddress(course.root_path);
    if (!source) return reply.code(404).send({ error: 'Curso Telegram não encontrado.' });
    const res = await bridgeFetch(config, '/catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source),
    });
    const catalog: unknown = await res.json();
    if (!validCatalog(catalog) || catalog.chatId !== source.chatId || catalog.topicId !== source.topicId) {
      return reply.code(502).send({ error: 'O serviço Telegram devolveu uma origem diferente.' });
    }
    saveCatalog(db, catalog);
    return { id };
  });
  // Ler o catálogo não transfere as mídias. Importar consulta novamente a origem:
  // metadados e URLs de mídia não são aceitos do navegador como fonte da verdade.
  for (const preview of [true, false]) {
    app.post(`/api/telegram/${preview ? 'preview' : 'courses'}`, async (req, reply) => {
      const link = (req.body as { link?: unknown })?.link;
      if (typeof link !== 'string' || link.length > 2048 || !/^https:\/\/t\.me\/[A-Za-z0-9_+/?=&%-]+$/.test(link)) {
        return reply.code(400).send({ error: 'Informe um link https://t.me/ de canal ou tópico.' });
      }
      const res = await bridgeFetch(config, '/catalog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link }),
      });
      const catalog: unknown = await res.json();
      if (!validCatalog(catalog)) return reply.code(502).send({ error: 'O serviço Telegram devolveu um catálogo inválido.' });
      if (preview) return catalog;
      const id = saveCatalog(db, catalog);
      return reply.code(201).send({ id });
    });
  }
}
