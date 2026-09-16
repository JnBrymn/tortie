/**
 * The identity door, Phase 274 (issue 25).
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE, said up front so nobody reads it as the
 * whole proof. It runs on whatever volume `os.tmpdir()` lives on, which on the
 * operator's machine and on the reporter's is a case-FOLDING APFS volume. Every
 * assertion that depends on the volume therefore comes in two flavours: the
 * real-disk ones are asked only after {@link volumeFoldsCase} has said which
 * volume this is, and the case-SEPARATING column is driven through the module's
 * stat seam, which is the one test affordance it has.
 *
 * `measure:p274-volumes` is what proves the separating column against a real
 * case-sensitive APFS image, and `conformance:samefolder` is the gate. This
 * file is the unit layer under both.
 */

import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalPathSync,
  duplicateFolderGroups,
  duplicateFolderGroupsAsync,
  sameFolder,
  volumeFoldsCase,
  type FolderStatFn,
  type FolderStatIds
} from '../folder-identity';

let scratch: string;

beforeEach(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'p274-identity-')));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

/** True when the volume the scratch directory is on folds case. */
function foldsHere(): boolean {
  return volumeFoldsCase(scratch) === 'folds';
}

/**
 * A stat seam that pretends every path is a distinct folder unless two paths
 * are listed as one. It is how the case-SEPARATING column is driven on a
 * folding machine: nothing is mounted and nothing is written.
 */
function fakeVolume(
  identities: Record<string, string>,
  errors: Record<string, string> = {},
  devs: Record<string, number> = {}
): FolderStatFn {
  const ids = new Map<string, number>();
  return (path: string): FolderStatIds => {
    const errno = errors[path];
    if (errno !== undefined) {
      const err = new Error(`${errno}: fake, stat '${path}'`) as NodeJS.ErrnoException;
      err.code = errno;
      throw err;
    }
    const name = identities[path];
    if (name === undefined) {
      const err = new Error(`ENOENT: fake, stat '${path}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    if (!ids.has(name)) ids.set(name, ids.size + 1);
    return { dev: devs[path] ?? 99, ino: ids.get(name) as number };
  };
}

describe('sameFolder', () => {
  it('answers same for byte-equal strings without touching the disk', () => {
    let calls = 0;
    const counting: FolderStatFn = () => {
      calls++;
      return { dev: 1, ino: 1 };
    };
    expect(sameFolder('/nowhere/at/all', '/nowhere/at/all', counting)).toBe('same');
    expect(calls).toBe(0);
  });

  it('is same through a symlinked ancestor — Phase 273’s shape', async () => {
    const real = join(scratch, 'real');
    await mkdir(join(real, 'proj'), { recursive: true });
    await symlink(real, join(scratch, 'link'));
    expect(sameFolder(join(real, 'proj'), join(scratch, 'link', 'proj'))).toBe(
      'same'
    );
  });

  it('is same through a `..` climb and a doubled separator', async () => {
    await mkdir(join(scratch, 'a'), { recursive: true });
    await mkdir(join(scratch, 'proj'), { recursive: true });
    expect(
      sameFolder(join(scratch, 'proj'), `${scratch}/a/../proj`)
    ).toBe('same');
    expect(sameFolder(join(scratch, 'proj'), `${scratch}//proj`)).toBe('same');
  });

  it('is different for two genuinely different folders', async () => {
    await mkdir(join(scratch, 'one'), { recursive: true });
    await mkdir(join(scratch, 'two'), { recursive: true });
    expect(sameFolder(join(scratch, 'one'), join(scratch, 'two'))).toBe(
      'different'
    );
  });

  it('is different when either path names nothing', async () => {
    await mkdir(join(scratch, 'here'), { recursive: true });
    const gone = join(scratch, 'gone');
    expect(sameFolder(join(scratch, 'here'), gone)).toBe('different');
    expect(sameFolder(gone, join(scratch, 'here'))).toBe('different');
  });

  it('is unknown — never different — when a stat cannot look', () => {
    const seam = fakeVolume({ '/a': 'x', '/b': 'x' }, { '/a': 'EACCES' });
    expect(sameFolder('/a', '/b', seam)).toBe('unknown');
    expect(sameFolder('/b', '/a', seam)).toBe('unknown');
  });

  it('lets a proven absence settle it even when the other side is unreadable', () => {
    const seam = fakeVolume({ '/b': 'x' }, { '/b': 'EACCES' });
    // '/a' is absent, so the two cannot be one folder whatever '/b' is.
    expect(sameFolder('/a', '/b', seam)).toBe('different');
    expect(sameFolder('/b', '/a', seam)).toBe('different');
  });

  describe('the case column, driven through the seam so no volume is mounted', () => {
    it('is same when the volume folds the two spellings onto one inode', () => {
      const folding = fakeVolume({
        '/b/Source/proj': 'the-folder',
        '/b/source/proj': 'the-folder'
      });
      expect(sameFolder('/b/Source/proj', '/b/source/proj', folding)).toBe('same');
    });

    it('is DIFFERENT when the volume separates them — two real folders', () => {
      const separating = fakeVolume({
        '/b/Source/proj': 'upper-folder',
        '/b/source/proj': 'lower-folder'
      });
      expect(sameFolder('/b/Source/proj', '/b/source/proj', separating)).toBe(
        'different'
      );
    });
  });

  it('answers the reporter’s own shape on this machine when the volume folds', async () => {
    if (!foldsHere()) return;
    // /b/Outer/M/proj against /b/outer/M/proj: the difference is ABOVE the
    // project root, which is exactly what belucid measured with `pwd -P`.
    await mkdir(join(scratch, 'Outer', 'M', 'proj'), { recursive: true });
    expect(
      sameFolder(
        join(scratch, 'Outer', 'M', 'proj'),
        join(scratch, 'outer', 'M', 'proj')
      )
    ).toBe('same');
  });
});

describe('volumeFoldsCase', () => {
  it('answers folds or separates for a real directory, never unknown', () => {
    expect(['folds', 'separates']).toContain(volumeFoldsCase(scratch));
  });

  it('climbs past a leaf that does not exist yet', () => {
    const absent = join(scratch, 'Nope', 'not-there-yet');
    expect(volumeFoldsCase(absent)).toBe(volumeFoldsCase(scratch));
  });

  it('climbs past a component with no cased letter', async () => {
    // '2026' flips to '2026', so that component cannot be asked and the probe
    // has to climb to one that can.
    const digits = join(scratch, '2026');
    await mkdir(digits, { recursive: true });
    expect(volumeFoldsCase(digits)).toBe(volumeFoldsCase(scratch));
  });

  // The twin the probe manufactures flips EVERY cased letter, so the second
  // spelling of `/vol/Proj` is `/vol/pROJ`. The fixtures spell it out rather
  // than computing it, because a fixture that recomputed the rule under test
  // would agree with a broken rule.
  //
  // FIX ROUND: every fixture also holds `/vol` itself. The probe now stats the
  // PARENT of the component it is about to ask about, because a directory's
  // name is an entry in its parent's directory and at a mount point that parent
  // is another volume. A seam whose parent is missing is a filesystem that
  // cannot exist, and modelling one would let the boundary rule pass for the
  // wrong reason.
  it('says separates when the flipped spelling is not there', () => {
    const seam = fakeVolume({ '/vol': 'v', '/vol/Proj': 'p' });
    expect(volumeFoldsCase('/vol/Proj', seam)).toBe('separates');
  });

  it('says separates when the flipped spelling is a DIFFERENT inode', () => {
    const seam = fakeVolume({ '/vol': 'v', '/vol/Proj': 'upper', '/vol/pROJ': 'lower' });
    expect(volumeFoldsCase('/vol/Proj', seam)).toBe('separates');
  });

  it('says folds when the flipped spelling is the SAME inode', () => {
    const seam = fakeVolume({ '/vol': 'v', '/vol/Proj': 'one', '/vol/pROJ': 'one' });
    expect(volumeFoldsCase('/vol/Proj', seam)).toBe('folds');
  });

  it('says unknown rather than guessing when a stat cannot look', () => {
    const seam = fakeVolume({ '/vol': 'v', '/vol/Proj': 'p' }, { '/vol/pROJ': 'EACCES' });
    expect(volumeFoldsCase('/vol/Proj', seam)).toBe('unknown');
  });

  it('says unknown when nothing on the way to the root has a cased letter', () => {
    const seam = fakeVolume({ '/': 'root', '/2026': 'd', '/2026/11': 'd2' });
    expect(volumeFoldsCase('/2026/11', seam)).toBe('unknown');
  });

  // ---------------------------------------------------------------------
  // THE VOLUME BOUNDARY. Fix round.
  //
  // A directory's NAME is an entry in its PARENT's directory, so flipping the
  // name asks the volume the PARENT is on. At a mount point the parent is a
  // different volume, and on the real case-sensitive APFS image the flipped
  // spelling of the mount point resolved back through the folding parent to
  // the same inode and the probe answered 'folds' for a volume that separates.
  // The seam below is that shape: `/mnt` is dev 7 and its parent `/` is dev 99.
  // ---------------------------------------------------------------------

  it('says unknown at a mount point rather than asking the parent volume', () => {
    const seam = fakeVolume(
      // The folding parent resolves the flipped spelling back to the mount
      // point itself — one inode — which is what read 'folds' before.
      { '/': 'root', '/mnt': 'm', '/MNT': 'm' },
      {},
      { '/': 99, '/mnt': 7, '/MNT': 7 }
    );
    expect(volumeFoldsCase('/mnt', seam)).toBe('unknown');
  });

  it('says unknown rather than climbing off the volume it was asked about', () => {
    // `2026` has no case to flip, so the walk climbs to the mount point and
    // must stop there instead of answering with the parent volume's behaviour.
    const seam = fakeVolume(
      { '/': 'root', '/mnt': 'm', '/MNT': 'm', '/mnt/2026': 'd' },
      {},
      { '/': 99, '/mnt': 7, '/MNT': 7, '/mnt/2026': 7 }
    );
    expect(volumeFoldsCase('/mnt/2026', seam)).toBe('unknown');
  });

  it('still answers for a component whose parent is on the same volume', () => {
    const seam = fakeVolume(
      { '/': 'root', '/mnt': 'm', '/mnt/Proj': 'p' },
      {},
      { '/': 99, '/mnt': 7, '/mnt/Proj': 7 }
    );
    expect(volumeFoldsCase('/mnt/Proj', seam)).toBe('separates');
  });

  it('asks the disk every time — there is no cache to go stale', () => {
    // macOS hands a freshly attached image the dev a detached one had, so a
    // dev-keyed answer outlives the volume it was taken from. Measured: three
    // images in a row all received dev 16777241. The second ask therefore
    // costs exactly what the first did.
    let calls = 0;
    const counted: FolderStatFn = (path) => {
      calls++;
      return fakeVolume({ '/vol': 'v', '/vol/Proj': 'one', '/vol/pROJ': 'one' })(path);
    };
    expect(volumeFoldsCase('/vol/Proj', counted)).toBe('folds');
    const first = calls;
    expect(volumeFoldsCase('/vol/Proj', counted)).toBe('folds');
    expect(calls).toBe(first * 2);
  });

  it('answers the same for every path on one real volume', () => {
    const answer = volumeFoldsCase(scratch);
    expect(volumeFoldsCase(join(scratch, 'anything', 'deeper'))).toBe(answer);
    expect(volumeFoldsCase(scratch)).toBe(answer);
  });
});

describe('duplicateFolderGroupsAsync', () => {
  // THE ASYNC ONE IS THE ONE THAT SHIPS. ../../sessions/core.ts calls it at app
  // open, off the critical path, because a statSync against a disconnected SMB
  // or NFS mount blocks in the kernel until that mount times out and the
  // try/catch around it cannot catch a block. The two must answer alike, so
  // these drive the same fixtures the synchronous describe below drives.
  it('groups two spellings of one folder and leaves a stranger alone', async () => {
    await mkdir(join(scratch, 'real'), { recursive: true });
    await mkdir(join(scratch, 'other'), { recursive: true });
    await symlink(join(scratch, 'real'), join(scratch, 'link'));
    const spellings = [join(scratch, 'real'), join(scratch, 'link')];
    await expect(
      duplicateFolderGroupsAsync([...spellings, join(scratch, 'other')])
    ).resolves.toEqual([spellings]);
  });

  it('answers exactly what the synchronous one answers', async () => {
    await mkdir(join(scratch, 'a'), { recursive: true });
    await mkdir(join(scratch, 'b'), { recursive: true });
    await symlink(join(scratch, 'a'), join(scratch, 'a-too'));
    const paths = [
      join(scratch, 'a'),
      join(scratch, 'b'),
      join(scratch, 'a-too'),
      join(scratch, 'never-existed')
    ];
    await expect(duplicateFolderGroupsAsync(paths)).resolves.toEqual(
      duplicateFolderGroups(paths)
    );
  });

  it('drops a path it cannot stat rather than inventing an identity for it', async () => {
    const gone = join(scratch, 'gone');
    await expect(
      duplicateFolderGroupsAsync([gone, `${gone}-also`])
    ).resolves.toEqual([]);
  });
});

describe('canonicalPathSync', () => {
  it('restores the canonical CASE, which fs.realpathSync does not', async () => {
    if (!foldsHere()) return;
    await mkdir(join(scratch, 'Alpha', 'Beta'), { recursive: true });
    await writeFile(join(scratch, 'Alpha', 'Beta', 'Gamma.txt'), 'x', 'utf8');
    const typed = join(scratch, 'alpha', 'beta', 'gamma.txt');
    expect(canonicalPathSync(typed)).toBe(
      join(scratch, 'Alpha', 'Beta', 'Gamma.txt')
    );
  });

  it('resolves a symlinked ancestor', async () => {
    const real = join(scratch, 'real');
    await mkdir(join(real, 'proj'), { recursive: true });
    await symlink(real, join(scratch, 'link'));
    expect(canonicalPathSync(join(scratch, 'link', 'proj'))).toBe(
      join(real, 'proj')
    );
  });

  it('throws for a path that is not there, so callers keep their fallback', () => {
    expect(() => canonicalPathSync(join(scratch, 'nope'))).toThrow();
  });
});

describe('duplicateFolderGroups', () => {
  it('finds nothing when every path is its own folder', async () => {
    await mkdir(join(scratch, 'a'), { recursive: true });
    await mkdir(join(scratch, 'b'), { recursive: true });
    expect(
      duplicateFolderGroups([join(scratch, 'a'), join(scratch, 'b')])
    ).toEqual([]);
  });

  it('groups three spellings of one folder, in input order', () => {
    const seam = fakeVolume({
      '/b/Proj': 'one',
      '/b/proj': 'one',
      '/b/link/Proj': 'one',
      '/b/other': 'two'
    });
    expect(
      duplicateFolderGroups(
        ['/b/Proj', '/b/other', '/b/proj', '/b/link/Proj'],
        seam
      )
    ).toEqual([['/b/Proj', '/b/proj', '/b/link/Proj']]);
  });

  it('drops a path whose folder has gone, rather than guessing it is a twin', async () => {
    const real = join(scratch, 'real');
    await mkdir(real, { recursive: true });
    await symlink(real, join(scratch, 'link'));
    const spellings = [real, join(scratch, 'link')];
    expect(duplicateFolderGroups(spellings)).toEqual([spellings]);
    await rm(real, { recursive: true, force: true });
    expect(duplicateFolderGroups(spellings)).toEqual([]);
  });

  it('never groups a path it could not stat with one it could', () => {
    const seam = fakeVolume({ '/b/Proj': 'one', '/b/proj': 'one' }, {
      '/b/proj': 'EACCES'
    });
    expect(duplicateFolderGroups(['/b/Proj', '/b/proj'], seam)).toEqual([]);
  });

  it('finds the reporter’s split on a real folding volume', async () => {
    if (!foldsHere()) return;
    const disk = join(scratch, 'Source', 'proj');
    await mkdir(disk, { recursive: true });
    const typed = join(scratch, 'source', 'proj');
    expect(duplicateFolderGroups([disk, typed])).toEqual([[disk, typed]]);
  });
});

describe('the refusal this module is built around', () => {
  it('never case-folds and never normalises, read as text', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(
      join(dirname(new URL(import.meta.url).pathname), '..', 'folder-identity.ts'),
      'utf8'
    );
    // Strip the comments before asking, because the module ARGUES about these
    // words at length and the argument is not a call.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/toLowerCase|toUpperCase|localeCompare/);
    expect(code).not.toMatch(/\.normalize\(/);
    expect(basename(scratch)).not.toBe('');
  });
});
