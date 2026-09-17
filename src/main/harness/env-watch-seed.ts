/**
 * Harness only (Phase 276). Starts the shell-config watch and takes the boot
 * warm-up inside an isolated harness launch, so a probe can drive the login
 * shell cache at all.
 *
 * ## WHY IT EXISTS, AND IT IS THE INTEGRATOR'S FINDING RATHER THAN A BUILDER'S
 *
 * Phase 276 puts `startEnvWatch()` and `warmEnvAtBoot()` in the ordinary boot
 * chain in `src/main/index.ts`, BELOW `dispatchHarness`, and that position is
 * deliberate: the spec says in as many words that *"a harness launch never
 * reaches this line, because `dispatchHarness` returns above it, which is the
 * same protection the Phase 208 chain has."* It is the right position and it
 * does not move.
 *
 * But the same spec asks for one app run that drives a cold create, six warm
 * creates, a create for a second agent, a rotation and the deliberate refresh,
 * and the only way this repository drives the Settings window is
 * `GMUX_SHOT_SETTINGS` — which is a `GMUX_SHOT` launch, which is exactly the
 * launch that returns above the line. MEASURED, and this is why the file
 * exists rather than an argument for it: the first run of `probe:p276` read
 * ONE login shell and about 960 ms for EVERY create, cold and warm alike,
 * eighteen of them, which is the parent's behaviour exactly. The cache was
 * never armed, because nothing in a harness launch arms it. Without this seed
 * the phase's own Tier 3 evidence cannot be produced at all.
 *
 * ## IT IS THE SHIPPED PAIR AND NOTHING ELSE
 *
 * It calls `startEnvWatch()` and then `warmEnvAtBoot()`, which are the two
 * functions `src/main/index.ts` calls, in that order. It reimplements neither,
 * it seeds no value, and it writes nothing: every file event, every debounce,
 * every drop and every probe after this call is the shipped path. On a launch
 * with no shell variable configured — every existing probe — `warmEnvAtBoot()`
 * spawns nothing at all by its own rule, so a seed that is armed and idle
 * costs a `fs.watch` handle and no shell.
 *
 * TWO DIFFERENCES FROM THE BOOT CHAIN, and both make the measurement HARSHER
 * rather than kinder, which is why they are written down rather than fixed.
 *
 *  1. **The warm is not awaited and nothing waits for it.** An earlier draft
 *     awaited it, and the boot arm then read `path-ready` at 2,321-2,377 ms
 *     against 1,372-1,428 ms with the feature off — a 950 ms move that was the
 *     SEED's await sitting on the harness's own critical path and not the
 *     product's shape at all. `void` is what `src/main/index.ts` does and it is
 *     what this does.
 *  2. **`BOOT_OBSERVE_DELAY_MS` is not reproduced.** In production the warm
 *     waits that second so a shell start is never beside a person's first
 *     paint. Here it fires immediately, BEFORE the window is even created, so
 *     a boot reading that shows `window-shown` unmoved has shown it unmoved in
 *     the worst position available rather than in the protected one.
 *
 * ## TWO REFUSALS, both hard, and both the same two ./arch-seed.ts carries
 *
 *  1. The launch must be an isolated harness launch (`GMUX_SMOKE` or
 *     `GMUX_SHOT`). A variable left in a shell profile must never make a
 *     person's real app hold `fs.watch` handles on their home directory and
 *     spawn a login shell it would not otherwise have spawned.
 *  2. The profile directory must sit under the harness directory the runner
 *     handed us, so a launch that points this variable at the app while using
 *     the REAL profile is refused even when `GMUX_SHOT` is set.
 *
 * Both are the shared `seedRefusal`, so there is one spelling of them.
 */

import { app } from 'electron';
import { startEnvWatch, warmEnvAtBoot } from '../env/watch';
import { seedRefusal } from './seed-gate';

/** The one line a probe can read out of the harness output. */
const MARKER = '[gmux-env-watch-seed]';

/**
 * Why this seed may not run, or null when it may.
 *
 * Pure, so a test drives both refusals with an environment record and a
 * profile path rather than with an Electron.
 */
export function envWatchSeedRefusal(
  env: NodeJS.ProcessEnv,
  userDataDir: string
): string | null {
  return seedRefusal('GMUX_ENV_WATCH_SEED', env, userDataDir);
}

/** Called by dispatchHarness in the GMUX_SHOT branch, after the manifest read. */
export async function seedEnvWatch(): Promise<void> {
  if ((process.env['GMUX_ENV_WATCH_SEED'] ?? '') === '') return;
  const refusal = envWatchSeedRefusal(process.env, app.getPath('userData'));
  if (refusal !== null) throw new Error(refusal);
  // THE SHIPPED PAIR, in the shipped order. `startEnvWatch()` is synchronous
  // and arms the cache only after it has opened at least one handle, so a
  // harness whose scratch HOME has no watchable directory lands on today's
  // cost here exactly as a person's launch would.
  startEnvWatch();
  // AND NOTHING AWAITS THE WARM. See difference 1 in the header: an await here
  // is not the product's shape and it moved a boot milestone by 950 ms.
  void warmEnvAtBoot().catch(() => undefined);
  console.log(`${MARKER} the shell-config watch is armed for this harness launch.`);
}
