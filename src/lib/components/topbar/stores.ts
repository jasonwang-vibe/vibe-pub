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
