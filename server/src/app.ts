import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db';
import { registrarSpa } from './spa';
import { WEB_ASSETS } from './bundled';
import type { AppConfig } from './config';
import { healthRoutes } from './routes/health';
import { fsRoutes } from './routes/fs';
import { coursesRoutes } from './routes/courses';
import { lessonsRoutes } from './routes/lessons';
import { streamRoutes } from './routes/stream';
import { infoRoutes } from './routes/info';
import { thumbsRoutes } from './routes/thumbs';
import { migrationRoutes } from './routes/migration';
import { settingsRoutes } from './routes/settings';
import { collectionsRoutes } from './routes/collections';
import { convertRoutes } from './routes/convert';
import { resetRoutes } from './routes/reset';
import { materialsRoutes } from './routes/materials';
import { swRoutes } from './routes/sw';
import { telegramRoutes } from './routes/telegram';
import { backupRoutes } from './routes/backup';

export function buildApp(config: AppConfig, db: Db): FastifyInstance {
  const app = Fastify({ logger: false });
  // Opcional para instalações numa rede local. Quem usa localhost continua sem
  // login. O segredo vem do ambiente/arquivo privado, nunca do banco exportado.
  if (config.accessPassword) {
    const expected = createHash('sha256').update(`learnflix:${config.accessPassword}`).digest();
    app.addHook('onRequest', async (req, reply) => {
      const header = req.headers.authorization;
      const supplied = header?.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
      if (!timingSafeEqual(createHash('sha256').update(supplied).digest(), expected)) {
        return reply.code(401).header('WWW-Authenticate', 'Basic realm="Learnflix", charset="UTF-8"')
          .header('Cache-Control', 'no-store').send({ error: 'Entre com o usuário learnflix e a senha desta instalação.' });
      }
    });
  }

  // Tolera corpo vazio em application/json: um POST/DELETE sem corpo (ex.: rescan, excluir)
  // não deve falhar com FST_ERR_CTP_EMPTY_JSON_BODY — trata corpo vazio como indefinido.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = (body as string).trim();
    if (raw === '') return done(null, undefined);
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  app.register(healthRoutes);
  app.register(fsRoutes, { config, db });
  app.register(coursesRoutes, { db, config });
  app.register(lessonsRoutes, { db });
  app.register(streamRoutes, { db, config });
  app.register(infoRoutes);
  app.register(thumbsRoutes, { db, config });
  app.register(migrationRoutes, { db, config });
  app.register(settingsRoutes, { db });
  app.register(collectionsRoutes, { db });
  app.register(convertRoutes, { db, config });
  app.register(resetRoutes, { db, config });
  app.register(materialsRoutes, { db, config });
  app.register(swRoutes);
  app.register(backupRoutes, { db });
  app.register(telegramRoutes, { db, config });
  // [ROUTES]

  // A interface vem embutida no build, não do disco — ver spa.ts.
  registrarSpa(app, WEB_ASSETS);

  return app;
}
