# The frame that outlives the terminal

Date: 13 September 2026. Phase 265, the research step. **Nothing was repaired and nothing was run.**

Worktree: `/private/tmp/wt-p265r`, detached at `ded6846d`. Package version `0.104.0`.
Installed terminal stack: `@xterm/xterm` **6.0.0**, `@xterm/addon-webgl` **0.19.0**,
`@xterm/addon-fit` 0.11.0, `@xterm/addon-web-links` 0.12.0, all built from upstream commit
`f447274f430fd22513f6adbf9862d19524471c04` (recorded in each `package.json`).

The Phase 265 entry (`docs/BACKLOG.md:26977`) requires the owner of the retaining path to be written
down **before** any repair. This is that document. It names one owner, gives the evidence that would
confirm it, and writes down the instrument that takes that evidence.

This round did not take a heap profile. Another phase workflow was running on the machine, and a
concurrent probe is the condition the audit itself blames for muddying its evidence. Everything below
is read from the tree, re-derived against the shipped bytes where a source claim mattered, and
designed for the build step to run.

---

## 1. The measurement this starts from

P167 profile d, three blocks of six split/close/reattach cycles at full speed on the built renderer,
24 sessions discarded per block (`docs/BACKLOG.md:26999`):

| Reading | Block 1 | Block 2 | Block 3 |
| --- | ---: | ---: | ---: |
| Renderer heap after collection, MB | 11.4 | 15.7 | 20.3 |
| DOM nodes | 623 | 1,643 | 2,663 |
| Detached elements | 140 | 980 | 1,820 |
| Elements on screen | 278 | 278 | 278 |
| Event listeners | 231 | 231 | 231 |
| Past Sessions | 24 | 48 | 72 |
| Main ptmx / ttys descriptors | 0/0 | 0/0 | 0/0 |

**The planted control detected all 1,032 deliberately held elements and read none after release, so
the detector is sound** (`build/probe-p167-scale.mjs:1975-2010`, and the census at `:1129`, which
asks the page through `Runtime.queryObjects` rather than reading a counter). Past Sessions growth is
intentional; the detached trees are not.

Two deltas that matter for what follows. Detached elements move **840 and 840** — exactly linear at
24 discards a block, **35 detached elements per discarded session**. And **the listener count is flat
at 231 across all three blocks.** That flatness is a discriminating fact rather than a footnote: an
un-removed `addEventListener` would move it. What grows is held by something that is not a DOM
listener.

The retaining path the audit photographed is the one research 109 photographed before it
(`docs/research/109-phase-244-split-retention.md:99-120`): a detached `div.xterm-decoration-container`
held through `_container` by an object `Gt`, whose closure sits in a `_refreshCallbacks` array, on a
`_renderDebouncer`, on a `_renderService`, on an object `ei`, which is the **`this` of a closure that
is itself element [1] of a `V8FrameRequestCallback`**, on a `V8FrameCallback`, in the document's
`ScriptedAnimationController`.

---

## 2. What is ruled out, with the citation that rules it out

**`TerminalPane`'s own animation frame.** `raf` is assigned at
`src/renderer/terminal/TerminalPane.tsx:503`, cancelled at `:502` before every reassignment, and
cancelled again in the effect teardown at `:596`. The same teardown disposes the scroller, the
path-link provider, the webgl addon, the four subscriptions, the resize observer and the terminal
(`:586-617`). Already ruled out by the entry; re-read here and it still holds.

**Any callback queued through `RenderDebouncer`.** `RenderDebouncer.dispose()`
(`node_modules/@xterm/xterm/src/browser/RenderDebouncer.ts:25-30`) is the **only**
`cancelAnimationFrame` in the entire package. Re-derived against the shipped artifact rather than the
sources: `grep -o cancelAnimationFrame` counts **1** in `node_modules/@xterm/xterm/lib/xterm.mjs` and
**1** in `lib/xterm.js`, against **5** `requestAnimationFrame`, and that one occurrence is
`dispose(){this._animationFrame&&(this._coreBrowserService.window.cancelAnimationFrame(this._animationFrame),this._animationFrame=void 0)}`.
`RenderService` registers its debouncer (`RenderService.ts:70-71`) and is itself registered
(`CoreBrowserTerminal.ts:478`), so `term.dispose()` reaches it.

**But the debouncer is not the `this` in the photograph either.** `RenderDebouncer` has five fields —
`_rowStart`, `_rowEnd`, `_rowCount`, `_animationFrame`, `_refreshCallbacks` — plus `_renderCallback`
and `_coreBrowserService` (`RenderDebouncer.ts:13-23`). It has **no `_renderService` property**, and
the photograph requires `ei._renderService`.

**Research 109's shape 1 is refuted, and so is one of its factual claims.** It supposed a refresh
scheduled *after* `RenderDebouncer.dispose()`, triggered by `webgl?.dispose()` running before
`term.dispose()`. Any frame the debouncer schedules is cancelled by the `term.dispose()` on the very
next line (`TerminalPane.tsx:606, 610`), and the debouncer is not `ei`. Research 109 also states that
`RenderDebouncer.dispose()` "clears `_refreshCallbacks`". **It does not.** `dispose()` cancels the
frame and nothing else (`RenderDebouncer.ts:25-30`); `_refreshCallbacks` is emptied only inside
`_runRefreshCallbacks` (`:78-83`). Two readings disagreed on this and it was settled by opening the
file. That is why a disposed `BufferDecorationRenderer`'s closure is still sitting in that array in
the photograph.

**`OverviewRulerRenderer`.** It holds `_renderService` (`decorations/OverviewRulerRenderer.ts:56`),
calls `requestAnimationFrame` directly (`:209`), has no `dispose()` override and no cancel — so it
fits the photograph's shape exactly, and it is **not constructed in Tortie.** It is created only under
`if (this.options.overviewRuler.width)` (`CoreBrowserTerminal.ts:561-562`); the default is
`overviewRuler: {}` (`common/services/OptionsService.ts:59`) and `TerminalPane.tsx:254-275` lists
every option Tortie passes, which does not include it.

**`vs/base/browser/dom.ts:392`, the `scheduleAtNextAnimationFrame` pump.** Its callback is
`() => animationFrameRunner(targetWindowId)`, a module-scope arrow capturing a number. It has no
`this` and reaches no terminal.

**The four remaining `_renderService` holders, because none of them calls `requestAnimationFrame`.**
`Viewport.ts:39` and `BufferDecorationRenderer.ts:23` go through `addRefreshCallback`
(`Viewport.ts:144`, `BufferDecorationRenderer.ts:52`), which is the debouncer's frame, already
cancelled. `Linkifier.ts:34`, `input/CompositionHelper.ts:50`, `AccessibilityManager.ts:58` and
`CoreBrowserTerminal.ts:90` hold the service and schedule no frame; the package's five
`requestAnimationFrame` sites are exhaustively `dom.ts:392`, `RenderDebouncer.ts:35`,
`RenderDebouncer.ts:53`, `OverviewRulerRenderer.ts:209` and `SelectionService.ts:282`.

**An un-removed event listener.** Ruled out by the measurement itself: 231 listeners in all three
blocks.

**Main-process descriptors.** 0 `ptmx` and 0 `ttys` after every block. Phase 167 finding 1 stays
closed.

---

## 3. The named owner

**`SelectionService._refreshAnimationFrame`, scheduled at
`node_modules/@xterm/xterm/src/browser/services/SelectionService.ts:282`, and never cancelled by
anything in the package.**

It is the only candidate left, and the elimination is exhaustive rather than suggestive: the
photograph requires an object that (a) holds a `_renderService` property and (b) hands a closure to
`requestAnimationFrame` itself. Exactly two classes in the package satisfy both, and one of them is
never constructed here.

The field is declared at `SelectionService.ts:97`. It is scheduled at `:281-283`:

```ts
if (!this._refreshAnimationFrame) {
  this._refreshAnimationFrame = this._coreBrowserService.window.requestAnimationFrame(() => this._refresh());
}
```

The class extends `Disposable` (`:72`) and declares **no `dispose()` override** — the only `dispose`
token in the file is `this._trimListener.dispose()` at `:765`, inside `_handleBufferActivate`. It is
registered (`CoreBrowserTerminal.ts:518`), so the base `dispose()` runs and disposes its store, and
the store holds a mouse-listener remover (`:152-154`), the buffer-activate subscription (`:145`) and
the resize subscription (`:157-162`) — **and not the frame handle.** The handle is cleared in exactly
one place, `_refresh()` at `:299-300`, which only runs if the frame is served.

The closure's `this` is the `SelectionService`, which holds `_element` and `_screenElement` as
constructor fields (`:124-125`) and `_renderService` at `:131`. That is the whole disposed tree, and
it is the chain the photograph reads.

### Why it fires with nobody touching the mouse, and why it is a *split* profile that fails

`clearSelection()` calls `this.refresh()` unconditionally at `:270`, whether or not a selection exists.
Two subscriptions call it with no user input at all:

- **`onResize` with `rowsChanged`** (`:157-162`). A split resizes every surviving pane. Profile d
  creates four sessions in a grid and then kills all four (`build/probe-p167-scale.mjs:1591-1593`), so
  every cycle resizes every pane several times.
- **`onBufferActivate`** (`:145` → `_handleBufferActivate` at `:759-760`). `tmux attach` enters the
  alternate buffer on attach and leaves it on detach, so this fires on every reattach.

**And this gives the controlled account of the intermittency the audit asked for.** A pending frame is
harmless when the page produces frames: the callback runs, `_refresh()` clears the field at `:300`,
and the closure is released. It becomes a permanent root only when the terminal is disposed **before
the next frame is served**. Two ways that happens, and they are not alternatives — they add:

1. **A resize and an unmount inside one frame boundary.** Closing a pane resizes its siblings and then
   unmounts them in the same commit. That is the shape profile d drives four times a cycle.
2. **A window that is producing no frames.** This repository already owns that measurement in its own
   words, at `src/renderer/terminal/scroll/surface.ts:192-198`: *"MEASURED in the screenshot harness,
   rAF callbacks do not run at all while the window is not producing frames: 22 wheel notches
   accumulated and fired as one 142-line jump after the run finished."* `src/main/harness/shot.ts:233`
   turns off `setBackgroundThrottling`, which lifts **timer** clamping and does **not** make an
   occluded window produce frames.

Blocks that pass are blocks where a frame was served between every schedule and its unmount. Nothing
about the workload decides it, which is what four previous rounds observed and could not explain.

### What would confirm it

One reading, and it does not need a heap snapshot: **the text of the pending callback at the moment
the terminal is disposed.** Section 4 is that instrument. `String(cb)` for the three candidates is
distinguishable without a sourcemap, because these are property accesses and terser keeps property
names:

| Callback text, minified | Owner |
| --- | --- |
| `()=>this._refresh()` | `SelectionService` |
| `()=>this._innerRefresh()` | `RenderDebouncer` |
| `()=>{this._renderCallback(),this._animationFrame=void 0}` | `CursorBlinkStateManager` |

A profile-d cycle that ends with one or more outstanding `()=>this._refresh()` frames per discarded
pane confirms the owner. Zero of them, with detached elements still growing, refutes it and hands the
next round the callback text of whatever is actually there.

### The second owner, which is real, is not this path, and must be closed in the same commit

`@xterm/addon-webgl/src/WebglRenderer.ts:32`:

```ts
private _cursorBlinkStateManager: MutableDisposable<CursorBlinkStateManager> = new MutableDisposable();
```

Its four siblings at `:33`, `:37`, `:46` and `:47` all read `this._register(new MutableDisposable())`.
Line 32 does not, and `WebglRenderer` has no `dispose()` override. Confirmed in the shipped bytes,
`node_modules/@xterm/addon-webgl/lib/addon-webgl.js`:
`…this._cursorBlinkStateManager=new m.MutableDisposable,this._charAtlasDisposable=this._register(new m.MutableDisposable),this._observerDisposable=this._register(…`.

The manager is constructed whenever the cursor blinks (`WebglRenderer.ts:362-366`, called from the
constructor at `:105`), and **Tortie sets `cursorBlink: true`** (`TerminalPane.tsx:268`). So every
discarded terminal leaves behind a **live `setInterval` at 600 ms, forever**
(`CursorBlinkStateManager.ts:101-118`), whose closure reaches `_renderCallback` → the arrow at
`WebglRenderer.ts:364-366` → the renderer → `_canvas`, `_core` and the render layers. Its
`dispose()` is written correctly (`CursorBlinkStateManager.ts:39-52`); it is simply never called.
The tick is silent, because `_requestRedrawCursor()` fires an emitter that the disposed store already
emptied, so `fire()` takes its no-op branch.

**This is not the photographed path** — `CursorBlinkStateManager`'s fields are `isCursorVisible`,
`_animationFrame`, `_blinkStartTimeout`, `_blinkInterval`, `_animationTimeRestarted`,
`_renderCallback` and `_coreBrowserService`, and none of them is `_renderService`
(`CursorBlinkStateManager.ts:14-33`); `grep -rn _renderService` over `@xterm/addon-webgl/src` returns
only two local consts in `WebglAddon.ts:61,94`.

**It is nonetheless invisible to the snapshot by construction, which is why the phase must not treat
"the repair closed the photographed path" as the end.** `build/heap-retainers.mjs` walks breadth-first
from the root so every node gets its **shortest** retaining path, "which is the path devtools shows
first" (`build/heap-retainers.mjs:29-31, 89-90`). A second, longer retainer on the same tree is
masked. The detached census at `build/probe-p167-scale.mjs:1129` is not masked — it asks `isConnected`
of every live element — so the census can keep growing after the shortest path is closed, and the only
instrument that separates the two is the scheduling ledger below.

Also worth naming so a later round does not re-derive it: `RenderService.ts:238` subscribes
`this._renderer.value.onRequestRedraw(…)` **without registering the returned disposable**, so a
leaked renderer's emitter holds a closure over the `RenderService`. And `CharAtlasCache.ts:15-17`
carries upstream's own comment, *"this implementation potentially holds onto copies of the terminal
forever"*; it is pruned today only because `TerminalPane.tsx:606` calls `webgl?.dispose()` inside a
`try/catch` that swallows, so any repair that moves or removes that line must prove the pruning still
happens.

**Ranking, stated plainly.** One owner is named for the photographed path and the elimination behind it
is exhaustive: `SelectionService.ts:282`. One further owner is named for the same *class* of defect
with independent evidence and a different retaining path: `WebglRenderer.ts:32`. They are not
competing hypotheses about one observation; they are two defects, and the measurement in section 4
reads both at once.

---

## 4. The measurement design

The instrument is a **scheduling ledger in the page**, not a heap snapshot. It is smaller, it is
deterministic, and it answers the question the snapshot could not: *which* pending frame, scheduled by
*what*, is still outstanding after the terminal that scheduled it was disposed.

### What `build/probe-p167-scale.mjs` already gives you

- One Electron on a scratch profile and a scratch tmux socket, through `withElectron` and
  `build/harness-socket.mjs`, ended in a `finally` (`:856`, `:1705`, and the safety header at `:96-109`).
- Profile d itself: `cycleSplit` at `:1591-1593` — four real shell sessions in a grid through the shot
  drive's `splitGrid`, then all four killed through the cleanup hook.
- Two collections and the four Performance counters after every block (`:1073-1075`).
- The detached census through `Runtime.queryObjects` (`:1129`), and the Past Sessions workload floor.
- The main-process `ptmx`/`ttys` descriptor check across the split profile.
- The planted control at the end of every run (`:1975-2010`) — 24 trees of 43 elements, which the
  census must see, the grader must go red on, and the release must bring back.
- A heap snapshot per block behind `P167_SNAPSHOT=1`, and the automatic snapshot on the first finding
  from the second block onward (`P167_SNAPSHOT_ON_FINDING=0` turns it off), read by
  `build/heap-retainers.mjs`.
- `cdpEval(cdp, expression, timeoutMs)` from `build/cdp-client.mjs` (imported at `:231`), which is the
  injection point below.

### What must be added

**(a) The ledger.** Installed once through `cdpEval` before the first block, after page load and before
any terminal is created. It wraps the two window methods, records what it needs per pending id, and
adds a `hold` switch that emulates a window producing no frames.

```js
(() => {
  if (window.__p265) return 'already';
  const realRAF = window.requestAnimationFrame.bind(window);
  const realCAF = window.cancelAnimationFrame.bind(window);
  const realSI = window.setInterval.bind(window);
  const realCI = window.clearInterval.bind(window);
  const pending = new Map();            // id -> { at, text, stack, held }
  const intervals = new Map();          // id -> { at, ms, text }
  const counts = { scheduled: 0, cancelled: 0, served: 0 };
  const held = [];
  let holding = false;
  let synthetic = -1;

  const note = (cb) => ({
    at: performance.now(),
    // The discriminator. Property names survive minification, so
    // `()=>this._refresh()` (SelectionService), `()=>this._innerRefresh()`
    // (RenderDebouncer) and the CursorBlinkStateManager body are all
    // distinguishable with no sourcemap.
    text: String(cb).slice(0, 160),
    stack: (new Error('p265').stack ?? '').split('\n').slice(2, 12).join('\n')
  });

  window.requestAnimationFrame = (cb) => {
    counts.scheduled += 1;
    const meta = note(cb);
    if (holding) {
      const id = synthetic--;
      held.push({ id, cb });
      pending.set(id, { ...meta, held: true });
      return id;
    }
    const id = realRAF((t) => { pending.delete(id); counts.served += 1; cb(t); });
    pending.set(id, { ...meta, held: false });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (pending.delete(id)) counts.cancelled += 1;
    const i = held.findIndex((e) => e.id === id);
    if (i >= 0) held.splice(i, 1);
    if (id >= 0) realCAF(id);
  };
  window.setInterval = (fn, ms, ...rest) => {
    const id = realSI(fn, ms, ...rest);
    intervals.set(id, { at: performance.now(), ms, text: String(fn).slice(0, 160) });
    return id;
  };
  window.clearInterval = (id) => { intervals.delete(id); return realCI(id); };

  window.__p265 = {
    counts,
    hold(on) {
      holding = on;
      if (!on) { for (const e of held.splice(0)) { pending.delete(e.id); realRAF(e.cb); } }
    },
    outstanding() {
      const now = performance.now();
      return [...pending].map(([id, m]) => ({ id, ageMs: Math.round(now - m.at), held: m.held, text: m.text, stack: m.stack }));
    },
    timers() {
      const now = performance.now();
      return [...intervals].map(([id, m]) => ({ id, ageMs: Math.round(now - m.at), ms: m.ms, text: m.text }));
    }
  };
  return 'installed';
})()
```

**What to record, per profile-d cycle, after `cleanup()` settles and after the two collections:**

1. `window.__p265.outstanding()`, bucketed by `text`. The reading that matters is the count of
   outstanding frames whose text is `()=>this._refresh()`, and its ratio to the four panes the cycle
   discarded.
2. `window.__p265.counts` — scheduled, cancelled, served. `scheduled - cancelled - served` is the
   ledger's own outstanding count, and it must equal `outstanding().length`. That is a self-check on
   the instrument.
3. `window.__p265.timers()`, filtered to `ms === 600`, bucketed by `text`. An interval whose body names
   `_animationTimeRestarted` or `_restartInterval` and whose age exceeds the cycle is a leaked
   `CursorBlinkStateManager`, and its count should track the panes discarded so far.
4. The existing census count, unchanged, so the two instruments can be read against each other.

**(b) The three arms, which is how visible and occluded are controlled.**

| Arm | How | What it is for |
| --- | ---: | --- |
| **A, frames flowing** | `hold(false)` throughout, the shipped condition | Reproduces the intermittency honestly. Expected to pass sometimes. Do not read a green A as an answer |
| **B, emulated occlusion** | `hold(true)` for the whole cycle, released after the census is read | **Deterministic.** No frame is served, so every scheduled frame is still outstanding at dispose, and the ledger reads the owner every time. This is the arm the regression is built on |
| **C, real occlusion** | The harness window minimized or hidden for the duration of one block | Confirms B matches reality rather than only its own wrapper |

Arm C needs a knob the harness does not have today — a way to ask main to minimize or hide
`mainWindow` for the duration of a block, and to restore it. `setBackgroundThrottling(false)`
(`src/main/harness/shot.ts:233`) is **not** a substitute: it lifts timer clamping and does not make an
occluded window produce frames, which is exactly what `surface.ts:192-198` measured. If arm C cannot
be built inside this phase's budget, say so in the phase's record and keep arms A and B; do not
quietly drop the occlusion question, because it is the whole account of why earlier samples passed.

**(c) The snapshot stays, and is now a cross-check rather than the primary.** Keep
`P167_SNAPSHOT=1` for the phase's record as the entry requires. The ledger's outstanding count must
agree with the length of the `ScriptedAnimationController` vector in the snapshot, and that agreement
is an independent re-derivation of the same number by a different mechanism.

**(d) One app run, not one per claim.** All of the above is read inside the single profile-d Electron
the probe already launches. Arms A and B are two block sequences in that one session.

---

## 5. The repair, described and NOT performed

### The primary repair

`SelectionService` must cancel `_refreshAnimationFrame` when it is disposed. In upstream's source that
is one registration beside the ones already in its constructor (`SelectionService.ts:152-162`):

```ts
this._register(toDisposable(() => {
  if (this._refreshAnimationFrame !== undefined) {
    this._coreBrowserService.window.cancelAnimationFrame(this._refreshAnimationFrame);
    this._refreshAnimationFrame = undefined;
  }
}));
```

### The secondary repair, same commit

`WebglRenderer.ts:32` should read `= this._register(new MutableDisposable())`, matching its four
siblings. One character class of change, and it is the difference between a live 600 ms timer per
discarded terminal and none.

### The shape, since both live upstream

Tortie consumes the prebuilt bundles, not `src/`, so a source edit changes nothing. The entry already
names the form: **a bounded patch under `patches/`, in the shape `patches/node-pty+1.1.0.patch`
already uses**, applied by `build/apply-patches.mjs` with `/usr/bin/patch -p1 -s -f -F0` from the
repository root, in `postinstall` (`package.json:205`). Notes the build step will need:

- The targets are `node_modules/@xterm/xterm/lib/xterm.mjs` and `lib/xterm.js` for the primary, and
  `node_modules/@xterm/addon-webgl/lib/addon-webgl.mjs` and `lib/addon-webgl.js` for the secondary.
  Both bundles are minified, so each is a single-line hunk. Patch both module and main: the renderer
  resolves `module`, and a Node-side test resolves `main`.
- `apply-patches.mjs` decides "already applied" by **content** — every added line present in the
  target — rather than by asking `patch` (its header, step 1). With a minified bundle the added line
  is the whole line, which works, and means the check is exact.
- `-F0` means a pinned version matches exactly or the patch is reviewed. An `@xterm/xterm` release
  that moves those bytes fails `npm install` loudly rather than silently dropping the fix. That is the
  wanted behaviour, and the patch filename must carry the version — `@xterm+xterm+6.0.0.patch` — so the
  pinning is legible.

**The in-app alternative is refused, and the reason is written down so it is not re-proposed.** Reaching
the service from `TerminalPane`'s teardown needs `(term as any)._core._selectionService`. `Terminal`'s
public API exposes no handle on it, and this tree has a standing rule against that reach —
`src/renderer/terminal/capture/metrics.ts:10`, *"Everything below is public DOM + public xterm API; no
`_core` access"* — which a grep over `src/` confirms is currently kept: the only two occurrences of
`_core` anywhere under `src/renderer` and `src/shared` are that sentence and a prose mention in
`capture/serialize.ts:11`. Creating the first `_core` access in the tree, inside a teardown, against a
private field of a private service, is worse than a pinned two-line patch.

### The refusals, from the entry, restated as conditions on the repair

1. **A deterministic regression that is RED before and green after.** Arm B is deterministic and needs
   no frame production; the regression asserts that after a profile-d cycle's cleanup settles, zero
   outstanding frames carry `()=>this._refresh()`, and zero 600 ms intervals carry the blink body.
   **One clause per owner**, so a repair that closes only the photographed path cannot go green.
2. **A profile rerun is a sample, not a regression.** Full profile d runs afterwards with census,
   workload floor, descriptor checks and planted control all intact, and it is evidence beside the
   regression rather than instead of it.
3. **The repair may not remove history.** Past Sessions is not trimmed.
4. **The repair may not reduce churn.** The workload floor stays where it is.
5. **The repair may not weaken the detector.** The planted control keeps its 24 trees of 43 elements,
   the census keeps its `queryObjects` mechanism, and the budgets do not move.
6. **No xterm major-version bump late in a release cycle.** 6.0.0 stays pinned.

---

## 6. The baseline quit contract

The gap is still true of the code and not only of the comment. `src/main/capabilities.ts:344-349`
registers this domain in two lines — `registerBaselinesIpc(ipcMain)` and
`startBaselineStorePruning()` — and `disposeMainCapabilities` (`capabilities.ts:429-711`) names no
baselines call at any point; `grep -n baseline src/main/capabilities.ts` returns only the import at
`:49-51` and those registration lines. `src/main/baselines/index.ts` exports no disposer to call, and
the daily timer is held in a function-local `const` and unref'd (`baselines/ipc.ts:68-74`), so there is
no `clearInterval` either.

The window is narrower than "any accept". `markAppQuitting()` runs synchronously at
`src/main/index.ts:736`, before `event.preventDefault()` and before any await, and
`src/main/typed-ipc.ts:53-59` then refuses every **new** invoke with the typed `SHUTTING_DOWN` payload.
What has no owner is a `store()` **already running** when that line ran. Research 106 §1.4 measures one
at **p50 19.8–24.9 ms for ordinary prose and 48.1–49.6 ms at 3 MB**, p95 59.0 ms worst.

**Recommendation: (a), a bounded shutdown owner joined in the ordered disposer.** Three reasons, and the
third decides it.

1. **The cost is negligible against every bound already in that function.** 20 to 50 ms against the
   credentials join's 2,000 ms deadline (`src/main/credentials/lifecycle.ts:87`,
   `CREDENTIAL_SHUTDOWN_JOIN_MS = 2_000`, joined at `capabilities.ts:455`).
2. **The precedent is next door and is the same shape.** Phase 220 gave the credentials domain exactly
   this: a `begin` before any await (`capabilities.ts:435`) and a bounded `join` later
   (`:455`). The store's own header already points at it.
3. **The 2026-08-14 napi_fatal_error was caused by too LITTLE awaiting, not too much.**
   `capabilities.ts:10-16` records it: every watcher close is awaited before `app.quit`, because an
   unsubscribe still queued at `FreeEnvironment` is answered by `napi_fatal_error`, and all 5 real
   quits that day died that way. The two lines that caused it used to read `void disposeGitIpc()` and
   `void stopAgentOverlayWatch()`. So an added **awaited, bounded** join is the same shape as the fix.

Three constraints ride with it, and the phase's test must pin all three:

- **It must be bounded.** An unbounded join re-opens the wedge the SIGKILL-to-self exists as a last
  resort against.
- **It must sit far ABOVE the watcher drain.** `capabilities.ts:484-495` records that a measured
  unsubscribe completes in single-digit milliseconds *when the uv threadpool has a free thread*. A
  baselines join is filesystem work on the same four-thread pool. Put it near the credentials join, with
  `shutdownGmuxCore` and the remote joins between it and the drain at `:545-590`.
- **It may not move, remove or reorder an existing await.** That is contract by `capabilities.ts:14-16`
  and is already pinned as a source-shape test by `src/main/__tests__/quit-dispose-order.test.ts`.

### The three qualifications the domain already documents, one line each

- **"Nothing owns a write at quit"** (`src/main/baselines/store.ts:36-43`). **Still true**, verified
  above against `capabilities.ts` and `baselines/index.ts`; this is what the recommendation closes.
- **What is lost is the narrowing and nothing on disk.** **True.** The accept is synchronous and writes
  no file (`src/renderer/editor/RedlineDocument.tsx:470-474`, `store.ts:1228-1244`, which does
  `void io.persistBaseline(id)` unawaited); every write in `src/main/baselines/store.ts` is composed
  from `deps.dir`, which is `<userData>/gmux/baselines` (`baselines/ipc.ts:28-30`), so there is no path
  from this domain to a source file. Unchanged by the recommendation, and it is why this is a limit and
  not a defect.
- **"A staged file a crash left behind is invisible to the ceiling"** (`store.ts`'s second stated limit).
  **Unchanged**, and the recommended owner does **not** close it — say so rather than letting a bounded
  join read as if it did.

---

## 7. What this document does NOT establish

- **It takes no measurement.** Every claim here is read from the tree or re-derived against the shipped
  bytes. The owner in section 3 is established by exhaustive elimination over the package's five
  `requestAnimationFrame` sites and the photograph's `_renderService` edge; it is **not** yet confirmed
  by a reading taken across a disposal. Section 4 exists because that reading has not been taken.
- **The audit's own run overlapped other scratch probes.** It demonstrates retention under that
  workload. It does not establish a frequency in an idle window, and this document carries that
  qualification forward rather than dropping it.
- **The retention is not attributed to any one commit.** Nothing here dates the defect to a change in
  this repository, and the owner named is upstream code that has been pinned throughout.
- **Whether Chrome fires `blur` on a textarea whose element is removed from the document** is not
  established from source. It decides whether a pane that held focus at close time is discarded with a
  running `CursorBlinkStateManager` every time or only sometimes, and it is a one-line reading for the
  build step's arm B.
- **Whether a second retainer survives the primary repair.** `build/heap-retainers.mjs` shows shortest
  paths (`:29-31, 89-90`), so the photograph cannot rule one out. The ledger in section 4 is what
  answers it, and the phase should not read a closed photographed path as a closed census.
- **Arm C, real occlusion, needs a harness knob that does not exist today.** Until it does, arm B is an
  emulation of the occluded condition rather than the condition itself.

## Safety

Nothing was launched. No Electron, no probe, no profile, no `npm run shot`. No process was started in
the background. `-L gmux` was not contacted at all, not even to list. Nothing outside
`/private/tmp/wt-p265r` was read or written, no package was installed, no agent was spawned and no
token was spent. Two readings disagreed about `RenderDebouncer.dispose()` and about which object owns
the pending frame; both were settled by opening the files, and the settlements are recorded in
sections 2 and 3 rather than averaged.
