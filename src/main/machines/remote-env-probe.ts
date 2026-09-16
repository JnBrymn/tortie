/**
 * The ONE round trip that asks a machine which of a person's named variables it
 * has (Phase 270, issue 20).
 *
 * ## The contract, and it is `captureLoginShellEnv`'s own
 *
 * **It never rejects and it never fails a create.** Every error — a deadline, a
 * dead link, a machine that is not answering, a catalogue refusal — comes back
 * as `probeFailed: true` with every asked name in `missing`. The create carries
 * on, the values are still expanded by the far side independently of this probe,
 * and the `env-unresolved` notice names what could not be resolved. That half
 * repays issue 20 even on a machine whose probe cannot run.
 *
 * AN HONEST ASYMMETRY, stated rather than hidden. `probeFailed: true` means
 * *Tortie could not ask*, not *the variable is absent*. Because the create
 * expands the values on the far side without consulting this answer, a variable
 * can be injected successfully while the notice says the probe failed. The
 * notice's existing copy already says "the probe itself failed or timed out",
 * which is the true sentence.
 *
 * ## ONE call for N names, never one call per name
 *
 * A remote round trip costs a login shell start — `./remote-path.ts` budgets
 * 10 s for exactly that — and sixteen of them would be sixteen login shells.
 * The `env-names` script in `./remote-scripts.ts` answers about the whole list
 * in one shell, and it goes through `./remote-run.ts`, so it inherits that
 * door's frozen text, its one quoting call, its connected-only check, its
 * generation check and its size cap for free.
 *
 * ## Per create, never cached per connection
 *
 * `./remote-path.ts` captures PATH once per connect and caches it for the
 * generation. This one runs at EVERY create, because rotating a value and
 * starting a second session must pick the new one up, and because a name
 * exported after the last connect must still be found.
 *
 * ## No value is in this file, in this process, or on this Mac
 *
 * The answer carries names. There is no field on {@link RemoteEnvProbeResult}
 * that could hold a value, and nothing in this module reads this Mac's own
 * environment for a remote create.
 *
 * ## WHY THE SETTINGS READ LIVES HERE AND NOT IN THE CARRIAGE
 *
 * {@link remoteEnvNamesFor} reads the seal-checked settings door, so it is
 * impure and belongs on this side of the split. The build that came out of
 * BUILDER A had it in `./remote-env-carriage.ts`, which `./context.ts` imports
 * — and `./context.ts` is the door every LOCAL session goes through. Measured
 * over both trees with an import walk: the parent's `context.ts` reached 78
 * modules and no settings module, and that build's reached 87 and one, by
 * `machines/context.ts -> machines/remote-env-carriage.ts -> settings/store.ts`.
 * The cycle gate stayed green throughout, because a new EDGE is not a cycle.
 * Moving the function here restores the carriage's own stated purity and takes
 * the settings store back out of the local tmux door's graph.
 */

import { randomBytes } from 'node:crypto';
import type { LaunchableAgentId, LaunchableAgentKind } from '@shared/types';
// PHASE 270. The ONE spelling of the union rule, imported rather than restated,
// so a later change to it cannot make a local session and a remote session
// disagree about which names an agent has. It sits in `src/shared/` because
// reading it from `../sessions/launch-plan` closed a measured runtime cycle;
// that module re-exports it and every existing caller is unchanged.
import { envPassthroughFor } from '@shared/launch-env';
import type { LaunchableEntryLike } from '../agents/registry';
import { getLog } from '../log';
import { getSettings } from '../settings/store';
import type { RemoteMachineContext } from './context';
import {
  droppedRemoteEnvNames,
  filterRemoteEnvNames
} from './remote-env-carriage';
import { runRemoteRead } from './remote-run';

const machinesLog = getLog('config');

/**
 * How long the far side's login shell gets to answer, being 10,000 ms.
 *
 * The same number and the same reasoning as `REMOTE_PATH_TIMEOUT_MS`: a login
 * file that reads a network mount is slow and still correct, and Phase 48
 * measured a real profile at 3.4 s.
 */
export const REMOTE_ENV_PROBE_TIMEOUT_MS = 10_000;

/** The catalogue id this module is the only caller of. */
export const REMOTE_ENV_PROBE_SCRIPT_ID = 'env-names';

/** One answer, and it holds no value because no value was ever printed. */
export interface RemoteEnvProbeResult {
  /** Names that machine has a usable value for. Sorted. */
  resolved: string[];
  /**
   * Names that machine had no usable value for, plus any name this rung refused
   * as not a variable name. Sorted.
   */
  missing: string[];
  /** True when the machine could not be asked, or answered no trailer. */
  probeFailed: boolean;
}

/**
 * A fresh nonce per probe.
 *
 * It is `captureLoginShellEnv`'s recipe verbatim, and it exists for exactly its
 * reason: the rc files that run on the far side are files an agent on that
 * machine could have written, and a static marker would let their output forge
 * a record. The marker travels as a POSITIONAL parameter; no script text in the
 * catalogue holds one.
 */
export function remoteEnvProbeMarker(): string {
  return `__TORTIE_ENVP_${randomBytes(4).toString('hex')}__`;
}

/** The record the inner shell prints last, which says it finished. */
function trailerOf(marker: string): string {
  return `${marker}.${marker}`;
}

/** A token that could be a variable name. */
const RECORD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/**
 * Read the far side's answer. Pure.
 *
 * The three readings, and they are three different facts:
 *
 * | What came back | Verdict |
 * | --- | --- |
 * | The trailer record is there | The login shell ran and answered. Every asked name with no record is unset, empty or over the cap ON THAT MACHINE |
 * | The trailer record is absent | The login shell started and did not finish, or something ate the tail → `probeFailed` |
 * | Nothing reached here at all | The caller already turned that into `probeFailed` |
 *
 * A record carrying a DIFFERENT marker is invisible to this function, because
 * the pattern is built from the nonce this probe generated. A record whose token
 * is not a legal variable name is invisible for the same reason. A name asked
 * for twice is counted once, because the asked list is deduped first.
 */
export function parseRemoteEnvAnswer(
  payload: string,
  marker: string,
  asked: readonly string[]
): RemoteEnvProbeResult {
  const wanted = [...new Set(asked)];
  if (!payload.includes(trailerOf(marker))) {
    return { resolved: [], missing: [...wanted].sort(), probeFailed: true };
  }
  // SPLIT, NEVER A REGEXP WITH THE NAME AS A GROUP, and the reason is measured
  // rather than stylistic. The marker is `__TORTIE_ENVP_<8 hex>__`, and every
  // one of its characters is in `[A-Za-z0-9_]` — the very class a variable name
  // is drawn from. A pattern `MARKER([A-Za-z_][A-Za-z0-9_]*)MARKER` therefore
  // lets the name group swallow the closing marker and the next opening one and
  // backtrack to the LAST marker in the payload, so two records came back as
  // one token that matched nothing. Splitting on the marker cannot do that: the
  // records are the ODD fields, because the far side's printf writes both
  // markers of every record and writes nothing between records.
  const fields = payload.split(marker);
  const found = new Set<string>();
  for (let i = 1; i < fields.length; i += 2) {
    const token = fields[i] ?? '';
    if (RECORD_NAME_RE.test(token)) found.add(token);
  }
  return {
    resolved: wanted.filter((name) => found.has(name)).sort(),
    missing: wanted.filter((name) => !found.has(name)).sort(),
    probeFailed: false
  };
}

/**
 * Ask one machine which of these names it has. NEVER REJECTS.
 *
 * The names are filtered against the variable-name alphabet BEFORE anything is
 * composed, and a name that fails is dropped whole and reported in `missing`,
 * so a person sees it named in the notice rather than losing it in silence.
 */
export async function probeRemoteEnvNames(
  ctx: RemoteMachineContext,
  names: readonly string[]
): Promise<RemoteEnvProbeResult> {
  const usable = filterRemoteEnvNames(names);
  const dropped = droppedRemoteEnvNames(names);
  if (usable.length === 0) {
    return { resolved: [], missing: dropped, probeFailed: false };
  }
  const marker = remoteEnvProbeMarker();
  try {
    const { payload } = await runRemoteRead(
      ctx,
      REMOTE_ENV_PROBE_SCRIPT_ID,
      [marker, usable.join(' ')],
      { timeoutMs: REMOTE_ENV_PROBE_TIMEOUT_MS }
    );
    const answer = parseRemoteEnvAnswer(payload, marker, usable);
    return {
      resolved: answer.resolved,
      missing: [...answer.missing, ...dropped].sort(),
      probeFailed: answer.probeFailed
    };
  } catch (err) {
    machinesLog.warn(
      `${ctx.machineId} could not be asked which shell variables it has, so ` +
        `the session starts with whatever its own shell expands: ` +
        `${(err as Error).message}`
    );
    return {
      resolved: [],
      missing: [...usable, ...dropped].sort(),
      probeFailed: true
    };
  }
}

/**
 * The names a session on another machine will carry, being the SAME union rule
 * the local create uses: the agent row's own `launch.envPassthrough` from
 * agents.json, unioned with the names the person set for THIS agent in Settings
 * then Launch defaults, unioned with the names they set for EVERY agent
 * (Phase 275), deduped, row first.
 *
 * WHAT THIS RUNG REFUSES IS NOW REPORTED rather than assumed impossible. The
 * cap here is asked a SECOND time over a union three doors of sixteen can fill,
 * and `remoteEnvNamesDroppedFor` below is what a caller names in the notice.
 *
 * `envPassthroughFor` is imported rather than restated, so there is ONE spelling
 * of that rule and a later change to it cannot make a local session and a remote
 * session disagree about which names an agent has.
 *
 * `getSettings()` is the SEAL-CHECKED read, the same door the local create uses,
 * so a name an agent appended to settings.json was already refused before this
 * line. THE CALL IS GUARDED because this function is also read by a gate that
 * runs in a plain node process with no Electron `app` behind it; a settings read
 * that cannot happen contributes no names rather than throwing.
 *
 * Returns `[]` for every compiled agent as shipped, which is what makes a create
 * for anybody who configured nothing byte for byte what it was at the parent:
 * no probe is spawned, no slot is composed and no deadline moves.
 *
 * THE MANIFEST IS NOT CONSULTED, and that is a deliberate difference from the
 * local restore, which reads the names off the row. Phase 269's second recorded
 * limit is that the manifest is not sealed; this path never reads it, so a row
 * an agent could reach cannot decide what a remote session carries.
 */
export function remoteEnvNamesFor(
  entry: LaunchableEntryLike | null,
  agent: LaunchableAgentKind
): string[] {
  return filterRemoteEnvNames(remoteEnvUnionFor(entry, agent));
}

/**
 * The union BEFORE this rung's cap and alphabet are applied (Phase 275). Pure
 * apart from the guarded settings read, and the one place the three sources are
 * joined for a remote session.
 *
 * WHY IT IS SPLIT OUT, CORRECTED BY THE FIX ROUND. The first version of this
 * comment said the split existed "so that the two answers a caller needs — what
 * travels, and what did not — are computed from ONE union rather than from two
 * reads of the settings". That is not what the code does and a verifier caught
 * it. Both callers call the two EXPORTED functions separately
 * (`remote-sessions.ts:1554` and `:1561`, `remote-restore.ts:468` and `:476`),
 * each of which calls this one, so there are two unions and two settings reads.
 * The comment described a shape nobody built.
 *
 * What the split is actually for is that `remoteEnvNamesFor` applies the cap and
 * the alphabet, so a caller that asked it for the OVERFLOW would be asking a
 * function that has already thrown the overflow away. The union has to be
 * reachable un-filtered, and this is that.
 *
 * AND THE RACE THE OLD COMMENT CLAIMED TO CLOSE IS CLOSED BY SOMETHING ELSE,
 * which is why the two functions may stay separate. Each pair of calls is two
 * adjacent SYNCHRONOUS statements with no `await` between them, so no settings
 * write can interleave; and `getSettings` answers from a per-load cache that
 * only a write clears, so even a non-adjacent pair reads one answer. A future
 * round that puts an `await` between a `remoteEnvNamesFor` and its
 * `remoteEnvNamesDroppedFor` reopens it, and the honest repair then is to pass
 * one union into both rather than to re-assert this paragraph.
 */
function remoteEnvUnionFor(
  entry: LaunchableEntryLike | null,
  agent: LaunchableAgentKind
): string[] {
  let settingsNames: readonly string[] | undefined;
  let sharedNames: readonly string[] | undefined;
  try {
    const settings = getSettings();
    settingsNames = settings.envPassthrough[agent as LaunchableAgentId];
    // PHASE 275. The third source, read through the SAME seal-checked door and
    // joined by the SAME pure rule the local create uses, so a person's shared
    // key reaches a session on another machine exactly as it reaches one here.
    // Remote feels identical to local.
    sharedNames = settings.envPassthroughShared;
  } catch {
    settingsNames = undefined;
    sharedNames = undefined;
  }
  return (
    envPassthroughFor(
      entry?.launch.envPassthrough,
      settingsNames,
      sharedNames
    ) ?? []
  );
}

/**
 * The union's names this rung will NOT carry (Phase 275) — the cap's overflow
 * and the alphabet's refusals, sorted, so a caller can name them.
 *
 * WHY IT EXISTS, and it is a divergence Phase 275 would otherwise have created.
 * `filterRemoteEnvNames` caps the union at `REMOTE_ENV_NAMES_MAX` = 16 and
 * truncates SILENTLY, and `remoteEnvNamesFor` applies it BEFORE
 * `probeRemoteEnvNames` gets the list — so a name past the cap never reaches
 * the `dropped` list that function already computes and already reports. With
 * two sources the comment on that constant, "the cap the settings door already
 * enforces", was already untrue; with THREE doors of sixteen the union can
 * reach 48 and it is badly untrue. Without this, a person over the cap loses
 * names with nothing said, on remote only.
 *
 * IT RAISES NO CAP AND SENDS NOTHING. It is built from
 * `droppedRemoteEnvNames`, which Phase 270 already wrote, over the same union;
 * the far-side script, `REMOTE_ENV_ALLOWED` and the transport do not move. The
 * caller merges the answer into the `env-unresolved` notice the session already
 * raises, so the person is told which names did not travel, by name, once.
 */
export function remoteEnvNamesDroppedFor(
  entry: LaunchableEntryLike | null,
  agent: LaunchableAgentKind
): string[] {
  return droppedRemoteEnvNames(remoteEnvUnionFor(entry, agent));
}
