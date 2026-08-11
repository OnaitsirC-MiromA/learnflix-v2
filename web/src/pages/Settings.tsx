import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ImportPlan } from '../api/client';
import { getPref, setPref } from '../lib/prefs';
import DirPicker from '../components/DirPicker';
import TextField from '../components/TextField';
import ConfirmDialog from '../components/ConfirmDialog';
import Banner from '../components/Banner';
import { ArrowLeft, Download, Upload } from '../components/icons';

const plural = (n: number) => (n === 1 ? '' : 's');

// A prévia é o momento em que a pessoa decide. Lista item a item em vez de uma
// frase corrida, e diz o que acontece com cada grupo — principalmente com os
// cursos que já existem, que é onde mora o medo de perder progresso.
function PreviaDoImport({ plan }: { plan: ImportPlan }) {
  const nada = plan.created === 0 && plan.merged === 0 && plan.collectionsCreated === 0;
  if (nada) return <>Este arquivo não traz nada que você já não tenha. Importar não mudaria nada.</>;

  return (
    <ul className="space-y-1.5">
      {plan.created > 0 && (
        <li>
          <strong className="text-neutral-200">{plan.created}</strong> curso{plural(plan.created)} novo
          {plural(plan.created)}
        </li>
      )}
      {plan.merged > 0 && (
        <li>
          <strong className="text-neutral-200">{plan.merged}</strong> já existe{plan.merged === 1 ? '' : 'm'} aqui — fica
          o progresso mais avançado dos dois, e aula concluída não volta atrás
        </li>
      )}
      {plan.collectionsCreated > 0 && (
        <li>
          <strong className="text-neutral-200">{plan.collectionsCreated}</strong> biblioteca
          {plural(plan.collectionsCreated)} nova{plural(plan.collectionsCreated)}
        </li>
      )}
      {plan.missingFolder > 0 && (
        <li>
          <strong className="text-neutral-200">{plan.missingFolder}</strong> com a pasta não encontrada nesta máquina (
          {plan.missingFolderTitles.slice(0, 3).join(', ')}
          {plan.missingFolderTitles.length > 3 ? '…' : ''}) — entra{plan.missingFolder === 1 ? '' : 'm'} assim mesmo, com
          o progresso; depois use “Re-apontar pasta…” no menu do curso
        </li>
      )}
    </ul>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: info } = useQuery({ queryKey: ['info'], queryFn: api.getInfo });
  const [picking, setPicking] = useState(false);
  const [countdown, setCountdown] = useState<number>(() => getPref('player.countdownSeconds', 20));
  const [autoplay, setAutoplay] = useState<boolean>(() => getPref('player.autoplay', true));
  const [confirmReset, setConfirmReset] = useState<null | 'progress' | 'library'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  // Guarda o arquivo junto com a prévia: confirmar precisa mandar exatamente o
  // mesmo conteúdo que gerou aquelas contagens.
  const [previa, setPrevia] = useState<{ plan: ImportPlan; data: unknown } | null>(null);
  const [importando, setImportando] = useState(false);

  const escolherArquivo = async (file: File) => {
    setNotice(null);
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setNotice('Não deu para ler esse arquivo — ele não é um JSON válido.');
      return;
    }
    try {
      setPrevia({ plan: await api.importPreview(data), data });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Não deu para ler esse arquivo.');
    }
  };

  const doImport = async () => {
    if (!previa) return;
    const { data } = previa;
    setPrevia(null);
    setImportando(true);
    try {
      const r = await api.importLibrary(data);
      qc.invalidateQueries();
      const partes = [
        r.created > 0 ? `${r.created} curso${plural(r.created)} novo${plural(r.created)}` : null,
        r.merged > 0 ? `${r.merged} atualizado${plural(r.merged)}` : null,
      ].filter(Boolean);
      setNotice(
        partes.length
          ? `Importação concluída: ${partes.join(', ')}. Nada do que você já tinha foi perdido.`
          : 'Importação concluída — esse arquivo não trazia nada de novo.',
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Falha ao importar. Tente novamente.');
    } finally {
      setImportando(false);
    }
  };

  const doResetProgress = async () => {
    setConfirmReset(null);
    try {
      const r = await api.resetAllProgress();
      qc.invalidateQueries({ queryKey: ['courses'] });
      setNotice(`Progresso zerado em toda a biblioteca (${r.deleted} registro${r.deleted === 1 ? '' : 's'}).`);
    } catch {
      setNotice('Falha ao zerar o progresso. Tente novamente.');
    }
  };

  const doResetLibrary = async () => {
    setConfirmReset(null);
    try {
      const r = await api.resetLibrary();
      qc.invalidateQueries();
      setNotice(`Biblioteca zerada: ${r.courses} curso${r.courses === 1 ? '' : 's'} removido${r.courses === 1 ? '' : 's'}. Os vídeos no disco estão intactos.`);
    } catch {
      setNotice('Falha ao zerar a biblioteca. Tente novamente.');
    }
  };

  const roots = data?.allowedRootsExtra ?? [];
  const saveRoots = async (next: string[]) => {
    await api.patchSettings({ allowedRootsExtra: next });
    qc.invalidateQueries({ queryKey: ['settings'] });
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200">
        <ArrowLeft size={16} /> Biblioteca
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold tracking-tight">Configurações</h1>

      {notice && (
        <div className="mb-6">
          <Banner tone="info">{notice}</Banner>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold text-neutral-300">Pastas-raiz permitidas</h2>
        <p className="mb-3 text-sm text-neutral-500">Pastas onde o seletor pode navegar (além das definidas no servidor).</p>
        <div className="space-y-1">
          {roots.length === 0 && <div className="text-sm text-neutral-600">Nenhuma raiz extra.</div>}
          {roots.map((r) => (
            <div key={r} className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2 text-sm">
              <span className="truncate">{r}</span>
              <button
                className="min-h-[44px] rounded px-3 text-neutral-400 hover:text-red-400"
                onClick={() => void saveRoots(roots.filter((x) => x !== r))}
              >
                Remover
              </button>
            </div>
          ))}
        </div>
        <button
          className="mt-3 min-h-[44px] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500"
          onClick={() => setPicking(true)}
        >
          + Adicionar pasta-raiz
        </button>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">Reprodução</h2>
        <label className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2 text-sm">
          Segundos do contador de fim
          <TextField
            type="number"
            min={3}
            max={120}
            value={countdown}
            onChange={(e) => { const n = Number(e.target.value); setCountdown(n); setPref('player.countdownSeconds', n); }}
            className="w-20 text-right"
          />
        </label>
        <label className="mt-2 flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2 text-sm">
          Avançar automaticamente ao fim (padrão)
          <span className="grid h-11 w-11 place-items-center">
            <input
              type="checkbox"
              checked={autoplay}
              onChange={(e) => { setAutoplay(e.target.checked); setPref('player.autoplay', e.target.checked); }}
              className="h-4 w-4 accent-blue-600"
            />
          </span>
        </label>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold text-neutral-300">Backup e migração</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Um arquivo com seus cursos, bibliotecas e todo o progresso. Serve de backup e para levar tudo a outro
          computador. Os vídeos não vão junto — só o que você construiu em cima deles.
        </p>
        <div className="space-y-2">
          <a
            href={api.exportLibraryUrl}
            className="flex w-full items-center gap-3 rounded-lg bg-neutral-900 px-3 py-3 text-sm no-underline hover:bg-neutral-800"
          >
            <Download size={18} className="shrink-0 text-neutral-400" />
            <span>
              Exportar biblioteca
              <span className="mt-0.5 block text-xs text-neutral-500">
                Baixa um arquivo .json com a data de hoje. Guarde-o onde quiser.
              </span>
            </span>
          </a>
          <button
            type="button"
            disabled={importando}
            onClick={() => arquivoRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg bg-neutral-900 px-3 py-3 text-left text-sm hover:bg-neutral-800 disabled:opacity-60"
          >
            <Upload size={18} className="shrink-0 text-neutral-400" />
            <span>
              {importando ? 'Importando…' : 'Importar arquivo…'}
              <span className="mt-0.5 block text-xs text-neutral-500">
                Mostra o que vai acontecer antes de confirmar. A importação só soma: nada do que está aqui é apagado.
              </span>
            </span>
          </button>
          <input
            ref={arquivoRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Zera o valor: sem isso, escolher o MESMO arquivo de novo (depois
              // de um erro, por exemplo) não dispara change nenhum.
              e.target.value = '';
              if (file) void escolherArquivo(file);
            }}
          />
        </div>
      </section>

      {/* Reset é decisão pesada: fica no fim, visualmente separado, sempre com confirmação. */}
      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold text-red-400">Zona de perigo</h2>
        <p className="mb-3 text-sm text-neutral-500">Ações irreversíveis — os vídeos no disco nunca são tocados.</p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setConfirmReset('progress')}
            className="block w-full rounded-lg bg-neutral-900 px-3 py-3 text-left text-sm hover:bg-neutral-800"
          >
            Zerar progresso de todos os cursos
            <span className="mt-0.5 block text-xs text-neutral-500">Posições e aulas concluídas voltam a zero; cursos e coleções permanecem.</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmReset('library')}
            className="block w-full rounded-lg border border-red-900/60 bg-neutral-900 px-3 py-3 text-left text-sm text-red-400 hover:bg-red-950/40"
          >
            Apagar toda a biblioteca…
            <span className="mt-0.5 block text-xs text-neutral-500">Remove todos os cursos, progresso e coleções — recomeço do zero.</span>
          </button>
        </div>
      </section>

      {previa && (
        <ConfirmDialog
          title="Importar esta biblioteca?"
          message={<PreviaDoImport plan={previa.plan} />}
          confirmLabel="Importar"
          onConfirm={() => void doImport()}
          onCancel={() => setPrevia(null)}
        />
      )}
      {confirmReset === 'progress' && (
        <ConfirmDialog
          title="Zerar o progresso de todos os cursos?"
          message="Posições de reprodução e aulas concluídas de TODA a biblioteca voltam a zero. Cursos, coleções e capas permanecem. Não dá para desfazer."
          confirmLabel="Zerar progresso"
          danger
          onConfirm={doResetProgress}
          onCancel={() => setConfirmReset(null)}
        />
      )}
      {confirmReset === 'library' && (
        <ConfirmDialog
          title="Apagar TODA a biblioteca?"
          message="Remove todos os cursos, progresso, coleções e miniaturas do banco — recomeço do zero. Os arquivos de vídeo no disco não são tocados. Não dá para desfazer."
          confirmLabel="Apagar tudo"
          danger
          onConfirm={doResetLibrary}
          onCancel={() => setConfirmReset(null)}
        />
      )}

      {/* Versão do build — para saber quando houve uma atualização de verdade. */}
      <footer className="mt-10 border-t border-neutral-900 pt-4 text-xs text-neutral-600">
        Learnflix · versão {info?.version ?? '—'}
      </footer>

      {picking && (
        <DirPicker
          onClose={() => setPicking(false)}
          onPick={(p) => { void saveRoots([...roots, p]); setPicking(false); }}
        />
      )}
    </div>
  );
}
