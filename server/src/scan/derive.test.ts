import { describe, it, expect } from 'vitest';
import { naturalCompare, cleanTitle, deriveCourse, type ScannedFile } from './derive';

const f = (relPath: string): ScannedFile => ({ relPath, sizeBytes: 10, mtime: 1 });

describe('naturalCompare', () => {
  it('ordena números naturalmente (1,2,10)', () => {
    const arr = ['10 - z.mp4', '2 - b.mp4', '1 - a.mp4'].sort(naturalCompare);
    expect(arr).toEqual(['1 - a.mp4', '2 - b.mp4', '10 - z.mp4']);
  });
});

describe('cleanTitle', () => {
  it('remove extensão e tidy de separadores', () => {
    expect(cleanTitle('01_Introducao-ao_curso.mp4')).toBe('01 Introducao-ao curso');
  });
});

describe('deriveCourse', () => {
  it('detecta flat e ordena por nome natural', () => {
    const d = deriveCourse([f('10 - fim.mp4'), f('2 - meio.mp4'), f('1 - inicio.mp4')]);
    expect(d.structure).toBe('flat');
    expect(d.lessons.map((l) => l.orderIndex)).toEqual([0, 1, 2]);
    expect(d.lessons.map((l) => l.relPath)).toEqual(['1 - inicio.mp4', '2 - meio.mp4', '10 - fim.mp4']);
    expect(d.lessons.every((l) => l.module === null)).toBe(true);
  });

  it('detecta módulos pelo 1º nível e mantém order_index global', () => {
    const d = deriveCourse([
      f('02 - Modulo B/02 - b2.mp4'),
      f('01 - Modulo A/02 - a2.mp4'),
      f('01 - Modulo A/01 - a1.mp4'),
      f('02 - Modulo B/01 - b1.mp4'),
    ]);
    expect(d.structure).toBe('modules');
    expect(d.lessons.map((l) => l.relPath)).toEqual([
      '01 - Modulo A/01 - a1.mp4',
      '01 - Modulo A/02 - a2.mp4',
      '02 - Modulo B/01 - b1.mp4',
      '02 - Modulo B/02 - b2.mp4',
    ]);
    expect(d.lessons.map((l) => l.orderIndex)).toEqual([0, 1, 2, 3]);
    expect(d.lessons.map((l) => l.module)).toEqual([
      '01 - Modulo A', '01 - Modulo A', '02 - Modulo B', '02 - Modulo B',
    ]);
    expect(d.lessons.map((l) => l.moduleOrder)).toEqual([0, 0, 1, 1]);
  });

  it('marca playable por extensão', () => {
    const d = deriveCourse([f('a.mp4'), f('b.mkv')]);
    const byPath = Object.fromEntries(d.lessons.map((l) => [l.relPath, l.playable]));
    expect(byPath['a.mp4']).toBe(true);
    expect(byPath['b.mkv']).toBe(false);
  });
});
