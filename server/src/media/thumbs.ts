import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Db } from '../db';
import type { AppConfig } from '../config';
import { hasFfmpeg, probeDurationSec, extractFrame } from './ffmpeg';

export function pickFrameTimestamp(durationSec: number | null): number {
  if (durationSec && durationSec > 0) return Math.max(1, durationSec * 0.1);
  return 5;
}

// JPEG (encoder mjpeg) é universal em qualquer build de ffmpeg; o encoder WebP
// nem sempre está compilado (ex.: o ffmpeg do Homebrew sem libwebp), então
// usamos .jpg para portabilidade.
export function lessonThumbPath(config: AppConfig, lessonId: string, mtime: number): string {
  return path.join(config.thumbsDir, `${lessonId}-${mtime}.jpg`);
}

export function courseCoverPath(config: AppConfig, courseId: string): string {
  return path.join(config.thumbsDir, `course-${courseId}.jpg`);
}

function videoAbsPath(rootPath: string, relPath: string): string {
  return path.join(rootPath, relPath.split('/').join(path.sep));
}

export async function getOrCreateLessonThumb(
  db: Db,
  config: AppConfig,
  lessonId: string,
): Promise<string | null> {
  const row = db
    .prepare(
      `SELECT l.rel_path, l.mtime, l.playable, l.missing, l.duration_sec, c.root_path
       FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = ?`,
    )
    .get(lessonId) as any;
  if (!row || !row.playable || row.missing) return null;

  const out = lessonThumbPath(config, lessonId, row.mtime);
  if (existsSync(out)) {
    db.prepare('UPDATE lessons SET thumb_path=? WHERE id=?').run(out, lessonId);
    return out;
  }
  if (!hasFfmpeg()) return null;

  const videoPath = videoAbsPath(row.root_path, row.rel_path);
  if (!existsSync(videoPath)) return null;

  let duration = row.duration_sec as number | null;
  if (duration == null) {
    duration = await probeDurationSec(videoPath);
    if (duration != null) db.prepare('UPDATE lessons SET duration_sec=? WHERE id=?').run(duration, lessonId);
  }
  try {
    await extractFrame(videoPath, pickFrameTimestamp(duration), out);
  } catch {
    return null;
  }
  db.prepare('UPDATE lessons SET thumb_path=? WHERE id=?').run(out, lessonId);
  return out;
}

export async function setCourseCover(
  db: Db,
  config: AppConfig,
  courseId: string,
  lessonId: string,
  atSec: number,
): Promise<'ok' | 'not_found' | 'no_ffmpeg'> {
  const row = db
    .prepare(`SELECT l.rel_path, c.root_path FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = ? AND l.course_id = ?`)
    .get(lessonId, courseId) as any;
  if (!row) return 'not_found';
  if (!hasFfmpeg()) return 'no_ffmpeg';
  const videoPath = videoAbsPath(row.root_path, row.rel_path);
  const out = courseCoverPath(config, courseId);
  await extractFrame(videoPath, Math.max(0, atSec), out);
  db.prepare('UPDATE courses SET cover_path=? WHERE id=?').run(out, courseId);
  return 'ok';
}
