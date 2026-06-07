import type { PageServerLoad } from './$types';
import { getDb, getAllPages } from '$lib/server/db';
import { buildCanonicalPath } from '$lib/server/slug';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform) return { pages: [] };
  const db = getDb(platform);
  const pages = await getAllPages(db, 200);
  return {
    pages: pages.map((p) => ({
      id: p.id,
      title: p.title,
      view: p.view,
      theme: p.theme,
      created: p.created,
      canonicalPath: buildCanonicalPath(p),
    })),
  };
};
