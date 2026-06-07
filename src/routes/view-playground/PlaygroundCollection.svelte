<script lang="ts">
  /**
   * Playground collection reader — mirrors the body of
   * `$lib/templates/collection/Reader.svelte` using only its server-free
   * sub-components (Spine, Cover, chapter Doc/Kanban). The real Reader pulls
   * `$lib/server` via its search panel, which can't be bundled into a browser
   * route — so we compose the clean pieces here instead.
   *
   * Navigation uses /c/<sentinel>?page=… hrefs; the parent /playground page
   * intercepts those via beforeNavigate and swaps `data`.
   */
  import DocChapter from '$lib/templates/collection/chapter/Doc.svelte';
  import KanbanChapter from '$lib/templates/collection/chapter/Kanban.svelte';
  import Cover from '$lib/templates/collection/Cover.svelte';
  import Spine from '$lib/templates/collection/Spine.svelte';
  import { chapterLede } from '$lib/templates/collection/chapter/index';
  import { buildCanonicalPath } from '$lib/slug-path';
  import { PLAYGROUND_COLLECTION_SLUG } from '$lib/templates/collection/playground-slug';
  import '$lib/templates/collection/reader.css';

  let { data }: { data: any } = $props();

  let spineOpen = $state(false);
  let localComments = $state([]);

  const pageHref = (id: string) => `/c/${PLAYGROUND_COLLECTION_SLUG}?page=${id}`;
  const coverHref = `/c/${PLAYGROUND_COLLECTION_SLUG}`;

  let hasPartStructure = $derived((data.parts?.length ?? 0) > 0);
  let showSidebarNav = $derived((data.pages?.length ?? 0) > 0 || hasPartStructure);

  let chapterLedeText = $derived.by(() => {
    const ap = data.activePage;
    if (!ap) return null;
    return chapterLede({
      view: ap.view,
      frontmatter: ap.frontmatter,
      html: ap.html,
      kanbanColumns: ap.kanbanData?.columns,
    });
  });

  let cp = $derived.by(() => {
    const ap = data.activePage;
    const ch = data.chapter;
    if (!ap || !ch) return null;
    return {
      title: ap.title ?? ap.slug ?? 'Untitled',
      lede: chapterLedeText,
      partEyebrow: ch.partEyebrow,
      chapterNum: ch.num,
      totalChapters: ch.total,
      authorUsername: data.owner?.username ?? null,
      updated: ap.updated,
      pageHref: buildCanonicalPath({ id: ap.id, slug: ap.slug ?? null, title: ap.title ?? null }),
      prev: ch.prev,
      next: ch.next,
    };
  });
</script>

<div class="c-body" class:has-nav={showSidebarNav}>
  {#if showSidebarNav && spineOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <button
      type="button"
      class="c-spine-backdrop"
      aria-label="Close contents"
      onclick={() => (spineOpen = false)}
    ></button>
  {/if}

  {#if showSidebarNav}
    <Spine
      mobileOpen={spineOpen}
      collectionTitle={data.collection.title}
      ownerUsername={data.owner?.username}
      parts={data.parts}
      ungroupedPages={data.ungroupedPages}
      {hasPartStructure}
      pages={data.pages}
      {pageHref}
      {coverHref}
      coverActive={data.showCover}
    />
  {/if}

  <div class="c-main">
    {#if data.showCover}
      <Cover
        title={data.collection.title}
        description={data.collection.description}
        readersGuide={data.collection.readers_guide}
        whatItsAbout={data.collection.what_its_about}
        whoItsFor={data.collection.who_its_for}
        howToReadIt={data.collection.how_to_read_it}
        ownerUsername={data.owner?.username ?? null}
        updated={data.collection.updated ?? null}
        parts={data.coverParts}
        pageCount={data.pages.length}
        ownerProfileHref={null}
      />
    {:else if data.activePage && cp}
      {@const ap = data.activePage}
      <div class="collection-page">
        {#if ap.view === 'kanban'}
          <KanbanChapter
            {...cp}
            updated={cp.updated ?? ''}
            pageId={ap.id}
            markdown={ap.markdown ?? ''}
            comments={ap.comments ?? []}
            initialColumns={ap.kanbanData?.columns ?? []}
            initialLabels={ap.kanbanData?.labels ?? {}}
            searchQuery=""
          />
        {:else}
          <DocChapter
            title={cp.title}
            html={ap.html ?? ''}
            lede={cp.lede}
            partEyebrow={cp.partEyebrow}
            chapterNum={cp.chapterNum}
            totalChapters={cp.totalChapters}
            authorUsername={cp.authorUsername}
            updated={ap.updated ?? ''}
            bind:comments={localComments}
            pageId={ap.id}
            pageHref={cp.pageHref}
            prev={cp.prev}
            next={cp.next}
            searchQuery=""
          />
        {/if}
      </div>
    {/if}
  </div>
</div>
