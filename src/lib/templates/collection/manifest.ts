/**
 * Playground-only: build a collection `PageData`-shaped bundle from uploaded
 * markdown files + a `_collection.md` manifest, WITHOUT a database.
 *
 * Reuses the pure builders from `./server` (buildNavStructure, buildChapterNav,
 * buildCoverParts) and renders chapter HTML with the same `renderMarkdown` the
 * real collection route uses. Comments are always empty (no DB).
 *
 * Manifest (`_collection.md`) format:
 *   ---
 *   title: My Collection
 *   description: ...
 *   theme: default
 *   readers_guide / what_its_about / who_its_for / how_to_read_it: ...
 *   ---
 *   ## Part One           ← optional part grouping
 *   - intro.md            ← page references (bullet, bare, or [label](file.md))
 *   - basics.md
 *   ## Part Two
 *   - advanced.md
 *
 * Files not referenced in the manifest are appended as ungrouped pages.
 */
import { parseFrontmatter, renderMarkdown } from '$lib/server/markdown';
import { detectView } from '$lib/templates/detect';
import { parseKanbanBlocks } from '$lib/templates/kanban/parser';
import {
  buildNavStructure,
  buildChapterNav,
  buildCoverParts,
  type CollectionPageRow,
  type CollectionPartRow,
} from '$lib/templates/collection/server';
import { PLAYGROUND_COLLECTION_SLUG } from './playground-slug';

export interface InputFile {
  name: string;
  content: string;
}

const normName = (n: string) => n.replace(/^\.?\//, '');
const stripExt = (s: string) => s.replace(/\.md$/i, '');
const slugify = (s: string) =>
  stripExt(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'page';
const firstH1 = (md: string) => {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
};

function parseManifestBody(body: string): {
  parts: { title: string; files: string[] }[];
  flat: string[];
} {
  const parts: { title: string; files: string[] }[] = [];
  const flat: string[] = [];
  let current: { title: string; files: string[] } | null = null;

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      current = { title: heading[1].trim(), files: [] };
      parts.push(current);
      continue;
    }

    const link = line.match(/\(([^)]+\.md)\)/i);
    const bullet = line.replace(/^[-*+]\s+/, '');
    const ref = normName((link ? link[1] : bullet).trim());
    if (/\.md$/i.test(ref)) {
      flat.push(ref);
      if (current) current.files.push(ref);
    }
  }
  return { parts, flat };
}

function pageRowFromFile(
  name: string,
  content: string,
  sortOrder: number,
  partId: string | null
): CollectionPageRow {
  const { data: fm, content: body } = parseFrontmatter(content);
  const view = (typeof fm.view === 'string' && fm.view) || detectView(body);
  const id = slugify(name);
  const title = (typeof fm.title === 'string' && fm.title) || firstH1(body) || stripExt(name);
  return {
    page_id: id,
    sort_order: sortOrder,
    label: null,
    part_id: partId,
    id,
    slug: id,
    title,
    markdown: content,
    view,
    updated: '',
  };
}

async function renderChapter(p: CollectionPageRow) {
  const { content, data: fm } = parseFrontmatter(p.markdown);
  const isKanban = p.view === 'kanban';
  const html = isKanban ? '' : await renderMarkdown(content);
  let kanbanData: { columns: unknown[]; labels: Record<string, string> } | null = null;
  if (isKanban) {
    try {
      const k = parseKanbanBlocks(p.markdown);
      kanbanData = { columns: k.columns, labels: k.labels };
    } catch {
      kanbanData = { columns: [], labels: {} };
    }
  }
  return {
    html,
    comments: [] as unknown[],
    frontmatter: fm,
    kanbanData,
    sourceMarkdownHref: `${p.slug}.md`,
  };
}

export async function buildCollectionPreview(allFiles: InputFile[], manifestFile: InputFile) {
  const mfm = parseFrontmatter(manifestFile.content).data as Record<string, unknown>;
  const mbody = parseFrontmatter(manifestFile.content).content;

  const contentFiles = allFiles.filter((f) => !/(^|\/)_collection\.md$/i.test(f.name));
  const byName = new Map(contentFiles.map((f) => [normName(f.name), f]));

  const { parts: manifestParts, flat } = parseManifestBody(mbody);
  const hasParts = manifestParts.length > 0;

  const partsMeta: CollectionPartRow[] = manifestParts.map((p, i) => ({
    id: `part-${i + 1}`,
    title: p.title,
    sort_order: i,
  }));
  const partIdForFile = new Map<string, string>();
  if (hasParts) {
    manifestParts.forEach((p, i) => p.files.forEach((f) => partIdForFile.set(f, `part-${i + 1}`)));
  }

  // Manifest order first, then any unreferenced files appended (ungrouped).
  const referenced = new Set(flat);
  const orderedNames = [
    ...flat.filter((n) => byName.has(n)),
    ...contentFiles.map((f) => normName(f.name)).filter((n) => !referenced.has(n)),
  ];

  const pages: CollectionPageRow[] = orderedNames.map((name, i) =>
    pageRowFromFile(name, byName.get(name)!.content, i, partIdForFile.get(name) ?? null)
  );

  const str = (k: string) => (typeof mfm[k] === 'string' ? (mfm[k] as string) : null);
  const collection = {
    title: str('title') || 'Untitled collection',
    slug: PLAYGROUND_COLLECTION_SLUG,
    description: str('description'),
    theme: str('theme') || 'default',
    updated: '',
    access: 'public',
    readers_guide: str('readers_guide'),
    what_its_about: str('what_its_about'),
    who_its_for: str('who_its_for'),
    how_to_read_it: str('how_to_read_it'),
  };

  const shared = {
    collection,
    owner: null,
    coverParts: buildCoverParts(partsMeta, pages),
    isCollectionOwner: false,
    settingsChapters: [],
    settingsParts: [],
    user: null,
    allHeadings: [],
  };

  const navCover = buildNavStructure(pages, partsMeta, '');
  const cover = {
    ...shared,
    showCover: true,
    parts: navCover.parts,
    ungroupedPages: navCover.ungroupedPages,
    pages: navCover.flatPages,
    activePart: null,
    activePage: null,
    chapter: null,
  };

  const pagesById: Record<string, unknown> = {};
  for (const p of pages) {
    const nav = buildNavStructure(pages, partsMeta, p.id);
    const { chapter, activePart } = buildChapterNav(
      nav.flatPages,
      p,
      collection.slug,
      partsMeta,
      nav.parts
    );
    const cc = await renderChapter(p);
    pagesById[p.id] = {
      ...shared,
      showCover: false,
      parts: nav.parts,
      ungroupedPages: nav.ungroupedPages,
      pages: nav.flatPages,
      activePart,
      chapter,
      activePage: {
        id: p.id,
        slug: p.slug,
        title: p.title,
        markdown: p.markdown,
        view: p.view,
        updated: p.updated,
        ...cc,
      },
    };
  }

  return { cover, pagesById, order: pages.map((p) => p.id) };
}
