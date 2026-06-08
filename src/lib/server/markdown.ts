import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
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
   * Syntax-highlight fenced code blocks with Shiki on the SERVER. Building the
   * highlighter (many langs + a regex engine) is expensive and reliably exceeds
   * the Cloudflare Workers CPU budget (error 1102) for code-heavy docs. So this
   * defaults to OFF — code blocks render as plain `<pre>` server-side and are
   * highlighted in the browser by DocView (clientHighlight). Only pass `true`
   * in a non-Workers context where CPU isn't constrained.
   */
  highlight?: boolean;
}

export async function renderMarkdown(
  md: string,
  options: RenderMarkdownOptions = {}
): Promise<string> {
  const { highlight = false } = options;
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

  // NOTE: rehype-raw (which re-parses the entire HTML AST to absorb embedded raw
  // HTML) is intentionally omitted — it's the heaviest step and made large docs
  // exceed the Workers CPU budget (error 1102). Instead we let remark-rehype emit
  // raw HTML nodes and have rehype-stringify pass them through verbatim
  // (allowDangerousHtml). Heading ids still work because markdown headings are
  // real nodes by the time rehype-slug runs.
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeStringify, { allowDangerousHtml: true });

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
