/**
 * The probe half of `npm run conformance:shellenv` (Phase 276).
 *
 * It DRIVES the shipping modules and prints what it measured as JSON. The
 * checker beside it (`build/conformance-shellenv.mjs`) decides pass or fail,
 * owns every sentence a person reads, and owns the text rules that need no
 * execution. That split is `conformance-agents.mjs` + `agents-conformance-
 * probe.mts`'s, and it is here for the same reason: the tables are TypeScript
 * with path aliases, and a probe that cannot resolve `@shared/*` prints nothing
 * at all.
 *
 * ## IT SPAWNS NOTHING, AND THAT IS THE WHOLE POINT
 *
 * No Electron, no tmux, no ssh, no agent, no token — and NO SHELL. The phase it
 * gates exists because `zsh -lic` costs about a second on the operator's
 * machine, and a gate that paid that cost once per arm would take minutes and
 * would read differently on every machine it ran on.
 *
 * Three seams make that true, and all three are the shipping modules' own:
 *
 *   - `setLoginShellEnvCaptureForTests` (src/main/tmux/resolve.ts) replaces the
 *     capture the cache calls with a COUNTING FAKE. The cache, the coverage
 *     relation, the projection, the widening, the in-flight join, the
 *     generation guard and the failure rule are all driven for real against it.
 *   - `EnvWatchDeps` (src/main/env/watch.ts) takes a fake `watchDir`, a fake
 *     `setTimeout`, a fake `now`, a fake `declaredNames`, a fake
 *     `onSettingsChanged`, a fake `capture`, a fake `env` and a fake
 *     `realpath`. So the watcher fires when this file says it fires, the clock
 *     reads what this file says it reads, and the debounce and the five second
 *     floor are asserted as NUMBERS rather than waited out.
 *   - `shellFilesFor` (src/main/env/shell-files.ts) is pure already.
 *
 * Nothing under the operator's home is read, and nothing anywhere is written.
 * Every path in the watch lane is a STRING — `/home/p276-fixture/...` — that
 * this process never touches, because the `realpath` and `watchDir` seams mean
 * no candidate is ever stat'd or opened.
 *
 * ## NO VALUE, EVER
 *
 * Every variable name below is invented, in the shape a provider key has and
 * matching nothing real, and every value is a sentinel of this probe's own
 * (`p276-<name>-v1`). Nothing reads the operator's environment for a value and
 * nothing prints one that did not originate in this file.
 *
 * ## The lanes
 *
 *   --mode=cache   the slot, in src/main/tmux/resolve.ts
 *   --mode=files   the $SHELL table, in src/main/env/shell-files.ts
 *   --mode=watch   the watch set, the reaction and the lifecycle
 *
 * Each mode is a separate PROCESS on purpose: all three modules hold
 * module-level state, and a lane that inherited another lane's slot, generation
 * or quit flag would be measuring the order the lanes were written in.
 */

import {
  dropLoginShellEnvCache,
  enableLoginShellEnvCache,
  loginShellEnvEpoch,
  loginShellEnvFor,
  loginShellEnvNamesHeld,
  setLoginShellEnvCaptureForTests
} from '../src/main/tmux/resolve';
import { shellFilesFor } from '../src/main/env/shell-files';
import {
  ENV_WARM_MIN_INTERVAL_MS,
  ENV_WATCH_DEBOUNCE_MS,
  envWatchState,
  refreshEnvNow,
  resetEnvWatchForTests,
  startEnvWatch,
  stopEnvWatch,
  warmEnvAtBoot,
  type EnvWatchDeps
} from '../src/main/env/watch';
import type { CaptureEnvResult } from '../src/main/tmux/resolve';

// ---------------------------------------------------------------------------
// Invented names and invented values. Nothing here is real.
// ---------------------------------------------------------------------------

const A = 'ACMEAI_API_KEY';
const B = 'ACMEAI_BASE_URL';
const C = 'NOVALM_API_KEY';
const D = 'ZEPHYRAI_API_KEY';
/** A name the fixture shell has no value for, so it is `missing` and cached. */
const UNSET = 'P276_NEVER_EXPORTED';

/** The one shape a value takes in this file. It is not a key and never was. */
const valueOf = (name: string, generation: number): string =>
  `p276-${name.toLowerCase()}-v${String(generation)}`;

/**
 * A capture that counts, records what it was asked for, and answers from a
 * table this file controls.
 *
 * `probeFailed` is the REAL contract: `captureLoginShellEnv` signals failure by
 * VALUE and never by rejection, so the fake does too — a `.catch` here would be
 * a fake with a different contract from the function it stands in for, and the
 * failure rule this gate asserts is written as a `.then` for exactly that
 * reason.
 */
function countingCapture(): {
  calls: string[][];
  deferred: Array<() => void>;
  answer: (names: readonly string[]) => Promise<CaptureEnvResult>;
  /** Names the fake pretends the shell exports, and at which generation. */
  exports: Map<string, number>;
  /** When true, every probe answers `probeFailed: true` and no values. */
  fail: { now: boolean };
  /** When true, a probe resolves only when this file releases it. */
  hold: { now: boolean };
} {
  const calls: string[][] = [];
  const deferred: Array<() => void> = [];
  const exports = new Map<string, number>();
  const fail = { now: false };
  const hold = { now: false };
  const answer = (names: readonly string[]): Promise<CaptureEnvResult> => {
    calls.push([...names]);
    const asked = [...new Set(names)];
    const build = (): CaptureEnvResult => {
      if (fail.now) return { values: {}, missing: asked.sort(), probeFailed: true };
      const values: Record<string, string> = {};
      const missing: string[] = [];
      for (const name of asked) {
        const generation = exports.get(name);
        if (generation === undefined) missing.push(name);
        else values[name] = valueOf(name, generation);
      }
      return { values, missing: missing.sort(), probeFailed: false };
    };
    if (!hold.now) return Promise.resolve(build());
    return new Promise<CaptureEnvResult>((resolve) => {
      deferred.push(() => resolve(build()));
    });
  };
  return { calls, deferred, answer, exports, fail, hold };
}

/** One microtask drain, so a `.then` chain settles before the next reading. */
const settle = async (turns = 8): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
};

// ---------------------------------------------------------------------------
// LANE 1 — the cache
// ---------------------------------------------------------------------------

async function laneCache(): Promise<Record<string, unknown>> {
  const fake = countingCapture();
  setLoginShellEnvCaptureForTests(fake.answer);
  for (const name of [A, B, C, D]) fake.exports.set(name, 1);

  const readings: Record<string, unknown> = {};
  const since = (): number => fake.calls.length;

  // -- R11. DISARMED IS TODAY'S PATH -----------------------------------------
  // Three asks, three captures, no slot read and no join. The cache defaults to
  // off, so this arm runs before anything arms it.
  let mark = since();
  await loginShellEnvFor([A]);
  await loginShellEnvFor([A]);
  await loginShellEnvFor([A]);
  readings['disarmedCaptures'] = since() - mark;
  readings['disarmedNamesHeld'] = loginShellEnvNamesHeld();
  // Two asks on ONE TICK while disarmed must still be two captures: the
  // in-flight join is refused while nothing is watching, deliberately.
  mark = since();
  await Promise.all([loginShellEnvFor([A]), loginShellEnvFor([A])]);
  readings['disarmedSameTickCaptures'] = since() - mark;

  enableLoginShellEnvCache(true);

  // -- The empty ask spawns nothing, armed or not ----------------------------
  mark = since();
  const empty = await loginShellEnvFor([]);
  readings['emptyAskCaptures'] = since() - mark;
  readings['emptyAskResult'] = empty;
  readings['emptyAskNamesHeld'] = loginShellEnvNamesHeld();

  // -- R2, R3, R4. The hit, projected ---------------------------------------
  mark = since();
  const fill = await loginShellEnvFor([A, B]);
  readings['fillCaptures'] = since() - mark;
  readings['fillValues'] = fill.values;
  readings['namesHeldAfterFill'] = loginShellEnvNamesHeld();

  mark = since();
  const hit = await loginShellEnvFor([A]);
  readings['hitCaptures'] = since() - mark;
  readings['hitValues'] = hit.values;
  readings['hitMissing'] = hit.missing;
  readings['hitProbeFailed'] = hit.probeFailed;

  // A FRESH OBJECT EVERY ASK. `create-local.ts` aliases the record it is
  // handed, so a projection that returned the slot's own would let one create's
  // downstream mutate the cache for every later one.
  const one = await loginShellEnvFor([A]);
  const two = await loginShellEnvFor([A]);
  readings['sameValuesObject'] = one.values === two.values;
  readings['sameMissingArray'] = one.missing === two.missing;
  (one.values as Record<string, string>)['P276_INJECTED'] = 'not-a-key';
  const three = await loginShellEnvFor([A]);
  readings['mutationLeaked'] = Object.prototype.hasOwnProperty.call(
    three.values,
    'P276_INJECTED'
  );

  // THE CALLER'S ORDER, NEVER THE SLOT'S, and the dedupe keeps first-seen
  // order. This is the `-e` argv order Phase 275 promised does not move.
  readings['callerOrder'] = Object.keys((await loginShellEnvFor([B, A])).values);
  readings['callerOrderDeduped'] = Object.keys(
    (await loginShellEnvFor([B, A, B])).values
  );

  // -- R5. A miss widens, never narrows -------------------------------------
  mark = since();
  const widened = await loginShellEnvFor([C]);
  readings['missCaptures'] = since() - mark;
  readings['missAskedFor'] = fake.calls[fake.calls.length - 1] ?? [];
  readings['namesHeldAfterWiden'] = loginShellEnvNamesHeld();
  readings['widenedValues'] = widened.values;
  mark = since();
  await loginShellEnvFor([A, B]);
  readings['capturesForOldNamesAfterWiden'] = since() - mark;

  // -- R19. A partial answer is not a failure and IS cached ------------------
  mark = since();
  const partial = await loginShellEnvFor([A, UNSET]);
  readings['partialFirstCaptures'] = since() - mark;
  readings['partialMissing'] = partial.missing;
  readings['partialProbeFailed'] = partial.probeFailed;
  mark = since();
  const partialAgain = await loginShellEnvFor([A, UNSET]);
  readings['partialSecondCaptures'] = since() - mark;
  readings['partialSecondMissing'] = partialAgain.missing;

  // -- R9. The generation moves on an install and on a drop -----------------
  const epochBefore = loginShellEnvEpoch();
  dropLoginShellEnvCache();
  const epochAfterDrop = loginShellEnvEpoch();
  await loginShellEnvFor([A]);
  const epochAfterFill = loginShellEnvEpoch();
  readings['epochs'] = [epochBefore, epochAfterDrop, epochAfterFill];

  // -- R17, R18. Failure is never cached as success -------------------------
  dropLoginShellEnvCache();
  fake.fail.now = true;
  mark = since();
  const failed = await loginShellEnvFor([A]);
  readings['failedCaptures'] = since() - mark;
  readings['failedProbeFailed'] = failed.probeFailed;
  readings['failedValues'] = failed.values;
  readings['namesHeldAfterFailure'] = loginShellEnvNamesHeld();
  mark = since();
  const failedAgain = await loginShellEnvFor([A]);
  readings['secondFailedCaptures'] = since() - mark;
  readings['secondFailedProbeFailed'] = failedAgain.probeFailed;
  // The cache is still armed after a failure, and the next good probe fills it.
  fake.fail.now = false;
  mark = since();
  await loginShellEnvFor([A]);
  readings['recoveryCaptures'] = since() - mark;
  readings['namesHeldAfterRecovery'] = loginShellEnvNamesHeld();

  // A FAILED SHARED PROBE IS PROJECTED TOO, and both waiters are told. Each of
  // them really did launch without the values, so each posts its own notice.
  dropLoginShellEnvCache();
  fake.fail.now = true;
  mark = since();
  const bothFailed = await Promise.all([
    loginShellEnvFor([A]),
    loginShellEnvFor([A])
  ]);
  readings['sharedFailureCaptures'] = since() - mark;
  readings['sharedFailureFlags'] = bothFailed.map((r) => r.probeFailed);
  fake.fail.now = false;
  dropLoginShellEnvCache();

  // -- R7, R8. The in-flight join, and its refusal --------------------------
  mark = since();
  const joined = await Promise.all([
    loginShellEnvFor([A, B]),
    loginShellEnvFor([A])
  ]);
  readings['joinCaptures'] = since() - mark;
  readings['joinedAnswers'] = joined.map((r) => Object.keys(r.values));

  dropLoginShellEnvCache();
  mark = since();
  const notJoined = await Promise.all([
    loginShellEnvFor([A]),
    loginShellEnvFor([A, D])
  ]);
  readings['joinRefusedCaptures'] = since() - mark;
  readings['joinRefusedAnswers'] = notJoined.map((r) => Object.keys(r.values));

  // -- R10. The late-landing guard ------------------------------------------
  // A probe started before a drop must install NOTHING after it. This is the
  // race the phase creates: the watcher is a production invalidator, so a probe
  // started before a rotation can land after it and put the pre-rotation answer
  // back over a slot that was just cleared.
  dropLoginShellEnvCache();
  fake.hold.now = true;
  const inFlight = loginShellEnvFor([A, B]);
  await settle();
  readings['heldProbesPending'] = fake.deferred.length;
  dropLoginShellEnvCache();
  const release = fake.deferred.shift();
  if (release !== undefined) release();
  const late = await inFlight;
  await settle();
  readings['lateAnswerValues'] = Object.keys(late.values);
  readings['namesHeldAfterLateLanding'] = loginShellEnvNamesHeld();
  fake.hold.now = false;

  // -- R6. The cap replaces rather than merges or truncates ------------------
  dropLoginShellEnvCache();
  await loginShellEnvFor([A, B]);
  const many: string[] = [];
  for (let i = 0; i < 300; i += 1) many.push(`P276_BULK_${String(i).padStart(3, '0')}`);
  for (const name of many) fake.exports.set(name, 1);
  mark = since();
  const bulk = await loginShellEnvFor(many);
  readings['capCaptures'] = since() - mark;
  readings['capAskedForCount'] = (fake.calls[fake.calls.length - 1] ?? []).length;
  readings['capAnsweredCount'] =
    Object.keys(bulk.values).length + bulk.missing.length;
  const heldAfterCap = loginShellEnvNamesHeld();
  readings['capNamesHeldCount'] = heldAfterCap.length;
  readings['capHeldStillHasOldSmallSet'] = heldAfterCap.includes(A);
  readings['capHeldCoversEveryBulkName'] = many.every((n) => heldAfterCap.includes(n));

  // -- R12. Disarming drops the slot ----------------------------------------
  dropLoginShellEnvCache();
  await loginShellEnvFor([A]);
  readings['namesHeldBeforeDisarm'] = loginShellEnvNamesHeld();
  enableLoginShellEnvCache(false);
  readings['namesHeldAfterDisarm'] = loginShellEnvNamesHeld();
  mark = since();
  await loginShellEnvFor([A]);
  readings['capturesAfterDisarm'] = since() - mark;

  setLoginShellEnvCaptureForTests(null);
  readings['totalCaptures'] = fake.calls.length;
  return readings;
}

// ---------------------------------------------------------------------------
// LANE 2 — the $SHELL table
// ---------------------------------------------------------------------------

function laneFiles(): Record<string, unknown> {
  const home = '/home/p276-fixture';
  const rows: Record<string, unknown> = {};
  const ask = (shell: string | undefined, zdotdir?: string | undefined): string[] =>
    shellFilesFor({ shell, home, zdotdir });

  rows['zshBare'] = ask('zsh');
  rows['zshAbsolute'] = ask('/bin/zsh');
  rows['zshOddPath'] = ask('/opt/homebrew/bin/zsh');
  // ZDOTDIR SET moves ALL FOUR files off $HOME entirely.
  rows['zshWithZdotdir'] = ask('/bin/zsh', '/home/p276-fixture/.config/zsh');
  // ZDOTDIR SET TO THE EMPTY STRING IS SET. zsh then looks for `/.zshenv` and
  // reads nothing out of $HOME at all. `??` keeps it; `||` would fall back to
  // the home directory and describe a shell that is not the one running.
  rows['zshWithEmptyZdotdir'] = ask('/bin/zsh', '');
  rows['zshWithUndefinedZdotdir'] = ask('/bin/zsh', undefined);
  rows['bash'] = ask('/bin/bash');
  rows['sh'] = ask('/bin/sh');
  rows['dash'] = ask('/usr/bin/dash');
  rows['ksh'] = ask('/bin/ksh');
  // Not measured, so not armed. An unmeasured row would arm a cache whose
  // invalidation nobody has driven.
  rows['fish'] = ask('/opt/homebrew/bin/fish');
  rows['tcsh'] = ask('/bin/tcsh');
  rows['nu'] = ask('/opt/homebrew/bin/nu');
  rows['undefined'] = ask(undefined);
  rows['empty'] = ask('');
  // A home with a trailing slash must not produce a doubled separator.
  rows['trailingSlashHome'] = shellFilesFor({
    shell: '/bin/zsh',
    home: '/',
    zdotdir: undefined
  });
  return rows;
}

// ---------------------------------------------------------------------------
// LANE 3 — the watch set, the reaction and the lifecycle
// ---------------------------------------------------------------------------

/** Everything the watch module is allowed to touch, and all of it is a fake. */
function fakeWorld(options: {
  home?: string;
  shell?: string;
  zdotdir?: string | undefined;
  off?: boolean;
  realpaths?: Map<string, string>;
  watchThrows?: boolean;
}): {
  deps: EnvWatchDeps;
  clock: { now: number };
  watchers: Array<{ dir: string; fire: (file: string | null) => void; closed: boolean }>;
  timers: Array<{ ms: number; fn: () => void; cleared: boolean }>;
  captures: string[][];
  captureAnswer: { values: Record<string, string>; missing: string[]; probeFailed: boolean };
  declared: { names: string[] };
  settingsListeners: Array<() => void>;
  cacheArmed: boolean[];
  drops: { count: number };
  realpaths: Map<string, string>;
  /** While true a capture resolves only when this file releases it. */
  hold: { now: boolean };
  /** The held captures, oldest first. */
  pending: Array<() => void>;
} {
  const clock = { now: 1_000_000 };
  const watchers: Array<{
    dir: string;
    fire: (file: string | null) => void;
    closed: boolean;
  }> = [];
  const timers: Array<{ ms: number; fn: () => void; cleared: boolean }> = [];
  const captures: string[][] = [];
  const declared = { names: [A, B] };
  const settingsListeners: Array<() => void> = [];
  const cacheArmed: boolean[] = [];
  const drops = { count: 0 };
  const hold = { now: false };
  const pending: Array<() => void> = [];
  const realpaths = options.realpaths ?? new Map<string, string>();
  const captureAnswer = {
    values: {} as Record<string, string>,
    missing: [] as string[],
    probeFailed: false
  };
  const env: NodeJS.ProcessEnv = {
    SHELL: options.shell ?? '/bin/zsh',
    HOME: options.home ?? '/home/p276-fixture'
  };
  if (options.zdotdir !== undefined) env['ZDOTDIR'] = options.zdotdir;
  if (options.off === true) env['GMUX_NO_ENV_CACHE'] = '1';

  const deps: EnvWatchDeps = {
    watchDir(dir, onEvent) {
      if (options.watchThrows === true) throw new Error('p276 fixture: no watcher here');
      const entry = { dir, fire: onEvent, closed: false };
      watchers.push(entry);
      return {
        close() {
          entry.closed = true;
        }
      };
    },
    setTimeout(fn, ms) {
      const entry = { ms, fn, cleared: false };
      timers.push(entry);
      return {
        clear() {
          entry.cleared = true;
        }
      };
    },
    now: () => clock.now,
    declaredNames: () => [...declared.names],
    onSettingsChanged(listener) {
      settingsListeners.push(listener);
      return () => {
        const at = settingsListeners.indexOf(listener);
        if (at >= 0) settingsListeners.splice(at, 1);
      };
    },
    capture(names) {
      captures.push([...names]);
      const build = (): CaptureEnvResult => ({
        values: { ...captureAnswer.values },
        missing: [...captureAnswer.missing],
        probeFailed: captureAnswer.probeFailed
      });
      // HELD, so a quit can be driven into the middle of the warm-up's own
      // await. That is Phase 220's shape and it is rule 40's whole subject.
      if (!hold.now) return Promise.resolve(build());
      return new Promise<CaptureEnvResult>((resolve) => {
        pending.push(() => resolve(build()));
      });
    },
    enableCache(on) {
      cacheArmed.push(on);
    },
    dropCache() {
      drops.count += 1;
    },
    env,
    realpath(path) {
      const mapped = realpaths.get(path);
      if (mapped !== undefined) return mapped;
      // A candidate that does not exist. `fs.watch` on the file itself throws
      // ENOENT here, which is why the literal arm watches the DIRECTORY.
      if (path.includes('/.')) throw new Error(`ENOENT: ${path}`);
      return path;
    }
  };
  return {
    deps,
    clock,
    watchers,
    timers,
    captures,
    captureAnswer,
    declared,
    settingsListeners,
    cacheArmed,
    drops,
    realpaths,
    hold,
    pending
  };
}

/**
 * Fire the handle that belongs to one watched path.
 *
 * THE HANDLES ARE OPENED IN TARGET ORDER, and `envWatchState()` prints the
 * targets in that same order, so the index is the join between the two. It
 * matters that this is per HANDLE rather than per directory: four zsh files
 * share one directory and each handle carries its own basename filter, so a
 * `.zshrc` event delivered on the `.zshenv` handle is correctly ignored — which
 * is the property the unrelated-file reading below measures.
 */
function fireTarget(
  watchers: Array<{ dir: string; fire: (file: string | null) => void; closed: boolean }>,
  state: readonly string[] | null,
  path: string,
  filename: string | null
): boolean {
  if (state === null) return false;
  const at = state.indexOf(path);
  if (at < 0) return false;
  const handle = watchers[at];
  if (handle === undefined) return false;
  handle.fire(filename);
  return true;
}

/** Fire every timer that has not been fired or cleared, oldest first. */
function fireTimers(
  timers: Array<{ ms: number; fn: () => void; cleared: boolean }>,
  from: number
): number {
  let fired = 0;
  for (let i = from; i < timers.length; i += 1) {
    const timer = timers[i];
    if (timer === undefined || timer.cleared) continue;
    fired += 1;
    timer.fn();
  }
  return fired;
}

async function laneWatch(): Promise<Record<string, unknown>> {
  const readings: Record<string, unknown> = {};
  const HOME = '/home/p276-fixture';

  // -- R23. Every candidate gets a literal target, existing or not ----------
  {
    resetEnvWatchForTests();
    const w = fakeWorld({});
    startEnvWatch(w.deps);
    readings['plainTargets'] = envWatchState();
    readings['plainWatchDirCalls'] = w.watchers.map((x) => x.dir);
    // SYNCHRONOUS: by the time the call returns the handles are open and the
    // cache is armed. There is no window in which a quit can land between the
    // check and the install.
    readings['armedOnReturn'] = [...w.cacheArmed];
    stopEnvWatch();
    readings['closedOnStop'] = w.watchers.every((x) => x.closed);
    readings['disarmedOnStop'] = [...w.cacheArmed];
    readings['stateAfterStop'] = envWatchState();
  }

  // -- R24. The realpath arm, inside the home tree and outside it -----------
  {
    resetEnvWatchForTests();
    const realpaths = new Map<string, string>([
      // A dotfiles repo INSIDE the home: watched, on a second target.
      [`${HOME}/.zshrc`, `${HOME}/src/dotfiles/zshrc`],
      // A target OUTSIDE the home tree: not watched at all, by this phase's own
      // refusal. It falls to the deliberate refresh.
      [`${HOME}/.zshenv`, '/Volumes/work/dotfiles/zshenv']
    ]);
    const w = fakeWorld({ realpaths });
    startEnvWatch(w.deps);
    readings['symlinkTargets'] = envWatchState();
    stopEnvWatch();
  }

  // -- The home itself is a symlink. A scratch HOME under /tmp realpaths to
  // /private/tmp on macOS, so a naive "starts with $HOME" test drops the
  // dotfiles arm in every probe that uses one.
  {
    resetEnvWatchForTests();
    const realpaths = new Map<string, string>([
      ['/tmp/p276-home', '/private/tmp/p276-home'],
      ['/tmp/p276-home/.zshrc', '/private/tmp/p276-home/dotfiles/zshrc']
    ]);
    const w = fakeWorld({ home: '/tmp/p276-home', realpaths });
    startEnvWatch(w.deps);
    readings['symlinkedHomeTargets'] = envWatchState();
    stopEnvWatch();
  }

  // -- R25. Dedupe, the basename filter, and the null filename --------------
  {
    resetEnvWatchForTests();
    // Two candidates resolving to ONE file: one target, not two.
    const realpaths = new Map<string, string>([
      [`${HOME}/.zshrc`, `${HOME}/dotfiles/rc`],
      [`${HOME}/.zprofile`, `${HOME}/dotfiles/rc`]
    ]);
    const w = fakeWorld({ realpaths });
    startEnvWatch(w.deps);
    const state = envWatchState() ?? [];
    readings['dedupedTargets'] = state;
    readings['dedupedTargetCount'] = state.length;
    readings['dedupedUniqueCount'] = new Set(state).size;

    readings['dedupedRealpathTargetCount'] = state.filter((p) =>
      p.endsWith('/dotfiles/rc')
    ).length;

    const rcPath = `${HOME}/.zshrc`;
    const dropsBefore = w.drops.count;
    readings['firedUnrelated'] = fireTarget(
      w.watchers,
      state,
      rcPath,
      'somebody-elses-file.txt'
    );
    readings['dropsAfterUnrelatedFile'] = w.drops.count - dropsBefore;
    readings['firedOurs'] = fireTarget(w.watchers, state, rcPath, '.zshrc');
    readings['dropsAfterOurFile'] = w.drops.count - dropsBefore;
    // A null filename is the platform not telling us which file moved, and it
    // is treated as "maybe ours".
    readings['firedNull'] = fireTarget(w.watchers, state, rcPath, null);
    readings['dropsAfterNullFilename'] = w.drops.count - dropsBefore;
    stopEnvWatch();
  }

  // -- R29, R30, R31. The drop is immediate; the re-warm is debounced and
  // floored; and the floor gates neither the drop nor a create.
  {
    resetEnvWatchForTests();
    const w = fakeWorld({});
    startEnvWatch(w.deps);
    const state = envWatchState();
    const timersBefore = w.timers.length;
    const dropsBefore = w.drops.count;
    const capturesBefore = w.captures.length;

    fireTarget(w.watchers, state, `${HOME}/.zshrc`, '.zshrc');
    // THE DROP LANDS BEFORE ANY TIMER FIRES. Debouncing it would open a 400 ms
    // window in which a create reads a value we already know is stale.
    readings['dropsBeforeAnyTimerFired'] = w.drops.count - dropsBefore;
    readings['capturesBeforeAnyTimerFired'] = w.captures.length - capturesBefore;
    readings['firstBurstTimerMs'] = w.timers.slice(timersBefore).map((t) => t.ms);

    // A BURST IS ONE TIMER, NOT FOUR. `chezmoi apply`, `stow` and a
    // `git checkout` in a dotfiles repo all move several files at once.
    fireTarget(w.watchers, state, `${HOME}/.zprofile`, '.zprofile');
    fireTarget(w.watchers, state, `${HOME}/.zshenv`, '.zshenv');
    readings['timersForOneBurst'] = w.timers.length - timersBefore;
    readings['dropsForOneBurst'] = w.drops.count - dropsBefore;

    fireTimers(w.timers, timersBefore);
    await settle(24);
    readings['capturesAfterDebounce'] = w.captures.length - capturesBefore;
    readings['warmAskedFor'] = w.captures[w.captures.length - 1] ?? [];

    // THE FLOOR. A second burst 100 ms later waits out the remainder of the
    // five seconds rather than the 400 ms debounce.
    const timersAtFloor = w.timers.length;
    const dropsAtFloor = w.drops.count;
    w.clock.now += 100;
    fireTarget(w.watchers, state, `${HOME}/.zshrc`, '.zshrc');
    const capturesAtFloor = w.captures.length;
    readings['floorTimerMs'] = w.timers.slice(timersAtFloor).map((t) => t.ms);
    readings['dropsWhileFloorHolds'] = w.drops.count - dropsAtFloor;
    await settle(24);
    // THE FLOOR GATES THE RE-WARM AND NOTHING ELSE. No shell is started while
    // it holds, and the drop above already happened.
    readings['capturesWhileFloorHolds'] = w.captures.length - capturesAtFloor;

    // R32. Every timer is cleared by the stop.
    stopEnvWatch();
    readings['timersClearedByStop'] = w.timers
      .slice(timersAtFloor)
      .every((t) => t.cleared);
  }

  // -- R33. The settings listener compares, and does nothing when equal -----
  {
    resetEnvWatchForTests();
    const w = fakeWorld({});
    startEnvWatch(w.deps);
    const dropsBefore = w.drops.count;
    const timersBefore = w.timers.length;
    // An unrelated settings write — a theme, a window bound, a hotkey.
    for (const listener of w.settingsListeners) listener();
    readings['dropsAfterUnrelatedSettingsWrite'] = w.drops.count - dropsBefore;
    readings['timersAfterUnrelatedSettingsWrite'] = w.timers.length - timersBefore;
    // The same names in a different ORDER is the same cover.
    w.declared.names = [B, A];
    for (const listener of w.settingsListeners) listener();
    readings['dropsAfterReorderedCover'] = w.drops.count - dropsBefore;
    // A name added. This is residency and warmth, not correctness: coverage
    // already refuses to answer an ask naming a name the slot never had.
    w.declared.names = [A, B, C];
    for (const listener of w.settingsListeners) listener();
    readings['dropsAfterNewName'] = w.drops.count - dropsBefore;
    readings['timersAfterNewName'] = w.timers.length - timersBefore;
    stopEnvWatch();
    readings['settingsListenersAfterStop'] = w.settingsListeners.length;
  }

  // -- R28. A directory that cannot be watched, and a start that opens none -
  {
    resetEnvWatchForTests();
    const w = fakeWorld({ watchThrows: true });
    startEnvWatch(w.deps);
    readings['stateWhenNoHandleOpens'] = envWatchState();
    readings['armedWhenNoHandleOpens'] = [...w.cacheArmed];
    stopEnvWatch();
  }

  // -- R21. An unmeasured shell arms nothing --------------------------------
  {
    resetEnvWatchForTests();
    const w = fakeWorld({ shell: '/bin/tcsh' });
    startEnvWatch(w.deps);
    readings['stateForUnmeasuredShell'] = envWatchState();
    readings['armedForUnmeasuredShell'] = [...w.cacheArmed];
    stopEnvWatch();
  }

  // -- R41. The env knob turns the whole feature off ------------------------
  {
    resetEnvWatchForTests();
    const w = fakeWorld({ off: true });
    startEnvWatch(w.deps);
    readings['stateWithKnobSet'] = envWatchState();
    readings['armedWithKnobSet'] = [...w.cacheArmed];
    readings['watchersWithKnobSet'] = w.watchers.length;
    await warmEnvAtBoot();
    readings['capturesWithKnobSet'] = w.captures.length;
    stopEnvWatch();
  }

  // -- R37. An empty declared cover spawns nothing --------------------------
  {
    resetEnvWatchForTests();
    const w = fakeWorld({});
    w.declared.names = [];
    startEnvWatch(w.deps);
    await warmEnvAtBoot();
    readings['capturesForEmptyCover'] = w.captures.length;
    await refreshEnvNow();
    readings['capturesForEmptyCoverAfterRefresh'] = w.captures.length;
    stopEnvWatch();
  }

  // -- R38. The warm-up asks for the cover plus HOME and ZDOTDIR, and
  // re-derives the watch set from what comes back.
  {
    resetEnvWatchForTests();
    const w = fakeWorld({});
    w.captureAnswer.values = {
      [A]: valueOf(A, 1),
      HOME: '/home/reported-by-the-shell',
      ZDOTDIR: '/home/reported-by-the-shell/.config/zsh'
    };
    startEnvWatch(w.deps);
    readings['targetsBeforeWarm'] = envWatchState();
    await warmEnvAtBoot();
    await settle(24);
    readings['warmAsk'] = w.captures[0] ?? [];
    readings['targetsAfterWarm'] = envWatchState();
    stopEnvWatch();
  }

  // -- The ZDOTDIR the shell does not report falls back to the home it did --
  {
    resetEnvWatchForTests();
    const w = fakeWorld({});
    w.captureAnswer.values = { HOME: '/home/reported-by-the-shell' };
    w.captureAnswer.missing = ['ZDOTDIR', A, B];
    startEnvWatch(w.deps);
    await warmEnvAtBoot();
    await settle(24);
    readings['targetsWhenZdotdirMissing'] = envWatchState();
    stopEnvWatch();
  }

  // -- R27. The set is re-derived on every fire, so a moved symlink is
  // followed: the old target closes and the new one opens.
  {
    resetEnvWatchForTests();
    const realpaths = new Map<string, string>([
      [`${HOME}/.zshrc`, `${HOME}/dotfiles/one/zshrc`]
    ]);
    const w = fakeWorld({ realpaths });
    w.captureAnswer.values = { [A]: valueOf(A, 1) };
    startEnvWatch(w.deps);
    readings['targetsBeforeMove'] = envWatchState();
    // The person re-points the symlink at a second file in the repo.
    realpaths.set(`${HOME}/.zshrc`, `${HOME}/dotfiles/two/zshrc`);
    const timersBefore = w.timers.length;
    fireTarget(w.watchers, envWatchState(), `${HOME}/.zshrc`, '.zshrc');
    fireTimers(w.timers, timersBefore);
    await settle(24);
    readings['targetsAfterMove'] = envWatchState();
    readings['oldTargetClosed'] =
      w.watchers.find((x) => x.dir === `${HOME}/dotfiles/one`)?.closed ?? null;
    readings['newTargetOpened'] = w.watchers.some(
      (x) => x.dir === `${HOME}/dotfiles/two`
    );
    stopEnvWatch();
  }

  // -- R43. The refresh drops, re-derives, bypasses the floor and awaits ----
  {
    resetEnvWatchForTests();
    const w = fakeWorld({});
    w.captureAnswer.values = { [A]: valueOf(A, 1) };
    startEnvWatch(w.deps);
    await warmEnvAtBoot();
    await settle(24);
    const capturesBefore = w.captures.length;
    const dropsBefore = w.drops.count;
    // The floor is holding: the warm above set `lastWarmAt` to now.
    const answer = await refreshEnvNow();
    readings['refreshResolvesWith'] = answer === undefined ? 'undefined' : typeof answer;
    readings['refreshDrops'] = w.drops.count - dropsBefore;
    readings['refreshCaptures'] = w.captures.length - capturesBefore;
    stopEnvWatch();
    // A refresh after the stop must do nothing at all rather than throw.
    const dropsAfterStop = w.drops.count;
    await refreshEnvNow();
    readings['refreshAfterStopDrops'] = w.drops.count - dropsAfterStop;
  }

  // -- R39, R40. The lifecycle: idempotent, permanent, and asked on both
  // sides of the await.
  {
    resetEnvWatchForTests();
    const w = fakeWorld({});
    w.captureAnswer.values = { [A]: valueOf(A, 1), HOME: '/home/late' };
    startEnvWatch(w.deps);
    const watchersBefore = w.watchers.length;
    // A quit lands while the warm-up's probe is in flight. Nothing the probe
    // learned may install a watcher after the ordered disposer has finished
    // with this domain — Phase 220's shape, which `logins/ipc.ts` was repaired
    // for after a quit ran the disposer against a null watcher and the chain
    // then installed handles behind it.
    w.hold.now = true;
    const warming = warmEnvAtBoot();
    await settle();
    readings['heldWarmProbes'] = w.pending.length;
    stopEnvWatch();
    w.pending.shift()?.();
    await warming;
    await settle(24);
    readings['watchersOpenedAfterQuit'] = w.watchers.length - watchersBefore;
    readings['stateAfterQuitDuringWarm'] = envWatchState();
    // Calling the stop twice is calling it once, and it refuses every later
    // start: a quit is the end of the process.
    stopEnvWatch();
    stopEnvWatch();
    startEnvWatch(w.deps);
    readings['stateAfterRestartPostQuit'] = envWatchState();
  }

  readings['debounceMs'] = ENV_WATCH_DEBOUNCE_MS;
  readings['floorMs'] = ENV_WARM_MIN_INTERVAL_MS;
  resetEnvWatchForTests();
  return readings;
}

// ---------------------------------------------------------------------------

const mode = (process.argv.find((a) => a.startsWith('--mode=')) ?? '--mode=cache').slice(
  '--mode='.length
);

try {
  let readings: Record<string, unknown>;
  if (mode === 'cache') readings = await laneCache();
  else if (mode === 'files') readings = laneFiles();
  else if (mode === 'watch') readings = await laneWatch();
  else throw new Error(`unknown mode ${mode}`);
  process.stdout.write(`${JSON.stringify({ mode, readings })}\n`);
} catch (err) {
  process.stdout.write(
    `${JSON.stringify({
      mode,
      error: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    })}\n`
  );
  process.exit(1);
}
