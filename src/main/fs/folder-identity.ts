/**
 * Does one folder have two names? Phase 274.
 *
 * ONE QUESTION, ASKED OF THE FILESYSTEM AND NEVER OF THE STRINGS.
 *
 *   Two paths name the same folder when the filesystem hands back the same
 *   `st.dev` and the same `st.ino` for both. Nothing else is a definition.
 *
 * Case, Unicode normalisation, symlinks, APFS firmlinks, `/tmp` against
 * `/private/tmp`, trailing separators, doubled separators, `.` and `..` are
 * deliberately NOT enumerated here as rules. They are shapes the definition
 * already covers, and ./paths.ts:71-73 states this repository's reason for
 * refusing the enumeration: "an enumeration of the ways one directory can be
 * spelled is a promise nobody can keep."
 *
 * ## The defect this module exists to stop
 *
 * issue 25, belucid. He opened
 * `/Users/sean/source/SpecStory/getspecstory/specstory-cli` while the disk
 * spells it `/Users/sean/Source/...` with a capital S. Not a symlink — a
 * case-insensitive APFS volume, which is the DEFAULT and is what the
 * operator's machine runs too. `projects.path` is UNIQUE (../manifest/schema.ts:49)
 * and SQLite's uniqueness is byte-exact, so one folder spelled two ways became
 * TWO project rows. Two rows is two tabs with one name, and the sessions join
 * at ../manifest/sessions-repository.ts:812 and :847 is `WHERE project_path = ?`,
 * so a person's sessions divide between them. Measured against the shipped
 * table shape: both inserts succeeded.
 *
 * ## Why dev+ino and not a canonicalising realpath
 *
 * `realpath` answers every shape above except one, and the exception is not
 * exotic: the APFS FIRMLINK. Re-measured on this machine for Phase 274,
 * `/Users/gdc/gmux` and `/System/Volumes/Data/Users/gdc/gmux` are
 * `16777231:334386926` on both sides — one folder beyond doubt — while
 * `realpathSync.native` answers two different strings. dev+ino answers that row
 * too. Reachability of the firmlink prefix through Tortie's own surfaces is
 * UNMEASURED; it is a property of the design rather than a claimed fix.
 *
 * The prior art is already in this repository, in this domain, for this reason:
 * `sameEntry` in ./file-ops.ts:110-118 ("Case-insensitive volumes (the macOS
 * default) report a `Foo.txt` destination as EXISTING when the source is
 * `foo.txt`"), and `archRepoKey` in ../arch/db.ts:96-102, which is
 * `${st.dev}:${st.ino}` and is the reporter's incident 4 — unstable hashed
 * workspace ids — already answered in three lines.
 *
 * ## THE REFUSAL THIS MODULE IS BUILT AROUND
 *
 * **Nothing here case-folds and nothing here normalises.** No `toLowerCase`,
 * no `toUpperCase`, no `localeCompare`, no case-insensitive regex, no
 * `String.prototype.normalize`. Case-folding is the reporter's own recorded
 * wrong fix and it corrupted sessions recorded on another platform. Normalising
 * is its Unicode twin and it is worse, because a canonicalising `realpath`
 * returns whichever normalisation form is ON DISK — asked for NFD over a real
 * NFC name it answers NFC, and asked over a real NFD name it answers NFD — so
 * normalising its output re-creates the mismatch it just removed.
 *
 * {@link volumeFoldsCase} is not an exception to that refusal. It asks the
 * filesystem what the filesystem does, and every comparison in this file is
 * then byte-exact on the filesystem's own answer.
 *
 * ## What it may do
 *
 * It writes no file, creates no directory, spawns no process and opens no
 * handle. Its only syscalls are `statSync`, its callback twin `stat`, and
 * `realpathSync.native`. All three are reads.
 */

import { realpathSync, stat, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** What the filesystem says about two paths. Never a guess. */
export type FolderSameness = 'same' | 'different' | 'unknown';

/** Does the volume holding `path` fold case? */
export type CaseFolding = 'folds' | 'separates' | 'unknown';

/**
 * The two fields that decide identity.
 *
 * `number | bigint` because the default seam asks for bigints and a test seam
 * hands back plain numbers. Both are compared through {@link identityOf}, which
 * stringifies, so the two can never be compared as different types by accident.
 */
export interface FolderStatIds {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
}

/**
 * The one test affordance in this module, and there is no second
 * implementation behind it.
 *
 * `conformance:samefolder` drives the case-SENSITIVE column of the fixture
 * table through this seam, so the gate is correct on a folding boot volume
 * without mounting anything. `measure:p274-volumes` is what proves the same
 * column against a real case-sensitive APFS image.
 *
 * It throws exactly as `statSync` does, errno and all, because every caller
 * below reads `err.code` and an error that lost its code would be read as
 * `'unknown'` — the safe answer, but the wrong one.
 */
export type FolderStatFn = (path: string) => FolderStatIds;

/**
 * BIGINT ON PURPOSE. `Stats.ino` is a double, and an APFS inode number is
 * 64-bit: past 2^53 two genuinely different inodes round to one double and
 * dev+ino would answer `'same'` for two different folders. That is the
 * data-loss direction — merging two real projects into one identity — so the
 * default seam asks libuv for the exact integers. `{ bigint: true }` costs one
 * extra field conversion and no extra syscall.
 */
const defaultStat: FolderStatFn = (path: string): FolderStatIds =>
  statSync(path, { bigint: true });

/**
 * The same seam, off the main thread. See {@link duplicateFolderGroupsAsync}
 * for why the product's one caller uses this rather than {@link defaultStat}.
 *
 * `{ bigint: true }` for the reason above it: an APFS inode number is 64-bit
 * and a double would round two different folders onto one identity, which is
 * the data-loss direction.
 */
export type FolderStatAsyncFn = (path: string) => Promise<FolderStatIds>;

const defaultStatAsync: FolderStatAsyncFn = (path: string) =>
  new Promise<FolderStatIds>((resolve, reject) => {
    stat(path, { bigint: true }, (err, st) => {
      if (err !== null) reject(err);
      else resolve(st);
    });
  });

/** `dev:ino` as a string, which is `archRepoKey`'s spelling in ../arch/db.ts. */
function identityOf(st: FolderStatIds): string {
  return `${String(st.dev)}:${String(st.ino)}`;
}

/**
 * An errno that PROVES the path names nothing.
 *
 * `ENOENT` is "it is not there" and `ENOTDIR` is "a component of it is not a
 * directory, so it cannot be there". Every other errno — `EACCES`, `EIO`,
 * `ELOOP`, a volume that went away — means "I could not look", which is a
 * different answer and must never be read as absence.
 */
function isProvenAbsent(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * The ONE canonicalising realpath in the owned domain.
 *
 * NODE HAS TWO FUNCTIONS SPELLED `realpath` AND ONLY ONE OF THEM
 * CANONICALISES. Measured for Phase 274 on node v22.23.1, asking for
 * `<d>/alpha/beta/gamma.txt` over a real `<d>/Alpha/Beta/Gamma.txt`:
 *
 *   fs.realpathSync         -> <d>/alpha/beta/gamma.txt   (UNCHANGED)
 *   fs.realpathSync.native  -> <d>/Alpha/Beta/Gamma.txt   (canonical)
 *   fs/promises.realpath    -> <d>/Alpha/Beta/Gamma.txt   (canonical)
 *
 * `fs.realpathSync` is Node's own JavaScript walk: it `lstat`s each component
 * and rewrites only the ones that are symlinks, so it hands back the case it
 * was given. Several sites in this repository called it FOR its canonical
 * answer, two of them under a comment saying they needed the canonical form,
 * and got nothing. `realpathSync.native` goes through libuv to `realpath(3)`,
 * which is the call that asks the volume.
 *
 * It THROWS exactly as `realpathSync` does. Every caller already sits inside a
 * try/catch that falls back to the spelling it was given, and that fallback is
 * the honest answer for a folder nobody can resolve.
 */
export function canonicalPathSync(path: string): string {
  return realpathSync.native(path);
}

/**
 * Do these two paths name ONE directory on disk?
 *
 * Asked of DIRECTORIES only; the caller has already proved both are folders.
 * The restriction is not decoration: two hard links to one FILE share dev+ino
 * and would answer `'same'` here, which is correct for a file and is not a
 * question this module is asked. macOS does not let an ordinary process
 * hardlink a directory, which is why the directory restriction holds.
 *
 * The order of the answers is the design:
 *
 *   1. Byte-equal strings are `'same'` with NO syscall. This is the
 *      overwhelmingly common answer — every add of a folder spelled the way it
 *      was first opened — and it costs nothing.
 *   2. Both stats succeed: `'same'` iff dev and ino both match.
 *   3. Either path is PROVEN absent: `'different'`. A path that names nothing
 *      is not the same folder as one that names something, and this holds even
 *      when the other side is unreadable — absence on one side settles it.
 *   4. Anything else: `'unknown'`, NEVER `'different'`. An unreadable folder is
 *      not a proven-absent one, and a caller must not be allowed to read "I
 *      could not look" as "they are not the same".
 *
 * NO CALLER IN PHASE 274 ACTS ON `'unknown'`. It takes the same branch
 * `'different'` takes, which is exactly the behaviour before this phase, so an
 * unreadable row cannot regress anybody.
 */
export function sameFolder(
  a: string,
  b: string,
  statAt: FolderStatFn = defaultStat
): FolderSameness {
  if (a === b) return 'same';
  let left: FolderStatIds;
  try {
    left = statAt(a);
  } catch (err) {
    return isProvenAbsent(err) ? 'different' : probeOther(b, statAt);
  }
  let right: FolderStatIds;
  try {
    right = statAt(b);
  } catch (err) {
    return isProvenAbsent(err) ? 'different' : 'unknown';
  }
  return identityOf(left) === identityOf(right) ? 'same' : 'different';
}

/**
 * The left side could not be LOOKED at. The right side can still settle it:
 * if the right names nothing, the two are not one folder whatever the left is.
 * Otherwise nobody knows.
 */
function probeOther(b: string, statAt: FolderStatFn): FolderSameness {
  try {
    statAt(b);
  } catch (err) {
    if (isProvenAbsent(err)) return 'different';
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// The volume probe
// ---------------------------------------------------------------------------

// THERE IS NO CACHE, AND THE FIX ROUND IS WHY. Phase 274.
/*
 * The first build of this module cached the answer under `st.dev`, on this
 * argument: a volume's case behaviour is decided at format time and cannot
 * change while it is mounted; a remount that assigns a DIFFERENT `dev` is a
 * miss under a new key; and a remount that assigns the SAME `dev` is the same
 * volume, whose cached answer is still true.
 *
 * THE THIRD PREMISE IS FALSE AND IT WAS MEASURED, not argued. macOS hands a
 * freshly attached disk image the `dev` number a detached one had. Three images
 * created and attached one after another, each detached before the next, all
 * received dev `16777241`:
 *
 *   Case-sensitive APFS  -> 16777241
 *   APFS                 -> 16777241
 *   Case-sensitive APFS  -> 16777241
 *
 * Driven end to end through this module in ONE process, that meant asking the
 * sensitive volume (`'separates'`, cached under 16777241), detaching it and
 * attaching a case-INSENSITIVE volume that received the same number answered
 * `'separates'` for a volume that in fact folds — proved independently by a
 * second `mkdir` of the flipped name being refused. The cached answer had
 * survived onto a different volume.
 *
 * So the cache is gone rather than repaired. There is no reliable cheap key
 * for "this is still the same volume" — the root inode of an APFS volume is 2
 * on every one of them — and the only caller is the duplicate-folder log line
 * in ../sessions/core.ts, which runs once per folder that already has more than
 * one project row. That population was measured at ZERO on a real manifest. Two
 * or three `statSync` calls, at about 200 µs, bought nothing and cost a wrong
 * answer.
 */

/** `A`-`Z` and `a`-`z`, by code point. */
const UPPER_A = 0x41;
const UPPER_Z = 0x5a;
const LOWER_A = 0x61;
const LOWER_Z = 0x7a;
const CASE_BIT = 0x20;

/**
 * The same name with every ASCII letter's case swapped, or the name unchanged
 * when it holds no ASCII letter.
 *
 * THIS IS NOT A FOLD AND IT IS NOT A COMPARISON. It manufactures a SECOND
 * SPELLING to hand to the filesystem; the filesystem's answer is what is then
 * compared, byte-exactly, on inode numbers. A name of digits or punctuation
 * flips to itself, which is how the caller learns this component cannot be
 * asked. Re-measured: `/private/tmp/2026` flips to `/private/tmp/2026`.
 *
 * ASCII BY CODE POINT RATHER THAN `toUpperCase`/`toLowerCase`, for two reasons
 * and both are load bearing. Unicode case mapping can change a string's LENGTH
 * — `'ß'.toUpperCase()` is `'SS'` — so it would manufacture a twin that is not
 * a case variant of anything, and the stat of it would answer a question nobody
 * asked. And the case words are refused across this domain by
 * `conformance:samefolder`'s rule 23, because they are the reporter's own
 * recorded wrong fix; a probe that spelled itself with them would be the one
 * exception a later round cited to reopen the refusal.
 *
 * ASCII is enough, measured: over the operator's nine real project paths the
 * case question is answered 9 of 9, because every project name is plain ASCII.
 * A name with no ASCII letter is climbed past, exactly like a name of digits.
 */
function flipCase(name: string): string {
  let out = '';
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code >= UPPER_A && code <= UPPER_Z) {
      out += String.fromCharCode(code | CASE_BIT);
    } else if (code >= LOWER_A && code <= LOWER_Z) {
      out += String.fromCharCode(code & ~CASE_BIT);
    } else {
      out += name[i];
    }
  }
  return out;
}

/**
 * Does the volume holding `path` fold case?
 *
 * THE METHOD, measured 2026-09-16 on real volumes. Take a path that exists,
 * flip the case of its last component, `stat` both spellings, compare dev+ino.
 * Same inode means the volume folds case; a different inode, or a flipped
 * spelling that is not there, means it separates. Three `stat` calls — the
 * path, its parent, and the flipped twin — no temp file, no `diskutil` spawn,
 * NO WRITE. The parent is the third one and the fix round added it; see the
 * boundary paragraph below.
 *
 *   SENSITIVE    268us   the flipped spelling does not exist   <- a case-sensitive APFS image
 *   INSENSITIVE  204us   both spellings are the same inode     <- /Users/gdc/gmux
 *   INSENSITIVE   66us   both spellings are the same inode     <- /private/tmp
 *
 * The sensitive image was created ON the insensitive machine, which is the
 * point: CASE SENSITIVITY BELONGS TO THE VOLUME, NOT THE MACHINE. A Mac can
 * hold an insensitive boot disk and a sensitive external one at once.
 *
 * THE WALK. A path that does not exist yet cannot be asked, and neither can a
 * component with no cased letter, so the probe climbs by `dirname` past both
 * and stops at `/`. Case folding is a property of the volume and every
 * directory on it answers the same, so an ancestor's answer is the path's
 * answer.
 *
 * THE WALK STOPS AT A VOLUME BOUNDARY AND ANSWERS `'unknown'`, and the fix
 * round is why. The first build declared "the climb may cross a mount point"
 * as a limit and cached the answer whenever the ANSWERING component sat on the
 * asked-about volume. Both halves were wrong, because a directory's NAME is an
 * entry in its PARENT's directory: at a mount point the parent is on another
 * volume, so flipping the mount point's own name asked the PARENT volume and
 * got the parent volume's answer while every guard thought it was on the right
 * one. Measured on a real case-sensitive APFS image whose parent `/private/tmp`
 * folds: a deep path read `'separates'` and the mount point itself read
 * `'folds'`, and with the old cache that wrong answer was then handed to every
 * later question about that volume. Every step of the walk now proves
 * `dirname(at)` shares `at`'s device before it either asks that component or
 * climbs past it. `'unknown'` is the answer at the boundary, which is honest:
 * nothing on that volume can be asked from outside it.
 *
 * NOTHING IS CACHED. The banner at the top of this section, "THERE IS NO
 * CACHE, AND THE FIX ROUND IS WHY", carries the measurement: macOS gives a
 * freshly attached image the `dev` a detached one had, so a `dev`-keyed answer
 * outlives the volume it was taken from.
 *
 * The sharp end, measured over the operator's nine real project paths: the CASE
 * question is answered 9 of 9 and the NORMALISATION question 0 of 9, because
 * every project name is plain ASCII with nothing to flip. That is why this
 * probe answers case only. Normalisation needs no probe of its own —
 * {@link sameFolder} folds whatever the volume folds without being told which,
 * and it has to, because the two properties are independent and on APFS they go
 * OPPOSITE WAYS: a case-SENSITIVE APFS volume still folds NFC against NFD, so a
 * design that asked about case and inferred normalisation would be wrong on
 * exactly the volume somebody created to be careful.
 *
 * `'unknown'` rather than a guess, always.
 */
export function volumeFoldsCase(
  path: string,
  statAt: FolderStatFn = defaultStat
): CaseFolding {
  for (let at = path; ; at = dirname(at)) {
    let here: FolderStatIds | null = null;
    try {
      here = statAt(at);
    } catch (err) {
      // A leaf that is not there yet is the ordinary case: climb. Anything
      // else is "I could not look", and this probe never guesses past one.
      if (!isProvenAbsent(err)) return 'unknown';
    }
    if (here !== null) {
      const up = dirname(at);
      if (up !== at) {
        // THE NAME BELONGS TO THE PARENT'S DIRECTORY, WHICH MAY BE ANOTHER
        // VOLUME. See {@link askOneComponent}. The same boundary stops the
        // CLIMB as well as the ask: a component with no cased letter is
        // climbed past, and a climb that steps onto another volume would
        // answer about somebody else's volume without saying so.
        let above: FolderStatIds;
        try {
          above = statAt(up);
        } catch {
          return 'unknown';
        }
        if (String(above.dev) !== String(here.dev)) return 'unknown';
        const name = basename(at);
        const flipped = flipCase(name);
        if (flipped !== name) return askOneComponent(up, flipped, here, statAt);
      }
    }
    if (at === dirname(at)) return 'unknown';
  }
}

/**
 * One component, asked. `here` is the stat of the path the caller is standing
 * on and `up` is its parent, both already taken, so this costs exactly one more
 * syscall.
 *
 * `up` IS PASSED IN BECAUSE THE CALLER HAS ALREADY PROVED IT, and that proof is
 * the whole of this function's correctness. THE FIX ROUND MEASURED THE HOLE.
 * A directory's NAME is an entry in its PARENT's directory, so flipping the
 * name asks the volume the PARENT is on — and at a mount point the parent is on
 * a different volume. Driven against a real case-sensitive APFS image mounted
 * at `/private/tmp/dmg.ktWNjG`, whose parent `/private/tmp` folds:
 *
 *   deep path on the image                    separates   (correct)
 *   the mount point itself                    folds       (WRONG)
 *   a chain of all-digit names under it       folds       (WRONG — it climbed
 *                                                          to the mount point)
 *
 * The flipped spelling `/private/tmp/DMG.KTwnJg` was resolved by `/private/tmp`,
 * which folds case, so it came back as the same mount point, dev and ino
 * matched, and a case-SENSITIVE volume read `'folds'`. The header used to
 * declare "the climb MAY CROSS A MOUNT POINT" as a limit; the climb was never
 * the problem, the twin lookup was, and it happened on the very path the caller
 * asked about.
 *
 * So the caller proves `dirname(at)` is on the same volume as `at` before this
 * is reached, and a mount point answers `'unknown'` — which is the honest
 * answer, because nothing on that volume can be asked from outside it.
 */
function askOneComponent(
  up: string,
  flipped: string,
  here: FolderStatIds,
  statAt: FolderStatFn
): CaseFolding {
  const twin = join(up, flipped);
  let other: FolderStatIds;
  try {
    other = statAt(twin);
  } catch (err) {
    // ONLY a proven absence means the volume separates. An `EACCES` on the
    // flipped spelling is not proof the folder is absent.
    return isProvenAbsent(err) ? 'separates' : 'unknown';
  }
  // Both spellings resolve. One inode means the volume folded them into one
  // folder; two inodes means two real folders, which only a separating volume
  // can hold.
  return identityOf(here) === identityOf(other) ? 'folds' : 'separates';
}

// ---------------------------------------------------------------------------
// The detector
// ---------------------------------------------------------------------------

/**
 * Groups of two or more paths that name one folder.
 *
 * THE HEAL DOES NOT SHIP AND THIS DOES. Phase 274 stops a second project row
 * from being minted and deliberately does not merge the rows a person already
 * has: a merge spans a boundary main cannot cross — nine localStorage record
 * sets live in the renderer beside four manifest columns — and the measured
 * population on a real manifest is zero. So the product DETECTS the split and
 * says so in one log line, and a later phase that decides to heal inherits
 * proved detection instead of re-deriving it.
 *
 * A path that cannot be stat'd joins no group. That is deliberate and it is the
 * conservative direction: a folder that was deleted, or that sits on a volume
 * that is not mounted, cannot be PROVEN to be any other folder, and a detector
 * that guessed would name two unrelated projects as one in a log a person
 * reads.
 *
 * Order is deterministic: groups in the order their first member appears, and
 * members in input order.
 */
export function duplicateFolderGroups(
  paths: readonly string[],
  statAt: FolderStatFn = defaultStat
): string[][] {
  const seen = new Grouping();
  for (const path of paths) {
    let st: FolderStatIds;
    try {
      st = statAt(path);
    } catch {
      continue;
    }
    seen.add(path, identityOf(st));
  }
  return seen.groups();
}

/**
 * The same question, asked without blocking the main thread. Phase 274 FIX
 * ROUND, and it is the one the product uses.
 *
 * WHY THE PRODUCT CALLER IS THE ASYNC ONE. The only caller is the
 * duplicate-folder log line in ../sessions/core.ts, which runs once when the
 * manifest opens. The synchronous version put one `statSync` per local project
 * row on the main process's boot path, unconditionally, before the control
 * client had started. `statSync` against a disconnected SMB or NFS mount does
 * not throw — it blocks in the kernel for as long as that mount takes to time
 * out, and a `try`/`catch` around the call catches a throw and cannot catch a
 * block. The measured population this diagnostic serves is ZERO, so the trade
 * was an unbounded stall at app open in exchange for a log line nobody's
 * manifest produces.
 *
 * ../recents/store.ts:344-355 is this repository's own precedent, in the same
 * words: it asks the identical question about the same kind of row, it is
 * asynchronous, it runs after the first paint, "so the screen never waits on
 * the filesystem".
 *
 * `stat` is the callback form from `node:fs`, wrapped here rather than imported
 * from `node:fs/promises`, because this module may name `node:fs` and
 * `node:path` and nothing else — `conformance:samefolder` rule 10 is what keeps
 * that true, and the rule exists so the module can never hold a WRITE
 * capability. A read that hands its work to libuv's thread pool is the same
 * syscall the rule already allows, taken off the main thread.
 *
 * Every other property is the sync version's, because the grouping is the same
 * code: a path that cannot be stat'd joins no group, groups come back in the
 * order their first member appears, and members in input order.
 */
export async function duplicateFolderGroupsAsync(
  paths: readonly string[],
  statAt: FolderStatAsyncFn = defaultStatAsync
): Promise<string[][]> {
  const seen = new Grouping();
  for (const path of paths) {
    let st: FolderStatIds;
    try {
      st = await statAt(path);
    } catch {
      continue;
    }
    seen.add(path, identityOf(st));
  }
  return seen.groups();
}

/**
 * The grouping both detectors share, so the two can never disagree about what
 * a duplicate is. It holds no syscall and no policy — it is the bookkeeping
 * that was written twice the moment there were two detectors.
 */
class Grouping {
  private readonly byIdentity = new Map<string, string[]>();
  private readonly order: string[] = [];

  add(path: string, key: string): void {
    const group = this.byIdentity.get(key);
    if (group === undefined) {
      this.byIdentity.set(key, [path]);
      this.order.push(key);
    } else {
      group.push(path);
    }
  }

  groups(): string[][] {
    return this.order
      .map((key) => this.byIdentity.get(key) ?? [])
      .filter((group) => group.length > 1);
  }
}
