# Phase 267 — New File in an empty project

**Subject:** `fix(tree): the create affordance works in an empty project`
**First body line:** `Phase 267: new file in an empty project`
**Semver:** patch (a refused affordance now works; no new surface, no contract move).
**Tier:** 2 — a rendered surface with no new durable state. Budget: the gates, ONE app run
that drives the whole issue-22 repro in one session, plus one independent method (that app run
IS the independent method — it exercises the mounted rename adapter through the real shadow DOM,
which no node test can reach).

**Charter:** GitHub issue 22 (JnBrymn). In a **completely empty** project directory, clicking the
New File (+) button in the File Navigator does nothing and shows an error toast
*"Could not start a new item here."*. Create any file from a shell (`touch whatever.md`) and the
button starts working. The create affordance is broken exactly when the tree has **zero rows**.

---

## 1. The single cause — confirmed against the tree (do not re-derive)

The `+File` button in `src/renderer/app/Sidebar.tsx:180` runs the one create flow:

```
treeHandle.ops.newEntry(treeHandle.newEntryTarget(), kind);
```

- **WHERE is already correct.** `newEntryTarget()` is `headerDestDir(model.getSelectedPaths())`
  (`src/renderer/tree/FileTree.tsx:263`). With nothing selected, `headerDestDir([])` returns
  `''` — the project root (`src/renderer/tree/header-actions.ts:25-28`). So the destination is fine.

- **The adapter is missing, and that is the whole bug.** `src/renderer/tree/FileTree.tsx:684-696`
  renders, when the root is empty:

  ```tsx
  {rootEmpty && !search.isOpen ? (
    <div className="section-stub">{emptyLine}</div>          // "This folder is empty."
  ) : (
    <PierreTree model={model} .../> }                        // @pierre/trees FileTree
  ```

  `PierreTree` (`FileTree as PierreTree` from `@pierre/trees`, imported at
  `src/renderer/tree/FileTree.tsx:115`) is what mounts the inline-rename adapter. The adapter is
  found by walking the mounted `file-tree-container` custom element's shadow root:
  `resolveTreeEditor(host)` queries `host.querySelector('file-tree-container')?.shadowRoot?...`
  (`src/renderer/tree/rename-view.ts:141-146`), and `renameView()` is
  `editorBridge()?.view ?? null` (`src/renderer/tree/use-tree-rename.ts:174`, bridge resolved at
  `:102-104`). When the empty-state stub **replaces** `PierreTree`, there is no
  `file-tree-container` in the DOM, so `resolveTreeEditor` returns `null` and `renameView()` is
  `null`.

- **The refusal.** `newEntry` in `src/renderer/tree/tree-ops.ts:1004-1014`:

  ```ts
  newEntry(destDirCanonical, kind) {
    revealDestination(destDirCanonical);
    const view = ctx.renameView();
    if (view === null) {
      app().toast('error', 'Could not start a new item here.');   // <- the toast the issue reports
      return;
    }
    ...
  ```

  With the tree unmounted, `view === null`, so the create is refused before it can place its inline
  placeholder row. `touch whatever.md` from a shell makes the folder non-empty → `rootEmpty` flips
  false → `PierreTree` mounts → adapter exists → the button works. Exactly the reported behaviour.

- **`rootEmpty` source.** `src/renderer/tree/use-tree-model.ts:755`:
  `const rootEmpty = rootLoaded && (entriesByDir[rootPath]?.length ?? 0) === 0;` — it is derived
  from the **fed listing** (`entriesByDir`), the record of what MAIN says exists on disk, and it is
  returned from the bridge (`:763`) and destructured in `FileTree.tsx:207`. It is **not** derived
  from the live @pierre model, which matters below: the inline placeholder row a create adds is put
  into the model only (`tree-ops.ts:1025`, and the comment at `:1018-1021` says it is deliberately
  **not** added to `fed`), so `rootEmpty` stays `true` while a create is pending.

The header's destination is right; only the missing adapter is the problem. Confirmed.

---

## 2. The fix — mount the tree always, draw the empty line as a sibling hint

### 2.1 `FileTree.tsx` render (lines ~684-696)

Render `<PierreTree>` **unconditionally** (so the adapter is always mounted, even at zero rows), and
render the empty line as a **sibling hint inside `.files-tree`**, shown only when the tree is
genuinely empty AND no create is pending:

```tsx
return (
  <div className={'files-tree' + ...} ref={hostRef} onDragOver=... onDrop=... >
    <PierreTree
      model={model}
      style={hostStyle}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      aria-label="Project files"
    />
    {rootEmpty && !search.isOpen && !createPending ? (
      <div className="files-tree-empty">{emptyLine}</div>
    ) : null}
    {importBox !== null ? ( ... ) : null}
    ...
  </div>
);
```

Notes that bind the builder:

- **The `.files-tree` div and every drag/drop handler on it are UNCHANGED.** Root-drop
  (`.root-drop`), the outside-import drop (`.import-drop` / `.import-refused`), the import target
  overlay, the filter clear button, the filter note and the Phase 37 name-error overlay all stay
  exactly where they are — the only edit to the return is turning the stub↔tree ternary into an
  always-mounted tree plus a gated hint sibling.
- **The SEARCH empty state is untouched.** `search.isOpen` still suppresses the hint (an open filter
  with no matches has its own copy at `FileTree.tsx:~726`, "No matches in the folders you have
  opened."). Do not fold the two together.
- **The remote empty line is preserved.** `emptyLine` is still
  `remote === null ? 'This folder is empty.' : remoteEmptyLine(remote.label)`
  (`FileTree.tsx:666-667`, Phase 90.3) — the hint keeps naming the machine on a remote tab.
- **One create flow only** (Phase 12.9). Do NOT add a prompt dialog or any second create path for
  the empty case. The same `ops.newEntry` now works because the adapter is mounted.

### 2.2 `createPending` — the reactive guard that hides the hint under a placeholder row

The hint must vanish the instant a create places its inline placeholder row, and must not cover it.
`rootEmpty` cannot do this (it is fed-based and stays `true` through the create, per §1). Add a
reactive boolean driven by the model, in **`use-tree-rename.ts`**, which already owns `opsRef`, the
pending-create bookkeeping, and a `model.subscribe(...)` effect:

- Add state: `const [createPending, setCreatePending] = useState(false);`
- In the existing `model.subscribe` effect (`use-tree-rename.ts:~261-269`, the one that re-places
  the name-error on every model emit), also recompute:
  `setCreatePending(opsRef.current?.pendingPath() != null);` inside the same subscription callback.
  `opsRef.current.pendingPath()` returns the pending placeholder path or `null`
  (`tree-ops.ts:1051-1053`). The model emits when the placeholder is added
  (`tree-ops.ts:1025`) and again when it is settled/removed (Esc, empty commit, or a real create),
  so the flag rises and falls with the placeholder row — no polling.
  - Set the initial value on subscribe (call it once synchronously in the effect body) so a create
    that is already pending when the effect re-runs is reflected.
- Return `createPending` from the hook: `return { opsCreated, nameError, createPending };`
- In `FileTree.tsx`, destructure it alongside the existing two:
  `const { opsCreated, nameError, createPending } = useTreeRename({ ... });`

This keeps the empty-state logic honest: the hint shows when the folder is empty and the user is not
mid-create; a placeholder row (createPending) hides it; Esc restores it.

### 2.3 CSS — `src/renderer/tree/tree.css` (the tree's own stylesheet), tokens only

The old empty state borrowed `.section-stub` from `app.css`. That class was a full-height block that
**replaced** the tree; the new hint is a sibling of an always-mounted, filter-first tree, so give it
its own class in `tree.css` (where `.files-tree` and every other host overlay already live) and add
one rule so the hint sits directly under the (empty) tree rather than being pushed off-screen by the
flex-fill container.

`.files-tree` is `position: relative; display: flex; flex-direction: column; flex: 1`
(`tree.css:58-67`) and `.files-tree > file-tree-container` is `flex: 1; min-height: 0`
(`tree.css:69-72`). With the container at `flex: 1` a normal-flow hint after it is pushed to the
bottom. So gate a small flex change on an empty-state class on the host:

```css
/* THE EMPTY-FOLDER HINT (issue 22 / Phase 267). The tree (and thus the inline
   rename adapter the create flow needs) is mounted even at zero rows; this line
   is a sibling of it, not a replacement, so a New File create can place its
   placeholder row in the mounted tree and the hint steps aside for it. The line
   sits just under the always-present filter field, where the first row would be.
   pointer-events: none so the empty space below stays the root drop target. */
.files-tree.is-empty > file-tree-container {
  flex: 0 0 auto;   /* shrink to the filter field + zero rows so the hint follows it */
}
.files-tree-empty {
  padding: var(--space-3) var(--space-2) var(--space-5);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-muted);
  pointer-events: none;
}
```

- Add the `is-empty` modifier to the `.files-tree` className in `FileTree.tsx` under the **same
  condition** as the hint (`rootEmpty && !search.isOpen && !createPending`), so the container returns
  to `flex: 1` the moment a placeholder row appears or the folder gains a row. Fold it into the
  existing className expression (`'files-tree' + (rootArmed ? ' root-drop' : '') + ...`).
- **Tokens only** — `--space-3`, `--space-2`, `--space-5`, `--text-sm`, `--lh-sm`, `--text-muted`
  are all defined in `src/renderer/styles/tokens.css` (verified). No literal color, size or length.
  The muted color matches the old `.section-stub` reading exactly (`app.css` used the same three
  tokens), so the sentence looks the same; it now sits below the filter field instead of at the very
  top, which is where a first row would be.
- Do **not** delete `.section-stub` from `app.css` — the Context/other sidebar sections still use it
  (`context.css:4` references it).

### 2.4 One behaviour that legitimately changes

Because the tree is now mounted even when empty, the always-present **filter field**
(`@pierre/trees` renders `[data-file-tree-search-container]` whenever `search: true` —
`use-tree-model.ts:543`, `tree.css:51-52`) now appears in an empty project, where the old stub hid
it. This is consistent with every non-empty tree (which always shows the filter above its rows) and
is required for the adapter to exist. The app run in §4 must read that the empty state still looks
clean (filter field, then the hint, then empty drop space) — flag it if it reads wrong.

---

## 3. Tests — RED before the fix, green after

Two tests. The node test environment here has **no shadow DOM** and does not mount `@pierre/trees`
(stated in `__tests__/p127-tree-hooks.test.ts:9-14`), so these pin the contract and the wiring; the
live proof that the mounted adapter is reachable is the app run in §4.

### 3.1 `src/renderer/tree/__tests__/tree-ops-create.test.ts` — behavioural, pure (extend the file)

This file already drives `createTreeOps` against a fake view and a fake model and counts create
calls. Add explicit cases pinning the create-at-empty-root contract that issue 22 is about:

- **Adapter present, empty root:** with `renameView()` returning a live fake view and
  `siblingNames('')` empty, `ops.newEntry('', 'file')` calls `model.startRenaming(placeholder, ...)`
  (reaches the inline editor) and does **not** toast. (Green now and after — it pins the contract
  that the fix restores at the render layer.)
- **Adapter absent (the bug's shape):** with `renameView()` returning `null`,
  `ops.newEntry('', 'file')` toasts `'error', 'Could not start a new item here.'` and calls
  `startRenaming` **zero** times. (This is the exact refusal the empty tree hit; it documents why the
  render fix is necessary.)

Follow the file's existing `makeView()` / fake-model / `h.toast` harness (`tree-ops-create.test.ts`
lines 1-80). No new mocks.

### 3.2 `src/renderer/tree/__tests__/p267-empty-create.test.ts` — structural, reads source (new file)

Same house shape as `p127-tree-hooks.test.ts` (read the `.tsx`/`.ts` source and assert on it),
because the render/adapter coupling cannot be exercised without a shadow DOM. Assertions, each RED at
the parent commit and green after:

1. **The tree is mounted unconditionally.** `FileTree.tsx` no longer contains the ternary that swaps
   the empty stub **for** `PierreTree`. Assert the source does **not** contain a `section-stub`
   element sitting in the true-arm of a `rootEmpty`/`? (` conditional whose false-arm is
   `<PierreTree`. A robust form: assert `FileTree.tsx` does not match
   `/rootEmpty[^?]*\?[\s\S]{0,120}section-stub[\s\S]*?<PierreTree/` (the old swap), and that
   `<PierreTree` appears exactly once and is not immediately preceded by `) : (`.
2. **The empty hint is gated on the create-pending guard.** Assert the source contains the hint's
   condition including `createPending` — e.g. matches `/rootEmpty[\s\S]{0,60}!\s*createPending/` — so
   a create-in-progress cannot be covered by the hint.
3. **The guard is real and reactive.** Assert `use-tree-rename.ts` declares
   `createPending` state and returns it (`return { opsCreated, nameError, createPending }`), and that
   it is set from `opsRef.current?.pendingPath()` inside a `model.subscribe` callback.
4. **The hint class exists with token-only styling.** Assert `tree.css` contains `.files-tree-empty`
   and `.files-tree.is-empty`, and that the `.files-tree-empty` block contains no `#`, no `rgb`, no
   `px`/`em` length literal (grep the block for a raw color/length and assert none) — tokens only.

Keep each assertion's message naming what broke, in the p127 style.

Run just these two files RED on the parent (`git stash`/checkout the parent render) to prove they
fail before the fix, then green after. Whole suite green: `npm test`.

---

## 4. The app run — `probe:p267` (the independent method, the real issue-22 repro)

A unit test cannot reach the mounted shadow-DOM adapter, so the verification IS an app run that
reproduces issue 22 end to end on a **genuinely empty** scratch project.

**Add** `build/p267/probe-p267-empty-create.mjs` and a `probe:p267` script in `package.json` of the
form the other probes use:
`"probe:p267": "npm run build && node build/harness-socket.mjs --fresh gmux-p267 'node build/p267/probe-p267-empty-create.mjs'"`.

What the probe does, in ONE Electron launched through `build/electron-run.mjs`'s `withElectron`
(never `npm run shot`), everything ended in a `finally`:

1. **Make a scratch EMPTY project dir** under the run's own scratch root (e.g.
   `mkdtemp` under `GMUX_HARNESS_DIR`), containing **no files**. Record the path; it and everything
   under it is removed in the `finally` (remove the files/dir the probe created, never a HOME or
   tilde path).
2. **Open it as a project** in the app and select the File Navigator, so `rootEmpty` is `true` and
   the empty hint shows. Assert the tree host (`file-tree-container`) IS mounted in the DOM even
   though the folder is empty (this is the fix — at the parent it is absent), and that
   `.files-tree-empty` is showing.
3. **Click the New File (+) button** (drive the real header affordance — the same path as
   `Sidebar.tsx:180` `treeHandle.ops.newEntry(treeHandle.newEntryTarget(), kind)`; invoke it the way
   the other tree probes drive the handle, not by calling a shot helper). Assert **no** error toast
   fired, an inline editor row opened, and `.files-tree-empty` is now hidden (createPending).
4. **Type a name** (e.g. `hello.md`) and commit (Enter).
5. **Read the result on disk and in the tree:** assert the file now exists at
   `<scratch>/hello.md`, and that a row for it appears in the tree. This is the exact issue-22 repro:
   empty folder → + → type → file created and shown.
6. **`finally`:** end the Electron (withElectron does this), end this run's scratch tmux server, and
   remove the scratch project dir. Count leftover Electrons/`Tortie` once at the end
   (`ps -Ao pid,ppid,rss,comm | grep -E "[E]lectron|Tortie$|chrome_crashpad" | grep -v defunct`) and
   fail if any of this run's remain.

**Safety:** only ever `tmux -L gmux` READ-ONLY for the operator's server; the probe uses its OWN
scratch socket via `harness-socket.mjs --fresh`. Never attach, never kill the operator's sessions,
never `pkill`. Every process the probe starts is killed by recorded pid in a `finally`.
`build/p267/` is a new dir; the probe script it adds reaches `electron-run.mjs`, so **raise
`HELPER_USER_FLOOR`** in `build/electron-run.mjs` in the same commit (obligation 1 in CLAUDE.md), or
route the launch so the floor stays correct — the integrator confirms `npm run gate:electron` and
`npm run gate:background` stay green.

Verifier's independent step to name in the verdict: **the app run drove the real empty-project repro
through the mounted rename adapter in a live shadow DOM — the one thing no unit test in this repo can
do — and measured the parent commit (adapter absent, toast fired) against HEAD (file created).**

---

## 5. Gates for this commit

- `npm run typecheck && npm run build && npm run smoke:t1` (minimum), integrator runs the full
  battery (`test`, `smoke`, `smoke:t3`, `package`).
- **Path-triggered:** this commit touches `build/` (a new script reaching `electron-run.mjs`), so
  `gate:electron` and `gate:background` apply — both run inside `npm run build`. Raise
  `HELPER_USER_FLOOR` in the same commit (§4). No IPC contract, manifest, `gmux.*`/`GMUX_*`, or
  harness-smoke change, so `gate:contract` needs no baseline regen. No token, no credential path, no
  hue/appearance file, no arch file — none of those conformance gates apply.
- `probe:p267` runs once for the phase (§4). Not in the commit battery.

## 6. What is NOT in this phase

- **No second create path.** No prompt dialog, no alternate "create in empty folder" flow. The one
  Phase 12.9 inline-rename-on-create flow now works because the adapter is mounted. (Refusal.)
- **No change to `newEntry`/`tree-ops.ts` logic.** The `view === null` refusal stays exactly as is —
  it is correct when the adapter genuinely cannot be found; the fix is to stop unmounting the tree,
  not to weaken the guard.
- **No change to the search/filter empty state** (the "No matches" line), the remote empty line's
  wording, root-drop, import-drop, the import target overlay, the filter clear button, or the
  name-error overlay. Only the empty-hint element and its gating move.
- **No removal of `.section-stub`** from `app.css` (other sidebar sections use it).
- **No new user-facing surface**, so no native-menu change (the +File affordance already exists in
  the header and menus; this phase only makes it succeed at zero rows).
