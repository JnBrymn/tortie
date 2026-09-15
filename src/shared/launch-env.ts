/**
 * The ONE spelling of which shell variable NAMES a launch reads (Phase 269,
 * moved here by Phase 270).
 *
 * ## Why it is in `src/shared/` rather than beside the local launch
 *
 * Phase 269 wrote it in `src/main/sessions/launch-plan.ts`, next to the only
 * caller there was. Phase 270 gave it a second caller on the REMOTE create
 * path, and `src/main/machines/remote-env-carriage.ts` reading it from there
 * closed a nineteen module runtime cycle, MEASURED by
 * `node build/assert-no-runtime-cycles.mjs`:
 *
 * ```
 * machines/context.ts -> machines/remote-env-carriage.ts
 *   -> sessions/launch-plan.ts -> manifest/index.ts -> … -> tmux/index.ts
 *   -> tmux/supervisor.ts -> machines/context.ts
 * ```
 *
 * `launch-plan.ts` imports the manifest, and the manifest's graph reaches the
 * local tmux door, which reaches the machine context. So the pure rule moved
 * out to the leaf both sides can import, which is the cut the cycle gate itself
 * recommends. `launch-plan.ts` re-exports this name, so every existing caller
 * is unchanged and **the behaviour does not move by one byte** — it is the same
 * function body, relocated.
 *
 * This module imports NOTHING. It may never import anything.
 */

/**
 * The names this launch will read from the login shell: the agent row's own
 * `launch.envPassthrough` (agents.json, Phase 33) UNIONED with the names the
 * person set in Settings then Launch defaults, row first, deduped.
 *
 * TWO ROUTES, ONE ANSWER. agents.json stays the power-user route and Tortie
 * still never writes it; the Settings route is the one a person who has no such
 * file can reach, and it is sealed the way a danger flag is. Neither shadows
 * the other, because a person who has set both meant both.
 *
 * Returns undefined when both are empty, so the spec of an agent nobody has
 * configured is byte for byte what it was before Phase 269, no probe is
 * spawned, no record field is written and no launch pays for a feature it does
 * not use. PHASE 270 leans on exactly that for a session on another machine:
 * undefined means no far-side probe is sent and no slot is composed.
 *
 * Pure, and it mutates neither input.
 */
export function envPassthroughFor(
  rowNames: readonly string[] | undefined,
  settingsNames: readonly string[] | undefined
): string[] | undefined {
  const union = [...new Set([...(rowNames ?? []), ...(settingsNames ?? [])])];
  return union.length === 0 ? undefined : union;
}
