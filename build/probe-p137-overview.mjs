#!/usr/bin/env node
/**
 * probe-p137-overview.mjs. The Phase 137 photograph probe, modelled on
 * build/probe-p139-caption.mjs.
 *
 * ## What it proves
 *
 * The Catch Me Up page opens over the window at each of its three levels,
 * draws real conversations read from real fixture logs, fits the window, and
 * carries no integer outside a clock, a date or an elapsed time. It launches
 * the real app seven times, one at a time, photographs the project view, the
 * session view and the columns view, and captures one frame while the 200 ms
 * flight is stretched to 2000 ms so the picture lands mid flight.
 *
 * Phase 137.2 adds three launches for the ask rail. A short conversation
 * shows the rail with one row per ask, a sixty ask conversation shows the
 * rail scrolling on its own while a press, the arrows at repeat speed, a
 * wheel scroll and the Tab, Return and Escape reach are proven by rectangle
 * and index reads rather than by eye, and a narrow window shows the rail
 * collapsed with the conversation still fitting.
 *
 * ## The keyboard after the page closes (Phase 289)
 *
 * The eighth launch, `keyboard`, and the only one that holds a LIVE session.
 * Phase 286's attack verifier opened the page with ⇧⌘U over a terminal that
 * held the keyboard, pressed Escape, and read `document.activeElement` as
 * `body`: the leave asked the terminal to take the keyboard in the same task
 * as the store write that closes the page, while the shell still wore
 * `overview-open` and overview.css still held the work area hidden, and a
 * hidden element refuses the keyboard. What a person typed next went nowhere
 * until they clicked into the terminal. Every launch above seeds RESTORABLE
 * rows and draws no terminal at all, so none of them could have seen it.
 *
 * THE DRIVE IS A SHOT-DRIVE SPEC PLUS REAL KEYS. The first seven launches are
 * driven whole by GMUX_SHOT_DRIVE and read by one GMUX_SHOT_JS expression,
 * with the chord dispatched as a window level KeyboardEvent. This one uses the
 * same harness to build four real shell panes (`session` plus `splitGrid`),
 * and then holds the harness open with a GMUX_SHOT_JS promise while this file
 * attaches a devtools client of its own (build/cdp-client.mjs over the target
 * build/cdp-target.mjs picks, the shape of build/probe-session-focus.mjs's
 * reading three). Every key after that is a REAL key event sent with
 * Input.dispatchKeyEvent to whatever holds the keyboard, because a synthetic
 * event aimed at an element proves nothing about where the keyboard is.
 *
 * READING ONE, THE KEYBOARD AFTER THE PAGE CLOSES. The last pane in document
 * order is selected by the pointer press a click begins with, its textarea
 * holds the keyboard, ⇧⌘U opens the page, and the page is left twice: by
 * Escape, and by ⇧⌘U pressed a second time. It fails when the active element
 * is not inside `.gmux-terminal-mount` 500 ms after the key. Then a
 * distinctive string is typed with real keys and every pane on the harness
 * socket is read back with `capture-pane -p`: the string must have arrived in
 * a session. At the parent this reading is RED by the measured `body`.
 *
 * WHEN IT CAME BACK, and where zero is (the fix round, from the re-derive
 * verifier's R2). Zero is the leave key's OWN `timeStamp`. The first build
 * took zero inside this file's keydown listener, which runs after the app's
 * handler, after React's commit and after the phase's own observer, because
 * Chromium runs a microtask checkpoint between two listeners of one event. So
 * it printed "+0 ms" at HEAD and at the parent alike, which was the time from
 * a listener that ran after the fix to itself, and it never graded the
 * number. Now a capture phase `focusin` and `focusout` pair and an observer
 * on the shell's class are armed BEFORE the key, every one of them is printed
 * with its offset from the key, and the first `focusin` that put the keyboard
 * where it ended up is `landedMs`. It is graded against
 * KEYBOARD_RETURN_BOUND_MS. HEAD read 3.5 to 6.4 ms over four leaves on
 * 2026-09-18. The 5 ms sampler stays for the final state and for the
 * throttled-window check.
 *
 * READING TWO, THE PANE THAT IS OUTLINED (Phase 289's mechanism item 4). The
 * outline sits on the LAST pane on purpose. `focusTerminal()` picked the first
 * `.gmux-terminal-mount textarea` in document order, so in a split the leave
 * put the keyboard in the first pane while the outline sat on another. It
 * fails when the keyboard is in a pane other than the one the surface marks
 * (`.split-pane.focused`, or `.surface-single`), or when the typed string
 * arrived in another session than that pane's. It is NOT JUDGED when reading
 * one is red, and says so: a keyboard on nothing has no pane to compare.
 *
 * READING THREE, THE KEYBOARD GOES BACK WHERE IT WAS (the fix round, from the
 * attack verifier's A1). The first build sent every leave to the terminal.
 * With the keyboard in an open file the verifier pressed ⇧⌘U and Escape and
 * carried on typing, and the line and its Enter went to the outlined session,
 * whose shell RAN it; the parent had sent them nowhere. So a third leave is
 * driven with the keyboard in an open file, put there by a real mouse press:
 * after Escape the element that held the keyboard holds it again, the typed
 * string is in the file's buffer, and it arrived in NO session. At the parent
 * it is red by `body`, as reading one is.
 *
 * WHAT THIS LAUNCH DOES NOT DRIVE, stated rather than passed: the jump out
 * through ⏎ on a turn, a leave under reduced motion, the page opened from the
 * session list, a leave with the keyboard in the sidebar, and a leave in a
 * project with no session at all. The attack verifier drove each of them in
 * a scratch probe of its own on 2026-09-18.
 *
 * ## The parent
 *
 * `P137_PARENT_CHECKOUT=<a BUILT worktree at the parent commit>` points THIS
 * run at that checkout's `out/` (its cwd and its build), one Electron at a
 * time, never beside a HEAD run: the two are two invocations. The fixtures,
 * the drive and every reader stay this file's, which is what makes the two
 * columns one measurement. The parent is expected to FAIL the keyboard
 * launch with the numbers printed, and the report says so in as many words.
 * The exit code is the same rule either way.
 *
 * ## How the sessions exist without an agent running
 *
 * A scratch home directory holds five of the committed research 63 fixtures
 * placed exactly where each provider's resolver expects them. A seed file
 * named by GMUX_OVERVIEW_SEED makes src/main/harness/overview-seed.ts insert
 * six manifest rows into the ISOLATED profile, being claude-6, codex-2,
 * grok-1, deepseek-1, qwen-1 and shell-2. No agent process starts. The
 * scratch project is a real git repository whose second commit touches
 * scripts/release.sh after the fixtures' timestamps, so the claude turn shows
 * that git agrees, and nothing ever commits src/nest_counter.py, so the codex
 * turn shows that git has no record.
 *
 * ## Safety, absolute
 *
 *  - It refuses to run unless build/harness-socket.mjs handed it a socket of
 *    its own, and it refuses the names `gmux` and `default` outright.
 *  - `-L gmux` is named in exactly one place, a read only `list-sessions`
 *    count taken before and after, which must match.
 *  - Every Electron launch uses a scratch `--user-data-dir` under the harness
 *    directory and a scratch HOME. The operator's profile and home are never
 *    opened.
 *  - At most one Electron runs at a time. Every launch goes through
 *    build/electron-run.mjs, which ends the whole tree it started in a finally
 *    block whatever happened. The keyboard launch hands that helper the
 *    harness socket as well, so the scratch tmux server its four shells run
 *    on is ended in the same finally block.
 *  - There is no pkill and no kill-server anywhere in this file. Every
 *    process it starts itself is a synchronous `git` or `tmux` that has
 *    exited before the call returns.
 *
 * ## What it refuses
 *
 *  - No `GMUX_TMUX_SOCKET`, and the sockets `gmux` and `default` by name.
 *  - `out/main/index.js` missing in the checkout it is pointed at.
 *  - With the keyboard launch chosen, a STALE `out/` in that checkout: any
 *    source the leave runs through newer than the newest file vite wrote
 *    under out/renderer/assets. A missing-file check says nothing about a
 *    build that is merely old, and an old one would report the keyboard on
 *    `body` at HEAD and blame the fix (build/p288/probe-p288.mjs's rule).
 *  - A `P137_RUNS` that names a launch this file does not have.
 *
 * ## Environment
 *
 *   GMUX_TMUX_SOCKET       The scratch socket. build/harness-socket.mjs sets it.
 *   GMUX_HARNESS_DIR       The scratch directory. Set by the same wrapper.
 *   P137_PARENT_CHECKOUT   A BUILT worktree at the parent commit. Optional.
 *   P137_RUNS              A comma separated subset of project, session,
 *                          several, flight, rail-short, rail-long,
 *                          rail-narrow, keyboard. All eight by default.
 *   P137_OUT_DIR           Where the pictures and readings go. `out/p137` by
 *                          default, and `out/p137-parent` under the parent
 *                          knob so a parent run never writes over HEAD's.
 *
 * ## Usage, from the worktree root
 *
 *   npm run probe:p137                                     HEAD, builds first
 *
 *   The parent, already built, and the keyboard launch alone. The npm script
 *   would rebuild HEAD first, so these go to the harness directly:
 *
 *   P137_PARENT_CHECKOUT=/path/to/parent P137_RUNS=keyboard \
 *     node build/harness-socket.mjs gmux-p137-overview \
 *     'node build/probe-p137-overview.mjs'
 *   P137_RUNS=keyboard node build/harness-socket.mjs gmux-p137-overview \
 *     'node build/probe-p137-overview.mjs'
 *
 *   node build/probe-p137-overview.mjs --graders           the keyboard
 *                                                          graders alone,
 *                                                          launches nothing
 *
 * Exit 0 when every chosen launch wrote its picture and its reading and every
 * assertion held. 1 when they did not. 2 when the probe refuses to run at all.
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cdpEval, wsConnect } from './cdp-client.mjs';
import { pickRendererTarget } from './cdp-target.mjs';
import { runElectron, withElectron } from './electron-run.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '[probe:p137overview]';

const say = (line) => {
  console.log(`${TAG} ${line}`);
};
const refuse = (why) => {
  console.error(`${TAG} ${why}`);
  process.exit(2);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// The keyboard graders (Phase 289). Pure, above the refusals so --graders can
// prove them both ways with no socket, no build and no Electron.
//
// The flag is NOT --self-test, which is what every other file under build/
// calls it. build/cdp-target.mjs answers that flag at import time and exits,
// so under that name this file printed the target picker's ten fixtures,
// exited 0 and had run none of its own checks.
// ---------------------------------------------------------------------------

/** Every launch this file has, in the order they run. */
const ALL_RUNS = [
  'project',
  'session',
  'several',
  'flight',
  'rail-short',
  'rail-long',
  'rail-narrow',
  'keyboard'
];

/** How long after the leave key the keyboard has to be back, and the poll. */
const KEYBOARD_WINDOW_MS = 500;
const KEYBOARD_POLL_MS = 5;
/**
 * Fewer samples than this inside the window means Chromium aligned the page's
 * timers to one second, which it does to a window something else has come in
 * front of (src/main/harness/shot.ts measured it). A reading taken that way
 * says nothing about the leave, so it is a finding of its own and never a
 * verdict on the keyboard.
 */
const KEYBOARD_MIN_SAMPLES = 10;

/**
 * How long after the leave key's own timeStamp the keyboard may take to be
 * back. It is not a latency budget. HEAD reads 3.5 to 6.4 ms, which is one
 * React commit and a microtask. The bound is half the 200 ms chrome fade, so a
 * return that waited for the fade or for a timer near it is red, and it is
 * the bound overview-flight.ts already gives a frame that must have come
 * (FRAME_BOUND_MS). A person's next key cannot arrive inside it.
 */
const KEYBOARD_RETURN_BOUND_MS = 100;

/**
 * The ways out this launch drives, in the words the findings use. `key` is
 * what is pressed, and `origin` is what held the keyboard before the page:
 * the outlined terminal, or an open file (reading three).
 */
const LEAVES = [
  { how: 'escape', key: 'escape', words: 'Escape', origin: 'terminal' },
  { how: 'chord', key: 'chord', words: '⇧⌘U pressed a second time', origin: 'terminal' },
  { how: 'file', key: 'escape', words: 'Escape', origin: 'file' }
];

/** The file reading three opens, written into the scratch project. */
const KEYBOARD_FILE = 'p137-notes.txt';

/**
 * The sources the leave runs through. A build older than any of them measures
 * a leave nobody is looking at. A file a checkout does not have reads as 0.
 */
const KEYBOARD_SOURCES = [
  'src/renderer/overview/open-overview.ts',
  'src/renderer/overview/overview-flight.ts',
  'src/renderer/overview/OverviewLayer.tsx',
  'src/renderer/overview/overview.css',
  'src/renderer/app/session-focus.ts',
  'src/renderer/app/focus-flight.ts'
];

/**
 * The staleness grader, build/p288/probe-p288.mjs's shape. `sources` is
 * `[path, mtimeMs]` per source and `bundle` is `[path, mtimeMs]` of the newest
 * file vite wrote, or null when out/renderer/assets holds none. Answers the
 * refusal sentence, or null when the build is at least as new as its sources.
 */
function staleSentence(sources, bundle) {
  if (bundle === null) return 'out/renderer/assets holds nothing vite wrote; build first.';
  const newer = sources
    .filter(([, mtime]) => mtime > bundle[1])
    .map(([path, mtime]) => `${path} is ${((mtime - bundle[1]) / 1000).toFixed(1)} s newer than ${bundle[0]}`);
  if (newer.length === 0) return null;
  return `out/ is older than the sources the leave runs through; build first (${newer.join('; ')}).`;
}

/** The P137_RUNS subset, or every launch; an unknown name is a refusal. */
function chooseRuns(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { runs: [...ALL_RUNS], bad: [] };
  const names = text.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== '');
  const bad = names.filter((n) => !ALL_RUNS.includes(n));
  return { runs: ALL_RUNS.filter((r) => names.includes(r)), bad };
}

/**
 * Grade one leave. `leave` is what the driven window answered and `ctx` names
 * the panes: `{ leafCount, firstLeaf, nameOf(leafId) }`.
 *
 * The order is the point. A leave that was never driven, a key the window
 * never heard and a throttled window are each judged on their own line and
 * END the grading, because none of them says anything about the keyboard and
 * blaming the leave for them would be the wrong finding. Reading two is
 * judged only once reading one held, for the same reason.
 */
function keyboardFindings(leave, ctx) {
  const findings = [];
  const notes = [];
  const at = (s) => `keyboard, ${leave.how}: ${s}`;
  const nameOf = (leaf) => (leaf === null || leaf === undefined ? 'no pane' : (ctx.nameOf(leaf) ?? leaf));
  if (typeof leave.skipped === 'string') {
    findings.push(at(leave.skipped));
    return { findings, notes };
  }
  const after = leave.after ?? null;
  if (after === null || after.pressed !== true) {
    findings.push(at(`${leave.words} never reached the app window, so the leave was not measured`));
    return { findings, notes };
  }
  if (after.samples < KEYBOARD_MIN_SAMPLES) {
    findings.push(
      at(
        `only ${String(after.samples)} samples landed in the ${String(KEYBOARD_WINDOW_MS)} ms after the key, so ` +
          "the page's timers were throttled and the reading says nothing about the leave. Leave the app " +
          'window in front and run again'
      )
    );
    return { findings, notes };
  }
  const final = after.final;
  const arrived = leave.arrivedIn ?? [];
  if (final.overview === true) {
    findings.push(at(`the page is still drawn ${String(KEYBOARD_WINDOW_MS)} ms after ${leave.words}`));
  }

  // When it came back, from the key's own timeStamp. Judged only by a leave
  // that put the keyboard where it belongs, because a keyboard on nothing
  // never came back and the sentence for that is reading one's.
  const gradeReturn = () => {
    if (typeof after.landedMs !== 'number') {
      findings.push(
        at(
          'the keyboard reads as back and no focusin put it there after the key, so WHEN it came back was ' +
            'not measured'
        )
      );
      return;
    }
    if (after.landedMs > KEYBOARD_RETURN_BOUND_MS) {
      findings.push(
        at(
          `the keyboard came back ${String(after.landedMs)} ms after the key, and the bound is ` +
            `${String(KEYBOARD_RETURN_BOUND_MS)} ms; what a person types in between goes nowhere`
        )
      );
    }
  };

  // Reading three. The keyboard was in an open file before the page, so that
  // is where it goes back, and a session is somewhere a person's words are
  // acted on. The order of the sentences is the order of harm.
  if (leave.origin === 'file') {
    if (arrived.length > 0) {
      findings.push(
        at(
          `the keyboard was in an open file before the page, and "${leave.needle}" typed after ${leave.words} ` +
            `arrived in ${arrived.join(', ')}; what a person goes on typing is sent to a session they were not in ` +
            `(the keyboard is on ${final.active})`
        )
      );
      return { findings, notes };
    }
    if (final.atOrigin !== true) {
      findings.push(
        at(
          `the keyboard was in an open file before the page and is on ${final.active} after ${leave.words}; ` +
            `what a person types goes nowhere until they click back into the file ("${leave.needle}" arrived in ` +
            'no session on the harness socket)'
        )
      );
      return { findings, notes };
    }
    if (leave.inBuffer !== true) {
      findings.push(
        at(`the element that held the keyboard holds it again, and "${leave.needle}" typed after it is not in the file's buffer`)
      );
    }
    gradeReturn();
    return { findings, notes };
  }

  // Reading one. The sentence is what a person experiences, and the numbers
  // that prove it ride behind it.
  if (final.inMount !== true) {
    findings.push(
      at(
        `after closing Catch Me Up with ${leave.words} the keyboard is on ${final.active}; what a person ` +
          `types goes nowhere until they click into the terminal (${String(KEYBOARD_WINDOW_MS)} ms after the ` +
          `key the shell reads "${final.shell ?? 'no .shell'}", and "${leave.needle}" typed after it arrived in ` +
          `${arrived.length === 0 ? 'no session on the harness socket' : arrived.join(', ')})`
      )
    );
    notes.push(at('reading two is not judged: the keyboard is on nothing, so there is no pane to compare with the outline'));
    return { findings, notes };
  }
  if (arrived.length === 0) {
    findings.push(
      at(
        `the keyboard reads as inside the terminal (${final.active}) and "${leave.needle}" typed after the ` +
          'page closed arrived in no session on the harness socket'
      )
    );
  }
  gradeReturn();

  // Reading two. The precondition is a finding rather than a skip: this
  // launch exists to stage the split, so a split it could not stage is the
  // launch failing, and a pass that measured one pane would be a fiction.
  const outlined = final.outlinedLeaf ?? null;
  if (ctx.leafCount < 2 || outlined === null || outlined === ctx.firstLeaf) {
    findings.push(
      at(
        `the split was not staged with the outline off the first pane (${String(ctx.leafCount)} panes, the ` +
          `outline on ${nameOf(outlined)}), so reading two was not driven`
      )
    );
    return { findings, notes };
  }
  if (final.leaf !== outlined) {
    findings.push(
      at(
        `after closing Catch Me Up with ${leave.words} the keyboard is in ${nameOf(final.leaf)} while the ` +
          `outline is on ${nameOf(outlined)}; what a person types goes to a pane that does not look focused`
      )
    );
  }
  const want = nameOf(outlined);
  if (arrived.length > 0 && (arrived.length !== 1 || arrived[0] !== want)) {
    findings.push(
      at(`"${leave.needle}" typed after the page closed arrived in ${arrived.join(', ')}, and the outlined pane is ${want}`)
    );
  }
  return { findings, notes };
}

/** Every grader on a HEAD shaped answer and a parent shaped one. */
function selfTest() {
  const failures = [];
  let checks = 0;
  const check = (name, ok) => {
    checks += 1;
    if (!ok) failures.push(name);
  };
  const names = { L1: 'p137-kb', L4: 'split-4' };
  const ctx = { leafCount: 4, firstLeaf: 'L1', nameOf: (leaf) => names[leaf] ?? null };
  const state = (over) => ({
    active: 'textarea.xterm-helper-textarea',
    inMount: true,
    atOrigin: false,
    leaf: 'L4',
    outlinedLeaf: 'L4',
    shell: 'shell',
    overview: false,
    ...over
  });
  const leave = (final, arrivedIn, over = {}) => ({
    how: 'escape',
    words: 'Escape',
    needle: 'p289headescape',
    arrivedIn,
    after: { pressed: true, samples: 96, landedMs: 12.4, steps: [], final },
    ...over
  });

  const head = keyboardFindings(leave(state({}), ['split-4']), ctx);
  check('a HEAD shaped leave is clean', head.findings.length === 0 && head.notes.length === 0);

  // The measured parent: `body`, the shell back to "shell", nothing typed
  // arriving anywhere (Phase 286's attack verifier, arm D).
  const parent = keyboardFindings(leave(state({ active: 'body', inMount: false, leaf: null }), []), ctx);
  check(
    'the measured parent is ONE finding that says body and nowhere',
    parent.findings.length === 1 &&
      parent.findings[0].includes('the keyboard is on body') &&
      parent.findings[0].includes('goes nowhere') &&
      parent.findings[0].includes('no session on the harness socket')
  );
  check('the parent does not judge reading two, and says so', parent.notes.length === 1 && parent.notes[0].includes('not judged'));

  // Mechanism item 4 alone: the keyboard is back, in the FIRST pane.
  const firstPane = keyboardFindings(leave(state({ leaf: 'L1' }), ['p137-kb']), ctx);
  check(
    'the first pane under an outline elsewhere is two findings naming both panes',
    firstPane.findings.length === 2 &&
      firstPane.findings[0].includes('the keyboard is in p137-kb while the outline is on split-4') &&
      firstPane.findings[1].includes('arrived in p137-kb')
  );

  const nowhere = keyboardFindings(leave(state({}), []), ctx);
  check('a focused textarea whose bytes arrive nowhere is a finding', nowhere.findings.length === 1 && nowhere.findings[0].includes('arrived in no session'));

  const stillOpen = keyboardFindings(leave(state({ overview: true }), ['split-4']), ctx);
  check('a page still drawn is a finding', stillOpen.findings.length === 1 && stillOpen.findings[0].includes('still drawn'));

  const unheard = keyboardFindings(leave(state({}), [], { after: { pressed: false, samples: 0, steps: [], final: state({}) } }), ctx);
  check('a key the window never heard ends the grading', unheard.findings.length === 1 && unheard.findings[0].includes('never reached'));

  const throttled = keyboardFindings(
    leave(state({ active: 'body', inMount: false }), [], { after: { pressed: true, samples: 1, steps: [], final: state({ active: 'body', inMount: false }) } }),
    ctx
  );
  check('a throttled window is its own finding and never a verdict', throttled.findings.length === 1 && throttled.findings[0].includes('throttled'));

  const skipped = keyboardFindings({ how: 'chord', words: '⇧⌘U pressed a second time', skipped: '⇧⌘U did not open the page, so the leave was not measured' }, ctx);
  check('a leave that was not driven carries its own sentence', skipped.findings.length === 1 && skipped.findings[0].startsWith('keyboard, chord: ⇧⌘U did not open'));

  // The re-derive verifier's R2: the number is graded, from the key's own
  // timeStamp. Its case was a return at +400 ms that the first build passed.
  const late = keyboardFindings(leave(state({}), ['split-4'], { after: { pressed: true, samples: 96, landedMs: 400, steps: [], final: state({}) } }), ctx);
  check('a return that arrives late is a finding with its number', late.findings.length === 1 && late.findings[0].includes('came back 400 ms after the key'));
  const atTheBound = keyboardFindings(leave(state({}), ['split-4'], { after: { pressed: true, samples: 96, landedMs: KEYBOARD_RETURN_BOUND_MS, steps: [], final: state({}) } }), ctx);
  check('a return at the bound is clean', atTheBound.findings.length === 0);
  const unheardReturn = keyboardFindings(leave(state({}), ['split-4'], { after: { pressed: true, samples: 96, landedMs: null, steps: [], final: state({}) } }), ctx);
  check('a return no focusin announced is not measured, and says so', unheardReturn.findings.length === 1 && unheardReturn.findings[0].includes('was not measured'));
  const lateParent = keyboardFindings(leave(state({ active: 'body', inMount: false, leaf: null }), [], { after: { pressed: true, samples: 96, landedMs: null, steps: [], final: state({ active: 'body', inMount: false, leaf: null }) } }), ctx);
  check('a keyboard on nothing is ONE finding, and the clock adds none', lateParent.findings.length === 1 && lateParent.findings[0].includes('the keyboard is on body'));

  // Reading three, the attack verifier's A1, in its three measured shapes.
  const fileLeave = (final, arrivedIn, inBuffer) =>
    leave(final, arrivedIn, { how: 'file', origin: 'file', needle: 'p289headfile', inBuffer });
  const editorState = (over) => state({ active: 'div.native-edit-context', inMount: false, atOrigin: true, leaf: null, ...over });
  const back = keyboardFindings(fileLeave(editorState({}), [], true), ctx);
  check('the file that held the keyboard holding it again is clean', back.findings.length === 0 && back.notes.length === 0);
  const firstBuild = keyboardFindings(fileLeave(state({}), ['split-4'], false), ctx);
  check(
    'the first build, which sent the file’s keyboard to the session, is ONE finding that names the session',
    firstBuild.findings.length === 1 &&
      firstBuild.findings[0].includes('arrived in split-4') &&
      firstBuild.findings[0].includes('a session they were not in')
  );
  const fileParent = keyboardFindings(fileLeave(state({ active: 'body', inMount: false, leaf: null }), [], false), ctx);
  check(
    'the parent on reading three is ONE finding that says body and nowhere',
    fileParent.findings.length === 1 && fileParent.findings[0].includes('is on body') && fileParent.findings[0].includes('goes nowhere')
  );
  const notTyped = keyboardFindings(fileLeave(editorState({}), [], false), ctx);
  check('the element holding it again with the buffer unchanged is a finding', notTyped.findings.length === 1 && notTyped.findings[0].includes("not in the file's buffer"));
  const fileLate2 = keyboardFindings({ ...fileLeave(editorState({}), [], true), after: { pressed: true, samples: 96, landedMs: 250, steps: [], final: editorState({}) } }, ctx);
  check('reading three is graded on the clock as well: a late return to the file is a finding', fileLate2.findings.length === 1 && fileLate2.findings[0].includes('came back 250 ms'));

  const onePane = keyboardFindings(leave(state({ leaf: 'L1', outlinedLeaf: 'L1' }), ['p137-kb']), { ...ctx, leafCount: 1 });
  check('a split that was not staged fails reading two rather than passing it', onePane.findings.length === 1 && onePane.findings[0].includes('not driven'));

  check('a build newer than its sources is not stale', staleSentence([['a.ts', 100]], ['out/x.js', 200]) === null);
  check('a source newer than the build is stale, by name', (staleSentence([['a.ts', 5200]], ['out/x.js', 200]) ?? '').includes('a.ts is 5.0 s newer'));
  check('no bundle at all is stale', (staleSentence([], null) ?? '').includes('build first'));

  check('no P137_RUNS is every launch', chooseRuns('').runs.length === ALL_RUNS.length);
  check('P137_RUNS keeps the run order', chooseRuns('keyboard, project').runs.join(',') === 'project,keyboard');
  check('an unknown launch is named', chooseRuns('keyboard,keybord').bad.join(',') === 'keybord');

  for (const f of failures) console.error(`${TAG} graders FAIL: ${f}`);
  say(`graders ${failures.length === 0 ? 'PASS' : 'FAIL'}: ${String(checks - failures.length)} of ${String(checks)} grader checks`);
  return failures.length === 0;
}

if (process.argv.includes('--graders')) process.exit(selfTest() ? 0 : 1);

const socket = (process.env['GMUX_TMUX_SOCKET'] ?? '').trim();
if (socket === '') {
  refuse(
    'no GMUX_TMUX_SOCKET. Run me through the harness so I get a socket of my own: ' +
      "node build/harness-socket.mjs gmux-p137-overview 'node build/probe-p137-overview.mjs'"
  );
}
if (socket === 'gmux' || socket === 'default') {
  refuse(`refusing to run on "${socket}", which is not a harness socket`);
}

// Phase 289. The checkout whose BUILD is measured: this one, or the parent's.
// Only the app's cwd and its out/ move. The fixtures, the drive, the readers
// and the pictures' directory stay this checkout's.
const parentCheckout = (process.env['P137_PARENT_CHECKOUT'] ?? '').trim();
const checkout = parentCheckout !== '' ? resolve(parentCheckout) : repoRoot;
const tag = parentCheckout !== '' ? 'parent' : 'head';
if (!existsSync(join(checkout, 'out', 'main', 'index.js'))) {
  refuse(
    `${join(checkout, 'out', 'main', 'index.js')} is missing. ` +
      (parentCheckout !== ''
        ? 'P137_PARENT_CHECKOUT must name a BUILT worktree: run npm run build in that checkout first.'
        : 'Run npm run build first.')
  );
}

const { runs: chosenRuns, bad: badRuns } = chooseRuns(process.env['P137_RUNS']);
if (badRuns.length > 0) {
  refuse(`P137_RUNS names ${badRuns.join(', ')}; the launches are ${ALL_RUNS.join(', ')}.`);
}
if (chosenRuns.length === 0) refuse('P137_RUNS chose nothing.');

// THE BUILD IS THE THING MEASURED, and `npm run probe:p137` is the only way
// in that builds first. The parent run and a verifier's second run both come
// through the harness directly, over an out/ somebody built earlier.
if (chosenRuns.includes('keyboard')) {
  const sources = KEYBOARD_SOURCES.map((rel) => {
    const path = join(checkout, rel);
    return [rel, existsSync(path) ? statSync(path).mtimeMs : 0];
  });
  const assets = join(checkout, 'out', 'renderer', 'assets');
  let bundle = null;
  if (existsSync(assets)) {
    for (const name of readdirSync(assets)) {
      const mtime = statSync(join(assets, name)).mtimeMs;
      if (bundle === null || mtime > bundle[1]) bundle = [join('out', 'renderer', 'assets', name), mtime];
    }
  }
  const stale = staleSentence(sources, bundle);
  if (stale !== null) refuse(`${tag}: ${stale}`);
}

const outDir = resolve(
  repoRoot,
  (process.env['P137_OUT_DIR'] ?? '').trim() || (tag === 'parent' ? 'out/p137-parent' : 'out/p137')
);
mkdirSync(outDir, { recursive: true });
say(`measuring the ${tag} build at ${checkout}; launches: ${chosenRuns.join(', ')}`);

/** The operator's live server, listed and never written. Named once. */
function operatorSessionCount() {
  const out = spawnSync('tmux', ['-L', 'gmux', 'list-sessions'], { encoding: 'utf8' });
  return (out.stdout ?? '').split('\n').filter((l) => l.trim() !== '').length;
}

const operatorBefore = operatorSessionCount();
say(`operator sessions on -L gmux before: ${String(operatorBefore)}`);
say(`harness socket: ${socket}`);

// ---------------------------------------------------------------------------
// The scratch world: a home, a project, a seed
// ---------------------------------------------------------------------------

const FIXTURES = join(repoRoot, 'docs', 'research', 'assets', '63-fixtures');
const scratchBase = process.env['GMUX_HARNESS_DIR'] ?? process.env['TMPDIR'] ?? tmpdir();
const rawRoot = join(scratchBase, 'gmux-p137-overview');
rmSync(rawRoot, { recursive: true, force: true });
mkdirSync(join(rawRoot, 'p137-project', 'scripts'), { recursive: true });
mkdirSync(join(rawRoot, 'home'), { recursive: true });
const root = realpathSync(rawRoot);
const project = join(root, 'p137-project');
const home = join(root, 'home');
// Phase 289. The keyboard launch is the first one here whose panes run a real
// shell. A scratch HOME with no .zshrc makes zsh open its new-user
// questionnaire in the pane instead of a prompt, and the questionnaire eats
// the string the reading types (build/p288/probe-p288.mjs hit the same thing).
writeFileSync(join(home, '.zshrc'), "PS1='p137 %# '\n", 'utf8');
writeFileSync(join(home, '.hushlogin'), '', 'utf8');

/** qwen's encoding, copied from src/main/manifest/harvest/stores.ts. */
const sanitizeQwenCwd = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, '-');

const IDS = {
  claude: '11111111-2222-4333-8444-555555555555',
  codex: '0000aaaa-1111-7000-8000-222233334444',
  grok: '0199aaaa-1111-7000-8000-abcdefabcdef',
  deepseek: '00000000-0000-4000-8000-000000000001',
  qwen: '11111111-2222-4333-8444-555555555555',
  claude7: 'bbbbbbbb-2222-4333-8444-777777777777'
};

function place(rel, fixtureName) {
  const dst = join(home, rel);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(FIXTURES, fixtureName), dst);
}

place(join('.claude', 'projects', project.replace(/\//g, '-'), `${IDS.claude}.jsonl`), 'claude-session.jsonl');

// Phase 137.1. Two turns appended to the claude COPY, never to the committed
// fixture. The first carries the hostile answer the backlog entry names, so
// the DOM reading below can prove a script tag, an img onerror, an iframe
// and a javascript: link reach nothing. The second is the markdown showcase
// the photographs are read for, being a list, a fence and inline code, with
// an ask that carries a literal asterisk to prove asks stay plain.
{
  const claudeCopy = join(home, '.claude', 'projects', project.replace(/\//g, '-'), `${IDS.claude}.jsonl`);
  const base = {
    isSidechain: false,
    userType: 'external',
    entrypoint: 'cli',
    cwd: '/Users/dev/demo-app',
    sessionId: IDS.claude,
    version: '2.1.238',
    gitBranch: 'main'
  };
  const ask = (uuid, ts, text, promptId) =>
    JSON.stringify({
      parentUuid: null,
      ...base,
      type: 'user',
      message: { role: 'user', content: text },
      uuid,
      timestamp: ts,
      promptSource: 'typed',
      promptId,
      origin: { kind: 'human' }
    });
  const answer = (uuid, ts, text) =>
    JSON.stringify({
      parentUuid: null,
      ...base,
      message: {
        model: 'claude-opus-5',
        id: `msg_${uuid.slice(0, 8)}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }]
      },
      requestId: `req_${uuid.slice(0, 8)}`,
      type: 'assistant',
      uuid,
      timestamp: ts
    });
  const hostileAnswer = [
    'Before the attack.',
    '<script>window.gmux.terminalWrite("rm -rf ~")</script>',
    '<img src=x onerror="fetch(\'https://evil.example/x\')">',
    '<iframe src="https://evil.example/frame"></iframe>',
    '[click me](javascript:alert(document.title))',
    'After the attack.'
  ].join('\n\n');
  const showcaseAnswer = [
    'The release steps, in order:',
    '',
    '- build the DMG',
    '- staple the ticket',
    '- run `scripts/release.sh` last',
    '',
    '```sh',
    'sh scripts/release.sh --dry-run',
    '```',
    '',
    'The dry run printed the order above and nothing else changed.'
  ].join('\n');
  const lines = [
    ask('aaaa0001-1111-4111-8111-111111111111', '2026-08-20T10:07:00.000Z', 'please try rendering some html in your answer so we can see what happens', 'p-0101'),
    answer('aaaa0002-1111-4111-8111-111111111111', '2026-08-20T10:07:30.000Z', hostileAnswer),
    ask('aaaa0003-1111-4111-8111-111111111111', '2026-08-20T10:08:00.000Z', 'can you list the release steps and mark the *manual* one with `code`', 'p-0102'),
    answer('aaaa0004-1111-4111-8111-111111111111', '2026-08-20T10:08:40.000Z', showcaseAnswer)
  ];
  writeFileSync(claudeCopy, readFileSync(claudeCopy, 'utf8') + lines.join('\n') + '\n', 'utf8');
}
// Phase 137.2. A sixty ask conversation, GENERATED into the scratch home
// and never committed anywhere. It is a second claude session in the same
// project, so the rail's long run and the narrow run have a conversation
// deep enough that the rail must scroll. The reader caps the view at its
// own turn limit, which is fine: the rail draws the rows the view holds.
{
  const dir = join(home, '.claude', 'projects', project.replace(/\//g, '-'));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${IDS.claude7}.jsonl`);
  const base = {
    isSidechain: false,
    userType: 'external',
    entrypoint: 'cli',
    cwd: project,
    sessionId: IDS.claude7,
    version: '2.1.238',
    gitBranch: 'main'
  };
  const pad = (n) => String(n).padStart(4, '0');
  const lines = [];
  for (let i = 0; i < 60; i += 1) {
    const askAt = new Date(Date.UTC(2026, 7, 20, 6, 0, 0) + i * 60_000).toISOString();
    const ansAt = new Date(Date.UTC(2026, 7, 20, 6, 0, 30) + i * 60_000).toISOString();
    lines.push(
      JSON.stringify({
        parentUuid: null,
        ...base,
        type: 'user',
        message: {
          role: 'user',
          content: `drill ask ${pad(i)}: run the release drill again and tell me what changed`
        },
        uuid: `bbbb${pad(i)}-1111-4111-8111-111111111111`,
        timestamp: askAt,
        promptSource: 'typed',
        promptId: `p-7-${pad(i)}`,
        origin: { kind: 'human' }
      })
    );
    lines.push(
      JSON.stringify({
        parentUuid: null,
        ...base,
        message: {
          model: 'claude-opus-5',
          id: `msg_b${pad(i)}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: `the drill ran clean on pass ${pad(i)} and nothing changed` }]
        },
        requestId: `req_b${pad(i)}`,
        type: 'assistant',
        uuid: `cccc${pad(i)}-1111-4111-8111-111111111111`,
        timestamp: ansAt
      })
    );
  }
  writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}
place(
  join('.codex', 'sessions', '2026', '08', '19', `rollout-2026-08-19T10-05-03-${IDS.codex}.jsonl`),
  `codex-rollout-2026-08-19T10-05-03-${IDS.codex}.jsonl`
);
place(join('.grok', 'sessions', encodeURIComponent(project), IDS.grok, 'updates.jsonl'), 'grok-updates.jsonl');
place(join('.grok', 'sessions', encodeURIComponent(project), IDS.grok, 'summary.json'), 'grok-summary.json');
place(join('.deepseek', 'sessions', `${IDS.deepseek}.json`), 'deepseek-session.json');
place(join('.qwen', 'projects', sanitizeQwenCwd(project), 'chats', `${IDS.qwen}.jsonl`), 'qwen-chat.jsonl');
place(join('.qwen', 'projects', sanitizeQwenCwd(project), 'chats', `${IDS.qwen}.runtime.json`), 'qwen-chat.runtime.json');

// The project. Two commits. The second touches scripts/release.sh, dated
// after every fixture timestamp because it is committed today. Nothing ever
// commits src/nest_counter.py, so the codex turn has no git record to show.
writeFileSync(join(project, 'README.md'), '# Phase 137 scratch project\n', 'utf8');
const git = (...args) => {
  const r = spawnSync(
    'git',
    ['-C', project, '-c', 'user.name=p137', '-c', 'user.email=p137@harness.invalid', ...args],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) refuse(`git ${args.join(' ')} failed: ${r.stderr}`);
};
git('init', '-q');
git('add', 'README.md');
git('commit', '-q', '-m', 'first');
writeFileSync(join(project, 'scripts', 'release.sh'), '#!/bin/sh\necho signed\n', 'utf8');
git('add', 'scripts/release.sh');
git('commit', '-q', '-m', 'sign the release script');

const seedPath = join(root, 'overview-seed.json');
const startedAt = Date.UTC(2026, 7, 20, 8, 0, 0);
writeFileSync(
  seedPath,
  JSON.stringify([
    { name: 'claude-6', agent: 'claude', agentSessionId: IDS.claude, cwd: project, createdAt: startedAt },
    { name: 'claude-7', agent: 'claude', agentSessionId: IDS.claude7, cwd: project, createdAt: Date.UTC(2026, 7, 20, 6, 0, 0) },
    { name: 'codex-2', agent: 'codex', agentSessionId: IDS.codex, cwd: project, createdAt: Date.UTC(2026, 7, 19, 10, 0, 0) },
    { name: 'grok-1', agent: 'grok', agentSessionId: IDS.grok, cwd: project, createdAt: startedAt },
    { name: 'deepseek-1', agent: 'deepseek', agentSessionId: IDS.deepseek, cwd: project, createdAt: startedAt },
    { name: 'qwen-1', agent: 'qwen', agentSessionId: IDS.qwen, cwd: project, createdAt: startedAt },
    { name: 'shell-2', agent: 'shell', agentSessionId: null, cwd: project, createdAt: startedAt }
  ]),
  'utf8'
);

// ---------------------------------------------------------------------------
// The reading each driven window returns
// ---------------------------------------------------------------------------

/**
 * The DOM reading. Markup independent on purpose: it reads text and rectangles
 * and never assumes a class name beyond `.overview-layer` and `.shell`.
 *
 * @param {object} spec  extra checks per launch
 */
function readerJs(spec) {
  return `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    ${spec.press === true ? PRESS_JS : ''}
    // Wait for the layer to hold text, up to 20 s.
    const deadline = Date.now() + 20000;
    let layer = null;
    while (Date.now() < deadline) {
      layer = document.querySelector('.overview-layer');
      if (layer !== null && (layer.innerText || '').trim() !== '' ) break;
      if (${JSON.stringify(spec.press === true)}) break;
      await wait(400);
    }
    ${spec.press === true ? 'await wait(80);' : 'await wait(600);'}
    const shell = document.querySelector('.shell');
    const shellClass = shell === null ? null : shell.className;
    const durPanel = shell === null ? null : getComputedStyle(shell).getPropertyValue('--dur-panel').trim();
    layer = document.querySelector('.overview-layer');
    if (layer === null) {
      return { error: 'the overview layer is not on the page', shellClass, durPanel };
    }
    const r = layer.getBoundingClientRect();
    const rect = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
    const win = { w: window.innerWidth, h: window.innerHeight };
    const scroller = document.scrollingElement;
    const fits = rect.width <= win.w && rect.top + rect.height <= win.h + 1 && scroller.scrollWidth <= win.w;

    // Every digit run outside a clock, a date, an elapsed time or quoted
    // conversation text. The list must be empty.
    const allowed = (el) => el !== null && el.closest('[data-clock],[data-date],[data-age],[data-quoted]') !== null;
    const digitRuns = [];
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent || '';
      if (!/[0-9]/.test(text)) continue;
      if (allowed(node.parentElement)) continue;
      for (const m of text.match(/[0-9]+/g) || []) digitRuns.push(m);
    }

    // Phase 137.1. The answers render as markdown through a lazily loaded
    // chunk, so give the chunk a moment where an answer is on the page.
    if (layer.querySelector('.md-answer') !== null) {
      const mdDeadline = Date.now() + 5000;
      while (Date.now() < mdDeadline && layer.querySelector('.md-answer-rendered') === null) {
        await wait(100);
      }
      await wait(200);
    }

    // The hostile shapes the Phase 137.1 entry names, read off the LIVE DOM.
    // Every count must be zero on every view.
    const hostile = {
      scriptOrIframe: layer.querySelectorAll('script, iframe').length,
      onerrorAttrs: layer.querySelectorAll('[onerror]').length,
      javascriptHrefs: Array.from(layer.querySelectorAll('a')).filter(
        (a) => (a.getAttribute('href') || '').trim().toLowerCase().startsWith('javascript:')
      ).length
    };
    // What the markdown actually drew, for the runs that show an answer.
    const markdown = {
      rendered: layer.querySelectorAll('.md-answer-rendered').length,
      listItems: layer.querySelectorAll('.md-answer-rendered ul li, .md-answer-rendered ol li').length,
      fences: layer.querySelectorAll('.md-answer-rendered pre code').length,
      inlineCode: layer.querySelectorAll('.md-answer-rendered :not(pre) > code').length
    };

    // Phase 137.2. The ask rail, read by rectangle and by index.
    let rail = null;
    ${spec.rail === true ? RAIL_READ_JS : ''}
    let railDrive = null;
    ${spec.railDrive === true ? RAIL_DRIVE_JS : ''}

    const flat = (layer.innerText || '').replace(/\\s+/g, ' ').trim();
    const gitMarks = ['git agrees', 'git has no record', 'nothing to check'].filter((s) => flat.includes(s));
    const namesShown = ${JSON.stringify(spec.names ?? [])}.filter((n) => flat.includes(n));
    return {
      shellClass,
      durPanel,
      rect,
      win,
      fits,
      digitRuns,
      gitMarks,
      namesShown,
      hostile,
      markdown,
      rail,
      railDrive,
      textHead: flat.slice(0, 1500)
    };
  } catch (err) {
    return { error: String((err && err.stack) || err) };
  }
})()`;
}

/**
 * Phase 137.2. The rail's still reading: presence, row count against turn
 * count, its own scrollability, the header's agent mark, and which row
 * carries the current tick.
 */
const RAIL_READ_JS = `
    {
      const railEl = layer.querySelector('.overview-ask-rail');
      const conv = layer.querySelector('.overview-scroll');
      rail = {
        present: railEl !== null,
        visible:
          railEl !== null &&
          getComputedStyle(railEl).display !== 'none' &&
          railEl.getClientRects().length > 0,
        rows: railEl === null ? 0 : railEl.querySelectorAll('.overview-ask-rail-row').length,
        turns: layer.querySelectorAll('.overview-turn').length,
        railScrolls: railEl !== null && railEl.scrollHeight > railEl.clientHeight + 1,
        convScrolls: conv !== null && conv.scrollHeight > conv.clientHeight + 1,
        headerMark: layer.querySelector('.overview-session-title svg') !== null,
        marked:
          railEl === null
            ? -1
            : Array.from(railEl.querySelectorAll('.overview-ask-rail-row')).findIndex((r) =>
                r.classList.contains('current')
              )
      };
    }
`;

/**
 * Phase 137.2. The rail driven for real: a press on a row, a wheel scroll,
 * ArrowUp at repeat speed with a rectangle read per press, then Tab into the
 * rail, Return to jump and Escape back through the window ladder. Everything
 * is asserted node side from the numbers this returns.
 */
const RAIL_DRIVE_JS = `
    {
      const layerEl = document.querySelector('.overview-layer');
      const conv = layer.querySelector('.overview-scroll');
      const railEl = layer.querySelector('.overview-ask-rail');
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))));
      const rows = () => Array.from(railEl.querySelectorAll('.overview-ask-rail-row'));
      const marked = () => rows().findIndex((r) => r.classList.contains('current'));
      const cursorAt = () => rows().findIndex((r) => r.classList.contains('cursor'));
      const selRect = () => {
        const el = conv.querySelector('.overview-turn.selected');
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      };
      const box = conv.getBoundingClientRect();
      const inView = () => {
        const r = selRect();
        return r !== null && r.bottom > box.top + 1 && r.top < box.bottom - 1;
      };
      const press = (k) => {
        layerEl.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      };

      // One press on a rail row lands the conversation on that exchange.
      const clickIndex = 5;
      rows()[clickIndex].click();
      await frame();
      const click = { wanted: clickIndex, marked: marked(), inView: inView() };

      // A wheel scroll moves no selection.
      const beforeWheel = marked();
      conv.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, bubbles: true, cancelable: true }));
      conv.scrollTop += 240;
      await frame();
      const wheel = { before: beforeWheel, after: marked(), scrollMoved: conv.scrollTop > 0 };

      // Back to the newest exchange, then ArrowUp at repeat speed. Per press,
      // the marked rail row and whether the selected exchange's rectangle
      // sits inside the conversation's viewport.
      rows()[rows().length - 1].click();
      await frame();
      const repeat = [];
      for (let i = 0; i < 12; i += 1) {
        press('ArrowUp');
        await frame();
        repeat.push({ marked: marked(), inView: inView() });
        await wait(30);
      }

      // Keyboard reach. Tab in, one arrow up, Return jumps, Escape returns
      // the keyboard through the WINDOW capture ladder with the page open.
      press('Tab');
      await frame();
      let keys = { wired: railEl.classList.contains('active') };
      if (keys.wired) {
        const c0 = cursorAt();
        press('ArrowUp');
        await frame();
        const c1 = cursorAt();
        press('Enter');
        await frame();
        const jump = { cursor: c1, marked: marked(), inView: inView() };
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await frame();
        keys = {
          wired: true,
          cursorMoved: c1 === c0 - 1,
          jump,
          stillOpen: document.querySelector('.overview-layer') !== null,
          railInactive: !railEl.classList.contains('active')
        };
      }
      railDrive = { click, wheel, repeat, keys };
    }
`;

/**
 * The real chord, dispatched on window. The keyboard sits on the shell, so
 * the level decision lands on 'project'.
 */
const PRESS_JS = `
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'U', code: 'KeyU', metaKey: true, shiftKey: true,
      bubbles: true, cancelable: true, view: window
    }));
`;

// ---------------------------------------------------------------------------
// One launch, one picture, one reading. Never two at a time.
// ---------------------------------------------------------------------------


async function launch(label, overviewSpec, jsSpec, extraEnv = {}) {
  const png = join(outDir, `p137-${label}.png`);
  rmSync(png, { force: true });
  const drive = { projectPath: project, overview: overviewSpec };
  say(`launch ${label}`);
  // build/electron-run.mjs owns the launch and ends the whole tree it started
  // in a finally block whatever happened here (Phase 140). The tree walk this
  // file used to carry lives there now, with a SIGTERM before it, because the
  // shim at node_modules/.bin/electron cannot forward SIGKILL.
  const { code, text } = await runElectron({
    label: `p137 ${label}`,
    userDataDir: join(root, `profile-${label}`),
    // Phase 289. The checkout being measured, which is this one unless
    // P137_PARENT_CHECKOUT named the parent's.
    cwd: checkout,
    env: {
      ...process.env,
      HOME: home,
      GMUX_SHOT: png,
      GMUX_SHOT_DELAY_MS: '9000',
      GMUX_OVERVIEW_SEED: seedPath,
      GMUX_SHOT_DRIVE: JSON.stringify(drive),
      GMUX_SHOT_JS: readerJs(jsSpec),
      ...extraEnv
    },
    ceilingMs: 300_000,
    settleMs: 500
  });
  const marker = '[gmux-shot] probe ';
  const at = text.lastIndexOf(marker);
  let report = null;
  if (at !== -1) {
    try {
      report = JSON.parse(text.slice(at + marker.length).split('\n')[0] ?? '');
    } catch {
      report = null;
    }
  }
  return { code, png: existsSync(png) ? png : null, report, text };
}

// ---------------------------------------------------------------------------
// The keyboard launch (Phase 289): four live panes, a devtools client, real keys
// ---------------------------------------------------------------------------

/**
 * The page kit. One expression, evaluated once, that puts this launch's
 * readers on window.__p137kb. It is the same text at HEAD and at the parent,
 * and no product file gains a hook.
 *
 * THE SELECTORS ARE SPELLED HERE BY VALUE, and on purpose: a build script
 * cannot import TypeScript, and a probe that read them out of
 * src/renderer/app/focus-flight.ts would agree with a wrong one. The mount is
 * the node `focusTerminal()` searches under, and the outlined pane is the pair
 * of marks focus-flight.ts names, `.split-pane.focused` from SplitSurface.tsx
 * and `.surface-single` from TerminalRegion.tsx, read the way
 * build/probe-session-focus.mjs's reading four reads them.
 *
 * `arm` listens for the leave key in the capture phase on `window`, which is
 * where src/renderer/app/keyboard.ts hears it. That handler was registered
 * first, and Chromium runs a microtask checkpoint between two listeners of
 * one event, so by the time this listener runs the leave, React's commit and
 * the phase's own observer have ALL already happened. Zero is therefore the
 * key event's own `timeStamp`, never this listener's clock, and what happened
 * in between is heard by the `focusin`, `focusout` and shell class recorders
 * that `arm` installs BEFORE the key is pressed. This file's observer is
 * created before the app's, so it is called first and reads the document as
 * the commit left it, which is `body`.
 */
const KEYBOARD_KIT = String.raw`(() => {
  const MOUNT = '.gmux-terminal-mount';
  const SURFACE = '[data-surface-leaves]';
  const OUTLINED = SURFACE + ' .split-pane.focused, ' + SURFACE + ' .surface-single';
  const desc = (el) => {
    if (el === null || el === undefined) return 'null';
    // Monaco hangs classes on body once a file is open, and body is body.
    if (el === document.body) return 'body';
    const classes = typeof el.className === 'string'
      ? el.className.trim().split(/\s+/).filter((c) => c !== '').join('.')
      : '';
    return el.tagName.toLowerCase() + (classes === '' ? '' : '.' + classes);
  };
  const leafOf = (el) => {
    const l = el !== null && typeof el.closest === 'function' ? el.closest('[data-split-leaf]') : null;
    return l === null ? null : l.getAttribute('data-split-leaf');
  };
  const read = () => {
    const ae = document.activeElement;
    const shell = document.querySelector('.shell');
    const marked = document.querySelector(OUTLINED);
    return {
      active: desc(ae),
      inMount: ae !== null && typeof ae.closest === 'function' && ae.closest(MOUNT) !== null,
      inEditor: ae !== null && typeof ae.closest === 'function' && ae.closest('.ed-panel') !== null,
      // The element reading three marked before the page, by identity.
      atOrigin: kit.origin !== null && ae === kit.origin,
      leaf: leafOf(ae),
      outlinedLeaf: marked === null ? null : marked.getAttribute('data-split-leaf'),
      shell: shell === null ? null : shell.className,
      overview: document.querySelector('.overview-layer') !== null
    };
  };
  const kit = { read, result: null, origin: null };
  // Reading three. The open file's text, as a point a real mouse press can
  // land on, the element that then holds the keyboard, and what the file
  // reads afterwards. The mark is a reference kept here, never an attribute,
  // so the app's DOM is as the app wrote it.
  kit.fileCenter = () => {
    const lines = document.querySelector('.ed-panel .monaco-editor .view-lines');
    if (lines === null) return null;
    const r = lines.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 40)) };
  };
  kit.markOrigin = () => {
    const ae = document.activeElement;
    kit.origin = ae === null || ae === document.body ? null : ae;
    return kit.origin !== null;
  };
  kit.buffer = () => {
    const lines = document.querySelector('.ed-panel .monaco-editor .view-lines');
    return lines === null ? null : lines.textContent;
  };
  kit.panes = () =>
    Array.from(document.querySelectorAll(SURFACE + ' [data-split-leaf]')).map((n) => n.getAttribute('data-split-leaf'));
  // The pointer press a click into a pane begins with, on the LAST pane.
  kit.outlineLast = () => {
    const leaves = Array.from(document.querySelectorAll(SURFACE + ' [data-split-leaf]'));
    const last = leaves.length > 1 ? leaves[leaves.length - 1] : null;
    if (last === null) return false;
    (last.querySelector('.split-pane-body') ?? last).dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );
    return true;
  };
  // The keyboard into the outlined pane, where a click into it leaves it.
  kit.holdOutlined = () => {
    const marked = document.querySelector(OUTLINED);
    const area = marked === null ? null : marked.querySelector('.xterm-helper-textarea');
    if (area === null) return false;
    area.focus();
    return document.activeElement === area;
  };
  kit.arm = (how) => {
    const matches = (e) =>
      how === 'escape'
        ? e.key === 'Escape'
        : (e.key === 'u' || e.key === 'U') && e.metaKey === true && e.shiftKey === true;
    // Armed BEFORE the key, on the page's own clock. They are re-based onto
    // the key's timeStamp once the key is heard, and what came before it is
    // dropped.
    const shell = document.querySelector('.shell');
    const heard = [];
    const rec = (kind, target) => {
      if (heard.length >= 400) return;
      const ae = document.activeElement;
      heard.push({
        t: performance.now(),
        kind,
        target: target === undefined ? null : desc(target),
        toTerminal: kind === 'focusin' && typeof target.closest === 'function' && target.closest(MOUNT) !== null,
        toOrigin: kind === 'focusin' && kit.origin !== null && target === kit.origin,
        active: desc(ae),
        shell: shell === null ? null : shell.className
      });
    };
    const onIn = (e) => rec('focusin', e.target);
    const onOut = (e) => rec('focusout', e.target);
    document.addEventListener('focusin', onIn, true);
    document.addEventListener('focusout', onOut, true);
    const watcher = shell === null ? null : new MutationObserver(() => rec('shell-class'));
    if (watcher !== null) watcher.observe(shell, { attributes: true, attributeFilter: ['class'] });
    const disarm = () => {
      document.removeEventListener('focusin', onIn, true);
      document.removeEventListener('focusout', onOut, true);
      if (watcher !== null) watcher.disconnect();
    };
    const tenth = (ms) => Math.round(ms * 10) / 10;
    kit.result = new Promise((resolve) => {
      const onKey = (e) => {
        if (!matches(e)) return;
        window.removeEventListener('keydown', onKey, true);
        clearTimeout(giveUp);
        // Zero is the key's own timeStamp, which is on performance.now()'s
        // timeline. This listener's own clock is printed beside it as
        // heardMs, and is how late the first build's zero was.
        const zero = e.timeStamp;
        const heardMs = tenth(performance.now() - zero);
        const steps = [];
        let last = '';
        let samples = 0;
        const sample = () => {
          const r = read();
          const ms = tenth(performance.now() - zero);
          samples += 1;
          const key = JSON.stringify(r);
          if (key !== last) {
            last = key;
            steps.push(Object.assign({ ms }, r));
          }
          return ms;
        };
        sample();
        const timer = setInterval(() => {
          if (sample() < ${String(KEYBOARD_WINDOW_MS)}) return;
          clearInterval(timer);
          disarm();
          const events = heard
            .filter((h) => h.t >= zero)
            .map((h) => ({ ms: tenth(h.t - zero), kind: h.kind, target: h.target, toTerminal: h.toTerminal, toOrigin: h.toOrigin, active: h.active, shell: h.shell }));
          const final = read();
          // The first focusin that put the keyboard where it ended up.
          const landed = events.find((h) => h.kind === 'focusin' && (final.atOrigin ? h.toOrigin : h.toTerminal));
          const gone = events.find((h) => h.kind === 'shell-class' && !String(h.shell ?? '').split(/\s+/).includes('overview-open'));
          resolve({
            pressed: true,
            steps,
            samples,
            heardMs,
            events,
            landedMs: landed === undefined ? null : landed.ms,
            classGoneMs: gone === undefined ? null : gone.ms,
            final
          });
        }, ${String(KEYBOARD_POLL_MS)});
      };
      const giveUp = setTimeout(() => {
        window.removeEventListener('keydown', onKey, true);
        disarm();
        resolve({ pressed: false, steps: [], samples: 0, heardMs: null, events: [], landedMs: null, classGoneMs: null, final: read() });
      }, 3000);
      window.addEventListener('keydown', onKey, true);
    });
    return true;
  };
  kit.collect = () => kit.result;
  window.__p137kb = kit;
  return true;
})()`;

/**
 * What holds the harness open after the drive. src/main/harness/shot.ts
 * awaits GMUX_SHOT_JS before it photographs and quits, so a promise this file
 * resolves over devtools keeps the four panes alive for exactly as long as the
 * readings take. The timer is the way out when this file is gone: the harness
 * still photographs, cleans up the sessions the drive made and quits.
 */
const KEYBOARD_HOLD_MS = 90_000;
const KEYBOARD_HOLD_JS =
  `new Promise((r) => { window.__p137Release = r; ` +
  `setTimeout(() => r({ keyboardHold: 'timed out' }), ${String(KEYBOARD_HOLD_MS)}); })`;
const KEYBOARD_RELEASE_JS = `typeof window.__p137Release === 'function' ? (window.__p137Release({ keyboardHold: 'released' }), true) : false`;

/** `DevToolsActivePort` in the launch's own profile, never a guessed port. */
async function targetsFor(profileDir) {
  const port = Number(
    readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim()
  );
  if (!Number.isFinite(port) || port <= 0) throw new Error('no devtools port yet');
  return await (await fetch(`http://127.0.0.1:${String(port)}/json/list`)).json();
}

/**
 * Attach to the main window once it is listed. build/probe-session-focus.mjs's
 * own, with its reason for `stillRunning`: an Electron that has already exited
 * leaves a stale port file behind, and a loop that kept asking it would hold
 * the run for the whole timeout after the app was gone.
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
    if (!stillRunning()) throw new Error(`the app exited before its window was listed: ${lastWhy}`);
    if (Date.now() - started > timeoutMs) {
      throw new Error(`no main window target within ${String(timeoutMs / 1000)} s: ${lastWhy}`);
    }
    await sleep(200);
  }
}

/** CDP's modifier bits. Meta is 4 and Shift is 8, so ⇧⌘ is 12. */
const META_SHIFT = 12;

/** A REAL key, down and up, delivered to whatever holds the keyboard. */
async function pressKey(cdp, key, code, vk, modifiers = 0) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', ...base }, 5_000);
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, 5_000);
}
const pressOverviewChord = (cdp) => pressKey(cdp, 'U', 'KeyU', 85, META_SHIFT);
const pressEscape = (cdp) => pressKey(cdp, 'Escape', 'Escape', 27);

/** A REAL mouse press and release at a point in the app window. */
async function clickAt(cdp, x, y) {
  const base = { x, y, button: 'left', clickCount: 1 };
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, 5_000);
  await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...base }, 5_000);
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base }, 5_000);
}

/** Lowercase letters and digits, one real key each, carrying their text. */
async function typeText(cdp, text) {
  for (const ch of text) {
    const code = /[a-z]/.test(ch) ? `Key${ch.toUpperCase()}` : `Digit${ch}`;
    const vk = ch.toUpperCase().charCodeAt(0);
    const base = { key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, ...base }, 5_000);
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, 5_000);
  }
}

/**
 * The tmux session names on the HARNESS socket whose pane shows `needle`.
 * This is the ground truth the active element is held against: a textarea can
 * read as focused and still deliver nothing. Synchronous on purpose, so this
 * file starts no process it does not wait for.
 */
function sessionsShowing(needle) {
  const listed = spawnSync('tmux', ['-L', socket, 'list-panes', '-a', '-F', '#{session_name}\t#{pane_id}'], {
    encoding: 'utf8'
  });
  const names = [];
  for (const line of (listed.stdout ?? '').split('\n')) {
    const [name, id] = line.trim().split('\t');
    if (!name || !id) continue;
    const shown = spawnSync('tmux', ['-L', socket, 'capture-pane', '-p', '-t', id], { encoding: 'utf8' });
    if ((shown.stdout ?? '').includes(needle) && !names.includes(name)) names.push(name);
  }
  return names;
}

/** One state of the app window, the way the entry's measurement reads. */
function describeState(r, nameOf) {
  if (r === null || r === undefined) return 'no reading';
  const pane = (leaf) => (leaf === null || leaf === undefined ? 'none' : (nameOf(leaf) ?? leaf));
  return (
    `active=${r.active} inTerminal=${String(r.inMount)} whereItWas=${String(r.atOrigin === true)} pane=${pane(r.leaf)} ` +
    `outlined=${pane(r.outlinedLeaf)} shell="${r.shell ?? 'no .shell'}" page=${r.overview ? 'drawn' : 'gone'}`
  );
}

/**
 * The eighth launch. One Electron through withElectron, which ends the tree
 * and the scratch tmux server in its finally block whatever this body did.
 * Everything a reading needs is kept in `reading` as it is taken, so a throw
 * half way, or the helper's own census finding after the body returned, still
 * leaves the numbers that were read in the report.
 */
async function launchKeyboard() {
  const label = 'keyboard';
  const png = join(outDir, `p137-${label}.png`);
  rmSync(png, { force: true });
  const profile = join(root, `profile-${label}`);
  const findings = [];
  const notes = [];
  const reading = { tag, checkout, sessions: [], panes: [], firstLeaf: null, preparation: null, driven: [], exit: null };
  // Reading three needs an open file. It is written here and not with the
  // rest of the scratch project, because this launch goes last and the seven
  // before it photograph a project that does not have it.
  writeFileSync(join(project, KEYBOARD_FILE), 'first line\n', 'utf8');
  const drive = {
    projectPath: project,
    session: { agent: 'shell', name: 'p137-kb' },
    splitGrid: true,
    openRel: KEYBOARD_FILE,
    mode: 'file'
  };
  say(`launch ${label}`);

  try {
    await withElectron(
      {
        label: `p137 ${label} ${tag}`,
        userDataDir: profile,
        // The four shells run on the harness socket, so the helper is handed
        // it and ends that server in the same finally block as the app.
        tmuxSocket: socket,
        cwd: checkout,
        // Read back from the profile's DevToolsActivePort, never guessed.
        args: ['--remote-debugging-port=0'],
        env: {
          ...process.env,
          HOME: home,
          GMUX_TMUX_SOCKET: socket,
          GMUX_SHOT: png,
          GMUX_SHOT_VERBOSE: '1',
          GMUX_SHOT_DELAY_MS: '2500',
          GMUX_SHOT_DRIVE: JSON.stringify(drive),
          GMUX_SHOT_JS: KEYBOARD_HOLD_JS
        }
      },
      async (handle) => {
        let gone = false;
        handle.child.once('exit', () => {
          gone = true;
        });
        let cdp = null;
        try {
          cdp = await attachMain(profile, 60_000, () => !gone);
          // The page believes it is focused, as it is under a person, so focus
          // events fire rather than waiting for the window to be frontmost.
          // The harness raises the window as well; this is for the moment the
          // operator's own work comes in front of it.
          await cdp.call('Emulation.setFocusEmulationEnabled', { enabled: true }, 5_000).catch(() => undefined);

          // The drive is over when the hold exists, because shot.ts evaluates
          // GMUX_SHOT_JS only after the drive has said it is ready.
          const waitingSince = Date.now();
          for (;;) {
            const held = await cdpEval(cdp, `typeof window.__p137Release === 'function'`, 5_000).catch(() => false);
            if (held === true) break;
            if (gone) throw new Error('the app exited before its drive finished');
            if (Date.now() - waitingSince > 75_000) throw new Error('the drive did not finish in 75 s');
            await sleep(250);
          }
          say(`keyboard: the drive finished ${String(Date.now() - waitingSince)} ms after the attach`);

          await cdpEval(cdp, KEYBOARD_KIT, 5_000);
          const read = () => cdpEval(cdp, 'window.__p137kb.read()', 5_000);
          reading.sessions = await cdpEval(
            cdp,
            `window.gmux.sessions.list().then((l) => l.map((s) => ({ id: s.id, name: s.name, tmuxName: s.tmuxName })))`,
            5_000
          );
          const nameOf = (leaf) => reading.sessions.find((s) => s.id === leaf)?.tmuxName ?? null;

          // The outline goes to the LAST pane, because the drive leaves the
          // first one selected and "the outlined pane" and "the first
          // textarea" are then the same element, which would let the document
          // order rule pass reading two.
          reading.panes = await cdpEval(cdp, 'window.__p137kb.panes()', 5_000);
          reading.firstLeaf = reading.panes[0] ?? null;
          const pressed = await cdpEval(cdp, 'window.__p137kb.outlineLast()', 5_000);
          await sleep(400);
          reading.preparation = { pressed, state: await read() };
          say(
            `keyboard: ${String(reading.panes.length)} panes [${reading.panes.map((l) => nameOf(l) ?? l).join(', ')}], ` +
              `after a press on the last: ${describeState(reading.preparation.state, nameOf)}`
          );
          const ctx = { leafCount: reading.panes.length, firstLeaf: reading.firstLeaf, nameOf };

          for (const { how, key, words, origin } of LEAVES) {
            const leave = { how, key, words, origin, needle: `p289${tag}${how}`, arrivedIn: [] };
            reading.driven.push(leave);

            if (origin === 'file') {
              // Reading three. A real mouse press into the open file's text,
              // which is how a person puts the keyboard there, and the
              // element that then holds it is the one that must hold it again.
              const point = await cdpEval(cdp, 'window.__p137kb.fileCenter()', 5_000);
              if (point !== null) {
                await clickAt(cdp, point.x, point.y);
                await sleep(300);
                await cdpEval(cdp, 'window.__p137kb.markOrigin()', 5_000);
              }
              leave.before = await read();
              say(`keyboard, ${how}: before the page  ${describeState(leave.before, nameOf)}`);
              if (point === null || leave.before.inEditor !== true || leave.before.atOrigin !== true) {
                leave.skipped = `the keyboard could not be put in the open file before the page opened (${leave.before.active}), so the leave was not measured`;
              }
            } else {
              // The keyboard in the outlined pane, which is where a person's
              // click left it. After a red leave it is on `body`, so this is
              // also what gives the second leave an honest start.
              const holding = await cdpEval(cdp, 'window.__p137kb.holdOutlined()', 5_000);
              await sleep(150);
              leave.before = await read();
              say(`keyboard, ${how}: before the page  ${describeState(leave.before, nameOf)}`);
              if (holding !== true || leave.before.inMount !== true) {
                leave.skipped = `the keyboard could not be put in the outlined pane before the page opened (${leave.before.active}), so the leave was not measured`;
              }
            }
            if (typeof leave.skipped !== 'string') {
              await pressOverviewChord(cdp);
              // Open means the commit has landed AND the enter flight's class
              // is off, then the layer's own fade is given time to end.
              const openBy = Date.now() + 5_000;
              let open = null;
              while (Date.now() < openBy) {
                const r = await read();
                const classes = (r.shell ?? '').split(/\s+/);
                if (r.overview && classes.includes('overview-open') && !classes.includes('gmux-focusing')) {
                  open = r;
                  break;
                }
                await sleep(50);
              }
              if (open === null) {
                leave.open = await read();
                leave.skipped = `⇧⌘U did not open the page in 5 s (${describeState(leave.open, nameOf)}), so the leave was not measured`;
              } else {
                await sleep(400);
                leave.open = await read();
                say(`keyboard, ${how}: the page is open  ${describeState(leave.open, nameOf)}`);

                await cdpEval(cdp, `window.__p137kb.arm(${JSON.stringify(key)})`, 5_000);
                if (key === 'escape') await pressEscape(cdp);
                else await pressOverviewChord(cdp);
                leave.after = await cdpEval(cdp, 'window.__p137kb.collect()', 5_000);

                // Printed whatever the outcome, from the key's own timeStamp:
                // what was heard, in the order Chromium delivered it, and
                // then every change the 5 ms sampler saw.
                for (const h of leave.after.events ?? []) {
                  say(
                    `keyboard, ${how}:   +${String(h.ms).padStart(6)} ms  ${h.kind}` +
                      `${h.target === null ? '' : `(${h.target})`}  active=${h.active} shell="${h.shell ?? 'no .shell'}"`
                  );
                }
                say(`keyboard, ${how}:   +${String(leave.after.heardMs).padStart(6)} ms  this file's own keydown listener ran, which is where the first build put zero`);
                for (const step of leave.after.steps ?? []) {
                  say(`keyboard, ${how}:   +${String(step.ms).padStart(6)} ms  sampled  ${describeState(step, nameOf)}`);
                }
                say(
                  `keyboard, ${how}: ${String(KEYBOARD_WINDOW_MS)} ms after ${words}  ${describeState(leave.after.final, nameOf)}; ` +
                    `the class left the shell ${leave.after.classGoneMs === null ? 'at no time that was heard' : `at +${String(leave.after.classGoneMs)} ms`}; ` +
                    `the keyboard came back ${leave.after.landedMs === null ? 'NEVER' : `at +${String(leave.after.landedMs)} ms`} ` +
                    `(bound ${String(KEYBOARD_RETURN_BOUND_MS)} ms, zero is the key's own timeStamp); ` +
                    `${String(leave.after.samples)} samples`
                );

                // What a person does next: they type.
                await typeText(cdp, leave.needle);
                await sleep(600);
                leave.arrivedIn = sessionsShowing(leave.needle);
                leave.settled = await read();
                say(
                  `keyboard, ${how}: "${leave.needle}" typed with real keys arrived in ` +
                    `${leave.arrivedIn.length === 0 ? 'NO session on the harness socket' : leave.arrivedIn.join(', ')}`
                );
                if (origin === 'file') {
                  leave.buffer = await cdpEval(cdp, 'window.__p137kb.buffer()', 5_000);
                  leave.inBuffer = typeof leave.buffer === 'string' && leave.buffer.includes(leave.needle);
                  say(`keyboard, ${how}: the file's buffer reads ${JSON.stringify(leave.buffer)}`);
                }
              }
            }
            const graded = keyboardFindings(leave, ctx);
            findings.push(...graded.findings);
            notes.push(...graded.notes);
          }
        } catch (err) {
          // A step that threw is a finding of THIS launch. The finally below
          // still lets the harness go, and the helper still ends the tree.
          findings.push(`keyboard: the launch stopped: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          if (cdp !== null) {
            await cdpEval(cdp, KEYBOARD_RELEASE_JS, 5_000).catch(() => undefined);
            try {
              cdp.close();
            } catch {
              // The app has already gone, and the socket with it.
            }
          }
          // Released, the harness photographs, ends the sessions its drive
          // made and quits by itself. The wait is bounded; the helper's
          // teardown is what ends an app that did not.
          reading.exit = await Promise.race([handle.exited, sleep(30_000).then(() => 'still running after 30 s')]);
          // The tmux server the app started inherits these two pipes, and node
          // does not exit while they are referenced
          // (build/probe-session-focus.mjs measured 13 minutes of it).
          handle.child.stdout?.destroy();
          handle.child.stderr?.destroy();
          if (findings.length > 0) reading.appTail = handle.text().slice(-4000);
        }
      }
    );
  } catch (err) {
    findings.push(`keyboard: ${err instanceof Error ? err.message : String(err)}`);
  }

  // null is a launch that never ran, and the catch above has already said why.
  if (reading.exit !== null && reading.exit !== 0) {
    findings.push(`keyboard: the app exited ${String(reading.exit)} after the readings, and the harness exits 0 when its drive, its picture and its cleanup all held`);
  }
  for (const note of notes) say(`note: ${note}`);
  writeFileSync(join(outDir, `p137-${label}.json`), JSON.stringify({ findings, notes, reading }, null, 2), 'utf8');
  return { png: existsSync(png) ? png : null, findings };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const failures = [];

async function main() {
  const runs = [
    {
      label: 'project',
      overview: { level: 'project' },
      js: { names: ['claude-6', 'codex-2', 'grok-1', 'deepseek-1', 'qwen-1', 'shell-2'] },
      wantNames: 6
    },
    {
      label: 'session',
      overview: { level: 'session', sessionNames: ['claude-6'] },
      js: { names: ['claude-6'] },
      wantGitMark: true,
      wantMarkdown: true
    },
    {
      label: 'several',
      overview: { level: 'several', sessionNames: ['claude-6', 'codex-2', 'grok-1'] },
      js: { names: ['claude-6', 'codex-2', 'grok-1'] },
      wantNames: 3,
      wantMarkdown: true
    },
    {
      label: 'flight',
      overview: { level: 'project', stretchFlightMs: 2000, pressOnly: true },
      js: { press: true },
      midFlight: true
    },
    // Phase 137.2. The rail at a short conversation: one row per ask, the
    // newest row marked, and the header wearing the agent's mark.
    {
      label: 'rail-short',
      overview: { level: 'session', sessionNames: ['qwen-1'] },
      js: { names: ['qwen-1'], rail: true },
      railShort: true
    },
    // Phase 137.2. The rail at sixty asks, driven: press, wheel, arrows at
    // repeat speed, Tab, Return and Escape, all read back as numbers.
    {
      label: 'rail-long',
      overview: { level: 'session', sessionNames: ['claude-7'] },
      js: { names: ['claude-7'], rail: true, railDrive: true },
      railLong: true
    },
    // Phase 137.2. The narrow window. The rail collapses before the
    // conversation does and the page still fits.
    {
      label: 'rail-narrow',
      overview: { level: 'session', sessionNames: ['claude-7'] },
      js: { names: ['claude-7'], rail: true },
      railNarrow: true,
      env: { GMUX_SHOT_SIZE: '960x700' }
    }
  ];

  // Phase 289. P137_RUNS chooses, and the order above is the order they run.
  const photographed = runs.filter((run) => chosenRuns.includes(run.label));
  const results = {};
  for (const run of photographed) {
    const res = await launch(run.label, run.overview, run.js, run.env ?? {});
    results[run.label] = res;
    if (res.png === null) failures.push(`${run.label}: no picture was written`);
    if (res.report === null) {
      failures.push(`${run.label}: the driven window printed no reading (electron exited ${String(res.code)})`);
      continue;
    }
    const rep = res.report;
    if (rep.error !== undefined && run.midFlight !== true) {
      failures.push(`${run.label}: the driver reported ${String(rep.error)}`);
      continue;
    }
    if (run.midFlight === true) {
      if (typeof rep.shellClass !== 'string' || !rep.shellClass.includes('gmux-focusing')) {
        failures.push(
          `flight: the shell class 80 ms after the chord is ${JSON.stringify(rep.shellClass)} and it must ` +
            'contain gmux-focusing. The picture would not be mid flight.'
        );
      }
      say(`flight: shell class "${String(rep.shellClass)}", --dur-panel ${String(rep.durPanel)} (stretched to 2000 ms)`);
      continue;
    }
    if (rep.fits !== true) {
      failures.push(
        `${run.label}: the page does not fit the window. Layer ${JSON.stringify(rep.rect)} in ` +
          `${JSON.stringify(rep.win)}.`
      );
    }
    if ((rep.digitRuns ?? []).length !== 0) {
      failures.push(
        `${run.label}: ${String(rep.digitRuns.length)} digit runs sit outside a clock, a date, an elapsed ` +
          `time or quoted text: ${rep.digitRuns.slice(0, 10).join(', ')}`
      );
    }
    if (run.wantNames !== undefined && (rep.namesShown ?? []).length < run.wantNames) {
      failures.push(
        `${run.label}: only ${String((rep.namesShown ?? []).length)} of ${String(run.wantNames)} session names ` +
          `are on the page: ${(rep.namesShown ?? []).join(', ')}`
      );
    }
    if (run.wantGitMark === true && (rep.gitMarks ?? []).length === 0) {
      failures.push(`${run.label}: no git mark text is on the page`);
    }
    // Phase 137.1. No hostile shape may reach the DOM, on any view.
    const hostile = rep.hostile ?? { scriptOrIframe: 0, onerrorAttrs: 0, javascriptHrefs: 0 };
    if (hostile.scriptOrIframe !== 0 || hostile.onerrorAttrs !== 0 || hostile.javascriptHrefs !== 0) {
      failures.push(
        `${run.label}: hostile markup reached the DOM: ${JSON.stringify(hostile)}`
      );
    }
    // Phase 137.1. The views that draw an answer must draw the showcase's
    // list, fence and inline code as those things.
    if (run.wantMarkdown === true) {
      const md = rep.markdown ?? { rendered: 0, listItems: 0, fences: 0, inlineCode: 0 };
      if (md.rendered === 0 || md.listItems === 0 || md.fences === 0 || md.inlineCode === 0) {
        failures.push(`${run.label}: the answer did not draw as markdown: ${JSON.stringify(md)}`);
      }
    }
    // Phase 137.2. The ask rail's own assertions, by index and rectangle.
    const rail = rep.rail ?? null;
    if (run.railShort === true) {
      if (rail === null || rail.present !== true || rail.visible !== true) {
        failures.push(`${run.label}: the rail is not on the page: ${JSON.stringify(rail)}`);
      } else {
        if (rail.rows !== rail.turns || rail.rows < 1) {
          failures.push(`${run.label}: the rail draws ${String(rail.rows)} rows for ${String(rail.turns)} turns`);
        }
        if (rail.marked !== rail.rows - 1) {
          failures.push(`${run.label}: the page opens at the newest exchange, so the marked rail row must be the last. It is ${String(rail.marked)} of ${String(rail.rows)}.`);
        }
        if (rail.headerMark !== true) {
          failures.push(`${run.label}: the header carries no agent mark`);
        }
      }
    }
    if (run.railLong === true) {
      if (rail === null || rail.present !== true || rail.visible !== true) {
        failures.push(`${run.label}: the rail is not on the page: ${JSON.stringify(rail)}`);
      } else {
        if (rail.rows < 40) failures.push(`${run.label}: only ${String(rail.rows)} rail rows for the sixty ask conversation`);
        if (rail.railScrolls !== true) failures.push(`${run.label}: the rail does not scroll on its own`);
        if (rail.convScrolls !== true) failures.push(`${run.label}: the conversation does not scroll`);
        if (rail.headerMark !== true) failures.push(`${run.label}: the header carries no agent mark`);
      }
      const drive = rep.railDrive ?? null;
      if (drive === null) {
        failures.push(`${run.label}: the rail drive returned nothing`);
      } else {
        if (drive.click.marked !== drive.click.wanted || drive.click.inView !== true) {
          failures.push(`${run.label}: a press on rail row ${String(drive.click.wanted)} landed on ${String(drive.click.marked)}, inView ${String(drive.click.inView)}`);
        }
        if (drive.wheel.after !== drive.wheel.before || drive.wheel.scrollMoved !== true) {
          failures.push(`${run.label}: a wheel scroll moved the selection from ${String(drive.wheel.before)} to ${String(drive.wheel.after)} (scrollMoved ${String(drive.wheel.scrollMoved)})`);
        }
        const startAt = (rail?.rows ?? 0) - 1;
        (drive.repeat ?? []).forEach((step, i) => {
          const want = Math.max(0, startAt - 1 - i);
          if (step.marked !== want) {
            failures.push(`${run.label}: repeat press ${String(i)} marked row ${String(step.marked)}, wanted ${String(want)}`);
          }
          if (step.inView !== true) {
            failures.push(`${run.label}: repeat press ${String(i)} left the selected exchange off screen`);
          }
        });
        if ((drive.repeat ?? []).length !== 12) {
          failures.push(`${run.label}: the repeat run pressed ${String((drive.repeat ?? []).length)} times, wanted 12`);
        }
        if (drive.keys.wired !== true) {
          failures.push(`${run.label}: Tab did not reach the rail. OverviewLayer must call handleSessionLevelKey first at the session level.`);
        } else {
          if (drive.keys.cursorMoved !== true) failures.push(`${run.label}: ArrowUp in the rail did not move the cursor by one`);
          if (drive.keys.jump.marked !== drive.keys.jump.cursor || drive.keys.jump.inView !== true) {
            failures.push(`${run.label}: Return in the rail landed on ${String(drive.keys.jump.marked)}, cursor was ${String(drive.keys.jump.cursor)}, inView ${String(drive.keys.jump.inView)}`);
          }
          if (drive.keys.stillOpen !== true) failures.push(`${run.label}: Escape in the rail closed the page`);
          if (drive.keys.railInactive !== true) failures.push(`${run.label}: Escape in the rail left the rail active`);
        }
      }
    }
    if (run.railNarrow === true) {
      if (rail === null || rail.present !== true) {
        failures.push(`${run.label}: the rail element is missing`);
      } else if (rail.visible !== false) {
        failures.push(`${run.label}: the rail is still visible at ${String(rep.win.w)} wide, and it must collapse before the conversation does`);
      }
      if (rep.win.w > 1000) {
        failures.push(`${run.label}: the window is ${String(rep.win.w)} wide, so the narrow photograph is not narrow`);
      }
    }
    say(
      `${run.label}: fits ${String(rep.fits)}, layer ${String(rep.rect.width)}x${String(rep.rect.height)} in ` +
        `${String(rep.win.w)}x${String(rep.win.h)}, digit runs outside allowed spans ${String((rep.digitRuns ?? []).length)}, ` +
        `git marks [${(rep.gitMarks ?? []).join(', ')}], names [${(rep.namesShown ?? []).join(', ')}], ` +
        `hostile ${JSON.stringify(rep.hostile ?? null)}, markdown ${JSON.stringify(rep.markdown ?? null)}`
    );
    writeFileSync(join(outDir, `p137-${run.label}.json`), JSON.stringify(rep, null, 2), 'utf8');
  }

  // Phase 289. The keyboard launch goes LAST, after every photograph, because
  // it is the one launch that ends the scratch tmux server on its way out.
  let keyboardFailed = null;
  if (chosenRuns.includes('keyboard')) {
    const res = await launchKeyboard();
    results['keyboard'] = res;
    if (res.png === null) failures.push('keyboard: no picture was written');
    failures.push(...res.findings);
    keyboardFailed = res.findings.length > 0;
  }

  console.log('');
  say(`pictures and readings are in ${outDir}`);
  for (const label of chosenRuns) {
    say(`  p137-${label}.png ${results[label]?.png ? 'written' : 'MISSING'}`);
  }
  // The parent run exists to show the keyboard reading RED. A parent that
  // passes it means the reading asserts nothing, and that is said out loud.
  if (tag === 'parent' && keyboardFailed !== null) {
    say(
      `the PARENT is expected to fail the keyboard launch: ${
        keyboardFailed ? 'it failed as expected' : 'it ALSO PASSES, so that reading asserts nothing'
      }`
    );
  }
}

await main();

const operatorAfter = operatorSessionCount();
console.log('');
say(`operator sessions on -L gmux after: ${String(operatorAfter)}`);
if (operatorAfter !== operatorBefore) {
  failures.push(`the operator's session count moved from ${String(operatorBefore)} to ${String(operatorAfter)}`);
}

rmSync(root, { recursive: true, force: true });

if (failures.length > 0) {
  console.log('');
  say(`FAIL (${tag}), ${String(failures.length)}:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
say(
  `PASS (${tag}). ${String(chosenRuns.length)} of ${String(ALL_RUNS.length)} launches, each with its picture and ` +
    'its reading, and the operator server untouched.'
);
