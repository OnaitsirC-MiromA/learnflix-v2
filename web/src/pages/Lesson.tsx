import { useEffect, useRef, useState, useCallback, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PlaybackVerdict } from '../api/client';
import { getPref, setPref } from '../lib/prefs';
import PlaylistSidebar from '../components/PlaylistSidebar';
import EndOfLessonCountdown from '../components/EndOfLessonCountdown';
import HelpLink from '../components/HelpLink';
import { ATALHOS } from '../help/content';
import { ArrowLeft, Camera, SkipBack, SkipForward, Check, PanelRight, Repeat, HelpCircle, X, Expand } from '../components/icons';

type SaveState = 'idle' | 'saved' | 'error';
type Notice = { kind: 'success' | 'error'; text: string };

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-11 w-11 place-items-center rounded-lg transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-30 ${
        active ? 'bg-blue-600/30 text-blue-200' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
      }`}
    >
      {children}
    </button>
  );
}

export default function Lesson() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // O painel de ajuda guarda seu estado na URL, então dá para lê-lo daqui e
  // suspender os atalhos do player enquanto ele estiver aberto — sem estado
  // compartilhado nem ordem de listeners para acertar.
  const [searchParams] = useSearchParams();
  const ajudaAberta = searchParams.has('ajuda');
  const videoRef = useRef<HTMLVideoElement>(null);
  const furthestRef = useRef(0);
  const lastSaveRef = useRef(0);
  const mountedRef = useRef(true);
  const noticeTimer = useRef(0);
  const savedTimer = useRef(0);
  const chromeTimer = useRef(0);
  const seekFlashTimer = useRef(0);
  const lastTapRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  const [chrome, setChrome] = useState(true);
  // Gesto "segurar = 2×" (estilo YouTube): timer do long-press + taxa anterior.
  const boostTimer = useRef(0);
  const boostRef = useRef(false);
  const prevRateRef = useRef(1);
  const pressingRef = useRef(false);
  const [boost, setBoost] = useState(false);
  const [seekFlash, setSeekFlash] = useState<'back' | 'fwd' | null>(null);
  // Zonas de double-tap só existem em ponteiro grosso (touch): no desktop o
  // mouse já tem clique nativo do <video> e o teclado cobre o seek (←/→).
  const [coarsePointer] = useState<boolean>(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)')?.matches,
  );
  const [sidebar, setSidebar] = useState<boolean>(() => getPref('player.sidebar', false));
  const [autoplay, setAutoplay] = useState<boolean>(() => getPref('player.autoplay', true));
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Veredito real de reprodução (formato de DENTRO do arquivo — a extensão mente
  // em acervos baixados: MPEG-TS renomeado, H.264 10-bit). null = ainda não verificado.
  const [verdict, setVerdict] = useState<PlaybackVerdict | null>(null);
  const [converting, setConverting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [help, setHelp] = useState(false);
  const [confirmCover, setConfirmCover] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [notice, setNotice] = useState<Notice | null>(null);

  const { data: lesson } = useQuery({ queryKey: ['lesson', id], queryFn: () => api.getLesson(id) });

  // Media Session: título/capa e controles na notificação de mídia e na tela de
  // bloqueio (Android/iOS). No Android isto também habilita continuar o ÁUDIO em
  // segundo plano: ao sair do app com o vídeo tocando, a notificação do Chrome
  // permite retomar a reprodução com a tela apagada.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !lesson) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: lesson.title,
      artist: lesson.courseTitle,
      artwork: [{ src: api.lessonThumbUrl(lesson.id), sizes: '480x270', type: 'image/jpeg' }],
    });
    const seek = (delta: number) => {
      const v = videoRef.current;
      if (v) v.currentTime = Math.max(0, v.currentTime + delta);
    };
    navigator.mediaSession.setActionHandler('play', () => void videoRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => videoRef.current?.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => seek(-10));
    navigator.mediaSession.setActionHandler('seekforward', () => seek(10));
    return () => {
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward'] as MediaSessionAction[]) {
        navigator.mediaSession.setActionHandler(a, null);
      }
    };
  }, [lesson]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(noticeTimer.current);
      window.clearTimeout(savedTimer.current);
      window.clearTimeout(seekFlashTimer.current);
      window.clearTimeout(boostTimer.current);
    };
  }, []);

  const showNotice = useCallback((kind: Notice['kind'], text: string) => {
    setNotice({ kind, text });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, 3500);
  }, []);

  const save = useCallback(
    (opts?: { keepalive?: boolean; silent?: boolean }) => {
      const v = videoRef.current;
      if (!v) return;
      const body = {
        position_sec: v.currentTime,
        furthest_sec: furthestRef.current,
        duration_sec: Number.isFinite(v.duration) ? v.duration : null,
      };
      if (opts?.keepalive) {
        fetch(`/api/lessons/${id}/progress`, {
          method: 'PATCH',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => {});
        return;
      }
      api
        .saveProgress(id, body)
        .then(() => {
          if (!mountedRef.current) return;
          // Autosave silencioso só limpa um erro anterior; não pisca "Salvo".
          if (opts?.silent) {
            setSaveState((s) => (s === 'error' ? 'idle' : s));
            return;
          }
          setSaveState('saved');
          window.clearTimeout(savedTimer.current);
          savedTimer.current = window.setTimeout(() => {
            if (mountedRef.current) setSaveState('idle');
          }, 2000);
        })
        .catch(() => {
          // Nunca engolir a falha: a confiança no progresso é o ponto do produto.
          if (mountedRef.current) setSaveState('error');
        });
    },
    [id],
  );

  const goTo = useCallback(
    (lessonId: string) => {
      save();
      navigate(`/lesson/${lessonId}`);
    },
    [save, navigate],
  );

  // Tela cheia via Fullscreen API padrão, com fallback para o modo nativo do
  // <video> no iOS Safari (que não implementa Fullscreen API no elemento).
  const toggleFullscreen = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (v.requestFullscreen) {
      void v.requestFullscreen();
    } else if ((v as any).webkitEnterFullscreen) {
      (v as any).webkitEnterFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const onLoaded = () => {
    const v = videoRef.current;
    if (v && lesson && !lesson.completed && lesson.position > 0) v.currentTime = lesson.position;
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    furthestRef.current = Math.max(furthestRef.current, v.currentTime);
    const now = Date.now();
    if (now - lastSaveRef.current > 5000) {
      lastSaveRef.current = now;
      save({ silent: true });
    }
  };

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') save({ keepalive: true });
    };
    const onUnload = () => save({ keepalive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      save({ keepalive: true });
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Painel de ajuda aberto: ele é dono do teclado (inclusive do Esc, que
      // fecha o painel e não a aula). O player fica inteiramente suspenso.
      if (ajudaAberta) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelp((h) => !h);
        return;
      }
      if (e.key === 'Escape') {
        if (help) return setHelp(false);
        if (confirmCover) return setConfirmCover(false);
        if (sidebar) {
          setSidebar(false);
          setPref('player.sidebar', false);
          return;
        }
        if (lesson) {
          save();
          navigate(`/course/${lesson.courseId}`);
        }
        return;
      }
      // Enquanto um overlay está aberto, os atalhos do player ficam suspensos.
      if (help || confirmCover) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (v.paused) void v.play();
          else v.pause();
          break;
        case 'ArrowRight':
          v.currentTime += 10;
          break;
        case 'ArrowLeft':
          v.currentTime -= 10;
          break;
        case 'ArrowUp':
          v.volume = Math.min(1, v.volume + 0.1);
          break;
        case 'ArrowDown':
          v.volume = Math.max(0, v.volume - 0.1);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'm':
          v.muted = !v.muted;
          break;
        case 'n':
          if (lesson?.nextLessonId) goTo(lesson.nextLessonId);
          break;
        case 'p':
          if (lesson?.prevLessonId) goTo(lesson.prevLessonId);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lesson, navigate, save, goTo, sidebar, help, confirmCover, toggleFullscreen, ajudaAberta]);

  // Revela o chrome e agenda o auto-esconder (2,5 s). Modelo "revelar + sumir
  // sozinho" (estilo YouTube), nunca "alternar": qualquer interação no palco só
  // mostra a barra, que some sozinha. Isso evita acoplar o chrome custom aos
  // controles nativos do <video> — o clique nos controles nativos é retargetado
  // para o próprio <video>, então "alternar" fecharia a barra ao tocar no play.
  const wake = useCallback(() => {
    setChrome(true);
    window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => setChrome(false), 2500);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', wake);
    wake();
    return () => {
      window.removeEventListener('mousemove', wake);
      window.clearTimeout(chromeTimer.current);
    };
  }, [wake]);

  // No touch/caneta o mousemove não dispara, então sem isto a barra sumiria de
  // vez após o timeout inicial. Um toque no palco (incl. nos controles nativos,
  // cujo clique é retargetado ao <video>) apenas revela o chrome via wake().
  //
  // Os gestos de toque moram AQUI, por coordenada, e não em camadas sobre o
  // vídeo: qualquer elemento cobrindo o <video> impedia o Chrome Android de
  // mostrar os controles nativos no retrato (toque nunca chegava ao vídeo).
  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    wake();
    pressingRef.current = true;
    // Faixa útil dos gestos exclui o chrome (topo) e o transporte nativo do
    // <video> (rodapé): tocar/arrastar controles nunca dispara gesto.
    const h = window.innerHeight;
    if (e.clientY < 96 || e.clientY > h - 72) return;
    // Double-tap nos terços laterais = ±10s. O toque também chega ao <video>
    // (revela os controles nativos) — mesmo comportamento do YouTube.
    const w = window.innerWidth;
    const side = e.clientX < w / 3 ? 'left' : e.clientX > (2 * w) / 3 ? 'right' : null;
    if (side) {
      const now = Date.now();
      if (now - lastTapRef.current[side] < 300) {
        lastTapRef.current[side] = 0;
        seekBy(side === 'left' ? 'back' : 'fwd');
      } else {
        lastTapRef.current[side] = now;
      }
    }
    // Segurar 500 ms em qualquer ponto da faixa = 2× enquanto o dedo estiver
    // na tela; soltar volta à velocidade anterior.
    window.clearTimeout(boostTimer.current);
    boostTimer.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (!v || v.paused || !pressingRef.current) return;
      prevRateRef.current = v.playbackRate;
      v.playbackRate = 2;
      boostRef.current = true;
      setBoost(true);
    }, 500);
  };

  const endStagePress = () => {
    pressingRef.current = false;
    window.clearTimeout(boostTimer.current);
    if (!boostRef.current) return;
    const v = videoRef.current;
    if (v) v.playbackRate = prevRateRef.current;
    boostRef.current = false;
    setBoost(false);
  };

  // Reprodução real ≠ extensão do arquivo: acervos baixados trazem MPEG-TS
  // renomeado p/ .mp4 (browser não demuxa) e H.264 10-bit (browser não
  // decodifica). verify-playback proba o formato DE DENTRO e sincroniza o flag;
  // convert remuxa sem perda quando dá (TS→MP4), sem tocar no arquivo original.
  const verifyPlayback = useCallback(async () => {
    try {
      const v = await api.verifyPlayback(id);
      setVerdict(v);
      if (!v.playable) {
        qc.invalidateQueries({ queryKey: ['lesson', id] });
        qc.invalidateQueries({ queryKey: ['course'] });
      }
      return v;
    } catch {
      return null;
    }
  }, [id, qc]);

  // O <video> falhou em algo que o flag dizia tocável — descobre o motivo real
  // e troca a tela preta por um estado acionável.
  const onVideoError = useCallback(() => {
    if (!verdict) void verifyPlayback();
  }, [verdict, verifyPlayback]);

  // Flag já dizia não-tocável (selo do curso): busca o veredito com o motivo
  // e se é remuxável, para oferecer o botão certo.
  useEffect(() => {
    if (lesson && !lesson.playable && !verdict) void verifyPlayback();
  }, [lesson, verdict, verifyPlayback]);

  const doConvert = async () => {
    setConverting(true);
    try {
      const r = await api.convertLesson(id);
      if (r.status === 'converted' || r.status === 'already_playable') {
        setVerdict(null);
        qc.invalidateQueries({ queryKey: ['lesson', id] });
        qc.invalidateQueries({ queryKey: ['course'] });
        showNotice('success', 'Vídeo convertido — bom estudo!');
      } else {
        setVerdict({ playable: false, reason: r.reason ?? 'codec', remuxable: false });
      }
    } catch {
      showNotice('error', 'Falha ao converter. Tente novamente.');
    }
    setConverting(false);
  };

  // Espelha ArrowLeft/ArrowRight (~L229-234): mesmo delta de 10s, sem clamp
  // (o próprio <video> satura em 0/duration). O flash visual soma sozinho.
  const seekBy = useCallback((dir: 'back' | 'fwd') => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime += dir === 'back' ? -10 : 10;
    setSeekFlash(dir);
    window.clearTimeout(seekFlashTimer.current);
    seekFlashTimer.current = window.setTimeout(() => {
      if (mountedRef.current) setSeekFlash(null);
    }, 650);
  }, []);

  const toggleSidebar = () =>
    setSidebar((s) => {
      const n = !s;
      setPref('player.sidebar', n);
      return n;
    });
  const toggleAutoplay = () =>
    setAutoplay((a) => {
      const n = !a;
      setPref('player.autoplay', n);
      return n;
    });

  const toggleComplete = async () => {
    if (!lesson) return;
    await api.setComplete(id, !lesson.completed);
    qc.invalidateQueries({ queryKey: ['lesson', id] });
    qc.invalidateQueries({ queryKey: ['course', lesson.courseId] });
  };

  const doCaptureCover = async () => {
    setConfirmCover(false);
    const v = videoRef.current;
    if (!v || !lesson) return;
    try {
      await api.setCover(lesson.courseId, id, v.currentTime);
      qc.invalidateQueries({ queryKey: ['course', lesson.courseId] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      showNotice('success', 'Capa do curso atualizada.');
    } catch {
      showNotice('error', 'Não foi possível definir a capa. Verifique se o ffmpeg está instalado.');
    }
  };

  const onEnded = () => {
    if (autoplay) setEnding(true);
  };

  const finishAndAdvance = async () => {
    setEnding(false);
    if (!lesson) return;
    await api.setComplete(id, true);
    qc.invalidateQueries({ queryKey: ['lesson', id] });
    qc.invalidateQueries({ queryKey: ['course', lesson.courseId] });
    if (lesson.nextLessonId) navigate(`/lesson/${lesson.nextLessonId}`);
  };

  if (!lesson) {
    // Esqueleto: pré-pinta o palco preto + barra de título, para a chegada do
    // player não causar layout-shift. Sem spinner (guia de produto).
    return (
      <div className="relative h-screen bg-black">
        <div className="absolute inset-x-0 top-0 p-4">
          <div className="h-5 w-64 max-w-[60%] animate-pulse rounded bg-neutral-800 motion-reduce:animate-none" />
        </div>
        <div className="grid h-screen place-items-center text-sm text-neutral-500">Carregando a aula…</div>
      </div>
    );
  }

  if (!lesson.playable || (verdict && !verdict.playable)) {
    const remuxable = verdict && !verdict.playable ? verdict.remuxable : null;
    return (
      <div className="grid h-screen place-items-center p-6 text-center">
        <div className="max-w-md">
          <div className="mb-2 text-lg font-medium">Este vídeo está num formato que o navegador não reproduz</div>
          {remuxable === true && (
            <>
              <p className="mb-4 text-sm text-neutral-400">
                Dá para corrigir sem recodificar: um remux rápido e sem perda de qualidade. O arquivo original não é alterado.
              </p>
              <button
                type="button"
                onClick={() => void doConvert()}
                disabled={converting}
                className="mb-4 inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-blue-500 disabled:opacity-40"
              >
                {converting ? 'Convertendo…' : 'Converter agora (sem perda)'}
              </button>
            </>
          )}
          {remuxable === false && (
            <p className="mb-4 text-sm text-neutral-400">
              O codec deste arquivo (H.264 10-bit ou HEVC) precisa ser recodificado, e recodificar é lento e com perda —
              por isso o Learnflix não faz isso por você. Converta a aula para H.264 8-bit com o{' '}
              <a
                href="https://handbrake.fr"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-200"
              >
                HandBrake
              </a>{' '}
              (ou o VLC), substitua o arquivo na pasta do curso e use "Re-escanear agora" no menu do curso — o progresso
              é preservado.
            </p>
          )}
          {remuxable === null && <p className="mb-4 text-sm text-neutral-400">Verificando o formato do arquivo…</p>}
          {/* O aviso PRECISA existir aqui: esta tela retorna antes da árvore do
              player, onde fica o outro <notice>. Sem isto, uma conversão que
              falha não muda nada na tela — o clique vira um silêncio. */}
          {notice && (
            <p className={`mb-4 text-sm ${notice.kind === 'success' ? 'text-green-400' : 'text-amber-200'}`} role="status">
              {notice.text}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-neutral-800 px-4 text-neutral-200 transition-colors motion-reduce:transition-none hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              onClick={() => navigate(`/course/${lesson.courseId}`)}
            >
              <ArrowLeft size={18} /> Voltar ao curso
            </button>
            <HelpLink topico="video-nao-toca" className="text-sm text-neutral-400 hover:text-neutral-200">
              Entenda o que aconteceu
            </HelpLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-screen bg-black"
      onPointerDown={onStagePointerDown}
      onPointerUp={endStagePress}
      onPointerCancel={endStagePress}
      onContextMenu={(e) => {
        if (pressingRef.current) e.preventDefault();
      }}
    >
      <video
        ref={videoRef}
        src={`/api/lessons/${id}/stream`}
        className="w-full h-screen object-contain bg-black"
        controls
        autoPlay
        playsInline
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTimeUpdate}
        onPause={() => save()}
        onEnded={onEnded}
        onError={onVideoError}
      />

      {coarsePointer && (
        // Só INDICADORES (pointer-events-none): nada pode cobrir o <video>,
        // senão o Chrome Android nunca mostra os controles nativos no retrato.
        <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
          <div className="absolute inset-y-0 left-0 flex w-1/3 items-center justify-center">
            <span
              className={`rounded-full bg-black/70 px-4 py-2 text-sm text-white transition-opacity duration-300 motion-reduce:transition-none ${seekFlash === 'back' ? 'opacity-100' : 'opacity-0'}`}
            >
              -10s
            </span>
          </div>
          <div className="absolute inset-y-0 right-0 flex w-1/3 items-center justify-center">
            <span
              className={`rounded-full bg-black/70 px-4 py-2 text-sm text-white transition-opacity duration-300 motion-reduce:transition-none ${seekFlash === 'fwd' ? 'opacity-100' : 'opacity-0'}`}
            >
              +10s
            </span>
          </div>
          {boost && (
            <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white">
              2×
            </span>
          )}
        </div>
      )}

      <div
        className={`absolute top-0 inset-x-0 z-20 pb-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 motion-reduce:transition-none ${chrome || sidebar || saveState === 'error' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:flex-nowrap sm:gap-3">
          <IconButton label="Voltar ao curso (Esc)" onClick={() => navigate(`/course/${lesson.courseId}`)}>
            <ArrowLeft />
          </IconButton>
          {/* No celular o título cai para uma 2ª linha (w-full order-last) com largura
              total; no desktop fica inline entre o voltar e os controles. */}
          <span className="order-last w-full min-w-0 truncate text-neutral-300 sm:order-none sm:w-auto sm:flex-1">
            {lesson.courseTitle} · {lesson.title}
          </span>

          {saveState === 'saved' && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-400">
              <Check size={14} /> <span className="hidden sm:inline">Salvo</span>
            </span>
          )}
          {saveState === 'error' && (
            <span className="flex shrink-0 items-center gap-2 rounded border border-amber-700/40 bg-amber-900/40 px-2 py-1 text-xs text-amber-200">
              Falha ao salvar progresso
              <button type="button" onClick={() => save()} className="underline hover:no-underline">
                Tentar de novo
              </button>
            </span>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0 sm:gap-4">
            {/* Navegação entre aulas */}
            <div className="flex items-center gap-1">
              <IconButton label="Aula anterior (P)" disabled={!lesson.prevLessonId} onClick={() => lesson.prevLessonId && goTo(lesson.prevLessonId)}>
                <SkipBack />
              </IconButton>
              <IconButton label="Próxima aula (N)" disabled={!lesson.nextLessonId} onClick={() => lesson.nextLessonId && goTo(lesson.nextLessonId)}>
                <SkipForward />
              </IconButton>
            </div>

            {/* Ação principal da aula */}
            <button
              type="button"
              onClick={toggleComplete}
              aria-pressed={lesson.completed}
              title={lesson.completed ? 'Concluída — clique para desmarcar' : 'Marcar como concluída'}
              className={`flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                lesson.completed ? 'bg-green-500/15 text-green-400' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
              }`}
            >
              <Check size={18} />
              <span className="hidden sm:inline">{lesson.completed ? 'Concluída' : 'Concluir'}</span>
            </button>

            {/* Ferramentas */}
            <div className="flex items-center gap-1">
              {/* Definir capa — ação ocasional, ocultada no celular para caber a barra */}
              <div className="hidden sm:block">
                <IconButton label="Usar este frame como capa do curso" onClick={() => setConfirmCover(true)}>
                  <Camera />
                </IconButton>
              </div>
              <IconButton
                label={autoplay ? 'Auto-avançar ao fim: ligado' : 'Auto-avançar ao fim: desligado'}
                onClick={toggleAutoplay}
                active={autoplay}
              >
                <Repeat off={!autoplay} />
              </IconButton>
              <IconButton
                label={isFullscreen ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'}
                onClick={toggleFullscreen}
                active={isFullscreen}
              >
                <Expand />
              </IconButton>
              <IconButton label="Lista de aulas (☰)" onClick={toggleSidebar} active={sidebar}>
                <PanelRight />
              </IconButton>
              {/* Atalhos de teclado — irrelevante no touch, ocultado no celular */}
              <div className="hidden sm:block">
                <IconButton label="Atalhos de teclado (?)" onClick={() => setHelp(true)}>
                  <HelpCircle />
                </IconButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PlaylistSidebar
        courseId={lesson.courseId}
        currentLessonId={id}
        open={sidebar}
        onClose={() => {
          setSidebar(false);
          setPref('player.sidebar', false);
        }}
        onJump={(lid) => goTo(lid)}
      />

      {notice && (
        <div
          className="absolute left-1/2 z-30 -translate-x-1/2 rounded-lg border border-neutral-800 bg-neutral-900/95 px-4 py-2 text-sm"
          style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <span className={notice.kind === 'success' ? 'text-green-400' : 'text-amber-200'}>{notice.text}</span>
        </div>
      )}

      {confirmCover && (
        <div className="absolute inset-0 grid place-items-center z-30">
          <div className="bg-neutral-900/95 rounded-xl p-5 text-center">
            <div className="text-neutral-200 mb-1">Usar este frame como capa do curso?</div>
            <div className="text-sm text-neutral-400 mb-4">Substitui a capa atual.</div>
            <div className="flex gap-2 justify-center">
              <button type="button" onClick={() => setConfirmCover(false)} className="px-3 py-2 bg-neutral-800 rounded-lg hover:bg-neutral-700">
                Cancelar
              </button>
              <button type="button" onClick={doCaptureCover} className="px-3 py-2 bg-blue-600 rounded-lg hover:bg-blue-500">
                Usar este frame
              </button>
            </div>
          </div>
        </div>
      )}

      {help && (
        <div className="absolute inset-0 grid place-items-center z-40 bg-black/60 p-4" onClick={() => setHelp(false)}>
          <div className="w-full max-w-sm bg-neutral-900 rounded-xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-medium">Atalhos de teclado</span>
              <IconButton label="Fechar (Esc)" onClick={() => setHelp(false)}>
                <X />
              </IconButton>
            </div>
            <dl className="space-y-2.5">
              {ATALHOS.map((s) => (
                <div key={s.desc} className="flex items-center gap-3">
                  <dt className="flex w-24 shrink-0 gap-1">
                    {s.teclas.map((k) => (
                      <kbd
                        key={k}
                        className="inline-flex min-w-[1.75rem] justify-center rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-200"
                      >
                        {k}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="text-sm text-neutral-300">{s.desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {ending && (
        <EndOfLessonCountdown
          seconds={getPref('player.countdownSeconds', 20)}
          hasNext={!!lesson.nextLessonId}
          onElapsed={finishAndAdvance}
          onCancel={() => setEnding(false)}
          onSkipNow={finishAndAdvance}
        />
      )}
    </div>
  );
}
