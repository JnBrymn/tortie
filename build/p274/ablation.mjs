#!/usr/bin/env node
/**
 * `npm run ablation:p274`. THE ATTACK ON THE GATE (Phase 274, SPEC.md rule 25).
 *
 * About 2 s. It launches no Electron, starts no tmux server, spawns no agent,
 * mounts nothing and makes no request. It starts no process but `node`.
 *
 * ## Why a second script
 *
 * `conformance:samefolder` already ships nine ablations OF ITS OWN, and those
 * are all of `src/main/fs/folder-identity.ts`: the gate copies that one module
 * beside `src/main/fs`, breaks one clause of the copy, and drives the same
 * fixture table against it. That works because the module is loaded by path.
 *
 * The gate's OTHER rules — the identity door in `addProject`, the SQL that must
 * not change, the duplicate log, the answer spelling in `file-ops.ts`, the
 * overview reader, the workspace-target pin and the no-case-folding refusal —
 * are read out of the shipping source at its real path. There is no copy to
 * break. So this script breaks the REAL file, runs the gate, reads which rule
 * went red, and PUTS THE FILE BACK IN A `finally`, byte for byte, checked by
 * sha256 after every single ablation and again at the end.
 *
 * It is the same shape `build/p273/ablation-vocabulary.mjs` and
 * `build/p268/ablation.mjs` use, and for the same reason: a rule that cannot be
 * made to fail proves nothing, and a gate whose rules have never been shown to
 * fail is a gate that can quietly stop asking.
 *
 * ## The safety, stated because this script edits the working tree
 *
 *   - Every file's original bytes are read ONCE, before anything is written,
 *     and held in memory. The `finally` writes all of them back whatever
 *     happened, including on an uncaught throw and on SIGINT.
 *   - After every ablation the file is restored and its sha256 compared with
 *     the original. A mismatch stops the run immediately rather than carrying
 *     on over a tree it has already damaged.
 *   - It asks git nothing and compares against nothing but the bytes it read
 *     at the start. A phase build's tree is dirty by definition, so "restore to
 *     what git has" would be the wrong target; the right one is "restore to what
 *     was here when this started", and that is what the map holds.
 *   - It runs the gate in `P274_SOURCE_ONLY=1` mode, which reads the source and
 *     touches no disk, mounts no image and drives no probe. Thirteen full runs
 *     would be fifty seconds of mounting and unmounting to read a line of text.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[ablation:p274]';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const say = (l) => console.log(`${TAG} ${l}`);
const problems = [];
const sha = (text) => createHash('sha256').update(text).digest('hex');

/**
 * ONE ABLATION PER RULE THE GATE READS OUT OF THE SHIPPING SOURCE.
 *
 * `rule` is the number the gate stamps on its findings, and it is the number
 * that MUST appear on stderr when this edit is in place. A run that goes red on
 * some OTHER rule is a finding about the ablation rather than about the gate,
 * and is reported as one — an ablation that moves a different rule than the one
 * it is for has proved something else.
 *
 * RULE 11 IS WHY THIS FILE EXISTS. Its first version asked whether a file NAMED
 * `canonicalPathSync` anywhere, and the rule-11 ablation below walked straight
 * through it: replacing the import with a local `const canonicalPathSync = (p)
 * => p` left the name in the file and the gate green while the site
 * canonicalised nothing at all. The rule now asks about the IMPORT. That hole
 * was found by running this script, which is the whole argument for it.
 */
const ABLATIONS = [
  {
    rule: 1,
    name: 'the identity lookup never asks the filesystem, so the second spelling mints a second row',
    file: 'src/main/sessions/core.ts',
    find: "if (sameFolder(row.path, abs) === 'same') return row;",
    to: "if (row.path === abs) return row;"
  },
  {
    rule: 2,
    name: 'the walk asks the disk BEFORE the byte-exact SELECT, so every common add pays for it',
    file: 'src/main/sessions/core.ts',
    // REORDERED rather than removed. Removing the SELECT reddens rule 1, which
    // asks whether it is there at all; rule 2 is about the ORDER, and only a
    // tree that still has both halves can be red on the order alone.
    find:
      '  const exact = manifest.getProjectByPath(abs);\n' +
      '  if (exact !== undefined) return exact;\n' +
      '  for (const row of manifest.listProjects()) {\n' +
      '    if (!isLocalTarget(targetOfProject(row))) continue;\n' +
      "    if (sameFolder(row.path, abs) === 'same') return row;\n" +
      '  }',
    to:
      '  for (const row of manifest.listProjects()) {\n' +
      '    if (!isLocalTarget(targetOfProject(row))) continue;\n' +
      "    if (sameFolder(row.path, abs) === 'same') return row;\n" +
      '  }\n' +
      '  const exact = manifest.getProjectByPath(abs);\n' +
      '  if (exact !== undefined) return exact;'
  },
  {
    rule: 3,
    name: "the found path clears the tombstone for the spelling that was TYPED",
    file: 'src/main/sessions/core.ts',
    find: 'this.manifest.clearProjectTabClosed({ path: existing.path });',
    to: 'this.manifest.clearProjectTabClosed({ path: abs });'
  },
  {
    rule: 4,
    name: 'the ON CONFLICT clause is rewritten, so the SQL starts having an opinion about folders',
    file: 'src/main/manifest/projects-repository.ts',
    find: 'ON CONFLICT(path) DO UPDATE SET name = excluded.name',
    to: 'ON CONFLICT(path) DO UPDATE SET name = excluded.name, id = excluded.id'
  },
  {
    rule: 6,
    name: 'the walk stops asking whether a row is local, so a far path is stat-ed on THIS Mac',
    file: 'src/main/sessions/core.ts',
    find: '    if (!isLocalTarget(targetOfProject(row))) continue;\n',
    to: ''
  },
  {
    rule: 8,
    name: "the duplicate line stops naming the volume's answer, so the claim is unfalsifiable",
    file: 'src/main/sessions/core.ts',
    find: '`(volume case: ${volumeFoldsCase(folder)}): ${group.join(\' | \')}`',
    to: '`: ${group.join(\' | \')}`'
  },
  {
    rule: 10,
    name: 'the identity module gains the ability to write',
    file: 'src/main/fs/folder-identity.ts',
    // FIX ROUND: the import line gained `stat`, the callback read the async
    // duplicate walk needs, so this ablation's `find` moved with it.
    find: "import { realpathSync, stat, statSync } from 'node:fs';",
    to: "import { mkdirSync, realpathSync, stat, statSync } from 'node:fs';"
  },
  {
    rule: 11,
    name: 'one of the canonicalisation sites stops going through the one door',
    file: 'src/main/shell/arrival.ts',
    // The IMPORT is what goes, not one call. arrival.ts canonicalises twice —
    // the arriving path and the home it is compared against — and editing one
    // of them would leave the other naming the door, which is a file that still
    // reads as compliant while half of it is not.
    find: "import { canonicalPathSync } from '../fs/folder-identity';",
    to: "const canonicalPathSync = (p: string): string => p;"
  },
  {
    rule: 13,
    name: 'entry() answers the resolved spelling again, which is the parent commit',
    file: 'src/main/fs/file-ops.ts',
    find: 'path: underCallerRoot(root, abs),',
    to: 'path: abs,'
  },
  {
    // THE INTEGRATOR ADDED THIS ONE, and it is the reason rule 18 was rewritten.
    // Its first assertion read the whole file for a variable NAMED `abs` beside
    // `relPath`, and the defect never used one: the parent's own miss arm is the
    // parameter `path`, spelled `path`. Measured against `git show
    // 30f4bd8d:src/renderer/context/open-detail.ts`, that regex answered false,
    // so rule 18 was GREEN AT THE PARENT. This edit restores the parent's exact
    // expression, and rule 18 has to go red on it or it is asserting nothing.
    rule: 18,
    name: "relPath falls back to the ABSOLUTE path again, which is the parent commit byte for byte",
    file: 'src/renderer/context/open-detail.ts',
    find: "    relPath: 'relPath' in under ? under.relPath : '',",
    to: '    relPath: path.startsWith(`${repoPath}/`)\n      ? path.slice(repoPath.length + 1)\n      : path,'
  },
  {
    rule: 19,
    name: 'workspace-target.ts gains a line of code, which rule 19 says it may not',
    file: 'src/shared/workspace-target.ts',
    find: 'export function sameTarget(',
    to: 'export const P274_ABLATION = 1;\nexport function sameTarget('
  },
  {
    rule: 23,
    name: "a path comparison is case-folded - the reporter's own recorded wrong fix",
    file: 'src/main/manifest/harvest/watch.ts',
    find: 'export function resolveClaimCwd(cwd: string): string {',
    to: 'export function resolveClaimCwd(cwd: string): string {\n  if (cwd.toLowerCase() === cwd) return cwd;'
  },
  {
    rule: 23,
    name: 'a path is Unicode-normalised, which re-creates the mismatch realpath just removed',
    file: 'src/main/manifest/harvest/watch.ts',
    find: 'export function resolveClaimCwd(cwd: string): string {',
    to: "export function resolveClaimCwd(cwd: string): string {\n  cwd = cwd.normalize('NFC');"
  }
];

const targets = [...new Set(ABLATIONS.map((a) => a.file))];
const originals = new Map();
for (const rel of targets) {
  const full = join(repoRoot, rel);
  let text;
  try {
    text = readFileSync(full, 'utf8');
  } catch (err) {
    console.error(`${TAG} ${rel} could not be read: ${String(err)}`);
    process.exit(2);
  }
  originals.set(rel, text);
}

/** Run the gate in its source-only mode and answer the rule numbers it failed on. */
function gateFindings() {
  const run = spawnSync(process.execPath, ['build/p274/conformance-samefolder.mjs'], {
    encoding: 'utf8',
    cwd: repoRoot,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, P274_SOURCE_ONLY: '1' }
  });
  const text = `${run.stdout}${run.stderr}`;
  const rules = new Set();
  for (const line of text.split('\n')) {
    // A FINDING is a line on stderr; the gate writes its passes to stdout. The
    // rule number is the first token after the tag.
    const m = /^\[conformance:samefolder\] (\d+)[./]/.exec(line.trim());
    if (m !== null && run.stderr.includes(line.trim())) rules.add(Number(m[1]));
  }
  return { green: run.status === 0, rules: [...rules].sort((a, b) => a - b), text };
}

function restore() {
  for (const [rel, text] of originals) writeFileSync(join(repoRoot, rel), text);
}

let red = 0;
try {
  // THE CONTROL. The gate must be GREEN before anything is broken, or every
  // reading below is about a tree that was already failing.
  const control = gateFindings();
  if (!control.green) {
    problems.push(
      `the gate is RED before any ablation (rules ${control.rules.join(', ') || 'none named'}), so nothing below means anything`
    );
    say(control.text.split('\n').filter((l) => l.includes('FAILED') || /\] \d+[./]/.test(l)).slice(0, 8).join('\n'));
  } else {
    say('control: the gate is green on the unmodified tree');
    for (const ablation of ABLATIONS) {
      const full = join(repoRoot, ablation.file);
      const before = originals.get(ablation.file);
      if (!before.includes(ablation.find)) {
        problems.push(
          `rule ${String(ablation.rule)} "${ablation.name}": nothing to edit in ${ablation.file}. ` +
            'An ablation that cannot be applied proves nothing, and a clause that moved needs its ablation moved with it.'
        );
        continue;
      }
      writeFileSync(full, before.replace(ablation.find, ablation.to));
      const got = gateFindings();
      restore();
      const back = sha(readFileSync(full, 'utf8'));
      if (back !== sha(before)) {
        problems.push(`${ablation.file} did NOT come back byte for byte after "${ablation.name}"; stopping`);
        break;
      }
      if (got.green) {
        problems.push(
          `rule ${String(ablation.rule)} "${ablation.name}": the gate stayed GREEN. ` +
            'A rule that cannot be made to fail is a rule that has stopped asking.'
        );
        continue;
      }
      if (!got.rules.includes(ablation.rule)) {
        problems.push(
          `rule ${String(ablation.rule)} "${ablation.name}": the gate went red on rule(s) ` +
            `${got.rules.join(', ') || '(unnumbered)'} rather than on ${String(ablation.rule)}. ` +
            'An ablation that moves some other rule than the one it is for proves something else.'
        );
        continue;
      }
      red += 1;
      say(`ok   rule ${String(ablation.rule).padStart(2)}  ${ablation.name}`);
    }
  }
} finally {
  restore();
  const wrong = [...originals].filter(([rel, text]) => sha(readFileSync(join(repoRoot, rel), 'utf8')) !== sha(text));
  if (wrong.length > 0) {
    process.stderr.write(`${TAG} THESE FILES DID NOT COME BACK: ${wrong.map(([r]) => r).join(', ')}\n`);
    process.exitCode = 2;
  } else {
    say(`every one of the ${String(targets.length)} files came back byte for byte, checked by sha256`);
  }
}

if (problems.length > 0) {
  for (const p of problems) process.stderr.write(`${TAG} ${p}\n`);
  process.stderr.write(`${TAG} FAILED: ${String(problems.length)} finding(s).\n`);
  process.exit(1);
}
say(`OK: ${String(red)} of ${String(ABLATIONS.length)} ablations reddened the rule that owns them, one clause each.`);
process.exit(0);
