/**
 * ONE case-sensitive APFS volume, created, attached and given back to a
 * `finally`. Phase 274.
 *
 * ## Why any of this exists
 *
 * Case sensitivity belongs to the VOLUME and not to the machine. The operator's
 * boot disk folds case — it is the APFS default, and it is the reporter's
 * configuration in issue 25 — so every check that only ever sees it is blind to
 * the direction that costs a person their work: on a volume that SEPARATES
 * case, `Source` and `source` are two genuinely different folders, and anything
 * that merged them would lose one of them. A 20 MB image made with
 * `hdiutil create -fs "Case-sensitive APFS"` is the whole of that column, it
 * needs no sudo, and it was measured at 1.05 s to create, 0.19 s to attach and
 * 0.19 s to detach.
 *
 * ## Why it is one module and not three copies
 *
 * Phase 274 shipped three scripts that need this volume — the gate
 * (`conformance-samefolder.mjs`), the measurement and attack
 * (`measure-volumes.mjs`) and the app run (`probe-p274.mjs`) — and the first
 * two were built in parallel and each wrote its own create/attach/parse/detach
 * block. Two copies of a teardown is how one of them ends up without the
 * `finally`, which is the machine-discipline rule this repository wrote after
 * the 2026-08-22 crash. There is one copy now and it is this one.
 *
 * ## What it promises
 *
 * - **The detach is the caller's `finally` or it does not happen at all.**
 *   {@link withCaseSensitiveImage} takes the body as a function and runs its own
 *   teardown in a `finally`, so a body that throws still detaches the image and
 *   still deletes the `.dmg`. There is no exported attach without it.
 * - **A detach that is refused is retried with `-force`.** Measured: a mount a
 *   probe has a file open on refuses the gentle detach, and leaving it attached
 *   leaks a volume for the rest of the session.
 * - **It never skips silently.** A host that is not darwin, an `hdiutil` that
 *   refuses, an attach that names no mount point: each hands the body `null`
 *   together with a SENTENCE saying which, and the caller decides whether that
 *   is a skip or a failure. `P274_REQUIRE_IMAGE=1` is how a caller turns it into
 *   a failure.
 * - **It spawns nothing long-lived.** Three `spawnSync` calls of `hdiutil` and
 *   nothing else, so `gate:background` has nothing to hold it to.
 *
 * The mount point is asked for under `/private/tmp` with `-mountrandom`, never
 * `/Volumes`, so nothing this creates can collide with a disk the person
 * mounted themselves and nothing appears in their Finder sidebar (`-nobrowse`).
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const VOLUME_NAME = 'P274CS';
const MOUNT_UNDER = '/private/tmp';

function hdiutil(...args) {
  return spawnSync('hdiutil', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

/**
 * The mount point `hdiutil attach` named, or `null`.
 *
 * `attach` prints a tab-separated table whose last column is the mount point
 * and whose earlier rows are the partitions with no mount of their own, so the
 * answer is the LAST row whose last column is under the directory we asked to
 * mount under. Filtering on that prefix is also what stops a stray line naming
 * something in `/Volumes` from being read as ours.
 */
function mountPointOf(stdout) {
  const point = (stdout || '')
    .split('\n')
    .map((line) => line.split('\t').pop()?.trim() ?? '')
    .filter((path) => path.startsWith(`${MOUNT_UNDER}/`))
    .pop();
  return point === undefined || point === '' ? null : point;
}

/**
 * Detach, gently and then by force. Safe to call twice; safe to call on a
 * mount that was never made.
 */
function detach(mount) {
  if (mount === null) return;
  const gentle = hdiutil('detach', mount, '-quiet');
  if (gentle.status !== 0) hdiutil('detach', mount, '-force', '-quiet');
}

/**
 * Run `body(mount, note, detachNow)` with a case-sensitive APFS volume mounted,
 * and detach it and delete its `.dmg` in a `finally` whatever happened.
 *
 * `mount` is the mount point, or `null` when no image could be made; `note` is
 * `null` on success and a sentence saying why not otherwise. The body's own
 * return value is handed back unchanged.
 *
 * `detachNow` is there for ONE reason and it is §8's row 20, "a stored row on
 * an unmounted volume": that shape can only be asked after the volume it named
 * has gone, so the body may take the mount away itself. It is idempotent and
 * the `finally` below still runs — calling it early only means the `finally`
 * has nothing left to do, which is the property that keeps the teardown the
 * only thing that has to happen.
 *
 * The body is given the MOUNT POINT and not a directory inside it. A caller
 * that wants to write should make its own subdirectory, because the root of an
 * APFS volume holds `.fseventsd` and a caller that walks the root will see it.
 */
export async function withCaseSensitiveImage(body) {
  if (process.platform !== 'darwin') {
    return body(null, `this host is ${process.platform}, not darwin`, () => undefined);
  }
  const imageDir = mkdtempSync(`${MOUNT_UNDER}/p274-image-`);
  const dmg = join(imageDir, 'sensitive.dmg');
  let mount = null;
  let gone = false;
  const detachNow = () => {
    if (gone || mount === null) return;
    detach(mount);
    gone = true;
  };
  try {
    const made = hdiutil(
      'create', '-size', '20m', '-fs', 'Case-sensitive APFS',
      '-volname', VOLUME_NAME, '-quiet', dmg
    );
    if (made.status !== 0) {
      const why = (made.stderr || '').trim().slice(0, 200) || 'no output';
      return await body(null, `hdiutil create refused: ${why}`, detachNow);
    }
    const attached = hdiutil(
      'attach', dmg, '-nobrowse', '-readwrite', '-noverify', '-mountrandom', MOUNT_UNDER
    );
    if (attached.status !== 0) {
      const why = (attached.stderr || '').trim().slice(0, 200) || 'no output';
      return await body(null, `hdiutil attach refused: ${why}`, detachNow);
    }
    mount = mountPointOf(attached.stdout);
    if (mount === null) {
      const saw = (attached.stdout || '').slice(0, 300);
      return await body(null, `hdiutil attach named no mount point: ${saw}`, detachNow);
    }
    return await body(mount, null, detachNow);
  } finally {
    // BOTH of these, whatever happened above and whatever the body did. A
    // detach that is refused is retried with -force inside `detach`; a .dmg
    // left behind is 20 MB of somebody else's disk.
    detachNow();
    rmSync(imageDir, { recursive: true, force: true });
  }
}
