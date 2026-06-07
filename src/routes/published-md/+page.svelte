<script lang="ts">
  interface PageItem {
    id: string;
    title: string | null;
    view: string;
    theme: string;
    created: string;
    canonicalPath: string;
  }

  interface Props {
    data: { pages: PageItem[] };
  }

  let { data }: Props = $props();

  function timeAgo(dateStr: string): string {
    const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
</script>

<svelte:head>
  <title>Published — vibe.pub</title>
</svelte:head>

<div class="pub-list">
  <div class="pub-inner">
    <div class="pub-head">
      <h1>Published</h1>
      <span class="pub-count">{data.pages.length} pages</span>
    </div>

    {#if data.pages.length === 0}
      <p class="empty">No pages published yet. <a href="/new">Publish one →</a></p>
    {:else}
      <div class="pages-grid">
        {#each data.pages as p}
          <a href={p.canonicalPath} class="page-row">
            <div class="page-title">{p.title ?? 'Untitled'}</div>
            <div class="page-meta">
              <span class="page-view">{p.view}</span>
              <span class="page-sep">·</span>
              <span class="page-time">{timeAgo(p.created)}</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .pub-list {
    min-height: calc(100vh - 56px);
    padding: 48px 32px 80px;
  }

  .pub-inner {
    max-width: 720px;
    margin: 0 auto;
  }

  .pub-head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 32px;
  }

  h1 {
    font-family: var(--font-serif);
    font-size: 40px;
    font-weight: 400;
    letter-spacing: -0.03em;
    margin: 0;
    color: var(--text-primary);
  }

  .pub-count {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-tertiary);
  }

  .pages-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .page-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-radius: 10px;
    text-decoration: none;
    transition: background 120ms ease;
    gap: 16px;
  }

  .page-row:hover {
    background: var(--surface);
  }

  .page-title {
    font-family: var(--font-prose);
    font-size: 15px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .page-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .page-view {
    background: color-mix(in srgb, var(--text-primary) 6%, transparent);
    padding: 2px 7px;
    border-radius: 999px;
    color: var(--text-secondary);
  }

  .page-sep {
    opacity: 0.4;
  }

  .empty {
    font-family: var(--font-prose);
    color: var(--text-tertiary);
    font-style: italic;
  }

  .empty a {
    color: var(--text-primary);
  }
</style>
