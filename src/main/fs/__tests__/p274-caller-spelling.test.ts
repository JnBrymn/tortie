/**
 * PHASE 274 — every verb answers in the spelling its caller asked with.
 *
 * THE DEFECT THESE PIN. Two kinds of channel serve one file tree and they did
 * not agree about what a file is called. `fs:readDir` ECHOES the caller's
 * spelling; every mutation verb in `../file-ops.ts` composed its answer from
 * main's REALPATH'd root. On a project whose stored spelling is not the disk's
 * those are two strings for one file, and the renderer's `===`, `startsWith`
 * and `entriesByDir` keys then disagreed with themselves — measured in the
 * running app as 6 of 23 tree steps passing on the person's spelling against
 * 23 of 23 on the disk's, with all 17 failures silent.
 *
 * A SYMLINKED ROOT IS THE SHAPE DRIVEN HERE, and it is deliberate: it is the
 * same two-spellings-one-folder mechanism as the case difference that issue 25
 * reported, it exercises exactly the branch the case difference exercises, and
 * unlike a case flip it behaves identically on a case-folding volume and on a
 * case-separating one. The suite must not need the operator's own volume to
 * be one kind. `measure:p274-volumes` is where the real case-sensitive volume
 * is driven.
 *
 * WHAT THESE DO NOT CLAIM. Containment is not re-proved here — that is
 * `conformance:containment`'s and `../paths.ts`'s. These are about the REPLY.
 */

import {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileOpsService } from '../file-ops';
import { createFileOps } from '../file-ops';

let scratch: string;
let root: string;
/** The SAME folder, reached through a symlink: the caller's own spelling. */
let alias: string;
let trashDir: string;
let ops: FileOpsService;

beforeEach(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'p274-spelling-')));
  root = join(scratch, 'proj');
  alias = join(scratch, 'as-opened');
  trashDir = join(scratch, 'trash');
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(trashDir, { recursive: true });
  await writeFile(join(root, 'src', 'index.ts'), 'index', 'utf8');
  await writeFile(join(root, 'docs', 'notes.md'), 'notes', 'utf8');
  await symlink(root, alias);

  ops = createFileOps({
    trashItem: async (path) => {
      await rename(path, join(trashDir, basename(path)));
    },
    // Main knows the project by its resolved spelling, exactly as it does in
    // production — the manifest's row, not the string the renderer sent.
    listProjectRoots: async () => [root]
  });
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('the answer is spelled under the root the caller named', () => {
  it('createFile and createFolder', async () => {
    const file = await ops.createFile({ root: alias, path: 'src/new.md' });
    expect(file).toEqual({
      path: join(alias, 'src/new.md'),
      relPath: 'src/new.md',
      kind: 'file'
    });
    const dir = await ops.createFolder({ root: alias, path: 'src/sub' });
    expect(dir.path).toBe(join(alias, 'src/sub'));
  });

  it('rename, on both sides of the pair', async () => {
    const result = await ops.rename({
      root: alias,
      path: 'docs/notes.md',
      name: 'renamed.md'
    });
    expect(result.from.path).toBe(join(alias, 'docs/notes.md'));
    expect(result.to.path).toBe(join(alias, 'docs/renamed.md'));
    // THIS IS THE ONE THE TREE BREAKS ON. `followMoves` matches an open tab by
    // `from.path` and rekeys it to `to.path`; both sides spelled under main's
    // root left the tab pointing at the old path and the rename reported as
    // not landing.
    expect(result.to.relPath).toBe('docs/renamed.md');
  });

  it('duplicate', async () => {
    const copy = await ops.duplicate({ root: alias, path: 'docs/notes.md' });
    expect(copy.path).toBe(join(alias, 'docs/notes copy.md'));
  });

  it('move, and the skipped entry beside it', async () => {
    const moved = await ops.move({
      root: alias,
      destDir: 'src',
      paths: ['docs/notes.md']
    });
    if (moved.status !== 'moved') throw new Error(moved.status);
    expect(moved.moved[0]?.from.path).toBe(join(alias, 'docs/notes.md'));
    expect(moved.moved[0]?.to.path).toBe(join(alias, 'src/notes.md'));

    // A source already sitting in the destination is skipped, and the skipped
    // row is drawn by the tree too.
    const again = await ops.move({
      root: alias,
      destDir: 'src',
      paths: ['src/notes.md']
    });
    if (again.status !== 'moved') throw new Error(again.status);
    expect(again.skipped[0]?.path).toBe(join(alias, 'src/notes.md'));
  });

  it('trash', async () => {
    const result = await ops.trash({ root: alias, paths: ['docs/notes.md'] });
    expect(result.failed).toEqual([]);
    // `forgetUnder` in the tree is keyed by this string.
    expect(result.trashed[0]?.path).toBe(join(alias, 'docs/notes.md'));
  });

  it('importPaths — the destination, and the source left alone', async () => {
    const incoming = join(scratch, 'incoming.txt');
    await writeFile(incoming, 'x', 'utf8');
    const result = await ops.importPaths({
      root: alias,
      destDir: 'docs',
      sources: [incoming]
    });
    if (result.status !== 'imported') throw new Error(result.status);
    expect(result.imported[0]?.to.path).toBe(join(alias, 'docs/incoming.txt'));
    // The SOURCE is deliberately outside the project (Phase 154) and has no
    // spelling under the root, so it is handed back exactly as it came in.
    expect(result.imported[0]?.source).toBe(incoming);
  });

  it('a move that would overwrite names the collision in the same spelling', async () => {
    await writeFile(join(root, 'src', 'notes.md'), 'other', 'utf8');
    const result = await ops.move({
      root: alias,
      destDir: 'src',
      paths: ['docs/notes.md']
    });
    if (result.status !== 'would-overwrite') throw new Error(result.status);
    expect(result.conflicts[0]?.from.path).toBe(join(alias, 'docs/notes.md'));
    expect(result.conflicts[0]?.to.path).toBe(join(alias, 'src/notes.md'));
  });

  it('a confirmed overwrite still trashes the RESOLVED path', async () => {
    await writeFile(join(root, 'src', 'notes.md'), 'other', 'utf8');
    const trashedPaths: string[] = [];
    const service = createFileOps({
      trashItem: async (path) => {
        trashedPaths.push(path);
        await rename(path, join(trashDir, basename(path)));
      },
      listProjectRoots: async () => [root]
    });
    const result = await service.move({
      root: alias,
      destDir: 'src',
      paths: ['docs/notes.md'],
      overwrite: true
    });
    if (result.status !== 'moved') throw new Error(result.status);
    // WHAT ACTS IS WHAT THE GUARD MEASURED. The answer beside it is spelled
    // under `alias`; the destructive call is made against the path
    // `resolveInsideRoot` proved. On this volume the two name one file either
    // way, which is exactly why a test is the only thing that can hold the
    // rule in place.
    expect(trashedPaths).toEqual([join(root, 'src/notes.md')]);
  });

  it('relPath is measured from the resolved root and does not move', async () => {
    const file = await ops.createFile({ root: alias, path: 'docs/deep/x.md' });
    expect(file.relPath).toBe('docs/deep/x.md');
    const direct = await ops.createFile({ root, path: 'docs/deep/y.md' });
    expect(direct.relPath).toBe('docs/deep/y.md');
    // A root spelled the way main resolved it answers exactly as it always
    // has, which is the no-op case every project on this Mac is in today.
    expect(direct.path).toBe(join(root, 'docs/deep/y.md'));
  });
});

describe('the caller’s root and the resolved root always name one folder', () => {
  it('because the gate resolves `..` LEXICALLY before it realpaths', async () => {
    // WHY THIS TEST EXISTS RATHER THAN A CASE THAT MAKES THE TWO DISAGREE.
    // `resolve` applies a `..` lexically and `realpath` applies it physically,
    // so a root spelled `<s>/side/link/../proj` — with `link` a symlink to
    // `<s>/deep` — names `<s>/side/proj` to one and `<s>/proj` to the other.
    // Re-spelling an answer under the first would name a file the verb never
    // touched.
    //
    // IT CANNOT HAPPEN, and the reason is one line in another module:
    // `resolveProjectRoot` (`../paths.ts:381`) is `realpath(resolve(root))`,
    // so the string `realpath` walks is already `resolve(root)` and the root
    // this module resolves is by construction the canonical form of the very
    // spelling it composes under. A `..` that does not lexically exist is
    // refused here, before any of that.
    //
    // It is pinned because the ordering lives in `../paths.ts` and
    // `underCallerRoot` would be silently wrong if a later round realpathed
    // the raw string instead. `spellingAsAsked` keeps the belt for the same
    // reason; this is the braces.
    await mkdir(join(scratch, 'deep'), { recursive: true });
    await mkdir(join(scratch, 'side'), { recursive: true });
    await symlink(join(scratch, 'deep'), join(scratch, 'side', 'link'));
    // Composed with a template and NOT with `join`, which collapses the `..`
    // lexically before the string ever reaches the filesystem.
    const spelled = `${join(scratch, 'side', 'link')}/../proj`;
    // The disk really does walk it to the open project...
    expect(await realpath(spelled)).toBe(root);
    // ...and the gate still refuses it, because `resolve` got there first.
    await expect(
      ops.createFile({ root: spelled, path: 'src/careful.md' })
    ).rejects.toThrow();
  });
});
