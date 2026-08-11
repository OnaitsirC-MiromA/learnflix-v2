export interface CourseSummary {
  id: string; title: string; structure: 'modules' | 'flat';
  totalLessons: number; completedLessons: number; inProgressLessons: number;
  posterLessonId: string | null; lastActivityAt: string | null;
  collectionId: string | null;
}
export interface LessonDTO {
  id: string; title: string; module: string | null; relPath: string;
  orderIndex: number; durationSec: number | null; container: string;
  playable: boolean; missing: boolean;
  position: number; furthest: number; completed: boolean;
}
export interface LessonFull extends LessonDTO {
  courseId: string; courseTitle: string;
  prevLessonId: string | null; nextLessonId: string | null;
}
export interface ModuleDTO { name: string | null; lessons: LessonDTO[]; }
export type MaterialKind = 'pdf' | 'zip' | 'archive' | 'doc' | 'image' | 'other';
export interface MaterialDTO { id: string; module: string | null; relPath: string; name: string; kind: MaterialKind; sizeBytes: number; }
export interface CourseDetail {
  id: string; title: string; structure: 'modules' | 'flat'; rootPath: string;
  totalLessons: number; completedLessons: number; materialsCount: number;
  modules: ModuleDTO[];
  materials: MaterialDTO[];
  collectionId: string | null;
}
export const materialUrl = (id: string, download = false) => `/api/materials/${id}${download ? '?download=1' : ''}`;
export interface DirEntry { name: string; path: string; }
export interface BrowseResult { path: string | null; parent: string | null; dirs: DirEntry[]; }
export interface RepointSummary { matched: number; relinked: number; missing: number; added: number; structureChanged: boolean; }
export interface RootUnavailable { status: 'root_unavailable'; }
export interface Settings { allowedRootsExtra: string[]; }
export interface Collection { id: string; name: string; courseCount: number; }
export interface BatchImportResult {
  created: number; skipped: number; noVideos: number;
  courses: { id: string; title: string }[];
  skippedTitles: string[];   // já eram cursos
  noVideosTitles: string[];  // pastas sem nenhum vídeo
  unreadable: number;        // listados pela pasta, mas o sistema não entregou
  unreadableSample: string[];
}
export interface CourseRoot { id: string; path: string; createdAt: string; lastCheckedAt: string | null; }
// O que uma importação faria (prévia) ou fez (resumo) — é o mesmo cálculo dos dois lados.
export interface ImportPlan {
  created: number;              // cursos que entram
  merged: number;               // cursos que já existem e terão o progresso fundido
  missingFolder: number;
  missingFolderTitles: string[];
  collectionsCreated: number;
  lessonsWithProgress: number;
}
export type PlaybackVerdict = { playable: true } | { playable: false; reason: 'container' | 'codec'; remuxable: boolean };
export type ConvertResult = { status: 'converted' | 'already_playable' | 'transcode_required'; reason?: 'container' | 'codec' };

// Só declara Content-Type: application/json quando há corpo — um POST/DELETE sem corpo
// com esse header faz o Fastify rejeitar com FST_ERR_CTP_EMPTY_JSON_BODY (400).
async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = init?.body ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } : init?.headers;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let payload: { error?: string } | undefined;
    try {
      payload = (await res.json()) as { error?: string } | undefined;
    } catch {
      payload = undefined;
    }
    throw new Error(payload?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// Rotas de migração respondem 409 com { status: 'root_unavailable' } (pasta indisponível / curso inexistente).
// Tratamos o 409 como resposta válida para que o ramo RootUnavailable seja narrável por 'status' in res.
async function migrationFetch(url: string, init?: RequestInit): Promise<RepointSummary | RootUnavailable> {
  const headers = init?.body ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } : init?.headers;
  const res = await fetch(url, { ...init, headers });
  if (res.status === 409) return (await res.json()) as RootUnavailable;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as RepointSummary;
}

export const api = {
  listCourses: (archived?: boolean) => jsonFetch<CourseSummary[]>(`/api/courses${archived ? '?archived=1' : ''}`),
  getCourse: (id: string) => jsonFetch<CourseDetail>(`/api/courses/${id}`),
  createCourse: (path: string) => jsonFetch<{ id: string; existing?: boolean }>('/api/courses', { method: 'POST', body: JSON.stringify({ path }) }),
  browse: (path?: string) => jsonFetch<BrowseResult>(`/api/fs/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  getLesson: (id: string) => jsonFetch<LessonFull>(`/api/lessons/${id}`),
  saveProgress: (id: string, body: { position_sec: number; furthest_sec: number; duration_sec: number | null }) =>
    jsonFetch<void>(`/api/lessons/${id}/progress`, { method: 'PATCH', body: JSON.stringify(body) }),
  setComplete: (id: string, completed: boolean) =>
    jsonFetch<void>(`/api/lessons/${id}/complete`, { method: 'POST', body: JSON.stringify({ completed }) }),
  lessonThumbUrl: (id: string) => `/api/lessons/${id}/thumb`,
  courseCoverUrl: (id: string, v?: number) => `/api/courses/${id}/cover${v ? `?v=${v}` : ''}`,
  getInfo: () => jsonFetch<{ ffmpeg: boolean; version?: string }>('/api/info'),
  setCover: (courseId: string, lessonId: string, atSec: number) =>
    jsonFetch<void>(`/api/courses/${courseId}/cover`, { method: 'POST', body: JSON.stringify({ lessonId, atSec }) }),
  repointPreview: (id: string, path: string) =>
    migrationFetch(`/api/courses/${id}/repoint/preview`, { method: 'POST', body: JSON.stringify({ path }) }),
  repoint: (id: string, path: string) =>
    migrationFetch(`/api/courses/${id}/repoint`, { method: 'POST', body: JSON.stringify({ path }) }),
  rescan: (id: string) =>
    migrationFetch(`/api/courses/${id}/rescan`, { method: 'POST' }),
  patchCourse: (id: string, body: { title?: string; archived?: boolean; collectionId?: string | null }) =>
    jsonFetch<{ ok: true }>(`/api/courses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCourse: (id: string) => jsonFetch<void>(`/api/courses/${id}`, { method: 'DELETE' }),
  getSettings: () => jsonFetch<Settings>('/api/settings'),
  patchSettings: (body: Settings) => jsonFetch<Settings>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  verifyPlayback: (id: string) => jsonFetch<PlaybackVerdict>(`/api/lessons/${id}/verify-playback`, { method: 'POST' }),
  // 409 = precisa recodificar por fora; é resposta válida, não erro de rede.
  convertLesson: async (id: string): Promise<ConvertResult> => {
    const res = await fetch(`/api/lessons/${id}/convert`, { method: 'POST' });
    if (res.status === 409) return (await res.json()) as ConvertResult;
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as ConvertResult;
  },
  resetCourseProgress: (id: string) => jsonFetch<{ deleted: number }>(`/api/courses/${id}/progress/reset`, { method: 'POST' }),
  resetAllProgress: () => jsonFetch<{ deleted: number }>('/api/progress/reset', { method: 'POST' }),
  resetLibrary: () => jsonFetch<{ courses: number }>('/api/library/reset', { method: 'POST' }),
  listCollections: () => jsonFetch<Collection[]>('/api/collections'),
  createCollection: (name: string) => jsonFetch<{ id: string; name: string }>('/api/collections', { method: 'POST', body: JSON.stringify({ name }) }),
  renameCollection: (id: string, name: string) => jsonFetch<{ ok: true }>(`/api/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteCollection: (id: string) => jsonFetch<void>(`/api/collections/${id}`, { method: 'DELETE' }),
  batchImport: (path: string) => jsonFetch<BatchImportResult>('/api/courses/batch', { method: 'POST', body: JSON.stringify({ path }) }),
  listCourseRoots: () => jsonFetch<CourseRoot[]>('/api/courses/roots'),
  deleteCourseRoot: (id: string) => jsonFetch<void>(`/api/courses/roots/${id}`, { method: 'DELETE' }),
  // Link direto em vez de fetch + blob: o servidor já manda o Content-Disposition
  // com o nome datado, então o navegador baixa sozinho — e o <a> ainda vem com
  // teclado e menu de contexto de graça.
  exportLibraryUrl: '/api/library/export',
  importPreview: (data: unknown) =>
    jsonFetch<ImportPlan>('/api/library/import/preview', { method: 'POST', body: JSON.stringify(data) }),
  importLibrary: (data: unknown) =>
    jsonFetch<ImportPlan>('/api/library/import', { method: 'POST', body: JSON.stringify(data) }),
};
