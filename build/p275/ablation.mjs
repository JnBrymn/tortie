#!/usr/bin/env node
/**
 * `npm run ablation:p275` — the attack on `conformance:agents` section 9.
 *
 * A GREEN GATE IS ONLY EVIDENCE IF IT CAN GO RED. Section 9 asserts twenty-five
 * rules about the shared shell-variable list Phase 275 added (twenty-two from
 * the builder's round, plus R17b, which the integrator added over the one seam
 * where the picker's half and the seal's half could come to different answers,
 * plus R16b and R20b from the fix round), and the two that matter most are the
 * phase's two seal refusals. This script breaks ONE CLAUSE AT A TIME in the
 * shipping source and proves it reddens THE RULE THAT OWNS IT. An ablation that
 * passes is a hole in the gate. An ablation that reddens only rules other than
 * its own is a finding about the gate rather than about the build, and it is
 * printed as one.
 *
 * ## Two lanes since the fix round
 *
 * A verifier counted this script's coverage and found 23 of the SPEC's 53 rules:
 * every rule about the PICKER (36 to 53) rested on the renderer suite with
 * nothing asserting that the suite could go red. So there is a second lane,
 * `SUITE_ABLATIONS`, judged by running the two renderer test files in the same
 * clone rather than by the gate — because `conformance:agents` starts no
 * renderer and the sheet is React. It still starts no Electron: the config's
 * own `ELECTRON_OVERRIDE_DIST_PATH` escape hatch is what makes that true, and
 * that file explains it at length.
 *
 * ## It never writes into the working tree
 *
 * The two ablation harnesses that came before this one (`ablation:p268`,
 * `ablation:p273`) edit the real files and restore them in a `finally`. This one
 * does not, and the reason is the shape of a phase workflow rather than a
 * preference: three builders own disjoint halves of one worktree AT THE SAME
 * TIME, and a harness that writes into `src/` — even for the two seconds it
 * takes to run a gate — can lose another builder's in-flight edit, and a crash
 * or a signal in that window leaves a broken tree behind with no owner.
 *
 * So it builds a CLONE instead: `cp -Rc` (APFS clonefile, about half a second
 * for the whole of `src/` and `build/`) under `/private/tmp/p275-ablation-<pid>`,
 * with `node_modules` symlinked, and runs the gate there with that directory as
 * its cwd. Nothing under the operator's home, nothing under the worktree, and
 * the scratch directory is removed in a `finally` and on a signal.
 *
 * ## It starts nothing
 *
 * No Electron, no tmux server, no agent, no token, no network. `conformance:agents`
 * itself spawns exactly one thing, its own TypeScript probe, and that probe is
 * pure — it reads the compiled tables, calls pure functions and prints JSON.
 *
 * ## The delta rule, and why it is not "the base must be green"
 *
 * The earlier harnesses require a green base before they start. This one RECORDS
 * the base's red rules and then requires each ablation to make its own rule
 * NEWLY red. That is strictly stronger — it proves the ablation caused the
 * reddening rather than inheriting it — and it is also what lets the harness run
 * during a phase, while a sibling builder's half has not landed yet. A red base
 * is still reported loudly and still fails the run unless `P275_ALLOW_RED_BASE=1`
 * says the operator knows why.
 *
 * Usage:
 *   node build/p275/ablation.mjs
 *   P275_ALLOW_RED_BASE=1 node build/p275/ablation.mjs   # mid-phase, base red
 */

import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[p275-ablation]';
const say = (line) => process.stdout.write(`${TAG} ${line}\n`);

// ---------------------------------------------------------------------------
// The ablations, one clause each, and each names the rule it must redden.
// ---------------------------------------------------------------------------
//
// `why` is what the clause is FOR, in one sentence, so a person reading a
// failure knows what the gate was protecting rather than only which line moved.

const ABLATIONS = [
  {
    rule: 'R7',
    name: 'the isDangerStateEmpty clause for the shared field removed',
    why:
      'getSettings short-circuits on isDangerStateEmpty and returns the file ' +
      'VERBATIM, without opening the seal. Forgetting one field there admits a ' +
      'settings.json whose only danger value is a shared name, unsealed, to every ' +
      'agent on the machine.',
    file: 'src/main/settings/store.ts',
    from: '    state.env.length === 0 &&\n    state.envShared.length === 0\n',
    to: '    state.env.length === 0\n'
  },
  {
    rule: 'R30',
    name: 'the shared seal field left unsorted',
    why:
      'the sealed state is one TEXT. Unsorted, two orders of the same two names ' +
      'seal differently and a person is asked to re-approve a reorder, which ' +
      'trains them to click through the sheet that matters.',
    file: 'src/main/settings/store.ts',
    from: '    envShared: envShared.sort()',
    to: '    envShared'
  },
  {
    rule: 'R2',
    name: "the display key written into the sealed field",
    why:
      'envSharedKey is display-only. A seal field holding it would be a key space ' +
      'with a parser behind it, and no seal key in this repository is ever split ' +
      'back into parts.',
    file: 'src/main/settings/store.ts',
    from: '  const envShared = [...settings.envPassthroughShared];',
    to: '  const envShared = settings.envPassthroughShared.map((n) => envSharedKey(n));'
  },
  {
    rule: 'R27',
    name: 'a per-agent seal allowed to cover a shared name (R-A opened)',
    why:
      'this is the widening the phase exists to make somebody ask for out loud: a ' +
      'name confirmed for one agent silently reaching every agent, including ones ' +
      'installed later.',
    file: 'src/main/settings/store.ts',
    from: '  const sealedShared = new Set(sealed.envShared);',
    to:
      '  const sealedShared = new Set([\n' +
      // `?? []` because R32's fixture hands this function a seal written before
      // the phase, with no `envShared` member at all. Spreading undefined
      // throws, and an ablation that throws reddens the section rather than the
      // rule it is aimed at.
      '    ...(sealed.envShared ?? []),\n' +
      '    ...sealed.env.map((k) => k.slice(k.indexOf(\' \') + 1))\n' +
      '  ]);'
  },
  {
    rule: 'R28',
    name: 'a shared seal allowed to cover one agent (R-B opened)',
    why:
      'the safer direction of the two, and it is refused anyway: an agreement that ' +
      'can be replayed in either direction is one agreement pretending to be two.',
    file: 'src/main/settings/store.ts',
    from: '      if (sealedEnv.has(envNameKey(id, name))) return true;',
    to: '      if (sealedEnv.has(envNameKey(id, name)) || sealedShared.has(name)) return true;'
  },
  {
    rule: 'R8',
    name: 'the shared seal emptied, so nothing is ever admitted',
    why:
      'R27 and R28 would both pass over a seal that admits nothing. This is the ' +
      'control that stops the two refusals being satisfied by a product that no ' +
      'longer works.',
    file: 'src/main/settings/store.ts',
    from: '  const sealedShared = new Set(sealed.envShared);',
    to: '  const sealedShared = new Set([]);'
  },
  {
    rule: 'R32',
    name: 'a seal with no shared member made to cover the whole list',
    why:
      'every person upgrading into this phase has exactly that seal, so this is ' +
      'the first read after the update on every machine rather than an edge case.',
    file: 'src/main/settings/store.ts',
    from: '  const sealedShared = new Set(sealed.envShared);',
    to: '  const sealedShared = new Set(sealed.envShared ?? settings.envPassthroughShared);'
  },
  {
    rule: 'R17',
    name: "the compiled launch.env union narrowed to one agent",
    why:
      'the shared list reaches cursor too, and a shared FORCE_COLOR would make the ' +
      'env-unresolved notice say a cursor pane started WITHOUT a variable that pane ' +
      'actually has.',
    file: 'src/main/settings/store.ts',
    from: '  for (const id of LAUNCHABLE_AGENT_IDS) {',
    to: "  for (const id of ['cursor']) {"
  },
  {
    rule: 'R17b',
    name: 'the catalog the picker reads narrowed to one agent',
    why:
      'the picker sheet has no registry, so its shared arm builds the refused set ' +
      'from the envKeys on the flag catalogs the renderer holds. Move that side ' +
      'alone and the picker offers a name the shared door then refuses on write: a ' +
      'person ticks it, reads the confirm, agrees, and finds the name gone. This ' +
      "ablation moves the RENDERER's side while sharedRefusedEnvKeys() stays put, " +
      "which is what proves R17b is not just R17's row said twice.",
    file: 'src/main/settings/ipc.ts',
    from: '      envKeys: [...compiledLaunchEnvKeys(agentId)]',
    to: "      envKeys: agentId === 'cursor' ? [...compiledLaunchEnvKeys(agentId)] : []"
  },
  {
    rule: 'R13',
    name: 'the shared list assigned straight off the parsed file',
    why:
      'the shape layer is what bounds a hand-edited settings.json before the seal ' +
      'is asked who wrote it. Skipping it lets an unbounded list reach the seal.',
    file: 'src/main/settings/store.ts',
    from: '  out.envPassthroughShared = sanitizeEnvPassthroughShared(',
    to:
      "  out.envPassthroughShared = (obj['envPassthroughShared'] ?? []);\n" +
      '  void sanitizeEnvPassthroughShared('
  },
  {
    rule: 'R35c',
    name: 'the agent id dropped out of the per-agent seal key',
    why:
      'the two key spaces stop being disjoint the moment a per-agent key can equal ' +
      'a bare shared name, and one confirmation becomes replayable as the other.',
    file: 'src/shared/settings.ts',
    from: '  return `${agentId} ${name}`;',
    to: '  return `${name}`;'
  },
  {
    rule: 'R35c',
    name: 'the name alphabet widened to admit a space',
    why:
      'belt two is textual: envNameKey joins with a space and the alphabet forbids ' +
      'one, so a per-agent key holds exactly one space and a bare name holds none.',
    file: 'src/shared/agent-overlay.ts',
    from: "export const OVERLAY_ENV_KEY_PATTERN = '^[A-Za-z_][A-Za-z0-9_]{0,63}$';",
    to: "export const OVERLAY_ENV_KEY_PATTERN = '^[A-Za-z_][A-Za-z0-9_ ]{0,63}$';"
  },
  {
    rule: 'R12',
    name: 'a name shipped on the shared list at install',
    why:
      'empty at install is what keeps envPassthroughFor answering undefined for a ' +
      'person who configured nothing, which is what keeps the login-shell probe — ' +
      'about a second — off the front of every session.',
    file: 'src/shared/settings.ts',
    from: '    envPassthroughShared: [],',
    to: "    envPassthroughShared: ['P275_ABLATION_NAME'],"
  },
  {
    rule: 'R14',
    name: 'the shared sanitizer made to repair a name',
    why:
      'a name is kept entirely or dropped entirely. A sanitizer that trims is a ' +
      'sanitizer that admits a name nobody typed.',
    file: 'src/shared/settings.ts',
    // The binding moves to `let` in the same edit: esbuild refuses an
    // assignment to a const at PARSE time, and a clone that does not parse
    // reddens everything rather than the one rule under attack.
    from: '  for (const entry of raw as unknown[]) {\n    if (typeof entry === \'string\') {',
    to:
      '  for (let entry of raw as unknown[]) {\n' +
      '    if (typeof entry === \'string\') {\n' +
      '      entry = entry.trim();'
  },
  {
    rule: 'R15',
    name: 'one bad entry made to deny the whole list',
    why:
      'that is a denial any agent with write access could author in one line, and ' +
      'it would take away every key a person set.',
    file: 'src/shared/settings.ts',
    from: '  return { names, refused, refusedOver, unnamed };\n}',
    to:
      '  if (refused.length + refusedOver + unnamed > 0) {\n' +
      '    return { names: [], refused, refusedOver, unnamed };\n' +
      '  }\n' +
      '  return { names, refused, refusedOver, unnamed };\n}'
  },
  {
    rule: 'R16',
    name: 'the key pattern dropped from the drawable check',
    why:
      'a refused entry is echoed by name into a log line and into the DOM. The ' +
      'pattern is what makes that provably safe — letters, digits and underscore ' +
      'and nothing else — and without it a refusal becomes a rendering primitive ' +
      'anybody with write access to settings.json can aim.',
    file: 'src/shared/settings.ts',
    from: '    new RegExp(OVERLAY_ENV_KEY_PATTERN).test(entry)\n  );',
    to: '    true\n  );'
  },
  {
    rule: 'R18',
    name: 'the shared door given the per-agent cap sentence',
    why:
      '"the most Tortie will read for one agent" is FALSE on a list read for every ' +
      'agent, and a sentence that is false at the door a person is standing at is ' +
      'worse than no sentence.',
    file: 'src/shared/agent-overlay.ts',
    from: "      ? 'Sixteen names is the most Tortie will read for every agent.'",
    to: "      ? 'Sixteen names is the most Tortie will read for one agent.'"
  },
  {
    rule: 'R23',
    name: 'the shared source moved to the front of the union',
    why:
      'the Phase 269 order must not move by one byte, or the argv order, the ' +
      'manifest row and the notice list change for people who never touched the ' +
      'new feature.',
    file: 'src/shared/launch-env.ts',
    from: '      ...(rowNames ?? []),\n      ...(settingsNames ?? []),\n      ...(sharedNames ?? [])',
    to: '      ...(sharedNames ?? []),\n      ...(rowNames ?? []),\n      ...(settingsNames ?? [])'
  },
  {
    rule: 'R24',
    name: 'one import put back into the union module',
    why:
      'Phase 270 moved this function to a leaf so the remote carriage could import ' +
      'it without closing a nineteen-module runtime cycle. One import puts that ' +
      'cycle back, and nothing else in the build would notice.',
    file: 'src/shared/launch-env.ts',
    from: 'export function envPassthroughFor(',
    to:
      "import type { LaunchableAgentId } from './types';\n" +
      'export type P275AblationUnused = LaunchableAgentId;\n' +
      'export function envPassthroughFor('
  },
  {
    rule: 'R25',
    name: 'the remote launch path made to carry two sources out of three',
    why:
      'it compiles, it satisfies the required third parameter, and it is a launch ' +
      'path on which a shared key silently does nothing — on remote only, which is ' +
      'the divergence the operator\'s "remote feels identical to local" rule names.',
    file: 'src/main/machines/remote-env-probe.ts',
    from: '      settingsNames,\n      sharedNames\n    ) ?? []',
    to: '      settingsNames,\n      undefined\n    ) ?? []'
  },
  {
    rule: 'R26',
    name: 'the remote restore stopped naming what the cap dropped',
    why:
      'the union can reach forty-eight names and the carriage caps it at sixteen ' +
      'before the far-side probe sees it, so without this the extra names vanish ' +
      'with nothing said, on remote only.',
    file: 'src/main/machines/remote-restore.ts',
    from: '  const envDropped = remoteEnvNamesDroppedFor(',
    to: '  const envDropped: string[] = [];\n  void ((...a: unknown[]) => a)('
  },
  {
    rule: 'R10',
    name: 'the shared list wired into the confirm hash',
    why:
      'a shared name cannot change what an agents.json row RUNS, so adding it there ' +
      'asks every configured row to be re-approved for a change that cannot affect ' +
      'it — which is how a person is trained to click through the sheet that matters.',
    file: 'src/main/config/overlay.ts',
    from: '    envPassthroughNames: entry.launch?.envPassthrough ?? [],',
    to:
      '    envPassthroughNames: entry.launch?.envPassthrough ?? [],\n' +
      '    // @ts-expect-error p275 ablation\n' +
      '    envPassthroughShared: [],'
  },
  {
    rule: 'R10',
    name: 'the settings store imported into the overlay loader',
    why:
      'the import is how the two mechanisms come to touch at all. `@shared/settings` ' +
      'is a description of a file shape and is fine; `../settings/store` is the ' +
      'SEALED read, and a config module reaching for it is one line away from a ' +
      'shared name inside the confirm hash.',
    file: 'src/main/config/overlay.ts',
    from: "import type { ConfigExecutionFields } from './confirm';",
    to:
      "import { getSettings } from '../settings/store';\n" +
      'export const p275AblationUnused = getSettings;\n' +
      "import type { ConfigExecutionFields } from './confirm';"
  },
  {
    rule: 'R33',
    name: 'the launchable id table emptied',
    why:
      'every per-id assertion in section 9 loops over that table, and a loop over ' +
      'an empty list passes without checking anything.',
    file: 'src/main/agents/registry.ts',
    from: 'export const LAUNCHABLE_AGENT_IDS: readonly LaunchableAgentId[] = AGENT_REGISTRY.filter(\n  (e) => e.launchable\n).map((e) => e.id as LaunchableAgentId);',
    to: 'export const LAUNCHABLE_AGENT_IDS: readonly LaunchableAgentId[] = [];'
  },
  {
    rule: 'R16b',
    name: 'the echo cap on the shape layer removed',
    why:
      'a rendering primitive is a SIZE as well as a character set. This list runs ' +
      'over the RAW settings file, so its length is chosen by whoever wrote that ' +
      'file, and the window joins the whole of it into ONE paragraph. Measured at ' +
      'the parent of this fix: 200,000 hand-written names became 12,088,932 bytes.',
    file: 'src/shared/settings.ts',
    from:
      '    if (!isDrawableEnvName(entry)) unnamed += 1;\n' +
      '    else if (refused.length < OVERLAY_LIMITS.maxEnvPassthroughNames) refused.push(entry);\n' +
      '    else refusedOver += 1;\n',
    to:
      '    if (!isDrawableEnvName(entry)) unnamed += 1;\n' +
      '    else refused.push(entry);\n'
  },
  {
    rule: 'R20b',
    name: 'the two rejection layers concatenated again',
    why:
      '"Ignored, because they were not added here" is a DIRECTION. Merged, it is ' +
      'given to shape-layer drops too — a dead end for PATH, and for a name the cap ' +
      'pushed out it is simply untrue about the one name the person came to the ' +
      'window about. Both verifiers found this, one in a harness and one in the ' +
      'running window.',
    file: 'src/main/settings/store.ts',
    from:
      '  answer.shared = [...(seal?.shared ?? [])];\n' +
      '  answer.sharedUnread = [...shapeEnvRejections.shared];\n',
    to:
      '  answer.shared = [...shapeEnvRejections.shared, ...(seal?.shared ?? [])];\n' +
      '  answer.sharedUnread = [];\n'
  },
  {
    rule: 'R34',
    name: 'the wrong deadline written back into the comment',
    why:
      'a comment that names a wrong number is worse than no comment: the next ' +
      'person budgets for it.',
    file: 'src/main/sessions/create-local.ts',
    from: '  // shell. One probe, group killed on the `PATH_CAPTURE_TIMEOUT_MS` deadline',
    to: '  // shell. One probe, group killed on the 3 second deadline'
  }
];

/**
 * THE PICKER HALF, and it is THE FIX ROUND'S addition (rules 36 to 53).
 *
 * A verifier counted the coverage and the answer was 23 of the SPEC's 53 rules.
 * Everything about the SHEET — the cage row, the locked rows, the aria, the
 * keyboard map, the cap while ticking — rested on the renderer suite alone, and
 * this repository's own standard is that a green gate is only evidence if it can
 * go red. Nothing asserted that those suites could.
 *
 * They are judged by the SUITE rather than by `conformance:agents`, because the
 * picker is React and that gate starts no renderer. The suite runs in the same
 * clone, over the same `vitest.config.ts`, with `node_modules` symlinked — so
 * still no Electron, no tmux, no network and nothing under a home directory.
 *
 * FOUR AND NOT EIGHTEEN, chosen for the four different KINDS of thing the sheet
 * promises rather than for coverage: a row that must exist (the cage), a row
 * that must be shown rather than hidden (already on the list), a state that must
 * be said while ticking (the cap), and the element the whole keyboard model
 * rests on (`role="option"`). A rule whose ablation reddens no test is a rule
 * the suite does not hold, and that is what this lane is for.
 */
const SUITE_FILES = [
  'src/renderer/settings/__tests__/p275-env-shared.test.tsx',
  'src/renderer/settings/__tests__/p269-env-names.test.tsx'
];

const SUITE_ABLATIONS = [
  {
    rule: 'R37',
    name: 'the typed row never drawn, so the list becomes a cage',
    why:
      'the datalist this phase replaced was "a suggestion list and never a cage" ' +
      'and its comment argued that property honestly. It is the Phase 174.1 ruling: ' +
      'a name the shell does not export YET is still typed and accepted. A picker ' +
      'that only offers what the shell answered takes it away.',
    file: 'src/renderer/settings/EnvPickerSheet.tsx',
    from: '      ? rowFor(decision.name, true)\n      : null;',
    to: '      ? null\n      : null;'
  },
  {
    rule: 'R38',
    name: 'a name already on the list drawn unticked and choosable',
    why:
      'a row that cannot be chosen is SHOWN with its reason rather than hidden — ' +
      'the rule EnableForDialog already keeps. Hiding it makes a person hunt for a ' +
      'name that is simply already theirs.',
    file: 'src/renderer/settings/EnvPickerSheet.tsx',
    from: '    const locked = existing.has(name) || inherited.has(name);',
    to: '    const locked = false;'
  },
  {
    rule: 'R41',
    name: 'the rows made list items instead of options',
    why:
      'the whole keyboard model rests on this element. `role="option"` inside a ' +
      '`listbox` is what `aria-activedescendant` can point at while the field keeps ' +
      'focus; a `listitem` is not, and a screen reader stops being told which row ' +
      'the arrow keys are on.',
    file: 'src/renderer/settings/EnvPickerSheet.tsx',
    from: '                  role="option"',
    to: '                  role="listitem"'
  },
  {
    rule: 'R43',
    name: 'the cap not said while ticking',
    why:
      'sixteen is said at the moment a person is choosing, on the rows they cannot ' +
      'choose, and not at the confirm — a refusal after the decision is a refusal ' +
      'that wasted the decision.',
    file: 'src/renderer/settings/EnvPickerSheet.tsx',
    from: 'capped: !ticked && left === 0',
    to: 'capped: false'
  }
];

// ---------------------------------------------------------------------------
// The clone, and the gate run inside it.
// ---------------------------------------------------------------------------

/** The scratch root, under /private/tmp and never under a home directory. */
const scratch = mkdtempSync(join(tmpdir(), 'p275-ablation-'));

/** Everything the gate needs, cloned; node_modules is a symlink, never a copy. */
function buildClone() {
  const copy = (name) => {
    const r = spawnSync('cp', ['-Rc', join(REPO, name), join(scratch, name)], {
      encoding: 'utf8'
    });
    if (r.status !== 0) throw new Error(`cp -Rc ${name} failed: ${r.stderr}`);
  };
  copy('src');
  copy('build');
  // `vitest.config.ts` and `tsconfig.json` come with it because the picker lane
  // runs the renderer suite in here too. The config resolves `@shared` and the
  // electron stub against its own `__dirname`, which is this clone, so the suite
  // reads the ABLATED sources and never the repository's.
  //
  // EVERY tsconfig, not just the two the gate needs. vite's esbuild plugin
  // resolves the project references out of `tsconfig.json`, so a clone holding
  // only the root one dies with a TSConfckParseError on `tsconfig.shared.json`
  // and every suite in the lane reads as red for a reason no ablation caused.
  // That cost one debugging round; the glob is cheap and cannot miss a new one.
  for (const name of [
    'package.json',
    'vitest.config.ts',
    ...readdirSync(REPO).filter((f) => /^tsconfig(\.[a-z]+)?\.json$/.test(f))
  ]) {
    writeFileSync(join(scratch, name), readFileSync(join(REPO, name)));
  }
  symlinkSync(join(REPO, 'node_modules'), join(scratch, 'node_modules'));
}

/**
 * Run the two picker suites in the clone. Answers the exit code and the names
 * of the test files that failed.
 *
 * No Electron: `vitest.config.ts` points `ELECTRON_OVERRIDE_DIST_PATH` at a
 * path and electron's own index returns it without downloading or launching
 * anything, which is the escape hatch that file documents at length.
 */
function runSuite() {
  const r = spawnSync(
    process.execPath,
    [join(REPO, 'node_modules/vitest/vitest.mjs'), 'run', ...SUITE_FILES],
    {
      cwd: scratch,
      encoding: 'utf8',
      env: { ...process.env, CI: '1' },
      maxBuffer: 64 * 1024 * 1024
    }
  );
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const failed = [
    ...new Set([...text.matchAll(/FAIL\s+(\S+\.test\.tsx?)/g)].map((m) => m[1]))
  ];
  const counts = /Tests\s+(\d+) failed \| (\d+) passed/.exec(text);
  return {
    code: r.status ?? 1,
    failed,
    failedCount: counts === null ? null : Number(counts[1]),
    text
  };
}

/** Run `conformance:agents` in the clone. Answers its exit code and red rules. */
function runGate() {
  const r = spawnSync(process.execPath, [join(scratch, 'build/conformance-agents.mjs')], {
    cwd: scratch,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const red = [...new Set([...text.matchAll(/\[p275 (R[0-9a-z]+)\]/g)].map((m) => m[1]))];
  return { code: r.status ?? 1, red, text };
}

/** Put one file in the clone back the way the repository has it. */
function restore(rel) {
  writeFileSync(join(scratch, rel), readFileSync(join(REPO, rel)));
}

/**
 * Apply one exact replacement inside the clone, refusing if it is not there.
 *
 * THE REPLACEMENT IS A FUNCTION rather than a string, and that is not style.
 * `String.prototype.replace` reads `$&`, `$'`, `` $` `` and `$1` INSIDE the
 * replacement text, so an ablation whose new text ends `{0,63}$';` — a regex
 * source with a quote after it, which is exactly the shape of the name alphabet
 * this phase attacks — silently loses its closing quote and the gate dies with
 * an esbuild "Unterminated string literal" instead of the failure it was
 * supposed to produce. That cost one debugging round; a function replacer takes
 * the text literally and cannot.
 */
function ablate(rel, from, to) {
  const path = join(scratch, rel);
  const text = readFileSync(path, 'utf8');
  if (!text.includes(from)) return false;
  writeFileSync(path, text.replace(from, () => to), 'utf8');
  return true;
}

// A killed run must leave nothing behind either.
let cleaned = false;
const clean = () => {
  if (cleaned) return;
  cleaned = true;
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* the scratch directory is under /private/tmp; a failure here is not fatal */
  }
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    clean();
    process.exit(130);
  });
}

const problems = [];
let ran = 0;

try {
  buildClone();
  say(`clone at ${scratch}, node_modules symlinked, nothing under a home touched`);

  const base = runGate();
  const baseRed = new Set(base.red);
  if (base.code === 0) {
    say('base: the gate is green, 0 of the section 9 rules red');
  } else {
    say(
      `base: THE GATE IS ALREADY RED — ${
        baseRed.size === 0
          ? 'and not on a section 9 rule, so something else in conformance:agents is failing'
          : `section 9 rules red: ${[...baseRed].join(', ')}`
      }`
    );
    for (const line of base.text.split('\n').filter((l) => l.includes('  - '))) {
      say(`  base failure: ${line.trim().slice(0, 200)}`);
    }
    if (process.env['P275_ALLOW_RED_BASE'] !== '1') {
      problems.push(
        'the gate was red before any ablation ran. Every reading below is still a ' +
          'DELTA against that base and is still meaningful, but a red base means a ' +
          'rule is failing for a reason this script did not cause. Re-run with ' +
          'P275_ALLOW_RED_BASE=1 once you know why.'
      );
    }
  }

  // `P275_ONLY=R16,R26` runs a subset, which is what you want while repairing
  // one entry. It never changes what a full run asserts.
  const only = (process.env['P275_ONLY'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const edit of ABLATIONS) {
    if (
      only.length > 0 &&
      !only.includes(edit.rule) &&
      !only.includes(String(ABLATIONS.indexOf(edit)))
    ) {
      continue;
    }
    const applied = ablate(edit.file, edit.from, edit.to);
    if (!applied) {
      problems.push(
        `${edit.rule} "${edit.name}": the shape to ablate is not in ${edit.file}. ` +
          'Either the clause moved, in which case this entry is updated in the same ' +
          'commit, or it is gone, in which case the rule it proves is unproven.'
      );
      restore(edit.file);
      continue;
    }
    ran += 1;
    const runOut = runGate();
    const { code, red } = runOut;
    const newlyRed = red.filter((r) => !baseRed.has(r));
    const ownRed = newlyRed.includes(edit.rule);
    say(
      `${edit.rule} ${edit.name}: exit ${String(code)}, newly red ${
        newlyRed.join(', ') || 'nothing'
      }`
    );
    if (code === 0) {
      problems.push(
        `${edit.rule} "${edit.name}": the gate stayed GREEN. ${edit.why} Nothing in ` +
          'this gate notices, so that rule is decoration.'
      );
    } else if (!ownRed) {
      // A gate that CRASHED prints no failure line at all, so fall back to the
      // tail of whatever it did print. That distinction is the difference
      // between "the rule is decoration" and "the ablation does not compile".
      const named = runOut.text
        .split('\n')
        .filter((l) => l.trim().startsWith('- '))
        .slice(0, 6)
        .map((l) => l.trim().slice(0, 240));
      const failures =
        named.length > 0
          ? named
          : runOut.text
              .split('\n')
              .filter((l) => l.trim().length > 0)
              .slice(-6)
              .map((l) => l.trim().slice(0, 240));
      problems.push(
        `${edit.rule} "${edit.name}": the gate went red but ${edit.rule} did not. ` +
          `Red instead: ${newlyRed.join(', ') || 'nothing in section 9'}. A rule that ` +
          'is only caught by its neighbours is not asserted by the rule that claims ' +
          `it. What the gate said: ${failures.join(' // ') || '(no failure line)'}`
      );
    }
    restore(edit.file);
  }

  // -------------------------------------------------------------------------
  // The picker lane. Same clone, same `finally`, the renderer suite instead of
  // the gate — because `conformance:agents` starts no renderer and the sheet is
  // React. See SUITE_ABLATIONS above for why these four and not eighteen.
  // -------------------------------------------------------------------------
  if (only.length === 0 || only.some((o) => o.startsWith('R3') || o.startsWith('R4'))) {
    const suiteBase = runSuite();
    if (suiteBase.code === 0) {
      say(
        `picker base: the suite is green (${SUITE_FILES.length} files, ` +
          `${String(suiteBase.failedCount ?? 0)} failed)`
      );
    } else {
      say('picker base: THE SUITE IS ALREADY RED before any ablation');
      if (process.env['P275_ALLOW_RED_BASE'] !== '1') {
        problems.push(
          'the renderer suite was red before any picker ablation ran, so every ' +
            'reading in that lane is about something this script did not cause. ' +
            `It failed: ${suiteBase.failed.join(', ') || '(no file named)'}`
        );
      }
    }
    for (const edit of SUITE_ABLATIONS) {
      if (only.length > 0 && !only.includes(edit.rule)) continue;
      const applied = ablate(edit.file, edit.from, edit.to);
      if (!applied) {
        problems.push(
          `${edit.rule} "${edit.name}": the shape to ablate is not in ${edit.file}. ` +
            'Either the clause moved, in which case this entry is updated in the ' +
            'same commit, or it is gone, in which case the rule it proves is ' +
            'unproven.'
        );
        restore(edit.file);
        continue;
      }
      ran += 1;
      const out = runSuite();
      say(
        `${edit.rule} ${edit.name}: exit ${String(out.code)}, ` +
          `${String(out.failedCount ?? '?')} test(s) failed in ` +
          `${out.failed.join(', ') || 'nothing'}`
      );
      if (out.code === 0) {
        problems.push(
          `${edit.rule} "${edit.name}": the suite stayed GREEN. ${edit.why} Nothing ` +
            'in the renderer suite notices, so that rule is decoration.'
        );
      }
      restore(edit.file);
    }
    const suiteAfter = runSuite();
    if (suiteAfter.code !== suiteBase.code) {
      problems.push(
        `after every picker file was restored the suite exited ` +
          `${String(suiteAfter.code)} where the base exited ` +
          `${String(suiteBase.code)}, so a restore did not land.`
      );
    } else {
      say(`picker restored: the suite is back where it started (exit ${String(suiteAfter.code)})`);
    }
  }

  const after = runGate();
  if (after.code !== base.code) {
    problems.push(
      `after every file was restored the gate exited ${String(after.code)} where the ` +
        `base exited ${String(base.code)}, so a restore did not land.`
    );
  } else {
    say(`restored: the gate is back where it started (exit ${String(after.code)})`);
  }
} catch (err) {
  problems.push(`the harness threw: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  clean();
}

process.stdout.write('\n');
if (problems.length > 0) {
  process.stdout.write(`${TAG} FAIL, ${problems.length}:\n`);
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  process.exit(1);
}
process.stdout.write(
  `${TAG} PASS. ${ran} ablations, one clause each, and every one reddened the ` +
    'rule that owns it — the section 9 rule for the seal, the shape and the union, ' +
    'and a named renderer test for each picker rule. No Electron, no tmux server, ' +
    'no agent, no token, and nothing written outside the scratch clone, which is ' +
    'gone.\n'
);
