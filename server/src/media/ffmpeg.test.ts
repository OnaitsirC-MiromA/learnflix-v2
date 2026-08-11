import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { classifyPlayback, createLimiter, hasFfmpeg, probeDurationSec, probeFormat, extractFrame, remuxToMp4, validateConverted } from './ffmpeg';

describe('createLimiter', () => {
  it('nunca passa do máximo de tarefas concorrentes', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let maxActive = 0;
    const make = () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 15));
        active--;
      });
    await Promise.all([make(), make(), make(), make(), make()]);
    expect(maxActive).toBe(2);
  });
});

describe('ffmpeg (integração — pulado sem ffmpeg)', () => {
  it.skipIf(!hasFfmpeg())('probe lê duração e extract gera um frame', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-'));
    const video = path.join(dir, 'test.mp4');
    spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=duration=2:size=128x72:rate=10', '-y', video], { stdio: 'ignore' });
    const dur = await probeDurationSec(video);
    expect(dur).not.toBeNull();
    expect(dur as number).toBeGreaterThan(1);
    const out = path.join(dir, 'frame.jpg');
    await extractFrame(video, 1, out);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.statSync(out).size).toBeGreaterThan(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('classifyPlayback (pura)', () => {
  const base = { formatName: 'mov,mp4,m4a,3gp,3g2,mj2', videoCodec: 'h264', profile: 'High', pixFmt: 'yuv420p', audioCodec: 'aac' };
  it('mp4 h264 8-bit → tocável', () => {
    expect(classifyPlayback(base)).toEqual({ playable: true });
  });
  it('MPEG-TS renomeado → não tocável, remuxável quando h264+aac', () => {
    expect(classifyPlayback({ ...base, formatName: 'mpegts' })).toEqual({ playable: false, reason: 'container', remuxable: true });
  });
  it('MPEG-TS com vídeo não-h264 → não tocável e NÃO remuxável', () => {
    expect(classifyPlayback({ ...base, formatName: 'mpegts', videoCodec: 'mpeg2video' })).toEqual({ playable: false, reason: 'container', remuxable: false });
  });
  it('h264 High 10 (10-bit) → não tocável, requer transcode', () => {
    expect(classifyPlayback({ ...base, profile: 'High 10', pixFmt: 'yuv420p10le' })).toEqual({ playable: false, reason: 'codec', remuxable: false });
  });
  it('hevc em mp4 → não tocável (Chrome não confiável), requer transcode', () => {
    expect(classifyPlayback({ ...base, videoCodec: 'hevc', profile: 'Main' })).toEqual({ playable: false, reason: 'codec', remuxable: false });
  });
});

describe('probeFormat + remuxToMp4 (integração — pulado sem ffmpeg)', () => {
  it.skipIf(!hasFfmpeg())('detecta TS renomeado p/ .mp4 e o remux produz mp4 tocável', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmt-'));
    const fake = path.join(dir, 'aula.mp4'); // extensão mente: conteúdo é TS
    spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=128x72:rate=10', '-f', 'lavfi', '-i', 'sine=duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mpegts', '-y', fake], { stdio: 'ignore' });

    const fmt = await probeFormat(fake);
    expect(fmt?.formatName).toContain('mpegts');
    expect(classifyPlayback(fmt!)).toEqual({ playable: false, reason: 'container', remuxable: true });

    const out = path.join(dir, 'convertido.mp4');
    await remuxToMp4(fake, out);
    const fmt2 = await probeFormat(out);
    expect(fmt2?.formatName).toContain('mp4');
    expect(classifyPlayback(fmt2!)).toEqual({ playable: true });

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('validateConverted (integração — pulado sem ffmpeg)', () => {
  it.skipIf(!hasFfmpeg())('aceita o remux fiel e recusa um convertido de duração errada', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffval-'));
    const original = path.join(dir, 'aula.mp4'); // TS disfarçado, remuxável
    spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=duration=2:size=128x72:rate=10', '-f', 'lavfi', '-i', 'sine=duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mpegts', '-y', original], { stdio: 'ignore' });

    const out = path.join(dir, 'convertido.mp4');
    await remuxToMp4(original, out);
    expect(await validateConverted(original, out)).toBe(true);

    // um "convertido" com outra duração é recusado — nunca se serve algo truncado
    const curto = path.join(dir, 'curto.mp4');
    spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=duration=8:size=128x72:rate=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', curto], { stdio: 'ignore' });
    expect(await validateConverted(original, curto)).toBe(false);

    fs.rmSync(dir, { recursive: true, force: true });
  }, 30000);
});
