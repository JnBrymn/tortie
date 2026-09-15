#!/usr/bin/env node
/**
 * probe-p269-env.mjs. The shell variables an agent needs, driven in the real
 * app (Phase 269).
 *
 * ## What it proves, and how
 *
 * Phase 33 built the mechanism and no route reached it. Phase 269 put the
 * names beside the launch flags in Settings, sealed the way a danger flag is.
 * Two claims cannot be read out of the source, so this probe runs them:
 *
 *   (a) A NAMED VARIABLE REACHES A REAL PANE AND IS WRITTEN NOWHERE, and a
 *       rotated value is picked up by the NEXT session with no restart of
 *       Tortie and no restart of the tmux server. Four arms, one Electron,
 *       driven by GMUX_SMOKE=p269-env (src/main/harness/p269-env.ts).
 *
 *   (b) THE ATTACK ON THE SEAL. With the app down, a passthrough name is
 *       written straight into `settings.json` the way any agent on the machine
 *       can, leaving the seal alone. A SECOND Electron, started only after the
 *       first has fully exited, must read that name back as absent, must say so
 *       in its log, and must start a session that does NOT carry the variable —
 *       while the name the app itself wrote in arm 1 is still there and still
 *       reaches a pane. That last clause is the ablation: without it the attack
 *       could pass because nothing works at all.
 *
 * ## The scratch world
 *
 * A scratch profile, a scratch HOME, a scratch ZDOTDIR whose `.zshrc` exports
 * the sentinel and puts a scratch bin directory on the PATH, and a scratch
 * executable standing in for the agent binary. That executable writes what it
 * was given to a file named after its OWN `GMUX_SESSION_ID` stamp and then
 * sleeps. Nothing real is launched and no token is spent.
 *
 * ## NO SECRET VALUE
 *
 * The sentinel is `P269_TEST_VALUE` plus a per run suffix, invented here. It is
 * never a real provider key, and it is never printed by this script: the
 * harness answers in booleans and this script grades booleans.
 *
 * ## Safety, absolute
 *
 *   - Refuses to run without a harness socket, and refuses `gmux` and
 *     `default` by name.
 *   - Every profile is under GMUX_HARNESS_DIR, HOME and ZDOTDIR are scratch
 *     directories under it, so no file under the person's home is opened and
 *     none is ever removed.
 *   - `-L gmux` is named in exactly one place, a read only `list-sessions`
 *     count taken before and after, which must match.
 *   - Both Electrons go through build/electron-run.mjs, which ends the tree it
 *     started in a `finally` block. They run one after the other, never at once.
 *
 * Usage:
 *   node build/harness-socket.mjs --fresh gmux-p269-env 'node build/p269/probe-p269-env.mjs'
 *
 * Knobs: P269_OUT_DIR (default out/p269), P269_AGENT (default claude).
 */

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withElectron } from '../electron-run.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[probe:p269]';
const t0 = Date.now();
const say = (line) => {
  console.log(`${TAG} ${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`);
};
const refuse = (why) => {
  console.error(`${TAG} REFUSED. ${why}`);
  process.exit(2);
};

const socket = (process.env['GMUX_TMUX_SOCKET'] ?? '').trim();
if (socket === '') {
  refuse(
    'no GMUX_TMUX_SOCKET. Run me through the harness: node build/harness-socket.mjs ' +
      "--fresh gmux-p269-env 'node build/p269/probe-p269-env.mjs'"
  );
}
if (socket === 'gmux' || socket === 'default') {
  refuse(`refusing to run on "${socket}", which is not a harness socket`);
}
if (!existsSync(join(repoRoot, 'out', 'main', 'index.js'))) {
  refuse('out/main/index.js is missing. Run npm run build first.');
}

const AGENT = (process.env['P269_AGENT'] ?? '').trim() || 'claude';
const NAME = 'P269_TEST_NAME';
/** Invented here. Never a real provider key, and never printed. */
const VALUE = `P269_TEST_VALUE-${process.pid}`;

const outDir = resolve(repoRoot, (process.env['P269_OUT_DIR'] ?? '').trim() || 'out/p269');
mkdirSync(outDir, { recursive: true });

const scratchBase = process.env['GMUX_HARNESS_DIR'] ?? process.env['TMPDIR'] ?? tmpdir();
const rawRoot = join(scratchBase, 'gmux-p269-env');
for (const dir of ['home', 'bin', 'values', 'project', 'profile']) {
  mkdirSync(join(rawRoot, dir), { recursive: true });
}
const root = realpathSync(rawRoot);
const scratchHome = join(root, 'home');
const binDir = join(root, 'bin');
const valuesDir = join(root, 'values');
const projectDir = join(root, 'project');
const userData = join(root, 'profile');
const rcPath = join(scratchHome, '.zshrc');
const settingsFile = join(userData, 'settings.json');

// The scratch login shell. It exports the sentinel and puts the scratch bin
// directory first on the PATH, which is how the app's own login-shell probe
// finds the stand-in executable below.
writeFileSync(
  rcPath,
  [
    `export PATH="${binDir}:$PATH"`,
    `export ${NAME}=${VALUE}`,
    ''
  ].join('\n'),
  'utf8'
);

// The stand-in for the agent binary. It writes what it was handed to a file
// named after its OWN session stamp, which is also how the run proves the
// stamp landed, and then sleeps so the pane stays alive.
const fakeBin = join(binDir, AGENT);
writeFileSync(
  fakeBin,
  [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then echo "0.0.0-p269"; exit 0; fi',
    `printf '%s' "\${${NAME}-}" > "${valuesDir}/\${GMUX_SESSION_ID:-nostamp}.value"`,
    'exec sleep 600',
    ''
  ].join('\n'),
  'utf8'
);
chmodSync(fakeBin, 0o755);

/** The operator's live server, listed and never written. Named once. */
function operatorSessionCount() {
  const out = spawnSync('tmux', ['-L', 'gmux', 'list-sessions'], { encoding: 'utf8' });
  if (out.status !== 0) return 0;
  return out.stdout.split('\n').filter((l) => l.trim() !== '').length;
}

/** The CLAUDE.md count of what an Electron run leaves behind, keyed by pid. */
function electronsLeft() {
  const out = spawnSync(
    'sh',
    [
      '-c',
      'ps -Ao pid,ppid,rss,comm | grep -E "[E]lectron|Tortie$|chrome_crashpad" | grep -v defunct'
    ],
    { encoding: 'utf8' }
  );
  const rows = new Map();
  for (const line of out.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m !== null) rows.set(Number(m[1]), line.trim());
  }
  return rows;
}

const sessionsBefore = operatorSessionCount();
say(`operator sessions before: ${String(sessionsBefore)}`);
const electronsBefore = electronsLeft();
say(`electron pids before: ${String(electronsBefore.size)}`);

/** One launch of the harness. The server is kept between the two legs. */
async function launch(leg, file) {
  const label = `p269 ${leg}`;
  say(`launch ${label} on socket ${socket}`);
  let code = 1;
  let text = '';
  await withElectron(
    {
      label,
      userDataDir: userData,
      cwd: repoRoot,
      // The scratch server is ended once, by build/harness-socket.mjs, after
      // both legs. Asking the helper to end it after the first leg would take
      // the arm-1 session away before the attack leg can prove it survived.
      tmuxSocket: leg === 'attack' ? socket : null,
      env: {
        ...process.env,
        HOME: scratchHome,
        ZDOTDIR: scratchHome,
        SHELL: '/bin/zsh',
        GMUX_TMUX_SOCKET: socket,
        GMUX_SMOKE: 'p269-env',
        GMUX_LOG_FILE: '1',
        GMUX_P269_ROOT: root,
        GMUX_P269_OUT: file,
        GMUX_P269_RC: rcPath,
        GMUX_P269_VALUES: valuesDir,
        GMUX_P269_PROJECT: projectDir,
        GMUX_P269_AGENT: AGENT,
        GMUX_P269_NAME: NAME,
        GMUX_P269_LEG: leg
      }
    },
    async (handle) => {
      code = await new Promise((r) => {
        const ceiling = setTimeout(() => {
          console.error(`${TAG} ${label} passed the 260 s ceiling; the teardown ends the tree`);
          r(1);
        }, 260_000);
        void handle.exited.then((c) => {
          clearTimeout(ceiling);
          setTimeout(() => r(c), 500);
        });
      });
      text = handle.text();
    }
  );
  writeFileSync(join(outDir, `${leg}.stdout.txt`), text);
  let report = null;
  if (existsSync(file)) {
    try {
      report = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      say(`${label}: the report does not parse: ${String(err)}`);
    }
  }
  say(`${label}: exit ${String(code)}`);
  return { code, text, report };
}

// ---------------------------------------------------------------------------
// LEG 1 — the four arms
// ---------------------------------------------------------------------------

const main = await launch('main', join(outDir, 'main.json'));

// ---------------------------------------------------------------------------
// THE ATTACK. The app is down. A name is appended to a SECOND agent's list
// straight in the file, the way any agent on this machine can, and the seal
// is left exactly as Tortie wrote it.
// ---------------------------------------------------------------------------

let attackWrote = false;
let attackAgent = 'codex';
if (existsSync(settingsFile)) {
  const file = JSON.parse(readFileSync(settingsFile, 'utf8'));
  const settings = file.settings ?? {};
  const before = settings.envPassthrough ?? {};
  if (attackAgent === AGENT) attackAgent = 'pi';
  settings.envPassthrough = { ...before, [attackAgent]: [NAME] };
  file.settings = settings;
  writeFileSync(settingsFile, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  attackWrote = true;
  say(`wrote a passthrough name for "${attackAgent}" straight into settings.json`);
}

const attack = await launch('attack', join(outDir, 'attack.json'));

const sessionsAfter = operatorSessionCount();
say(`operator sessions after: ${String(sessionsAfter)}`);
const electronsAfter = electronsLeft();
const electronsLeaked = [...electronsAfter]
  .filter(([pid]) => !electronsBefore.has(pid))
  .map(([, l]) => l);

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

const failures = [];
const check = (ok, why) => {
  if (!ok) failures.push(why);
};

const r = main.report;
check(main.code === 0, `the main leg exited ${String(main.code)} rather than 0`);
check(r !== null, 'the main leg wrote no report');

if (r !== null) {
  const [one, two] = r.panes;
  // ARM 1.
  check(one?.stampLanded === true, 'the first pane never wrote its file, so GMUX_SESSION_ID did not land');
  check(one?.valueMatches === true, 'the first pane did not receive the value its shell exports');
  check(one?.rowCarriesName === true, 'the manifest row does not carry the NAME, so a restore would not read it again');
  // ARM 2.
  check(r.leaks.tmuxServerEnvHasValue === false, 'the VALUE is in the tmux server environment, where every pane and every same-user process can read it');
  check(r.leaks.tmuxServerEnvHasName === false, 'the NAME is in the tmux server environment, which is not where it belongs either');
  check(r.leaks.tmuxSessionEnvHasValue === true, 'the value is not in the SESSION\'s own tmux environment, which is where new-session -e puts it — so the run proved nothing about where it is NOT');
  check(r.leaks.manifestHasValue === false, 'the VALUE is in the manifest, in plain bytes');
  check(r.leaks.manifestHasName === true, 'the manifest does not carry the NAME, so nothing tells a restore what to read again');
  check(r.leaks.logsHaveValue === false, 'the VALUE is in a log file');
  check(r.leaks.logFilesScanned > 0, 'no log file was scanned, so "no value in a log" proves nothing');
  check(r.leaks.settingsHaveValue === false, 'the VALUE is in settings.json');
  check(r.leaks.settingsHaveName === true, 'settings.json does not carry the NAME, so the person set nothing');
  // ARM 3.
  check(two?.valueMatches === true, 'the second session did not pick up the ROTATED value, which is what a person restarts everything to get');
  check(one?.valueMatches === true, 'the first session no longer holds the value it started with');
  // ARM 4.
  check(r.notice.posted === true, 'no env-unresolved notice was posted for a name nothing exports');
  check(r.notice.namesTheVariable === true, 'the env-unresolved notice did not name the variable');
  check(r.notice.carriesNoValue === true, 'the env-unresolved notice carried a value');
}

// ARM 5 — the attack, and its ablation.
check(attackWrote, 'settings.json was never written, so the attack was not run');
check(attack.code === 0, `the attack leg exited ${String(attack.code)} rather than 0`);
const a = attack.report;
check(a !== null, 'the attack leg wrote no report');
if (a !== null) {
  const handWritten = (a.sealCheckedMap ?? {})[attackAgent] ?? [];
  check(
    !handWritten.includes(NAME),
    `the name written by hand into settings.json was HONOURED for "${attackAgent}". ` +
      'Any agent on the machine could then read a key it was never given.'
  );
  // THE ABLATION. The name the app itself wrote in arm 1 is still there after
  // the same restart, and its pane still gets the value. Without this the
  // attack could pass because nothing works at all.
  check(
    (a.sealCheckedNames ?? []).length > 0,
    `the name Tortie itself wrote for "${AGENT}" did not survive the restart, so the attack passed vacuously`
  );
  check(
    a.panes?.[0]?.valueMatches === true,
    'after the restart the sealed name no longer reaches a pane, so the attack passed vacuously'
  );
}
const attackLog = attack.text;
check(
  attackLog.includes(`${attackAgent} ${NAME}`),
  `the log does not name "${attackAgent} ${NAME}" as a refused setting, so a person whose variable stopped arriving is told nothing`
);

check(
  sessionsAfter === sessionsBefore,
  `the operator's own tmux server went from ${String(sessionsBefore)} sessions to ${String(sessionsAfter)}`
);
check(
  electronsLeaked.length === 0,
  `${String(electronsLeaked.length)} Electron process(es) were left behind:\n  ${electronsLeaked.join('\n  ')}`
);

// NO VALUE IS EVER PRINTED. Asserted over everything this script is about to
// write, so a future edit cannot quietly start leaking one into a report.
const printable = JSON.stringify({ main: r, attack: a, failures });
check(
  !printable.includes(VALUE),
  'the sentinel VALUE appears in what this probe would print'
);

console.log('');
console.log(`${TAG} agent ${AGENT}, variable ${NAME}, value never printed`);
if (r !== null) {
  for (const pane of r.panes) {
    console.log(
      `${TAG}   ${pane.session.padEnd(14)} stamp ${pane.stampLanded ? 'yes' : 'NO '} ` +
        `value ${pane.valueMatches ? 'matches' : 'DOES NOT MATCH'} row ${pane.rowCarriesName ? 'names it' : 'DOES NOT'}`
    );
  }
  console.log(
    `${TAG}   leaks: tmux server ${r.leaks.tmuxServerEnvHasValue ? 'HAS VALUE' : 'clean'}, ` +
      `manifest ${r.leaks.manifestHasValue ? 'HAS VALUE' : 'clean'}, ` +
      `${String(r.leaks.logFilesScanned)} logs ${r.leaks.logsHaveValue ? 'HAVE VALUE' : 'clean'}, ` +
      `settings ${r.leaks.settingsHaveValue ? 'HAS VALUE' : 'clean'}`
  );
  console.log(
    `${TAG}   scope: the value is in THIS session's own tmux environment ` +
      `(${r.leaks.tmuxSessionEnvHasValue ? 'yes' : 'NO'}), where new-session -e puts it, ` +
      'and in the server globals every pane can read (no)'
  );
  console.log(
    `${TAG}   notice: ${r.notice.posted ? 'posted' : 'NOT POSTED'}, ` +
      `${r.notice.namesTheVariable ? 'names the variable' : 'DOES NOT NAME IT'}`
  );
}
console.log(
  `${TAG}   attack: hand written name for "${attackAgent}" ` +
    `${a !== null && !((a.sealCheckedMap ?? {})[attackAgent] ?? []).includes(NAME) ? 'refused' : 'HONOURED'}, ` +
    `sealed name for "${AGENT}" ${a !== null && (a.sealCheckedNames ?? []).length > 0 ? 'survived' : 'DID NOT SURVIVE'}`
);
console.log('');

if (failures.length > 0) {
  console.error(`${TAG} FAIL, ${String(failures.length)}:`);
  for (const why of failures) console.error(`  - ${why}`);
  process.exit(1);
}
console.log(`${TAG} PASS. The variable reaches the pane, is written nowhere, rotates without a restart, and a name written by hand is refused.`);
process.exit(0);
