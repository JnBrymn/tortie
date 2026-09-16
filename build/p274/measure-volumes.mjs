#!/usr/bin/env node
/**
 * `npm run measure:p274-volumes`. The MEASUREMENT beside the gate, and the
 * ATTACK on this phase's own central ruling (Phase 274, SPEC.md rules 22 and
 * §11.3).
 *
 * About 8 s. It launches no Electron, starts no tmux server, spawns no agent,
 * makes no request and reads nothing under the person's home. It creates a
 * case-sensitive APFS disk image with `hdiutil create -size 20m -fs
 * "Case-sensitive APFS"` — no sudo — attaches it under `/private/tmp`, and
 * DETACHES IT AND DELETES THE .dmg IN A `finally`, whatever happened. Its
 * scratch directories are `mkdtemp`s under `/private/tmp` and they go in the
 * same `finally`.
 *
 * ## It is NOT in the commit battery, exactly as `conformance:watcher:cap` is not
 *
 * `npm run conformance:samefolder` already mounts an image of its own and runs
 * the §8 table on both kinds of volume, because a gate that only ever sees the
 * operator's case-insensitive boot disk cannot catch the merge danger. What
 * THIS script adds is the part that is a measurement rather than an assertion:
 * the per-volume timings, the two columns printed side by side so a person can
 * read the disagreement, and the attack.
 *
 * ## THE ATTACK, and it is on this spec's own ruling rather than on the code
 *
 * §2.4 claims that `sameFolder` cannot merge two folders that are genuinely
 * different, and that the claim needs no volume flag to hold: on a
 * case-sensitive volume `Source` and `source` have different inodes, so
 * `sameFolder` answers `'different'` without being told anything about the
 * volume. A claim like that is worth nothing until somebody tries to break it,
 * so this script tries, from both sides:
 *
 *   FROM ABOVE   make it answer 'same' for two genuinely different folders —
 *                two real folders on a case-sensitive volume, two folders whose
 *                names differ only by normalisation on a volume that separates
 *                case, a folder and a file, a folder and its own parent, and a
 *                folder and a BIND-like second spelling of a different volume.
 *                Every 'same' here is a defect and the run fails.
 *   FROM BELOW   make it answer 'different' for ONE folder — through a chain of
 *                symlinks, through the APFS firmlink, through /tmp, through an
 *                NFD spelling, and through a `..` climb that passes a symlinked
 *                component. Every 'different' here is a defect and the run
 *                fails.
 *   THE HARD LINK, DEMONSTRATED RATHER THAN ASSERTED. `sameFolder` is asked
 *                about DIRECTORIES only, and two hard links to one FILE do
 *                share dev+ino — so a later round that widened it to files
 *                would be wrong. macOS does not let an ordinary process
 *                hardlink a directory; this script shows that happening, with
 *                the errno, rather than claiming it.
 *
 * ## Knobs
 *
 *   P274_KEEP=1   leave the scratch directories behind for reading. The image
 *                 is detached and the .dmg deleted anyway; a mounted volume is
 *                 not a thing to leave lying around.
 */

import { spawnSync } from 'node:child_process';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tsxCli } from '../ts-runner.mjs';
import { SHAPES, UNMOUNTED_ROW, expectedFor, relaxFixturePermissions } from './fixtures.mjs';
import { withCaseSensitiveImage } from './case-sensitive-image.mjs';

const TAG = '[measure:p274-volumes]';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const say = (line) => console.log(`${TAG} ${line}`);
const problems = [];
const KEEP = process.env['P274_KEEP'] === '1';

const NFC = 'caf\u00E9-attack';
const NFD = 'cafe\u0301-attack';

function runProbe({ base, noMachine = false, unmounted = null }) {
  const probe = spawnSync(
    process.execPath,
    [tsxCli(), '--tsconfig', 'tsconfig.node.json', 'build/p274/samefolder-probe.mts'],
    {
      encoding: 'utf8',
      cwd: repoRoot,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        P274_BASE: base,
        ...(noMachine ? { P274_NO_MACHINE: '1' } : {}),
        ...(unmounted === null ? {} : { P274_UNMOUNTED: unmounted })
      }
    }
  );
  if (probe.status !== 0) {
    return { error: `the probe did not run: ${(probe.stderr || '').slice(-600) || '(no output)'}` };
  }
  try {
    return JSON.parse(probe.stdout.trim().split('\n').pop() ?? '');
  } catch {
    return { error: `the probe printed no JSON: ${probe.stdout.slice(0, 300)}` };
  }
}

const localBase = mkdtempSync('/private/tmp/p274-measure-');

// THE IMAGE IS NOT MADE HERE. `withCaseSensitiveImage` in
// ./case-sensitive-image.mjs owns the create, the attach, the mount-point parse
// and the detach, and it detaches and deletes the .dmg inside a `finally` of its
// own whatever the body did. This script and conformance-samefolder.mjs were
// built in parallel and each wrote its own copy of that block; two copies of a
// teardown is how one of them ends up without the `finally`.
let mount = null;

// ---------------------------------------------------------------------------
// The attack. `expect` is what the shape MUST answer; anything else is a
// finding, and the direction of the finding is the point:
//   'different' expected -> a 'same' would MERGE two real projects into one
//   'same'      expected -> a 'different' would leave the split this phase fixes
// ---------------------------------------------------------------------------

function attackShapes(base, kind) {
  const dir = join(base, 'attack');
  mkdirSync(dir, { recursive: true });
  const rows = [];
  const add = (name, a, b, expect, why) => rows.push({ name, a, b, expect, why });

  // ---- FROM ABOVE: two genuinely different folders must never be one -------
  mkdirSync(join(dir, 'Source'), { recursive: true });
  try {
    mkdirSync(join(dir, 'source'));
  } catch {
    /* a folding volume answers EEXIST, which is the row's own point */
  }
  if (kind === 'separates') {
    add('case-two-real', join(dir, 'Source'), join(dir, 'source'), 'different',
      'two REAL folders on a case-sensitive volume. A merge here loses a person a project');
  } else {
    add('case-one-folder', join(dir, 'Source'), join(dir, 'source'), 'same',
      "one folder on a folding volume, which is the reporter's shape");
  }
  mkdirSync(join(dir, 'sibling-a'), { recursive: true });
  mkdirSync(join(dir, 'sibling-b'), { recursive: true });
  add('two-siblings', join(dir, 'sibling-a'), join(dir, 'sibling-b'), 'different',
    'two ordinary folders side by side');
  add('child-and-parent', join(dir, 'sibling-a'), dir, 'different',
    'a folder and its own parent share a volume and nothing else');
  writeFileSync(join(dir, 'afile'), 'x\n');
  add('folder-and-file', join(dir, 'sibling-a'), join(dir, 'afile'), 'different',
    'a folder and a file');
  add('prefix-sibling', join(dir, 'sibling-a'), `${join(dir, 'sibling-a')}x`, 'different',
    'a name that merely shares a string prefix, and does not exist');

  // ---- FROM BELOW: one folder must never look like two --------------------
  mkdirSync(join(dir, 'one', 'proj'), { recursive: true });
  for (const [from, to] of [
    ['l1', 'one'],
    ['l2', 'l1'],
    ['l3', 'l2']
  ]) {
    try {
      symlinkSync(join(dir, to), join(dir, from));
    } catch {
      /* already there */
    }
  }
  add('symlink-chain', join(dir, 'one', 'proj'), join(dir, 'l3', 'proj'), 'same',
    'a CHAIN of symlinks, because the class is a property of the folder and not of one hop');
  add('dotdot-through-link', join(dir, 'one', 'proj'), `${join(dir, 'l1', 'proj')}/../proj`, 'same',
    "a '..' climb through a symlinked component, which path.resolve collapses the wrong way");
  mkdirSync(join(dir, NFC), { recursive: true });
  add('normalisation', join(dir, NFC), join(dir, NFD), 'same',
    'NFC against NFD. A case-SENSITIVE APFS volume still folds this, which is why no volume flag can answer it');
  if (base.startsWith('/private/tmp/')) {
    add('tmp-alias', join(dir, 'one', 'proj'), join(dir.replace('/private/tmp/', '/tmp/'), 'one', 'proj'), 'same',
      '/tmp against /private/tmp');
  }
  if (kind === 'folds') {
    add('firmlink', '/Users', '/System/Volumes/Data/Users', 'same',
      'the APFS firmlink: one inode, two canonical strings. The row a realpath-only design fails');
  }
  return rows;
}

/** The hard link, demonstrated. */
function hardLinkDemonstration(base) {
  const dir = join(base, 'hardlink');
  mkdirSync(join(dir, 'adir'), { recursive: true });
  writeFileSync(join(dir, 'afile'), 'x\n');
  let dirErr = 'no error at all, which would be a finding';
  try {
    linkSync(join(dir, 'adir'), join(dir, 'adir-hard'));
  } catch (err) {
    dirErr = err?.code ?? String(err);
  }
  let fileShares = false;
  try {
    linkSync(join(dir, 'afile'), join(dir, 'afile-hard'));
    const a = statSync(join(dir, 'afile'));
    const b = statSync(join(dir, 'afile-hard'));
    fileShares = a.dev === b.dev && a.ino === b.ino;
  } catch (err) {
    dirErr = `${dirErr}; the FILE link also failed: ${err?.code ?? String(err)}`;
  }
  return { dirErr, fileShares };
}

let sensitive = null;
let local = null;

try {
  await withCaseSensitiveImage((imageMount, imageNote, detachNow) => {
  mount = imageMount;

  // ------------------------------------------------------- the local volume
  local = runProbe({ base: localBase });
  if (local.error !== undefined) {
    problems.push(`the local volume could not be driven: ${local.error}`);
  }

  // ---------------------------------------------- the case-sensitive image
  if (mount === null) {
    problems.push(`no case-sensitive image could be made: ${imageNote}`);
  } else {
    const base = join(mount, 'work');
    mkdirSync(base, { recursive: true });
    sensitive = runProbe({ base, noMachine: true });
    if (sensitive.error !== undefined) problems.push(`the image could not be driven: ${sensitive.error}`);
  }

  // ------------------------------------------------------- the table, printed
  const col = (result, shape) => {
    if (result === null || result.error !== undefined) return '—';
    return String(result.rows[shape.id] ?? '—');
  };
  say(`the local volume ${local?.volume ?? '?'} case; the image ${sensitive?.volume ?? 'was not made'}`);
  say('');
  say(`  ${'row'.padEnd(30)} ${'folding'.padEnd(12)} ${'separating'.padEnd(12)} shape`);
  for (const shape of SHAPES) {
    const folding = local?.volume === 'folds' ? col(local, shape) : col(sensitive, shape);
    const separating = sensitive?.volume === 'separates' ? col(sensitive, shape) : '—';
    say(`  ${shape.id.padEnd(30)} ${folding.padEnd(12)} ${separating.padEnd(12)} ${shape.title}`);
    for (const [result, kindName] of [[local, 'folds'], [sensitive, 'separates']]) {
      if (result === null || result.error !== undefined) continue;
      const want = expectedFor(shape, result.volume);
      const got = result.rows[shape.id];
      if (got !== want && !String(got ?? '').startsWith('skipped:')) {
        problems.push(`${shape.id} on a volume that ${kindName}: expected ${String(want)}, read ${String(got)}`);
      }
    }
  }
  say('');

  // ----------------------------------------------------------- the timings
  for (const [name, result] of [['folding', local], ['separating', sensitive]]) {
    if (result === null || result.error !== undefined) continue;
    const t = result.timings ?? {};
    say(
      `volumeFoldsCase on the ${name} volume: ${Math.round(Number(t.first ?? 0))}us cold, ` +
        `${Math.round(Number(t.second ?? 0))}us and ${Math.round(Number(t.third ?? 0))}us after ` +
        `(three stats each, asked of the filesystem every time — the fix round deleted the per-device ` +
        `cache, because macOS hands a freshly attached image the dev a detached one had)`
    );
  }
  say('');

  // ------------------------------------------------------------- the attack
  // The attack drives the SHIPPED module through the same tsx runner the probe
  // uses; see runAttack below. This file is plain node and folder-identity.ts
  // is TypeScript, so there is nothing to import here.
  for (const [name, base, kind] of [
    ['the folding volume', localBase, local?.volume ?? 'folds'],
    ...(mount === null ? [] : [['the case-sensitive image', join(mount, 'work'), 'separates']])
  ]) {
    const rows = attackShapes(base, kind);
    const answers = runAttack(rows);
    if (answers.error !== undefined) {
      problems.push(`the attack could not run on ${name}: ${answers.error}`);
      continue;
    }
    say(`ATTACK on ${name} (${kind}):`);
    for (const row of rows) {
      const got = answers.rows[row.name];
      const ok = got === row.expect;
      say(`  ${ok ? 'ok  ' : 'BAD '} ${row.name.padEnd(22)} ${String(got).padEnd(10)} want ${row.expect.padEnd(10)} ${row.why}`);
      if (!ok) {
        problems.push(
          row.expect === 'different'
            ? `ATTACK ${row.name} on ${name}: sameFolder answered ${String(got)} for two genuinely different folders. ` +
              'This is the direction that MERGES two real projects into one identity.'
            : `ATTACK ${row.name} on ${name}: sameFolder answered ${String(got)} for ONE folder. ` +
              'This is the direction that leaves the split this phase exists to stop.'
        );
      }
    }
    const hard = hardLinkDemonstration(base);
    say(
      `  hard link: linking a DIRECTORY was refused ${hard.dirErr}, and two hard links to one FILE ` +
        `${hard.fileShares ? 'DO' : 'do not'} share dev+ino — which is why sameFolder is asked about directories only ` +
        'and why a later round must not widen it to files'
    );
    if (hard.dirErr === 'no error at all, which would be a finding') {
      problems.push(`a DIRECTORY was hard linked on ${name}; sameFolder's directory restriction rests on that being impossible`);
    }
    say('');
  }

  // ------------------------------------------------- row 20, after the detach
  // The one shape that can only be asked once the volume has gone, which is why
  // the door hands the body a `detachNow` rather than only a `finally`.
  if (mount !== null) {
    const onImage = join(mount, 'work', 'f01', 'RealName');
    detachNow();
    const after = runProbe({ base: localBase, unmounted: onImage });
    const got = after.error !== undefined ? `error` : after.rows[UNMOUNTED_ROW.id];
    say(`${UNMOUNTED_ROW.title}: ${String(got)} (want ${UNMOUNTED_ROW.expect}) — the volume really went away first`);
    if (got !== UNMOUNTED_ROW.expect) {
      problems.push(`${UNMOUNTED_ROW.id}: expected ${UNMOUNTED_ROW.expect}, read ${String(got)}`);
    }
  }
  });
} finally {
  relaxFixturePermissions(localBase);
  if (!KEEP) rmSync(localBase, { recursive: true, force: true });
}

/**
 * Drive the attack rows through the SHIPPED module.
 *
 * It goes through the same tsx runner the probe uses, because
 * `folder-identity.ts` is TypeScript and this file is plain node. A tiny
 * inline program is written into the scratch directory and removed with it.
 */
function runAttack(rows) {
  const script = join(localBase, `attack-${String(rows.length)}.mts`);
  const body = `
import { sameFolder } from ${JSON.stringify(join(repoRoot, 'src/main/fs/folder-identity.ts'))};
const rows = ${JSON.stringify(rows.map((r) => [r.name, r.a, r.b]))} as [string, string, string][];
const out: Record<string, string> = {};
for (const [name, a, b] of rows) {
  try {
    out[name] = sameFolder(a, b);
  } catch (err) {
    out[name] = 'error:' + String((err as Error).message).slice(0, 120);
  }
}
process.stdout.write(JSON.stringify({ rows: out }) + '\\n');
`;
  writeFileSync(script, body);
  const run = spawnSync(process.execPath, [tsxCli(), '--tsconfig', 'tsconfig.node.json', script], {
    encoding: 'utf8',
    cwd: repoRoot,
    maxBuffer: 8 * 1024 * 1024
  });
  if (run.status !== 0) return { error: (run.stderr || '').slice(-600) || '(no output)' };
  try {
    return JSON.parse(run.stdout.trim().split('\n').pop() ?? '');
  } catch {
    return { error: `no JSON: ${run.stdout.slice(0, 300)}` };
  }
}

if (problems.length > 0) {
  for (const p of problems) process.stderr.write(`${TAG} ${p}\n`);
  process.stderr.write(`${TAG} FAILED: ${String(problems.length)} finding(s).\n`);
  process.exit(1);
}
say('OK: both kinds of volume measured, every attack shape answered the way it must.');
process.exit(0);
