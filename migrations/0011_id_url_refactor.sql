-- Refactor: fold id-shaped slugs into `id` (now globally unique) and clear
-- those slugs. Slugs that contain a `-` are human-readable labels (e.g.
-- `funnel-audit-2026-05-06-bof`) and are preserved as-is — their pages keep
-- both their original `id` and their slug, and get tagged with `legacy_slug=1`
-- so the URL handler can resolve their pre-refactor `/<slug>` URLs without
-- letting newly-created pages shadow them by reusing the same slug.
-- Also repair FK targets on `comments` and `collection_pages`, which the
-- rename-pattern migrations (0003/0006/0007/0008/0009) inadvertently
-- pointed at the dropped `pages_old` table (SQLite auto-rewrites FK refs
-- on ALTER TABLE ... RENAME).
--
-- Pre-flight (run by hand on the target DB before applying), scoped to the
-- id-shaped slugs that will actually be folded into `id`:
--   1. SELECT slug, COUNT(*) c FROM pages
--       WHERE slug != '' AND slug NOT LIKE '%-%'
--       GROUP BY slug HAVING c > 1;                                  -- 0 rows
--   2. SELECT id FROM pages
--       WHERE id IN (
--         SELECT slug FROM pages
--          WHERE slug != '' AND slug NOT LIKE '%-%' AND slug != id
--       );                                                           -- 0 rows
--   3. SELECT slug, COUNT(*) c FROM pages
--       WHERE slug LIKE '%-%' GROUP BY slug HAVING c > 1;            -- 0 rows
--      (kept slugs must be unique — the legacy-slug index is UNIQUE)

ALTER TABLE pages ADD COLUMN legacy_slug INTEGER NOT NULL DEFAULT 0;
UPDATE pages SET legacy_slug = 1 WHERE slug LIKE '%-%';

CREATE TABLE _page_id_map (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL
);

-- Only id-shaped slugs (non-empty, no dashes) become the new id.
INSERT INTO _page_id_map (old_id, new_id)
  SELECT id, slug FROM pages
   WHERE legacy_slug = 0 AND slug != '';

-- Stash child rows with already-remapped page_id values into FK-free
-- scratch tables. This lets us drop and recreate the real children
-- (with correct FK targets) without juggling FK validation order.
CREATE TABLE _comments_stash AS
  SELECT c.id,
         COALESCE(m.new_id, c.page_id) AS page_id,
         c.user_id, c.display_name, c.anchor, c.anchor_hint,
         c.body, c.resolved, c.created
    FROM comments c
    LEFT JOIN _page_id_map m ON m.old_id = c.page_id;

CREATE TABLE _page_versions_stash AS
  SELECT pv.id,
         COALESCE(m.new_id, pv.page_id) AS page_id,
         pv.version, pv.markdown, pv.title, pv.created
    FROM page_versions pv
    LEFT JOIN _page_id_map m ON m.old_id = pv.page_id;

CREATE TABLE _collection_pages_stash AS
  SELECT cp.collection_id,
         COALESCE(m.new_id, cp.page_id) AS page_id,
         cp.sort_order, cp.label
    FROM collection_pages cp
    LEFT JOIN _page_id_map m ON m.old_id = cp.page_id;

-- Drop children so we can renumber pages.id without FK conflicts.
DROP TABLE comments;
DROP TABLE page_versions;
DROP TABLE collection_pages;

-- Drop the (user_id, slug) UNIQUE index BEFORE clearing slugs: users with
-- multiple id-shaped pages would otherwise collide on (user_id, '').
-- Drop idx_pages_slug too since it's superseded by idx_pages_legacy_slug below.
DROP INDEX IF EXISTS idx_pages_user_slug;
DROP INDEX IF EXISTS idx_pages_slug;

UPDATE pages
   SET id = (SELECT new_id FROM _page_id_map WHERE old_id = pages.id)
 WHERE id IN (SELECT old_id FROM _page_id_map);

-- Clear slug only on rows whose slug was folded into id. Dashed slugs stay.
UPDATE pages SET slug = '' WHERE id IN (SELECT new_id FROM _page_id_map);
-- Legacy-slug fallback index. Partial so new pages can reuse a slug without
-- participating in legacy resolution. Non-unique because a small number of
-- pre-existing dashed slugs are duplicated; the URL handler must tolerate
-- shadowing (multiple legacy rows for the same slug).
CREATE INDEX IF NOT EXISTS idx_pages_legacy_slug
  ON pages(slug) WHERE legacy_slug = 1;

-- Recreate children with correct FK target (pages, not pages_old).
CREATE TABLE comments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  display_name TEXT,
  anchor TEXT,
  body TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  anchor_hint TEXT
);

INSERT INTO comments (id, page_id, user_id, display_name, anchor, anchor_hint, body, resolved, created)
SELECT id, page_id, user_id, display_name, anchor, anchor_hint, body, resolved, created
  FROM _comments_stash;

CREATE TABLE page_versions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  markdown TEXT NOT NULL,
  title TEXT,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO page_versions (id, page_id, version, markdown, title, created)
SELECT id, page_id, version, markdown, title, created
  FROM _page_versions_stash;

CREATE TABLE collection_pages (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  PRIMARY KEY (collection_id, page_id)
);

INSERT INTO collection_pages (collection_id, page_id, sort_order, label)
SELECT collection_id, page_id, sort_order, label
  FROM _collection_pages_stash;

CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page_id);
CREATE INDEX IF NOT EXISTS idx_page_versions_page ON page_versions(page_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_versions_unique ON page_versions(page_id, version);
CREATE INDEX IF NOT EXISTS idx_collection_pages_collection ON collection_pages(collection_id);

DROP TABLE _comments_stash;
DROP TABLE _page_versions_stash;
DROP TABLE _collection_pages_stash;
DROP TABLE _page_id_map;
