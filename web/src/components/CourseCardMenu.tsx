import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type CourseSummary } from '../api/client';
import { useCollections } from '../api/hooks';
import ConfirmDialog from './ConfirmDialog';
import TextField from './TextField';

type Flow = null | 'sheet' | 'rename' | 'collection' | 'confirmReset' | 'confirmDelete';

// Ações do curso direto do card da Biblioteca, sem entrar no curso. Abre como
// action-sheet centrado (não como dropdown): o card é overflow-hidden e um
// dropdown seria cortado; a folha também funciona melhor no touch.
export default function CourseCardMenu({ course, onNotice }: { course: CourseSummary; onNotice: (m: string) => void }) {
  const qc = useQueryClient();
  const { data: collections } = useCollections();
  const [flow, setFlow] = useState<Flow>(null);
  const [title, setTitle] = useState(course.title);
  const [newColName, setNewColName] = useState('');

  const close = () => setFlow(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['courses'] });
    qc.invalidateQueries({ queryKey: ['course', course.id] });
    qc.invalidateQueries({ queryKey: ['collections'] });
  };

  const doRename = async () => {
    if (!title.trim()) return;
    try {
      await api.patchCourse(course.id, { title: title.trim() });
      invalidate();
      onNotice('Curso renomeado.');
    } catch {
      onNotice('Falha ao renomear. Tente novamente.');
    }
    close();
  };

  const doRescan = async () => {
    close();
    try {
      const res = await api.rescan(course.id);
      if ('status' in res) return onNotice(`"${course.title}": pasta indisponível — se ela mudou de lugar, re-aponte pelo menu.`);
      invalidate();
      onNotice(
        res.added || res.missing || res.relinked
          ? `"${course.title}" atualizado: +${res.added} novas, ${res.missing} faltando.`
          : `"${course.title}": nada mudou.`,
      );
    } catch {
      onNotice('Falha ao re-escanear. Tente novamente.');
    }
  };

  const assignCollection = async (collectionId: string | null) => {
    try {
      await api.patchCourse(course.id, { collectionId });
      invalidate();
      onNotice(collectionId ? 'Curso adicionado à coleção.' : 'Curso removido da coleção.');
    } catch {
      onNotice('Falha na operação. Tente novamente.');
    }
    close();
  };

  const createAndAssign = async () => {
    if (!newColName.trim()) return;
    try {
      const col = await api.createCollection(newColName.trim());
      await api.patchCourse(course.id, { collectionId: col.id });
      invalidate();
      onNotice(`Curso adicionado à nova coleção "${col.name}".`);
    } catch {
      onNotice('Falha na operação. Tente novamente.');
    }
    close();
  };

  const doResetProgress = async () => {
    close();
    try {
      const r = await api.resetCourseProgress(course.id);
      invalidate();
      onNotice(`Progresso de "${course.title}" zerado (${r.deleted} aula${r.deleted === 1 ? '' : 's'}).`);
    } catch {
      onNotice('Falha ao zerar o progresso. Tente novamente.');
    }
  };

  const doArchiveToggle = async () => {
    close();
    try {
      // O card sabe em que aba está pelo próprio dado: sem coleção de contexto extra.
      await api.patchCourse(course.id, { archived: true });
      invalidate();
      onNotice(`"${course.title}" arquivado — está na aba Arquivados.`);
    } catch {
      onNotice('Falha ao arquivar. Tente novamente.');
    }
  };

  const doDelete = async () => {
    close();
    try {
      await api.deleteCourse(course.id);
      invalidate();
      onNotice(`"${course.title}" excluído. Os arquivos no disco não foram tocados.`);
    } catch {
      onNotice('Falha ao excluir. Tente novamente.');
    }
  };

  const sheetItem = 'block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-neutral-800';

  return (
    <>
      <button
        type="button"
        aria-label={`Ações de ${course.title}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setTitle(course.title);
          setFlow('sheet');
        }}
        className="grid h-11 w-11 place-items-center rounded-lg bg-black/50 text-neutral-200 backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 motion-reduce:transition-none"
      >
        ⋯
      </button>

      {flow === 'sheet' && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={(e) => { e.preventDefault(); close(); }}>
          <div className="w-full max-w-xs rounded-xl bg-neutral-900 p-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <div className="truncate px-3 pb-2 pt-2 text-sm font-medium text-neutral-200">{course.title}</div>
            <button type="button" className={sheetItem} onClick={() => setFlow('rename')}>Renomear…</button>
            <button type="button" className={sheetItem} onClick={doRescan}>Re-escanear</button>
            <button type="button" className={sheetItem} onClick={() => { setNewColName(''); setFlow('collection'); }}>Coleção…</button>
            <button type="button" className={sheetItem} onClick={() => setFlow('confirmReset')}>Zerar progresso…</button>
            <button type="button" className={sheetItem} onClick={doArchiveToggle}>Arquivar</button>
            <button type="button" className={`${sheetItem} text-red-400`} onClick={() => setFlow('confirmDelete')}>Excluir…</button>
          </div>
        </div>
      )}

      {flow === 'rename' && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={(e) => { e.preventDefault(); close(); }}>
          <div className="w-full max-w-sm rounded-xl bg-neutral-900 p-5" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <div className="mb-3 font-medium">Renomear curso</div>
            <TextField
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doRename()}
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="min-h-[44px] rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800" onClick={close}>
                Cancelar
              </button>
              <button
                type="button"
                className="min-h-[44px] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-40"
                disabled={!title.trim()}
                onClick={doRename}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {flow === 'collection' && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={(e) => { e.preventDefault(); close(); }}>
          <div className="w-full max-w-sm rounded-xl bg-neutral-900 p-5" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <div className="mb-3 font-medium">Coleção</div>
            {(collections ?? []).length === 0 && (
              <p className="mb-3 text-sm text-neutral-500">Nenhuma coleção ainda — crie a primeira abaixo.</p>
            )}
            {(collections ?? []).length > 0 && (
              <div className="mb-3 max-h-56 space-y-1 overflow-y-auto">
                {(collections ?? []).map((col) => {
                  const current = course.collectionId === col.id;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => void assignCollection(col.id)}
                      className={`flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${current ? 'bg-blue-600/20 text-blue-300' : 'hover:bg-neutral-800'}`}
                    >
                      <span className="truncate">{col.name}</span>
                      {current && <span aria-hidden>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {course.collectionId && (
              <button
                type="button"
                onClick={() => void assignCollection(null)}
                className="mb-3 min-h-[44px] w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
              >
                Remover da coleção
              </button>
            )}
            <div className="flex gap-2">
              <TextField
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createAndAssign()}
                placeholder="Nova coleção"
              />
              <button
                type="button"
                onClick={createAndAssign}
                disabled={!newColName.trim()}
                className="min-h-[44px] shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-40"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {flow === 'confirmReset' && (
        <ConfirmDialog
          title={`Zerar o progresso de "${course.title}"?`}
          message="Posições e aulas concluídas deste curso voltam a zero. As aulas, a capa e a coleção permanecem. Não dá para desfazer."
          confirmLabel="Zerar progresso"
          danger
          onConfirm={doResetProgress}
          onCancel={close}
        />
      )}

      {flow === 'confirmDelete' && (
        <ConfirmDialog
          title={`Excluir "${course.title}"?`}
          message="Remove o curso e todo o progresso definitivamente. Os arquivos de vídeo no disco não são tocados."
          confirmLabel="Excluir"
          danger
          onConfirm={doDelete}
          onCancel={close}
        />
      )}
    </>
  );
}
