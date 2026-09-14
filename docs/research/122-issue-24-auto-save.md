# Auto save, and the one thing it must not become

Date: 14 September 2026. Written from VS Code's own source at `/Users/gdc/vscode` (the operator's
checkout, commit `770a9bced0e`) and from Tortie's save path, at his request to "check what vscode
does".

[Issue 24](https://github.com/gregce/tortie/issues/24), JnBrymn: "I keep forgetting to CTRL+S and
then the agent gets confused when I tell it to read a file. This comes up a lot more often when
editing prose text."

The ask is small and the danger is not. This document exists so the phase does not walk into the
danger, because Tortie already had this exact bug once and fixed it.

## The danger, stated first

`npm run conformance:save` exists because of [issue 16](https://github.com/gregce/tortie/issues/16),
Sean Johnson, 8 September 2026: *"When I edit a file, then save, there's no warning if someone else
(presumably an agent) edited it concurrently and I'm overwriting its edits (as VSC does)."* Research
100 §1 reproduced it in the running app and measured the loss at **173 bytes of an agent's
paragraph**, with zero toasts, zero banners, no dialog, and a tab that went clean afterwards so
nothing was left to see. The fix was one line — `fs:writeFile` to `fs:writeGuarded` — and the gate's
own header says why it is a gate: *"one line is exactly the kind of thing a later round moves back
for convenience."*

**Auto save is that later round.** A timer that writes the buffer every second, against a machine
running many agents that write the same files, is issue 16 on a loop — and worse, because with ⌘S a
person at least knows they pressed something. This phase adds auto save *through* the guarded door or
it does not add it at all.

## What VS Code actually does, read from its source

### The setting

`src/vs/workbench/contrib/files/browser/files.contribution.ts` defines `files.autoSave` with four
values and these exact descriptions:

| value | description |
| --- | --- |
| `off` | An editor with changes is never automatically saved. |
| `afterDelay` | An editor with changes is automatically saved after the configured `files.autoSaveDelay`. |
| `onFocusChange` | An editor with changes is automatically saved when the editor loses focus. |
| `onWindowChange` | An editor with changes is automatically saved when the window loses focus. |

Default is `off` on desktop (`afterDelay` on web). `files.autoSaveDelay` defaults to **1000 ms** and
applies only to `afterDelay`. Two later settings narrow it: `files.autoSaveWorkspaceFilesOnly`
(default false, limits auto save to files inside the opened workspace) and `files.autoSaveWhenNoErrors`
(default false, limits it to files with no reported errors). The File menu carries an **Auto Save**
toggle, and the setting can be overridden per language.

### What it refuses to auto save

`src/vs/workbench/browser/parts/editor/editorAutoSave.ts:151`, in one line:

> `return; // no auto save for non-dirty, readonly or untitled editors`

An untitled buffer has no path, so saving it would need a dialog, which is not something a timer gets
to open. A read-only editor cannot be written. A clean editor has nothing to write.

### What it does when the file changed on disk — the decisive part

`src/vs/workbench/services/textfile/common/textFileEditorModel.ts` sends the file's **etag** with the
write (`:940`), and a write whose etag no longer matches comes back
`FileOperationResult.FILE_MODIFIED_SINCE`, which sets `inConflictMode = true` (`:992-993`). Then, at
`:751-753`:

```
this.trace('save() - ignoring auto save request for model that is in conflict or error');
return false; // if model is in save conflict or error, do not save unless save reason is explicit
```

**So VS Code stops auto saving a file the moment its save conflicts, and only an explicit,
user-initiated save proceeds after that.** Auto save never resolves a conflict on its own and never
overwrites the other writer. It also does not re-ask every second: the model stays in conflict mode
until a resolve path clears it (`:1211`).

VS Code does offer `files.saveConflictResolution` to disable the etag check entirely. **Tortie must
not adopt that**; it is precisely the escape hatch issue 16 is about.

## How that maps onto Tortie, which already has the right machinery

Tortie's `fs:writeGuarded` is a compare-and-swap over one file carrying **the digest of
`tab.savedContents`** (`src/renderer/editor/tab-io.ts:34`, `save-write.ts`). That digest plays exactly
the role VS Code's etag plays. A refusal comes back as a WORD (`SaveRefusalWord`) which
`save-sentences.ts` turns into a sentence naming the file and ending "Nothing was written." Overwrite
exists but, per the gate, **is never the default and is re-checked**.

So the mapping is one-to-one and the phase does not need to invent a conflict model:

| VS Code | Tortie |
| --- | --- |
| etag sent with the write | digest of `savedContents` through `fs:writeGuarded` |
| `FILE_MODIFIED_SINCE` | the guarded channel's refusal word |
| `inConflictMode = true` | a per-tab flag this phase adds |
| "do not save unless save reason is explicit" | auto save stops for that tab; ⌘S still works |
| `files.saveConflictResolution` escape hatch | **refused — do not port it** |

One thing Tortie has that VS Code does not: `save` for a file **outside** every open project root
deliberately keeps the unguarded `fs:writeFile` (`tab-io.ts:37`, `:867`), because the guarded door is
defined in terms of a project. Auto save must therefore decide what it does for an out-of-project
file. The conservative answer, and the one this document recommends: **auto save only files inside an
open project** — which is also VS Code's own `files.autoSaveWorkspaceFilesOnly`, just as the default
rather than as an option. A timer that writes unguarded to arbitrary paths on disk is not a thing
Tortie should own.

## What the phase should build

1. **A setting with VS Code's vocabulary**, because it is the vocabulary people already know:
   `off` (default), `afterDelay`, `onFocusChange`, `onWindowChange`, plus a delay whose default is
   1000 ms. Whether all four modes ship, or only `off` + `afterDelay` + `onFocusChange`, is the
   phase's call — `onWindowChange` is the least useful in a window people leave to watch an agent.
   Default MUST be `off`: a person's files are not opted into timed writes by an upgrade.
2. **The toggle where people look for it.** VS Code puts it at File > Auto Save. Tortie's File menu
   is `src/main/menu.ts:637`, and CLAUDE.md requires a phase adding a user-facing surface to update
   the native menus in the same commit. The fuller choice (mode + delay) belongs in Settings, next to
   the other editor preferences; `GeneralSection.tsx` shows the existing toggle shape.
3. **Auto save goes through `fs:writeGuarded`, the same door ⌘S takes.** No new write path, no
   unguarded fallback, no `saveConflictResolution`.
4. **Conflict stops the timer for that tab**, VS Code's `:753` rule: on a guarded refusal, the tab
   stays dirty, auto save stops for it, and the sentence is shown ONCE — not once per delay tick. A
   person's ⌘S (with its existing, never-default, re-checked Overwrite) is the only way forward.
5. **The skip list**, VS Code's `:151` plus Tortie's own: never auto save a tab that is not dirty,
   is read-only, has no path, or sits outside every open project root.
6. **It must not fight the agent-facing machinery.** A save writes `savedContents` and clears
   `dirty`; Phase 260's per-project tab rules exclude dirty tabs from eviction, and the redline and
   rewind journals key off saved state. Auto save changing when a tab goes clean touches all three,
   and the phase must drive them rather than reason about them.

## What is NOT in this phase

- No `files.saveConflictResolution` equivalent, and no unguarded auto-write anywhere.
- No auto save for out-of-project files, and no format-on-save or fix-on-save (VS Code has both; they
  are separate features and neither is asked for).
- No per-language override (VS Code has it; nobody has asked, and it multiplies the settings surface).
- No change to ⌘S's own behaviour, its Overwrite, or any refusal sentence. The gate pins those and
  this phase keeps them green.
- No change to hot-exit/unsaved-state-across-restart, which Tortie does not have and which is a much
  larger question than this issue.

## The tier

**Tier 3.** It writes a person's files on a timer, on a machine where agents write the same files
concurrently, and the failure mode it risks is the one that already cost 173 bytes of somebody's
paragraph. The evidence has to be a real app run with a real concurrent writer: a file open and dirty
in Tortie, an agent-style write landing on disk underneath it, and the auto save proving it refused,
stopped, and said so once — plus `conformance:save` staying green, with an ablation showing the gate
still catches an unguarded auto-write.
