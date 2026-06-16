/**
 * Reader typography model — size / line-height / letter-spacing (kerning) for the
 * body text and each heading level (H1–H4), expressed as the `--reader-*` CSS
 * custom properties consumed by the doc reader (see app.css + DocView).
 *
 * Used by the playground panel to live-tune a theme's typography and persist the
 * result as that theme's default (localStorage, per theme).
 */

export type ReaderTypoElement = 'body' | 'h1' | 'h2' | 'h3' | 'h4';

/** One tunable property of an element (size, line height, or letter spacing). */
export interface TypoField {
  /** CSS custom property this field writes. */
  cssVar: string;
  /** Unit appended to the numeric value when written to CSS (`px`, `em`, or ''). */
  unit: 'px' | 'em' | '';
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface TypoElementControl {
  key: ReaderTypoElement;
  label: string;
  size: TypoField;
  lineHeight: TypoField;
  letterSpacing: TypoField;
}

/** Line height + letter spacing share sensible ranges across elements. */
const LINE_HEIGHT = (def: number): TypoField => ({
  cssVar: '',
  unit: '',
  default: def,
  min: 1,
  max: 2,
  step: 0.01,
});
const LETTER_SPACING = (def: number): TypoField => ({
  cssVar: '',
  unit: 'em',
  default: def,
  min: -0.05,
  max: 0.05,
  step: 0.005,
});

/**
 * Per-element controls. Defaults + ranges follow the values baked into app.css
 * and typographic best practice (headings get tighter line height + a wider size
 * range; body stays in a comfortable reading band).
 */
export const READER_TYPO_CONTROLS: TypoElementControl[] = [
  {
    key: 'body',
    label: 'Body',
    size: { cssVar: '--reader-font-size', unit: 'px', default: 16, min: 14, max: 22, step: 1 },
    lineHeight: { ...LINE_HEIGHT(1.65), cssVar: '--reader-line-height' },
    letterSpacing: { ...LETTER_SPACING(0), cssVar: '--reader-letter-spacing' },
  },
  {
    key: 'h1',
    label: 'H1',
    size: { cssVar: '--reader-h1-size', unit: 'px', default: 40, min: 28, max: 64, step: 1 },
    lineHeight: { ...LINE_HEIGHT(1.1), cssVar: '--reader-h1-line-height' },
    letterSpacing: { ...LETTER_SPACING(-0.025), cssVar: '--reader-h1-letter-spacing' },
  },
  {
    key: 'h2',
    label: 'H2',
    size: { cssVar: '--reader-h2-size', unit: 'px', default: 28, min: 22, max: 44, step: 1 },
    lineHeight: { ...LINE_HEIGHT(1.2), cssVar: '--reader-h2-line-height' },
    letterSpacing: { ...LETTER_SPACING(-0.02), cssVar: '--reader-h2-letter-spacing' },
  },
  {
    key: 'h3',
    label: 'H3',
    size: { cssVar: '--reader-h3-size', unit: 'px', default: 20, min: 16, max: 32, step: 1 },
    lineHeight: { ...LINE_HEIGHT(1.28), cssVar: '--reader-h3-line-height' },
    letterSpacing: { ...LETTER_SPACING(-0.01), cssVar: '--reader-h3-letter-spacing' },
  },
  {
    key: 'h4',
    label: 'H4',
    size: { cssVar: '--reader-h4-size', unit: 'px', default: 18, min: 14, max: 24, step: 1 },
    lineHeight: { ...LINE_HEIGHT(1.4), cssVar: '--reader-h4-line-height' },
    letterSpacing: { ...LETTER_SPACING(-0.01), cssVar: '--reader-h4-letter-spacing' },
  },
];

/** size / lineHeight / letterSpacing for one element. */
export interface TypoElementValues {
  size: number;
  lineHeight: number;
  letterSpacing: number;
}
export type ReaderTypography = Record<ReaderTypoElement, TypoElementValues>;

const STORAGE_KEY = 'vibe-reader-typography-v1';

const CONTROL_BY_KEY = Object.fromEntries(READER_TYPO_CONTROLS.map((c) => [c.key, c])) as Record<
  ReaderTypoElement,
  TypoElementControl
>;

/** A fresh copy of the built-in defaults. */
export function defaultTypography(): ReaderTypography {
  const out = {} as ReaderTypography;
  for (const c of READER_TYPO_CONTROLS) {
    out[c.key] = {
      size: c.size.default,
      lineHeight: c.lineHeight.default,
      letterSpacing: c.letterSpacing.default,
    };
  }
  return out;
}

function clampField(field: TypoField, value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return field.default;
  return Math.min(field.max, Math.max(field.min, value));
}

/** Coerce arbitrary parsed JSON into a valid ReaderTypography (clamped to ranges). */
export function normalizeTypography(raw: unknown): ReaderTypography {
  const out = defaultTypography();
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  for (const c of READER_TYPO_CONTROLS) {
    const el = obj[c.key];
    if (!el || typeof el !== 'object') continue;
    const e = el as Record<string, unknown>;
    out[c.key] = {
      size: clampField(c.size, e.size),
      lineHeight: clampField(c.lineHeight, e.lineHeight),
      letterSpacing: clampField(c.letterSpacing, e.letterSpacing),
    };
  }
  return out;
}

/** All saved per-theme overrides, keyed by theme id. */
export function loadSavedTypography(): Record<string, ReaderTypography> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, ReaderTypography> = {};
    for (const [theme, value] of Object.entries(parsed)) {
      out[theme] = normalizeTypography(value);
    }
    return out;
  } catch {
    return {};
  }
}

function persist(all: Record<string, ReaderTypography>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/** Persist (or clear) a theme's typography as its saved default. */
export function saveTypographyForTheme(theme: string, typo: ReaderTypography) {
  const all = loadSavedTypography();
  all[theme] = normalizeTypography(typo);
  persist(all);
}
export function clearTypographyForTheme(theme: string) {
  const all = loadSavedTypography();
  delete all[theme];
  persist(all);
}

/** Map a ReaderTypography to the `--reader-*` CSS custom properties + string values. */
export function typographyToCssVars(typo: ReaderTypography): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const c of READER_TYPO_CONTROLS) {
    const v = typo[c.key];
    vars[c.size.cssVar] = `${v.size}${c.size.unit}`;
    vars[c.lineHeight.cssVar] = `${v.lineHeight}`;
    vars[c.letterSpacing.cssVar] = `${v.letterSpacing}${c.letterSpacing.unit}`;
  }
  return vars;
}

/** Every `--reader-*` property this model controls (used to clear overrides). */
export const ALL_TYPO_CSS_VARS: string[] = READER_TYPO_CONTROLS.flatMap((c) => [
  c.size.cssVar,
  c.lineHeight.cssVar,
  c.letterSpacing.cssVar,
]);

export function controlFor(key: ReaderTypoElement): TypoElementControl {
  return CONTROL_BY_KEY[key];
}

/** True when `typo` differs from the built-in defaults (any element/field). */
export function typographyIsDefault(typo: ReaderTypography): boolean {
  const d = defaultTypography();
  return READER_TYPO_CONTROLS.every((c) => {
    const a = typo[c.key];
    const b = d[c.key];
    return (
      a.size === b.size && a.lineHeight === b.lineHeight && a.letterSpacing === b.letterSpacing
    );
  });
}
