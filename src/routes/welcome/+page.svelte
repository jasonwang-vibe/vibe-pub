<svelte:head>
  <title>Docs — vibe.pub</title>
</svelte:head>

<div class="docs">
  <div class="docs-inner">
    <h1>Getting started</h1>

    <section>
      <h2>Publish from the web</h2>
      <p>
        Go to <a href="/new">vibe.pub/new</a>, paste or upload a <code>.md</code> file, and click
        <strong>Publish</strong>. You'll get a shareable URL instantly — no signup required.
      </p>
    </section>

    <section>
      <h2>Publish from the terminal</h2>
      <pre><code>npx vibe-pub publish report.md</code></pre>
      <p>
        The CLI reads your markdown, posts it to the API, and prints the live URL. Pipe it from any
        script or agent.
      </p>
    </section>

    <section>
      <h2>Supported views</h2>
      <p>
        The view is auto-detected from your markdown structure, or set it explicitly with <code
          >view:</code
        > in frontmatter.
      </p>
      <ul>
        <li><strong>doc</strong> — long-form article (default)</li>
        <li><strong>slides</strong> — slide deck, split on <code>---</code></li>
        <li>
          <strong>kanban</strong> — task board from <code>## Column</code> headings +
          <code>- [ ]</code> items
        </li>
        <li><strong>changelog</strong> — versioned release notes</li>
        <li><strong>timeline</strong> — chronological feed</li>
        <li>
          <strong>folder</strong> — multi-file directory (upload multiple <code>.md</code> files)
        </li>
        <li>
          <strong>collection</strong> — structured book/docs (include a <code>_collection.md</code> manifest)
        </li>
      </ul>
    </section>

    <section>
      <h2>Frontmatter options</h2>
      <pre><code
          >---
title: My Report
view: slides
theme: default
access: public
---</code
        ></pre>
    </section>

    <section>
      <h2>Try it out</h2>
      <p>
        Use the <a href="/view-playground">playground</a> to preview any markdown before publishing.
      </p>
    </section>
  </div>
</div>

<style>
  .docs {
    min-height: calc(100vh - 56px);
    padding: 64px 32px 80px;
  }

  .docs-inner {
    max-width: 680px;
    margin: 0 auto;
  }

  h1 {
    font-family: var(--font-serif);
    font-size: 48px;
    font-weight: 400;
    letter-spacing: -0.03em;
    margin: 0 0 48px;
    color: var(--text-primary);
  }

  section {
    margin-bottom: 40px;
  }

  h2 {
    font-family: var(--font-serif);
    font-size: 22px;
    font-weight: 400;
    letter-spacing: -0.01em;
    margin: 0 0 12px;
    color: var(--text-primary);
  }

  p {
    font-family: var(--font-prose);
    font-size: 16px;
    line-height: 1.7;
    color: var(--text-secondary);
    margin: 0 0 12px;
  }

  ul {
    font-family: var(--font-prose);
    font-size: 16px;
    line-height: 1.7;
    color: var(--text-secondary);
    padding-left: 1.25em;
    margin: 0;
  }

  li {
    margin-bottom: 6px;
  }

  a {
    color: var(--text-primary);
    text-underline-offset: 3px;
  }

  code {
    font-family: var(--font-mono);
    font-size: 0.875em;
    background: rgba(0, 0, 0, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
  }

  :global(.dark) code {
    background: rgba(255, 255, 255, 0.07);
  }

  pre {
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.6;
    background: var(--text-primary);
    color: var(--bg);
    padding: 18px 22px;
    border-radius: 10px;
    overflow-x: auto;
    margin: 0 0 12px;
  }

  pre code {
    background: none;
    padding: 0;
    font-size: inherit;
  }

  strong {
    color: var(--text-primary);
    font-weight: 600;
  }
</style>
