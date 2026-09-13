/**
 * Git's own blob name, spelled a SECOND time (Phase 263).
 *
 * `src/main/arch/facts/oid.ts:15` already computes this. This directory may not
 * import it: `build/assert-import-boundaries.mjs:194-199` gives `main/arch/`
 * `onlyFrom: 'main/arch/'` with one door, and a `../arch/facts/oid` import from
 * here ends `typecheck` with a boundary failure rather than a fact.
 *
 * The duplication is DELIBERATE and is not a helper waiting to be merged. The
 * fact pass publishes a row only when the identity the worker parsed equals the
 * identity the row is keyed on, and that comparison is only worth anything
 * while the two sides are computed by two readers that do not share a function:
 * one spelling can be wrong and still agree with itself, and the guard would
 * pass with both halves wrong. `conformance:facts` rule F1 and
 * `src/main/symbols/__tests__/p263-oid.test.ts` pin the two spellings equal
 * over a corpus, so a change to either that moves a digit turns a gate red.
 *
 * The name is deliberately NOT `blobOid`, so a grep for either name still finds
 * exactly one definition per layer.
 */

import { createHash } from 'node:crypto';

/**
 * The 40 hex blob object name of these bytes — sha1 over `blob <len>\0` plus
 * the bytes, which is what `git hash-object` prints.
 */
export function symbolBlobOid(buf: Buffer): string {
  const h = createHash('sha1');
  h.update(`blob ${buf.length}\0`);
  h.update(buf);
  return h.digest('hex');
}
