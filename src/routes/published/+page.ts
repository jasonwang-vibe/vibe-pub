import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
  return {
    path: url.searchParams.get('path') ?? '/',
    url: url.searchParams.get('url') ?? '',
  };
};
