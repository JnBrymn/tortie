/**
 * Phase 273. A project opened through a symlink saves, and the gate that lets
 * it does not get weaker.
 *
 * Issue 25, belucid, 2026-09-15, on 0.106.0: a person who could not save any
 * file, ever, and was told each time that the project was not open. The cause
 * was two spellings of one folder. `addProject` stores `path.resolve(…)` and
 * never `realpath` (sessions/core.ts:2891), so a project opened through a
 * symlink is remembered through it and the tree concatenates each tab's path
 * onto that spelling; `resolveProjectRoot` realpaths the root; and
 * `resolveInsideRoot` compared the two LEXICALLY and threw before its own real
 * guard — which walks the parent chain and re-checks containment, and which
 * admits the alias — could answer.
 *
 * WHY THIS FILE IS NOT MORE OF `paths.test.ts`. That suite is the Phase 12.9
 * escape suite and it stays exactly as it was written: this phase must not be
 * able to make a row of it green by editing it. The rows here are the ones this
 * phase MOVES, the bound it keeps, and the word each refusal now carries.
 *
 * `npm run conformance:containment` is the whole escape checklist driven over a
 * larger fixture, with ten ablations. This file is the part a person reading the
 * module needs beside it.
 */

import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fsPathRefusalOf,
  resolveInsideRoot,
  resolveOpenProjectRoot,
  resolveProjectRoot
} from '../paths';

let scratch: string;
let root: string;
let alias: string;
let outside: string;

beforeEach(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'gmux-p273-')));
  root = join(scratch, 'proj');
  alias = join(scratch, 'alias');
  outside = join(scratch, 'outside');
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, '.git'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(root, 'README.md'), 'x', 'utf8');
  await writeFile(join(root, '..notes.md'), 'x', 'utf8');
  await writeFile(join(root, 'src', 'index.ts'), 'x', 'utf8');
  await writeFile(join(root, '.git', 'config'), 'x', 'utf8');
  await writeFile(join(outside, 'secret.txt'), 'x', 'utf8');
  // The alias IS belucid's project: the spelling the manifest holds.
  await symlink(root, alias);
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

/** The word a guard stamped, or the raw error when it stamped none. */
async function refusalWord(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    const word = fsPathRefusalOf(err);
    if (word === null) throw new Error(`the refusal carried no word: ${String(err)}`);
    return word;
  }
  throw new Error('expected the path to be refused, but it was accepted');
}

describe('the symlinked spelling of an open project (issue 25)', () => {
  it('accepts a file addressed through the alias, and names it by its real path', async () => {
    const realRoot = await resolveProjectRoot(alias);
    expect(realRoot).toBe(root);
    expect(await resolveInsideRoot(realRoot, join(alias, 'README.md'))).toEqual({
      abs: join(root, 'README.md'),
      rel: 'README.md'
    });
  });

  it('accepts a nested file through the alias', async () => {
    expect(
      (await resolveInsideRoot(root, join(alias, 'src', 'index.ts'))).rel
    ).toBe('src/index.ts');
  });

  it('accepts a file that does not exist yet whose PARENT does', async () => {
    expect(
      (await resolveInsideRoot(root, join(alias, 'src', 'brand-new.ts'))).rel
    ).toBe('src/brand-new.ts');
  });

  it('still refuses .git reached through the alias, and says so', async () => {
    expect(await refusalWord(resolveInsideRoot(root, join(alias, '.git', 'config')))).toBe(
      'protected'
    );
  });

  it('resolves an alias path whose parent does not exist, exactly as the real spelling does', async () => {
    // THE FIX ROUND MOVED THIS ROW AND THE REASON IS IN ITS OLD NAME. The first
    // round refused it and called it the bound on the arm, arguing that no
    // product caller sends an absolute path whose parent is gone. A tab open on
    // a file whose folder an agent removes before ⌘S is exactly that caller,
    // and it is an everyday thing in this product. Refused, the person read
    // "it is not inside the project it was opened from"; by the real spelling
    // the same file in the same state reads "it is no longer on disk". Both
    // spellings resolve now, and the sentence comes from the write.
    expect(
      (await resolveInsideRoot(root, join(alias, 'gone', 'README.md'))).rel
    ).toBe('gone/README.md');
    expect((await resolveInsideRoot(root, 'gone/README.md')).rel).toBe('gone/README.md');
  });

  it('says a folder inside the project could not be read, through EITHER spelling', async () => {
    // The word half two exists to give a person, driven through the spelling
    // half one exists for. `unreadable` was unreachable through the alias while
    // the second chance asked one `realpath` and discarded the errno, so the
    // person this phase was written for met `outside` on the first chmod.
    if (process.getuid?.() === 0) return; // uid 0 traverses a mode-000 directory
    await mkdir(join(root, 'locked', 'sub'), { recursive: true });
    await writeFile(join(root, 'locked', 'sub', 'x.txt'), 'x', 'utf8');
    await chmod(join(root, 'locked'), 0o000);
    try {
      expect(await refusalWord(resolveInsideRoot(root, 'locked/sub/x.txt'))).toBe(
        'unreadable'
      );
      expect(
        await refusalWord(resolveInsideRoot(root, join(alias, 'locked', 'sub', 'x.txt')))
      ).toBe('unreadable');
    } finally {
      await chmod(join(root, 'locked'), 0o755);
    }
  });

  it('keeps the errno to itself for an unreadable ancestor OUTSIDE the root', async () => {
    // The anti-oracle bound, and it is what stops the row above widening into a
    // way to probe the disk. An unreadable stranger and a missing one answer
    // the same word.
    if (process.getuid?.() === 0) return;
    await mkdir(join(scratch, 'lockedout', 'sub'), { recursive: true });
    await chmod(join(scratch, 'lockedout'), 0o000);
    try {
      expect(
        await refusalWord(resolveInsideRoot(root, join(scratch, 'lockedout', 'sub', 'x.txt')))
      ).toBe('outside');
      expect(
        await refusalWord(resolveInsideRoot(root, join(scratch, 'nope-xyz', 'deep', 'f.txt')))
      ).toBe('outside');
    } finally {
      await chmod(join(scratch, 'lockedout'), 0o755);
    }
  });

  it('gives a RELATIVE path no second chance, even onto a link back inside', async () => {
    // A symlink outside the root pointing back into it. A relative path is
    // resolved FROM the real root, so a lexical failure means it climbed out
    // with '..' — and an alias CAN explain such a climb, which is why this row
    // is a decision rather than an impossibility. A relative path means "from
    // the root", so a climb out of it is refused on purpose. This is the shape
    // a relative second chance would admit.
    await symlink(root, join(scratch, 'backin'));
    expect(await refusalWord(resolveInsideRoot(root, '../backin/README.md'))).toBe(
      'outside'
    );
  });

  it('refuses an absolute traversal that collapses through the alias', async () => {
    // The alias prefix collapses away in `resolve()` before any realpath, so
    // what is left is a plain stranger.
    expect(
      await refusalWord(
        resolveInsideRoot(root, join(alias, '..', 'outside', 'secret.txt'))
      )
    ).toBe('outside');
  });

  it('refuses the alias root itself under allowRoot — a declared, pre-existing limit', async () => {
    // `lexical === realRoot` compares the UNRESOLVED spelling, so a symlinked
    // root spelling is not recognised as the root. Nothing reaches it: the tree
    // sends a move destination relative, as '' or '.'.
    expect(await refusalWord(resolveInsideRoot(root, alias, { allowRoot: true }))).toBe(
      'outside'
    );
  });
});

describe('a real top-level file whose name begins with two dots', () => {
  it('is accepted by its real spelling and by its relative one', async () => {
    // Refused before this phase, with the same sentence issue 25 produced, and
    // not a symlink story at all. `rel.startsWith('..')` asked about a prefix
    // where the only honest question is about a SEGMENT.
    expect((await resolveInsideRoot(root, join(root, '..notes.md'))).rel).toBe(
      '..notes.md'
    );
    expect((await resolveInsideRoot(root, '..notes.md')).rel).toBe('..notes.md');
  });

  it('still refuses the bare ".." and a traversal that starts with it', async () => {
    expect(await refusalWord(resolveInsideRoot(root, '..'))).toBe('outside');
    expect(await refusalWord(resolveInsideRoot(root, '../outside/secret.txt'))).toBe(
      'outside'
    );
  });
});

describe('the word each refusal carries', () => {
  it('stamps a containment failure `outside`', async () => {
    expect(await refusalWord(resolveInsideRoot(root, '/etc/passwd'))).toBe('outside');
  });

  it('stamps a .git path `protected`, because a .git path IS inside the project', async () => {
    expect(await refusalWord(resolveInsideRoot(root, '.git/config'))).toBe('protected');
  });

  it('stamps a NUL byte `input`, not `outside`', async () => {
    expect(await refusalWord(resolveInsideRoot(root, 'a\0b'))).toBe('input');
  });

  it('stamps a root that matches no open project `projectClosed`', async () => {
    expect(await refusalWord(resolveOpenProjectRoot(root, async () => []))).toBe(
      'projectClosed'
    );
  });

  it('stamps an unreadable ancestor `unreadable` and keeps the errno out of the sentence', async () => {
    // A symlink loop rather than a mode-000 directory, so the reading is the
    // same under uid 0 as it is under a person's account.
    await symlink(join(root, 'loopb'), join(root, 'loopa'));
    await symlink(join(root, 'loopa'), join(root, 'loopb'));
    expect(await refusalWord(resolveInsideRoot(root, 'loopa/child.txt'))).toBe(
      'unreadable'
    );
  });

  it('answers null for anything this module did not stamp', async () => {
    // Load bearing: `guarded-write.ts` calls this inside a catch that can also
    // see a throw from `listProjectRoots`, which is a lazy import, a core boot
    // and two SQLite reads. Null is how those are told apart.
    expect(fsPathRefusalOf(new Error('nope'))).toBeNull();
    expect(fsPathRefusalOf(null)).toBeNull();
    expect(fsPathRefusalOf({ fsPathRefusal: 'outside' })).toBeNull();
  });
});

describe('the project root guard says what it measured', () => {
  it('keeps the missing-folder sentence byte for byte', async () => {
    try {
      await resolveProjectRoot(join(scratch, 'nope'));
      throw new Error('expected the root to be refused');
    } catch (err) {
      const payload = JSON.parse((err as Error).message) as { message: string };
      expect(payload.message).toBe('That project folder does not exist.');
      expect(fsPathRefusalOf(err)).toBe('unreadable');
    }
  });

  it('names the errno for every other way the root could not be read', async () => {
    await symlink(join(scratch, 'ra'), join(scratch, 'rb'));
    await symlink(join(scratch, 'rb'), join(scratch, 'ra'));
    try {
      await resolveProjectRoot(join(scratch, 'ra'));
      throw new Error('expected the root to be refused');
    } catch (err) {
      const payload = JSON.parse((err as Error).message) as {
        message: string;
        detail?: string;
      };
      expect(payload.message).toBe('That project folder could not be read (ELOOP).');
      expect(payload.detail).toBe('ELOOP');
      expect(fsPathRefusalOf(err)).toBe('unreadable');
    }
  });

  it('stamps a relative root `input`, because the caller composed it wrongly', async () => {
    expect(await refusalWord(resolveProjectRoot('proj'))).toBe('input');
  });
});

describe('the SYMLINK RULE is unchanged', () => {
  it('still treats a leaf symlink pointing out as the entry it is', async () => {
    await symlink(join(outside, 'secret.txt'), join(root, 'leaf.txt'));
    expect((await resolveInsideRoot(root, 'leaf.txt')).rel).toBe('leaf.txt');
  });

  it('still refuses a path reached THROUGH a directory symlink out of the root', async () => {
    await symlink(outside, join(root, 'escape'));
    expect(await refusalWord(resolveInsideRoot(root, 'escape/secret.txt'))).toBe(
      'outside'
    );
    // And one whose ancestors do not exist yet, which is the walk's own arm.
    expect(await refusalWord(resolveInsideRoot(root, 'escape/deep/new.txt'))).toBe(
      'outside'
    );
  });

  it('refuses an ancestor the process cannot traverse without leaking the errno into the word', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return;
    await mkdir(join(root, 'locked', 'sub'), { recursive: true });
    await chmod(join(root, 'locked'), 0o000);
    try {
      expect(await refusalWord(resolveInsideRoot(root, 'locked/sub/x.txt'))).toBe(
        'unreadable'
      );
    } finally {
      await chmod(join(root, 'locked'), 0o755);
    }
  });
});
