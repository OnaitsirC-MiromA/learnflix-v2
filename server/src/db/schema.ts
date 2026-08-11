// Schema inicial do Learnflix.
//
// Princípio central: o progresso NUNCA se prende a um caminho absoluto. O curso
// tem um id interno estável e a aula é identificada pelo rel_path dentro dele —
// mover a pasta de origem e re-apontar preserva todo o histórico.
export const SCHEMA_V1 = `
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sort_index INTEGER
);

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  root_path TEXT NOT NULL,
  structure TEXT NOT NULL CHECK (structure IN ('modules','flat')),
  archived INTEGER NOT NULL DEFAULT 0,
  sort_index INTEGER,
  poster_lesson_id TEXT,
  cover_path TEXT,
  collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_scanned_at TEXT
);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  module TEXT,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  module_order INTEGER NOT NULL,
  duration_sec REAL,
  size_bytes INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  container TEXT NOT NULL,
  playable INTEGER NOT NULL DEFAULT 1,
  thumb_path TEXT,
  missing INTEGER NOT NULL DEFAULT 0,
  UNIQUE (course_id, rel_path)
);
CREATE INDEX idx_lessons_course ON lessons(course_id, order_index);

CREATE TABLE materials (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module TEXT,
  rel_path TEXT NOT NULL,
  kind TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  UNIQUE (course_id, rel_path)
);

CREATE TABLE progress (
  lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  position_sec REAL NOT NULL DEFAULT 0,
  furthest_sec REAL NOT NULL DEFAULT 0,
  duration_sec REAL,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  auto_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Pastas-raiz usadas na importação em lote, para oferecer "Verificar novos
-- cursos" sem precisar renavegar a árvore toda de novo.
CREATE TABLE course_roots (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_checked_at TEXT
);
`;
