/**
 * The login-shell answer is kept fresh: the watch, the warm-up and the one
 * deliberate refresh (Phase 276).
 *
 * ## WHAT THIS DOMAIN IS FOR
 *
 * `captureLoginShellEnv` spawns `$SHELL -lic`, and the `i` is what makes it
 * cost a second: measured on the operator's machine, three runs each,
 * `zsh -lic` took 1160/970/980 ms and `zsh -lc` took 10/10/10 ms, and all of
 * the difference is oh-my-zsh, nvm and rbenv loading for an interactive shell.
 * The `i` is also the whole reason the feature works, because `.zshrc` is read
 * by interactive shells and by nothing else and a provider key exported there
 * is exactly what issue 20 was about. So the flag stays and the SECOND is paid
 * once per app launch instead of once per session -- which is `resolve.ts`'s
 * cache, and which is only safe while something is watching for the answer to
 * change. That something is this file.
 *
 * **The three sentences that are the whole design.** Coverage protects the NAME
 * set: an ask mentioning a name the slot does not hold can never be served from
 * it, by construction, with no event and no timer in the path. The watch here
 * protects the VALUES, because a rotation changes no name and only a file event
 * can catch it. The refresh protects what neither can see.
 *
 * ## THE CACHE IS OFF UNTIL THIS FILE IS WATCHING IT
 *
 * `enableLoginShellEnvCache(true)` is called from exactly one place, in
 * `startEnvWatch()` below, and only after at least one watcher handle has
 * actually opened. So every way this file can fail to build a watch -- a shell
 * `./shell-files.ts` has not measured, a home no watcher can open, a start that
 * lost its race with the quit, `GMUX_NO_ENV_CACHE=1` -- lands on today's cost
 * rather than on a cache nobody can invalidate. It is a proof rather than a
 * convention, and it is why a stale key cannot be delivered by a build whose
 * watcher failed.
 *
 * ## `node:fs`'s OWN WATCH, NON-RECURSIVE, NEVER `src/main/watcher/`
 *
 * The same choice `src/main/credentials/watch.ts:13-22` makes, for the same
 * reasons and two more that were measured for this phase.
 *
 * Non-recursive is the whole answer to cost: a home directory's write traffic
 * is in its subtrees. Over a home-shaped scratch tree, being 2,000 writes under
 * `Library/Caches` and `node_modules` plus ONE edit to `.zshrc`,
 * `@parcel/watcher` delivered 2,001 events and `fs.watch` delivered 1. Both
 * caught the edit. On the operator's real home, read only, one non-recursive
 * `fs.watch` delivered 0 events in 30 seconds and 5 in 120 seconds, none of
 * them an rc basename.
 *
 * And `src/main/watcher/` is refused for a second reason beyond wanting a
 * repository root: every subscription it makes carries the FSEvents exclusion
 * plan, and `ignored-roots.ts:28-46` records the budget.
 * `FSEventStreamSetExclusionPaths` accepts at most EIGHT paths, at nine it
 * returns false and ZERO exclusions apply, and `@parcel/watcher` never checks
 * the return value. A home-directory subscription inside that budget has silent
 * total failure of every OTHER repository's exclusions as its overflow mode.
 * `node:fs`'s watch is a different primitive with its own stream and no
 * exclusion array, so the budget is untouched, and `npm run conformance:watcher`
 * runs anyway to prove it.
 *
 * ## BOTH ARMS, BECAUSE NEITHER IS SUFFICIENT ALONE
 *
 * A DIRECTORY watch with a basename filter catches creation of a file that does
 * not exist yet, the rename-over every editor does, and replacement of a
 * symlink. Measured in one scratch directory with a 1.5 s settle per step:
 * rename-over gave the file watch 1 event and the directory watch 2; the next
 * edit gave the file watch 0 and the directory watch 1; the edit after that,
 * the same. `fs.watch` on a path that does not exist threw `ENOENT`, and the
 * directory arm caught the later creation at +11 ms.
 *
 * A directory watch alone is blind to a dotfiles repo. With `~/.zshrc` a
 * symlink into one, the `$HOME` directory watch saw 0 events when the repo was
 * edited, because nothing in `$HOME` moved. The REALPATH arm saw it.
 *
 * So both, deduped by `(dir, basename)`.
 *
 * ## NOTHING RECURSIVE AND NOTHING OUTSIDE THE HOME
 *
 * Phase 276's own refusal, kept, and applied to BOTH arms rather than only to
 * the realpath one. A dotfiles repo at `~/src/dotfiles` is inside the home and
 * is watched; one on `/Volumes/work` is not watched at all, and a `ZDOTDIR`
 * pointing at `/etc/zsh` is not watched either. Those people fall to the
 * deliberate refresh, and if NOTHING is watchable the cache is never armed and
 * they simply keep today's behaviour.
 *
 * ## NOTHING HERE LOGS AND NOTHING HERE PERSISTS
 *
 * The same rule `credentials/watch.ts` holds and the same rule Phase 269 wrote:
 * no value captured from the shell is written to a file, a log, an argv or a
 * settings key by anything in this domain. This file never sees a value at all.
 * It asks `loginShellEnvFor` for a list of NAMES and reads exactly two answers
 * back out of it, `HOME` and `ZDOTDIR`, which are paths already in this
 * process's own environment.
 */

import { realpathSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname } from 'node:path';
import { envPassthroughFor } from '@shared/launch-env';
import { LAUNCHABLE_AGENT_IDS } from '../agents/registry';
import { getSettings, onSettingsUpdated } from '../settings/store';
import {
  dropLoginShellEnvCache,
  enableLoginShellEnvCache,
  loginShellEnvFor,
  type CaptureEnvResult
} from '../tmux';
import { shellFilesFor } from './shell-files';

/**
 * How long a burst of file events is allowed to settle before the shell is
 * asked again.
 *
 * MEASURED BURSTS ARE TINY, so the exact number is not load bearing: a
 * vim-style backup-then-rename gives 2 events with a 0 ms spread, `sed -i`
 * gives 2 with a 0 ms spread, an append gives 1 and a truncate-rewrite gives 1.
 *
 * IT IS DEFINED HERE AND NOT IMPORTED FROM `credentials/watch.ts:64`, which
 * happens to hold the same number. Importing it would put a credentials edge in
 * this domain's import graph to borrow a coincidence: that debounce governs a
 * reaction that READS vendor stores and WRITES Tortie's own, and this one
 * governs a login shell. They agree today and neither owes the other anything.
 */
export const ENV_WATCH_DEBOUNCE_MS = 400;

/**
 * The floor between two re-warms, so a storm cannot spin login shells.
 *
 * The same shape as `OBSERVE_MIN_INTERVAL_MS` (`credentials/watch.ts:67`) and
 * for the same reason: a `chezmoi apply`, a `stow` or a `git checkout` in a
 * dotfiles repo can move all four files at once, and without a floor that is
 * four `zsh -lic` starts.
 *
 * IT NEVER GATES THE DROP AND IT NEVER GATES A CREATE. The drop is immediate,
 * and a create arriving while the floor holds probes for itself at today's
 * cost, which is the fallback Phase 276 section 9 requires.
 */
export const ENV_WARM_MIN_INTERVAL_MS = 5_000;

/**
 * The shell the probe spawns when `$SHELL` is unset.
 *
 * SPELLED TWICE ON PURPOSE, and this is the second place.
 * `captureLoginShellEnv` resolves `options.shell ?? env['SHELL'] ?? '/bin/zsh'`
 * (`resolve.ts`), and the watch set has to be derived from the shell the probe
 * ACTUALLY spawns rather than from a different guess. `resolve.ts` may not
 * import this module -- it is deliberately pure Node except two lazy
 * `require('electron')` calls, and this domain reads the settings store, which
 * imports electron at module scope -- so the constant is repeated here with
 * this comment rather than exported across that boundary.
 */
const DEFAULT_SHELL = '/bin/zsh';

/**
 * The knob that turns the whole feature off: no watch, no warm-up, no cache.
 *
 * It exists so the PARENT's behaviour is reachable at HEAD, which is what makes
 * the before-and-after measurement honest and what gives the ablation something
 * to flip. It is read at `startEnvWatch()` rather than remembered, so a probe
 * can set it per launch.
 */
const OFF_ENV = 'GMUX_NO_ENV_CACHE';

/** One directory to watch, and the one basename inside it that matters. */
interface EnvWatchTarget {
  dir: string;
  file: string;
}

/**
 * The seams. The gate hands in fakes and opens no real watcher, starts no real
 * timer and spawns no shell.
 */
export interface EnvWatchDeps {
  /** Open a directory watcher. Default is `node:fs`'s own `watch`. */
  watchDir?(dir: string, onEvent: (file: string | null) => void): { close(): void };
  setTimeout?(fn: () => void, ms: number): { clear(): void };
  now?(): number;
  /** The declared cover. Default reads the settings store. */
  declaredNames?(): string[];
  /** Subscribe to settings writes. Default is the settings store's own. */
  onSettingsChanged?(listener: () => void): () => void;
  /** Ask the login shell. Default is the cached door in `../tmux`. */
  capture?(names: readonly string[]): Promise<CaptureEnvResult>;
  /** Arm or disarm the cache. Default is the cache's own door. */
  enableCache?(on: boolean): void;
  /** Drop the slot. Default is the cache's own door. */
  dropCache?(): void;
  /** This process's environment, for `$SHELL`, `$HOME` and `$ZDOTDIR`. */
  env?: NodeJS.ProcessEnv;
  /** Resolve a symlink. Default is `node:fs`'s `realpathSync`. */
  realpath?(path: string): string;
}

interface Resolved {
  watchDir(dir: string, onEvent: (file: string | null) => void): { close(): void };
  setTimeout(fn: () => void, ms: number): { clear(): void };
  now(): number;
  declaredNames(): string[];
  onSettingsChanged(listener: () => void): () => void;
  capture(names: readonly string[]): Promise<CaptureEnvResult>;
  enableCache(on: boolean): void;
  dropCache(): void;
  env: NodeJS.ProcessEnv;
  realpath(path: string): string;
}

// ---------------------------------------------------------------------------
// Module state. One watch per process, started from the boot and stopped in the
// one ordered quit disposer.
// ---------------------------------------------------------------------------

let deps: Resolved | null = null;
let running = false;
/**
 * A quit has been through here. It is permanent for the process and it refuses
 * every later start.
 *
 * PHASE 220'S SHAPE, WHICH IS WHY THIS FLAG EXISTS RATHER THAN JUST `running`.
 * The boot hook is the last link of a fire-and-forget chain, so a quit landing
 * inside it would otherwise run `stopEnvWatch()` against nothing and the chain
 * would then install `fs.watch` handles and a timer AFTER the ordered disposer
 * had finished with this domain. `startEnvWatch()` is synchronous so it has no
 * window of its own, and `warmEnvAtBoot()` asks on both sides of its await.
 */
let stopped = false;
const watchers = new Map<string, { close(): void }>();
let targets: EnvWatchTarget[] = [];
let debounceTimer: { clear(): void } | null = null;
let unsubscribeSettings: (() => void) | null = null;
let lastDeclared = '';
let lastWarmAt = 0;
let pending = false;
let warmInFlight: Promise<void> | null = null;

/**
 * Where the shell reads its files from, as best we know right now.
 *
 * The PROVISIONAL answer comes from this process's own environment at
 * `startEnvWatch()`. The REAL answer comes from the shell itself: the warm-up
 * asks for `HOME` and `ZDOTDIR` alongside the declared cover and re-derives the
 * set from what comes back. That costs no extra shell, because the probe's cost
 * is the shell start and not the number of names -- measured on the calibrated
 * slow home, `zsh -lic` for 1 name read 811/818/828/834/838 ms and for 52 names
 * read 918/853/850/854/839 ms.
 *
 * `ZDOTDIR` is usually set INSIDE `~/.zshenv`, so it is normally not in
 * Electron's `process.env` at all and the shell's own answer is the only way to
 * learn it.
 */
let homeHint: string | null = null;
let zdotdirHint: string | undefined;

// ---------------------------------------------------------------------------
// The declared cover
// ---------------------------------------------------------------------------

/**
 * Every shell-variable name the person's configuration declares, across every
 * launchable agent, deduped.
 *
 * THE ROW ARGUMENT IS `undefined` ON PURPOSE. `agents.json` rows are a
 * per-agent compiled source the warm-up cannot enumerate cheaply, and a name
 * that only a row supplies simply misses on its first ask and widens the slot
 * for every ask after it. Note that on a shipped build no compiled row
 * contributes anything at all: the only occurrence of `envPassthrough` in
 * `src/main/agents/registry.ts` is the optional field declaration itself.
 *
 * It never throws. A settings read that cannot happen has declared nothing, and
 * a warm-up that spawns no shell is the right answer to that.
 */
export function declaredEnvNames(): string[] {
  try {
    const settings = getSettings();
    const names = new Set<string>();
    for (const id of LAUNCHABLE_AGENT_IDS) {
      const list = envPassthroughFor(
        undefined,
        settings.envPassthrough[id],
        settings.envPassthroughShared
      );
      for (const name of list ?? []) names.add(name);
    }
    return [...names];
  } catch {
    return [];
  }
}

/** The cover as one comparable string, for the settings listener. */
function coverKey(names: readonly string[]): string {
  return [...names].sort().join(' ');
}

// ---------------------------------------------------------------------------
// The watch set
// ---------------------------------------------------------------------------

/** `$SHELL`, with the same fallback the probe itself applies. */
function shellForWatch(env: NodeJS.ProcessEnv): string {
  const shell = env['SHELL'];
  return shell !== undefined && shell.length > 0 ? shell : DEFAULT_SHELL;
}

/** The home directory this process believes in, before the shell is asked. */
function homeForWatch(env: NodeJS.ProcessEnv): string {
  const home = env['HOME'];
  if (home !== undefined && home.length > 0) return home;
  try {
    return homedir();
  } catch {
    return '';
  }
}

/** Is `path` the home directory itself, or somewhere under it? */
function insideHome(path: string, home: string): boolean {
  const root = home.replace(/\/+$/, '');
  if (root.length === 0) return false;
  return path === root || path.startsWith(`${root}/`);
}

/**
 * Every directory-and-basename pair to hold a watcher on, both arms, deduped.
 *
 * THE REALPATH OF THE HOME IS COMPARED AS WELL AS THE HOME, and that is not
 * pedantry. A scratch HOME under `/tmp` realpaths to `/private/tmp` on macOS,
 * so a candidate's realpath would fail a naive "starts with $HOME" test and the
 * dotfiles arm would be silently dropped in every probe and in every test that
 * uses one. The person's real home can be a symlink too.
 */
function deriveTargets(d: Resolved): EnvWatchTarget[] {
  const home = homeHint ?? homeForWatch(d.env);
  const candidates = shellFilesFor({
    shell: shellForWatch(d.env),
    home,
    // `??` AND NEVER `||`. An empty ZDOTDIR is SET, and means the shell reads
    // nothing out of $HOME at all.
    zdotdir: zdotdirHint ?? d.env['ZDOTDIR']
  });
  let homeReal = home;
  try {
    homeReal = d.realpath(home);
  } catch {
    // A home that cannot be resolved is compared as written.
  }
  const out: EnvWatchTarget[] = [];
  const seen = new Set<string>();
  const add = (path: string): void => {
    const dir = dirname(path);
    // NOTHING OUTSIDE THE HOME, on either arm. See the module header.
    if (!insideHome(dir, home) && !insideHome(dir, homeReal)) return;
    const file = basename(path);
    const key = `${dir} ${file}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ dir, file });
  };
  for (const candidate of candidates) {
    // THE LITERAL ARM, ALWAYS, whether or not the file exists. A file that does
    // not exist yet is the case that matters most: creating `~/.zshrc` for the
    // first time is when a key first appears, and `fs.watch` on the file itself
    // would throw ENOENT.
    add(candidate);
    // THE REALPATH ARM, only when the file exists, its realpath differs, and
    // the realpath is inside the home tree. This is the only thing that catches
    // a dotfiles repo.
    let real: string;
    try {
      real = d.realpath(candidate);
    } catch {
      continue;
    }
    if (real === candidate) continue;
    add(real);
  }
  return out;
}

/**
 * Re-derive the whole target set and reconcile the handles: close what is gone,
 * open what is new.
 *
 * IT IS RE-DERIVED ON EVERY FIRE AND ON EVERY REFRESH, for
 * `credentials/watch.ts:193-228`'s own reason. A rename can move the target,
 * and the first build of that watcher never looked again, so a directory that
 * did not exist when the watch started was never watched at all.
 */
function refreshTargets(d: Resolved): void {
  if (stopped) return;
  let wanted: EnvWatchTarget[];
  try {
    wanted = deriveTargets(d);
  } catch {
    return;
  }
  targets = wanted;
  const keys = new Set(wanted.map((t) => `${t.dir} ${t.file}`));
  for (const [key, handle] of watchers) {
    if (keys.has(key)) continue;
    watchers.delete(key);
    try {
      handle.close();
    } catch {
      // Already gone.
    }
  }
  for (const target of wanted) {
    const key = `${target.dir} ${target.file}`;
    if (watchers.has(key)) continue;
    try {
      watchers.set(
        key,
        d.watchDir(target.dir, (file) => {
          // ONLY THE ONE BASENAME, so a directory watch is as narrow as a file
          // watch. A null filename is the platform not telling us which file
          // moved, and it is treated as "maybe ours".
          if (file === null || file === target.file) onShellFileMoved();
        })
      );
    } catch {
      // A directory that cannot be watched is skipped, not fatal. If NONE of
      // them opens, the cache is never armed and every create probes.
    }
  }
}

// ---------------------------------------------------------------------------
// The reaction
// ---------------------------------------------------------------------------

/**
 * A watched file moved.
 *
 * THE DROP HAS NO DEBOUNCE AT ALL, and this is the single most important
 * difference from the `credentials/watch.ts` precedent. That module debounces
 * its WHOLE reaction at 400 ms because its reaction reads vendor stores and
 * writes Tortie's own. Ours is two things with opposite costs: the drop is one
 * assignment, and the re-warm spawns a login shell. Debouncing the drop would
 * open a 400 ms window in which a create reads a value we already know is
 * stale, which is a stale key delivered silently and the one outcome this phase
 * is built to prevent, and it would buy nothing, because the drop is not the
 * expensive half.
 */
function onShellFileMoved(): void {
  if (!running || deps === null) return;
  deps.dropCache();
  scheduleWarm();
}

function scheduleWarm(): void {
  if (!running || deps === null) return;
  const d = deps;
  pending = true;
  if (debounceTimer !== null || warmInFlight !== null) return;
  const since = d.now() - lastWarmAt;
  const wait = Math.max(ENV_WATCH_DEBOUNCE_MS, ENV_WARM_MIN_INTERVAL_MS - since);
  debounceTimer = d.setTimeout(() => {
    debounceTimer = null;
    void warm();
  }, wait);
}

/**
 * Ask the shell and re-derive the watch set from its answer.
 *
 * A WARM IN FLIGHT IS SHARED, NEVER DUPLICATED. A second caller gets the same
 * promise, and a create arriving mid-warm joins the same capture one level
 * down, in `loginShellEnvFor`'s own in-flight join.
 */
function warm(): Promise<void> {
  if (!running || deps === null) return Promise.resolve();
  if (warmInFlight !== null) return warmInFlight;
  const d = deps;
  pending = false;
  lastWarmAt = d.now();
  const run = probeAndRederive(d)
    .catch(() => undefined)
    .then(() => {
      warmInFlight = null;
      // AN EVENT THAT ARRIVED DURING THE WARM gets exactly one more warm, after
      // the floor, which is what collapses a storm into one shell per burst.
      // It matters here beyond tidiness: a probe started before the drop is
      // refused installation by the cache's own generation guard, so without
      // this the slot would stay cold until the next create paid for it.
      if (pending && running) scheduleWarm();
    });
  warmInFlight = run;
  return run;
}

async function probeAndRederive(d: Resolved): Promise<void> {
  const cover = d.declaredNames();
  // AN EMPTY DECLARED COVER SPAWNS NOTHING. A person who has configured no
  // shell variable must not start paying for a login shell they never paid for
  // before. This is a rule, not an optimisation.
  if (cover.length === 0) return;
  // PHASE 220's SHAPE: admission is asked on both sides of the await.
  if (!running) return;
  // THE TWO EXTRA NAMES ARE HOW THE WATCH SET STOPS BEING A GUESS, and they
  // cost nothing: the probe's cost is the shell start rather than the name
  // count, and both are paths already in this process's own environment rather
  // than credentials.
  const result = await d.capture([...cover, 'HOME', 'ZDOTDIR']);
  if (!running) return;
  const home = result.values['HOME'];
  if (home !== undefined && home.length > 0) homeHint = home;
  const zdotdir = result.values['ZDOTDIR'];
  // AN EMPTY OR UNSET ZDOTDIR READS AS `missing` THROUGH THIS CHANNEL, because
  // `finish` sorts an empty value into `missing` (`resolve.ts`). So through the
  // probe the two are indistinguishable and both read as unset, and the set
  // falls back to the home the shell reported. That is a STATED LIMIT of this
  // phase: for a person who really has `ZDOTDIR=""` the shell reads nothing out
  // of `$HOME`, every candidate is absent, and the automatic invalidation is
  // blind. The cache is still correct, because coverage and the refresh both
  // work, and only the convenience is lost. The one-line fix is a second marker
  // record in the probe's own script, which is a change to
  // `captureLoginShellEnv`'s contract and is deliberately out of scope here.
  zdotdirHint = zdotdir !== undefined && zdotdir.length > 0 ? zdotdir : undefined;
  refreshTargets(d);
}

// ---------------------------------------------------------------------------
// The lifecycle
// ---------------------------------------------------------------------------

function resolveDeps(given: EnvWatchDeps): Resolved {
  return {
    watchDir: given.watchDir ?? defaultWatchDir,
    setTimeout:
      given.setTimeout ??
      ((fn, ms) => {
        const id = setTimeout(fn, ms);
        id.unref?.();
        return { clear: () => clearTimeout(id) };
      }),
    now: given.now ?? (() => Date.now()),
    declaredNames: given.declaredNames ?? declaredEnvNames,
    onSettingsChanged: given.onSettingsChanged ?? onSettingsUpdated,
    capture: given.capture ?? ((names) => loginShellEnvFor(names)),
    enableCache: given.enableCache ?? enableLoginShellEnvCache,
    dropCache: given.dropCache ?? dropLoginShellEnvCache,
    env: given.env ?? process.env,
    realpath: given.realpath ?? realpathSync
  };
}

/**
 * Derive the watch set, open the handles, arm the cache, and subscribe to
 * settings.
 *
 * IT IS SYNCHRONOUS, and that is deliberate: it has no window in which a quit
 * can land between a check and an install. It is called from the boot chain in
 * `src/main/index.ts` with NO delay, because arming early is what buys the
 * restore burst. Restore runs right after the core is open, so with the cache
 * armed the first restored session's probe fills the slot and every session
 * after it hits. Waiting a second to arm would have twenty restored sessions
 * pay twenty login shells, which is what the parent does.
 *
 * `fs.watch`'s setup is a kernel call and a home on a stalled mount blocks IN
 * THE KERNEL where a try/catch cannot reach it, which is Phase 274's argument.
 * It is placed after the core is open for that reason, and it is the same call
 * Phase 211 already makes on the same directory one second later.
 */
export function startEnvWatch(given: EnvWatchDeps = {}): void {
  if (running || stopped) return;
  const d = resolveDeps(given);
  if (d.env[OFF_ENV] === '1') return;
  deps = d;
  // FAR ENOUGH IN THE PAST that the first burst waits only the debounce, not
  // the floor. The floor exists to stop a storm spinning login shells, not to
  // delay the first edit Tortie sees.
  lastWarmAt = d.now() - ENV_WARM_MIN_INTERVAL_MS;
  homeHint = null;
  zdotdirHint = undefined;
  running = true;
  refreshTargets(d);
  if (watchers.size === 0) {
    // NOTHING IS WATCHING, SO NOTHING IS CACHED. An unmeasured shell, a home
    // with no watchable directory, a ZDOTDIR outside the home: every one of
    // them lands here, and every create then pays today's cost instead of
    // reading an answer nobody can invalidate.
    running = false;
    deps = null;
    targets = [];
    return;
  }
  lastDeclared = coverKey(d.declaredNames());
  // THE LISTENER COMPARES AND DOES NOTHING WHEN EQUAL. `onSettingsUpdated`
  // fires for EVERY settings write, being a theme change, a window bound or a
  // hotkey, so a listener that dropped the cache on every call would spawn a
  // login shell every time a person moved a slider in Settings.
  //
  // AND IT IS NOT THE CORRECTNESS DEVICE. Adding a name can never be served
  // from a slot that does not mention it, because the cache is keyed on
  // COVERAGE. What this buys is residency, so a name a person REMOVED stops
  // being held in memory, and warmth, so the create after an edit is not the
  // one that pays the second.
  unsubscribeSettings = d.onSettingsChanged(() => {
    if (!running || deps === null) return;
    const next = coverKey(deps.declaredNames());
    if (next === lastDeclared) return;
    lastDeclared = next;
    deps.dropCache();
    scheduleWarm();
  });
  d.enableCache(true);
}

/**
 * The boot warm-up. Never awaited by anything on the boot path.
 *
 * It waits the same second the Phase 208 login observe waits, for the same
 * reason its comment gives: the first paint and the restore burst are not made
 * to compete with a shell start.
 */
export async function warmEnvAtBoot(): Promise<void> {
  if (!running) return;
  await warm();
}

/**
 * The deliberate refresh, behind the Re-read shell button in Settings then
 * Launch defaults.
 *
 * THE BUTTON EXISTS FOR WHAT THE WATCH PROVABLY CANNOT SEE: a key exported by a
 * file the rc SOURCES (measured, 0 events on both arms, because the rc itself
 * never moved and the sourced file is one directory down from a non-recursive
 * watch), a key read from a vault at shell start, a `.env` a plugin loads, a
 * credential rotated in the keychain, a value the shell INHERITS, a dotfiles
 * target outside the home tree, and the 11-to-38 ms window between a write and
 * its first event. Four such indirections exist on the operator's own machine
 * today. Without this control the fallback for that class is "quit and reopen
 * Tortie", which is precisely the sentence Phase 269 promised nobody would have
 * to say.
 *
 * It resolves `void` whatever happened, and that is a decision: nothing the
 * probe learned can cross the channel without risking the names-only rule, and
 * nothing a person needs is on the other side. If the probe failed, nothing was
 * cached, so the next create probes anyway and the existing `env-unresolved`
 * notice is the sentence that names the variable. A button that returns nothing
 * can never lie.
 */
export async function refreshEnvNow(): Promise<void> {
  if (!running || deps === null) return;
  const d = deps;
  // THE DROP IS FIRST AND IT IS IMMEDIATE. A create landing during the press
  // must miss rather than read the answer the person has just told us is stale.
  d.dropCache();
  // A shell config file created since the last derive is watched from this
  // moment rather than from the next launch.
  refreshTargets(d);
  const inFlight = warmInFlight;
  if (inFlight !== null) {
    // A WARM STARTED BEFORE THE DROP IS ALREADY DOOMED, because the cache's
    // generation guard refuses to install a probe the drop overtook, so joining
    // it would spin the spinner and leave the slot cold. Wait it out instead,
    // so this Mac never runs two login shells at once, then take a fresh one.
    await inFlight.catch(() => undefined);
    if (!running) return;
  }
  if (debounceTimer !== null) {
    debounceTimer.clear();
    debounceTimer = null;
  }
  // THE FLOOR IS BYPASSED. A person who pressed a button asked for it.
  await warm();
}

/**
 * Stop watching. Called from the one ordered quit disposer, beside
 * `stopLoginsWatch()`, for the reason that line gives: it holds `fs.watch`
 * handles and a timer, and both must be released whatever the rest of teardown
 * does.
 *
 * Synchronous, cannot throw, and calling it twice is calling it once. It
 * refuses every later start, which is what closes Phase 220's late-start shape.
 *
 * THE SPAWNED SHELL IS ENDED BY MACHINERY THAT ALREADY EXISTS.
 * `captureLoginShellEnv` spawns `detached: true` and registers the child with
 * `trackGuardedChild`, and `disposeMainCapabilities` calls
 * `reapGuardedChildren()`, which kills the process group with a grace of ZERO.
 * The promise is not cancellable, so at quit the shell is killed and the
 * promise then settles `probeFailed: true` through its own `close` handler, and
 * installs nothing, because a failed result is never installed and the
 * generation has moved anyway.
 */
export function stopEnvWatch(): void {
  stopped = true;
  running = false;
  if (debounceTimer !== null) {
    debounceTimer.clear();
    debounceTimer = null;
  }
  if (unsubscribeSettings !== null) {
    try {
      unsubscribeSettings();
    } catch {
      // Already gone.
    }
    unsubscribeSettings = null;
  }
  for (const handle of watchers.values()) {
    try {
      handle.close();
    } catch {
      // Already gone.
    }
  }
  watchers.clear();
  targets = [];
  pending = false;
  const d = deps;
  deps = null;
  // DISARMING DROPS THE SLOT, so no answer outlives the thing that was watching
  // it. It is last because everything above it has to have stopped first.
  if (d !== null) d.enableCache(false);
}

/**
 * What is being watched right now, or null when nothing is.
 *
 * A read, for the disposer's own proof and for the gate. It names DIRECTORIES
 * and basenames, which are the person's shell config paths, and never a value.
 */
export function envWatchState(): string[] | null {
  if (!running) return null;
  return targets.map((t) => `${t.dir}/${t.file}`);
}

/**
 * Test hook. Clears everything this module holds, INCLUDING the permanent quit
 * refusal, so a suite can start a second watch in one process. Production never
 * calls it: a quit is the end of the process.
 */
export function resetEnvWatchForTests(): void {
  stopEnvWatch();
  stopped = false;
  lastDeclared = '';
  lastWarmAt = 0;
  warmInFlight = null;
  homeHint = null;
  zdotdirHint = undefined;
}

/** The real directory watcher, over `node:fs`. Non-recursive by omission. */
function defaultWatchDir(
  dir: string,
  onEvent: (file: string | null) => void
): { close(): void } {
  const w = watch(dir, { persistent: false }, (_event, filename) => {
    onEvent(typeof filename === 'string' ? filename : null);
  });
  // A watcher error must not crash the app. The cache stays armed, because the
  // other handles still cover the other files and the refresh covers the rest.
  w.on('error', () => undefined);
  return { close: () => w.close() };
}
