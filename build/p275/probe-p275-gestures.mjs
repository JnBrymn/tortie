#!/usr/bin/env node
/**
 * probe-p275-gestures.mjs. THE BEFORE NUMBER for Phase 275, measured in the
 * real app rather than counted off the source.
 *
 * ## What it answers
 *
 * The reporter said three things on 2026-09-16, and two of them are about
 * effort: "you have to add one at a time", and "why do we need to set each
 * individual key per agent?". Both are counts. This probe takes them at the
 * PARENT of Phase 275 by driving the real Settings window:
 *
 *   A. how many gestures it takes to put ONE variable name on ONE agent;
 *   B. how many it takes to put the SAME name on THREE agents.
 *
 * A gesture is one discrete physical act by a person: one click, one keypress,
 * one pick from a popup. Nothing else is counted, and the ledger names every
 * one so the number can be disputed line by line.
 *
 * ## How the count is taken
 *
 * Every gesture in the ledger is DISPATCHED as a real DOM event on the real
 * shipped control, in the real Settings renderer, and the reading after it is
 * what the product actually did. The one exception is the pick from the native
 * `<datalist>` popup, which cannot be dispatched, and that is not a limitation
 * of this probe — it is the defect. Chromium draws that popup outside the
 * document, so there is no node to click, no box to measure and no style of
 * ours on it. The probe measures exactly that and says so, and the ledger
 * charges the pick at its CHEAPEST possible price (one click), so the before
 * number is a floor rather than a flattering estimate.
 *
 * ## The scratch world
 *
 * A scratch profile, a scratch HOME and ZDOTDIR whose `.zshrc` exports a set of
 * INVENTED variable names, and a scratch bin directory holding three stand-in
 * agent executables so three cards draw. Nothing real is launched, no session
 * is created, no token is spent.
 *
 * ## NO SECRET, EVER
 *
 * Every name in the scratch profile is invented here — invented vendors, in the
 * shape a provider key has. Not one of them is a name the operator's own shell
 * exports, no value is ever read, and the values in the scratch profile are the
 * literal string `p275-not-a-key`. The probe answers in counts and booleans.
 *
 * ## Safety
 *
 *   - ONE Electron, through build/electron-run.mjs, which ends the tree it
 *     started in a `finally` block.
 *   - A scratch tmux socket, ended by the same helper. `-L gmux` is named once,
 *     read only, for the before/after session census.
 *   - Everything it writes is under P275_ROOT (default /private/tmp/p275-gestures).
 *     Nothing under a home directory is written or removed.
 *
 * Usage:
 *   node build/p275/probe-p275-gestures.mjs
 */

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
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

const rawRoot = process.env['P275_ROOT'] ?? '/private/tmp/p275-gestures';
if (!rawRoot.startsWith('/private/tmp/') && !rawRoot.startsWith('/tmp/')) {
  console.error(`${TAG} REFUSED. P275_ROOT must live under /private/tmp.`);
  process.exit(2);
}
rmSync(rawRoot, { recursive: true, force: true });
for (const d of ['home', 'bin', 'profile', 'out']) {
  mkdirSync(join(rawRoot, d), { recursive: true });
}
const root = realpathSync(rawRoot);
const scratchHome = join(root, 'home');
const binDir = join(root, 'bin');
const userData = join(root, 'profile');
const outDir = join(root, 'out');

// ---------------------------------------------------------------------------
// The scratch login shell. INVENTED NAMES ONLY.
// ---------------------------------------------------------------------------

// Invented vendors, in the shape a provider key has, so the list the field is
// handed is realistic in COUNT and in LENGTH without naming anything real. The
// operator's own shell answers 51 to `printenv | wc -l` (the Phase 275 entry's
// measurement); this profile exports 44 of its own on top of what a login zsh
// already sets, which lands the probe in the same neighbourhood.
const INVENTED = [];
for (const vendor of [
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
  'PELICANLM'
]) {
  INVENTED.push(`${vendor}_API_KEY`);
  INVENTED.push(`${vendor}_BASE_URL`);
  INVENTED.push(`${vendor}_ORG_ID`);
  INVENTED.push(`${vendor}_PROJECT`);
}

const rcPath = join(scratchHome, '.zshrc');
writeFileSync(
  rcPath,
  [
    `export PATH="${binDir}:$PATH"`,
    ...INVENTED.map((n) => `export ${n}=p275-not-a-key`),
    ''
  ].join('\n'),
  'utf8'
);

// Three stand-in agent executables, so three cards draw. Each answers
// --version and does nothing else. No session is ever created in this run.
const AGENTS = ['claude', 'codex', 'gemini'];
for (const agent of AGENTS) {
  const p = join(binDir, agent);
  writeFileSync(
    p,
    ['#!/bin/sh', 'echo "0.0.0-p275"', 'exit 0', ''].join('\n'),
    'utf8'
  );
  chmodSync(p, 0o755);
}

/** The name the probe adds. Invented, and the value it would read never exists. */
const NAME = 'ACMEAI_API_KEY';

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
  const NAME = ${JSON.stringify(NAME)};
  const AGENTS = ${JSON.stringify(AGENTS)};

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
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  };

  // THE LEDGER. Every entry is one physical act by a person. \`driven\` says
  // whether this probe dispatched it on the real control, or whether it could
  // not be dispatched at all — which for the datalist pick is the finding.
  const ledger = [];
  let scope = 'page';
  const charge = (what, where, driven) => {
    ledger.push({ what, where, driven, scope });
  };

  // One real click, the way a person's click arrives.
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

  // -- gesture 1: the rail ------------------------------------------------
  const rail = Array.from(document.querySelectorAll('.set-nav-item'))
    .find((n) => (n.textContent || '').trim() === 'Launch defaults');
  if (!rail) return JSON.stringify({ error: 'no Launch defaults item in the rail' });
  click(rail);
  charge('click the rail item "Launch defaults"', 'settings rail', true);
  await settle(40);
  await wait(1200);
  await settle(40);

  const content = document.querySelector('.set-content');
  const cards = Array.from(document.querySelectorAll('.set-defaults-card'));
  const cardNames = cards.map((c) =>
    (c.querySelector('.set-defaults-name') || {}).textContent || '?'
  );
  // Which cards have the shell-variable group at all (installed agents only).
  const withGroup = cards.filter((c) => c.querySelector('.set-env-group'));
  const groupIds = withGroup.map((c) =>
    c.querySelector('.set-env-group').getAttribute('data-agent-id')
  );

  // How far down the page each target card sits, so a scroll a person has to
  // make is a measurement rather than a guess.
  const viewport = content ? content.clientHeight : 0;
  const reach = groupIds.map((id) => {
    const g = document.querySelector('.set-env-group[data-agent-id="' + id + '"]');
    const r = g.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    return { id, topWithinContent: Math.round(r.top - c.top + content.scrollTop) };
  });

  // -- the one-agent flow, then twice more --------------------------------
  // The three agents driven are the first three cards that actually carry the
  // group, read off the page rather than named here, so the run cannot ask for
  // an agent this machine has not got.
  const targets = groupIds.slice(0, 3);
  const runs = [];
  for (const agentId of targets) {
    const group = document.querySelector('.set-env-group[data-agent-id="' + agentId + '"]');
    if (!group) { runs.push({ agentId, error: 'no group' }); continue; }
    scope = agentId;
    const t0 = performance.now();

    // Does the person have to scroll to reach this card?
    const gr = group.getBoundingClientRect();
    const cr = content.getBoundingClientRect();
    const offscreen = gr.top < cr.top || gr.bottom > cr.bottom;
    if (offscreen) {
      group.scrollIntoView({ block: 'center' });
      charge('scroll the page to reach ' + agentId + "'s card", 'settings page', true);
      await settle(20);
    }

    // -- gesture: Add… ----------------------------------------------------
    const addBtn = group.querySelector('.set-env-add');
    click(addBtn);
    charge('click "Add…" on ' + agentId, agentId + ' card', true);
    // The candidate list is asked on OPEN and nowhere else, and the ask starts
    // a login shell, so this wait is the product's own latency and not slack.
    await settle(40);
    await wait(2500);
    await settle(40);

    const field = group.querySelector('.set-env-field');
    const list = document.getElementById('set-env-names-' + agentId);
    // ONE VALUE PER TRIP, read off the control rather than argued. A text input
    // holds one string; multiple is a select/file-input idea, and a datalist
    // yields one value into the field it is attached to.
    const fieldFacts = {
      tag: field.tagName,
      type: field.type,
      multiple: field.multiple === true,
      hasListAttr: field.getAttribute('list')
    };

    // WHAT THE SUGGESTION CONTROL ACTUALLY IS, measured.
    const listFacts = {
      present: list !== null,
      tag: list ? list.tagName : null,
      options: list ? list.options.length : -1,
      // A datalist renders no box. Nothing to size, nothing to scroll, and no
      // rule of ours can reach it.
      rect: box(list),
      optionRect: list && list.options[0] ? box(list.options[0]) : null,
      optionDisplay: list && list.options[0]
        ? getComputedStyle(list.options[0]).display
        : null,
      offersTheName: list
        ? Array.from(list.options).map((o) => o.value).indexOf(NAME)
        : -1,
      head: list ? Array.from(list.options).slice(0, 5).map((o) => o.value) : []
    };

    // CAN THE POPUP BE DRIVEN AT ALL? A person's click on the field is what
    // opens it. Dispatch exactly that, then look for anything new in the
    // document and anything under the point just below the field.
    const nodesBefore = document.querySelectorAll('*').length;
    field.focus();
    click(field);
    await settle(20);
    await wait(400);
    const nodesAfter = document.querySelectorAll('*').length;
    const fr = field.getBoundingClientRect();
    const under = document.elementFromPoint(
      Math.round(fr.left + fr.width / 2),
      Math.round(Math.min(window.innerHeight - 2, fr.bottom + 12))
    );
    const popup = {
      nodesBefore,
      nodesAfter,
      nodesAdded: nodesAfter - nodesBefore,
      underTheField: under ? under.className || under.tagName : null,
      // A suggestion row would be a node inside the datalist with a box. There
      // is never one, because the popup is not in this document.
      anyOptionHasABox: list
        ? Array.from(list.options).some((o) => o.getBoundingClientRect().height > 0)
        : false
    };

    // -- the pick, or the typing ------------------------------------------
    // The pick CANNOT be dispatched: there is no node. It is charged at its
    // cheapest honest price, one click, and the typing route is driven in full
    // beside it so both numbers are real.
    charge('click into the field to pop the suggestion list', agentId + ' card', true);
    charge('pick "' + NAME + '" from the native popup (NOT dispatchable)', agentId + ' card', false);

    // The typing route, driven one character at a time, so the keystroke count
    // is the product's own and not an estimate.
    let keystrokes = 0;
    for (let i = 1; i <= NAME.length; i += 1) {
      setValue(field, NAME.slice(0, i));
      keystrokes += 1;
      await settle(4);
    }

    // -- gesture: Add -----------------------------------------------------
    click(addBtn);
    charge('click "Add" to commit', agentId + ' card', true);
    await settle(30);
    await wait(300);

    // -- gesture: Add in the confirm --------------------------------------
    const modal = document.querySelector('.modal.set-confirm');
    const modalTitle = modal ? (modal.querySelector('.modal-title').textContent || '') : null;
    const confirmBtn = modal
      ? Array.from(modal.querySelectorAll('button')).find(
          (b) => (b.textContent || '').trim() === 'Add'
        )
      : null;
    if (confirmBtn) {
      click(confirmBtn);
      charge('click "Add" in the confirmation', 'confirm modal', true);
    }
    await settle(40);
    await wait(600);

    // Did it land? Read the chip the product drew, not our own record.
    const chips = Array.from(
      document.querySelectorAll('.set-env-group[data-agent-id="' + agentId + '"] .set-chip.envname')
    ).map((c) => (c.textContent || '').trim());

    runs.push({
      agentId,
      fieldFacts,
      listFacts,
      popup,
      keystrokes,
      modalTitle,
      confirmFound: confirmBtn !== null && confirmBtn !== undefined,
      chips,
      landed: chips.some((c) => c.startsWith(NAME)),
      ms: Math.round(performance.now() - t0)
    });
  }

  return JSON.stringify({
    cardNames,
    groupIds,
    viewport,
    reach,
    ledger,
    runs
  });
})()`;

// ---------------------------------------------------------------------------
// One launch
// ---------------------------------------------------------------------------

const socket = `gmux-p275-${String(process.pid)}`;
const shotPath = join(outDir, 'p275-settings.png');

say(`launch on socket ${socket}`);
const run = await withElectron(
  {
    label: 'p275-gestures',
    userDataDir: userData,
    cwd: repoRoot,
    tmuxSocket: socket,
    ceilingMs: 300_000,
    env: {
      ...process.env,
      HOME: scratchHome,
      ZDOTDIR: scratchHome,
      SHELL: '/bin/zsh',
      GMUX_TMUX_SOCKET: socket,
      GMUX_SHOT: shotPath,
      GMUX_SHOT_SETTINGS: '1',
      GMUX_SHOT_SETTINGS_JS: driver,
      GMUX_SHOT_DELAY_MS: '6000'
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

if (read === null || read.error !== undefined) {
  console.error(`${TAG} the driver did not answer. exit ${run.code}`);
  console.error(run.text.split('\n').slice(-60).join('\n'));
  process.exit(1);
}

writeFileSync(
  join(outDir, 'reading.json'),
  `${JSON.stringify(read, null, 2)}\n`,
  'utf8'
);

// ---------------------------------------------------------------------------
// What the ledger says
// ---------------------------------------------------------------------------

console.log(`\n${TAG} the cards drawn: ${read.cardNames.join(', ')}`);
console.log(`${TAG} cards carrying the shell-variable group: ${read.groupIds.join(', ')}`);
console.log(`${TAG} content viewport ${String(read.viewport)}px; each group's top within the page:`);
for (const r of read.reach) {
  console.log(`  ${r.id.padEnd(10)} ${String(r.topWithinContent).padStart(6)}px`);
}

console.log(`\n${TAG} THE GESTURE LEDGER, in the order a person makes them`);
let n = 0;
for (const g of read.ledger) {
  n += 1;
  console.log(
    `  ${String(n).padStart(2)}. ${g.driven ? 'driven ' : 'NOT-DRIVEN'} ${g.what}`
  );
}

console.log(`\n${TAG} per agent`);
for (const r of read.runs) {
  if (r.error !== undefined) {
    console.log(`  ${r.agentId}: ${r.error}`);
    continue;
  }
  console.log(
    `  ${r.agentId.padEnd(8)} suggestions=${String(r.listFacts.options).padStart(3)}` +
      `  datalist rect=${JSON.stringify(r.listFacts.rect)}` +
      `  option box=${JSON.stringify(r.listFacts.optionRect)}` +
      `  nodes added by the click=${String(r.popup.nodesAdded)}` +
      `  any option has a box=${String(r.popup.anyOptionHasABox)}`
  );
  console.log(
    `           keystrokes=${String(r.keystrokes)}  confirm="${r.modalTitle}"` +
      `  landed=${String(r.landed)}  chips=[${r.chips.join(', ')}]  ${String(r.ms)}ms`
  );
}

// The counts the phase asked for, derived from the ledger itself.
const ok = read.runs.filter((r) => r.error === undefined);
const first = ok[0];
const scrolls = read.ledger.filter((g) => g.what.startsWith('scroll'));
const perAgentLedger = ok.map((r) => ({
  agentId: r.agentId,
  // Every act charged while this agent's card was the scope, minus the scroll,
  // which is charged separately because it depends on window height.
  gestures: read.ledger.filter((g) => g.scope === r.agentId && !g.what.startsWith('scroll')).length,
  scrolled: read.ledger.some((g) => g.scope === r.agentId && g.what.startsWith('scroll'))
}));
const perName = perAgentLedger[0].gestures;
// The typing route drops TWO of the five: the pick itself, and the click into
// the field that only exists to pop the popup. The field is `autoFocus`, so a
// person who types never needs that click. What is left is Add…, Add, and the
// Add in the confirmation.
const typeClicks = perName - 2;
const K = first.keystrokes;

console.log(`\n${TAG} THE NUMBERS (⌘, to open Settings is charged as 1)`);
for (const p of perAgentLedger) {
  console.log(
    `  ${p.agentId.padEnd(10)} ${String(p.gestures)} gestures on its card` +
      `${p.scrolled ? ' (+1 scroll)' : ''}`
  );
}
console.log(
  `  ONE name on ONE agent, pick route : 1 + 1 + ${String(perName)} = ${String(2 + perName)} gestures`
);
console.log(
  `  ONE name on ONE agent, type route : 1 + 1 + ${String(typeClicks)} clicks + ${String(K)} keystrokes = ${String(2 + typeClicks + K)} gestures`
);
console.log(
  `  SAME name on THREE agents, pick route : 1 + 1 + 3 × ${String(perName)} + ${String(scrolls.length)} scroll = ` +
    `${String(2 + 3 * perName + scrolls.length)} gestures`
);
console.log(
  `  SAME name on THREE agents, type route : 1 + 1 + 3 × (${String(typeClicks)} + ${String(K)}) + ${String(scrolls.length)} scroll = ` +
    `${String(2 + 3 * (typeClicks + K) + scrolls.length)} gestures`
);
console.log(
  `  confirmations for the three : ${String(read.ledger.filter((g) => g.where === 'confirm modal').length)}, ` +
    `one per name per agent`
);
// The number that is the reporter's own complaint: this machine draws a
// shell-variable group on every agent it can launch, and one key for all of
// them is that many trips through the same four-act flow.
const everyAgent = read.groupIds.length;
console.log(
  `  SAME name on EVERY agent this machine draws (${String(everyAgent)}) : ` +
    `1 + 1 + ${String(everyAgent)} × ${String(perName)} + scrolls = ` +
    `${String(2 + everyAgent * perName)} gestures at least, and ${String(everyAgent)} confirmations`
);
console.log(`\n${TAG} the field's own shape: ${JSON.stringify(first.fieldFacts)}`);

// ---------------------------------------------------------------------------
// The file the app wrote, read back. NAMES ONLY.
// ---------------------------------------------------------------------------
const settingsFile = join(userData, 'settings.json');
if (existsSync(settingsFile)) {
  const file = JSON.parse(readFileSync(settingsFile, 'utf8'));
  const ep = file.settings?.envPassthrough ?? {};
  console.log(`\n${TAG} settings.json envPassthrough: ${JSON.stringify(ep)}`);
  const sealEnv = file.danger?.state?.env ?? file.dangerSeal?.state?.env ?? null;
  console.log(`${TAG} seal env keys: ${JSON.stringify(sealEnv)}`);
  const text = readFileSync(settingsFile, 'utf8');
  console.log(
    `${TAG} does settings.json hold the scratch VALUE anywhere? ` +
      `${String(text.includes('p275-not-a-key'))}`
  );
}

if (after !== before) {
  console.error(`${TAG} FAIL: the operator's session count moved.`);
  process.exit(1);
}
say('done');
