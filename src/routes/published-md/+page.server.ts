import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getDb, getAllPages, deletePage } from '$lib/server/db';
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

export const actions: Actions = {
  delete: async ({ request, platform }) => {
    if (!platform) return fail(500, { error: 'No platform' });
    const data = await request.formData();
    const id = data.get('id') as string;
    if (!id) return fail(400, { error: 'Missing id' });
    const db = getDb(platform);
    await deletePage(db, id);
    return { deleted: id };
  },
};
