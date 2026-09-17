# Phase 277 — a save may not mark newer typing clean, and a timer may not outlive its policy

**This file decides. It is not a survey.** Two researchers read the completion path and the timer
lifecycle at `b4569686`; everything below is a ruling, with the file and the line the ruling lands on.
Where a researcher offered two answers, one of them is written here and the other is refused by name.

Charter: `docs/audits/2026-09-15-electron-typescript-architecture-0.105.0.md`, findings F1 and F2, and
`docs/BACKLOG.md`'s `## Phase 277` entry. The auditor's counterexample is
`docs/audits/fixtures/2026-09-14/auto-save-interleavings.test.ts.fixture` and it is **evidence, not a
file to make convenient**.

---

## 0. The two sentences this phase is answerable for

**The completion rule.** *A successful write always sets `savedContents` to the exact text it wrote,
and never sets `dirty` from a literal: at the acknowledgement it re-reads the tab's working model,
patches nothing at all if that model is not the very instance the save read its text from, and
otherwise derives `dirty` as `model.getValue() !== value` — which is `MonacoHost.tsx:311`'s own
definition of dirty, said a second time.*

**The limit, verbatim, for the commit body.** *Switching to Off need not interrupt an atomic write
already submitted to main, but it must stop a timer that has not submitted one.*

---

## 1. THE COMPLETION RULE

### 1.1 The surface is four doors and it is closed

`grep -rn "dirty: false" src/renderer` returns five hits outside tests. Four are doors, all in
`src/renderer/editor/tab-io.ts`, all writing the same literal
`deps.patch(id, { savedContents: value, dirty: false });`:

| Door | Line | What it is |
| --- | ---: | --- |
| `saveOnMachine` | `:842` | the remote `machines:putFile` `wrote` arm. It reads the model itself at `:825-827` and still never asks it again |
| `writePlain` | `:911` | the unguarded `fs:writeFile` door, reached only from `saveOutsideProject` |
| `overwrite` | `:1182` | the deliberate second guarded write behind the stale dialog. Widest window of the four: `value` was captured before the dialog was drawn |
| `saveInProject` | `:1239` | the guarded `wrote` arm — the audit's own line, and the one the fixture drives |

The fifth hit is `store.ts:973`, a NEW tab's initial `dirty` field in `openFromRequest`. It is not a
completion and it does not move.

Five more sites move `savedContents` and never name `dirty` (`:347`, `:475`, `:574`, `:664`, and
`refreshRepo`'s clean-buffer reload at `:1467-1471`). They are not completions and they do not move.
`redline-write.ts` and `rewind.ts` write real bytes and patch no tab field at all; they are not part
of this surface.

### 1.2 The identity that travels with a save: the model INSTANCE, and nothing else

A save carries no identity today. `createTabIo` holds no state across calls, a door crosses its await
with `id`, a frozen `EditorTab` snapshot and `value`, and `deps.patch(id, …)` re-resolves by id
against the live store (`store.ts:447-458`). A tab id is an absolute path, reused across lifetimes by
construction (`tab-identity.ts:21-48`), so the patch lands on whatever tab now holds that path.

**RULED: the identity is the `ITextModel` instance the save read `value` from, compared by
reference.** Capture it where `value` is taken; at the acknowledgement call `getWorkingModel(id)`
again and compare with `===`.

Three alternatives were on the table and each is refused by name:

- **`model.id`** (`'$model' + N`, `textModel.js:183-184`) — refused. It answers the same question as
  reference identity and adds a Monaco vocabulary this codebase does not use anywhere else, and with
  the audit fixture's model double both sides read `undefined`, so the check would pass by accident
  rather than by argument.
- **`getAlternativeVersionId()`** (`editor.api.d.ts:2048`) — refused as the dirty derivation. It is
  O(1) where a text compare is O(n), and that is its whole advantage. Against it: the fixture's model
  double does not expose it, so adopting it would mean editing the auditor's evidence, which section
  10 forbids; and it would make this product hold TWO definitions of dirty, one in
  `MonacoHost.tsx:311` and a different one at the acknowledgement. One definition, said twice,
  agreeing exactly, is worth the string compare of a buffer a human just stopped typing into.
- **A generation counter on `EditorTab`** — refused. It is new durable state on the tab for a fact the
  model already holds, and `BaselineState.generation` (`baseline.ts:61`) already means something else
  in this domain.

Reference identity is right in production for the reason it is right in the fixture: `forceCloseTab`
→ `disposeModels(id)` (`monaco-loader.ts:246`) disposes the instance and drops the key, and reopening
creates a fresh one, so the two lifetimes are two objects. It costs one retained reference for the
length of one write; say so in the comment.

### 1.3 The rule, applied identically to all four doors

One helper inside `createTabIo`, called from exactly four places:

```ts
/**
 * PHASE 277, audit F1. THE ONE PLACE A SAVE CLEARS A TAB.
 *
 * `savedContents` is a fact about the FILE: the write answered `wrote`, so the
 * file holds `value` and the baseline moves, always. `dirty` is a fact about
 * the BUFFER, and it is not ours to assert — it is asked of the model, with the
 * same question MonacoHost.tsx:311 asks on every keystroke, so this product has
 * one definition of dirty rather than two that agree until they do not.
 *
 * AND THE LIFETIME COMES FIRST. A tab id is an absolute path (tab-identity.ts
 * :21-48), so closing a file and reopening it hands the id straight back, and
 * before this the previous lifetime's acknowledgement patched the NEW tab.
 * `model` is the instance this save read `value` from; if the key now holds a
 * different instance, or none, the tab this write belonged to is gone and there
 * is nothing here to say about the one that took its place.
 */
const completeSave = (id: string, model: WorkingModel, value: string): true => {
  const now = getWorkingModel(id);
  if (now === null || now !== model) return true;
  deps.patch(id, { savedContents: value, dirty: now.getValue() !== value });
  return true;
};
```

`WorkingModel` is `NonNullable<ReturnType<typeof getWorkingModel>>`, declared in
`src/renderer/editor/monaco-loader.ts` and exported, so `tab-io.ts` gains no new import.

**It returns `true` in both arms.** A write really happened; a dead lifetime does not make it a
failure. `promptDirtyClose` (`store.ts:545`) is the caller that acts on `true`, and by then that tab
is already gone.

### 1.4 Where the ticket is taken

The model is captured **where `value` is read**, and passed down as one extra parameter. No ticket
type, no object: `(id, tab, value)` becomes `(id, tab, model, value)`.

- `saveOnce` (the ladder, §2.2) reads it at `:1361-1363` and hands it to `saveInProject`,
  `saveOutsideProject` → `writePlain`.
- `saveOnMachine` already reads it at `:825-827`. It holds the instance in a live closure variable and
  simply stops ignoring it.
- **The two dialog re-entries are the one place model and value are taken at different moments**, and
  that is correct rather than an exception. `overwrite` and `saveOutsideProject`'s Overwrite callback
  carry the `value` the person was shown — they must, it is what the dialog was about — and re-read
  `getWorkingModel(id)` at the press. If it is `null` the press writes nothing and says nothing new.
  The result is still sound in the worst case: close-and-reopen under an open dialog gives a fresh
  model, `savedContents: value` is a true statement about the file, and `dirty` derived against the
  fresh buffer is a true statement about the tab.

### 1.5 What this fixes that the audit did not name

**The watcher's dirty guard.** `tab-io.ts:1463` reloads a tab only `if (!tab.dirty)` and then calls
`resetWorkingModel` at `:1471`, applying disk bytes over the live buffer. The file's own header at
`:48-51` says that skip "is what stops the watcher overwriting a person's typing". A falsely clean tab
is not skipped, so at the parent the next agent write to that file replaces unsaved typing **in the
editor**, and because `savedContents` was patched first, `MonacoHost.tsx:311` then recomputes dirty as
false. Silent, complete, and it needs no close at all. This is the phase's fifth attack (§8, Attack E)
and it belongs in the commit body: it is a stronger loss route than `closeTab`.

**Eviction.** `autoSave.touched` is set only inside the auto controller (`auto-save.ts:234`), so a
falsely clean tab from an explicit ⌘S passes `store.ts:1039-1053`'s `!t.dirty && !touched` filter with
the stalest `lastUsed` in its project and is evicted, model and all, with no prompt. Truthful `dirty`
closes it; no change to the eviction filter is needed or permitted.

**`closeSaved()`** (`store.ts:1205-1209`) filters `!t.dirty` and force-closes every match, with no
prompt by design. It targets a falsely clean tab by name. Same repair, no change to that command.

---

## 2. THE IN-FLIGHT RULE

### 2.1 What is broken, measured

- **⌘S while an auto save is in flight** — two writes, same frozen precondition, and the loser is
  answered `stale`: the person reads *"'notes.md' changed on disk / Something wrote to it after Tortie
  read it"* about a writer that does not exist. In the auto direction it also records a permanent stop
  and a sticky toast. Spending issue 16's one sentence on Tortie's own timer teaches a person to press
  Overwrite on the dialog that exists to stop them.
- **A second timer expiring during a held write** — the work is **dropped**, not deferred:
  `auto-save.ts:223` deletes the timer *before* the `inFlight` early return at `:227`, and nothing
  re-arms. Measured: `writes=1, pending=0`, newer model, older saved text, `dirty:false`. **This arm
  reaches the fixture's exact end state without `notePatched` being involved at all**, so a fix that
  only stops the cancellation at `:278` leaves it broken.

### 2.2 The ruling: COALESCE, at one slot per tab, owned by the writer

**One save at a time per tab.** A second request while one is in flight is remembered as **at most one
follow-up**, and the follow-up runs after the first releases the slot, reading the tab and the model
fresh at that moment. Extra requests join the follow-up that is already queued; they do not stack.

```ts
const inFlight = new Map<string, Promise<boolean>>();
const queued = new Map<string, { reason: SaveReason; done: Promise<boolean>; settle: (ok: boolean) => void }>();

const withSaveSlot = async (id, reason, body): Promise<boolean> => { … };
```

Rulings inside it:

1. **The slot is released in a `finally`**, and the queue is drained there, after the delete, so the
   follow-up finds the slot free.
2. **The follow-up's reason is the stronger of the two, and `explicit` is stronger.** A person's ⌘S
   must be allowed the plain door and the two dialogs; the `auto` reason forbids both
   (`tab-io.ts:1235`, `:1290`, `conformance:save` rules 11 and 11b). An auto request joining a queued
   explicit one leaves it explicit.
3. **A follow-up whose tab is no longer dirty writes nothing and resolves `true`.** It exists only to
   catch typing that happened during the write, and with §1's completion rule a clean tab means the
   buffer is on disk. This is the only place a save is skipped for being clean.
4. **An explicit ⌘S on a clean tab still writes, exactly as it does today.** `saveOnce` gains no dirty
   check. This is refused deliberately: main has no identical-bytes short circuit, it stages and
   `renameSync`s (`guarded-write.ts:548`), so skipping would be a visible behaviour change to a
   gesture nobody complained about, and the audit asked for a *test* of unchanged-buffer success, not
   a new refusal.
5. **`withSaveSlot` has exactly three entry points** — `save`, and the two dialog callbacks that
   re-enter (`overwrite`'s `onAlt` and `saveOutsideProject`'s `onAlt`). **Nothing running inside a
   slot ever calls it**, which is what makes it deadlock-free: those callbacks fire from a click, long
   after the `save` that raised the dialog resolved `false`.

### 2.3 The one structural change this forces, and the gate edit that rides with it

`save` becomes the serializer; the ladder of refusals it is today is extracted verbatim as
**`saveOnce`**. `save`'s new body is the slot acquisition and nothing else, so it still names no write.

`build/conformance-save.mjs` moves with it, in the same commit:

- Introduce `const LADDER = 'saveOnce';` and use it for the real reads at `:685` (rule 1) and `:1021`
  (rule 11), and rename the planted fixtures at `:298-521` to match, so the scanner is still proved on
  the shape that ships.
- **Rule 1 gains a second half**: `save` itself names none of `writeFile`, `writeGuarded`,
  `fs:writeFile`, `fs:writeGuarded`. Asking both functions is strictly stronger than asking one.
- Rules 3, 4, 5, 11b, 12, 13, 14, 15 are untouched — their subjects (`saveInProject`, `overwrite`,
  `offerStaleChoice`, `recordStop`, `markDirty`, the sentence map) do not move.

The commit body names this rename and says why: the serializer has to be the function the store calls,
and the ladder has to be the function the gate reads.

### 2.4 The scheduler's own in-flight set is DELETED

`auto-save.ts` loses `inFlight` (`:184`), its check at `:227`, its `add` at `:231`, its `finally`
delete, and its clears in `forget` and `disposeAll`.

Reason, stated so a later round does not put it back for safety: that set was a **second truth about
one fact**, kept in the module ⌘S cannot see, and that is precisely why arms A and B fail. With
`withSaveSlot` the scheduler may call `deps.save(id)` freely — a request during a write is coalesced
rather than raced, and coalesced rather than dropped, which is what fixes arm C. The comment in
`auto-save.ts` must say that the serialisation is `tab-io`'s, by name, so the dependency is written
down rather than assumed.

---

## 3. THE LIFETIME RULE

Close-and-reopen is stopped by §1.2's reference identity, and by nothing else. Measured at the parent
with the auditor's rig plus a close/reopen arm:

```
{"case":"D close-reopen","saved":"first edit","dirty":false,"modelNow":"what the file says now"}
```

The previous lifetime's completion set the NEW tab's `savedContents` to the OLD buffer's text and
cleared its dirty flag. After this phase the acknowledgement finds a different instance under that key
and patches nothing at all.

Three neighbouring cases, decided:

- **Closed and not reopened** — already safe and stays safe. `getWorkingModel` answers `null`, so the
  guard returns before `deps.patch`, which would have been a no-op anyway (`store.ts:456-458`).
- **Preview-slot reuse and LRU eviction** — safe for the same reason (`store.ts:1019-1025`,
  `:1052-1061`): the id disappears rather than being reused, and both sites already call
  `disposeModels`.
- **A rename in flight is NOT fixed here, and the entry says so.** `rekeyTabResources`
  (`monaco-loader.ts:86-101`) moves the instance to a new key without disposing it, and `followMoves`
  (`tree/editor-follow.ts:41-53`) rekeys tabs through `useEditor.setState` directly, bypassing
  `patchTab`. An acknowledgement crossing a rename asks `getWorkingModel(oldId)`, gets `null`, and
  patches nothing — **which is what happens today**, because `patchTab(oldId, …)` already matches no
  tab. The tab stays dirty with a stale `savedContents` and the next ⌘S answers `stale`. Unchanged by
  this phase, named rather than left for the next round to discover, and not widened into it.

`autoSave.forget` clearing its own state on close (`auto-save.ts:283-288`) stays exactly as it is.

---

## 4. REVOCABLE TIMERS

### 4.1 One predicate, spelled once

```ts
export type AutoSaveTrigger = 'delay' | 'blur';

/** Does this policy authorise THIS trigger? Pure, so a test reads it directly. */
export function policyPermits(mode: AutoSaveMode, trigger: AutoSaveTrigger): boolean;
```

`delay` only under `afterDelay`, `blur` only under `onFocusChange`, nothing under `off`. It sits beside
`autoSaveSkipReason` in `src/renderer/editor/auto-save.ts` — the module's own pure half, argued in its
header at `:27-33`.

`arm`'s `mode !== 'afterDelay'` (`:244`) and `noteBlur`'s `mode !== 'onFocusChange'` (`:263`) both
become `policyPermits` calls. **The rule is spelled in one place**, so a fourth mode cannot be handled
in two and missed in a third.

### 4.2 The timer carries the trigger that armed it

`timers` becomes `Map<string, { handle: unknown; trigger: AutoSaveTrigger }>`, and `run` takes
`(id, trigger)`. Today every entry is `'delay'`, because `noteBlur` calls `run` synchronously and never
enters the map (`:262-267`) — **and that is the point**: the field records why this timer exists, so a
future deferred-blur path cannot inherit a delay's permission by accident. `cancelTimer` and
`disposeAll` change only in how they read the value.

"Switching to On focus change must not preserve an old delay" is then not a special case; it is the
general rule applied. A `delay`-tagged timer asks `policyPermits('onFocusChange', 'delay')`, gets
`false`, and returns.

### 4.3 `run`'s order, pinned

```ts
const run = (id: string, trigger: AutoSaveTrigger): void => {
  timers.delete(id);                                   // consume
  if (deps.blocked()) { if (trigger === 'delay') arm(id); return; }   // §5.2
  if (!eligible(id)) return;
  if (!policyPermits(deps.policy().mode, trigger)) return;            // THE LAST GATE
  void (async () => { if (await deps.save(id)) wrote.add(id); })();
};
```

The permission re-read is **the last statement before `deps.save`**. It is the last synchronous moment
this module owns: the `async` IIFE runs to its first `await`, and `deps.save(id)` is evaluated before
that await, so nothing can change between the check and the hand-off.

### 4.4 The hook

`store.ts` subscribes to `useSettingsStore` and calls one new controller method:

```ts
/** A policy change reached this window. Re-arm what is pending, and nothing else. */
notePolicyChanged(): void;
```

It re-arms, **through `arm`**, every tab that CURRENTLY HOLDS A TIMER. `arm` re-reads both fields, so
four transitions fall out of one hook:

| Transition | What happens, and why |
| --- | --- |
| `afterDelay` → `off` | `arm` cancels, then refuses. Two belts with §4.3's re-check, and §4.3 is the one that may never be removed — it is what the fixture measures and it survives a hook somebody forgets to wire |
| `afterDelay` → `onFocusChange` | Same. The tab is still an auto-save tab; it may just not be written by a clock |
| `off` / `onFocusChange` → `afterDelay` | **Arms nothing.** No timer exists to re-arm, and already-dirty tabs are deliberately left alone — see §4.5 |
| `delayMs` changes | Rescheduled from now — see §5.1 |

`watchSettings()` (`App.tsx:268`) is a subscription to MAIN's broadcast that keeps the settings object
fresh. This is a subscription to the LOCAL store, downstream of it. It is not a rival truth, and the
comment that argued it would be is replaced in §6.

### 4.5 Switching auto save ON saves nothing that is already dirty

VS Code's `EditorAutoSave` saves all dirty editors when auto save is switched on. **Tortie does not**,
and this is a chosen difference rather than an omission, so a later round does not "finish" it: a
person's files are not opted into timed writes by a change of setting alone (`src/shared/settings.ts`
`:426-433` is the same posture, and it is why the default is Off). The trigger stays a keystroke or a
blur.

### 4.6 The six cancellations that survive, unchanged

1. **Re-arm** — `arm`'s pre-cancel (`:243`). It is what makes a burst write once after the LAST
   keystroke; `p268-auto-save.test.ts:286` pins it.
2. **Stopped saves** — `recordStop` (`:217`). The membership check stays FIRST and `recordStop` stays a
   named `const` arrow: `conformance:save` rule 12 reads its body by matching braces.
3. **Gone clean** — `notePatched`'s `:278`. **This line is NOT edited by this phase.** It is correct
   given a truthful `dirty`, and §1 is what makes `dirty` truthful again. Editing it would be the
   scheduler repairing a completion defect in the wrong module.
4. **Close** — `forget` (`:283-288`), from `forceCloseTab` (`store.ts:1148`), which every close route
   funnels through.
5. **Preview reuse and LRU eviction** — `forget` again (`store.ts:1024`, `:1058`).
6. **Disposal** — `disposeAll` (`:298-303`). It has **no production caller**; its callers are
   `p268-auto-save.test.ts:514` and the audit fixture (three times). Record that rather than assume a
   disposal hook exists, and **do not delete the method** — the fixture calls it.

One NON-cancellation, named so nobody adds it: hiding a project is a filter and never a close
(`store.ts:103`), so a hidden project's dirty tabs keep their timers and go on auto-saving. Deliberate:
clause 7 of `autoSaveSkipReason` asks `openRoots`, and a hidden project is still open.

---

## 5. THE DELAY CHANGE AND THE BLOCKED DIALOG

### 5.1 A delay change RESCHEDULES

Three candidates; two refused.

- **Cancel** — refused outright. The person asked for a different wait, not for their work to stop
  being saved.
- **Keep the old deadline** (today's behaviour) — refused. The setting's own caption
  (`GeneralSection.tsx:356`) is *"How long Tortie waits after you stop typing"*, and a live deadline
  computed from a number the person has just replaced is not that promise.
- **RULED: reschedule.** `notePolicyChanged` re-arms every tab holding a timer, through `arm`, which
  re-reads the delay.

Two consequences stated rather than hidden, in the code comment:

1. **The new deadline runs from NOW**, not from the last keystroke, because the map holds a handle and
   no arm time. Adding an arm timestamp buys a few hundred milliseconds of precision on a gesture
   nobody times, and a second field is not worth it.
2. **So shortening the delay extends the current wait slightly** rather than firing sooner. Say it in
   the comment; it is the kind of thing a later round "fixes" without knowing it was decided.

Only ids that ALREADY hold a timer are re-armed. Re-arming every dirty tab would smuggle §4.5's
rejected behaviour in through the delay hook.

### 5.2 A blocked DELAY timer re-arms; a blocked BLUR run drops

Today it **drops, silently and permanently**: `run` deletes the handle at `:223` and only then asks
`deps.blocked()` at `:226`, and nothing re-arms on the dialog closing. And `blocked()` is GLOBAL
(`store.ts:484` reads `useApp.confirm !== null`), so closing dirty tab A puts up "Save changes to 'A'?"
and, while the person reads it, silently kills the pending timers of every other dirty tab. Every
confirm in the app does this — tree delete and overwrite, End session, Remove, Close project, SCM
discard.

**RULED:**

- **A blocked `delay` timer re-arms through `arm(id)`** — `arm` and not a raw `setTimer`, so "the
  policy changed while a dialog blocked it" needs no extra code at all: Off arms nothing, On focus
  change arms nothing, a new delay is honoured, and a tab that went clean under the dialog fails
  `eligible` and arms nothing. `arm`'s own `cancelTimer` is a no-op here because `run` already consumed
  the handle, so the map still holds at most one timer per tab.
- **A blocked `blur` run drops, and that is correct.** The gesture is over, focus is already elsewhere,
  and the next blur is the retry. `noteBlur`'s own `blocked()` check at `:264` is unchanged.
- **The cost, in the comment:** while a confirm is on screen, each eligible dirty tab re-arms once per
  delay period. One `setTimeout` per tab per delay — no write, no toast, no IPC. At the 250 ms floor
  (`MIN_AUTO_SAVE_DELAY_MS`, `src/shared/settings.ts:449`) that is four timeouts a second per dirty
  tab, and confirms are transient.

`p268-auto-save.test.ts:468-476` stays green: it advances once and asserts `h.saves` is empty, and the
fake clock at `:104-112` snapshots `[...due.entries()]` before iterating, so a re-arm inside the loop
is not re-fired and cannot loop. **SCHEDULER verifies that snapshot behaviour before relying on it.**

---

## 6. THE COMMENT

`src/renderer/editor/store.ts:470-473` today:

> `policy` is read LIVE from the settings store on every arm and every tick, so a mode or delay changed
> in the Settings window reaches this window with no new plumbing — `watchSettings()` is already running
> here (App.tsx:268) and a second subscription would be a second truth.

**RULED: rewritten, not merely made true.** Two reasons. The "every tick" half is simply false — there
is no `deps.policy()` call in `run` at all. And even after §4.3 lands, the sentence would still be
wider than the code in a second way: the DELAY is read at arm, so a delay change moves no existing
deadline except through the new hook. The last clause is also the sentence that caused the defect,
because it argues against the hook F2 now needs.

The replacement, to be written at that site verbatim:

```
   * `policy` is read LIVE from the settings store, and this comment says WHEN,
   * because the sentence it replaces said "on every arm and every tick" and the
   * tick half was never true: `run` read no policy at all, so a timer armed
   * under After a delay fired and wrote under Off (audit F2, Phase 277).
   *
   * There are two reads and they answer different questions. `arm` reads the
   * MODE and the DELAY when it creates a timer. `run` reads the MODE again in
   * the last synchronous moment it owns, immediately before it hands over to
   * `deps.save`, and asks whether the policy still permits the TRIGGER that
   * armed this particular timer — so a delay that survived a switch to On focus
   * change is refused by the clause that authorises delays, rather than by a
   * general "is auto save on".
   *
   * The subscription below is the third piece, and it is not a second truth.
   * `watchSettings()` (App.tsx:268) is how main's broadcast reaches this
   * window's settings store; this listens to THAT store, downstream of it, and
   * does one thing: re-arm every tab that currently HOLDS a timer, through
   * `arm`, which re-reads both fields. Off and On focus change arm nothing, a
   * new delay is honoured from now, and a tab that went clean arms nothing.
   * Tabs with no timer are left alone on purpose — switching auto save ON does
   * not opt a person's already-dirty files into a timed write. VS Code's
   * EditorAutoSave saves them all; this deliberately does not.
   *
   * THE LIMIT, stated rather than overclaimed. Switching to Off does not
   * interrupt a write already submitted to main: between `run`'s last read and
   * the bridge call there is one sha256 digest of `savedContents` (./tab-io),
   * and that is the whole window. It stops every timer that has not submitted
   * one. And a change made in the SETTINGS window reaches this window through
   * main's broadcast, so "immediately before submitting" means immediately
   * before, as this window knows the policy; the File menu's checkbox runs in
   * this renderer and has no such gap.
```

---

## 7. THE STATED LIMIT

**Verbatim, for the commit body:**

> Switching to Off need not interrupt an atomic write already submitted to main, but it must stop a
> timer that has not submitted one.

**And the measurement behind it, also for the commit body**, because the phase writes the number rather
than the adjective: the window is **one WebCrypto digest wide**. `run` calls `deps.save(id)`
synchronously; `deps.save` is `io.save(id, 'auto')` (`store.ts:476`); `saveInProject` awaits
`sha256Hex(tab.savedContents)` at `tab-io.ts:1224` before it reaches `guardedSave` at `:1232`. A policy
change landing inside that single await is not interrupted, and the result is exactly one guarded write
of the text the buffer held, through the same channel ⌘S uses, with the same precondition.

Closing that window would mean handing a permission callback across into `tab-io`, which is a second
policy reader in the one module `conformance:save` rule 10 exists to keep narrow, and it would buy one
digest's worth of time. **Refused.**

Second limit, separate and also stated: the editor window reads the policy as main last broadcast it.

---

## 8. THE NUMBERED RULES

A builder implements these and the gate asserts them. One sentence each.

### Completion (C)

| # | Rule | File |
| --- | --- | --- |
| C1 | Every successful write ends in one shared helper, `completeSave`, and the literal `dirty: false` appears nowhere in the file. | `src/renderer/editor/tab-io.ts` |
| C2 | `completeSave` patches nothing at all when `getWorkingModel(id)` is not the very instance the save read `value` from. | `src/renderer/editor/tab-io.ts` |
| C3 | When the instance matches, `completeSave` always patches `savedContents: value` and derives `dirty` as `model.getValue() !== value`, never a literal. | `src/renderer/editor/tab-io.ts` |
| C4 | The identity is the model instance and nothing else — no version id, no generation, no new Monaco API is named in the renderer. | `src/renderer/editor/tab-io.ts` |
| C5 | All four doors call it: `saveOnMachine`, `writePlain`, `overwrite`, `saveInProject`. | `src/renderer/editor/tab-io.ts` |
| C6 | `withSaveSlot(id, reason, body)` holds one slot per tab id and releases it in a `finally`. | `src/renderer/editor/tab-io.ts` |
| C7 | A save asked for while the slot is held becomes at most ONE follow-up, whose reason is the stronger of the two, which re-reads the tab and the model when it runs. | `src/renderer/editor/tab-io.ts` |
| C8 | A follow-up whose tab is no longer dirty writes nothing and resolves true; an explicit ⌘S on a clean tab still writes. | `src/renderer/editor/tab-io.ts` |
| C9 | `withSaveSlot` is called from exactly three places — `save` and the two dialog callbacks — and from nothing running inside a slot. | `src/renderer/editor/tab-io.ts` |
| C10 | `save` resolves true only when the buffer as of that moment is on disk, because `promptDirtyClose` closes the tab on true. | `src/renderer/editor/tab-io.ts`, `store.ts:545` |

### Scheduler (S)

| # | Rule | File |
| --- | --- | --- |
| S1 | `policyPermits(mode, trigger)` is a pure exported predicate and is the ONLY place the mode-to-trigger rule is spelled; `arm`, `noteBlur` and `run` all ask it. | `src/renderer/editor/auto-save.ts` |
| S2 | The timer map's value carries the trigger that armed it, and `run` takes it as a parameter. | `src/renderer/editor/auto-save.ts` |
| S3 | `run` asks `policyPermits(deps.policy().mode, trigger)` in the last statement before `deps.save(id)`. | `src/renderer/editor/auto-save.ts` |
| S4 | A due `delay` timer blocked by a dialog re-arms through `arm`; a blocked `blur` run drops. | `src/renderer/editor/auto-save.ts` |
| S5 | `notePolicyChanged()` re-arms, through `arm`, every tab that currently holds a timer and no others. | `src/renderer/editor/auto-save.ts`, `store.ts` |
| S6 | A settings change in this window reaches the controller through one zustand subscription on `useSettingsStore`, placed beside the `createAutoSave` literal. | `src/renderer/editor/store.ts` |
| S7 | Switching auto save ON arms nothing for tabs that are already dirty. | `src/renderer/editor/auto-save.ts` |
| S8 | `auto-save.ts` keeps NO in-flight set; serialisation is `tab-io`'s, named in the comment. | `src/renderer/editor/auto-save.ts` |
| S9 | The six cancellations of §4.6 all survive, and `notePatched`'s clean-edge cancel is not edited. | `src/renderer/editor/auto-save.ts` |
| S10 | `auto-save.ts` still names none of `writeFile`, `writeGuarded`, `writePlain`, `saveOutsideProject`, `setInterval` — **comments included**, because rule 10 is a substring scan over the whole file. | `src/renderer/editor/auto-save.ts` |

### Gate and evidence (G)

| # | Rule | File |
| --- | --- | --- |
| G1 | `src/renderer/editor/__tests__/audit-0914-auto-save.test.ts` is byte-identical to the fixture, pinned by sha256 in the gate. | `build/conformance-save.mjs` |
| G2 | `dirty: false` appears exactly once in non-test `src/renderer`, at `store.ts:973`, a new tab's initial field. | `build/conformance-save.mjs` |
| G3 | Rules 1 and 11 read `saveOnce`; rule 1 additionally asserts `save` itself names no write. | `build/conformance-save.mjs` |
| G4 | `conformance:save` rule 14's order in `markDirty` is re-asserted unchanged. | `build/conformance-save.mjs` |
| G5 | Every new rule has a planted fixture that must go RED, in the file's existing fixture idiom at `:298-660`. | `build/conformance-save.mjs` |
| G6 | The completion helper's own name appears exactly once as a declaration and four times as a call. | `build/conformance-save.mjs` |

### The proof, run rather than read

**The closure test.** Copy the fixture byte for byte to
`src/renderer/editor/__tests__/audit-0914-auto-save.test.ts`. All four cases pass. It is not edited; if
a case is judged wrong, the phase says why with evidence and quotes the auditor's wording beside the
disagreement.

**Measure the parent.** All three failures reproduce at `5a604e26`/`b4569686` and pass after. Both
readings in the commit body.

**Method 1 — the attack.** Five arms, four named by the audit and one of ours. Each must be RED at the
parent and GREEN after, with the reading printed.

| Arm | What it drives | Reading at the parent |
| --- | --- | --- |
| **A** explicit-save overlap | ⌘S while an auto save is in flight | `{"writes":2,"sameExpect":true,"confirmsShown":1,"confirmTitle":"'notes.md' changed on disk"}` |
| **B** timer under a held ⌘S | the timer's write loses and takes the stale arm | `{"stop":{"kind":"stale"},"dirty":false,"pending":0}` |
| **C** second timer during a held write | the work is DROPPED, not deferred | `{"writes":1,"pendingAfterDrop":0,"saved":"first edit","dirty":false,"pending":0}` |
| **D** close and reopen | the old lifetime's ack patches the new tab | `{"saved":"first edit","dirty":false,"modelNow":"what the file says now"}` |
| **E** *(ours)* the watcher destroys the live buffer | after the false clean, `refreshRepo` no longer skips the tab and `resetWorkingModel` applies disk bytes over unsaved typing | `resetWorkingModel` called; buffer replaced; `dirty` recomputed false |

Arm E is the fifth attack the phase entry asks for, and it is a **unit** test rather than an app arm on
purpose: it is the only form that can measure the parent honestly. Plus the unchanged-buffer control
from the audit's list, which must stay a real write.

**Method 2 — the running app.** ONE `probe:p277`, one Electron, one scratch project, everything in one
session:

1. Start a save and type into the model in the same turn, before the acknowledgement returns. Read
   back: newer text still dirty, `savedContents` is the older text, a timer is pending.
2. Let it save when permitted, and confirm disk holds the newer text.
3. **Press close while unsaved and read the confirm's title.** This is the clause that connects the
   phase to losing work, and the audit records it was never driven in a real Monaco tab.
4. With a long delay, type, change the mode before the deadline through BOTH surfaces — the Settings
   dropdown (`GeneralSection.tsx:333-341`) and the File menu checkbox (`menu-actions.ts:198-204`) — and
   confirm disk is unchanged each time.
5. Repeated mode changes, a delay change, and a tab close with a timer pending, without the single
   guarded-write owner moving.

The drive gets no production seam for holding an acknowledgement: calling save without awaiting it and
applying a Monaco edit in the same synchronous turn lands strictly inside the digest-plus-IPC window,
which is real timing rather than a test hook.

**Keep green.** `conformance:save`, `conformance:redline-write`, `probe:p268`, and the whole unit
suite — `p240-guarded-save.test.ts`'s eight `[{ savedContents: BUFFER, dirty: false }]` assertions are
expected to pass **unchanged**, because its model double is a stable object whose `getValue()` returns
`BUFFER` (`:50`). If any of those eight needs editing, the completion rule is wrong, not the test.

---

## 9. FILE OWNERSHIP

### store.ts has ONE owner: SCHEDULER. COMPLETION writes no line of it.

This is decided rather than divided, and the reason is that **COMPLETION needs no change there**,
which was checked rather than assumed:

- `TabIoDeps.patch(id, patch)` keeps its signature, so the `createTabIo({…})` literal (`store.ts:499`)
  is untouched.
- `patchTab` (`:447-458`) keeps its body and its comment: the completion decision moves into `tab-io`,
  not into the funnel.
- `promptDirtyClose` (`:540-560`) keeps its body: `io.save(tab.id)` still resolves true only when the
  buffer is on disk (C10).
- `save()` (`:1405-1408`), `closeTab`, `closeMany`, `closeSaved`, `forceCloseTab` and the eviction
  filter all keep their bodies: truthful `dirty` is the whole repair and none of them changes.
- `completeSave` needs only `getWorkingModel`, already imported in `tab-io.ts:69`.

**If COMPLETION finds it needs a line of `store.ts`, it does not edit the file.** It writes the change
as `build/p277/completion-store.patch` with a one-paragraph note, and the integrator applies it. Say
so in the handover.

### COMPLETION

| Path | State |
| --- | --- |
| `src/renderer/editor/tab-io.ts` | owns — `completeSave`, the four doors, `withSaveSlot`, `save`/`saveOnce` |
| `src/renderer/editor/monaco-loader.ts` | owns — exports the `WorkingModel` type alias and nothing else |
| `src/renderer/editor/save-write.ts` | owns, and **expected unchanged** — the guarded channel's one call site does not move |
| `src/renderer/editor/__tests__/audit-0914-auto-save.test.ts` | owns — the byte copy of the fixture, never edited |
| `src/renderer/editor/__tests__/p277-save-completion.test.ts` | owns — new; attack arms A, C, D, E and the unchanged-buffer control |
| `src/renderer/editor/__tests__/p240-guarded-save.test.ts` | owns, and **expected unchanged** |
| `src/renderer/editor/p277-save-drive.ts` | owns — new; the renderer half of `probe:p277` |

### SCHEDULER

| Path | State |
| --- | --- |
| `src/renderer/editor/auto-save.ts` | owns — `policyPermits`, the trigger tag, `run`'s re-read, `notePolicyChanged`, deleting `inFlight` |
| `src/renderer/editor/store.ts` | owns, WHOLE — the `createAutoSave` literal, the new subscription, the §6 comment, `markDirty`'s arm calls, `autoSaveOnBlur`, the `forget` call sites |
| `src/renderer/editor/__tests__/p277-timer-policy.test.ts` | owns — new; attack arm B, the two policy transitions driven through the hook, the delay change, the blocked dialog, repeated changes |
| `src/renderer/editor/__tests__/p268-auto-save.test.ts` | owns — the `settle()` header comment at `:182-190` describes an in-flight mark that no longer exists and is rewritten |

### INTEGRATOR

| Path | State |
| --- | --- |
| `build/conformance-save.mjs` | owns — rules G1-G6, the `LADDER` constant, the planted fixtures |
| `build/p277/probe-p277-save.mjs` | owns — the one app run, through `build/electron-run.mjs`, every process ended in a `finally` |
| `package.json` | owns — the `probe:p277` script and its classification in `build/verification-checks.mjs` |
| `docs/BACKLOG.md`, `CHANGELOG.md` | owns — the running-log line and the release entry |

`src/shared/*` is untouched by this phase. There is no contract change, so
`docs/audits/contract-baseline.txt` does not move.

---

## 10. WHAT MUST NOT CHANGE

1. **The guarded write channel keeps ONE owner and no second write door appears.** `fs:writeGuarded` is
   reached from `save-write.ts` and `redline-write.ts` and from nowhere else; `conformance:save` rule 6
   and `conformance:redline-write` rule 5 both say so and both stay green. F1 is not a fault in the
   channel — it protected against an external writer exactly as designed. What failed is whether the
   editor represents its OWN unsaved work.
2. **Auto save's default stays Off** (`src/shared/settings.ts:426-433`). Nothing in this phase changes
   a shipped default, a delay floor or a mode name.
3. **Phase 276's cache and refresh are untouched.**
4. **The auditor's fixture is evidence.** It is copied byte for byte, pinned by sha256, and never
   edited to fit the implementation. It is the reason `getAlternativeVersionId` is refused in §1.2 and
   the reason the model double's shape constrains the design rather than the other way round.
5. **`conformance:save` rule 14's order in `markDirty` does not move.** `probe:p268` measured the other
   order shipping a build where a burst of characters saved and a single character never did.
6. **`recordStop` stays a named `const` arrow** with its membership check first (rule 12), and auto
   save invents no refusal sentence (rule 13).
7. **`disposeAll` is not deleted** even though it has no production caller — the fixture calls it three
   times.
8. **The rename-in-flight case is not widened into.** It is named in §3 and left exactly as it is.
9. **The unconditional clean patch predates Phase 268** and the commit body says so. Phase 268 added
   the background exposure and the cancellation consequence. Do not write a body that blames auto save
   alone.

---

## Corrections after verification (2026-09-17)

This section records where the build diverged from the text above after two independent verifiers and a fix
round. Where it conflicts with an earlier section, this section wins, and the numbered rules in §8 are read
through it.

1. **§2.2 and C7 are superseded: a TIMER IS NEVER COALESCED.** As first built, `withSaveSlot` queued an `auto`
   request behind a held write and `drainQueue` later ran `saveOnce(id, 'auto')` without re-asking anything. The
   attack verifier drove three regressions this phase had introduced through that queue: the queued timer wrote
   after the mode changed to Off (T1), it wrote underneath a confirm dialog including "Save changes to …?" (T2,
   T7), and a request queued in a tab's EARLIER lifetime wrote into the REOPENED tab (T3). Now `withSaveSlot`
   answers an `auto` request `false` at once when the slot is held and never queues it (`conformance:save` rule
   18), `run` in ./auto-save re-arms the timer after the save it waited on so the work is deferred rather than
   dropped and policy, delay, eligibility and `blocked()` are asked again (rule 21), and only a PERSON's request
   waits — at most one follow-up, run as `saveOnce(id, 'explicit')` after the lifetime is checked (rule 19). The
   promote-on-join code C7 described is deleted, so C7 no longer has a subject.
2. **The slot is keyed by the model instance, not only the id (§3).** A write that never answers used to hold
   the slot for every later lifetime of that path (attack T5). A slot held by a closed buffer now blocks nothing,
   and `holdSlot` releases only its own slot.
3. **C10 is reworded.** `save` resolving `true` means A WRITE LANDED, not that the tab is clean — typing that
   arrives during the write keeps the tab dirty under the completion rule. The one caller that acted on `true`
   as "clean" was `promptDirtyClose`, which closed the tab anyway and discarded the newest typing with no second
   question (attack S2). It now captures the buffer at the press, does nothing if the tab is gone or holds a
   different buffer, and ASKS AGAIN if the tab is still dirty (rule 20).
4. **Three defects that PREDATE this phase were fixed in it, with tests red before and green after,** because
   each loses work the same way F1 does:
   - `refreshRepo` snapshotted tabs, awaited the disk, then replaced the buffer, wiping typing that landed during
     the read and leaving the tab clean (attack T6). It now reads the live tab and the model instance again after
     the read and reloads only a buffer that is still clean and still the same buffer (rule 22). The verifier's
     suggested `model.getValue() !== live.savedContents` was built and refused: it reddened p225 and p254,
     because a clean buffer need not equal its baseline byte for byte.
   - A remote tab on a machine with a confirmed folder was editable but `markDirty` refused every remote tab, so
     typing never made it dirty and close asked nothing — since Phase 101 (attack S1). `markDirty` now refuses a
     remote tab only when `tabIsReadOnly` says so, which is MonacoHost's own question.
   - The close prompt's Save, above.
5. **§8's G rules, as shipped.** G1 is `conformance:save` rule 24: the auditor's closure test ships byte for byte
   as its fixture. G2 and G6 are rule 23: tab-io.ts writes no literal `dirty: false`, and `completeSave` is
   declared once and ends all four doors. G5 is not a separate rule; the completion's call count is covered by
   rule 23's per-door check.
6. **The gate's rule 1c is an exact comparison.** It began as a substring test and the fix round walked three
   shapes past it: a `'withSaveSlot'` string literal beside a bare `saveOnce`, an `auto` handed to a helper that
   names the plain door, and an early auto return in front of the slot. `save` must now be exactly
   `return withSaveSlot(id, reason, () => saveOnce(id, reason));` with whitespace removed.
7. **`ablation:p268` had been broken by the first build and nobody saw it**, because it is not in the commit
   battery: arm 1's anchor had gone, so it crashed before arms 2 to 5. Repaired, arm 3 (which had been planting
   the symlink hole in `overwrite`'s new `unguarded` arm rather than `saveInProject`'s) searches from
   `saveInProject`, the rule-number parser reads `1c`, and arms 6 to 18 were added. 18 of 18 go red on the rule
   that owns them.
8. **The stated limit (§7), as it now reads.** Switching auto save to Off need not interrupt an atomic write
   already submitted to main, but it stops every timer, and every timer's work that has not been submitted,
   because no timer's request can be waiting in the slot. The window between the last read of the buffer and the
   bridge call is one sha256 digest, and after item 1 that is true.
9. **What is still not closed.** The close prompt's re-check reads `dirty`, and `dirty` can trail the Redline
   view by one effect turn, so typing made in the Redline in the last effect turn before Save answers can be
   read as clean. Found by reading, not driven; it is stated here rather than fixed.
10. **Where S6 lives.** The store's settings subscription (S6) is owned by
    `src/renderer/editor/__tests__/p277-store-close-and-policy.test.ts`, and its two tests go red when
    `autoSave.notePolicyChanged()` is removed from store.ts.
