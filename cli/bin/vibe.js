#!/usr/bin/env node
import { err } from '../lib/cli-helpers.js';
import { parseGlobalFlags } from '../lib/cli-helpers.js';
import { runProgram } from '../lib/program.js';
import { startVersionCheck } from '../lib/version.js';
import { maybeAutoUpdateAndReexec } from '../lib/auto-update.js';

async function main() {
  const argv = process.argv.slice(2);
  const { mcpMode } = parseGlobalFlags(argv);

  if (mcpMode) {
    const { startMcp } = await import('./mcp.js');
    await startMcp();
    return;
  }

  const cliVersion = await startVersionCheck();
  if (cliVersion?.update_recommended) {
    maybeAutoUpdateAndReexec(cliVersion);
  }

  await runProgram(process.argv);
}

main().catch((e) => {
  err(e.message, e.status ?? 1);
});
