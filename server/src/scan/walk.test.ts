import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { walkCourseDir, materialKind } from './walk';

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-'));
  fs.mkdirSync(path.join(root, '01 - Mod'), { recursive: true });
  fs.writeFileSync(path.join(root, '01 - Mod', 'a.mp4'), 'x');
  fs.writeFileSync(path.join(root, '01 - Mod', 'slides.pdf'), 'x');
  fs.writeFileSync(path.join(root, 'intro.mkv'), 'x');
  fs.writeFileSync(path.join(root, 'extra.zip'), 'x');
  fs.writeFileSync(path.join(root, '.DS_Store'), 'x'); // deve ser ignorado
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('materialKind', () => {
  it('classifica por extensão', () => {
    expect(materialKind('.pdf')).toBe('pdf');
    expect(materialKind('.zip')).toBe('zip');
    expect(materialKind('.rar')).toBe('archive');
    expect(materialKind('.png')).toBe('image');
    expect(materialKind('.xyz')).toBe('other');
  });
});

describe('walkCourseDir', () => {
  it('separa vídeos e materiais com relPath POSIX, ignora ocultos', () => {
    const r = walkCourseDir(root);
    const videoPaths = r.videos.map((v) => v.relPath).sort();
    expect(videoPaths).toEqual(['01 - Mod/a.mp4', 'intro.mkv']);
    const matPaths = r.materials.map((m) => `${m.relPath}:${m.kind}`).sort();
    expect(matPaths).toEqual(['01 - Mod/slides.pdf:pdf', 'extra.zip:zip']);
    expect(r.videos.every((v) => v.sizeBytes > 0 && v.mtime > 0)).toBe(true);
    expect(r.unreadable).toEqual([]);
  });
});

// Compartilhamentos de rede (SMB) listam nomes que depois não resolvem: o
// readdir devolve o arquivo com isFile() === true, e o stat seguinte responde
// ENOENT. Antes, UM arquivo assim derrubava a importação inteira com HTTP 500 —
// 45 cursos bons perdidos por causa de um.
//
// Um diretório sem permissão de travessia (r sem x) reproduz o mesmo par:
// o readdir lista os filhos, o stat neles falha.
describe('walkCourseDir com arquivo listado que o stat não resolve', () => {
  let raiz: string;
  let semTravessia: string;

  beforeAll(() => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-fantasma-'));
    fs.writeFileSync(path.join(raiz, 'aula boa.mp4'), 'x');
    fs.mkdirSync(path.join(raiz, '02 - Mod'));
    fs.writeFileSync(path.join(raiz, '02 - Mod', 'outra.mp4'), 'x');

    semTravessia = path.join(raiz, '03 - Fantasma');
    fs.mkdirSync(semTravessia);
    fs.writeFileSync(path.join(semTravessia, 'aula fantasma.mp4'), 'x');
    fs.chmodSync(semTravessia, 0o400); // lista os nomes, mas não deixa alcançá-los
  });

  afterAll(() => {
    fs.chmodSync(semTravessia, 0o755);
    fs.rmSync(raiz, { recursive: true, force: true });
  });

  it('não lança: entrega o resto do curso', () => {
    const r = walkCourseDir(raiz);
    expect(r.videos.map((v) => v.relPath).sort()).toEqual(['02 - Mod/outra.mp4', 'aula boa.mp4']);
  });

  it('reporta o que pulou — silêncio aqui viraria aula sumida sem explicação', () => {
    const r = walkCourseDir(raiz);
    expect(r.unreadable).toEqual(['03 - Fantasma/aula fantasma.mp4']);
  });
});

describe('walkCourseDir com pasta ilegível', () => {
  it('pula a pasta, reporta, e não interrompe as irmãs', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-dir-'));
    fs.writeFileSync(path.join(raiz, 'ok.mp4'), 'x');
    const trancada = path.join(raiz, '99 - Trancada');
    fs.mkdirSync(trancada);
    fs.writeFileSync(path.join(trancada, 'dentro.mp4'), 'x');
    fs.chmodSync(trancada, 0o000);

    try {
      const r = walkCourseDir(raiz);
      expect(r.videos.map((v) => v.relPath)).toEqual(['ok.mp4']);
      expect(r.unreadable).toEqual(['99 - Trancada']);
    } finally {
      fs.chmodSync(trancada, 0o755);
      fs.rmSync(raiz, { recursive: true, force: true });
    }
  });
});
