#!/usr/bin/env node
/**
 * probe-p274.mjs. THE PHASE 274 APP RUN: one folder opened twice, under two
 * spellings, in the real app (SPEC.md §11.2).
 *
 * TWO Electrons, ONE AT A TIME AND NEVER AT ONCE, on one scratch profile with a
 * scratch HOME and this script's own tmux socket, over one git project it
 * builds inside its own scratch directory. It spawns no agent, spends no token,
 * opens no keychain and makes no request. Every process it starts is ended in a
 * `finally`: the Electrons through `build/electron-run.mjs`, which kills the
 * tree it started whatever happened, and the socket by
 * `build/harness-socket.mjs`, which names it `gmux-p274-<pid>`, ends the server
 * afterwards and refuses `gmux` and `default` by name.
 *
 * ## Why this has to be a run and not a unit test
 *
 * The defect is a SEAM. `addProject` mints a row, `projects.path` is UNIQUE and
 * SQLite uniqueness is byte-exact, the tab spine draws one tab per row, the
 * sessions join is `WHERE project_path = ?`, and the file tree composes every
 * path by concatenating onto whichever spelling the row carries. Nothing but
 * the running app puts those five together, and every one of them had a green
 * unit suite while a person's sessions divided between two rows for one folder.
 *
 * ## The reporter's exact shape, and it is what this probe builds
 *
 * Issue 25, belucid, 2026-09-15:
 *
 *     $ cd /Users/sean/source/SpecStory/getspecstory/specstory-cli
 *     spelled: /Users/sean/source/...   (lowercase, as typed)
 *     real   : /Users/sean/Source/...   (capital, on disk)
 *
 * Not a symlink. A case-insensitive APFS volume, which is the default. So the
 * project here lives at `<scratch>/Source/proj` and the app is also told
 * `<scratch>/source/proj` — one folder, two strings, the case difference ABOVE
 * the project root.
 *
 * ## IT REFUSES TO RUN ON A VOLUME THAT SEPARATES CASE
 *
 * `<scratch>/source` and `<scratch>/Source` are two genuinely different folders
 * on a case-sensitive volume, and every arm below would then be measuring two
 * real projects rather than one folder spelled twice. The probe stats both
 * spellings before it launches anything and refuses with a sentence.
 *
 * ## The arms
 *
 *   V. THE VOLUME. Both spellings stat to one inode, proved before any launch.
 *   A. ONE FOLDER IS ONE PROJECT. Open by the disk spelling, then by the
 *      flipped one. ONE tab, ONE row in `projects`, and the row keeps the
 *      spelling it was first opened with — read twice, once through the shipped
 *      `projects.list()` bridge and once by `/usr/bin/sqlite3` straight off
 *      `<profile>/gmux/manifest.db`, because a bridge that agreed with itself
 *      would prove nothing about the table.
 *   B. THE SESSIONS DO NOT DIVIDE. One session created under each spelling,
 *      both drawn in the one tab's strip, and ONE distinct `project_path` in
 *      the manifest.
 *   S. THE MERGE DANGER, ON THE VOLUME WHERE IT IS REAL. Everything above is
 *      measured on a volume that FOLDS case, which is the only volume on which
 *      one folder can have two spellings. The reverse danger lives on a volume
 *      that SEPARATES case, where `Alpha` and `alpha` are two genuinely
 *      different folders and a repair that treated spellings as interchangeable
 *      would merge two real projects into one identity and lose a person one of
 *      them. So the run mounts a case-sensitive APFS image with `hdiutil` (no
 *      sudo), builds two REAL projects on it whose names differ only by case,
 *      opens BOTH in the same window, and asserts TWO tabs and TWO rows with
 *      two different ids — and that each one's tree answers its own file. The
 *      image is detached and its `.dmg` deleted in a `finally`. A gate cannot
 *      buy this arm: `conformance:samefolder` asks the MODULE and this asks the
 *      running app, through `projects.add` and the real `projects` table.
 *   C. THE ANSWER IS SPELLED THE WAY IT WAS ASKED. `fs:createFile` under the
 *      mis-spelled root answers a path under THAT root, with `relPath`
 *      unchanged — §8's row L1, which answered the disk spelling at the parent.
 *   D. THE TREE BATTERY, AGAINST A CONTROL. The 23 steps run in the
 *      mis-spelled project and in a project with no case difference on its
 *      path. Phase 273's probe DECLARED three rows that fail on a project whose
 *      spelling does not match disk — a created file opens no tab, and a rename
 *      does not follow one — and measured them identical at its parent and at
 *      its HEAD. Those three are this phase's, and arm D is where they come
 *      back green.
 *   E. ⌘S WRITES. A file created from the tree is typed into and saved with the
 *      shipped explicit save; the bytes are read back OFF DISK at the REAL
 *      path, and the tab goes clean with no toast and no dialog.
 *   F. RESTORE. A second Electron on the same profile, after the first has
 *      fully exited, draws every session the first one made.
 *   G. THE OPERATOR'S WORLD. `tmux -L gmux list-sessions` counted before and
 *      after and asserted unmoved.
 *
 * `P274_PARENT_BUILD` names a directory holding a build of the PARENT commit.
 * When it is set the probe launches THAT app instead of this tree's, one after
 * the other and never at once, so the before-and-after is measured rather than
 * asserted. The expectations are NOT flipped, because a probe that expects a
 * defect is a probe that stops noticing it: the findings ARE the parent
 * reading.
 *
 * `P274_REQUIRE_IMAGE=1` turns a host that cannot make the case-sensitive image
 * into a FAILURE rather than a named note, which is what the integrator ran.
 *
 * `--self-test` proves the grader on fixtures and launches nothing.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cdpEval, wsConnect } from '../cdp-client.mjs';
import { withElectron, withoutDevRenderer } from '../electron-run.mjs';
import { withCaseSensitiveImage } from './case-sensitive-image.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[p274]';
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
 * The `projects` table, read by `/usr/bin/sqlite3` rather than through the app.
 *
 * THE BRIDGE CANNOT BE THE ONLY WITNESS. `projects.list()` is main's own
 * answer, and the claim this phase makes is about the TABLE — that a folder
 * spelled two ways no longer becomes two rows in it. So the rows are read a
 * second time by a program that knows nothing about Tortie, off a copy of the
 * database file, and the two answers are held against each other.
 *
 * A copy, because the app has the database open and a reader poking at a live
 * SQLite file in WAL mode is a reader that can see a torn page.
 */
export function readProjectRows(db, scratch) {
  if (!existsSync(db)) return { error: `no manifest at ${db}` };
  const copy = join(scratch, 'manifest-copy.db');
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(`${db}${suffix}`)) {
      try {
        writeFileSync(`${copy}${suffix}`, readFileSync(`${db}${suffix}`));
      } catch (err) {
        return { error: `the manifest could not be copied: ${String(err)}` };
      }
    }
  }
  const run = (sql) =>
    spawnSync('/usr/bin/sqlite3', ['-readonly', copy, sql], { encoding: 'utf8' });
  const projects = run('SELECT path FROM projects ORDER BY path;');
  if (projects.status !== 0) return { error: `sqlite3 refused: ${(projects.stderr || '').trim()}` };
  const cwds = run('SELECT DISTINCT project_path FROM sessions ORDER BY project_path;');
  return {
    projects: projects.stdout.split('\n').filter((l) => l.trim() !== ''),
    sessionProjectPaths: cwds.stdout.split('\n').filter((l) => l.trim() !== '')
  };
}

function selfTest() {
  const fixtures = [
    ['a clean grade is empty', () => grade([['x', 1, 1]]), []],
    ['a disagreement is named', () => grade([['x', 1, 2]]), ['x: 1 want 2']],
    ['a missing manifest is a reading, not a throw', () => readProjectRows('/nope-p274/manifest.db', '/tmp').error !== undefined, true]
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
    [join(REPO, 'build', 'harness-socket.mjs'), '--fresh', 'gmux-p274', `node ${process.argv[1]}`],
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

const APP_DIR = (process.env['P274_PARENT_BUILD'] ?? '').trim() || REPO;
// Arm S's image. A host that cannot make one degrades to a named note; this
// turns that degradation into a failure, which is what the integrator ran.
const REQUIRE_IMAGE = process.env['P274_REQUIRE_IMAGE'] === '1';
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
// The scratch world. ONE REAL FOLDER, TWO SPELLINGS, the case difference ABOVE
// the project root — the reporter's exact shape.
// ---------------------------------------------------------------------------
mkdirSync(join(harnessDir, 'p274'), { recursive: true });
const root = realpathSync(join(harnessDir, 'p274'));
const home = join(root, 'h');
const profile = join(root, 'p');
for (const d of [home, profile]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}

/** The spelling that is ON DISK. */
const DISK = join(root, 'Source', 'proj');
/** The spelling a person types. One folder on a folding volume; two on a separating one. */
const TYPED = join(root, 'source', 'proj');
rmSync(join(root, 'Source'), { recursive: true, force: true });
mkdirSync(join(DISK, 'src'), { recursive: true });

// -------------------------------------------------------------------- ARM V
// THE VOLUME, PROVED BEFORE ANYTHING LAUNCHES. On a volume that separates case
// these two paths are two genuinely different folders and every arm below
// would be measuring the wrong thing.
const volumeFolds = (() => {
  try {
    const a = statSync(DISK);
    const b = statSync(TYPED);
    return a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  }
})();
if (!volumeFolds) {
  console.error(
    `${TAG} ${root} is on a volume that SEPARATES case: ${TYPED} is not the same folder as ${DISK}. ` +
      'This probe reproduces a case-insensitive volume, which is the APFS default and is the reporter\'s ' +
      'configuration, and it refuses to run rather than measure two real folders and call them one.'
  );
  process.exit(2);
}
say(`V: ${TYPED} and ${DISK} are one folder (dev ${String(statSync(DISK).dev)}, ino ${String(statSync(DISK).ino)})`);

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
writeFileSync(join(DISK, 'notes.md'), NOTES_V1);
writeFileSync(join(DISK, 'README.md'), '# proj\n');
writeFileSync(join(DISK, 'src', 'index.ts'), 'export const x = 1;\n');
for (const cwd of [DISK]) {
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.email', 'p274@example.invalid');
  git(cwd, 'config', 'user.name', 'p274');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', 'first');
}

/**
 * THE CONTROL. A project with no case difference anywhere on its path, opened
 * by the only spelling it has. Arm D's reading is the DIFFERENCE between the
 * two, because the 23-step battery touches surfaces this phase never goes near
 * and a bare failure count says nothing about the spelling.
 */
const control = join(root, 'control');
rmSync(control, { recursive: true, force: true });
mkdirSync(join(control, 'src'), { recursive: true });
writeFileSync(join(control, 'notes.md'), NOTES_V1);
writeFileSync(join(control, 'README.md'), '# control\n');
writeFileSync(join(control, 'src', 'index.ts'), 'export const x = 1;\n');
git(control, 'init', '-q', '-b', 'main');
git(control, 'config', 'user.email', 'p274@example.invalid');
git(control, 'config', 'user.name', 'p274');
git(control, 'add', '.');
git(control, 'commit', '-q', '-m', 'first');

const MANIFEST = join(profile, 'gmux', 'manifest.db');
say(`arm ${ARM}, app from ${APP_DIR}`);
say(`on disk:  ${DISK}`);
say(`as typed: ${TYPED}`);

// ---------------------------------------------------------------------------
// Readers.
// ---------------------------------------------------------------------------
const SPINE = `(() => Array.from(document.querySelectorAll('.ptab')).map(
  (t) => (t.querySelector('.ptab-name')?.textContent ?? '').trim()
))()`;
const monacoUp = `document.querySelector('.monaco-editor .view-lines') !== null`;

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
const p268Async = (cdp, call) => cdpEval(cdp, `window.__gmuxP268.${call}.then((r) => r)`, 120000);
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

/**
 * THE THREE ROWS PHASE 273 DECLARED AND THIS PHASE OWNS.
 *
 * Phase 273's probe measured them identical at its parent and at its HEAD on a
 * project whose stored spelling does not match the disk, and wrote them down
 * rather than widening: `fs:createFile` answered an entry carrying the REAL
 * spelling while the tree's own `rootPath` carried the person's, so the tab
 * opened at a path the tree never uses and nothing found it again. Rule 13 is
 * what makes them green, and arm D is where that is read rather than claimed.
 */
const PHASE_273_DECLARED_ROWS = [
  'P37: a valid Enter clears the reason, creates, selects and opens',
  'a created file opens in the editor',
  'the open editor tab follows the rename'
].sort();

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------
const findings = {};
const problems = [];
let sessionNames = [];

await withElectron(
  {
    label: `p274-spellings-${ARM.toLowerCase()}`,
    userDataDir: profile,
    tmuxSocket: null,
    cwd: APP_DIR,
    args: ['--remote-debugging-port=0', '--use-mock-keychain'],
    env: withoutDevRenderer({
      HOME: home,
      GMUX_TMUX_SOCKET: socket,
      GMUX_PROBES: '1',
      GMUX_LOG_FILE: '1'
    }),
    ceilingMs: 25 * 60 * 1000
  },
  async (handle) => {
    const { cdp, url } = await cdpForAppWindow(90000);
    say(`app window at ${url}, pid ${handle.appPid()}`);
    try {
      await cdp.call('Runtime.enable');
      for (;;) {
        if ((await cdpEval(cdp, `performance.getEntriesByType('navigation')[0].loadEventEnd`)) > 0) break;
        await sleep(50);
      }

      // --------------------------------------------------------------- ARM A
      // Open by the DISK spelling, then by the FLIPPED one.
      await drive(cdp, { projectPath: DISK, sidebarView: 'explorer', editorWidth: 1100 });
      await sleep(1200);
      const spineAfterFirst = await read(cdp, SPINE);
      const listAfterFirst = await read(cdp, `window.gmux.projects.list().then((r) => r.map((p) => p.path))`);

      await drive(cdp, { projectPath: TYPED, sidebarView: 'explorer', editorWidth: 1100 });
      await sleep(1200);
      const spineAfterSecond = await read(cdp, SPINE);
      const listAfterSecond = await read(cdp, `window.gmux.projects.list().then((r) => r.map((p) => p.path))`);
      const rowsA = readProjectRows(MANIFEST, root);

      findings.A = {
        spineAfterFirst,
        spineAfterSecond,
        tabsAfterSecond: spineAfterSecond.length,
        bridgeRowsAfterFirst: listAfterFirst,
        bridgeRowsAfterSecond: listAfterSecond,
        tableRows: rowsA.projects ?? rowsA.error,
        storedSpellingIsTheFirstOne: (listAfterSecond ?? []).includes(DISK),
        storedSpellingWasRewritten: (listAfterSecond ?? []).includes(TYPED)
      };
      say(`A: ${JSON.stringify(findings.A)}`);
      problems.push(
        ...grade([
          ['A one tab after the second spelling is opened', findings.A.tabsAfterSecond, 1],
          ['A one row in projects, read through the bridge', (listAfterSecond ?? []).length, 1],
          ['A one row in projects, read by sqlite3 off the table', (rowsA.projects ?? []).length, 1],
          ['A the stored spelling is the one it was first opened with', findings.A.storedSpellingIsTheFirstOne, true],
          ['A and nothing was re-spelled to what the person typed second', findings.A.storedSpellingWasRewritten, false]
        ])
      );

      // --------------------------------------------------------------- ARM B
      // One session under each spelling. They must land in ONE strip.
      await drive(cdp, { projectPath: DISK, sidebarView: 'explorer', session: { name: 'p274-disk' } });
      await sleep(1500);
      await drive(cdp, { projectPath: TYPED, sidebarView: 'explorer', session: { name: 'p274-typed' } });
      await sleep(1500);
      const sessions = await read(
        cdp,
        `window.gmux.sessions.list().then((r) => r.map((s) => ({ name: s.name, projectPath: s.projectPath })))`
      );
      const rowsB = readProjectRows(MANIFEST, root);
      sessionNames = (sessions ?? []).map((s) => s.name);
      const ours = (sessions ?? []).filter((s) => s.name.startsWith('p274-'));
      findings.B = {
        sessions: ours,
        distinctProjectPaths: [...new Set(ours.map((s) => s.projectPath))],
        tableDistinctProjectPaths: rowsB.sessionProjectPaths ?? rowsB.error,
        tabs: (await read(cdp, SPINE)).length
      };
      say(`B: ${JSON.stringify(findings.B)}`);
      problems.push(
        ...grade([
          ['B both sessions exist', ours.length, 2],
          ['B they name ONE project path between them', findings.B.distinctProjectPaths.length, 1],
          ['B and the manifest agrees, read by sqlite3', (rowsB.sessionProjectPaths ?? []).length, 1],
          ['B still one tab', findings.B.tabs, 1]
        ])
      );

      // --------------------------------------------------------------- ARM C
      // The answer is spelled the way it was asked. §8 row L1.
      const created = await read(
        cdp,
        `window.gmux.fs.createFile(${JSON.stringify({ root: TYPED, path: 'src/new-from-p274.md' })}).then((e) => e)`
      );
      findings.C = {
        path: created?.path ?? null,
        relPath: created?.relPath ?? null,
        underTyped: String(created?.path ?? '').startsWith(`${TYPED}/`),
        underDisk: String(created?.path ?? '').startsWith(`${DISK}/`)
      };
      say(`C: ${JSON.stringify(findings.C)}`);
      problems.push(
        ...grade([
          ['C the answer is spelled under the root the caller named', findings.C.underTyped, true],
          ['C and not under the resolved one', findings.C.underDisk, false],
          ['C relPath is unchanged, which it always was', findings.C.relPath, 'src/new-from-p274.md']
        ])
      );

      // --------------------------------------------------------------- ARM E
      // ⌘S writes, on a file reached through the mis-spelled root.
      const TYPED_NOTES = join(TYPED, 'notes.md');
      const REAL_NOTES = join(DISK, 'notes.md');
      await p268(cdp, 'clearToasts()');
      await drive(cdp, { projectPath: TYPED, sidebarView: 'explorer', openRel: 'notes.md', mode: 'file' });
      await sleep(800);
      await p268Async(cdp, `sourceMode(${JSON.stringify(TYPED_NOTES)})`);
      await until(cdp, monacoUp, 30000);
      await sleep(600);
      const typed = await p268Async(cdp, `type(${JSON.stringify(TYPED_NOTES)}, 'A PERSON TYPED THIS.', 0)`);
      const saved = await p268Async(cdp, `explicitSave(${JSON.stringify(TYPED_NOTES)})`);
      await sleep(600);
      const onDisk = disk(REAL_NOTES);
      findings.E = {
        dirtyBeforeSave: tabOf(typed, 'notes.md')?.dirty ?? null,
        dirtyAfterSave: tabOf(saved, 'notes.md')?.dirty ?? null,
        toasts: saved.toasts,
        dialog: saved.confirm,
        diskHoldsTypedBytes: onDisk.includes('A PERSON TYPED THIS.'),
        tabPathIsTypedSpelling: String(tabOf(saved, 'notes.md')?.path ?? '').startsWith(`${TYPED}/`)
      };
      say(`E: ${JSON.stringify(findings.E)}`);
      problems.push(
        ...grade([
          ['E the tab was dirty before the save', findings.E.dirtyBeforeSave, true],
          ['E THE SAVE WROTE, read off disk at the REAL path', findings.E.diskHoldsTypedBytes, true],
          ['E the tab went clean', findings.E.dirtyAfterSave, false],
          ['E no toast was raised', findings.E.toasts, []],
          ['E no dialog opened', findings.E.dialog, null],
          ['E the tab still carries the spelling the person opened', findings.E.tabPathIsTypedSpelling, true]
        ])
      );

      // --------------------------------------------------------------- ARM D
      // The 23-step tree battery, in the mis-spelled project and in a control.
      await drive(cdp, { projectPath: TYPED, sidebarView: 'explorer', treeOps: { scratchDir: 'p274ops' } });
      await sleep(600);
      const typedOps = treeOpsResult(cdp);
      await drive(cdp, { projectPath: control, sidebarView: 'explorer', treeOps: { scratchDir: 'p274ops' } });
      await sleep(600);
      const controlOps = treeOpsResult(cdp);
      const failureNames = (ops) => (ops?.steps ?? []).filter((s) => !s.ok).map((s) => s.name).sort();
      const typedFailures = failureNames(typedOps);
      const controlFailures = failureNames(controlOps);
      findings.D = {
        typed: { passed: typedOps?.passed ?? null, failed: typedOps?.failed ?? null, failures: typedFailures },
        control: { passed: controlOps?.passed ?? null, failed: controlOps?.failed ?? null, failures: controlFailures },
        onlyOnTheMisspelled: typedFailures.filter((n) => !controlFailures.includes(n)).sort(),
        phase273RowsStillFailing: PHASE_273_DECLARED_ROWS.filter((n) => typedFailures.includes(n)),
        // Read off disk at the REAL path, never through the app. The battery
        // trashes its own scratch folder last, so GONE is the proof the trash
        // reached the real disk.
        scratchGoneAtRealPath: !existsSync(join(DISK, 'p274ops'))
      };
      say(`D: ${JSON.stringify(findings.D)}`);
      problems.push(
        ...grade([
          ['D the mis-spelled project fails nothing the control does not', findings.D.onlyOnTheMisspelled, []],
          ["D the three rows Phase 273 declared are green", findings.D.phase273RowsStillFailing, []],
          ['D the trash reached the real disk', findings.D.scratchGoneAtRealPath, true]
        ])
      );

      // --------------------------------------------------------------- ARM S
      // THE MERGE DANGER, ON THE ONLY VOLUME WHERE IT IS REAL.
      //
      // THE INTEGRATOR ADDED THIS ARM. Every arm above is measured on a volume
      // that FOLDS case, because that is the only kind of volume on which one
      // folder can have two spellings, and every one of them is about NOT
      // minting a second row. The danger that costs a person their work runs
      // the other way: on a volume that SEPARATES case, `Alpha` and `alpha` are
      // two genuinely different folders, and a repair that treated two
      // spellings as interchangeable would answer the second add with the first
      // row, draw one tab, and lose a person a whole project. `sameFolder`
      // cannot do that by construction — it compares `st.dev` and `st.ino` and
      // never two strings — but "by construction" is the kind of claim this
      // repository makes a probe prove, and `conformance:samefolder` proves it
      // of the MODULE while this proves it of the running app, through
      // `projects.add` and the real `projects` table.
      //
      // So: mount a case-sensitive APFS image with `hdiutil` (no sudo), build
      // two REAL folders on it whose names differ only by case, each holding a
      // file only it has, open BOTH in this same window, and assert TWO tabs,
      // TWO rows, TWO ids — and that each project's own tree answers its own
      // file rather than its twin's. The image is detached and the `.dmg`
      // deleted inside `withCaseSensitiveImage`'s own `finally`.
      await withCaseSensitiveImage(async (mount, note) => {
        if (mount === null) {
          findings.S = { skipped: note };
          say(`S: no case-sensitive image (${String(note)})`);
          // A host that cannot make the image is a degraded run and says so in
          // one line. P274_REQUIRE_IMAGE=1 turns that into a failure, which is
          // what the integrator ran, because the sensitive column is half the
          // promise and a run that quietly skipped it has proved half a phase.
          if (REQUIRE_IMAGE) {
            problems.push(`S the case-sensitive image is required and could not be made: ${String(note)}`);
          }
          return;
        }
        const work = join(mount, 'p274-merge');
        const UPPER = join(work, 'Alpha');
        const LOWER = join(work, 'alpha');
        mkdirSync(UPPER, { recursive: true });
        mkdirSync(LOWER, { recursive: true });
        writeFileSync(join(UPPER, 'UPPER-ONLY.md'), '# upper\n');
        writeFileSync(join(LOWER, 'lower-only.md'), '# lower\n');
        // THE VOLUME IS PROVED, NOT ASSUMED, exactly as arm V proves the other
        // one. If these two ever came back as one inode the arm would be
        // measuring one folder and calling it two, which is arm V's mistake
        // wearing the other sign.
        const up = statSync(UPPER);
        const low = statSync(LOWER);
        const twoRealFolders = up.dev === low.dev && up.ino !== low.ino;

        // OPENED THE WAY ARM A OPENS, so the two readings are the same reading
        // with the sign reversed: arm A drives two SPELLINGS of one folder and
        // reads ONE tab, and this drives two FOLDERS whose names differ only by
        // case and reads TWO. A raw `window.gmux.projects.add` would add the
        // rows and leave the spine alone — the renderer re-reads the list and
        // sets its own state in `addProjectPath` — so the tab half has to go
        // through the same door a person's Open Folder does. Measured: the
        // bridge call added both ROWS and moved the spine by 0.
        const tabsBefore = (await read(cdp, SPINE)).length;
        await drive(cdp, { projectPath: UPPER, sidebarView: 'explorer', editorWidth: 1100 });
        await sleep(1000);
        await drive(cdp, { projectPath: LOWER, sidebarView: 'explorer', editorWidth: 1100 });
        await sleep(1200);
        const openedS = await read(
          cdp,
          `window.gmux.projects.list().then((r) => r.map((p) => ({ id: p.id, path: p.path })))`
        );
        const rowFor = (path) => (openedS ?? []).find((p) => p.path === path) ?? null;
        const addedUpper = rowFor(UPPER);
        const addedLower = rowFor(LOWER);
        const listS = (openedS ?? []).map((p) => p.path);
        const rowsS = readProjectRows(MANIFEST, root);
        const tableS = rowsS.projects ?? [];
        // EACH TREE ANSWERS ITS OWN FILE. Two rows with two ids would still be
        // a defect if both drew the same folder's contents, so the last
        // question is asked of `fs:readDir`, which is the channel the tree
        // itself reads through.
        const namesIn = async (dir) => {
          const r = await read(
            cdp,
            `window.gmux.fs.readDir(${JSON.stringify(dir)}).then((d) => d.entries.map((e) => e.name).sort())`
          );
          return r ?? [];
        };
        findings.S = {
          mount,
          twoRealFolders,
          addedUpper,
          addedLower,
          sameIdForBoth:
            addedUpper !== null && addedLower !== null && addedUpper.id === addedLower.id,
          tabsAdded: (await read(cdp, SPINE)).length - tabsBefore,
          bridgeHasBoth: [UPPER, LOWER].filter((p) => (listS ?? []).includes(p)),
          tableHasBoth: [UPPER, LOWER].filter((p) => tableS.includes(p)),
          upperTree: await namesIn(UPPER),
          lowerTree: await namesIn(LOWER)
        };
        say(`S: ${JSON.stringify(findings.S)}`);
        problems.push(
          ...grade([
            ['S the image really separates case, so there are two real folders', twoRealFolders, true],
            ['S TWO PROJECT ROWS, one per real folder', findings.S.tableHasBoth, [UPPER, LOWER]],
            ['S the bridge draws both', findings.S.bridgeHasBoth, [UPPER, LOWER]],
            ['S with two different ids — the second add never answered the first row', findings.S.sameIdForBoth, false],
            ['S two tabs were added, not one', findings.S.tabsAdded, 2],
            ["S and each tree answers its OWN file", findings.S.upperTree, ['UPPER-ONLY.md']],
            ['S including the lower one', findings.S.lowerTree, ['lower-only.md']]
          ])
        );
        // The projects are removed before the image is detached, so nothing in
        // the manifest points at a mount that is about to go and arm F's row
        // count stays the reading it already is.
        for (const added of [addedUpper, addedLower]) {
          if (added?.id === undefined) continue;
          await read(cdp, `window.gmux.projects.remove(${JSON.stringify(added.id)}).then(() => true)`);
        }
        await sleep(600);
      });
    } finally {
      try {
        cdp.close();
      } catch {
        /* already closed */
      }
    }
  }
);

// --------------------------------------------------------------------- ARM F
// RESTORE. A SECOND Electron, on the same profile, AFTER the first has fully
// exited — `withElectron` ended its tree before this line was reached, so the
// two are never up at once.
await withElectron(
  {
    label: `p274-restore-${ARM.toLowerCase()}`,
    userDataDir: profile,
    tmuxSocket: null,
    cwd: APP_DIR,
    args: ['--remote-debugging-port=0', '--use-mock-keychain'],
    env: withoutDevRenderer({
      HOME: home,
      GMUX_TMUX_SOCKET: socket,
      GMUX_PROBES: '1',
      GMUX_LOG_FILE: '1'
    }),
    ceilingMs: 15 * 60 * 1000
  },
  async () => {
    const { cdp } = await cdpForAppWindow(90000);
    try {
      await cdp.call('Runtime.enable');
      await sleep(4000);
      const back = await read(
        cdp,
        `window.gmux.sessions.list().then((r) => r.map((s) => ({ name: s.name, projectPath: s.projectPath })))`
      );
      const rowsF = readProjectRows(MANIFEST, root);
      const ours = (back ?? []).filter((s) => String(s.name).startsWith('p274-'));
      // BY NOW THE CONTROL PROJECT IS OPEN TOO, because arm D opened it. So
      // the row count is two, and the claim is not "one row in the table" — it
      // is that the two SPELLINGS of the one folder are still one row and the
      // second row is the control. A first version of this arm asserted the
      // count and read 2, which is the probe's own fixture rather than a defect.
      const rows = rowsF.projects ?? [];
      findings.F = {
        drawn: ours,
        tabs: (await read(cdp, SPINE)).length,
        tableRows: rows,
        rowsForTheOneFolder: rows.filter((p) => p === DISK || p === TYPED),
        anyRowAtTheTypedSpelling: rows.includes(TYPED),
        distinct: [...new Set(ours.map((s) => s.projectPath))]
      };
      say(`F: ${JSON.stringify(findings.F)}`);
      problems.push(
        ...grade([
          ['F every session made in the first launch comes back', ours.length, 2],
          ['F under ONE project path', findings.F.distinct.length, 1],
          ['F the one folder still has exactly one row', findings.F.rowsForTheOneFolder, [DISK]],
          ['F and nothing was ever stored at the spelling typed second', findings.F.anyRowAtTheTypedSpelling, false]
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
problems.push(...grade([["G the operator's own tmux server is untouched", opAfter, opBefore]]));

say(`sessions this run made: ${sessionNames.filter((n) => n.startsWith('p274-')).join(', ') || '(none)'}`);
if (problems.length > 0) {
  for (const p of problems) process.stderr.write(`${TAG} ${p}\n`);
  process.stderr.write(`${TAG} FAILED: ${String(problems.length)} finding(s) on arm ${ARM}.\n`);
  process.exit(1);
}
say(`OK on arm ${ARM}: one folder, two spellings, one project, one strip, and restore drew it all back.`);
process.exit(0);
