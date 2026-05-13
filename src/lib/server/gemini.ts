import { GoogleGenAI } from '@google/genai';
import type { BlockRevisePair, BlockReviseSuggestResponse } from '$lib/types';

const GEMINI_MODEL = 'gemini-3-flash-preview';

function parseModelJson(text: string): unknown {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/s, '');
  }
  return JSON.parse(t) as unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizePairs(raw: unknown): BlockRevisePair[] {
  if (!Array.isArray(raw)) return [];
  const out: BlockRevisePair[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const remove = typeof item.remove === 'string' ? item.remove : '';
    const add = typeof item.add === 'string' ? item.add : '';
    out.push({ remove, add });
  }
  return out;
}

export async function geminiSuggestBlockRevise(
  apiKey: string,
  blockPlainText: string,
  docPlainText: string,
  commentsChrono: { author: string; body: string; created: string; resolved: boolean }[]
): Promise<BlockReviseSuggestResponse> {
  const commentsJson = JSON.stringify(commentsChrono);
  const docCtx = (docPlainText || blockPlainText).trim();

  const prompt = `You are a precise document editor working on markdown stored as plain text (headings like # / ## still appear as lines).

FULL_DOCUMENT — full page text for structure and context (tone, terminology, cross-references). It may be truncated. Use it to locate sections; do not invent edits outside the EDIT_SCOPE defined below.
---
${docCtx}
---

BLOCK_TARGET — plain text of the single DOM block readers commented on (often one paragraph, a heading line, or a small chunk). Comments refer to this focus. Keep the dominant language of the document when proposing edits.
---
${blockPlainText}
---

COMMENTS_JSON (oldest first; author, body, created ISO time, resolved flag):
${commentsJson}

## Infer EDIT_SCOPE from FULL_DOCUMENT + BLOCK_TARGET (no other inputs)

Markdown sections are separated by headings. Heading level = count of leading \`#\` on a line (e.g. \`##\` = level 2). A **subsection** under a heading runs from that heading’s line down to (but not including) the next line that starts with a heading of **level ≤** that heading’s level (same or “higher” in the outline).

1. **Comment on a heading** — If BLOCK_TARGET is essentially one markdown heading line (or the visible title of one heading), treat the anchor as being **on that heading**. Then **EDIT_SCOPE** = that heading line **plus** every following line until the next heading line whose level is ≤ the level of that heading (the whole subsection **including** the heading line).

2. **Comment on body text** — If BLOCK_TARGET is normal body (paragraph, list, code, etc.), find the **owning heading**: the nearest heading line **above** the place in FULL_DOCUMENT that corresponds to BLOCK_TARGET (same order as rendered reading order). Then **EDIT_SCOPE** = all lines **after** that owning heading line **until** the next heading whose level is ≤ the owning heading’s level — i.e. the subsection body **excluding** the owning heading line itself. Example: under \`## h2\`, body lines \`bbb\`, \`ccc\`, \`ddd\`, \`Eeee\` are in scope; the line \`## h2\` is **out of scope** for remove/add. Under \`## h2.1\` starts the next subsection.

If you cannot locate BLOCK_TARGET uniquely in FULL_DOCUMENT, conservatively use only text that appears verbatim in BLOCK_TARGET as EDIT_SCOPE.

## Output rules

1. Apply feedback in chronological order — later comments may refine earlier ones.
2. Every \`remove\` string must be a **verbatim contiguous substring** of FULL_DOCUMENT that lies **entirely inside EDIT_SCOPE** (and must not cross outside EDIT_SCOPE). Prefer substrings that also appear in or align with BLOCK_TARGET when comments are local.
3. \`add\` is the replacement text (can be empty to delete only). Resulting edits must stay logically inside EDIT_SCOPE (do not rewrite other sections).
4. You may output multiple pairs. For a whole-subsection rewrite, one pair may use \`remove\` = the full EDIT_SCOPE body (or full EDIT_SCOPE including heading when the anchor is the heading) and \`add\` = the replacement block.
5. \`summary\`: one short sentence (same dominant language as the document / comments).

Return ONLY valid JSON (no markdown fences) with this shape:
{"summary":"string","pairs":[{"remove":"string","add":"string"}]}`;

  const ai = new GoogleGenAI({ apiKey });

  let text: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });
    text = response.text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Gemini: ${msg.slice(0, 400)}`);
  }

  if (!text?.trim()) {
    throw new Error('Empty Gemini response');
  }

  let parsed: unknown;
  try {
    parsed = parseModelJson(text);
  } catch {
    throw new Error('Gemini returned invalid JSON');
  }

  if (!isRecord(parsed)) {
    throw new Error('Gemini JSON must be an object');
  }

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  const pairs = normalizePairs(parsed.pairs);

  return { summary: summary || 'Suggested edits.', pairs };
}
