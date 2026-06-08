<script lang="ts">
  import { untrack } from 'svelte';
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
  import {
    kanbanReaderBoardFullwidth,
    playgroundPanelOpen,
    playgroundPreviewActive,
    playgroundBackAction,
  } from '$lib/components/topbar';
  import {
    closeDocCommentsPanel,
    docCommentsPanelBlockId,
    docCommentsPanelOpen,
  } from '$lib/stores';
  import {
    commentAvatarLetter,
    commentHandle,
    commentTimeAgo,
  } from '$lib/components/comment/utils';
  import '$lib/components/comment/panel.css';
  import type { Comment } from '$lib/types';

  interface UFile {
    name: string;
    content: string;
  }

  interface PubPage {
    id: string;
    title: string | null;
    view: string;
    theme: string;
    created: string;
    markdown: string;
    canonicalPath: string;
  }

  interface Props {
    data: { pages: PubPage[] };
  }

  let { data }: Props = $props();

  interface HistoryItem {
    name: string;
    content: string;
    ts: number;
  }

  const THEMES = ['default', 'paper', 'claude', 'stripe', 'github', 'nord', 'midnight', 'terminal'];
  const HISTORY_KEY = 'vibe-pg-history';
  const MAX_HISTORY = 20;

  let files = $state<UFile[]>([]);
  let pasteText = $state('');
  let theme = $state('default');
  let dark = $state(false);
  let viewOverride = $state('doc');
  let dragging = $state(false);
  let warning = $state('');
  let publishNotice = $state('');

  // Sandbox pages shown in the empty state. Seeded from the server load; grows
  // as uploads auto-publish so the list stays in sync without a reload.
  let sandboxPages = $state<PubPage[]>(data.pages);

  // Panel open state lives in the shared store so Header can toggle it
  let panelOpen = $derived($playgroundPanelOpen);
  function setPanelOpen(v: boolean) {
    playgroundPanelOpen.set(v);
  }
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
    setPanelOpen(false);
    schedulePreview(true);
  }

  // ── Empty-state multi-select ─────────────────────────────────────
  let selectedIds = $state<string[]>([]);
  function toggleSelect(id: string) {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
  }
  function pageFileName(p: PubPage): string {
    const t = (p.title ?? 'untitled').trim();
    if (/\.(md|markdown)$/i.test(t)) return t;
    const slug = t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `${slug || 'untitled'}.md`;
  }
  function viewSelectedPages() {
    const sel = sandboxPages.filter((p) => selectedIds.includes(p.id));
    if (!sel.length) return;
    files = sel.map((p) => ({ name: pageFileName(p), content: p.markdown }));
    pasteText = '';
    if (sel.length === 1) {
      viewOverride = sel[0].view ?? 'doc';
      theme = sel[0].theme ?? 'default';
      activeFile = files[0].name;
    } else {
      // Multiple files → folder view (no single active file).
      activeFile = null;
    }
    setPanelOpen(false);
    schedulePreview(true);
  }

  // ── Back to the playground default page ──────────────────────────
  function backToPlayground() {
    files = [];
    pasteText = '';
    activeFile = null;
    selectedIds = [];
    result = null;
  }

  $effect(() => {
    playgroundPreviewActive.set(!!result && result.mode !== 'empty');
  });
  $effect(() => {
    playgroundBackAction.set(backToPlayground);
    return () => playgroundBackAction.set(null);
  });

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

  // A `_collection.md` manifest makes the multi-file view a collection; otherwise
  // multiple files render as a folder.
  let hasManifest = $derived(files.some((f) => /(^|\/)_collection\.md$/i.test(f.name)));
  let multiFileLabel = $derived(hasManifest ? 'collection' : 'folder');

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
    const attempt = async () => {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ files: f, view: viewOverride }),
      });
      const ct = res.headers.get('content-type') ?? '';
      if (!res.ok || !ct.includes('application/json')) {
        // A cold Worker isolate can briefly exceed CPU limits and return an HTML
        // error page (CF 1102/503). Surface a clean error instead of a raw
        // JSON-parse failure, and let the caller retry.
        throw new Error(`server returned ${res.status}`);
      }
      return (await res.json()) as any;
    };
    try {
      // Retry a few times with backoff. A large doc may exceed the Worker CPU
      // budget on the first (cold) render, but the server caches successful
      // renders by content hash — so a retry usually lands on the cached result.
      let next: any;
      let lastErr: unknown;
      for (let i = 0; i < 4; i++) {
        try {
          next = await attempt();
          lastErr = undefined;
          break;
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
      }
      if (lastErr) throw lastErr;
      warning = '';
      if (next.mode === 'collection') collectionActiveId = '';
      result = next;
    } catch (e) {
      // Keep the last good preview on screen rather than blanking it.
      warning = 'Preview failed — try again: ' + (e instanceof Error ? e.message : 'unknown');
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

  // ── Close panel on Escape or click outside ───────────────────────
  $effect(() => {
    if (!browser || !panelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPanelOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement;
      // Ignore clicks inside the panel itself or on the header toggle button
      if (t.closest?.('.pg-panel') || t.closest?.('[data-pg-panel-toggle]')) return;
      setPanelOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  });

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
      void autoPublishFiles(loaded);
    });
  }

  // Auto-publish uploaded files to the sandbox so they behave like "Publish .md"
  // — each becomes a real sandbox page (URL + listed) the moment it's uploaded.
  async function autoPublishFiles(loaded: UFile[]) {
    if (!browser || !loaded.length) return;
    publishNotice = `Publishing ${loaded.length} file${loaded.length > 1 ? 's' : ''}…`;
    let published = 0;
    for (const f of loaded) {
      if (!f.content.trim()) continue;
      try {
        const res = await fetch('/api/pub', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ markdown: f.content, theme }),
        });
        if (!res.ok) continue;
        const p = (await res.json()) as {
          id: string;
          title: string | null;
          view: string;
          theme: string;
          created: string;
          path: string;
        };
        // Prepend to the sandbox list (newest first), de-duping by id.
        sandboxPages = [
          {
            id: p.id,
            title: p.title,
            view: p.view,
            theme: p.theme,
            created: p.created,
            markdown: f.content,
            canonicalPath: p.path,
          },
          ...sandboxPages.filter((x) => x.id !== p.id),
        ];
        published++;
      } catch {
        // Network error — leave the file as a local-only preview.
      }
    }
    publishNotice =
      published > 0
        ? `Published ${published} file${published > 1 ? 's' : ''} to the sandbox`
        : 'Could not publish — showing local preview only';
    setTimeout(() => (publishNotice = ''), 4000);
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
    setPanelOpen(false);
  }

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

  // Doc URL line (mirrors production's .doc-meta-url): host + slug of the title
  function slugify(s: string): string {
    return (
      s
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'untitled'
    );
  }
  let pgDocUrl = $derived.by(() => {
    const host = browser ? window.location.host : 'vibe.pub';
    return `${host}/${slugify(result?.title ?? 'untitled')}`;
  });

  // ── Local (in-memory) doc comments ───────────────────────────────
  // The playground has no published page to persist against, so comments live
  // only in memory for the current preview. DocView renders its gutter buttons
  // whenever pageId is non-empty and dispatches block clicks through the shared
  // doc-comments store, which this lightweight panel reads.
  const PG_DOC_PAGE_ID = 'pg-doc-preview';
  let pgDocComments = $state<Comment[]>([]);
  let commentsPanelOpen = $state(false);
  let commentsPanelBlockId = $state<string | null>(null);
  let pgCommentDraft = $state('');

  $effect(() => {
    const u1 = docCommentsPanelOpen.subscribe((v) => (commentsPanelOpen = v));
    const u2 = docCommentsPanelBlockId.subscribe((v) => (commentsPanelBlockId = v));
    return () => {
      u1();
      u2();
    };
  });

  // Close the comments rail on Escape or any click outside it (and outside the
  // gutter buttons that open it).
  $effect(() => {
    if (!browser || !commentsPanelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDocCommentsPanel();
    }
    function onDocClick(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('#comments-panel') || t.closest('.bcb')) return;
      closeDocCommentsPanel();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDocClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onDocClick);
    };
  });

  // Reset comments + close the rail whenever the previewed content changes.
  $effect(() => {
    void pgDocHtml;
    untrack(() => {
      pgDocComments = [];
      pgCommentDraft = '';
      closeDocCommentsPanel();
    });
  });

  function pgBlockComments(blockId: string | null): Comment[] {
    if (!blockId) return pgDocComments;
    return pgDocComments.filter((c) => {
      try {
        const a = typeof c.anchor === 'string' ? JSON.parse(c.anchor) : c.anchor;
        return a?.block_id === blockId;
      } catch {
        return false;
      }
    });
  }

  function pgPostComment() {
    const body = pgCommentDraft.trim();
    if (!body || !commentsPanelBlockId) return;
    const anchor = JSON.stringify({ type: 'block', block_id: commentsPanelBlockId });
    pgDocComments = [
      ...pgDocComments,
      {
        id: crypto.randomUUID(),
        page_id: PG_DOC_PAGE_ID,
        user_id: null,
        display_name: 'You',
        anchor,
        anchor_hint: commentsPanelBlockId,
        body,
        resolved: 0,
        agent_published: 0,
        created: new Date().toISOString(),
      } as Comment,
    ];
    pgCommentDraft = '';
  }

  let pgBlockCommentList = $derived(pgBlockComments(commentsPanelBlockId));
</script>

<svelte:head><title>Reader playground · vibe.pub</title></svelte:head>

<!-- ── Backdrop ──────────────────────────────────────────────────── -->
{#if panelOpen}
  <button class="pg-backdrop" aria-label="Close input panel" onclick={() => setPanelOpen(false)}
  ></button>
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
    <button class="panel-close" onclick={() => setPanelOpen(false)} aria-label="Close panel">
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

  <!-- View type selector — 2 rows -->
  <div class="panel-section panel-view-select">
    <div class="panel-view-row">
      <span class="panel-ex-label">single file</span>
      {#each ['doc', 'kanban', 'slides'] as v}
        <button
          class="panel-ex-btn"
          class:active={viewOverride === v}
          onclick={() => {
            viewOverride = v;
          }}>{v}</button
        >
      {/each}
    </div>
    <div class="panel-view-row">
      <span class="panel-ex-label">multi-file</span>
      {#if files.length > 1}
        <button
          class="panel-ex-btn"
          class:active={!activeFile}
          onclick={() => (activeFile = null)}
          title="View all files together"
        >
          {multiFileLabel}
        </button>
        <span class="panel-ex-muted">auto-detected</span>
      {:else}
        <span class="panel-ex-muted">add 2+ files to view as a folder</span>
      {/if}
    </div>
  </div>

  {#if warning}
    <div class="panel-section"><p class="panel-warn">{warning}</p></div>
  {/if}
  {#if publishNotice}
    <div class="panel-section"><p class="panel-notice">{publishNotice}</p></div>
  {/if}

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

<!-- ── Mobile-only floating back button (header back is hidden on mobile) ── -->
{#if result && result.mode !== 'empty'}
  <button class="pg-mobile-back" onclick={backToPlayground}>
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"><path d="M15 18l-6-6 6-6" /></svg
    >
    Playground
  </button>
{/if}

<!-- ── Preview stage ─────────────────────────────────────────────── -->
<div class="pg-stage theme-{theme}">
  {#if !result || result.mode === 'empty'}
    <div class="pg-empty">
      {#if sandboxPages.length > 0}
        <div class="pg-pages">
          <div class="pg-pages-head">
            <span>Published pages</span>
            <span class="pg-pages-hint">select one or more to preview</span>
          </div>
          <div class="pg-pages-list">
            {#each sandboxPages as p (p.id)}
              <button
                class="pg-page-row"
                class:selected={selectedIds.includes(p.id)}
                onclick={() => toggleSelect(p.id)}
                aria-pressed={selectedIds.includes(p.id)}
              >
                <span class="pg-page-check" class:on={selectedIds.includes(p.id)}>
                  {#if selectedIds.includes(p.id)}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"><path d="M20 6L9 17l-5-5" /></svg
                    >
                  {/if}
                </span>
                <span class="pg-page-title">{p.title ?? 'Untitled'}</span>
                <span class="pg-page-view">{p.view}</span>
              </button>
            {/each}
          </div>
          {#if selectedIds.length > 0}
            <button class="pg-view-selected" onclick={viewSelectedPages}>
              {selectedIds.length === 1
                ? 'Preview file'
                : `Preview ${selectedIds.length} files as folder`} →
            </button>
          {/if}
          <p class="pg-empty-hint">
            Or <button class="pg-link-btn" onclick={() => setPanelOpen(true)}
              >upload your own file →</button
            >
          </p>
        </div>
      {:else}
        <p>Paste markdown or upload a file to preview it.</p>
        <button class="pg-empty-btn" onclick={() => setPanelOpen(true)}>Open input panel →</button>
      {/if}
    </div>
  {:else if result.mode === 'folder'}
    <FolderView
      files={result.files}
      onSelect={(name, type) => {
        if (type) viewOverride = type;
        activeFile = name;
      }}
    />
  {:else if result.mode === 'collection'}
    {#key collectionActiveId}
      <PlaygroundCollection data={collectionData} />
    {/key}
  {:else if result.view === 'kanban'}
    <KanbanView
      boardFullwidth={$kanbanReaderBoardFullwidth}
      markdown={result.markdown}
      pageId=""
      comments={[]}
      initialColumns={result.kanban.columns}
      initialLabels={result.kanban.labels}
      isOwner={false}
    />
  {:else if result.view === 'slides'}
    <SlidesView slides={result.slides} title={result.title} comments={[]} pageId="" />
  {:else if result.view === 'changelog'}
    <ChangelogView releases={result.releases} title={result.title} comments={[]} pageId="" />
  {:else if result.view === 'timeline'}
    <TimelineView sections={result.sections} title={result.title} comments={[]} pageId="" />
  {:else if result.view === 'dashboard'}
    <DashboardView sections={result.sections} title={result.title} comments={[]} pageId="" />
  {:else}
    <div class="pg-doc-layout">
      <div class="pg-doc-main">
        <header class="pg-doc-header">
          <div class="pg-doc-meta-url">{pgDocUrl}</div>
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
            bind:comments={pgDocComments}
            bind:outlineVisible={pgDocOutlineVisible}
            bind:hasToc={pgDocHasToc}
            html={pgDocHtml}
            title={null}
            pageId={PG_DOC_PAGE_ID}
            clientHighlight={true}
          />
        </article>
      </div>
    </div>
  {/if}
</div>

<!-- ── Local doc comments rail (in-memory; playground has no published page) ──
     Mirrors the production comment Panel design (src/lib/components/comment). -->
{#if result?.view === 'doc'}
  <aside
    class="comments-panel"
    class:open={commentsPanelOpen}
    id="comments-panel"
    aria-hidden={!commentsPanelOpen}
    aria-label="Comments"
  >
    <div class="rail-head comments-panel-head">
      <div class="comments-panel-head-text">
        <span class="rail-h">
          thread · {pgBlockCommentList.length}
          {pgBlockCommentList.length === 1 ? 'reply' : 'replies'}
        </span>
      </div>
      <button
        type="button"
        class="comments-panel-close"
        aria-label="Close comments"
        onclick={() => closeDocCommentsPanel()}
      >
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
    <div class="comments-panel-scroll">
      {#if pgBlockCommentList.length === 0}
        <div class="empty-rail empty-rail--block">
          <div class="empty-rail-h">No comments on this block yet.</div>
          <div class="empty-rail-c">Write one below — the agent will read it.</div>
        </div>
      {:else}
        <div class="cp-list">
          {#each pgBlockCommentList as comment (comment.id)}
            <article class="cp-comment">
              <div class="cp-comment-card">
                <div class="cp-top">
                  <div class="cp-avatar" aria-hidden="true">
                    {commentAvatarLetter(comment.display_name)}
                  </div>
                  <header class="cp-comment-head">
                    <div class="cp-head-names">
                      <span class="cp-author">{commentHandle(comment.display_name)}</span>
                    </div>
                    <span class="cp-time">{commentTimeAgo(comment.created)}</span>
                  </header>
                </div>
                <p class="cp-body">{comment.body}</p>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </div>
    <div class="cp-compose">
      <div class="cp-compose-row">
        <input
          type="text"
          class="cp-compose-input"
          placeholder="Reply, or leave a new note…"
          bind:value={pgCommentDraft}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              pgPostComment();
            }
          }}
        />
        <button
          type="button"
          class="cp-compose-send"
          onclick={pgPostComment}
          disabled={!pgCommentDraft.trim()}>Send</button
        >
      </div>
    </div>
  </aside>
{/if}

<style>
  /* ── Stage ── */
  .pg-stage {
    background: var(--bg);
    color: var(--text-primary);
    min-height: calc(100dvh - 56px);
    display: flow-root;
  }

  /* ── Backdrop (dims page while panel is open; leaves the header untouched) ── */
  .pg-backdrop {
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    border: none;
    padding: 0;
    cursor: pointer;
    background: rgba(0, 0, 0, 0.32);
    animation: pg-backdrop-in 200ms ease;
  }

  @media (max-width: 640px) {
    .pg-backdrop {
      top: 52px;
    }
  }

  @keyframes pg-backdrop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .pg-empty {
    max-width: 560px;
    margin: 60px auto;
    padding: 0 24px;
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

  /* ── Published pages list (empty state) ── */
  .pg-pages {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pg-pages-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    padding: 0 4px;
  }

  .pg-pages-hint {
    letter-spacing: 0.04em;
    text-transform: none;
    opacity: 0.7;
  }

  .pg-pages-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pg-page-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.12s,
      border-color 0.12s;
    color: var(--text-primary);
  }

  .pg-page-row:hover {
    background: var(--surface);
    border-color: var(--text-tertiary);
  }

  .pg-page-row.selected {
    border-color: var(--text-primary);
    background: color-mix(in srgb, var(--text-primary) 5%, transparent);
  }

  .pg-page-row svg {
    flex-shrink: 0;
  }

  .pg-page-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 5px;
    border: 1.5px solid var(--border);
    color: var(--bg);
    flex-shrink: 0;
    transition:
      background 0.12s,
      border-color 0.12s;
  }

  .pg-page-check.on {
    background: var(--text-primary);
    border-color: var(--text-primary);
  }

  .pg-view-selected {
    margin-top: 4px;
    align-self: stretch;
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    color: var(--bg);
    background: var(--text-primary);
    border: none;
    border-radius: 999px;
    padding: 10px 18px;
    cursor: pointer;
    transition: filter 0.15s;
  }

  .pg-view-selected:hover {
    filter: brightness(0.92);
  }

  .pg-page-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-prose);
    font-size: 14px;
  }

  .pg-page-view {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-tertiary);
    background: color-mix(in srgb, var(--text-primary) 6%, transparent);
    padding: 2px 7px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .pg-empty-hint {
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--text-tertiary);
    margin: 0;
    font-style: normal;
    text-align: center;
  }

  .pg-link-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: 13px;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .pg-link-btn:hover {
    color: var(--text-primary);
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
    box-shadow: none;
    z-index: 200;
    display: flex;
    flex-direction: column;
    transform: translateX(101%);
    transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .pg-panel.open {
    transform: translateX(0);
    box-shadow: -12px 0 40px rgba(0, 0, 0, 0.1);
  }

  /* Floating back control — mobile only (the header back button is hidden there). */
  .pg-mobile-back {
    display: none;
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

  .panel-notice {
    color: var(--text-secondary);
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
    border-top: 1px solid var(--border);
    padding: 24px 20px 14px;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* View type selector */
  .panel-view-select {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .panel-view-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .panel-ex-btn.active {
    background: var(--surface);
    border-color: var(--text-tertiary);
    color: var(--text-primary);
  }

  .panel-ex-muted {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
    opacity: 0.6;
    font-style: italic;
  }

  /* File list */
  .panel-file-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 8px;
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
    .pg-panel {
      width: 100vw;
      border-left: none;
      border-top: 1px solid var(--border);
      top: auto;
      bottom: 0;
      height: 85dvh;
      border-radius: 16px 16px 0 0;
      transform: translateY(101%);
      box-shadow: none;
    }

    .pg-panel.open {
      transform: translateY(0);
      box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
    }

    .pg-mobile-back {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      position: fixed;
      top: 60px;
      left: 12px;
      z-index: 90;
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 6px 12px 6px 9px;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }

    .pg-mobile-back svg {
      width: 13px;
      height: 13px;
      flex-shrink: 0;
    }
  }
</style>
