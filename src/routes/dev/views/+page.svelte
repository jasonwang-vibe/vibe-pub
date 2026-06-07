<script lang="ts">
  import DocView from '$lib/templates/doc/DocView.svelte';
  import KanbanView from '$lib/templates/kanban/KanbanView.svelte';
  import SlidesView from '$lib/templates/slides/SlidesView.svelte';

  let { data } = $props();

  type ViewKey = 'doc' | 'kanban' | 'deck' | 'folder' | 'collection';
  const VIEWS: { key: ViewKey; label: string; live: boolean }[] = [
    { key: 'doc', label: 'Doc', live: true },
    { key: 'kanban', label: 'Kanban', live: true },
    { key: 'deck', label: 'Deck', live: true },
    { key: 'folder', label: 'Folder', live: false },
    { key: 'collection', label: 'Collection', live: false },
  ];

  let view = $state<ViewKey>('doc');
  let localComments = $state([]);

  const PROTO: Record<ViewKey, string> = {
    doc: 'Reader_Doc.html',
    kanban: 'Reader_Kanban.html',
    deck: 'Reader_Deck.html',
    folder: 'Reader_Folder.html',
    collection: 'Reader_Collection.html',
  };
</script>

<svelte:head><title>Reader views · production preview</title></svelte:head>

<div class="dev-bar">
  <span class="db-title">production views · <strong>live preview</strong></span>
  <div class="db-tabs">
    {#each VIEWS as v}
      <button class:on={view === v.key} class:soon={!v.live} onclick={() => (view = v.key)}>
        {v.label}{#if !v.live}<span class="dot">·</span>{/if}
      </button>
    {/each}
  </div>
  <a class="db-proto" href={`http://localhost:4500/${PROTO[view]}`} target="_blank" rel="noopener">
    open prototype ↗
  </a>
</div>

<div class="dev-stage">
  {#if view === 'doc'}
    <DocView bind:comments={localComments} html={data.docHtml} title={null} pageId="dev-doc" />
  {:else if view === 'kanban'}
    <KanbanView
      boardFullwidth={true}
      markdown={data.kanban.markdown}
      pageId="dev-kanban"
      comments={[]}
      initialColumns={data.kanban.columns}
      initialLabels={data.kanban.labels}
      isOwner={false}
    />
  {:else if view === 'deck'}
    <SlidesView slides={data.slides} title="Agents that publish" comments={[]} pageId="dev-deck" />
  {:else}
    <div class="dev-note">
      <h2>{view === 'folder' ? 'Folder' : 'Collection'} is a container view</h2>
      <p>
        {view === 'folder'
          ? 'There is no standalone Folder component — the folder listing is rendered at the account / directory level.'
          : 'The Collection reader needs full route-level PageData (parts, pages, owner, manifest), so it can’t be mounted from sample props alone.'}
      </p>
      <p>
        For now, compare against the design source:
        <a href={`http://localhost:4500/${PROTO[view]}`} target="_blank" rel="noopener"
          >{PROTO[view]} ↗</a
        >. To preview it live, I can seed a real published {view === 'folder'
          ? 'directory'
          : 'collection'} and link its route.
      </p>
    </div>
  {/if}
</div>

<style>
  .dev-bar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 20px;
    background: #1a1917;
    color: #edeae5;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .db-title strong {
    font-weight: 600;
  }
  .db-tabs {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  .db-tabs button {
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
    color: #b8b5af;
    border: 1px solid transparent;
  }
  .db-tabs button:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
  }
  .db-tabs button.on {
    background: #edeae5;
    color: #1a1917;
  }
  .db-tabs button.soon {
    opacity: 0.55;
  }
  .db-tabs .dot {
    margin-left: 4px;
    opacity: 0.6;
  }
  .db-proto {
    color: #b8b5af;
    text-decoration: none;
  }
  .db-proto:hover {
    color: #fff;
  }

  .dev-stage {
    min-height: calc(100vh - 44px);
  }
  .dev-note {
    max-width: 600px;
    margin: 80px auto;
    padding: 0 24px;
    font-family: var(--font-sans);
    color: var(--text-secondary);
  }
  .dev-note h2 {
    font-family: var(--font-serif);
    font-weight: 400;
    color: var(--text-primary);
  }
  .dev-note a {
    color: var(--text-primary);
  }
</style>
