#!/usr/bin/env node
/**
 * probe-p275.mjs. THE PHASE 275 APP RUN — one Electron, every claim.
 *
 * ## What it has to prove, and why reading the code is not enough
 *
 * Phase 275 says a person can name a shell variable ONCE and every agent gets
 * it. The unit lane can prove the union function unions and the seal seals. It
 * cannot prove the thing the reporter actually asked for, which is that a key
 * he sets in the window reaches a process Tortie started. So this run:
 *
 *   1. adds a name to the SHARED card, through the picker and the confirm, and
 *      COUNTS THE GESTURES against the parent's own ledger;
 *   2. starts a session for AGENT A and reads the variable back OUT OF THE
 *      PANE'S OWN PROCESS ENVIRONMENT, not out of tmux's record and not out of
 *      Tortie's manifest row;
 *   3. starts a session for AGENT B and reads it back there too — one setting,
 *      two agents, which is the whole of the reporter's ask;
 *   4. adds a PER-AGENT name on a third card and proves it is NARROWER: it
 *      reaches that agent's pane and neither of the other two;
 *   5. drives the list itself — fifty-one names present, the scroller scrolling
 *      in OUR document, the filter, several ticked at once, and a name the
 *      shell does not export typed and accepted;
 *   6. drives the ZERO case — a login shell that exports nothing — and proves a
 *      person can still type a name.
 *
 * ## How the pane's own environment is read, and why it is that way
 *
 * The three agents are stand-in executables this probe writes. When one is
 * launched as a session it reads ITS OWN `environ` and writes down WHICH NAMES
 * IT RECEIVED — the process Tortie started, reporting on itself. That is a
 * stronger reading than `tmux show-environment`, which is tmux's record of what
 * it was handed, and far stronger than reading the manifest row, which is
 * Tortie's record of what it intended.
 *
 * ## NO VALUE, ANYWHERE
 *
 * Every variable name in the scratch profile is INVENTED here, in the shape a
 * provider key has and matching nothing real. The values are the literal
 * sentinel `p275-sentinel-not-a-key`. The stand-ins never write a value: they
 * write `NAME present matches-sentinel`, `NAME present other` or `NAME absent`,
 * so the report file cannot hold one either. Section 6 of the run greps the
 * profile directory, the manifest and settings.json for the sentinel and must
 * find zero hits in each.
 *
 * ## The zero case, and the switch that makes it real
 *
 * The zero arm is a REAL `$SHELL -lic` that really answers nothing, not a faked
 * answer pushed into a store. The scratch `.zshrc` exports its invented set
 * only while a marker file is ABSENT; once the marker exists it ends in
 * `exec /usr/bin/true`, so the shell never runs the `-c` script, never prints
 * the probe's framing markers, and `captureLoginShellEnvNames` settles as
 * `{ names: [], probeFailed: true }`. The LAST stand-in this run launches
 * touches the marker, AFTER it has read its own environment, and
 * `loginShellEnvNames` has no cross-ask cache — every opening of the picker
 * runs a fresh login shell — so the next opening is the zero arm.
 *
 * FIRST DRAFT MEASURED, AND IT WAS NOT ZERO. The marker originally suppressed
 * only the invented exports. The picker then came back with 54 rows rather than
 * 0, because a login zsh always exports a few dozen names of its own — there is
 * no such thing as a real login shell that exports nothing. The honest zero is
 * the one the phase entry actually names, "the shell-probe-failed path that
 * must still let a person type a name", and that is what this arm drives.
 *
 * ## Safety
 *
 *   - ONE Electron, through build/electron-run.mjs, which ends the tree it
 *     started in a `finally` block.
 *   - Its own tmux socket, ended by the same helper. `-L gmux` is named once,
 *     read only, for the before/after census of the operator's own server.
 *   - Everything it writes is under P275_ROOT (default /private/tmp/p275-app).
 *     Nothing under a home directory is written or removed.
 *
 * Usage:
 *   npm run build && node build/p275/probe-p275.mjs
 */

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withElectron } from '../electron-run.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[p275]';
const t0 = Date.now();
const say = (line) =>
  console.log(`${TAG} ${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`);

if (!existsSync(join(repoRoot, 'out', 'main', 'index.js'))) {
  console.error(`${TAG} REFUSED. out/main/index.js is missing. npm run build first.`);
  process.exit(2);
}

const rawRoot = process.env['P275_ROOT'] ?? '/private/tmp/p275-app';
if (!rawRoot.startsWith('/private/tmp/') && !rawRoot.startsWith('/tmp/')) {
  console.error(`${TAG} REFUSED. P275_ROOT must live under /private/tmp.`);
  process.exit(2);
}
rmSync(rawRoot, { recursive: true, force: true });
for (const d of ['home', 'bin', 'profile', 'out', 'reports', 'project']) {
  mkdirSync(join(rawRoot, d), { recursive: true });
}
const root = realpathSync(rawRoot);
const scratchHome = join(root, 'home');
const binDir = join(root, 'bin');
const userData = join(root, 'profile');
const outDir = join(root, 'out');
const reportsDir = join(root, 'reports');
const projectDir = join(root, 'project');
const zeroMarker = join(root, 'zero-mode');

// ---------------------------------------------------------------------------
// The scratch login shell. INVENTED NAMES, ONE SENTINEL VALUE.
// ---------------------------------------------------------------------------

/**
 * The one value this whole run uses, invented here. It exists so the stand-in
 * can say "the variable arrived AND it is the one my profile set" rather than
 * only "a variable of that name exists". It is never written into any report,
 * and section 6 proves it is in no file the app produced.
 */
const SENTINEL = 'p275-sentinel-not-a-key';

// Invented vendors in the shape a provider key has, so the list is realistic in
// COUNT and in LENGTH without naming anything real. The operator's own shell
// answers 51 names; thirteen vendors × four gives 52 of our own on top of what
// a login zsh already sets, which clears the 51 the phase entry measured.
const VENDORS = [
  'ACMEAI',
  'NOVALM',
  'ZEPHYRAI',
  'QUILLNET',
  'HARBORML',
  'LUMENAI',
  'TIDEWATER',
  'GRANITEAI',
  'MERIDIANML',
  'ORCHARDAI',
  'PELICANLM',
  'SALTMARSH',
  'WINDROSEAI'
];
const INVENTED = [];
for (const vendor of VENDORS) {
  INVENTED.push(`${vendor}_API_KEY`);
  INVENTED.push(`${vendor}_BASE_URL`);
  INVENTED.push(`${vendor}_ORG_ID`);
  INVENTED.push(`${vendor}_PROJECT`);
}

/** The name that goes on the SHARED list and must reach every agent. */
const SHARED_NAME = 'ACMEAI_API_KEY';
/** The name that goes on ONE agent's list and must reach only that agent. */
const NARROW_NAME = 'ZEPHYRAI_API_KEY';
/**
 * Three more, ticked in ONE trip, which is the number the phase's own
 * before/after claim uses: three keys on every agent is eight gestures and one
 * confirmation after, against fifty-seven and eleven at the parent.
 */
const BATCH_NAMES = ['NOVALM_API_KEY', 'HARBORML_API_KEY', 'LUMENAI_API_KEY'];
/** A valid name this shell does not export. Never a cage. */
const TYPED_NAME = 'P275_TYPED_NOT_EXPORTED';
/** The name typed in the ZERO arm, where the shell offers nothing at all. */
const ZERO_TYPED_NAME = 'P275_ZERO_TYPED';

/** Every name a stand-in reports on. Names only, both here and over there. */
const WATCHED = [SHARED_NAME, NARROW_NAME, ...BATCH_NAMES, TYPED_NAME];

writeFileSync(
  join(scratchHome, '.zshrc'),
  [
    '# Phase 275 app run. PATH is outside the switch so the stand-in agents',
    '# keep resolving after the zero-mode marker appears.',
    `export PATH="${binDir}:$PATH"`,
    '',
    '# THE ZERO-MODE SWITCH. While this marker is absent the profile exports',
    '# its invented set. The LAST session this run starts touches the marker,',
    '# and from then on this profile execs /usr/bin/true, so the shell never',
    '# runs the -c script it was given, never prints the probe framing, and the',
    '# capture settles probeFailed with no names. That is a REAL login shell',
    '# that does not answer — the path the phase entry names — and not a faked',
    '# answer pushed into a store. There is no cross-ask cache, so the next',
    '# opening of the picker runs a fresh login shell and meets it.',
    `if [ -f ${JSON.stringify(zeroMarker)} ]; then`,
    '  exec /usr/bin/true',
    'fi',
    ...INVENTED.map((n) => `export ${n}=${SENTINEL}`),
    ''
  ].join('\n'),
  'utf8'
);

// ---------------------------------------------------------------------------
// Three stand-in agents that report on THEIR OWN environment
// ---------------------------------------------------------------------------

/**
 * The three stand-ins, and the version line each one must print.
 *
 * MEASURED RATHER THAN GUESSED. `claude`'s registry row probes with `-v` and
 * requires the identity substring `(Claude Code)`
 * (src/main/agents/registry.ts). The first run of this probe printed a bare
 * `0.0.0-p275` for all three, the claude row failed its identity check, and the
 * Claude Code card drew with no shell-variable group at all — which made the
 * narrowing arm pass over a card that was not there. The other two have no
 * identity substring and take anything.
 */
const AGENTS = ['claude', 'codex', 'gemini'];
const VERSION_LINE = {
  claude: '0.0.0-p275 (Claude Code)',
  codex: 'codex-cli 0.0.0-p275',
  gemini: '0.0.0-p275'
};
/**
 * The one that flips the profile into zero mode, AFTER it has read its own
 * environment. It is the last session this run starts, so nothing that needs a
 * value is created behind it.
 */
const ZERO_FLIPPER = 'gemini';

for (const agent of AGENTS) {
  const script = [
    '#!/bin/sh',
    '# Phase 275 stand-in. Two jobs and nothing else.',
    '#',
    '# --version answers the agent scan, so a card draws for this binary.',
    '# Anything else is a SESSION LAUNCH: the process reads its OWN environ and',
    '# writes down WHICH NAMES IT RECEIVED. No value is ever written — the',
    '# verdict file holds a name and one of three words.',
    'case "$1" in',
    `  --version|-v|-V) echo ${JSON.stringify(VERSION_LINE[agent])}; exit 0 ;;`,
    'esac',
    `me=$(basename "$0")`,
    `reports=${JSON.stringify(reportsDir)}`,
    '# Every name this process was handed, values stripped by the shell itself.',
    'env | sed "s/=.*//" | sort > "$reports/$me.names"',
    ': > "$reports/$me.verdict"',
    `for n in ${WATCHED.join(' ')}; do`,
    '  eval "v=\\$$n"',
    '  if [ -z "$v" ]; then',
    '    echo "$n absent" >> "$reports/$me.verdict"',
    `  elif [ "$v" = ${JSON.stringify(SENTINEL)} ]; then`,
    '    echo "$n present matches-sentinel" >> "$reports/$me.verdict"',
    '  else',
    '    echo "$n present other" >> "$reports/$me.verdict"',
    '  fi',
    'done',
    ...(agent === ZERO_FLIPPER
      ? [
          '# The zero-mode switch, thrown only AFTER this process has read its',
          '# own environment, so this session still receives everything it was',
          '# promised. Every later login shell exports nothing.',
          `: > ${JSON.stringify(zeroMarker)}`
        ]
      : []),
    'exec sleep 900',
    ''
  ].join('\n');
  const p = join(binDir, agent);
  writeFileSync(p, script, 'utf8');
  chmodSync(p, 0o755);
}

/**
 * A HERMETIC PATH FOR THE ELECTRON, and the first run needed it.
 *
 * That run passed `...process.env` straight through, so the app inherited the
 * operator's own PATH, its agent scan found ELEVEN real agent CLIs installed on
 * this machine, and eleven cards drew. Nothing was launched from them — the
 * three sessions still ran this probe's own stand-ins, because the login shell
 * puts `binDir` first — but a probe whose readings depend on what happens to be
 * installed on the machine running it is not a probe. This PATH holds this
 * probe's own bin directory and the three system directories plus wherever
 * `tmux` and `git` actually are, resolved here rather than assumed.
 */
function toolDir(name) {
  const r = spawnSync('command', ['-v', name], {
    encoding: 'utf8',
    shell: '/bin/sh'
  });
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
say(`hermetic PATH: ${hermeticPath}`);

// A git repository for the project, because Tortie opens a folder as a project
// and several surfaces expect one. Nothing is committed and nothing is pushed.
spawnSync('git', ['init', '-q', projectDir], { encoding: 'utf8' });
writeFileSync(join(projectDir, 'README.md'), '# p275 scratch project\n', 'utf8');

// ---------------------------------------------------------------------------
// The operator's own server, listed and never written. Named once.
// ---------------------------------------------------------------------------
function operatorSessionCount() {
  const out = spawnSync('tmux', ['-L', 'gmux', 'list-sessions'], {
    encoding: 'utf8'
  });
  if (out.status !== 0) return -1;
  return out.stdout.split('\n').filter((l) => l.trim() !== '').length;
}
const before = operatorSessionCount();
say(`operator sessions before: ${String(before)}`);

// ---------------------------------------------------------------------------
// The driver, run inside the real Settings renderer
// ---------------------------------------------------------------------------

const driver = `(async () => {
  const SHARED_NAME = ${JSON.stringify(SHARED_NAME)};
  const NARROW_NAME = ${JSON.stringify(NARROW_NAME)};
  const BATCH_NAMES = ${JSON.stringify(BATCH_NAMES)};
  const TYPED_NAME = ${JSON.stringify(TYPED_NAME)};
  const ZERO_TYPED_NAME = ${JSON.stringify(ZERO_TYPED_NAME)};
  const PROJECT = ${JSON.stringify(projectDir)};
  const readings = {};
  const notes = [];

  // A real task, not a timer: Chromium throttles setTimeout in a page it
  // considers hidden to one a second and then to one a minute, which is the
  // stall probe:p1741 measured and wrote a paragraph about. A MessageChannel
  // turn is a task the throttler does not touch, and React's scheduler runs on
  // the same kind of task.
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
      const got = fn();
      if (got) return got;
      if (Date.now() > stop) return null;
      await wait(step || 200);
    }
  };
  const text = (el) => (el ? (el.textContent || '').trim() : null);

  // THE GESTURE LEDGER. One entry is one discrete physical act by a person:
  // one click, one keypress. Every one of them is DISPATCHED on the real
  // shipped control, so the number can be disputed line by line.
  const ledger = [];
  let scope = 'page';
  const charge = (what) => { ledger.push({ what, scope }); };
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

  const sheet = () => document.querySelector('.modal.set-env-picker');
  const scroller = () => document.querySelector('.set-env-list');
  const rows = () =>
    Array.from(document.querySelectorAll('#set-env-picker-list [role="option"]'));
  const rowFor = (name) => document.getElementById('set-env-opt-' + name);
  const countLine = () => text(document.querySelector('.set-env-picker-count'));
  const pickerNote = () =>
    text(document.querySelector('.modal.set-env-picker .set-env-note'));
  const filterInput = () =>
    document.querySelector('.modal.set-env-picker .filter-field input, .modal.set-env-picker input.input');
  const confirmModal = () => document.querySelector('.modal.set-confirm');
  const addButton = () => {
    const actions = sheet() ? sheet().querySelector('.modal-actions') : null;
    return actions ? actions.querySelector('.btn-primary') : null;
  };
  const group = (scopeName) =>
    document.querySelector('.set-env-group[data-env-scope="' + scopeName + '"]');
  const chipsOf = (scopeName) => {
    const g = group(scopeName);
    if (!g) return null;
    return Array.from(g.querySelectorAll('.set-chip.envname')).map((c) =>
      (c.childNodes[0].textContent || '').trim()
    );
  };

  // -- section 0: reach Launch defaults ------------------------------------
  // ⌘, is charged as gesture 1 without being dispatched: the harness opens the
  // Settings window directly, and the accelerator that opens it is a fact about
  // the menu rather than about this page. It is charged on BOTH sides of the
  // comparison, so it cancels.
  charge('press ⌘, to open Settings');
  const rail = Array.from(document.querySelectorAll('.set-nav-item'))
    .find((n) => (n.textContent || '').trim() === 'Launch defaults');
  if (!rail) return JSON.stringify({ error: 'no Launch defaults item in the rail' });
  click(rail);
  charge('click the rail item "Launch defaults"');
  await settle(40);
  await wait(1500);
  await settle(40);

  const cards = Array.from(document.querySelectorAll('.set-defaults-card'));
  readings.cardNames = cards.map((c) => text(c.querySelector('.set-defaults-name')));
  readings.sharedCardIsFirst =
    cards.length > 0 &&
    text(cards[0].querySelector('.set-defaults-name')) === 'Every agent';
  readings.sharedCardEmptyLine = text(
    group('shared') ? group('shared').querySelector('.set-env-empty') : null
  );
  readings.agentScopes = Array.from(
    document.querySelectorAll('.set-env-group[data-agent-id]')
  ).map((g) => g.getAttribute('data-agent-id'));
  // No inherit line anywhere while the shared list is empty — a person who
  // never opens the shared card meets no extra sentence at all.
  readings.inheritLinesWhileSharedEmpty =
    document.querySelectorAll('.set-env-inherit').length;

  // ======================================================================
  // SECTION 1 — the shared add, and the gesture count
  // ======================================================================
  scope = 'shared-add';
  const sharedGroup = group('shared');
  if (!sharedGroup) return JSON.stringify({ error: 'no shared card drawn' });
  click(sharedGroup.querySelector('.set-env-add'));
  charge('click "Add…" on the Every agent card');
  const opened = await until(() => sheet(), 20000);
  if (!opened) return JSON.stringify({ error: 'the picker sheet never opened' });
  // The candidate list is asked on OPEN and nowhere else, and the ask starts a
  // login shell, so this wait is the product's own latency and not slack.
  const filled = await until(() => (rows().length > 5 ? rows().length : null), 25000);
  readings.sharedSheetTitle = text(sheet().querySelector('.modal-title'));
  readings.sharedSheetRowsAtRest = rows().length;
  readings.sharedSheetCountAtRest = countLine();
  readings.sharedSheetNoteAtRest = pickerNote();
  readings.sharedSheetFilled = filled;

  // -- THE LIST IS OURS: it scrolls, in OUR document -----------------------
  // This is the reading the parent could not produce. At the parent the
  // suggestion popup was Electron's own autofill view, drawn outside the
  // document: its box was [0,0,0,0], every option's box was [0,0,0,0], and a
  // click on the field added zero nodes. Here the scroller is an element of
  // ours with a scrollbar of ours.
  const sc = scroller();
  const scRect = sc.getBoundingClientRect();
  readings.scroller = {
    className: sc.className,
    boxHeight: Math.round(scRect.height),
    clientHeight: sc.clientHeight,
    scrollHeight: sc.scrollHeight,
    overflowsBy: sc.scrollHeight - sc.clientHeight,
    scrollTopBefore: sc.scrollTop
  };
  // Every row has a real box, which is the other half of what the datalist
  // could not do. Read at rest, BEFORE the scroll, or the y is the scrolled y.
  const firstRow = rows()[0];
  const fr = firstRow.getBoundingClientRect();
  readings.firstRowBox = [
    Math.round(fr.x), Math.round(fr.y), Math.round(fr.width), Math.round(fr.height)
  ];
  readings.everyRowHasABox = rows().every((r) => r.getBoundingClientRect().height > 0);
  sc.scrollTop = sc.scrollHeight;
  await settle(10);
  readings.scroller.scrollTopAfter = sc.scrollTop;
  readings.scroller.scrolled = sc.scrollTop > 0;
  sc.scrollTop = 0;
  await settle(10);

  // -- THE FILTER ----------------------------------------------------------
  const input = filterInput();
  if (!input) return JSON.stringify({ error: 'the picker has no filter field' });
  readings.filterPlaceholder = input.getAttribute('placeholder');
  readings.filterRole = input.getAttribute('role');
  setValue(input, 'acmeai');
  await settle(20);
  readings.filter = {
    query: 'acmeai',
    rows: rows().length,
    count: countLine(),
    names: rows().map((r) => r.id.replace('set-env-opt-', ''))
  };
  setValue(input, '');
  await settle(20);
  readings.rowsAfterClearingFilter = rows().length;

  // -- THE TICK, and the confirm ------------------------------------------
  const sharedRow = rowFor(SHARED_NAME);
  if (!sharedRow) return JSON.stringify({ error: 'the shared name is not a row' });
  click(sharedRow);
  charge('click the row "' + SHARED_NAME + '"');
  await settle(20);
  readings.afterOneTick = {
    count: countLine(),
    rowSelected: sharedRow.getAttribute('aria-selected'),
    addLabel: text(addButton()),
    addDisabled: addButton().disabled
  };
  click(addButton());
  charge('click "' + text(addButton()) + '"');
  const conf = await until(() => confirmModal(), 8000);
  if (!conf) return JSON.stringify({ error: 'the shared confirm never opened' });
  readings.sharedConfirm = {
    title: text(conf.querySelector('.modal-title')),
    chips: Array.from(conf.querySelectorAll('.set-confirm-names code')).map((c) =>
      text(c)
    ),
    body: Array.from(conf.querySelectorAll('.set-confirm-body')).map((p) => text(p)),
    primaryClass: conf.querySelector('.modal-actions .btn-primary').className
  };
  click(conf.querySelector('.modal-actions .btn-primary'));
  charge('click "Add" in the confirmation');
  await until(() => (chipsOf('shared') || []).includes(SHARED_NAME), 8000);
  readings.sharedChipsAfterAdd = chipsOf('shared');
  readings.gesturesForOneSharedName = ledger.filter(
    (g) => g.scope === 'shared-add' || g.scope === 'page'
  ).length;
  // The inherit line appears on EVERY agent card now, and it points up rather
  // than redrawing the names.
  await settle(20);
  readings.inheritLines = Array.from(
    document.querySelectorAll('.set-env-inherit')
  ).map((n) => text(n));

  // ======================================================================
  // SECTION 2 — two sessions, one setting
  // ======================================================================
  // Created through the SHIPPED bridge, so the create path under test is the
  // product's own. The stand-in each pane runs reads its OWN environ; nothing
  // here reads a value, and nothing here reads Tortie's record of one.
  const api = window.gmux;
  readings.sessions = [];
  for (const agent of ['claude', 'codex']) {
    try {
      const s = await api.sessions.create({
        name: 'p275-' + agent,
        projectPath: PROJECT,
        agent
      });
      readings.sessions.push({ agent, id: s.id, name: s.name, status: s.status });
    } catch (err) {
      readings.sessions.push({ agent, error: String(err && err.message ? err.message : err) });
    }
    await wait(2500);
  }

  // ======================================================================
  // SECTION 3 — a per-agent name beside it, and it is NARROWER
  // ======================================================================
  scope = 'narrow-add';
  const narrowGroup = group('gemini');
  if (!narrowGroup) {
    notes.push('no gemini card drawn, so the narrowing arm could not run');
  } else {
    click(narrowGroup.querySelector('.set-env-add'));
    charge('click "Add…" on the Gemini card');
    await until(() => sheet(), 20000);
    await until(() => (rows().length > 5 ? rows().length : null), 25000);
    readings.agentSheetTitle = text(sheet().querySelector('.modal-title'));
    // The name already on the SHARED list is drawn here TICKED AND LOCKED,
    // never hidden, and its note says where it came from.
    const inheritedRow = rowFor(SHARED_NAME);
    readings.inheritedRowOnAgentSheet = inheritedRow
      ? {
          selected: inheritedRow.getAttribute('aria-selected'),
          disabled: inheritedRow.getAttribute('aria-disabled'),
          note: text(inheritedRow.querySelector('.set-env-opt-note'))
        }
      : null;
    const narrowRow = rowFor(NARROW_NAME);
    click(narrowRow);
    charge('click the row "' + NARROW_NAME + '"');
    await settle(20);
    click(addButton());
    charge('click "' + text(addButton()) + '"');
    const c2 = await until(() => confirmModal(), 8000);
    readings.agentConfirmTitle = text(c2.querySelector('.modal-title'));
    readings.agentConfirmBody = Array.from(
      c2.querySelectorAll('.set-confirm-body')
    ).map((p) => text(p));
    click(c2.querySelector('.modal-actions .btn-primary'));
    charge('click "Add" in the confirmation');
    await until(() => (chipsOf('gemini') || []).includes(NARROW_NAME), 8000);
    readings.geminiChips = chipsOf('gemini');
    readings.claudeChips = chipsOf('claude');
    readings.codexChips = chipsOf('codex');
    // Counted the same way the shared arm is: the two page gestures plus what
    // this card cost, so the two numbers are comparable and both are
    // comparable with the parent's ledger, which charges ⌘, and the rail the
    // same way.
    readings.gesturesForOneNarrowName =
      2 + ledger.filter((g) => g.scope === 'narrow-add').length;
  }

  // ======================================================================
  // SECTION 4 — several at once, in ONE trip and ONE confirmation
  // ======================================================================
  scope = 'batch-add';
  click(group('shared').querySelector('.set-env-add'));
  charge('click "Add…" on the Every agent card');
  await until(() => sheet(), 20000);
  await until(() => (rows().length > 5 ? rows().length : null), 25000);
  // The name already on the shared list is ticked and locked here, never
  // hidden, so a person does not hunt for a name they already have.
  const alreadyRow = rowFor(SHARED_NAME);
  readings.alreadySharedRow = alreadyRow
    ? {
        selected: alreadyRow.getAttribute('aria-selected'),
        disabled: alreadyRow.getAttribute('aria-disabled'),
        note: text(alreadyRow.querySelector('.set-env-opt-note'))
      }
    : null;
  readings.batchTickTrail = [];
  for (const n of BATCH_NAMES) {
    click(rowFor(n));
    charge('click the row "' + n + '"');
    await settle(10);
    readings.batchTickTrail.push({ name: n, count: countLine(), add: text(addButton()) });
  }
  click(addButton());
  charge('click "' + text(addButton()) + '"');
  const c3 = await until(() => confirmModal(), 8000);
  readings.batchConfirm = {
    title: text(c3.querySelector('.modal-title')),
    chips: Array.from(c3.querySelectorAll('.set-confirm-names code')).map((c) => text(c)),
    body: Array.from(c3.querySelectorAll('.set-confirm-body')).map((p) => text(p))
  };
  click(c3.querySelector('.modal-actions .btn-primary'));
  charge('click "Add" in the confirmation');
  await until(
    () => (chipsOf('shared') || []).length >= 1 + BATCH_NAMES.length,
    8000
  );
  readings.sharedChipsAfterBatch = chipsOf('shared');
  // The two page gestures plus this one trip. THREE names, ONE confirmation.
  readings.gesturesForThreeSharedNames =
    2 + ledger.filter((g) => g.scope === 'batch-add').length;
  readings.confirmationsForThreeSharedNames = 1;

  // ======================================================================
  // SECTION 4b — NEVER A CAGE, made visible
  // ======================================================================
  // A valid name this shell does not export, typed into the same field that
  // filters, drawn as the TOP row with its own note, and ticked like any other
  // row. It is its own trip so that section 4's gesture count stays the
  // picked-from-the-list number the phase's claim is about.
  scope = 'typed-add';
  click(group('shared').querySelector('.set-env-add'));
  charge('click "Add…" on the Every agent card');
  await until(() => sheet(), 20000);
  await until(() => (rows().length > 5 ? rows().length : null), 25000);
  const input2 = filterInput();
  setValue(input2, TYPED_NAME);
  for (let i = 0; i < TYPED_NAME.length; i += 1) charge('keystroke');
  await settle(20);
  const typedRows = rows();
  readings.typed = {
    query: TYPED_NAME,
    rowCount: typedRows.length,
    topRowName: typedRows.length > 0 ? typedRows[0].id.replace('set-env-opt-', '') : null,
    topRowNote: typedRows.length > 0
      ? text(typedRows[0].querySelector('.set-env-opt-note'))
      : null,
    count: countLine(),
    note: pickerNote()
  };
  click(rowFor(TYPED_NAME));
  charge('click the typed row "' + TYPED_NAME + '"');
  await settle(20);
  // It survives the filter being cleared, which is the bug the picker's author
  // found and fixed: a ticked typed name used to vanish and become a name a
  // person could no longer untick but which would still be committed.
  setValue(input2, '');
  await settle(20);
  const typedAfterClear = rowFor(TYPED_NAME);
  readings.typedSurvivesClearing = typedAfterClear !== null &&
    typedAfterClear.getAttribute('aria-selected') === 'true';
  click(addButton());
  charge('click "' + text(addButton()) + '"');
  const c3b = await until(() => confirmModal(), 8000);
  readings.typedConfirmTitle = c3b ? text(c3b.querySelector('.modal-title')) : null;
  if (c3b) click(c3b.querySelector('.modal-actions .btn-primary'));
  charge('click "Add" in the confirmation');
  await until(() => (chipsOf('shared') || []).includes(TYPED_NAME), 8000);
  readings.sharedChipsAfterTyped = chipsOf('shared');
  readings.keystrokesToTypeTheName = TYPED_NAME.length;

  // ======================================================================
  // SECTION 5 — the third session, which also flips the profile to zero mode
  // ======================================================================
  try {
    const s = await api.sessions.create({
      name: 'p275-gemini',
      projectPath: PROJECT,
      agent: 'gemini'
    });
    readings.sessions.push({ agent: 'gemini', id: s.id, name: s.name, status: s.status });
  } catch (err) {
    readings.sessions.push({ agent: 'gemini', error: String(err && err.message ? err.message : err) });
  }
  await wait(3000);

  // ======================================================================
  // SECTION 6 — the ZERO case. A real login shell that answers nothing.
  // ======================================================================
  //
  // WHAT "ZERO" MEANS HERE, and the first run got it wrong. The sheet's row
  // count can never be zero on a card that already holds names: a name already
  // on the list is drawn ticked and locked rather than hidden, which is the
  // whole of §5.6. The thing that is zero is what the SHELL OFFERED, and in the
  // DOM that is the number of rows a person could still tick. The note line is
  // the other half: it says the shell did not answer rather than leaving a
  // person to guess whether their profile is empty or their shell is broken.
  scope = 'zero';
  const offeredRows = () =>
    rows().filter((r) => r.getAttribute('aria-disabled') !== 'true');
  readings.zero = { attempts: 0 };
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    click(group('shared').querySelector('.set-env-add'));
    await until(() => sheet(), 20000);
    // Wait for the ANSWER to land rather than for rows to appear — the whole
    // point of this arm is that no offered row appears.
    await until(() => pickerNote() !== 'Reading your shell…', 25000);
    await settle(30);
    readings.zero.attempts = attempt;
    readings.zero.rows = rows().length;
    readings.zero.offered = offeredRows().length;
    readings.zero.lockedRows = rows().length - offeredRows().length;
    readings.zero.count = countLine();
    readings.zero.note = pickerNote();
    if (readings.zero.offered === 0) break;
    const cancel = sheet().querySelector('.modal-actions .btn-secondary');
    click(cancel);
    await until(() => sheet() === null, 5000);
    await wait(1500);
  }
  if (readings.zero.offered === 0) {
    // NEVER A CAGE, at its hardest: the shell offered nothing at all, and a
    // person can still name a variable and have it accepted.
    const zin = filterInput();
    setValue(zin, ZERO_TYPED_NAME);
    await settle(20);
    const zrows = rows();
    readings.zero.typedRowName =
      zrows.length > 0 ? zrows[0].id.replace('set-env-opt-', '') : null;
    readings.zero.typedRowNote =
      zrows.length > 0 ? text(zrows[0].querySelector('.set-env-opt-note')) : null;
    click(rowFor(ZERO_TYPED_NAME));
    await settle(20);
    readings.zero.addLabel = text(addButton());
    click(addButton());
    const c4 = await until(() => confirmModal(), 8000);
    readings.zero.confirmTitle = c4 ? text(c4.querySelector('.modal-title')) : null;
    if (c4) {
      click(c4.querySelector('.modal-actions .btn-primary'));
      await until(() => (chipsOf('shared') || []).includes(ZERO_TYPED_NAME), 8000);
    }
    readings.zero.chipsAfter = chipsOf('shared');
  } else {
    const s2 = sheet();
    if (s2) click(s2.querySelector('.modal-actions .btn-secondary'));
    notes.push('the zero arm never met a login shell that answered nothing');
  }

  readings.ledger = ledger;
  readings.notes = notes;
  return JSON.stringify(readings);
})()`;

// ---------------------------------------------------------------------------
// One launch
// ---------------------------------------------------------------------------

const socket = `gmux-p275app-${String(process.pid)}`;
const shotPath = join(outDir, 'p275-settings.png');

say(`launch on socket ${socket}`);
const run = await withElectron(
  {
    label: 'p275',
    userDataDir: userData,
    cwd: repoRoot,
    tmuxSocket: socket,
    ceilingMs: 600_000,
    env: {
      ...process.env,
      HOME: scratchHome,
      ZDOTDIR: scratchHome,
      SHELL: '/bin/zsh',
      PATH: hermeticPath,
      GMUX_TMUX_SOCKET: socket,
      GMUX_SHOT: shotPath,
      GMUX_SHOT_SETTINGS: '1',
      GMUX_SHOT_SETTINGS_JS: driver,
      GMUX_SHOT_DELAY_MS: '8000'
    }
  },
  async (handle) => {
    const code = await handle.exited;
    return { code, text: handle.text() };
  }
);

writeFileSync(join(outDir, 'stdout.txt'), run.text, 'utf8');

const line =
  run.text.split('\n').find((l) => l.includes('[gmux-shot] driver')) ?? '';
const payload = line
  .slice(line.indexOf('driver') + 'driver'.length)
  .replace(/^\s*→\s*/, '')
  .trim();
let read = null;
try {
  read = JSON.parse(payload);
} catch {
  read = null;
}
if (read !== null && typeof read === 'string') {
  try {
    read = JSON.parse(read);
  } catch {
    /* already an object */
  }
}

const after = operatorSessionCount();
say(`operator sessions after: ${String(after)} (before ${String(before)})`);

/**
 * WHAT IS LEFT, counted ONCE at the end and not between every step.
 *
 * The census that everybody reaches for, `ps aux | grep -c "[E]lectron"`,
 * misses the largest process in a leak: Electron's main process renames itself
 * to `Tortie` and its command line is that single word. The form CLAUDE.md
 * records is used instead. The stand-ins `exec sleep 900` inside their panes,
 * so the scratch tmux server dying is what ends them, and that is what this
 * counts.
 */
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
  const electrons = (ps.stdout ?? '').split('\n').filter((l) => l.trim() !== '');
  const sleeps = spawnSync(
    '/bin/sh',
    ['-c', `ps -Ao pid,command | grep "[s]leep 900" | wc -l`],
    { encoding: 'utf8' }
  );
  const servers = spawnSync(
    '/bin/sh',
    [
      '-c',
      `ps -Ao pid,command | grep "[t]mux" | grep -c "${socket}" || true`
    ],
    { encoding: 'utf8' }
  );
  // WHOSE ARE THEY. The line count on its own is alarming and meaningless on a
  // working Mac: the operator's Chrome, Cursor, VS Code, Slack and his own
  // installed Tortie all match that grep, and on this machine twelve of them
  // did with nothing of ours left. What matters is how many name THIS PROBE'S
  // OWN profile, which every process of a run carries in `--user-data-dir`.
  const mine = electrons.filter((line) => {
    const pid = line.trim().split(/\s+/)[0] ?? '';
    const cmd = spawnSync('/bin/sh', ['-c', `ps -p ${pid} -o command=`], {
      encoding: 'utf8'
    });
    return (cmd.stdout ?? '').includes(userData);
  });
  return {
    electronLines: electrons.length,
    linesNamingThisProbesProfile: mine.length,
    sleep900: Number((sleeps.stdout ?? '0').trim()),
    scratchTmuxServers: Number((servers.stdout ?? '0').trim())
  };
}
const left = leftovers();
say(
  `left behind: ${String(left.linesNamingThisProbesProfile)} process(es) naming ` +
    `this probe's own profile, of ${String(left.electronLines)} ` +
    'Electron/Tortie/crashpad lines on the machine (the rest are the ' +
    `operator's own apps); ${String(left.sleep900)} stand-in sleeps; ` +
    `${String(left.scratchTmuxServers)} servers on ${socket}`
);

if (read === null || read.error !== undefined) {
  console.error(`${TAG} the driver did not answer. exit ${String(run.code)}`);
  console.error(read === null ? '(no payload)' : `error: ${read.error}`);
  console.error(run.text.split('\n').slice(-80).join('\n'));
  process.exit(1);
}

writeFileSync(
  join(outDir, 'reading.json'),
  `${JSON.stringify(read, null, 2)}\n`,
  'utf8'
);

// ---------------------------------------------------------------------------
// What the PANES themselves said, read off their own reports
// ---------------------------------------------------------------------------

const panes = {};
for (const agent of AGENTS) {
  const verdictPath = join(reportsDir, `${agent}.verdict`);
  const namesPath = join(reportsDir, `${agent}.names`);
  if (!existsSync(verdictPath)) {
    panes[agent] = { launched: false };
    continue;
  }
  const verdict = {};
  for (const l of readFileSync(verdictPath, 'utf8').split('\n')) {
    const parts = l.trim().split(' ');
    if (parts.length >= 2) verdict[parts[0]] = parts.slice(1).join(' ');
  }
  panes[agent] = {
    launched: true,
    namesReceived: existsSync(namesPath)
      ? readFileSync(namesPath, 'utf8').split('\n').filter((l) => l !== '').length
      : -1,
    verdict
  };
}

// ---------------------------------------------------------------------------
// NO VALUE, ANYWHERE — every file the app wrote, grepped for the sentinel
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
    if (buf.includes(SENTINEL)) hits.push(f);
  }
  return hits;
}

const profileFiles = walk(userData);
const reportFiles = walk(reportsDir);
const settingsFile = join(userData, 'settings.json');
const manifestFiles = profileFiles.filter((f) => /\.(db|sqlite3?)(-wal|-shm)?$/.test(f));
const logFiles = profileFiles.filter((f) => /\.log$/.test(f));

const leak = {
  profileFilesScanned: profileFiles.length,
  profileHits: sentinelHits(profileFiles),
  manifestFilesScanned: manifestFiles.length,
  manifestHits: sentinelHits(manifestFiles),
  logFilesScanned: logFiles.length,
  logHits: sentinelHits(logFiles),
  settingsHits: existsSync(settingsFile) ? sentinelHits([settingsFile]) : [],
  paneReportFilesScanned: reportFiles.length,
  paneReportHits: sentinelHits(reportFiles),
  driverReadingHits: sentinelHits([join(outDir, 'reading.json')]),
  harnessStdoutHits: sentinelHits([join(outDir, 'stdout.txt')])
};

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const P = (label, value) =>
  console.log(`  ${String(label).padEnd(44)} ${JSON.stringify(value)}`);

console.log(`\n${TAG} SECTION 0 — the page`);
P('cards drawn', read.cardNames);
P('the shared card is the first card', read.sharedCardIsFirst);
P('its empty line', read.sharedCardEmptyLine);
P('agent cards carrying the group', read.agentScopes);
P('inherit lines while the shared list is empty', read.inheritLinesWhileSharedEmpty);

console.log(`\n${TAG} SECTION 1 — the shared add`);
P('sheet title', read.sharedSheetTitle);
P('rows at rest', read.sharedSheetRowsAtRest);
P('count line at rest', read.sharedSheetCountAtRest);
P('note line at rest', read.sharedSheetNoteAtRest);
P('scroller', read.scroller);
P('first row box [x,y,w,h]', read.firstRowBox);
P('every row has a box', read.everyRowHasABox);
P('filter placeholder', read.filterPlaceholder);
P('filter input role', read.filterRole);
P('filtering on "acmeai"', read.filter);
P('rows after clearing the filter', read.rowsAfterClearingFilter);
P('after one tick', read.afterOneTick);
P('the shared confirm', read.sharedConfirm);
P('chips on the shared card', read.sharedChipsAfterAdd);
P('inherit lines now', read.inheritLines);
P('GESTURES, one name on every agent', read.gesturesForOneSharedName);

console.log(`\n${TAG} SECTION 2 and 5 — the sessions`);
for (const s of read.sessions ?? []) P(s.agent, s);

console.log(`\n${TAG} SECTION 3 — the per-agent narrowing`);
P('agent sheet title', read.agentSheetTitle);
P('the shared name, seen from the agent sheet', read.inheritedRowOnAgentSheet);
P('agent confirm title', read.agentConfirmTitle);
P('agent confirm body', read.agentConfirmBody);
P('gemini chips', read.geminiChips);
P('claude chips', read.claudeChips);
P('codex chips', read.codexChips);
P('GESTURES, one name on one agent', read.gesturesForOneNarrowName);

console.log(`\n${TAG} SECTION 4 — several at once, one trip, one confirmation`);
P('the already-shared row', read.alreadySharedRow);
P('the tick trail', read.batchTickTrail);
P('the batch confirm', read.batchConfirm);
P('chips after the batch', read.sharedChipsAfterBatch);
P('GESTURES, three names on every agent', read.gesturesForThreeSharedNames);
P('CONFIRMATIONS for those three', read.confirmationsForThreeSharedNames);

console.log(`\n${TAG} SECTION 4b — never a cage`);
P('the typed name', read.typed);
P('the typed tick survives clearing the filter', read.typedSurvivesClearing);
P('the confirm it opened', read.typedConfirmTitle);
P('chips after it', read.sharedChipsAfterTyped);
P('keystrokes to type it', read.keystrokesToTypeTheName);

console.log(`\n${TAG} SECTION 6 — the zero case, a real shell exporting nothing`);
P('zero arm', read.zero);

console.log(`\n${TAG} THE PANES, reading their OWN environ`);
for (const agent of AGENTS) {
  const p = panes[agent];
  if (!p.launched) {
    console.log(`  ${agent.padEnd(8)} NEVER LAUNCHED (no report file)`);
    continue;
  }
  console.log(`  ${agent.padEnd(8)} received ${String(p.namesReceived)} names in its own environ`);
  for (const [name, verdict] of Object.entries(p.verdict)) {
    console.log(`           ${name.padEnd(26)} ${verdict}`);
  }
}

console.log(`\n${TAG} THE GESTURE LEDGER`);
let n = 0;
for (const g of read.ledger) {
  n += 1;
  console.log(`  ${String(n).padStart(2)}. [${g.scope}] ${g.what}`);
}

console.log(`\n${TAG} NO VALUE, ANYWHERE — the sentinel grepped for`);
P('profile files scanned / hits', [leak.profileFilesScanned, leak.profileHits.length]);
P('manifest files scanned / hits', [leak.manifestFilesScanned, leak.manifestHits.length]);
P('log files scanned / hits', [leak.logFilesScanned, leak.logHits.length]);
P('settings.json hits', leak.settingsHits.length);
P('pane report files scanned / hits', [leak.paneReportFilesScanned, leak.paneReportHits.length]);
P('the driver reading hits', leak.driverReadingHits.length);
P('the harness stdout hits', leak.harnessStdoutHits.length);
if (leak.profileHits.length > 0) P('WHERE', leak.profileHits);

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

const findings = [];
const need = (ok, why) => {
  if (!ok) findings.push(why);
};

need(read.sharedCardIsFirst === true, 'the shared card is not the first card');
need(
  read.sharedSheetRowsAtRest >= 51,
  `the picker offered ${String(read.sharedSheetRowsAtRest)} rows, and the phase's ` +
    'measurement of the operator\'s own shell is 51'
);
need(read.scroller?.overflowsBy > 0, 'the list does not overflow, so scrolling is untested');
need(read.scroller?.scrolled === true, 'the list did not scroll');
need(read.everyRowHasABox === true, 'some row has no box, which is the datalist defect');
need(read.filter?.rows > 0 && read.filter.rows < read.sharedSheetRowsAtRest,
  'the filter did not narrow the list');
need(
  (read.sharedChipsAfterAdd ?? []).includes(SHARED_NAME),
  'the shared name did not land on the shared card'
);
need(
  (read.sharedConfirm?.body ?? [])[0] ===
    'Every agent Tortie launches gets these, including agents you install later.',
  'the shared confirm did not say what the wider agreement means'
);
need(read.gesturesForOneSharedName === 6,
  `one name on every agent took ${String(read.gesturesForOneSharedName)} gestures`);
need((read.geminiChips ?? []).includes(NARROW_NAME), 'the per-agent name did not land');
need(!(read.claudeChips ?? []).includes(NARROW_NAME),
  'the per-agent name reached claude\'s own list, so it is not narrower');
need(!(read.codexChips ?? []).includes(NARROW_NAME),
  'the per-agent name reached codex\'s own list, so it is not narrower');
need(read.alreadySharedRow?.disabled === 'true',
  'a name already on the list is not drawn locked');
need(read.alreadySharedRow?.note === 'already shared',
  'the already-shared row does not say why it is locked');
need(read.typed?.topRowName === TYPED_NAME,
  'a valid name the shell does not export is not drawn as a row');
need(read.typed?.topRowNote === 'not exported by your shell',
  'the typed row does not say why it is there');
need(read.typedSurvivesClearing === true,
  'a ticked typed name vanished when the filter cleared');
need((read.sharedChipsAfterBatch ?? []).length === 1 + BATCH_NAMES.length,
  'the batch did not add three names in one trip');
need((read.batchConfirm?.chips ?? []).length === BATCH_NAMES.length,
  'the batch confirm did not name every variable in it');
need(read.gesturesForThreeSharedNames === 8,
  `three names on every agent took ${String(read.gesturesForThreeSharedNames)} gestures`);
need((read.sharedChipsAfterTyped ?? []).includes(TYPED_NAME),
  'the typed name did not land on the shared card');
need(read.zero?.offered === 0,
  `the zero arm met a shell offering ${String(read.zero?.offered)} names`);
need(read.zero?.note === 'Your shell did not answer, so type the name.',
  'the zero arm did not say why the list is empty');
need(read.zero?.typedRowName === ZERO_TYPED_NAME,
  'a name could not be typed when the shell offered nothing');
need((read.zero?.chipsAfter ?? []).includes(ZERO_TYPED_NAME),
  'the name typed against an empty shell did not land');

for (const agent of ['claude', 'codex', 'gemini']) {
  need(panes[agent]?.launched === true, `${agent} never launched a pane`);
  need(
    panes[agent]?.verdict?.[SHARED_NAME] === 'present matches-sentinel',
    `${agent}'s pane did not receive ${SHARED_NAME} from the shared list ` +
      `(it said ${JSON.stringify(panes[agent]?.verdict?.[SHARED_NAME] ?? null)})`
  );
}
need(
  panes['gemini']?.verdict?.[NARROW_NAME] === 'present matches-sentinel',
  'the per-agent name did not reach the pane it was set for'
);
need(
  panes['claude']?.verdict?.[NARROW_NAME] === 'absent',
  'the per-agent name reached a pane it was never set for'
);
need(
  panes['codex']?.verdict?.[NARROW_NAME] === 'absent',
  'the per-agent name reached a pane it was never set for'
);

for (const [where, hits] of [
  ['the profile directory', leak.profileHits],
  ['the manifest', leak.manifestHits],
  ['the logs', leak.logHits],
  ['settings.json', leak.settingsHits],
  ['the pane reports', leak.paneReportHits],
  ['the driver reading', leak.driverReadingHits],
  ['the harness stdout', leak.harnessStdoutHits]
]) {
  need(hits.length === 0, `the sentinel VALUE appears in ${where}: ${hits.join(', ')}`);
}

need(after === before, `the operator's session count moved: ${String(before)} → ${String(after)}`);
need(
  left.linesNamingThisProbesProfile === 0,
  `${String(left.linesNamingThisProbesProfile)} Electron process(es) of this ` +
    "probe's own are still running"
);
need(left.scratchTmuxServers === 0, `a tmux server on ${socket} is still running`);
need(left.sleep900 === 0, `${String(left.sleep900)} stand-in pane(s) are still running`);

console.log('');
if (findings.length > 0) {
  console.error(`${TAG} FAIL, ${String(findings.length)}:`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
say(
  'PASS. One name set once reached three agents\' panes, read out of each ' +
    "pane's own environ; a per-agent name reached one pane and neither of the " +
    'others; the list scrolled, filtered and took several at once; a name the ' +
    'shell does not export was typed and accepted, with a shell exporting ' +
    'nothing and with one exporting fifty-one; and the sentinel value is in no ' +
    'file the app wrote.'
);
