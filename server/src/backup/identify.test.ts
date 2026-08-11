import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { matchCourse } from './identify';
import type { ExportedCourse, ExportedLesson } from './format';

function aula(relPath: string): ExportedLesson {
  return { relPath, module: null, title: relPath, orderIndex: 0, moduleOrder: 0, durationSec: null, progress: null };
}

function cursoDoArquivo(over: Partial<ExportedCourse> = {}): ExportedCourse {
  return {
    title: 'Curso',
    rootPath: '/lugar/nenhum',
    structure: 'flat',
    archived: false,
    sortIndex: null,
    collectionId: null,
    posterLessonRelPath: null,
    lessons: [],
    ...over,
  };
}

// Cria um curso real no banco a partir de uma pasta temporária com os vídeos dados.
function cursoLocal(db: any, nome: string, videos: string[]): { id: string; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `id-${nome}-`));
  for (const v of videos) {
    fs.mkdirSync(path.join(root, path.dirname(v)), { recursive: true });
    fs.writeFileSync(path.join(root, v), 'x');
  }
  return { id: createCourseFromPath(db, root), root: path.resolve(root) };
}

describe('matchCourse', () => {
  it('reconhece o curso quando a pasta é exatamente a mesma', () => {
    const db = openDb(':memory:');
    const { id, root } = cursoLocal(db, 'mesmo', ['aula-01.mp4']);

    expect(matchCourse(db, cursoDoArquivo({ rootPath: root }))).toBe(id);

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  // O caso que importa de verdade: exportou no Windows, importou no Mac. O
  // caminho não bate com nada, mas o curso é o mesmo — e reconhecê-lo sozinho
  // poupa a pessoa de re-apontar pasta por pasta.
  it('reconhece o curso que mudou de lugar, pelas aulas que ele tem', () => {
    const db = openDb(':memory:');
    const { id, root } = cursoLocal(db, 'mudou', ['aula-01.mp4', 'aula-02.mp4', 'aula-03.mp4']);

    const doArquivo = cursoDoArquivo({
      rootPath: 'D:\\Cursos\\Rust',
      lessons: ['aula-01.mp4', 'aula-02.mp4', 'aula-03.mp4'].map(aula),
    });

    expect(matchCourse(db, doArquivo)).toBe(id);

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  const dez = Array.from({ length: 10 }, (_, i) => `aula-${String(i + 1).padStart(2, '0')}.mp4`);

  it('casa no limiar: 7 aulas em comum de 10 bastam', () => {
    const db = openDb(':memory:');
    const { id, root } = cursoLocal(db, 'limiar', dez);

    const doArquivo = cursoDoArquivo({ rootPath: '/outro/lugar', lessons: dez.slice(0, 7).map(aula) });

    expect(matchCourse(db, doArquivo)).toBe(id);

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('não casa abaixo do limiar: 6 de 10 é pouco', () => {
    const db = openDb(':memory:');
    const { root } = cursoLocal(db, 'abaixo', dez);

    const doArquivo = cursoDoArquivo({ rootPath: '/outro/lugar', lessons: dez.slice(0, 6).map(aula) });

    expect(matchCourse(db, doArquivo)).toBeNull();

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  // Guarda contra medir "interseção sobre o menor conjunto": por essa conta, um
  // curso de 3 aulas contido num de 30 daria 100% de semelhança e herdaria o
  // progresso do curso errado.
  it('não confunde um curso pequeno com outro grande que o contém', () => {
    const db = openDb(':memory:');
    const { root } = cursoLocal(db, 'grande', dez);

    const doArquivo = cursoDoArquivo({ rootPath: '/outro/lugar', lessons: dez.slice(0, 3).map(aula) });

    expect(matchCourse(db, doArquivo)).toBeNull();

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('entre dois candidatos, fica com o mais parecido', () => {
    const db = openDb(':memory:');
    const parcial = cursoLocal(db, 'parcial', [...dez.slice(0, 8), 'extra-a.mp4', 'extra-b.mp4']);
    const exato = cursoLocal(db, 'exato', dez);

    const doArquivo = cursoDoArquivo({ rootPath: '/outro/lugar', lessons: dez.map(aula) });

    expect(matchCourse(db, doArquivo)).toBe(exato.id);

    fs.rmSync(parcial.root, { recursive: true, force: true });
    fs.rmSync(exato.root, { recursive: true, force: true });
    db.close();
  });

  it('curso sem aula nenhuma no arquivo entra como novo', () => {
    const db = openDb(':memory:');
    const { root } = cursoLocal(db, 'vazio', dez);

    expect(matchCourse(db, cursoDoArquivo({ rootPath: '/outro/lugar', lessons: [] }))).toBeNull();

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });
});
