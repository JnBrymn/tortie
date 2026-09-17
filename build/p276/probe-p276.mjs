#!/usr/bin/env node
/**
 * probe-p276.mjs. THE PHASE 276 APP RUN — one Electron, every claim.
 *
 * ## What it has to prove, and why reading the code is not enough
 *
 * `conformance:shellenv` drives the cache and the watcher over injected fakes,
 * so it proves the RULES. It cannot prove the two things the phase is actually
 * for, because both are facts about a running app on a real disk:
 *
 *   1. **THE SECOND IS GONE.** A create with shell variables configured used to
 *      spawn `zsh -lic` and wait about a second for it. It must now spawn ONE
 *      login shell per app launch, not one per session — and the count is read
 *      from OUTSIDE the app, off a log the shell wrapper itself appends to.
 *   2. **A ROTATED KEY STILL REACHES THE NEXT SESSION, WITH NOTHING TO
 *      RESTART.** That is Phase 269's quotable promise and it is what a cache
 *      breaks silently. Eleven save shapes are driven the way a person's editor
 *      really writes a file, and the pane reports which GENERATION of the
 *      sentinel it received — never the value.
 *
 * A stale key delivered silently is the blocking finding of this phase.
 *
 * ## The ruler, and why it is honest
 *
 * `$SHELL` points at a WRAPPER this probe writes, named `zsh` so the watch set
 * derives the zsh row the way it would on the operator's machine. Every time
 * anything starts a login shell, the wrapper appends one line to a log and then
 * `exec`s the real `/bin/zsh` with the same argv. So:
 *
 *   - the spawn count is measured OUTSIDE the app, by a different method from
 *     anything the app instruments, which is what §10's second independent
 *     method asks for;
 *   - a warm create proving itself is "the log did not grow", which is a
 *     stronger statement than "it was fast";
 *   - and "an unrelated settings write starts no shell" is a count rather than
 *     an assurance.
 *
 * The scratch `~/.zshrc` sleeps 900 ms before it exports anything. That is the
 * CALIBRATED SLOW HOME: on the operator's machine oh-my-zsh, nvm and rbenv init
 * are what make `zsh -lic` 970 to 1160 ms while `zsh -lc` is 10 ms, and a probe
 * against a trivial rc would measure a shell start that nobody has.
 *
 * ## NO VALUE, ANYWHERE
 *
 * Every variable name is INVENTED here, in the shape a provider key has and
 * matching nothing real. Every value is `p276-gen-<n>`, a generation counter
 * with a prefix. The stand-in agents never write a value: they write a NAME and
 * one of `absent`, `gen-<n>` or `other`, which is Phase 275's probe shape. The
 * run then greps the whole profile, the manifest, the logs and settings.json
 * for every sentinel and must find none.
 *
 * ## The two arms
 *
 *   npm run probe:p276                 the one app run: the cold create, six
 *                                      warm creates, a second agent, the whole
 *                                      save-shape table, the refresh, a create
 *                                      after it, and a FOURTH name added in
 *                                      Settings while the app is running —
 *                                      which is the backlog entry's own "add a
 *                                      second key in Settings, start a session,
 *                                      and get the new one".
 *   P276_BOOT_ONLY=1 npm run probe:p276   the boot reading: six launches with
 *                                      the feature on and six with
 *                                      GMUX_NO_ENV_CACHE=1, reading
 *                                      `window-shown` and `path-ready` through
 *                                      the shipped diagnostics channel. IF
 *                                      `window-shown` MOVES, THE WARM-UP IS ON
 *                                      THE BOOT PATH AND THE DESIGN IS WRONG.
 *                                      `path-ready` is the control that proves
 *                                      the ruler works, because it is the
 *                                      milestone that SHOULD move.
 *
 * `P276_PARENT_CHECKOUT=<dir>` points either arm at a build of the parent
 * commit for the before-and-after. The expectations never flip, so the findings
 * ARE the parent reading. One Electron at a time, never two, which is Phase
 * 258's rule.
 *
 * ## Safety
 *
 *   - ONE Electron at a time, through build/electron-run.mjs, which ends the
 *     tree it started in a `finally` block.
 *   - Its own tmux socket, ended by the same helper. `-L gmux` is named once,
 *     read only, for the before/after census of the operator's own server.
 *   - Everything it writes is under P276_ROOT (default /private/tmp/p276-app),
 *     refused unless that path is under /private/tmp or /tmp. NOTHING under a
 *     home directory is written, renamed or removed — the `~/.zshrc` this run
 *     rotates eleven ways is the scratch HOME's, never the operator's.
 *   - It launches no agent and spends no token: the two "agents" are four-line
 *     shell scripts this probe writes.
 *
 * Usage:
 *   npm run build && node build/p276/probe-p276.mjs
 */

import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withElectron } from '../electron-run.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[p276]';
const t0 = Date.now();
const say = (line) =>
  console.log(`${TAG} ${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`);
const refuse = (why) => {
  console.error(`${TAG} REFUSED. ${why}`);
  process.exit(2);
};

const BOOT_ONLY = process.env['P276_BOOT_ONLY'] === '1';
const parentCheckout = (process.env['P276_PARENT_CHECKOUT'] ?? '').trim();
const appRoot = parentCheckout === '' ? repoRoot : resolve(parentCheckout);
if (!existsSync(join(appRoot, 'out', 'main', 'index.js'))) {
  refuse(`${join(appRoot, 'out/main/index.js')} is missing. npm run build there first.`);
}

const rawRoot = process.env['P276_ROOT'] ?? '/private/tmp/p276-app';
if (!rawRoot.startsWith('/private/tmp/') && !rawRoot.startsWith('/tmp/')) {
  refuse('P276_ROOT must live under /private/tmp.');
}
rmSync(rawRoot, { recursive: true, force: true });
for (const d of [
  'home',
  'home/.zsh',
  'home/dotfiles',
  'bin',
  'shell',
  'profile',
  'out',
  'reports',
  'cues',
  'project'
]) {
  mkdirSync(join(rawRoot, d), { recursive: true });
}
const root = realpathSync(rawRoot);
const scratchHome = join(root, 'home');
const binDir = join(root, 'bin');
const shellDir = join(root, 'shell');
const userData = join(root, 'profile');
const outDir = join(root, 'out');
const reportsDir = join(root, 'reports');
const cuesDir = join(root, 'cues');
const projectDir = join(root, 'project');
const spawnLog = join(root, 'login-shells.log');
const paneLog = join(reportsDir, 'panes.log');
const rcPath = join(scratchHome, '.zshrc');
const zprofilePath = join(scratchHome, '.zprofile');
const sourcedPath = join(scratchHome, '.zsh', 'keys.zsh');
const dotfilesRc = join(scratchHome, 'dotfiles', 'zshrc');
const rcLink = join(scratchHome, 'rc-link');

// ---------------------------------------------------------------------------
// Invented names and a generation counter. Never a real key, never a value.
// ---------------------------------------------------------------------------

/** Exported by `~/.zshrc`. The name most of the save-shape table rotates. */
const ALPHA = 'ACMEAI_API_KEY';
/** Exported by `~/.zprofile`, which does not exist until row 6 creates it. */
const BETA = 'NOVALM_API_KEY';
/** Exported by a file the rc SOURCES, which the watch provably cannot see. */
const SOURCED = 'ZEPHYRAI_API_KEY';
/**
 * EXPORTED BY THE rc FROM THE FIRST WRITE AND NEVER ROTATED, and not on the
 * shared list until the last row puts it there.
 *
 * This is the backlog entry's own sentence — *"add a second key in Settings,
 * start a session, and get the new one"* — and it is the case a person will
 * actually hit. It needs a name whose VALUE never moves, because the thing
 * under test is the cache being asked about a name it does not hold rather
 * than a file event: the slot is warm and covers the other three, the ask now
 * mentions a fourth, coverage says MISS by construction, and the create gets
 * the new one. A row that also edited a file could not tell the two mechanisms
 * apart.
 */
const GAMMA = 'ORIONML_API_KEY';
/** The generation GAMMA is written at, once, and never rotated. */
const GAMMA_GEN = 13;
/** Every name the stand-in agents report on, GAMMA included. */
const NAMES = [ALPHA, BETA, SOURCED, GAMMA];
/**
 * The names the driver puts on the shared list at the START — and GAMMA is
 * deliberately NOT one of them.
 *
 * THE DISTINCTION IS THE WHOLE add-name ROW. The stand-ins must report on all
 * four so the row can read the fourth back, but the fourth must not be on the
 * list until the row puts it there; the first draft of this used one list for
 * both and the row found the name already ticked, the confirm never opened,
 * and the row proved nothing while still reading the right value.
 */
const INITIAL_NAMES = [ALPHA, BETA, SOURCED];

/** Every generation the stand-ins can name, so a verdict is a NUMBER. */
const GENERATIONS = 24;
const sentinel = (n) => `p276-gen-${String(n)}`;

let alphaGen = 1;
let betaGen = 0;
let sourcedGen = 1;

/** Write the scratch `~/.zshrc` at the current generations. */
function writeRc(target = rcPath) {
  writeFileSync(
    target,
    [
      '# Phase 276 scratch login shell. INTERACTIVE ONLY, which is the point:',
      '# .zshrc is read by `zsh -lic` and by nothing else, and a provider key',
      '# exported here is the whole of issue 20.',
      `export PATH="${binDir}:$PATH"`,
      '',
      '# THE CALIBRATED SLOW HOME. On the operator\'s machine oh-my-zsh, nvm and',
      '# rbenv init are what make `zsh -lic` 970 to 1160 ms while `zsh -lc` is',
      '# 10 ms. A probe against a trivial rc would measure a shell nobody has.',
      'sleep 0.9',
      '',
      `export ${ALPHA}=${sentinel(alphaGen)}`,
      '',
      '# The fourth name. Exported from the first write and never rotated: the',
      '# last row of the table puts it on the shared list in Settings while the',
      '# app is running, and the next session must get it out of a slot that',
      '# does not mention it.',
      `export ${GAMMA}=${sentinel(GAMMA_GEN)}`,
      '',
      '# A file the rc SOURCES. Nothing in $HOME moves when it is edited and it',
      '# is one directory down from a non-recursive watch, so the watcher',
      '# provably cannot see it. That is what the Re-read shell button is for.',
      `[ -f ${JSON.stringify(sourcedPath)} ] && . ${JSON.stringify(sourcedPath)}`,
      ''
    ].join('\n'),
    'utf8'
  );
}

function writeSourced() {
  writeFileSync(sourcedPath, `export ${SOURCED}=${sentinel(sourcedGen)}\n`, 'utf8');
}

writeRc();
writeSourced();

// ---------------------------------------------------------------------------
// The counting shell wrapper. THE RULER, and it is outside the app.
// ---------------------------------------------------------------------------

const shellWrapper = join(shellDir, 'zsh');
writeFileSync(
  shellWrapper,
  [
    '#!/bin/sh',
    '# Phase 276. One line per login shell anybody starts, then the real zsh',
    '# with the same argv. This is how the run counts shells from OUTSIDE the',
    '# app, by a different method from anything the app instruments.',
    '#',
    '# It is named `zsh` on purpose: src/main/env/shell-files.ts derives the',
    '# watch set from basename($SHELL), so a wrapper called anything else would',
    '# arm nothing and the whole run would measure the disarmed path.',
    `printf '%s %s\\n' "$(date +%s)" "$*" >> ${JSON.stringify(spawnLog)}`,
    'exec /bin/zsh "$@"',
    ''
  ].join('\n'),
  'utf8'
);
chmodSync(shellWrapper, 0o755);
writeFileSync(spawnLog, '', 'utf8');
writeFileSync(paneLog, '', 'utf8');

/**
 * How many LOGIN shells have been started since the run began.
 *
 * IT COUNTS THE `-lic` LINES AND NOT EVERY LINE, and the difference is the
 * whole honesty of the ruler. The wrapper is `$SHELL`, so anything at all that
 * reaches for the person's shell goes through it — a `-c` invocation by some
 * other part of the app would land in the same log and would read as a login
 * shell this phase failed to save. `captureLoginShellPath`, `captureLoginShellEnv`
 * and `captureLoginShellEnvNames` are the three spawns in `src/main/tmux/resolve.ts`
 * and every one of them passes `['-lic', script]`, so `-lic` is exactly the
 * population this phase is about. tmux is handed the pane's argv as a vector
 * (`new-session ... -- argv`) and never a shell string, so a pane starts no
 * shell of its own and cannot inflate this count either.
 */
function shellsStarted() {
  try {
    return readFileSync(spawnLog, 'utf8')
      .split('\n')
      .filter((l) => l.includes('-lic')).length;
  } catch {
    return 0;
  }
}

/** Every line the wrapper wrote, login or not. Reported, never asserted. */
function shellLinesAll() {
  try {
    return readFileSync(spawnLog, 'utf8').split('\n').filter((l) => l.trim() !== '')
      .length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Two stand-in agents that report on THEIR OWN environment, never a value
// ---------------------------------------------------------------------------

const AGENTS = ['claude', 'codex'];
/**
 * MEASURED RATHER THAN GUESSED, and probe:p275 paid for this line. `claude`'s
 * registry row probes with `-v` and requires the identity substring
 * `(Claude Code)`; a bare version string made the claude card draw with no
 * shell-variable group at all.
 */
const VERSION_LINE = {
  claude: '0.0.0-p276 (Claude Code)',
  codex: 'codex-cli 0.0.0-p276'
};

for (const agent of AGENTS) {
  const cases = [];
  for (let g = 1; g <= GENERATIONS; g += 1) {
    cases.push(`    ${sentinel(g)}) echo "$n gen-${String(g)}" >> "$out" ;;`);
  }
  const script = [
    '#!/bin/sh',
    '# Phase 276 stand-in. Two jobs and nothing else.',
    '#',
    '# --version answers the agent scan, so a card draws for this binary.',
    '# Anything else is a SESSION LAUNCH: the process reads its OWN environ and',
    '# writes down which GENERATION of the sentinel it received. NO VALUE IS',
    '# EVER WRITTEN — the verdict file holds a name and one of `absent`,',
    '# `gen-<n>` or `other`.',
    'case "$1" in',
    `  --version|-v|-V) echo ${JSON.stringify(VERSION_LINE[agent])}; exit 0 ;;`,
    'esac',
    `id="\${GMUX_SESSION_ID:-nostamp}"`,
    `out="${reportsDir}/$id.verdict"`,
    ': > "$out"',
    `for n in ${NAMES.join(' ')}; do`,
    '  eval "v=\\$$n"',
    '  case "$v" in',
    '    "") echo "$n absent" >> "$out" ;;',
    ...cases,
    '    *) echo "$n other" >> "$out" ;;',
    '  esac',
    'done',
    '# THE PROGRESS SIGNAL. One line per launched pane, appended to one file, so',
    '# the node side knows how far the renderer driver has got without the',
    '# driver needing to write anything at all.',
    `printf '%s\\n' "$id" >> ${JSON.stringify(paneLog)}`,
    'exec sleep 900',
    ''
  ].join('\n');
  const p = join(binDir, agent);
  writeFileSync(p, script, 'utf8');
  chmodSync(p, 0o755);
}

/** How many panes have launched so far. */
function panesLaunched() {
  try {
    return readFileSync(paneLog, 'utf8').split('\n').filter((l) => l.trim() !== '')
      .length;
  } catch {
    return 0;
  }
}

/** The verdicts of the Nth pane (1-based), by name. */
function paneVerdict(n) {
  const ids = readFileSync(paneLog, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const id = ids[n - 1];
  if (id === undefined) return null;
  const file = join(reportsDir, `${id}.verdict`);
  if (!existsSync(file)) return null;
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const parts = line.trim().split(' ');
    if (parts.length >= 2) out[parts[0]] = parts.slice(1).join(' ');
  }
  return out;
}

// ---------------------------------------------------------------------------
// A hermetic PATH, so the reading does not depend on what is installed here
// ---------------------------------------------------------------------------

function toolDir(name) {
  const r = spawnSync('command', ['-v', name], { encoding: 'utf8', shell: '/bin/sh' });
  const p = (r.stdout ?? '').trim();
  return p === '' ? null : dirname(p);
}
const hermeticPath = [
  binDir,
  ...new Set([toolDir('tmux'), toolDir('git')].filter((d) => d !== null)),
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin'
].join(':');

spawnSync('git', ['init', '-q', projectDir], { encoding: 'utf8' });
writeFileSync(join(projectDir, 'README.md'), '# p276 scratch project\n', 'utf8');

// ---------------------------------------------------------------------------
// The operator's own server, listed and never written. Named once.
// ---------------------------------------------------------------------------

function operatorSessionCount() {
  const out = spawnSync('tmux', ['-L', 'gmux', 'list-sessions'], { encoding: 'utf8' });
  if (out.status !== 0) return -1;
  return out.stdout.split('\n').filter((l) => l.trim() !== '').length;
}

/** The CLAUDE.md census. The bare `Tortie` line is the main process. */
function leftovers() {
  const ps = spawnSync(
    '/bin/sh',
    [
      '-c',
      'ps -Ao pid,ppid,rss,comm | grep -E "[E]lectron|Tortie$|chrome_crashpad" | ' +
        'grep -v defunct'
    ],
    { encoding: 'utf8' }
  );
  const lines = (ps.stdout ?? '').split('\n').filter((l) => l.trim() !== '');
  const mine = lines.filter((line) => {
    const pid = line.trim().split(/\s+/)[0] ?? '';
    const cmd = spawnSync('/bin/sh', ['-c', `ps -p ${pid} -o command=`], {
      encoding: 'utf8'
    });
    return (cmd.stdout ?? '').includes(userData);
  });
  const sleeps = spawnSync(
    '/bin/sh',
    ['-c', 'ps -Ao pid,command | grep -c "[s]leep 900" || true'],
    { encoding: 'utf8' }
  );
  return {
    lines: lines.length,
    mine: mine.length,
    sleep900: Number((sleeps.stdout ?? '0').trim())
  };
}

// ---------------------------------------------------------------------------
// THE SAVE-SHAPE TABLE. Every row is how a real editor writes a file.
// ---------------------------------------------------------------------------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until `fn()` is truthy, or give up. Answers what it saw, or null. */
async function until(fn, ms, step = 100) {
  const stop = Date.now() + ms;
  for (;;) {
    const got = fn();
    if (got) return got;
    if (Date.now() > stop) return null;
    await wait(step);
  }
}

/**
 * The rows, in the order the run drives them. `edit` runs on the node side and
 * returns what the pane created AFTER it must report.
 *
 * `expect` is a function of the generations at the time the row runs, so a row
 * that must NOT invalidate names the OLD generation rather than a literal.
 */
const ROWS = [
  {
    id: 'append',
    what: 'append to ~/.zshrc',
    must: 'invalidate',
    edit: () => {
      alphaGen += 1;
      appendFileSync(rcPath, `export ${ALPHA}=${sentinel(alphaGen)}\n`, 'utf8');
    },
    expect: () => ({ [ALPHA]: `gen-${String(alphaGen)}` })
  },
  {
    id: 'truncate',
    what: 'truncate and rewrite in place',
    must: 'invalidate',
    edit: () => {
      alphaGen += 1;
      writeRc();
    },
    expect: () => ({ [ALPHA]: `gen-${String(alphaGen)}` })
  },
  {
    id: 'rename-over',
    what: 'write a temp file and rename it over, which is what most editors do',
    must: 'invalidate',
    edit: () => {
      alphaGen += 1;
      const tmp = `${rcPath}.p276.tmp`;
      writeRc(tmp);
      // THE SHAPE `fs.watch` ON A FILE MOST OFTEN MISSES. Measured: after a
      // rename-over, a file watch reported 1 event and then 0 and 0 on the next
      // two edits, while the directory watch reported 2, 1 and 1.
      renameSync(tmp, rcPath);
    },
    expect: () => ({ [ALPHA]: `gen-${String(alphaGen)}` })
  },
  {
    id: 'unlink-recreate',
    what: 'unlink and recreate',
    must: 'invalidate',
    edit: () => {
      alphaGen += 1;
      unlinkSync(rcPath);
      writeRc();
    },
    expect: () => ({ [ALPHA]: `gen-${String(alphaGen)}` })
  },
  {
    id: 'first-create',
    what: 'create ~/.zprofile for the FIRST time',
    must: 'invalidate',
    edit: () => {
      betaGen = alphaGen + 1;
      // A FILE THAT DID NOT EXIST WHEN THE WATCH WAS SET. `fs.watch` on a path
      // that does not exist throws ENOENT, which is why the literal arm watches
      // the DIRECTORY. Creating ~/.zshrc for the first time is exactly when a
      // key first appears.
      writeFileSync(zprofilePath, `export ${BETA}=${sentinel(betaGen)}\n`, 'utf8');
    },
    expect: () => ({ [BETA]: `gen-${String(betaGen)}` })
  },
  {
    id: 'through-symlink',
    what: 'edit through a SYMLINKED path',
    must: 'invalidate',
    edit: () => {
      alphaGen += 1;
      if (!existsSync(rcLink)) symlinkSync(rcPath, rcLink);
      // The write lands on the real inode, so the directory watch on $HOME sees
      // the rc move even though the path used to write it was an alias.
      writeRc(rcLink);
    },
    expect: () => ({ [ALPHA]: `gen-${String(alphaGen)}` })
  },
  {
    id: 'dotfiles-repo',
    what: 'edit the dotfiles-repo TARGET of a symlinked ~/.zshrc',
    must: 'invalidate',
    edit: () => {
      alphaGen += 1;
      // The whole reason the realpath arm exists. Measured: with ~/.zshrc a
      // symlink into a dotfiles repo, the $HOME directory watch saw ZERO events
      // across three edits, because nothing in $HOME moves when the repo is
      // edited.
      writeRc(dotfilesRc);
      if (existsSync(rcPath) && !statSync(rcPath).isSymbolicLink()) unlinkSync(rcPath);
      if (!existsSync(rcPath)) symlinkSync(dotfilesRc, rcPath);
      alphaGen += 1;
      writeRc(dotfilesRc);
    },
    expect: () => ({ [ALPHA]: `gen-${String(alphaGen)}` }),
    /** The symlink is installed by this row, so it needs one settle first. */
    settleMs: 1500
  },
  {
    id: 'touch',
    what: 'touch with no content change',
    must: 'may invalidate; must not be wrong either way',
    edit: () => {
      const now = new Date();
      utimesSync(dotfilesRc, now, now);
    },
    expect: () => ({ [ALPHA]: `gen-${String(alphaGen)}` })
  },
  {
    id: 'sourced',
    what: 'edit a file the rc SOURCES',
    must: 'NOT invalidate — and the refresh must then deliver it',
    edit: () => {
      sourcedGen += 1;
      writeSourced();
    },
    // THE ONE ROW THAT MUST READ STALE. Measured: 0 events on BOTH arms after
    // appending to a file the rc sources, because the rc itself never moved and
    // the sourced file is one directory down from a non-recursive watch. This is
    // live on the operator's own machine — his .zshrc holds 3 source lines and
    // his .zshenv holds 1 — and it is the whole reason the Re-read shell button
    // exists.
    expect: () => ({ [SOURCED]: `gen-${String(sourcedGen - 1)}` }),
    stale: true,
    /**
     * THIS ROW NEEDS A SETTLED, WARM SLOT BEFORE ITS EDIT, which is the one
     * thing the other rows do not.
     *
     * Every other row proves an invalidation, and an invalidation is proved by
     * a MISS — so a slot that happened to be cold when the row started only
     * helps it. This row proves the opposite: that a file the rc SOURCES moves
     * nothing, and the only way to read that is a HIT. So the re-warm the
     * PREVIOUS row scheduled has to have landed before this row writes the
     * sourced file. The re-warm's own worst case is the 5 s floor plus a
     * probe on the calibrated slow home, so nine seconds is that with room.
     * Without it the previous row's warm can land AFTER this edit, refill the
     * slot with the new generation, and the row reads fresh for a reason that
     * has nothing to do with the watcher.
     */
    preWaitMs: 9000
  },
  {
    id: 'refresh',
    what: 'press Re-read shell, then start a session',
    must: 'deliver what the watcher could not see',
    // No edit. The DRIVER presses the button before creating the next session.
    edit: () => undefined,
    expect: () => ({ [SOURCED]: `gen-${String(sourcedGen)}` }),
    pressRefresh: true
  },
  {
    id: 'add-name',
    what: 'add a FOURTH name in Settings, then start a session',
    must: 'the cached answer must not hide the new name',
    // NO FILE MOVES. The rc has exported this name since the first write, so
    // nothing the watcher could see changes and the only thing that changes is
    // the SET the create asks about. The slot is warm and covers the other
    // three; this ask mentions a name it does not hold, so coverage says miss
    // and the create probes. That is the property the whole design rests on
    // and it needs no listener, no event and no timer in the path.
    edit: () => undefined,
    expect: () => ({ [GAMMA]: `gen-${String(GAMMA_GEN)}` }),
    addName: GAMMA
  }
];

// ---------------------------------------------------------------------------
// The driver, run inside the real Settings renderer
// ---------------------------------------------------------------------------

/**
 * THE HELPERS BOTH DRIVERS USE, written once.
 *
 * Two drivers run inside the real Settings renderer in this file — the main
 * one and the boot arm's one-name prep — and the integrator's duplicate scan
 * read the same ten lines of them twice. They are interpolated into both
 * template literals rather than pasted into each, so a fix to the throttling
 * note below can never be applied to one driver and not the other.
 *
 * `turn` IS A REAL TASK AND NOT A TIMER. Chromium throttles `setTimeout` in a
 * page it considers hidden to one a second and then to one a minute, which is
 * the stall probe:p174.1 measured. A MessageChannel turn is a task the
 * throttler does not touch, and React's scheduler runs on the same kind of
 * task, so `settle(n)` is n real renderer turns whatever the window's
 * visibility is.
 *
 * `until` answers what it SAW, or null, so a timeout is a finding rather than
 * a hang. `setValue` goes through the prototype's own setter because React
 * listens for the input event on a value it set itself.
 */
const DRIVER_HELPERS = `
  const turn = () => new Promise((r) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => r();
    c.port2.postMessage(0);
  });
  const settle = async (n) => { for (let i = 0; i < n; i += 1) await turn(); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms, step) => {
    const stop = Date.now() + ms;
    for (;;) {
      await settle(20);
      const got = await fn();
      if (got) return got;
      if (Date.now() > stop) return null;
      await wait(step || 200);
    }
  };
  const text = (el) => (el ? (el.textContent || '').trim() : null);
  const click = (el) => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
  };
  const setValue = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
`;


const driver = `(async () => {
  const NAMES = ${JSON.stringify(INITIAL_NAMES)};
  const PROJECT = ${JSON.stringify(projectDir)};
  const CUES = ${JSON.stringify(cuesDir)};
  const ROWS = ${JSON.stringify(
    ROWS.map((r) => ({
      id: r.id,
      pressRefresh: r.pressRefresh === true,
      addName: r.addName ?? null
    }))
  )};
  const WARM_CREATES = 6;
  const readings = { creates: [], notes: [] };

  ${DRIVER_HELPERS}
  const api = window.gmux;

  // THE CUE. The node side writes these files; this driver only READS, because
  // fs:readFile takes any absolute path and a renderer write would have to live
  // inside a project root. The node side learns where the driver has got to
  // from the stand-in agents' own progress log, so nothing here has to write.
  const cue = async (name) =>
    until(async () => {
      try {
        await api.fs.readFile(CUES + '/' + name);
        return true;
      } catch {
        return false;
      }
    }, 120000, 150);

  // -- reach Launch defaults ------------------------------------------------
  const rail = Array.from(document.querySelectorAll('.set-nav-item'))
    .find((n) => (n.textContent || '').trim() === 'Launch defaults');
  if (!rail) return JSON.stringify({ error: 'no Launch defaults item in the rail' });
  click(rail);
  await settle(40);
  await wait(2500);
  await settle(40);

  // -- put the three names on the SHARED list, through the real picker ------
  const sheet = () => document.querySelector('.modal.set-env-picker');
  const rowFor = (name) => document.getElementById('set-env-opt-' + name);
  const filterInput = () =>
    document.querySelector('.modal.set-env-picker .filter-field input, .modal.set-env-picker input.input');
  const confirmModal = () => document.querySelector('.modal.set-confirm');
  const addButton = () => {
    const s = sheet();
    const actions = s ? s.querySelector('.modal-actions') : null;
    return actions ? actions.querySelector('.btn-primary') : null;
  };
  const sharedGroup = () =>
    document.querySelector('.set-env-group[data-env-scope="shared"]');
  const sharedChips = () => {
    const g = sharedGroup();
    if (!g) return [];
    return Array.from(g.querySelectorAll('.set-chip.envname')).map((c) =>
      (c.childNodes[0].textContent || '').trim()
    );
  };
  const addName = () => {
    const g = sharedGroup();
    if (!g) return null;
    return g.querySelector('.set-env-add, button.btn-secondary');
  };

  const adder = addName();
  if (!adder) return JSON.stringify({ error: 'the shared card has no add control' });
  click(adder);
  const s = await until(() => sheet(), 20000);
  if (!s) return JSON.stringify({ error: 'the picker never opened' });
  for (const name of NAMES) {
    const input = filterInput();
    if (input) { setValue(input, name); await settle(20); }
    const row = rowFor(name);
    if (!row) { readings.notes.push('no row for ' + name); continue; }
    click(row);
    await settle(10);
  }
  click(addButton());
  const conf = await until(() => confirmModal(), 20000);
  if (!conf) return JSON.stringify({ error: 'the confirmation never opened' });
  click(conf.querySelector('.modal-actions .btn-primary'));
  await until(() => sharedChips().length >= NAMES.length, 20000);
  if (sharedChips().length !== NAMES.length) {
    readings.notes.push('the shared list did not take exactly the three opening names');
  }
  readings.sharedChips = sharedChips();

  // -- the creates ----------------------------------------------------------
  let made = 0;
  const create = async (label, agent) => {
    made += 1;
    const t = performance.now();
    let id = null, error = null;
    try {
      const sess = await api.sessions.create({
        name: 'p276-' + label + '-' + made,
        projectPath: PROJECT,
        agent: agent
      });
      id = sess.id;
    } catch (err) {
      error = String(err && err.message ? err.message : err);
    }
    const ms = Math.round(performance.now() - t);
    readings.creates.push({ label, agent, ms, id, error });
    return ms;
  };

  // THE COLD CREATE. It may still hit, because the boot warm-up has had a
  // second and the declared cover is the union — which is the design working.
  // The number that matters is the one beside it in the log the shell wrapper
  // keeps, and the node side reads that.
  await cue('creates.go');
  await create('cold', 'claude');
  for (let i = 0; i < WARM_CREATES; i += 1) await create('warm', 'claude');
  await create('second-agent', 'codex');

  // -- the save-shape table -------------------------------------------------
  for (const row of ROWS) {
    await cue(row.id + '.go');
    if (row.addName) {
      // THROUGH THE REAL PICKER AND THE REAL CONFIRM, which is what a person
      // does and what makes the write a sealed one main will read back.
      const adder2 = addName();
      if (!adder2) {
        readings.notes.push('no add control for the fourth name');
      } else {
        click(adder2);
        const s2 = await until(() => sheet(), 20000);
        if (!s2) {
          readings.notes.push('the picker never opened for the fourth name');
        } else {
          const input2 = filterInput();
          if (input2) { setValue(input2, row.addName); await settle(20); }
          const r2 = rowFor(row.addName);
          if (!r2) {
            readings.notes.push('no row for ' + row.addName);
          } else {
            click(r2);
            await settle(10);
            click(addButton());
            const c2 = await until(() => confirmModal(), 20000);
            if (!c2) {
              readings.notes.push('no confirmation for the fourth name');
            } else {
              click(c2.querySelector('.modal-actions .btn-primary'));
              await until(
                () => sharedChips().indexOf(row.addName) >= 0, 20000);
              readings.chipsAfterAdd = sharedChips();
            }
          }
        }
      }
    }
    if (row.pressRefresh) {
      const btn = document.querySelector('.set-section-toolbar .btn.set-rescan');
      if (!btn) {
        readings.notes.push('no Re-read shell button on the page');
      } else {
        readings.refreshLabel = text(btn);
        readings.refreshTitle = btn.getAttribute('title');
        readings.refreshAria = btn.getAttribute('aria-label');
        const t = performance.now();
        click(btn);
        // The spinner running and the button coming back to rest IS the
        // feedback: the channel resolves with nothing at all.
        //
        // WAIT FOR THE DISABLED STATE TO APPEAR BEFORE WAITING FOR IT TO GO.
        // envRefreshing is set synchronously inside the click, but React
        // flushes the re-render on its own scheduler, so a bare
        // "wait until it is enabled again" can read the button BEFORE the flag
        // has drawn and return at once — and the create after it would then
        // race the very probe this row exists to wait for. The press spawns a
        // real login shell against a rc that sleeps 900 ms, so nothing can
        // legitimately finish inside 400 ms.
        await settle(40);
        readings.refreshBusyLabel = text(btn);
        readings.refreshWentBusy = btn.disabled === true;
        await wait(400);
        await until(() => !btn.disabled, 60000, 100);
        readings.refreshMs = Math.round(performance.now() - t);
      }
    }
    await create(row.id, 'claude');
  }

  // -- the settings write that is NOT a shell variable ----------------------
  await cue('settings.go');
  try {
    const before = await api.settingsGet();
    const next = (before.scrollbackLines || 10000) === 10000 ? 12000 : 10000;
    await api.settingsSet({ scrollbackLines: next });
    readings.unrelatedSettingsWrite = 'done';
  } catch (err) {
    readings.unrelatedSettingsWrite = 'failed: ' + String(err && err.message);
  }
  await wait(3000);

  await cue('done.go');
  return JSON.stringify(readings);
})()`;

// ---------------------------------------------------------------------------
// THE BOOT ARM — one Electron at a time, six on and six off
// ---------------------------------------------------------------------------

/**
 * ONE LAUNCH BEFORE THE TWELVE, and without it the boot arm measures nothing.
 *
 * `warmEnvAtBoot()` spawns NOTHING when the declared cover is empty, which is
 * its own rule and the right one — a person who has named no shell variable
 * must not start paying for a login shell at boot. So a boot arm run against a
 * profile nobody has configured measures a warm-up that never runs, and would
 * report "window-shown did not move" for the least interesting reason there is.
 *
 * This launch puts ONE name on the shared list through the real picker and the
 * real seal, and every launch after it reuses the same profile directory. The
 * twelve measured launches then have a warm-up that really does start a login
 * shell against the calibrated slow home, which is the thing that must not
 * delay the first drawn window.
 */
const prepDriver = `(async () => {
  const NAME = ${JSON.stringify(ALPHA)};
  ${DRIVER_HELPERS}
  const rail = Array.from(document.querySelectorAll('.set-nav-item'))
    .find((n) => (n.textContent || '').trim() === 'Launch defaults');
  if (!rail) return JSON.stringify({ error: 'no Launch defaults item in the rail' });
  click(rail);
  await settle(40);
  await wait(2500);
  const group = document.querySelector('.set-env-group[data-env-scope="shared"]');
  if (!group) return JSON.stringify({ error: 'no shared card' });
  const adder = group.querySelector('.set-env-add');
  if (!adder) return JSON.stringify({ error: 'no add control' });
  click(adder);
  const opened = await until(
    () => document.querySelector('.modal.set-env-picker') !== null, 20000);
  if (!opened) return JSON.stringify({ error: 'the picker never opened' });
  const input = document.querySelector('.modal.set-env-picker .filter-field input');
  if (input) { setValue(input, NAME); await settle(20); }
  const row = document.getElementById('set-env-opt-' + NAME);
  if (!row) return JSON.stringify({ error: 'no row for ' + NAME });
  click(row);
  await settle(10);
  const add = document.querySelector('.modal.set-env-picker .modal-actions .btn-primary');
  if (!add) return JSON.stringify({ error: 'no add button' });
  click(add);
  const confirmed = await until(
    () => document.querySelector('.modal.set-confirm') !== null, 20000);
  if (!confirmed) return JSON.stringify({ error: 'the confirmation never opened' });
  click(document.querySelector('.modal.set-confirm .modal-actions .btn-primary'));
  const landed = await until(() => {
    const g = document.querySelector('.set-env-group[data-env-scope="shared"]');
    return g !== null && g.querySelectorAll('.set-chip.envname').length >= 1;
  }, 20000);
  await wait(4000);
  return JSON.stringify({ chips: landed });
})()`;

async function bootPrep() {
  const socket = `gmux-p276prep-${String(process.pid)}`;
  const run = await withElectron(
    {
      label: 'p276-boot-prep',
      userDataDir: userData,
      cwd: appRoot,
      tmuxSocket: socket,
      ceilingMs: 240_000,
      env: {
        ...process.env,
        HOME: scratchHome,
        SHELL: shellWrapper,
        PATH: hermeticPath,
        GMUX_TMUX_SOCKET: socket,
        GMUX_HARNESS_DIR: root,
        GMUX_ENV_WATCH_SEED: '1',
        GMUX_SHOT: join(outDir, 'boot-prep.png'),
        GMUX_SHOT_SETTINGS: '1',
        GMUX_SHOT_SETTINGS_JS: prepDriver,
        GMUX_SHOT_DELAY_MS: '8000'
      }
    },
    async (handle) => {
      const code = await handle.exited;
      return { code, text: handle.text() };
    }
  );
  const line = run.text.split('\n').find((l) => l.includes('[gmux-shot] driver')) ?? '';
  say(`prep: ${line.trim()}`);
  return line.includes('"chips":true');
}

const bootDriver = `(async () => {
  const d = window.gmux.diagnostics;
  const h = await d.begin();
  const report = await d.finish(h.id, {
    memory: null,
    mountedSurfaces: null,
    longTasks: null
  });
  return JSON.stringify({ milestones: report.milestones });
})()`;

async function bootLaunch(index, off) {
  const socket = `gmux-p276boot-${String(process.pid)}-${String(index)}`;
  // THE PER-LAUNCH SHELL COUNT IS THE CONTROL THAT PROVES THE RULER WORKS, and
  // `path-ready` is not. An earlier draft said it was, on a reading taken while
  // the harness seed AWAITED the warm — which put a login shell on the
  // harness's own critical path and moved `path-ready` by 950 ms. With nothing
  // awaited the two shells run beside each other and `path-ready` does not
  // move, correctly, because this phase changes nothing about the PATH capture.
  // What does move, and what must, is how many login shells a launch starts:
  // two with the feature on (the PATH capture and the warm-up) and one with
  // `GMUX_NO_ENV_CACHE=1`. A launch that starts the same number on both arms
  // has measured two identical builds and its `window-shown` reading means
  // nothing at all.
  const shellsBefore = shellsStarted();
  const run = await withElectron(
    {
      label: `p276-boot-${off ? 'off' : 'on'}-${String(index)}`,
      userDataDir: userData,
      cwd: appRoot,
      tmuxSocket: socket,
      ceilingMs: 180_000,
      env: {
        ...process.env,
        HOME: scratchHome,
        SHELL: shellWrapper,
        PATH: hermeticPath,
        GMUX_TMUX_SOCKET: socket,
        // THE HARNESS SEED. `startEnvWatch()` and `warmEnvAtBoot()` live below
        // `dispatchHarness` in src/main/index.ts, which is the right place and
        // does not move, so a GMUX_SHOT launch returns above them and measures
        // the parent no matter what this probe does. The seed calls the same
        // two shipped functions inside the harness branch, under the two
        // refusals every seed in this repository carries: an isolated harness
        // launch, and a profile inside GMUX_HARNESS_DIR. See
        // src/main/harness/env-watch-seed.ts.
        //
        // IT IS SET ON BOTH ARMS, and that is the whole point of the control.
        // The two arms differ in ONE variable, `GMUX_NO_ENV_CACHE`, which
        // `startEnvWatch()` reads and returns on. Withholding the seed from the
        // off arm instead would have made the arms differ in which CODE ran
        // rather than in one knob, and a boot comparison between two different
        // code paths measures nothing.
        GMUX_HARNESS_DIR: root,
        GMUX_ENV_WATCH_SEED: '1',
        GMUX_SHOT: join(outDir, `boot-${String(index)}.png`),
        // THE APP SHELL, NOT THE SETTINGS WINDOW, and the first draft of this
        // arm got it wrong. `GMUX_SHOT_SETTINGS=1` opens the Settings window
        // and never creates the main one, so `window-shown` — the milestone
        // this whole arm exists to read — is never marked and came back null
        // on twelve launches out of twelve. The shell branch creates the real
        // window and `GMUX_SHOT_JS` is its own read-back knob, printed as
        // `[gmux-shot] probe <json>`.
        GMUX_SHOT_JS: bootDriver,
        GMUX_SHOT_DELAY_MS: '6000',
        ...(off ? { GMUX_NO_ENV_CACHE: '1' } : {})
      }
    },
    async (handle) => {
      const code = await handle.exited;
      return { code, text: handle.text() };
    }
  );
  const line = run.text.split('\n').find((l) => l.includes('[gmux-shot] probe')) ?? '';
  const payload = line.slice(line.indexOf('probe') + 'probe'.length).trim();
  let read = null;
  try {
    read = JSON.parse(payload);
    if (typeof read === 'string') read = JSON.parse(read);
  } catch {
    read = null;
  }
  const at = (name) =>
    read === null
      ? null
      : (read.milestones ?? []).find((m) => m.name === name)?.atMs ?? null;
  return {
    windowShown: at('window-shown'),
    pathReady: at('path-ready'),
    shells: shellsStarted() - shellsBefore
  };
}

const median = (xs) => {
  const ok = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (ok.length === 0) return null;
  return ok[Math.floor(ok.length / 2)];
};

if (BOOT_ONLY) {
  const before = operatorSessionCount();
  say(`operator sessions before: ${String(before)}`);
  const prepped = await bootPrep();
  if (!prepped) {
    console.error(`${TAG} REFUSED. The prep launch could not put a name on the ` +
      'shared list, so the warm-up would spawn nothing and the boot arm would ' +
      'measure a warm-up that never ran.');
    process.exit(2);
  }
  const shellsAfterPrep = shellsStarted();
  const on = [];
  const off = [];
  // ONE AT A TIME, NEVER TWO. Phase 258's rule, and the reason is that a
  // measurement of a boot taken while another boot is running is a measurement
  // of the machine.
  //
  // AND INTERLEAVED, WHICH THE FIRST DRAFT OF THIS ARM WAS NOT. Six ON launches
  // followed by six OFF gave the ON arm every cold page cache in the run and
  // the OFF arm none of them, and it read: ON [603.1, 459.1, 476.3, 459.8,
  // 359.2, 381.5] against OFF [373.4, 377.2, 370.4, 373.6, 360.9, 404.7] — an
  // 86 ms gap whose whole shape is the FIRST launch and whose warm tail
  // overlaps the other arm completely. That is an artefact of the order and it
  // would have been reported as a cost of the feature. Alternating gives each
  // arm the same share of cold and warm launches, and the first launch of the
  // whole run is stated separately below rather than hidden in a median.
  for (let i = 0; i < 6; i += 1) {
    on.push(await bootLaunch(i, false));
    off.push(await bootLaunch(100 + i, true));
  }
  const after = operatorSessionCount();
  const left = leftovers();

  const P = (label, value) =>
    console.log(`  ${String(label).padEnd(40)} ${JSON.stringify(value)}`);
  console.log(`\n${TAG} THE BOOT READING`);
  P('window-shown, feature ON', on.map((r) => r.windowShown));
  P('window-shown, GMUX_NO_ENV_CACHE=1', off.map((r) => r.windowShown));
  P('window-shown medians [on, off]', [
    median(on.map((r) => r.windowShown)),
    median(off.map((r) => r.windowShown))
  ]);
  // THE FIRST LAUNCH OF THE RUN IS THE COLD-PAGE-CACHE ONE and it is stated
  // rather than folded in, which is the same thing the banked parent reading
  // does when it says "937.2 (first launch after the build, cold page cache),
  // then 362.9, 358.8 ...".
  P('window-shown medians without the first launch of each arm', [
    median(on.slice(1).map((r) => r.windowShown)),
    median(off.slice(1).map((r) => r.windowShown))
  ]);
  P('path-ready, feature ON', on.map((r) => r.pathReady));
  P('path-ready, GMUX_NO_ENV_CACHE=1', off.map((r) => r.pathReady));
  P('login shells per launch, feature ON', on.map((r) => r.shells));
  P('login shells per launch, GMUX_NO_ENV_CACHE=1', off.map((r) => r.shells));
  P('login shells started, whole arm', shellsStarted());
  P('login shells after the prep launch alone', shellsAfterPrep);
  P('login shells across the twelve measured launches',
    shellsStarted() - shellsAfterPrep);
  P('operator sessions [before, after]', [before, after]);
  P('processes of this run still up', left.mine);

  const findings = [];
  // JUDGED ON THE WARM LAUNCHES. The first launch of each arm carries the cold
  // page cache, the arms are interleaved so each gets one, and a median over
  // twelve readings that includes two cold ones is a reading about the disk.
  const onMedian = median(on.slice(1).map((r) => r.windowShown));
  const offMedian = median(off.slice(1).map((r) => r.windowShown));
  if (onMedian === null || offMedian === null) {
    findings.push('window-shown could not be read on one of the arms.');
  } else if (onMedian > offMedian * 1.15 + 40) {
    // IF `window-shown` MOVES, THE WARM-UP IS ON THE BOOT PATH AND THE DESIGN
    // IS WRONG. The baseline to beat is 341-399 ms warm, median about 360, with
    // the first launch after a build excluded and stated separately.
    findings.push(
      `window-shown moved: ${String(onMedian)} ms with the feature on against ` +
        `${String(offMedian)} ms with it off. The warm-up is on the boot path.`
    );
  }
  // THE CONTROL. Without this the whole arm could be two identical builds.
  const onShells = on.reduce((a, r) => a + r.shells, 0);
  const offShells = off.reduce((a, r) => a + r.shells, 0);
  if (onShells !== on.length * 2 || offShells !== off.length) {
    findings.push(
      `the arms did not differ in what they RAN: ${String(onShells)} login shell(s) ` +
        `across ${String(on.length)} launches with the feature on (two each is the ` +
        `PATH capture and the warm-up) and ${String(offShells)} across ` +
        `${String(off.length)} with GMUX_NO_ENV_CACHE=1 (one each, the PATH capture ` +
        'alone). A window-shown comparison between two builds that ran the same ' +
        'thing proves nothing.'
    );
  }
  if (after !== before) {
    findings.push(`the operator's session count moved: ${String(before)} → ${String(after)}`);
  }
  if (left.mine !== 0) {
    findings.push(`${String(left.mine)} process(es) of this run are still up`);
  }
  console.log('');
  if (findings.length > 0) {
    console.error(`${TAG} FAIL, ${String(findings.length)}:`);
    for (const f of findings) console.error(`  - ${f}`);
    process.exit(1);
  }
  say(
    'PASS. The warm-up is off the boot path: the feature-on arm started twice as ' +
      'many login shells and its first drawn window did not move.'
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// THE ONE APP RUN
// ---------------------------------------------------------------------------

const socket = `gmux-p276app-${String(process.pid)}`;
const before = operatorSessionCount();
say(`operator sessions before: ${String(before)}`);
say(`launch on socket ${socket}, HOME ${scratchHome}, SHELL ${shellWrapper}`);

/** What the node side measured per row, filled in by the conductor. */
const rowReadings = [];
let createsShellsAtStart = 0;
let coldShells = 0;
let warmShells = 0;
let secondAgentShells = 0;
let settingsShells = null;
const cue = (name) => writeFileSync(join(cuesDir, name), 'go\n', 'utf8');

const run = await withElectron(
  {
    label: 'p276',
    userDataDir: userData,
    cwd: appRoot,
    tmuxSocket: socket,
    ceilingMs: 1_200_000,
    env: {
      ...process.env,
      HOME: scratchHome,
      SHELL: shellWrapper,
      PATH: hermeticPath,
      GMUX_TMUX_SOCKET: socket,
      // THE HARNESS SEED. See the boot arm above and
      // src/main/harness/env-watch-seed.ts: without it this run drives a build
      // whose cache is never armed, which is the parent, and every number
      // below would be the parent's number wearing this phase's name.
      GMUX_HARNESS_DIR: root,
      GMUX_ENV_WATCH_SEED: '1',
      GMUX_SHOT: join(outDir, 'p276-settings.png'),
      GMUX_SHOT_SETTINGS: '1',
      GMUX_SHOT_SETTINGS_JS: driver,
      // HOW LONG THE HARNESS WAITS BEFORE IT RUNS THE DRIVER, and it is not a
      // ceiling. `src/main/harness/shot.ts` arms the driver inside a
      // `setTimeout(..., delayMs)` hung off `did-finish-load`, so a large
      // number here does not give the driver room — it delays the driver by
      // that long and the conductor beside it times out waiting for panes that
      // nobody has asked for yet. probe:p275 uses 8 s for the same reason. The
      // run's real ceiling is `ceilingMs` above.
      GMUX_SHOT_DELAY_MS: '8000'
    }
  },
  async (handle) => {
    // THE CONDUCTOR. It runs beside the driver, learns where the driver has got
    // to from the stand-ins' own progress log, performs each save shape on the
    // node side, and releases the driver with a cue file.
    const conduct = async () => {
      // GIVE THE WHOLE OPENING SETTLE BEFORE THE RULER IS ZEROED. Three things
      // start a login shell before the first create and all of them must be
      // behind us when `createsShellsAtStart` is read, or one of them is
      // counted against the create that follows it: the boot PATH capture, the
      // picker's own `settings:envCandidates` probe as the driver opens the
      // sheet, and the re-warm the settings listener schedules the moment the
      // three names are committed. That last one is the slow link — a 400 ms
      // debounce and then a probe that is about 1.2 s on the calibrated slow
      // home — and it lands around 20 s in, which is exactly where the first
      // draft of this line zeroed the count.
      await wait(35_000);
      createsShellsAtStart = shellsStarted();
      cue('creates.go');

      // 1 cold + 6 warm + 1 second agent = 8 panes.
      const coldDone = await until(() => panesLaunched() >= 1, 180_000);
      coldShells = shellsStarted() - createsShellsAtStart;
      if (coldDone === null) return 'the cold create never launched a pane';
      const warmDone = await until(() => panesLaunched() >= 7, 300_000);
      warmShells = shellsStarted() - createsShellsAtStart - coldShells;
      if (warmDone === null) return 'the six warm creates never finished';
      const secondDone = await until(() => panesLaunched() >= 8, 180_000);
      secondAgentShells =
        shellsStarted() - createsShellsAtStart - coldShells - warmShells;
      if (secondDone === null) return 'the second agent never launched a pane';

      let panes = 8;
      for (const row of ROWS) {
        // A row that needs the previous row's re-warm to have LANDED before it
        // edits anything says so. See the sourced row.
        if (row.preWaitMs !== undefined) await wait(row.preWaitMs);
        const shellsBefore = shellsStarted();
        row.edit();
        // The measured latency between a write and the first event is 11 to
        // 38 ms; the debounce is 400 ms and the re-warm is a second. Give the
        // watcher a settled second and a half before the create, so the row
        // measures the reaction rather than the race.
        await wait(row.settleMs ?? 1500);
        const shellsAfterEdit = shellsStarted() - shellsBefore;
        cue(`${row.id}.go`);
        panes += 1;
        const landed = await until(() => panesLaunched() >= panes, 240_000);
        const verdict = landed === null ? null : paneVerdict(panes);
        rowReadings.push({
          id: row.id,
          what: row.what,
          must: row.must,
          shellsAfterEdit,
          shellsForTheCreate: shellsStarted() - shellsBefore - shellsAfterEdit,
          expected: row.expect(),
          verdict,
          stale: row.stale === true
        });
        if (landed === null) return `row ${row.id} never launched its pane`;
      }

      // LET THE PREVIOUS ROW'S RE-WARM LAND BEFORE THIS RULER IS ZEROED. The
      // add-name row writes settings, the listener sees the cover change and
      // schedules a re-warm, and the floor can hold that re-warm for up to five
      // seconds. Measured: without this wait the re-warm the ADD scheduled
      // landed inside this window and was reported as "a settings write that is
      // not a shell variable started 1 login shell", which is a true count of
      // the wrong thing. The floor's worst case plus a probe on the calibrated
      // slow home is under seven seconds.
      await wait(9_000);
      const settingsBefore = shellsStarted();
      cue('settings.go');
      await wait(8_000);
      settingsShells = shellsStarted() - settingsBefore;
      cue('done.go');
      return null;
    };

    let conductorError = null;
    try {
      conductorError = await conduct();
    } catch (err) {
      conductorError = `the conductor threw: ${String(err)}`;
    }
    if (conductorError !== null) say(`conductor: ${conductorError}`);
    const code = await handle.exited;
    return { code, text: handle.text(), conductorError };
  }
);

writeFileSync(join(outDir, 'stdout.txt'), run.text, 'utf8');

const line = run.text.split('\n').find((l) => l.includes('[gmux-shot] driver')) ?? '';
const payload = line
  .slice(line.indexOf('driver') + 'driver'.length)
  .replace(/^\s*→\s*/, '')
  .trim();
let read = null;
try {
  read = JSON.parse(payload);
  if (typeof read === 'string') read = JSON.parse(read);
} catch {
  read = null;
}

const after = operatorSessionCount();
const left = leftovers();

// ---------------------------------------------------------------------------
// NO VALUE, ANYWHERE — every sentinel grepped for in every file the app wrote
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const SENTINELS = [];
for (let g = 1; g <= GENERATIONS; g += 1) SENTINELS.push(sentinel(g));

function sentinelHits(files) {
  const hits = [];
  for (const f of files) {
    let size = 0;
    try {
      size = statSync(f).size;
    } catch {
      continue;
    }
    if (size > 64 * 1024 * 1024) continue;
    let buf = null;
    try {
      buf = readFileSync(f);
    } catch {
      continue;
    }
    if (SENTINELS.some((s) => buf.includes(s))) hits.push(f);
  }
  return hits;
}

const profileFiles = walk(userData);
const leak = {
  profileScanned: profileFiles.length,
  profileHits: sentinelHits(profileFiles),
  manifestHits: sentinelHits(
    profileFiles.filter((f) => /\.(db|sqlite3?)(-wal|-shm)?$/.test(f))
  ),
  logHits: sentinelHits(profileFiles.filter((f) => /\.log$/.test(f))),
  settingsHits: sentinelHits([join(userData, 'settings.json')]),
  paneReportHits: sentinelHits(walk(reportsDir)),
  harnessStdoutHits: sentinelHits([join(outDir, 'stdout.txt')])
};

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const P = (label, value) =>
  console.log(`  ${String(label).padEnd(44)} ${JSON.stringify(value)}`);

console.log(`\n${TAG} THE HEADLINE — login shells started, counted OUTSIDE the app`);
P('for the cold create', coldShells);
P('for the six warm creates', warmShells);
P('for the second agent', secondAgentShells);
P('for a settings write that is not env', settingsShells);
P('for the whole run', shellsStarted());
P('wrapper invocations of every kind', shellLinesAll());

console.log(`\n${TAG} CREATE DURATIONS, as the renderer measured them`);
for (const c of read?.creates ?? []) P(`${c.label} (${c.agent})`, `${String(c.ms)} ms`);

console.log(`\n${TAG} THE SAVE-SHAPE TABLE`);
for (const row of rowReadings) {
  console.log(`  ${row.id.padEnd(16)} ${row.must}`);
  console.log(`     shells for the edit ${String(row.shellsAfterEdit)}, ` +
    `for the create ${String(row.shellsForTheCreate)}`);
  console.log(`     expected ${JSON.stringify(row.expected)}`);
  console.log(`     the pane said ${JSON.stringify(row.verdict)}`);
}

console.log(`\n${TAG} THE REFRESH`);
P('button label', read?.refreshLabel);
P('hover title', read?.refreshTitle);
P('aria-label (must be null)', read?.refreshAria ?? null);
P('label while in flight', read?.refreshBusyLabel);
P('the button went disabled while it ran', read?.refreshWentBusy ?? null);
P('how long the spinner ran', read?.refreshMs);

console.log(`\n${TAG} THE NAME ADDED WHILE THE APP WAS RUNNING`);
P('shared list before', read?.sharedChips);
P('shared list after the add', read?.chipsAfterAdd ?? null);
P('driver notes (must be empty)', read?.notes ?? null);

console.log(`\n${TAG} NO VALUE, ANYWHERE`);
P('profile files scanned / hits', [leak.profileScanned, leak.profileHits.length]);
P('manifest hits', leak.manifestHits.length);
P('log hits', leak.logHits.length);
P('settings.json hits', leak.settingsHits.length);
P('pane report hits', leak.paneReportHits.length);
P('harness stdout hits', leak.harnessStdoutHits.length);
if (leak.profileHits.length > 0) P('WHERE', leak.profileHits);

console.log(`\n${TAG} WHAT IS LEFT`);
P('operator sessions [before, after]', [before, after]);
P('processes of this run still up', left.mine);
P('stand-in panes still sleeping', left.sleep900);

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

const findings = [];
const need = (ok, why) => {
  if (!ok) findings.push(why);
};

need(run.conductorError === null, `the conductor stopped: ${String(run.conductorError)}`);
need(read !== null && read.error === undefined,
  `the driver did not answer: ${read === null ? '(no payload)' : String(read.error)}`);

// THE HEADLINE. Six warm creates must start NO login shell at all. One is the
// whole feature failing; six is the parent.
need(
  warmShells === 0,
  `the six warm creates started ${String(warmShells)} login shell(s). The point of ` +
    'the phase is that they start none: the answer comes out of one ' +
    'process-lifetime slot.'
);
need(
  secondAgentShells === 0,
  `a create for a SECOND agent started ${String(secondAgentShells)} login shell(s). ` +
    'The cache is keyed on COVERAGE and the warm-up probes the declared union, so ' +
    'a second agent whose names are already covered hits.'
);
need(
  settingsShells === 0,
  `a settings write that is not a shell variable started ${String(settingsShells)} ` +
    'login shell(s). onSettingsUpdated fires for EVERY settings write, so a ' +
    'listener that does not compare spawns a shell every time a person moves a ' +
    'slider.'
);

// THE BLOCKING FINDING. Every row of the save-shape table, and the one row that
// must read stale is asserted stale, because a watcher that "invalidates on
// everything" has not been shown to be a watcher at all.
for (const row of rowReadings) {
  const verdict = row.verdict ?? {};
  for (const [name, wanted] of Object.entries(row.expected)) {
    need(
      verdict[name] === wanted,
      `row "${row.id}" (${row.what}): the pane received ${name} ${
        JSON.stringify(verdict[name] ?? null)
      } where the row must deliver ${JSON.stringify(wanted)}. ${
        row.stale
          ? 'This row must NOT invalidate: the rc itself never moved and the ' +
            'sourced file is one directory down from a non-recursive watch. A ' +
            'watcher that invalidates here is invalidating on something it cannot ' +
            'actually see.'
          : 'A STALE KEY DELIVERED SILENTLY IS THE BLOCKING FINDING OF THIS PHASE: ' +
            'the session then fails against its provider with an error that has ' +
            'nothing to do with Tortie, which is issue 20\'s original symptom ' +
            're-created by our own optimisation.'
      }`
    );
  }
}

need(
  (read?.notes ?? []).length === 0,
  `the driver could not do something it was asked to: ${JSON.stringify(read?.notes ?? null)}`
);
need(
  (read?.chipsAfterAdd ?? []).length === 4,
  'the fourth name did not land on the shared list, so the row below proved ' +
    `nothing: ${JSON.stringify(read?.chipsAfterAdd ?? null)}`
);
need(
  read?.refreshLabel === 'Re-read shell',
  `the refresh button reads ${JSON.stringify(read?.refreshLabel ?? null)}.`
);
need(
  read?.refreshTitle ===
    'Ask your shell again. The next session you start gets the current values.',
  `the hover hint reads ${JSON.stringify(read?.refreshTitle ?? null)}. It says "the ` +
    'NEXT session" and never "this window": nothing is read into the window by ' +
    'pressing it.'
);
need(
  (read?.refreshAria ?? null) === null,
  'the refresh button carries an aria-label. The visible text IS the accessible ' +
    'name, which is what both its siblings do.'
);

for (const [where, hits] of [
  ['the profile directory', leak.profileHits],
  ['the manifest', leak.manifestHits],
  ['the logs', leak.logHits],
  ['settings.json', leak.settingsHits],
  ['the pane reports', leak.paneReportHits],
  ['the harness stdout', leak.harnessStdoutHits]
]) {
  need(
    hits.length === 0,
    `a sentinel VALUE appears in ${where}: ${hits.join(', ')}. The answer lives in ` +
      'memory for the life of the process and is written nowhere. That is Phase ' +
      '269\'s rule and it does not move because the answer is now kept longer.'
  );
}

need(after === before, `the operator's session count moved: ${String(before)} → ${String(after)}`);
need(left.mine === 0, `${String(left.mine)} process(es) of this run are still up`);
need(left.sleep900 === 0, `${String(left.sleep900)} stand-in pane(s) are still running`);

console.log('');
if (findings.length > 0) {
  console.error(`${TAG} FAIL, ${String(findings.length)}:`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
say(
  'PASS. Six warm creates and a second agent started NO login shell; every save ' +
    'shape a person\'s editor really uses reached the next session with nothing ' +
    'restarted; the one indirection the watcher cannot see read stale and the ' +
    'Re-read shell button then delivered it; a name added in Settings while the ' +
    'app was running was not hidden by the answer already held; and no sentinel ' +
    'value is in any file the app wrote.'
);
