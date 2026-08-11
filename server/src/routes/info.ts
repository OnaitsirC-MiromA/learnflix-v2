import type { FastifyInstance } from 'fastify';
import { hasFfmpeg } from '../media/ffmpeg';
import { APP_VERSION } from '../bundled';

// A versão vem do módulo gerado pelo build, e não de uma leitura do package.json
// relativa ao diretório de onde o processo subiu. A leitura antiga dava "dev"
// sempre que o app era iniciado de outro lugar — e num executável único não
// haveria package.json nenhum para ler.
export { APP_VERSION };

export async function infoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/info', async () => ({ ffmpeg: hasFfmpeg(), version: APP_VERSION }));
}
