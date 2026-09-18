/**
 * The press (Phase 227): what happens between a chord and the one call site.
 *
 * A rewind or an undo is one function, pure of React and of the DOM. It takes
 * the change under focus as a FUNCTION so the view can hand it the live
 * `activeElement`, the one call site (./redline-write) as a function so this
 * module names no bridge, and the refusal as a function so the sentence
 * (./redline-sentences) stays the view's. What it owns is the ORDER, and one
 * rule of that order is why the module exists:
 *
 * THE JOURNAL RECORDS THE IDENTITY THAT WAS PRESSED, NEVER THE ONE UNDER
 * FOCUS WHEN THE WRITE RETURNS. As first shipped the view read
 * `focusedChange(host)` a second time after `await applyRewind(...)` to build
 * the journal entry. A press is two IPC round trips, and the Phase 227
 * verifier moved the focus inside that window with ⌥↓ and drove it through
 * the real chord: E0 was rewound on disk and the journal held E1, so undo
 * answered "no longer in the file" and E0's rewind was recoverable from
 * nothing Tortie keeps, which is the exact A8a loss the journal exists to
 * guard; and with the focus moved onto a pure insertion, undo WROTE that
 * insertion a second time, bytes never in the file. So `pressed` is read once,
 * before any await, and the entry the journal takes after the write is that
 * same object. `npm run conformance:redline` rule 8's seventh arm runs this
 * module under node with a fake call site that moves the focus while it is
 * awaited, and its ablation is the first shape put back.
 *
 * Undo pops the ENTRY it wrote back, by reference, and never "the top",
 * because a rewind pressed while an undo is in flight would otherwise have
 * its own entry popped by the undo that did not write it.
 *
 * PHASE 282. ONE PRESS AT A TIME, and the holds that say so. A rewind is two
 * IPC round trips and the mark does not move until its write has landed, so a
 * second chord inside that window named THE CHANGE BEING REWOUND: the review
 * drove ⌥⌫ then ⌥↩ back to back, the accept took the change, the rewind still
 * landed and the change was drawn backwards with nothing said, and ⌥⌫ ⌥⌫
 * answered `stale` or `alreadyBack` depending on the interleaving. So a rewind
 * pushes a {@link RewindHold} before its await, and a second rewind of the same
 * change answers `held` before it reads a byte. The holds are the VIEW's, one
 * array per mount, handed in as an optional dependency so every other caller
 * behaves exactly as it did; this module owns only where in the order they are
 * asked (build/p282/SPEC.md §1.4).
 *
 * It names no bridge and writes nothing, so it is scanned by rule 9 with the
 * other redline modules.
 */

import { lastRewind, popRewind, recordRewind } from './redline-journal';
import type { RewindJournalEntry } from './redline-journal';
import type { RewindRefusal } from './rewind';
import type { RewindContext, RewindOutcome } from './redline-write';

/**
 * What a press carries, read off the focused wrapper's own attributes rather
 * than off any list in memory, so a press is bound to exactly the picture
 * the person is looking at, generation included (research 83 B.8a).
 */
export interface PressedChange {
  off: number;
  del: string;
  ins: string;
  generation: number;
}

/** The live tab's fields the press needs, read fresh at the press. */
export interface PressTab {
  /** The tab id, which keys the journal. */
  id: string;
  /** The open project root, absolute. */
  root: string;
  /** The file, absolute. */
  path: string;
  /** The shadow baseline the view draws against. */
  baseline: string;
  /** The baseline generation now. */
  generation: number;
  /** Unsaved edits in the buffer (research 83 E.6). */
  dirty: boolean;
}

/**
 * PHASE 282. A rewind this view pressed whose change the picture may still
 * draw.
 *
 * It lives from the press until the picture no longer draws that change, which
 * is LONGER than the write: when the tab trailed disk at the press,
 * `adoptWritten` refuses and the picture keeps drawing the rewound change byte
 * for byte until the watcher's round trip redraws it (1,139 ms measured by PR
 * 28's own probe before the adoption existed). A hold that ended with the write
 * would leave exactly that second open to the accept that draws the change
 * backwards.
 */
export interface RewindHold {
  /** The identity the rewind was made from: the very object the journal records. */
  readonly pressed: PressedChange;
  /**
   * Null while the write is in the air. Once it has landed: the tab's
   * `savedContents` right after the adoption, and the bytes the write
   * replaced.
   */
  landed: { saved: string; was: string } | null;
}

/** The whole triple, which is what a press resolves by (./rewind `resolvePress`). */
function samePress(a: PressedChange, b: PressedChange): boolean {
  return a.off === b.off && a.del === b.del && a.ins === b.ins;
}

/**
 * Is a rewind of this change already in flight or still drawn?
 *
 * `off`, `del` AND `ins`, and deliberately not ./redline-current `sameChange`,
 * which leaves `ins` out so typing keeps the controls in place. A hold asks
 * the question a PRESS asks: the same span rewritten to different words is an
 * agent's new change, and rewinding it is a new press.
 */
export function pressIsHeld(
  holds: readonly RewindHold[],
  pressed: PressedChange | null
): boolean {
  return pressed !== null && holds.some((hold) => samePress(hold.pressed, pressed));
}

/**
 * The write landed: record what the tab holds now and what the write replaced,
 * which is what {@link releaseHolds} compares a later read against. The hold is
 * found by REFERENCE, because `pressed` is the object {@link pressRedline}
 * pushed and handed back as `entry`, so two presses that happen to carry equal
 * identities can never land each other's hold.
 */
export function landHold(
  holds: readonly RewindHold[],
  pressed: PressedChange,
  saved: string,
  was: string
): void {
  const hold = holds.find((h) => h.pressed === pressed);
  if (hold !== undefined) hold.landed = { saved, was };
}

/**
 * Let go of every landed hold whose change the picture no longer draws, in
 * place. Asked by the view after every redraw.
 *
 * - A hold still in the air is NEVER let go by a draw: the picture cannot have
 *   caught up with a write that has not happened. Only the press itself ends
 *   it, on a refusal or a throw.
 * - A DIRTY TAB DOES NOT LET A LANDED HOLD GO, AND PHASE 282.1 IS WHY THIS IS
 *   SAID RATHER THAN LEFT UNSAID. Phase 282's fix round added a third clause
 *   here — a landed hold released at once when the tab is dirty — because both
 *   clauses below wait for a READ, `refreshRepo` (./tab-io) skips a dirty tab
 *   by rule, and so a rewind whose adoption refused followed by one keystroke
 *   left every accept on the tab answering `held` for the life of the mount.
 *   The reverify drove that clause one step further, through these modules
 *   and the shipping store: the released hold let ⌥↩ ACCEPT the change the
 *   person had just rewound (the picture still drew it from the buffer), which
 *   moved the baseline onto the agent's words while the disk held the
 *   rewind; the moment the tab was clean again — ⌘Z on the keystroke, then the
 *   watcher's read; or the tab closed and reopened with its persisted baseline
 *   — the change was drawn BACKWARDS, the agent's words struck through and the
 *   person's own rewind as the insertion, and the next ⌥⌫ in the rhythm wrote
 *   the agent's words back into the file. With the hold kept, the same steps
 *   end with the change gone and nothing drawn backwards. So the premise
 *   "a hold buys nothing on a dirty tab" was false: it buys exactly the
 *   refusal of that accept. The cost is the one the fix round objected to —
 *   an accept on a dirty tab whose rewind has not reached the picture is
 *   refused until the tab is saved or its edits undone — and the view's
 *   sentence for that case now names both ways out (./redline-sentences
 *   `acceptDirty`). The clause the fix round added is gone, and this function
 *   takes no `dirty` at all so it cannot come back by an argument.
 * - A landed hold goes when no drawn change equals it on all three fields —
 *   the redraw the rewind was waiting for.
 * - OR when the tab has read bytes that are neither what it held right after
 *   the adoption nor the bytes the write replaced. That is a file somebody
 *   wrote after the rewind, so a change drawn with the same words is theirs;
 *   without this clause an agent writing the same phrase again from its own
 *   copy of the file would block every accept on the tab until the view was
 *   opened again. The `was` exception is a watcher read whose descriptor was
 *   opened before the guarded write's rename: it answers the old inode's bytes,
 *   which are exactly `was` because main's compare-and-swap proved the file
 *   held them immediately before the rename, and letting go on it would open
 *   the window the hold exists to close.
 */
export function releaseHolds(
  holds: RewindHold[],
  drawn: readonly (PressedChange | null)[],
  saved: string
): void {
  for (let at = holds.length - 1; at >= 0; at -= 1) {
    const hold = holds[at] as RewindHold;
    if (hold.landed === null) continue;
    const stillDrawn = drawn.some((id) => id !== null && samePress(id, hold.pressed));
    const newer = saved !== hold.landed.saved && saved !== hold.landed.was;
    if (!stillDrawn || newer) holds.splice(at, 1);
  }
}

/** Take this press's own hold back out, by reference. */
function dropHold(holds: RewindHold[] | undefined, hold: RewindHold): void {
  if (holds === undefined) return;
  const at = holds.indexOf(hold);
  if (at !== -1) holds.splice(at, 1);
}

export interface PressDeps {
  /** The change under focus NOW. Called once, before any await. */
  focused: () => PressedChange | null;
  /** The one call site, injected so this module names no bridge. */
  apply: (ctx: RewindContext) => Promise<RewindOutcome>;
  /** Say the refusal. The view turns the word into a sentence. */
  refuse: (why: RewindRefusal) => void;
  /**
   * PHASE 282. The view's holds, asked and taken by a REWIND only. Optional,
   * so a caller that hands none — the gates' arms, the probes, the older
   * suites — holds nothing and is never held.
   */
  holds?: RewindHold[];
}

export type PressResult =
  /** Nothing was under focus, or nothing to undo: no read, no write, no word. */
  | { outcome: 'nothing' }
  /**
   * PHASE 282. A rewind of this change is already in flight or still drawn:
   * no read, no write, no journal. The view says so; it is not a refusal word.
   */
  | { outcome: 'held' }
  | { outcome: 'refused'; why: RewindRefusal }
  /**
   * The write landed; `entry` is the identity it was made from, and
   * `contents`/`was` are the bytes main put on disk and the bytes the plan
   * read, which the view hands the tab so it can redraw now instead of
   * waiting for the watcher (./redline-write says why).
   */
  | {
      outcome: 'wrote';
      sha256: string;
      contents: string;
      was: string;
      entry: RewindJournalEntry;
    };

/**
 * One rewind or undo, in press order: the dirty refusal, the identity read
 * ONCE, the one call site awaited, then the journal moved with that same
 * identity. The generation guard and the re-read are the call site's own.
 *
 * PHASE 282 put the holds into that order and nowhere else: after `nothing`,
 * so an empty chord is still silent, and before the await, so the second chord
 * of a pair can never race the first one's read.
 */
export async function pressRedline(
  kind: 'rewind' | 'undo',
  tab: PressTab,
  deps: PressDeps
): Promise<PressResult> {
  // E.6. A rewind written while the tab is dirty is undone by the next save,
  // so the press is refused with a sentence instead.
  if (tab.dirty) {
    deps.refuse('dirty');
    return { outcome: 'refused', why: 'dirty' };
  }
  // The identity, read exactly once and before any await: a rewind takes the
  // change under focus, an undo takes the last rewind of this tab.
  const pressed: RewindJournalEntry | null =
    kind === 'undo' ? (lastRewind(tab.id) ?? null) : deps.focused();
  if (pressed === null) return { outcome: 'nothing' };
  // PHASE 282. AN UNDO NEITHER ASKS NOR TAKES A HOLD: it names no drawn change,
  // it pops the journal's own entry by reference, and a write racing it is
  // refused by the channel. A rewind of the same change answers `held` and
  // reads nothing; a rewind of a DIFFERENT change goes ahead, because a rewind
  // never moves the baseline and the guarded write refuses the loser of two.
  const holds = kind === 'rewind' ? deps.holds : undefined;
  if (holds !== undefined && pressIsHeld(holds, pressed)) return { outcome: 'held' };
  // Pushed BEFORE the await, so the chord that arrives while this one is
  // waiting on main is the one that is held; and the object pushed is the one
  // returned as `entry`, so the view lands exactly this hold.
  const hold: RewindHold = { pressed, landed: null };
  holds?.push(hold);
  let outcome: RewindOutcome;
  try {
    outcome = await deps.apply({
      root: tab.root,
      path: tab.path,
      baseline: tab.baseline,
      generation: tab.generation,
      drawnGeneration: pressed.generation,
      pressed: { off: pressed.off, del: pressed.del, ins: pressed.ins },
      kind
    });
  } catch (error) {
    // A throw wrote nothing the view will ever redraw, so nothing would ever
    // let this hold go and every accept on the tab would be held for good.
    dropHold(holds, hold);
    throw error;
  }
  if ('refused' in outcome) {
    // A refused write changed no byte, so the change is still drawn and still
    // the person's to press again.
    dropHold(holds, hold);
    deps.refuse(outcome.refused);
    return { outcome: 'refused', why: outcome.refused };
  }
  // The journal takes the identity the write was made from. The focus may
  // have moved while the write was awaited; that change was not rewound.
  if (kind === 'rewind') recordRewind(tab.id, pressed);
  else popRewind(tab.id, pressed);
  // A landed rewind KEEPS its hold: the bytes are on disk but the picture may
  // still draw the change, and only the view can see it go (`landHold`, then
  // `releaseHolds` after the redraw).
  return {
    outcome: 'wrote',
    sha256: outcome.wrote,
    contents: outcome.contents,
    was: outcome.was,
    entry: pressed
  };
}
