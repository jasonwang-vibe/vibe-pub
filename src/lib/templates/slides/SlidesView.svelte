<script lang="ts">
  import { browser } from '$app/environment';
  import type { Slide } from './parser';
  import type { Comment } from '$lib/types';

  interface Props {
    slides: Slide[];
    title?: string | null;
    comments?: Comment[];
    pageId?: string;
  }

  let { slides, title, comments = [], pageId = '' }: Props = $props();

  let current = $state(0);
  let direction = $state<'next' | 'prev'>('next');
  let transitioning = $state(false);

  function goTo(index: number) {
    if (index < 0 || index >= slides.length || index === current || transitioning) return;
    direction = index > current ? 'next' : 'prev';
    transitioning = true;
    setTimeout(() => {
      current = index;
      transitioning = false;
    }, 150);
  }

  function next() {
    goTo(current + 1);
  }
  function prev() {
    goTo(current - 1);
  }

  // ── Stage controls: overview grid, fullscreen, more menu, view source ──
  let overview = $state(false);
  let moreOpen = $state(false);
  let sourceOpen = $state(false);
  let filmstripOpen = $state(false);
  let kbdOpen = $state(false);
  let appearanceOpen = $state(false);
  let ratio = $state<'16-9' | '4-3' | 'letter'>('16-9');
  let indicator = $state<'dots' | 'bar' | 'none'>('dots');
  let containerEl = $state<HTMLDivElement | undefined>();

  function slideTitle(slide: Slide): string {
    const m = slide.markdown.match(/^#{1,2}\s+(.+)$/m);
    return m ? m[1].replace(/\*(.+?)\*/g, '$1').trim() : `Slide ${slide.index + 1}`;
  }
  function pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  function toggleOverview() {
    overview = !overview;
    moreOpen = false;
  }
  function jumpTo(i: number) {
    current = i;
    overview = false;
  }
  function toggleFullscreen() {
    if (!browser || !containerEl) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else containerEl.requestFullscreen?.().catch(() => {});
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      prev();
    } else if (e.key === 'Home') {
      e.preventDefault();
      goTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goTo(slides.length - 1);
    } else if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      toggleOverview();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFullscreen();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      sourceOpen = !sourceOpen;
    } else if (e.key === '?') {
      e.preventDefault();
      kbdOpen = !kbdOpen;
    } else if (e.key === 'Escape') {
      if (kbdOpen) { kbdOpen = false; return; }
      if (appearanceOpen) { appearanceOpen = false; return; }
      if (sourceOpen) { sourceOpen = false; return; }
      if (overview) { overview = false; return; }
    }
  }

  let progress = $derived(slides.length > 1 ? ((current + 1) / slides.length) * 100 : 100);

  // Block comment state
  let activeBlockId = $state<string | null>(null);
  let commentName = $state('');
  let commentBody = $state('');
  let commentPosting = $state(false);

  let currentBlockId = $derived(`slide-${current}`);

  function blockComments(blockId: string): Comment[] {
    return comments.filter((c) => {
      if (!c.anchor) return false;
      try {
        const a = typeof c.anchor === 'string' ? JSON.parse(c.anchor) : c.anchor;
        return a.block_id === blockId;
      } catch {
        return false;
      }
    });
  }

  function commentCount(blockId: string): number {
    return blockComments(blockId).length;
  }

  async function postComment() {
    if (!commentBody.trim() || !pageId || !activeBlockId) return;
    commentPosting = true;
    try {
      const anchor = { type: 'block', block_type: 'slide', block_id: activeBlockId };
      const res = await fetch(`/api/comment/${pageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: commentBody.trim(),
          display_name: commentName.trim() || undefined,
          anchor,
          anchor_hint: activeBlockId,
        }),
      });
      if (res.ok) {
        const saved = (await res.json().catch(() => null)) as { id?: string } | null;
        comments = [
          ...comments,
          {
            id: saved?.id ?? crypto.randomUUID(),
            page_id: pageId,
            user_id: null,
            display_name: commentName.trim() || null,
            anchor: JSON.stringify(anchor),
            anchor_hint: activeBlockId,
            body: commentBody.trim(),
            resolved: 0,
            agent_published: 0,
            created: new Date().toISOString(),
          },
        ];
        commentBody = '';
      }
    } catch {}
    commentPosting = false;
  }

  function timeAgo(dateStr: string): string {
    const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  // Close comment card when navigating slides
  $effect(() => {
    current; // track
    activeBlockId = null;
  });

  $effect(() => {
    if (!browser || !activeBlockId) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement;
      if (t.closest?.('.comment-card') || t.closest?.('.slide-comment-btn')) return;
      activeBlockId = null;
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="slides-container" bind:this={containerEl}>
  <!-- Progress bar -->
  <div class="slides-progress">
    <div class="slides-progress-bar" style="width: {progress}%"></div>
  </div>

  <!-- Stage controls (overview / fit / more) -->
  {#if slides.length > 0}
    <div class="slides-controls">
      <button class="sc-btn" class:active={overview} onclick={toggleOverview} title="Overview">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          ><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect
            x="3"
            y="14"
            width="7"
            height="7"
            rx="1"
          /><rect x="14" y="14" width="7" height="7" rx="1" /></svg
        >
        overview
      </button>
      <button class="sc-btn sc-icon" onclick={toggleFullscreen} title="Fit / fullscreen" aria-label="Fullscreen">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          ><path
            d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"
          /></svg
        >
      </button>
      <div class="sc-more">
        <button class="sc-btn sc-icon" onclick={() => (moreOpen = !moreOpen)} title="More" aria-label="More">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            ><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg
          >
        </button>
        {#if moreOpen}
          <div class="sc-menu">
            <button
              onclick={() => {
                sourceOpen = !sourceOpen;
                moreOpen = false;
              }}>
              {sourceOpen ? 'Hide source' : 'View source'}
              <span class="sc-kbd">s</span>
            </button>
            <button onclick={() => { filmstripOpen = !filmstripOpen; moreOpen = false; }}>
              {filmstripOpen ? 'Hide filmstrip' : 'Show filmstrip'}
            </button>
            <button onclick={() => { kbdOpen = true; moreOpen = false; }}>
              Keyboard shortcuts
              <span class="sc-kbd">?</span>
            </button>
            <div class="sc-divider"></div>
            <button onclick={() => { appearanceOpen = !appearanceOpen; moreOpen = false; }}>
              Appearance
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if overview}
    <div class="slides-overview">
      <div class="ov-grid">
        {#each slides as s, i}
          <button class="ov-cell" class:current={i === current} onclick={() => jumpTo(i)} aria-label="Go to slide {i + 1}">
            <div class="ov-thumb"><div class="ov-thumb-inner prose">{@html s.html}</div></div>
            <span class="ov-num">{i + 1}</span>
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <!-- Slide area -->
    <div class="slides-viewport">
    {#if slides.length > 0}
      <div class="slide-card" class:slide-fade-out={transitioning}>
        {#if pageId}
          <button
            class="slide-comment-btn"
            class:has-comments={commentCount(currentBlockId) > 0}
            onclick={() =>
              (activeBlockId = activeBlockId === currentBlockId ? null : currentBlockId)}
          >
            {commentCount(currentBlockId) > 0 ? commentCount(currentBlockId) : ''}
          </button>
        {/if}
        <div class="slide-content prose">
          {@html slides[current].html}
        </div>
        {#if activeBlockId === currentBlockId}
          <div class="comment-card">
            {#each blockComments(currentBlockId) as c}
              <div class="cc-item">
                <span class="cc-author">{c.display_name ?? 'Anonymous'}</span>
                <span class="cc-time">{timeAgo(c.created)}</span>
                <p class="cc-body">{c.body}</p>
              </div>
            {/each}
            <div class="cc-form">
              <textarea
                class="cc-textarea"
                placeholder="Add a comment..."
                rows={2}
                bind:value={commentBody}
                onkeydown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment();
                }}
              ></textarea>
              <div class="cc-actions">
                <button class="cc-cancel" onclick={() => (activeBlockId = null)}>Cancel</button>
                <button
                  class="cc-post"
                  onclick={postComment}
                  disabled={commentPosting || !commentBody.trim()}
                >
                  {commentPosting ? '...' : 'Comment'}
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="slides-empty">
        <p>No slides.</p>
      </div>
    {/if}
  </div>

  <!-- Controls bar -->
  {#if slides.length > 1}
    <div class="slides-controls-bar">
      <div class="scb-left">
        <span class="scb-pos">
          <span class="scb-now">{pad(current + 1)}</span>
          <span class="scb-slash">/</span>
          <span class="scb-total">{pad(slides.length)}</span>
        </span>
        <span class="scb-sep">·</span>
        <span class="scb-kicker">{slideTitle(slides[current])}</span>
      </div>
      <div class="scb-center">
        <button class="slides-nav-btn" onclick={prev} disabled={current === 0} aria-label="Previous slide">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        {#if indicator === 'dots'}
          <div class="scb-dots">
            {#each slides as _, i}
              <button
                class="scb-dot"
                class:active={i === current}
                onclick={() => goTo(i)}
                aria-label="Go to slide {i + 1}"
              ></button>
            {/each}
          </div>
        {:else if indicator === 'bar'}
          <div class="scb-bar"><div class="scb-bar-fill" style="width: {progress}%"></div></div>
        {/if}
        <button class="slides-nav-btn" onclick={next} disabled={current === slides.length - 1} aria-label="Next slide">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div class="scb-right"></div>
    </div>
  {/if}

  <!-- Filmstrip -->
  {#if filmstripOpen && slides.length > 0}
    <div class="slides-filmstrip">
      <div class="sf-inner">
        {#each slides as slide, i}
          <button
            class="sf-thumb"
            class:active={i === current}
            onclick={() => { goTo(i); }}
            aria-label="Go to slide {i + 1}"
          >
            <span class="sf-no">{pad(i + 1)}</span>
            <span class="sf-title">{slideTitle(slide)}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
{/if}
</div>

<!-- Appearance panel -->
{#if appearanceOpen}
  <div class="slides-ap-backdrop" onclick={() => (appearanceOpen = false)} role="presentation"></div>
  <div class="slides-ap">
    <div class="ap-section">
      <div class="ap-label">Aspect ratio</div>
      <div class="ap-row">
        {#each [['16-9','16:9'],['4-3','4:3'],['letter','letter']] as [val, lbl]}
          <button class="ap-btn" class:active={ratio === (val as typeof ratio)} onclick={() => (ratio = val as typeof ratio)}>{lbl}</button>
        {/each}
      </div>
    </div>
    <div class="ap-section">
      <div class="ap-label">Progress</div>
      <div class="ap-row">
        {#each [['dots','dots'],['bar','bar'],['none','none']] as [val, lbl]}
          <button class="ap-btn" class:active={indicator === (val as typeof indicator)} onclick={() => (indicator = val as typeof indicator)}>{lbl}</button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- Keyboard shortcuts modal -->
{#if kbdOpen}
  <div class="kbd-bg" onclick={() => (kbdOpen = false)} role="presentation"></div>
  <div class="kbd-modal" role="dialog" aria-label="Keyboard shortcuts">
    <div class="kbd-head">
      <div>
        <h3>Keyboard <em>shortcuts</em></h3>
        <p>press <strong>?</strong> anytime</p>
      </div>
      <button class="kbd-close" onclick={() => (kbdOpen = false)} aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="kbd-grid">
      <div class="kbd-row"><span>Next slide</span><span class="kbd-keys"><kbd>→</kbd><span>/</span><kbd>Space</kbd></span></div>
      <div class="kbd-row"><span>Previous slide</span><span class="kbd-keys"><kbd>←</kbd></span></div>
      <div class="kbd-row"><span>First / last slide</span><span class="kbd-keys"><kbd>Home</kbd><span>/</span><kbd>End</kbd></span></div>
      <div class="kbd-row"><span>Overview grid</span><span class="kbd-keys"><kbd>o</kbd></span></div>
      <div class="kbd-row"><span>View source</span><span class="kbd-keys"><kbd>s</kbd></span></div>
      <div class="kbd-row"><span>Fullscreen</span><span class="kbd-keys"><kbd>f</kbd></span></div>
      <div class="kbd-row"><span>Keyboard shortcuts</span><span class="kbd-keys"><kbd>?</kbd></span></div>
      <div class="kbd-row"><span>Close / exit</span><span class="kbd-keys"><kbd>Esc</kbd></span></div>
    </div>
  </div>
{/if}

<style>
  .slides-container {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 48px);
    width: 100%;
  }

  /* ── Progress bar ── */
  .slides-progress {
    position: fixed;
    top: 48px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--border);
    z-index: 20;
  }

  .slides-progress-bar {
    height: 100%;
    background: var(--accent);
    transition: width 300ms ease;
  }

  /* ── Stage controls (top toolbar) ── */
  .slides-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    padding: 10px 16px 0;
    z-index: 30;
  }

  .sc-btn {
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    line-height: 1;
  }

  .sc-btn:hover {
    color: var(--text-primary);
    background: color-mix(in srgb, var(--text-primary) 5%, transparent);
  }

  .sc-btn.active {
    background: var(--text-primary);
    color: var(--bg);
  }

  .sc-icon {
    padding: 6px;
    width: 30px;
    height: 30px;
    justify-content: center;
  }

  .sc-more {
    position: relative;
  }

  .sc-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 210px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow-elevated);
    padding: 4px;
    z-index: 60;
  }

  .sc-menu button {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    border-radius: 7px;
    background: transparent;
    border: 0;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--text-primary);
    text-align: left;
    gap: 6px;
  }

  .sc-menu button:hover {
    background: color-mix(in srgb, var(--text-primary) 5%, transparent);
  }

  /* ── Overview grid ── */
  .slides-overview {
    position: absolute;
    inset: 0;
    background: var(--bg);
    z-index: 20;
    overflow-y: auto;
    padding: 32px 24px 48px;
  }

  .ov-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .ov-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }

  .ov-thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 10px;
    background: var(--surface);
    border: 1.5px solid var(--border);
    overflow: hidden;
    transition: all 160ms ease;
    padding: 12px 14px;
  }

  .ov-cell:hover .ov-thumb {
    border-color: var(--text-tertiary);
    transform: translateY(-2px);
  }

  .ov-cell.current .ov-thumb {
    border-color: var(--text-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--text-primary) 10%, transparent);
  }

  .ov-thumb-inner {
    font-size: 10px;
    pointer-events: none;
    overflow: hidden;
    max-height: 100%;
  }

  .ov-num {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-tertiary);
  }

  /* ── Viewport ── */
  .slides-viewport {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 24px 16px;
  }

  .slide-card {
    background: var(--surface);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-elevated);
    padding: 48px 56px;
    max-width: 800px;
    width: 100%;
    opacity: 1;
    transition: opacity 150ms ease;
    position: relative;
  }

  .slide-card.slide-fade-out {
    opacity: 0;
  }

  .slide-content {
    max-width: none;
  }

  .slide-content :global(h1) {
    font-family: var(--font-serif);
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-top: 0;
  }

  .slide-content :global(h2) {
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-top: 0;
  }

  .slide-content :global(h3) {
    font-family: var(--font-serif);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-top: 0;
  }

  .slide-content :global(p) {
    font-family: var(--font-prose);
    font-size: 18px;
    line-height: 1.75;
    color: var(--text-secondary);
  }

  .slide-content :global(ul),
  .slide-content :global(ol) {
    font-family: var(--font-prose);
    font-size: 18px;
    line-height: 1.75;
    color: var(--text-secondary);
  }

  .slide-content :global(li) {
    margin-bottom: 4px;
  }

  .slide-content :global(code):not(:global(pre) :global(code)) {
    font-family: var(--font-mono);
    font-size: 0.875em;
    background: rgba(0, 0, 0, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
  }

  :global(.dark) .slide-content :global(code):not(:global(pre) :global(code)) {
    background: rgba(255, 255, 255, 0.07);
  }

  .slide-content :global(pre) {
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.6;
    border-radius: var(--radius-md);
    padding: 20px 24px;
    background: var(--text-primary);
    color: var(--bg);
    overflow-x: auto;
    box-shadow: var(--shadow-card);
  }

  .slide-content :global(blockquote) {
    border-left: 2px solid var(--border);
    padding-left: 16px;
    color: var(--text-secondary);
    font-style: italic;
  }

  .slide-content :global(strong) {
    color: var(--text-primary);
    font-weight: 700;
  }

  .slide-content :global(a) {
    color: var(--text-primary);
    text-decoration: underline;
    text-underline-offset: 4px;
    text-decoration-color: var(--border);
    transition: text-decoration-color 150ms;
  }

  .slide-content :global(a):hover {
    text-decoration-color: var(--text-primary);
  }

  /* ── Slide comment button (top-left) ── */
  .slide-comment-btn {
    position: absolute;
    top: 12px;
    left: 12px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: opacity 100ms;
    border-radius: 3px;
    color: var(--text-tertiary);
    font-size: 10px;
    font-family: var(--font-mono);
    padding: 0;
    z-index: 5;
  }

  .slide-comment-btn::before {
    content: '';
    width: 12px;
    height: 10px;
    border: 1.2px solid currentColor;
    border-radius: 2px 2px 2px 0;
    display: block;
  }

  .slide-comment-btn.has-comments::before {
    display: none;
  }

  .slide-comment-btn.has-comments {
    opacity: 0.45;
    font-weight: 600;
    color: var(--accent);
    font-size: 9px;
  }

  .slide-card:hover .slide-comment-btn {
    opacity: 0.35;
  }

  .slide-comment-btn:hover {
    opacity: 0.8 !important;
  }

  /* ── Comment card (slides) ── */
  .comment-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    padding: 10px;
    margin-top: 16px;
    max-width: 320px;
  }

  .cc-item {
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .cc-item:last-of-type {
    border-bottom: none;
    margin-bottom: 8px;
    padding-bottom: 0;
  }

  .cc-author {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .cc-time {
    font-size: 10px;
    color: var(--text-tertiary);
    margin-left: 6px;
    font-family: var(--font-mono);
  }
  .cc-body {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 4px 0 0;
  }

  .cc-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cc-textarea {
    width: 100%;
    padding: 6px 8px;
    font-size: 12px;
    font-family: var(--font-sans);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    outline: none;
    box-sizing: border-box;
    resize: none;
    line-height: 1.4;
  }
  .cc-textarea:focus {
    border-color: var(--border-hover);
  }

  .cc-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .cc-cancel {
    font-size: 12px;
    color: var(--text-tertiary);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
  }
  .cc-cancel:hover {
    color: var(--text-primary);
  }
  .cc-post {
    font-size: 12px;
    font-weight: 500;
    color: white;
    background: var(--accent);
    border: none;
    border-radius: 6px;
    padding: 4px 12px;
    cursor: pointer;
  }
  .cc-post:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* ── Empty state ── */
  .slides-empty {
    text-align: center;
    padding: 48px 24px;
    color: var(--text-tertiary);
    font-size: 14px;
    font-style: italic;
  }

  /* ── Controls bar ── */
  .slides-controls-bar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 12px 32px 20px;
    gap: 16px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-tertiary);
    position: sticky;
    bottom: 0;
    background: var(--bg);
    border-top: 1px solid var(--border);
  }

  .scb-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .scb-pos {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .scb-now { color: var(--text-primary); font-weight: 600; }
  .scb-slash { opacity: 0.4; margin: 0 3px; }
  .scb-sep { opacity: 0.4; flex-shrink: 0; }

  .scb-kicker {
    color: var(--text-secondary);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-size: 11px;
  }

  .scb-center {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .scb-right { min-width: 0; }

  .slides-nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 150ms ease;
    flex-shrink: 0;
  }

  .slides-nav-btn:hover:not(:disabled) {
    border-color: var(--border-hover);
    color: var(--text-primary);
    box-shadow: var(--shadow-card);
  }

  .slides-nav-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* Progress dots */
  .scb-dots {
    display: flex;
    gap: 5px;
    align-items: center;
    flex-wrap: wrap;
    max-width: 260px;
  }

  .scb-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-primary) 18%, transparent);
    border: 0;
    padding: 0;
    cursor: pointer;
    transition: all 140ms ease;
    flex-shrink: 0;
  }

  .scb-dot:hover {
    background: color-mix(in srgb, var(--text-primary) 45%, transparent);
  }

  .scb-dot.active {
    background: var(--text-primary);
    width: 20px;
  }

  /* Progress bar */
  .scb-bar {
    width: 160px;
    height: 2px;
    background: var(--border);
    border-radius: 999px;
    position: relative;
    overflow: hidden;
  }

  .scb-bar-fill {
    position: absolute;
    inset: 0;
    background: var(--text-primary);
    border-radius: 999px;
    transition: width 220ms ease;
    width: 0%;
  }

  /* ── Filmstrip ── */
  .slides-filmstrip {
    border-top: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 32px 20px;
  }

  .sf-inner {
    display: flex;
    gap: 8px;
    padding-top: 12px;
    min-width: min-content;
  }

  .sf-thumb {
    flex: 0 0 auto;
    width: 140px;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    background: var(--surface);
    border: 1.5px solid var(--border);
    padding: 10px 12px;
    cursor: pointer;
    transition: all 140ms ease;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    overflow: hidden;
  }

  .sf-thumb:hover {
    border-color: var(--text-tertiary);
    transform: translateY(-2px);
  }

  .sf-thumb.active {
    border-color: var(--text-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--text-primary) 10%, transparent);
  }

  .sf-no {
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 600;
    color: var(--text-tertiary);
    letter-spacing: 0.06em;
  }

  .sf-title {
    font-family: var(--font-serif);
    font-size: 11px;
    font-weight: 400;
    color: var(--text-primary);
    line-height: 1.2;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    letter-spacing: -0.01em;
  }

  /* ── More menu additions ── */
  .sc-divider {
    height: 1px;
    background: var(--border);
    margin: 3px 0;
  }

  .sc-kbd {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-tertiary);
  }

  /* ── Appearance panel ── */
  .slides-ap-backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
  }

  .slides-ap {
    position: fixed;
    top: 56px;
    right: 16px;
    width: 280px;
    background: var(--bg);
    border-radius: 14px;
    box-shadow: var(--shadow-elevated);
    border: 1px solid var(--border);
    padding: 18px;
    z-index: 50;
  }

  .ap-section {
    margin-bottom: 16px;
  }

  .ap-section:last-child {
    margin-bottom: 0;
  }

  .ap-label {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    margin-bottom: 8px;
  }

  .ap-row {
    display: flex;
    gap: 6px;
  }

  .ap-btn {
    flex: 1;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    padding: 7px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .ap-btn:hover {
    color: var(--text-primary);
    border-color: var(--border-hover);
  }

  .ap-btn.active {
    background: var(--text-primary);
    color: var(--bg);
    border-color: var(--text-primary);
  }

  /* ── Keyboard shortcuts modal ── */
  .kbd-bg {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 110;
  }

  .kbd-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 420px;
    max-width: calc(100vw - 40px);
    background: var(--bg);
    border-radius: 16px;
    box-shadow: var(--shadow-elevated);
    border: 1px solid var(--border);
    padding: 24px 26px 22px;
    z-index: 111;
  }

  .kbd-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .kbd-head h3 {
    font-family: var(--font-serif);
    font-size: 20px;
    font-weight: 400;
    letter-spacing: -0.02em;
    margin: 0;
    color: var(--text-primary);
  }

  .kbd-head h3 em {
    font-style: italic;
  }

  .kbd-head p {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
    margin: 3px 0 0;
    letter-spacing: 0.06em;
  }

  .kbd-head p strong {
    color: var(--text-secondary);
  }

  .kbd-close {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .kbd-close:hover {
    background: color-mix(in srgb, var(--text-primary) 6%, transparent);
    color: var(--text-primary);
  }

  .kbd-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .kbd-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 2px;
    border-bottom: 1px solid var(--border);
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--text-primary);
  }

  .kbd-row:last-child {
    border-bottom: 0;
  }

  .kbd-keys {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .kbd-keys span {
    opacity: 0.5;
  }

  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--text-primary) 6%, transparent);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    min-width: 20px;
    text-align: center;
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .slide-card {
      padding: 28px 24px;
    }

    .slide-content :global(h1) {
      font-size: 28px;
    }

    .slide-content :global(h2) {
      font-size: 22px;
    }

    .slide-content :global(p),
    .slide-content :global(ul),
    .slide-content :global(ol) {
      font-size: 16px;
    }

    .slides-viewport {
      padding: 32px 16px;
    }
  }

  /* ── Print ── */
  @media print {
    .slides-container {
      min-height: auto;
    }

    .slides-progress,
    .slides-nav,
    .slide-comment-btn,
    .comment-card {
      display: none !important;
    }
  }
</style>
