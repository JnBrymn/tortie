#!/usr/bin/env node
/**
 * probe-p281-meter.mjs. Phase 281's app run: does the Claude meter read the
 * item Claude Code reads, on the operator's own machine?
 *
 * ## Why this run exists, and why it is the one run that reads his keychain
 *
 * Every gate and every verifier of Phase 281 drove the shipping readers over a
 * model of `security` or over a scratch keychain. None of them can say what
 * the meter answers on HIS machine, where `Claude Code-credentials` names two
 * items and the service-only lookup lands on a stray one (research 126 §2.4).
 * This run is research 126 §7.2's proof step 6: the same launch at the parent
 * and at HEAD, never at once, two polls apart. The parent must answer
 * `signed-out`; HEAD must not, and must draw numbers.
 *
 * So this is deliberately the one probe in the phase whose app reads his real
 * login keychain, through the SHIPPING usage reader and nothing else, and
 * sends his token to the usage endpoint, which is exactly the product's
 * ordinary poll. He approved it on 2026-09-17 and runs one turn in a
 * default-login claude session first, so Claude Code's item holds a fresh
 * token.
 *
 * ## What it refuses, and how
 *
 *  - `GMUX_PROBES=1` is set, and no `GMUX_HARNESS_KEYCHAIN` and no
 *    `GMUX_USAGE_FIXTURE`. A harness launch with no knob gets
 *    `harnessFileKeepDeps` (src/main/credentials/index.ts): Tortie's own store
 *    is a FILE under the scratch profile and the credentials domain's
 *    `security` seam refuses every call, so no observe, lift, switch or vault
 *    write can reach his keychain. Since Phase 281.1 the login list's
 *    presence seam refuses the keychain under the same predicate
 *    (`harnessLoginAccountDeps`, src/main/usage/login-accounts.ts), so a
 *    `logins:list` from the meter's hover card, the Settings usage group or
 *    the add-login modal spawns no `security` either; until then it spawned
 *    an attributes-only `find-generic-password` against his login keychain,
 *    which the Phase 281.1 measure verifier found by reading and this
 *    script never triggered. So the ONLY `security` this launch can spawn is
 *    the meter's own `-w` read of the one item, and the only other reader of
 *    his login keychain is Chromium's `safeStorage` (the Safe Storage item, no
 *    `security` process), reached only when a danger value is sealed or a
 *    non-empty seal is opened; this run's profile is fresh and sets no danger
 *    value, and `use-mock-keychain` is NOT appended, because
 *    `isIsolatedLaunch` does not count `GMUX_PROBES`. The `logins.boot` line
 *    is read back below: its `securityCalls` must be 0.
 *  - `HOME` IS HIS OWN, and it has to be. Measured on 2026-09-17: with `HOME`
 *    pointed at an empty directory, `security find-generic-password -a "$USER"
 *    -s "Claude Code-credentials"` exits 44 and the same call with his own
 *    `HOME` exits 0, because the keychain search list is resolved through the
 *    home directory. A scratch `HOME` therefore makes every build answer
 *    `signed-out` and proves nothing. Nothing in this launch writes there: the
 *    profile is scratch, the credentials domain is the file shape above, and
 *    this run creates no session, so no per-session settings file is written.
 *  - The Codex switch stays OFF, so no Codex credential is read.
 *  - This script never runs `security` at all, and prints no token, no
 *    account attribute and no login. It prints each poll's state word, whether
 *    each window has a number, and the plan word.
 *  - One Electron, through build/electron-run.mjs, ended in its `finally`.
 *    It refuses without a harness tmux socket and refuses `gmux` and `default`.
 *
 * ## Usage
 *
 *   npm run build
 *   P281_EXPECT=signed-out node build/harness-socket.mjs --fresh gmux-p281 \
 *     'node build/p281/probe-p281-meter.mjs'        # at the parent
 *   P281_EXPECT=numbers    node build/harness-socket.mjs --fresh gmux-p281 \
 *     'node build/p281/probe-p281-meter.mjs'        # at HEAD
 *
 * Exit 0 when both polls answer what P281_EXPECT names, 1 when not, 2 when it
 * refuses.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cdpEval, wsConnect } from '../cdp-client.mjs';
import { withElectron } from '../electron-run.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[probe:p281]';
const t0 = Date.now();
const say = (line) => console.log(`${TAG} ${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`);
const refuse = (why) => {
  console.error(`${TAG} REFUSED. ${why}`);
  process.exit(2);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const socket = (process.env['GMUX_TMUX_SOCKET'] ?? '').trim();
if (socket === '') refuse('no GMUX_TMUX_SOCKET; run me through build/harness-socket.mjs.');
if (socket === 'gmux' || socket === 'default') refuse(`"${socket}" is not a harness socket.`);
if (!existsSync(join(repoRoot, 'out', 'main', 'index.js'))) refuse('out/main/index.js is missing; run npm run build first.');
const expect = (process.env['P281_EXPECT'] ?? '').trim();
if (expect !== 'signed-out' && expect !== 'numbers') refuse('P281_EXPECT must be signed-out (the parent) or numbers (HEAD).');
for (const knob of ['GMUX_HARNESS_KEYCHAIN', 'GMUX_USAGE_FIXTURE', 'CLAUDE_CONFIG_DIR', 'CLAUDE_SECURESTORAGE_CONFIG_DIR']) {
  if ((process.env[knob] ?? '') !== '') refuse(`${knob} is set; this run reads the default login only.`);
}
const floorMs = Number(process.env['P281_GAP_MS'] ?? '65000') || 65000;

const scratchBase = process.env['GMUX_HARNESS_DIR'] ?? process.env['TMPDIR'] ?? tmpdir();
const rawRoot = join(scratchBase, `gmux-p281-meter-${String(process.pid)}`);
rmSync(rawRoot, { recursive: true, force: true });
mkdirSync(join(rawRoot, 'codex-home'), { recursive: true });
const root = realpathSync(rawRoot);
const profile = join(root, 'profile');

async function pageTarget(profileDir, timeoutMs) {
  const started = Date.now();
  for (;;) {
    try {
      const port = Number(readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim());
      if (Number.isFinite(port) && port > 0) {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url ?? ''));
        if (page?.webSocketDebuggerUrl) return wsConnect(page.webSocketDebuggerUrl);
      }
    } catch {
      // Not up yet.
    }
    if (Date.now() - started > timeoutMs) throw new Error(`no renderer within ${timeoutMs / 1000} s`);
    await sleep(500);
  }
}

// Only the state word, whether each window holds a number, and the plan word.
const CLAUDE_ROW = (call) => `window.gmux.usage.${call}().then((s) => {
  const p = (s.providers || []).find((x) => x.provider === 'claude');
  if (!p) return null;
  return { state: p.state, fiveHour: p.fiveHour !== null, sevenDay: p.sevenDay !== null, plan: p.plan, read: p.readAt !== null };
})`;
const SETTLED = new Set(['ok', 'stale', 'signed-out', 'expired', 'api-key', 'no-windows', 'unavailable']);

async function settledRow(cdp, call, ms) {
  const started = Date.now();
  let row = await cdpEval(cdp, CLAUDE_ROW(call));
  while (!(row !== null && SETTLED.has(row.state)) && Date.now() - started < ms) {
    await sleep(1000);
    row = await cdpEval(cdp, CLAUDE_ROW('read'));
  }
  return row;
}

const judge = (row) =>
  expect === 'signed-out'
    ? row !== null && row.state === 'signed-out'
    : row !== null && (row.state === 'ok' || row.state === 'no-windows') && (row.fiveHour || row.sevenDay);

const polls = [];
const code = await withElectron(
  {
    label: 'p281 claude meter',
    userDataDir: profile,
    cwd: repoRoot,
    args: ['--remote-debugging-port=0'],
    env: {
      ...process.env,
      // HIS OWN HOME, for the reason in the header: the keychain search list is
      // resolved through it, and a scratch HOME answers 44 for every item.
      CODEX_HOME: join(root, 'codex-home'),
      GMUX_PROBES: '1'
    },
    graceMs: 15_000,
    tmuxSocket: socket
  },
  async (handle) => {
    say(`launched, pid ${String(handle.pid)}`);
    const cdp = await pageTarget(profile, 90_000);
    for (let waited = 0; waited < 60_000; waited += 500) {
      if (await cdpEval(cdp, "typeof window.gmux?.usage?.read === 'function'")) break;
      await sleep(500);
    }
    const switches = await cdpEval(cdp, 'window.gmux.settingsSet({ usage: { claude: true, codex: false } }).then((s) => s.usage)');
    say(`switches ${JSON.stringify(switches)}`);
    const first = await settledRow(cdp, 'read', 45_000);
    polls.push(first);
    say(`poll 1 ${JSON.stringify(first)}`);
    say(`waiting ${String(floorMs / 1000)} s for the refresh floor`);
    await sleep(floorMs);
    const second = await settledRow(cdp, 'refresh', 45_000);
    polls.push(second);
    say(`poll 2 ${JSON.stringify(second)}`);
    // The main process's own failure lines, provider and outcome only.
    const text = handle.text();
    const lines = text
      .split('\n')
      .filter((l) => /usage\.read\.failed/.test(l))
      .map((l) => {
        const provider = /provider[=":\s]+([a-z]+)/.exec(l)?.[1] ?? '?';
        const outcome = /outcome[=":\s]+([a-z-]+)/.exec(l)?.[1] ?? '?';
        return `${provider} ${outcome}`;
      });
    say(`usage.read.failed lines: ${lines.length === 0 ? 'none' : lines.join(', ')}`);
    // The credentials domain's own count of `security` calls at boot, which
    // the file shape above must keep at zero (Phase 281.1).
    const bootCalls = /logins\.boot.*?"securityCalls":\s*(\d+)/.exec(text)?.[1] ?? null;
    say(`logins.boot securityCalls: ${bootCalls ?? 'not logged'}`);
    cdp.close();
    // A missing line is a FAILED check, not a quiet one (Phase 281.1 reverify):
    // a boot whose observe never ran, or a moved log format, must not pass.
    const quiet = bootCalls === '0';
    return polls.length === 2 && polls.every(judge) && quiet ? 0 : 1;
  }
);

rmSync(rawRoot, { recursive: true, force: true });
say(code === 0 ? `PASS: both polls answered ${expect}` : `FAIL: expected ${expect}, read ${JSON.stringify(polls)}`);
process.exit(code === 0 ? 0 : 1);
