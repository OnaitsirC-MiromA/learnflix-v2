import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatDuration } from '../lib/format';
import type { LessonDTO } from '../api/client';

export default function LessonGrid({
  lessons,
  size,
  onToggleComplete,
}: {
  lessons: LessonDTO[];
  size: number;
  onToggleComplete: (id: string, completed: boolean) => void;
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${size}px, 45vw), 1fr))` }}>
      {lessons.map((l) => (
        <div key={l.id} className="bg-neutral-900 rounded-lg overflow-hidden relative">
          <Link to={`/lesson/${l.id}`}>
            <div className={`relative aspect-video overflow-hidden bg-neutral-800 ${l.missing ? 'opacity-40' : ''}`}>
              <img
                src={api.lessonThumbUrl(l.id)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
              />
              {l.missing && <span className="absolute left-1 top-1 rounded bg-amber-900/80 px-1 text-[10px] text-amber-200">não encontrada</span>}
              {!l.missing && !l.playable && <span className="absolute left-1 top-1 rounded bg-neutral-950/80 px-1 text-[10px] text-neutral-300">converter</span>}
            </div>
            <div className="p-2">
              <div className="text-sm truncate">{l.title}</div>
              <div className="text-xs text-neutral-500 flex justify-between">
                <span>{formatDuration(l.durationSec)}</span>
                <span>{l.completed ? '✓' : l.position > 0 ? '▓' : '○'}</span>
              </div>
            </div>
          </Link>
          <label
            className="absolute top-1 right-1 grid h-11 w-11 place-items-center"
            title="Marcar como concluída"
          >
            <input
              type="checkbox"
              checked={l.completed}
              onChange={(e) => onToggleComplete(l.id, e.target.checked)}
              className="w-4 h-4"
              aria-label="Marcar como concluída"
            />
          </label>
        </div>
      ))}
    </div>
  );
}
