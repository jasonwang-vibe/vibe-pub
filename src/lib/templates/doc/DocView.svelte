<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { browser } from '$app/environment';
  import type { Comment } from '$lib/types';
  import {
    closeDocCommentsPanel,
    docCommentsPanelBlockId,
    docCommentsPanelOpen,
    openDocCommentsPanelForBlock,
  } from '$lib/stores';

  /** Matches Reader_Doc.html thread / comment icon */
  const COMMENT_THREAD_SVG = `<svg class="bcb-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  interface Props {
    html: string;
    title?: string | null;
    comments?: Comment[];
    pageId?: string;
    outlineVisible?: boolean;
    hasToc?: boolean;
  }
  let {
    html,
    title = null,
    comments = $bindable([]),
    pageId = '',
    outlineVisible = $bindable(undefined),
    hasToc = $bindable(false),
  }: Props = $props();

  type EnhanceParams = { html: string; pageId: string };

  let docEnhanceOpts = $derived.by(
    (): EnhanceParams => ({
      html,
      pageId,
    })
  );

  let showTitle = $derived(title && !html.trimStart().startsWith('<h1'));

  function blockComments(blockId: string): Comment[] {
    return comments.filter((c) => {
      if (!c.anchor) return false;
      try {
        const a = typeof c.anchor === 'string' ? JSON.parse(c.anchor) : c.anchor;
        return a?.type === 'block' && a?.block_id === blockId;
      } catch {
        return false;
      }
    });
  }

  function commentCount(blockId: string): number {
    return blockComments(blockId).length;
  }

  function applyBcbState(btn: HTMLElement, blockId: string) {
    const thread = blockComments(blockId);
    const cnt = thread.length;
    const wrap = btn.closest('.block-el');
    const allResolved = cnt > 0 && thread.every((c) => c.resolved !== 0);
    if (cnt > 0) {
      btn.classList.add('has-comments');
      wrap?.classList.add('block-el-commented');
      wrap?.classList.toggle('block-el-resolved', allResolved);
      btn.classList.toggle('bcb-all-resolved', allResolved);
      const n = btn.querySelector('.bcb-cnt');
      if (n) n.textContent = String(cnt);
      else btn.innerHTML = `${COMMENT_THREAD_SVG}<span class="bcb-cnt">${cnt}</span>`;
      btn.title = allResolved ? 'All comments resolved on this block' : 'Comments on this block';
    } else {
      btn.classList.remove('has-comments', 'bcb-all-resolved');
      wrap?.classList.remove('block-el-commented', 'block-el-resolved');
      btn.replaceChildren();
      btn.title = 'Comments on this block';
    }
  }

  function syncBlockHighlight() {
    if (typeof document === 'undefined') return;
    document
      .querySelectorAll('.block-el.block-active')
      .forEach((el) => el.classList.remove('block-active'));
    const open = get(docCommentsPanelOpen);
    const id = get(docCommentsPanelBlockId);
    if (open && id) document.getElementById(id)?.classList.add('block-active');
  }

  $effect(() => {
    if (!browser) return;
    const u1 = docCommentsPanelBlockId.subscribe(syncBlockHighlight);
    const u2 = docCommentsPanelOpen.subscribe(syncBlockHighlight);
    syncBlockHighlight();
    return () => {
      u1();
      u2();
    };
  });

  // Keep gutter buttons in sync when `comments` updates (e.g. after post)
  $effect(() => {
    comments;
    if (!browser) return;
    void tick().then(() => {
      document.querySelectorAll<HTMLElement>('.bcb[data-for-block]').forEach((btn) => {
        const id = btn.getAttribute('data-for-block');
        if (id) applyBcbState(btn, id);
      });
    });
  });

  function sameEnhanceParams(a: EnhanceParams, b: EnhanceParams) {
    return a.html === b.html && a.pageId === b.pageId;
  }

  function stripDocEnhancements(node: HTMLElement) {
    node.querySelectorAll('.bcb').forEach((b) => b.remove());
    node.querySelectorAll('pre').forEach((pre) => {
      pre.querySelector('.code-lang')?.remove();
      pre.querySelector('.code-copy')?.remove();
    });
    node.querySelectorAll('.block-el').forEach((el) => {
      el.classList.remove('block-el', 'block-el-commented', 'block-el-resolved', 'block-active');
    });
  }

  let _outlineSpy: { destroy(): void } | undefined;

  function applyDocEnhancements(node: HTMLElement, o: EnhanceParams) {
    stripDocEnhancements(node);
    _outlineSpy?.destroy();
    _outlineSpy = undefined;
    addHeadingIds(node);
    activeTocId = '';
    void tick().then(() => {
      _outlineSpy = setupScrollSpy(node) ?? undefined;
    });

    node.querySelectorAll('pre').forEach((pre) => {
      pre.style.position = 'relative';
      const code = pre.querySelector('code');
      const langClass = code?.className.match(/language-(\w+)/);
      const lang = langClass?.[1] ?? pre.getAttribute('data-language');
      if (lang) {
        const label = document.createElement('span');
        label.className = 'code-lang';
        label.textContent = lang;
        pre.appendChild(label);
      }
      const btn = document.createElement('button');
      btn.className = 'code-copy';
      btn.textContent = 'Copy';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(code?.textContent ?? pre.textContent ?? '').then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = 'Copy';
          }, 2000);
        });
      });
      pre.appendChild(btn);
    });

    if (o.pageId) {
      let blockIdx = 0;
      Array.from(node.children).forEach((child) => {
        const el = child as HTMLElement;
        const blockId = el.id || `block-${blockIdx}`;
        if (!el.id) el.id = blockId;
        el.classList.add('block-el');
        el.setAttribute('data-block-id', blockId);

        const cbtn = document.createElement('button');
        cbtn.type = 'button';
        cbtn.className = 'bcb';
        cbtn.setAttribute('data-for-block', blockId);
        cbtn.title = 'Comment on this block';
        applyBcbState(cbtn, blockId);
        cbtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cur = get(docCommentsPanelBlockId);
          const open = get(docCommentsPanelOpen);
          if (open && cur === blockId) {
            closeDocCommentsPanel();
            return;
          }
          openDocCommentsPanelForBlock(o.pageId, blockId);
        });
        el.appendChild(cbtn);
        blockIdx++;
      });
    }
  }

  function enhanceDoc(node: HTMLElement, opts: EnhanceParams) {
    let last: EnhanceParams | null = null;

    function apply(o: EnhanceParams) {
      applyDocEnhancements(node, o);
      last = { html: o.html, pageId: o.pageId };
    }

    apply(opts);

    return {
      update(o: EnhanceParams) {
        if (last && sameEnhanceParams(o, last)) return;
        apply(o);
      },
      destroy() {
        stripDocEnhancements(node);
      },
    };
  }

  // ── Outline / TOC ────────────────────────────────────────────────────────
  interface TocItem {
    id: string;
    text: string;
    level: number;
  }

  function slugifyHeadingText(text: string): string {
    const t = text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return t || 'section';
  }

  function finalizeOutlineHeadings(items: TocItem[]): TocItem[] {
    const used = new Set<string>();
    return items.map((item) => {
      const base = item.id?.trim() ? item.id.trim() : slugifyHeadingText(item.text);
      let candidate = base || 'section';
      let n = 2;
      while (used.has(candidate)) {
        candidate = `${base}-${n}`;
        n++;
      }
      used.add(candidate);
      return { level: item.level, text: item.text, id: candidate };
    });
  }

  let toc = $derived.by((): TocItem[] => {
    if (!html) return [];
    const items: TocItem[] = [];
    const regex = /<h([2-3])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h[2-3]>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      items.push({
        level: parseInt(match[1]),
        id: match[2],
        text: match[3].replace(/<[^>]*>/g, ''),
      });
    }
    return finalizeOutlineHeadings(items);
  });

  let tocFromText = $derived.by((): TocItem[] => {
    if (toc.length > 0 || !html) return toc;
    const items: TocItem[] = [];
    const regex = /<h([2-3])[^>]*>(.*?)<\/h[2-3]>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const text = match[2].replace(/<[^>]*>/g, '');
      items.push({ level: parseInt(match[1]), id: slugifyHeadingText(text), text });
    }
    return finalizeOutlineHeadings(items);
  });

  let activeTocId = $state('');

  const OUTLINE_VISIBLE_KEY = 'vibe-reader-outline-visible';
  const OUTLINE_WIDE_MQ = '(min-width: 1280px)';

  function readOutlineVisiblePref(): boolean {
    if (!browser) return true;
    const v = localStorage.getItem(OUTLINE_VISIBLE_KEY);
    return v !== '0' && v !== 'false';
  }

  let outlineEnabledWide = $state(true);
  let outlineOpenNarrow = $state(false);
  let viewportWide = $state(false);

  $effect(() => {
    if (!browser) return;
    const mq = window.matchMedia(OUTLINE_WIDE_MQ);
    const sync = () => {
      const wide = mq.matches;
      if (viewportWide && !wide) outlineOpenNarrow = false;
      if (!viewportWide && wide) outlineEnabledWide = readOutlineVisiblePref();
      viewportWide = wide;
    };
    outlineEnabledWide = readOutlineVisiblePref();
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  function setOutlineVisible(visible: boolean) {
    if (viewportWide) {
      outlineEnabledWide = visible;
      if (browser) localStorage.setItem(OUTLINE_VISIBLE_KEY, visible ? '1' : '0');
    } else {
      outlineOpenNarrow = visible;
    }
  }

  let showOutlinePanel = $derived(
    tocFromText.length > 0 && (viewportWide ? outlineEnabledWide : outlineOpenNarrow)
  );

  // hasToc: read-only output; outlineVisible: two-way bindable
  $effect(() => {
    hasToc = tocFromText.length > 0;
  });
  // internal → parent (non-reactive write to avoid re-triggering the effect below)
  $effect(() => {
    const v = showOutlinePanel;
    untrack(() => {
      outlineVisible = v;
    });
  });
  // parent → internal (only act when parent sets a different value)
  $effect(() => {
    const incoming = outlineVisible;
    if (incoming !== undefined)
      untrack(() => {
        if (incoming !== showOutlinePanel) setOutlineVisible(incoming);
      });
  });

  function setupScrollSpy(node: HTMLElement) {
    if (!browser) return;
    const headings = node.querySelectorAll('h2[id], h3[id]');
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting && e.target.id);
        if (visible.length === 0) return;
        const best = visible.reduce((a, e) =>
          e.boundingClientRect.top < a.boundingClientRect.top ? e : a
        );
        activeTocId = best.target.id;
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );
    headings.forEach((h) => observer.observe(h));
    return {
      destroy() {
        observer.disconnect();
      },
    };
  }

  function addHeadingIds(node: HTMLElement) {
    const headings = node.querySelectorAll('h2, h3');
    const used = new Set<string>();
    headings.forEach((h) => {
      const el = h as HTMLElement;
      const text = (el.textContent ?? '').trim();
      const base = el.id?.trim() ? el.id.trim() : slugifyHeadingText(text);
      let candidate = base || 'section';
      let n = 2;
      while (used.has(candidate)) {
        candidate = `${base}-${n}`;
        n++;
      }
      used.add(candidate);
      el.id = candidate;
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  /** Reader_Doc.html — reading progress bar */
  let readingProgressPct = $state(0);

  $effect(() => {
    if (!browser) return;
    function updateReadingProgress() {
      const el = document.documentElement;
      const scrollable = el.scrollHeight - el.clientHeight;
      const y = window.scrollY ?? document.documentElement.scrollTop ?? 0;
      const t = scrollable <= 0 ? 0 : Math.min(1, Math.max(0, y / scrollable));
      readingProgressPct = t * 100;
    }
    updateReadingProgress();
    window.addEventListener('scroll', updateReadingProgress, { passive: true });
    window.addEventListener('resize', updateReadingProgress);
    return () => {
      window.removeEventListener('scroll', updateReadingProgress);
      window.removeEventListener('resize', updateReadingProgress);
    };
  });
</script>

<!-- Reader_Doc.html — .progress / .progress-fill (pixel match) -->
<div class="doc-reading-progress" aria-hidden="true">
  <div class="doc-reading-progress-fill" style="width: {readingProgressPct}%"></div>
</div>

{#if showOutlinePanel}
  <div class="outline-panel">
    <div class="outline-header">
      <span class="outline-label">Outline</span>
      <button
        type="button"
        class="outline-close"
        onclick={() => setOutlineVisible(false)}
        aria-label="Hide outline"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg
        >
      </button>
    </div>
    <nav class="outline-nav">
      {#each tocFromText as item (item.id)}
        <a
          href="#{item.id}"
          class="outline-link"
          class:outline-h3={item.level === 3}
          class:outline-active={activeTocId === item.id}>{item.text}</a
        >
      {/each}
    </nav>
  </div>
{/if}

<div class="doc-wrap" class:has-outline={showOutlinePanel}>
  <article class="doc-view prose max-w-[var(--reader-measure)]" use:enhanceDoc={docEnhanceOpts}>
    {#if showTitle}
      <h1 class="doc-title">{title}</h1>
    {/if}
    {@html html}
  </article>
</div>

<style>
  /* ── Reading progress — Reader_Doc.html (.progress / .progress-fill) ── */
  .doc-reading-progress {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: transparent;
    z-index: 50;
    pointer-events: none;
  }

  .doc-reading-progress-fill {
    height: 100%;
    width: 0%;
    background: var(--text-primary);
    opacity: 0.8;
    transition: width 80ms linear;
  }

  @media (prefers-reduced-motion: reduce) {
    .doc-reading-progress-fill {
      transition: none;
    }
  }

  @media print {
    .doc-reading-progress {
      display: none !important;
    }
  }

  .doc-wrap {
    position: relative;
    overflow-x: visible;
  }

  /* ── Block + gutter comment control (Reader_Doc.html: pill + icon + count, left rail when commented) ── */
  article.doc-view {
    overflow-x: visible;
  }

  article.doc-view :global(.block-el) {
    position: relative;
    border-radius: 6px;
    scroll-margin-top: 5.5rem;
    transition:
      background 0.15s,
      border-color 0.2s,
      padding 0.15s,
      margin 0.15s;
  }

  /* Quote bar is border-left; full 6px radius rounds top-left/bottom-left and looks like a bracket. */
  article.doc-view :global(blockquote.block-el) {
    border-radius: 0 6px 6px 0;
  }

  article.doc-view :global(.block-el:hover) {
    background: rgba(0, 0, 0, 0.015);
  }

  :global(.dark) article.doc-view :global(.block-el:hover) {
    background: rgba(255, 255, 255, 0.04);
  }

  article.doc-view :global(.block-el.block-el-commented) {
    padding-left: 14px;
    margin-left: -14px;
    border-left: 2px solid color-mix(in srgb, var(--text-primary) 30%, transparent);
    border-radius: 0 6px 6px 0;
  }

  article.doc-view :global(.block-el.block-el-commented.block-active) {
    border-left-color: var(--text-primary);
    background: color-mix(in srgb, var(--text-primary) 4%, transparent);
  }

  :global(.dark) article.doc-view :global(.block-el.block-el-commented.block-active) {
    background: color-mix(in srgb, var(--text-primary) 8%, transparent);
  }

  /* Reader_Doc.html — .block.commented.resolved + green gutter button */
  article.doc-view :global(.block-el.block-el-commented.block-el-resolved) {
    border-left-color: rgba(34, 197, 94, 0.4);
  }

  article.doc-view :global(.block-el.block-el-commented.block-el-resolved.block-active) {
    border-left-color: rgba(34, 197, 94, 0.65);
  }

  article.doc-view :global(.bcb.has-comments.bcb-all-resolved) {
    color: #15803d;
    border-color: rgba(34, 197, 94, 0.35);
  }

  article.doc-view :global(.bcb.has-comments.bcb-all-resolved .bcb-cnt) {
    opacity: 0.88;
    color: inherit;
  }

  article.doc-view :global(.bcb.has-comments.bcb-all-resolved:hover) {
    color: #166534;
    border-color: rgba(22, 101, 52, 0.45);
    background: color-mix(in srgb, #15803d 6%, var(--bg));
  }

  :global(.dark) article.doc-view :global(.bcb.has-comments.bcb-all-resolved) {
    color: #86efac;
    border-color: rgba(134, 239, 172, 0.35);
  }

  :global(.dark) article.doc-view :global(.bcb.has-comments.bcb-all-resolved:hover) {
    color: #bbf7d0;
    border-color: rgba(187, 247, 208, 0.45);
    background: color-mix(in srgb, #86efac 8%, transparent);
  }

  article.doc-view :global(.block-el.block-active > .bcb.has-comments.bcb-all-resolved) {
    border-color: rgba(34, 197, 94, 0.55);
    color: #15803d;
  }

  :global(.dark)
    article.doc-view
    :global(.block-el.block-active > .bcb.has-comments.bcb-all-resolved) {
    color: #86efac;
    border-color: rgba(134, 239, 172, 0.5);
  }

  article.doc-view :global(.block-el.block-active:not(.block-el-commented)) {
    background: rgba(26, 25, 23, 0.04);
    border-left: 2px solid var(--text-primary);
    padding-left: 14px;
    margin-left: -14px;
    border-radius: 0 6px 6px 0;
  }

  :global(.dark) article.doc-view :global(.block-el.block-active:not(.block-el-commented)) {
    background: rgba(255, 255, 255, 0.06);
  }

  /* Code blocks keep their own dark background on hover / active / commented —
     the generic block tint would otherwise wash out the light-on-dark code
     (Shiki blocks set their bg inline, so they're unaffected; this targets the
     plain `pre:not(.shiki)` blocks used in previews). */
  article.doc-view :global(pre:not(.shiki).block-el:hover),
  article.doc-view :global(pre:not(.shiki).block-el.block-active),
  article.doc-view :global(pre:not(.shiki).block-el.block-el-commented),
  article.doc-view :global(pre:not(.shiki).block-el.block-el-commented.block-active),
  :global(.dark) article.doc-view :global(pre:not(.shiki).block-el:hover),
  :global(.dark) article.doc-view :global(pre:not(.shiki).block-el.block-active) {
    background: var(--text-primary);
  }

  /* Top-level blocks are ul/ol.block-el (not .block-el > ul); hide markers when gutter shows */
  article.doc-view :global(ul.block-el:is(.block-active, .block-el-commented)),
  article.doc-view :global(ol.block-el:is(.block-active, .block-el-commented)) {
    list-style: none;
    list-style-type: none;
  }

  article.doc-view :global(ul.block-el:is(.block-active, .block-el-commented) > li),
  article.doc-view :global(ol.block-el:is(.block-active, .block-el-commented) > li) {
    list-style: none;
    list-style-type: none;
    padding-left: 0;
  }

  article.doc-view :global(.bcb) {
    position: absolute;
    left: calc(100% + 12px);
    top: 2px;
    transform: none;
    z-index: 2;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    line-height: 1;
    opacity: 0;
    transition:
      opacity 120ms ease,
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
    /* no-comments: icon-only, transparent until hover / active block */
    width: 26px;
    height: 26px;
    min-width: 26px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    box-shadow: none;
    color: var(--text-tertiary);
    font-family: var(--font-sans);
    font-style: normal;
    font-weight: 500;
    font-size: 15px;
  }

  article.doc-view :global(.bcb:not(.has-comments)::before) {
    content: '+';
  }

  article.doc-view :global(.bcb.has-comments) {
    width: auto;
    min-width: auto;
    height: 28px;
    padding: 0 10px 0 8px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-card);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-style: normal;
    font-size: 11px;
    font-weight: 500;
    opacity: 1;
  }

  article.doc-view :global(.bcb.has-comments .bcb-svg) {
    flex-shrink: 0;
    display: block;
  }

  article.doc-view :global(.bcb.has-comments .bcb-cnt) {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    opacity: 0.55;
  }

  article.doc-view :global(.block-el:hover > .bcb),
  article.doc-view :global(.block-el.block-active > .bcb),
  article.doc-view :global(.bcb.has-comments) {
    opacity: 1;
  }

  /* No-comments: plain + on block hover (Reader_Doc .block:not(.commented) button); white pill only on button:hover */
  article.doc-view :global(.bcb:not(.has-comments):hover) {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text-primary);
    box-shadow: var(--shadow-card);
  }

  article.doc-view :global(.bcb.has-comments:hover) {
    color: var(--text-primary);
    border-color: var(--text-primary);
    background: var(--bg);
  }

  article.doc-view :global(.block-el.block-active > .bcb.has-comments) {
    border-color: var(--text-primary);
    color: var(--text-primary);
  }

  /* Ensure pre/table don't clip the comment button */
  article.doc-view :global(pre.block-el),
  article.doc-view :global(table.block-el) {
    overflow: visible;
  }

  article.doc-view :global(pre.block-el > code) {
    display: block;
    overflow-x: auto;
  }

  @media (max-width: 900px) {
    article.doc-view :global(.bcb) {
      left: auto;
      right: 0;
      top: -30px;
    }

    article.doc-view :global(.block-el.block-el-commented) {
      padding-left: 0;
      margin-left: 0;
      border-left: none;
      background: rgba(0, 0, 0, 0.03);
      border-radius: 6px;
      padding: 4px 10px;
      margin: 0 -10px var(--reader-block-gap) -10px;
    }

    :global(.dark) article.doc-view :global(.block-el.block-el-commented) {
      background: rgba(255, 255, 255, 0.04);
    }

    article.doc-view :global(.block-el.block-active:not(.block-el-commented)) {
      margin-left: 0;
      padding-left: 10px;
    }

    article.doc-view :global(.block-el.block-el-commented.block-active) {
      border-left: none;
      padding-left: 10px;
    }
  }

  @media print {
    article.doc-view :global(.bcb) {
      display: none !important;
    }
  }

  /* Base prose scale: app.css (Reader_Doc.html tokens) */
  article.doc-view {
    --tw-prose-body: var(--text-primary);
    --tw-prose-headings: var(--text-primary);
    --tw-prose-links: var(--text-primary);
    --tw-prose-code: var(--text-primary);
    --tw-prose-quotes: var(--text-secondary);
    --tw-prose-quote-borders: var(--text-primary);
  }

  .doc-title,
  article.doc-view :global(h1),
  article.doc-view :global(h2),
  article.doc-view :global(h3),
  article.doc-view :global(h4) {
    font-family: var(--font-serif);
  }

  article.doc-view :global(h1) {
    font-weight: 400;
    font-size: var(--reader-h1-size);
    line-height: 1.1;
    letter-spacing: -0.025em;
    margin: 56px 0 20px;
  }

  article.doc-view :global(a) {
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
    text-decoration-color: var(--border);
    transition: text-decoration-color 0.15s;
  }
  article.doc-view :global(a:hover) {
    text-decoration-color: currentColor;
  }
  article.doc-view :global(strong) {
    color: var(--text-primary);
    font-weight: 700;
  }

  article.doc-view :global(:not(pre) > code) {
    font-family: var(--font-mono);
    font-size: 0.88em;
    background: rgba(0, 0, 0, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
  }

  /* Layout for all code blocks; Shiki uses github-dark (see renderMarkdown). */
  article.doc-view :global(pre) {
    position: relative;
    padding: 18px 22px;
    border-radius: 10px;
    font-family: var(--font-mono);
    font-size: 13.5px;
    line-height: 1.7;
    margin: 24px 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border: none;
    box-shadow: none;
  }
  article.doc-view :global(pre:not(.shiki)) {
    background: var(--text-primary);
    color: var(--bg);
  }
  article.doc-view :global(pre code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: inherit;
    color: inherit;
  }

  article.doc-view :global(.code-lang) {
    position: absolute;
    top: 0;
    right: 3em;
    padding: 0.15em 0.5em;
    font-size: 0.7em;
    font-family: var(--font-sans);
    color: rgba(237, 234, 229, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    user-select: none;
    pointer-events: none;
  }
  article.doc-view :global(.code-copy) {
    position: absolute;
    top: 0.5em;
    right: 0.5em;
    padding: 0.2em 0.5em;
    font-size: 0.7em;
    font-family: var(--font-sans);
    color: rgba(237, 234, 229, 0.5);
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.15s,
      background 0.15s;
  }
  article.doc-view :global(pre:hover .code-copy) {
    opacity: 1;
  }
  article.doc-view :global(.code-copy:hover) {
    background: rgba(255, 255, 255, 0.15);
    color: var(--bg);
  }

  article.doc-view :global(table) {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  article.doc-view :global(th) {
    color: var(--text-secondary);
    white-space: nowrap;
  }
  article.doc-view :global(td) {
    color: var(--text-primary);
    white-space: nowrap;
  }
  @media (min-width: 640px) {
    article.doc-view :global(th),
    article.doc-view :global(td) {
      white-space: normal;
    }
  }
  article.doc-view :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }
  article.doc-view :global(hr) {
    border-color: var(--border);
    margin: 2em 0;
  }
  article.doc-view :global(ul),
  article.doc-view :global(ol) {
    padding-left: 1.25em;
    list-style-position: outside;
  }
  article.doc-view :global(li) {
    padding-left: 0.25em;
  }
  article.doc-view :global(li + li) {
    margin-top: 0.25em;
  }

  /* ── Outline panel ── */
  .outline-panel {
    position: fixed;
    top: 80px;
    left: 24px;
    width: 220px;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    z-index: 10;
    /* Hide the scrollbar until the panel is hovered (it's idle most of the time). */
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .outline-panel::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .outline-panel:hover {
    scrollbar-width: thin;
  }

  .outline-panel:hover::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .outline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .outline-label {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .outline-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-tertiary);
    border-radius: 4px;
    padding: 0;
    transition: color 0.15s;
  }

  .outline-close:hover {
    color: var(--text-primary);
  }

  .outline-nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .outline-link {
    display: block;
    font-family: var(--font-sans);
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--text-tertiary);
    text-decoration: none;
    padding: 4px 8px;
    border-radius: 5px;
    transition:
      color 0.12s,
      background 0.12s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .outline-link:hover {
    color: var(--text-primary);
    background: rgba(0, 0, 0, 0.04);
  }

  :global(.dark) .outline-link:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .outline-link.outline-h3 {
    padding-left: 20px;
    font-size: 12px;
  }

  .outline-link.outline-active {
    color: var(--text-primary);
    font-weight: 500;
  }

  /* Push article right when outline is visible */
  @media (min-width: 1280px) {
    .doc-wrap.has-outline {
      padding-left: calc(24px + 220px + 32px);
    }
  }

  @media (max-width: 1279px) {
    .outline-panel {
      display: none;
    }
  }
</style>
