/**
 * samefolder-probe.mts. The runtime half of `npm run conformance:samefolder`
 * and of `npm run measure:p274-volumes` (Phase 274).
 *
 * It drives the SHIPPING `src/main/fs/folder-identity.ts` under node over a
 * fixture tree it builds inside a base directory its CALLER made, and prints
 * ONE JSON line last. It launches no Electron, starts no tmux server, spawns no
 * agent, makes no request, mounts nothing and reads nothing under the person's
 * home. The only paths it names outside its base are `/Users` and
 * `/System/Volumes/Data/Users`, which it `stat`s and never writes, because the
 * APFS firmlink is the one shape in §8 that a canonicalising realpath does not
 * collapse and a fixture cannot manufacture one.
 *
 * ## Why the caller owns the base
 *
 * Two runners drive this file. `conformance-samefolder.mjs` points it at a
 * `mkdtemp` under `/private/tmp` — under `/private/tmp` on purpose, so the
 * `/tmp` row of §8 costs no extra write — and `measure-volumes.mjs` points it
 * at the mount point of a case-sensitive APFS image it attached. Neither the
 * removal nor the detach belongs here: whoever made the volume ends it in their
 * own `finally`, and a probe that removed a directory it did not make is a
 * probe that can delete the wrong one.
 *
 * ## Knobs
 *
 *   P274_BASE       required. The directory the fixture is built in.
 *   P274_MODULES    the directory `folder-identity.ts` is loaded from, default
 *                   `src/main/fs`. The gate points it at an ablated COPY so the
 *                   same probe reads the same rows against a broken module.
 *                   It is not `GMUX_` prefixed on purpose: the contract
 *                   inventory sweeps that prefix.
 *   P274_NO_MACHINE when '1', the three machine-level rows (/tmp and the two
 *                   firmlinks) answer 'n/a' rather than being asked. A 20 MB
 *                   disk image has no firmlink and no /tmp, so asking there
 *                   would be asking the wrong volume a question about this one.
 *   P274_UNMOUNTED  a path on a volume that has been detached since it was
 *                   written. Row 20 of §8, which cannot be built and asked in
 *                   one pass.
 *
 * ## The vocabulary
 *
 * One string per row — `same`, `different`, `unknown`, `refused`, `n/a`,
 * `skipped:<why>`, `error:<what>` — and `build/p274/fixtures.mjs` is where each
 * one is defined. `error:` is a READING rather than a crash, because an
 * ablation that removes a clause must show up as a moved row rather than as a
 * probe that could not run.
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { SHAPES, UNMOUNTED_ROW, expectedFor, relaxFixturePermissions } from './fixtures.mjs';

const MODULES = process.env['P274_MODULES'] ?? 'src/main/fs';
const BASE = process.env['P274_BASE'] ?? '';
const NO_MACHINE = process.env['P274_NO_MACHINE'] === '1';
const UNMOUNTED = process.env['P274_UNMOUNTED'] ?? '';
/**
 * The MOUNT POINT of the volume `P274_BASE` is on, when the caller mounted one.
 *
 * FIX ROUND. It exists for exactly one reading, and that reading was a defect
 * until this round: a directory's NAME is an entry in its PARENT's directory,
 * so flipping the mount point's own name asks the PARENT volume. Measured on a
 * real case-sensitive image mounted under `/private/tmp`, which folds, the
 * shipped probe answered `'folds'` for the mount point of a volume that
 * separates, and the old per-dev cache then handed that answer to every later
 * question about that volume. Only the caller that mounted the image knows
 * where it is, so the caller passes it.
 */
const MOUNT = process.env['P274_MOUNT'] ?? '';

const out = (value: unknown): never => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exit(0);
};

if (BASE === '') out({ error: 'P274_BASE was not set, so there is no volume to ask about' });

const modulePath = resolve(MODULES, 'folder-identity.ts');
if (!existsSync(modulePath)) {
  out({ error: `there is no folder-identity.ts at ${modulePath}` });
}

type Identity = typeof import('../../src/main/fs/folder-identity');
let identity: Identity;
try {
  identity = (await import(pathToFileURL(modulePath).href)) as Identity;
} catch (err) {
  out({ error: `folder-identity.ts did not load: ${String((err as Error).message).slice(0, 400)}` });
}

const { sameFolder, volumeFoldsCase, canonicalPathSync, duplicateFolderGroups } = identity!;

for (const [name, fn] of [
  ['sameFolder', sameFolder],
  ['volumeFoldsCase', volumeFoldsCase],
  ['canonicalPathSync', canonicalPathSync],
  ['duplicateFolderGroups', duplicateFolderGroups]
] as const) {
  if (typeof fn !== 'function') out({ error: `folder-identity.ts exports no ${name}` });
}

/** Does this path name a directory? The question `addProject` asks first. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const rows: Record<string, string> = {};
const paths: Record<string, { a: string; b: string }> = {};
const resolveEqual: Record<string, boolean> = {};

// The volume's own answer, taken FIRST and on the base itself, because every
// expectation below is read out of the column this names.
let volume = 'error';
try {
  volume = volumeFoldsCase(BASE);
} catch (err) {
  volume = `error:${String((err as Error).message).slice(0, 120)}`;
}

for (const shape of SHAPES) {
  const id = shape.id as string;
  if (NO_MACHINE && shape.machineOnly === true) {
    rows[id] = 'n/a';
    continue;
  }
  let pair: { a: string; b: string } | null = null;
  try {
    pair = shape.build(BASE) as { a: string; b: string } | null;
  } catch (err) {
    rows[id] = `error:build ${String((err as Error).message).slice(0, 160)}`;
    continue;
  }
  if (pair === null) {
    rows[id] = shape.id === 'f21-unreadable' ? 'skipped:root' : 'skipped:not-applicable';
    continue;
  }
  paths[id] = pair;
  if (shape.resolveCollapses === true) resolveEqual[id] = resolve(pair.b) === resolve(pair.a);
  // THE DISK IS ASKED BEFORE THE MODULE IS. A second spelling that names no
  // directory never reaches the identity question at all: `addProject` refuses
  // it at `isDirectory(abs)`, so the row's reading is about that refusal and
  // crediting `sameFolder` with it would be crediting the wrong mechanism.
  if (!isDirectory(pair.b)) {
    rows[id] = 'refused';
    continue;
  }
  try {
    rows[id] = sameFolder(pair.a, pair.b);
  } catch (err) {
    rows[id] = `error:${String((err as Error).message).slice(0, 160)}`;
  }
}

// Row 20. The volume went away between the build and the question.
if (UNMOUNTED !== '') {
  try {
    rows[UNMOUNTED_ROW.id] = isDirectory(UNMOUNTED)
      ? 'error:the volume is still mounted, so this row asked nothing'
      : sameFolder(UNMOUNTED, BASE);
  } catch (err) {
    rows[UNMOUNTED_ROW.id] = `error:${String((err as Error).message).slice(0, 160)}`;
  }
} else {
  rows[UNMOUNTED_ROW.id] = 'n/a';
}

/**
 * The clauses of §2.2 and §2.3 that no §8 row can reach, driven one by one.
 *
 * `equalMissing` is the byte-equality fast path, and it is asked about a path
 * that does not exist so the answer can only come from the fast path: any
 * implementation that stats first answers 'different' here.
 */
const clauses: Record<string, string> = {};
const clause = (name: string, run: () => string): void => {
  try {
    clauses[name] = run();
  } catch (err) {
    clauses[name] = `error:${String((err as Error).message).slice(0, 160)}`;
  }
};

clause('equalMissing', () => sameFolder('/nope-p274/deep/gone', '/nope-p274/deep/gone'));
clause('equalPresent', () => sameFolder(BASE, BASE));
clause('missingBoth', () => sameFolder('/nope-p274/a', '/nope-p274/b'));
// ENOTDIR: a real FILE used as an ancestor. `/etc/hosts` is on every macOS and
// is never opened here — it is an argument to a `stat` that must fail, and
// building a file of our own would prove the same thing for a byte more.
clause('notdir', () => sameFolder('/etc/hosts/under-a-directory', BASE));

/** §2.3's three hard answers for `volumeFoldsCase`, each asked of the volume. */
const probes: Record<string, string> = {};
const probe = (name: string, path: string): void => {
  try {
    probes[name] = volumeFoldsCase(path);
  } catch (err) {
    probes[name] = `error:${String((err as Error).message).slice(0, 160)}`;
  }
};
// '/' FIRST, and the order is the point. It is probed before anything else so
// that its reading is taken on a process that has asked nothing yet. The first
// build read it last and cached per device, so on this machine — where `/` and
// `/private/tmp` share a device — the clause was reading a cache hit taken on
// another directory and could not have gone red. There is no cache now; the
// order is kept so the clause cannot become meaningless again if one comes back.
probe('root', '/');
probe('base', BASE);
// A leaf that does not exist yet. The probe must walk UP rather than answer
// 'unknown', because case folding belongs to the volume and every directory on
// it answers the same.
probe('missingLeaf', resolve(BASE, 'f01', 'RealName', 'not', 'here', 'yet'));
// A last component with no case to flip. `2026` cannot be asked, so the walk
// has to keep climbing.
probe('digitsOnly', resolve(BASE, '2026'));
probe('digitsOnlyReal', resolve(BASE, 'f01'));
// The mount point of the volume BASE is on, when the caller mounted one. The
// walk must STOP at a volume boundary and answer 'unknown' rather than asking
// the parent volume about this one. See MOUNT above.
if (MOUNT !== '') probe('mountPoint', MOUNT);

/**
 * THREE DIRECTORIES ON ONE VOLUME MUST AGREE. The keys still read `cache-*`
 * because that is what the gate and every §8 reading name them, and renaming a
 * reading is a diff nobody can review; there is no cache behind them any more.
 *
 * FIX ROUND. The cache these were written for is gone, and the measurement is
 * in `src/main/fs/folder-identity.ts`: macOS hands a freshly attached disk image
 * the `dev` number a detached one had — three images in a row all received dev
 * 16777241 — so a `dev`-keyed answer outlives the volume it was taken from. The
 * reading is still worth taking, and it is now a stronger one: case folding is a
 * property of the VOLUME, so three directories on one volume must agree because
 * the filesystem says the same thing three times, not because the second and
 * third read a stored answer. The timings say so too — with a cache the second
 * and third were nearly free.
 */
const timings: Record<string, number> = {};
for (const [name, path] of [
  ['first', BASE],
  ['second', resolve(BASE, 'f01')],
  ['third', resolve(BASE, 'f02')]
] as const) {
  const t0 = process.hrtime.bigint();
  let answer = 'error';
  try {
    answer = volumeFoldsCase(path);
  } catch {
    answer = 'error';
  }
  timings[name] = Number(process.hrtime.bigint() - t0) / 1000;
  probes[`cache-${name}`] = answer;
}

/**
 * `duplicateFolderGroups` (rule 21). The fixtures are SYMLINKS rather than case
 * variants on purpose: a symlink gives one inode two spellings on BOTH kinds of
 * volume, so the reading is the same everywhere and the rule is about grouping
 * rather than about the volume.
 */
const groups: Record<string, string[][] | string> = {};
try {
  const real = resolve(BASE, 'f12', 'real', 'proj');
  const link = resolve(BASE, 'f12', 'link', 'proj');
  const alsoLink = resolve(BASE, 'f12', 'link2', 'proj');
  const other = resolve(BASE, 'f19', 'live');
  const gone = resolve(BASE, 'f19', 'gone');
  // Sorted with `<` rather than `localeCompare`, because this phase does not
  // compare two paths by anybody's locale rules, not even to print them.
  const byBytes = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
  const norm = (g: string[][]): string[][] =>
    g.map((row) => [...row].sort(byBytes)).sort((x, y) => byBytes(x[0] ?? '', y[0] ?? ''));
  groups['none'] = norm(duplicateFolderGroups([other, resolve(BASE, 'f01')]));
  groups['pair'] = norm(duplicateFolderGroups([real, other, link]));
  groups['three'] = norm(duplicateFolderGroups([real, link, alsoLink, other]));
  // A group whose folder has been removed. Both spellings stat ENOENT, so the
  // answer is no group at all rather than a group of nothing or a throw.
  groups['removed'] = norm(duplicateFolderGroups([gone, `${gone}-also`, other]));
  groups['empty'] = norm(duplicateFolderGroups([]));
  groups['single'] = norm(duplicateFolderGroups([real]));
  // A path repeated. One spelling is one member, not two.
  groups['repeated'] = norm(duplicateFolderGroups([real, real]));
} catch (err) {
  groups['error'] = `error:${String((err as Error).message).slice(0, 200)}`;
}

/**
 * LAYER 3. The two functions Node spells `realpath`, and the one that
 * canonicalises. `canonicalPathSync` must answer the DISK's spelling for a path
 * typed in the wrong case, which `fs.realpathSync` — Node's own JS walk — does
 * not. Driven here rather than asserted, on node v22.23.1 and on whatever runs
 * this next.
 */
const canonical: Record<string, string> = {};
try {
  const real = resolve(BASE, 'f02', 'RealName');
  const asked = resolve(BASE, 'f02', 'realname');
  canonical['ofRealSpelling'] = canonicalPathSync(real);
  canonical['ofFlippedSpelling'] = isDirectory(asked) ? canonicalPathSync(asked) : 'refused';
  // The firmlink: one folder, two canonical strings. This is §2.2's argument
  // for dev+ino over realpath, driven rather than quoted.
  canonical['firmlink'] = NO_MACHINE ? 'n/a' : canonicalPathSync('/System/Volumes/Data/Users');
  canonical['firmlinkPlain'] = NO_MACHINE ? 'n/a' : canonicalPathSync('/Users');
} catch (err) {
  canonical['error'] = `error:${String((err as Error).message).slice(0, 200)}`;
}

/**
 * RULE 12, driven. `src/main/overview/reader/paths.ts` records a path mention as
 * project-relative when it is inside the project and absolute when it is not.
 * Given a project spelled through a symlink and a token spelled canonically —
 * exactly what an agent's own log carries, because the agent was launched with
 * `sessions.cwd` — the parent commit records the token ABSOLUTE and outside.
 * The module is loaded from the SHIPPED tree even when the identity module is an
 * ablated copy, because rule 12's clause lives in that file and not in this one.
 */
const overview: Record<string, unknown> = {};
try {
  const readerPath = resolve('src/main/overview/reader/paths.ts');
  const reader = (await import(pathToFileURL(readerPath).href)) as typeof import('../../src/main/overview/reader/paths');
  const linkRoot = resolve(BASE, 'f12', 'link', 'proj');
  const realRoot = resolve(BASE, 'f12', 'real', 'proj');
  const mentions = reader.extractPathsFromText(
    `edited ${realRoot}/src/index.ts just now`,
    linkRoot,
    linkRoot,
    'tool'
  );
  overview['insideThroughLink'] = mentions.map((m) => ({ path: m.path, inside: m.inside }));
  // The control: a token that really is outside must stay outside, absolute.
  const outside = reader.extractPathsFromText(
    `also read ${resolve(BASE, 'f19', 'live')}/notes.md`,
    linkRoot,
    linkRoot,
    'tool'
  );
  overview['reallyOutside'] = outside.map((m) => ({ path: m.path, inside: m.inside }));
  // And the plain spelling, which has always worked and must keep working.
  const plain = reader.extractPathsFromText(
    `edited ${linkRoot}/src/index.ts`,
    linkRoot,
    linkRoot,
    'tool'
  );
  overview['insidePlain'] = plain.map((m) => ({ path: m.path, inside: m.inside }));
} catch (err) {
  overview['error'] = `error:${String((err as Error).message).slice(0, 200)}`;
}

// The EACCES row left a directory at mode 000 and the gate runs this probe
// again over every ablated copy. Putting the mode back here is what lets the
// second run build the same fixture; the gate relaxes it again in its own
// `finally` so an interrupted run does not leave an unremovable directory.
relaxFixturePermissions(BASE);

out({
  volume,
  base: BASE,
  modules: MODULES,
  rows,
  expected: Object.fromEntries(
    SHAPES.map((s) => [s.id as string, expectedFor(s, volume)])
  ),
  paths,
  resolveEqual,
  clauses,
  probes,
  timings,
  groups,
  canonical,
  overview,
  uid: process.getuid?.() ?? -1,
  node: process.version
});
