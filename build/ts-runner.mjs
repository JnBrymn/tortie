/**
 * ts-runner.mjs. One place that says how a TypeScript probe is run (Phase 145
 * stage 5).
 *
 * Before this file, 28 scripts under build/ started their probe with
 * `spawnSync('npx', ['tsx', ...])`, and tsx was not in package-lock.json. On a
 * machine whose npx cache had never held tsx, a conformance gate's first act
 * was an npm registry request to fetch its own runner. That was measured on
 * 2026-08-24 by pointing the registry at a closed local port and running
 * `node build/conformance-context.mjs` with an empty npm cache: the gate
 * printed `request to http://127.0.0.1:9/tsx failed` before it checked a
 * single thing. A verification command must never reach the network to find
 * its runner, so tsx is now pinned in package-lock.json as an exact
 * devDependency, and every script resolves it from node_modules through this
 * function.
 *
 * The rule this file carries: a check either finds its runner in the
 * repository's installed dependencies or it refuses with a sentence naming the
 * fix. It never falls back to npx, a global install, or anything else that
 * could resolve differently on another machine.
 *
 * Phase 262 added the runtime half of that same rule: a check either runs on a
 * Node the TypeScript runner can load each module ONCE on, or it refuses with
 * a sentence naming the version found, the range and the files that decide it.
 * Below the floor in `build/verification-checks.mjs`, tsx installs an async
 * ESM hook and a separate CJS path rather than one synchronous
 * `module.registerHooks()` loader, so `import` and `require` reach two
 * instances of the same module and two copies of every module-level Map. A
 * check then passes or fails for the wrong reason. `assertSupportedRuntime()`
 * is the first statement of `tsxCli()` below, so the refusal arrives in
 * milliseconds rather than after a probe has spent its minutes.
 *
 * THE LIMIT, stated rather than hidden: this preflight guards the TypeScript
 * checks only. A plain `.mjs` gate that never calls `tsxCli()` is not guarded.
 * That is deliberate. Those gates are cheap, they load no module twice, and
 * the defect this guards against is a module-identity split that only the
 * TypeScript runner can have. Do not scatter a second call site to cover them.
 *
 * Usage, replacing the old npx form byte for byte in spirit:
 *
 *   spawnSync(process.execPath, [tsxCli(), '--tsconfig', 'tsconfig.node.json',
 *     'build/some-probe.mts'], ...)
 *
 * `node build/assert-hermetic-checks.mjs` is the gate that keeps 'npx' out of
 * build/ so the old form cannot come back.
 */

import { createRequire } from 'node:module';

import { assertSupportedRuntime } from './verification-checks.mjs';

/**
 * Absolute path of the tsx command line entry inside this repository's
 * node_modules, for running a .mts probe under `process.execPath`.
 */
export function tsxCli() {
  assertSupportedRuntime();
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('tsx/cli');
  } catch {
    throw new Error(
      'tsx is not installed under node_modules. Run npm install. The runner ' +
        'is pinned in package-lock.json and is never fetched from the network.'
    );
  }
}
