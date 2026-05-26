import type { PageView } from '$lib/constants/index';

/**
 * Markdown heuristics for `pages.view` when no explicit view is set.
 *
 * Return type is {@link PageView} for a single type across the codebase, but this
 * function **only ever returns** `doc | kanban | changelog | timeline` at runtime.
 * It never returns `slides` or `dashboard` — those must come from YAML `view:` or
 * publish flags (`--view`, API body). Callers that need the final view should use:
 *
 * `explicitView ?? detectView(markdown)` (see `api/pub`, `new/+page.server`).
 *
 * Heuristics (conservative — non-doc only when unambiguous):
 *
 * - **kanban** — 2+ `##` headings each immediately followed by `- [ ]` / `- [x]` items
 * - **changelog** — 2+ `## [version]` headings, each with a `### Category` child
 * - **timeline** — 3+ `##` sections (not `[version]`), each with `###` + list items (≥70% match)
 * - **doc** — default fallback
 *
 * Not detected here:
 *
 * - **slides** — `---` separators are ambiguous (horizontal rules vs slide breaks)
 * - **dashboard** — no stable markdown signature yet
 *
 * UI note: `/new` preview calls this without parsing frontmatter; a pasted `view: slides`
 * block is honored on publish but may still show a doc preview until publish.
 */
export function detectView(markdown: string): PageView {
  const lines = markdown.split('\n');

  // ── Changelog detection ── (must run before timeline to avoid false matches)
  let releaseHeadings = 0;
  let releasesWithCategory = 0;
  let currentIsRelease = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // ## [version] or ## [version] - date
    if (/^##\s+\[[^\]]+\]/.test(trimmed) && !trimmed.startsWith('###')) {
      releaseHeadings++;
      currentIsRelease = true;
      continue;
    }
    // ### Category under a release heading
    if (/^###\s+\S/.test(trimmed) && currentIsRelease) {
      releasesWithCategory++;
      currentIsRelease = false; // only count once per release
      continue;
    }
  }

  if (releaseHeadings >= 2 && releasesWithCategory >= 2) {
    return 'changelog';
  }

  // ── Timeline detection ──
  // 2+ ## headings (without [version] brackets) each with at least one ### + list items
  let timelineSections = 0;
  let sectionsWithPeriodAndItems = 0;
  let inSection = false;
  let inPeriod = false;
  let periodHasItems = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // ## Section heading (must NOT be changelog-style [version])
    if (/^##\s+\S/.test(trimmed) && !trimmed.startsWith('###') && !/^##\s+\[/.test(trimmed)) {
      // Flush previous section
      if (inSection && inPeriod && periodHasItems) {
        sectionsWithPeriodAndItems++;
      }
      timelineSections++;
      inSection = true;
      inPeriod = false;
      periodHasItems = false;
      continue;
    }

    // ### Period heading under a section
    if (/^###\s+\S/.test(trimmed) && inSection) {
      // Flush previous period
      if (inPeriod && periodHasItems && !sectionsWithPeriodAndItems) {
        // Already counted this section? Only count once per section.
      }
      if (inPeriod && periodHasItems) {
        sectionsWithPeriodAndItems++;
        // Mark section as counted by resetting inSection tracking for this purpose
        inSection = false; // prevent double-counting this section
      }
      inPeriod = true;
      periodHasItems = false;
      continue;
    }

    // - list item under a period
    if (/^-\s+\S/.test(trimmed) && inPeriod) {
      periodHasItems = true;
      continue;
    }
  }
  // Flush final section
  if (inSection && inPeriod && periodHasItems) {
    sectionsWithPeriodAndItems++;
  }

  // Require 3+ matching sections AND at least 70% of all sections must match.
  // This prevents structured docs (many ## with ### subsections + lists) from
  // being mis-detected as timelines.
  if (
    timelineSections >= 3 &&
    sectionsWithPeriodAndItems >= 3 &&
    sectionsWithPeriodAndItems >= timelineSections * 0.7
  ) {
    return 'timeline';
  }

  // ── Kanban detection ──
  let headingWithCheckboxes = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Match ## headings (level 2+)
    if (/^#{2,}\s+\S/.test(line)) {
      // Look ahead: skip blank lines, then check for checkbox items
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') {
        j++;
      }

      // Check if the next non-blank line is a checkbox item
      if (j < lines.length && /^-\s+\[[ xX]\]/.test(lines[j].trim())) {
        headingWithCheckboxes++;
      }
    }

    i++;
  }

  return headingWithCheckboxes >= 2 ? 'kanban' : 'doc';
}
