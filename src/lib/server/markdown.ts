import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeSlug from 'rehype-slug';
import type { Highlighter } from 'shiki';
import type { PageFrontmatter } from '$lib/types';

let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * The markdown→HTML processor, built once and reused across requests (unified
 * processors are frozen after first use, so this is safe and avoids rebuilding
 * the plugin chain on every render).
 *
 * Notes on what's intentionally NOT here:
 * - `rehype-raw` re-parses the entire HTML AST to absorb embedded raw HTML — the
 *   single heaviest step. Omitted; remark-rehype emits raw nodes and
 *   rehype-stringify passes them through verbatim (allowDangerousHtml).
 * - `remark-breaks` (newline → <br>) is omitted: it's costly on large docs and
 *   standard CommonMark (how GitHub renders .md files) collapses soft breaks.
 */
function buildProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeStringify, { allowDangerousHtml: true });
}
let _processor: ReturnType<typeof buildProcessor> | null = null;
function getProcessor() {
  _processor ??= buildProcessor();
  return _processor;
}

/**
 * Use JS RegExp engine (not Oniguruma WASM) so highlighting works on Cloudflare Workers.
 * Default Shiki WASM often fails in Workers; see https://github.com/shikijs/shiki/issues/590
 *
 * Shiki is imported DYNAMICALLY here: a static top-level import would pull the
 * (large) Shiki bundle into every module that loads markdown.ts — including the
 * live-preview endpoint — and parsing it on a cold Workers isolate alone can
 * exceed the CPU budget (error 1102), even when we never highlight anything.
 */
function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighter, createJavaScriptRegexEngine } = await import('shiki');
      return createHighlighter({
        themes: ['github-dark'],
        langs: [
          'javascript',
          'typescript',
          'python',
          'bash',
          'json',
          'html',
          'css',
          'sql',
          'yaml',
          'markdown',
          'go',
          'rust',
          'java',
          'ruby',
          'php',
          'swift',
          'kotlin',
          'c',
          'cpp',
        ],
        engine: createJavaScriptRegexEngine(),
      });
    })();
  }
  return highlighterPromise;
}

export function parseFrontmatter(raw: string): { data: Partial<PageFrontmatter>; content: string } {
  const { data, content } = matter(raw);
  return { data: data as Partial<PageFrontmatter>, content };
}

const CODE_FENCE_RE = /```(\w+)?\n([\s\S]*?)```/g;

export interface RenderMarkdownOptions {
  /**
   * Syntax-highlight fenced code blocks with Shiki on the SERVER. Building the
   * highlighter (many langs + a regex engine) is expensive and reliably exceeds
   * the Cloudflare Workers CPU budget (error 1102) for code-heavy docs. So this
   * defaults to OFF — code blocks render as plain `<pre>` server-side and are
   * highlighted in the browser by DocView (clientHighlight). Only pass `true`
   * in a non-Workers context where CPU isn't constrained.
   */
  highlight?: boolean;
  /**
   * If set, the rendered HTML is cached in the Cloudflare edge Cache API under
   * this key, so an expensive render runs at most once per (key, edge location).
   * Use a stable, version-aware key: `pageId/updated` for published pages, or a
   * content hash for ephemeral previews.
   */
  cacheKey?: string;
}

/** Tiny, fast, non-crypto string hash (cyrb53) for content-addressed cache keys. */
export function hashContent(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

function getEdgeCache(): Cache | undefined {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  } catch {
    return undefined;
  }
}

export async function renderMarkdown(
  md: string,
  options: RenderMarkdownOptions = {}
): Promise<string> {
  const { highlight = false, cacheKey } = options;

  // Serve a cached render if available (cheap path — no markdown processing).
  const cache = cacheKey ? getEdgeCache() : undefined;
  const cacheReq = cache ? new Request(`https://md.cache/${encodeURIComponent(cacheKey!)}`) : null;
  if (cache && cacheReq) {
    try {
      const hit = await cache.match(cacheReq);
      if (hit) return await hit.text();
    } catch {
      /* fall through to render */
    }
  }

  // Only build the highlighter when highlighting is enabled AND there's actually
  // a fenced code block to highlight; most docs have none.
  const hasCodeBlock = highlight && /```/.test(md);

  let highlighter: Highlighter | null = null;
  if (hasCodeBlock) {
    try {
      highlighter = await getHighlighter();
    } catch {
      // Shiki may fail in Workers (WASM loading issues, or a highlighter promise
      // cached during a *different* request). Reset the cache so the next call
      // rebuilds it, and fall back to plain code blocks for this render.
      highlighterPromise = null;
    }
  }

  const processor = getProcessor();

  // Only pre-replace fenced code blocks with raw HTML when we're actually
  // Shiki-highlighting. Injecting raw <pre> HTML and re-parsing it through the
  // pipeline is both slower and, for some inputs (CJK + multiple fences), blows
  // the Workers CPU budget (1102). With highlighting off (the default), feed the
  // raw markdown straight in and let remark render code fences natively — fast,
  // and it still emits `<code class="language-…">` for client-side highlighting.
  const source = highlighter
    ? md.replace(CODE_FENCE_RE, (_, lang, code) => {
        const language = lang || 'text';
        try {
          return highlighter!.codeToHtml(code.trimEnd(), {
            lang: language,
            theme: 'github-dark',
          });
        } catch {
          highlighterPromise = null;
          return `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;
        }
      })
    : md;

  const result = await processor.process(source);
  const html = String(result);

  if (cache && cacheReq) {
    try {
      await cache.put(
        cacheReq,
        new Response(html, { headers: { 'cache-control': 'public, max-age=604800' } })
      );
    } catch {
      /* cache write is best-effort */
    }
  }

  return html;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
