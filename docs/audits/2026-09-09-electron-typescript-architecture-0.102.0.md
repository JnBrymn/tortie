# Architecture after the overnight repairs and Redline changes

Date: 9 September 2026

Tested commit: `2bc14f028d7e47e3c1b0dc35dc0a37d1299f1a9d`, package version `0.101.0`.

Release-tip comparison: `f8ba072b19c0b4f515a0de3c08ec5ea5dffcc93d`, package version `0.102.0`.

## The architecture score is 34 out of 36

The overnight repairs hold. This review found no new production architecture sprawl. State ownership and Failure flow keep their recovered points.

Two categories score 2: Lifecycle and Test seam. The other 10 score 3.

The [post-Phase-244 assessment](./2026-09-09-electron-typescript-architecture-0.101.0-after-phase-244.md) recorded 35/36, with an explicit reservation about the deadline probe. That probe failed again here. This time, a small reproduction separates the failing and passing conditions: the same static-import driver gets different registry instances under Node 22.14.0, but not under the tested newer runtimes.

This is one point below that assessment and 2 above the [8 September audit](./2026-09-08-electron-typescript-architecture-0.101.0.md). It is not evidence that the overnight changes made the app worse. It is a correction to the confidence placed in a verification path whose relevant source has not changed.

The score is an ordinal assessment of architecture boundaries and their executable protection. It is not a percentage of product quality, a security certification or a release gate.

## Which source the measurements describe

The review started at `2bc14f02` in a clean checkout. Tests and probes ran in a detached worktree with cloned dependencies and vendored tools, not dependency symlinks. The existing SpecStory binary reported `2.10.0`.

The 0.102.0 version bump and a changelog correction landed during testing. A tree comparison against `f8ba072b` found identical `src`, `build`, `resources` and `patches` trees. Both package files also compare identically after removing their root version fields. No dependency or check command changed.

The architecture assessment therefore covers the same implementation as that release tip. The bundle sizes and app probes below were measured before the version bump. This review did not rebuild or verify the signed 0.102.0 release artifact.

The main comparison is `bbb49471..2bc14f02`: 12 commits since the last audit's execution commit. The older `163266d6` still resolves locally but is not an ancestor of this history. Its source totals below are direct tree measurements, not a commit count across the rewritten history.

## The twelve category scores

| Category | 8 September | Post Phase 244 | This review | Evidence and remaining limit |
| --- | ---: | ---: | ---: | --- |
| Process ownership | 3 | 3 | 3 | Process-launch and cleanup gates pass. Scratch app and server probes finish through their existing owners. |
| Composition | 3 | 3 | 3 | No new application root, preload or parallel service framework. |
| IPC capability | 3 | 3 | 3 | Contract inventory matches its baseline. No channel changes since the last assessment. |
| Domain cohesion | 3 | 3 | 3 | The new paragraph alignment stays in the existing document composer. Mirror checksums and baseline persistence retain their own owners. |
| Dependency direction | 3 | 3 | 3 | 6,941 imports, no boundary violations; 4,221 runtime edges, no strongly connected components. |
| State ownership | 2 | 3 | 3 | Tab removal clears its rewind journal. Remote mirror freshness remains content-based. Their maintained regressions pass. |
| Lifecycle | 2 | 2 | 2 | The current split workload passes, but the earlier retained-terminal reproduction still has no tested repair or controlled explanation. |
| Type truth | 3 | 3 | 3 | Typecheck and shared-type assertions pass. Partial-source state has an explicit representation through storage and the map result. |
| Failure flow | 2 | 3 | 3 | Both scan paths retain source incompleteness without scheduling an impossible rescan. Guarded-write refusals remain intact. |
| Test seam | 2 | 3 | 2 | Full tests pass, but the standalone deadline probe fails on a runtime admitted by the documented Node 22+ requirement. |
| Navigation | 3 | 3 | 3 | Only one production module changed after the last audit. Added probes do not introduce another product implementation. |
| Build boundary | 3 | 3 | 3 | Production build and containment gates pass. Eager bytes remain within both budgets; all 18 lazy surfaces stay outside the eager set. |
| Total | 32 | 35 | 34 | Ten categories at 3, two at 2. |

## Growth remains concentrated in existing responsibilities

Production counts include comments and blank lines. They exclude `__tests__`, test and spec filenames, and `src/test`.

| Measure | 8 September source | Post Phase 244 source | Tested source |
| --- | ---: | ---: | ---: |
| Production TypeScript and TSX files | 1,217 | 1,237 | 1,237 |
| Production lines | 356,217 | 363,125 | 363,341 |
| Imports checked | 6,847 | 6,941 | 6,941 |
| Runtime dependency edges | 4,164 | 4,221 | 4,221 |
| Boundary violations | 0 | 0 | 0 |
| Runtime strongly connected components | 0 | 0 | 0 |
| Invoke channels | 226 | 228 | 228 |
| Eager renderer JavaScript, raw bytes | 1,559,817 | 1,573,263 | 1,573,263 |
| Eager renderer JavaScript, gzip bytes | 394,006 | 397,524 | 397,514 |

The three production line totals were re-derived from their Git trees. Earlier graph and bundle readings are the earlier audits' measurements, not fresh builds of those commits. The 10-byte gzip difference is not a measured speed improvement.

Since the last assessment, production grew by 216 lines, about 0.06%, in [redline-document.ts](../../src/renderer/editor/redline-document.ts). Its diff is 220 additions and 4 deletions, including substantial explanatory comments. The other source change is its 211-line test file. Across all paths, the comparison has 3,860 additions and 8 deletions in 22 files, largely tests, measurement tools and documentation.

Compared with 8 September, the production tree has 7,124 more lines, about 2%, and 20 more files. These totals do not establish runtime cost.

### Which phases account for the changes

| Phase | Responsibility | Position in this assessment |
| --- | --- | --- |
| 238 and 239 | Accept changes into the baseline and refine Redline controls | Already present in the post-Phase-244 assessment. Not new sprawl in this comparison. |
| [240](../research/100-phase-240-guarded-save.md) | Guard saves against another writer and offer a comparison | Retains the existing guarded channel. Save conformance passes again. |
| [241](../research/101-phase-241-editor-menu.md) | Editor context actions and text reshaping | Already included in the previous execution tree. |
| [242](../research/103-phase-242-the-rehearsal.md), [242.1](../research/104-phase-242-1-starting-measurements.md) and [242.2](../research/105-phase-242-2-starting-measurements.md) | Rehearse remote writes and close linked-path escapes | Already included. Current machine conformance passes, including its local shell fixtures. No real remote machine was contacted by this review. |
| [243](../research/106-phase-243-durable-baseline.md) | Persist a baseline through the existing durability machinery | Adds a justified main-process domain and 2 typed channels. See the resource and shutdown limits below. |
| [244](../research/108-phase-244-audit-findings.md) | Repair the audit findings and improve retention measurement | Four production findings stay repaired. The deadline history now has a runtime-sensitive reproduction. |
| [245](../research/107-phase-245-clickable-paths.md) | Research clickable transcript paths | Research only at the tested commit. Do not count it as an implemented runtime feature. |
| [246](../research/110-phase-246-the-block-that-gave-up.md) | Improve paragraph pairing in the existing Redline composer | The only production change since `bbb49471`. No new process, bridge, store or dependency. |

Phase 246 changes how a line-diff tie is resolved, not which file-writing service the editor uses. It preserves the old and new text projections and the line-edit cost. It does add another text pass; unchanged eager bytes do not mean that this computation is free.

An independent [generated-document fixture](./fixtures/2026-09-09/redline-properties.mts.fixture) exercised 2,000 document pairs, including CRLF, missing final newlines, repeated text and Unicode. It reached 1,000 slides, checked 4,396 change identities and compared 16,000 selected-change results with a backwards-splice oracle. All passed. The shipping conformance check separately reports all 6 slide ablations failing as intended.

This supports keeping Domain cohesion and State ownership at 3. It does not prove that every paragraph pairing is the most readable possible choice.

## The previous production repairs still hold

| Finding | Current status | Current implementation and evidence |
| --- | --- | --- |
| F1 inherited rewind journal | Remains closed | `c043c2b5`. [store.ts](../../src/renderer/editor/store.ts) calls `forgetRewindJournal` at preview replacement, eviction and forced close. The original fixture and both Phase-244 regression files remain in the passing suite. |
| F2 stale remote mirror | Remains closed | `c8a836bb`. [remote-arch.ts](../../src/main/machines/remote-arch.ts) compares content checksums rather than trusting the clock. The original mirror fixture, parity cases and checksum tests remain in the passing suite. |
| F3 lost source incompleteness | Remains closed on both paths | `69a14370`. [check-coordinator.ts](../../src/main/arch/check-coordinator.ts) calls `markScanPartial` on both paths. [db.ts](../../src/main/arch/db.ts) retains the reason and the map displays it. Architecture checks pass. |
| F4 read budget enforced after EOF | Remains closed | `7a051e65`, strengthened by `02cd67cb`. The reader stops at the cap plus a one-byte sentinel. Guarded-write conformance passes 30 readings and catches all 17 ablations. |
| F5 host-dependent Trash assertion | Remains repaired | `cfe80620`. The install test asserts its own scratch Trash. The build scanner checks 847 test files and catches its forbidden-home fixtures. The full suite passes. |
| F5 deadline registration | Reproduced and narrowed | Static imports split registry identity on Node 22.14.0. Details below. |
| F6 split-session retention | Still open | Fresh workload passes. Earlier retaining-path evidence remains unexplained and unrepaired. Details below. |

These are current-history repair hashes. Some hashes printed in the previous assessment belong to its earlier repair history. This review checks the resulting source and regressions; it does not rerun every repair's original parent measurement or real-machine drive.

## Test seam loses its conditional point

### The deadline driver can load two registry instances

`npm run probe:controldeadline` exited 1 with 10 reported failures. The first 3 are the decisive ones: the control plane cannot read back `hang`, `healthy` or `exiter`. No connection opens, so the later timeout complaints are consequences of failed setup, not proof of a broken timer.

The path is narrow:

1. [probe-control-deadline.mjs](../../build/probe-control-deadline.mjs) generates an `.mts` driver with static imports of the control plane and context module.
2. The driver calls `registerRemoteMachineContext` and `setMachineRemotePath` from its imported context.
3. [control-plane.ts](../../src/main/machines/control-plane.ts) calls `machineContext` through its own `./context` import.
4. In the failing runtime, that lookup reaches a different registry instance and refuses the machine as unregistered.

The [small registry fixture](./fixtures/2026-09-09/registry-loader.mts.fixture) starts no SSH connection, Electron or tmux server. It registers one context in memory, then compares direct, control-plane and CommonJS readback. On the failing runtime, direct readback succeeds, the other two fail, and the registration functions are different objects.

| Runtime | Static-import fixture | Registration function identity | Full deadline probe |
| --- | --- | --- | --- |
| Node 22.14.0 | Direct lookup succeeds; control plane and CommonJS lookup fail | Different | Fails before reaching the intended connection |
| Node 22.23.1 | All 3 lookups succeed | Same | Not rerun under this runtime |
| Node 24.20.0 | All 3 lookups succeed | Same | Passes, including registration, timer ablation and forced-failure cleanup |

A separate dynamic-import control passed on Node 22.14.0 and Node 24.20.0. The failing and passing fixtures use the same cloned dependencies and shipping source. This rules out SSH authentication, the renderer, missing vendored tools and dependency symlinks as necessary causes of this reproduction.

The measured diagnosis is a runtime-sensitive module-identity split in the standalone loader path. This review has not identified the exact upstream Node or tsx change that separates the versions. It also does not establish that every earlier reported mismatch had this cause.

### The command runtime matters more than the shell banner

[DEVELOPMENT.md](../../DEVELOPMENT.md) currently admits Node 22+. In this execution, `node -v` answered 22.23.1, but npm reported `npm_node_execpath=/usr/local/bin/node`, which is 22.14.0. Checking the interactive Node version alone would have missed the failing path.

The context module, control plane, deadline driver, TypeScript runner and package files are unchanged between the previous assessment's execution commit and this review's tested commit. This is not a regression introduced by Phase 246.

Under Node 24.20.0, the unchanged full probe read back every registration, fell back after 10,001 ms, and greeted its healthy control after 10 ms. Its timer-removal arm opened a connection but did not fall back. Forced-failure cleanup left 0 of its 3 held processes and 0 of its 2 directories.

The previous audit explicitly said this point should come off if the mismatch returned. It returned on a documented supported runtime. Choosing a passing runtime for this review is useful diagnosis, but does not fix the repository's verification contract.

## Lifecycle still needs a controlled retention explanation

The fresh P167 split profile ran 3 blocks of 6 cycles at full speed, on the built renderer and a scratch socket.

| Reading | Block 1 | Block 2 | Block 3 |
| --- | ---: | ---: | ---: |
| Renderer heap after collection, MB as reported by the probe | 10.4 | 10.1 | 10.1 |
| DOM nodes | 453 | 453 | 453 |
| Detached elements | 0 | 0 | 0 |
| Discarded sessions in Past Sessions | 24 | 48 | 72 |
| Main ptmx descriptors | 0 | 0 | 0 |
| Main ttys descriptors | 0 | 0 | 0 |

Listeners remained at 231 after each block. The planted-leak control saw all 1,032 elements and none after release. The workload and the detector both operated.

That is a passing sample, not a repair. [Research 109](../research/109-phase-244-split-retention.md) previously captured 599 detached elements, with disposed terminals retained through pending animation-frame callbacks. That figure is historical, not today's measurement.

No terminal, session, tmux or dependency source changed after the post-Phase-244 execution commit. There is still no maintained regression for the retaining mechanism and no controlled explanation that reproduces both conditions. Lifecycle therefore stays at 2.

Start at [TerminalPane.tsx](../../src/renderer/terminal/TerminalPane.tsx), its WebGL and terminal disposal, and xterm's render scheduling. Instrument pending frame IDs and their scheduling stacks in the harness. Do not delete Past Sessions or weaken the churn workload to make the graph flatter.

## Resource limits that the score does not remove

Two statements in the previous assessment need qualification when carried forward:

- shadow baselines are no longer only in memory: Phase 243 writes them through [the baseline store](../../src/main/baselines/store.ts), though drawing still reads the tab's in-memory state
- the journal's `JOURNAL_MAX_BYTES` is actually a count of UTF-16 code units in `del` and `ins`, not a measured byte allocation; the newest entry is deliberately retained even when it exceeds that threshold

The current limits are:

| Resource | What the implementation promises | What remains outside that promise |
| --- | --- | --- |
| Rewind journal | At most 200 entries per tab; trims older text past 1,048,576 code units; clears when the tab leaves | The newest entry can exceed the text threshold. Do not describe this as a strict 1 MiB heap cap. |
| Durable baseline | Two generations, a 7-day age policy and a 32 MiB directory policy | Pending writes have no quit join. A close during a write can lose the newly accepted narrowing, not the source file. Crash-left staged files are outside the directory sweep until their key is written again. |
| Remote Architecture mirror | 20,000 files and 64 MiB of planned content per repository; 3 transfer pages in flight | No profile-wide eviction policy. Missing checksums cause repeated transfers. Content checks now read remote files during freshness checks. |
| Guarded writes | Reads stop at 5,242,880 bytes plus one overflow sentinel; replacements retain existing refusal checks | The operation remains synchronous. Atomic replacement is not a filesystem compare-and-swap. |

[Phase 243's measurements](../research/106-phase-243-durable-baseline.md) reported 20 to 50 ms for a baseline store operation and a 23.5 ms worst main-loop gap on the large backlog document. Those are earlier measurements, not timings rerun here. They should remain visible when changing baseline persistence.

These limits do not warrant another point deducted from a category already at 2. They do warrant precise documentation and explicit ownership decisions before anyone claims all resource work is finished.

## What it would take to reach 36

1. Make the verification runtime contract executable. Choose and document a tested runtime range, or repair the loader setup across the existing range. Check the runtime npm actually invokes. Keep the saved registry fixture as a fast preflight and retain all deadline probe arms. A merely different shell PATH is not a repository fix.
2. Close split retention with evidence. Capture scheduling and disposal around the retained animation frames. Produce a regression that fails before the repair and passes afterwards, or a controlled explanation that produces both the old failure and the passing condition. Rerun the full split workload with its census and planted leak intact.
3. Resolve the baseline shutdown policy explicitly before claiming comprehensive lifecycle ownership. Either document the pending-write loss as the accepted contract with executable protection, or give accepted writes a safe shutdown owner. Do not silently promote a baseline into a backup promise.
4. Reassess the same twelve categories at one pinned commit. Raise Test seam only when the chosen supported runtime contract and full hostile probe agree. Raise Lifecycle only when its retention closure condition is met. Do not change historical scores in place.

The first two are the immediate score blockers. The third is a related lifecycle policy decision, not evidence of another newly reproduced data-loss bug. No broad file split, framework replacement or dependency-injection migration is required by this review.

## Comparison with VS Code

VS Code remains the external reference for runtime separation and resource ownership, not a feature target. Its [source organisation](https://github.com/microsoft/vscode/wiki/Source-Code-Organization) separates runtime environments and exposes contribution interfaces instead of encouraging imports into another contribution's internals. Tortie's process boundaries and domain entry points remain consistent with that pattern.

Its [lifecycle implementation](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/lifecycle.ts) records disposable ownership and detects registration after disposal. The useful comparison is explicit end-of-life behaviour, not the name of a class.

| Observed reference pattern | Tortie's remaining difference | Action |
| --- | --- | --- |
| Runtime-specific code has a defined environment | One supported standalone test runtime does not share registry identity between its loader paths | Make the test runtime and module-loading contract explicit and checked |
| Resources belong to an owner with an observable disposal state | A historical split run retained disposed terminals through scheduled frames | Diagnose and test the scheduling and disposal boundary |
| Domain internals stay behind deliberate interfaces | Recent Redline work stays in its existing composer and write boundaries | Preserve that structure; no reorganisation is justified by the current diff |

Tortie should remain different: durable user sessions live outside Electron in its private tmux server, and the app refuses a third-party extension host. Neither finding calls for removing those choices.

## Checks run for this assessment

| Check | Result at `2bc14f02` |
| --- | --- |
| `npm run typecheck` | Pass; 1,237 production files, 6,941 imports, 0 violations; 1,235 runtime graph files, 4,221 edges, 0 cycles |
| `npm run build` | Pass; eager renderer 1,573,263 raw bytes and 397,514 gzip bytes; headroom 426,737 and 102,486 bytes |
| Build cleanup and isolation gates | Pass; 110 Electron-helper users against a floor of 110; 43 runner callers against a floor of 43; 847 test files scanned |
| Contract inventory | Pass, byte for byte; 228 invoke channels |
| `npm test` | 846 files passed, 1 skipped; 13,311 tests passed, 2 skipped, 0 failed; 34.31 seconds |
| `conformance:redline` | Pass, including durable baselines and all 6 new slide ablations |
| `conformance:redline-write` | Pass; 30 readings, 17 ablations caught |
| `conformance:save`, `conformance:machines` | Both pass |
| `conformance:arch`, `conformance:arch:modules`, `conformance:reading` | All pass; reading catches all 19 ablations |
| Independent Redline fixture | Pass; 2,000 document pairs, 1,000 slides, 16,000 selected-change comparisons |
| T1 restart acceptance | Pass, 6 of 6 verification steps |
| T3 reboot-restore acceptance | Pass, 3 of 3 verification steps; resume commands armed but not executed |
| P167 split profile d | Pass, 3 blocks of 6 cycles; no detached elements after any block |
| Deadline probe through npm, Node 22.14.0 | Fail; fixture registry mismatch prevents the intended connection |
| Same deadline probe, Node 24.20.0 | Pass, including hostile and teardown arms |
| Minimal static registry fixture | Fails on 22.14.0; passes on 22.23.1 and 24.20.0 |

The first sandboxed Redline conformance attempts could not create tsx's local IPC pipe. Their permitted reruns passed. That sandbox refusal is separate from the deadline mismatch, which occurred outside the sandbox and reproduced without a network connection.

The full suite ran with both lanes. A separate full `test:hermetic` invocation and the earlier real-Trash denial experiment were not repeated. Credential conformance, all other P167 profiles, long-duration soaks, real remote-machine drives, signed packaging and release installation were not rerun.

This was one reviewer using source inspection, fresh checks and independent counterexamples. It is not a multi-agent consensus or a new end-to-end security assessment.

## Reproduce the independent checks

Use a disposable checkout of `2bc14f02` with the existing dependencies and vendored tools. Copy the two fixtures into the locations below, dropping `.fixture`:

| Saved fixture | Temporary location |
| --- | --- |
| [registry-loader.mts.fixture](./fixtures/2026-09-09/registry-loader.mts.fixture) | `build/audit-0909-registry.mts` |
| [redline-properties.mts.fixture](./fixtures/2026-09-09/redline-properties.mts.fixture) | `build/audit-0909-redline.mts` |

Run each installed Node binary explicitly, rather than assuming the shell and npm use the same one:

```sh
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.node.json build/audit-0909-registry.mts
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.web.json build/audit-0909-redline.mts
```

The registry fixture prints its runtime and executable path. On the failing runtime, expect a successful direct lookup, failed control-plane and CommonJS lookups, different registration functions and exit 1. A loader error before those readings is not this reproduction.

The app probes used the already-built checkout, avoiding a rebuild before every launch:

```sh
node build/harness-socket.mjs --fresh gmux-audit-0909-t1 'npm run smoke:create && npm run smoke:verify'
node build/harness-socket.mjs --fresh gmux-audit-0909-t3 'GMUX_SMOKE=t3-prep electron . --user-data-dir="$GMUX_HARNESS_DIR" -ApplePersistenceIgnoreState YES && GMUX_SMOKE=t3-verify electron . --user-data-dir="$GMUX_HARNESS_DIR" -ApplePersistenceIgnoreState YES'
P167_PROFILES=d node build/harness-socket.mjs --fresh gmux-audit-0909-split 'node build/probe-p167-scale.mjs'
```

For the full deadline comparison, invoke `node build/probe-control-deadline.mjs` with the chosen binary. This review used `/usr/local/bin/node` for 22.14.0 and `/opt/homebrew/opt/node@24/bin/node` for 24.20.0. Do not remove its readback, healthy control, timer-removal arm or forced-failure cleanup.

## Safety and handoff

All app launches used scratch profiles and sockets. The deadline runs each read 21 operator sessions before and 21 after without attaching to them. The final process census contained no audit Electron process; one additional crash handler belonged to Screen Studio, not this work. Both app harnesses and the split harness reported their scratch servers ended.

No production code, live credential, privacy setting or operator session was changed by this review. No vendor agent turn ran. The only additions in the main checkout are this assessment and its two inert fixtures. No commit or push was made.

The local evidence directory is `/private/tmp/tortie-reaudit-20260909.IhBBmb/`, including command logs and `review/out/p167/report.json`. It is temporary and may disappear after reboot. The important readings and reproduction fixtures are preserved here; the next implementation agent should not depend on that temporary path.
