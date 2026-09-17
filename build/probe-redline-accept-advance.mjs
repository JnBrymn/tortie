#!/usr/bin/env node
/**
 * probe-redline-accept-advance.mjs — the operator's ask of 2026-09-16, in the
 * app: ⌥↩ on a change should MOVE ON to the next one, so a run of approvals is
 * a run of ⌥↩ presses rather than ⌥↩ ⌥↓ repeated.
 *
 * His words: "I want it to automatically forward to the next edit so I can do
 * just keep doing option return if I want to keep approving... right now after
 * I do option return I have to push option down to get the next edit, that's
 * extra keystrokes." The same sentence in this repository's terms: an accept
 * moved the baseline, the change under the keyboard left the picture with it,
 * and the person was left standing on the document with nothing current — so
 * the change that followed was reachable only by a ⌥↓ that did nothing but
 * restore the place the accept had just taken away.
 *
 * WHAT THIS RUN READS, all off the live DOM and the real disk, in ONE Electron:
 *
 *   A. THE FIRST ⌥↓ LANDS on the first change, marks it and puts the keyboard
 *      on it. Without this the arms below would mean nothing.
 *   B. THE ASK: one ⌥↩ drops exactly the change it was pressed on, writes no
 *      byte of the file, and leaves the change that FOLLOWED it current with
 *      the keyboard on it and the controls drawn.
 *   C. THE POINT, and it is the whole reason for the round: a SECOND ⌥↩ with
 *      no ⌥↓ in between accepts the next change, and lands on the one after
 *      that. At the parent this press does nothing at all.
 *   D. THE CHORD IS UNTOUCHED: ⌥↓ after an accept still steps from where the
 *      accept left the person, one change further along.
 *   E. THE END OF THE DOCUMENT: accepting to the last change empties the
 *      redline, leaves the keyboard in the view, and a further ⌥↩ is a no-op
 *      rather than a wrap to the top of the prose somebody just approved.
 *
 * THE PARENT ARM IS THE HONEST HALF, and it is why this probe takes a mode.
 * The operator reported the extra keystrokes, so the defect has to be SHOWN
 * rather than asserted: `ACCEPT_ADVANCE_PARENT=1 node build/probe-redline-accept-advance.mjs`
 * grades the same drive the other way round — the first accept lands and the
 * SECOND one, with no ⌥↓, accepts nothing while the picture still holds seven
 * changes. The two readings differ by exactly the feature.
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
const TAG = '[redline-adv]';
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
 * A claim that is only true at HEAD. At the parent it is reported instead of
 * asserted, because the parent's whole reading is that these are false, and
 * the run's verdict there is the `parent` grader at the end.
 */
const headClaim = (step, claim, pass, detail) =>
  PARENT ? note(step, claim, detail) : check(step, claim, pass, detail);

/**
 * The grader, proved under --self-test so it is seen to fail. `head` is the
 * shape this round ships; `parent` is the shape at the commit before it, and
 * the two are graded separately because a run at one of them must FAIL the
 * other's claims rather than pass them by accident.
 */
function grade(r, mode) {
  const bad = [];
  const face = (name) => r[name] ?? {};
  if (r.startChanges !== 8) bad.push(`the fixture drew ${String(r.startChanges)} changes and not 8`);
  if (r.a1?.currentIndex !== 0 || r.a1?.currentCount !== 1 || r.a1?.activeIndex !== 0) {
    bad.push('the first ⌥↓ did not mark the first change with the keyboard on it');
  }
  const b = face('b1');
  if (b.changes !== 7) bad.push(`the first accept left ${String(b.changes)} changes where the picture held 8`);
  if (r.fileMoved === true) bad.push('an accept moved a byte of the file');
  if (mode === 'head') {
    if (b.currentIndex !== 0 || b.currentCount !== 1) {
      bad.push('the accept left no change current, so the next change has to be walked to by hand');
    }
    if (b.dels?.[0] !== r.before?.dels?.[1]) {
      bad.push('the change current after the accept is not the one that followed the accepted one');
    }
    if (b.activeIndex !== b.currentIndex || b.activeIsChange !== true) {
      bad.push('the keyboard is not on the change the accept moved to');
    }
    if (b.chipDrawn !== true) bad.push('the controls did not come with the accepted change’s neighbour');
    const c = face('c1');
    if (c.changes !== 6) {
      bad.push(`THE POINT: a second ⌥↩ with no ⌥↓ accepted nothing (${String(c.changes)} changes remain)`);
    }
    if (c.dels?.[0] !== r.before?.dels?.[2]) {
      bad.push('the second ⌥↩ did not land on the change after the one it accepted');
    }
    const d = face('d1');
    if (d.currentIndex !== 1) bad.push(`⌥↓ after an accept landed at ${String(d.currentIndex)} rather than one further along`);
    if (r.e1?.changes !== 0) bad.push(`accepting to the end left ${String(r.e1?.changes)} changes`);
    if (r.e2?.changes !== 0) bad.push('a ⌥↩ past the last change drew another change, so it was a wrap');
    if (r.e2?.activeInView !== true) bad.push('the keyboard left the view when the last change was accepted');
  } else {
    if (b.currentCount !== 0 || b.activeIsChange !== false) {
      bad.push('the parent marked a change after the accept, which is the feature this run measures');
    }
    if (face('c1').changes !== 7) {
      bad.push('THE DEFECT DID NOT REPRODUCE: a second ⌥↩ with no ⌥↓ accepted something');
    }
  }
  return bad;
}

if (process.argv.includes('--self-test')) {
  const head = {
    startChanges: 8,
    fileMoved: false,
    before: { dels: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] },
    a1: { currentIndex: 0, currentCount: 1, activeIndex: 0 },
    b1: { changes: 7, currentIndex: 0, currentCount: 1, activeIndex: 0, activeIsChange: true, chipDrawn: true, dels: ['two', 'three'] },
    c1: { changes: 6, currentIndex: 0, currentCount: 1, activeIndex: 0, dels: ['three'] },
    d1: { currentIndex: 1 },
    e1: { changes: 0 },
    e2: { changes: 0, activeInView: true }
  };
  const parent = {
    startChanges: 8,
    fileMoved: false,
    a1: { currentIndex: 0, currentCount: 1, activeIndex: 0 },
    b1: { changes: 7, currentCount: 0, activeIsChange: false },
    c1: { changes: 7 }
  };
  const cases = [
    ['the shipping shape at HEAD', grade(head, 'head'), 0],
    ['the first accept moved on instead of standing still', grade({ ...head, b1: { ...head.b1, currentCount: 0, currentIndex: -1 } }, 'head'), 2],
    ['the second ⌥↩ accepted nothing, which is the parent', grade({ ...head, c1: { changes: 7, dels: ['three'] } }, 'head'), 1],
    ['the accept moved to the wrong change', grade({ ...head, b1: { ...head.b1, dels: ['four', 'three'] } }, 'head'), 1],
    ['the accept took the ⌥↓ with it and went two along', grade({ ...head, c1: { changes: 6, dels: ['four'] } }, 'head'), 1],
    ['the keyboard was left on the document', grade({ ...head, b1: { ...head.b1, activeIsChange: false, activeIndex: -1 } }, 'head'), 1],
    ['the controls were not drawn', grade({ ...head, b1: { ...head.b1, chipDrawn: false } }, 'head'), 1],
    ['the last accept wrapped to the top', grade({ ...head, e2: { changes: 1, activeInView: true } }, 'head'), 1],
    ['an accept wrote the file', grade({ ...head, fileMoved: true }, 'head'), 1],
    ['the parent shape, graded as the parent', grade(parent, 'parent'), 0],
    ['the parent shape graded as HEAD, which is the defect', grade(parent, 'head'), 8],
    ['the parent with the second press somehow landing', grade({ ...parent, c1: { changes: 6 } }, 'parent'), 1]
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
    [join(REPO, 'build', 'harness-socket.mjs'), '--fresh', 'gmux-redlineadv', `node ${process.argv[1]}`],
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

mkdirSync(join(harnessDir, 'readv'), { recursive: true });
const root = realpathSync(join(harnessDir, 'readv'));
const home = join(root, 'home');
const profile = join(root, 'profile');
const project = join(root, 'project');
const readingsFile = join(root, 'accept-advance-readings.json');
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
git('config', 'user.email', 'readv@example.invalid');
git('config', 'user.name', 'readv');
git('add', '--', NOTES);
git('commit', '-q', '-m', 'the committed draft');

// ---------------------------------------------------------------------------
// The reads, all off the LIVE DOM. `dels` is the whole picture's deleted text
// in document order, which is how an arm says WHICH change a press landed on:
// an accepted change leaves the picture and the rest keep their order, so the
// change that followed the accepted one is the next one in this list.
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
  accept: { key: 'Enter', code: 'Enter', vk: 13, modifiers: 1 }
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

await withElectron(
  {
    label: 'readv',
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
      const opened = await openRedline(cdp, NOTES);
      await until(cdp, hasChanges(8), 30000);
      const start = await face(cdp);
      readings.startChanges = start.changes;
      readings.startDels = start.dels;
      check('A0', 'the redline drew the eight edits against the committed draft', start.changes === 8, `${String(start.changes)} changes`);

      // A. The control: one ⌥↓ puts the person on the first change.
      await press(cdp, CHORD.next);
      const a1 = await face(cdp);
      readings.a1 = a1;
      check(
        'A1',
        'the first ⌥↓ marks the first change and puts the keyboard on it',
        a1.currentIndex === 0 && a1.currentCount === 1 && a1.activeIndex === 0,
        `current ${String(a1.currentIndex)} of ${String(a1.currentCount)}, keyboard ${JSON.stringify(a1.activeClass)}`
      );

      // B. THE ASK: one accept forwards to the change that followed.
      const before = await face(cdp);
      const fileBefore = digest(NOTES);
      await press(cdp, CHORD.accept);
      await until(cdp, hasChanges(7), 20000);
      const b1 = await face(cdp);
      readings.before = before;
      readings.b1 = b1;
      check('B1', 'the accept dropped the change it was pressed on', b1.changes === 7, `${String(before.changes)} -> ${String(b1.changes)} changes`);
      check('B2', 'the accept moved not one byte of the file (research 83 B.5)', digest(NOTES) === fileBefore, `digest ${fileBefore} -> ${digest(NOTES)}`);
      headClaim(
        'B3',
        'THE ASK: the change that followed the accepted one is now the current one',
        b1.currentCount === 1 && b1.dels[b1.currentIndex] === before.dels[1],
        `current ${String(b1.currentIndex)}, "${String(b1.dels[b1.currentIndex]).slice(0, 40)}" against the change that followed, "${String(before.dels[1]).slice(0, 40)}"`
      );
      headClaim(
        'B4',
        'and the keyboard is ON it, so the next chord reaches the view',
        b1.activeIsChange === true && b1.activeIndex === b1.currentIndex,
        `keyboard on ${JSON.stringify(b1.activeClass)}, active ${String(b1.activeIndex)} against current ${String(b1.currentIndex)}`
      );
      headClaim('B5', 'the controls came with it', b1.chipDrawn === true, `chip ${String(b1.chipDrawn)}`);

      // C. THE POINT: a second ⌥↩, with no ⌥↓ in between.
      await press(cdp, CHORD.accept);
      await until(cdp, hasChanges(6), 20000);
      const c1 = await face(cdp);
      readings.c1 = c1;
      headClaim(
        'C1',
        'THE POINT: ⌥↩ again, with no ⌥↓ in between, accepted the next change',
        c1.changes === 6,
        PARENT ? `${String(b1.changes)} -> ${String(c1.changes)} changes, which is the parent's defect` : `${String(b1.changes)} -> ${String(c1.changes)} changes`
      );
      headClaim(
        'C2',
        'and it landed on the change after the one it accepted',
        c1.dels[c1.currentIndex] === before.dels[2] && c1.currentCount === 1,
        `current "${String(c1.dels[c1.currentIndex]).slice(0, 40)}" against "${String(before.dels[2]).slice(0, 40)}"`
      );

      // D. ⌥↓ is untouched, and steps from where the accept left the person.
      await press(cdp, CHORD.next);
      const d1 = await face(cdp);
      readings.d1 = d1;
      headClaim(
        'D1',
        '⌥↓ after an accept steps one change further along',
        d1.currentIndex === 1 && d1.dels[d1.currentIndex] === before.dels[3],
        `current ${String(d1.currentIndex)}, "${String(d1.dels[d1.currentIndex]).slice(0, 40)}"`
      );

      // E. The end of the document. The walk above started in the middle of
      // the picture and moved forward, so one change is still behind the
      // person; ⌥↑ takes them back to the first one and the accepts from there
      // run to the end, which is the shape the operator's own run has when he
      // starts at the top and keeps pressing ⌥↩.
      await press(cdp, CHORD.prev);
      const e0 = await face(cdp);
      readings.e0 = e0;
      let last = e0;
      for (let i = 0; i < 12 && last.changes > 0; i += 1) {
        await press(cdp, CHORD.accept);
        await until(cdp, hasChanges(last.changes - 1), 20000);
        last = await face(cdp);
      }
      readings.e1 = last;
      headClaim('E1', 'accepting forward from the first remaining change empties the redline', last.changes === 0, `${String(last.changes)} changes remain`);
      const e2 = await face(cdp);
      await press(cdp, CHORD.accept);
      const e3 = await face(cdp);
      readings.e2 = { changes: e3.changes, activeInView: e3.activeInView, activeClass: e3.activeClass, toasts: e3.toasts };
      headClaim('E2', 'a further ⌥↩ is a no-op rather than a wrap to the top', e3.changes === 0, `${String(e3.changes)} changes`);
      check('E3', 'the keyboard is still in the view', e3.activeInView === true, `keyboard on ${JSON.stringify(e3.activeClass)}`);
      readings.fileMoved = digest(NOTES) !== fileBefore;

      const bad = grade(readings, readings.mode);
      check(
        'G1',
        PARENT
          ? 'THE PARENT: the first accept lands, nothing is left current, and the second ⌥↩ with no ⌥↓ accepts nothing'
          : 'THE WHOLE ARM: one ⌥↩ forwards to the next change, the next ⌥↩ takes it, and the file never moves',
        bad.length === 0,
        bad.length === 0 ? JSON.stringify(readings) : bad.join('; ')
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
