import { useCourse } from '../api/hooks';
import { api } from '../api/client';

export default function PlaylistSidebar({
  courseId,
  currentLessonId,
  open,
  onClose,
  onJump,
}: {
  courseId: string;
  currentLessonId: string;
  open: boolean;
  onClose: () => void;
  onJump: (lessonId: string) => void;
}) {
  const { data } = useCourse(courseId);
  if (!open) return null;
  return (
    <>
      {/* Backdrop tocável — só no celular, onde a sidebar vira drawer full-width. */}
      <div className="fixed inset-0 z-10 bg-black/60 sm:hidden" onClick={onClose} />
      <div
        className="absolute top-0 right-0 h-screen w-full max-w-sm overflow-y-auto border-l border-neutral-800 bg-neutral-950/95 sm:w-72 z-20"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between p-3 border-b border-neutral-800 sticky top-0 bg-neutral-950">
          <span className="text-sm font-medium truncate">{data?.title ?? 'Aulas'}</span>
          <button onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center text-neutral-400">
            ✕
          </button>
        </div>
        {data?.modules.map((m) => (
          <div key={m.name ?? '__flat__'}>
            {m.name && <div className="px-3 py-1 text-xs text-neutral-500 mt-2">{m.name}</div>}
            {m.lessons.map((l) => {
              const status = l.completed ? '✓' : l.position > 0 ? '▓' : '○';
              const isCurrent = l.id === currentLessonId;
              return (
                <button
                  key={l.id}
                  onClick={() => onJump(l.id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm ${isCurrent ? 'bg-blue-600/30' : 'hover:bg-neutral-800'}`}
                >
                  <span className="w-4 text-center text-neutral-400">{status}</span>
                  <img
                    src={api.lessonThumbUrl(l.id)}
                    alt=""
                    className="w-12 aspect-video object-cover rounded bg-neutral-800 shrink-0"
                    loading="lazy"
                    onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
                  />
                  <span className="flex-1 truncate">{l.title}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
