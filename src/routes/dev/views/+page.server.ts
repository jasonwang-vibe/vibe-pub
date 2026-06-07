import { renderMarkdown } from '$lib/server/markdown';
import { parseKanbanBlocks } from '$lib/templates/kanban/parser';
import { parseSlidesBlocks } from '$lib/templates/slides/parser';

// Render the production views client-only — they're rich interactive
// components that guard browser APIs; the server load below still runs.
export const ssr = false;

const DOC_MD = `Markdown-in, URL-out. A quarter spent building the smallest possible publishing verb — and watching AI agents reach for it unprompted.

## The loop

The whole product is a four-step loop. An agent generates markdown. It publishes via CLI or MCP. A link comes back. A human reads the link, leaves a comment in the margin. The agent reads the comment, makes the edit, resolves the thread.

The command is three seconds from typing to URL:

\`\`\`bash
$ npx vibe-pub publish report.md
> packaging... 1,847 words, 4 min read
> published in 2.4s → vibe.pub/report-Kp8m2qX9
\`\`\`

### Why markdown

Markdown is the smallest format both humans and agents already speak. No schema to learn, no API to integrate — just text in, a URL out.

> A document is a conversation that hasn't realized it's interactive yet.

- Readers leave margin comments on any block.
- Agents read those comments back as instructions.
- The page updates in place — same URL, new content.

That is the entire thesis.`;

const KANBAN_MD = `---
view: kanban
title: Handbook roadmap
labels:
  feature: "#3b82f6"
  bug: "#ef4444"
  design: "#8b5cf6"
---

## Backlog

### SEO + meta tags {#c1} [feature]
Research keywords, update meta tags across published pages.

### Fix login redirect {#c2} [bug]
Token expires on redirect when the session is older than an hour.

## In Progress

### Reader typography pass {#c3} [design]
Foundation pass on the shared type scale, then per-view layout.

### Margin comments v2 {#c4} [feature]
Threaded replies, resolve state, agent-authored comments.

## Done

### Folder view {#c5} [design]
Directory of loosely-related .md files, smart-grouped by shape.

### Publish protocol {#c6} [feature]
The smallest publishing verb, shipped.`;

const SLIDES_MD = `---
view: slides
title: Agents that publish
---

# Agents that *publish*

Markdown-in, URL-out — the publishing layer for humans and agents.

---

## The loop

1. Agent writes markdown
2. Publishes to a URL
3. Humans comment in the margin
4. Agent revises in place

---

## Why it matters

The feedback loop closes in **minutes, not days** — and the page is just a file.

---

## Try it

\`\`\`bash
npx vibe-pub publish report.md
\`\`\``;

export const load = async () => {
  const docHtml = await renderMarkdown(DOC_MD);
  const kanban = parseKanbanBlocks(KANBAN_MD);
  const slides = parseSlidesBlocks(SLIDES_MD);

  return {
    docHtml,
    kanban: {
      markdown: kanban.normalizedMarkdown,
      columns: kanban.columns,
      labels: kanban.labels,
    },
    slides: slides.slides,
  };
};
