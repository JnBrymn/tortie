/**
 * GMUX_SMOKE=p269-env — a named shell variable reaches a pane, and is written
 * nowhere (Phase 269).
 *
 * ## What this harness answers, in the app rather than in a unit test
 *
 * Phase 33 built the mechanism and Phase 269 made it reachable from Settings.
 * Everything between the two can be read in the source; what cannot be read is
 * whether a variable a person names in Settings actually arrives in a running
 * pane, whether any of it is written down, and whether a rotated value is
 * picked up without restarting anything. This drives all three against a real
 * tmux server, a real manifest and a real login shell.
 *
 * ## The four arms of one launch
 *
 * 1. IT REACHES THE PANE. The name is set through `updateSettings`, which is
 *    the function the shipped `settings:set` handler calls, so the seal is
 *    produced exactly as the Settings window produces it. A session is then
 *    created for that agent and the pane writes what it was given to a file
 *    named after its OWN `GMUX_SESSION_ID` stamp, which is also how the run
 *    proves the stamp landed.
 * 2. IT IS WRITTEN NOWHERE. The tmux server's global environment, every byte
 *    of the manifest file, every byte of every log, and every byte of
 *    settings.json are scanned for the value. The NAME is expected in the
 *    manifest and in settings.json; the VALUE is expected in none of them.
 * 3. ROTATION. The scratch rc is rewritten with a second value and a second
 *    session is created with no restart of Tortie and no restart of the tmux
 *    server. The new pane must hold the new value and the first pane must
 *    still hold the first.
 * 4. THE NOTICE IS REACHABLE. A name nothing exports is added and a third
 *    session created; the `env-unresolved` notice must be posted naming it.
 *    Before this phase that sentence could not fire for anybody who had no
 *    `agents.json`, which is the silence the reporter of issue 20 hit.
 *
 * The fifth arm, being THE ATTACK ON THE SEAL, needs two launches and lives in
 * build/p269/probe-p269-env.mjs, which boots this harness a second time on the
 * same profile after editing settings.json by hand.
 *
 * ## NO SECRET VALUE, ANYWHERE
 *
 * The sentinel is `P269_TEST_VALUE` plus a per-run suffix, invented here. It is
 * never a real provider key. It is never printed: this harness writes booleans
 * and counts, and the one place the value exists on disk is the scratch file
 * the pane itself wrote, under the scratch root the supervisor removes.
 *
 * ## What it refuses
 *
 * It runs only on a profile under `GMUX_P269_ROOT` and only against a tmux
 * socket that is not the real one, through `assertHarnessIsolation`. It reads
 * the operator's own server never.
 */

import { app } from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { getGmuxCore } from '../sessions';
import type { GmuxCore } from '../sessions';
import { getSettings, updateSettings } from '../settings/store';
import { takePendingNotices } from '../notice';
import type { AgentKind, LaunchableAgentId } from '@shared/types';
import * as tmux from '../tmux';
import { assertHarnessIsolation } from './isolation';
import { armWatchdog, smokeFail, smokeLog } from './support';

/** One pane's verdict. Booleans and names only — never a value. */
interface PaneRow {
  session: string;
  /** The pane wrote a file named after its own GMUX_SESSION_ID stamp. */
  stampLanded: boolean;
  /** What the pane wrote equals the value the scratch rc exported. */
  valueMatches: boolean;
  /** The pane wrote something, but not what the rc exported. */
  valueWrong: boolean;
  /** The manifest row for this session carries the NAME. */
  rowCarriesName: boolean;
}

export interface P269Report {
  at: string;
  leg: string;
  agent: string;
  name: string;
  /** Arm 1 and arm 3, one row per pane. */
  panes: PaneRow[];
  /** Arm 2, all four scans. Every one of these must be false for the value. */
  leaks: {
    tmuxServerEnvHasName: boolean;
    tmuxServerEnvHasValue: boolean;
    /**
     * The value IS in the session's own tmux environment, because that is
     * where `new-session -e` puts it and it is scoped to this one session.
     * Recorded rather than refused; the refusal is the SERVER globals above.
     */
    tmuxSessionEnvHasValue: boolean;
    manifestHasName: boolean;
    manifestHasValue: boolean;
    logsHaveValue: boolean;
    settingsHaveName: boolean;
    settingsHaveValue: boolean;
    logFilesScanned: number;
  };
  /** Arm 4: the sentence that was structurally unreachable before the phase. */
  notice: {
    posted: boolean;
    namesTheVariable: boolean;
    carriesNoValue: boolean;
  };
  /** Arm 5's second leg: what the settings door answers after a hand edit. */
  settingsNames: string[];
  /** The sealed names as the app reads them, for the supervisor to compare. */
  sealCheckedNames: string[];
  /**
   * EVERY agent's sealed names, as `getSettings()` answers them. The attack
   * writes a name under a SECOND agent, so the supervisor needs the whole map
   * to say that one was refused while the other survived.
   */
  sealCheckedMap: Record<string, string[]>;
}

const RC_LINE = 'export P269_TEST_NAME=';

function envText(name: string): string {
  return (process.env[name] ?? '').trim();
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

/** Read the scratch rc's exported value back, so nothing here hard codes it. */
function rcValue(rcPath: string): string {
  const line = readFileSync(rcPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(RC_LINE));
  return line === undefined ? '' : line.slice(RC_LINE.length).trim();
}

/** Every regular file under a directory, one level of recursion at a time. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string): void => {
    let names: string[] = [];
    try {
      names = readdirSync(at);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(at, name);
      try {
        if (statSync(path).isDirectory()) walk(path);
        else out.push(path);
      } catch {
        // A file that vanished between the listing and the stat is not a leak.
      }
    }
  };
  walk(dir);
  return out;
}

/** Does this file hold the needle, as raw bytes? */
function fileHas(path: string, needle: string): boolean {
  try {
    return readFileSync(path).includes(Buffer.from(needle, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * One tmux environment, read through the real binary, as a name-to-value map.
 *
 * IT IS PARSED RATHER THAN SUBSTRING SEARCHED, and that is not tidiness. A
 * tmux server's GLOBAL environment is a copy of the environment of whichever
 * process started the server, which here is Tortie, which here was launched by
 * a probe that names the variable under test in its OWN environment. A
 * substring search therefore reports a leak that is the harness talking to
 * itself. Measured on 2026-09-15, and it is why this function exists.
 */
async function tmuxEnv(args: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let text = '';
  try {
    text = await tmux.execTmux(['show-environment', ...args]);
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    // tmux writes `-NAME` for a variable it has been told to unset.
    const at = line.indexOf('=');
    if (at <= 0) continue;
    out.set(line.slice(0, at), line.slice(at + 1));
  }
  return out;
}

/**
 * Create one session for the agent under test and wait for its pane to write
 * the file named after its own session id.
 */
async function createAndRead(
  core: GmuxCore,
  agent: string,
  name: string,
  projectPath: string,
  outDir: string,
  expected: string,
  varName: string
): Promise<PaneRow> {
  const session = await core.createSession({
    name,
    projectPath,
    cwd: projectPath,
    // The wire type is still the frozen AgentKind trio and every harness that
    // launches a registry agent carries the same cast, recorded in the
    // INTEGRATOR note in src/shared/types.ts. `buildLaunchSpec` already
    // accepts every launchable id.
    agent: agent as AgentKind,
    extraArgs: []
  });
  const path = join(outDir, `${session.id}.value`);
  const until = Date.now() + 20_000;
  while (Date.now() < until && !existsSync(path)) await sleep(150);
  const stampLanded = existsSync(path);
  const written = stampLanded ? readFileSync(path, 'utf8') : '';
  const row = core.listSessionRecords().find((r) => r.id === session.id);
  return {
    session: name,
    stampLanded,
    valueMatches: stampLanded && written === expected,
    valueWrong: stampLanded && written !== expected,
    rowCarriesName: (row?.envPassthrough ?? []).includes(varName)
  };
}

export async function runP269EnvSmoke(): Promise<void> {
  armWatchdog(240_000);
  try {
    const isolation = assertHarnessIsolation('GMUX_P269_ROOT');
    const outPath = envText('GMUX_P269_OUT');
    const rcPath = envText('GMUX_P269_RC');
    const outDir = envText('GMUX_P269_VALUES');
    const project = envText('GMUX_P269_PROJECT');
    const agent = envText('GMUX_P269_AGENT');
    const leg = envText('GMUX_P269_LEG') || 'main';
    const varName = envText('GMUX_P269_NAME') || 'P269_TEST_NAME';
    const missingName = 'P269_NOTHING_EXPORTS_THIS';
    for (const [label, value] of [
      ['GMUX_P269_OUT', outPath],
      ['GMUX_P269_RC', rcPath],
      ['GMUX_P269_VALUES', outDir],
      ['GMUX_P269_PROJECT', project],
      ['GMUX_P269_AGENT', agent]
    ] as const) {
      if (value === '') throw new Error(`${label} is not set. Refusing to run.`);
    }
    mkdirSync(outDir, { recursive: true });
    smokeLog(
      `1/7 isolated: profile under ${isolation.root}, socket ${isolation.socket}, leg ${leg}`
    );

    const report: P269Report = {
      at: new Date().toISOString(),
      leg,
      agent,
      name: varName,
      panes: [],
      leaks: {
        tmuxServerEnvHasName: false,
        tmuxServerEnvHasValue: false,
        tmuxSessionEnvHasValue: false,
        manifestHasName: false,
        manifestHasValue: false,
        logsHaveValue: false,
        settingsHaveName: false,
        settingsHaveValue: false,
        logFilesScanned: 0
      },
      notice: { posted: false, namesTheVariable: false, carriesNoValue: false },
      settingsNames: [],
      sealCheckedNames: [],
      sealCheckedMap: {}
    };

    const core = await getGmuxCore();
    smokeLog('2/7 core booted and reconciled');

    // THE SECOND LEG IS THE ATTACK'S ANSWER. The supervisor has already
    // written a name straight into settings.json with the app down; all this
    // leg does is say what the sealed read answers, create one session, and
    // let the supervisor compare. It adds nothing of its own.
    const sealedMap = getSettings().envPassthrough as Record<string, string[]>;
    const sealed = sealedMap[agent] ?? [];
    report.sealCheckedNames = [...sealed];
    report.sealCheckedMap = Object.fromEntries(
      Object.entries(sealedMap).map(([id, names]) => [id, [...names]])
    );
    if (leg === 'attack') {
      const value = rcValue(rcPath);
      report.panes.push(
        await createAndRead(
          core,
          agent,
          'p269-attack',
          project,
          outDir,
          value,
          varName
        )
      );
      report.settingsNames = [...sealed];
      writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      smokeLog('7/7 attack leg written');
      app.exit(0);
      return;
    }

    // ARM 1 — through the app's own door, which is the function the shipped
    // `settings:set` handler calls, so the seal is the real one.
    updateSettings({
      envPassthrough: { [agent as LaunchableAgentId]: [varName] }
    });
    report.settingsNames = [
      ...(getSettings().envPassthrough[agent as LaunchableAgentId] ?? [])
    ];
    smokeLog(`3/7 the name is set through the app's own door: ${varName}`);

    const first = rcValue(rcPath);
    if (first === '') throw new Error('the scratch rc exported no value');
    report.panes.push(
      await createAndRead(core, agent, 'p269-one', project, outDir, first, varName)
    );
    smokeLog('4/7 the first pane answered');

    // ARM 2 — it is written nowhere. Scanned while the session is running.
    const serverEnv = await tmuxEnv(['-g']);
    report.leaks.tmuxServerEnvHasName = serverEnv.has(varName);
    report.leaks.tmuxServerEnvHasValue = [...serverEnv.values()].includes(first);
    // THE SESSION's own environment is a different question and it is asked
    // here rather than assumed. `new-session -e` is where a resolved value
    // goes, and it is scoped to that one session by design (research 41's
    // refusal is about the SERVER globals, which every pane and every
    // same-user process can read). This records what is actually true instead
    // of letting a later reader believe the value is nowhere in tmux at all.
    const firstRecord = core.listSessionRecords().find((r) => r.name === 'p269-one');
    if (firstRecord !== undefined) {
      const sessionEnv = await tmuxEnv(['-t', firstRecord.tmuxName]);
      report.leaks.tmuxSessionEnvHasValue = sessionEnv.get(varName) === first;
    }
    const userData = app.getPath('userData');
    const manifestFiles = filesUnder(join(userData, 'gmux')).filter((p) =>
      p.includes('manifest')
    );
    report.leaks.manifestHasName = manifestFiles.some((p) => fileHas(p, varName));
    report.leaks.manifestHasValue = manifestFiles.some((p) => fileHas(p, first));
    const logFiles = filesUnder(join(userData, 'logs'));
    report.leaks.logFilesScanned = logFiles.length;
    report.leaks.logsHaveValue = logFiles.some((p) => fileHas(p, first));
    const settingsFile = join(userData, 'settings.json');
    report.leaks.settingsHaveName = fileHas(settingsFile, varName);
    report.leaks.settingsHaveValue = fileHas(settingsFile, first);
    smokeLog(
      `5/7 scanned ${String(manifestFiles.length)} manifest files and ` +
        `${String(logFiles.length)} log files`
    );

    // ARM 3 — rotation, with no restart of Tortie and no restart of tmux.
    const second = `${first}-rotated`;
    writeFileSync(
      rcPath,
      readFileSync(rcPath, 'utf8').replace(
        `${RC_LINE}${first}`,
        `${RC_LINE}${second}`
      ),
      'utf8'
    );
    if (rcValue(rcPath) !== second) throw new Error('the rc rewrite did not take');
    report.panes.push(
      await createAndRead(core, agent, 'p269-two', project, outDir, second, varName)
    );
    // The first pane must still hold the first value: a rotation changes what
    // the NEXT session gets and never what a running one holds.
    const firstRow = report.panes[0];
    if (firstRow !== undefined) {
      const firstPath = core
        .listSessionRecords()
        .find((r) => r.name === 'p269-one');
      if (firstPath !== undefined) {
        const path = join(outDir, `${firstPath.id}.value`);
        firstRow.valueMatches = fileHas(path, first) && !fileHas(path, second);
      }
    }
    smokeLog('6/7 the rotated value reached the next session only');

    // ARM 4 — the notice a person hits when nothing exports the name.
    updateSettings({
      envPassthrough: {
        [agent as LaunchableAgentId]: [varName, missingName]
      }
    });
    await createAndRead(
      core,
      agent,
      'p269-three',
      project,
      outDir,
      second,
      varName
    );
    const notices = takePendingNotices();
    const unresolved = notices.filter((n) => n.kind === 'env-unresolved');
    report.notice.posted = unresolved.length > 0;
    report.notice.namesTheVariable = unresolved.some(
      (n) => n.kind === 'env-unresolved' && n.names.includes(missingName)
    );
    report.notice.carriesNoValue = !JSON.stringify(unresolved).includes(second);

    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    smokeLog(`7/7 wrote ${outPath}`);
    app.exit(0);
  } catch (err) {
    smokeFail(err);
  }
}
