# Phase 265 — the frame that outlives the terminal. SPEC.

Subject `fix(terminal): scheduled work ends with the terminal that scheduled it`. First body line
`Phase 265: work scheduled for a terminal ends when the terminal does`. Semver **patch**. **Tier 3**
(a resource defect in the surface his agents run in, and the second half is a quit-time write).

Charter: `docs/BACKLOG.md` "Phase 265" entry (audit R3, 2026-09-12), on top of
`docs/research/120-phase-265-the-frame-that-outlives-the-terminal.md`, which is the spec for the
repair and was re-verified against the tree by the operator's agent. Research 120 §3 names both
owners, §4 designs the measurement, §5 designs the repair, §6 the baseline quit contract. This spec
does not re-derive what research 120 established; it turns it into two disjoint builder briefs, a
gate, and a proof.

Every byte-level claim below was re-confirmed against **this worktree's installed `node_modules`** on
2026-09-13 (worktree `/private/tmp/wt-p265`, detached at `5329fb5d`). The quoted minified fragments
are exactly what the builders will anchor their patches on. **No model call, no agent turn, no token,
anywhere in this phase.**

What this spec settles, in order: §0 decisions the builders inherit; §1 both owners confirmed with
lines and the minified bytes; §2 the patch mechanism, unchanged; §3 the two patch files, hunk by
hunk; §4 the deterministic regression, one clause per owner; §5 the baseline quit contract and its
test; §6 the two builder briefs with disjoint file ownership; §7 the Tier-3 verification plan; §8
refusals and stated limits.

---------------------------------------------------------------------------------------------------

## 0. Decisions the builders inherit rather than re-decide

**D1. Both owners are upstream, so the fix is a pinned patch, not an in-app reach.** Research 120 §5
refuses the in-app alternative in writing: reaching the service needs `(term as any)._core._selectionService`,
which would be the first `_core` access in the tree, against the standing rule at
`src/renderer/terminal/capture/metrics.ts:10`. **Do not take it.** `src/renderer/terminal/TerminalPane.tsx`
is RULED OUT as an owner (it cancels its own rAF at :502 and :596 and disposes what it owns) — do not
"fix" it.

**D2. Two owners means two regression clauses.** `build/heap-retainers.mjs` walks SHORTEST paths
(`:29-31, 89-90`), so fixing one owner can turn the snapshot green while the other still leaks
(research 120 §3, "invisible to the snapshot by construction"). Every regression assertion is
per-owner, and a repair that closes only the photographed path (owner 1) must still go RED on the
other clause (owner 2), and vice versa.

**D3. No xterm major-version bump.** `@xterm/xterm` stays pinned at 6.0.0 and `@xterm/addon-webgl` at
0.19.0. The repair is bytes under `patches/`, applied by the existing applier.

**D4. Both bundles per package are patched — module and main.** The renderer resolves `module`
(`lib/*.mjs`); a Node-side importer resolves `main` (`lib/*.js`). Research 120 §5 says patch both.
The deterministic regression runs in the renderer (mjs), but the patch covers both so a later
Node-side test cannot silently run unpatched bytes.

**D5. The repair may not weaken the detector, remove history, or reduce churn.** The planted control
keeps its 24 trees of 43 elements, the census keeps its `queryObjects` mechanism, Past Sessions is not
trimmed, and the workload floor does not move (research 120 §5 refusals 3–5; backlog "What is NOT").

---------------------------------------------------------------------------------------------------

## 1. Both owners, confirmed with lines and minified bytes

### Owner 1 — `SelectionService._refreshAnimationFrame`, never cancelled on dispose

Source, `node_modules/@xterm/xterm/src/browser/services/SelectionService.ts`:

- Field declared at **:97** — `private _refreshAnimationFrame: number | undefined;`
- Scheduled at **:281-283** inside `refresh()` —
  `this._refreshAnimationFrame = this._coreBrowserService.window.requestAnimationFrame(() => this._refresh());`
  (confirmed verbatim in this tree).
- The class extends `Disposable` (**:72**) and declares **no `dispose()` override** — the only
  `dispose` token in the whole file is `this._trimListener.dispose()` at **:765**
  (`grep -n dispose` returns exactly that one line). The base `dispose()` runs its store, which holds
  the mouse-listener remover, the buffer-activate subscription and the resize subscription — **and
  not the frame handle.** The handle is cleared in exactly one place, `_refresh()` at :299-300, which
  runs only if the frame is served.
- `clearSelection()` calls `this.refresh()` unconditionally, and two subscriptions fire it with no
  user input: `onResize` with `rowsChanged` (constructor, the last `this._register(...)` — confirmed
  `this._register(this._bufferService.onResize(e => { if (e.rowsChanged) { this.clearSelection(); } }))`),
  and `onBufferActivate`. A split resizes surviving panes; `tmux attach`/detach toggles the alternate
  buffer. Both fire per profile-d cycle.

Minified, re-confirmed in this tree — this is what the patch anchors on:

- `lib/xterm.mjs` (53 lines, terser): the whole package has **1** `cancelAnimationFrame` and **4**
  `requestAnimationFrame`; the scheduling site reads
  `…onFrame=this._coreBrowserService.window.requestAnimationFrame(()=>this._refresh())),…`. The
  constructor tail reads
  `…r(C(()=>{this._removeMouseDownListeners()})),this._register(this._bufferService.onResize(c=>{c.rowsChanged&&this.clearSelection()}))}reset(){…`
  — `C` is this scope's alias for `toDisposable` (already used one register earlier).
- `lib/xterm.js` (1 line, UMD): the scheduling site reads
  `…requestAnimationFrame((()=>this._refresh()))…`, and the constructor tail reads
  `…toDisposable)((()=>{this._removeMouseDownListeners()}))),this._register(this._bufferService.onResize((e=>{e.rowsChanged&&this.clearSelection()})))}reset()…`
  — the `toDisposable` alias here is `(0,h.toDisposable)` (the builder reads the exact namespace
  alias out of the same constructor; it may not be `h` on a fresh install and must be copied from the
  bytes, not assumed).

Field names `_refreshAnimationFrame` and `_coreBrowserService` survive minification (terser keeps
property names) — confirmed present literally in both bundles.

### Owner 2 — `WebglRenderer._cursorBlinkStateManager`, the only sibling not registered

Source, `node_modules/@xterm/addon-webgl/src/WebglRenderer.ts:32`:

```ts
private _cursorBlinkStateManager: MutableDisposable<CursorBlinkStateManager> = new MutableDisposable();
```

Its four siblings at **:33, :37, :46, :47** all read `= this._register(new MutableDisposable())`
(confirmed by reading :30-48). Line 32 does not, and `WebglRenderer` has no `dispose()` override, so
the manager is never disposed. It is constructed whenever the cursor blinks, and **Tortie sets
`cursorBlink: true`** at `src/renderer/terminal/TerminalPane.tsx:268`, so every discarded terminal
leaves a **live 600 ms `setInterval`** (`CursorBlinkStateManager.ts:101-118`). Its own `dispose()` is
written correctly; it is simply never called.

`@xterm/addon-webgl` **is a separate installed package** (`node_modules/@xterm/addon-webgl`, version
`0.19.0`, `main: lib/addon-webgl.js`, `module: lib/addon-webgl.mjs`), **not vendored inside
`@xterm/xterm`** — so it needs its **own** patch file.

Minified, re-confirmed:

- `lib/addon-webgl.mjs` (101 lines): `…_cursorBlinkStateManager=new be;this._charAtlasDisposable=this._register(new be);…`
  — alias `be`, statements separated by `;`.
- `lib/addon-webgl.js` (1 line): `…_cursorBlinkStateManager=new m.MutableDisposable,this._charAtlasDisposable=this._register(new m.MutableDisposable),…`
  — alias `m.MutableDisposable`, statements separated by `,`.

The blink interval body is uniquely identifiable in both bundles by the substring
`_animationTimeRestarted`: mjs `setInterval(()=>{if(this._animationTimeRestarted){let t=Ut-(Date.now()-this._animationTimeRestarted)…`,
js `setInterval((()=>{if(this._animationTimeRestarted){const e=600-(Date.now()-this._animationTimeRestarted)…`.
`BLINK_INTERVAL` is 600 (mjs const `Ut`, js literal `600`). This is the filter the regression's
clause 2 uses.

---------------------------------------------------------------------------------------------------

## 2. The patch mechanism, used unchanged

Read `patches/node-pty+1.1.0.patch` and `build/apply-patches.mjs`. The facts the phase must honor:

- **Where patches live and what runs them.** Patch files live in `patches/`, one per `*.patch`,
  applied in **sorted filename order** by `build/apply-patches.mjs`, which is called from
  `package.json`'s `postinstall` (line 209): `node build/apply-patches.mjs && electron-rebuild …`. It
  is **not** patch-package; it is the repo's own applier over `/usr/bin/patch`.
- **How a patch is named.** `<package-path-with-plus>+<version>.patch`, e.g. `node-pty+1.1.0.patch`.
  This phase adds **`patches/@xterm+xterm+6.0.0.patch`** and **`patches/@xterm+addon-webgl+0.19.0.patch`**.
  The version in the filename is the pin: an upstream release that moves the bytes fails `npm install`
  loudly rather than dropping the fix silently.
- **How it applies.** `run()` invokes `/usr/bin/patch -p1 -s -f -F0 -d <repo-root> -i <patchfile>`.
  `-p1` strips one path segment, so hunk headers name `a/node_modules/@xterm/xterm/lib/xterm.mjs` and
  `b/node_modules/@xterm/xterm/lib/xterm.mjs`. `-F0` means **no fuzz** — context matches exactly or
  the patch is reviewed.
- **Idempotency is decided by CONTENT, not by patch.** `state(file)` reads the added lines out of the
  patch (`additions()` extracts every `+` line under each `+++` target) and checks `body.includes(line)`
  for each. All present → `applied` (left alone); none present → `missing` (dry-run then apply);
  some present and some not → `mixed` (fails, naming the file). For a minified bundle the added line
  IS the whole modified line, so the includes-check is exact and safe to run twice, which
  `npm install` does whenever the lockfile moves.
- **Consequence for the builder.** Because the target lines are minified (the `.js` files are one
  line of 244–489 KB; the `.mjs` files are dozens of long lines), each hunk is a whole-line
  replacement: the `-` line is the entire original minified line and the `+` line is that same line
  with the fix spliced in. The patch files will therefore be large. That is expected and is what
  research 120 §5 calls "a single-line hunk". The builder generates each hunk with `diff -u` between
  the pristine node_modules file and an edited copy (see §3), never by hand.

---------------------------------------------------------------------------------------------------

## 3. The two patch files, hunk by hunk

Each patch file carries **two hunks**: one for the `.mjs` bundle, one for the `.js` bundle. The
builder produces each hunk mechanically:

1. Copy the pristine `node_modules` target aside.
2. Apply the exact splice below with a byte-precise tool (a small node script doing a single
   `String.prototype.replace` on the anchor, asserting the anchor occurs **exactly once**).
3. `diff -u a/<relpath> b/<relpath>` where `<relpath>` is `node_modules/@xterm/…/lib/…`, and paste
   the hunk into the patch file with `a/`/`b/` prefixes matching what `-p1` expects.
4. Re-run `node build/apply-patches.mjs` from a freshly reinstalled tree to prove it applies clean,
   is idempotent on a second run, and that `state()` reads `applied`.

### `patches/@xterm+xterm+6.0.0.patch` — owner 1

The splice adds one `this._register(toDisposable(...))` immediately after the `onResize` register and
before the constructor's closing `}`, cancelling the frame on dispose. It reuses the same
`toDisposable` alias already present in that constructor scope (do not introduce a new import).

- **`lib/xterm.mjs` hunk.** Anchor (occurs once):
  `onResize(c=>{c.rowsChanged&&this.clearSelection()}))}reset(){`
  Replace with:
  `onResize(c=>{c.rowsChanged&&this.clearSelection()})),this._register(C(()=>{void 0!==this._refreshAnimationFrame&&(this._coreBrowserService.window.cancelAnimationFrame(this._refreshAnimationFrame),this._refreshAnimationFrame=void 0)}))}reset(){`
  where `C` is copied from the observed `this._register(C(()=>{this._removeMouseDownListeners()}))`
  earlier in the same constructor.
- **`lib/xterm.js` hunk.** Anchor (occurs once):
  `onResize((e=>{e.rowsChanged&&this.clearSelection()})))}reset()`
  Replace with:
  `onResize((e=>{e.rowsChanged&&this.clearSelection()})))),this._register((0,h.toDisposable)((()=>{void 0!==this._refreshAnimationFrame&&(this._coreBrowserService.window.cancelAnimationFrame(this._refreshAnimationFrame),this._refreshAnimationFrame=void 0)})))}reset()`
  where `(0,h.toDisposable)` is copied from the observed
  `this._register((0,h.toDisposable)((()=>{this._removeMouseDownListeners()})))` earlier in the same
  constructor (the namespace alias may differ on a fresh install; read it, do not assume `h`).

Note the paren counting differs between bundles (the `.js` groups arrows in extra parens); the
builder must balance against the pristine bytes, which is why the hunk is generated by `diff` after a
verified single-occurrence splice, not typed.

### `patches/@xterm+addon-webgl+0.19.0.patch` — owner 2

The splice wraps the field initializer in `this._register(...)`, matching its four siblings.

- **`lib/addon-webgl.mjs` hunk.** Anchor (occurs once):
  `_cursorBlinkStateManager=new be;`
  Replace with:
  `_cursorBlinkStateManager=this._register(new be);`
  (`be` copied from the observed sibling `this._charAtlasDisposable=this._register(new be)`.)
- **`lib/addon-webgl.js` hunk.** Anchor (occurs once):
  `_cursorBlinkStateManager=new m.MutableDisposable,`
  Replace with:
  `_cursorBlinkStateManager=this._register(new m.MutableDisposable),`
  (`m.MutableDisposable` copied from the observed sibling.)

Both spliced anchors are unique in their file (`_cursorBlinkStateManager=new …` appears once per
bundle — confirmed). The alias tokens (`be`, `m`, `C`, `h`) are read from each installed bundle at
patch-generation time.

---------------------------------------------------------------------------------------------------

## 4. The deterministic regression — one clause per owner

Built on the **emulated no-frames arm** research 120 §4 names ("arm B"), inside the **one** profile-d
Electron `build/probe-p167-scale.mjs` already launches. It is deterministic (RED before the patch,
green after) and fails if EITHER owner is left leaking.

### What it reuses from the existing probe

- `withElectron` + `build/harness-socket.mjs`: one Electron on a scratch profile and scratch tmux
  socket, ended in a `finally` (`probe-p167-scale.mjs:96-109`, and the run wrapper). **Not weakened.**
- Profile d itself, `cycleSplit` (`:1591-1593`): four real shell sessions in a grid, then all four
  killed through the cleanup hook.
- `readRenderer`'s two `HeapProfiler.collectGarbage` collections (`:1073-1075`) and `detachedCensus`
  through `Runtime.queryObjects` (`:1129`).
- The Past Sessions workload floor and the main-process ptmx/ttys descriptor check.
- The planted control at the end (`:1975-2010`) — 24 trees of 43 elements. **Kept unchanged.**
- `cdpEval(cdp, expression, timeoutMs)` from `build/cdp-client.mjs` (imported at `:231`) — the
  injection point for the ledger.
- The per-block heap snapshot behind `P167_SNAPSHOT=1` and `build/heap-retainers.mjs` — kept as a
  cross-check (§7), not the primary instrument.

### The ledger (added), from research 120 §4(a)

Installed once via `cdpEval` **after page load and before any terminal is created** (before the first
block). It wraps `window.requestAnimationFrame`/`cancelAnimationFrame`/`setInterval`/`clearInterval`,
records `{at, text, stack, held}` per pending frame and `{at, ms, text}` per interval, exposes
`window.__p265` with `counts`, `hold(on)`, `outstanding()`, `timers()`, and a synthetic-id path for
`hold(true)` that never calls the real rAF (the whole ledger body is quoted verbatim in research 120
§4(a) — the builder uses it as written). `text` is `String(cb).slice(0, 160)`; property names survive
minification so the three candidate callbacks are distinguishable with no sourcemap (research 120's
table). The ledger reads `this._coreBrowserService.window.{requestAnimationFrame,setInterval}` which
resolve to the wrapped globals because xterm reads them dynamically per call.

### The two arms driven in the one session

- **Arm A (frames flowing), `hold(false)`** — the shipped condition. Reproduces the intermittency
  honestly; expected to pass sometimes. A green A is NOT read as an answer.
- **Arm B (emulated occlusion), `hold(true)` for the whole cycle, released after the census is read**
  — deterministic. No frame is served, so every scheduled frame from a disposed pane is still
  outstanding at dispose, and the ledger reads each owner every time. **The regression is built on
  arm B.**

### The two clauses (this is the assertion)

After a profile-d cycle's `cleanup()` settles and after the two collections, under arm B:

- **Clause 1 (owner 1, SelectionService).** `window.__p265.outstanding()` bucketed by `text`: the
  count whose text is `()=>this._refresh()` must be **0**. Before the patch it is nonzero and tracks
  the panes discarded (four per cycle); after the patch it is 0 because the added `toDisposable`
  cancels the frame on dispose, which the ledger observes as a `cancelAnimationFrame` deleting the
  held entry.
- **Clause 2 (owner 2, WebglRenderer).** `window.__p265.timers()` filtered to `ms === 600` **and**
  `text` including `_animationTimeRestarted`: the count of such live intervals older than the cycle
  must be **0**. Before the patch it tracks panes discarded; after the patch it is 0 because the
  field is now registered and disposed with the renderer.

Plus the ledger self-check research 120 §4 names: `counts.scheduled - counts.cancelled - counts.served`
must equal `outstanding().length` (a check on the instrument, not the app). The existing census count
is recorded beside both, unchanged, so the two instruments read against each other.

**Because each clause names a distinct owner and instrument, a repair that fixes only owner 1 leaves
clause 2 RED, and only owner 2 leaves clause 1 RED — D2 satisfied.**

### Arm C (real occlusion) — stated, not required

Research 120 §4(b) marks arm C (a real minimized/hidden window) as needing a harness knob that does
not exist today, and permits deferring it if it does not fit the budget **provided the phase's record
says so**. This phase does not build arm C; it records that arms A and B stand and that arm C's
occlusion question is answered by the verifier's attack (§7), which drives a background/occluded
window against the shipped condition. If arm C is deferred, the phase's record says so plainly rather
than dropping the occlusion question.

### Where the regression lives and how RED-before is shown

The ledger + arm-B assertion is added to `build/probe-p167-scale.mjs` behind an arm the run always
drives (a new `P167_LEDGER` on by default; a knob to skip it exists but the default drives it, mirror
of `P167_PLANT`). RED-before/green-after is demonstrated by running the arm twice: once against
node_modules with the patches **reverted** (or against the parent `5329fb5d` install), once with them
applied. The builder captures both readings into the phase record; the verifier re-derives them (§7).

---------------------------------------------------------------------------------------------------

## 5. The baseline quit contract (the second half)

### The gap, still true of the code

`src/main/baselines/store.ts:36-43` records "Nothing owns a write at quit." Confirmed against the
tree: `src/main/capabilities.ts:348-349` registers the domain in two lines (`registerBaselinesIpc`,
`startBaselineStorePruning`) and `disposeMainCapabilities` (`:429`+) names no baselines call
(`grep -n baseline src/main/capabilities.ts` returns only the import at :49-51 and those two lines).
`src/main/baselines/index.ts` exports no disposer, and the daily timer is a function-local `const`,
unref'd (`baselines/ipc.ts:68-74`). The window is narrow: `markAppQuitting()` runs synchronously
(`index.ts:736`) and `typed-ipc.ts:53-59` refuses every NEW invoke with `SHUTTING_DOWN`; what has no
owner is a `store()` **already running** when that line ran. Research 106 §1.4: p50 19.8–24.9 ms for
ordinary prose, 48.1–49.6 ms at 3 MB, p95 59.0 ms worst. What is lost is the narrowing and nothing on
disk.

### Recommendation: (a) a bounded shutdown owner joined in the ordered disposer

Reason, and the third decides it (research 120 §6):

1. **Cost negligible against every bound already in the disposer** — 20–50 ms against the credentials
   join's 2,000 ms deadline (`CREDENTIAL_SHUTDOWN_JOIN_MS`).
2. **The precedent is next door and identical in shape** — Phase 220 gave credentials a synchronous
   `beginCredentialShutdown()` before any await (`capabilities.ts:435`) and a bounded
   `joinCredentialShutdown()` later (`:455`). The store's own header points at it.
3. **The 2026-08-14 napi_fatal_error was too LITTLE awaiting, not too much** (`capabilities.ts:10-16`):
   the two lines that caused it read `void disposeGitIpc()` / `void stopAgentOverlayWatch()`; an
   unsubscribe still queued at `FreeEnvironment` is answered by `napi_fatal_error`. An added
   **awaited, bounded** join is the same shape as the fix, not the shape of the bug.

### The shape Builder B implements (mirror of the credentials owner)

A new module owns admission and a bounded join for the baselines domain, mirroring
`src/main/credentials/lifecycle.ts`:

- `beginBaselineShutdown()` — closes admission synchronously (a boolean), so a `baselines:store` invoke
  arriving after it is refused (returns a refusal, does not begin a write).
- `trackBaselineWork(work)` — the `store()` IPC handler wraps its in-flight promise so the join can
  await it; returns the same promise (identity preserved, as `trackCredentialWork` does).
- `joinBaselineShutdown(deadlineMs = BASELINE_SHUTDOWN_JOIN_MS)` — closes admission (again), joins all
  tracked writes bounded by a `setTimeout(...).unref()` race, returns a report `{ already, tracked,
  joined, waitedMs }`. A quit with nothing in flight walks an empty set and resolves in the same tick,
  so the ordinary quit pays nothing.
- `BASELINE_SHUTDOWN_JOIN_MS` — a bound in the 200–500 ms range (a store is p95 ~59 ms; the bound is a
  wedge guard, not an expected wait). Builder B picks the exact value and justifies it in the module
  header against research 106 §1.4; it must be **bounded**.

Wiring in `capabilities.ts` (Builder B; the exact positions are contract):

- `beginBaselineShutdown()` beside `beginCredentialShutdown()` near the top of `disposeMainCapabilities`
  (`:435`), before the first await, so no new write is admitted once quit begins.
- `await joinBaselineShutdown()` **immediately after the credentials-join block** (`:467`), **before**
  `disposeProjectCloneIpc()` / `shutdownGmuxCore()`. Research 120 §6: the baselines join must sit far
  ABOVE the watcher drain (`:545-590`), with `shutdownGmuxCore` and the remote joins between it and the
  drain, because baselines work is filesystem work on the same four-thread uv pool and must not race
  the drain. The one sentence the join logs goes through `getLog('quit')`, counts and booleans only,
  never a token or a path.

Three constraints ride with it, and the test pins all three: it must be **bounded**; it must sit far
above the watcher drain; and it **may not move, remove, or reorder any existing await** (contract by
`capabilities.ts:14-16`, already pinned by `src/main/__tests__/quit-dispose-order.test.ts`).

### How it is TESTED

Builder B adds two tests:

1. **A functional unit test of the owner** (`src/main/baselines/__tests__/shutdown.test.ts`, sibling
   shape to the credentials lifecycle tests): admission closes synchronously; a tracked write that
   resolves within the bound is joined (`joined: true`, report counts it); a tracked write that never
   settles is bounded (the join resolves at the deadline with `joined: false` and the process is not
   wedged); a second `join` returns the first's report with `already: true`; an idle quit walks an
   empty set and resolves in the same tick with `tracked: 0`; a `store()` invoke after
   `beginBaselineShutdown()` is refused rather than begun.
2. **A source-shape test of the ordering** — extend `src/main/__tests__/quit-dispose-order.test.ts`
   (the existing instrument) with clauses: `beginBaselineShutdown()` appears before the first await;
   `joinBaselineShutdown()` is `await`ed (never `void`), sits after the credentials join and before
   `shutdownGmuxCore()`, and above the watcher drain; the bound is a named constant; and no existing
   await moved (the existing assertions in that file must all still pass unchanged).

### The limits, stated plainly (research 120 §6)

- "Nothing owns a write at quit" — closed by this owner (a bounded join of in-flight writes).
- "What is lost is the narrowing and nothing on disk" — unchanged and true; every write is under
  `<userData>/gmux/baselines`, no path to a source file. This is why it is a limit, not a defect.
- "A staged file a crash left behind is invisible to the ceiling" — **unchanged; the owner does NOT
  close it.** The phase record says so rather than letting a bounded join read as if it did.

---------------------------------------------------------------------------------------------------

## 6. The two builders — disjoint file ownership

### BUILDER A — the patches, the postinstall wiring, the deterministic regression

Owns and may write only:

- `patches/@xterm+xterm+6.0.0.patch` (new) — §3, owner 1, two hunks (mjs + js).
- `patches/@xterm+addon-webgl+0.19.0.patch` (new) — §3, owner 2, two hunks (mjs + js).
- `build/probe-p167-scale.mjs` — add the ledger install (§4, research 120 §4(a) verbatim), the arm-B
  drive, the two per-owner clauses, the ledger self-check, and the new default-on knob `P167_LEDGER`
  (documented in the header's knobs list). **Does not weaken** the planted control, the census, the
  workload floor, the descriptor check, or the snapshot behavior. Does not change budgets.
- The knob's mention in the probe header only.

Does NOT touch `package.json`'s `postinstall` line (it already runs `apply-patches.mjs`; the new
patch files are picked up by directory listing — confirm, do not edit). If a new `probe:`/gate script
alias is wanted for the regression it is added to `package.json` scripts — but note `package.json` is
shared; A coordinates the one-line scripts addition with the integrator, and touches nothing else in
it.

Proof Builder A produces (into the phase record, not committed prose): the regression RED at the
parent install and green after the patches, both clauses, both readings; and that
`node build/apply-patches.mjs` applies clean, is idempotent, and reports `applied` on a second run.

### BUILDER B — the baseline quit owner and its test

Owns and may write only:

- `src/main/baselines/shutdown.ts` (new) — the owner module (§5): `beginBaselineShutdown`,
  `trackBaselineWork`, `joinBaselineShutdown`, `BASELINE_SHUTDOWN_JOIN_MS`, report type, and a
  test/harness reset seam mirroring the credentials module.
- `src/main/baselines/index.ts` — export the owner's surface.
- `src/main/baselines/ipc.ts` — wrap the `baselines:store` handler's in-flight promise with
  `trackBaselineWork`, and refuse when admission is closed.
- `src/main/capabilities.ts` — the two wiring lines at the positions §5 pins (import, `begin` near
  :435, `await join` after the credentials-join block).
- `src/main/baselines/__tests__/shutdown.test.ts` (new) — the functional test (§5).
- `src/main/__tests__/quit-dispose-order.test.ts` — add the ordering clauses (§5), keeping every
  existing assertion.

Does NOT touch `build/`, `patches/`, `node_modules`, or `src/renderer`.

### The seam between them

Disjoint: A is `patches/` + `build/probe-p167-scale.mjs`; B is `src/main/baselines/` +
`src/main/capabilities.ts` + `src/main/__tests__/`. The only shared file is `package.json` (a possible
one-line scripts alias from A); the integrator reconciles it. `src/shared/*` is not touched.

---------------------------------------------------------------------------------------------------

## 7. Verification — Tier 3

Tier 3 (backlog: a resource defect in the surface his agents run in; the second half is a quit-time
write). Budget: the gates, plus real data / the regression, plus **two independent methods, one an
attack**, plus a fix round if any verdict is needs_work.

**Gates (path-triggered).** `npm run typecheck && npm run build && npm run test`. The commit touches
no gate-triggering path in the CLAUDE.md table for the renderer/main hue/context/etc. domains; the
baselines change is covered by `npm run test` (the two tests above). If any touched path maps to a
listed conformance gate, run it. `gate:electron` and `gate:background` run inside `npm run build` and
cover the probe changes; a probe that kills only on the happy path is a defect the verifier names.

**Independent method 1 — measure the parent commit.** Run the deterministic regression (§4, arm B)
against the parent `5329fb5d` install (patches absent) and against HEAD (patches applied). RED at the
parent on both clauses, green at HEAD on both. This is the run rather than read proof the phase
requires.

**Independent method 2 — full profile d run ALONE, with everything intact.** Run `probe:p167`
(profile d, 3 blocks of 6, `P167_SNAPSHOT=1`) at the parent and at HEAD, ALONE — never beside another
workflow (research 120 opening; the audit's own evidence was muddied by a concurrent probe). Before
the run read `memory_pressure | grep percentage` and `ps -Ao command | grep -c '[w]t-p26'`; if
another phase worktree is active, WAIT. Assert: detached elements plateau at HEAD where they climbed
at the parent (parent census ~840 detached/block; HEAD flat); census `queryObjects` mechanism intact;
planted control still detects 24×43 and none after release; workload floor met; ptmx/ttys 0/0
throughout. The `P167_SNAPSHOT=1` heap snapshot + `build/heap-retainers.mjs` report is kept for the
record, and the ledger's outstanding count must agree with the `ScriptedAnimationController` vector
length in the snapshot (an independent re-derivation of the same number by a different mechanism —
research 120 §4(c)).

**The attack (part of Tier 3, do not confirm).** The phase concludes it found the two owners; the
verifier tries to make the growth reappear under a condition the builder did not drive:

- an **occluded / background window** for a whole block (no frames served) — arm B emulates it; the
  attack drives the real condition if a harness minimize/hide knob is reachable, else records that
  arm C is deferred and why (research 120 §4/§6);
- a **split cycle faster than a frame** (tighten the cycle wait so unmount beats the first served
  frame);
- a **session that exits on its own mid-cycle** (a shell that self-exits, not killed by cleanup).

Green under all three at HEAD, and the attack must reproduce the growth at the parent under at least
one of them (proving the attack has teeth).

**Machine discipline.** Every Electron through `build/electron-run.mjs`, ended in a `finally`; count
Electrons once at the end with the `ps -Ao pid,ppid,rss,comm | grep -E "[E]lectron|Tortie$|chrome_crashpad"`
form; `-L gmux` read-only only; never SIGKILL the `.bin/electron` shim.

**Commit.** One commit, `fix(terminal): scheduled work ends with the terminal that scheduled it`,
first body line `Phase 265: work scheduled for a terminal ends when the terminal does`, patch semver,
no trailers. The `docs/research/120-*.md` file already exists; if the phase adds a record of the
readings it appends to the backlog running log (one line) and gives Phase 265 its full section per the
house rules — but research 120 already IS the research document, so no new one is written.

---------------------------------------------------------------------------------------------------

## 8. Refusals and stated limits

- **No in-app `_core` reach.** Refused in writing (research 120 §5; `capture/metrics.ts:10`).
- **No xterm major bump.** 6.0.0 / 0.19.0 pinned; the fix is bytes under `patches/`.
- **TerminalPane is not the owner and is not touched.**
- **The detector is not weakened; history is not trimmed; churn is not reduced.** Planted control,
  census mechanism, Past Sessions, and the workload floor all stand.
- **The baseline owner does not close the staged-file-invisible-to-the-ceiling limit**, and the record
  says so; nor does it protect anything on disk (it protects the narrowing only).
- **The bounded join may not lengthen the quit path in a way that risks the napi_fatal_error** — it is
  bounded, sits above the watcher drain, and moves no existing await (pinned by the source-shape test).
- **Not in this phase:** no xterm upgrade; the other P167 profiles, long soaks, and large-document
  perf comparisons; arm C real-occlusion is built only if the harness knob is cheaply reachable, else
  deferred and recorded. The retention is not attributed to any one commit; the audit's overlap
  qualification is carried forward.
