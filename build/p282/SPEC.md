# Phase 282 — the press that moves on

**This file decides. It is not a survey.** The spec author read `docs/BACKLOG.md`'s `## Phase 282` entry,
`build/p277/SPEC.md`, PR 28's diff (`c1fe5fd3..pr/28 -- src build`) and the reviewers' hostile tests, at
`9217ae0d` (PR 28's head with `origin/main` merged). Every ruling below names the file and the line at
`9217ae0d` it lands on. Where two answers were on the table, one is written here and the other is refused by
name.

Charter: `docs/BACKLOG.md` `## Phase 282`. `build/p277/SPEC.md` binds the save half, and nothing here
reopens its completion rule, its slot or its timer rules.

**The words are PR 28's author's.** Every request quoted in this phase is John Berryman's (JnBrymn,
"PR 28's author"), never "the operator's". §4 lists every site that says otherwise.

**Measured feasible before it was written down.** In the spec author's own tree at `9217ae0d`, a prototype
of every ruling below turned all 35 red-first tests green (§6) with `npm run typecheck` at 0 errors, the
editor suites `p22*` to `p25*` with `adopt-written` (35 files, 496 tests) and `p1*`, `p26*`, `p27*` and
`audit-*` (18 files, 233 tests) green, `conformance:save` OK, `ablation:p268` 18 of 18,
`conformance:redline-write` 17 of 17 ablations, and `conformance:redline` red on rule 40 alone (the two
clauses §9 tells the gate authors to rewrite). The prototype is evidence that the rulings compose,
not a patch to apply: `/private/tmp/claude-501/-Users-gdc-gmux/69469eba-62a7-4552-8d1e-1ba54287a99f/scratchpad/p282-spec-prototype.patch`.
Builders write their own code in the house voice.

---

## 0. The three sentences this phase answers for

**The one-press rule.** *From a rewind's press until the picture no longer draws the change it rewound, a
second rewind of that change and every accept on that tab are refused with a sentence and touch nothing; a
key repeat of a verb is not a press.*

**The move.** *A landed accept or rewind moves to the change that was drawn after the pressed one, found
again by its identity after the redraw, and falls back to the index only when that change is no longer
drawn.*

**The typing.** *The tab is dirty the moment an edit is dispatched, the working model is built from the bytes
the tab holds after the chunk has loaded, and a text typed on a picture that was replaced meanwhile is never
applied.*

---

## 1. THE ONE-PRESS RULE (entry mechanism 3)

### 1.1 The ruling: REFUSE WITH A SENTENCE. Holding the press and replaying it is refused.

Option (b), holding the press and acting on the change the move lands on, acts on a change the person has
not yet seen marked, and research 83 B.8a binds every press to the picture in front of the person; a
per-change accept has no undo, and the replay can fire a whole watcher round trip (1,139 ms, measured by
PR 28's own probe before the adoption) after the chord, behind whatever an agent wrote in between. Option (a)
costs one more press inside a window one rewind write wide (26 ms in the review's app run), or one watcher
round trip when the tab trailed disk and the adoption refused, and it says why; so it has fewer ways to
surprise a person. **RULED: (a).**

### 1.2 What is refused, exactly

| Press, while a hold exists on the tab | Answer | Why |
| --- | --- | --- |
| ⌥⌫ on the SAME change (`off`, `del` AND `ins` equal to a hold's `pressed`) | `held`, no read, no write | It would re-read, find the change already back or race the first write; either way the person pressed twice. The review drove it answering `stale` or `alreadyBack` depending on the interleaving |
| ⌥⌫ on a DIFFERENT change | goes ahead | A rewind never moves the baseline, and the guarded write refuses the loser of two writes with its own sentence. The red-first test drives exactly this |
| ⌥↩ on the SAME change | `held` | The review's RACE A: accepted, the rewind landed, the change was drawn backwards with nothing said |
| ⌥↩ on a DIFFERENT change | `held` | **An accept moves the baseline, and a moved baseline moves the rewound change's `off`**: the hold would stop recognising it, and the next ⌥↩ could take it. Found by reading while writing this spec, not driven: an accept of a change ABOVE the rewound one shifts the rewound change's `off`, a redraw would let its hold go, and ⌥↩ on it would draw it backwards once the write lands |
| Accept all (button or Edit menu) | `held` | `shownRef.current` still holds the rewound change's insertion, and accept-all takes it wholesale |
| ⌥⇧⌫ (undo) | goes ahead, takes no hold, asks none | Out of scope by the entry. It names no drawn change, it pops the journal's own entry, and a racing write is refused by the channel |
| ⌥↓ / ⌥↑ | goes ahead | Walking writes nothing |

### 1.3 The sentences — `src/renderer/editor/redline-sentences.ts`, beside `redlineUndoRefusalSentence` (`:177`)

```ts
export function redlineHeldSentence(verb: 'rewind' | 'accept', name: string): string;
```

| verb | Words, verbatim |
| --- | --- |
| `rewind` | `That change in {name} is already being rewound.` |
| `accept` | `A change in {name} is still being rewound, so nothing was accepted.` |

One sentence for a per-change accept and for accept-all, because both are refused for the same reason and the
per-change one may name a different change from the one being rewound. `RewindRefusal` in `./rewind` does NOT
gain a word: a hold is not a refusal of the plan, it is the press not being made, so it is its own outcome.

### 1.4 Where the holds live and who reads them

**In the VIEW, per mount, as a ref:** `const rewindHolds = useRef<RewindHold[]>([])` beside
`advanceAfterPress` (`RedlineDocument.tsx:292`), replaced with `[]` in the existing `tab.id` effect
(`:344-346`) because the component is reused across tabs (`EditorPanel.tsx:813` has no `key`).

Refused alternatives, by name:

- **Module state in `./redline-press`**, like `./redline-journal`. Refused: a hold must end when the view that
  drew the picture ends, and a module map outlives the mount, so a remount could inherit a hold whose release
  depends on a redraw it never saw. The journal needed `store.ts` to forget it on close (Phase 244); a hold
  needs no store at all.
- **A `RewindRefusal` word `held`.** Refused in §1.3.

**The order is the press modules', not the view's.** Both take the holds as an OPTIONAL dependency, so every
existing caller (`p227-redline-press.test.ts`, `p244-inherited-undo.test.ts`, `build/redline-accept-probe.mts`,
`build/redline-rewind-probe.mts`, `conformance:redline` rule 8's arm) compiles and behaves unchanged.

`src/renderer/editor/redline-press.ts`:

```ts
/** PHASE 282. A rewind this view pressed whose change the picture may still draw. */
export interface RewindHold {
  readonly pressed: PressedChange;
  /** Null while the write is in the air. Once it has landed: the tab's `savedContents` right after the adoption, and the bytes the write replaced. */
  landed: { saved: string; was: string } | null;
}
export function pressIsHeld(holds: readonly RewindHold[], pressed: PressedChange | null): boolean;   // off, del AND ins
export function landHold(holds: readonly RewindHold[], pressed: PressedChange, saved: string, was: string): void; // finds the hold whose `pressed` IS this object (===)
export function releaseHolds(holds: RewindHold[], drawn: readonly (PressedChange | null)[], saved: string): void;   // in place
```

- `PressDeps` (`:67-74`) gains `holds?: RewindHold[]`. `PressResult` (`:76-92`) gains `| { outcome: 'held' }`.
- `pressRedline` (`:99-139`), in this order, which is the order the red-first tests pin:
  1. the `dirty` refusal, unchanged and still FIRST;
  2. `pressed` read once, unchanged; `null` answers `nothing`, unchanged;
  3. **for `kind === 'rewind'` only**: if `deps.holds` is given and `pressIsHeld(deps.holds, pressed)`, return
     `{ outcome: 'held' }` — no `apply`, no refuse, no journal;
  4. **for `kind === 'rewind'` only**: push `const hold = { pressed, landed: null }` BEFORE `await deps.apply`;
  5. the await, wrapped so a throw removes that hold (by reference) and rethrows;
  6. a `refused` outcome removes that hold (by reference) before `deps.refuse`;
  7. a `wrote` outcome keeps it. The journal lines are unchanged.
- `releaseHolds`: a hold with `landed === null` is NEVER released by a draw (only step 5 or 6 end it). A
  landed hold is released when no drawn identity equals its `pressed` on `off`, `del` and `ins`, **or** when
  `saved !== landed.saved && saved !== landed.was`.
  - The second clause is what stops an agent that writes the same phrase again, from its own copy of the
    file, from blocking EVERY accept on the tab until the view remounts.
  - The `was` exception is what stops a watcher read that opened the file before the guarded write's
    `renameSync` from letting go too early: the old inode's bytes are exactly `was`, because main's
    compare-and-swap proved the file held `was` immediately before the rename.

`src/renderer/editor/redline-accept.ts`: `AcceptDeps` (`:61`) gains `holds?: readonly RewindHold[]`;
`AcceptResult` (`:72`) gains `| { outcome: 'held' }`. In `pressAccept` (`:94`), AFTER the existing
`kind === 'one' && pressed === null` → `nothing` line (so the chord from an empty document is still a silent
no-op) and BEFORE `planAccept`: `if (deps.holds !== undefined && deps.holds.length > 0) return { outcome: 'held' };`
— for both kinds. Accept-all never calls `focused()`, unchanged.

### 1.5 The view's duties — `src/renderer/editor/RedlineDocument.tsx`

1. `press` (`:408-487`) passes `holds: rewindHolds.current` in the `pressRedline` deps. On `held`, it toasts
   `redlineHeldSentence('rewind', live.name)` at `'info'` and returns.
2. `press`, on `wrote`, **in this order**: focus the host if the keyboard is inside a change wrapper (§1.7);
   `adoptWritten(...)` (existing, `:465-467`); then, for `kind === 'rewind'`, re-read the live tab from the
   store and `landHold(rewindHolds.current, result.entry, now.savedContents, result.was)`. `result.entry` is
   the very object `pressRedline` pushed (`redline-press.ts:112-137`), so the reference match is exact.
3. `accept` (`:530-601`) passes `holds: rewindHolds.current` in the `pressAccept` deps. On `held`, it toasts
   `redlineHeldSentence('accept', live.name)` and returns, moving nobody and refocusing nothing.
4. **A new `useLayoutEffect`**, its own, with dependencies `[composed, tab.savedContents]`:
   `releaseHolds(rewindHolds.current, host === null ? [] : changeElements(host).map(identityOf), tab.savedContents)`.
   `tab.savedContents` is a dependency because a watcher read can move it without changing the composed
   picture (a dirty buffer is drawn instead), and the release must still be asked.

### 1.6 A KEY REPEAT IS NOT A PRESS. A repeat may not write, and may not accept.

A held ⌥⌫ fires a repeated keydown every 30 to 50 ms with `event.repeat` true. Before PR 28 the second
keydown found nothing current and did nothing; with the move-on, every repeat lands on the next change, so a
held ⌥⌫ became "rewind every change in the file, writing it once per change", and a held ⌥↩ became the
accept-all chord `keymap.ts`'s `redline.accept` entry removed on purpose ("a person must never be one
keystroke from accepting everything").

**RULED:** `RedlineDocument.tsx` exports, beside `redlineCommandOf` (`:229-245`):

```ts
/** PHASE 282. Whether a REPEATED keydown of this command runs it: a walk does, a verb does not. */
export function redlineRepeatRuns(command: RedlineCommand): boolean;   // true for 'next' and 'prev' only
```

and the scroller's `onKeyDown` (`:982-987`) becomes, in this order: decode; `null` returns; `preventDefault()`;
`if (event.repeat && !redlineRepeatRuns(command)) return;`; `runCommand(command)`.

- The `preventDefault()` stays BEFORE the repeat test and is not optional: an unprevented ⌥⌫ in the
  `plaintext-only` document is Chromium's `deleteWordBackward`, so a consumed repeat that fell through would
  delete a word of the person's text through ./redline-edits.
- A consumed repeat says nothing, and that is not a silent refusal. The press was answered on its first
  keydown — acted, or refused with its own sentence — and the repeats are that same press still held; a
  sentence per repeat would be a toast every 30 to 50 ms.
- Undo is a verb and does not repeat either: each repeat of ⌥⇧⌫ would pop and write another rewind.
- The Edit menu rows carry no accelerator (`keymap.ts` comments at the `redline.*` entries), so the chord
  handler is the only road a repeat can take. The chip buttons and the menu are clicks.

### 1.7 THE REWIND KEEPS THE KEYBOARD (entry mechanism 4)

In `press`, on `wrote`, BEFORE `adoptWritten`:

```ts
const active = host.ownerDocument.activeElement;
if (active instanceof HTMLElement && host.contains(active) && active.closest(CHANGE_SELECTOR) !== null) {
  host.focus({ preventScroll: true });
}
```

`CHANGE_SELECTOR` is `./redline-current`'s (`:71`); import it rather than spelling `.ed-redline-change` again.
The accept's line (`:597`) focuses unconditionally because an accept can only come from this view; a rewind
can come from the Edit menu while the keyboard is in a terminal, and taking the keyboard out of a terminal
would be a new surprise. So the condition is "the keyboard is on a change wrapper this view is about to
replace". Why before the adoption, measured by the review: a rewind of the ONLY remaining change removes the
wrapper `c0`, Chromium sends focus to `document.body`, the layout effect has no follower to focus, and ⌥⇧⌫ —
the undo the face names — did nothing until a click. Undo is included because the entry names it and the
line is harmless there.

---

## 2. THE IDENTITY-FOLLOW ALGORITHM (entry mechanism 2)

### 2.1 What is recorded at the press — `src/renderer/editor/redline-current.ts`

```ts
export interface PressMove {
  verb: 'accept' | 'rewind';
  pressed: ChangeIdentity;
  /** The index the pressed change stood at among the changes drawn at the press. */
  at: number;
  /** The change drawn after the pressed one; the first when the pressed one was last and not the only one; null when it was the only one. */
  follower: ChangeIdentity | null;
  /** Whether the follower was drawn AFTER the pressed change (false when it came round to the first). */
  followerAfter: boolean;
}
export function pressMoveOf(
  verb: 'accept' | 'rewind',
  drawn: readonly (ChangeIdentity | null)[],
  pressed: ChangeIdentity | null
): PressMove | null;
```

- `at` = the first index whose drawn identity is `sameChange` with `pressed` (`:136`, `off` and `del`); none
  → `null`. `pressed === null` → `null`.
- `n = drawn.length`; follower index = `at + 1` when `at + 1 < n`, else `0` when `n > 1`, else none.
- `follower` = `drawn[followerIndex] ?? null` (a wrapper with no readable identity is `null` and takes the
  fallback). `followerAfter` = follower index exists and `> at`.

Both presses compute it from the picture BEFORE the press, from `changeElements(host).map(identityOf)`:
`press` before `await pressRedline`, `accept` before `pressAccept`. `advanceAfterPress` (`RedlineDocument.tsx:292`)
keeps its NAME (rule 40 reads it) and its type becomes `PressMove | null`. The arming clauses keep their
places and conditions exactly: the accept arms inside `result.outcome === 'accepted'` behind `kind === 'one'`
(`:591-596`); the rewind arms for `kind === 'rewind' && result.outcome === 'wrote'` (`:476-483`); an undo and
accept-all arm nothing. `indexOfChange` leaves the view's imports.

### 2.2 How the landing is found after the redraw

```ts
export function landingAfterPress(
  drawn: readonly (ChangeIdentity | null)[],
  move: PressMove
): number | 'wait' | null;
```

In this order:

1. **WAIT** while some drawn identity equals `move.pressed` on `off`, `del` AND `ins`. That is the picture
   that has not caught up: an adoption that refused leaves the pressed change drawn byte for byte until the
   watcher redraws. **Not `sameChange`**, which is what PR 28 used: a change at the same span with different
   words is an agent's new change, and waiting on it parked the move until the person moved away.
2. **THE FOLLOWER.** If `move.follower !== null`: `shift = move.verb === 'accept' && move.followerAfter ?
   move.pressed.ins.length - move.pressed.del.length : 0`; `want = { ...move.follower, off: move.follower.off + shift }`;
   return the first index whose drawn identity is `sameChange(drawn, want)`.
   - An accept replaces `del` with `ins` in the BASELINE, so every later baseline offset moves by the
     difference. A follower that came round from the top sits before the accepted span and does not move.
   - A rewind writes the baseline's own bytes back into the FILE and leaves the baseline where it was, so
     nothing shifts, and an agent's write elsewhere in the file moves no baseline offset (policy Z).
   - `sameChange` (`off`, `del`) and not the triple, because the follower's words may have changed under an
     agent's write and it is still the change that came next.
3. **THE FALLBACK**, only when the follower is not drawn (merged away, split, or none): `indexAfterRemoval(drawn.length, move.at)` (`:227-235`).

`indexAfterRemoval` stays exported and unchanged in behaviour. **Its comment is corrected** (`:205-226`): it
claims both verbs "leave every other change in the order it was drawn in", and the review measured that
false twice — a rewind re-reads the file, so an agent's write above adds a change in front, and a redraw
re-cuts neighbours. It is now the fallback when the follower is gone, and says so.

### 2.3 The layout effect — `RedlineDocument.tsx:778-799`

Kept: its dependencies `[composed, generation, makeCurrent]`, `const pending = advanceAfterPress.current;`,
guard 1 exactly as written (`const standing = currentRef.current;` — a person who moved during the redraw
keeps their place, and the move is dropped), `advanceAfterPress.current = null;` before taking the element,
`makeCurrent(el); el.focus();`.

Replaced: the `stillDrawn` scan and the `indexAfterRemoval` call become ONE call,

```ts
const items = changeElements(host);
const landing = landingAfterPress(items.map(identityOf), pending);
if (landing === 'wait') return;
advanceAfterPress.current = null;
const el = landing === null ? null : (items[landing] ?? null);
```

so guard 2 (the pressed change still drawn) now lives inside `landingAfterPress` as `'wait'`, and
`indexAfterRemoval(` no longer appears in the view.

### 2.4 The cases, decided

| Case | Landing |
| --- | --- |
| The loop: the pressed change was last of several | the first remaining change (`follower` is index 0, found by identity; fallback `at % count` agrees) |
| The only change | nothing: `follower` null, fallback on an empty picture is `null`, and the keyboard stays where §1.7 left it |
| The last change, and the accept re-cuts two neighbours into one | the first change by identity — the index rule answered `"on"->"it"` |
| An agent's write above, on disk when ⌥⌫ is pressed | the follower by identity — the index rule answered the change before it |
| Change 3 of 4 accepted in a list | change 4 by its shifted identity — the index rule answered a merged bullet above |
| The adoption refused (the tab trailed disk) | `wait` until the watcher's redraw, then the follower |
| The person stepped away during the wait | dropped by guard 1, unchanged |

**Stated limits, not fixed:** when the follower is gone AND an agent's write above moved the count in the
same redraw, the index fallback can land one change off. And a keystroke typed into the pressed change
inside its own write makes the picture no longer draw it byte for byte, so the move proceeds to the follower
as ⌥↓ would (the tab is dirty then and the adoption refused).

---

## 3. THE TYPING PATH AND THE WATCHER (entry mechanisms 1, 5 and 6)

### 3.1 `src/renderer/editor/live-text.ts` goes back to main, byte for byte

Delete the PR's block at `:52-60` and return `return modelText ?? savedContents;`. The check is
`git -C /private/tmp/wt-p282 diff origin/main -- src/renderer/editor/live-text.ts` printing nothing. The line
bought no speed — `adoptWritten`'s patch and ./redline-edits' own model listener already redraw in the tick —
and it made every render of the Redline view read the model one keystroke ahead of the typing hook's
`lastLive`, which is the BLOCKING scramble (`p282-typing-burst.test.ts`, and `probe:p237` failing 5 checks in
the app). The commit body's claim that it was needed is dropped with it.

### 3.2 `src/renderer/editor/redline-edits.ts` — three clauses and one move, and nothing else

The hook as it is: the tab effect (`:182-192`), the outside-write effect (`:194-201`), the edit effect
(`:203-250`), the model listener (`:252-280`).

**(M) MOVE the edit effect above the outside-write effect**, below the tab effect. The tab effect stays FIRST
and its comment stays true. Reason, for the comment: the edit effect captures the picture the edit was typed
on from `lastLive.current`, and the outside-write effect is what moves `lastLive`; in a render where both an
edit and a new live text arrive, the capture must read the value from before that render. Neither effect
reads the other's refs otherwise, so nothing else changes order.

Inside the edit effect, in this order:

1. Unchanged: the `edits === written` early return, `written.current = state.edits`,
   `wanted.current = state.text`.
2. **NEW** `const typedOn = lastLive.current;` — the live text the picture was composed from.
3. Unchanged: `had`, `live`, `at`, `previous`, `continues` (which reads `live?.dirty` BEFORE step 4 marks
   it), `lastEdit.current = …`.
4. **(T1) VISIBLE BEFORE THE AWAIT.** `if (live !== undefined && !live.dirty) useEditor.getState().markDirty(tabId, true);`
   synchronously, before the `void (async () => …)()`. This is the clause that closes finding 7: with the
   tab dirty, `adoptWritten` (`tab-io.ts:1955`), `refreshRepo`'s clean arm (`:1882`, `:1889`) and
   `pressRedline`'s `dirty` refusal (`redline-press.ts:106`) all see the keystroke that is still in transit.
   It is provisional — step 7 re-derives it from the model with MonacoHost's own definition — and it goes
   through `markDirty`, never a patch, so `conformance:save` rule 14's order and Phase 277's "no literal
   dirty" rule are untouched.
5. **(T2) THE MODEL FROM THE BYTES AFTER THE AWAIT.** The `ensureWorkingModel` call passes, as `contents`, a
   function: `() => useEditor.getState().tabs.find((t) => t.id === tabId)?.savedContents ?? typedOn`. It was
   `live?.savedContents ?? state.text`, captured before a chunk load that can outlast a whole rewind.
6. If `model === null`: **NEW** `useEditor.getState().markDirty(tabId, false)` before the existing toast —
   there is no buffer, so step 4's mark is withdrawn — then return as today.
7. Unchanged: `if (!had) setModelTick(…)`. Then read `want = wanted.current` and
   `now = the live tab`; `if (want === null || now === undefined) return;`.
   **(T3) NEVER A TEXT TYPED ON A REPLACED PICTURE:** `if (!had && now.savedContents !== typedOn)` → re-derive
   `markDirty(tabId, model.getValue() !== now.savedContents)` and return WITHOUT `applyModelText`. Otherwise
   `applyModelText(model, want, !continues)` and `markDirty(tabId, want !== now.savedContents)` as today.
   - `!had` scopes it to the one await that is a chunk load. With a model already there the gap is a
     microtask, and no watcher reply or IPC answer can land inside it.
   - The cost, stated: the keystroke that replaced picture carried is gone — the face dropped it when the
     outside write arrived. T1 makes this arm unreachable by every path in the tree today (adoption and
     refresh both refuse a dirty tab, and `save` needs a model). It is the tripwire for the next path that
     moves `savedContents` under a dirty tab, and its test moves `savedContents` directly for that reason.

Refused, by name:

- **Rebasing the keystroke onto the replacing text** (map the edit's range through `mapOffset`). It is a
  second edit engine beside `./redline-typing`, for an arm T1 makes unreachable.
- **Marking dirty in the `beforeinput` handler.** `typingStep` answers the SAME state for an input it does
  not take (`redline-typing.ts:236-248`), so the handler cannot know an edit happened; the effect that sees
  `state.edits` move can.
- **A counter bumped by the outside-write effect and the model listener.** Found by reading `live-text.ts`'s
  150 ms debounce, not driven: the debounced echo of the hook's own write is indistinguishable from a
  replacement by text alone, and nulling `wanted` on it would drop a slow typist's keystroke at the
  boundary.

**A consequence, stated.** The Redline view is reused across tabs (`EditorPanel.tsx:813`), and the render that
changes the tab still holds the previous tab's typing state, so the edit effect runs once for the new tab with
stale `state.edits`. That is pre-existing: at `9217ae0d` it creates a model for the new tab with the new tab's
own text and leaves it clean, measured in a scratch harness. With T1 the new tab is dirty for that one
continuation and clean again after it. Not widened into.

### 3.3 `src/renderer/editor/monaco-loader.ts` — one signature

`ensureWorkingModel(key, contents: string | (() => string), path)` (`:253-270`): the function is called ONLY
when a model is created, AFTER the chunk has loaded, i.e. at `:269`'s `workingModel(...)` call. A string
behaves exactly as today. No other caller exists (`grep -rn ensureWorkingModel src`).

### 3.4 `refreshRepo` refuses a read that raced a newer baseline (entry mechanism 5) — `src/renderer/editor/tab-io.ts:1881-1902`

Capture `const savedBefore = before.savedContents;` beside `const model = getWorkingModel(tab.id);` (`:1883`),
before the read, and add `live.savedContents === savedBefore &&` to the reload condition (`:1887-1892`),
beside Phase 277's `!live.dirty` and `getWorkingModel(tab.id) === model`.

The comment says, in the house voice: `adoptWritten` moves `savedContents` and the model's text while leaving
the tab clean and the instance the same, so it passes both of Phase 277's questions; a read whose descriptor
was opened before the guarded write's `renameSync` answers the old inode's bytes after the adoption and rolled
the tab back (the review: 37 of 500 interleavings over the real main handlers, 0 of 500 without the
adoption). A read that raced a newer baseline is dropped, and the rename's own file event re-reads. It also
closes the same race for a save's completion, which moves `savedContents` the same way.

Refused: comparing the read's bytes with `adoptWritten`'s `was`. It names one writer; the clause names the
fact.

### 3.5 `adoptWritten` is NOT changed

Its two refusals (`tab-io.ts:1955`) stand as PR 28 wrote them. Refused: adopting a clean tab that merely
trailed disk before the press (which would shorten the stale window §1.4 holds across) — it would change the
refusal the entry's gate rules read, and the dirty arm keeps the window anyway.

---

## 4. CREDIT (entry mechanism 8)

Every site PR 28 added that credits its author's words to "the operator", at `9217ae0d`. "the operator's
ask / complaint" becomes "PR 28's author's ask / complaint"; "he/his" for the author becomes "PR 28's author";
quotations stay verbatim. Pre-existing house mentions of the operator (e.g. `tab-io.ts:141`, `:375`,
`:1907`, `store.ts:950`) are NOT his and do not move. The probe's `operatorCount` / "operator sessions on -L gmux"
(`probe-redline-move-on.mjs:48`, `:254-259`, `:720-721`) is the house idiom for the machine the probe runs on,
which is the operator's when the main session runs it, and stays.

| Owner | Sites |
| --- | --- |
| MOVE | `RedlineDocument.tsx:457`, `:468`, `:500`, `:524-525`; `redline-current.ts:167-170`, `:216`; `__tests__/p239-anchored-controls.test.tsx:201` |
| SAVE | `live-text.ts:52-59` (deleted by §3.1); `tab-io.ts:224`; `redline-write.ts:83`; `__tests__/adopt-written.test.ts:5` |
| PROBE | `build/probe-redline-move-on.mjs:3`, `:5`, `:34`, `:126` (a string), `:403`, `:534`, `:536`, `:607`, `:634`; `build/p249/probe-p249.mjs:932`; `build/redline-current-probe.mts:144`; `build/verification-checks.mjs:1295`, `:1306` |
| gate authors | `build/conformance-redline.mjs:496` |
| integrator | `CHANGELOG.md`, `docs/BACKLOG.md` (the PR's running-log lines, including the author's machine's `-L gmux` session count recorded as the operator's), the commit bodies |

---

## 5. THE NUMBERED RULES

### One press (H)

| # | Rule | File |
| --- | --- | --- |
| H1 | `pressRedline` answers `held` for a rewind whose pressed identity equals a hold's on `off`, `del` and `ins`, after the `dirty` refusal and the `nothing` answer, before any `apply`. | `redline-press.ts` |
| H2 | `pressRedline` pushes a hold for a rewind before its await and removes that same record when the outcome is not `wrote` or the await throws. | `redline-press.ts` |
| H3 | An undo neither asks nor takes a hold. | `redline-press.ts` |
| H4 | `pressAccept` answers `held`, per change or all, whenever a hold exists, after the `nothing` answer and before `planAccept`. | `redline-accept.ts` |
| H5 | `releaseHolds` never releases a hold still in the air; it releases a landed hold when no drawn identity equals it on all three fields, or when `saved` is neither `landed.saved` nor `landed.was`. | `redline-press.ts` |
| H6 | The view lands a hold after the adoption with the live tab's `savedContents` and the write's `was`, and releases holds in a layout effect keyed on `[composed, tab.savedContents]`. | `RedlineDocument.tsx` |
| H7 | A `held` answer toasts `redlineHeldSentence(verb, name)` and moves nobody. The two sentences are §1.3's, verbatim. | `RedlineDocument.tsx`, `redline-sentences.ts` |
| H8 | The holds ref is per mount and is replaced with `[]` when `tab.id` changes. | `RedlineDocument.tsx` |
| H9 | A repeated keydown runs only `next` and `prev`; the handler's `preventDefault()` stays before that test. | `RedlineDocument.tsx` |
| H10 | On `wrote`, `press` focuses the host before `adoptWritten` when the keyboard is on a change wrapper inside it. | `RedlineDocument.tsx` |

### The move (M)

| # | Rule | File |
| --- | --- | --- |
| M1 | `pressMoveOf` records `at`, the follower (next; first when last and not only; null when only) and `followerAfter`. | `redline-current.ts` |
| M2 | `landingAfterPress` waits while the pressed identity is drawn on all three fields. | `redline-current.ts` |
| M3 | It finds the follower by `sameChange` at `off + (ins.length - del.length)` for an accept whose follower came after, and at `off` otherwise. | `redline-current.ts` |
| M4 | It falls back to `indexAfterRemoval(count, at)` only when the follower is not drawn. | `redline-current.ts` |
| M5 | Both presses record the move from the picture before the press; the arming clauses and guard 1 are unchanged; `indexAfterRemoval(` does not appear in the view. | `RedlineDocument.tsx` |
| M6 | `indexAfterRemoval`'s comment no longer claims both verbs keep every other change in order. | `redline-current.ts` |

### Typing and the watcher (T, W)

| # | Rule | File |
| --- | --- | --- |
| T0 | `live-text.ts` is byte-identical to `origin/main`'s. | `live-text.ts` |
| T1 | The edit effect marks a clean tab dirty synchronously, before `ensureWorkingModel` is called. | `redline-edits.ts` |
| T2 | The model is created from the live tab's `savedContents` read when it is created, through a function argument. | `redline-edits.ts`, `monaco-loader.ts` |
| T3 | A continuation that made the model and finds `savedContents` moved since the edit was typed applies nothing and re-derives dirty from the model. | `redline-edits.ts` |
| T4 | The edit effect is declared above the outside-write effect and below the tab effect. | `redline-edits.ts` |
| T5 | A failed chunk load withdraws the provisional dirty mark before its toast. | `redline-edits.ts` |
| W1 | `refreshRepo`'s clean reload also requires `savedContents` to equal its value before the read. | `tab-io.ts` |

---

## 6. THE RED-FIRST TESTS

All under `src/renderer/editor/__tests__/`, written by the spec author at `9217ae0d`. Each file typechecks at
`9217ae0d`: the four that name an API this phase adds reach it through a typed cast of the module namespace,
**and the builder who lands that API replaces the cast with named imports in the same round**, so the compiler
pins the signature from then on. Every file was run RED in the spec author's own worktree at `9217ae0d`
(`/private/tmp/p282-spec-parent`, removed afterwards) and is expected RED in `/private/tmp/wt-p282` until the
builders finish: **34 failed, 1 passed (the watcher control), 35 total**, typecheck 0 errors. Every file went
GREEN against the prototype.

Where an API is absent at the parent, the red is a `TypeError`, which proves nothing about behaviour. So the
spec author ALSO ran the two MOVE files against **PR 28's own rules exported under this phase's names** (the
index rule in `landingAfterPress`, no holds, every repeat running): that is the "parent rule" column, and it
is behavioural.

### `p282-move-on.test.ts` — MOVE — findings 2 and 3 (13 tests)

Shipping composer, `planAccept`, `planRewind`; only the wrappers are faked as identities. Proves M1-M5: the
agent's write above lands on `"four"->"FOUR"`; accepting change 3 of 4 in a list lands on `"one"->"agent"`; the
last change re-cut loops to `"mat"->"cat"`; the wait is byte for byte; the shift is taken for an accept and not
for a rewind or a follower from the top (a decoy at the unshifted offset); the fallback; the wiring.

At `9217ae0d`: `Tests  13 failed (13)`, `TypeError: move.pressMoveOf is not a function` (8),
`TypeError: move.landingAfterPress is not a function` (4), `AssertionError: expected undefined to be 2`.

Under the parent rule: `Tests  6 failed | 7 passed (13)` —
`expected '"two"->"TWO"' to be '"four"->"FOUR"'`,
`expected '"each"->"you\n- Tortie it with"' to be '"one"->"agent"'`,
`expected '"on"->"it"' to be '"mat"->"cat"'`,
`expected 'wait' to be 1` (the `sameChange` wait parks on an agent's new change),
`expected +0 to be 1` (no shift), and the wiring. With the shift ablated from the prototype, the list case and
the decoy case go red and nothing else does.

### `p282-one-press.test.ts` — MOVE — findings 4 and 5, the repeat (14 tests)

Shipping `pressRedline`, `pressAccept`, `applyRewind`, journal, composer and editor store; main is a
compare-and-swap with every IPC step held at a named gate. Proves H1-H10: ⌥⌫ then ⌥↩ is `held` and nothing is
drawn backwards; ⌥⌫ ⌥⌫ reads once and writes once; accept-all and an accept of a different change are `held`;
a rewind of a different change goes ahead and the channel refuses the loser; the trailing picture stays held
across a watcher read that answers `was` and lets go on the real one; an agent writing the same phrase again
does not block accepts; the sentences; the repeat rule; and the view's wiring read as source (holds passed,
`landHold` after `adoptWritten`, the release effect's dependencies, the repeat consumed after
`preventDefault`, the focus before the adoption).

At `9217ae0d`: `Tests  14 failed (14)` — including
`AssertionError: expected 'went ahead and is waiting on main' to be 'held'`,
`AssertionError: expected 'accepted' to be 'held'`,
`AssertionError: expected -1 to be greater than 125` (no repeat test) and
`AssertionError: expected -1 to be greater than 1320` (no focus before the adoption), the rest `TypeError`s.

Under the parent rule: `Tests  10 failed | 4 passed (14)` — `expected false to be true` (nothing held),
`expected 'went ahead and is waiting on main' to be 'held'`, `expected 'accepted' to be 'held'` (three arms:
same change, accept-all, different change, and the trailing picture), `expected true to be false` (a repeat
runs), and the four wiring reads. The four that pass under the parent rule are the rewind of a different
change, the agent writing the same phrase, the refusal control and the sentences — each true of a build that
holds nothing, which is why they are controls there.

### `p282-typing-burst.test.ts` — SAVE — finding 1, BLOCKING (2 tests)

The REAL `useLiveTabText` (never mocked) and `useRedlineTyping` on React 19's own root, through
`p282-typing-rig.ts`, with the caret following wherever the view last restored it. Types `swift` and Enter one
`beforeinput` at a time, both with the model made by the first keystroke and made by a File view first. Proves T0.

At `9217ae0d`, verbatim:

```
  {
-   "caret": 26,
-   "drawn": "Alpha red fox runs. swift
- Beta line stays.
+   "caret": 24,
+   "drawn": "Alpha red fox runs. swf
+ tiBeta line stays.
  ",
-   "model": "Alpha red fox runs. swift
- Beta line stays.
+   "model": "Alpha red fox runs. swf
+ tiBeta line stays.
  ",
  }
      Tests  2 failed (2)
```

With only `live-text.ts` put back to main in the parent tree: `Tests  2 passed (2)`. That is the same pair of
readings `probe:p237` gave in the app.

### `p282-keystroke-in-transit.test.ts` — SAVE — finding 7 (3 tests)

Same rig, with the Monaco chunk held. Arm 1: ⌥⌫ on a clean tab with its write held, the first keystroke of
the session, the write lands and the view's adoption runs inside the chunk load, the chunk lands, ⌘S: the disk
still holds the rewind, the keystroke is in the buffer, and ⌘S either wrote on top or asked. Arm 2: a rewind
pressed after a keystroke still in transit is refused with the `dirty` sentence and writes nothing. Arm 3: a
`savedContents` moved directly during the chunk load is never written back over.

At `9217ae0d`, verbatim:

```
-   "diskIsRewound": true,
+   "diskIsRewound": false,
    "keystrokeInBuffer": true,
    "wroteOrAsked": true,
```
```
- true
+ false            (the tab is not dirty after the keystroke)
```
```
-   "dirty": false,
-   "model": "Alpha brown fox runs. Beta line stays.
+   "dirty": true,
+   "model": "Alpha red fox runs. BetaX line stays.
      Tests  3 failed (3)
```

Ablations against the prototype, each red on its own arm and nothing else: T1 removed → arms 1 and 2; T2
removed → arm 3; T3 removed → arm 3.

### `p282-watcher-race.test.ts` — SAVE — finding 6 (3 tests)

Real files: the bridge opens a real descriptor and is held after the open, the rewind is the shipping
`applyRewind`, the guarded write is a staged write plus `renameSync`. Proves W1, with and without a working
model, and a control that an unraced read still follows an outside write.

At `9217ae0d`, verbatim:

```
-   "buffer": "The application is a disposable client: it attaches and gets out of the way.
+   "buffer": "The application is a throwaway viewer: it attaches and gets out of the way.
    "dirty": false,
    "disk": "The application is a disposable client: it attaches and gets out of the way.
-   "saved": "The application is a disposable client: it attaches and gets out of the way.
+   "saved": "The application is a throwaway viewer: it attaches and gets out of the way.
      Tests  2 failed | 1 passed (3)
```

The control passes at the parent by design.

### `p282-typing-rig.ts` — SAVE — not a test

The shared mount for the two typing files (precedent: `src/main/arch/__tests__/p263-rig.ts`). It must not gain
a mock of `./live-text`.

---

## 7. OWNERSHIP

Three builders, disjoint files. **A builder that finds it needs a line of a file it does not own does not
edit it**: it writes the change as `build/p282/<builder>-<file>.patch` with a one-paragraph note, and the
integrator applies it.

### MOVE

| Path | State |
| --- | --- |
| `src/renderer/editor/RedlineDocument.tsx` | owns — §1.4-1.7, §2.1, §2.3, the credit at §4 |
| `src/renderer/editor/redline-current.ts` | owns — `PressMove`, `pressMoveOf`, `landingAfterPress`, the `indexAfterRemoval` comment, credit |
| `src/renderer/editor/redline-press.ts` | owns — `RewindHold`, `pressIsHeld`, `landHold`, `releaseHolds`, the `holds` dep, `held` |
| `src/renderer/editor/redline-accept.ts` | owns — the `holds` dep and `held` (added to the orchestrator's list; nobody else owns it) |
| `src/renderer/editor/redline-sentences.ts` | owns — `redlineHeldSentence` (added, same reason) |
| `src/renderer/editor/__tests__/p239-anchored-controls.test.tsx` | owns — its item 8 header says both verbs "leave the others in order"; rewrite it to the identity rule, keep every `indexAfterRemoval` and `stepIndex` assertion (it is still the fallback), fix the credit at `:201` |
| `src/renderer/editor/__tests__/p282-move-on.test.ts`, `p282-one-press.test.ts` | owns — replace the namespace casts with named imports once the exports exist; assertions are not weakened |
| `src/renderer/editor/__tests__/p227-redline-press.test.ts` | expected unchanged: `holds` is optional |

### SAVE

| Path | State |
| --- | --- |
| `src/renderer/editor/live-text.ts` | owns — §3.1 |
| `src/renderer/editor/redline-edits.ts` | owns — §3.2 |
| `src/renderer/editor/monaco-loader.ts` | owns — §3.3, the signature and nothing else (added to the orchestrator's list; nobody else owns it) |
| `src/renderer/editor/tab-io.ts` | owns — §3.4, the credit at `:224`; `adoptWritten` unchanged |
| `src/renderer/editor/store.ts` | owns — expected unchanged but for any comment the reverts leave false |
| `src/renderer/editor/redline-write.ts` | owns — the credit at `:83`; the comment's "1,139 ms" reading stays |
| `src/renderer/editor/__tests__/adopt-written.test.ts` | owns — the credit at `:5`; its four assertions stay |
| `src/renderer/editor/__tests__/p282-typing-burst.test.ts`, `p282-keystroke-in-transit.test.ts`, `p282-watcher-race.test.ts`, `p282-typing-rig.ts` | owns |

### PROBE

| Path | State |
| --- | --- |
| `build/probe-redline-move-on.mjs` | owns — the credit at §4, and FIVE new arms in the ONE Electron it already starts, each graded both ways (head and `ACCEPT_ADVANCE_PARENT=1`) and each with a `--self-test` fixture: **O** an outside write ABOVE the current change by `/bin/sh` immediately before ⌥⌫, before the watcher can redraw: the move lands on the change that followed (by its `del`), never the one before; **L** ⌥⌫ on the ONLY remaining change: `document.activeElement` is still inside the view, and ⌥⇧⌫ then brings the change back (picture count 1, file digest back); **C** ⌥⌫ and ⌥↩ dispatched back to back without awaiting a redraw: no change drawn backwards, the file holds the rewind, and if the accept was refused the toast is `redlineHeldSentence('accept', …)`'s text; **R** ⌥⌫ keyDown dispatched with `autoRepeat: true` after a first one: the picture drops by exactly one and the file is written once; **T** a word and Enter typed into the Redline document one key at a time, then ⌘S: the word is an insertion at the caret in order and the file holds it |
| `build/assert-electron-teardown.mjs` | owns — `HELPER_USER_FLOOR` 139 → 140 (`:212`), naming `probe:p277` and `probe:redlinemoveon` as the two helper users Phase 277 and PR 28 each counted as the 139th |
| `build/p249/probe-p249.mjs` | owns — credit at `:932` |
| `build/redline-current-probe.mts` | owns — credit at `:144` |
| `build/verification-checks.mjs` | owns — credit at `:1295`, `:1306`, and the `probe:redlinemoveon` comment naming the five new arms |
| `src/shared/keymap.ts` | owns — comments only. The `explain` strings do not change: no chord and no verb changed |

The PROBE builder runs `node build/probe-redline-move-on.mjs --self-test` and nothing that launches Electron.

### Gate authors, after the integrator — not a builder's

`build/conformance-save.mjs`, `build/p268/ablation.mjs`, `build/conformance-redline.mjs`, `CLAUDE.md`'s
`conformance:save` row. See §9.

### Integrator

`CHANGELOG.md`, `docs/BACKLOG.md`, the commit bodies. `src/shared/*` is untouched, so
`docs/audits/contract-baseline.txt` does not move. **Native menus: unchanged.** No surface is added, renamed
or removed.

---

## 8. WHAT MUST NOT CHANGE, AND THE STATED LIMITS

1. No new chord, no change to what ⌥↩ or ⌥⌫ act on, no move for an undo or accept-all, no loop across
   files or tabs (the entry's refusals).
2. `build/p277/SPEC.md` stands whole: `completeSave`, `withSaveSlot`, rule 14's order in `markDirty`, no
   literal `dirty: false`, the auditor's fixture byte for byte.
3. The guarded write door keeps its two call sites (`save-write.ts`, `redline-write.ts`).
4. `adoptWritten`'s two refusals do not move (§3.5).
5. `pressRedline`'s `dirty` refusal stays first, and the journal records the identity that was pressed.
6. No `RewindRefusal` word is added.
7. `sameChange` keeps its definition (`off`, `del`); the triple is asked only where §1 and §2 say.
8. **Limit:** a hold that lands on a picture the watcher never replaces — a keystroke inside the write, then ⌘S
   and Overwrite with the change still in the buffer — refuses accepts on that tab until the view is opened
   again. Reachable only through a 26 ms window and a dialog; stated, not fixed.
9. **Limit:** a commit that moves the baseline inside a rewind's write moves the held change's `off`, so the
   hold lets go early. Stated, not fixed.
10. **Limit:** §2.4's two, and §3.2's tab-switch consequence.

---

## 9. FOR THE GATE AUTHORS (read after the integrator)

- **`conformance:redline` rule 40 goes red on MOVE's first commit and stays red until rewritten**, on exactly
  two clauses measured against the prototype: "the move does not wait for the pressed change to leave the
  picture" and "the move does not bound the index". The rewrite reads: `landingAfterPress(` in the layout
  effect that holds `const pending = advanceAfterPress.current;`, no `indexAfterRemoval(` in the view,
  `pressMoveOf(` twice, `holds:` in both press deps, `landHold(` after `adoptWritten(`, `releaseHolds(` in a
  layout effect keyed on `savedContents`, the repeat test after `preventDefault()`, the focus before
  `adoptWritten(`; and in `redline-current.ts`, the wait before the follower before the fallback. The
  one-press rule and the identity move are described in its header. Rule 9's derived file floor does not move
  (no new `redline-*` file).
- **`conformance:save`** gains: `adoptWritten`'s dirty and `was` refusals before `deps.patch` and
  `resetWorkingModel`, read by matching braces; `refreshRepo`'s `savedBefore` clause; in the typing path the
  synchronous `markDirty(tabId, true)` BEFORE `ensureWorkingModel(`, the function argument, and the T3 return
  before `applyModelText(`. Each with an arm in `build/p268/ablation.mjs`, red on its own rule; the three
  typing ablations above are measured red on the red-first tests already.
- `CLAUDE.md`'s `conformance:save` row names `adoptWritten`.
