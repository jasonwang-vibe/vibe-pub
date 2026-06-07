// The playground mounts rich interactive reader components (incl. the collection
// Reader, which reads $app/state and renders panels). Render client-only; the
// heavy markdown work happens in the pure /api/preview endpoint.
export const ssr = false;
export const prerender = false;
