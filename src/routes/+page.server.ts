import type { PageServerLoad } from './$types';
import { getDb, getAllPages, getCommentsByPage } from '$lib/server/db';
import { buildCanonicalPath } from '$lib/server/slug';
import { parseFrontmatter } from '$lib/server/markdown';

/** First real paragraph of the body, stripped of markdown, for the feed lede. */
function extractLede(markdown: string): string {
  const { content } = parseFrontmatter(markdown);
  const para: string[] = [];
  for (const raw of content.split('\n')) {
    const l = raw.trim();
    const isBreak = !l || /^(#{1,6}\s|`{3}|>|[-*+]\s|\d+\.\s|\||!\[)/.test(l);
    if (isBreak) {
      if (para.length) break;
      continue;
    }
    para.push(l);
  }
  let text = para
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .trim();
  if (text.length > 180) text = text.slice(0, 177).trimEnd() + '…';
  return text;
}

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform) return { stats: null, feed: [] };
  try {
    const db = getDb(platform);
    const pages = await getAllPages(db, 200);
    const now = Date.now();
    const WEEK = 7 * 24 * 3600 * 1000;
    const HOUR = 3600 * 1000;
    const ms = (s: string) => new Date(s).getTime();

    const week = pages.filter((p) => now - ms(p.created) <= WEEK).length;
    const hour = pages.filter((p) => now - ms(p.created) <= HOUR).length;

    const feed = await Promise.all(
      pages.slice(0, 3).map(async (p) => {
        let comments = 0;
        try {
          comments = (await getCommentsByPage(db, p.id)).length;
        } catch {
          comments = 0;
        }
        return {
          title: p.title ?? 'Untitled',
          lede: extractLede(p.markdown),
          path: buildCanonicalPath(p),
          byAgent: p.agent_published === 1,
          created: p.created,
          comments,
        };
      })
    );

    return { stats: { week, hour, total: pages.length }, feed };
  } catch {
    return { stats: null, feed: [] };
  }
};
