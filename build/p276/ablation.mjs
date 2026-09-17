#!/usr/bin/env node
/**
 * `npm run ablation:p276` — the attack on `conformance:shellenv`.
 *
 * A GREEN GATE IS ONLY EVIDENCE IF IT CAN GO RED. The gate beside this file
 * asserts the SPEC's numbered rules about the login-shell answer Phase 276
 * caches: the coverage key, the projection, the widening, the cap, the
 * in-flight join, the generation stamp, the failure rule, the $SHELL table, the
 * two watch arms, the immediate drop, the debounce, the floor, the settings
 * listener and the lifecycle. This script breaks ONE CLAUSE AT A TIME in the
 * shipping source and proves it reddens THE RULE THAT OWNS IT.
 *
 * An ablation that passes is a hole in the gate. An ablation that reddens only
 * rules OTHER than its own is a finding about the gate rather than about the
 * build, and it is printed as one.
 *
 * ## The two that matter most, said first
 *
 * The phase's blocking finding is a stale key delivered silently, and two
 * clauses are the whole of the defence:
 *
 *   - **R17, the `probeFailed` install guard.** `probeFailed: true` is a
 *     RESOLVED value and not a rejection, so removing one line turns a cache
 *     into a memo that remembers a FAILURE for the life of the process. Every
 *     session for the rest of the run then launches with no values and an
 *     `env-unresolved` notice — Phase 269's silent, provider-shaped failure
 *     re-created by our own optimisation.
 *   - **R10, the generation stamp.** The watcher is a PRODUCTION invalidator, so
 *     a probe started before a rotation can land after it and install the
 *     pre-rotation answer over a slot the watcher has just cleared. That is the
 *     same stale key arriving by the back door, and `resetUserPathCache` next
 *     door has no production caller at all, so the equivalent race there has
 *     never fired and nobody has had to think about this one before.
 *
 * Both have an entry below, and each must redden its own rule.
 *
 * ## It never writes into the working tree
 *
 * `ablation:p268`, `ablation:p273` and `ablation:p274` edit the real files and
 * restore them in a `finally`. This one does not, for `ablation:p275`'s reason
 * rather than a preference: a phase workflow runs three builders over ONE
 * worktree AT THE SAME TIME, and a harness that writes into `src/` — even for
 * the second it takes to run a gate — can lose another builder's in-flight edit,
 * and a crash or a signal in that window leaves a broken tree behind with no
 * owner.
 *
 * So it builds a CLONE: `cp -Rc` (APFS clonefile, about half a second for the
 * whole of `src/` and `build/`) under `/private/tmp/p276-ablation-<pid>`, with
 * `node_modules` symlinked, and runs the gate there with that directory as its
 * cwd. Nothing under the operator's home, nothing under the worktree, and the
 * scratch directory is removed in a `finally` and on a signal.
 *
 * ## It starts nothing
 *
 * About 44 s, measured: thirty-one runs of a 1.1 s gate plus the clone. It is not
 * in the commit battery for that reason — it runs once per phase, beside the
 * gate it attacks.
 *
 * No Electron, no tmux, no ssh, no agent, no token, no network — and no shell.
 * `conformance:shellenv` spawns exactly one thing per lane, its own TypeScript
 * probe, and that probe drives the shipping modules over injected fakes.
 *
 * ## The delta rule, and why it is not "the base must be green"
 *
 * This RECORDS the base's red rules and then requires each ablation to make its
 * own rule NEWLY red. That is strictly stronger than requiring a green base — it
 * proves the ablation CAUSED the reddening rather than inheriting it — and it is
 * what lets the harness run mid-phase, while a sibling builder's half has not
 * landed. A red base is still reported loudly and still fails the run unless
 * `P276_ALLOW_RED_BASE=1` says the operator knows why.
 *
 * Usage:
 *   node build/p276/ablation.mjs
 *   P276_ONLY=R10,R17 node build/p276/ablation.mjs    # one entry while repairing it
 *   P276_ALLOW_RED_BASE=1 node build/p276/ablation.mjs
 */

import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[p276-ablation]';
const say = (line) => process.stdout.write(`${TAG} ${line}\n`);

const CACHE = 'src/main/tmux/resolve.ts';
const WATCH = 'src/main/env/watch.ts';
const FILES = 'src/main/env/shell-files.ts';
const SEED = 'src/main/harness/env-watch-seed.ts';

/**
 * The ablations, one clause each, and each names the rule it must redden.
 *
 * `why` is what the clause is FOR, in one sentence, so a person reading a
 * failure knows what the gate was protecting rather than only which line moved.
 */
const ABLATIONS = [
  // -------------------------------------------------------------------------
  // The cache
  // -------------------------------------------------------------------------
  {
    rule: 'R2',
    name: 'coverage weakened to "the slot is not empty"',
    why:
      'coverage is the CORRECTNESS device and the listener is not. A hit keyed on ' +
      '"there is a slot" answers a caller about a name the probe was never asked ' +
      'about, and reports it as `missing` — which reads to a person as "your shell ' +
      'does not export that", about a variable their shell does export.',
    file: CACHE,
    from: 'if (slot !== null && asked.every((n) => slot.names.has(n))) {',
    to: 'if (slot !== null) {'
  },
  {
    rule: 'R3',
    name: "the projection hands out the slot's own record",
    why:
      '`create-local.ts` does `resolvedEnv = envProbe.values`, which ALIASES the ' +
      'record it was handed. Handing out the slot\'s own would let one create\'s ' +
      'downstream mutate the cache for every later create in the process.',
    file: CACHE,
    from: '    return Promise.resolve(projectEnvValues(slot.result.values, asked, false));',
    to: '    return Promise.resolve(slot.result);'
  },
  {
    rule: 'R4',
    name: "the projection iterates the SLOT's order instead of the caller's",
    why:
      'key insertion order is the ask\'s own row-then-per-agent-then-shared order, ' +
      '`paneEnvFor` spreads it and `createSession` emits one `-e` per key from ' +
      '`Object.entries`. Phase 275 promised no argv order changes for a person who ' +
      'never uses the shared list, and iterating the slot moves it.',
    file: CACHE,
    from: '  for (const name of new Set(names)) {\n    const value = Object.prototype.hasOwnProperty.call(held, name)',
    to:
      '  const ordered = [...new Set(names)].sort();\n' +
      '  for (const name of ordered) {\n' +
      '    const value = Object.prototype.hasOwnProperty.call(held, name)'
  },
  {
    rule: 'R5',
    name: 'a miss NARROWS the slot to the caller`s own names',
    why:
      'widening is what stops two agents with different per-agent lists from ' +
      'evicting each other, and it is free: the probe\'s cost is the shell start ' +
      'and not the printfs (1 name 811-838 ms, 52 names 839-918 ms).',
    file: CACHE,
    from: '    for (const held of slot.names) ask.add(held);',
    to: '    void slot;'
  },
  {
    rule: 'R6',
    name: 'the cap TRUNCATES the union instead of replacing it',
    why:
      'a truncated ask reports a name as `missing` that the shell was never asked ' +
      'about, which is a sentence about the person\'s shell that is simply untrue.',
    file: CACHE,
    from: '    if (ask.size > ENV_SLOT_MAX_NAMES) ask = new Set(asked);',
    to:
      '    if (ask.size > ENV_SLOT_MAX_NAMES) {\n' +
      '      ask = new Set([...ask].slice(0, ENV_SLOT_MAX_NAMES));\n' +
      '    }'
  },
  {
    rule: 'R7',
    name: 'the in-flight pointer assigned AFTER an await instead of synchronously',
    why:
      'two callers on one tick must share one capture. An assignment behind an ' +
      'await leaves a window in which both see an empty pointer, which is two ' +
      'login shells for one restore burst — `getUserPath` fills its slot on the ' +
      'same line that starts the capture for exactly this reason.',
    file: CACHE,
    from: '  envInFlight = { names: askNames, promise: probe };',
    to:
      '  void Promise.resolve().then(() => {\n' +
      '    envInFlight = { names: askNames, promise: probe };\n' +
      '  });'
  },
  {
    rule: 'R8',
    name: 'the in-flight join taken without the coverage test',
    why:
      'joining a probe that does not mention the name you asked for answers you ' +
      'out of somebody else\'s question.',
    file: CACHE,
    from: '  if (inFlight !== null && asked.every((n) => inFlight.names.has(n))) {',
    to: '  if (inFlight !== null) {'
  },
  {
    rule: 'R10',
    name: 'the generation stamp removed, so a probe a drop overtook still installs',
    why:
      'THE BLOCKING FINDING, arriving by the back door. The watcher is a ' +
      'PRODUCTION invalidator, so a probe started before a rotation lands after it ' +
      'and puts the pre-rotation answer back over a slot the watcher has just ' +
      'cleared. That is a stale API key handed to the next session, silently.',
    file: CACHE,
    from: '    if (started !== envGeneration) return result;',
    to: '    void started;'
  },
  {
    rule: 'R17',
    name: 'the probeFailed install guard removed',
    why:
      'THE BLOCKING FINDING, head on. `probeFailed: true` is a RESOLVED value and ' +
      'not a rejection, so without this line the cache remembers a FAILURE for the ' +
      'life of the process and every session for the rest of the app run launches ' +
      'with no values and an `env-unresolved` notice.',
    file: CACHE,
    from: '    if (result.probeFailed) return result;',
    to: '    void result.probeFailed;'
  },
  {
    rule: 'R18',
    name: 'a failed settle leaves the in-flight pointer in place',
    why:
      'clearing it is what makes the next ask a FRESH attempt after the person ' +
      'fixes their machine. Left in place, every later ask joins a promise that ' +
      'has already failed.',
    file: CACHE,
    from: '    if (envInFlight?.promise === probe) envInFlight = null;',
    to: '    void probe;'
  },
  {
    rule: 'R11',
    name: 'the cache armed by default',
    why:
      'THE STRUCTURAL PROPERTY THE TIER 3 VERDICT RESTS ON. A stale key requires ' +
      'the cache to be on, and the cache being on requires the invalidation to be ' +
      'armed. Armed by default, an unrecognised shell, an unwatchable home or a ' +
      'start that lost its race with the quit all leave an answer NOBODY is ' +
      'watching.',
    file: CACHE,
    from: 'let envCacheArmed = false;',
    to: 'let envCacheArmed = true;'
  },
  {
    rule: 'R12',
    name: 'disarming leaves the slot behind',
    why:
      'the quit disposer disarms, and an answer that outlives the thing that was ' +
      'watching it is an answer nothing can invalidate.',
    file: CACHE,
    from: '  if (!on) dropLoginShellEnvCache();',
    to: '  void on;'
  },
  {
    rule: 'R13',
    name: 'a door that hands VALUES out of the cache',
    why:
      'Phase 269\'s no-value rule gets a STRICTER reading here rather than a looser ' +
      'one, because the answer is now kept longer. A names-only read is the only ' +
      'thing that leaves this module.',
    file: CACHE,
    from: 'export function loginShellEnvNamesHeld(): readonly string[] {',
    to:
      'export function loginShellEnvValues(): Record<string, string> {\n' +
      '  return envSlot === null ? {} : envSlot.result.values;\n' +
      '}\n' +
      'export function loginShellEnvNamesHeld(): readonly string[] {'
  },
  {
    rule: 'R14',
    name: "captureLoginShellEnv's own body edited",
    why:
      'this phase WRAPS the probe and never edits it. The pin is what stops a ' +
      'later round "tidying" the nonce marker, the tail buffer, the early settle ' +
      'or the deadline while claiming the phase only added a cache.',
    file: CACHE,
    from: '      const script = usable',
    to: '      const script = [...usable]'
  },
  {
    rule: 'R15',
    name: 'a create path calling the uncached probe again',
    why:
      'every consumer goes through the one door, which is what makes the ' +
      'invalidation reach all of them. A second door is a create that never sees a ' +
      'rotation.',
    file: 'src/main/sessions/create-local.ts',
    from: 'envProbe = await tmux.loginShellEnvFor(spec.envPassthrough);',
    to: 'envProbe = await tmux.captureLoginShellEnv(spec.envPassthrough);'
  },

  // -------------------------------------------------------------------------
  // The $SHELL table
  // -------------------------------------------------------------------------
  {
    rule: 'R22',
    name: '`??` changed to `||` for ZDOTDIR',
    why:
      'setting ZDOTDIR to the EMPTY STRING is still SET: zsh then looks for ' +
      '`/.zshenv` and reads nothing out of $HOME at all. `||` falls back to the ' +
      'home directory and watches four files the running shell never reads.',
    file: FILES,
    from: 'return ZSH_FILES.map((file) => join(input.zdotdir ?? input.home, file));',
    to: 'return ZSH_FILES.map((file) => join(input.zdotdir || input.home, file));'
  },
  {
    rule: 'R21',
    name: 'an unmeasured shell falling back to the zsh row',
    why:
      'an unmeasured row arms a cache whose invalidation nobody has driven. ' +
      '`/bin/tcsh` rejects the probe\'s argument vector outright and in `nu` ' +
      '`$NAME` is not env access, so for those two a cache would be caching a ' +
      'failed probe.',
    file: FILES,
    from: '  return [];\n}',
    to: '  return ZSH_FILES.map((file) => join(input.home, file));\n}'
  },

  // -------------------------------------------------------------------------
  // The watch set and the reaction
  // -------------------------------------------------------------------------
  {
    rule: 'R24',
    name: 'the realpath arm removed, so a dotfiles repo is invisible',
    why:
      'NEITHER ARM IS SUFFICIENT ALONE. Measured: with `~/.zshrc` a symlink into a ' +
      'dotfiles repo, a directory watch on $HOME saw ZERO events across three ' +
      'edits, because nothing in $HOME moves when the repo is edited.',
    file: WATCH,
    from: '    if (real === candidate) continue;\n    add(real);',
    to: '    if (real === candidate) continue;'
  },
  {
    rule: 'R24',
    name: 'the home-tree refusal removed, so a target outside the home is watched',
    why:
      'the phase entry forbids watching a directory outside the person\'s own ' +
      'home, and nothing recursive. A dotfiles repo on /Volumes falls to the ' +
      'deliberate refresh instead.',
    file: WATCH,
    from: '    if (!insideHome(dir, home) && !insideHome(dir, homeReal)) return;',
    to: '    void homeReal;'
  },
  {
    rule: 'R25',
    name: 'the basename filter removed, so any file in the directory fires',
    why:
      'a directory watch is only as narrow as its filter. Without it every write ' +
      'anywhere in the home directory drops the cache and schedules a login shell.',
    file: WATCH,
    from: '          if (file === null || file === target.file) onShellFileMoved();',
    to: '          void file; onShellFileMoved();'
  },
  {
    rule: 'R27',
    name: 'the target set not re-derived after a fire',
    why:
      '`credentials/watch.ts`\'s own lesson: a rename can move the target, and the ' +
      'first build of that watcher never looked again, so a directory that did not ' +
      'exist when the watch started was never watched at all.',
    file: WATCH,
    from: '  zdotdirHint = zdotdir !== undefined && zdotdir.length > 0 ? zdotdir : undefined;\n  refreshTargets(d);',
    to: '  zdotdirHint = zdotdir !== undefined && zdotdir.length > 0 ? zdotdir : undefined;'
  },
  {
    rule: 'R28',
    name: 'the cache armed even when no handle opened',
    why:
      'if NOTHING is watching, an answer held in memory can never be invalidated. ' +
      'Every way this phase can fail to build its watcher must land on today\'s ' +
      'cost rather than on an uninvalidatable cache.',
    file: WATCH,
    from: '  if (watchers.size === 0) {',
    to: '  if (false) {'
  },
  {
    rule: 'R29',
    name: 'the drop debounced along with the re-warm',
    why:
      'THE SINGLE MOST IMPORTANT DIFFERENCE FROM THE PRECEDENT. Debouncing the ' +
      'drop opens a 400 ms window in which a create reads a value we already know ' +
      'is stale, and it buys nothing, because the drop is one assignment and the ' +
      're-warm is the expensive half.',
    file: WATCH,
    from: '  deps.dropCache();\n  scheduleWarm();',
    to: '  const d = deps;\n  scheduleWarm();\n  void d;'
  },
  {
    rule: 'R31',
    name: 'the five second floor removed',
    why:
      'a `chezmoi apply`, a `stow` or a `git checkout` in a dotfiles repo can move ' +
      'all four files at once, and without a floor that is four login shells in a ' +
      'row on a machine that is already busy.',
    file: WATCH,
    from: '  const wait = Math.max(ENV_WATCH_DEBOUNCE_MS, ENV_WARM_MIN_INTERVAL_MS - since);',
    to: '  void since;\n  const wait = ENV_WATCH_DEBOUNCE_MS;'
  },
  {
    rule: 'R33',
    name: 'the settings listener made unconditional',
    why:
      '`onSettingsUpdated` fires for EVERY settings write. Unconditional, moving a ' +
      'slider in Settings spawns a login shell — and on the operator\'s machine ' +
      'that is a full second, per slider move.',
    file: WATCH,
    from: '    if (next === lastDeclared) return;',
    to: '    void lastDeclared;'
  },
  {
    rule: 'R37',
    name: 'an empty declared cover still probes',
    why:
      'a person who has configured no shell variable must not start paying at boot ' +
      'for a login shell they never paid for before. It is a rule rather than an ' +
      'optimisation.',
    file: WATCH,
    from: '  if (cover.length === 0) return;',
    to: '  void cover.length;'
  },
  {
    rule: 'R38',
    name: 'the warm-up drops HOME and ZDOTDIR from its ask',
    why:
      'they are how the watch set stops being a GUESS. ZDOTDIR is usually set ' +
      'inside `~/.zshenv`, so it is not in Electron\'s process.env at all and the ' +
      'shell\'s own answer is the only way to learn it — and it moves all four ' +
      'candidate files off $HOME entirely.',
    file: WATCH,
    from: "  const result = await d.capture([...cover, 'HOME', 'ZDOTDIR']);",
    to: '  const result = await d.capture([...cover]);'
  },
  {
    rule: 'R40',
    name: 'the late-landing refusal removed, both halves of it',
    why:
      'PHASE 220\'s SHAPE. A quit landing inside the fire-and-forget chain ran the ' +
      'disposer against a null watcher, and the chain then INSTALLED HANDLES after ' +
      'the ordered disposer had finished with the domain. Reopened here, the ' +
      'warm-up\'s probe settles after the quit and opens a fresh set of fs.watch ' +
      'handles nothing will ever close.\n' +
      '\n' +
      'IT IS ONE CLAUSE WRITTEN TWICE, AND THAT IS WHY THIS ENTRY CARRIES TWO ' +
      'EDITS. `probeAndRederive` asks `if (!running) return;` on the far side of ' +
      'its await and `refreshTargets` asks `if (stopped) return;` one level down, ' +
      'and each catches the same call. Measured here: removing EITHER one alone ' +
      'leaves this gate green, because the other still refuses. That is defence in ' +
      'depth rather than duplication, and it is recorded rather than hidden — a ' +
      'later round deleting "the redundant one" has removed half a refusal, and ' +
      'the half that is left is the only reason nothing breaks.',
    edits: [
      {
        file: WATCH,
        from: "  const result = await d.capture([...cover, 'HOME', 'ZDOTDIR']);\n  if (!running) return;",
        to: "  const result = await d.capture([...cover, 'HOME', 'ZDOTDIR']);"
      },
      {
        file: WATCH,
        from: 'function refreshTargets(d: Resolved): void {\n  if (stopped) return;',
        to: 'function refreshTargets(d: Resolved): void {'
      }
    ]
  },
  {
    rule: 'R41',
    name: 'GMUX_NO_ENV_CACHE ignored',
    why:
      'the knob is what makes the parent\'s behaviour reachable at HEAD, which is ' +
      'what the before-and-after measurement and the boot-path reading both rest ' +
      'on.',
    file: WATCH,
    from: "  if (d.env[OFF_ENV] === '1') return;",
    to: '  void OFF_ENV;'
  },
  {
    rule: 'R43',
    name: 'the refresh made to respect the floor',
    why:
      'a person who pressed a button asked for it. A refresh that waits out four ' +
      'more seconds of a floor spins a spinner and delivers nothing, and the ' +
      'button exists precisely for the class the watcher provably cannot see.',
    file: WATCH,
    from: '  // THE FLOOR IS BYPASSED. A person who pressed a button asked for it.\n  await warm();',
    to: '  scheduleWarm();'
  },

  // -------------------------------------------------------------------------
  // The harness seed. THE INTEGRATOR'S RULE, and the reason it exists is a
  // MEASUREMENT rather than an argument: the first run of probe:p276 read one
  // login shell and about 960 ms for every one of eighteen creates, because a
  // GMUX_SHOT launch returns above the boot chain and nothing armed the cache.
  // The seed closes that, and these two clauses are what stop the closing being
  // widened into a door a stray environment variable can open.
  // -------------------------------------------------------------------------
  {
    rule: 'R61',
    name: 'the seed arms the watch without deciding its refusal first',
    why:
      'the seed opens fs.watch handles on the person\'s home and starts a login ' +
      'shell. A GMUX_ENV_WATCH_SEED left in a shell profile must never reach a ' +
      'real launch, and a harness launch on a REAL profile must be refused even ' +
      'with GMUX_SHOT set. A refusal decided AFTER the handles open is a launch ' +
      'that was armed and then complained about.',
    file: SEED,
    from: '  if (refusal !== null) throw new Error(refusal);',
    to: '  void refusal;'
  },
  {
    rule: 'R61',
    name: 'the seed arms the cache directly instead of through the shipped pair',
    why:
      'a seed that arms the cache itself is a second implementation of the thing ' +
      'under test: it would arm with no watcher behind it, which is the one state ' +
      'section 1.6 exists to make unreachable, and every probe reading after it ' +
      'would be about the seed rather than about the product.',
    file: SEED,
    from: '  startEnvWatch();',
    to: '  enableLoginShellEnvCache(true);'
  }
];

// ---------------------------------------------------------------------------
// The clone, and the gate run inside it
// ---------------------------------------------------------------------------

/** The scratch root, under /private/tmp and never under a home directory. */
const scratch = mkdtempSync(join(tmpdir(), 'p276-ablation-'));

/** Everything the gate needs, cloned; node_modules is a symlink, never a copy. */
function buildClone() {
  const copy = (name) => {
    const r = spawnSync('cp', ['-Rc', join(REPO, name), join(scratch, name)], {
      encoding: 'utf8'
    });
    if (r.status !== 0) throw new Error(`cp -Rc ${name} failed: ${r.stderr}`);
  };
  copy('src');
  copy('build');
  // EVERY tsconfig, not only the one the probe names. tsx resolves the project
  // references out of tsconfig.json, so a clone holding the root one alone dies
  // on a missing tsconfig.shared.json and every lane reads red for a reason no
  // ablation caused. That cost `ablation:p275` a debugging round; the glob is
  // cheap and cannot miss a new one.
  for (const name of [
    'package.json',
    ...readdirSync(REPO).filter((f) => /^tsconfig(\.[a-z]+)?\.json$/.test(f))
  ]) {
    writeFileSync(join(scratch, name), readFileSync(join(REPO, name)));
  }
  symlinkSync(join(REPO, 'node_modules'), join(scratch, 'node_modules'));
}

/** Run `conformance:shellenv` in the clone. Answers its exit code and red rules. */
function runGate() {
  const r = spawnSync(process.execPath, [join(scratch, 'build/conformance-shellenv.mjs')], {
    cwd: scratch,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const red = [...new Set([...text.matchAll(/\[p276 (R[0-9.]+)\]/g)].map((m) => m[1]))];
  return { code: r.status ?? 1, red, text };
}

/** Put one file in the clone back the way the repository has it. */
function restore(rel) {
  writeFileSync(join(scratch, rel), readFileSync(join(REPO, rel)));
}

/**
 * Apply one exact replacement inside the clone, refusing if it is not there.
 *
 * THE REPLACEMENT IS A FUNCTION rather than a string, and that is not style.
 * `String.prototype.replace` reads `$&`, `$'`, `` $` `` and `$1` INSIDE the
 * replacement text, so an ablation whose new text carries one of those silently
 * loses it and the gate dies with a syntax error instead of the failure it was
 * supposed to produce. A function replacer takes the text literally and cannot.
 */
function ablate(rel, from, to) {
  const path = join(scratch, rel);
  const text = readFileSync(path, 'utf8');
  if (!text.includes(from)) return false;
  writeFileSync(path, text.replace(from, () => to), 'utf8');
  return true;
}

// A killed run must leave nothing behind either.
let cleaned = false;
const clean = () => {
  if (cleaned) return;
  cleaned = true;
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* the scratch directory is under /private/tmp; a failure here is not fatal */
  }
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    clean();
    process.exit(130);
  });
}

const problems = [];
let ran = 0;

try {
  buildClone();
  say(`clone at ${scratch}, node_modules symlinked, nothing under a home touched`);

  const base = runGate();
  const baseRed = new Set(base.red);
  if (base.code === 0) {
    say('base: the gate is green, 0 rules red');
  } else {
    say(
      `base: THE GATE IS ALREADY RED — ${
        baseRed.size === 0
          ? 'and on no numbered rule, so the gate itself is failing to run'
          : `rules red: ${[...baseRed].join(', ')}`
      }`
    );
    for (const line of base.text.split('\n').filter((l) => l.includes('  - '))) {
      say(`  base failure: ${line.trim().slice(0, 240)}`);
    }
    if (process.env['P276_ALLOW_RED_BASE'] !== '1') {
      problems.push(
        'the gate was red before any ablation ran. Every reading below is still a ' +
          'DELTA against that base and is still meaningful, but a red base means a ' +
          'rule is failing for a reason this script did not cause. Re-run with ' +
          'P276_ALLOW_RED_BASE=1 once you know why.'
      );
    }
  }

  const only = (process.env['P276_ONLY'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const edit of ABLATIONS) {
    if (only.length > 0 && !only.includes(edit.rule)) continue;
    // MOST ENTRIES ARE ONE EDIT. An entry carrying `edits` is still ONE CLAUSE:
    // a refusal the shipping code writes twice, where removing either half
    // alone leaves the other refusing and the gate green. See R40.
    const edits = edit.edits ?? [{ file: edit.file, from: edit.from, to: edit.to }];
    const touched = [...new Set(edits.map((e) => e.file))];
    const missed = edits.filter((e) => !ablate(e.file, e.from, e.to));
    if (missed.length > 0) {
      for (const m of missed) {
        problems.push(
          `${edit.rule} "${edit.name}": the shape to ablate is not in ${m.file}. ` +
            'Either the clause moved, in which case this entry is updated in the ' +
            'same commit, or it is gone, in which case the rule it proves is ' +
            `unproven. It looked for: ${JSON.stringify(m.from).slice(0, 200)}`
        );
      }
      for (const f of touched) restore(f);
      continue;
    }
    ran += 1;
    const out = runGate();
    const newlyRed = out.red.filter((r) => !baseRed.has(r));
    const ownRed = newlyRed.includes(edit.rule);
    say(
      `${edit.rule} ${edit.name}: exit ${String(out.code)}, newly red ${
        newlyRed.join(', ') || 'nothing'
      }`
    );
    if (out.code === 0) {
      problems.push(
        `${edit.rule} "${edit.name}": the gate stayed GREEN. ${edit.why} Nothing in ` +
          'this gate notices, so that rule is decoration.'
      );
    } else if (!ownRed) {
      // A gate that CRASHED prints no failure line at all, so fall back to the
      // tail of whatever it did print. That distinction is the difference
      // between "the rule is decoration" and "the ablation does not parse".
      const named = out.text
        .split('\n')
        .filter((l) => l.trim().startsWith('- '))
        .slice(0, 6)
        .map((l) => l.trim().slice(0, 260));
      const tail =
        named.length > 0
          ? named
          : out.text
              .split('\n')
              .filter((l) => l.trim().length > 0)
              .slice(-6)
              .map((l) => l.trim().slice(0, 260));
      problems.push(
        `${edit.rule} "${edit.name}": the gate went red but ${edit.rule} did not. ` +
          `Red instead: ${newlyRed.join(', ') || 'nothing numbered'}. A rule that is ` +
          'only caught by its neighbours is not asserted by the rule that claims ' +
          `it. What the gate said: ${tail.join(' // ') || '(no failure line)'}`
      );
    }
    for (const f of touched) restore(f);
  }

  const after = runGate();
  if (after.code !== base.code) {
    problems.push(
      `after every file was restored the gate exited ${String(after.code)} where the ` +
        `base exited ${String(base.code)}, so a restore did not land.`
    );
  } else {
    say(`restored: the gate is back where it started (exit ${String(after.code)})`);
  }
} catch (err) {
  problems.push(`the harness threw: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  clean();
}

process.stdout.write('\n');
if (problems.length > 0) {
  process.stdout.write(`${TAG} FAIL, ${String(problems.length)}:\n`);
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  process.exit(1);
}
process.stdout.write(
  `${TAG} PASS. ${String(ran)} ablations, one clause each, and every one reddened ` +
    'THE RULE THAT OWNS IT — the coverage key, the projection, the widening, the ' +
    'cap, the in-flight join, the generation stamp a drop must beat, the ' +
    'probeFailed install guard, the ZDOTDIR operator, both watch arms, the ' +
    'immediate drop, the floor, the settings comparison and the lifecycle. ' +
    'Measured as a DELTA against the base, so an inherited failure cannot be ' +
    'mistaken for a caused one. No Electron, no tmux, no shell, no agent, no ' +
    'token, and nothing written outside the scratch clone, which is gone.\n'
);
