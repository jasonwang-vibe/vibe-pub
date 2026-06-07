<script lang="ts">
  import { beforeNavigate } from '$app/navigation';
  import DocView from '$lib/templates/doc/DocView.svelte';
  import KanbanView from '$lib/templates/kanban/KanbanView.svelte';
  import SlidesView from '$lib/templates/slides/SlidesView.svelte';
  import ChangelogView from '$lib/templates/changelog/ChangelogView.svelte';
  import TimelineView from '$lib/templates/timeline/TimelineView.svelte';
  import DashboardView from '$lib/templates/dashboard/DashboardView.svelte';
  import FolderView from '$lib/templates/folder/FolderView.svelte';
  import PlaygroundCollection from './PlaygroundCollection.svelte';
  import { PLAYGROUND_COLLECTION_SLUG } from '$lib/templates/collection/playground-slug';

  interface UFile {
    name: string;
    content: string;
  }

  const THEMES = ['default', 'paper', 'claude', 'stripe', 'github', 'nord', 'midnight', 'terminal'];
  const OVERRIDES = ['auto', 'doc', 'kanban', 'slides', 'changelog', 'timeline', 'dashboard'];

  let files = $state<UFile[]>([]);
  let pasteText = $state('');
  let theme = $state('default');
  let dark = $state(false);
  let viewOverride = $state('auto');
  let inputOpen = $state(true);
  let dragging = $state(false);
  let warning = $state('');

  let result = $state<any>(null);
  let loading = $state(false);
  let collectionActiveId = $state('');

  // ── Effective file payload ──────────────────────────────────────
  let payload = $derived<UFile[]>(
    files.length ? files : pasteText.trim() ? [{ name: 'untitled.md', content: pasteText }] : []
  );

  // ── Debounced preview fetch ─────────────────────────────────────
  let timer: ReturnType<typeof setTimeout> | null = null;
  function schedulePreview(immediate = false) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(runPreview, immediate ? 0 : 300);
  }
  async function runPreview() {
    const f = payload;
    if (!f.length) {
      result = null;
      return;
    }
    loading = true;
    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          files: f,
          view: viewOverride === 'auto' ? undefined : viewOverride,
        }),
      });
      const next = (await res.json()) as any;
      if (next.mode === 'collection') collectionActiveId = '';
      result = next;
    } catch (e) {
      warning = 'Preview failed: ' + (e instanceof Error ? e.message : 'unknown');
    } finally {
      loading = false;
    }
  }

  // re-run when inputs change
  $effect(() => {
    void pasteText;
    void files;
    void viewOverride;
    schedulePreview();
  });

  // ── Collection navigation: intercept /c/__playground__ links ─────
  beforeNavigate((nav) => {
    const path = nav.to?.url.pathname ?? '';
    if (result?.mode === 'collection' && path.startsWith('/c/' + PLAYGROUND_COLLECTION_SLUG)) {
      nav.cancel();
      collectionActiveId = nav.to?.url.searchParams.get('page') ?? '';
    }
  });
  let collectionData = $derived(
    result?.mode === 'collection'
      ? collectionActiveId
        ? (result.pagesById[collectionActiveId] ?? result.cover)
        : result.cover
      : null
  );

  // ── File handling ───────────────────────────────────────────────
  function readFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter(
      (f) =>
        /\.(md|markdown|txt)$/i.test(f.name) ||
        f.type === 'text/markdown' ||
        f.type === 'text/plain'
    );
    if (!arr.length) {
      warning = 'Only .md / .markdown / .txt files are supported.';
      setTimeout(() => (warning = ''), 4000);
      return;
    }
    warning = '';
    Promise.all(
      arr.map(
        (file) =>
          new Promise<UFile>((resolve) => {
            const r = new FileReader();
            r.onload = (e) =>
              resolve({ name: file.name, content: (e.target?.result as string) ?? '' });
            r.readAsText(file);
          })
      )
    ).then((loaded) => {
      files = [...files, ...loaded];
    });
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files?.length) readFiles(e.dataTransfer.files);
  }
  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) readFiles(input.files);
    input.value = '';
  }
  function removeFile(name: string) {
    files = files.filter((f) => f.name !== name);
  }
  function clearAll() {
    files = [];
    pasteText = '';
    result = null;
  }

  let localComments = $state([]);
  const modeLabel = $derived(
    result ? (result.mode === 'single' ? `single · ${result.view}` : result.mode) : 'empty'
  );
</script>

<svelte:head><title>Reader playground · vibe.pub</title></svelte:head>

<!-- ── Top control bar ───────────────────────────────────────────── -->
<div class="pg-bar">
  <span class="pg-title">reader <strong>playground</strong></span>
  <span class="pg-mode">{loading ? 'rendering…' : modeLabel}</span>
  <div class="pg-controls">
    <label class="pg-field"
      >view
      <select bind:value={viewOverride}
        >{#each OVERRIDES as v}<option value={v}>{v}</option>{/each}</select
      >
    </label>
    <label class="pg-field"
      >theme
      <select bind:value={theme}
        >{#each THEMES as t}<option value={t}>{t}</option>{/each}</select
      >
    </label>
    <label class="pg-check"><input type="checkbox" bind:checked={dark} /> dark</label>
    <button class="pg-btn" onclick={() => (inputOpen = !inputOpen)}
      >{inputOpen ? 'hide input' : 'show input'}</button
    >
  </div>
</div>

<!-- ── Input drawer ──────────────────────────────────────────────── -->
{#if inputOpen}
  <div
    class="pg-input"
    class:dragging
    ondragover={(e) => {
      e.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
    role="region"
    aria-label="Markdown input"
  >
    <div class="pg-input-head">
      <span
        >Paste markdown, or upload <code>.md</code> file(s) — multiple files become a folder;
        include a <code>_collection.md</code> for a collection.</span
      >
      <div class="pg-input-actions">
        <label class="pg-upload"
          >upload files<input
            type="file"
            accept=".md,.markdown,.txt"
            multiple
            onchange={onFileInput}
            hidden
          /></label
        >
        {#if files.length || pasteText}<button class="pg-btn" onclick={clearAll}>clear</button>{/if}
      </div>
    </div>
    {#if warning}<p class="pg-warn">{warning}</p>{/if}
    {#if files.length}
      <div class="pg-chips">
        {#each files as f (f.name)}
          <span class="pg-chip"
            >{f.name}<button onclick={() => removeFile(f.name)} aria-label="remove">×</button></span
          >
        {/each}
      </div>
    {:else}
      <textarea
        bind:value={pasteText}
        class="pg-textarea"
        spellcheck="false"
        placeholder={dragging
          ? 'Drop .md files here…'
          : '# Your title\n\nWrite or paste markdown to preview it in the reader…'}
      ></textarea>
    {/if}
  </div>
{/if}

<!-- ── Preview stage ─────────────────────────────────────────────── -->
<div class:dark>
  <div class="pg-stage theme-{theme}">
    {#if !result || result.mode === 'empty'}
      <div class="pg-empty">Paste markdown or upload a file to preview it.</div>
    {:else if result.mode === 'folder'}
      <FolderView files={result.files} />
    {:else if result.mode === 'collection'}
      {#key collectionActiveId}
        <PlaygroundCollection data={collectionData} />
      {/key}
    {:else if result.view === 'kanban'}
      <KanbanView
        boardFullwidth={true}
        markdown={result.markdown}
        pageId="pg"
        comments={[]}
        initialColumns={result.kanban.columns}
        initialLabels={result.kanban.labels}
        isOwner={false}
      />
    {:else if result.view === 'slides'}
      <SlidesView slides={result.slides} title={result.title} comments={[]} pageId="pg" />
    {:else if result.view === 'changelog'}
      <ChangelogView releases={result.releases} title={result.title} comments={[]} pageId="pg" />
    {:else if result.view === 'timeline'}
      <TimelineView sections={result.sections} title={result.title} comments={[]} pageId="pg" />
    {:else if result.view === 'dashboard'}
      <DashboardView sections={result.sections} title={result.title} comments={[]} pageId="pg" />
    {:else}
      <DocView bind:comments={localComments} html={result.html} title={result.title} pageId="pg" />
    {/if}
  </div>
</div>

<style>
  .pg-bar {
    position: sticky;
    top: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    background: #1a1917;
    color: #edeae5;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .pg-title strong {
    font-weight: 600;
  }
  .pg-mode {
    color: #9e9b95;
  }
  .pg-controls {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-left: auto;
  }
  .pg-field,
  .pg-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .pg-bar select {
    font-family: var(--font-mono);
    font-size: 12px;
    background: #2e2d2a;
    color: #edeae5;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 3px 6px;
  }
  .pg-btn {
    font-family: var(--font-mono);
    font-size: 12px;
    background: transparent;
    color: #b8b5af;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .pg-btn:hover {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.4);
  }

  .pg-input {
    background: var(--surface, #fff);
    border-bottom: 1px solid var(--border);
    padding: 14px 20px;
  }
  .pg-input.dragging {
    box-shadow: inset 0 0 0 2px #1a1917;
  }
  .pg-input-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 10px;
  }
  .pg-input-head code {
    font-family: var(--font-mono);
    font-size: 11px;
    background: rgba(0, 0, 0, 0.05);
    padding: 1px 5px;
    border-radius: 4px;
  }
  .pg-input-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  .pg-upload {
    font-family: var(--font-mono);
    font-size: 12px;
    border: 1px solid var(--border-hover, rgba(0, 0, 0, 0.12));
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    color: var(--text-primary);
  }
  .pg-upload:hover {
    background: rgba(0, 0, 0, 0.04);
  }
  .pg-warn {
    color: var(--error, #ef4444);
    font-family: var(--font-mono);
    font-size: 12px;
    margin: 0 0 8px;
  }
  .pg-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pg-chip {
    font-family: var(--font-mono);
    font-size: 11px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 6px;
    padding: 3px 6px 3px 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
  }
  .pg-chip button {
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-tertiary);
    font-size: 14px;
    line-height: 1;
  }
  .pg-chip button:hover {
    color: var(--text-primary);
  }
  .pg-textarea {
    width: 100%;
    min-height: 180px;
    resize: vertical;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.7;
    color: var(--text-primary);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 18px;
    box-sizing: border-box;
    outline: none;
  }

  .pg-stage {
    background: var(--bg);
    color: var(--text-primary);
    min-height: calc(100vh - 44px);
  }
  .pg-empty {
    max-width: 600px;
    margin: 80px auto;
    text-align: center;
    font-family: var(--font-prose);
    font-style: italic;
    color: var(--text-tertiary);
  }
</style>
