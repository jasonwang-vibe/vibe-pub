import { execSync, spawnSync } from 'child_process';

/** @returns {'global' | 'npx' | 'local'} */
function detectInstallMode() {
  const script = (process.argv[1] ?? '').replace(/\\/g, '/');

  if (script.includes('/_npx/') || script.includes('/.npm/_npx/')) {
    return 'npx';
  }

  try {
    const prefix = execSync('npm config get prefix', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .replace(/\\/g, '/');
    if (prefix && script.startsWith(prefix)) {
      return 'global';
    }
  } catch {
    /* not on PATH or npm missing */
  }

  return 'local';
}

/** @param {string} latest */
function npmInstallGlobal(latest) {
  return spawnSync('npm', ['install', '-g', `vibe-pub@${latest}`], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
}

/**
 * Re-run the same CLI invocation with the updated package.
 * Exits the current process; does not return.
 * @param {'global' | 'npx'} mode
 * @param {string} latest
 */
function reexecCli(mode, latest) {
  const args = process.argv.slice(2);
  const env = { ...process.env, VIBE_PUB_CLI_REEXEC: '1' };
  const spawnOpts = { stdio: 'inherit', env, shell: process.platform === 'win32' };

  const result =
    mode === 'npx'
      ? spawnSync('npx', ['-y', `vibe-pub@${latest}`, ...args], spawnOpts)
      : spawnSync('vibe-pub', args, spawnOpts);

  process.exit(result.status ?? (result.error ? 1 : 0));
}

function autoUpdateDisabled() {
  return (
    process.env.VIBE_PUB_CLI_NO_AUTO_UPDATE === '1' ||
    process.env.VIBE_PUB_CLI_REEXEC === '1' ||
    Boolean(process.env.VIBE_PUB_CLI_CURRENT?.trim()) ||
    Boolean(process.env.VIBE_PUB_CLI_LATEST?.trim())
  );
}

/**
 * When outdated: global installs run `npm i -g`, npx runs via `@latest`, then re-exec.
 * Local/dev (`node bin/vibe.js`) is skipped. MCP is skipped by caller.
 * @param {{ update_recommended?: boolean, current?: string, latest?: string } | null | undefined} meta
 * @returns {boolean} false if continuing with current process
 */
export function maybeAutoUpdateAndReexec(meta) {
  if (!meta?.update_recommended || autoUpdateDisabled()) return false;

  const mode = detectInstallMode();
  //if (mode === 'local') return false;
  //if (mode === 'local') return false;

  console.error(`vibe-pub: auto-updating ${meta.current} → ${meta.latest}…`);

  if (mode === 'global') {
    const result = npmInstallGlobal(meta.latest);
    if (result.status !== 0) {
      console.error('vibe-pub: auto-update failed; continuing with current version.');
      return false;
    }
  }

  reexecCli(mode, meta.latest);
  return true;
}
