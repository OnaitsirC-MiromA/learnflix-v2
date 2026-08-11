import type { ReactNode } from 'react';

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  // ReactNode, e não string: a prévia da importação precisa listar o que vai
  // acontecer item a item — uma frase corrida esconderia justamente o detalhe
  // que a pessoa está tentando conferir antes de confirmar.
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // preventDefault além do stopPropagation: o diálogo pode viver DENTRO de um
  // <Link> (ex.: menu ⋯ do card da Biblioteca) — só cortar a propagação React
  // não cancela o default nativo da âncora, e qualquer clique navegaria.
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-xl bg-neutral-900 p-5" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        <div className="mb-1 font-medium">{title}</div>
        <div className="mb-4 text-sm text-neutral-400">{message}</div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3 py-2 text-sm text-white ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
