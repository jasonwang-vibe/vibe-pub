<script lang="ts">
  import { enhance } from '$app/forms';

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

  let pages = $state(data.pages);
  let confirmId = $state<string | null>(null);
  let deleting = $state(false);

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

<!-- Delete confirm dialog -->
{#if confirmId}
  <div class="confirm-backdrop" onclick={() => (confirmId = null)} aria-hidden="true"></div>
  <div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Confirm delete">
    <p class="confirm-msg">Delete this page? This cannot be undone.</p>
    <div class="confirm-actions">
      <button class="confirm-cancel" onclick={() => (confirmId = null)}>Cancel</button>
      <form
        method="POST"
        action="?/delete"
        use:enhance={() => {
          deleting = true;
          return async ({ result, update }) => {
            deleting = false;
            if (result.type === 'success') {
              const id = confirmId;
              confirmId = null;
              pages = pages.filter((p) => p.id !== id);
            } else {
              await update();
            }
          };
        }}
      >
        <input type="hidden" name="id" value={confirmId} />
        <button type="submit" class="confirm-delete" disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </form>
    </div>
  </div>
{/if}

<div class="pub-list">
  <div class="pub-inner">
    <div class="pub-head">
      <h1>Published</h1>
      <span class="pub-count">{pages.length} pages</span>
    </div>

    {#if pages.length === 0}
      <p class="empty">No pages published yet. <a href="/new">Publish one →</a></p>
    {:else}
      <div class="pages-grid">
        {#each pages as p (p.id)}
          <div class="page-row">
            <a href={p.canonicalPath} class="page-link">
              <div class="page-title">{p.title ?? 'Untitled'}</div>
              <div class="page-meta">
                <span class="page-view">{p.view}</span>
                <span class="page-sep">·</span>
                <span class="page-time">{timeAgo(p.created)}</span>
              </div>
            </a>
            <button
              class="page-del-btn"
              onclick={() => (confirmId = p.id)}
              aria-label="Delete {p.title ?? 'Untitled'}"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><polyline points="3 6 5 6 21 6" /><path
                  d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
                /><path d="M10 11v6M14 11v6" /><path
                  d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
                /></svg
              >
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ── Confirm dialog ── */
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 400;
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(2px);
  }

  .confirm-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 410;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.15),
      0 4px 12px rgba(0, 0, 0, 0.06);
    padding: 24px 28px;
    width: min(360px, calc(100vw - 32px));
  }

  .confirm-msg {
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-primary);
    margin: 0 0 20px;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .confirm-cancel {
    font-family: var(--font-sans);
    font-size: 13px;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .confirm-cancel:hover {
    border-color: var(--text-tertiary);
    color: var(--text-primary);
  }

  .confirm-delete {
    font-family: var(--font-sans);
    font-size: 13px;
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    background: #ef4444;
    color: #fff;
    cursor: pointer;
    transition: filter 0.15s;
  }

  .confirm-delete:hover:not(:disabled) {
    filter: brightness(0.9);
  }

  .confirm-delete:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ── Page list ── */
  .pub-list {
    min-height: calc(100vh - 56px);
    padding: 48px 24px 80px;
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
    gap: 4px;
    border-radius: 10px;
    transition: background 120ms ease;
  }

  .page-row:hover {
    background: var(--surface);
  }

  .page-link {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    text-decoration: none;
    gap: 16px;
    min-width: 0;
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

  .page-del-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-tertiary);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition:
      opacity 0.12s,
      color 0.12s,
      background 0.12s;
    flex-shrink: 0;
    margin-right: 8px;
  }

  .page-row:hover .page-del-btn {
    opacity: 1;
  }

  .page-del-btn:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
  }

  .empty {
    font-family: var(--font-prose);
    color: var(--text-tertiary);
    font-style: italic;
  }

  .empty a {
    color: var(--text-primary);
  }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .pub-list {
      padding: 32px 16px 60px;
    }

    h1 {
      font-size: 28px;
    }

    .page-del-btn {
      opacity: 1;
    }

    .page-link {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      padding: 12px 12px;
    }

    .page-meta {
      font-size: 11px;
    }
  }
</style>
