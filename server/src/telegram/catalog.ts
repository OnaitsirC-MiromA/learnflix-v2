import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { transaction, type Db } from '../db';

export interface TelegramFile {
  messageId: number; name: string; size: number; mime: string;
  video: boolean; duration: number | null; displayTitle?: string;
}
export interface TelegramCatalog {
  chatId: string; topicId: number | null; title: string; files: TelegramFile[];
}
export function sourceAddress(root: string): { chatId: string; topicId: number | null } | null {
  const m = /^telegram:\/\/(-?\d+)\/(all|\d+)$/.exec(root);
  return m ? { chatId: m[1], topicId: m[2] === 'all' ? null : Number(m[2]) } : null;
}
export function validCatalog(value: unknown): value is TelegramCatalog {
  const c = value as TelegramCatalog | null;
  return !!c && typeof c.chatId === 'string' && /^-?\d+$/.test(c.chatId)
    && (c.topicId === null || (Number.isSafeInteger(c.topicId) && c.topicId > 0))
    && typeof c.title === 'string' && c.title.length > 0 && c.title.length <= 1000
    && Array.isArray(c.files) && c.files.length <= 100000
    && new Set(c.files.map(f => f?.messageId)).size === c.files.length
    && c.files.every(f => f && Number.isSafeInteger(f.messageId) && f.messageId > 0
      && (f.displayTitle === undefined || (typeof f.displayTitle === 'string' && f.displayTitle.trim().length > 0
        && f.displayTitle.length <= 1000 && !/[\x00-\x1f\x7f]/.test(f.displayTitle)))
      && typeof f.name === 'string' && f.name.length > 0 && f.name.length < 1000
      && !/[\x00-\x1f/\\]/.test(f.name) && typeof f.mime === 'string' && f.mime.length < 200
      && Number.isSafeInteger(f.size) && f.size > 0 && typeof f.video === 'boolean'
      && (f.duration === null || (Number.isFinite(f.duration) && f.duration >= 0)));
}

// A mensagem, não o título ou a posição na lista, identifica a aula. Atualizar
// nomes, ordenar e listar novamente nunca recria a linha que guarda progresso.
export function saveCatalog(db: Db, c: TelegramCatalog): string {
  if (!validCatalog(c)) throw new Error('Catálogo Telegram inválido.');
  const root = `telegram://${c.chatId}/${c.topicId ?? 'all'}`;
  let id = '';
  transaction(db, () => {
    const old = db.prepare("SELECT id FROM courses WHERE root_path=? AND source_kind='telegram'").get(root) as { id: string } | undefined;
    id = old?.id ?? randomUUID();
    const now = new Date().toISOString();
    if (!old) db.prepare(`INSERT INTO courses(id,title,root_path,structure,source_kind,created_at,updated_at)
      VALUES(?,?,?,'flat','telegram',?,?)`).run(id, c.title, root, now, now);
    db.prepare('UPDATE courses SET archived=0, updated_at=?,last_scanned_at=? WHERE id=?').run(now, now, id);
    db.prepare('UPDATE lessons SET missing=1 WHERE course_id=?').run(id);
    // Materiais não têm progresso. Uma atualização completa pode substituí-los.
    db.prepare('DELETE FROM materials WHERE course_id=?').run(id);
    let order = 0;
    for (const f of [...c.files].sort((a, b) => a.messageId - b.messageId)) {
      const ext = path.extname(f.name).slice(1).toLowerCase();
      if (f.video) {
        const existing = db.prepare('SELECT id FROM lessons WHERE course_id=? AND telegram_message_id=?').get(id, f.messageId) as { id: string } | undefined;
        const lid = existing?.id ?? randomUUID();
        db.prepare(`INSERT INTO lessons(id,course_id,rel_path,title,order_index,module_order,duration_sec,size_bytes,mtime,container,telegram_message_id)
          VALUES(?,?,?,?,?,0,?,?,0,?,?) ON CONFLICT(course_id,telegram_message_id) DO UPDATE SET
          title=excluded.title,order_index=excluded.order_index,duration_sec=excluded.duration_sec,
          size_bytes=excluded.size_bytes,container=excluded.container,missing=0`).run(
          lid,id,`${f.messageId}/${f.name}`,f.displayTitle?.trim() || f.name,order++,f.duration,f.size,ext || 'mp4',f.messageId);
      } else {
        const kind = ext === 'pdf' ? 'pdf' : ['zip','rar','7z'].includes(ext) ? 'archive' : ['jpg','jpeg','png','webp'].includes(ext) ? 'image' : 'other';
        db.prepare(`INSERT INTO materials(id,course_id,rel_path,kind,size_bytes,telegram_message_id) VALUES(?,?,?,?,?,?)`)
          .run(randomUUID(),id,`${f.messageId}/${f.name}`,kind,f.size,f.messageId);
      }
    }
  });
  return id;
}
