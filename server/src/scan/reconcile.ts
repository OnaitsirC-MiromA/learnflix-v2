import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { transaction, type Db } from '../db';
import type { AppConfig } from '../config';
import type { DerivedLesson } from './derive';
import { walkCourseDir } from './walk';
import { deriveCourse } from './derive';

export interface ExistingLesson {
  id: string;
  rel_path: string;
  mtime: number;
  order_index: number;
}

export interface ReconcilePlan {
  matched: { id: string; derived: DerivedLesson }[];
  relinked: { id: string; oldRelPath: string; derived: DerivedLesson }[];
  missing: { id: string; orderIndex: number }[];
  added: { derived: DerivedLesson }[];
  structure: 'modules' | 'flat';
}

const basename = (p: string): string => p.split('/').pop() ?? p;

function groupByBasename<T>(items: T[], rel: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const b = basename(rel(it));
    const arr = m.get(b);
    if (arr) arr.push(it);
    else m.set(b, [it]);
  }
  return m;
}

export function planReconcile(
  existing: ExistingLesson[],
  derived: DerivedLesson[],
  structure: 'modules' | 'flat',
): ReconcilePlan {
  const existingByRel = new Map(existing.map((e) => [e.rel_path, e]));
  const usedExisting = new Set<string>();
  const usedDerived = new Set<string>();

  const matched: ReconcilePlan['matched'] = [];
  for (const d of derived) {
    const e = existingByRel.get(d.relPath);
    if (e) {
      matched.push({ id: e.id, derived: d });
      usedExisting.add(e.id);
      usedDerived.add(d.relPath);
    }
  }

  const unmatchedExisting = existing.filter((e) => !usedExisting.has(e.id));
  const unmatchedDerived = derived.filter((d) => !usedDerived.has(d.relPath));
  const exByBase = groupByBasename(unmatchedExisting, (e) => e.rel_path);
  const dvByBase = groupByBasename(unmatchedDerived, (d) => d.relPath);

  const relinked: ReconcilePlan['relinked'] = [];
  for (const [b, exs] of exByBase) {
    const dvs = dvByBase.get(b);
    if (exs.length === 1 && dvs && dvs.length === 1) {
      relinked.push({ id: exs[0].id, oldRelPath: exs[0].rel_path, derived: dvs[0] });
      usedExisting.add(exs[0].id);
      usedDerived.add(dvs[0].relPath);
    }
  }

  const missing = existing
    .filter((e) => !usedExisting.has(e.id))
    .map((e) => ({ id: e.id, orderIndex: e.order_index }));
  const added = derived.filter((d) => !usedDerived.has(d.relPath)).map((d) => ({ derived: d }));

  return { matched, relinked, missing, added, structure };
}

export interface ReconcileResult {
  matched: number;
  relinked: number;
  missing: number;
  added: number;
  structureChanged: boolean;
}
export type RootUnavailable = { status: 'root_unavailable' };

function prepare(db: Db, courseId: string, targetPath: string) {
  const { videos, materials, unreadable } = walkCourseDir(targetPath);
  const derived = deriveCourse(videos);
  const existing = db
    .prepare('SELECT id, rel_path, mtime, order_index FROM lessons WHERE course_id=?')
    .all(courseId) as unknown as ExistingLesson[];
  const bruto = planReconcile(existing, derived.lessons, derived.structure);

  // Um arquivo que a listagem mostrou mas o stat não alcançou (típico de
  // compartilhamento SMB instável) NÃO é uma aula sumida — é uma aula que o
  // sistema de arquivos não entregou desta vez. Marcá-la como faltando faria a
  // aula piscar entre presente e ausente a cada rescan, porque o conjunto de
  // arquivos afetados muda a cada varredura. Ela só conta como sumida quando
  // desaparecer também da listagem.
  const plan = unreadable.length
    ? (() => {
        const ilegiveis = new Set(unreadable);
        const caminhoPorId = new Map(existing.map((e) => [e.id, e.rel_path]));
        return { ...bruto, missing: bruto.missing.filter((m) => !ilegiveis.has(caminhoPorId.get(m.id) ?? '')) };
      })()
    : bruto;

  return { plan, materials, derived, unreadable };
}

function rootOk(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

export function previewReconcile(
  db: Db,
  _config: AppConfig,
  courseId: string,
  opts?: { newRootPath?: string },
): ReconcileResult | RootUnavailable {
  const course = db.prepare('SELECT root_path, structure FROM courses WHERE id=?').get(courseId) as any;
  if (!course) return { status: 'root_unavailable' };
  const targetPath = opts?.newRootPath ?? course.root_path;
  if (!rootOk(targetPath)) return { status: 'root_unavailable' };
  const { plan } = prepare(db, courseId, targetPath);
  return {
    matched: plan.matched.length,
    relinked: plan.relinked.length,
    missing: plan.missing.length,
    added: plan.added.length,
    structureChanged: course.structure !== plan.structure,
  };
}

export function reconcileCourse(
  db: Db,
  _config: AppConfig,
  courseId: string,
  opts?: { newRootPath?: string },
): ReconcileResult | RootUnavailable {
  const course = db.prepare('SELECT root_path, structure, poster_lesson_id FROM courses WHERE id=?').get(courseId) as any;
  if (!course) return { status: 'root_unavailable' };
  const targetPath = opts?.newRootPath ?? course.root_path;
  if (!rootOk(targetPath)) return { status: 'root_unavailable' };

  const { plan, materials } = prepare(db, courseId, targetPath);
  const now = new Date().toISOString();

  const updateLesson = db.prepare(`
    UPDATE lessons SET rel_path=@rel_path, module=@module, title=@title, order_index=@order_index,
      module_order=@module_order, size_bytes=@size_bytes, mtime=@mtime, container=@container,
      playable=@playable, missing=0,
      duration_sec=CASE WHEN mtime<>@mtime THEN NULL ELSE duration_sec END,
      thumb_path=CASE WHEN mtime<>@mtime THEN NULL ELSE thumb_path END
    WHERE id=@id
  `);
  const insertLesson = db.prepare(`
    INSERT INTO lessons (id, course_id, rel_path, module, title, order_index, module_order, duration_sec, size_bytes, mtime, container, playable, thumb_path, missing)
    VALUES (@id, @course_id, @rel_path, @module, @title, @order_index, @module_order, NULL, @size_bytes, @mtime, @container, @playable, NULL, 0)
  `);
  const markMissing = db.prepare('UPDATE lessons SET missing=1, order_index=@order_index WHERE id=@id');
  // Upsert por (course_id, rel_path): mantém o ID ESTÁVEL de materiais que já
  // existiam. Apagar+reinserir a cada rescan trocava os ids toda vez — e como a
  // página do curso re-escaneia no mount, os links de material quebravam.
  const upsertMaterial = db.prepare(`
    INSERT INTO materials (id, course_id, module, rel_path, kind, size_bytes)
    VALUES (@id, @course_id, @module, @rel_path, @kind, @size_bytes)
    ON CONFLICT(course_id, rel_path) DO UPDATE SET module=excluded.module, kind=excluded.kind, size_bytes=excluded.size_bytes
  `);
  const deleteMaterial = db.prepare('DELETE FROM materials WHERE course_id=? AND rel_path=?');

  transaction(db, () => {
    for (const m of [...plan.matched, ...plan.relinked]) {
      const d = m.derived;
      updateLesson.run({
        id: m.id, rel_path: d.relPath, module: d.module, title: d.title, order_index: d.orderIndex,
        module_order: d.moduleOrder, size_bytes: d.sizeBytes, mtime: d.mtime, container: d.container,
        playable: d.playable ? 1 : 0,
      });
    }
    for (const a of plan.added) {
      const d = a.derived;
      insertLesson.run({
        id: randomUUID(), course_id: courseId, rel_path: d.relPath, module: d.module, title: d.title,
        order_index: d.orderIndex, module_order: d.moduleOrder, size_bytes: d.sizeBytes, mtime: d.mtime,
        container: d.container, playable: d.playable ? 1 : 0,
      });
    }
    for (const ms of plan.missing) {
      // ms.orderIndex pode já vir inflado (aula que já estava missing em rescans
      // anteriores) — usar módulo evita que o índice cresça a cada re-scan automático.
      markMissing.run({ id: ms.id, order_index: 100000 + (ms.orderIndex % 100000) });
    }
    // Materiais: preserva ids estáveis (upsert por caminho) e remove só os que
    // sumiram do disco — nada de churn de id a cada rescan.
    const keep = new Set(materials.map((m) => m.relPath));
    for (const em of db.prepare('SELECT rel_path FROM materials WHERE course_id=?').all(courseId) as { rel_path: string }[]) {
      if (!keep.has(em.rel_path)) deleteMaterial.run(courseId, em.rel_path);
    }
    for (const mat of materials) {
      const segs = mat.relPath.split('/');
      upsertMaterial.run({
        id: randomUUID(), course_id: courseId, module: segs.length > 1 ? segs[0] : null,
        rel_path: mat.relPath, kind: mat.kind, size_bytes: mat.sizeBytes,
      });
    }
    // Curso: estrutura, root, last_scanned, poster
    db.prepare('UPDATE courses SET structure=@structure, last_scanned_at=@now, root_path=@root WHERE id=@id').run({
      structure: plan.structure, now, root: targetPath, id: courseId,
    });
    const posterOk = course.poster_lesson_id
      ? (db.prepare('SELECT missing FROM lessons WHERE id=?').get(course.poster_lesson_id) as any)
      : null;
    if (!posterOk || posterOk.missing) {
      const first = db.prepare('SELECT id FROM lessons WHERE course_id=? AND missing=0 ORDER BY order_index LIMIT 1').get(courseId) as any;
      db.prepare('UPDATE courses SET poster_lesson_id=? WHERE id=?').run(first?.id ?? null, courseId);
    }
  });

  return {
    matched: plan.matched.length,
    relinked: plan.relinked.length,
    missing: plan.missing.length,
    added: plan.added.length,
    structureChanged: course.structure !== plan.structure,
  };
}
