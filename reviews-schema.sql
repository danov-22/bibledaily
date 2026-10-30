CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  anonymous INTEGER NOT NULL DEFAULT 1 CHECK (anonymous IN (0, 1)),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at TEXT
);
CREATE INDEX IF NOT EXISTS reviews_created ON reviews(created_at DESC, id DESC);
