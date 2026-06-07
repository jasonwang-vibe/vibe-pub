<script lang="ts">
  import { onMount } from 'svelte';

  // ── Theme controls ─────────────────────────────────────────────
  const THEMES = [
    'default',
    'paper',
    'claude',
    'stripe',
    'github',
    'nord',
    'midnight',
    'terminal',
    'rose',
    'ocean',
    'solarized',
  ];
  let theme = $state('default');
  let dark = $state(false);

  // ── Foundation dials (live overrides — app.css is untouched) ────
  // Defaults = what ships TODAY, so you compare against the baseline.
  let measure = $state(780); // --reader-measure  (lean: 700)
  let bodySize = $state(16); // --reader-font-size
  let h1Size = $state(36); // doc title (today leaks Tailwind 36/800)
  let h1Weight = $state(800); // doc title weight
  let ledeSize = $state(16); // 16 = no standfirst (today); token intends 19
  let codeWeight = $state(600); // today Tailwind wins at 600; intended 400

  const MEASURES = [680, 700, 720, 780];
  const BODY = [16, 17, 18];
  const H1SIZE = [36, 40, 44];
  const H1WEIGHT = [400, 600, 700, 800];
  const LEDE = [16, 19, 21];
  const CODEW = [400, 600];

  // approx chars-per-line readout for the measure dial
  let cpl = $derived(Math.round((measure / bodySize) * 1.9));

  // ── Live computed-metric readouts ──────────────────────────────
  let metrics = $state<Record<string, string>>({});
  function measureType() {
    const out: Record<string, string> = {};
    document.querySelectorAll<HTMLElement>('[data-spec]').forEach((el) => {
      const key = el.dataset.spec!;
      const cs = getComputedStyle(el);
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '');
      const lh = Math.round((parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)) * 100) / 100;
      out[key] =
        `${Math.round(parseFloat(cs.fontSize) * 10) / 10}px · ${cs.fontWeight} · ${lh} lh · ${fam}`;
    });
    metrics = out;
  }
  onMount(() => {
    measureType();
    const t = setTimeout(measureType, 400);
    return () => clearTimeout(t);
  });
  $effect(() => {
    void theme;
    void dark;
    void measure;
    void bodySize;
    void h1Size;
    void h1Weight;
    void ledeSize;
    void codeWeight;
    if (typeof document !== 'undefined') queueMicrotask(measureType);
  });

  // Body of the doc specimen (lede + title pulled OUT so they can be dialed)
  const docBody = `
    <h2>The smallest publishing verb</h2>
    <p>Pipe markdown in, get a URL out. Readers leave comments on any block; agents read them back as instructions and revise in place. The feedback loop closes in minutes, not days &mdash; and the page you are reading is itself just a file.</p>
    <p>Body copy sets in <em>Source Serif&nbsp;4</em> at a comfortable measure. The goal is long-form legibility: generous line-height, a constrained column, and quiet hierarchy that never shouts. Inline <code>code</code>, <strong>strong</strong>, and <a href="#">links</a> should read as part of the prose.</p>
    <blockquote><p>A document is a conversation that hasn't realized it's interactive yet.</p></blockquote>
    <h3>What the scale has to carry</h3>
    <ul>
      <li>Unordered items hold their own rhythm.</li>
      <li>Nested thoughts stay aligned to the measure.</li>
      <li>Nothing crowds the line above or below it.</li>
    </ul>
    <pre><code>$ npx vibe-pub publish report.md
&gt; packaging... 1,847 words, 4 min read
&gt; published in 2.4s &rarr; vibe.pub/report-Kp8m2qX9</code></pre>
    <p>Closing paragraph: the foundation pass is about getting this single column to feel inevitable before we touch any individual view.</p>
  `;

  const scale: [string, string, string][] = [
    ['t-display', 'Display — hero', 'Something to say'],
    ['t-display-sm', 'Display small', 'Many views, one markdown'],
    ['t-title', 'Title — page/section', 'Shape-detection in practice'],
    ['t-title-sm', 'Title small', 'Handbook roadmap'],
    ['t-h1', 'Prose H1', 'The smallest publishing verb'],
    ['t-h2', 'Prose H2', 'What the scale has to carry'],
    ['t-h3', 'Prose H3', 'Inline elements & rhythm'],
    ['t-prose', 'Prose body', 'Pipe markdown in, get a URL out.'],
    ['t-body', 'UI body', 'Readers leave comments on any block.'],
    ['t-meta', 'Meta', 'last edit 2d ago · by @charles'],
    ['t-caption', 'Caption', '14 files · public'],
    ['t-mono', 'Mono', 'vibe.pub/report-Kp8m2qX9'],
    ['t-mono-label', 'Mono label', 'shipped · round 1'],
    ['t-brand', 'Wordmark', 'vibe.pub'],
  ];
</script>

<svelte:head><title>Reader gallery · type foundation</title></svelte:head>

<div class="harness-bar">
  <span class="hb-title">reader gallery · <strong>type foundation</strong></span>
  <div class="hb-controls">
    <label class="hb-field"
      >theme
      <select bind:value={theme}
        >{#each THEMES as t}<option value={t}>{t}</option>{/each}</select
      >
    </label>
    <label class="hb-check"><input type="checkbox" bind:checked={dark} /> dark</label>
  </div>
</div>

<!-- Foundation dial panel (fixed) -->
<aside class="dials">
  <div class="dials-h">FOUNDATION DIALS <span>live · app.css untouched</span></div>

  <div class="dial">
    <div class="dial-l">Measure <b>{measure}px</b> <i>≈{cpl} chars</i></div>
    <div class="seg">
      {#each MEASURES as v}<button
          class:on={measure === v}
          class:rec={v === 700}
          onclick={() => (measure = v)}>{v}</button
        >{/each}
    </div>
  </div>
  <div class="dial">
    <div class="dial-l">Body <b>{bodySize}px</b></div>
    <div class="seg">
      {#each BODY as v}<button class:on={bodySize === v} onclick={() => (bodySize = v)}>{v}</button
        >{/each}
    </div>
  </div>
  <div class="dial">
    <div class="dial-l">H1 size <b>{h1Size}px</b></div>
    <div class="seg">
      {#each H1SIZE as v}<button
          class:on={h1Size === v}
          class:rec={v === 40}
          onclick={() => (h1Size = v)}>{v}</button
        >{/each}
    </div>
  </div>
  <div class="dial">
    <div class="dial-l">H1 weight <b>{h1Weight}</b></div>
    <div class="seg">
      {#each H1WEIGHT as v}<button
          class:on={h1Weight === v}
          class:rec={v === 600}
          onclick={() => (h1Weight = v)}>{v}</button
        >{/each}
    </div>
  </div>
  <div class="dial">
    <div class="dial-l">Lede <b>{ledeSize === 16 ? 'off' : ledeSize + 'px'}</b></div>
    <div class="seg">
      {#each LEDE as v}<button
          class:on={ledeSize === v}
          class:rec={v === 19}
          onclick={() => (ledeSize = v)}>{v === 16 ? 'off' : v}</button
        >{/each}
    </div>
  </div>
  <div class="dial">
    <div class="dial-l">Code weight <b>{codeWeight}</b></div>
    <div class="seg">
      {#each CODEW as v}<button
          class:on={codeWeight === v}
          class:rec={v === 400}
          onclick={() => (codeWeight = v)}>{v}</button
        >{/each}
    </div>
  </div>
  <div class="dials-note">
    <span class="rec-key"></span> = recommended
  </div>
</aside>

<div class:dark>
  <div class="stage theme-{theme}">
    <div class="stage-inner">
      <!-- ░░ 01 — TYPE SCALE ░░ -->
      <section class="block">
        <div class="block-head">
          <span class="t-mono-label">01 · type scale</span>
          <h2 class="t-title-sm">Every role, one specimen</h2>
        </div>
        <div class="scale">
          {#each scale as [cls, label, sample]}
            <div class="scale-row">
              <div class="scale-meta">
                <span class="t-mono-label scale-name">.{cls}</span>
                <span class="scale-role">{label}</span>
                <span class="scale-metrics">{metrics[cls] ?? '—'}</span>
              </div>
              <div class="scale-sample"><span class={cls} data-spec={cls}>{sample}</span></div>
            </div>
          {/each}
        </div>
      </section>

      <!-- ░░ 02 — DOC PROSE LAB ░░ -->
      <section class="block">
        <div class="block-head">
          <span class="t-mono-label">02 · doc prose — comparison lab</span>
          <h2 class="t-title-sm">Reading surface — dial it live →</h2>
        </div>

        <div
          class="doc-wrap"
          class:code-w-400={codeWeight === 400}
          style="--reader-measure:{measure}px; --reader-font-size:{bodySize}px;"
        >
          <article class="doc-view prose" style="max-width: var(--reader-measure); margin: 0 auto;">
            <h1
              class="doc-title"
              data-spec="doc-h1"
              style="font-family:var(--font-serif); font-size:{h1Size}px; font-weight:{h1Weight}; letter-spacing:-0.025em; line-height:1.05; margin:0 0 12px;"
            >
              Shape-detection <em>in practice</em>
            </h1>

            <p
              class="doc-lede"
              data-spec="doc-lede"
              style={ledeSize === 16
                ? ''
                : `font-size:${ledeSize}px; line-height:1.5; color:var(--text-secondary); font-weight:400; margin:0 0 24px;`}
            >
              The reader is the product's most-viewed surface by a wide margin. Every published <code
                >.md</code
              > picks a layout from its shape &mdash; this is what reading one feels like.
            </p>

            {@html docBody}
          </article>
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .harness-bar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 20px;
    background: #1a1917;
    color: #edeae5;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .hb-title strong {
    font-weight: 600;
  }
  .hb-controls {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .hb-field,
  .hb-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .harness-bar select {
    font-family: var(--font-mono);
    font-size: 12px;
    background: #2e2d2a;
    color: #edeae5;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 3px 6px;
  }

  /* ── Dial panel ── */
  .dials {
    position: fixed;
    right: 16px;
    top: 64px;
    z-index: 60;
    width: 216px;
    padding: 14px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
    font-family: var(--font-mono);
  }
  .dials-h {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: #1a1917;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 12px;
  }
  .dials-h span {
    font-weight: 400;
    letter-spacing: 0;
    color: #9e9b95;
    font-size: 9.5px;
  }
  .dial {
    margin-bottom: 11px;
  }
  .dial-l {
    font-size: 11px;
    color: #6b6963;
    margin-bottom: 4px;
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .dial-l b {
    color: #1a1917;
    font-weight: 600;
  }
  .dial-l i {
    color: #b8b5af;
    font-style: normal;
    font-size: 10px;
    margin-left: auto;
  }
  .seg {
    display: flex;
    gap: 4px;
  }
  .seg button {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 5px 0;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 6px;
    background: #fff;
    color: #6b6963;
    cursor: pointer;
    position: relative;
  }
  .seg button:hover {
    border-color: rgba(0, 0, 0, 0.25);
  }
  .seg button.on {
    background: #1a1917;
    color: #fff;
    border-color: #1a1917;
  }
  .seg button.rec::after {
    content: '';
    position: absolute;
    top: 3px;
    right: 3px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #22c55e;
  }
  .seg button.rec.on::after {
    background: #4ade80;
  }
  .dials-note {
    margin-top: 6px;
    font-size: 9.5px;
    color: #9e9b95;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .rec-key {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #22c55e;
    display: inline-block;
  }

  /* ── Code-weight override (toggled) ── */
  .doc-wrap.code-w-400 :global(:not(pre) > code) {
    font-weight: 400 !important;
  }

  /* ── Stage ── */
  .stage {
    background: var(--bg);
    color: var(--text-primary);
    min-height: 100vh;
  }
  .stage-inner {
    max-width: var(--width-page);
    margin: 0 auto;
    padding: 48px 40px 120px;
  }
  .block {
    margin-bottom: 72px;
  }
  .block-head {
    padding-bottom: 12px;
    margin-bottom: 28px;
    border-bottom: 1px solid var(--border);
  }
  .block-head .t-mono-label {
    display: block;
    margin-bottom: 8px;
  }

  .scale {
    display: flex;
    flex-direction: column;
  }
  .scale-row {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 32px;
    padding: 20px 0;
    border-bottom: 1px solid var(--border);
    align-items: baseline;
  }
  .scale-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .scale-name {
    color: var(--text-secondary);
  }
  .scale-role {
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--text-tertiary);
  }
  .scale-metrics {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--text-tertiary);
    opacity: 0.8;
  }
  .scale-sample {
    min-width: 0;
  }

  @media (max-width: 900px) {
    .dials {
      position: static;
      width: auto;
      margin: 16px 20px 0;
    }
    .scale-row {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .stage-inner {
      padding: 32px 20px 80px;
    }
  }
</style>
