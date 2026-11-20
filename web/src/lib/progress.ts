const memory = new Map<string, string>();
const fallback = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v); },
  removeItem: (k: string) => { memory.delete(k); },
};
export function progressStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try { return window.localStorage; } catch { return fallback; }
}
// Uma gravação por aula de cada vez: respostas lentas não fazem uma posição
// antiga sobrescrever uma pausa recente. A cópia local só sai após confirmação.
export interface ProgressSnapshot {
  position_sec: number; furthest_sec: number; duration_sec: number | null;
  savedAt: string;
}
const key = (id: string) => `learnflix.progress.pending.${id}`;
export function readPending(storage: Pick<Storage, 'getItem'>, id: string): ProgressSnapshot | null {
  try {
    const v = JSON.parse(storage.getItem(key(id)) ?? 'null') as ProgressSnapshot | null;
    return v && Number.isFinite(v.position_sec) && v.position_sec >= 0
      && Number.isFinite(v.furthest_sec) && v.furthest_sec >= 0
      && (v.duration_sec === null || (Number.isFinite(v.duration_sec) && v.duration_sec > 0))
      && typeof v.savedAt === 'string' && Number.isFinite(Date.parse(v.savedAt)) ? v : null;
  } catch { return null; }
}
export function rememberProgress(storage: Pick<Storage, 'setItem'>, id: string, snapshot: ProgressSnapshot): void {
  try { storage.setItem(key(id), JSON.stringify(snapshot)); } catch { /* Modo privado ou armazenamento cheio: o servidor ainda recebe. */ }
}
export function acknowledgeProgress(storage: Pick<Storage, 'getItem' | 'removeItem'>, id: string, snapshot: ProgressSnapshot): void {
  try {
    const current = readPending(storage, id);
    if (current && JSON.stringify(current) === JSON.stringify(snapshot)) storage.removeItem(key(id));
  } catch { /* Sem acesso ao armazenamento. */ }
}
export function resumeSnapshot(pending: ProgressSnapshot | null, serverUpdatedAt?: string | null): ProgressSnapshot | null {
  return pending && (!serverUpdatedAt || Date.parse(pending.savedAt) > Date.parse(serverUpdatedAt)) ? pending : null;
}
interface PendingSave {
  send: () => Promise<void>;
  resolve: (() => void)[];
  reject: ((e: unknown) => void)[];
}
const pending = new Map<string, PendingSave>();
const running = new Set<string>();
export function queueProgress(id: string, send: () => Promise<void>): Promise<void> {
  const promise = new Promise<void>((resolve, reject) => {
    const previous = pending.get(id);
    pending.set(id, { send, resolve: [...(previous?.resolve ?? []), resolve], reject: [...(previous?.reject ?? []), reject] });
  });
  if (!running.has(id)) {
    running.add(id);
    void (async () => {
      while (pending.has(id)) {
        const job = pending.get(id)!;
        pending.delete(id);
        try { await job.send(); job.resolve.forEach(resolve => resolve()); }
        catch (error) { job.reject.forEach(reject => reject(error)); }
      }
      running.delete(id);
    })();
  }
  return promise;
}
