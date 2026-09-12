# Architecture after path links, project tabs and code readings

Date: 12 September 2026

Tested commit: `7a2ca3ff314199d40c5e26be85f4f8cd47914d4b`, package version `0.103.0`.

Baseline: [9 September assessment, 34/36](./2026-09-09-electron-typescript-architecture-0.102.0.md), covering the implementation at `f8ba072b19c0b4f515a0de3c08ec5ea5dffcc93d`.

## The architecture scores 32 out of 36

The outer architecture remains strong. Recent features use the existing main-process owners, typed preload, parser pool and editor store. Import checks find no boundary violations or runtime cycles. The production build, full test suite and the new semantic and project-tab app probes pass.

Two independent tests expose new gaps in the Architecture fact cache:

- facts extracted from temporary file contents can be stored under the restored contents' identity, then reused by a later clean scan
- reusing a cached file in another repository can turn a known incomplete parse into a record with `truncated: false`

State ownership and Failure flow each move from 3 to 2. Lifecycle remains 2: this review reproduced the retained-terminal growth, rather than merely carrying forward an old report. Test seam remains 2: the saved registry fixture still fails on Node 22.14.0, which the documented Node 22+ requirement admits.

Eight categories score 3 and four score 2. This is a boundary assessment, not a quality percentage, security certification or measure of how often the app fails. The new findings concern derived Architecture evidence. Neither fixture changed a user's source file or demonstrated lost terminal work.

## The cutoff includes Phase 259, not just the first checkout

The review began at `fec82998`. Phase 259 landed while checks were running, so the isolated checkout advanced to `7a2ca3ff` and the build, typecheck and full suite ran again. All current measurements below use that second cutoff unless labelled otherwise.

The comparison `f8ba072b..7a2ca3ff` contains 117 commits, including research, documentation and fix rounds. Phase numbers do not establish landing order: Phase 260's tab work landed before Phase 259's semantic pass.

The baseline assessment and its fixtures were still uncommitted when this review began. They were preserved, not overwritten. The baseline's source commit is available and was measured directly.

One later commit was observed: `bf161f4f`, which re-pins the vendored skills tool's YAML dependency in `build/skills-release.json`. Its diff changes no `src`, application package dependency or application resource. That packaging-input change is outside this review's executed cutoff; it was not fetched or packaged here. This assessment is not verification of a signed 0.103.0 release artifact.

## The twelve category scores

The existing rubric is unchanged: 0 means no effective boundary; 1 means a boundary weakened by repeated exceptions; 2 means a clear boundary with local exceptions; 3 means an explicit, narrow boundary protected by executable checks.

| Category | 9 September | This review | Reason |
| --- | ---: | ---: | --- |
| Process ownership | 3 | 3 | New readers reuse the symbol pool and fold runner. App probes and the hostile deadline teardown release their scratch children. |
| Composition | 3 | 3 | No second application root, preload bridge or competing service framework. The two Architecture coordinators exchange injected operations. |
| IPC capability | 3 | 3 | Three added invoke channels use the existing contract. Inventory matches; external path opening revalidates in main. |
| Domain cohesion | 3 | 3 | Fact rules, evidence grading, semantic reading and markdown parsing have distinct owners within existing domains. |
| Dependency direction | 3 | 3 | 7,207 imports checked with 0 violations; 4,365 runtime edges with 0 strongly connected components. |
| State ownership | 3 | 2 | R1: a parser result has no identity for the bytes it actually parsed. Facts can be attached to the wrong shared cache key. |
| Lifecycle | 2 | 2 | R3: split churn retains increasing detached terminal trees through pending animation-frame callbacks. |
| Type truth | 3 | 3 | Contract, shared-type and project checks pass. Computed evidence rungs stay separate from model-written claims. The cache findings are charged to their owning categories below. |
| Failure flow | 3 | 2 | R2: cross-repository reuse loses a known incomplete-parser outcome. Older remote-source incompleteness handling remains in place. |
| Test seam | 2 | 2 | R4: the registry driver still splits module identity on an admitted runtime. The passing suite does not include the two new counterexamples. |
| Navigation | 3 | 3 | Growth is discoverable by feature and ownership. Large existing files merit a watchlist, not an arbitrary line-count deduction. |
| Build boundary | 3 | 3 | Build and containment checks pass; eager JavaScript remains under both budgets and all 18 lazy surfaces remain outside it. |
| Total | 34 | 32 | Eight categories at 3, four at 2. |

The two new deductions address different promises: which contents own a result, and whether a failed or partial read remains visible when reused. They are not deducted again under Type truth, Domain cohesion or Test seam.

## Where the growth came from

Production counts include comments and blank lines. They exclude `__tests__`, test/spec filenames and `src/test`.

| Measure | Baseline | Current cutoff | Change |
| --- | ---: | ---: | ---: |
| Production TypeScript/TSX files | 1,237 | 1,291 | +54 |
| Production lines | 363,341 | 383,033 | +19,692, about 5.4% |
| Imports checked | 6,941 | 7,207 | +266 |
| Runtime edges | 4,221 | 4,365 | +144 |
| Boundary violations / runtime cycles | 0 / 0 | 0 / 0 | unchanged |
| Invoke channels | 228 | 231 | +3 |
| Eager JavaScript, raw bytes | 1,573,263 | 1,609,888 | +36,625 |
| Eager JavaScript, gzip bytes | 397,514 | 407,284 | +9,770 |

About 81% of the net production-line growth is in `main/arch` (+9,105), `renderer/arch` (+3,340) and `renderer/editor` (+3,447). The much larger `build/` diff is mostly research, fixtures, probes and recorded measurements: 241 changed files and 146,108 net added lines. It is not 146,108 extra lines of application runtime.

| Landed phase | Representative commits | Implementation and architectural consequence |
| --- | --- | --- |
| 247: transcript paths | `b3d042eb`, `4094a363`, `7d1a9c2d`, `335999a7`, `28876d5d` | Adds the shared path decision, main filesystem adapter and terminal provider. One narrow external-open channel; no reuse of a more permissive project-open capability. |
| 248 and 252: wide markdown blocks | `b3c11951`, `8ff5ca1d`, `56c754ef` | Changes layout inside the markdown owner. Pane width, content width and zoom remain separate inputs. |
| 250 and 253: relative paths and more spellings | `286f7eec`, `64de5796`, `b62e277c` | Extends the existing parser and decision path. A relative spelling still cannot take the external Mac door. |
| 251: table Redline and available space | `01fca241`, `08d1dc38`, `87eace90` | Adds row pairing and layout within the existing Redline composer. It does not add another source-file write owner. |
| 254 and 255: large-file opening and streamed preview | `f163d942`, `a0d9fd32`, `34f7a36b` | Adds lightweight eligibility checks, chunk planning and cancellable staged rendering. Markdown remains lazy-loaded and sanitized. |
| 257: fact base | `cb2353c2`, `97c021ef` | Adds rule readers and content-addressed facts, reusing the symbol pool. This introduces R1 and R2; both reproduce at the first implementation commit. |
| 258: computed evidence and reading surface | `62ab3918`, `2d7e7169` | Composes regions, evidence rungs, disclosures and gates from stored facts. Adds `arch:facts`; no model is needed for the computed layer. |
| 260: tabs follow projects | `8e5a5f43`, `721b35c6`, `d15cd0c7`, `a4c4a6c9` | Makes hiding distinct from closing and scopes clean-tab eviction per project. This intentionally increases possible resident editor state. |
| 259: semantic reading | `ff5b413c`, `b5cd92ff`, `ac27f8d9`, `079a808e`, `10329297` | Reuses `arch:enrich` and the fold runner; adds the read-only `arch:semantic` channel and derived claim/declaration storage. The model does not set computed rungs or write semantic answers to `docs/arch/`. |

Phases 249 and 256 contributed research and prototypes in this range. They should not be counted as additional shipping processes or competing production implementations. Phase 246 was already in the baseline.

This is substantial, mostly cohesive growth. The material problem is that the new evidence consumers rely on cache guarantees that are not yet fully protected.

## R1: bind parser results to the bytes they describe

Priority: high. Category: State ownership, 2/3. Introduced with Phase 257.

[tree-facts.ts](../../src/main/arch/tree-facts.ts), around lines 393 and 437–456 at the cutoff, hashes one main-process read, asks the parser to read the path, then checks another main-process read against the first hash. [extract.ts](../../src/main/symbols/extract.ts), around line 261, returns symbols, calls, modification time and size, but no digest of its own input bytes. [worker.ts](../../src/main/symbols/worker.ts) carries that result back without one.

The existing `97c021ef` repair catches a simple change between the two main reads. It does not catch a change followed by a revert:

1. Main reads `ipcMain.handle('audit:before', f)` and computes identity A.
2. The file changes; the real extractor reads `audit:middle`.
3. The file returns to its original bytes before main reads it again.
4. Main sees A again and stores `IPC serves audit:middle` under A.
5. A later ordinary scan reuses the wrong fact rather than repairing it.

The saved [independent fixture](./fixtures/2026-09-12/fact-identity.test.ts.fixture) drives those writes around the injected parser seam. It uses the real `SymbolExtractor`, rule reader and SQLite store; it does not fabricate a parsed call. The disk finishes with `audit:before`, while both the first result and a subsequent clean scan return `IPC serves audit:middle`.

This reproduces at `cb2353c2` and `7a2ca3ff`. A steady-file control passes on both. These are controlled interleavings, not a measurement of how often normal editing encounters the race.

The consequence is wrong derived evidence, potentially shared with another repository holding the same blob and relative path. Phase 259 increases its importance because citations and stale checks also consume that evidence. It is not a source-file overwrite or evidence of wrong terminal execution.

Resolution:

- carry a digest computed from the exact buffer parsed by the extractor through the worker result, or parse the same immutable buffer used to establish identity
- reject and leave unlinked any result whose parsed identity disagrees with the publication identity; retain the existing change-during-read guard
- apply the rule to calls, declarations and wrapper-derived facts, not just the example IPC row
- invalidate affected derived cache generations during the repair so already mislabelled rows cannot remain reusable; do not delete source files, the manifest or the whole `gmux` directory

Closure requires the change-and-revert assertion to pass, the steady-file control to remain green, and the existing race, cancellation, wrapper and declaration tests to pass. Include a shared-cache upgrade test and a real worker-message test, not only an in-process adapter test.

## R2: preserve incomplete results across cache reuse

Priority: high. Category: Failure flow, 2/3. Introduced with Phase 257.

[db.ts](../../src/main/arch/db.ts), around line 1578, answers `hasFactsFor(oid, relPath)` across repositories. However, [tree-facts.ts](../../src/main/arch/tree-facts.ts), around lines 393–402, recovers `truncated` only from the current repository's previous link. With no such link, it defaults to false.

The independent fixture scans a 2,800,045-byte TypeScript file in two fresh repository directories sharing one scratch Architecture store. The file is below the fact reader's 4,000,000-byte threshold but above the parser's 2 MiB limit. The real extractor declines it:

| Reading | First repository | Second repository, same bytes and path |
| --- | --- | --- |
| Content identity | `7548ffb16208c5069ed978517b4b2fc97c52d74b` | same |
| Stored `truncated` | true | false |
| Truncated-file count | 1 | 0 |
| Stored facts | one line-derived environment fact | same fact reused |

The second result has not gained the missing call list. It has lost the flag explaining why that list is missing. Regional disclosures consume these stamps through [check-coordinator.ts](../../src/main/arch/check-coordinator.ts), around line 730. The fixture proves the stored and count-level discrepancy; it does not claim a separate screenshot of that exact large-file case.

This is distinct from the older remote-source incompleteness finding. Both existing `markScanPartial` paths remain in place. The new failure occurs when a per-file parser outcome crosses a shared cache boundary.

Resolution:

- make completeness part of the cached result for the same content/path identity, rather than reconstructing it from whichever repository asks next
- treat unknown completeness conservatively; either retain an incomplete outcome or reparse
- define and test the difference between no facts, an unread file, a truncated result and a complete empty result
- backfill or invalidate existing links that may already contain false completeness

Closure requires the two-repository fixture to preserve `truncated: true`, including after reopening the database. Add complete-empty, unavailable-parser and migration cases. Confirm that the map/disclosure still names incomplete coverage and that warm scans do not create a retry loop.

## R3: end scheduled terminal work when the terminal ends

Priority: high. Category: Lifecycle, 2/3. Carried forward and reproduced again.

P167 profile d ran its full default workload: three blocks of six split/close/reattach cycles, full speed, on the built renderer. Every block discarded 24 sessions. The retained growth is not the intentional Past Sessions history:

| Reading | Block 1 | Block 2 | Block 3 |
| --- | ---: | ---: | ---: |
| Renderer heap after collection, MB reported by probe | 11.4 | 15.7 | 20.3 |
| DOM nodes | 623 | 1,643 | 2,663 |
| Detached elements | 140 | 980 | 1,820 |
| Elements on screen | 278 | 278 | 278 |
| Event listeners | 231 | 231 | 231 |
| Past Sessions | 24 | 48 | 72 |
| Main ptmx / ttys descriptors | 0 / 0 | 0 / 0 | 0 / 0 |

The probe failed on the heap slope and detached-element growth. Its planted control detected all 1,032 deliberately held elements and none after release.

The automatic block-2 snapshot contains 980 matching detached elements, including 70 terminal roots. A retaining path runs through an xterm object captured by a closure, `V8FrameRequestCallback`, `V8FrameCallback`, `ScriptedAnimationController` and the document. This matches the class of retaining path recorded in [research 109](../research/109-phase-244-split-retention.md).

The new path provider is registered and unregistered in [TerminalPane.tsx](../../src/renderer/terminal/TerminalPane.tsx). That change does not establish that it caused this older intermittent issue. This run also overlapped other scratch probes; it demonstrates retention under that workload, not its frequency in an idle window or an attributable regression from one new commit.

Resolution starts at terminal cleanup around line 592, xterm's scheduling/disposal, and the existing [P167 instrument](../../build/probe-p167-scale.mjs):

- capture pending frame IDs and their scheduling stacks across terminal disposal
- control visible/occluded and active/background window conditions to explain the previous passing and failing samples
- cancel or release the responsible scheduled work at its owner; do not remove history, reduce churn or weaken the detector
- keep a deterministic regression that fails before the repair and passes afterwards, then rerun full profile d with census, workload floor, descriptor checks and planted control intact

Before awarding a comprehensive Lifecycle 3, also resolve the already documented baseline shutdown policy below. One flat rerun does not close either ownership question.

## R4: enforce the runtime the verification commands support

Priority: medium; do first when preparing the repair environment. Category: Test seam, 2/3. Carried forward.

The saved [registry fixture](./fixtures/2026-09-09/registry-loader.mts.fixture) still distinguishes the conditions without SSH, Electron or tmux:

| Runtime | Direct registry lookup | Control-plane / CommonJS lookup | Registration function identity |
| --- | --- | --- | --- |
| Node 22.14.0 | succeeds | both fail | different objects |
| Node 24.20.0 | succeeds | both succeed | same object |

The full unchanged deadline probe passed under Node 24.20.0: fallback after 10,001 ms against a 10,000 ms deadline, healthy greeting after 11 ms, timer-removal arm taking the opposite path, and forced-failure cleanup leaving 0 of 3 processes and 0 of 2 directories.

[DEVELOPMENT.md](../../DEVELOPMENT.md), line 31, still says Node 22+. `package.json` has no `engines` constraint. The relevant context, control-plane, deadline-driver and TypeScript-runner source has not changed since the baseline. The ordinary npm checks in this review ran under Node 26.8.2; their success does not repair the Node 22.14.0 path. The actual npm executable was checked, not inferred from the interactive shell banner.

Resolution:

- choose and enforce a tested development/check runtime range, or make the existing loader path work throughout the documented range
- validate the runtime npm actually invokes before expensive probes; provide a clear unsupported-runtime error where appropriate
- retain the small identity fixture, registration readback, healthy control, timer ablation and forced-failure cleanup
- do not change the production deadline timer to compensate for a test driver that cannot share its fixture registry

Closure requires documented, CI and local runtime choices to agree, with the fixture and full deadline probe passing on every supported line tested by the repair. Selecting Node 24 manually for one run is not a repository fix.

## Implement the score-recovery work in this order

These are proposed work packages, not newly queued phase numbers. Each should land with its own failing-before/passing-after evidence.

| Order | Work package | Smallest ownership change | Expected score after closure |
| --- | --- | --- | --- |
| 1 | Make verification runtimes explicit, R4 | Development contract, runner preflight and maintained loader-identity regression | 33/36 |
| 2 | Bind fact results to parsed bytes, R1 | Extractor/worker result identity, publication guard and derived-cache invalidation | 34/36 |
| 3 | Keep completeness with cached facts, R2 | Cache-result metadata and safe migration/backfill | 35/36 |
| 4 | Close terminal retention and baseline shutdown policy, R3 | Scheduling/disposal at the measured owner; explicit accepted-write shutdown contract | 36/36 |

Start the retention investigation alongside the first work package: it is a current resource defect and its controlled reproduction may take longer than the cache fixes. R1 and R2 touch the same cache boundary, so coordinate their schema changes. Separate commits are useful; competing migrations are not.

The totals are conditional on the other categories retaining their evidence. None requires a replacement application framework, new bridge, new parser pool or broad file split.

## Further improvements that do not carry another deduction

### Keep an explicit budget for hidden editor state

Phase 260 deliberately retains a hidden project's Monaco models, undo, view state, rewind journal and baseline. The app probe passed all arms: switching, per-project eviction, preserved undo, cross-project path opening and Cancel keeping the project and tabs.

With ten tabs in each of three projects, four switching blocks measured 27.02, 27.14, 27.18 and 27.23 MB of renderer heap, with 606 nodes and 287 listeners throughout. That is a passing small-file sample, not a bound for many large files.

The ten-tab rule is per project and excludes dirty tabs from eviction; it is not a window-wide memory ceiling. Add mixed-size measurements at increasing project counts before changing this policy. Any clean-model eviction design must preserve dirty contents and explicitly address undo loss. Do not make hiding behave like closing to lower a memory reading.

### Distinguish faster preview painting from bounded final memory

The new markdown path schedules chunks, cancels pending work on effect cleanup and drops cache entries whose text leaves the document. The initial window admits 12 chunks or 128 Ki characters; later batches use 12 or 256 Ki. An indivisible block can exceed those targets.

It eventually renders the whole document. This is staged rendering, not viewport virtualization or a fixed resident-DOM limit. Footnote documents retain the whole-document path. Measure settled heap, DOM and long tasks on large tables, long fences, footnotes and repeated edits before promising a total-memory improvement.

The preview parity gate passed, including 47 ablations. This audit did not remeasure the phase's first-paint speedup or compare large-document latency against the parent.

### Keep the remaining path-opening limits visible

[path-door.ts](../../src/main/fs/path-door.ts) states two limits that the stronger parser does not remove: a relative path can identify the wrong checkout when a subagent works elsewhere, and metadata calls can occupy libuv workers while resolving an unresponsive mount. [path-links.ts](../../src/renderer/terminal/path-links.ts) caps completed hover answers at 2,048 per provider, but its pending-request map has no separate admission cap or provider-owned cancellation.

Consider an ambiguity indicator for relative paths and a bounded pending-classification policy with a delayed-response/disposal test. A Promise timeout does not cancel an already blocked filesystem operation. The external-open adapter rechecks metadata but still hands LaunchServices a path, not an immutable file descriptor; it cannot promise race-free opening or force the user's default PDF application to be Preview.

These are stated limits and inspection findings, not causes established by the terminal heap snapshot.

### Settle the baseline write and cleanup contract

The Phase 243 baseline store still has no quit join for accepted writes. A quit during an outstanding store operation can lose the latest accepted narrowing, not the user's source file. Choose either a bounded shutdown owner or an explicitly accepted best-effort contract, and test the choice.

The two-generation, seven-day and 32 MiB policies do not include every crash-left staging file in their sweep. The rewind journal's text threshold counts UTF-16 code units, and the newest entry can exceed it. The remote Architecture mirror still has per-repository rather than profile-wide limits. Preserve those qualifications when budgeting retained state; do not describe them as strict total-heap or total-disk ceilings.

### Treat semantic grades as evidence location, not truth

The semantic gate's planted-lie battery catches 3 of 7 cases. That is a measured limitation, not a claim that most real answers are wrong. The app probe confirms the face shows citation kind, rate, chance floor, attribution and stale claims. It used a local prompt-reading stub, not a model.

Keep that distinction when extending the feature. A nearby call or declaration cannot prove a sentence's meaning. Expand independent claim-level evaluation before using these grades as release approval, security assurance or automatic permission to modify source. Semantic run history and read-time rates should also retain clear retention and freshness semantics as use grows.

### Split large owners only when their responsibilities separate

Architecture storage and coordination, the editor store and Redline composition grew substantially. Their size alone does not establish sprawl: the import graph is acyclic and domain checks pass. Complete the cache fixes first. Then consider separating fact-cache persistence from semantic-reading persistence behind the existing store facade if their change patterns justify it. Keep migration ordering and transaction ownership in one place.

## Comparison with VS Code

VS Code remains the named reference for runtime separation and resource ownership, not a product feature target. Its [source organisation](https://github.com/microsoft/vscode/wiki/Source-Code-Organization) defines runtime-specific dependencies and deliberate contribution interfaces. Tortie's import gates, one preload and domain entry points continue to meet that kind of boundary.

Its [lifecycle implementation](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/lifecycle.ts) gives collections explicit disposal state and tracks ownership. The useful gap here is pending work outliving a terminal, not whether Tortie uses a class named `DisposableStore`. A resource registration being disposed is not sufficient evidence that every callback retaining it has ended.

Tortie's deliberate differences remain appropriate: durable sessions live outside Electron in its private tmux server, and the app does not host third-party extensions. This review proposes no change to either choice. The cache findings come from Tortie's own executable counterexamples, not an assertion that another editor cannot have similar bugs.

## Checks run at the cutoff

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass: 1,291 production files, 7,207 imports, 0 violations; runtime graph 1,288 files, 4,365 edges, 0 cycles; shared-type checks pass |
| `npm run build` | Pass: eager 1,609,888 raw / 407,284 gzip bytes; headroom 390,112 / 92,716; all 18 lazy surfaces outside eager set |
| Embedded process, isolation and contract gates | Pass: 129 Electron-helper callers against floor 129; 200 check scripts classified; 881 test files scanned; 231 invoke channels match inventory |
| `npm test`, both lanes | Pass: 880 files passed, 1 skipped; 13,911 tests passed, 2 skipped; 35.78 seconds |
| Independent fact-cache fixture | One steady-file control passes; both safety assertions fail at `cb2353c2` and `7a2ca3ff` |
| `conformance:facts` | Pass: eight fixtures, contract-channel recall, 42 ablations caught |
| `conformance:evidence`, `conformance:semantic` | Pass: 20 and 22 ablations caught respectively; semantic planted-lie count remains 3/7 |
| `conformance:reading`, `conformance:arch`, `conformance:arch:modules` | Pass; reading catches 21 ablations |
| `conformance:pathdoors` | Pass; 38 ablations caught |
| `conformance:preview`, `conformance:wideblocks` | Pass; preview catches 47 ablations in 171.4 seconds in this run |
| `conformance:redline`, `conformance:redline-write`, `conformance:save`, `conformance:machines` | Pass; guarded writes: 30 readings, 17 ablations caught |
| T1 restart / T3 reboot-restore | Pass, 6/6 and 3/3; agent resume commands armed but not executed |
| Phase 260 project-tab app probe | Pass, all arms; 30 retained tabs and four switching blocks measured |
| Phase 259 semantic app probe | Pass, 13 readings, 0 findings; local stub, no real agent call |
| P167 split profile d | Fail: heap slope and detached-tree growth; snapshot captured; planted-leak control passes |
| Registry fixture, explicit Node 22.14.0 / 24.20.0 | Fails / passes with distinct / shared registration identity |
| Full deadline probe, explicit Node 24.20.0 | Pass, including timer ablation and forced-failure teardown |

The independent fixtures were added after the clean full-suite run, in disposable checkouts only. Their failures are not included in the 13,911 passing tests. An initial parent comparison reached a newer read API unavailable at Phase 257; the fixture was changed to the common `facts()` reader and both meaningful failures were then reproduced on both commits. That setup error was not counted as evidence.

Initial sandboxed registry attempts could not create tsx's local IPC pipe. Permitted reruns produced the identity results above. That permission error is separate from the Node 22.14.0 failure.

Not rerun: signed packaging/install, live model measurements, real remote-machine drives, all other P167 profiles, long-duration soaks, large-document performance comparisons, full colour conformance and a separate full hermetic-lane invocation. Existing checks are evidence within their scope, not proof of universal correctness.

This was one reviewer using source inspection, fresh app checks and independently written counterexamples. It is not a multi-agent consensus. Re-reading the named exemplar informed the ownership comparison; the report uses plain-language, evidence-first writing without changing the rubric.

## Reproduce the findings without changing a working checkout

Use a disposable checkout of `7a2ca3ff` with its installed dependencies. Copy [fact-identity.test.ts.fixture](./fixtures/2026-09-12/fact-identity.test.ts.fixture) to `src/main/arch/__tests__/audit-0912-fact-identity.test.ts`, then run:

```sh
npm test -- src/main/arch/__tests__/audit-0912-fact-identity.test.ts
```

Expect one passing control and two failed safety assertions until repaired. The test creates only fresh temporary repositories and a scratch database and removes them afterwards. The same file runs at `cb2353c2` to establish Phase 257 attribution.

For retained terminals, after building that disposable checkout:

```sh
P167_PROFILES=d node build/harness-socket.mjs --fresh gmux-audit-0912-split 'node build/probe-p167-scale.mjs'
```

Keep the default three blocks, six cycles, census and planted control. A finding automatically writes a heap snapshot and retaining-path report. A passing sample alone does not erase the failing sample here.

For the runtime comparison, copy the [earlier registry fixture](./fixtures/2026-09-09/registry-loader.mts.fixture) to `build/audit-0909-registry.mts` and run the installed Node binaries explicitly:

```sh
/usr/local/bin/node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.node.json build/audit-0909-registry.mts
/opt/homebrew/opt/node@24/bin/node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.node.json build/audit-0909-registry.mts
```

Those paths identify this machine's measured 22.14.0 and 24.20.0 installations, not portable runtime requirements.

## Safety and handoff

All app drives used scratch profiles, homes and sockets. The deadline probe used its scratch loopback environment. No real model turn was requested, no production implementation was edited and no operator session was attached to or terminated. Probes that reported the live session count read 42 before and 42 after.

The final process census found no audit Electron process. The remaining development Tortie belonged to the main checkout's `electron-vite dev` process, not either review worktree, and was left alone.

The report and its inert fixture are the only new deliverables in the main checkout. The older uncommitted audit remains intact. No commit or push was made.

Local logs and the heap snapshot are under `/private/tmp/tortie-reaudit-20260912.kowBr1/`, including `review/out/p167/report.json` and `heap-d-block2.heapsnapshot`. This directory is temporary and may disappear after reboot. The findings, main readings and deterministic reproduction fixture are preserved in this document and its linked fixture; the implementation work must not depend on temporary logs surviving.
