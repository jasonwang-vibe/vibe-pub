<script lang="ts">
  import { page } from '$app/stores';

  interface Props {
    data: { path: string; url: string };
  }
  let { data }: Props = $props();

  let user = $derived($page.data.user);
  let copied = $state(false);

  function copy() {
    if (data.url) navigator.clipboard.writeText(data.url).catch(() => {});
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<svelte:head>
  <title>Published — vibe.pub</title>
</svelte:head>

<div class="pub-page">
  <div class="pub-card">
    <div class="check">&#10003;</div>
    <h1>Published</h1>
    <p class="sub">Your page is live and ready to share.</p>

    {#if data.url}
      <div class="url-box">
        <span class="url">{data.url}</span>
        <button type="button" onclick={copy}>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
    {/if}

    <div class="actions">
      <a href={data.path} class="btn primary">View page</a>
      {#if user}
        <a href={`/@${user.username}`} class="btn">My workspace</a>
      {:else}
        <a href="/" class="btn">Home</a>
      {/if}
      <a href="/new" class="btn">Publish another</a>
    </div>
  </div>
</div>

<style>
  .pub-page {
    min-height: calc(100vh - 56px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
  }

  .pub-card {
    background: var(--surface);
    border-radius: 18px;
    padding: 48px 40px;
    max-width: 480px;
    width: 100%;
    box-shadow: var(--shadow-elevated);
    text-align: center;
  }

  .check {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--success);
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    margin-bottom: 20px;
  }

  h1 {
    font-family: var(--font-serif);
    font-weight: 400;
    font-size: 36px;
    letter-spacing: -0.02em;
    margin: 0 0 8px;
    color: var(--text-primary);
  }

  .sub {
    font-family: var(--font-prose);
    font-style: italic;
    font-size: 15px;
    color: var(--text-secondary);
    margin: 0 0 28px;
  }

  .url-box {
    background: var(--text-primary);
    color: var(--bg);
    padding: 14px 18px;
    border-radius: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 14px;
    margin-bottom: 20px;
    gap: 12px;
  }

  .url {
    color: #95e0a1;
    word-break: break-all;
    text-align: left;
  }

  .url-box button {
    background: rgba(237, 234, 229, 0.1);
    color: var(--bg);
    border: none;
    border-radius: var(--radius-sm);
    padding: 5px 11px;
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .url-box button:hover {
    background: rgba(237, 234, 229, 0.2);
  }

  .actions {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    padding: 8px 14px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--ease-fast);
    text-decoration: none;
  }

  .btn:hover {
    color: var(--text-primary);
    background: var(--surface-hover);
    border-color: var(--border-hover);
  }

  .btn.primary {
    background: var(--text-primary);
    color: var(--bg);
    border-color: var(--text-primary);
    padding: 8px 18px;
    font-weight: 600;
    box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.2);
  }

  .btn.primary:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
</style>
