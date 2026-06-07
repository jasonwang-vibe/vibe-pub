<script lang="ts">
  /**
   * Folder reader — directory listing of loosely-related .md files.
   * Ported from the Claude Design prototype `Reader_Folder.html` (tier-1 minimal:
   * one column, typed icons, file rows). Pure presentational.
   */
  interface FileEntry {
    filename: string;
    title: string;
    type: string; // doc | kanban | slides | changelog | timeline | dashboard
    words?: number;
  }
  interface Props {
    files: FileEntry[];
    title?: string;
  }
  let { files, title = 'uploaded' }: Props = $props();

  const ICONS: Record<string, string> = {
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="15" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    slides:
      '<rect x="3" y="4" width="18" height="12" rx="1.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/>',
    kanban:
      '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
    changelog: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    timeline:
      '<line x1="12" y1="3" x2="12" y2="21"/><circle cx="12" cy="7" r="2"/><circle cx="12" cy="17" r="2"/>',
    dashboard:
      '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  };
  const iconFor = (t: string) => ICONS[t] ?? ICONS.doc;
  const readingTime = (w?: number) => (w ? `${Math.max(1, Math.ceil(w / 250))} min` : '');
</script>

<main class="folder-page">
  <header class="head">
    <div class="kicker">
      <svg class="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        ><path
          d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
        /></svg
      >
      folder <span class="sep">·</span> <span>preview</span>
    </div>
    <h1>{title}</h1>
    <div class="sub"><span>{files.length} file{files.length === 1 ? '' : 's'}</span></div>
  </header>

  <div class="bar">
    <span class="n">{files.length} files</span><span class="sort">sorted by name</span>
  </div>

  <div class="files">
    {#each files as f (f.filename)}
      <div class="file">
        <div class="file-l">
          <span class="file-icon {f.type}">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round">{@html iconFor(f.type)}</svg
            >
          </span><span class="ft">{f.title}</span>
          <div class="fm">
            <span class="filename">{f.filename}</span>
            <span class="dot">·</span><span class="ftype">{f.type}</span>
            {#if f.words}<span class="dot">·</span><span>{readingTime(f.words)} read</span>{/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
</main>

<style>
  .folder-page {
    max-width: 760px;
    margin: 0 auto;
    padding: 56px 28px 80px;
  }
  .head {
    margin-bottom: 36px;
  }
  .kicker {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .kicker .fi {
    width: 13px;
    height: 13px;
  }
  .kicker .sep {
    opacity: 0.4;
  }
  .head h1 {
    font-family: var(--font-serif);
    font-size: 44px;
    font-weight: 400;
    line-height: 1.05;
    letter-spacing: -0.025em;
    color: var(--text-primary);
    margin: 0 0 10px;
  }
  .head .sub {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-tertiary);
  }
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0 8px;
    border-bottom: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
    letter-spacing: 0.06em;
  }
  .files {
    display: flex;
    flex-direction: column;
  }
  .file {
    padding: 14px 0;
    border-bottom: 1px solid var(--border);
  }
  .file-l {
    min-width: 0;
  }
  .file-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-right: 10px;
    vertical-align: -6px;
    border-radius: 5px;
    flex-shrink: 0;
  }
  .file-icon :global(svg) {
    width: 13px;
    height: 13px;
    stroke-width: 2;
  }
  .file-icon.doc {
    color: #1d4ed8;
    background: color-mix(in srgb, #1d4ed8 10%, transparent);
  }
  .file-icon.slides {
    color: #6d28d9;
    background: color-mix(in srgb, #6d28d9 10%, transparent);
  }
  .file-icon.kanban {
    color: #b45309;
    background: color-mix(in srgb, #b45309 12%, transparent);
  }
  .file-icon.changelog {
    color: #be185d;
    background: color-mix(in srgb, #be185d 10%, transparent);
  }
  .file-icon.timeline {
    color: #0f766e;
    background: color-mix(in srgb, #0f766e 10%, transparent);
  }
  .file-icon.dashboard {
    color: #4338ca;
    background: color-mix(in srgb, #4338ca 10%, transparent);
  }
  .ft {
    font-family: var(--font-serif);
    font-size: 18px;
    font-weight: 400;
    letter-spacing: -0.01em;
    color: var(--text-primary);
    line-height: 1.3;
  }
  .fm {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 5px;
    margin-left: 32px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .fm .dot {
    opacity: 0.45;
  }
  .fm .filename {
    color: var(--text-secondary);
  }
  @media (max-width: 720px) {
    .folder-page {
      padding: 36px 20px 60px;
    }
    .head h1 {
      font-size: 34px;
    }
    .fm {
      margin-left: 0;
    }
  }
</style>
