/** Client-safe sentinel slug for the playground collection preview.
 * Lives apart from manifest.ts so the browser bundle never imports server-only code. */
export const PLAYGROUND_COLLECTION_SLUG = '__playground__';
