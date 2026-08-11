import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { PLAYABLE_EXTS } from '../scan/derive';
import { createCourseFromPath } from '../scan/scan-course';
import { getAllowedRootsExtra } from '../routes/settings';
import { matchCourse } from './identify';
import { mergeProgress } from './merge';
import type { ExportedCourse, ExportedLesson, LibraryExport, ProgressState } from './format';

// O arquivo de export não carrega fatos do disco (tamanho, mtime), porque eles só
// valem na máquina de origem. Uma aula importada sem a pasta por perto nasce com
// o que dá para afirmar a partir do nome dela.
function doNomeDoArquivo(l: ExportedLesson): { container: string; playable: number } {
  const ext = path.extname(l.relPath).toLowerCase();
  return { container: ext.replace('.', ''), playable: PLAYABLE_EXTS.has(ext) ? 1 : 0 };
}

function doBanco(row: any): ProgressState {
  return {
    positionSec: row.position_sec,
    furthestSec: row.furthest_sec,
    durationSec: row.duration_sec,
    completed: !!row.completed,
    completedAt: row.completed_at,
    autoCompleted: !!row.auto_completed,
    updatedAt: row.updated_at,
  };
}

function pastaExiste(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Campos em inglês para acompanhar os DTOs que já existem (ver BatchImportResult
// no cliente), ainda que o código e os comentários sejam em português.
export interface ImportPlan {
  /** Cursos que serão criados. */
  created: number;
  /** Cursos que já existem aqui e terão o progresso fundido. */
  merged: number;
  missingFolder: number;
  /** Nomes, não só contagens: "1 pasta não encontrada" sozinho não diz qual. */
  missingFolderTitles: string[];
  collectionsCreated: number;
  lessonsWithProgress: number;
}

/**
 * Diz o que um import faria, sem fazer nada.
 *
 * Existe para a pessoa confirmar de olhos abertos — mexer em progresso sempre
 * pergunta antes, como o reset já faz. Usa exatamente as mesmas regras de
 * reconhecimento que o applyImport, para a prévia não prometer uma coisa e a
 * importação fazer outra.
 */
export function planImport(db: Database.Database, data: LibraryExport): ImportPlan {
  const colecaoPorNome = db.prepare('SELECT id FROM collections WHERE lower(trim(name)) = lower(trim(?))');

  const plano: ImportPlan = {
    created: 0,
    merged: 0,
    missingFolder: 0,
    missingFolderTitles: [],
    collectionsCreated: 0,
    lessonsWithProgress: 0,
  };

  for (const col of data.collections) {
    if (!colecaoPorNome.get(col.name)) plano.collectionsCreated++;
  }

  // Mesma trava do applyImport, para a prévia não prometer "1 curso existente"
  // quando a importação vai criar dois.
  const reivindicados = new Set<string>();

  for (const c of data.courses) {
    const candidato = matchCourse(db, c);
    const funde = Boolean(candidato && !reivindicados.has(candidato));
    if (funde) {
      reivindicados.add(candidato!);
      plano.merged++;
    } else {
      plano.created++;
    }

    // Só alarma sobre pasta faltante quem entra como curso NOVO. Um curso
    // reconhecido pela impressão digital já tem pasta boa aqui — o caminho que
    // veio no arquivo é de outra máquina e não interessa mais. Avisar nesse caso
    // assustaria à toa, e sobre um curso que está inteiro.
    if (!funde && !pastaExiste(c.rootPath)) {
      plano.missingFolder++;
      plano.missingFolderTitles.push(c.title);
    }

    plano.lessonsWithProgress += c.lessons.filter((l) => l.progress).length;
  }

  return plano;
}

/**
 * Aplica um arquivo de export sobre o banco, numa transação só.
 *
 * O import é SEMPRE aditivo: nada que já está aqui é apagado ou rebaixado. Curso
 * que já existe é reaproveitado em vez de duplicado, progresso é fundido pela
 * regra do mais avançado, e escolhas locais (capa, biblioteca, título renomeado)
 * têm precedência sobre as do arquivo — quem está na máquina decidiu por último.
 */
export function applyImport(db: Database.Database, data: LibraryExport): void {
  const now = new Date().toISOString();

  const insertCourse = db.prepare(`
    INSERT INTO courses (id, title, root_path, structure, archived, sort_index, poster_lesson_id, collection_id, created_at, updated_at, last_scanned_at)
    VALUES (@id, @title, @root_path, @structure, @archived, @sort_index, NULL, NULL, @now, @now, NULL)
  `);
  const insertLesson = db.prepare(`
    INSERT INTO lessons (id, course_id, rel_path, module, title, order_index, module_order, duration_sec, size_bytes, mtime, container, playable, thumb_path, missing)
    VALUES (@id, @course_id, @rel_path, @module, @title, @order_index, @module_order, @duration_sec, 0, 0, @container, @playable, NULL, 1)
  `);
  const ajustaMetadados = db.prepare('UPDATE courses SET title=?, archived=?, sort_index=? WHERE id=?');
  const idDaAula = db.prepare('SELECT id FROM lessons WHERE course_id=? AND rel_path=?');
  const proximaOrdem = db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM lessons WHERE course_id=?');
  const progressoLocal = db.prepare('SELECT * FROM progress WHERE lesson_id=?');
  const gravaProgresso = db.prepare(`
    INSERT INTO progress (lesson_id, position_sec, furthest_sec, duration_sec, completed, completed_at, auto_completed, updated_at)
    VALUES (@lesson_id, @position_sec, @furthest_sec, @duration_sec, @completed, @completed_at, @auto_completed, @updated_at)
    ON CONFLICT(lesson_id) DO UPDATE SET
      position_sec   = excluded.position_sec,
      furthest_sec   = excluded.furthest_sec,
      duration_sec   = excluded.duration_sec,
      completed      = excluded.completed,
      completed_at   = excluded.completed_at,
      auto_completed = excluded.auto_completed,
      updated_at     = excluded.updated_at
  `);
  const colecaoPorNome = db.prepare('SELECT id FROM collections WHERE lower(trim(name)) = lower(trim(?))');
  const insertCollection = db.prepare('INSERT INTO collections (id, name, created_at, sort_index) VALUES (?, ?, ?, ?)');
  const poeNaColecao = db.prepare('UPDATE courses SET collection_id=? WHERE id=? AND collection_id IS NULL');
  const defineCapa = db.prepare('UPDATE courses SET poster_lesson_id=? WHERE id=?');
  const insertCourseRoot = db.prepare(
    'INSERT INTO course_roots (id, path, created_at, last_checked_at) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO NOTHING',
  );
  const gravaSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  );

  const inserirAula = (courseId: string, l: ExportedLesson, orderIndex: number): void => {
    insertLesson.run({
      id: randomUUID(),
      course_id: courseId,
      rel_path: l.relPath,
      module: l.module,
      title: l.title,
      order_index: orderIndex,
      module_order: l.moduleOrder,
      duration_sec: l.durationSec,
      ...doNomeDoArquivo(l),
    });
  };

  // Sem a pasta por perto não dá para confirmar que os vídeos existem: as aulas
  // entram marcadas como ausentes, e o "Re-apontar pasta…" as reata depois.
  const criarSemPasta = (c: ExportedCourse): string => {
    const courseId = randomUUID();
    insertCourse.run({
      id: courseId,
      title: c.title,
      root_path: c.rootPath,
      structure: c.structure,
      archived: c.archived ? 1 : 0,
      sort_index: c.sortIndex,
      now,
    });
    for (const l of c.lessons) inserirAula(courseId, l, l.orderIndex);
    return courseId;
  };

  // Com a pasta à mão, o disco é a fonte da verdade: o scan normal acha até as
  // aulas que apareceram depois do export. Só o que é escolha da pessoa (título
  // renomeado, arquivado, posição na estante) vem do arquivo.
  const criarComScan = (c: ExportedCourse): string => {
    const courseId = createCourseFromPath(db, c.rootPath);
    ajustaMetadados.run(c.title, c.archived ? 1 : 0, c.sortIndex, courseId);
    return courseId;
  };

  const tx = db.transaction(() => {
    // Biblioteca é um rótulo que a pessoa deu, não um id: duas máquinas com uma
    // "Programação" cada têm a MESMA biblioteca, ainda que os ids não batam.
    const idLocalDaColecao = new Map<string, string>();
    for (const col of data.collections) {
      const local = colecaoPorNome.get(col.name) as { id: string } | undefined;
      if (local) {
        idLocalDaColecao.set(col.id, local.id);
        continue;
      }
      const novoId = randomUUID();
      insertCollection.run(novoId, col.name, col.createdAt, col.sortIndex);
      idLocalDaColecao.set(col.id, novoId);
    }

    // Um curso local só pode ser reivindicado uma vez por importação. Sem isso,
    // dois cursos diferentes do arquivo com a mesma cara — uma aula só, mesmo
    // nome de arquivo — casariam com o mesmo curso daqui, e o progresso de um
    // vazaria para o outro. Cursos recém-criados entram na lista pelo mesmo
    // motivo: o segundo do arquivo não pode casar com o que o primeiro criou.
    const reivindicados = new Set<string>();

    for (const c of data.courses) {
      // Curso que já existe aqui é reaproveitado, nunca duplicado: importar duas
      // vezes o mesmo arquivo tem de dar no mesmo que importar uma.
      const candidato = matchCourse(db, c);
      const jaExiste = candidato && !reivindicados.has(candidato) ? candidato : null;
      const courseId = jaExiste ?? (pastaExiste(c.rootPath) ? criarComScan(c) : criarSemPasta(c));
      reivindicados.add(courseId);

      for (const l of c.lessons) {
        let aula = idDaAula.get(courseId, l.relPath) as { id: string } | undefined;
        if (!aula) {
          // Aula que o arquivo conhece e esta máquina não: o vídeo pode ter sido
          // apagado daqui ou estar num disco desconectado. Descartá-la jogaria
          // fora justamente o progresso que o import promete guardar.
          inserirAula(courseId, l, (proximaOrdem.get(courseId) as { n: number }).n);
          aula = idDaAula.get(courseId, l.relPath) as { id: string };
        }

        if (!l.progress) continue;
        const local = progressoLocal.get(aula.id) as any;
        const fundido = mergeProgress(local ? doBanco(local) : null, l.progress);
        if (!fundido) continue;

        gravaProgresso.run({
          lesson_id: aula.id,
          position_sec: fundido.positionSec,
          furthest_sec: fundido.furthestSec,
          duration_sec: fundido.durationSec,
          completed: fundido.completed ? 1 : 0,
          completed_at: fundido.completedAt,
          auto_completed: fundido.autoCompleted ? 1 : 0,
          updated_at: fundido.updatedAt,
        });
      }

      // Só entra em biblioteca quem ainda não está em nenhuma: se a pessoa
      // organizou de outro jeito nesta máquina, foi ela quem decidiu por último.
      const colecaoLocal = c.collectionId ? idLocalDaColecao.get(c.collectionId) : undefined;
      if (colecaoLocal) poeNaColecao.run(colecaoLocal, courseId);

      // A capa vem do arquivo apenas em curso novo — num que já existia aqui, a
      // escolha local prevalece.
      if (!jaExiste && c.posterLessonRelPath) {
        const capa = idDaAula.get(courseId, c.posterLessonRelPath) as { id: string } | undefined;
        if (capa) defineCapa.run(capa.id, courseId);
      }
    }

    for (const r of data.courseRoots) {
      insertCourseRoot.run(randomUUID(), r.path, r.createdAt, r.lastCheckedAt);
    }

    // União, não substituição: as raízes liberadas aqui continuam liberadas.
    const raizes = [...new Set([...getAllowedRootsExtra(db), ...data.settings.allowedRootsExtra])];
    if (raizes.length) gravaSetting.run('allowed_roots_extra', JSON.stringify(raizes));
  });
  tx();
}
