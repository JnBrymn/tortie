/**
 * THE ONE OWNER OF THE BASELINE DOMAIN'S SHUTDOWN (Phase 265, the second half).
 *
 * `src/main/baselines/store.ts`'s header records the gap this closes, and it is
 * still true of the code at the parent commit: `capabilities.ts` registers this
 * domain's IPC and its pruning timer and NO disposer, so a `store()` already
 * running when the quit began had no owner. `markAppQuitting()` runs
 * synchronously (`src/main/index.ts`) and `typed-ipc.ts` then refuses every NEW
 * invoke with `SHUTTING_DOWN`, so the window is narrow: what has no owner is a
 * write ALREADY in flight when that line ran. Research 106 §1.4 measured one at
 * p50 19.8–24.9 ms for ordinary prose and 48.1–49.6 ms at 3 MB, p95 59.0 ms
 * worst. What is lost is the NARROWING and nothing on disk (every write is under
 * `<userData>/gmux/baselines`, no path to a source file); this owner closes the
 * "nothing owns a write at quit" limit and NOT the "a staged file a crash left
 * behind is invisible to the ceiling" one — that stays open, exactly as the
 * store header says.
 *
 * ## THE WORKING SIBLING IS `../credentials/lifecycle.ts` AND THIS COPIES ITS SHAPE
 *
 * Phase 220 gave the credentials domain a synchronous `beginCredentialShutdown()`
 * before any await and a bounded `joinCredentialShutdown()` later
 * (`capabilities.ts`). The store's own header points at exactly that precedent.
 * The transfer is direct, minus the parts a baseline write does not have: there
 * are no `security` children to end and no vendor locks to respect, only
 * in-flight `store()` promises to join. So this module is the credentials owner
 * with the child registry and the abort controllers removed.
 *
 * ## WHY THE ADDED JOIN CANNOT REVIVE THE 2026-08-14 napi_fatal_error
 *
 * `capabilities.ts:10-16` records that crash: it was too LITTLE awaiting, not
 * too much. The two lines that caused it were `void disposeGitIpc()` and
 * `void stopAgentOverlayWatch()` — an unsubscribe still queued at
 * `FreeEnvironment` answered by `napi_fatal_error`. An added AWAITED, BOUNDED
 * join is the same shape as the FIX, not the shape of the bug. The bound below
 * is what keeps it so: a write that wedges cannot lengthen the quit past it, and
 * an idle quit walks an empty set and pays nothing.
 */

import type { BaselineStoreResult } from '@shared/baselines';

/**
 * How long the join waits for what was already accepted before it says it did
 * not join.
 *
 * 500 ms, in the 200–500 ms range the spec names, and a WEDGE GUARD rather than
 * an expected wait. A `store()` is p95 ~59 ms and 48.1–49.6 ms at 3 MB (research
 * 106 §1.4), so 500 ms is ~8.5x the p95: room for a write that began a
 * millisecond before quit to finish its body flush, its record rename and its
 * ring prune even when the four-thread uv pool is busy, while still being small
 * against the credentials join's 2,000 ms and far too short to matter to the
 * watcher drain below it. An idle quit never reaches the race at all.
 */
export const BASELINE_SHUTDOWN_JOIN_MS = 500;

/**
 * The sentence a refused write answers once admission is closed.
 *
 * It rides `io` rather than a new refusal word: the shared `BaselineRefusal`
 * union is a contract this half does not widen, and the only reader that can
 * reach this refusal is a renderer whose invoke the global `SHUTTING_DOWN` gate
 * (`typed-ipc.ts`) already refuses first, because `markAppQuitting()` flips that
 * gate before `beginBaselineShutdown()` runs. So the word is never seen in the
 * ordinary quit; it exists so the owner is self-contained and testable.
 */
export const BASELINE_CLOSING_REASON =
  'the app is closing, so no new baseline is recorded';

/** What one join did, for the quit log and for the tests. */
export interface BaselineShutdownReport {
  /** True when the join had already run, so this call did nothing. */
  already: boolean;
  /** Writes that were still in flight when admission closed. */
  tracked: number;
  /** True only when everything tracked settled inside the bound. */
  joined: boolean;
  waitedMs: number;
}

/**
 * Admission. The `store()` door asks it, and it closes SYNCHRONOUSLY, before
 * the first await of the quit.
 */
let open = true;

/**
 * Every accepted write, until it settles.
 *
 * The promises held here never reject: what is tracked is a settled-either-way
 * mirror of the write, so joining it cannot turn a `store()` rejection into an
 * unhandled rejection. `store()` does not reject in practice (it catches io and
 * answers a refusal), but the mirror is the credentials module's shape and
 * costs nothing.
 */
const tracked = new Set<Promise<void>>();

/** The join, held so a second call answers the first one's report. */
let joining: Promise<BaselineShutdownReport> | null = null;

/** Is this domain still accepting writes? */
export function baselinesAreOpen(): boolean {
  return open;
}

/**
 * Close admission and nothing else.
 *
 * It is one of the first lines of the ordered disposer, before any await, so no
 * new `store()` begins while the rest of the quit runs. Synchronous, cannot
 * throw, and calling it twice is calling it once.
 */
export function beginBaselineShutdown(): void {
  open = false;
}

/**
 * Own one accepted write until it settles.
 *
 * Returns the SAME promise it was handed, so the door hands the caller the
 * store's own result unchanged while the join gets a handle on it. Exported for
 * the ipc door and pinned by the shutdown test.
 */
export function trackBaselineWork<T>(work: Promise<T>): Promise<T> {
  const held = work.then(
    () => undefined,
    () => undefined
  );
  tracked.add(held);
  void held.then(() => {
    tracked.delete(held);
  });
  return work;
}

/**
 * The door's decision: refuse when admission is closed, otherwise run the write
 * and own it until it settles.
 *
 * `run()` is NOT called when admission is closed — the write is refused rather
 * than begun, which is the assertion the shutdown test pins. When open, the
 * store's own promise is tracked and returned with its identity preserved.
 */
export function admitBaselineStore(
  run: () => Promise<BaselineStoreResult>
): Promise<BaselineStoreResult> {
  if (!open) {
    return Promise.resolve<BaselineStoreResult>({
      stored: false,
      refused: 'io',
      reason: BASELINE_CLOSING_REASON
    });
  }
  return trackBaselineWork(run());
}

/** How many writes this domain is holding. For the tests. */
export function baselineWorkCount(): number {
  return tracked.size;
}

/**
 * Close admission and join what was already accepted, bounded.
 *
 *  1. ADMISSION CLOSES (again), so a caller that reaches the join without the
 *     disposer's first line still cannot admit a write while it runs.
 *  2. WHAT WAS ACCEPTED IS JOINED, bounded by an unref'd timer race, and the
 *     report says whether it really joined rather than assuming it.
 *
 * A quit with nothing in flight walks an empty set and resolves in the same
 * tick, so the idle quit pays nothing. A second call answers the first one's
 * report and does nothing again.
 */
export function joinBaselineShutdown(
  deadlineMs: number = BASELINE_SHUTDOWN_JOIN_MS
): Promise<BaselineShutdownReport> {
  if (joining !== null) {
    return joining.then((report) => ({ ...report, already: true }));
  }
  // Admission closes here too, so the join is bounded rather than a race
  // against work still being admitted.
  open = false;
  const startedAt = Date.now();
  const waits = [...tracked];
  joining =
    waits.length === 0
      ? Promise.resolve({
          already: false,
          tracked: 0,
          joined: true,
          waitedMs: 0
        })
      : (async (): Promise<BaselineShutdownReport> => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const expired = new Promise<false>((resolve) => {
            timer = setTimeout(() => resolve(false), deadlineMs);
            timer.unref?.();
          });
          const joined = await Promise.race([
            Promise.allSettled(waits).then(() => true),
            expired
          ]);
          if (timer !== undefined) clearTimeout(timer);
          return {
            already: false,
            tracked: waits.length,
            joined,
            waitedMs: Date.now() - startedAt
          };
        })();
  return joining;
}

/**
 * Put this module back the way a fresh process finds it.
 *
 * THE TEST AND HARNESS SEAM, the same one the credentials lifecycle exposes:
 * this is process state by design, and a suite that drives one quit has to be
 * able to drive the next. Nothing in the product calls it.
 */
export function resetBaselineLifecycle(): void {
  open = true;
  tracked.clear();
  joining = null;
}
