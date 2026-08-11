import { describe, it, expect } from 'vitest';
import { planReconcile, type ExistingLesson } from './reconcile';
import type { DerivedLesson } from './derive';

const ex = (id: string, relPath: string, orderIndex = 0): ExistingLesson => ({ id, rel_path: relPath, mtime: 1, order_index: orderIndex });
const dv = (relPath: string): DerivedLesson => ({
  relPath, module: relPath.includes('/') ? relPath.split('/')[0] : null,
  title: relPath, orderIndex: 0, moduleOrder: 0, container: 'mp4', playable: true, sizeBytes: 10, mtime: 2,
});

describe('planReconcile', () => {
  it('mover pasta: tudo casa por rel_path, nada perdido', () => {
    const p = planReconcile([ex('L1', 'a.mp4'), ex('L2', 'b.mp4')], [dv('a.mp4'), dv('b.mp4')], 'flat');
    expect(p.matched.map((m) => m.id).sort()).toEqual(['L1', 'L2']);
    expect(p.missing).toHaveLength(0);
    expect(p.added).toHaveLength(0);
  });

  it('renomear pasta-mãe: re-vincula por basename único', () => {
    const p = planReconcile([ex('L1', 'Velho/a.mp4'), ex('L2', 'Velho/b.mp4')], [dv('Novo/a.mp4'), dv('Novo/b.mp4')], 'modules');
    expect(p.relinked.map((r) => r.id).sort()).toEqual(['L1', 'L2']);
    expect(p.relinked.find((r) => r.id === 'L1')!.derived.relPath).toBe('Novo/a.mp4');
    expect(p.missing).toHaveLength(0);
    expect(p.added).toHaveLength(0);
  });

  it('removido → missing; novo → added', () => {
    const p = planReconcile([ex('L1', 'a.mp4'), ex('L2', 'c.mp4', 5)], [dv('a.mp4'), dv('d.mp4')], 'flat');
    expect(p.matched.map((m) => m.id)).toEqual(['L1']);
    expect(p.missing).toEqual([{ id: 'L2', orderIndex: 5 }]);
    expect(p.added.map((a) => a.derived.relPath)).toEqual(['d.mp4']);
  });

  it('basename ambíguo não re-vincula', () => {
    const p = planReconcile([ex('L1', 'X/a.mp4'), ex('L2', 'Y/a.mp4')], [dv('Z/a.mp4')], 'modules');
    expect(p.relinked).toHaveLength(0);
    expect(p.missing.map((m) => m.id).sort()).toEqual(['L1', 'L2']);
    expect(p.added).toHaveLength(1);
  });
});
