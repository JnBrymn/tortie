# Architecture after auto save and agent environment settings

Date: 15 September 2026. Review started on 14 September.

Tested commit: `6eb35f737bb779a9d7891254ef29e3c10b042257`, package version `0.105.0`.

Baseline: [12 September assessment, 32/36](./2026-09-12-electron-typescript-architecture-0.103.0.md), tested at `7a2ca3ff314199d40c5e26be85f4f8cd47914d4b`.

## The score remains 32 out of 36, for different reasons

The previous four findings have received targeted repairs. The saved cache counterexamples now pass. The terminal churn test no longer shows the earlier retained-terminal growth. Baseline writes have a shutdown owner. The verification runtime contract now predicts and rejects the loader configurations that caused the earlier registry failure.

The current deductions concern different boundaries:

- State ownership: an acknowledgement for an older save marks newer, unsaved typing as clean.
- Lifecycle: a pending auto-save timer can write after the setting changes to Off or On focus change.
- Failure flow: remote launches silently ignore the new environment setting, and the local settings reader can silently lose an authorised name when untrusted entries fill the cap first.
- Test seam: the full suite encountered a process-test readiness failure that its current fixture cannot distinguish from the teardown behaviour it intends to test.

This is not evidence of broad architectural sprawl. The 44 new commits add nine production TypeScript files and about 1.15% to the production line count. Import boundaries, runtime dependency direction, typed IPC and bundle containment remain intact. The missing points concern ownership across asynchronous transitions and how incomplete operations are explained.

The score is an architectural judgement against the existing rubric, not a quality percentage, security certification or estimate of failure frequency. The new save tests establish unsafe state transitions under controlled interleavings; they do not establish that anyone has lost work in normal use.

## The cutoff includes commits after the 0.105.0 release

The comparison is `7a2ca3ff..6eb35f73`: 44 commits, 174 changed files, 24,202 insertions and 286 deletions across the whole repository. This includes documentation, research, tests and probes.

The 0.105.0 release commit is `3f1d77d8`. Auto save and the environment controls landed afterwards, while `package.json` still reads `0.105.0`. This document assesses those source commits too. It does not claim that a downloaded or signed 0.105.0 application contains them.

Checks ran in a detached checkout of the tested commit, with copied installed dependencies and vendor binaries. The patch applier verified that both xterm patches and the node-pty patch were present. SpecStory reported `2.10.0`. This was not a fresh dependency installation or a signed-package assessment.

The working checkout had an existing `package-lock.json` change adding the root Node engine declaration. It was preserved and excluded from the tested source. The committed package, lockfile and lockfile root agree on version `0.105.0`; the committed lockfile lacks that root engine metadata. The working checkout still pointed at the tested commit at final reconciliation.

Phase 270 is queued, not implemented at this cutoff. No backlog phase, application fix, commit or push was performed by this review.

## The twelve category scores

The rubric is unchanged: 0 means no effective boundary; 1 means repeated exceptions weaken it; 2 means a clear boundary with local exceptions; 3 means an explicit, narrow boundary protected by executable checks.

| Category | 12 September | This review | Reason |
| --- | ---: | ---: | --- |
| Process ownership | 3 | 3 | Shell probes use the existing tracked process-group owner. Deadline teardown and scratch-app cleanup pass. |
| Composition | 3 | 3 | Auto save borrows the existing save operation; no second application root or service framework appears. |
| IPC capability | 3 | 3 | One new names-only settings channel uses the typed bridge. Automatic writes still use the guarded file channel. |
| Domain cohesion | 3 | 3 | Scheduling, save IO, settings, session launch and provider-store reading remain in their established domains. |
| Dependency direction | 3 | 3 | 7,283 imports checked, 0 violations; 4,406 runtime edges, 0 strongly connected components. |
| State ownership | 2 | 2 | Old R1 is repaired. F1 replaces it: save completion does not establish which editor version it may mark clean. |
| Lifecycle | 2 | 2 | Old R3 is repaired at the exercised boundaries. F2 replaces it: scheduled work outlives the policy that authorised its trigger. |
| Type truth | 3 | 3 | Type checks, shared types and contract inventory pass. Worker results now require their parsed-byte identity. |
| Failure flow | 2 | 2 | Old R2 is repaired. F3 replaces it: environment-setting omissions can remain unexplained. |
| Test seam | 2 | 2 | Old R4 is repaired. F4 replaces it: the fork-deadline fixture still depends on startup winning a short wall-clock race. |
| Navigation | 3 | 3 | The small production-file increase follows domain ownership. Existing large files do not justify a deduction by size alone. |
| Build boundary | 3 | 3 | Build passes; eager JavaScript stays under both budgets and all 18 lazy surfaces remain outside it. |
| Total | 32 | 32 | Eight categories at 3, four at 2. |

The unchanged numbers do not mean the repair work achieved nothing. Each old finding is closed separately below. New findings are charged once to their owning category: the auto-save counterexamples are not deducted again under Test seam, IPC capability or Type truth.

## Where the new code came from

Production counts include comments and blank lines. They exclude `__tests__`, test/spec filenames and `src/test`, matching the baseline's method. They include source-side harness modules, so they are not a measurement of code shipped eagerly to users.

| Measure | Baseline | Tested cutoff | Change |
| --- | ---: | ---: | ---: |
| Production TypeScript/TSX files | 1,291 | 1,300 | +9 |
| Production lines | 383,033 | 387,427 | +4,394 |
| Imports checked | 7,207 | 7,283 | +76 |
| Runtime edges | 4,365 | 4,406 | +41 |
| Boundary violations / runtime cycles | 0 / 0 | 0 / 0 | unchanged |
| Invoke channels | 231 | 232 | +1, `settings:envCandidates` |
| Eager JavaScript, raw bytes | 1,609,888 | 1,617,815 | +7,927 |
| Eager JavaScript, gzip bytes | 407,284 | 409,797 | +2,513 |

The largest net production additions are `renderer/editor` (+896 lines), `renderer/settings` (+678), `main/arch` (+458), `main/harness` (+452) and `main/manifest` (+374). Those five areas account for about 65% of the increase. The much larger repository diff is not equivalent to application-runtime growth.

| Landed work | Representative commits | Architectural consequence |
| --- | --- | --- |
| Phase 261: sixth nits round and probe isolation | `ae7f2bf6`, `4f20b715`, `a6f2baa0` | Extends existing fact rules and small UI behaviours. The shared Electron launcher now refuses unsafe socket combinations and checks which socket the app actually announced. |
| Phase 262: supported verification runtimes | `19702c64` | Adds `.nvmrc`, package engines, runner preflight and a measured loader-identity matrix. CI setup reads the same version file. |
| Phase 263: parsed-byte identity | `073de94a` | Carries the extractor's digest through the worker message; guards publication and invalidates affected derived cache rows. |
| Phase 264: cached completeness | `6b3d216e` | Stores completeness beside the content/path cache identity, including complete-empty results, with a separate migration. |
| Phase 265: terminal disposal and baseline shutdown | `0fcbdc55` | Patches the upstream scheduling owners and adds bounded admission/join ownership for accepted baseline writes. |
| Phase 266: OpenCode | `20abba43`, `14279ae9` | Adds a registry row, icon and read-only SQLite session-store adapter. It reuses the existing harvest and recovery contracts. |
| Phase 267: creation in an empty project | `d8142ee5` | Repairs the existing file-tree creation path rather than adding another filesystem owner. |
| Test patience adjustments | `f085123d` | Adjusts integrity, git-graph and harvest-race tests. It does not change the process test that failed in this review. |
| Phase 268: auto save | `e4b5af81` | Adds one per-tab scheduler calling the existing guarded save. It exposes the completion and policy-transition gaps in F1 and F2. |
| Phase 269: agent environment controls | `e00d8b64`, `6c2f91e8` | Adds names-only discovery and sealed per-agent settings over the existing local launch resolver. The later documentation records limits that the initial verdict omitted. |

Release and research commits are not additional runtime owners. The YAML tool dependency re-pin `bf161f4f` is now inside the source cutoff, but this review did not fetch or package that tool.

## The four previous findings have received substantive repairs

### R1 and R2: cache identity and completeness now survive the old attacks

[tree-facts.ts](../../src/main/arch/tree-facts.ts) now checks both the worker's `oid` and the final main-process read against the initial content identity. [extract.ts](../../src/main/symbols/extract.ts), [oid.ts](../../src/main/symbols/oid.ts) and [worker.ts](../../src/main/symbols/worker.ts) carry the identity of the buffer actually parsed. The checks cover declarations and wrapper work as well as calls.

[db.ts](../../src/main/arch/db.ts) adds migrations `013-arch-fact-identity` and `014-arch-fact-scan`. They invalidate the affected derived rows, not source files or the session manifest. `arch_fact_scan`, keyed by `(oid, rel_path)`, holds completeness; unknown completeness causes a reparse rather than a default claim of completeness.

The saved [12 September independent fixture](./fixtures/2026-09-12/fact-identity.test.ts.fixture) passes all three tests unchanged: steady-file control, change-and-revert publication, and cross-repository incomplete-parser reuse. The shipping worker-message, shared-cache migration and completeness tests also pass in the suite. `conformance:facts` passes 56 ablations, each failing when its protected clause is removed.

This closes the old findings. It does not remove the documented `(mtime, size)` freshness limitation: a rewrite preserving both can evade a fresh read. A rule-table change also still needs cache invalidation. Neither limitation was introduced by these repairs.

### R3: terminal retention no longer climbs in the same workload

The installed and built xterm packages include both patches: selection-refresh frame cancellation in xterm, and registration of the cursor-blink disposable in the WebGL renderer. Both the CommonJS and module bundles are covered.

P167 profile d ran the unchanged workload floor: three blocks of six split/close/reattach cycles at full speed. Past Sessions was not trimmed.

| Reading | Block 1 | Block 2 | Block 3 |
| --- | ---: | ---: | ---: |
| Renderer heap after collection, MB reported by probe | 10.5 | 11.7 | 11.5 |
| DOM nodes | 533 | 473 | 473 |
| Detached elements | 68 | 0 | 0 |
| Event listeners | 232 | 234 | 234 |
| Past Sessions | 24 | 48 | 72 |
| Main ptmx / ttys descriptors | 0 / 0 | 0 / 0 | 0 / 0 |

The earlier audit recorded heaps of 11.4, 15.7 and 20.3 MB and detached counts of 140, 980 and 1,820. This run plateaus; its early detached canvases clear. It is evidence for this repair and workload, not a general speed benchmark.

The scheduling ledger's held-frame arm ends with 0 outstanding selection refreshes. Its accounting balances: 1,309 scheduled minus 280 cancelled minus 1,029 served equals 0. The planted detector sees all 1,032 deliberately retained elements and none after release.

One limit matters: the WebGL blink interval did not arm in this harness. Its ownership clause passed by inspecting the shipped bundle; the zero live-timer reading is not a behavioural proof of cancelling an active blink interval. Keep that distinction when upgrading xterm.

[baselines/shutdown.ts](../../src/main/baselines/shutdown.ts) also closes the old quit-policy gap. Admission closes before the first await, accepted writes are tracked, and the ordered disposer joins them with a 500 ms bound and reports a missed join. Its seven tests cover admission, rejection, settlement, a wedged write, repeated join and idle quit. It follows [credentials/lifecycle.ts](../../src/main/credentials/lifecycle.ts), with the intentional difference that it joins baseline writes rather than managing credential child processes. Crash-leftover staging files remain a separate watchlist item.

### R4: the runtime disagreement is now predicted and refused

The runtime gate measures module identity instead of assuming the shell's Node banner is the runtime npm uses:

| Installed Node | Declared supported | Registry identity agrees |
| --- | --- | --- |
| 20.18.3 | no | no, as predicted |
| 22.14.0 | no | no, as predicted |
| 22.23.1 | yes | yes |
| 24.20.0 | yes | yes |
| 26.8.2 | yes | yes |

The full control-deadline probe also passes separately under all three installed supported versions, including registry readback, healthy control, timer ablation and forced-failure cleanup. The latter leaves 0 of its 3 recorded processes and 0 of its 2 directories behind in each run. CI and local setup both name `.nvmrc`; the runner preflight uses the range checked against package engines.

This closes the old unsupported-loader finding. It is not proof for every patch release or future version admitted by the range. Re-derive the matrix when changing Node or tsx.

## F1: bind save completion to the editor version it saved

Priority: high. Category: State ownership, 2/3.

Owner: [tab-io.ts](../../src/renderer/editor/tab-io.ts), especially `saveInProject` around line 1239; [auto-save.ts](../../src/renderer/editor/auto-save.ts), `notePatched`; and the patch/close paths in [store.ts](../../src/renderer/editor/store.ts).

The new [independent auto-save fixture](./fixtures/2026-09-14/auto-save-interleavings.test.ts.fixture) drives the real scheduler and save IO with a deferred bridge acknowledgement and a small editor-model double:

1. The scheduler starts saving `first edit`.
2. Before the acknowledgement returns, the model changes to `first edit plus newer typing`. Another timer is armed.
3. The first save answers `wrote`.
4. `saveInProject` patches `savedContents: 'first edit', dirty: false` without checking the current model.
5. `notePatched` sees the clean transition and cancels the pending timer.

The measured result is a newer model, older saved text, `dirty: false` and 0 pending timers. The steady-buffer control passes. The success patch already exists at the baseline commit; Phase 268 adds background exposure and the cancellation consequence, rather than introducing every part of this race.

The guarded filesystem operation still protects against an external writer. This is a different promise: whether the editor correctly represents its own unsaved work. Source inspection shows `closeTab` prompts only when `dirty` is true, so a falsely clean tab can bypass that protection. Closing a real Monaco tab in this interleaving was not driven here; the fixture proves the state error, not an observed user data-loss incident.

Resolution:

- capture the model instance/version and tab lifetime with the text being saved
- update the saved baseline on a successful write, but derive dirty state from the current model; an old acknowledgement must not clear a newer edit
- keep or queue the latest pending save when a save is already in flight, including when the second timer fires before the first acknowledgement
- use the same completion rule for explicit save, automatic save and overwrite; inspect the plain and remote success arms for the same unconditional clean patch
- prevent a close/reopen of the same path from receiving a previous tab lifetime's completion

Closure requires the saved counterexample to pass, plus tests for explicit-save overlap, second-timer expiry during a held write, close/reopen and unchanged-buffer success. In a scratch app, hold an acknowledgement, type again, and verify that the newer text remains dirty, eventually saves when permitted, and still prompts on close while unsaved. Keep the existing concurrent-external-writer probe green.

## F2: stop pending saves when their trigger policy changes

Priority: medium. Category: Lifecycle, 2/3.

Owner: [auto-save.ts](../../src/renderer/editor/auto-save.ts), `arm`, `run` and `noteBlur`, plus the live settings connection in [store.ts](../../src/renderer/editor/store.ts).

`arm` checks the mode when creating a timer. `run` checks dialogs, eligibility and in-flight work, but does not re-read the mode. No settings-change hook cancels pending timers. The store's comment that policy is read on every tick is therefore wider than the code.

The independent fixture arms a delay, changes the live policy before any save starts, then fires the timer. Both Off and On focus change still produce one guarded-write call and a clean tab. This is not cancellation of a write already submitted to main: the setting changes before the write begins.

Resolution:

- make pending timers revocable on policy changes and recheck the trigger's current permission immediately before submitting a save
- distinguish delay-triggered work from blur-triggered work, so switching to On focus change does not preserve an old delay
- define how a delay change reschedules pending work, and what happens when a dialog blocks a due timer
- retain cancellation on close, eviction, stopped saves and disposal
- state the limit honestly: changing to Off need not interrupt an atomic write already submitted, but must stop a timer that has not submitted one

Closure requires both policy-transition counterexamples to pass. Add a real-app check that types with a long delay, changes the mode before the deadline and confirms that disk stays unchanged. Also check repeated mode changes, tab close and delay changes without changing the single guarded-write owner.

## F3: explain environment settings that cannot take effect

Priority: medium. Category: Failure flow, 2/3. Two omissions must close for this point.

### Remote launches do not consume the setting

[create-local.ts](../../src/main/sessions/create-local.ts) returns from its remote branch around line 283, before `envPassthroughFor` around line 476. [remote-sessions.ts](../../src/main/machines/remote-sessions.ts) has no corresponding passthrough reader. The [Launch defaults card](../../src/renderer/settings/LaunchDefaultsSection.tsx) is per agent, not per machine, so the same setting appears applicable without a remote limitation being reported at launch.

This is source-confirmed and already recorded in [BACKLOG.md](../BACKLOG.md), Phases 269 and 270. This review did not launch an agent on a real remote machine. The passing local environment probe cannot establish remote coverage.

Phase 270 is the existing implementation brief. It must resolve names using the remote machine's shell. Do not send local secret values in SSH arguments or widen [remote-env.ts](../../src/main/machines/remote-env.ts)'s two-name transport allowlist. An explicit, actionable unsupported/unresolved notice would close the silent-failure aspect before full support lands; full parity needs the remote implementation.

### The name cap can hide which authorised setting disappeared

[sanitizeEnvPassthrough](../../src/shared/settings.ts), around line 887, caps accepted names in file order before [withSealedDangerState](../../src/main/settings/store.ts) filters them by the authenticated selection.

The new [independent metadata-only fixture](./fixtures/2026-09-14/env-cap-disclosure.test.ts.fixture) composes those shipping functions. An authorised name survives the control. Prepending 16 valid-looking but untrusted names removes the authorised seventeenth name during sanitisation; the seal rejects the 16 others. The result contains no names, and the rejection list does not name the lost authorised setting.

This fails closed: the fixture proves no additional name was authorised, and resolves no values. It reproduces the denial/reporting limitation recorded in Phase 269, not a secret leak or an encryption bypass.

Resolution and closure:

- make a remote selection either work on that machine or produce a visible, actionable limitation; test create and restore, not just the settings card
- preserve authorised entries against untrusted cap consumption, or report explicitly that the selected name was discarded; do not remove input bounds or let unsealed names through
- make the cap-disclosure fixture pass and retain the ordinary-name control
- for Phase 270, test differing local/remote sentinel values, missing and rotated remote values, refused names and transport secrecy, using no real provider credential in the probe

The restore trust boundary is separate: [restore.ts](../../src/main/restore/restore.ts), around line 962, still trusts `rec.envPassthrough` from the manifest, as it already trusts the recorded argv. The settings seal does not authenticate manifest recipes. This predates Phase 269. Keep that limitation explicit; decide recipe authentication as a separate durability/security design, not as an incidental settings fix.

## F4: make the fork-deadline test distinguish readiness from teardown

Priority: medium. Category: Test seam, 2/3.

The full suite reports 898 files passing, 1 failing and 1 skipped: 14,123 tests passing, 1 failing and 2 skipped, in 53.42 seconds. The failure is [guarded.test.ts](../../src/main/proc/__tests__/guarded.test.ts), `kills the FORK too, not just the direct child`.

The fixture starts a shell that should fork a sleeper and write `fork.pid`, with a 300 ms deadline. It awaits the guarded operation before looking for that readiness file. In this run the deadline result arrived but the file did not; the assertion ended with `ENOENT`, before it could test whether the fork survived. The same file's nine tests pass when isolated alongside the three old cache fixtures.

This is consistent with fixture startup not reaching its marker before the short deadline under concurrent load. The exact operating-system scheduling cause was not traced, and this failure does not prove that the production process owner leaked a child. What is established is a verification gap: the fixture can fail before reaching its subject and report a missing file instead of distinguishing startup failure from teardown failure.

The file and production owner are unchanged since the baseline. Commit `f085123d` improves three other machine-bound tests, not this one. This is a newly observed exception, not an attributed regression from auto save or environment settings.

Resolution:

- separate bounded fixture readiness from the deadline/kill assertion; retain PID ownership and cleanup even when readiness never arrives
- use a controlled deadline clock or equivalent fixture seam to make the fork exist before testing its disposal, without delaying the production deadline until a child cooperates
- retain a separate real-time integration check with useful diagnostics for spawn error, deadline outcome and missing readiness
- prove that removing descendant cleanup fails the test after readiness, while an intentionally slow-starting fixture gets a distinct readiness result

Closure requires the corrected isolated test, its cleanup ablation and the ordinary full suite to pass. Do not close this finding by repeatedly rerunning until green, deleting the assertion or widening production timeouts.

## Resolve the missing points in this order

These are audit work packages, not newly assigned backlog phase numbers. Point recovery requires all closure conditions in the corresponding finding, not just the listed edit.

| Order | Work package | Main owners | Score after closure, if other findings stay unchanged |
| --- | --- | --- | ---: |
| 1 | F1: preserve newer typing when an older save completes | Editor save IO, model/tab identity, completion patch | 33/36 |
| 2 | F2: revoke pending saves on policy changes | Auto-save controller and settings connection | 34/36 |
| 3 | F3: explain environment omissions | Phase 270 remote launch/restore work, settings sanitisation and rejection reporting | 35/36 |
| 4 | F4: separate process-test readiness from its assertion | Guarded-child test fixture and controlled deadline seam | 36/36 |

F1 and F2 share the scheduler/save boundary and should have coordinated ownership. F4 can run independently and should be made reliable early in the implementation workflow. No item requires changing the durable tmux process model, replacing the renderer store, adding a second write channel or splitting large files to meet a line limit.

## What ran, and what the results establish

| Check | Result and scope |
| --- | --- |
| Typecheck and production build | Pass, including import/runtime graph, shared-type, containment, teardown, hermetic-runner and contract checks. |
| Full test suite | One readiness failure as detailed in F4. Audit fixtures were added to the detached checkout afterwards and are not included in that count. |
| Saved 12 September fixture and isolated guarded-child file | 12/12 pass: 3 cache cases and 9 process cases. |
| New independent fixtures | 2 controls pass; 4 safety/disclosure assertions fail: two policy modes, newer typing during save, and name-cap disclosure. Inert copies are linked above. |
| Runtime matrix and full deadline probes | Matrix predicts all 5 installed runtimes; full probes pass on Node 22.23.1, 24.20.0 and 26.8.2. |
| `conformance:agents`, `installs`, `context`, `credentials`, `derived`, `machines` | Pass. Credentials includes its hostile cases and 60 failing ablations without real keychain payloads. |
| `conformance:arch`, `reading`, `facts`, `evidence`, `semantic`, `arch:modules` | Pass. Respectively retain the existing contract checks and the 21, 56, 20 and 22 ablations in reading, facts, evidence and semantic. |
| `conformance:redline`, `redline-write`, `save`, `pathdoors` | Pass. Guarded-write gate: 30 readings and 17 failing ablations. The path gate first hit sandbox IPC `EPERM`; the approved unsandboxed run passed. |
| `ablation:p268` | All 5 planted breaks fail their intended rules; source is restored afterwards. These checks do not cover F1 or F2. |
| P167 profile d and scheduling ledger | Pass at the full 3×6 workload, with census, descriptor checks and planted detector intact. Blink-owner limitation is stated above. |
| P268 real-app auto-save probe | All arms pass, including keeping the concurrent writer's actual 180 bytes, one stop notice, explicit conflict choice, skip list, blur and menu behaviour. Its header's historical 173-byte example is not this run's payload size. |
| P269 real-app environment probe | Pass: fake-agent sentinel arrives locally, rotates on the next launch, stays out of settings/manifest/logs/server globals, and hand-edited unsealed settings are rejected. Session-specific tmux environment is intentionally where the value lives. |
| T1 create/restart smoke | Pass, including 6/6 restart assertions. |
| Resume conformance, capture-only | 7 pass, 0 fail, 0 blocked, 6 skip. OpenCode 1.18.31 skips the first-turn capture assertion; no conversation-resume claim is made for it here. |

All app probes used scratch profiles and sockets. The probes that counted the operator's `gmux` sessions read 40 before and 40 after. The final process census found no surviving audit Electron instance; the remaining bare `Tortie` process belonged to the existing main-worktree `electron-vite dev` parent and was left alone.

No model prompts were sent. No real remote-machine environment, full conversation roundtrip, signed release, fresh install, long-duration soak or new general performance benchmark was exercised. The P167 surface profiles were not rerun. Ordinary npm checks ran under Node 26.8.2; the deadline matrix is explicitly wider.

## Keep these limits separate from score-recovery work

- Editor retention remains intentionally broader than the visible strip: hidden project tabs keep models and undo state. Auto-saved, touched tabs are now protected from clean-tab eviction too. Measure aggregate resident state before adding a cap that could discard work.
- Markdown is staged rendering, not full DOM virtualisation. The eager bundle has 382,185 raw bytes and 90,203 gzip bytes of headroom; neither number is a startup-time measurement.
- OpenCode's new adapter uses the existing read-only/WAL-sidecar guard, closes its database handle in `finally` and queries session metadata rather than credential tables. Its synchronous reader and 200-row window merit larger-store measurements; full first-turn capture and restore remain outside this review.
- Baseline crash-staging cleanup, aggregate remote-mirror limits, metadata reads on unresponsive mounts and the Architecture freshness/semantic-evidence limitations remain from the prior audit. The new baseline quit owner does not solve every storage-budget question.
- The restored manifest is a trusted execution recipe, not covered by the settings seal. Do not describe the local settings attack probe as proof against arbitrary manifest modification or as operating-system isolation between same-user agents.

## The comparison uses concrete ownership rules from VS Code

The external benchmark is VS Code's [source-code organisation](https://github.com/microsoft/vscode/wiki/Source-Code-Organization), [disposable ownership](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/lifecycle.ts) and [text-file save model](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/textfile/common/textFileEditorModel.ts), inspected for this review.

| Extracted rule | Tortie's current position |
| --- | --- |
| Separate runtime environments and keep feature internals behind deliberate interfaces | Import and runtime graph checks remain green after the new features. |
| Tie scheduled/disposable work to an owner | The xterm and baseline repairs apply this well. Pending auto-save policy transitions still need the same treatment. |
| Serialise saves and clear dirty state only for the version acknowledged | VS Code's save model checks version identity in `handleSaveSuccess`. Tortie's unconditional clean patch is the concrete comparison behind F1. |

The intended difference remains Tortie's product: durable named agent sessions, private tmux ownership and multiple projects in one window. The recommendation is to adopt these small ownership rules, not VS Code's extension host, service framework or full IDE scope. The local sibling comparisons likewise favour existing guarded-save, credential-shutdown and read-only harvest owners over new infrastructure.

This was a single-reviewer assessment using fresh execution and independent hostile fixtures, not an independent multi-agent consensus. The fixtures preserve the failing sequences for the next agent; they are documentation assets and do not silently add failing tests to the normal suite.
