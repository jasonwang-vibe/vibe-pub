import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb, getPageByUrlSegment } from '$lib/server/db';
import { buildCanonicalPath } from '$lib/server/slug';
import { renderMarkdown, parseFrontmatter } from '$lib/server/markdown';

export const load: PageServerLoad = async ({ params, platform, url }) => {
  if (!platform) throw error(500, 'No platform');
  const db = getDb(platform);

  const page = await getPageByUrlSegment(db, params.slug);

  if (!page) throw error(404, 'Page not found');
  if (page.access === 'private') throw error(403, 'Private');

  const canonicalPath = buildCanonicalPath(page) + '/print';
  if (url.pathname !== canonicalPath) {
    throw redirect(301, canonicalPath + url.search);
  }

  const { content, data: fm } = parseFrontmatter(page.markdown);
  const html = await renderMarkdown(content);

  return {
    title: page.title ?? fm.title ?? page.id,
    html,
    canonicalPath: buildCanonicalPath(page),
    created: page.created,
    updated: page.updated,
  };
};
