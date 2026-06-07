<script lang="ts">
  import { marked } from 'marked';
  import raw from '../../../intro.md?raw';

  const html = marked.parse(raw) as string;
</script>

<svelte:head>
  <title>Docs — vibe.pub</title>
</svelte:head>

<div class="docs">
  <div class="docs-inner prose">
    {@html html}
  </div>
</div>

<style>
  .docs {
    min-height: calc(100vh - 56px);
    padding: 64px 32px 80px;
  }

  .docs-inner {
    max-width: 720px;
    margin: 0 auto;
  }
</style>
