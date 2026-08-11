import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { hasFfmpeg } from '../media/ffmpeg';

// Versão mostrada no rodapé das Configurações: vem do package.json da raiz
// (o servidor roda com cwd em server/). Lido uma vez no boot; 'dev' se falhar.
function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
}

// Exportada porque o arquivo de export registra de qual versão ele saiu.
export const APP_VERSION = readVersion();
const VERSION = APP_VERSION;

export async function infoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/info', async () => ({ ffmpeg: hasFfmpeg(), version: VERSION }));
}
