/**
 * Auto save — the timer, the skip list and the conflict stop (Phase 268,
 * issue 24).
 *
 * JnBrymn: "I keep forgetting to CTRL+S and then the agent gets confused when
 * I tell it to read a file. This comes up a lot more often when editing prose
 * text."
 *
 * ## The one thing that matters more than the feature
 *
 * `npm run conformance:save` exists because of issue 16: an agent's concurrent
 * edit was silently overwritten, and research 100 section 1 measured the loss
 * at 173 bytes of somebody's paragraph, with no toast, no banner, and a tab
 * that went clean afterwards so nothing was left to see. A TIMER THAT WRITES
 * THE BUFFER IS THAT BUG ON A LOOP, and worse than the original, because with
 * ⌘S a person at least knows they pressed something.
 *
 * So this module holds no write of any kind. Its ONE route to disk is
 * `deps.save`, which the store hands in as `io.save(id, 'auto')` — the same
 * function ⌘S calls, reaching the same `fs:writeGuarded` with the digest of
 * `tab.savedContents` as the precondition. There is no unguarded fallback, no
 * `files.saveConflictResolution` equivalent, and no second write path.
 * `conformance:save` rule 10 is what keeps that true: this file may not name
 * `writeFile`, `writeGuarded`, `writePlain`, `saveOutsideProject` or
 * `setInterval` at all.
 *
 * ## Two halves, and the first one is pure
 *
 * `autoSaveSkipReason` is a decision about a tab and nothing else, so a unit
 * test reads it directly. The controller below owns the timers, the stop
 * records and the "shown once" rule, and everything it touches outside itself
 * arrives through {@link AutoSaveDeps} — including the clock, so the tests run
 * with no real time in them.
 *
 * ## What VS Code does, which is what this does
 *
 * `editorAutoSave.ts:151` is the skip list in one line: "no auto save for
 * non-dirty, readonly or untitled editors". `textFileEditorModel.ts:751-753`
 * is the conflict stop: "if model is in save conflict or error, do not save
 * unless save reason is explicit", and the model stays in conflict mode until
 * a save resolves it (`:1211`) — typing does not.
 */

import type { EditorTab } from './tab-types';
import { fileInRepo } from './tab-identity';
import { tabIsReadOnly } from './tab-readonly';
import type { AutoSaveSettings } from '@shared/settings';
import type { SaveRefusalWord } from './save-sentences';
import { autoSaveStopSentence } from './save-sentences';

/**
 * Who asked for this save.
 *
 * `explicit` is a person pressing something, and it is the default everywhere,
 * so ⌘S is byte-identical to what it was before this phase. `auto` is the
 * timer, and it is the reason the save path refuses the plain door and refuses
 * to open a dialog.
 */
export type SaveReason = 'explicit' | 'auto';

/**
 * Why auto save stopped for a tab.
 *
 * `stale` is somebody else's write landing under the buffer, which is issue 16
 * itself. `refused` is any other word the guarded channel answered. `link` is
 * the channel's `unguarded` answer, where nothing went wrong and nothing was
 * written: a symbolic link belongs to the plain door, and a timer may not take
 * it.
 */
export type AutoSaveStopWhy =
  | { kind: 'stale' }
  | { kind: 'refused'; why: SaveRefusalWord }
  | { kind: 'link' };

/** Why a tab is not an auto-save tab at all. `null` means it is one. */
export type AutoSaveSkip =
  | 'clean'
  | 'readOnly'
  | 'notAFile'
  | 'remote'
  | 'draft'
  | 'outsideProject'
  | 'projectClosed';

/**
 * VS Code's `editorAutoSave.ts:151` ("no auto save for non-dirty, readonly or
 * untitled editors") plus Tortie's own, which is the one that matters here:
 * never a file the guarded channel cannot take, because the door it would fall
 * to is unguarded.
 *
 * Pure. `openRoots` is the absolute path of every LOCAL project open right
 * now, read by the controller so this stays a function of its arguments.
 */
export function autoSaveSkipReason(
  tab: EditorTab,
  openRoots: readonly string[]
): AutoSaveSkip | null {
  // 1. Nothing to write (VS Code :151).
  if (!tab.dirty) return 'clean';
  // 2. Not a file at all. `save` refuses all four outright (tab-io.ts
  //    :1279-1294): history is immutable, and the map, the report and a
  //    comparison have no bytes on disk under them.
  if (tab.commit !== null) return 'notAFile';
  if (
    tab.archMap !== undefined ||
    tab.diagnostics !== undefined ||
    tab.compare !== undefined
  ) {
    return 'notAFile';
  }
  // 3. Another computer's file. `machines:putFile` is a different channel with
  //    a different confirm gate, and this phase does not put a timer on it.
  if (tab.remote !== undefined) return 'remote';
  // 4. Read-only. `tabIsReadOnly` is the same question MonacoHost asks to
  //    decide whether the editor takes the keystroke, asked with a null write
  //    root because clause 3 already removed every remote tab. `error` is
  //    tab-io.ts:1306's third term and is not part of that predicate.
  if (tabIsReadOnly(tab, null) || tab.error !== null) return 'readOnly';
  // 5. A draft whose file has never existed (tab-io.ts:1352). The channel
  //    answers `missing` and the door falls to the plain write.
  if (tab.draft != null && tab.savedContents === '') return 'draft';
  // 6. Outside its own repository (tab-io.ts:1353) — the `~/.claude/CLAUDE.md`
  //    shape. That path takes the unguarded door by design, and an agent
  //    writes that exact file.
  if (!fileInRepo(tab.repoPath, tab.path)) return 'outsideProject';
  // 7. Inside a repository whose PROJECT WAS CLOSED. tab-io.ts:1324-1336
  //    records the difference: `fileInRepo` is a prefix test on the tab's own
  //    `repoPath`, while the channel asks the projects Tortie has OPEN, so
  //    such a tab passes clause 6 and would be refused `outside`. Skipping it
  //    silently is better than a toast about a project the person closed on
  //    purpose; ⌘S still says the sentence that names the remedy.
  if (!openRoots.some((root) => fileInRepo(root, tab.path))) return 'projectClosed';
  return null;
}

/** Everything the controller borrows. Nothing here reaches disk but `save`. */
export interface AutoSaveDeps {
  /** The ONE route to disk: the store hands in `io.save(id, 'auto')`. */
  save(id: string): Promise<boolean>;
  byId(id: string): EditorTab | undefined;
  /** Every LOCAL project open right now, absolute. */
  openRoots(): readonly string[];
  policy(): AutoSaveSettings;
  /** Is a confirm dialog on screen? A timer never writes underneath a question. */
  blocked(): boolean;
  toast(text: string): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface AutoSaveController {
  /** Every content change, called BEFORE `markDirty`'s own early return. */
  noteChanged(id: string): void;
  /** The editor lost focus — the `onFocusChange` mode's one trigger. */
  noteBlur(id: string): void;
  /** Every patch to a tab, from the store's single patch funnel. */
  notePatched(id: string, before: EditorTab | undefined, after: EditorTab): void;
  /** The tab was closed, evicted or had its preview slot reused. */
  forget(id: string): void;
  /** Has auto save written this tab? Read by the eviction filter. */
  touched(id: string): boolean;
  /** The stop record for a tab, or undefined while it is still saving itself. */
  stoppedFor(id: string): AutoSaveStopWhy | undefined;
  /**
   * Record a stop and say so ONCE. Called by the save path through
   * `TabIoDeps.autoStop`, which is why `tab-io` holds no timer state.
   */
  recordStop(id: string, why: AutoSaveStopWhy): void;
  disposeAll(): void;
}

/**
 * ONE MODULE OWNS EVERY TIMER, and it owns them in one map keyed by tab id.
 *
 * Per-tab timers scattered across components leak on close, on eviction and on
 * a project switch, and each of those is a write landing on a file whose tab
 * is gone. There is one `setTimeout` per dirty tab, cleared on every re-arm,
 * every patch to clean, every stop and every `forget`. `setInterval` appears
 * nowhere, by rule.
 */
export function createAutoSave(deps: AutoSaveDeps): AutoSaveController {
  const timers = new Map<string, unknown>();
  const stopped = new Map<string, AutoSaveStopWhy>();
  const inFlight = new Set<string>();
  /** Tabs auto save has WRITTEN. The eviction filter's new term. */
  const wrote = new Set<string>();

  const cancelTimer = (id: string): void => {
    const handle = timers.get(id);
    if (handle === undefined) return;
    deps.clearTimer(handle);
    timers.delete(id);
  };

  /** Is this tab one a timer may write right now? */
  const eligible = (id: string): boolean => {
    if (stopped.has(id)) return false;
    const tab = deps.byId(id);
    if (tab === undefined) return false;
    return autoSaveSkipReason(tab, deps.openRoots()) === null;
  };

  /**
   * Record a stop and say so ONCE.
   *
   * A NAMED FUNCTION rather than a method on the returned object, because
   * `conformance:save` rule 12 reads this body by matching braces and a
   * shorthand method is not a name it can find. It is also the honest shape:
   * this is the rule, and the object below only exposes it.
   */
  const recordStop = (id: string, why: AutoSaveStopWhy): void => {
    // THE WHOLE OF "SHOWN ONCE" IS THESE FOUR LINES, and the membership check
    // is FIRST so nothing below can run twice. A 1000 ms timer against a file
    // an agent is rewriting would otherwise be a toast a second.
    if (stopped.has(id)) return;
    stopped.set(id, why);
    cancelTimer(id);
    const name = deps.byId(id)?.name ?? 'this file';
    deps.toast(autoSaveStopSentence(why, name));
  };

  const run = (id: string): void => {
    timers.delete(id);
    // A question on screen is a person being asked something. A timer writing
    // underneath it would answer for them.
    if (deps.blocked()) return;
    if (inFlight.has(id)) return;
    // The skip reason may have MOVED while the timer ran: the tab can have
    // gone clean, been closed, or had its project closed under it.
    if (!eligible(id)) return;
    inFlight.add(id);
    void (async () => {
      try {
        const ok = await deps.save(id);
        if (ok) wrote.add(id);
      } finally {
        inFlight.delete(id);
      }
    })();
  };

  const arm = (id: string): void => {
    cancelTimer(id);
    if (deps.policy().mode !== 'afterDelay') return;
    if (!eligible(id)) return;
    timers.set(
      id,
      deps.setTimer(() => {
        run(id);
      }, deps.policy().delayMs)
    );
  };

  return {
    noteChanged(id) {
      // Every content change re-arms, so a save lands on a SETTLED buffer.
      // `markDirty` is already called per keystroke (MonacoHost.tsx:341), so
      // the signal exists and no second listener is needed.
      arm(id);
    },

    noteBlur(id) {
      if (deps.policy().mode !== 'onFocusChange') return;
      if (deps.blocked()) return;
      if (!eligible(id)) return;
      run(id);
    },

    notePatched(id, before, after) {
      // A SUCCESSFUL WRITE OF ANY KIND clears the stop, and `savedContents`
      // moving is what a successful write looks like from here — the guarded
      // save, its Overwrite, the plain door and the remote door all patch it.
      // One hook, no new call sites in tab-io, and typing is not among them.
      if (after.savedContents !== before?.savedContents) {
        stopped.delete(id);
      }
      // Gone clean: there is nothing left for a pending timer to write.
      if (after.dirty === false && before?.dirty === true) cancelTimer(id);
    },

    recordStop,

    forget(id) {
      cancelTimer(id);
      stopped.delete(id);
      wrote.delete(id);
      inFlight.delete(id);
    },

    touched(id) {
      return wrote.has(id);
    },

    stoppedFor(id) {
      return stopped.get(id);
    },

    disposeAll() {
      for (const id of [...timers.keys()]) cancelTimer(id);
      stopped.clear();
      wrote.clear();
      inFlight.clear();
    }
  };
}
