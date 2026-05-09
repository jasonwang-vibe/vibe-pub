import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb, getPageByUrlSegment } from '$lib/server/db';
import { buildCanonicalPath } from '$lib/server/slug';

export const load: PageServerLoad = async ({ params, platform, locals, url }) => {
  if (!platform) throw error(500, 'No platform');
  const db = getDb(platform);

  const page = await getPageByUrlSegment(db, params.slug);
  if (!page) throw error(404, 'Page not found');

  // Version history is only visible to the page owner (claimed pages only).
  if (!page.user_id || locals.user?.id !== page.user_id) {
    throw error(403, 'Not authorized');
  }

  const canonicalPath = buildCanonicalPath(page) + '/history';
  if (url.pathname !== canonicalPath) {
    throw redirect(301, canonicalPath + url.search);
  }

  const versions = await db
    .prepare(
      'SELECT version, title, created FROM page_versions WHERE page_id = ? ORDER BY version DESC'
    )
    .bind(page.id)
    .all<{ version: number; title: string | null; created: string }>();

  const versionDetails = await db
    .prepare(
      'SELECT version, title, markdown, created FROM page_versions WHERE page_id = ? ORDER BY version DESC'
    )
    .bind(page.id)
    .all<{ version: number; title: string | null; markdown: string; created: string }>();

  return {
    page: {
      id: page.id,
      slug: page.slug,
      title: page.title,
      markdown: page.markdown,
      updated: page.updated,
    },
    canonicalPath: buildCanonicalPath(page),
    versions: versions.results,
    versionDetails: versionDetails.results,
  };
};
