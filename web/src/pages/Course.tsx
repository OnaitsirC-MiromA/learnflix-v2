import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useCourse, useSetComplete } from '../api/hooks';
import { formatDuration, percent } from '../lib/format';
import { getPref, setPref } from '../lib/prefs';
import { api } from '../api/client';
import type { LessonDTO } from '../api/client';
import LessonGrid from '../components/LessonGrid';
import MaterialsSection from '../components/MaterialsSection';
import CourseMenu from '../components/CourseMenu';
import Banner from '../components/Banner';
import HelpLink from '../components/HelpLink';
import { ArrowLeft, Play, Check, List, LayoutGrid } from '../components/icons';

function pickContinue(lessons: LessonDTO[]): LessonDTO | null {
  const notCompleted = lessons.filter((l) => !l.completed);
  if (notCompleted.length === 0) return null;
  const inProgress = notCompleted.filter((l) => l.position > 0);
  if (inProgress.length > 0) return inProgress[inProgress.length - 1];
  return notCompleted[0];
}

export default function Course() {
  const { id = '' } = useParams();
  const { data, isLoading } = useCourse(id);
  const setComplete = useSetComplete(id);
  const navigate = useNavigate();
  const [view, setView] = useState<'list' | 'grid'>(() => getPref<'list' | 'grid'>('course.view', 'list'));
  const [gridSize, setGridSize] = useState<number>(() => getPref<number>('course.gridSize', 200));
  const qc = useQueryClient();
  const [rootIssue, setRootIssue] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .rescan(id)
      .then((res) => {
        if (cancelled) return;
        if ('status' in res) {
          setRootIssue(true);
          return;
        }
        setRootIssue(false);
        if (res.added || res.missing || res.relinked) qc.invalidateQueries({ queryKey: ['course', id] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="h-5 w-24 animate-pulse rounded bg-neutral-800 motion-reduce:animate-none" />
        <div className="mt-3 h-8 w-2/3 animate-pulse rounded bg-neutral-800 motion-reduce:animate-none" />
        <div className="mt-5 h-28 animate-pulse rounded-xl bg-neutral-900 motion-reduce:animate-none" />
      </div>
    );
  }

  const allLessons = data.modules.flatMap((m) => m.lessons);
  const cont = pickContinue(allLessons);
  const pct = percent(data.completedLessons, data.totalLessons);
  const onToggle = (lid: string, completed: boolean) => setComplete.mutate({ id: lid, completed });
  const editCover = () => {
    const first = allLessons[0];
    if (first) navigate(`/lesson/${first.id}`);
  };
  const chooseView = (v: 'list' | 'grid') => {
    setView(v);
    setPref('course.view', v);
  };
  const chooseSize = (n: number) => {
    setGridSize(n);
    setPref('course.gridSize', n);
  };

  return (
    <div className="relative">
      {/* Backdrop ambiente: a capa do curso desfocada e escurecida, com scrim para o
          studio-black — o conteúdo ilumina o palco (cinema pessoal). Puramente
          decorativo (aria-hidden); some sozinho quando não há capa. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] overflow-hidden" aria-hidden>
        <img
          src={api.courseCoverUrl(id)}
          alt=""
          className="h-full w-full scale-110 object-cover opacity-35 blur-2xl"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-studio-black/40 to-studio-black" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded text-sm text-neutral-400 transition-colors hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <ArrowLeft size={16} /> Biblioteca
        </Link>
        <CourseMenu course={data} onEditCover={editCover} onNotice={(t) => setNotice(t)} />
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{data.title}</h1>

      {rootIssue && (
        <div className="mt-4">
          <Banner>
            Pasta do curso indisponível — se ela mudou de lugar, re-aponte pelo menu ⋯.{' '}
            <HelpLink topico="curso-sumiu">Entenda o que aconteceu</HelpLink>
          </Banner>
        </div>
      )}
      {!rootIssue && allLessons.some((l) => l.missing) && (
        <div className="mt-4">
          <Banner>
            {allLessons.filter((l) => l.missing).length} aula(s) não encontrada(s). Re-aponte a pasta pelo menu ⋯ para recuperar.
          </Banner>
        </div>
      )}
      {notice && <div className="mt-4 rounded-lg bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{notice}</div>}

      {cont ? (
        <button
          type="button"
          onClick={() => navigate(`/lesson/${cont.id}`)}
          className="mt-6 flex w-full items-center gap-4 rounded-xl bg-neutral-900/80 p-4 text-left outline-none backdrop-blur-sm transition-shadow motion-reduce:transition-none hover:ring-2 hover:ring-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600 sm:gap-5"
        >
          <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-neutral-800 sm:w-44">
            <img
              src={api.lessonThumbUrl(cont.id)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-blue-400">Continuar</div>
            <div className="mt-0.5 truncate font-medium sm:text-lg">{cont.title}</div>
            <div className="mt-0.5 text-sm text-neutral-400">
              {cont.position > 0 ? `${formatDuration(cont.position)} / ${formatDuration(cont.durationSec)}` : 'Começar'}
            </div>
          </div>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-600 text-white">
            <Play size={20} />
          </div>
        </button>
      ) : (
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-neutral-900 p-4 text-green-400">
          <Check size={18} /> Curso concluído
        </div>
      )}

      <div className="mt-6">
        <div className="h-1.5 rounded bg-neutral-800">
          <div className="h-full rounded bg-blue-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 text-sm text-neutral-400">
          {data.completedLessons}/{data.totalLessons} aulas · {pct}%
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 text-sm">
        <div className="inline-flex overflow-hidden rounded-lg border border-neutral-800">
          <button
            type="button"
            onClick={() => chooseView('list')}
            aria-pressed={view === 'list'}
            className={`inline-flex h-11 items-center gap-1.5 px-3 transition-colors motion-reduce:transition-none ${view === 'list' ? 'bg-neutral-700 text-neutral-100' : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'}`}
          >
            <List size={16} /> Lista
          </button>
          <button
            type="button"
            onClick={() => chooseView('grid')}
            aria-pressed={view === 'grid'}
            className={`inline-flex h-11 items-center gap-1.5 px-3 transition-colors motion-reduce:transition-none ${view === 'grid' ? 'bg-neutral-700 text-neutral-100' : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'}`}
          >
            <LayoutGrid size={16} /> Grade
          </button>
        </div>
        {/* Slider só no desktop: no celular a grade já clampa a 45vw e o controle
            não teria efeito — e cortava o toggle Lista/Grade em 375px. */}
        {view === 'grid' && (
          <label className="hidden items-center gap-2 text-neutral-400 sm:flex">
            Tamanho
            <input
              type="range"
              min={120}
              max={360}
              step={20}
              value={gridSize}
              onChange={(e) => chooseSize(Number(e.target.value))}
              className="accent-blue-600"
            />
          </label>
        )}
      </div>

      <div className="mt-6 space-y-7">
        {data.modules.map((m) => (
          <section key={m.name ?? '__flat__'}>
            {m.name && <h2 className="mb-2 text-sm font-semibold text-neutral-300">{m.name}</h2>}
            {view === 'grid' ? (
              <LessonGrid lessons={m.lessons} size={gridSize} onToggleComplete={onToggle} />
            ) : (
              <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 lg:grid-cols-2">
                {m.lessons.map((l) => (
                  <div key={l.id} className={`flex items-center gap-3 rounded-lg bg-neutral-900 px-3 py-2 ${l.missing ? 'opacity-50' : ''}`}>
                    <Link
                      to={`/lesson/${l.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <img
                        src={api.lessonThumbUrl(l.id)}
                        alt=""
                        className="aspect-video w-16 shrink-0 rounded bg-neutral-800 object-cover"
                        loading="lazy"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
                      />
                      <span className="w-8 shrink-0 text-center text-xs text-neutral-600">{l.missing ? '—' : l.orderIndex + 1}</span>
                      <span className="flex-1 truncate">{l.title}</span>
                      <span className="shrink-0 text-xs text-neutral-500">{formatDuration(l.durationSec)}</span>
                      <span className="w-auto shrink-0 text-right text-xs sm:w-28">
                        {l.missing ? (
                          <span className="text-amber-300" title="arquivo não encontrado">
                            <span className="sm:hidden">⚠</span>
                            <span className="hidden sm:inline">arquivo não encontrado</span>
                          </span>
                        ) : !l.playable ? (
                          <span className="text-neutral-400" title="precisa converter">
                            <span className="sm:hidden">⟳</span>
                            <span className="hidden sm:inline">precisa converter</span>
                          </span>
                        ) : (
                          <span
                            className="text-neutral-400"
                            title={l.completed ? 'concluída' : l.position > 0 ? 'em progresso' : 'não iniciada'}
                          >
                            <span className="sm:hidden">{l.completed ? '✓' : l.position > 0 ? '▓' : '○'}</span>
                            <span className="hidden sm:inline">{l.completed ? '✓ concluída' : l.position > 0 ? 'em progresso' : 'não iniciada'}</span>
                          </span>
                        )}
                      </span>
                    </Link>
                    <label className="grid h-11 w-11 shrink-0 place-items-center" title="Marcar como concluída">
                      <input
                        type="checkbox"
                        checked={l.completed}
                        onChange={(e) => onToggle(l.id, e.target.checked)}
                        className="h-4 w-4 accent-blue-600"
                        aria-label="Marcar como concluída"
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <MaterialsSection materials={data.materials} />
      </div>
    </div>
  );
}
