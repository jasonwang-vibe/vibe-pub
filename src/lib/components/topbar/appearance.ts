import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import type { PageTheme } from '$lib/types';

const STORAGE_KEY = 'vibe-reader-appearance-v1';

export type ReaderMeasure = '680px' | '780px' | '880px';
export type ReaderReadingMode = 'paged' | 'scroll';

export const READER_DARK_THEMES: PageTheme[] = [
  'terminal',
  'midnight',
  'raycast',
  'monokai',
  'dracula',
];

export const READER_APPEARANCE_THEMES: {
  id: PageTheme;
  label: string;
  chipClass: string;
}[] = [
  { id: 'default', label: 'default', chipClass: 'ap-chip-default' },
  { id: 'paper', label: 'paper', chipClass: 'ap-chip-paper' },
  { id: 'claude', label: 'claude', chipClass: 'ap-chip-claude' },
  { id: 'solarized', label: 'solarized', chipClass: 'ap-chip-solarized' },
  { id: 'midnight', label: 'midnight', chipClass: 'ap-chip-midnight' },
  { id: 'terminal', label: 'terminal', chipClass: 'ap-chip-terminal' },
];

export const READER_MEASURE_OPTIONS: {
  value: ReaderMeasure;
  label: string;
}[] = [
  { value: '680px', label: 'narrow' },
  { value: '780px', label: 'normal' },
  { value: '880px', label: 'wide' },
];

/** A heading + body font pairing offered for a theme's typography setting. */
export interface FontPairing {
  /** Matches the `.font-pair-<id>` selector in app.css (e.g. `paper-02`). */
  id: string;
  /** Short chip label, e.g. `01`. */
  label: string;
  /** Heading font display name (shown in the chip). */
  heading: string;
  /** Body font display name (shown in the chip). */
  body: string;
}

/**
 * Per-theme font pairings. The FIRST entry is the theme's default — it is baked
 * into the `.theme-*` base rules in app.css, so it needs no `.font-pair-*` class.
 * Additional entries are applied by toggling `.font-pair-<id>` on `<html>`.
 */
export const THEME_FONT_PAIRINGS: Partial<Record<PageTheme, FontPairing[]>> = {
  paper: [
    { id: 'paper-01', label: '01', heading: 'Libre Baskerville', body: 'EB Garamond' },
    { id: 'paper-02', label: '02', heading: 'Cormorant Garamond', body: 'Newsreader' },
  ],
  claude: [
    { id: 'claude-01', label: '01', heading: 'DM Serif Display', body: 'DM Sans' },
    { id: 'claude-02', label: '02', heading: 'Spectral', body: 'Plus Jakarta Sans' },
  ],
  solarized: [
    { id: 'solarized-01', label: '01', heading: 'IBM Plex Sans', body: 'IBM Plex Sans' },
    { id: 'solarized-02', label: '02', heading: 'DM Sans', body: 'Nunito' },
  ],
  midnight: [
    { id: 'midnight-01', label: '01', heading: 'Cinzel', body: 'Quattrocento Sans' },
    { id: 'midnight-02', label: '02', heading: 'Marvel', body: 'Barlow' },
  ],
  terminal: [
    { id: 'terminal-01', label: '01', heading: 'JetBrains Mono', body: 'JetBrains Mono' },
    { id: 'terminal-02', label: '02', heading: 'IBM Plex Mono', body: 'IBM Plex Mono' },
  ],
};

/** Font pairings available for a theme (empty when the theme has none). */
export function fontPairingsForTheme(theme: PageTheme | null | undefined): FontPairing[] {
  return (theme ? THEME_FONT_PAIRINGS[theme] : undefined) ?? [];
}

/** Selected pairing id for a theme, falling back to its default (first) pairing. */
export function effectiveFontPairingId(
  theme: PageTheme | null | undefined,
  selections: Record<string, string>
): string | null {
  const pairings = fontPairingsForTheme(theme);
  if (!pairings.length) return null;
  const sel = theme ? selections[theme] : undefined;
  if (sel && pairings.some((p) => p.id === sel)) return sel;
  return pairings[0].id;
}

/** Every pairing id across all themes — the `.font-pair-*` classes we toggle on `<html>`. */
export const ALL_FONT_PAIRING_IDS: string[] = Object.values(THEME_FONT_PAIRINGS)
  .flatMap((pairings) => pairings ?? [])
  .map((p) => p.id);

const LEGACY_MEASURE_MAP: Record<string, ReaderMeasure> = {
  '580px': '680px',
  '680px': '780px',
  '780px': '880px',
};

function normalizeMeasure(raw: unknown): ReaderMeasure | null {
  if (typeof raw !== 'string') return null;
  if (READER_MEASURE_OPTIONS.some((o) => o.value === raw)) {
    return raw as ReaderMeasure;
  }
  return LEGACY_MEASURE_MAP[raw] ?? null;
}

type AppearancePrefs = {
  fontSize: number;
  measure: ReaderMeasure;
  readingMode: ReaderReadingMode;
  /** Map of theme id → chosen font-pairing id (only non-default choices persist). */
  fontPairings: Record<string, string>;
};

function normalizeFontPairings(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [theme, id] of Object.entries(raw as Record<string, unknown>)) {
    if (
      typeof id === 'string' &&
      fontPairingsForTheme(theme as PageTheme).some((p) => p.id === id)
    ) {
      out[theme] = id;
    }
  }
  return out;
}

function loadPrefs(): AppearancePrefs {
  const defaults: AppearancePrefs = {
    fontSize: 18,
    measure: '780px',
    readingMode: 'paged',
    fontPairings: {},
  };
  if (!browser) return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs>;
    const fontSize =
      typeof parsed.fontSize === 'number' && parsed.fontSize >= 14 && parsed.fontSize <= 22
        ? parsed.fontSize
        : defaults.fontSize;
    const measure = normalizeMeasure(parsed.measure) ?? defaults.measure;
    const readingMode =
      parsed.readingMode === 'scroll' || parsed.readingMode === 'paged'
        ? parsed.readingMode
        : defaults.readingMode;
    const fontPairings = normalizeFontPairings(parsed.fontPairings);
    return { fontSize, measure, readingMode, fontPairings };
  } catch {
    return defaults;
  }
}

const initialPrefs = loadPrefs();

/** Session theme override (null = use published / collection default). */
export const readerThemePreview = writable<PageTheme | null>(null);
export const readerFontSize = writable(initialPrefs.fontSize);
export const readerMeasure = writable<ReaderMeasure>(initialPrefs.measure);
export const readerReadingMode = writable<ReaderReadingMode>(initialPrefs.readingMode);
/** Map of theme id → chosen font-pairing id (see {@link THEME_FONT_PAIRINGS}). */
export const readerFontPairings = writable<Record<string, string>>(initialPrefs.fontPairings);

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (!browser) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        fontSize: get(readerFontSize),
        measure: get(readerMeasure),
        readingMode: get(readerReadingMode),
        fontPairings: get(readerFontPairings),
      })
    );
  }, 120);
}

if (browser) {
  readerFontSize.subscribe(schedulePersist);
  readerMeasure.subscribe(schedulePersist);
  readerReadingMode.subscribe(schedulePersist);
  readerFontPairings.subscribe(schedulePersist);
}

export function readerEffectiveTheme(published: PageTheme | null | undefined): PageTheme {
  return (get(readerThemePreview) ?? published ?? 'default') as PageTheme;
}

export function readerThemeIsDark(theme: PageTheme): boolean {
  return READER_DARK_THEMES.includes(theme);
}

export function measureLabel(measure: ReaderMeasure): string {
  return READER_MEASURE_OPTIONS.find((o) => o.value === measure)?.label ?? 'normal';
}
