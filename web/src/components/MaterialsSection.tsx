import { useMemo, useState } from 'react';
import { materialUrl, type MaterialDTO } from '../api/client';

// Materiais adicionais do curso (pdf/zip/imagem/doc), agrupados por módulo/pasta.
// Acesso apenas: abrir (PDF no leitor embutido, imagem no visualizador) e baixar
// — nunca toca no arquivo no disco.

function fmtSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const KIND_LABEL: Record<MaterialDTO['kind'], string> = {
  pdf: 'PDF', zip: 'ZIP', archive: 'ARQ', doc: 'DOC', image: 'IMG', other: 'ARQ',
};

type Viewer = { kind: 'pdf' | 'image'; id: string; name: string } | null;

export default function MaterialsSection({ materials }: { materials: MaterialDTO[] }) {
  const [viewer, setViewer] = useState<Viewer>(null);

  // Agrupa por módulo (null = raiz do curso), preservando a ordem recebida.
  const groups = useMemo(() => {
    const map = new Map<string, MaterialDTO[]>();
    for (const m of materials) {
      const key = m.module ?? '';
      const arr = map.get(key);
      if (arr) arr.push(m);
      else map.set(key, [m]);
    }
    return [...map.entries()];
  }, [materials]);

  if (materials.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-neutral-300">Materiais adicionais</h2>
      <p className="mb-3 text-sm text-neutral-500">
        {materials.length} arquivo{materials.length === 1 ? '' : 's'} do curso — PDFs, imagens e anexos. Abra aqui ou baixe.
      </p>

      <div className="space-y-6">
        {groups.map(([mod, items]) => (
          <div key={mod || '__root__'}>
            {mod && <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">{mod}</h3>}
            <div className="space-y-1.5">
              {items.map((m) => {
                const canView = m.kind === 'pdf' || m.kind === 'image';
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg bg-neutral-900 px-3 py-2">
                    <span className="grid h-9 w-11 shrink-0 place-items-center rounded bg-neutral-800 text-[10px] font-semibold tracking-wide text-neutral-400">
                      {KIND_LABEL[m.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-neutral-200">{m.name}</div>
                      <div className="text-xs text-neutral-500">{fmtSize(m.sizeBytes)}</div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {canView && (
                        <button
                          type="button"
                          onClick={() => setViewer({ kind: m.kind === 'pdf' ? 'pdf' : 'image', id: m.id, name: m.name })}
                          className="min-h-[44px] rounded-lg bg-neutral-800 px-3 text-sm text-neutral-200 hover:bg-neutral-700"
                        >
                          Abrir
                        </button>
                      )}
                      <a
                        href={materialUrl(m.id, true)}
                        download={m.name}
                        className="inline-flex min-h-[44px] items-center rounded-lg bg-neutral-800 px-3 text-sm text-neutral-200 hover:bg-neutral-700"
                      >
                        Baixar
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {viewer && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/90 p-3 sm:p-6" onClick={() => setViewer(null)}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-neutral-200">{viewer.name}</span>
            <div className="flex shrink-0 gap-2">
              <a
                href={materialUrl(viewer.id, true)}
                download={viewer.name}
                onClick={(e) => e.stopPropagation()}
                className="min-h-[44px] rounded-lg bg-neutral-800 px-3 text-sm leading-[44px] text-neutral-200 hover:bg-neutral-700"
              >
                Baixar
              </a>
              <button
                type="button"
                onClick={() => setViewer(null)}
                className="min-h-[44px] rounded-lg bg-neutral-800 px-3 text-sm text-neutral-200 hover:bg-neutral-700"
              >
                Fechar
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
            {viewer.kind === 'pdf' ? (
              <iframe title={viewer.name} src={materialUrl(viewer.id)} className="h-full w-full rounded-lg border-0 bg-white" />
            ) : (
              <div className="grid h-full place-items-center">
                <img src={materialUrl(viewer.id)} alt={viewer.name} className="max-h-full max-w-full rounded-lg object-contain" />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
