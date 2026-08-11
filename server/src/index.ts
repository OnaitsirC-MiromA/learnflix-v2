// Primeiro import de todos, de propósito — ver quiet.ts.
import './quiet';
import open from 'open';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config';
import { openDb } from './db/index';
import { herdarDadosDoV1 } from './db/legacy';
import { buildApp } from './app';
import { escutarComFallback } from './listen';
import { mensagemDeBoot } from './banner';
import { hasFfmpeg } from './media/ffmpeg';
import { APP_VERSION } from './routes/info';

const config = loadConfig();

// Antes de abrir o banco: se o app subiu de dentro da pasta do v1 e ainda não há
// banco novo, o histórico de lá é adotado. Depois do openDb seria tarde — ele
// criaria um banco vazio e a herança nunca aconteceria.
const heranca = herdarDadosDoV1(process.cwd(), config.dataDir);

for (const dir of [config.dataDir, config.thumbsDir, config.convertedDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = openDb(config.dbPath);
const app = buildApp(config, db);
const webDist = path.resolve(process.cwd(), '..', 'web', 'dist');

const shutdown = () => {
  app.close().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  const { port, trocou } = await escutarComFallback(app, config.port, config.bind);
  const url = `http://localhost:${port}`;
  const abrindo = config.openBrowser && fs.existsSync(webDist);

  console.log(
    mensagemDeBoot({
      versao: APP_VERSION,
      dataDir: config.dataDir,
      url,
      temFfmpeg: hasFfmpeg(),
      trocouDePorta: trocou,
      portaPedida: config.port,
      herdouDoV1: heranca === 'adotado',
      abrindoNavegador: abrindo,
      plataforma: process.platform,
    }).join('\n'),
  );

  if (abrindo) open(url).catch(() => {});
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
