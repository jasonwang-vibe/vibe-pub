// Legacy `/@user/<slug>` URL — collapse to canonical `/<slug>-<id>` via /[slug] handler.
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  throw redirect(301, `/${params.slug}${url.search}`);
};
