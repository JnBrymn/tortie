# Phase 268 — auto save, through the guarded door (issue 24)

**Subject:** `feat(editor): save on a delay, when you ask for it`
**First body line:** `Phase 268: auto save, through the guarded door`
**Semver:** minor — a new, default-off editor behaviour, one new settings field, one new menu row.
**Tier: 3.** It writes a person's files ON A TIMER on a machine where agents write the same files.
Budget: the gates, real data (a real second process writing the file underneath the buffer), and
**two independent methods, one of them an attack** — §7.

**Charter:** [issue 24](https://github.com/gregce/tortie/issues/24) (JnBrymn) and
[research 122](../../docs/research/122-issue-24-auto-save.md), which is the spec and was read from
VS Code's own source at `/Users/gdc/vscode` (`770a9bced0e`). **Do not re-derive research 122.**
Everything in §1 below is quoted from the tree at this worktree's HEAD with line numbers; the
builder reads the files, not this summary, before editing them.

---

## 0. The one thing that matters more than the feature

`npm run conformance:save` exists because of [issue 16](https://github.com/gregce/tortie/issues/16):
an agent's concurrent edit was silently overwritten and research 100 §1 measured the loss at **173
bytes** of somebody's paragraph — no toast, no banner, and a tab that went clean afterwards so
nothing was left to see. **A timer that writes the buffer is that bug on a loop.**

Three refusals bind this phase and a later round may not lift them for convenience:

1. **Auto save reaches disk through `fs:writeGuarded` and through nothing else.** No new channel,
   no unguarded fallback, no `files.saveConflictResolution` equivalent.
2. **Auto save never takes the plain door.** `saveOutsideProject`/`writePlain` is what a file
   outside every project, a never-saved draft and a symbolic link take on ⌘S; auto save refuses all
   three up front and on the channel's own `unguarded` answer.
3. **Auto save never opens a dialog.** A modal is a question put to a person who pressed something.
   A timer pressed nothing. On any non-`wrote` answer auto save stops for that tab and says ONE
   sentence; `offerStaleChoice` stays the explicit save's alone.

---

## 1. The reading (cited, do not re-derive)

### 1.1 The save path — `src/renderer/editor/tab-io.ts`

- **The ⌘S entry** is `const save = async (id: string): Promise<boolean>` at `tab-io.ts:1272`. Its
  body is a ladder of refusals that **names no write**: commit tab `:1279`, arch map `:1285`,
  diagnostics `:1288`, compare `:1294`, remote → `saveOnMachine` `:1305`, then
  `deleted || truncated || error !== null` `:1306`, no Monaco model `:1308`. The door choice is the
  last two lines, `:1352-1355`:

  ```ts
  const neverSaved = tab.draft != null && tab.savedContents === '';
  return !neverSaved && fileInRepo(tab.repoPath, tab.path)
    ? saveInProject(id, tab, value)
    : saveOutsideProject(id, tab, value, tab.savedContents);
  ```

- **The guarded door** is `saveInProject` at `:1195`. `const expect = await sha256Hex(tab.savedContents)`
  `:1200`, then `guardedSave({ root: tab.repoPath, path: tab.path, expect, contents: value })`
  `:1202`. On `wrote` it patches `deps.patch(id, { savedContents: value, dirty: false })` `:1209`.
  On `unguarded` (a symbolic link) it **falls through to the plain door** `:1215`. On `stale` it
  re-reads (`diskReading`, `:1241`) to tell a real outside write from a non-UTF-8 round trip, then
  calls `offerStaleChoice` (`:1128`). Any other refusal is a sticky error toast carrying
  `saveRefusalSentence(result.why, tab.name)` `:1256-1260`.
- **The plain, unguarded branch** is `writePlain` at `:880` — `await gmux.fs.writeFile(tab.path, value)`
  `:887` — reached from `saveOutsideProject` (`:1011`) alone, which reads the file first (`diskReading` `:930`,
  `decodeLost` `:973`). This is the door auto save must never reach (`tab-io.ts:37` and `:867` carry
  the argument for why it still exists).
- **The overwrite** is `overwrite` at `:1146`, guarded against the digest the channel handed back
  with `stale` (`expect: onDisk`), re-offering the choice on a second `stale` `:1166`.
- `deps.patch` is the store's `patchTab` (store.ts:421), handed in at `tab-io.ts:434`.

### 1.2 The door — `src/renderer/editor/save-write.ts`

`guardedSave(ctx)` (`:91`) is the one call site of `bridge.fs.writeGuarded` and **never throws**: a
missing bridge and a rejecting channel both answer `{ outcome: 'refused', why: 'io' }` (`:93`, `:106`).
Its four outcomes are `wrote` / `stale` (both carrying `sha256`) / `refused` (`why: SaveRefusalWord`)
/ `unguarded` (the `link` fallback), declared at `:62-70`. `saveRefusalWord` (`:77`) maps `link` to
`null`, which is the ONLY fallback.

### 1.3 The words — `src/renderer/editor/save-sentences.ts`

`SaveRefusalWord = Exclude<FsGuardedWriteRefusal, 'link'>` (`:65`). `SENTENCES` (`:68`) is a total
map over it — `outside`, `missing`, `readOnly`, `tooLarge`, `notUtf8`, `raced`, `input`, `io` —
and `saveRefusalSentence(why, name)` (`:104`) fills `{name}`. The `stale` surface is a DIALOG, not a
sentence: `staleSaveTitle(name)` (`:117`) → `'notes.md' changed on disk`, `STALE_SAVE_BODY` (`:128`),
`SAVE_COMPARE_LABEL` / `SAVE_OVERWRITE_LABEL` (`:138-139`).

**Auto save invents no refusal sentence.** It composes from these (§3.4).

### 1.4 Tab state and Phase 260 — `src/renderer/editor/store.ts`

- `patchTab(id, patch)` at `:421` is the **single funnel** for every tab-state change; `tabById` is
  `:427`; `io = createTabIo({ patch: patchTab, byId: tabById, worktreeTabsIn })` at `:433`.
- `markDirty(id, dirty)` at `:1254` is called from `MonacoHost.tsx:341` **on every content change**
  (`model.onDidChangeContent`), and from `redline-edits.ts:247` and `:272`. It early-returns when
  `tab.dirty === dirty` (`:1256`), so it sees every keystroke and acts on the edge only.
- `MAX_TABS = 10` (`:201`). The **eviction filter** at `:960-971`:

  ```ts
  if (own.length + 1 > MAX_TABS) {
    const evict = own
      .filter((t) => !t.dirty && t.id !== tab.id && t.id !== activeOf(s, projectId))
      .sort((a, b) => a.lastUsed - b.lastUsed)[0];
    if (evict !== undefined) { disposeModels(…); dropViewState(…); forgetRewindJournal(…); … }
  }
  ```
  `!t.dirty` is Phase 260's promise in the comment at `:953`: *"never unsaved work"*. `lastUsed` is
  stamped on **activation only** (`:1037`, `:1169`), never on typing.
- The store header `:130-138` records, measured, that an over-cap strip is an accepted state and that
  `evict === undefined` simply evicts nothing.

**What auto save does to this, and it is a real change:** with auto save on, a tab you typed in two
seconds ago goes CLEAN, loses its `!t.dirty` protection, and — because `lastUsed` does not move when
you type — is the **stalest** candidate. Opening an eleventh file would dispose its Monaco model, its
view state and **its rewind journal**, which is exactly the loss Phase 260 exists to prevent. §3.6
fixes it; the probe measures it (§7 arm F).

### 1.5 The File menu — `src/main/menu.ts`

The File submenu opens at `:637` and holds `Save` at `:687`. Two patterns this phase uses:

- **A row driven by a settings field.** `archRowsOn()` (`:255`) reads `getSettings().arch.enabled`
  inside a `try`, returning the default on an unreadable store; `src/main/settings/ipc.ts:93-97`
  calls `rebuildAppMenu()` when `archVisibilityChanged(before, next)`. The template reads settings
  synchronously as it is built, so there is nothing asynchronous to race.
  `src/main/__tests__/p175-arch-menu-flag.test.ts` is the test this phase copies.
- **A stateful item, and the Electron trap.** `:305-320` and the comment at `:313-320`: **mark the
  winner, never unmark the loser** — on Electron 43, assigning `checked = false` to an item that is
  already unchecked CHECKS it. A **checkbox** row is safe when the template is rebuilt from the
  settings value on every build, which is what this phase does, and a click must **not** set the mark
  itself (`:1042-1044`: "Clicking one does NOT set the mark: it forwards to the store").
- Menu action ids are `MenuActionId` in `src/shared/ipc/app.ts:112`; `item(label, action, accel, mark)`
  (`:236`) forwards via `sendMenuAction`. `src/renderer/app/menu-actions.ts:184` is the renderer's
  `save-file` arm, and `src/renderer/app/__tests__/p127-menu-actions.test.ts:36` holds the list of ids
  the renderer must handle.

### 1.6 Settings — `src/renderer/settings/GeneralSection.tsx` and the store

- The shapes: a `Switch` row (`GeneralSection.tsx:70-84`) and a `<select className="set-select">` row
  (`PopOutFocusRow`, `:263-292`), both inside `<div className="set-card">` under a
  `<div className="set-group-label">` (`:355-372`).
- `useSettingsStore` (`settings-store.ts`) holds the persisted `GmuxSettings` and writes with
  `update(patch: GmuxSettingsPatch)` (`:132`, `:232`). `watchSettings()` (`:118`) is the Phase 175
  cross-window subscription and **`App.tsx:268` already calls it in the main window**, so the editor
  reads the same truth the Settings window writes with no new plumbing.
- `GmuxSettings` is `src/shared/settings.ts:19`; `defaultGmuxSettings()` `:708`; nested groups
  `fold`/`arch`/`usage` `:141`, `:152`, `:183`. `sanitizeSettings` is `src/main/settings/store.ts:430`
  and `sanitizeArchSettings` (`:572`) is the per-group pattern: **an invalid row is dropped whole.**

### 1.7 `build/conformance-save.mjs` — the rules the build must not break

Nine rules, every scanner proved on 22 planted fixtures (rule 0, `:183-370`). The ones this phase
touches or must keep green:

| Rule | What it asserts | This phase |
| --- | --- | --- |
| 1 (`:382`) | `save`'s own body names no `writeFile`/`writeGuarded` AND reaches all three doors | **kept** — the auto guard names neither and all three door names stay |
| 2 (`:409`) | `writeFile` is named inside `writePlain` alone | **kept** |
| 2b (`:437`) | `writePlain` is reached from `saveOutsideProject` (`:1011`) alone, which reads first | **kept** |
| 2c/2d (`:456`, `:488`) | the plain door's Overwrite re-reads; the encoding question precedes the write | **kept** |
| 3 (`:519`) | `saveInProject` asks `sha256Hex(savedContents)` BEFORE `guardedSave` | **kept** |
| 4 (`:540`) | `overwrite` hands back the channel's digest, never its own | **kept** |
| 5 (`:565`) | three answers, Compare is the confirm | **kept, untouched** |
| 6 (`:591`) | the renderer reaches `fs:writeFile` from `tab-io.ts` and `history-search-shot-probe.ts` ALONE | **kept — and this is the ablation's target (§7b)** |
| 7 (`:616`) | `src/main/fs` registers exactly `fs:writeFile` and `fs:writeGuarded` | **kept** |
| 8 (`:634`) | the `SENTENCES` map's keys equal the union minus `link`; no sentence says "Could not save this file" | **constrains §3.4** |
| 9 (`:676`) | the gate is named in `package.json` and classified in `build/verification-checks.mjs` | **kept** |

**Rule 8's regex is `/const SENTENCES: Record<SaveRefusalWord, string> = \{([\s\S]*?)\n\};/` with keys
read as `^\s{2}([A-Za-z0-9]+):/gm`.** New exported constants and composers elsewhere in
`save-sentences.ts` are invisible to it; **a new key inside that block would break it.** Do not add
one. Do not let any new sentence contain the string `Could not save this file`.

---

## 2. The decisions

| Question | Answer | Why |
| --- | --- | --- |
| Setting name | `autoSave: { mode, delayMs }` on `GmuxSettings` | the nested-group shape `fold`/`arch`/`usage` already use |
| Modes shipped | `off` (**default**), `afterDelay`, `onFocusChange` | VS Code's own vocabulary |
| `onWindowChange` | **DROPPED** | Tortie is a single-window app whose sessions live inside that window — the operator does not leave it to watch an agent, he stays in it. Electron's window blur also fires for the Settings window, a native menu and a screenshot, so the mode would write on gestures that are not "I left". `onFocusChange` already covers the gesture issue 24 describes: clicking from the editor into a terminal to tell the agent to read the file. Stated as a refusal, not an omission |
| Delay | `delayMs`, default **1000**, clamped to **[250, 30000]**; Settings offers 1s / 2s / 5s / 10s | VS Code's default is 1000 with a minimum of 0; 0 is a guarded read-and-write per keystroke against files agents hold, so the floor is 250 |
| Debounce | **yes** — every content change re-arms the tab's timer | `markDirty` is already called per keystroke (`MonacoHost.tsx:341`), so the signal exists; a save lands on a settled buffer and writes far less |
| Where the timer lives | ONE module, `src/renderer/editor/auto-save.ts`, owning a `Map<tabId, timeout>` | one owner, one disposal path. Per-tab timers scattered across components leak on close, on eviction and on project switch |
| Who calls the save | the store, `io.save(id, 'auto')` | there is no second write path; `save` gains a `reason` and nothing else |
| Conflict-stop record | `stopped: Map<tabId, AutoSaveStopWhy>` in that same module | presence means stopped; it is the "shown once" record too |
| Cleared by | a successful write of any kind — observed as a `patchTab` carrying `savedContents` — and by `forget(id)` on close/evict | covers ⌘S, its Overwrite, and the remote door, with one hook and no new call sites in `tab-io` |
| NOT cleared by | typing, a tab switch, a mode change, a delay change | VS Code keeps `inConflictMode` until a save resolves it (`textFileEditorModel.ts:1211`) |
| "Shown once" | the sentence is emitted in the same statement that inserts the stop, and insertion only happens when the key is absent; the timer is never re-armed while stopped | two independent guarantees, and the probe counts toasts |
| File menu toggle | `File > Auto Save`, a **checkbox** that toggles `off` ↔ `afterDelay` only | VS Code's `toggleAutoSave` does exactly this. **Stated limit:** a person who chose `onFocusChange` in Settings, unticked the menu and re-ticked it lands on `afterDelay`. The alternative is a second persisted field remembering the last non-off mode, which is a second thing to sanitize for a gesture nobody has asked for |
| Out-of-project files | never auto saved, and it is not a setting | VS Code's `files.autoSaveWorkspaceFilesOnly` as the hard rule rather than an option: the plain door is unguarded and a timer does not get to use it |

---

## 3. The build

**ONE builder.** This is one coherent feature of ~500 lines whose every part reads the same three
files; splitting it across owners buys a reconcile and nothing else.

### 3.1 `src/shared/settings.ts` — the vocabulary

Beside `ArchSettings`:

```ts
/** VS Code's own vocabulary, minus onWindowChange (build/p268/SPEC.md §2). */
export type AutoSaveMode = 'off' | 'afterDelay' | 'onFocusChange';

export interface AutoSaveSettings {
  /** 'off' is the default: a person's files are not opted into timed writes by an upgrade. */
  mode: AutoSaveMode;
  /** Quiet time after the last keystroke before an `afterDelay` save. Clamped. */
  delayMs: number;
}

export const AUTO_SAVE_MODES: readonly AutoSaveMode[] = ['off', 'afterDelay', 'onFocusChange'];
export const DEFAULT_AUTO_SAVE_DELAY_MS = 1000;
export const MIN_AUTO_SAVE_DELAY_MS = 250;
export const MAX_AUTO_SAVE_DELAY_MS = 30_000;
/** The four the Settings row offers. The field itself accepts anything in range. */
export const AUTO_SAVE_DELAY_CHOICES: readonly number[] = [1000, 2000, 5000, 10_000];

export function clampAutoSaveDelay(value: unknown): number { … }   // non-finite → default
export function noAutoSave(): AutoSaveSettings { return { mode: 'off', delayMs: DEFAULT_AUTO_SAVE_DELAY_MS }; }
```

Add `autoSave: AutoSaveSettings` to `GmuxSettings` and `autoSave: noAutoSave()` to
`defaultGmuxSettings()`.

### 3.2 `src/main/settings/store.ts` — sanitize

Copy `sanitizeArchSettings`'s shape exactly (`:572`): a non-object, an unknown `mode`, a
non-finite `delayMs` — **the row is dropped whole** and the default is used; a valid `mode` with a
silly `delayMs` keeps the mode and clamps the delay. Add `out.autoSave = sanitizeAutoSaveSettings(obj['autoSave'])`
in `sanitizeSettings` (`:430`).

### 3.3 `src/renderer/editor/auto-save.ts` — the whole mechanism

Two halves in one module: a **pure policy** that a unit test and a gate can read, and a **controller**
that owns the timers.

```ts
export type SaveReason = 'explicit' | 'auto';

/** Why auto save stopped for a tab. `link` is the channel's `unguarded` answer. */
export type AutoSaveStopWhy = { kind: 'stale' } | { kind: 'refused'; why: SaveRefusalWord } | { kind: 'link' };

/** Why a tab is not an auto-save tab at all. null means it is one. */
export type AutoSaveSkip =
  | 'clean' | 'readOnly' | 'notAFile' | 'remote' | 'draft' | 'outsideProject' | 'projectClosed';

/**
 * VS Code's editorAutoSave.ts:151 ("no auto save for non-dirty, readonly or
 * untitled editors") plus Tortie's own: never a file the guarded channel
 * cannot take, because the door it would fall to is unguarded.
 */
export function autoSaveSkipReason(tab: EditorTab, openRoots: readonly string[]): AutoSaveSkip | null;
```

The skip order, and each clause names its cite:

1. `!tab.dirty` → `clean` (VS Code `:151`).
2. `tab.commit !== null` → `notAFile`; `tab.archMap`/`tab.diagnostics`/`tab.compare !== undefined`
   → `notAFile` (`save` refuses all four, `tab-io.ts:1279-1294`).
3. `tab.remote !== undefined` → `remote`. **This phase does not auto save another computer's file**
   — `machines:putFile` is a different channel with a different confirm gate.
4. `tabIsReadOnly(tab, null)`-equivalent: `tab.deleted || tab.truncated || tab.error !== null`
   → `readOnly` (`tab-io.ts:1306`; `MonacoHost.tsx:167` is the same question for the editor's
   `readOnly` option — **reuse `tabIsReadOnly` rather than restating it**, passing `null` for the
   remote write root since clause 3 already removed every remote tab).
5. `tab.draft != null && tab.savedContents === ''` → `draft` (`tab-io.ts:1352`; the channel answers
   `missing` and the door falls to `writePlain`).
6. `!fileInRepo(tab.repoPath, tab.path)` → `outsideProject` (`tab-io.ts:1353`; `fileInRepo` from
   `./tab-identity`).
7. `!openRoots.some((r) => fileInRepo(r, tab.path))` → `projectClosed`. This is the difference
   `tab-io.ts:1324-1336` records between `fileInRepo` and the channel's own
   `resolveOpenProjectRoot`: a tab whose project was CLOSED passes clause 6 and would be refused
   `outside`. Skipping it silently is better than a toast about a project the person closed on
   purpose. `openRoots` is `useApp.getState().projects.filter(isLocalTarget-ish).map((p) => p.path)`
   — read it in the controller, keep the policy pure.

The controller:

```ts
export interface AutoSaveDeps {
  save(id: string): Promise<boolean>;      // () => io.save(id, 'auto') — the ONLY route to disk
  byId(id: string): EditorTab | undefined;
  openRoots(): readonly string[];
  policy(): AutoSaveSettings;
  blocked(): boolean;                      // a confirm dialog is on screen
  toast(text: string): void;
  now(): number;                           // injected for the unit tests
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}
export interface AutoSaveController {
  noteChanged(id: string): void;   // every content change (markDirty, before its early return)
  noteBlur(id: string): void;      // the editor lost focus — onFocusChange
  notePatched(id: string, before: EditorTab | undefined, after: EditorTab): void;
  forget(id: string): void;        // closed or evicted
  touched(id: string): boolean;    // auto save has written this tab — §3.6
  stoppedFor(id: string): AutoSaveStopWhy | undefined;   // read by the tests and the probe
  disposeAll(): void;
}
export function createAutoSave(deps: AutoSaveDeps): AutoSaveController;
```

Rules inside it:

- `noteChanged`: `clearTimer` the tab's pending handle; return if `policy().mode !== 'afterDelay'`,
  if `stopped.has(id)`, or if `autoSaveSkipReason(...) !== null`; else `setTimer(() => run(id), policy().delayMs)`.
- `noteBlur`: return unless `policy().mode === 'onFocusChange'`; then the same guards and
  `run(id)` immediately.
- `run(id)`: refuse again if `blocked()`, if `inFlight.has(id)`, or if the skip reason moved (the
  tab may have gone clean, been closed, or had its project closed while the timer ran); then
  `inFlight.add(id)`, `await deps.save(id)`, `inFlight.delete(id)` **in a `finally`**.
- `recordStop(id, why)` — **the whole of "shown once"**:
  ```ts
  if (stopped.has(id)) return;          // FIRST. Nothing below runs twice.
  stopped.set(id, why);
  cancelTimer(id);
  deps.toast(autoSaveStopSentence(why, name));
  ```
- `notePatched`: when `after.savedContents !== before?.savedContents` → `stopped.delete(id)` and
  `wrote.add(id)` is left alone (a successful write of any kind clears the stop, §2). When
  `after.dirty === false && before?.dirty === true` → `cancelTimer(id)`.
- `forget(id)`: `clearTimer`, `stopped.delete`, `wrote.delete`, `inFlight.delete`.
- **`setInterval` appears nowhere in this module.** One `setTimeout` per dirty tab, cleared on every
  re-arm, every patch to clean, every stop and every `forget`.

### 3.4 `src/renderer/editor/save-sentences.ts` — the auto-save composers

**No existing sentence changes and no key is added to `SENTENCES`** (rule 8, §1.7). Add, at the foot
of the file, in the same "just enough words" register:

```ts
/** The clause every auto-save stop ends with. One sentence, and it names the way back. */
const AUTO_SAVE_STOPPED = 'Tortie stopped saving it on its own — press ⌘S when you are ready.';

export function autoSaveStopSentence(why: AutoSaveStopWhy, name: string): string {
  if (why.kind === 'stale') return `${staleSaveTitle(name)}, so nothing was written. ${AUTO_SAVE_STOPPED}`;
  if (why.kind === 'link') return `Tortie does not save ${name} on its own, because it is a link. Press ⌘S to save it.`;
  return `${saveRefusalSentence(why.why, name)} ${AUTO_SAVE_STOPPED}`;
}
```

- `stale` reads *"'notes.md' changed on disk, so nothing was written. Tortie stopped saving it on its
  own — press ⌘S when you are ready."* It reuses `staleSaveTitle` so the auto-save sentence and the
  explicit dialog say the same thing about the same event.
- `refused` reuses `saveRefusalSentence` verbatim and appends one clause.
- `link` is the one case with no refusal behind it: nothing went wrong and nothing was written. It
  says so and points at ⌘S, which still saves it through the plain door exactly as today.
- `AutoSaveStopWhy` is imported from `./auto-save`; keep the import type-only so the cycle stays a
  type cycle.

### 3.5 `src/renderer/editor/tab-io.ts` — the reason, and nothing else

`SaveReason` is imported from `./auto-save`. **Three edits, no fourth:**

1. `save(id: string, reason: SaveReason = 'explicit')` — the default keeps every existing caller
   compiling and keeps ⌘S byte-identical. The last lines become:
   ```ts
   const neverSaved = tab.draft != null && tab.savedContents === '';
   const guarded = !neverSaved && fileInRepo(tab.repoPath, tab.path);
   // Auto save never takes the plain door: it is unguarded, and issue 16 is
   // what an unguarded write on a timer costs. build/p268/SPEC.md §0.
   if (reason === 'auto' && !guarded) return false;
   return guarded
     ? saveInProject(id, tab, value, reason)
     : saveOutsideProject(id, tab, value, tab.savedContents);
   ```
   Rule 1 stays green: no write channel is named and all three door names are still in the body.
2. `saveInProject(id, tab, value, reason)` — the digest and the `guardedSave` call are **untouched
   and still in that order** (rule 3). Only the non-`wrote` arms branch:
   ```ts
   if (result.outcome === 'unguarded') {
     // A symbolic link. The plain door is where it belongs on ⌘S, and it is
     // the one door auto save may not take.
     if (reason === 'auto') return autoStop(id, { kind: 'link' });
     return saveOutsideProject(id, tab, value, tab.savedContents);
   }
   if (result.outcome === 'stale') {
     …the existing notUtf8 re-read, unchanged, which for `auto` ends in
       autoStop(id, { kind: 'refused', why: 'notUtf8' }) instead of the toast…
     if (reason === 'auto') return autoStop(id, { kind: 'stale' });
     offerStaleChoice(…);   // explicit only
     return false;
   }
   if (reason === 'auto') return autoStop(id, { kind: 'refused', why: result.why });
   …the existing sticky toast, unchanged…
   ```
   `autoStop` is one line handed in through `TabIoDeps` (`autoStop(id, why): false`) so `tab-io`
   holds no timer state and the controller keeps the whole "shown once" rule. It returns `false`.
3. `TabIo.save`'s doc comment and `TabIoDeps` gain the two lines above. **`writePlain`,
   `saveOutsideProject`, `overwrite` and `offerStaleChoice` are not edited at all.**

### 3.6 `src/renderer/editor/store.ts` — wiring, and the eviction clause

- Build the controller next to `io` (`:433`):
  ```ts
  const autoSave = createAutoSave({
    save: (id) => io.save(id, 'auto'),
    byId: tabById,
    openRoots: () => useApp.getState().projects.filter(isLocalProject).map((p) => p.path),
    policy: () => useSettingsStore.getState().settings.autoSave,
    blocked: () => useApp.getState().confirm !== null,
    toast: (text) => useApp.getState().toast('error', text, { sticky: true }),
    …
  });
  ```
  and pass `autoStop: (id, why) => { autoSave.recordStop(id, why); return false; }` into
  `createTabIo`. `isLocalProject` is `isLocalTarget(targetOfProject(p))`, already imported at `:150`.
- `patchTab` (`:421`) reads `const before = tabById(id)` and calls
  `autoSave.notePatched(id, before, after)` after the `set`. **This is the only new call in the
  patch funnel.**
- `markDirty` (`:1254`) calls `autoSave.noteChanged(id)` **before** its `tab.dirty === dirty`
  early return, so the debounce sees every keystroke.
- `forceCloseTab`, the preview-slot reuse (`:940-949`) and the eviction (`:967-971`) each call
  `autoSave.forget(id)` beside the existing `disposeModels` / `dropViewState` / `forgetRewindJournal`
  triple. **Grep for that triple and add the fourth member at every site.**
- **The eviction clause (§1.4's real change).** `:961-965` becomes:
  ```ts
  const evict = own
    .filter(
      (t) =>
        !t.dirty &&
        // PHASE 268. With auto save on, a tab you were typing in two seconds
        // ago is CLEAN, and `lastUsed` does not move when you type, so it is
        // the STALEST candidate here. Evicting it disposes its Monaco model,
        // its view state and its rewind journal — the loss Phase 260 exists
        // to prevent, arriving by a different route. A tab auto save has
        // written is work in progress, which is what `!t.dirty` meant before
        // there was a timer.
        !autoSave.touched(t.id) &&
        t.id !== tab.id &&
        t.id !== activeOf(s, projectId)
    )
    .sort((a, b) => a.lastUsed - b.lastUsed)[0];
  ```
  `evict === undefined` already means "evict nothing", and the store header at `:130-138` already
  records an over-cap strip as an accepted state, so no new branch is needed. `touched` is cleared
  by `forget`, so a closed tab does not protect anything.
- Two actions for the menu and Settings: none are needed for the policy (it is read live from
  `useSettingsStore`), but the store must call `useSettingsStore.getState().watchSettings()` if
  `init()` does not already reach it — `App.tsx:268` does, so **verify and do nothing** rather than
  adding a second subscription.

### 3.7 `src/renderer/editor/MonacoHost.tsx` — `onFocusChange`

In the same effect that installs `contentListener` (`:339`), install
`ce.onDidBlurEditorWidget(() => useEditor.getState().autoSaveOnBlur(tab.id))` and dispose it in the
same teardown the content listener uses. Add `autoSaveOnBlur(id)` to the store's action surface,
forwarding to `autoSave.noteBlur(id)`.

**Stated limit:** a dirty tab that never held focus is never saved by `onFocusChange` — it cannot
lose focus it never had. That is VS Code's behaviour too. `afterDelay` is the mode for that case.

### 3.8 `src/main/menu.ts` + `src/shared/ipc/app.ts` + the renderer's handler — the native menu

**What changes in the native menus, in the words the commit body needs:** the File menu gains one
row, `Auto Save`, a checkbox directly under `Save` and above the separator that precedes
`Close Editor Tab`. Nothing else in any menu moves.

```ts
// PHASE 268. Directly under Save, which is the verb it modifies. A CHECKBOX
// rather than three radios: the two other modes are a Settings choice, and a
// File menu that asks "after a delay or on focus change?" is the paragraph
// the UI rules refuse. Ticked means "not off".
//
// NO MARK, argued. A macOS checkbox item already draws a state mark, so an
// icon would sit beside a check — the same argument the View menu's radios
// carry at menu.ts:1032-1041. Save's own `save` glyph on the row under it would also be
// one picture on two verbs inside one submenu, which is the defect
// build/assert-menu-glyphs.mjs exists to stop.
{
  id: 'auto-save',
  label: 'Auto Save',
  type: 'checkbox',
  checked: autoSaveOn(),
  click: () => sendMenuAction('toggle-auto-save')
}
```

- `autoSaveOn()` is `archRowsOn()`'s twin: `try { return getSettings().autoSave.mode !== 'off'; } catch { return false; }`.
- `src/main/settings/ipc.ts`: add `autoSaveChanged(before, next)` (mode moved) to the
  `rebuildAppMenu()` condition at `:93`, beside `hotkeysChanged` and `archVisibilityChanged`.
- **The click does not set the mark.** It forwards; the setting is written; `settings:set` rebuilds;
  the rebuilt template reads the new value. This is the Electron-43 trap at `menu.ts:313-320` avoided
  by construction.
- `src/shared/ipc/app.ts:112`: add `| 'toggle-auto-save'` to `MenuActionId`, with a comment saying
  why it is unaccelerated (every built-in chord is one a person can no longer record as a per-agent
  hotkey — `menu.ts:653`'s own argument).
- `src/renderer/app/menu-actions.ts`: a `case 'toggle-auto-save'` arm that reads
  `useSettingsStore.getState().settings.autoSave.mode` and calls
  `update({ autoSave: { mode: mode === 'off' ? 'afterDelay' : 'off', delayMs } })`.
- `src/renderer/app/__tests__/p127-menu-actions.test.ts:36`: add the id to the list.

### 3.9 `src/renderer/settings/GeneralSection.tsx` — the fuller choice

A new **Editor** group between Sessions and the shell command card, one card, two rows:

- `Auto save` — a `<select className="set-select">` with `Never` / `After a delay` /
  `When the editor loses focus`, label + one-line caption: *"Tortie saves through the same check ⌘S
  uses, so a file an agent changed is never written over."*
- `Save after` — a `<select>` of the four delays (`1 second` … `10 seconds`), **rendered only when
  the mode is `afterDelay`** (a control that does nothing is worse than no control).

Both write with `useSettingsStore.getState().update({ autoSave: { … } })`. Colors: none — the rows
use the existing `set-row` / `set-select` classes, so **no new CSS and no color literal**.

### 3.10 `build/conformance-save.mjs` — four new rules and their fixtures

Rules 10-13, each with planted fixtures added to `FIXTURES` (§1.7 rule 0), **at least one per rule
that must make the rule fail**. Keep the existing rule numbering and the `say`/`fail` shape.

- **Rule 10. The auto save module names no write and no plain door.**
  `src/renderer/editor/auto-save.ts` must not contain `writeFile`, `writeGuarded`, `writePlain`,
  `saveOutsideProject`, `fs:writeFile` or `setInterval`. Its one route to disk is `deps.save`.
  *Fixture that must fail:* a module body containing `gmux.fs.writeFile(`.
- **Rule 11. `save` refuses the plain door for the auto reason.**
  `bodyOrder(code, 'save', "reason === 'auto'", 'saveOutsideProject') === true` — the guard is read
  before the door name appears. *Fixtures:* a `save` with the ternary and no guard (must fail); a
  `save` whose guard sits after the ternary (must fail); the shipped shape (clean).
- **Rule 11b. `saveInProject`'s `unguarded` arm refuses the plain door for the auto reason.**
  `bodyOrder(code, 'saveInProject', "'auto'", 'saveOutsideProject') === true`. *Fixture that must
  fail:* the shape at this phase's parent, `if (result.outcome === 'unguarded') return saveOutsideProject(…)`
  with no reason test — **this is the symlink hole, and it is the one a later round reopens.**
- **Rule 12. The stop is recorded before the sentence, and only once.**
  In `auto-save.ts`, the body of `recordStop` mentions `stopped.has` before `toast`, and mentions
  `stopped.set`. *Fixtures:* a `recordStop` that toasts first (must fail); one with no membership
  check at all (must fail); the shipped shape (clean).
- **Rule 13. Auto save invents no refusal sentence.**
  `autoSaveStopSentence`'s body reaches `saveRefusalSentence` and `staleSaveTitle` and contains no
  new `Tortie did not save` literal of its own. *Fixture that must fail:* a composer with its own
  hand-written refusal string.

Update the file header's rule list (`:31-69`) with the four new rules, in the same register.

### 3.11 `src/renderer/editor/__tests__/p268-auto-save.test.ts` — behavioural, pure, injected clock

Drive `createAutoSave` with a fake timer and a fake `save`. RED before the build, green after:

1. Every skip reason, one case each — seven `null`-vs-reason rows over hand-built `EditorTab`s.
2. `off` arms nothing; `afterDelay` arms once per change and **re-arms** (three changes 100 ms apart
   with a 1000 ms delay fire ONCE, 1000 ms after the last); `onFocusChange` arms nothing and saves
   on blur.
3. A refusal records the stop, toasts **once**, and a further ten `noteChanged` calls plus ten timer
   advances produce **no second toast and no second save**.
4. A `patchTab` carrying a new `savedContents` clears the stop, and the next change arms again.
5. Typing does NOT clear the stop.
6. `blocked()` true → `run` writes nothing.
7. `forget(id)` cancels a pending timer and drops the stop and the touched mark.
8. `autoSaveStopSentence` for all three kinds: each contains the file's name, ends in a full stop,
   and — for `refused` — starts with the byte-identical `saveRefusalSentence` output.

Plus a structural test `p268-menu-row.test.ts` in `src/main/__tests__/`, modelled on
`p175-arch-menu-flag.test.ts`: the File submenu carries `Auto Save` as `type: 'checkbox'`, `checked`
follows `getSettings().autoSave.mode !== 'off'` across a `rebuildAppMenu()`, and the click handler
sends `toggle-auto-save` rather than assigning `checked`.

### 3.12 The four obligations that ride in this commit

1. **The contract baseline.** A new `MenuActionId` union member is not obviously in
   `docs/audits/contract-baseline.txt` (the inventory covers channels, the manifest schema,
   `gmux.*` localStorage keys, `GMUX_*` env names and harness smoke modes). **Run
   `node build/contract-inventory.mjs --out docs/audits/contract-baseline.txt` and `git diff` it.**
   If it moved, commit it and name the lines in the commit body. If it did not, say so.
2. **No `gmux.*` localStorage key is added.** The setting is a settings-file field, and the delay is
   read from it. Do not reach for `localStorage` for any part of this.
3. **`CLAUDE.md` gates table**, same commit: add `src/renderer/editor/auto-save.ts` and the
   `markDirty`/eviction seam in `src/renderer/editor/store.ts` to the `conformance:save` trigger row,
   and add a `probe:p268` row to the probes table.
4. **`package.json`** gains `"probe:p268"`, and **`build/verification-checks.mjs`** classifies it, or
   `conformance:save` rule 9's sibling discipline decays. Neither goes in the commit battery.

### 3.13 Gates for this commit

`npm run typecheck && npm run build && npm test && npm run smoke:t1`, plus, by the path-trigger table:

- `npm run conformance:save` — **the rule that matters**, and it must be re-run after the ablation
  restores the file.
- `npm run gate:contract` — runs inside `npm run build`; see obligation 1.
- `npm run smoke:t3` and `npm run package` for the integrator.
- **`conformance:redline` is NOT triggered** — this phase touches no file in rule 9's derived set
  (`redline*`, `Redline*`, `rewind.ts`, `baseline*`, `src/main/baselines/`, `src/shared/baselines.ts`,
  `src/shared/prose-paths.ts`). **Do not touch one.** If you find you must, the floor moves in the
  same commit.

---

## 4. What a person can do afterwards, and what is still not true

**Can:** turn on Auto Save from File > Auto Save or choose the mode and delay in Settings > General >
Editor; type in a file inside a project and find it on disk a second later, so the agent they turn to
next reads what they wrote.

**Still not true:** files outside every open project are never saved on a timer; another computer's
files are never saved on a timer; a file that is a link is never saved on a timer; and the moment
something else writes a file underneath a buffer, auto save stops for that file until the person
saves it themselves. Auto save is off out of the box.

---

## 5. What is NOT in this phase

- No `files.saveConflictResolution` equivalent and **no unguarded auto-write anywhere**.
- No `onWindowChange` (§2 carries the argument).
- No auto save for out-of-project files, remote files, drafts or links.
- No format-on-save, fix-on-save or per-language override.
- **No change to ⌘S, to `offerStaleChoice`, to `overwrite`, to `writePlain`, to `saveOutsideProject`,
  or to any existing refusal sentence.** The gate pins all of them and this phase keeps them green.
- No hot exit and no unsaved state across restart.
- No new toast surface, no banner, no status-bar item, no badge. One sticky error toast, the one the
  save path already uses.
- No change to the redline, the rewind journal or the durable baseline — they are DRIVEN by the probe,
  not edited.

---

## 6. Risks the builder must not talk itself out of

| Risk | The answer |
| --- | --- |
| "The guarded channel refused once, let's fall back to `fs:writeFile` so the save isn't lost" | This is issue 16 verbatim and rules 6, 10 and 11 go red. The buffer is not lost — the tab stays dirty. |
| "`unguarded` just means a link, the plain door reads first now, so auto save can use it" | The plain door's stale answer opens a **dialog**. A timer does not open dialogs (§0 refusal 3), and its read-then-write window is one IPC round trip wide (`save-sentences.ts:56-62`). Rule 11b. |
| "Show the sentence every time so the person doesn't miss it" | A 1000 ms timer against a file an agent is rewriting is a toast a second. Rule 12. |
| "Clear the stop when they type again — they've seen it" | VS Code keeps `inConflictMode` until a save resolves it. Typing is not a resolution; it is more unsaved work over bytes you have not looked at. |
| "Auto save can also cover the out-of-project Context tab, it's the common case for `~/.claude/CLAUDE.md`" | That path takes the unguarded door by design and an agent writes that exact file. Skip clause 6. |
| "Keep `!t.dirty` in the eviction filter, auto save makes it moot" | It makes it WRONG, §1.4. The probe reads the rewind journal after an eleventh open. |

---

## 7. Verification — Tier 3, and the independent methods named

**The governing rule: the verifier must do at least one thing the builder did not, and name it.**
Two independent methods are required and one of them is an attack.

### (a) THE APP RUN, over real data, with a REAL CONCURRENT WRITER — `build/p268/probe-p268-autosave.mjs`

`npm run probe:p268`. ONE Electron through `withElectron` (ended in a `finally`), a scratch profile,
a scratch `HOME`, its own tmux socket through `build/harness-socket.mjs` (`gmux-p268-…`; `gmux` and
`default` refused by name), and **every byte written under `GMUX_HARNESS_DIR`**. It spawns no agent,
spends no token, opens no keychain and makes no request. The "agent" is a `/bin/sh` this script runs
that writes one file. `--self-test` proves the grader on fixtures and launches nothing. Model:
`build/p260/probe-p260-tabs.mjs` (the CDP drive, `until`/`untilDisk`, `press`/`typeInto`, the
operator's `-L gmux` session count read before and after and asserted unmoved). Reads come through a
`p268` entry in `src/renderer/app/probe-registry.ts` exposing the policy, each tab's dirty flag and
stop record, and the toast texts on screen.

| Arm | What it drives | What must be true |
| --- | --- | --- |
| **A. it saves** | one git project, `notes.md` open, Auto Save on `afterDelay` 1000 ms, type a word | the file on disk holds the typed bytes within 3 s; the dirty dot is gone; **no dialog appeared** |
| **B. it debounces** | type 10 characters 100 ms apart | ONE write (mtime/`ctime` samples), not ten |
| **C. the concurrent writer — THE ARM THAT MATTERS** | a `/bin/sh` writes 173 bytes of "an agent's paragraph" into `notes.md`; then type one character in Tortie; wait 5 delay periods | the file on disk is **byte-identical** (md5) to what the outsider wrote; the tab is **still dirty**; **exactly ONE** toast is on screen and its text is `autoSaveStopSentence({kind:'stale'}, 'notes.md')`; the stop record for that tab reads `stale`; **no further write in 5 more periods** |
| **D. the stop is per tab** | a second file in the same project, typed into | it still auto saves while the first is stopped |
| **E. ⌘S is the only way forward** | press ⌘S on the stopped tab | the existing three-answer dialog appears, Compare is focused, Overwrite is the alt (unchanged); press Overwrite; the file holds the buffer; the stop clears and the next keystroke arms the timer again |
| **F. Phase 260's promise survives** | a redline with one change rewound in tab 1; auto save writes it; open eleven files in that project | the rewound tab is **still on the strip**, ⌥⇧⌫ still undoes the rewind (the journal survived), ⌘Z still undoes the typing (the model survived), and the baseline generation read off the face is unchanged |
| **G. the skip list, on disk** | a file OUTSIDE every project opened as a tab (the `~/.claude/CLAUDE.md` shape, inside the scratch HOME), typed into, with auto save on | the file's mtime **never moves** for 10 delay periods. This is the proof that `fs:writeFile` is never reached on a timer |
| **H. `onFocusChange`** | switch the mode; type; click into a terminal | the file lands on disk at the click, not before |
| **I. off is off** | mode `off`; type; wait 20 s | the file never moves |
| **J. the menu** | tick File > Auto Save, read `getSettings()`; untick | mode goes `off` → `afterDelay` → `off`, the tick follows, and the Settings window's select agrees in the same session |
| **K. the operator's world** | before/after | `tmux -L gmux list-sessions` count unmoved; the Electron count read ONCE at the end with `ps -Ao pid,ppid,rss,comm \| grep -E "[E]lectron\|Tortie$\|chrome_crashpad" \| grep -v defunct` |

### (b) THE ATTACK — the ablation, `build/p268/ablation.mjs`

Proves `conformance:save` can still fail, which is the only thing that makes it evidence.

1. Copy `src/renderer/editor/auto-save.ts` and `tab-io.ts` to a scratch path. **Restore both in a
   `finally`, whatever happened.**
2. Ablation 1: route auto save through the unguarded door — add
   `await gmuxBridge().fs.writeFile(path, contents)` to `auto-save.ts`. Assert
   `npm run conformance:save` exits **non-zero** and names **rules 6 and 10**.
3. Ablation 2: delete the auto guard from `save`'s body. Assert non-zero, **rule 11**.
4. Ablation 3: restore the parent's `unguarded` arm, `return saveOutsideProject(…)` with no reason
   test — the symlink hole. Assert non-zero, **rule 11b**.
5. Ablation 4: move the `toast` above the `stopped.has` check in `recordStop`. Assert non-zero,
   **rule 12**.
6. Restore; assert `conformance:save` exits **zero**.

Each ablation is one clause and must go red on the rule that owns it — no ablation may pass, and an
ablation that reddens a rule other than its own is a finding about the gate.

### (c) What the VERIFIER should do that the builder did not (attack the ruling)

Pick at least one, and name it in the verdict:

- **Re-derive the write count independently.** Do not trust the probe's own counter: run
  `fs.watch`, or sample `stat` at 50 ms, over the scratch file for a 60 s typing run and compare the
  number of distinct contents against what the probe reported. A debounce that is really a
  save-per-keystroke shows up here and nowhere else.
- **Attack "shown once" for 10 minutes.** Leave a stopped tab with a `/bin/sh` rewriting the file
  every 200 ms and count the toasts on screen. The claim is 1.
- **Attack the skip list with a hostile tab.** A symlink inside the project; a file whose project is
  closed under it while the timer is armed; a tab whose file is deleted between the arm and the tick.
  None may reach `fs:writeFile`, and none may crash.
- **Measure the parent commit** for arm C. At the parent there is no auto save, so the honest parent
  measurement is arm G's equivalent on ⌘S — confirming the 173-byte loss is still refused there and
  that this phase moved nothing about ⌘S.

### Machine discipline

Probes may run up to four at once; this phase's is one Electron. Every process started is ended in a
`finally`. Never SIGKILL the `node_modules/.bin/electron` shim — launch through `withElectron`,
which owns the whole sequence. Count Electrons once, at the end.

---

## 8. The file list

**New**
- `src/renderer/editor/auto-save.ts`
- `src/renderer/editor/__tests__/p268-auto-save.test.ts`
- `src/main/__tests__/p268-menu-row.test.ts`
- `build/p268/probe-p268-autosave.mjs`
- `build/p268/ablation.mjs`

**Changed**
- `src/shared/settings.ts` — `AutoSaveMode`, `AutoSaveSettings`, the bounds, `noAutoSave()`, the
  `GmuxSettings` field, the default
- `src/main/settings/store.ts` — `sanitizeAutoSaveSettings`, wired into `sanitizeSettings`
- `src/main/settings/ipc.ts` — `autoSaveChanged` in the `rebuildAppMenu()` condition
- `src/main/menu.ts` — `autoSaveOn()`, the File > Auto Save checkbox row
- `src/shared/ipc/app.ts` — `'toggle-auto-save'`
- `src/renderer/app/menu-actions.ts` — the toggle arm
- `src/renderer/app/__tests__/p127-menu-actions.test.ts` — the id
- `src/renderer/app/probe-registry.ts` — the `p268` read surface
- `src/renderer/editor/tab-io.ts` — the `reason` parameter and its three arms
- `src/renderer/editor/save-sentences.ts` — `autoSaveStopSentence` (no existing sentence touched)
- `src/renderer/editor/store.ts` — the controller, the `patchTab`/`markDirty` hooks, `forget` at
  every dispose site, the eviction clause, `autoSaveOnBlur`
- `src/renderer/editor/MonacoHost.tsx` — the blur listener
- `src/renderer/settings/GeneralSection.tsx` — the Editor group
- `build/conformance-save.mjs` — rules 10, 11, 11b, 12, 13 and their fixtures
- `package.json`, `build/verification-checks.mjs` — `probe:p268`
- `CLAUDE.md` — the `conformance:save` trigger row and the probes table
- `docs/audits/contract-baseline.txt` — only if the inventory moved, and the commit body says which
  lines

**Must NOT be touched:** `save-write.ts`, `redline*`, `rewind.ts`, `baseline*`,
`src/main/fs/guarded-write.ts`, `src/main/fs/ipc.ts`, and `writePlain` / `saveOutsideProject` /
`overwrite` / `offerStaleChoice` inside `tab-io.ts`.
