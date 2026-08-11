import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export default function DirPicker({
  onPick,
  onClose,
  title = 'Escolha a pasta do curso',
  confirmLabel = 'Usar esta pasta',
}: {
  onPick: (path: string) => void;
  onClose: () => void;
  title?: string;
  confirmLabel?: string;
}) {
  const [path, setPath] = useState<string | undefined>(undefined);
  const { data, isLoading } = useQuery({ queryKey: ['browse', path ?? '__roots__'], queryFn: () => api.browse(path) });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-neutral-900 rounded-xl w-full max-w-lg max-h-[85dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-neutral-800">
          <div className="text-sm text-neutral-400">{title}</div>
          <div className="text-xs text-neutral-500 truncate">{data?.path ?? 'Raízes'}</div>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {isLoading && <div className="p-4 text-neutral-500">Carregando…</div>}
          {data?.parent != null && (
            <button className="min-h-[44px] w-full text-left px-3 py-2 rounded hover:bg-neutral-800" onClick={() => setPath(data.parent!)}>📁 ..</button>
          )}
          {data?.dirs.map((d) => (
            <button key={d.path} className="min-h-[44px] w-full text-left px-3 py-2 rounded hover:bg-neutral-800" onClick={() => setPath(d.path)}>
              📁 {d.name}
            </button>
          ))}
          {data && data.dirs.length === 0 && <div className="p-4 text-neutral-600 text-sm">Sem subpastas aqui.</div>}
        </div>
        <div className="p-4 border-t border-neutral-800 flex justify-end gap-2">
          <button className="min-h-[44px] px-3 py-2 text-neutral-400" onClick={onClose}>Cancelar</button>
          <button className="min-h-[44px] px-3 py-2 bg-blue-600 rounded disabled:opacity-40" disabled={!data?.path} onClick={() => data?.path && onPick(data.path)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
