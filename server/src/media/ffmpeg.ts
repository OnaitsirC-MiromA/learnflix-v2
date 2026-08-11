import { spawn, spawnSync } from 'node:child_process';

export function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const release = () => {
    active--;
    const next = queue.shift();
    if (next) next();
  };
  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        task().then(resolve, reject).finally(release);
      };
      if (active < max) run();
      else queue.push(run);
    });
  };
}

const extractLimit = createLimiter(3);

let ffmpegCache: boolean | null = null;
function binWorks(name: string): boolean {
  try {
    return spawnSync(name, ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}
export function hasFfmpeg(): boolean {
  if (ffmpegCache === null) ffmpegCache = binWorks('ffmpeg') && binWorks('ffprobe');
  return ffmpegCache;
}

export function probeDurationSec(videoPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath]);
    let out = '';
    p.stdout.on('data', (d) => (out += String(d)));
    p.on('error', () => resolve(null));
    p.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) ? n : null);
    });
  });
}

export interface MediaFormat {
  formatName: string;
  videoCodec: string | null;
  profile: string | null;
  pixFmt: string | null;
  audioCodec: string | null;
}

// Formato REAL do arquivo (o container/codec de dentro, não a extensão — que mente:
// cursos baixados vêm como MPEG-TS renomeado p/ .mp4, ou H.264 10-bit).
export function probeFormat(videoPath: string): Promise<MediaFormat | null> {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=format_name',
      '-show_entries', 'stream=codec_type,codec_name,profile,pix_fmt',
      '-of', 'json',
      videoPath,
    ]);
    let out = '';
    p.stdout.on('data', (d) => (out += String(d)));
    p.on('error', () => resolve(null));
    p.on('close', (code) => {
      if (code !== 0) return resolve(null);
      try {
        const j = JSON.parse(out);
        const streams: any[] = j.streams ?? [];
        const video = streams.find((s) => s.codec_type === 'video');
        const audio = streams.find((s) => s.codec_type === 'audio');
        resolve({
          formatName: String(j.format?.format_name ?? ''),
          videoCodec: video?.codec_name ?? null,
          profile: video?.profile ?? null,
          pixFmt: video?.pix_fmt ?? null,
          audioCodec: audio?.codec_name ?? null,
        });
      } catch {
        resolve(null);
      }
    });
  });
}

export type Playback = { playable: true } | { playable: false; reason: 'container' | 'codec'; remuxable: boolean };

// Reproduzibilidade REAL no <video> do navegador. Regras conservadoras, guiadas
// pelos casos observados no acervo:
// - MPEG-TS (mesmo com .mp4 na extensão): navegador não demuxa TS. Se os codecs
//   de dentro são h264+aac, um remux -c copy (sem recodificar) resolve.
// - H.264 além de 8-bit 4:2:0 (High 10/4:2:2/4:4:4): navegador não decodifica;
//   precisa de transcodificação de verdade.
// - HEVC/H.265: sem suporte confiável no Chrome — requer transcode.
export function classifyPlayback(fmt: MediaFormat): Playback {
  if (fmt.formatName.includes('mpegts')) {
    const remuxable = fmt.videoCodec === 'h264' && (fmt.audioCodec === null || fmt.audioCodec === 'aac');
    return { playable: false, reason: 'container', remuxable };
  }
  if (fmt.videoCodec === 'hevc' || fmt.videoCodec === 'h265') {
    return { playable: false, reason: 'codec', remuxable: false };
  }
  if (fmt.videoCodec === 'h264') {
    const p = (fmt.profile ?? '').toLowerCase();
    const px = fmt.pixFmt ?? '';
    if (p.includes('10') || p.includes('422') || p.includes('444') || /10le|12le|422|444/.test(px)) {
      return { playable: false, reason: 'codec', remuxable: false };
    }
  }
  return { playable: true };
}

// Remux TS→MP4 sem recodificar (-c copy): rápido, zero perda. Pega a primeira
// trilha de vídeo e a primeira de áudio (TS dual-audio vira áudio único) e move
// o moov pro início (+faststart) para o navegador começar a tocar sem baixar tudo.
export function remuxToMp4(inPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', inPath,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      outPath,
    ];
    const p = spawn('ffmpeg', args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg remux saiu com código ${code}`))));
  });
}

// Validação do convertido antes de servi-lo no lugar do original: precisa ser
// tocável de verdade E ter a mesma duração do original (±2s).
export async function validateConverted(originalPath: string, convertedPath: string): Promise<boolean> {
  const fmt = await probeFormat(convertedPath);
  if (!fmt || !classifyPlayback(fmt).playable) return false;
  const [dOrig, dConv] = await Promise.all([probeDurationSec(originalPath), probeDurationSec(convertedPath)]);
  if (dOrig === null || dConv === null) return false;
  return Math.abs(dOrig - dConv) <= 2;
}

export function extractFrame(videoPath: string, atSec: number, outPath: string, width = 480): Promise<void> {
  return extractLimit(
    () =>
      new Promise<void>((resolve, reject) => {
        const args = ['-ss', String(atSec), '-i', videoPath, '-frames:v', '1', '-update', '1', '-vf', `scale='min(${width},iw)':-2`, '-y', outPath];
        const p = spawn('ffmpeg', args, { stdio: 'ignore' });
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com código ${code}`))));
      }),
  );
}
