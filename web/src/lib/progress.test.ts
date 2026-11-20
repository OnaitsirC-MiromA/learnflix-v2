import { describe, it, expect } from 'vitest';
import { readPending, rememberProgress, acknowledgeProgress, resumeSnapshot, queueProgress, type ProgressSnapshot } from './progress';
const old: ProgressSnapshot = { position_sec: 500, furthest_sec: 900, duration_sec: 1000, savedAt: '2026-11-20T12:00:00Z' };
function storage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string,v: string) => {map.set(k,v);}, removeItem: (k: string) => {map.delete(k);} };
}
describe('progresso pendente', () => {
  it('recupera inclusive retrocesso e separa aulas', () => {
    const s = storage();
    rememberProgress(s,'a',old);
    const recent = { ...old, position_sec: 100, savedAt: '2026-11-20T12:01:00Z' };
    rememberProgress(s,'a',recent);
    expect(resumeSnapshot(readPending(s,'a'),'2026-11-20T12:00:30Z')?.position_sec).toBe(100);
    expect(resumeSnapshot(readPending(s,'a'),'2026-11-20T12:02:00Z')).toBeNull();
    expect(readPending(s,'b')).toBeNull();
    acknowledgeProgress(s,'a',old);
    expect(readPending(s,'a')).toEqual(recent);
    acknowledgeProgress(s,'a',recent);
    expect(readPending(s,'a')).toBeNull();
  });
  it('ordena envios lentos e retoma a fila após falha', async () => {
    const calls: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const first = queueProgress('x', async () => { calls.push(1); await gate; throw new Error('offline'); });
    const caught = first.catch(() => {});
    const second = queueProgress('x', async () => {calls.push(2);});
    await Promise.resolve(); await Promise.resolve();
    expect(calls).toEqual([1]);
    release(); await caught; await second;
    expect(calls).toEqual([1,2]);
  });
  it('agrupa gravações enquanto há envio em andamento e usa a posição mais recente', async () => {
    const calls: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>(r => {release = r;});
    const first = queueProgress('coalesce', async () => {calls.push(1); await gate;});
    const second = queueProgress('coalesce', async () => {calls.push(2);});
    const third = queueProgress('coalesce', async () => {calls.push(3);});
    release(); await Promise.all([first, second, third]);
    expect(calls).toEqual([1,3]);
  });
  it('ignora dados corrompidos e armazenamento indisponível', () => {
    expect(readPending({getItem: () => '{'},'a')).toBeNull();
    expect(readPending({getItem: () => JSON.stringify({...old,position_sec:-1})},'a')).toBeNull();
    expect(() => rememberProgress({setItem: () => {throw new Error('quota');}},'a',old)).not.toThrow();
  });
});
