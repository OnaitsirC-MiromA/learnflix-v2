import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type TelegramCatalog } from '../api/client';
import TextField from '../components/TextField';
import { ArrowLeft } from '../components/icons';
import { formatDuration } from '../lib/format';

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function Telegram() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const connection = useQuery({ queryKey: ['telegram-status'], queryFn: api.telegramStatus, retry: false });
  const [link, setLink] = useState('');
  const [preview, setPreview] = useState<{ link: string; catalog: TelegramCatalog } | null>(null);
  const [busy, setBusy] = useState<'preview' | 'add' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const files = preview?.catalog.files ?? [];
  const videos = files.filter((file) => file.video);
  const materials = files.filter((file) => !file.video);
  const connected = connection.data?.connected === true;

  const showPreview = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !connected) return;
    setBusy('preview');
    setError(null);
    setPreview(null);
    const source = link.trim();
    try {
      const catalog = await api.previewTelegram(source);
      setPreview({ link: source, catalog });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível consultar este curso. Tente novamente.');
    } finally {
      setBusy(null);
    }
  };

  const addCourse = async () => {
    if (!preview || busy || !connected || videos.length === 0) return;
    setBusy('add');
    setError(null);
    try {
      const result = await api.addTelegramCourse(preview.link);
      await qc.invalidateQueries({ queryKey: ['courses'] });
      await qc.invalidateQueries({ queryKey: ['course', result.id] });
      navigate(`/course/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar o curso. Tente novamente.');
      setBusy(null);
    }
  };

  const button = 'min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400';

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link to="/" className="inline-flex min-h-[44px] items-center gap-1.5 rounded text-sm text-neutral-400 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
        <ArrowLeft size={16} /> Biblioteca
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Adicionar do Telegram</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-300">
        Liste as aulas e os materiais de um canal ou tópico. Os vídeos são carregados durante a reprodução;
        você não precisa baixar o curso inteiro. Ao voltar, o Learnflix retoma no ponto salvo.
      </p>

      {connection.isPending && <p className="mt-5 text-sm text-neutral-400" role="status">Verificando a conexão com o Telegram…</p>}
      {!connection.isPending && !connected && (
        <div className="mt-5 rounded-xl border border-amber-700/40 bg-amber-900/20 p-4 text-sm text-amber-200" role="status">
          <p className="font-medium">O Telegram ainda não está conectado</p>
          <p className="mt-1">É preciso configurar a integração Telegram no computador que executa o Learnflix e entrar na conta que tem acesso ao curso. Seus cursos locais continuam disponíveis.</p>
          <button type="button" onClick={() => void connection.refetch()} disabled={connection.isFetching} className="mt-3 min-h-[44px] rounded-lg bg-neutral-800 px-3 text-sm text-neutral-100 hover:bg-neutral-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            {connection.isFetching ? 'Verificando…' : 'Verificar conexão novamente'}
          </button>
        </div>
      )}

      <form onSubmit={(event) => void showPreview(event)} className="mt-6 rounded-xl bg-neutral-900 p-4">
        <label htmlFor="telegram-link" className="mb-2 block text-sm font-medium">Link do canal ou tópico</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <TextField id="telegram-link" type="url" required placeholder="https://t.me/canal/topico" value={link} disabled={!!busy}
            onChange={(event) => { setLink(event.target.value); setPreview(null); setError(null); }} aria-describedby="telegram-link-help" />
          <button type="submit" disabled={!connected || !!busy || !link.trim()} className={`${button} shrink-0`}>
            {busy === 'preview' ? 'Listando…' : 'Ver aulas e materiais'}
          </button>
        </div>
        <p id="telegram-link-help" className="mt-2 text-xs text-neutral-400">A conta conectada precisa ter acesso à origem. A prévia consulta a lista, sem baixar os vídeos.</p>
      </form>
      {busy === 'preview' && <p className="mt-4 text-sm text-neutral-400" role="status">Lendo a lista do Telegram. Cursos grandes podem levar alguns instantes.</p>}
      {error && <p className="mt-4 rounded-lg border border-amber-700/40 bg-amber-900/20 p-3 text-sm text-amber-200" role="alert">{error}</p>}

      {preview && (
        <section className="mt-8" aria-label="Prévia do curso">
          <h2 className="text-lg font-medium">{preview.catalog.title}</h2>
          <p className="mt-1 text-sm text-neutral-400">{videos.length} aulas · {materials.length} materiais · {formatSize(files.reduce((sum, file) => sum + file.size, 0))} na origem</p>
          {files.length === 0 || videos.length === 0 ? (
            <p className="mt-4 rounded-lg bg-neutral-900 p-4 text-sm text-neutral-300">
              {files.length === 0 ? 'Nenhum vídeo ou arquivo foi encontrado nesta origem.' : 'Esta origem tem materiais, mas nenhuma aula em vídeo. Escolha o canal ou tópico do curso.'}
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-md text-sm text-neutral-400">Adicionar guarda a lista na biblioteca. As aulas são buscadas sob demanda e o progresso fica salvo neste Learnflix.</p>
              <button type="button" onClick={() => void addCourse()} disabled={!!busy || !connected} className={`${button} shrink-0`}>
                {busy === 'add' ? 'Adicionando…' : 'Adicionar à biblioteca'}
              </button>
            </div>
          )}
          {files.length > 0 && (
            <ol className="mt-5 max-h-[60vh] space-y-1.5 overflow-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" tabIndex={0} aria-label="Vídeos e arquivos disponíveis">
              {files.map((file) => (
                <li key={file.messageId} className="flex items-start justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm text-neutral-200">{file.displayTitle ?? file.name}</p>
                    {file.displayTitle && file.displayTitle !== file.name && <p className="mt-1 break-words text-xs text-neutral-400">Original: {file.name}</p>}
                    <p className="mt-1 text-xs text-neutral-400">{file.video ? 'Vídeo' : 'Material'}{file.video && file.duration ? ` · ${formatDuration(file.duration)}` : ''}</p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-400">{formatSize(file.size)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}
