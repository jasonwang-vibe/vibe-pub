import { writable } from 'svelte/store';

/** Kanban reader: full-width board (Header ··· + Appearance panel + board toolbar). */
export const kanbanReaderBoardFullwidth = writable(true);

/** Reader “Appearance” side panel open state. */
export const readerAppearancePanelOpen = writable(false);

export function openReaderAppearancePanel() {
  readerAppearancePanelOpen.set(true);
}

export function closeReaderAppearancePanel() {
  readerAppearancePanelOpen.set(false);
}

/** Playground input panel open state — shared between Header toggle and page. */
export const playgroundPanelOpen = writable(false);

/** True when the playground is showing a preview (not the default/empty page). */
export const playgroundPreviewActive = writable(false);

/** Reset callback the playground registers so the Header "Back" button can call it. */
export const playgroundBackAction = writable<(() => void) | null>(null);
