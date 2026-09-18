#!/usr/bin/env node
/**
 * probe-session-focus.mjs. The Phase 80.1 live probe.
 *
 * WHAT IT PROVES. One claim, at Tier 3, measured twice by two independent
 * readings that do not share a code path.
 *
 *   Between the chord press and the end of the 200 ms flight, no visible leaf
 *   is resized. After the swap, each visible leaf is resized exactly once.
 *
 * READING ONE, IN THE RENDERER. src/renderer/app/focus-shot-drive.ts
 * subscribes to `Terminal.onResize` for every visible leaf, presses the real
 * chord as a capture phase keydown on `window`, and prints one row per event
 * with its offset from the press. `Terminal.onResize` fires exactly when
 * columns or rows change, which is exactly when TerminalPane calls
 * `gmux.sessions.resize`.
 *
 * READING TWO, ON TMUX, WHICH IS THE GROUND TRUTH. This file polls the
 * HARNESS tmux server every 25 ms for the whole gesture and records the
 * sequence of distinct pane sizes per session. A flight that animated the
 * live layout box would show a staircase of five to twelve intermediate
 * sizes. Two sizes and one transition is the shape that cannot be faked.
 *
 * READING THREE, THE KEYBOARD, OVER DEVTOOLS (Phase 286). The flight sets the
 * surface `visibility: hidden` so the photograph can fly over it, and Chromium
 * blurs a focused element that becomes hidden. For a year the only leave check
 * here was "the renderer recorded no leave gesture", and the renderer's drive
 * presses the chord twice with no click between, so the gesture was recorded
 * and the mode was never observed to end: after the enter the keyboard was on
 * `body`, what a person typed went nowhere, and the second chord was silent
 * because fill-chord.ts found no region. This file now attaches a devtools
 * client of its own, samples `document.activeElement` and the shell's class
 * list every 100 ms across both gestures, lines the samples up with the
 * renderer's press times, and fails when the keyboard is not inside the
 * surface after the enter or when `session-focus` is still on the shell after
 * the leave. Both readings are printed whatever the outcome, so a run at the
 * parent shows the numbers the entry names.
 *
 * READING FOUR, THE KEYBOARD PARKED IN THE SESSION LIST (Phase 286, the fix
 * round). The mode does not draw the session list, so a keyboard left on it
 * has nowhere to stay: entered the way View > Focus the Session or File enters
 * the mode, by a keydown no row handler sees, the keyboard fell to `body`,
 * what a person typed went nowhere and the leave chord was silent. After the
 * renderer's drive has finished, one expression in the app window selects a
 * pane that is NOT first in document order, parks the keyboard on the list,
 * presses the chord the way the drive does, reads where the keyboard landed,
 * presses again and reads the shell. It fails when the keyboard is not inside
 * the surface after the enter, when it is in a pane other than the one the
 * surface marks focused, or when the mode is still on after the leave. It is
 * skipped under `--stayfocused`, where the list is not drawn at all.
 *
 * WHAT `--reduced` DOES NOT MEASURE. Under reduced motion `fly()` returns
 * before it hides anything, so the keyboard never leaves the surface and
 * reading three is green at the parent as well. It says nothing about what
 * Phase 286 changed in the flight. Reading four is the one reading there that
 * does, because the hand over from the list has a path with no flight in it.
 *
 * SAFETY, ABSOLUTE. The probe runs on the socket build/harness-socket.mjs
 * gave it, which that script refuses to let be `gmux` or `default`. It uses
 * its own user data directory and its own scratch project. It names `-L gmux`
 * in exactly one place, a read only session count taken before and after,
 * which must match. It never uses pkill, never uses kill-server, and kills
 * only the pid it spawned.
 *
 * Usage, from the repository root. The npm script is the ordinary run. The
 * flags go INSIDE the harness command, because `npm run x -- --flag` would
 * append them after the quoted inner command and harness-socket.mjs would
 * drop them:
 *
 *   npm run probe:sessionfocus
 *
 *   npm run build
 *   node build/harness-socket.mjs gmux-p801-focus \
 *     'node build/probe-session-focus.mjs --reduced'
 *
 *   npm run build
 *   node build/harness-socket.mjs gmux-p801-focus \
 *     'node build/probe-session-focus.mjs --keep'
 *
 *   npm run build
 *   node build/harness-socket.mjs gmux-p801-focus \
 *     'node build/probe-session-focus.mjs --stayfocused'
 *
 * The last one skips the way out, so the screenshot it writes shows the
 * settled focus rather than the layout after leaving it.
 *
 * Exit code 0 when all four readings pass. Exit code 1 otherwise, with every
 * failing row named. Exit code 2 when the probe refuses to run at all.
 */

import { execFile, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { cdpEval, wsConnect } from './cdp-client.mjs';
import { pickRendererTarget } from './cdp-target.mjs';
import { withElectron } from './electron-run.mjs';

const execFileP = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '[probe:sessionfocus]';

function say(line) {
  console.log(`${TAG} ${line}`);
}

function refuse(why) {
  console.error(`${TAG} ${why}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Arguments and refusals
// ---------------------------------------------------------------------------

function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = process.argv[at + 1];
  return value === undefined || value.startsWith('--') ? fallback : value;
}

const reduced = process.argv.includes('--reduced');
const keep = process.argv.includes('--keep');
/** Leave the mode ON at capture time, for the settled focus screenshot. */
const stayFocused = process.argv.includes('--stayfocused');
const armMs = Number(flag('arm', '4000'));
const settleMs = Number(flag('settle', '1500'));
const pollMs = Number(flag('poll', '25'));
/** The flight's length. The renderer reads it from --dur-panel. */
const flightMs = Number(flag('flight', '200'));

const socket = (process.env['GMUX_TMUX_SOCKET'] ?? '').trim();
if (socket === '') {
  refuse(
    'no GMUX_TMUX_SOCKET. Run me through the harness so I get a socket of ' +
      "my own: node build/harness-socket.mjs gmux-p801-focus 'node " +
      "build/probe-session-focus.mjs'"
  );
}
if (socket === 'gmux' || socket === 'default') {
  refuse(`refusing to measure on "${socket}", which is not a harness socket`);
}
if (!existsSync(join(repoRoot, 'out', 'main', 'index.js'))) {
  refuse('out/main/index.js is missing. Run npm run build first.');
}

/**
 * The operator's live server, listed and never written. This is the ONLY
 * place this file names it.
 */
function operatorSessionCount() {
  const out = spawnSync('tmux', ['-L', 'gmux', 'list-sessions'], {
    encoding: 'utf8'
  });
  return (out.stdout ?? '')
    .split('\n')
    .filter((line) => line.trim() !== '').length;
}

const operatorBefore = operatorSessionCount();
say(`operator sessions on -L gmux before: ${String(operatorBefore)}`);
say(`harness socket: ${socket}`);

// ---------------------------------------------------------------------------
// The scratch project
// ---------------------------------------------------------------------------

const scratch =
  process.env['GMUX_HARNESS_DIR'] ?? process.env['TMPDIR'] ?? tmpdir();
const rawRoot = join(scratch, 'gmux-p801-focus');
rmSync(rawRoot, { recursive: true, force: true });
mkdirSync(join(rawRoot, 'project'), { recursive: true });
const root = realpathSync(rawRoot);
const project = join(root, 'project');
const profile = join(root, 'profile');
writeFileSync(join(project, 'README.md'), '# p80.1 focus probe\n', 'utf8');

/**
 * The screenshot goes OUTSIDE the repository, beside the scratch root rather
 * than inside it, so `--keep` is not what decides whether the evidence
 * survives. `out/` would have been the house habit, and electron-builder.yml
 * packs `out/**`, so a screenshot written there ends up inside app.asar in the
 * next packaged build. The phase's scratch files carry a `p80.1-` prefix and
 * live outside the repository, and these two are scratch files.
 */
const shotPath = join(
  scratch,
  reduced ? 'p80.1-focus-reduced.png' : 'p80.1-focus.png'
);
rmSync(shotPath, { force: true });

/**
 * 100 printable characters, repeated down the pane. A fresh prompt fills one
 * row of twenty and reads as an empty drawing buffer at 400 samples, so the
 * ink number only means something on a pane that is full.
 */
const SEED_LINE =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  '0123456789abcdefghijklmnopqrstuvwxyz==';

const drive = {
  projectPath: project,
  session: { agent: 'shell', name: 'p801-a' },
  splitGrid: true,
  sessionFocus: {
    armMs,
    settleMs,
    pollMs: 8,
    measureCopy: true,
    leave: !stayFocused,
    seed: `yes ${SEED_LINE} | head -80`
  }
};

// ---------------------------------------------------------------------------
// The tmux poll
// ---------------------------------------------------------------------------

/** One sample: `{ at, panes: { sessionName: 'WxH' } }`. */
const timeline = [];
let polling = false;
let pollTimer = null;

async function samplePanes() {
  const at = Date.now();
  let stdout = '';
  try {
    const r = await execFileP('tmux', [
      '-L',
      socket,
      'list-panes',
      '-a',
      '-F',
      '#{session_name} #{pane_width}x#{pane_height}'
    ]);
    stdout = r.stdout;
  } catch {
    return; // no server yet, or it went away. Not a sample.
  }
  const panes = {};
  for (const line of stdout.split('\n')) {
    const [name, size] = line.trim().split(/\s+/);
    if (name === undefined || size === undefined) continue;
    panes[name] = size;
  }
  timeline.push({ at, panes });
}

function startPolling() {
  if (polling) return;
  polling = true;
  say(`polling ${socket} every ${String(pollMs)} ms`);
  let busy = false;
  pollTimer = setInterval(() => {
    if (busy) return;
    busy = true;
    void samplePanes().finally(() => {
      busy = false;
    });
  }, pollMs);
}

function stopPolling() {
  if (pollTimer !== null) clearInterval(pollTimer);
  pollTimer = null;
  polling = false;
}

// ---------------------------------------------------------------------------
// The keyboard poll (Phase 286)
// ---------------------------------------------------------------------------

/**
 * The node fly() hides for the flight, which is the node the keyboard must be
 * inside afterwards. It is the same selector focus-flight.ts and the renderer
 * drive read, and the xterm textarea of every leaf is a descendant of it.
 */
const SURFACE_SELECTOR = '[data-surface-leaves]';
/** The class App.tsx puts on `.shell` while the mode is on. */
const FOCUS_CLASS = 'session-focus';
const KEYBOARD_POLL_MS = 100;

/**
 * One expression, evaluated in the app window. It answers where the keyboard
 * is as a tag with its classes, whether that element is inside the surface,
 * and the shell's class list as one string, so the printed line reads the way
 * the entry's measurement does: `body` and `shell session-focus`.
 */
const KEYBOARD_READ = `(() => {
  const ae = document.activeElement;
  const classes = ae !== null && typeof ae.className === 'string'
    ? ae.className.trim().split(/\\s+/).filter((c) => c !== '').join('.')
    : '';
  const shell = document.querySelector('.shell');
  return {
    active: ae === null ? 'null' : ae.tagName.toLowerCase() + (classes === '' ? '' : '.' + classes),
    inSurface: ae !== null && ae.closest(${JSON.stringify(SURFACE_SELECTOR)}) !== null,
    shellClasses: shell === null ? null : shell.className
  };
})()`;

/** One sample: `{ at, active, inSurface, shellClasses }`. */
const keyboardTimeline = [];
let cdp = null;
let attachWhy = 'the attach never finished';
let keyboardTimer = null;

async function targetsFor(profileDir) {
  const port = Number(
    readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim()
  );
  if (!Number.isFinite(port) || port <= 0) throw new Error('no devtools port yet');
  return await (await fetch(`http://127.0.0.1:${String(port)}/json/list`)).json();
}

/**
 * Attach to the main window once it is listed. It starts as soon as Electron
 * is spawned and retries until the window is there, so the first keyboard
 * sample lands well before the arm wait ends whatever `--arm` was set to.
 * `stillRunning` is asked before every retry: an Electron that has already
 * exited leaves a stale port file behind, and a loop that kept asking it would
 * hold the run for the whole timeout after the app was gone.
 */
async function attachMain(profileDir, timeoutMs, stillRunning) {
  const started = Date.now();
  let lastWhy = 'no devtools port yet';
  for (;;) {
    try {
      const picked = pickRendererTarget(await targetsFor(profileDir));
      if (picked.target !== null && picked.target.webSocketDebuggerUrl) {
        return await wsConnect(picked.target.webSocketDebuggerUrl);
      }
      lastWhy = picked.why ?? lastWhy;
    } catch (err) {
      lastWhy = err instanceof Error ? err.message : String(err);
    }
    if (!stillRunning()) throw new Error(`electron exited before the window was listed: ${lastWhy}`);
    if (Date.now() - started > timeoutMs) {
      throw new Error(`no main window target within ${String(timeoutMs / 1000)} s: ${lastWhy}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

function startKeyboardSampling() {
  if (keyboardTimer !== null) return;
  say(`sampling the keyboard over devtools every ${String(KEYBOARD_POLL_MS)} ms`);
  let busy = false;
  keyboardTimer = setInterval(() => {
    if (cdp === null || busy) return;
    busy = true;
    // Stamped when the question is sent, which is the same clock the renderer
    // stamps its presses with, so the samples line up with the gestures below.
    const at = Date.now();
    cdpEval(cdp, KEYBOARD_READ, 5_000)
      .then((r) => {
        if (r !== null && typeof r === 'object') keyboardTimeline.push({ at, ...r });
      })
      .catch(() => undefined) // the window is going away. Not a sample.
      .finally(() => {
        busy = false;
      });
  }, KEYBOARD_POLL_MS);
}

function stopKeyboardSampling() {
  if (keyboardTimer !== null) clearInterval(keyboardTimer);
  keyboardTimer = null;
}

/** The last sample stamped inside `[fromAt, toAt)`, or null. */
function lastSampleIn(fromAt, toAt) {
  let found = null;
  for (const sample of keyboardTimeline) {
    if (sample.at < fromAt || sample.at >= toAt) continue;
    found = sample;
  }
  return found;
}

function describeSample(sample, pressedAt) {
  if (sample === null) return 'no sample';
  return (
    `active=${sample.active} inSurface=${String(sample.inSurface)} ` +
    `shell="${sample.shellClasses ?? 'no .shell'}" ` +
    `@+${String(sample.at - pressedAt)}ms`
  );
}

function shellHasFocusClass(sample) {
  return (sample.shellClasses ?? '').split(/\s+/).includes(FOCUS_CLASS);
}

// ---------------------------------------------------------------------------
// The keyboard parked in the session list (Phase 286, the fix round)
// ---------------------------------------------------------------------------

/** What the harness prints in front of a GMUX_SHOT_JS value. */
const LIST_ARM_MARKER = '[gmux-shot] probe ';

/**
 * Reading four, as ONE expression the shot harness evaluates in the app
 * window after the drive and before the capture (GMUX_SHOT_JS). It runs there
 * and not over this file's devtools client because the harness already waits
 * for it, so the capture cannot race it and no second clock is needed.
 *
 * The pane it selects is the LAST in document order, by the same pointer
 * press a person's click begins with, because the drive leaves the first pane
 * selected and "the focused pane" and "the first textarea" are then the same
 * element, which would let the old document order rule pass. The chord is the
 * drive's own: a keydown on `window`, which the rows' Enter handlers never
 * see. That is the menu row's shape. A real ⇧⌘↩ on a row is a different path,
 * where the row hands the keyboard to the terminal before the flight begins.
 */
function listArmExpression(waitMs) {
  return `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const leafOf = (el) => {
    const l = el !== null && typeof el.closest === 'function' ? el.closest('[data-split-leaf]') : null;
    return l === null ? null : l.getAttribute('data-split-leaf');
  };
  const read = () => {
    const ae = document.activeElement;
    const classes = ae !== null && typeof ae.className === 'string'
      ? ae.className.trim().split(/\\s+/).filter((c) => c !== '').join('.')
      : '';
    const shell = document.querySelector('.shell');
    const marked = document.querySelector('${SURFACE_SELECTOR} .split-pane.focused, ${SURFACE_SELECTOR} .surface-single');
    return {
      active: ae === null ? 'null' : ae.tagName.toLowerCase() + (classes === '' ? '' : '.' + classes),
      inSurface: ae !== null && ae.closest('${SURFACE_SELECTOR}') !== null,
      inList: ae !== null && ae.closest('[data-slot="session-strip"], [data-slot="session-dock"]') !== null,
      leaf: leafOf(ae),
      focusedLeaf: marked === null ? null : marked.getAttribute('data-split-leaf'),
      shellClasses: shell === null ? null : shell.className
    };
  };
  const press = () => window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', metaKey: true, shiftKey: true, bubbles: true
  }));
  const leaves = Array.from(document.querySelectorAll('${SURFACE_SELECTOR} [data-split-leaf]'));
  const firstLeaf = leaves.length === 0 ? null : leaves[0].getAttribute('data-split-leaf');
  const last = leaves.length > 1 ? leaves[leaves.length - 1] : null;
  if (last !== null) {
    (last.querySelector('.split-pane-body') ?? last).dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );
    await wait(300);
  }
  const list =
    document.querySelector('[data-slot="session-dock"] .dock-list') ??
    document.querySelector('[data-slot="session-strip"] [tabindex]');
  if (list !== null) list.focus();
  await wait(150);
  const before = read();
  press();
  await wait(${String(waitMs)});
  const afterEnter = read();
  press();
  await wait(${String(waitMs)});
  const afterLeave = read();
  return { listArm: true, leafCount: leaves.length, firstLeaf, before, afterEnter, afterLeave };
})()`;
}

/** The list arm's answer out of everything Electron printed, or null. */
function listArmReport(output) {
  let at = output.lastIndexOf(LIST_ARM_MARKER);
  while (at !== -1) {
    const line = output.slice(at + LIST_ARM_MARKER.length).split('\n')[0] ?? '';
    try {
      const value = JSON.parse(line);
      if (value !== null && typeof value === 'object' && value.listArm === true) return value;
    } catch {
      // Not this line.
    }
    at = at === 0 ? -1 : output.lastIndexOf(LIST_ARM_MARKER, at - 1);
  }
  return null;
}

function describeListRead(r) {
  return (
    `active=${r.active} inSurface=${String(r.inSurface)} ` +
    `leaf=${r.leaf ?? 'none'} focusedLeaf=${r.focusedLeaf ?? 'none'} ` +
    `shell="${r.shellClasses ?? 'no .shell'}"`
  );
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const loadBefore = loadavg()[0];
let rendererReport = null;
let text = '';

say(`launching electron${reduced ? ' with reduced motion forced' : ''}`);

await withElectron(
  {
    label: 'session-focus',
    userDataDir: profile,
    cwd: repoRoot,
    // The devtools port is for reading three. It is opened on a free port and
    // read back from the profile's DevToolsActivePort, never guessed.
    args: [
      '--remote-debugging-port=0',
      ...(reduced ? ['--force-prefers-reduced-motion'] : [])
    ],
    env: {
      ...process.env,
      GMUX_SHOT: shotPath,
      GMUX_SHOT_VERBOSE: '1',
      GMUX_SHOT_DELAY_MS: String(armMs + settleMs * 2 + 14_000),
      GMUX_SHOT_DRIVE: JSON.stringify(drive),
      // Reading four. Evaluated by the harness after the drive and before the
      // capture. Empty under --stayfocused, which is also what keeps a value
      // inherited from the caller's environment from running instead.
      GMUX_SHOT_JS: stayFocused ? '' : listArmExpression(settleMs)
    }
  },
  async (handle) => {
  const child = handle.child;

  // Reading three's client. Attaching starts now, in parallel with the app's
  // own boot, and the sampler below only sends once it has landed.
  let childGone = false;
  const noteGone = () => {
    childGone = true;
  };
  child.once('exit', noteGone);
  child.once('error', noteGone);
  const attaching = attachMain(profile, 90_000, () => !childGone).then(
    (client) => {
      cdp = client;
    },
    (err) => {
      attachWhy = err instanceof Error ? err.message : String(err);
    }
  );

  function onText(chunk) {
    process.stdout.write(chunk);
    text += chunk;
    if (chunk.includes('[focus-probe] arming')) {
      startPolling();
      startKeyboardSampling();
    }
    const marker = '[focus-probe] result ';
    let at = text.lastIndexOf(marker);
    if (at === -1) return;
    const line = text.slice(at + marker.length).split('\n')[0] ?? '';
    try {
      rendererReport = JSON.parse(line);
      // The drive is over, and the keyboard timeline ends with it: nothing
      // main does next (raising the window for the capture) is a gesture.
      stopKeyboardSampling();
    } catch {
      // The line is still arriving. Try again on the next chunk.
    }
  }

  child.stdout.on('data', (b) => {
    onText(b.toString());
  });
  child.stderr.on('data', (b) => {
    onText(b.toString());
  });

  /**
   * `exit`, not `close`, AND the two pipes are destroyed once it resolves.
   *
   * The app starts a tmux server, and that server inherits this child's stdout
   * and stderr. Two things follow and the probe needs both fixes.
   *
   *  1. `close` waits for a stdio end that never comes, because the tmux server
   *     is still holding the write end long after Electron has quit. Awaiting
   *     `exit` instead is what lets the reading below run at all. Measured on
   *     2026-08-18: the run finished, wrote its screenshot, and then sat for
   *     448 s until it was stopped by hand.
   *  2. Awaiting `exit` still leaves those two readable streams referenced by
   *     the event loop, so node never exits on its own and the promised exit
   *     code is never delivered. Measured on 2026-08-18: the probe printed
   *     "both readings agree" and was still alive 13 minutes 38 seconds later
   *     for a run whose work took about 40 seconds. Destroying both handles
   *     after the drain is what lets the process end, and it is what lets
   *     build/harness-socket.mjs reach its own cleanup instead of leaving a
   *     scratch tmux server behind.
   *
   * A short drain after `exit` collects the last lines before either destroy.
   */
  const exitCode = await new Promise((r) => {
    const watchdog = setTimeout(
      () => {
        console.error(`${TAG} the run passed its ceiling. Ending the pid I started.`);
        child.kill('SIGTERM');
      },
      armMs + settleMs * 2 + 120_000
    );
    child.on('error', (err) => {
      clearTimeout(watchdog);
      console.error(`${TAG} electron could not start: ${err.message}`);
      r(1);
    });
    child.on('exit', (code) => {
      clearTimeout(watchdog);
      setTimeout(() => {
        r(code ?? 1);
      }, 750);
    });
  });
  // The two lines that let this file be a gate. See the note above the promise.
  child.stdout.destroy();
  child.stderr.destroy();
  stopPolling();
  stopKeyboardSampling();
  // The devtools socket is the third handle that would keep node alive. The
  // attach is awaited first so a late success cannot open one after the close.
  await attaching;
  if (cdp !== null) {
    try {
      cdp.close();
    } catch {
      // Electron has already gone, and the socket with it.
    }
  }
  const loadAfter = loadavg()[0];

  // ---------------------------------------------------------------------------
  // Reading the evidence back
  // ---------------------------------------------------------------------------

  const failures = [];
  const loadNote = `load average ${loadBefore.toFixed(1)} before and ${loadAfter.toFixed(1)} after`;

  if (rendererReport === null) {
    failures.push(
      'the renderer printed no focus-probe result, so nothing was measured ' +
        `(electron exited ${String(exitCode)})`
    );
  }

  const gestures = rendererReport?.gestures ?? [];
  const enter = gestures.find((g) => g.name === 'enter') ?? null;
  const leave = gestures.find((g) => g.name === 'leave') ?? null;
  const leafIds = rendererReport?.leafIds ?? [];

  console.log('');
  say(`${loadNote}`);
  say(`visible leaves: ${String(leafIds.length)}`);

  for (const gesture of gestures) {
    console.log('');
    say(`reading one, the renderer. ${gesture.name}: ${String(gesture.rows.length)} resize events`);
    console.log('  leaf                                  cols  rows   t_ms');
    console.log('  ------------------------------------  ----  ----  -----');
    for (const row of gesture.rows) {
      console.log(
        `  ${String(row.leafId).padEnd(38)}${String(row.cols).padStart(4)}` +
          `  ${String(row.rows).padStart(4)}  ${String(row.tMs).padStart(5)}`
      );
    }
  }

  for (const copy of rendererReport?.copies ?? []) {
    say(
      `still copy: leaf=${copy.leafId} grabbed=${String(copy.grabbed)} ` +
        `ink=${copy.ink === null ? 'not measured' : Number(copy.ink).toFixed(4)} ` +
        `sampled=${String(copy.sampled)} ` +
        `sources=[${(copy.sources ?? []).join(' ')}]`
    );
  }

  const copyWindows = rendererReport?.copyWindows ?? [];
  say(
    `copy node seen in ${String(copyWindows.length)} windows over ` +
      `${String(rendererReport?.polls ?? 0)} polls at ` +
      `${String(rendererReport?.pollMs ?? 0)} ms`
  );

  // -- reading two ------------------------------------------------------------

  /** Distinct consecutive sizes per session inside one time window. */
  function sizeRuns(fromAt, toAt) {
    const runs = new Map();
    for (const sample of timeline) {
      if (sample.at < fromAt || sample.at > toAt) continue;
      for (const [name, size] of Object.entries(sample.panes)) {
        const list = runs.get(name) ?? [];
        const last = list[list.length - 1];
        if (last === undefined || last.size !== size) {
          list.push({ size, at: sample.at });
        }
        runs.set(name, list);
      }
    }
    return runs;
  }

  console.log('');
  say(`reading two, tmux on -L ${socket}. ${String(timeline.length)} samples`);
  if (enter !== null) {
    const from = enter.pressedAtEpochMs - 100;
    const to = enter.pressedAtEpochMs + settleMs;
    const runs = sizeRuns(from, to);
    console.log('  session                sizes over the enter gesture');
    console.log('  ---------------------  ----------------------------');
    /**
     * Sessions that changed size at all. The app's own control session never
     * resizes and is not a leaf, so a session that held one size is evidence
     * rather than a failure. What would be a failure is a THIRD size, which is
     * the staircase this reading exists to make impossible to hide.
     */
    let moved = 0;
    for (const [name, list] of runs) {
      console.log(
        `  ${name.padEnd(21)}  ` +
          list
            .map(
              (s) => `${s.size}@+${String(s.at - enter.pressedAtEpochMs)}ms`
            )
            .join('  ')
      );
      if (reduced) continue;
      if (list.length > 2) {
        failures.push(
          `${name} showed ${String(list.length)} distinct pane sizes over the ` +
            'enter gesture, expected at most two. Three or more is a staircase, ' +
            'which means the live layout box was animated'
        );
        continue;
      }
      if (list.length < 2) continue;
      moved += 1;
      const changedAt = (list[1]?.at ?? 0) - enter.pressedAtEpochMs;
      if (changedAt < flightMs) {
        failures.push(
          `${name} changed size ${String(changedAt)} ms after the press, ` +
            `before the ${String(flightMs)} ms flight ended`
        );
      }
    }
    if (runs.size === 0) {
      failures.push(
        'the tmux poll captured no pane sizes during the enter gesture, so ' +
          'reading two measured nothing'
      );
    } else if (!reduced && moved !== leafIds.length) {
      failures.push(
        `${String(moved)} tmux sessions changed size over the enter gesture, ` +
          `expected ${String(leafIds.length)}, one per visible leaf`
      );
    }
  }

  // -- reading three ----------------------------------------------------------

  /**
   * The samples are lined up with the renderer's press times. "After the
   * enter" is the LAST sample before the leave press, so it reads the settled
   * mode and never the flight itself; "after the leave" is the last sample
   * the sampler took before the drive printed its result. Both lines print
   * whatever they read: at the parent they read `body` and a shell that still
   * says `session-focus`, which is the measurement Phase 286 was queued on.
   *
   * THE LOWER BOUND IS LOOSE, AND IT IS NOT WHAT KEEPS THE FLIGHT OUT.
   * `pressed + flightMs + 100` is not the end of the flight. The flight ends
   * at the press plus the time the photograph took to build plus 200 ms plus
   * two frames, and on 2026-09-18 the photograph was still in the document
   * 295 ms after the press with the fits landing at 304 to 308 ms, past this
   * bound. What excludes the flight is taking the LAST sample in the window,
   * which the same three runs put 1.17 to 1.24 s after the last fit. A
   * sampler that stalled could only turn that into a false FAIL ("no sample
   * landed"), never into a false pass.
   */
  console.log('');
  say(`reading three, the keyboard over devtools. ${String(keyboardTimeline.length)} samples`);
  if (cdp === null) {
    failures.push(`devtools never attached (${attachWhy}), so the keyboard was not read`);
  }
  if (enter !== null) {
    const pressed = enter.pressedAtEpochMs;
    // A sample is stamped when it is sent, and one sent a few milliseconds
    // before the press could be answered after it, so "before" stops short of
    // the press by more than a round trip on this machine takes.
    const before = lastSampleIn(0, pressed - 50);
    const afterEnter = lastSampleIn(
      pressed + flightMs + 100,
      leave === null ? Number.POSITIVE_INFINITY : leave.pressedAtEpochMs
    );
    say(`keyboard before the enter: ${describeSample(before, pressed)}`);
    say(`keyboard after the enter:  ${describeSample(afterEnter, pressed)}`);
    if (afterEnter === null) {
      if (cdp !== null) {
        failures.push(
          'no keyboard sample landed between the end of the enter flight and ' +
            'the leave press, so the keyboard after the enter was not read'
        );
      }
    } else if (before !== null && !before.inSurface) {
      // A keyboard that was never in the surface says nothing about the
      // flight, and blaming the flight for it would be the wrong finding.
      failures.push(
        `the keyboard was not inside the surface before the enter (active ` +
          `element ${before.active}), so what the flight does with it was not measured`
      );
    } else {
      if (!shellHasFocusClass(afterEnter)) {
        failures.push(
          `after the enter the shell reads "${afterEnter.shellClasses ?? ''}" ` +
            `without ${FOCUS_CLASS}, so the chord did not enter the mode`
        );
      }
      if (!afterEnter.inSurface) {
        failures.push(
          `after the enter the keyboard is on ${afterEnter.active}, not inside ` +
            `the surface ${SURFACE_SELECTOR}. What a person types goes nowhere ` +
            'and the leave chord is silent'
        );
      }
    }
  }
  if (leave !== null) {
    const pressed = leave.pressedAtEpochMs;
    const afterLeave = lastSampleIn(pressed + flightMs + 100, Number.POSITIVE_INFINITY);
    say(`shell after the leave:     ${describeSample(afterLeave, pressed)}`);
    if (afterLeave === null) {
      if (cdp !== null) {
        failures.push(
          'no keyboard sample landed after the end of the leave flight, so ' +
            'the shell after the leave was not read'
        );
      }
    } else if (shellHasFocusClass(afterLeave)) {
      failures.push(
        `after the leave the shell still reads "${afterLeave.shellClasses ?? ''}", ` +
          `so the second chord did not leave the mode`
      );
    }
  }

  // -- reading four -----------------------------------------------------------

  /**
   * The keyboard parked in the session list. The precondition is judged on
   * its own line, as reading three's is: a keyboard that never reached the
   * list says nothing about what the mode did with it. At the parent the mode
   * is still ON when this arm starts, because the drive's leave chord was
   * silent there, so the list is not drawn and the precondition is what fails.
   */
  if (!stayFocused) {
    console.log('');
    const arm = listArmReport(text);
    if (arm === null) {
      say('reading four, the keyboard parked in the session list. No answer');
      failures.push(
        'the list arm printed no answer, so a keyboard parked in the session ' +
          'list was not measured'
      );
    } else {
      say(
        `reading four, the keyboard parked in the session list. ` +
          `${String(arm.leafCount)} leaves, first in document order ${arm.firstLeaf ?? 'none'}`
      );
      say(`list arm before the enter: ${describeListRead(arm.before)} inList=${String(arm.before.inList)}`);
      say(`list arm after the enter:  ${describeListRead(arm.afterEnter)}`);
      say(`list arm after the leave:  ${describeListRead(arm.afterLeave)}`);
      if (!arm.before.inList || shellHasFocusClass(arm.before)) {
        failures.push(
          `the list arm could not park the keyboard in the session list ` +
            `(active element ${arm.before.active}, shell "${arm.before.shellClasses ?? ''}"), ` +
            'so what the mode does with a keyboard parked there was not measured'
        );
      } else {
        if (arm.leafCount > 1 && arm.before.focusedLeaf === arm.firstLeaf) {
          failures.push(
            'the list arm could not select a pane other than the first, so the ' +
              'focused pane and the first textarea are the same element and the ' +
              'reading cannot tell them apart'
          );
        }
        if (!shellHasFocusClass(arm.afterEnter)) {
          failures.push(
            `from the session list the shell reads "${arm.afterEnter.shellClasses ?? ''}" ` +
              `after the chord, without ${FOCUS_CLASS}, so the mode was not entered`
          );
        } else if (!arm.afterEnter.inSurface) {
          failures.push(
            `a keyboard parked in the session list is on ${arm.afterEnter.active} ` +
              `after the enter, not inside the surface ${SURFACE_SELECTOR}. The ` +
              'mode does not draw the list, so what a person types goes nowhere ' +
              'and the leave chord is silent'
          );
        } else if (
          arm.afterEnter.focusedLeaf !== null &&
          arm.afterEnter.leaf !== arm.afterEnter.focusedLeaf
        ) {
          failures.push(
            `a keyboard parked in the session list went to pane ` +
              `${arm.afterEnter.leaf ?? 'none'}, and the focused pane is ` +
              `${arm.afterEnter.focusedLeaf}. The keyboard and the outline must ` +
              'be on the same pane'
          );
        }
        if (shellHasFocusClass(arm.afterLeave)) {
          failures.push(
            `after the list arm's leave the shell still reads ` +
              `"${arm.afterLeave.shellClasses ?? ''}", so the second chord did ` +
              'not leave the mode'
          );
        }
      }
    }
  }

  // -- the pass conditions ----------------------------------------------------

  if (enter === null) {
    failures.push('the renderer recorded no enter gesture');
  } else if (reduced) {
    for (const row of enter.rows) {
      if (row.tMs >= 32) {
        failures.push(
          `${row.leafId} resized ${String(row.tMs)} ms after the press under ` +
            'reduced motion, which must be instant'
        );
      }
    }
    if (copyWindows.length > 0) {
      failures.push(
        `the copy node appeared ${String(copyWindows.length)} times under ` +
          'reduced motion, and it must never be built at all'
      );
    }
  } else {
    const early = enter.rows.filter((r) => r.tMs > 0 && r.tMs < flightMs);
    for (const row of early) {
      failures.push(
        `${row.leafId} resized at ${String(row.tMs)} ms, inside the ` +
          `${String(flightMs)} ms flight. Nothing may resize before the swap`
      );
    }
    const afterSwap = enter.rows.filter((r) => r.tMs >= flightMs);
    const distinct = new Set(afterSwap.map((r) => r.leafId));
    if (leafIds.length > 0 && afterSwap.length !== leafIds.length) {
      failures.push(
        `${String(afterSwap.length)} resize events after the swap, expected ` +
          `exactly ${String(leafIds.length)}, one per visible leaf`
      );
    }
    if (leafIds.length > 0 && distinct.size !== leafIds.length) {
      failures.push(
        `${String(distinct.size)} distinct leaves resized after the swap, ` +
          `expected ${String(leafIds.length)}`
      );
    }
    if (leave === null && !stayFocused) {
      failures.push('the renderer recorded no leave gesture');
    }
  }

  if (existsSync(shotPath)) {
    say(`screenshot ${shotPath}`);
  } else {
    failures.push(`no screenshot was written to ${shotPath}`);
  }

  const operatorAfter = operatorSessionCount();
  say(`operator sessions on -L gmux after: ${String(operatorAfter)}`);
  if (operatorAfter !== operatorBefore) {
    failures.push(
      `the operator's server went from ${String(operatorBefore)} sessions to ` +
        `${String(operatorAfter)}. This probe must never touch it`
    );
  }

  if (!keep) rmSync(root, { recursive: true, force: true });

  const named = [...new Set(failures)];
  if (named.length > 0) {
    console.error('');
    for (const failure of named) console.error(`${TAG} FAIL ${failure}`);
    process.exit(1);
  }
  console.log('');
  say(
    reduced
      ? `every reading agrees. Every leaf resized inside 32 ms and the copy ` +
          `was never built. Nothing was hidden, so reading three measured no ` +
          `flight${stayFocused ? '' : ', and a keyboard parked in the session list reached the focused pane'}, ${loadNote}`
      : `every reading agrees. No leaf resized before ${String(flightMs)} ms, ` +
          `the keyboard stayed in the session${stayFocused ? '' : ' and one parked in the session list reached the focused pane'}, ${loadNote}`
  );
});
