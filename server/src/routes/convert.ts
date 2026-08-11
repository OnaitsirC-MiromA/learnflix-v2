import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db';
import type { AppConfig } from '../config';
import { classifyPlayback, hasFfmpeg, probeFormat, remuxToMp4, validateConverted } from '../media/ffmpeg';

// Verificação e conversão de reprodução. A extensão .mp4 mente no acervo real
// (MPEG-TS renomeado; H.264 10-bit): estas rotas olham o formato DE DENTRO do
// arquivo e, quando dá para resolver sem perda (remux -c copy), convertem para
// DATA_DIR/converted/<lessonId>.mp4 — o acervo original nunca é tocado; o
// stream passa a servir o convertido automaticamente. Formatos que exigiriam
// recodificar são reportados com 409 para a UI explicar, e não convertidos aqui:
// recodificar é lento, com perda, e melhor feito por fora com uma ferramenta
// dedicada.
export async function convertRoutes(app: FastifyInstance, opts: { db: Db; config: AppConfig }): Promise<void> {
  const { db, config } = opts;

  const lessonPath = (id: string): { file: string; courseId: string } | null => {
    const row = db
      .prepare('SELECT l.rel_path, l.course_id, c.root_path FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = ?')
      .get(id) as any;
    if (!row) return null;
    return { file: path.join(row.root_path, row.rel_path.split('/').join(path.sep)), courseId: row.course_id };
  };

  const setPlayable = db.prepare('UPDATE lessons SET playable=? WHERE id=?');

  // Proba o arquivo e sincroniza o flag playable com a realidade. Retorna o
  // veredito para a UI decidir o que oferecer.
  const verdictFor = async (id: string, file: string) => {
    const fmt = await probeFormat(file);
    if (!fmt) return null;
    const play = classifyPlayback(fmt);
    setPlayable.run(play.playable ? 1 : 0, id);
    return play;
  };

  app.post('/api/lessons/:id/verify-playback', async (req, reply) => {
    if (!hasFfmpeg()) return reply.code(503).send({ error: 'ffmpeg_unavailable' });
    const id = (req.params as { id: string }).id;
    const loc = lessonPath(id);
    if (!loc) return reply.code(404).send({ error: 'not_found' });
    if (!fs.existsSync(loc.file)) return reply.code(404).send({ error: 'file_missing' });
    const play = await verdictFor(id, loc.file);
    if (!play) return reply.code(500).send({ error: 'probe_failed' });
    return play;
  });

  app.post('/api/lessons/:id/convert', async (req, reply) => {
    if (!hasFfmpeg()) return reply.code(503).send({ error: 'ffmpeg_unavailable' });
    const id = (req.params as { id: string }).id;
    const loc = lessonPath(id);
    if (!loc) return reply.code(404).send({ error: 'not_found' });
    if (!fs.existsSync(loc.file)) return reply.code(404).send({ error: 'file_missing' });
    const play = await verdictFor(id, loc.file);
    if (!play) return reply.code(500).send({ error: 'probe_failed' });
    if (play.playable) return { status: 'already_playable' };
    // Sem perda ou nada: o vídeo precisa ser recodificado por fora.
    if (!play.remuxable) return reply.code(409).send({ status: 'transcode_required', reason: play.reason });

    fs.mkdirSync(config.convertedDir, { recursive: true });
    const out = path.join(config.convertedDir, `${id}.mp4`);
    try {
      await remuxToMp4(loc.file, out);
      // Validação obrigatória antes de servir: tocável de verdade + mesma duração.
      if (!(await validateConverted(loc.file, out))) throw new Error('validação falhou');
    } catch {
      fs.rmSync(out, { force: true }); // não deixa mp4 pela metade para o stream servir
      return reply.code(500).send({ error: 'convert_failed' });
    }
    setPlayable.run(1, id);
    return { status: 'converted' };
  });
}
