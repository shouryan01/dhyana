CREATE TABLE notes (
  path TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  title TEXT,
  title_key TEXT,
  relationship TEXT,
  birthday TEXT,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL
);
CREATE INDEX notes_name_key ON notes(name_key);
CREATE INDEX notes_kind ON notes(kind);

CREATE TABLE aliases (
  path TEXT NOT NULL,
  alias TEXT NOT NULL,
  alias_key TEXT NOT NULL
);
CREATE INDEX aliases_key ON aliases(alias_key);
CREATE INDEX aliases_path ON aliases(path);

CREATE TABLE links (
  src TEXT NOT NULL,
  ord INTEGER NOT NULL,
  target TEXT NOT NULL,
  target_key TEXT NOT NULL,
  label TEXT,
  context TEXT NOT NULL
);
CREATE INDEX links_target ON links(target_key);
CREATE INDEX links_src ON links(src);

CREATE TABLE tags (
  src TEXT NOT NULL,
  tag TEXT NOT NULL,
  tag_key TEXT NOT NULL
);
CREATE INDEX tags_key ON tags(tag_key);
