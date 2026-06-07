import type { PageServerLoad } from './$types';
import { getDb, getAllPages } from '$lib/server/db';
import { buildCanonicalPath } from '$lib/server/slug';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform) return { pages: [] };
  try {
    const db = getDb(platform);
    const pages = await getAllPages(db, 50);
    return {
      pages: pages.map((p) => ({
        id: p.id,
        title: p.title,
        view: p.view ?? 'doc',
        theme: p.theme ?? 'default',
        created: p.created,
        markdown: p.markdown,
        canonicalPath: buildCanonicalPath(p),
      })),
    };
  } catch {
    return { pages: [] };
  }
};
