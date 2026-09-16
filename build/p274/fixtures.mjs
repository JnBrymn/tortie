/**
 * The Phase 274 fixture table, as data (SPEC.md §8).
 *
 * ONE table, read by three things: `build/p274/samefolder-probe.mts` builds it
 * on a real volume and drives the shipped `src/main/fs/folder-identity.ts` over
 * it, `build/p274/conformance-samefolder.mjs` asserts the readings, and
 * `build/p274/measure-volumes.mjs` runs the same table on a mounted
 * case-sensitive APFS image. Keeping the shapes and the expectations in ONE
 * place is the point: a table the gate owns and the measurement copies is a
 * table that drifts, and the phase's whole claim is that the SAME shapes answer
 * differently on the two kinds of volume.
 *
 * ## The two columns, and why there have to be two
 *
 * Case sensitivity belongs to the VOLUME and not to the machine. The entry
 * measured that on 2026-09-16 with a case-sensitive APFS image created on an
 * insensitive Mac. So every row states what it must read on a volume that folds
 * case and what it must read on one that separates, and the probe asks the
 * shipped `volumeFoldsCase` which column it is in rather than being told.
 *
 * Rows 1 and 4 together are why a volume FLAG would have been the wrong design
 * and dev+ino is the right one. On a separating volume row 1 reads `different`
 * — `RealName` and `realname` really are two folders there — while row 4 reads
 * `same`, because a case-sensitive APFS volume still folds Unicode
 * normalisation. Measured on 2026-09-16 on a real image: `mkdir` of the NFD
 * spelling over a real NFC folder is refused `EEXIST` and both spellings stat
 * to one inode, on the same volume where `RealName` and `realname` are inodes
 * 16 and 17. Case folding and normalisation folding are INDEPENDENT properties
 * and on APFS they go opposite ways. Anything that asked the volume one
 * question and inferred the other gets row 4 wrong.
 *
 * ## The vocabulary, one string per row, because the gate compares strings
 *
 *   same        the shipped `sameFolder` answered 'same'
 *   different   it answered 'different'
 *   unknown     it answered 'unknown' — a stat failed for a reason that is not
 *               absence, and the caller may not treat that as "not the same"
 *   refused     the second spelling names no directory at all, so `addProject`
 *               refuses it at `isDirectory(abs)` and the identity question is
 *               never asked. This is a reading about the DISK, taken before
 *               `sameFolder` is called
 *   n/a         the row cannot exist on this volume (a machine-level shape such
 *               as /tmp, or a firmlink, on a mounted image)
 *   skipped:…   the row needs something this host cannot give — uid 0 traverses
 *               every directory, so the EACCES row cannot be built under root
 *
 * ## What a row may and may not do
 *
 * `build(base)` may only write UNDER `base`, which the caller made and removes.
 * The two firmlink rows and the /tmp row are the exceptions and they are marked
 * `machineOnly`: the firmlink rows write NOTHING AT ALL (they read `/Users`,
 * which is already there), and the /tmp row needs the probe's base to be under
 * `/private/tmp` so `/tmp/<same>` is its own twin. Both are `n/a` on a mounted
 * image, which is the honest answer rather than a skipped one: there is no
 * firmlink and no /tmp on a 20 MB disk image.
 */

import { chmodSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

/** NFC and NFD spellings of one folder name. Built once, named by both rows. */
const CAFE_NFC = 'caf\u00E9-proj';
const CAFE_NFD = 'cafe\u0301-proj';
const CAFE_NFC_CAPS = 'Caf\u00E9-Proj';

/** A directory that is made if it is not already there. EEXIST is the answer. */
function mkdirIf(path) {
  try {
    mkdirSync(path, { recursive: true });
    return 'made';
  } catch (err) {
    if (err?.code === 'EEXIST') return 'exists';
    throw err;
  }
}

/**
 * Every shape from the shape survey, in SPEC.md §8's order.
 *
 * `folds` and `separates` are the expected readings. `build` returns the two
 * paths the row asks about: `a` is the spelling a row would already hold and
 * `b` is the spelling somebody types second.
 */
export const SHAPES = [
  {
    id: 'f01-case-both-real',
    title: 'case: RealName vs realname, both real folders',
    folds: 'same',
    separates: 'different',
    build(base) {
      const dir = join(base, 'f01');
      mkdirIf(join(dir, 'RealName'));
      // On a folding volume this is EEXIST and there is one folder; on a
      // separating one it makes a second, genuinely different folder. The row
      // is the same gesture either way, which is what makes it a real test of
      // the volume rather than of the fixture.
      mkdirIf(join(dir, 'realname'));
      return { a: join(dir, 'RealName'), b: join(dir, 'realname') };
    }
  },
  {
    id: 'f02-case-one-real',
    title: 'case: RealName real, realname asked, nothing created',
    folds: 'same',
    separates: 'refused',
    build(base) {
      const dir = join(base, 'f02');
      mkdirIf(join(dir, 'RealName'));
      return { a: join(dir, 'RealName'), b: join(dir, 'realname') };
    }
  },
  {
    id: 'f03-case-above-root',
    title: "case ABOVE the root — /b/Outer/M/proj vs /b/outer/M/proj (the reporter's exact shape)",
    folds: 'same',
    separates: 'refused',
    build(base) {
      const dir = join(base, 'f03');
      mkdirIf(join(dir, 'Outer', 'M', 'proj'));
      return { a: join(dir, 'Outer', 'M', 'proj'), b: join(dir, 'outer', 'M', 'proj') };
    }
  },
  {
    id: 'f04-nfc-made-nfd-asked',
    title: 'unicode: made NFC café-proj, asked NFD',
    folds: 'same',
    // A case-SENSITIVE APFS volume still folds normalisation. Measured.
    separates: 'same',
    build(base) {
      const dir = join(base, 'f04');
      mkdirIf(join(dir, CAFE_NFC));
      return { a: join(dir, CAFE_NFC), b: join(dir, CAFE_NFD) };
    }
  },
  {
    id: 'f05-nfd-made-nfc-asked',
    title: 'unicode: made NFD, asked NFC',
    folds: 'same',
    separates: 'same',
    build(base) {
      const dir = join(base, 'f05');
      mkdirIf(join(dir, CAFE_NFD));
      return { a: join(dir, CAFE_NFD), b: join(dir, CAFE_NFC) };
    }
  },
  {
    id: 'f06-unicode-and-case',
    title: 'unicode AND case: made Café-Proj, asked café-proj in NFD',
    folds: 'same',
    separates: 'refused',
    build(base) {
      const dir = join(base, 'f06');
      mkdirIf(join(dir, CAFE_NFC_CAPS));
      return { a: join(dir, CAFE_NFC_CAPS), b: join(dir, CAFE_NFD) };
    }
  },
  {
    id: 'f07-trailing-separator',
    title: 'trailing separator /proj/',
    folds: 'same',
    separates: 'same',
    // `path.resolve` already strips it, so this row is one row before and after.
    // The probe reports `resolveEqual` for these four so the gate can say WHICH
    // mechanism answered rather than crediting `sameFolder` for `resolve`'s work.
    resolveCollapses: true,
    build(base) {
      const dir = join(base, 'f07');
      mkdirIf(join(dir, 'proj'));
      return { a: join(dir, 'proj'), b: `${join(dir, 'proj')}/` };
    }
  },
  {
    id: 'f08-doubled-separator',
    title: 'doubled separator /b//proj',
    folds: 'same',
    separates: 'same',
    resolveCollapses: true,
    build(base) {
      const dir = join(base, 'f08');
      mkdirIf(join(dir, 'proj'));
      return { a: join(dir, 'proj'), b: `${dir}//proj` };
    }
  },
  {
    id: 'f09-dot-component',
    title: "'.' component /b/./proj",
    folds: 'same',
    separates: 'same',
    resolveCollapses: true,
    build(base) {
      const dir = join(base, 'f09');
      mkdirIf(join(dir, 'proj'));
      return { a: join(dir, 'proj'), b: `${dir}/./proj` };
    }
  },
  {
    id: 'f10-dotdot-component',
    title: "'..' component /b/a/../proj, a a real directory",
    folds: 'same',
    separates: 'same',
    resolveCollapses: true,
    build(base) {
      const dir = join(base, 'f10');
      mkdirIf(join(dir, 'proj'));
      mkdirIf(join(dir, 'a'));
      return { a: join(dir, 'proj'), b: `${dir}/a/../proj` };
    }
  },
  {
    id: 'f11-dotdot-through-symlink',
    title: "'..' through a symlinked ancestor, which resolve() cannot collapse",
    folds: 'same',
    separates: 'same',
    build(base) {
      // The '..' collapses LEXICALLY inside the link, so `path.resolve` answers
      // `<dir>/link/proj` — a different string from `<dir>/real/proj`, which is
      // why this is two rows today and why it belongs in the table at all.
      const dir = join(base, 'f11');
      mkdirIf(join(dir, 'real', 'proj'));
      mkdirIf(join(dir, 'real', 'x'));
      try {
        symlinkSync(join(dir, 'real'), join(dir, 'link'));
      } catch (err) {
        if (err?.code !== 'EEXIST') throw err;
      }
      return { a: join(dir, 'real', 'proj'), b: `${join(dir, 'link', 'x')}/../proj` };
    }
  },
  {
    id: 'f12-symlinked-ancestor',
    title: "symlinked ancestor /b/real/proj vs /b/link/proj (Phase 273's shape)",
    folds: 'same',
    separates: 'same',
    build(base) {
      const dir = join(base, 'f12');
      mkdirIf(join(dir, 'real', 'proj'));
      // TWO links, not one. The second is not for this row: rule 21's group of
      // THREE needs three spellings of ONE folder, and a symlink gives one
      // inode a second name on BOTH kinds of volume, so the group fixture reads
      // the same everywhere and is about grouping rather than about the volume.
      for (const name of ['link', 'link2']) {
        try {
          symlinkSync(join(dir, 'real'), join(dir, name));
        } catch (err) {
          if (err?.code !== 'EEXIST') throw err;
        }
      }
      return { a: join(dir, 'real', 'proj'), b: join(dir, 'link', 'proj') };
    }
  },
  {
    id: 'f13-tmp-vs-private-tmp',
    title: '/tmp/x vs /private/tmp/x',
    folds: 'same',
    separates: 'n/a',
    machineOnly: true,
    build(base) {
      // The probe's local base is a mkdtemp UNDER /private/tmp precisely so
      // this row costs no write outside it: `/tmp` is the same directory by a
      // shorter name, so the twin spelling is free.
      if (!base.startsWith('/private/tmp/')) return null;
      const dir = join(base, 'f13');
      mkdirIf(join(dir, 'proj'));
      return { a: join(dir, 'proj'), b: join(dir.replace('/private/tmp/', '/tmp/'), 'proj') };
    }
  },
  {
    id: 'f14-firmlink',
    title: 'APFS firmlink /Users vs /System/Volumes/Data/Users',
    folds: 'same',
    separates: 'n/a',
    machineOnly: true,
    // IT WRITES NOTHING. Both spellings already exist on every modern macOS,
    // and this is the ONE shape a canonicalising realpath does not collapse:
    // `realpathSync.native` answers two different strings for one inode. It is
    // why §2.2 chose dev+ino over realpath, so the row has to be real.
    build() {
      return { a: '/Users', b: '/System/Volumes/Data/Users' };
    }
  },
  {
    id: 'f15-firmlink-and-case',
    title: 'firmlink AND case together',
    folds: 'same',
    separates: 'n/a',
    machineOnly: true,
    build() {
      return { a: '/users', b: '/System/Volumes/Data/Users' };
    }
  },
  {
    id: 'f16-zero-width-appended',
    title: 'zero-width space appended (U+200B)',
    folds: 'refused',
    separates: 'refused',
    build(base) {
      const dir = join(base, 'f16');
      mkdirIf(join(dir, 'proj'));
      return { a: join(dir, 'proj'), b: `${join(dir, 'proj')}\u200B` };
    }
  },
  {
    id: 'f17-nbsp-for-space',
    title: 'non-breaking space for space (U+00A0)',
    folds: 'refused',
    separates: 'refused',
    build(base) {
      const dir = join(base, 'f17');
      mkdirIf(join(dir, 'my proj'));
      return { a: join(dir, 'my proj'), b: join(dir, 'my\u00A0proj') };
    }
  },
  {
    id: 'f18-real-name-holds-zwsp',
    title: 'the real name holds U+200B, asked plain',
    folds: 'refused',
    separates: 'refused',
    build(base) {
      const dir = join(base, 'f18');
      mkdirIf(join(dir, 'pr\u200Boj'));
      return { a: join(dir, 'pr\u200Boj'), b: join(dir, 'proj') };
    }
  },
  {
    id: 'f19-deleted-vs-live',
    title: 'a stored row whose folder has been deleted, vs a live folder',
    folds: 'different',
    separates: 'different',
    build(base) {
      const dir = join(base, 'f19');
      mkdirIf(join(dir, 'live'));
      mkdirIf(join(dir, 'gone'));
      rmSync(join(dir, 'gone'), { recursive: true, force: true });
      return { a: join(dir, 'gone'), b: join(dir, 'live') };
    }
  },
  {
    id: 'f21-unreadable',
    title: 'a stored row the process may not stat (EACCES)',
    folds: 'unknown',
    separates: 'unknown',
    // NEVER a merge on a guess. An unreadable folder is not a proven-absent one.
    build(base) {
      if (process.getuid?.() === 0) return null;
      const dir = join(base, 'f21');
      mkdirIf(join(dir, 'box', 'inner'));
      mkdirIf(join(dir, 'live'));
      chmodSync(join(dir, 'box'), 0o000);
      return { a: join(dir, 'box', 'inner'), b: join(dir, 'live') };
    }
  }
];

/**
 * Row 20 of §8, a stored row on an UNMOUNTED volume, is not in `SHAPES`
 * because it cannot be built and asked in one pass: the volume has to go away
 * between the build and the question. Both runners drive it by detaching the
 * image they mounted and asking afterwards, and the expected reading is
 * `different` — unchanged from today, and stated in §8 as the accepted limit.
 */
export const UNMOUNTED_ROW = {
  id: 'f20-unmounted-volume',
  title: 'a stored row on an unmounted volume',
  expect: 'different'
};

/** Undo whatever a row did that would stop the base being removed. */
export function relaxFixturePermissions(base) {
  try {
    chmodSync(join(base, 'f21', 'box'), 0o755);
  } catch {
    /* the row was skipped, or the base is already gone */
  }
}

/** The expected reading for `shape` on a volume that answers `folding`. */
export function expectedFor(shape, folding) {
  return folding === 'separates' ? shape.separates : shape.folds;
}
