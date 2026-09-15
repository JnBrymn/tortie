#!/usr/bin/env node
/**
 * probe-p273-symlink.mjs. THE PHASE 273 APP RUN: a project opened through a
 * REAL symlink, driven in the real app, saving a real file.
 *
 * ONE Electron on a scratch profile, a scratch HOME and this script's own tmux
 * socket, over one git project it builds inside its own scratch directory. It
 * spawns no agent, spends no token, opens no keychain and makes no request.
 *
 * ## Why this has to be a run and not a unit test
 *
 * Issue 25, belucid, 0.106.0: a person who could not save any file, ever, and
 * was told each time that his project was not open. `src/main/fs/paths.ts` has
 * a unit suite and it was green at the parent commit, because the defect is in
 * the SEAM between two spellings of one folder: `addProject` stores
 * `path.resolve(…)` and keeps the symlink, `resolveProjectRoot` realpaths the
 * root, and the tree composes each tab's path by concatenating onto the stored
 * spelling. Nothing but the running app puts those three together. A unit test
 * is where this defect hid, so this is the reading that matters.
 *
 * ## The arms
 *
 *   A. THE PROJECT IS OPENED THROUGH THE ALIAS and remembers it. The tab
 *      spine, the tree's own `rootPath` and the editor tab's `path` all carry
 *      the symlinked spelling, not the resolved one. This is the arm that
 *      proves the run is really testing the defect: if the app had silently
 *      normalised the path, every later arm would pass for the wrong reason.
 *   B. ⌘S WRITES. A file opened from the tree through the alias is typed into
 *      and saved with the shipped explicit save. The bytes are read back OFF
 *      DISK at the REAL path, not through the app, and the tab goes clean with
 *      no toast and no dialog.
 *   C. A SECOND SAVE of the same tab, so the compare-and-swap's own digest
 *      round trip is driven through the alias too.
 *   D. THE EXPLORER VERBS, AGAINST A CONTROL. New Folder, New File, Rename,
 *      Duplicate, Move, Replace, the `.git` refusal and Trash, driven through
 *      the real rows by the shipped tree-ops probe — once in the alias project
 *      and once in a SECOND project with no symlink on its path. They share the
 *      gate this phase changed. The control is the whole point: `driveTreeOps`
 *      records 23 steps and a bare failure count says nothing about the alias,
 *      so the DIFFERENCE between the two runs is the only reading about this
 *      phase. It is three rows, all about an editor TAB opened for a file the
 *      tree created or renamed, it reads identically at d3fb8223 and at HEAD,
 *      and it is declared in the run rather than fixed here. See the comment
 *      beside PRE_EXISTING_ALIAS_TAB_ROWS.
 *   E. THE REFUSAL IS STILL A REFUSAL, and it now says what it measured. A
 *      path that escapes the root and a path under `.git` are sent through the
 *      SHIPPING `fs:writeGuarded` channel from the renderer's own bridge, and
 *      so is a root that is a real folder but no open project. All three are
 *      refused, with the words `outside`, `protected` and `projectClosed` —
 *      THREE WORDS WHERE THE PARENT COMMIT ANSWERED ONE, and where the person
 *      read the closed-project sentence for all of them.
 *   F. THE LOG LINE. `<userData>/logs/app.log` holds one `fs.save.refused`
 *      line per refusal, carrying exactly `why`, `reason`, `root` and `path`,
 *      and NO line for a write that succeeded. The third of arm E's rows is
 *      rooted UNDER the scratch HOME precisely so the redaction is driven: its
 *      logged root has to come back beginning with `~`. The other two sit
 *      outside the home, where asserting redaction would assert nothing.
 *   G. THE OPERATOR'S WORLD. `tmux -L gmux list-sessions` counted before and
 *      after and asserted unmoved.
 *
 * ## SAFETY
 *
 * The Electron is started through build/electron-run.mjs, which ends the tree
 * it started in a `finally` block whatever happened. The socket is handed in by
 * build/harness-socket.mjs, which names it `gmux-p273-<slug>-<pid>`, ends the
 * server afterwards and unlinks its socket and marker; `gmux` and `default` are
 * refused by name. Every other process this script starts is a synchronous
 * `git` that has exited before the call returns. EVERY BYTE THIS RUN WRITES is
 * under `GMUX_HARNESS_DIR`. `--self-test` proves the grader on fixtures and
 * launches nothing.
 *
 * P273_PARENT_BUILD names a directory holding a build of the PARENT commit.
 * When it is set the probe launches THAT app instead of this tree's, one after
 * the other and never at once, so the before-and-after is measured rather than
 * asserted. Every arm still runs; the expectations are not flipped, because a
 * probe that expects a defect is a probe that stops noticing it. The findings
 * ARE the parent reading.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withElectron, withoutDevRenderer } from '../electron-run.mjs';
import { cdpEval, wsConnect } from '../cdp-client.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[p273]';
const say = (l) => console.log(`${TAG} ${l}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// The grader, proved on fixtures under --self-test.
// ---------------------------------------------------------------------------

/** Every [label, got, want] that disagrees, by value. */
export function grade(rows) {
  return rows
    .filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want))
    .map(([l, got, want]) => `${l}: ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

/**
 * THE ENVELOPE'S OWN NAMES. `buildLogLine` (src/main/log/format.ts) SPREADS a
 * record's fields beside these rather than nesting them, so the fields a line
 * carried are its keys minus this set. Reading a nested `fields` object here
 * would have found nothing and the rule would have passed by finding no line
 * at all, which is the way a log assertion fails silently.
 */
const ENVELOPE = new Set(['ts', 'level', 'scope', 'pid', 'proctype', 'event', 'msg']);

/**
 * The `fs.save.refused` lines in an NDJSON log, as {why, reason, root, path}
 * plus the field names the line really carried. A fifth field is a defect and
 * is reported rather than ignored, which is why the names come back too.
 */
export function refusalLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let row = null;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row === null || typeof row !== 'object') continue;
    if (row.event !== 'fs.save.refused') continue;
    out.push({
      level: row.level ?? null,
      scope: row.scope ?? null,
      names: Object.keys(row)
        .filter((k) => !ENVELOPE.has(k))
        .sort(),
      why: row.why ?? null,
      reason: row.reason ?? null,
      root: row.root ?? null,
      path: row.path ?? null
    });
  }
  return out;
}

/** Does every path in these lines start at `~`, i.e. was the home redacted? */
export function everyPathRedacted(lines, home) {
  return lines.every(
    (l) =>
      typeof l.path === 'string' && typeof l.root === 'string' &&
      !l.path.startsWith(home) && !l.root.startsWith(home)
  );
}

function selfTest() {
  // The same shape buildLogLine writes: the fields are SPREAD, not nested.
  const LINE = (fields) =>
    JSON.stringify({
      ts: '2026-09-15T00:00:00.000Z',
      level: 'warn',
      scope: 'fs',
      pid: 1,
      proctype: 'main',
      event: 'fs.save.refused',
      msg: 'a guarded write was refused',
      ...fields
    });
  const fixtures = [
    ['a clean grade is empty', () => grade([['x', 1, 1]]), []],
    ['a disagreement is named', () => grade([['x', 1, 2]]), ['x: 1 want 2']],
    [
      'one refusal line is read with its four fields',
      () =>
        refusalLines(
          LINE({ why: 'outside', reason: 'That path is outside the project.', root: '~/p', path: '~/p/x' })
        ),
      [
        {
          level: 'warn',
          scope: 'fs',
          names: ['path', 'reason', 'root', 'why'],
          why: 'outside',
          reason: 'That path is outside the project.',
          root: '~/p',
          path: '~/p/x'
        }
      ]
    ],
    [
      'a FIFTH field is reported rather than ignored',
      () =>
        refusalLines(LINE({ why: 'outside', reason: 'r', root: '~/p', path: '~/p/x', contents: 'secret' }))[0]
          .names,
      ['contents', 'path', 'reason', 'root', 'why']
    ],
    [
      'a line that is not this event is not read',
      () => refusalLines(JSON.stringify({ event: 'fs.save.wrote', level: 'info', scope: 'fs' })),
      []
    ],
    ['a non-JSON line is skipped rather than thrown on', () => refusalLines('not json\n'), []],
    [
      'an unredacted home is caught',
      () =>
        everyPathRedacted(
          [{ root: '/Users/x/p', path: '/Users/x/p/a' }],
          '/Users/x'
        ),
      false
    ],
    [
      'a redacted home passes',
      () => everyPathRedacted([{ root: '~/p', path: '~/p/a' }], '/Users/x'),
      true
    ]
  ];
  let ok = true;
  for (const [label, run, want] of fixtures) {
    const got = run();
    const good = JSON.stringify(got) === JSON.stringify(want);
    ok = ok && good;
    say(`${good ? 'ok  ' : 'BAD '} ${label}`);
    if (!good) say(`     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
  say(ok ? `self-test PASS: ${String(fixtures.length)} fixtures behaved` : 'self-test FAIL');
  return ok;
}
if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);

// ---------------------------------------------------------------------------
// The socket wrapper, and the refusals.
// ---------------------------------------------------------------------------
const socket = (process.env['GMUX_TMUX_SOCKET'] ?? '').trim();
if (socket === '') {
  say('no GMUX_TMUX_SOCKET; wrapping in build/harness-socket.mjs');
  const w = spawnSync(
    process.execPath,
    [join(REPO, 'build', 'harness-socket.mjs'), '--fresh', 'gmux-p273', `node ${process.argv[1]}`],
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

/**
 * Which build the app comes from. `cwd` is what build/electron-run.mjs hands
 * electron as the app directory, so pointing it at a parent checkout launches
 * the parent's `out/` with this script's fixture and this script's readings.
 */
const APP_DIR = (process.env['P273_PARENT_BUILD'] ?? '').trim() || REPO;
const ARM = APP_DIR === REPO ? 'HEAD' : 'PARENT';
if (!existsSync(join(APP_DIR, 'out', 'main', 'index.js'))) {
  console.error(`${TAG} ${join(APP_DIR, 'out', 'main', 'index.js')} is missing. Run npm run build there.`);
  process.exit(2);
}

const operatorCount = () =>
  (spawnSync('tmux', ['-L', 'gmux', 'list-sessions'], { encoding: 'utf8' }).stdout ?? '')
    .split('\n')
    .filter((l) => l.trim() !== '').length;
const opBefore = operatorCount();

// ---------------------------------------------------------------------------
// The scratch world. ONE REAL DIRECTORY AND ONE REAL SYMLINK TO IT, and every
// path the app is ever told is spelled through the symlink.
// ---------------------------------------------------------------------------
mkdirSync(join(harnessDir, 'p273'), { recursive: true });
const root = realpathSync(join(harnessDir, 'p273'));
const home = join(root, 'h');
const profile = join(root, 'p');
const realParent = join(root, 'real');
const realProject = join(realParent, 'proj');
// THE ALIAS. `<root>/alias` -> `<root>/real/proj`. This is belucid's shape:
// a folder reached through a link somewhere on its path.
const alias = join(root, 'alias');

for (const d of [home, profile, realParent]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}
rmSync(alias, { recursive: true, force: true });
mkdirSync(realProject, { recursive: true });
mkdirSync(join(realProject, 'src'), { recursive: true });
symlinkSync(realProject, alias);

const git = (cwd, ...a) => {
  const r = spawnSync('git', a, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
  });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const disk = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

const NOTES_V1 = 'The notes begin here.\n\nA second line of notes.\n';
writeFileSync(join(realProject, 'notes.md'), NOTES_V1);
writeFileSync(join(realProject, 'README.md'), '# proj\n');
writeFileSync(join(realProject, 'src', 'index.ts'), 'export const x = 1;\n');
git(realProject, 'init', '-q', '-b', 'main');
git(realProject, 'config', 'user.email', 'p273@example.invalid');
git(realProject, 'config', 'user.name', 'p273');
git(realProject, 'add', '.');
git(realProject, 'commit', '-q', '-m', 'first');

/** The path the app is told. Every one of these goes through the link. */
const ALIAS_NOTES = join(alias, 'notes.md');
/** The path this script reads back. Never handed to the app. */
const REAL_NOTES = join(realProject, 'notes.md');

/**
 * THE CONTROL. A second project with no symlink anywhere on its path, opened
 * by its real spelling, used by arm D. Without it a failing tree-ops step is
 * unattributable: the difference between the two is the only reading about
 * this phase.
 */
const control = join(root, 'control');
rmSync(control, { recursive: true, force: true });
mkdirSync(join(control, 'src'), { recursive: true });
writeFileSync(join(control, 'notes.md'), NOTES_V1);
writeFileSync(join(control, 'README.md'), '# control\n');
writeFileSync(join(control, 'src', 'index.ts'), 'export const x = 1;\n');
git(control, 'init', '-q', '-b', 'main');
git(control, 'config', 'user.email', 'p273@example.invalid');
git(control, 'config', 'user.name', 'p273');
git(control, 'add', '.');
git(control, 'commit', '-q', '-m', 'first');

say(`arm ${ARM}, app from ${APP_DIR}`);
say(`the real project is ${realProject}`);
say(`the app is only ever told ${alias}`);
say(`realpath(alias) === realProject: ${String(realpathSync(alias) === realProject)}`);

// ---------------------------------------------------------------------------
// Readers.
// ---------------------------------------------------------------------------
const SPINE = `(() => {
  const tabs = Array.from(document.querySelectorAll('.ptab'));
  return tabs.map((t) => (t.querySelector('.ptab-name')?.textContent ?? '').trim());
})()`;
const monacoUp = `document.querySelector('.monaco-editor .view-lines') !== null`;

async function cdpForAppWindow(timeoutMs) {
  const started = Date.now();
  for (;;) {
    let port = 0;
    try {
      port = Number(
        readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim()
      );
    } catch {
      port = 0;
    }
    if (port > 0) {
      let list = [];
      try {
        list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      } catch {
        list = [];
      }
      for (const t of list) {
        if (t.type !== 'page' || !t.webSocketDebuggerUrl) continue;
        let cdp = null;
        try {
          cdp = await wsConnect(t.webSocketDebuggerUrl, {
            collect: ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown']
          });
          const a = await cdpEval(
            cdp,
            `typeof window.gmux === 'object' && typeof window.__gmuxShotDrive === 'function' && typeof window.__gmuxP268 === 'object' ? location.href : null`,
            5000
          );
          if (typeof a === 'string') return { cdp, url: a };
          cdp.close();
        } catch {
          if (cdp) {
            try {
              cdp.close();
            } catch {
              /* already closed */
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
    await sleep(100);
  }
};
const drive = (cdp, spec) =>
  cdpEval(cdp, `window.__gmuxShotDrive(${JSON.stringify(spec)}).then(() => true)`, 300000);
const read = (cdp, expr) => cdpEval(cdp, expr, 20000);
const p268 = (cdp, call) => cdpEval(cdp, `window.__gmuxP268.${call}`, 120000);
const p268Async = (cdp, call) =>
  cdpEval(cdp, `window.__gmuxP268.${call}.then((r) => r)`, 120000);
const tabOf = (reading, name) => reading.tabs.find((t) => t.name === name);

/** The `[shot-drive] treeOps result …` line the tree probe logs, parsed. */
function treeOpsResult(cdp) {
  const wanted = 'treeOps result ';
  for (const ev of cdp.events().slice().reverse()) {
    if (ev.method !== 'Runtime.consoleAPICalled') continue;
    const text = (ev.params?.args ?? []).map((a) => String(a.value ?? '')).join(' ');
    const at = text.indexOf(wanted);
    if (at === -1) continue;
    try {
      return JSON.parse(text.slice(at + wanted.length));
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------
const findings = {};
const problems = [];

await withElectron(
  {
    label: `p273-symlink-${ARM.toLowerCase()}`,
    userDataDir: profile,
    tmuxSocket: null,
    cwd: APP_DIR,
    args: ['--remote-debugging-port=0', '--use-mock-keychain'],
    env: withoutDevRenderer({
      HOME: home,
      GMUX_TMUX_SOCKET: socket,
      GMUX_PROBES: '1',
      // The log file is only written for a packaged run unless this is set,
      // and arm F is a reading off that file.
      GMUX_LOG_FILE: '1'
    }),
    ceilingMs: 20 * 60 * 1000
  },
  async (handle) => {
    const { cdp, url } = await cdpForAppWindow(90000);
    say(`app window at ${url}, pid ${handle.appPid()}`);
    try {
      await cdp.call('Runtime.enable');
      for (;;) {
        if (
          (await cdpEval(cdp, `performance.getEntriesByType('navigation')[0].loadEventEnd`)) > 0
        ) {
          break;
        }
        await sleep(50);
      }

      // --------------------------------------------------------------- ARM A
      // Open the project BY THE ALIAS, and prove the app kept that spelling.
      // `sidebarView` is what mounts the Explorer, and driveTreeOps answers
      // 'no tree handle registered' without it — measured on the first run of
      // this probe. build/probe-p154-drop.mjs and build/probe-openwith.mjs both
      // set it for the same reason.
      await drive(cdp, { projectPath: alias, sidebarView: 'explorer', editorWidth: 1100 });
      await sleep(1200);
      const spine = await read(cdp, SPINE);
      const activeTabName = await read(
        cdp,
        `(() => {
           const el = document.querySelector('.ptab.active .ptab-name');
           return el ? el.textContent.trim() : null;
         })()`
      );
      await drive(cdp, { projectPath: alias, sidebarView: 'explorer', openRel: 'notes.md', mode: 'file' });
      await sleep(800);
      const opened = await p268Async(cdp, `sourceMode(${JSON.stringify(ALIAS_NOTES)})`);
      await until(cdp, monacoUp, 30000);
      await sleep(600);
      const notesTab = tabOf(opened, 'notes.md');
      findings.A = {
        spine,
        activeTabName,
        tabId: notesTab?.id ?? null,
        tabPath: notesTab?.path ?? null,
        tabPathIsAlias: (notesTab?.path ?? '').startsWith(`${alias}/`),
        tabPathIsReal: (notesTab?.path ?? '').startsWith(`${realProject}/`),
        monaco: opened.monaco,
        mode: notesTab?.mode ?? null
      };
      say(`A: ${JSON.stringify(findings.A)}`);
      problems.push(
        ...grade([
          ['A the tab carries the ALIAS spelling', findings.A.tabPathIsAlias, true],
          ['A and not the resolved one', findings.A.tabPathIsReal, false],
          ['A the tab is in Source', findings.A.mode, 'file'],
          ['A Monaco is mounted', findings.A.monaco, true]
        ])
      );

      // --------------------------------------------------------------- ARM B
      // ⌘S WRITES. The bytes are read back off disk at the REAL path.
      await p268(cdp, 'clearToasts()');
      const typed = await p268Async(
        cdp,
        `type(${JSON.stringify(ALIAS_NOTES)}, 'A PERSON TYPED THIS.', 0)`
      );
      const dirtyBefore = tabOf(typed, 'notes.md')?.dirty ?? null;
      const saved = await p268Async(cdp, `explicitSave(${JSON.stringify(ALIAS_NOTES)})`);
      await sleep(500);
      const onDisk = disk(REAL_NOTES);
      findings.B = {
        dirtyBeforeSave: dirtyBefore,
        dirtyAfterSave: tabOf(saved, 'notes.md')?.dirty ?? null,
        toasts: saved.toasts,
        dialog: saved.confirm,
        diskHoldsTypedBytes: onDisk.includes('A PERSON TYPED THIS.'),
        diskBytes: onDisk.length,
        diskTail: onDisk.slice(-40)
      };
      say(`B: ${JSON.stringify(findings.B)}`);
      problems.push(
        ...grade([
          ['B the tab was dirty before the save', dirtyBefore, true],
          ['B THE SAVE WROTE: the typed bytes are on disk at the REAL path', findings.B.diskHoldsTypedBytes, true],
          ['B the tab went clean', findings.B.dirtyAfterSave, false],
          ['B no toast was raised', findings.B.toasts, []],
          ['B no dialog opened', findings.B.dialog, null]
        ])
      );

      // --------------------------------------------------------------- ARM C
      // A SECOND save, so the compare-and-swap's digest round trip runs
      // through the alias too rather than only the first write.
      await p268Async(cdp, `sourceMode(${JSON.stringify(ALIAS_NOTES)})`);
      await p268Async(cdp, `type(${JSON.stringify(ALIAS_NOTES)}, ' AND AGAIN.', 0)`);
      const saved2 = await p268Async(cdp, `explicitSave(${JSON.stringify(ALIAS_NOTES)})`);
      await sleep(500);
      const onDisk2 = disk(REAL_NOTES);
      findings.C = {
        dirty: tabOf(saved2, 'notes.md')?.dirty ?? null,
        toasts: saved2.toasts,
        diskHoldsBoth:
          onDisk2.includes('A PERSON TYPED THIS.') && onDisk2.includes('AND AGAIN.'),
        diskTail: onDisk2.slice(-40)
      };
      say(`C: ${JSON.stringify(findings.C)}`);
      problems.push(
        ...grade([
          ['C the second save wrote too', findings.C.diskHoldsBoth, true],
          ['C the tab went clean again', findings.C.dirty, false],
          ['C still no toast', findings.C.toasts, []]
        ])
      );

      // --------------------------------------------------------------- ARM D
      // THE EXPLORER VERBS, through the real rows, inside the alias project —
      // AND THE SAME VERBS IN A CONTROL PROJECT WITH NO SYMLINK IN ITS PATH.
      //
      // The control is the whole point of this arm. `driveTreeOps` records 23
      // steps and some of them are about surfaces this phase never touches, so
      // a bare failure count says nothing about the alias. Run identically on
      // both projects, the DIFFERENCE is the only reading that is about this
      // phase, and it must be empty. The nine verbs below are asserted green on
      // the alias outright, because those are the ones that go through
      // `resolveInsideRoot`, which is the line this phase changed.
      //
      // `driveTreeOps` trashes its own scratch directory at the end, so the
      // folder being GONE afterwards at the real path is the reading that the
      // trash reached the disk, not a failure.
      // THE THREE ROWS THAT FAIL ON AN ALIAS PROJECT AND ARE NOT THIS PHASE'S.
      //
      // MEASURED AT BOTH COMMITS by this probe: the alias project answers 20 of
      // 23 and the control answers 23 of 23, identically at d3fb8223 and at
      // HEAD. So these three are PRE-EXISTING and the containment repair
      // neither caused them nor fixed them, and this probe declares them rather
      // than passing over them or reddening for ever.
      //
      // The cause, read from the tree rather than guessed: `resolveInsideRoot`
      // has always composed `abs` from the RESOLVED parent, so `fs:createFile`
      // answers an entry whose `path` is the REAL spelling, and
      // src/renderer/tree/tree-ops.ts:723-726 hands that `entry.path` straight
      // to `requestOpenFile` while `ctx.rootPath` — and therefore every other
      // path in the tree and in the editor — is the ALIAS spelling. The tab
      // opens at a path the tree never uses, so nothing finds it again. The
      // same seam is why the rename cannot follow the tab: `followMoves` is
      // given `absOf(ctx.rootPath, …)`, which is the alias spelling, and the
      // tab it is looking for is under the real one.
      //
      // It is left alone deliberately. It is a SECOND alias surface, in the
      // renderer, with its own callers and its own escape questions, and
      // widening this phase to take it without a checklist is the thing the
      // phase's own refusals forbid. It is a finding for the backlog and it is
      // written here so it is not lost.
      const PRE_EXISTING_ALIAS_TAB_ROWS = [
        'P37: a valid Enter clears the reason, creates, selects and opens',
        'a created file opens in the editor',
        'the open editor tab follows the rename'
      ].sort();

      const GATE_VERBS = [
        'New Folder (inline rename on create)',
        'New File (inline rename on create)',
        'Rename',
        'Duplicate',
        'drag-to-move into a folder',
        'Replace completes the move',
        '.git is refused as a drag source and as a destination',
        'Delete confirms, names the item, and says it goes to the Trash',
        'the trashed file leaves the tree'
      ];
      const failureNames = (ops) =>
        (ops?.steps ?? []).filter((s) => !s.ok).map((s) => s.name).sort();

      await drive(cdp, {
        projectPath: alias,
        sidebarView: 'explorer',
        treeOps: { scratchDir: 'p273ops' }
      });
      await sleep(600);
      const aliasOps = treeOpsResult(cdp);

      // The control: a real directory, opened by its real spelling, in the same
      // session and the same window.
      await drive(cdp, {
        projectPath: control,
        sidebarView: 'explorer',
        treeOps: { scratchDir: 'p273ops' }
      });
      await sleep(600);
      const controlOps = treeOpsResult(cdp);

      const aliasFailures = failureNames(aliasOps);
      const controlFailures = failureNames(controlOps);
      findings.D = {
        alias: {
          passed: aliasOps?.passed ?? null,
          failed: aliasOps?.failed ?? null,
          failures: (aliasOps?.steps ?? [])
            .filter((s) => !s.ok)
            .map((s) => `${s.name}: ${s.detail}`)
        },
        control: {
          passed: controlOps?.passed ?? null,
          failed: controlOps?.failed ?? null,
          failures: (controlOps?.steps ?? [])
            .filter((s) => !s.ok)
            .map((s) => `${s.name}: ${s.detail}`)
        },
        gateVerbsGreenOnAlias: GATE_VERBS.filter(
          (name) => (aliasOps?.steps ?? []).find((s) => s.name === name)?.ok !== true
        ),
        aliasOnlyFailures: aliasFailures.filter((n) => !controlFailures.includes(n)).sort(),
        // Read off disk at the REAL path, never through the app. The probe
        // trashes its own scratch folder last, so gone is the right answer and
        // it is the proof the trash reached the real disk.
        scratchGoneAtRealPath: !existsSync(join(realProject, 'p273ops'))
      };
      say(`D: ${JSON.stringify(findings.D)}`);
      problems.push(
        ...grade([
          ['D every verb that goes through the changed gate is green on the alias', findings.D.gateVerbsGreenOnAlias, []],
          [
            'D the alias project fails exactly the three DECLARED pre-existing tab rows and no more',
            findings.D.aliasOnlyFailures,
            PRE_EXISTING_ALIAS_TAB_ROWS
          ],
          ['D the trash reached the real disk', findings.D.scratchGoneAtRealPath, true]
        ])
      );

      // --------------------------------------------------------------- ARM E
      // THE REFUSALS ARE STILL REFUSALS, through the SHIPPING channel, and
      // they now say which question they refused on. This is the arm that
      // proves the gate did not get weaker in the running app.
      // `expect` is a lowercase hex sha256 and the SHAPE check runs BEFORE
      // containment (guarded-write.ts step 1), so a malformed one answers
      // `input` and the containment step is never reached. The first run of
      // this probe passed `null` and read `input` three times, which is the
      // channel behaving and the arm measuring nothing. The two refused rows
      // use a well-formed digest that is simply not the file's — containment
      // refuses them before any file is opened, so the digest never matters —
      // and the row that must WRITE carries the real digest of the real bytes.
      const guarded = async (path, contents, expect) =>
        cdpEval(
          cdp,
          `window.gmux.fs.writeGuarded(${JSON.stringify({
            root: alias,
            path,
            contents,
            expect
          })}).then((r) => r)`,
          60000
        );
      const NOT_THE_FILE = '0'.repeat(64);
      const escapeTarget = join(root, 'ESCAPED.txt');
      rmSync(escapeTarget, { force: true });
      const escape = await guarded(
        join(alias, '..', 'ESCAPED.txt'),
        'should never be written',
        NOT_THE_FILE
      );
      const dotGit = await guarded(
        join(alias, '.git', 'config'),
        'should never be written',
        NOT_THE_FILE
      );
      const readmeDigest = createHash('sha256')
        .update(readFileSync(join(realProject, 'README.md')))
        .digest('hex');
      const aliasWrite = await guarded(
        join(alias, 'README.md'),
        '# proj\n\nwritten through the alias\n',
        readmeDigest
      );
      // A THIRD WORD, and the row that really drives arm F's redaction.
      //
      // The two rows above sit under the harness directory, which is not under
      // the scratch HOME, so asserting their logged paths are redacted asserts
      // nothing — the home prefix was never in them. This root IS under the
      // scratch HOME and is a real directory that is not an open project, so
      // `resolveProjectRoot` resolves it and `resolveOpenProjectRoot` refuses
      // it: the word is `projectClosed`, the sentence is the one that shipped,
      // and the logged `root` has to come back beginning with `~`.
      //
      // At the parent commit all THREE of these rows answer the single word
      // `outside`, and the person reads the closed-project sentence for every
      // one of them. That is the whole of half two in one reading.
      const notAProject = join(home, 'notprojects');
      mkdirSync(notAProject, { recursive: true });
      writeFileSync(join(notAProject, 'stray.md'), 'not in any project\n');
      const closedProject = await cdpEval(
        cdp,
        `window.gmux.fs.writeGuarded(${JSON.stringify({
          root: notAProject,
          path: join(notAProject, 'stray.md'),
          contents: 'should never be written',
          expect: '0'.repeat(64)
        })}).then((r) => r)`,
        60000
      );
      findings.E = {
        escape: { outcome: escape.outcome, why: escape.why ?? null, reason: escape.reason ?? null },
        escapeFileMade: existsSync(escapeTarget),
        dotGit: { outcome: dotGit.outcome, why: dotGit.why ?? null, reason: dotGit.reason ?? null },
        gitConfigIntact: disk(join(realProject, '.git', 'config')).includes('[core]'),
        aliasWrite: { outcome: aliasWrite.outcome, why: aliasWrite.why ?? null },
        readmeOnDisk: disk(join(realProject, 'README.md')),
        closedProject: {
          outcome: closedProject.outcome,
          why: closedProject.why ?? null,
          reason: closedProject.reason ?? null
        },
        strayUntouched: disk(join(notAProject, 'stray.md')) === 'not in any project\n'
      };
      say(`E: ${JSON.stringify(findings.E)}`);
      problems.push(
        ...grade([
          ['E a path escaping the root is refused', findings.E.escape.outcome, 'refused'],
          ['E and the word is outside', findings.E.escape.why, 'outside'],
          ['E and nothing was written outside the project', findings.E.escapeFileMade, false],
          ['E a path under .git is refused', findings.E.dotGit.outcome, 'refused'],
          ['E and the word is protected', findings.E.dotGit.why, 'protected'],
          ['E and .git/config is intact', findings.E.gitConfigIntact, true],
          ['E the alias spelling itself is written', findings.E.aliasWrite.outcome, 'wrote'],
          [
            'E and the bytes are on disk at the REAL path',
            findings.E.readmeOnDisk.includes('written through the alias'),
            true
          ],
          ['E a root that is no open project is refused', findings.E.closedProject.outcome, 'refused'],
          ['E and the word is projectClosed', findings.E.closedProject.why, 'projectClosed'],
          ['E and that file was not touched', findings.E.strayUntouched, true]
        ])
      );

      // --------------------------------------------------------------- ARM F
      // THE LOG LINE. Read off the file, not off the app.
      await sleep(800);
      const logPath = join(profile, 'logs', 'app.log');
      const logText = disk(logPath);
      const lines = refusalLines(logText);
      findings.F = {
        logExists: existsSync(logPath),
        refusalLines: lines.length,
        lines,
        redacted: everyPathRedacted(lines, home),
        noWroteLine: !logText.includes('fs.save.wrote'),
        noStaleLine: !logText.includes('fs.save.stale')
      };
      say(`F: ${JSON.stringify(findings.F)}`);
      problems.push(
        ...grade([
          ['F the log holds one line per refusal', lines.length, 3],
          ['F every line carries exactly four fields', [...new Set(lines.map((l) => l.names.join(',')))], ['path,reason,root,why']],
          ['F every line is a warn on the fs scope', [...new Set(lines.map((l) => `${l.level}/${l.scope}`))], ['warn/fs']],
          [
            'F the words are the three the channel answered, where the parent said one',
            lines.map((l) => l.why),
            ['outside', 'protected', 'projectClosed']
          ],
          ['F the home prefix is redacted', findings.F.redacted, true],
          [
            'F and the redaction was really exercised: the third line\'s root begins with ~',
            (lines[2]?.root ?? '').startsWith('~/'),
            true
          ],
          ['F nothing was logged for a write that succeeded', findings.F.noWroteLine, true],
          ['F and nothing for a stale', findings.F.noStaleLine, true]
        ])
      );
    } finally {
      try {
        cdp.close();
      } catch {
        /* already closed */
      }
    }
  }
);

// --------------------------------------------------------------------- ARM G
const opAfter = operatorCount();
findings.G = { before: opBefore, after: opAfter };
say(`G: ${JSON.stringify(findings.G)}`);
problems.push(...grade([["G the operator's own server is untouched", opAfter, opBefore]]));

say('');
say(`arm ${ARM}: ${problems.length === 0 ? 'PASS' : `${String(problems.length)} FINDING(S)`}`);
for (const p of problems) say(`  - ${p}`);
process.exit(problems.length === 0 ? 0 : 1);
