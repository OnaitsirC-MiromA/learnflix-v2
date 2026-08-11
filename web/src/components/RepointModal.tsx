import type { RepointSummary } from '../api/client';

export default function RepointModal({
  courseTitle,
  targetPath,
  summary,
  busy,
  onApply,
  onCancel,
}: {
  courseTitle: string;
  targetPath: string;
  summary: RepointSummary;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-neutral-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 font-medium">Re-apontar "{courseTitle}"</div>
        <div className="mb-4 truncate text-xs text-neutral-500">para {targetPath}</div>
        <ul className="mb-4 space-y-1 text-sm">
          <li className="text-green-400">✓ {summary.matched} casadas (progresso mantido)</li>
          {summary.relinked > 0 && <li className="text-blue-300">↻ {summary.relinked} re-vinculadas por nome</li>}
          {summary.missing > 0 && <li className="text-amber-300">⚠ {summary.missing} não encontradas</li>}
          {summary.added > 0 && <li className="text-neutral-300">＋ {summary.added} novas</li>}
        </ul>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {busy ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
