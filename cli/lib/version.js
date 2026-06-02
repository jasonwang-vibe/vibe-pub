import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getVersionCheckState, saveVersionCheckSuccess } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_URL = 'https://registry.npmjs.org/vibe-pub/latest';
const CHECK_TIMEOUT_MS = 2500;
/** Skip registry fetch when last successful check was within this window. */
const DISK_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** @type {{ meta: CliVersionMeta | null } | null} */
let cache = null;
/** @type {Promise<CliVersionMeta | null> | null} */
let pendingCheck = null;

/**
 * @typedef {Object} CliVersionMeta
 * @property {string} current
 * @property {string} latest
 * @property {boolean} update_recommended
 * @property {boolean} update_required
 * @property {string} action
 * @property {string} message
 */

export function getLocalVersion() {
  const override = process.env.VIBE_PUB_CLI_CURRENT?.trim();
  if (override) return override;
  const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
  return pkg.version;
}

/** @param {string} a @param {string} b @returns {boolean} */
export function semverLt(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

function hasTestOverrides() {
  return Boolean(process.env.VIBE_PUB_CLI_LATEST?.trim() || process.env.VIBE_PUB_CLI_CURRENT?.trim());
}

/** @param {string | null} iso @param {number} intervalMs */
function isWithinInterval(iso, intervalMs) {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < intervalMs;
}

/** Use persisted config to skip registry when recently confirmed up to date. */
function shouldUsePersistedCheck(current) {
  if (hasTestOverrides()) return false;

  const { checkedAt, versionWhenChecked, latestKnown } = getVersionCheckState();
  if (!latestKnown || versionWhenChecked !== current) return false;
  if (!isWithinInterval(checkedAt, DISK_CHECK_INTERVAL_MS)) return false;
  return true;
}

/** @returns {Promise<string | null>} */
async function fetchLatestFromRegistry() {
  const override = process.env.VIBE_PUB_CLI_LATEST?.trim();
  if (override) return override;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string} current @param {string} latest @returns {CliVersionMeta} */
export function buildCliMeta(current, latest) {
  const update_recommended = semverLt(current, latest);
  return {
    current,
    latest,
    update_recommended,
    update_required: false,
    action: 'npm install -g vibe-pub@latest',
    message: update_recommended
      ? `vibe-pub CLI is outdated (${current} → ${latest}). Run: npm install -g vibe-pub@latest`
      : `vibe-pub CLI is up to date (${current}).`,
  };
}

/** @returns {Promise<CliVersionMeta | null>} */
export async function startVersionCheck() {
  if (cache?.meta) return cache.meta;
  if (pendingCheck) return pendingCheck;

  pendingCheck = (async () => {
    const current = getLocalVersion();
    let latest;
    let fetchedFromRegistry = false;

    if (shouldUsePersistedCheck(current)) {
      latest = getVersionCheckState().latestKnown;
    } else {
      const fromRegistry = await fetchLatestFromRegistry();
      if (fromRegistry) {
        latest = fromRegistry;
        fetchedFromRegistry = true;
      } else {
        latest = current;
      }
    }

    const meta = buildCliMeta(current, latest);
    cache = { meta };

    // Only persist timestamp when registry confirms we're current; outdated → recheck next run.
    if (fetchedFromRegistry && !meta.update_recommended) {
      saveVersionCheckSuccess({
        versionWhenChecked: current,
        latestKnown: latest,
      });
    }

    pendingCheck = null;
    return meta;
  })();

  return pendingCheck;
}

/** @returns {CliVersionMeta | null} */
export function getCachedCliMeta() {
  return cache?.meta ?? null;
}

/** @param {unknown} data @returns {unknown} */
export function attachCliMeta(data) {
  const meta = getCachedCliMeta();
  if (!meta?.update_recommended) return data;

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return { ...data, _vibe: { cli: meta } };
  }
  return { result: data, _vibe: { cli: meta } };
}

/** @returns {{ content: Array<{ type: 'text', text: string }> }} */
export function mcpJsonContent(data) {
  return { content: [{ type: 'text', text: JSON.stringify(attachCliMeta(data)) }] };
}

/** Emit update notice on stderr so agents scanning full terminal output still see it. */
export function emitCliUpdateNotice() {
  const meta = getCachedCliMeta();
  if (!meta?.update_recommended) return;
  console.error(JSON.stringify({ _vibe: { cli: meta } }));
}
