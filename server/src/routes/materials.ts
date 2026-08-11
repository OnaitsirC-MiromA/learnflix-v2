import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db';
import type { AppConfig } from '../config';
import { allowedRootsFor } from './settings';
import { isWithinRoots } from './fs';
import { parseRange } from './stream';

// Content-types dos materiais adicionais. PDF/imagem servem INLINE (para o leitor
// embutido e o <img> renderizarem); o resto vai como download.
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar', gz: 'application/gzip',
  txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  epub: 'application/epub+zip',
};
const INLINE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'md']);

export async function materialsRoutes(app: FastifyInstance, opts: { db: Db; config: AppConfig }): Promise<void> {
  const { db, config } = opts;

  // Serve o arquivo de um material. O caminho vem do BANCO (não do usuário), e
  // ainda assim é validado contra as raízes — o app nunca sai do acervo. ?download=1
  // força o "salvar como" (para zip/docs); senão inline (PDF/imagem no leitor).
  app.get('/api/materials/:id', (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = db.prepare('SELECT m.rel_path, c.root_path FROM materials m JOIN courses c ON c.id=m.course_id WHERE m.id=?').get(id) as
      | { rel_path: string; root_path: string }
      | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const filePath = path.join(row.root_path, row.rel_path.split('/').join(path.sep));
    if (!isWithinRoots(filePath, allowedRootsFor(config, db))) return reply.code(403).send({ error: 'forbidden' });
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return reply.code(404).send({ error: 'file_missing' });
    }

    const ext = path.extname(row.rel_path).slice(1).toLowerCase();
    const type = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    const name = row.rel_path.split('/').pop() ?? 'arquivo';
    const forceDownload = (req.query as { download?: string }).download === '1' || !INLINE.has(ext);
    const disposition = forceDownload ? 'attachment' : 'inline';

    const size = stat.size;
    reply.header('Content-Type', type);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`);

    const range = parseRange(req.headers.range, size);
    if (range) {
      reply.code(206);
      reply.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      reply.header('Content-Length', range.end - range.start + 1);
      return reply.send(fs.createReadStream(filePath, { start: range.start, end: range.end }));
    }
    reply.code(200);
    reply.header('Content-Length', size);
    return reply.send(fs.createReadStream(filePath));
  });
}
