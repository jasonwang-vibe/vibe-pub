/**
 * Playground render endpoint — PURE (no DB, no secrets, no platform bindings).
 *
 * POST { files: [{ name, content }] } → JSON describing how to render:
 *   - 1 file (no _collection.md)        → { mode:'single', ...viewData }
 *   - many files, no _collection.md     → { mode:'folder', files:[…] }
 *   - any set containing _collection.md → { mode:'collection', cover, pagesById, order }
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseFrontmatter, renderMarkdown } from '$lib/server/markdown';
import { detectView } from '$lib/templates/detect';
import { parseKanbanBlocks } from '$lib/templates/kanban/parser';
import { parseSlidesBlocks } from '$lib/templates/slides/parser';
import { parseChangelogBlocks } from '$lib/templates/changelog/parser';
import { parseTimelineBlocks } from '$lib/templates/timeline/parser';
import { parseDashboardBlocks } from '$lib/templates/dashboard/parser';
import { buildCollectionPreview, type InputFile } from '$lib/templates/collection/manifest';

const stripExt = (s: string) => s.replace(/\.md$/i, '');
const firstH1 = (md: string) => {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
};
const isManifest = (name: string) => /(^|\/)_collection\.md$/i.test(name);

function resolveView(markdown: string, override?: string) {
  const { data: fm, content } = parseFrontmatter(markdown);
  const view = override || (typeof fm.view === 'string' && fm.view) || detectView(content);
  return { view, content, fm };
}

async function renderSingle(file: InputFile, override?: string) {
  const { view, content, fm } = resolveView(file.content, override);
  const title =
    (typeof fm.title === 'string' && fm.title) || firstH1(content) || stripExt(file.name);
  const base = { name: file.name, title, view, frontmatter: fm };

  switch (view) {
    case 'kanban': {
      const k = parseKanbanBlocks(file.content);
      return {
        ...base,
        view,
        markdown: k.normalizedMarkdown,
        kanban: { columns: k.columns, labels: k.labels },
      };
    }
    case 'slides': {
      const s = parseSlidesBlocks(file.content);
      return { ...base, view, slides: s.slides };
    }
    case 'changelog': {
      const c = parseChangelogBlocks(file.content);
      return { ...base, view, releases: c.releases };
    }
    case 'timeline': {
      const t = parseTimelineBlocks(file.content);
      return { ...base, view, sections: t.sections };
    }
    case 'dashboard': {
      const d = parseDashboardBlocks(file.content);
      return { ...base, view, sections: d.sections };
    }
    default: {
      const html = await renderMarkdown(content);
      return { ...base, view: 'doc', html };
    }
  }
}

function renderFolderEntry(file: InputFile) {
  const { view, content, fm } = resolveView(file.content);
  const title =
    (typeof fm.title === 'string' && fm.title) || firstH1(content) || stripExt(file.name);
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  return { filename: file.name.replace(/^\.?\//, ''), title, type: view, words };
}

export const POST: RequestHandler = async ({ request }) => {
  let body: { files?: InputFile[]; view?: string };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const files = (body.files ?? []).filter((f) => f && typeof f.content === 'string');
  if (files.length === 0) return json({ mode: 'empty' });

  const manifest = files.find((f) => isManifest(f.name));

  // Collection: any set that includes a _collection.md
  if (manifest) {
    const { cover, pagesById, order } = await buildCollectionPreview(files, manifest);
    return json({ mode: 'collection', cover, pagesById, order });
  }

  // Folder: multiple files, no manifest
  if (files.length > 1) {
    return json({ mode: 'folder', files: files.map(renderFolderEntry) });
  }

  // Single file
  const result = await renderSingle(files[0], body.view);
  return json({ mode: 'single', ...result });
};
