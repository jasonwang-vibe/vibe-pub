<script lang="ts">
  import { beforeNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import DocView from '$lib/templates/doc/DocView.svelte';
  import KanbanView from '$lib/templates/kanban/KanbanView.svelte';
  import SlidesView from '$lib/templates/slides/SlidesView.svelte';
  import ChangelogView from '$lib/templates/changelog/ChangelogView.svelte';
  import TimelineView from '$lib/templates/timeline/TimelineView.svelte';
  import DashboardView from '$lib/templates/dashboard/DashboardView.svelte';
  import FolderView from '$lib/templates/folder/FolderView.svelte';
  import PlaygroundCollection from './PlaygroundCollection.svelte';
  import { PLAYGROUND_COLLECTION_SLUG } from '$lib/templates/collection/playground-slug';
  import { kanbanReaderBoardFullwidth } from '$lib/components/topbar';

  interface UFile {
    name: string;
    content: string;
  }

  interface HistoryItem {
    name: string;
    content: string;
    ts: number;
  }

  const THEMES = ['default', 'paper', 'claude', 'stripe', 'github', 'nord', 'midnight', 'terminal'];
  const OVERRIDES = ['doc', 'kanban', 'slides', 'changelog', 'timeline', 'dashboard'];
  const HISTORY_KEY = 'vibe-pg-history';
  const MAX_HISTORY = 20;

  let files = $state<UFile[]>([]);
  let pasteText = $state('');
  let theme = $state('default');
  let dark = $state(false);
  let viewOverride = $state('doc');
  let panelOpen = $state(false);
  let dragging = $state(false);
  let warning = $state('');
  let pgHistory = $state<HistoryItem[]>([]);

  let result = $state<any>(null);
  let loading = $state(false);
  let collectionActiveId = $state('');

  // ── History ─────────────────────────────────────────────────────
  $effect(() => {
    if (!browser) return;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      pgHistory = raw ? JSON.parse(raw) : [];
    } catch {
      pgHistory = [];
    }
  });

  function pushHistory(items: UFile[]) {
    if (!browser || !items.length) return;
    const now = Date.now();
    const next = [
      ...items.map((f) => ({ name: f.name, content: f.content, ts: now })),
      ...pgHistory.filter((h) => !items.some((f) => f.name === h.name)),
    ].slice(0, MAX_HISTORY);
    pgHistory = next;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  function loadHistoryItem(item: HistoryItem) {
    files = [{ name: item.name, content: item.content }];
    pasteText = '';
    panelOpen = false;
    schedulePreview(true);
  }

  function removeHistoryItem(e: MouseEvent, name: string) {
    e.stopPropagation();
    pgHistory = pgHistory.filter((h) => h.name !== name);
    if (browser) localStorage.setItem(HISTORY_KEY, JSON.stringify(pgHistory));
  }

  function timeAgo(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  // ── Active file selection ────────────────────────────────────────
  let activeFile = $state<string | null>(null);

  // Keep activeFile valid when files change
  $effect(() => {
    if (activeFile && !files.some((f) => f.name === activeFile)) activeFile = null;
  });

  // ── Effective file payload ──────────────────────────────────────
  let payload = $derived.by<UFile[]>(() => {
    if (files.length) {
      if (activeFile) {
        const f = files.find((f) => f.name === activeFile);
        return f ? [f] : files;
      }
      return files;
    }
    return pasteText.trim() ? [{ name: 'untitled.md', content: pasteText }] : [];
  });

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
        body: JSON.stringify({ files: f, view: viewOverride }),
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

  $effect(() => {
    void pasteText;
    void files;
    void viewOverride;
    void activeFile;
    schedulePreview();
  });

  // ── Collection navigation ────────────────────────────────────────
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

  // ── Dark mode ────────────────────────────────────────────────────
  $effect(() => {
    if (!browser) return;
    document.documentElement.classList.toggle('dark', dark);
    return () => document.documentElement.classList.remove('dark');
  });

  // ── Close panel on Escape ────────────────────────────────────────
  $effect(() => {
    if (!browser || !panelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') panelOpen = false;
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // ── Examples ────────────────────────────────────────────────────
  const NL = '\n';
  const EXAMPLES: Record<string, { label: string; view?: string; files: UFile[] }> = {
    doc: {
      label: 'Doc',
      view: 'doc',
      files: [
        {
          name: 'field-report.md',
          content: [
            '# Field report',
            '',
            'Markdown-in, URL-out — the publishing layer for humans and agents.',
            '',
            '## The loop',
            '',
            'An agent writes, a human comments in the margin, the page updates. **Bold**, `inline code`, and [a link](#) read as part of the prose.',
            '',
            '> A document is a conversation — the page updates live.',
            '',
            '- Write the markdown',
            '- Publish to a URL',
            '- Let readers respond',
          ].join(NL),
        },
      ],
    },
    kanban: {
      label: 'Kanban',
      view: 'kanban',
      files: [
        {
          name: 'roadmap.md',
          content: [
            '---',
            'view: kanban',
            'title: Q2 Roadmap',
            'labels:',
            '  feature: "#3b82f6"',
            '  bug: "#ef4444"',
            '---',
            '## Backlog',
            '### SEO + meta tags {#c1} [feature]',
            'Research keywords, update meta.',
            '## In Progress',
            '### Fix login redirect {#c2} [bug]',
            'Token expires on redirect.',
            '## Done',
            '### Ship folder view {#c3} [feature]',
            'Published.',
          ].join(NL),
        },
      ],
    },
    slides: {
      label: 'Deck',
      view: 'slides',
      files: [
        {
          name: 'deck.md',
          content: [
            '---',
            'view: slides',
            'title: Agents that publish',
            '---',
            '# Agents that *publish*',
            '',
            'The publishing layer for humans and agents.',
            '',
            '---',
            '',
            '## The loop',
            '',
            '1. Agent writes markdown',
            '2. Publishes to a URL',
            '3. Humans comment',
            '4. Agent revises in place',
            '',
            '---',
            '',
            '## Try it',
            '',
            '```bash',
            'npx vibe-pub publish report.md',
            '```',
          ].join(NL),
        },
      ],
    },
    folder: {
      label: 'Folder',
      files: [
        {
          name: 'onboarding-guide.md',
          content: '# Onboarding guide' + NL + NL + 'How to get started.',
        },
        {
          name: 'sprint-board.md',
          content: [
            '## Todo',
            '### Task {#t1}',
            '- [ ] a',
            '## Done',
            '### Done {#d1}',
            '- [x] b',
          ].join(NL),
        },
        {
          name: 'investor-deck.md',
          content: [
            '---',
            'view: slides',
            '---',
            '# Slide one',
            '',
            '---',
            '',
            '## Slide two',
          ].join(NL),
        },
      ],
    },
    collection: {
      label: 'Collection',
      files: [
        {
          name: '_collection.md',
          content: [
            '---',
            'title: Agents Handbook',
            'description: A field guide to publishing with agents.',
            '---',
            '## Part One',
            '- intro.md',
            '- basics.md',
            '## Part Two',
            '- roadmap.md',
          ].join(NL),
        },
        { name: 'intro.md', content: '# Introduction' + NL + NL + 'Welcome to the handbook.' },
        { name: 'basics.md', content: '# The basics' + NL + NL + 'Markdown in, URL out.' },
        {
          name: 'roadmap.md',
          content: [
            '## Backlog',
            '### Research {#r1}',
            '- [ ] survey',
            '## Done',
            '### Ship it {#s1}',
            '- [x] launched',
          ].join(NL),
        },
      ],
    },
  };

  function loadExample(key: string) {
    const ex = EXAMPLES[key];
    if (!ex) return;
    pasteText = '';
    if (ex.view) viewOverride = ex.view;
    files = ex.files.map((f) => ({ ...f }));
    panelOpen = false;
  }

  // ── File handling ────────────────────────────────────────────────
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
      pushHistory(loaded);
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
    if (activeFile === name) activeFile = null;
    files = files.filter((f) => f.name !== name);
  }
  function clearAll() {
    files = [];
    pasteText = '';
    activeFile = null;
    result = null;
  }
  function selectFile(name: string) {
    activeFile = activeFile === name ? null : name;
    panelOpen = false;
  }

  let localComments = $state([]);
  const modeLabel = $derived(
    result ? (result.mode === 'single' ? `${result.view}` : result.mode) : 'empty'
  );

  // ── Doc header helpers ────────────────────────────────────────────
  function stripLeadingH1(html: string, title: string | null): string {
    if (!title || !html) return html;
    // Remove the first <h1>...</h1> if its text matches the title
    return html.replace(/^(\s*<h1[^>]*>)(.*?)(<\/h1>)/s, (match, open, inner, close) => {
      const text = inner.replace(/<[^>]+>/g, '').trim();
      return text === title.trim() ? '' : match;
    });
  }

  function calcReadTime(html: string): string {
    const text = html.replace(/<[^>]+>/g, ' ');
    const words = text.split(/\s+/).filter(Boolean).length;
    return `${Math.max(1, Math.round(words / 200))} min read`;
  }

  function extractLede(html: string): string {
    const m = html.match(/<p[^>]*>(.*?)<\/p>/s);
    if (!m) return '';
    return m[1].replace(/<[^>]+>/g, '').trim();
  }

  let pgDocHtml = $derived(
    result?.view === 'doc' ? stripLeadingH1(result.html ?? '', result.title) : ''
  );
  let pgDocLede = $derived(result?.view === 'doc' ? extractLede(pgDocHtml) : '');
  let pgDocReadTime = $derived(result?.view === 'doc' ? calcReadTime(result.html ?? '') : '');

  // Outline state — bound to DocView
  let pgDocOutlineVisible = $state<boolean | undefined>(undefined);
  let pgDocHasToc = $state(false);

  // Date label — format today as "mmm d"
  const pgDocDate = (() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase();
  })();
</script>

<svelte:head><title>Reader playground · vibe.pub</title></svelte:head>

<!-- ── Backdrop ──────────────────────────────────────────────────── -->
{#if panelOpen}
  <div class="pg-backdrop" onclick={() => (panelOpen = false)} aria-hidden="true"></div>
{/if}

<!-- ── Right panel ───────────────────────────────────────────────── -->
<div
  class="pg-panel"
  class:open={panelOpen}
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
  class:dragging
  role="region"
  aria-label="Playground input panel"
>
  <!-- Panel header -->
  <div class="panel-head">
    <div class="panel-head-left">
      <span class="panel-title">reader <strong>playground</strong></span>
      <span class="panel-mode">{loading ? 'rendering…' : modeLabel}</span>
    </div>
    <button class="panel-close" onclick={() => (panelOpen = false)} aria-label="Close panel">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg
      >
    </button>
  </div>

  <!-- Controls -->
  <div class="panel-controls">
    <label class="panel-field">
      <span class="panel-field-label">view</span>
      <select bind:value={viewOverride}>
        {#each OVERRIDES as v}<option value={v}>{v}</option>{/each}
      </select>
    </label>
    <label class="panel-field">
      <span class="panel-field-label">theme</span>
      <select bind:value={theme}>
        {#each THEMES as t}<option value={t}>{t}</option>{/each}
      </select>
    </label>
    <label class="panel-check">
      <input type="checkbox" bind:checked={dark} />
      <span>dark</span>
    </label>
  </div>

  <div class="panel-sep"></div>

  <!-- Examples -->
  <div class="panel-section">
    {#if warning}<p class="panel-warn">{warning}</p>{/if}
    <div class="panel-examples">
      <span class="panel-ex-label">single file</span>
      {#each Object.entries(EXAMPLES).filter(([k]) => !['folder', 'collection'].includes(k)) as [key, ex]}
        <button class="panel-ex-btn" onclick={() => loadExample(key)}>{ex.label}</button>
      {/each}
      <span class="panel-ex-sep">·</span>
      <span class="panel-ex-label">multi-file</span>
      {#each Object.entries(EXAMPLES).filter( ([k]) => ['folder', 'collection'].includes(k) ) as [key, ex]}
        <button class="panel-ex-btn" onclick={() => loadExample(key)}>{ex.label}</button>
      {/each}
    </div>
  </div>

  <div class="panel-sep"></div>

  <!-- File list or paste textarea -->
  <div class="panel-input-area">
    {#if files.length}
      <!-- File list -->
      <div class="panel-file-list">
        {#each files as f (f.name)}
          <div
            role="button"
            tabindex="0"
            class="panel-file-row"
            class:active={activeFile === f.name}
            onclick={() => selectFile(f.name)}
            onkeydown={(e) => e.key === 'Enter' && selectFile(f.name)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              ><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /></svg
            >
            <span class="panel-file-name">{f.name}</span>
            {#if activeFile === f.name}
              <span class="panel-file-viewing">viewing</span>
            {:else if files.length > 1}
              <span class="panel-file-view-hint">view</span>
            {/if}
            <button
              class="panel-file-del"
              onclick={(e) => {
                e.stopPropagation();
                removeFile(f.name);
              }}
              aria-label="Remove {f.name}">×</button
            >
          </div>
        {/each}
      </div>
      <!-- Add more + clear -->
      <div class="panel-file-actions">
        <label class="panel-upload panel-upload-sm">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
              points="17 8 12 3 7 8"
            /><line x1="12" y1="3" x2="12" y2="15" /></svg
          >
          Add files
          <input type="file" accept=".md,.markdown,.txt" multiple onchange={onFileInput} hidden />
        </label>
        <button class="panel-clear" onclick={clearAll}>clear all</button>
      </div>
    {:else}
      <!-- Upload button -->
      <div class="panel-upload-row">
        <label class="panel-upload">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
              points="17 8 12 3 7 8"
            /><line x1="12" y1="3" x2="12" y2="15" /></svg
          >
          Upload files
          <input type="file" accept=".md,.markdown,.txt" multiple onchange={onFileInput} hidden />
        </label>
      </div>
      <textarea
        bind:value={pasteText}
        class="panel-textarea"
        spellcheck="false"
        placeholder={dragging
          ? 'Drop .md files here…'
          : '# Your title\n\nPaste markdown to preview…'}
      ></textarea>
      {#if pasteText}
        <button class="panel-clear" onclick={clearAll}>clear</button>
      {/if}
    {/if}
  </div>

  <!-- History -->
  {#if pgHistory.length > 0}
    <div class="panel-sep"></div>
    <div class="panel-section">
      <div class="panel-section-head">
        <span class="panel-section-title">Recent files</span>
      </div>
      <div class="panel-history">
        {#each pgHistory as item (item.name + item.ts)}
          <div
            role="button"
            tabindex="0"
            class="panel-hist-row"
            onclick={() => loadHistoryItem(item)}
            onkeydown={(e) => e.key === 'Enter' && loadHistoryItem(item)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              ><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /></svg
            >
            <span class="hist-name">{item.name}</span>
            <span class="hist-time">{timeAgo(item.ts)}</span>
            <button
              class="hist-del"
              onclick={(e) => removeHistoryItem(e, item.name)}
              aria-label="Remove from history">×</button
            >
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- ── FAB toggle ─────────────────────────────────────────────────── -->
<button
  class="pg-fab"
  class:active={panelOpen}
  onclick={() => (panelOpen = !panelOpen)}
  aria-label={panelOpen ? 'Close input panel' : 'Open input panel'}
  aria-expanded={panelOpen}
>
  {#if panelOpen}
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg
    >
  {:else}
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      ><rect x="3" y="3" width="7" height="7" rx="1" /><rect
        x="14"
        y="3"
        width="7"
        height="7"
        rx="1"
      /><rect x="3" y="14" width="7" height="7" rx="1" /><rect
        x="14"
        y="14"
        width="7"
        height="7"
        rx="1"
      /></svg
    >
  {/if}
</button>

<!-- ── Preview stage ─────────────────────────────────────────────── -->
<div class="pg-stage theme-{theme}">
  {#if !result || result.mode === 'empty'}
    <div class="pg-empty">
      <p>Paste markdown or upload a file to preview it.</p>
      <button class="pg-empty-btn" onclick={() => (panelOpen = true)}>Open input panel →</button>
    </div>
  {:else if result.mode === 'folder'}
    <FolderView files={result.files} />
  {:else if result.mode === 'collection'}
    {#key collectionActiveId}
      <PlaygroundCollection data={collectionData} />
    {/key}
  {:else if result.view === 'kanban'}
    <KanbanView
      boardFullwidth={$kanbanReaderBoardFullwidth}
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
    <div class="pg-doc-layout">
      <div class="pg-doc-main">
        <header class="pg-doc-header">
          <div class="pg-doc-meta-url">playground preview</div>
          <h1 class="pg-doc-hero-title">{result.title ?? 'Untitled'}</h1>
          {#if pgDocLede}
            <p class="pg-doc-lede">{pgDocLede}</p>
          {/if}
          <div class="pg-doc-byline">
            <span>{pgDocDate}</span>
            <span class="pg-doc-byline-dot"></span>
            <span>{pgDocReadTime}</span>
            {#if pgDocHasToc}
              <span class="pg-doc-byline-dot"></span>
              <button
                type="button"
                class="pg-meta-outline-btn"
                class:active={pgDocOutlineVisible}
                onclick={() => (pgDocOutlineVisible = !pgDocOutlineVisible)}
                aria-pressed={pgDocOutlineVisible}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13" /></svg
                >
                <span>{pgDocOutlineVisible ? 'Hide outline' : 'Show outline'}</span>
              </button>
            {/if}
          </div>
        </header>
        <article class="pg-doc-article">
          <DocView
            bind:comments={localComments}
            bind:outlineVisible={pgDocOutlineVisible}
            bind:hasToc={pgDocHasToc}
            html={pgDocHtml}
            title={null}
            pageId="pg"
          />
        </article>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ── Stage ── */
  .pg-stage {
    background: var(--bg);
    color: var(--text-primary);
    min-height: calc(100vh - 56px);
  }

  .pg-empty {
    max-width: 480px;
    margin: 100px auto;
    text-align: center;
    font-family: var(--font-prose);
    color: var(--text-tertiary);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .pg-empty p {
    font-style: italic;
    margin: 0;
  }

  .pg-empty-btn {
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 8px 16px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .pg-empty-btn:hover {
    color: var(--text-primary);
    border-color: var(--text-tertiary);
  }

  /* ── FAB ── */
  .pg-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    background: var(--text-primary);
    color: var(--bg);
    border: none;
    cursor: pointer;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.2),
      0 1px 4px rgba(0, 0, 0, 0.1);
    transition:
      transform 0.15s,
      box-shadow 0.15s,
      background 0.15s;
  }

  .pg-fab:hover {
    transform: scale(1.08);
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.25),
      0 2px 6px rgba(0, 0, 0, 0.12);
  }

  .pg-fab.active {
    background: var(--text-secondary);
  }

  /* ── Backdrop ── */
  .pg-backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(1px);
    animation: backdrop-in 200ms ease;
  }

  @keyframes backdrop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ── Panel ── */
  .pg-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: min(400px, 100vw);
    height: 100dvh;
    background: var(--bg);
    border-left: 1px solid var(--border);
    box-shadow: -12px 0 40px rgba(0, 0, 0, 0.1);
    z-index: 200;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .pg-panel.open {
    transform: translateX(0);
  }

  .pg-panel.dragging {
    box-shadow: inset 0 0 0 2px var(--text-primary);
  }

  /* Panel header */
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 1;
  }

  .panel-head-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .panel-title {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-secondary);
  }

  .panel-title strong {
    font-weight: 600;
    color: var(--text-primary);
  }

  .panel-mode {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
    background: color-mix(in srgb, var(--text-primary) 6%, transparent);
    padding: 2px 7px;
    border-radius: 999px;
  }

  .panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border);
    background: transparent;
    border-radius: 999px;
    cursor: pointer;
    color: var(--text-tertiary);
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .panel-close:hover {
    color: var(--text-primary);
    border-color: var(--text-tertiary);
  }

  /* Controls */
  .panel-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding: 14px 20px;
    flex-shrink: 0;
  }

  .panel-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .panel-field-label {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .panel-controls select {
    font-family: var(--font-mono);
    font-size: 12px;
    background: var(--surface);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 8px;
    cursor: pointer;
  }

  .panel-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  /* Separator */
  .panel-sep {
    height: 1px;
    background: var(--border);
    flex-shrink: 0;
  }

  /* Sections */
  .panel-section {
    padding: 14px 20px;
    flex-shrink: 0;
  }

  .panel-section-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .panel-upload {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
    color: var(--text-primary);
    transition: all 0.15s;
  }

  .panel-upload:hover {
    background: var(--surface);
    border-color: var(--text-tertiary);
  }

  .panel-clear {
    font-family: var(--font-mono);
    font-size: 12px;
    background: transparent;
    color: var(--text-tertiary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .panel-clear:hover {
    color: var(--text-primary);
  }

  .panel-warn {
    color: #ef4444;
    font-family: var(--font-mono);
    font-size: 12px;
    margin: 0 0 10px;
  }

  /* Examples */
  .panel-examples {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .panel-ex-label {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .panel-ex-sep {
    color: var(--text-tertiary);
    opacity: 0.4;
    margin: 0 2px;
  }

  .panel-ex-btn {
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .panel-ex-btn:hover {
    color: var(--text-primary);
    background: var(--surface);
    border-color: var(--text-tertiary);
  }

  /* Input area */
  .panel-input-area {
    padding: 0 20px 14px;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* File list */
  .panel-file-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .panel-file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 7px;
    cursor: pointer;
    transition: background 0.12s;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    border: none;
    background: transparent;
    text-align: left;
    width: 100%;
  }

  .panel-file-row:hover {
    background: var(--surface);
  }

  .panel-file-row.active {
    background: color-mix(in srgb, var(--text-primary) 6%, transparent);
    color: var(--text-primary);
  }

  .panel-file-row svg {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .panel-file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-file-viewing {
    font-size: 10px;
    color: var(--text-tertiary);
    flex-shrink: 0;
    opacity: 0.7;
  }

  .panel-file-view-hint {
    font-size: 10px;
    color: var(--text-tertiary);
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .panel-file-row:hover .panel-file-view-hint {
    opacity: 0.6;
  }

  .panel-file-del {
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-tertiary);
    font-size: 14px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .panel-file-row:hover .panel-file-del,
  .panel-file-row.active .panel-file-del {
    opacity: 1;
  }

  .panel-file-del:hover {
    color: #ef4444;
  }

  .panel-file-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 2px 0;
  }

  .panel-upload-sm {
    font-size: 11px !important;
    padding: 4px 10px !important;
  }

  .panel-upload-row {
    margin-bottom: 4px;
  }

  .panel-textarea {
    width: 100%;
    min-height: 220px;
    max-height: 40vh;
    resize: vertical;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.7;
    color: var(--text-primary);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s;
  }

  .panel-textarea:focus {
    border-color: var(--text-tertiary);
  }

  /* History */
  .panel-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .panel-section-title {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .panel-history {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .panel-hist-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 7px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s;
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 13px;
  }

  .panel-hist-row:hover {
    background: var(--surface);
  }

  .panel-hist-row svg {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .hist-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-secondary);
  }

  .hist-time {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .hist-del {
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-tertiary);
    font-size: 14px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 0.12s;
    flex-shrink: 0;
  }

  .panel-hist-row:hover .hist-del {
    opacity: 1;
  }

  .hist-del:hover {
    color: #ef4444;
  }

  /* ── Doc layout (mirrors production PublishedPage .doc-layout + .doc-main) ── */
  .pg-doc-layout {
    display: grid;
    grid-template-columns: 1fr;
    max-width: 1280px;
    margin: 0 auto;
    padding: 64px 32px 120px;
    box-sizing: border-box;
  }

  @media (max-width: 959px) {
    .pg-doc-layout {
      max-width: 680px;
      padding: 48px 24px 80px;
    }
  }

  @media (max-width: 639px) {
    .pg-doc-layout {
      padding: 24px 20px 80px;
    }

    .pg-doc-hero-title {
      font-size: 36px;
    }

    .pg-doc-lede {
      font-size: 17px;
    }
  }

  @media (min-width: 640px) and (max-width: 959px) {
    .pg-doc-hero-title {
      font-size: 48px;
    }

    .pg-doc-lede {
      font-size: 18px;
    }
  }

  .pg-doc-main {
    min-width: 0;
    width: 100%;
    max-width: 680px;
    margin: 0 auto;
  }

  /* When outline is visible, shift the whole column (header + body) right together */
  @media (min-width: 1280px) {
    .pg-doc-layout:has(.outline-panel) {
      padding-left: calc(24px + 220px + 32px + 24px);
    }

    .pg-doc-layout:has(.outline-panel) .pg-doc-main {
      margin-left: 0;
      margin-right: auto;
    }

    /* Cancel DocView's own body-only shift — layout shift handles everything */
    .pg-doc-article :global(.doc-wrap.has-outline) {
      padding-left: 0;
    }
  }

  /* Article header — mirrors .doc-header / .doc-meta-url / .doc-hero-title / .doc-lede / .doc-byline */
  .pg-doc-header {
    margin-bottom: 0;
  }

  .pg-doc-meta-url {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-tertiary);
    margin-bottom: 28px;
  }

  .pg-doc-hero-title {
    font-family: var(--font-serif);
    font-weight: 400;
    font-size: clamp(40px, 5vw, 56px);
    line-height: 1.04;
    letter-spacing: -0.028em;
    color: var(--text-primary);
    margin: 0 0 20px;
  }

  .pg-doc-lede {
    font-family: var(--font-prose);
    font-size: clamp(18px, 1.6vw, 21px);
    line-height: 1.55;
    color: var(--text-secondary);
    margin: 0 0 20px;
    font-weight: 400;
  }

  .pg-doc-byline {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-tertiary);
    margin-bottom: 48px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
  }

  .pg-doc-byline-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--text-tertiary);
    opacity: 0.5;
    flex-shrink: 0;
  }

  .pg-meta-outline-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-tertiary);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s;
  }

  .pg-meta-outline-btn:hover,
  .pg-meta-outline-btn.active {
    color: var(--text-primary);
  }

  .pg-doc-article {
    position: relative;
  }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .pg-fab {
      bottom: 16px;
      right: 16px;
      width: 40px;
      height: 40px;
    }

    .pg-panel {
      width: 100vw;
      border-left: none;
      border-top: 1px solid var(--border);
      top: auto;
      bottom: 0;
      height: 85dvh;
      border-radius: 16px 16px 0 0;
      transform: translateY(100%);
      box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
    }

    .pg-panel.open {
      transform: translateY(0);
    }
  }
</style>
