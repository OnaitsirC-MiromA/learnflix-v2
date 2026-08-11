import open from 'open';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config';
import { openDb } from './db/index';
import { buildApp } from './app';

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.thumbsDir, { recursive: true });
fs.mkdirSync(config.convertedDir, { recursive: true });

const db = openDb(config.dbPath);
const app = buildApp(config, db);
const webDist = path.resolve(process.cwd(), '..', 'web', 'dist');

const shutdown = () => {
  app.close().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app
  .listen({ port: config.port, host: config.bind })
  .then((address) => {
    console.log(`Learnflix em ${address}`);
    if (config.openBrowser && fs.existsSync(webDist)) open(`http://localhost:${config.port}`).catch(() => {});
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
