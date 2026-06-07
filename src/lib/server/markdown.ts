import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import type { Highlighter } from 'shiki';
import type { PageFrontmatter } from '$lib/types';

let highlighterPromise: Promise<Highlighter> | null = null;

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
   * Syntax-highlight fenced code blocks with Shiki. Building the highlighter
   * (many langs + a regex engine) is expensive and can blow the Cloudflare
   * Workers CPU budget on a cold isolate (error 1102 → HTML error page → broken
   * JSON for callers). The live-preview endpoint passes `false` so it never
   * risks that; published rendering keeps highlighting on.
   */
  highlight?: boolean;
}

export async function renderMarkdown(
  md: string,
  options: RenderMarkdownOptions = {}
): Promise<string> {
  const { highlight = true } = options;
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

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeStringify);

  const highlighted = md.replace(CODE_FENCE_RE, (_, lang, code) => {
    const language = lang || 'text';
    if (highlighter) {
      try {
        return highlighter.codeToHtml(code.trimEnd(), {
          lang: language,
          theme: 'github-dark',
        });
      } catch {
        // A cross-request highlighter can also throw here — drop the cache and
        // fall through to plain rendering.
        highlighterPromise = null;
      }
    }
    return `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;
  });

  const result = await processor.process(highlighted);
  return String(result);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
