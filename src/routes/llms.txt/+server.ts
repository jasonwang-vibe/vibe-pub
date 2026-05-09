import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { buildCanonicalPath } from '$lib/server/slug';
import type { Page } from '$lib/types';

// /llms.txt — index of public pages for LLM agents.
// See https://llmstxt.org for the convention.
//
// Only pages with access='public' are listed. 'unlisted' pages are intentionally
// excluded — they are reachable by URL but should not be discovered.
export const GET: RequestHandler = async ({ platform, url }) => {
  if (!platform) throw error(500, 'No platform');
  const db = getDb(platform);

  const { results } = await db
    .prepare(
      "SELECT id, slug, title, view FROM pages WHERE access = 'public' ORDER BY updated DESC LIMIT 1000"
    )
    .all<Pick<Page, 'id' | 'slug' | 'title' | 'view'>>();

  const origin = url.origin;
  const lines: string[] = [];
  lines.push('# vibe.pub');
  lines.push('');
  lines.push(
    '> Public markdown pages on vibe.pub. Each entry links to the rendered HTML; append `.md` to any URL for the raw markdown source.'
  );
  lines.push('');
  lines.push('## Pages');
  lines.push('');

  for (const p of results) {
    const title = p.title?.trim() || p.id;
    const tag = p.view && p.view !== 'doc' ? ` [${p.view}]` : '';
    const path = buildCanonicalPath(p);
    lines.push(`- [${title}](${origin}${path})${tag} — markdown: ${origin}${path}.md`);
  }

  lines.push('');
  lines.push('## Bulk');
  lines.push('');
  lines.push(`- [Full content of all public pages](${origin}/llms-full.txt)`);
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=600',
    },
  });
};
