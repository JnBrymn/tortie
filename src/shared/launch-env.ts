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
 *
 * PHASE 275 PUT A GATE BEHIND THAT SENTENCE, because nothing mechanical held it:
 * `build/assert-import-boundaries.mjs` allows shared -> shared, the cycle gate
 * skips type-only imports, and no test named this file. `conformance:agents`
 * now asserts this file's import count is zero. The three things a later round
 * is likely to reach for, each of which would break it, are refused by name:
 * taking the whole settings object (needs `GmuxSettings`), keying the shared
 * list by agent inside the function (needs `LaunchableAgentId`), and enforcing
 * the name cap here (needs `OVERLAY_LIMITS`).
 */

/**
 * The names this launch will read from the login shell: the agent row's own
 * `launch.envPassthrough` (agents.json, Phase 33) UNIONED with the names the
 * person set for THIS agent in Settings then Launch defaults, UNIONED with the
 * names they set for EVERY agent (Phase 275) — row first, deduped.
 *
 * THREE ROUTES, ONE ANSWER. agents.json stays the power-user route and Tortie
 * still never writes it; the per-agent Settings route is the one a person who
 * has no such file can reach; the shared list is the one a person reaches when
 * the key belongs to a PROVIDER rather than to an agent, which is the shape an
 * API key actually has — one DeepSeek key is the same key whichever agent talks
 * to DeepSeek. All three are sealed or compiled, and none shadows another,
 * because a person who has set more than one of them meant all of them.
 *
 * ORDER: row, then per-agent, then shared, and the first two do not move by one
 * byte. Phase 275 added the third source ON THE END for exactly that reason —
 * everybody who had a row and a per-agent list gets the identical list in the
 * identical order they got at the parent, so no argv order, no manifest row and
 * no notice list changes for a person who never uses the shared list.
 *
 * Returns undefined when all three are empty, so the spec of an agent nobody has
 * configured is byte for byte what it was before Phase 269, no probe is
 * spawned, no record field is written and no launch pays for a feature it does
 * not use. PHASE 270 leans on exactly that for a session on another machine:
 * undefined means no far-side probe is sent and no slot is composed. PHASE 275
 * leans on it again: `envPassthroughShared` defaults to `[]`, so a fresh install
 * still spawns no login shell on any launch.
 *
 * THE UNION IS DELIBERATELY UNCAPPED. The cap belongs to the doors a name is
 * added at (`OVERLAY_LIMITS.maxEnvPassthroughNames`, counted separately for the
 * shared list and for each agent list) and to the remote carriage. Spelling
 * `16` here would be a second spelling of a number this repository spells once,
 * and it would need an import this file may not have.
 *
 * `sharedNames` is a THIRD PARAMETER and not an optional one with a default.
 * Every call site passes it explicitly, so a launch path that forgets the shared
 * list is a compile error rather than a session that quietly carries two sources
 * out of three.
 *
 * Pure, and it mutates none of its inputs.
 */
export function envPassthroughFor(
  rowNames: readonly string[] | undefined,
  settingsNames: readonly string[] | undefined,
  sharedNames: readonly string[] | undefined
): string[] | undefined {
  const union = [
    ...new Set([
      ...(rowNames ?? []),
      ...(settingsNames ?? []),
      ...(sharedNames ?? [])
    ])
  ];
  return union.length === 0 ? undefined : union;
}
