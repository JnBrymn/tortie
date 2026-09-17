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
 * ## PHASE 277 — a timer may not outlive the policy that armed it (audit F2)
 *
 * The 14 September architecture audit found a timer armed under After a delay
 * that fired and saved AFTER the person had switched auto save to Off. `arm`
 * asked the mode when it CREATED a timer; nothing asked again; and no settings
 * change cancelled a pending one. So the answer a save acted on could be a
 * whole delay period out of date. The auditor's own counterexample is
 * docs/audits/fixtures/2026-09-14/auto-save-interleavings.test.ts.fixture.
 * Three of its four cases failed at b4569686, and the two this module is
 * answerable for failed with a real guarded save submitted under Off and under
 * On focus change.
 *
 * Three things answer it, and they are deliberately three rather than one:
 *
 *  1. `policyPermits` is the mode-to-trigger rule spelled ONCE. `arm`,
 *     `noteBlur` and `run` all ask it, so a fourth mode cannot be handled in
 *     two places and missed in a third. It was missed in a third: `run`, the
 *     one that reaches disk, asked nothing at all.
 *  2. Every timer carries the TRIGGER that armed it, and `run` re-asks
 *     permission for THAT trigger in the last synchronous statement before it
 *     hands over to `deps.save`. This is the piece that may never be removed:
 *     it is what the fixture measures, and it holds even if a later round
 *     unwires the hook below.
 *  3. `notePolicyChanged` re-arms, through `arm`, every tab that currently
 *     holds a timer. Off and On focus change arm nothing, a changed delay is
 *     honoured, and a tab that went clean arms nothing.
 *
 * THE LIMIT, stated rather than overclaimed. Switching to Off does not
 * interrupt a save already submitted to main: between `run`'s last read and
 * the bridge call there is one sha256 digest of `savedContents` (./tab-io), and
 * that is the whole window. It stops every timer that has not submitted one.
 *
 * THE FIX ROUND MADE THAT PARAGRAPH TRUE; as first built it was not. A timer
 * that fell due while a save was already running was queued in ./tab-io and
 * ran a whole write later, so its window was that write plus the digest, and
 * it wrote under Off and under a dialog. Now ./tab-io answers such a request
 * false at once and `run` re-arms the delay through `arm`, so the policy and
 * the dialog are asked again before anything is submitted.
 *
 * ## ONE SAVE AT A TIME PER TAB, AND THAT RULE IS ./tab-io's, NOT THIS MODULE'S
 *
 * This module used to keep an in-flight set of its own. It was a SECOND TRUTH
 * about one fact, kept where a person's ⌘S could not see it, and it cost work
 * twice. A ⌘S and a timer could both be in flight on one file, and the loser
 * was answered `stale` — a dialog about a concurrent writer that does not
 * exist. And a second timer falling due during a held save was DROPPED rather
 * than deferred, because the handle was consumed before the in-flight test:
 * measured at the parent as one save, no pending timer, and the newer typing
 * never written at all.
 *
 * Serialisation is now `withSaveSlot` in ./tab-io, which is the one place that
 * knows about every save of every kind. So this module asks for one freely: a
 * request made during a save is refused there rather than raced, and re-armed
 * here rather than dropped (`run`). A person's ⌘S made during a save is the one
 * request ./tab-io remembers, because a person's press is not governed by this
 * module's policy. The dependency is written down here rather than assumed,
 * because deleting the set from this file only looks safe if you know where it
 * went.
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
import type { AutoSaveMode, AutoSaveSettings } from '@shared/settings';
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

/**
 * What made a save due.
 *
 * It travels WITH the timer that is waiting to fire, so the question asked at
 * the end is about this particular timer rather than about auto save in
 * general. `delay` is the debounce after a keystroke; `blur` is the editor
 * losing focus.
 */
export type AutoSaveTrigger = 'delay' | 'blur';

/**
 * Does this policy authorise THIS trigger?
 *
 * PHASE 277, audit F2. THE MODE-TO-TRIGGER RULE IS SPELLED HERE AND NOWHERE
 * ELSE. It used to be spelled twice and missed once: `arm` tested
 * `mode !== 'afterDelay'`, `noteBlur` tested `mode !== 'onFocusChange'`, and
 * `run` — the only one of the three that reaches disk — tested nothing. Two
 * spellings and one hole is exactly how a delay armed under After a delay
 * fired and saved under Off. With one predicate a fourth mode cannot be
 * handled in two places and missed in a third.
 *
 * It is also why "switching to On focus change must not preserve an old delay"
 * needs no special case. A `delay`-tagged timer asks this about `delay`, gets
 * `false` under `onFocusChange`, and returns — refused by the clause that
 * authorises delays rather than by a general "is auto save on".
 *
 * Pure, so a test reads it directly with no clock in the way.
 */
export function policyPermits(
  mode: AutoSaveMode,
  trigger: AutoSaveTrigger
): boolean {
  if (mode === 'afterDelay') return trigger === 'delay';
  if (mode === 'onFocusChange') return trigger === 'blur';
  // 'off', which is the shipped default: nothing is saved on a timer at all.
  return false;
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
  /**
   * PHASE 277. A policy change reached this window. Re-arm what is pending,
   * and nothing else. The store's one subscription to the settings store calls
   * it; see the comment beside the `createAutoSave` literal there.
   */
  notePolicyChanged(): void;
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
 *
 * PHASE 277 changed the map's VALUE and deleted a set. The value now carries
 * the trigger that armed the timer, so `run` can re-ask permission for that
 * trigger instead of asking nothing (audit F2). The in-flight set is gone
 * because ./tab-io serialises every save of every kind now; see the header.
 */
export function createAutoSave(deps: AutoSaveDeps): AutoSaveController {
  const timers = new Map<string, { handle: unknown; trigger: AutoSaveTrigger }>();
  const stopped = new Map<string, AutoSaveStopWhy>();
  /** How many times `disposeAll` has run, so a save still in the air cannot re-arm after it. */
  let disposals = 0;
  /** Tabs auto save has WRITTEN. The eviction filter's new term. */
  const wrote = new Set<string>();

  const cancelTimer = (id: string): void => {
    const timer = timers.get(id);
    if (timer === undefined) return;
    deps.clearTimer(timer.handle);
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

  const run = (id: string, trigger: AutoSaveTrigger): void => {
    // Consume the handle this run came from. A `blur` run never entered the
    // map — `noteBlur` calls `run` synchronously — and under `onFocusChange` no
    // `delay` timer can be waiting, because `arm` refuses to create one and the
    // store's subscription calls `notePolicyChanged` in the same turn as the
    // change, so there is no window where one survives the switch. A future
    // deferred-blur path would have to register an entry of its own here rather
    // than inherit this one.
    //
    // WHAT IT WOULD COST IF THAT STOPPED BEING TRUE, stated so it is a known
    // bound rather than a surprise: a blur run would drop a pending delay's
    // entry without clearing its handle, and that timeout would still fire and
    // still be refused below, but `forget` and `disposeAll` would no longer
    // know how to cancel it. No save, one stray timeout.
    timers.delete(id);
    // A question on screen is a person being asked something. A timer writing
    // underneath it would answer for them.
    if (deps.blocked()) {
      // PHASE 277. A BLOCKED DELAY RE-ARMS. Before this it dropped, silently
      // and permanently: the handle was consumed above, `blocked()` was asked
      // here, and nothing re-armed when the dialog closed. And `blocked()` is
      // GLOBAL — the store reads `useApp.confirm !== null` — so closing dirty
      // tab A raises "Save changes to 'A'?" and, while the person reads it,
      // killed the pending timer of every OTHER dirty tab for good. Every
      // confirm in the app did that: tree delete and overwrite, End session,
      // Remove, Close project, SCM discard.
      //
      // Through `arm` and never a raw timer, so "the policy changed while a
      // dialog blocked it" needs no extra code at all: Off arms nothing, On
      // focus change arms nothing, a changed delay is honoured, and a tab that
      // went clean under the dialog fails `eligible` and arms nothing. `arm`'s
      // own `cancelTimer` is a no-op here because the line above already
      // consumed the handle, so the map still holds at most one timer per tab.
      //
      // THE COST, so nobody has to guess it later: while a confirm is on
      // screen each eligible dirty tab re-arms once per delay period. One
      // timeout per tab per delay — no save, no toast, no IPC. At the 250 ms
      // floor (MIN_AUTO_SAVE_DELAY_MS) that is four timeouts a second per dirty
      // tab, and confirms are transient.
      //
      // A blocked BLUR run drops, and that is correct rather than an oversight:
      // the gesture is over, focus is already somewhere else, and the next blur
      // is the retry.
      if (trigger === 'delay') arm(id);
      return;
    }
    // The skip reason may have MOVED while the timer ran: the tab can have
    // gone clean, been closed, or had its project closed under it.
    if (!eligible(id)) return;
    // PHASE 277, AND IT IS THE LAST STATEMENT BEFORE THE HAND-OFF, deliberately.
    // This is the last synchronous moment this module owns: the IIFE below runs
    // to its first await, and `deps.save(id)` is evaluated BEFORE that await, so
    // nothing can change between this question and the call. It asks about the
    // trigger that armed this timer rather than "is auto save on", which is what
    // makes a delay surviving a switch to On focus change refuse itself.
    if (!policyPermits(deps.policy().mode, trigger)) return;
    // No in-flight test, and no set to keep one in. ./tab-io's `withSaveSlot`
    // holds one slot per open buffer, and it answers a timer's request made
    // while a save is running with `false` at once rather than remembering it.
    const epoch = disposals;
    void (async () => {
      if (await deps.save(id)) wrote.add(id);
      // PHASE 277 FIX ROUND. A DELAY WHOSE SAVE LEFT THE TAB DIRTY IS RE-ARMED,
      // through `arm`, and this line is the other half of that refusal.
      //
      // As the phase first built it, a timer that fell due during a running
      // save was QUEUED in ./tab-io, and the queued request ran a whole write
      // later with nothing asked again. Both verifiers drove it: it wrote after
      // the person switched to Off, it wrote under "Save changes to
      // 'notes.md'?" and under the stale dialog a ⌘S had raised, and it wrote
      // into a tab reopened in between. The checks above had been asked before
      // the wait, not before the write. Dropping the request instead is the
      // parent's own defect — the newer typing never written. So the request
      // is refused and the TIMER comes back: `arm` re-reads the mode, the
      // delay and the skip list, and when it next falls due `run` asks the
      // dialog and the policy again, exactly as it did the first time.
      //
      // Deferred, never unasked, and the same shape as a blocked delay above.
      // Only a `delay`: a blur is a gesture that is over and the next blur is
      // its retry, and a blur's save may not turn into a clock after a switch
      // to After a delay, because switching auto save on arms nothing for a
      // tab that is already dirty. Only when no timer is pending, because
      // typing during the write armed one already and re-arming it would push
      // that deadline back. Only for a controller that has not been disposed
      // since this save started. A tab that went clean, closed or stopped
      // fails `eligible` and arms nothing, so a stop never comes back as a
      // retry.
      //
      // THE COST, stated: while a save of this buffer is running, a timer that
      // falls due re-arms once per delay period. One timeout, no write, no IPC.
      // A save refused for a reason that records no stop re-arms the same way;
      // every refusal ./tab-io gives a timer on an eligible tab records one,
      // except a tab with no working model, which is refused before any IPC.
      if (trigger === 'delay' && epoch === disposals && !timers.has(id)) arm(id);
    })();
  };

  const arm = (id: string): void => {
    cancelTimer(id);
    if (!policyPermits(deps.policy().mode, 'delay')) return;
    if (!eligible(id)) return;
    timers.set(id, {
      handle: deps.setTimer(() => {
        run(id, 'delay');
      }, deps.policy().delayMs),
      // Recorded rather than assumed. Every entry is 'delay' today, because a
      // blur runs synchronously and enters no map; the field is what stops a
      // future deferred-blur path inheriting a delay's permission by accident.
      trigger: 'delay'
    });
  };

  return {
    noteChanged(id) {
      // Every content change re-arms, so a save lands on a SETTLED buffer.
      // `markDirty` is already called per keystroke (MonacoHost.tsx:341), so
      // the signal exists and no second listener is needed.
      arm(id);
    },

    noteBlur(id) {
      if (!policyPermits(deps.policy().mode, 'blur')) return;
      if (deps.blocked()) return;
      if (!eligible(id)) return;
      run(id, 'blur');
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

    notePolicyChanged() {
      // PHASE 277, audit F2. RE-ARM WHAT IS PENDING, AND NOTHING ELSE.
      //
      // `arm` re-reads BOTH fields, so four transitions fall out of one loop:
      // After a delay → Off and After a delay → On focus change each cancel and
      // then refuse; a changed delay reschedules; and switching auto save ON
      // arms nothing, because only ids that ALREADY hold a timer are visited.
      //
      // THAT LAST ONE IS A CHOSEN DIFFERENCE rather than an omission, so a
      // later round does not "finish" it. VS Code's `EditorAutoSave` saves
      // every dirty editor the moment auto save is switched on. Tortie does
      // not: a person's open files are not opted into timed writes by a change
      // of setting alone, which is the same posture as the shipped default of
      // Off (src/shared/settings.ts). The trigger stays a keystroke or a blur.
      //
      // A CHANGED DELAY RESCHEDULES FROM NOW, not from the last keystroke,
      // because the map holds a handle and no arm time. So shortening the delay
      // extends the current wait slightly instead of firing sooner. Decided
      // rather than overlooked: an arm timestamp buys a few hundred
      // milliseconds of precision on a gesture nobody times, and the setting's
      // own caption promises a wait after you stop typing rather than a
      // deadline computed from a number you have just replaced.
      //
      // The snapshot is load-bearing. `arm` deletes the key and sets it again,
      // which moves it to the END of a Map's iteration order, so a loop over
      // the live map would reach the same id again and again.
      for (const id of [...timers.keys()]) arm(id);
    },

    forget(id) {
      cancelTimer(id);
      stopped.delete(id);
      wrote.delete(id);
    },

    touched(id) {
      return wrote.has(id);
    },

    stoppedFor(id) {
      return stopped.get(id);
    },

    disposeAll() {
      disposals += 1;
      for (const id of [...timers.keys()]) cancelTimer(id);
      stopped.clear();
      wrote.clear();
    }
  };
}
