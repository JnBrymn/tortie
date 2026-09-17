#!/usr/bin/env node
/**
 * probe-redline-move-on.mjs — the operator's asks of 2026-09-16, in the app.
 *
 * He asked for three things over two sittings, in his own words:
 *
 *   1. "I want it to automatically forward to the next edit so I can do just
 *      keep doing option return if I want to keep approving... right now after
 *      I do option return I have to push option down to get the next edit."
 *   2. "when I press option delete, it should still go to the next available
 *      edit point, not just option return."
 *   3. "If I keep going past the end... I want it to flip over and go to the
 *      first edit point at the top of the document... And in reverse... to the
 *      last edit point so that it forms a loop instead of just hitting the
 *      end."
 *
 * So: a landed accept and a landed rewind both leave the person on the change
 * that was drawn AFTER the one they pressed, and both arrows loop — ⌥↓ past
 * the last change lands on the first, and ⌥↑ before the first lands on the
 * last.
 *
 * WHAT THIS RUN READS, all off the live DOM and the real disk, in ONE Electron:
 *
 *   H. THE HEAD SHAPE. One ⌥↓ marks the first change; ⌥↑ from there comes
 *      round to the LAST change and ⌥↓ from there comes back to the first. An
 *      accept then drops the picture by one, writes no byte of the file, and
 *      leaves the change that followed current with the keyboard on it and the
 *      chip drawn; a SECOND accept with no ⌥↓ between takes the next one; a
 *      rewind then WRITES the file, drops the picture by one, and leaves the
 *      change that followed current; the arrows still loop after a press; and
 *      accepting forward from there empties the document, after which every
 *      chord is a no-op and the keyboard is still in the view.
 *
 *   P. THE PARENT SHAPE, and it is why this probe takes a mode. The operator
 *      reported the missing moves against the build before this round, so the
 *      defect is SHOWN rather than asserted:
 *      `ACCEPT_ADVANCE_PARENT=1 node build/probe-redline-move-on.mjs` grades
 *      the same fixture the other way round — ⌥↑ at the first change stays
 *      there and ⌥↓ at the last stays there, an accept leaves nothing current
 *      with the keyboard back on the scroller, a second ⌥↩ with no ⌥↓ accepts
 *      nothing, and the rewind that follows leaves nothing current either.
 *
 * ## SAFETY
 *
 * One Electron, through build/electron-run.mjs, which ends the tree it started
 * in a `finally`. A scratch profile, a scratch HOME and this script's own tmux
 * socket, ended and unlinked by build/harness-socket.mjs; `gmux` and `default`
 * are refused by name and the operator's own -L gmux sessions are counted
 * before and after. No agent, no token, no keychain, no request, no ssh, no
 * machine. Every file written is under GMUX_HARNESS_DIR. The edit the redline
 * draws is a plain /bin/sh running cat, exactly as an agent's write looks here.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withElectron, withoutDevRenderer } from './electron-run.mjs';
import { cdpEval, wsConnect } from './cdp-client.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '[move-on]';
const say = (l) => console.log(`${TAG} ${l}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PARENT = process.env['ACCEPT_ADVANCE_PARENT'] === '1';

const failures = [];
const rows = [];
function check(step, claim, pass, detail) {
  rows.push({ step, claim, pass, detail: detail ?? '' });
  if (!pass) failures.push(`${step}. ${claim} — ${detail ?? ''}`);
  say(`${pass ? 'pass' : 'FAIL'}  ${step}. ${claim}${detail ? ' — ' + detail : ''}`);
}
function note(step, claim, detail) {
  rows.push({ step, claim, pass: null, detail: detail ?? '' });
  say(`note  ${step}. ${claim}${detail ? ' — ' + detail : ''}`);
}

/**
 * What the parent's app is expected to do, graded as findings so a run at the
 * parent is a PASS when the defect reproduces. The head grader is its mirror:
 * the same readings, the other way round.
 */
function grade(reading, mode) {
  const bad = [];
  const f = (name) => reading[name] ?? {};
  if (reading.startChanges !== 8) bad.push(`the fixture drew ${String(reading.startChanges)} changes and not 8`);
  if (f('a1').currentIndex !== 0 || f('a1').currentCount !== 1) {
    bad.push('the first ⌥↓ did not mark the first change');
  }
  const dels = reading.startDels ?? [];
  if (mode === 'head') {
    if (f('loopUp').currentIndex !== 7) {
      bad.push(`⌥↑ from the first change landed on ${String(f('loopUp').currentIndex)} rather than looping to the last`);
    }
    if (f('loopDown').currentIndex !== 0) {
      bad.push(`⌥↓ from the last change landed on ${String(f('loopDown').currentIndex)} rather than looping to the first`);
    }
    const b = f('accept1');
    if (b.changes !== 7) bad.push(`the first accept left ${String(b.changes)} changes where the picture held 8`);
    if (reading.acceptsMovedFile === true) bad.push('an accept moved a byte of the file');
    if (b.currentCount !== 1 || b.dels?.[b.currentIndex] !== dels[1]) {
      bad.push('the accept did not leave the change that followed it current');
    }
    if (b.activeIsChange !== true || b.activeIndex !== b.currentIndex) {
      bad.push('the keyboard is not on the change the accept moved to');
    }
    if (b.chipDrawn !== true) bad.push('the controls did not come with the accepted change’s neighbour');
    const c = f('accept2');
    if (c.changes !== 6) bad.push(`a second ⌥↩ with no ⌥↓ accepted nothing (${String(c.changes)} changes remain)`);
    if (c.dels?.[c.currentIndex] !== dels[2]) bad.push('the second ⌥↩ did not land on the change after the one it accepted');
    const r = f('rewind');
    if (r.changes !== 5) bad.push(`the rewind left ${String(r.changes)} changes where the picture held 6`);
    if (reading.rewindMovedFile !== true) bad.push('the rewind did not write the file, so it was not a rewind');
    if (r.currentCount !== 1 || r.dels?.[r.currentIndex] !== dels[3]) {
      bad.push('the rewind did not leave the change that followed it current');
    }
    if (r.activeIsChange !== true || r.activeIndex !== r.currentIndex) {
      bad.push('the keyboard is not on the change the rewind moved to');
    }
    if (f('loopUp2').currentIndex !== 4) {
      bad.push(`⌥↑ after the rewind landed on ${String(f('loopUp2').currentIndex)} rather than looping to the last remaining change`);
    }
    if (f('loopDown2').currentIndex !== 0) {
      bad.push(`⌥↓ from the last remaining change landed on ${String(f('loopDown2').currentIndex)} rather than looping to the first`);
    }
    if (f('end').changes !== 0) bad.push(`accepting forward left ${String(f('end').changes)} changes`);
    if (reading.acceptsAfterRewindMovedFile === true) bad.push('a later accept moved a byte of the file');
    if (f('emptyAccept').changes !== 0) bad.push('a ⌥↩ past the last change drew another change, so it was not a no-op');
    if (f('emptyStep').changes !== 0 || f('emptyStep').currentCount !== 0) {
      bad.push('the arrows marked something on an empty redline');
    }
    if (f('emptyAccept').activeInView !== true) bad.push('the keyboard left the view when the last change was accepted');
  } else {
    if (f('loopUp').currentIndex !== 0) {
      bad.push('THE LOOP DID NOT REPRODUCE: ⌥↑ at the first change moved instead of staying');
    }
    if (f('loopDown').currentIndex !== 7) {
      bad.push(`THE LOOP DID NOT REPRODUCE: nine ⌥↓ presses from the first change ended at ${String(f('loopDown').currentIndex)} rather than clamped on the last`);
    }
    const b = f('accept1');
    if (b.changes !== 7) bad.push(`the first accept left ${String(b.changes)} changes where the picture held 8`);
    if (b.currentCount !== 0) {
      bad.push('the parent marked a change after the accept, which is the feature this run measures');
    }
    if (f('accept2').changes !== 7) {
      bad.push('THE DEFECT DID NOT REPRODUCE: a second ⌥↩ with no ⌥↓ accepted something');
    }
    const r = f('rewind');
    if (reading.rewindMovedFile !== true) bad.push('the rewind did not write the file, so this arm measured nothing');
    if (r.changes !== 6) bad.push(`the rewind left ${String(r.changes)} changes where the picture held 7`);
    if (r.currentCount !== 0) {
      bad.push('the parent marked a change after the rewind, which is the feature this run measures');
    }
  }
  return bad;
}

if (process.argv.includes('--self-test')) {
  const head = {
    mode: 'head',
    startChanges: 8,
    startDels: ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'],
    acceptsMovedFile: false,
    rewindMovedFile: true,
    acceptsAfterRewindMovedFile: false,
    a1: { currentIndex: 0, currentCount: 1 },
    loopUp: { currentIndex: 7 },
    loopDown: { currentIndex: 0 },
    accept1: { changes: 7, currentIndex: 0, currentCount: 1, activeIndex: 0, activeIsChange: true, chipDrawn: true, dels: ['bravo', 'charlie', 'delta'] },
    accept2: { changes: 6, currentIndex: 0, dels: ['charlie', 'delta'] },
    rewind: { changes: 5, currentIndex: 0, currentCount: 1, activeIndex: 0, activeIsChange: true, dels: ['delta', 'echo'] },
    loopUp2: { currentIndex: 4 },
    loopDown2: { currentIndex: 0 },
    end: { changes: 0 },
    emptyAccept: { changes: 0, activeInView: true },
    emptyStep: { changes: 0, currentCount: 0 }
  };
  const parent = {
    mode: 'parent',
    startChanges: 8,
    acceptsMovedFile: false,
    rewindMovedFile: true,
    a1: { currentIndex: 0, currentCount: 1 },
    loopUp: { currentIndex: 0 },
    loopDown: { currentIndex: 7 },
    accept1: { changes: 7, currentCount: 0, activeIsChange: false },
    accept2: { changes: 7 },
    rewind: { changes: 6, currentCount: 0, activeIsChange: false }
  };
  const cases = [
    ['the shipping shape at HEAD', grade(head, 'head'), 0],
    ['the loop did not happen, which is the parent', grade({ ...head, loopUp: { currentIndex: 0 } }, 'head'), 1],
    ['the second ⌥↩ accepted nothing, which is the parent', grade({ ...head, accept2: { changes: 7, dels: ['charlie'] } }, 'head'), 2],
    ['the accept landed on the wrong change', grade({ ...head, accept1: { ...head.accept1, dels: ['delta'] } }, 'head'), 1],
    ['the rewind did not move on', grade({ ...head, rewind: { ...head.rewind, currentCount: 0, currentIndex: -1 } }, 'head'), 2],
    ['the rewind did not write the file', grade({ ...head, rewindMovedFile: false }, 'head'), 1],
    ['an accept wrote the file', grade({ ...head, acceptsMovedFile: true }, 'head'), 1],
    ['the arrows stopped marking something on an empty redline', grade({ ...head, emptyStep: { changes: 0, currentCount: 1 } }, 'head'), 1],
    ['the parent shape, graded as the parent', grade(parent, 'parent'), 0],
    ['the parent shape graded as HEAD, which is the defect', grade(parent, 'head'), 15],
    ['the parent looped, which is the feature', grade({ ...parent, loopUp: { currentIndex: 7 }, loopDown: { currentIndex: 1 } }, 'parent'), 2]
  ];
  let bad = 0;
  for (const [name, found, want] of cases) {
    const ok = found.length === want;
    if (!ok) bad += 1;
    say(`${ok ? 'pass' : 'FAIL'}  self-test: ${name} -> ${String(found.length)} finding(s), wanted ${String(want)}`);
  }
  say(`${String(cases.length - bad)} of ${String(cases.length)} grader fixtures behaved`);
  process.exit(bad === 0 ? 0 : 1);
}

const socket = process.env['GMUX_TMUX_SOCKET'] ?? '';
if (socket === '') {
  say('no GMUX_TMUX_SOCKET; wrapping in build/harness-socket.mjs');
  const w = spawnSync(
    process.execPath,
    [join(REPO, 'build', 'harness-socket.mjs'), '--fresh', 'gmux-redlinemoveon', `node ${process.argv[1]}`],
    { cwd: REPO, stdio: 'inherit' }
  );
  process.exit(w.status ?? 1);
}
if (socket === 'gmux' || socket === 'default') {
  console.error(`${TAG} refusing socket ${socket}`);
  process.exit(2);
}
const harnessDir = process.env['GMUX_HARNESS_DIR'] ?? '';
if (harnessDir === '') {
  console.error(`${TAG} no GMUX_HARNESS_DIR`);
  process.exit(2);
}
if (!existsSync(join(REPO, 'out', 'main', 'index.js'))) {
  console.error(`${TAG} out/main/index.js is missing. Run npm run build.`);
  process.exit(2);
}

const operatorCount = () =>
  (spawnSync('tmux', ['-L', 'gmux', 'list-sessions'], { encoding: 'utf8' }).stdout ?? '')
    .split('\n')
    .filter((l) => l.trim() !== '').length;
const opBefore = operatorCount();
say(`operator sessions on -L gmux before: ${String(opBefore)}`);

mkdirSync(join(harnessDir, 'moveon'), { recursive: true });
const root = realpathSync(join(harnessDir, 'moveon'));
const home = join(root, 'home');
const profile = join(root, 'profile');
const project = join(root, 'project');
const readingsFile = join(root, 'move-on-readings.json');
for (const d of [home, profile, project]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}

const git = (...a) => {
  const r = spawnSync('git', a, {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
  });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
/** The write from outside, which is what an agent's write looks like here. */
const shellWrite = (rel, text) => {
  const r = spawnSync('/bin/sh', ['-c', 'cat > "$1"', 'sh', join(project, rel)], {
    input: text,
    encoding: 'utf8'
  });
  if (r.status !== 0) throw new Error('shell write failed');
};
const digest = (rel) =>
  createHash('sha256').update(readFileSync(join(project, rel))).digest('hex').slice(0, 16);

const NOTES = 'notes.txt';
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
/** Eight paragraphs, each with one marker word that differs between versions. */
const version = (n) =>
  WORDS.map(
    (_, i) =>
      `Paragraph ${String(i + 1)} of the draft, whose marker word is ${WORDS[(i + n) % WORDS.length]} and whose body carries enough sentences to make the document worth scrolling through when somebody reads it.\n`
  ).join('\n');

writeFileSync(join(project, NOTES), version(0));
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'moveon@example.invalid');
git('config', 'user.name', 'moveon');
git('add', '--', NOTES);
git('commit', '-q', '-m', 'the committed draft');

// ---------------------------------------------------------------------------
// The reads, all off the LIVE DOM. `dels` is the whole picture's deleted text
// in document order, which is how an arm says WHICH change a press landed on:
// a change that left the picture leaves the rest in order, so the change that
// followed the pressed one is the next one in this list.
// ---------------------------------------------------------------------------
const FACE = `(() => {
  const doc = document.querySelector('.ed-redline-doc');
  const view = document.querySelector('.ed-redline-view');
  const wraps = doc === null ? [] : Array.from(doc.querySelectorAll('.ed-redline-change'));
  const currentIndex = wraps.findIndex((w) => w.hasAttribute('data-current'));
  const active = document.activeElement;
  const activeWrap = active !== null && typeof active.closest === 'function' ? active.closest('.ed-redline-change') : null;
  return {
    mounted: doc !== null,
    changes: wraps.length,
    dels: wraps.map((w) => w.dataset.changeDel ?? ''),
    currentIndex,
    currentCount: wraps.filter((w) => w.hasAttribute('data-current')).length,
    activeIndex: activeWrap === null ? -1 : wraps.indexOf(activeWrap),
    activeIsChange: activeWrap !== null,
    activeInView: active !== null && view !== null && view.contains(active),
    activeClass: active === null ? null : (active.className || active.tagName),
    chipDrawn: document.querySelector('.ed-redline-chip') !== null,
    toasts: Array.from(document.querySelectorAll('.toasts .toast-text')).map((t) => t.textContent ?? '')
  };
})()`;

const clickMode = (label) =>
  `(() => { const b = document.querySelector('.ed-mode[role="radiogroup"] [aria-label="${label}"]'); if (!b || b.disabled) return false; b.click(); return true; })()`;
const docSettled = `(() => document.querySelector('.ed-redline-doc') !== null && document.querySelector('.ed-redline-view .ed-skeleton') === null)()`;
const hasChanges = (n) =>
  `(() => { const d = document.querySelector('.ed-redline-doc'); return d !== null && d.querySelectorAll('.ed-redline-change').length === ${String(n)}; })()`;

async function cdpForAppWindow(timeoutMs) {
  const started = Date.now();
  for (;;) {
    let port = 0;
    try {
      port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim());
    } catch {
      port = 0;
    }
    if (port > 0) {
      let list = [];
      try {
        list = await (await fetch(`http://127.0.0.1:${String(port)}/json/list`)).json();
      } catch {
        list = [];
      }
      for (const t of list) {
        if (t.type !== 'page' || !t.webSocketDebuggerUrl) continue;
        let cdp = null;
        try {
          cdp = await wsConnect(t.webSocketDebuggerUrl, { collect: [] });
          const a = await cdpEval(
            cdp,
            `typeof window.gmux === 'object' && typeof window.__gmuxShotDrive === 'function' ? location.href : null`,
            5000
          );
          if (typeof a === 'string') return { cdp, url: a };
          cdp.close();
        } catch {
          if (cdp) {
            try {
              cdp.close();
            } catch {
              /* closed */
            }
          }
        }
      }
    }
    if (Date.now() - started > timeoutMs) throw new Error('no app window');
    await sleep(200);
  }
}

const until = async (cdp, expr, ms) => {
  const s = Date.now();
  for (;;) {
    let v = null;
    try {
      v = await cdpEval(cdp, expr, 10000);
    } catch {
      v = null;
    }
    if (v === true) return true;
    if (Date.now() - s > ms) return false;
    await sleep(120);
  }
};
const drive = (cdp, spec) =>
  cdpEval(cdp, `window.__gmuxShotDrive(${JSON.stringify(spec)}).then(() => true)`, 90000);
const face = (cdp) => cdpEval(cdp, FACE, 20000);

// CDP modifier bits: Alt 1, Ctrl 2, Meta 4, Shift 8.
const CHORD = {
  next: { key: 'ArrowDown', code: 'ArrowDown', vk: 40, modifiers: 1 },
  prev: { key: 'ArrowUp', code: 'ArrowUp', vk: 38, modifiers: 1 },
  accept: { key: 'Enter', code: 'Enter', vk: 13, modifiers: 1 },
  rewind: { key: 'Backspace', code: 'Backspace', vk: 8, modifiers: 1 }
};
async function press(cdp, { key, code, vk, modifiers }) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(300);
}

/** Open the fixture file in Redline, for keeps. */
async function openRedline(cdp, rel) {
  await drive(cdp, { projectPath: project, openRel: rel, mode: 'file' });
  await sleep(700);
  await cdpEval(cdp, clickMode('Redline'));
  await until(cdp, docSettled, 20000);
  await sleep(500);
  return face(cdp);
}

const readings = { mode: PARENT ? 'parent' : 'head' };

/**
 * THE HEAD DRIVE: what this round ships, claim by claim. Every arm reads the
 * live DOM, and the two digests split the file's movement by verb so an accept
 * that wrote and a rewind that did not are both visible.
 */
async function driveHead(cdp) {
  const start = await face(cdp);
  readings.startChanges = start.changes;
  readings.startDels = start.dels;
  check('H0', 'the redline drew the eight edits against the committed draft', start.changes === 8, `${String(start.changes)} changes`);

  await press(cdp, CHORD.next);
  readings.a1 = await face(cdp);
  check(
    'H1',
    'one ⌥↓ marks the first change and puts the keyboard on it',
    readings.a1.currentIndex === 0 && readings.a1.currentCount === 1 && readings.a1.activeIndex === 0,
    `current ${String(readings.a1.currentIndex)}, keyboard ${JSON.stringify(readings.a1.activeClass)}`
  );

  // THE LOOP, both ways, from the ends.
  await press(cdp, CHORD.prev);
  readings.loopUp = await face(cdp);
  check(
    'H2',
    'THE LOOP: ⌥↑ from the first change comes round to the last',
    readings.loopUp.currentIndex === 7 && readings.loopUp.currentCount === 1,
    `current ${String(readings.loopUp.currentIndex)} of ${String(readings.loopUp.changes)}`
  );
  await press(cdp, CHORD.next);
  readings.loopDown = await face(cdp);
  check(
    'H3',
    'and ⌥↓ from the last comes round to the first',
    readings.loopDown.currentIndex === 0,
    `current ${String(readings.loopDown.currentIndex)}`
  );

  // THE ACCEPT, and the point of the round: a second one with no ⌥↓ between.
  const before = await face(cdp);
  const fileBefore = digest(NOTES);
  await press(cdp, CHORD.accept);
  await until(cdp, hasChanges(7), 20000);
  readings.accept1 = await face(cdp);
  const afterAccept = digest(NOTES);
  readings.acceptsMovedFile = afterAccept !== fileBefore;
  check('H4', 'the accept dropped the change it was pressed on', readings.accept1.changes === 7, `${String(before.changes)} -> ${String(readings.accept1.changes)} changes`);
  check('H5', 'and moved not one byte of the file', readings.acceptsMovedFile === false, `digest ${fileBefore} -> ${afterAccept}`);
  check(
    'H6',
    'the change that followed the accepted one is now current, with the keyboard on it and the controls drawn',
    readings.accept1.currentCount === 1 &&
      readings.accept1.dels[readings.accept1.currentIndex] === before.dels[1] &&
      readings.accept1.activeIndex === readings.accept1.currentIndex &&
      readings.accept1.chipDrawn === true,
    `current "${String(readings.accept1.dels[readings.accept1.currentIndex]).slice(0, 30)}", keyboard on ${JSON.stringify(readings.accept1.activeClass)}, chip ${String(readings.accept1.chipDrawn)}`
  );

  await press(cdp, CHORD.accept);
  await until(cdp, hasChanges(6), 20000);
  readings.accept2 = await face(cdp);
  check(
    'H7',
    'THE POINT: ⌥↩ again, with no ⌥↓ in between, accepted the next change',
    readings.accept2.changes === 6 && readings.accept2.dels[readings.accept2.currentIndex] === before.dels[2],
    `${String(readings.accept1.changes)} -> ${String(readings.accept2.changes)} changes`
  );

  // THE REWIND, the operator's second ask: it writes the file AND moves on.
  // The keyboard is already on the change that followed the accept, so this is
  // the chord path the operator uses, with no pointer touched anywhere.
  const beforeRewind = await face(cdp);
  const digestBeforeRewind = digest(NOTES);
  await press(cdp, CHORD.rewind);
  await until(cdp, hasChanges(5), 20000);
  await until(cdp, `document.querySelector('.ed-redline-change[data-current]') !== null`, 8000);
  readings.rewind = await face(cdp);
  const digestAfterRewind = digest(NOTES);
  readings.rewindMovedFile = digestAfterRewind !== digestBeforeRewind;
  check('H8', 'the rewind wrote the file', readings.rewindMovedFile === true, `digest ${digestBeforeRewind} -> ${digestAfterRewind}`);
  check(
    'H9',
    'THE SECOND ASK: the rewind left the change that followed it current, with the keyboard on it',
    readings.rewind.changes === 5 &&
      readings.rewind.currentCount === 1 &&
      readings.rewind.dels[readings.rewind.currentIndex] === beforeRewind.dels[1] &&
      readings.rewind.activeIndex === readings.rewind.currentIndex,
    `current "${String(readings.rewind.dels[readings.rewind.currentIndex]).slice(0, 30)}", keyboard on ${JSON.stringify(readings.rewind.activeClass)}`
  );

  // And the arrows still loop after a press.
  await press(cdp, CHORD.prev);
  readings.loopUp2 = await face(cdp);
  check(
    'H10',
    'the loop survives a press: ⌥↑ comes round to the last remaining change',
    readings.loopUp2.currentIndex === 4,
    `current ${String(readings.loopUp2.currentIndex)} of ${String(readings.loopUp2.changes)}`
  );
  await press(cdp, CHORD.next);
  readings.loopDown2 = await face(cdp);
  check(
    'H11',
    'and ⌥↓ comes back round to the first',
    readings.loopDown2.currentIndex === 0,
    `current ${String(readings.loopDown2.currentIndex)}`
  );

  // The end: accepts forward until the picture is empty, then every chord is a
  // no-op and the keyboard is still in the view.
  let last = readings.loopDown2;
  for (let i = 0; i < 12 && last.changes > 0; i += 1) {
    await press(cdp, CHORD.accept);
    await until(cdp, hasChanges(last.changes - 1), 20000);
    last = await face(cdp);
  }
  readings.end = last;
  readings.acceptsAfterRewindMovedFile = digest(NOTES) !== digestAfterRewind;
  check('H12', 'accepting forward empties the redline', last.changes === 0, `${String(last.changes)} changes remain`);
  check('H13', 'and no later accept moved a byte of the file', readings.acceptsAfterRewindMovedFile === false, `digest ${digestAfterRewind} -> ${digest(NOTES)}`);
  await press(cdp, CHORD.accept);
  readings.emptyAccept = await face(cdp);
  check('H14', 'a ⌥↩ past the last change is a no-op rather than a wrap to the top', readings.emptyAccept.changes === 0, `${String(readings.emptyAccept.changes)} changes`);
  check('H15', 'and the keyboard is still in the view', readings.emptyAccept.activeInView === true, `keyboard on ${JSON.stringify(readings.emptyAccept.activeClass)}`);
  await press(cdp, CHORD.next);
  await press(cdp, CHORD.prev);
  readings.emptyStep = await face(cdp);
  check(
    'H16',
    'the arrows on an empty redline mark nothing and draw nothing',
    readings.emptyStep.changes === 0 && readings.emptyStep.currentCount === 0,
    `${String(readings.emptyStep.changes)} changes, ${String(readings.emptyStep.currentCount)} marked`
  );
}

/**
 * THE PARENT DRIVE: the build the operator reported against, graded the other
 * way round. It is shorter on purpose — the point is the defect, and every
 * move this round ships is a reading that the parent cannot make.
 */
async function driveParent(cdp) {
  const start = await face(cdp);
  readings.startChanges = start.changes;
  readings.startDels = start.dels;
  check('P0', 'the redline drew the eight edits against the committed draft', start.changes === 8, `${String(start.changes)} changes`);

  await press(cdp, CHORD.next);
  readings.a1 = await face(cdp);
  check('P1', 'one ⌥↓ marks the first change', readings.a1.currentIndex === 0, `current ${String(readings.a1.currentIndex)}`);

  // THE ENDS, read from the two ends. The top is one ⌥↑ away; the bottom is
  // eight ⌥↓ presses (seven steps to the last change, one more that either
  // clamps or loops).
  await press(cdp, CHORD.prev);
  readings.loopUp = await face(cdp);
  for (let i = 0; i < 8; i += 1) await press(cdp, CHORD.next);
  readings.loopDown = await face(cdp);
  note(
    'P2',
    'THE ENDS AT THE PARENT: ⌥↑ at the first change and ⌥↓ at the last',
    `loopUp current ${String(readings.loopUp.currentIndex)} (HEAD loops to 7), loopDown current ${String(readings.loopDown.currentIndex)} (HEAD loops to 1)`
  );

  // THE ACCEPT, chord in and chord out, which is the shape the operator
  // reported: the change at the bottom of the document is the one under the
  // keyboard when the press is made.
  await press(cdp, CHORD.accept);
  await until(cdp, hasChanges(7), 20000);
  readings.accept1 = await face(cdp);
  readings.acceptsMovedFile = false;
  note(
    'P3',
    'the first accept at the parent',
    `changes ${String(readings.accept1.changes)}, current ${String(readings.accept1.currentIndex)}, keyboard on ${JSON.stringify(readings.accept1.activeClass)}, chip ${String(readings.accept1.chipDrawn)}`
  );

  await press(cdp, CHORD.accept);
  await sleep(700);
  readings.accept2 = await face(cdp);
  check(
    'P4',
    'THE DEFECT: a second ⌥↩ with no ⌥↓ accepts nothing',
    readings.accept2.changes === 7,
    `${String(readings.accept1.changes)} -> ${String(readings.accept2.changes)} changes`
  );

  // THE REWIND, chord in as well: one ⌥↓ from nowhere marks the first change.
  await press(cdp, CHORD.next);
  const digestBeforeRewind = digest(NOTES);
  await press(cdp, CHORD.rewind);
  await until(cdp, hasChanges(6), 20000);
  readings.rewind = await face(cdp);
  readings.rewindMovedFile = digest(NOTES) !== digestBeforeRewind;
  note(
    'P5',
    'the rewind at the parent: it writes the file and leaves nothing current',
    `digest moved ${String(readings.rewindMovedFile)}, changes ${String(readings.rewind.changes)}, current ${String(readings.rewind.currentIndex)}, keyboard on ${JSON.stringify(readings.rewind.activeClass)}`
  );
}

await withElectron(
  {
    label: 'moveon',
    userDataDir: profile,
    tmuxSocket: null,
    cwd: REPO,
    args: ['--remote-debugging-port=0', '--use-mock-keychain'],
    env: withoutDevRenderer({ HOME: home, GMUX_TMUX_SOCKET: socket, GMUX_PROBES: '1' }),
    ceilingMs: 15 * 60 * 1000
  },
  async (handle) => {
    const { cdp, url } = await cdpForAppWindow(90000);
    say(`app window at ${url}, pid ${String(handle.appPid())}`);
    try {
      await cdp.call('Runtime.enable');
      await cdp.call('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
      });
      for (;;) {
        if ((await cdpEval(cdp, `performance.getEntriesByType('navigation')[0].loadEventEnd`)) > 0) break;
        await sleep(50);
      }
      await drive(cdp, { projectPath: project, editorWidth: 1000, sidebarWidth: 300 });
      await sleep(1500);

      // The agent's write: the committed draft against eight moved words.
      shellWrite(NOTES, version(1));
      await openRedline(cdp, NOTES);
      await until(cdp, hasChanges(8), 30000);

      if (PARENT) await driveParent(cdp);
      else await driveHead(cdp);

      const bad = grade(readings, readings.mode);
      check(
        'G1',
        PARENT
          ? 'THE PARENT: the arrows stop at the ends, an accept leaves nothing current, the second ⌥↩ accepts nothing, and the rewind leaves nothing current'
          : 'THE WHOLE ROUND: both verbs move on, the arrows loop, the file moves only when a rewind writes it, and the end of the document is quiet',
        bad.length === 0,
        bad.length === 0 ? 'every arm above agrees' : bad.join('; ')
      );
    } finally {
      writeFileSync(readingsFile, JSON.stringify(readings, null, 2));
      cdp.close();
    }
  }
);

const opAfter = operatorCount();
check('X1', 'operator sessions on -L gmux unmoved', opBefore === opAfter, `${String(opBefore)} -> ${String(opAfter)}`);
say('');
say(`${String(rows.filter((r) => r.pass === true).length)} passed, ${String(failures.length)} failed, ${String(rows.filter((r) => r.pass === null).length)} notes`);
say(`readings at ${readingsFile}`);
if (failures.length > 0) {
  for (const f of failures) say(`FAILURE: ${f}`);
  process.exit(1);
}
process.exit(0);
