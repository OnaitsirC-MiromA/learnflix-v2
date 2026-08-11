import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { AppConfig } from '../config';
import { createCourseFromPath } from '../scan/scan-course';
import { walkCourseDir } from '../scan/walk';
import { reconcileCourse } from '../scan/reconcile';
import { isWithinRoots } from './fs';
import { allowedRootsFor } from './settings';

export async function coursesRoutes(app: FastifyInstance, opts: { db: Database.Database; config: AppConfig }): Promise<void> {
  const { db, config } = opts;

  app.post('/api/courses', async (req, reply) => {
    const body = req.body as { path?: string };
    if (!body?.path) { reply.code(400); return { error: 'path_required' }; }
    const target = path.resolve(body.path);
    if (!isWithinRoots(target, allowedRootsFor(config, db))) { reply.code(403); return { error: 'forbidden' }; }
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) { reply.code(400); return { error: 'not_a_directory' }; }
    // Idempotente: se a pasta já é um curso, re-escaneia (pega arquivos novos e
    // marca faltantes) em vez de criar um duplicado. Desarquiva se estava
    // arquivado — re-adicionar sinaliza que o usuário quer o curso ativo.
    const existing = db.prepare('SELECT id, archived FROM courses WHERE root_path=?').get(target) as { id: string; archived: number } | undefined;
    if (existing) {
      if (existing.archived) db.prepare('UPDATE courses SET archived=0 WHERE id=?').run(existing.id);
      const r = reconcileCourse(db, config, existing.id);
      reply.code(200);
      return { id: existing.id, existing: true, rescan: 'status' in r ? null : r };
    }
    const ilegiveis: string[] = [];
    const id = createCourseFromPath(db, target, (c) => ilegiveis.push(...c));
    reply.code(201);
    return { id, existing: false, unreadable: ilegiveis.length };
  });

  // Importação em lote: escolhe uma pasta-raiz e cada SUBPASTA com vídeos vira um
  // curso. Subpastas já adicionadas (mesmo root_path) e sem vídeo são puladas —
  // rodar de novo é idempotente. Coleções são um passo manual separado, por design.
  app.post('/api/courses/batch', async (req, reply) => {
    const raw = (req.body as { path?: unknown })?.path;
    if (!raw || typeof raw !== 'string') return reply.code(400).send({ error: 'invalid_path' });
    const target = path.resolve(raw);
    if (!isWithinRoots(target, allowedRootsFor(config, db))) return reply.code(403).send({ error: 'forbidden' });
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(target, { withFileTypes: true });
    } catch {
      return reply.code(400).send({ error: 'invalid_path' });
    }
    const subdirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => path.join(target, e.name))
      .sort();
    const existing = new Set((db.prepare('SELECT root_path FROM courses').all() as any[]).map((r) => r.root_path));
    const courses: { id: string; title: string }[] = [];
    // Nomes, não só contagens: a UI precisa dizer QUAIS pastas foram puladas e
    // por quê — "0 importados" sozinho não explica nada a quem esperava cursos.
    const skippedTitles: string[] = [];
    const noVideosTitles: string[] = [];
    // Arquivos que a listagem mostrou mas o sistema de arquivos não entregou
    // (ver walkCourseDir). Antes isto derrubava a importação inteira; agora é
    // contado e devolvido, porque pular calado viraria aula sumida sem explicação.
    const ilegiveis: string[] = [];
    for (const dir of subdirs) {
      if (existing.has(dir)) { skippedTitles.push(path.basename(dir)); continue; }
      const varredura = walkCourseDir(dir);
      ilegiveis.push(...varredura.unreadable.map((r) => `${path.basename(dir)}/${r}`));
      if (varredura.videos.length === 0) { noVideosTitles.push(path.basename(dir)); continue; }
      courses.push({ id: createCourseFromPath(db, dir), title: path.basename(dir) });
    }
    // Registra/atualiza a raiz usada (só em execução bem-sucedida — nunca nos
    // retornos antecipados 403/400 acima). Upsert por path evita duplicar ao
    // rodar de novo (recheck de "Verificar novos cursos").
    db.prepare(
      `INSERT INTO course_roots (id, path, created_at, last_checked_at)
       VALUES (?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(path) DO UPDATE SET last_checked_at=datetime('now')`,
    ).run(randomUUID(), target);
    return reply.code(201).send({
      created: courses.length,
      skipped: skippedTitles.length,
      noVideos: noVideosTitles.length,
      courses,
      skippedTitles,
      noVideosTitles,
      unreadable: ilegiveis.length,
      // Uma amostra basta para a pessoa reconhecer o padrão (pasta, disco de rede)
      // sem transformar o aviso numa parede de texto.
      unreadableSample: ilegiveis.slice(0, 5),
    });
  });

  app.get('/api/courses/roots', async () => {
    const rows = db.prepare('SELECT * FROM course_roots ORDER BY created_at').all() as any[];
    return rows.map((r) => ({ id: r.id, path: r.path, createdAt: r.created_at, lastCheckedAt: r.last_checked_at }));
  });

  app.delete('/api/courses/roots/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const result = db.prepare('DELETE FROM course_roots WHERE id=?').run(id);
    if (result.changes === 0) { reply.code(404); return { error: 'not_found' }; }
    return reply.code(204).send();
  });

  app.get('/api/courses', async (req) => {
    const archived = (req.query as { archived?: string }).archived === '1' ? 1 : 0;
    const courses = db.prepare(`SELECT * FROM courses WHERE archived=? ORDER BY COALESCE(sort_index, 1e9), created_at`).all(archived) as any[];
    const aggStmt = db.prepare(`
      SELECT
        COUNT(l.id) AS total,
        COALESCE(SUM(CASE WHEN p.completed=1 THEN 1 ELSE 0 END), 0) AS completed,
        COALESCE(SUM(CASE WHEN p.completed=0 AND p.position_sec>0 THEN 1 ELSE 0 END), 0) AS inprogress,
        MAX(p.updated_at) AS last_at
      FROM lessons l LEFT JOIN progress p ON p.lesson_id = l.id
      WHERE l.course_id = ?
    `);
    return courses.map((c) => {
      const agg = aggStmt.get(c.id) as any;
      return {
        id: c.id, title: c.title, structure: c.structure,
        totalLessons: agg.total, completedLessons: agg.completed, inProgressLessons: agg.inprogress,
        posterLessonId: c.poster_lesson_id, lastActivityAt: agg.last_at ?? null,
        collectionId: c.collection_id ?? null,
      };
    });
  });

  app.get('/api/courses/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const course = db.prepare('SELECT * FROM courses WHERE id=?').get(id) as any;
    if (!course) { reply.code(404); return { error: 'not_found' }; }

    const rows = db.prepare(`
      SELECT l.*, p.position_sec, p.furthest_sec, p.completed, p.duration_sec AS p_dur
      FROM lessons l LEFT JOIN progress p ON p.lesson_id = l.id
      WHERE l.course_id = ? ORDER BY l.order_index
    `).all(id) as any[];

    const modules: { name: string | null; lessons: any[] }[] = [];
    for (const r of rows) {
      const dto = {
        id: r.id, title: r.title, module: r.module, relPath: r.rel_path,
        orderIndex: r.order_index, durationSec: r.duration_sec ?? r.p_dur ?? null,
        container: r.container, playable: !!r.playable, missing: !!r.missing,
        position: r.position_sec ?? 0, furthest: r.furthest_sec ?? 0, completed: !!r.completed,
      };
      let mod = modules.find((m) => m.name === r.module);
      if (!mod) { mod = { name: r.module, lessons: [] }; modules.push(mod); }
      mod.lessons.push(dto);
    }

    const completedLessons = rows.filter((r) => !!r.completed).length;
    // Materiais adicionais (pdf/zip/imagem/doc): já escaneados; agrupados por
    // módulo na UI. Ordenados por caminho para manter a ordem das pastas.
    const materials = (db.prepare('SELECT id, module, rel_path, kind, size_bytes FROM materials WHERE course_id=? ORDER BY rel_path').all(id) as any[]).map((m) => ({
      id: m.id,
      module: m.module,
      relPath: m.rel_path,
      name: (m.rel_path as string).split('/').pop() ?? m.rel_path,
      kind: m.kind,
      sizeBytes: m.size_bytes,
    }));

    return {
      id: course.id, title: course.title, structure: course.structure, rootPath: course.root_path,
      totalLessons: rows.length, completedLessons, materialsCount: materials.length, modules, materials,
      collectionId: course.collection_id ?? null,
    };
  });

  app.patch('/api/courses/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const b = req.body as { title?: string; archived?: boolean; collectionId?: string | null };
    if (!db.prepare('SELECT 1 FROM courses WHERE id=?').get(id)) return reply.code(404).send({ error: 'not_found' });
    if (b.title !== undefined && (typeof b.title !== 'string' || b.title.trim() === '')) return reply.code(400).send({ error: 'invalid_title' });
    if (b.collectionId !== undefined && b.collectionId !== null) {
      if (typeof b.collectionId !== 'string' || !db.prepare('SELECT 1 FROM collections WHERE id=?').get(b.collectionId)) {
        return reply.code(400).send({ error: 'invalid_collection' });
      }
    }
    const sets: string[] = [];
    const params: any = { id, now: new Date().toISOString() };
    if (b.title !== undefined) { sets.push('title=@title'); params.title = b.title.trim(); }
    if (b.archived !== undefined) { sets.push('archived=@archived'); params.archived = b.archived ? 1 : 0; }
    if (b.collectionId !== undefined) { sets.push('collection_id=@collection_id'); params.collection_id = b.collectionId; }
    if (sets.length) db.prepare(`UPDATE courses SET ${sets.join(', ')}, updated_at=@now WHERE id=@id`).run(params);
    return { ok: true };
  });

  app.delete('/api/courses/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!db.prepare('SELECT 1 FROM courses WHERE id=?').get(id)) return reply.code(404).send({ error: 'not_found' });
    const lessonIds = (db.prepare('SELECT id FROM lessons WHERE course_id=?').all(id) as any[]).map((r) => r.id);
    db.prepare('DELETE FROM courses WHERE id=?').run(id); // cascata remove lessons/progress/materials
    // Limpa o cache de imagens: <lessonId>-*.jpg e course-<id>.jpg
    try {
      const prefixes = new Set(lessonIds.map((lid) => `${lid}-`));
      for (const f of fs.readdirSync(config.thumbsDir)) {
        if (f === `course-${id}.jpg` || [...prefixes].some((p) => f.startsWith(p))) {
          fs.rmSync(path.join(config.thumbsDir, f), { force: true });
        }
      }
    } catch { /* cache pode não existir ainda */ }
    return reply.code(204).send();
  });
}
