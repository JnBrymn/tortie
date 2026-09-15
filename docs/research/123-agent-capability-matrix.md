# Research 123 — the agent capability matrix

Read on 2026-09-14 at `df273525`, in the scratch worktree `/private/tmp/wt-p271`. Every line number
below is from that tree. The published side was read at `/Users/gdc/tortiedotsh/src/data/docs.ts`,
read only.

## 0. What this document is

Phase 271 asked one question. For each agent Tortie supports, which capabilities does it actually
have, and do the three places that describe those capabilities agree with each other? Six
investigators each measured one capability across every agent. This document reconciles them.

It exists so that a later round does not re-derive the matrix, and so that the published table on
tortie.sh can be rewritten from measurements rather than from memory.

### The evidence boundary

This document measures two things. It reads code paths in this tree, and it reads the output of
gates and probes that were run here. It also runs one read-only capability probe of the bundled
SpecStory binary, and one pure probe over the registry.

It drove no agent. It spent no token. It ran no turn. It opened no pane, launched no Electron, and
started nothing on the operator's `-L gmux` tmux socket. Two investigators ran
`conformance:resume:capture`, which starts real agent processes on its own scratch socket and plants
no turn; that is the only place a real agent binary executed, and it is reported as their evidence
rather than repeated here.

Because of that boundary, one limit applies to every row of the resume column and is stated once:
this document proves that a resume command line is armed and recorded, not that the conversation
comes back. Section 6 says what would close that.

Where each column's evidence came from, said plainly so an auditor can retrace it. The launch, id
capture, resume, cwd and restore columns come from the two investigator reports that reached the
integrator in full, including their gate output and their own re-derivations. The activity,
attachments, SpecStory capture and Catch Me Up columns were measured by the integrator directly in
this tree: a pure probe that imported `AGENT_REGISTRY` and printed every declared capability field
for all 15 rows, a read of the consumers of each of those fields, a read of
`src/main/overview/keep-map.json` and `src/main/overview/fold/recipes.ts`, and one read-only
`--version` and `run --help` of the vendored SpecStory binary. Where that direct measurement contradicts what an investigator
reported, section 3.5 records both rather than picking one.

A fix round ran after two independent verifications and rewrote parts of this document. It re-derived
the keep map's status tally with a JSON walk, re-read every `registry.ts` citation here against the
line it names, re-measured the vendored SpecStory binary from an empty scratch directory, and read
the gate scripts and the unit suite to find out what actually holds the registry. What it changed:
the Attachments column of section 2.2 is rebuilt from the field the drop path reads and four cells
moved, the keep map tally in section 2.3 is corrected, sections 3.20 to 3.22 are new, and four
citations were wrong and are fixed. What it refuted is recorded in section 6.

## 1. The three sides

There are three descriptions of what each agent can do, and they are maintained separately.

Side 1 is the published table. `src/data/docs.ts:1258-1272` in the tortie.sh repository holds one
sentence per agent under the heading "Launchable agents". This is what a person reads before they
install anything. The lead at `docs.ts:1252` says Tortie launches 13 coding-agent CLIs, which is
correct.

Side 2 is the registry. `src/main/agents/registry.ts` holds 15 rows, 13 of them launchable, each
with declared fields for launch, resume, id capture, activity, SpecStory capture, image drop,
multiline key, install and version probe. Many fields carry a `verified` value and a dated note.

Side 3 is the code. It is what the create path, the restore path, the activity monitor, the drop
router, the capture layer and the overview service actually do when a session is made.

The refusal that shapes the whole document: the registry's `verified:` fields are a claim, not
evidence. A `verified: 'verified'` is a sentence somebody wrote next to a measurement they made on a
particular day against a particular version. It is useful and it is often right, but it is on side 2
and it is scored against side 3 like anything else. Two of the disagreements in section 3 are a
`verified` or `confidence` field that the code contradicts, and one is a note that was true against
the SpecStory 2.8.0 it names and is false against the 2.10.0 the tree now vendors.

### The four verdicts

- works. The code path exists, it is exercised, and something ran or was derived that shows it
  producing the right answer.
- partial. The capability exists but is weaker than the column's best form, and the weakness is
  named in the per-agent notes.
- absent. There is no code path. Nothing is broken; the capability is not there.
- unmeasured. A code path exists and nothing in this tree has ever exercised it for this agent.

### What is out of scope, named rather than scored

`cursoride` (Cursor IDE, `registry.ts:1639-1672`) and `copilotide` (VS Code Copilot, `:1673-1711`)
are `kind: 'ide'`, `launchable: false`, `launch: null`. They are capture-only observers. Both
launch-side and resume-side investigators called the real composers for them and got the same throw:
`Agent 'cursoride' is capture-only and cannot be launched in a pane.` They carry no activity,
SpecStory, image-drop or multiline field at all. They are named here and appear in no table row.
tortie.sh accounts for them in prose at `docs.ts:1273` rather than as table rows, which is the right
shape.

The name mapping between the two published lists is clean, 13 to 13, in the same order, byte exact
on all 13 display names. `CodeWhale` is the registry id `deepseek`, and `registry.ts:876-880` says
why the id must not be renamed.

## 2. The matrix

### 2.1 Launch, id capture, resume, restore

| Agent | Launch | Id capture | Resume | cwd on resume | Restore |
| --- | --- | --- | --- | --- | --- |
| Claude Code | works | works | works | none | works |
| Cursor CLI | works | works | works | none | works |
| Codex CLI | works | partial | partial | none | works |
| Gemini CLI | works | works | works | none | works |
| Factory Droid CLI | unmeasured | absent | absent | n/a | absent |
| CodeWhale | works | partial | partial | none | works |
| Antigravity CLI | works | partial | partial | none | works |
| Muse Code | works | works | works | none | works |
| Qwen Code | works | works | works | required | works |
| Pi | works | works | works | required | works |
| Oh My Pi | works | partial | partial | none | works |
| Grok | works | works | works | none | works |
| opencode | works | partial | partial | none | works |

One caution about the Restore column before the cwd one. Restore is almost entirely agent-agnostic:
`src/main/restore/restore.ts` branches on the agent in exactly two places, being `originalCwdRule` at
`:876` and the cosmetic `agentDisplayName` at `:396`. The preflight, the `projectPath` fallback at
`:902-906` and the spawn are common to every row. So the twelve works verdicts in that column are one
reading of one shared path, not twelve measurements, and the only per-agent content in it is the cwd
guard beside it. Read them that way.

The cwd column is here because the operator's own published table draws that distinction, and it is
the column that holds the published table's one wrong fact, which is opencode's (section 3.1). The
published qwen and pi sentences are right. Exactly two of thirteen agents require the original
folder: qwen and pi. The resume investigator re-derived this by calling the shipping functions —
`buildLaunchSpec` then `buildRecoveryContract` then `parseAgentContract` then `originalCwdRule` —
for every launchable id, and got `requiresOriginalCwd` true for qwen and pi and false for the other
eleven. `src/main/restore/restore.ts:876-900` is the enforcement: when the original folder is gone
and a resume is armed and the rule says the folder is needed, restore returns a failed preflight
that says so, rather than restoring into `projectPath` and opening an empty session that looks
resumed.

### 2.2 Activity, attachments, capture, Catch Me Up

| Agent | Activity | Attachments | SpecStory capture | Catch Me Up |
| --- | --- | --- | --- | --- |
| Claude Code | works | works | works | works |
| Cursor CLI | partial | partial | works | works |
| Codex CLI | works | works | works | works |
| Gemini CLI | partial | unmeasured | works | partial |
| Factory Droid CLI | unmeasured | unmeasured | unmeasured | absent |
| CodeWhale | partial | partial | works | partial |
| Antigravity CLI | partial | partial | works | partial |
| Muse Code | partial | works | works | partial |
| Qwen Code | partial | works | absent | partial |
| Pi | partial | partial | absent | works |
| Oh My Pi | partial | works | absent | works |
| Grok | partial | partial | absent | works |
| opencode | partial | works | absent | absent |

What each column's verdicts mean, because three of the four had no definition in the first draft of
this document and the Attachments column was scored from the wrong field.

Activity works means the agent publishes its own state and Tortie reads it. Only two do. Activity
partial means the tiered monitor still produces a status for the session from tmux formats, the
process subtree and the screen, but no agent-native channel exists. No agent has no status at all.

Attachments is scored from `imageDrop.strategy`, which is the field the drop path reads
(`src/renderer/terminal/drop/target.ts:95`, `router.ts:273`, `pipeline.ts:117` and `:134`), plus
`insert` at `insert.ts:151`. works means `paste-path` and somebody watched the path become an
attachment: the drop overlay promises "Drop to attach" (`target.ts:95-99`) and the agent keeps that
promise. partial means a reference reaches the prompt and never becomes an attachment — either
`path-text`, or `clipboard-attach`, where a ⌘V of real image data does attach but a drag-and-drop
degrades to path text and a toast that says so (`pipeline.ts:134-139`). unmeasured means the code
path exists and nobody has exercised it for this agent. Gemini is the one row where that is a risk
rather than a gap: it is `paste-path`, so the overlay promises an attachment, and the registry note
at `registry.ts:798-804` says the value was inferred from upstream source and never observed. The
first draft scored this column from `imageDrop.verified` instead, which is section 3.22.

SpecStory capture works means `captureSupportFor` returns supported for this agent against the
binary the tree vendors. absent means it returns `no-provider-for-agent`. Section 3.4 has the
mechanism.

Catch Me Up works means the agent's transcript can be read and folded. partial means it can be read
and not folded. absent means neither. Section 2.3 splits the two halves, which is where the verdict
comes from.

### 2.3 Catch Me Up has two halves, and they cover different agents

Catch Me Up reads an agent's transcript, then folds it into a written summary. The two halves are
separate tables in the code and they do not cover the same agents.

| Agent | Reads the transcript | Folds it into a summary |
| --- | --- | --- |
| Claude Code | yes | yes |
| Cursor CLI | yes | yes |
| Codex CLI | yes | yes |
| Gemini CLI | yes, with loss | no |
| Factory Droid CLI | no store | no |
| CodeWhale | yes | no |
| Antigravity CLI | yes | no |
| Muse Code | yes | no |
| Qwen Code | yes | no |
| Pi | yes | yes |
| Oh My Pi | yes | yes |
| Grok | yes | yes |
| opencode | no | no |

The reading half is gated by `PATH_ARITHMETIC_PROVIDERS` at
`src/main/overview/reader/resolve.ts:52-64`, an eleven-id set. `resolve.ts:104` answers `no-store`
for droid by name, and `:105` answers `unsupported` for anything outside the set, which today means
opencode alone. The per-provider rules are data in `src/main/overview/keep-map.json`, which holds 14
blocks with a `status` each: twelve `mapped`, one `mapped-with-loss` which is `gemini` alone
(`keep-map.json:1573`), and one `absent` which is `droid` (`:2148`).

The loss notes are a different field from the status, and there are three of them, not two. `honest`
is where the map records what it cannot recover, and a provider can carry one while its `status`
still reads `mapped`. Gemini's, at `:1694`, reads: "The current store records an answer in 1 of 216
files on this machine. The ask is recoverable, the answer usually is not." CodeWhale's, at `:1844`,
reads: "No per message timestamp exists. Only metadata.created_at and metadata.updated_at, so only
the session, not each turn, can carry a clock." Droid's, at `:2151`, reads: "This agent keeps no
record on this Mac that Tortie can read."

That is why CodeWhale reads yes in the table above and gemini reads yes, with loss. CodeWhale's
status is `mapped`: its transcript is read whole, and the loss is a clock rather than content, so a
summary of it cannot say when each turn happened. Gemini's status is the map's own `mapped-with-loss`
and the loss is the answer itself. Neither field is read by any code: `status` and `honest` are
declared in the shape at `src/main/overview/reader/map-types.ts:217` and `:237`, the engine reads
neither, and `conformance:overview` checks only that each provider carries a `version`
(`build/conformance-overview.mjs:444-448`). They are documentation, and this document scores them as
the map's own reporting rather than as behaviour.

The keep map also holds `cursoride` and `copilotide` blocks. Neither id is in
`PATH_ARITHMETIC_PROVIDERS`, and `resolveSessionLog` at `resolve.ts:99` is the only entry the
service uses (`src/main/overview/service.ts:216`), so those two blocks are not reachable through the
session overview. They are out of scope anyway, so this is noted and not scored.

The folding half is `RECIPES` at `src/main/overview/fold/recipes.ts:489-496`: six rows, being
claude, codex, cursor, grok, pi and omp. `foldRecipeFor` at `:620` reads that array and nothing
else. The seven agents with no recipe are named in a test —
`src/main/overview/fold/__tests__/recipes.test.ts:132-143`. Six of them have a written reason at
`recipes.ts:499-536`, one failed measurement each; the seventh, opencode, is named absent in the
test's own comment at `recipes.test.ts:133-135` because this phase measured no recipe for it. Gemini
is not signed in on this Mac. Qwen has no flag that turns its tools off, declared 55 tools under
`--safe-mode`, and sent 28,157 input tokens for a one-sentence question.

## 3. The disagreements

This is the product of the phase. There are 22 places where the three sides do not agree. Most are a
cell of the matrix; four are a registry field that no code reads, and one is a field two call sites
read to answer a question it was never about. They are ordered by how much a person would be misled,
except for 3.20 to 3.22, which the fix round added at the end rather than renumbering the references
section 5 makes to the ones above.

### 3.1 opencode, resume — the published sentence names the wrong half of the mechanism

- tortie.sh (`docs.ts:1271`): "safe resume depends on the project directory."
- Registry (`registry.ts:1586-1588`): `requiresOriginalCwd` omitted, with a comment saying resume is
  `--session <id>` and the id is globally unique in the one database, so the conversation is found
  regardless of cwd.
- Code: agrees with the registry. The resume investigator re-derived the contract and got
  `contract.requiresOriginalCwd=false row->false/row noContract->false/registry`. Restore does not
  refuse when the original folder is gone; it falls back to `projectPath` at `restore.ts:902-906`
  and arms `opencode --session <id>`.

Side 1 is wrong. What does depend on the directory for opencode is the id capture, not the resume:
the harvest key is `cwd-newest` with declared confidence `weak`, so two opencode panes in one folder
are separated only by time.

### 3.2 claude, resume — the registry's own later rows contradict its claim

- Registry (`registry.ts:542`): "Resume works from a DIFFERENT cwd (id lookup is global) — claude is
  the only agent with no cwd constraint."
- Code: eleven of the thirteen launchable agents are cwd-free. Only qwen (`registry.ts:1184`) and pi
  (`:1266`) set `requiresOriginalCwd: true`. The restore module's own comment at `restore.ts:864`
  already names two agents and not one: "fine for the agents whose lookup is global (claude, muse)".
- Registry, elsewhere in the same file: omp sets the field explicitly false at `:1351`, grok's
  comment at `:1468-1471` says it was measured false twice, and opencode's at `:1586-1588` says the
  id is globally unique.

Side 2 is wrong, in prose, against its own field values. The sentence was true when claude was the
only measured row and was never revisited.

### 3.3 Catch Me Up — no registry field exists, and the published set is too small

- tortie.sh asserts Catch Me Up on four agents: Claude Code (`:1259`), Codex CLI (`:1261`), Oh My Pi
  (`:1269`) and Grok (`:1270`).
- Registry: there is no field of any kind for it. `AgentRegistryEntry` (`registry.ts:378-480`) has
  launch, resume, activity, specstory, imageDrop, multilineKey, install, versionProbe,
  reconstructionTarget and nothing else. The column is unfalsifiable from side 2.
- Code: eleven agents can be read, six can be folded (section 2.3).

Side 1 is wrong, and it is wrong in an interesting way. The published four are a subset of the fold
six; the two it misses are Cursor CLI and Pi, both of which have a full recipe at
`recipes.ts:269` and `:392`. And eleven agents get the reading half, which the published table never
mentions at all. Only opencode gets nothing, and only droid has nothing to read.

### 3.4 SpecStory capture — three agents are published without the caveat they need

- tortie.sh names two agents as having no capture provider: Grok (`:1270`) and opencode (`:1271`).
- Registry: five launchable rows have no usable provider. `qwen` (`:1141-1213`), `pi` (`:1214-1300`)
  and `omp` (`:1301-1384`) carry no `specstory` field at all; `grok` carries none with a comment at
  `:1507` saying the bundled CLI has no grok provider; `opencode` carries an explicit
  `{ provider: null }` arm at `:1629-1633`.
- Code: `providerIdFor` at `src/main/specstory/capture.ts:336-344` decides it. A row with a
  `specstory` field uses that field's provider. A row without one falls back to
  `probed.has(entry.id) ? entry.id : null`, so the agent's own id must appear in the binary's
  provider list. I asked the vendored binary directly. `specstory run --help` lists ten providers:
  antigravity, claude, codex, copilotide, cursor, cursoride, deepseek, droid, gemini and muse. None
  of qwen, pi, omp or grok is there, so all four resolve to `no-provider-for-agent`.

Side 1 is incomplete. Qwen Code, Pi and Oh My Pi are published with no mention that capture is off
for them.

### 3.5 muse, SpecStory capture — the registry note is stale and the code now says yes

This is the one place where an investigator and I disagree, and the disagreement is recorded rather
than resolved by picking a side.

- The claim-side investigator reported that muse's capture toggle is dark, quoting
  `registry.ts:1126`: "NO RELEASED CLI HAS THIS PROVIDER: measured 2026-08-11 against the bundled
  2.8.0, `specstory run muse` answers 'Provider muse is not a valid provider implementation' and
  exits 1, and `run --help` lists nine providers without it."
- I measured the binary this tree vendors. `build/vendor/specstory/bin/specstory.json` reads
  `"version": "2.10.0"`, the binary agrees (`2.10.0 (SpecStory)`), and `run --help` lists ten
  providers including `muse (Muse Code)`.
- Code: `catalog.ids.has('muse')` is true against 2.10.0, and that is what decides it.
  `captureSupportFor` (`capture.ts:350-379`) returns supported. `verified: 'unverified'` does not
  gate support; it only makes `confidence` read `'new'` instead of `'measured'` at
  `capture.ts:375-378`.

The registry row is not the load-bearing half, and the first draft of this document said it was.
Muse's row declares `provider: 'muse'`, which is its own id, so `providerIdFor` returns the same
`'muse'` the no-row fallback at `capture.ts:343` would have returned from the probe. Delete the row
and muse capture stays on. Section 3.20 is that finding in full.

So on this commit, with this vendored binary, muse capture is on. The registry note was accurate
against the 2.8.0 it names and is stale now. One real consequence survives: `verifiedProviders()` at
`capture.ts:168-178` is the fail-safe set used when the provider probe fails
(`capture.ts:243-249`), and it takes only rows whose `verified` is `'verified'`, so muse is absent
from the fallback. If the probe ever fails, muse capture falls dark while claude's stays lit.

The same staleness affects eleven other lines. `registry.ts` names "bundled 2.8.0" at lines 145, 168,
553, 622, 716, 793, 854, 879, 966, 1049 and 1632. The exit-code fidelity values on every capture row
were measured against 2.8.0 and have not been re-measured against 2.10.0.

### 3.6 droid — the registry's confidence field disagrees with the registry's own note

- tortie.sh (`:1263`): "Early. Launch exists; resume capture remains unverified."
- Registry: `status: 'shipped-main'` and `confidence: 'high'` at `registry.ts:812-813`, the same two
  values claude and codex carry, beside `unverified: true` at `:872` and a note at `:873-875`
  reading "Every field is upstream documentation. `command -v droid` fails here … so nothing below
  has been exercised."
- Code: `command -v droid` returns nothing on this machine, and droid's `extraProbeDirs` is empty,
  so a create throws `AGENT_NOT_FOUND` at `src/main/sessions/create-local.ts:344-348` before a row
  is written or a pane spawned. `idCapture.mode` is `'unverified'`, which `manifest/agents.ts:797-799`
  maps to `'unsupported'` and `sessions/launch-plan.ts:86-87` reports as `'unavailable'`. (`:84-85`
  is the arm above it, `store-harvest` to `'capturing'`.) There is no
  harvest descriptor. Independently, droid is the only one of the thirteen with an empty flag
  catalogue: `AGENT_FLAG_PRESETS['droid'].presets.length === 0` measured from
  `src/main/agents/flags.ts:125`, against 1 to 8 presets with a `helpVerifiedVersion` on every other
  row.

Side 1 is the honest one. Side 2's `confidence` field is the wrong side. Whatever `confidence` means
on this row, it is not a measure of evidence.

### 3.7 Cursor CLI — the published sentence understates the code in the column it does not mention

- tortie.sh (`:1260`): "Launchable terminal agent. Some attachment behavior is inferred."
- Registry: a pre-assign-cmd resume through `cursor-agent create-chat`, re-verified 2026-08-11
  (`:601`, `:607`), and a SpecStory provider with `exitCodeFidelity: 'exact'`, `verified: 'verified'`
  (`:617-623`). Neither is published.
- Code: measured live by the resume investigator. `cursor PASS pre-assign-cmd create-chat
  d477d6cf-dacf-4b4e-831e-e1c2fa1cbfd4`, armed at spawn, 5.2 s, against cursor-agent
  2026.09.02-c22c1a3.

Side 1 understates. Cursor has the second-earliest arming shape in the whole set and the published
sentence says nothing about resume or capture.

### 3.8 Cursor CLI — "inferred" is applied to the row with less evidence, not more

- tortie.sh (`:1260`) says some attachment behaviour is inferred.
- Registry, cursor (`:638-644`): `imageDrop` `verified: false`, with the note "Blocked at the sign-in
  gate during research 16; the CLI docs mention no attachment support. Path text is the safe
  default."
- Registry, gemini (`:798-804`): `imageDrop` `verified: false`, with the note "INFERRED from upstream
  clipboardUtils.ts/parsePastedPaths() and from qwen (its fork) behaving exactly as that source
  predicts."

Side 1 uses the word on the wrong row. Cursor was blocked, so Tortie chose the safe default. Gemini
is the genuinely inferred one, and its published sentence (`:1262`) says nothing about attachments.

### 3.9 CodeWhale, Muse Code and Antigravity CLI — published as bare rows, measured as strong ones

- tortie.sh: CodeWhale "Launchable terminal agent." (`:1264`), Muse Code "Launchable terminal
  agent." (`:1266`), Antigravity CLI "Development status; support depth is still being measured."
  (`:1265`).
- Registry and code both say more than that. CodeWhale has a verified resume, a verified SpecStory
  provider (`:961-967`) and verified image drop (`:975-981`). Antigravity has a verified resume, the
  `fd-owner` identity harvest key (`:1020-1031`), verified capture (`:1044-1050`), verified image
  drop (`:1059-1065`) and a verified multiline key (`:1053`). Muse has the strongest harvest in the
  whole set: key `tmux-pane`, available at session open, measured end to end at 261 ms (`:1114`),
  and it landed before the first turn in the live run — `muse PASS harvest tmux-pane/exact … resume
  argv /Users/gdc/.local/bin/muse resume 01a0a358-9557-7eb0-9666-a747edf175ba --yolo`, 4.3 s.

Side 1 understates all three. Antigravity's "still being measured" is the furthest from the code.

### 3.10 Gemini CLI — the caveat is true and it singles out the wrong row

- tortie.sh (`:1262`): "Launch and resume machinery exist; full resume round-trip remains unproven."
- Code: the id capture is proven live. Gemini 0.54.0 accepted `--session-id <uuid>` in a real pane,
  and the harness fails the launch stage on "unknown option" or "unrecognized argument" text
  (`src/main/conformance/cases.ts:260-273`, applied at `src/main/conformance/resume.ts:408-413`).
  The row was armed before any turn: `gemini PASS pre-assign --session-id
  415ba9d2-46d2-4fb3-84f9-68174aa9bc28`, armed at spawn, 9.9 s.

The conversation reload is unproven for gemini. It is equally unproven by this work for claude,
cursor, pi, grok, muse and qwen, all of which the published table states without a caveat. Side 1 is
not false; it is uneven. Section 6 says what would make the caveat unnecessary for all of them at
once.

### 3.11 codex, id capture — the registry and the harvest descriptor disagree, and both reach the manifest

- Registry (`registry.ts:694`): `idCapture` confidence `'exact'` for key `cwd-newest`.
- Descriptor (`src/main/manifest/harvest/stores.ts:524-532`): `'weak'`, lowered in Phase 215 with the
  comment "Was exact… A row that named an unresumable sub agent thread reached the manifest as
  keyConfidence: exact".
- Code: both values reach the manifest at different moments. `buildLaunchSpec` copies the registry
  value into `spec.harvestConfidence` (`src/main/manifest/agents.ts:795`) and `launchProvenance`
  writes it as `keyConfidence` while the row is still capturing (`:650-656`). `harvestProvenance`
  overwrites it with the descriptor value once the harvest lands (`:673-694`). So a capturing codex
  row reads `exact` and the same row reads `weak` a moment later.
  `src/main/agents/__tests__/registry.test.ts:463` pins the stale value.

Side 2 is internally inconsistent. The descriptor is the side the manifest ends up with.

### 3.12 omp, id capture — the descriptor's comment and the descriptor's value disagree

- Descriptor comment (`stores.ts:934-935`): "the key stays cwd-newest and the claim is held at
  matched-strength. The registry row carries confidence weak."
- Descriptor value (`stores.ts:937-939`): `confidence: 'exact'`.
- Registry (`registry.ts:1349`): `weak`, as the comment says.
- Code: `deriveResumeConfidence` (`manifest/agents.ts:337-357`) returns `exact` when the key rating is
  `exact`, the record did not ride the grace timer and rivals is 1. `cwd-newest` is not in
  `IDENTITY_HARVEST_KEYS` (`src/main/manifest/harvest/claim-strength.ts:60-61`, which holds
  `tmux-pane`, `pid` and `fd-owner`).

This is not cosmetic. A lone omp record in a folder is recorded as an exact claim on the strength of
the folder alone, while codex, CodeWhale and opencode with the identical key can never record better
than weak.

### 3.13 activity.tier is declared on every row and read by nothing

- Registry: every launchable row declares `activity.tier`, one of `native`, `process` or `screen`,
  plus a `verified` value. Claude is `native` at `:547`, codex `native` at `:710`, and the other
  eleven are `process` or `screen`.
- Code: the activity module never reads `tier`, and nothing else in `src/` reads it either. The
  module reads the profile in six places and every one of them is `native` or `animatesWhenIdle`:
  `state-machine.ts:196`, `:226`, `:293`, `:610`, `monitor.ts:605` and `monitor.ts:270`. The last is
  easy to miss because it is spelled `activityProfileFor(agent).native` rather than `profile.native`,
  and the first draft of this document counted five for that reason. The tier ladder is decided by
  the monitor's own cost rules, not by the declared tier. Every session gets T1 tmux formats every
  tick; T2 and T3 are spent only on ambiguous sessions (`monitor.ts:11-21`).

Side 2 declares a field side 3 does not consult. The field is documentation, and the document should
say so rather than a reader assuming a `screen` row is treated differently from a `process` one.

The `hooks: 'claude-settings'` field on claude's row (`:547`) is the same shape. The hook settings
are written from a hard-coded `input.agent === 'claude'` test at `create-local.ts:495-510`, not from
the field.

### 3.14 flagPresets is declared and never populated

- Registry: `flagPresets?: AgentFlagPreset[]` at `registry.ts:449`. Its own comment is the single
  line `:448` and promises nothing. The promise is on the type it names, at `registry.ts:302-304`:
  "BACKLOG Phase-10 item 8 populates these after inspecting each installed CLI's --help; the type
  ships now so the data append is additive." (`:443-445` is the tail of the `unverified` field's
  comment, which the first draft of this document cited by mistake.)
- Code: `flagPresets` appears at exactly one line in the file, its own declaration. My pure registry
  probe read the field on all 15 rows and found it undefined on every one. The real per-agent flag
  data lives in `src/main/agents/flags.ts`, a different module, with 1 to 8 presets per agent and a
  `helpVerifiedVersion` on each.

Side 2 declares a capability slot side 2 never fills. Nothing reads the VALUE, so nothing is broken;
it is a trap for the next reader. The field's NAME does have one consumer, and a reader greping for
it will land there first: `REFUSED_ROW_FIELDS` in `src/shared/agent-overlay.ts:584-589` refuses
`flagPresets` from a configuration file, because a preset can turn an agent's safeguards off. That
refusal is about the overlay's key set rather than about the registry row, and
`src/main/config/__tests__/overlay.test.ts:204` pins it, so deleting the registry field means
deciding what happens to that refusal too.

### 3.15 The IDE refusal fires from a different guard than the registry claims

- Registry (`registry.ts:1737-1740`): `getLaunchableEntry` exists "so a cursoride/copilotide launch
  attempt fails loudly at the source".
- Code: on the local create path, binary resolution runs first.
  `create-local.ts:328-348` calls `binaryCandidatesOf` and `tmux.resolveBinary` before
  `buildLaunchSpec` is reached at `:451`, and `binaryCandidatesOf`
  (`sessions/launch-plan.ts:148-155`) falls back to `[agentId]` because `launchableAgentEntry`
  returns null for a non-launchable row (`src/main/config/store.ts:142`). The person sees "Tortie
  looked for a program named cursoride on your login shell's PATH… It found nothing." The
  capture-only sentence never renders on that path.

Both sentences are refusals, so nothing unsafe happens. Side 2's claim about which guard speaks is
wrong.

### 3.16 grok and opencode lose the bare-name protection on some machines, and neither side says so

- Neither side records it. `~/.grok/bin` (`registry.ts:1398`) and `~/.opencode/bin` (`:1527`) are in
  their rows' `extraProbeDirs` and are not among the eight directories in `extraBinDirsFor`
  (`src/main/tmux/resolve.ts:150-165`).
- Code: `create-local.ts:418-422` resolves the bare name a second time without `probeDirs` and hands
  the answer to `bareNameFor` (`launch-plan.ts:237-243`), which returns undefined unless that answer
  equals the absolute path. On a machine whose login shell does not carry those two directories,
  grok and opencode panes spawn with an absolute `argv[0]` and lose the Phase 12.7 F3 protection
  that keeps `pkill -f "$(command -v claude)"` from matching every durable agent, while every other
  agent keeps it.

On this machine both directories are on PATH, so the bare name is used. It is behaviour rather than
a defect in this tree, and it is undocumented on both sides.

### 3.17 A cursor create can stall for fifteen seconds, and neither side says so

- Neither side records it.
- Code: cursor is the only id whose create runs a subprocess before the pane exists.
  `src/main/manifest/agents.ts:814-846` spawns `cursor-agent create-chat` through `runGuarded` with
  `PRE_ASSIGN_CMD_TIMEOUT_MS = 15_000` (`agents.ts:856`). Every failure arm returns the unmodified
  launch spec (`:837`, `:841`), so launch is never blocked, but a signed-out or offline
  `cursor-agent` can make a create take up to fifteen seconds longer than any other agent's before a
  pane appears.

### 3.18 CodeWhale is the only agent whose extra flags must lead, and neither side says so

- Neither side records it in user-facing terms.
- Code: `conformance:agents` prints the argument order as data. CodeWhale's row reads `deepseek
  compiled store-harvest flag-uuid yes yes yes leading` and every other row reads `trailing`. The
  resume argv is `deepseek --skip-onboarding resume <id>` and not `deepseek resume <id>
  --skip-onboarding`, which would die with "unexpected argument" and leave a dead pane.

It is the only agent-specific argv-order rule in the product and its failure mode is a dead pane.

### 3.19 The registry counts itself wrong in two places

- `registry.ts:4` says "All 13 agents Tortie has mechanics for" and the section banner at `:498`
  says "The 13 entries", over an array of 15 declared at `:501`.
- `src/shared/types.ts:945` says "all 15 entries", which is right.
- `docs.ts:1252` says Tortie launches 13 coding-agent CLIs, which is right for launchable rows.

Cosmetic, and it is how a later reader counting from the banner gets the wrong number.

### 3.20 A specstory row's provider value selects nothing, and the comment that explains why names an exception that does not exist

- Registry: eight rows declare `specstory.provider`, at `registry.ts:549`, `:618`, `:712`, `:789`,
  `:850`, `:962`, `:1045` and `:1122`. Every one of the eight is a string equal to its own row's id.
- Code: `providerIdFor` (`capture.ts:336-344`) returns the declared provider when the field exists
  and `probed.has(entry.id) ? entry.id : null` when it does not. Because declared equals id on all
  eight, the declared VALUE can never pick a provider the fallback would not have picked. Only the
  field's PRESENCE changes an answer, and it does so in three narrower ways: the explicit
  `{ provider: null }` arm turns capture off where the fallback would turn it on (opencode alone),
  `verified` decides `confidence` and the fail-safe set (section 3.21), and the row is the only
  carrier of `exitCodeFidelity`.
- The comment that justifies the fallback is wrong. `capture.ts:326-328` reads "Every agent in the
  registry already agrees with specstory on its id except `antigravity`↔`agy`, which has an explicit
  row anyway." I asked the 2.10.0 binary: the provider id is `antigravity`, and `agy` is not in the
  list. `agy` is antigravity's BINARY name, which is a different thing and is what
  `create-local.ts:324` warns about. There is no id mismatch left anywhere in the set.

Nothing is broken. It matters because the comment is the reason a reader trusts the fallback, and a
reader checking the one exception it names will not find it.

### 3.21 The specstory `verified` field answers a question it was not written to answer

- Registry: `verified: 'verified' | 'unverified'` is declared at `registry.ts:197` with the comment
  at `:196`: "'verified' = the fidelity above was measured, not read off source." It is a statement
  about exit codes and nothing else.
- Code, first reader: `captureSupportFor` (`capture.ts:375-378`) turns it into `confidence`, and the
  contract at `capture.ts:292-298` scopes that to exit-code behaviour too. This reader is consistent
  with the field.
- Code, second reader: `verifiedProviders()` (`capture.ts:168-178`) builds the fail-safe provider set
  from the same field, and that set is what capture falls back to when the provider probe fails
  (`capture.ts:246-249`). It is answering "does the binary have this provider", which the field never
  claimed to know.

Both consequences are live and they point opposite ways. Muse has a provider in the vendored 2.10.0
and is excluded from the fail-safe set, so a failed probe puts muse capture out while claude's stays
lit — section 3.5 records that half. Droid is included in the set on a row whose own `unverified:
true` sits at `registry.ts:872` and whose note at `:873-875` says nothing below it has been
exercised. Droid's `verified: 'verified'` is defensible on its own terms, because its note at
`:853-854`
says the measurement was of the wrapper rather than of droid, which is exactly what the field means.
The defect is the second reader, not the value.

### 3.22 imageDrop.verified is declared and read by nothing, and this document scored a column from it

- Registry: every `imageDrop` block carries `verified`, declared at `src/shared/types.ts:1385-1386` as
  "true = observed hands-on 2026-08-10 (research 16); false = inherited".
- Code: nothing reads it. The drop path reads `strategy` at
  `src/renderer/terminal/drop/target.ts:95`, `router.ts:273`, `pipeline.ts:117` and `:134`, and
  `insert` at `insert.ts:151`. `verified` and `notes` have no consumer anywhere in `src/`.
- The first draft of this document scored the whole Attachments column from `verified` anyway. That
  produced two cells with identical behaviour and different verdicts: Pi read works and Grok read
  partial, and both are `path-text` with `insert: 'paste'` — Pi from its own row at
  `registry.ts:1291`, Grok from `DEFAULT_IMAGE_DROP` at `src/shared/agent-defaults.ts:29-33`, because
  Grok is the one launchable row with no `imageDrop` field. Cursor and Pi were the same pair the
  other way round. Section 2.2 is rebuilt from `strategy` and four cells moved: gemini to unmeasured,
  CodeWhale and Antigravity to partial, Pi to partial.

This is the same shape as 3.13 and 3.14, and it is listed with them rather than apologised for: a
declared field with no consumer will be read as evidence by the next person, and it was.

## 4. Per-agent notes

Claude Code. The only agent whose launch argv is rewritten twice more downstream:
`create-local.ts:499-508` appends `--settings <hook file>` and `:482-489` replaces the whole argv
with `['<bin>','auth','login','--claudeai']` for a sign-in create. Neither can fail the launch. It
is one of two agents with a native activity oracle, reading claude's own session registry
(`src/main/activity/oracles.ts:25-38`).

Cursor CLI. Pre-assign-cmd is a different promise from pre-assign. If `create-chat` fails, the
session still launches and comes back as a directory, recorded as `unavailable`
(`launch-plan.ts:77-83`). Its image drop is `path-text` with `verified: false`, which is the safe
default rather than a measurement.

Codex CLI. The sub-agent trap is the thing that matters here. 165 of 185 rollouts in the operator's
September shards were sub-agents, and a sub-agent id makes codex refuse the resume.
`src/main/sessions/codex-repair.ts` repairs such rows once per boot by walking `parent_thread_id`
and never empties a row. Its activity oracle reads the pane title through OSC 0/2 and was measured
at 0 percent false negatives over 88 samples and 0 percent false positives over 68
(`oracles.ts:41-90`). Its SpecStory exit-code fidelity is `collapsed`: a captured codex session that
dies non-zero records as 1, so the manifest exit code is a floor rather than the truth
(`registry.ts:716`).

Gemini CLI. `resumeArgvFor` returns an empty array for an empty id and for a template that lost its
slot, because a bare `--resume` on gemini silently attaches to the most recent session. The resume
investigator drove it and got `gemini emptyId=[]`. It is the only installed agent whose attachment
cell is unmeasured, and the only row where the drop overlay promises an attachment on evidence
nobody gathered. Its Catch Me Up reading is `mapped-with-loss`,
and the loss is the answer rather than the ask.

Factory Droid CLI. Not installed anywhere Tortie has been audited. The generic code path composes a
correct-shaped argv for it — the launch investigator's probe printed `spec.argv =
["/opt/p271/bin/droid","--model","X"]` — but the only droid-specific inputs are the binary name and
the argv, and both are upstream documentation. Its SpecStory provider is listed by the bundled CLI,
so capture would be offered the moment a droid session existed; nothing has ever tested it.

CodeWhale. Its drop strategy is `clipboard-attach`, so an image reaches it through ⌘V and a
drag-and-drop does not: the drop inserts the path and toasts that this agent attaches from ⌘V only
(`pipeline.ts:134-139`). That is the whole of the gap behind its partial attachment cell.
The registry id is `deepseek` and the pane on this machine actually runs the word
`deepseek`: `binaryCandidatesOf` returns `['codewhale','codew','deepseek']` and the create loop at
`create-local.ts:334-341` takes the third candidate, because only that one is on PATH here. It is
one of two agents with `animatesWhenIdle: true`, which changes what the screen tier is allowed to
conclude (`state-machine.ts:196`, `:293`).

Antigravity CLI. It is the other `clipboard-attach` row, with the same ⌘V-only gap as CodeWhale,
and it is the only row in the set whose path text must be TYPED rather than bracket-pasted, because
a pasted path opens a completion popup that swallows the next keystroke. That is the one non-default
`insert` value in the registry and `insert.ts:151` is the line that honours it.
Its harvest key `fd-owner` is an identity key: the owning `agy` process, a
descendant of the pane, holds open descriptors inside `brain/<id>`, so two agy sessions in one
folder stay separable (`src/main/manifest/harvest/agy-owner.ts`). Its resume template is
`--conversation <id>`, the only row that spells it that way. Its binary is `agy`, not the id, which
is what the comment at `create-local.ts:324` warns about.

Muse Code. The strongest harvest in the set. Muse stamps the tmux pane Tortie itself spawned into
its own transcript at session open, before any prompt (`stores.ts:665-667`). It has a first-run
trust gate: in an unseen directory muse asks "Do you trust this workspace?" and writes no
`session.jsonl` until it is answered, so the harvest window must outlive an unanswered prompt
(`registry.ts:1115`). It also adopts the launch cwd as the new workspace, so relaunching elsewhere
silently rebinds the workspace even though the conversation is found.

Qwen Code. Harvests at session open on key `pid`, which is an identity because the record's pid must
be a descendant of the pane pid; the qwen launcher forks twice. A pid key cannot be correlated once
the process is dead, so `agentRescuesIdAfterExit(qwen)` is false: a qwen row that never harvested
cannot be repaired after a reboot.

Pi. Its attachment cell is partial on the strongest evidence in that column, a verified negative:
⌘V on pi writes the pasteboard image to pi's own temp file and inserts THAT path as plain text, so
no route attaches anything, and Tortie inserts the real path instead (`registry.ts:1291-1297`). Pi
cannot take an attachment, and that is measured rather than assumed.
The row the cwd guard was written for. `pi --session-id <id>` from the wrong project does not
error; it starts an empty session under the same id, so the pane looks resumed and is not. Pi is also
the only agent whose store outlives its pane: its descriptor is `rescueOnly` with an exact rating, so
it is the one row the boot rescue will still try to repair after the process is gone
(`src/main/sessions/id-harvest.ts:398-420`).

Oh My Pi. The pi successor with a diverged resume surface: it dropped `--session-id`, so there is no
pre-assignment and the id can only be read back at the first turn. Its store key is omp's own
realpath-and-sanitize encoding of the launch directory, not pi's, so a mismatch there makes the watch
run against a directory omp never writes to. The conformance run's log shows the setup wizard being
answered by environment: `[gmux-conf] server env OMP_SKIP_SETUP=1 (for omp)`.

Grok. Pre-assigns and has no harvest descriptor at all, so there is no fallback: if the pre-assign
ever stopped working, nothing would recover the id. It is also the only launchable row with no
`imageDrop` field, so it takes `DEFAULT_IMAGE_DROP` from `src/shared/agent-defaults.ts:29-33`, which
is `path-text` with `verified: false`. Its launch environment carries
`GROK_PRIVACY_NOTICE_ROLLOUT=0`, which reaches the pane through `paneEnvFor`'s base layer
(`launch-plan.ts:352`).

opencode. The only SQLite store in the set. A read-only reader selects id, directory and
`time_created` from the `session` table of `~/.local/share/opencode/opencode.db`, excluding
sub-sessions and archived rows in the SQL itself (`src/main/manifest/harvest/opencode-store.ts`). It
is the only agent with no Catch Me Up at all, and the reason is the same architectural one: the
overview reader is path arithmetic over files and cannot read a row.

## 5. What would make them identical

The operator's stated goal is every agent having the full suite. This section says what each gap
would cost. It does not choose, and no work is started here. The gaps are grouped by who owns them,
because that is what decides whether the work is possible at all.

### 5.1 Gaps Tortie owns, and they are small

Rewrite the published table from section 2. Every sentence in `docs.ts:1258-1272` can be composed
from the matrix. The seven published-side findings it would fix are 3.1, 3.3, 3.4, 3.7, 3.8, 3.9 and
3.10 — two wrong facts, two omissions, and three rows that say less than the code does. Cost: one
editing pass on one file in the tortie.sh repository. This is the highest-value hour in the list.

Fix the registry's stale prose. The claude cwd claim (3.2), the eleven "bundled 2.8.0" references
(3.5), the codex confidence (3.11), the omp descriptor comment (3.12), the droid confidence (3.6),
the two row counts (3.19), the IDE refusal comment (3.15) and the specstory fallback comment that
names an id mismatch which no longer exists (3.20). Cost: one commit, no behaviour change. The codex
and omp confidence items are the only two that need a decision rather than an edit, because both
values reach the manifest.

Add a gate that holds the capability fields, because nothing does. This is the fix round's own
finding and it is the reason the item above cannot promise a gate. `conformance:agents` is about the
create and restore path: the absolute launch argv, the resume argv composed from the parsed row, the
contract key set, the renderer seed and the confirm hash. It never names `imageDrop`, `activity` or
`specstory`, and neither does any other script under `build/`. The unit suite pins two per-agent drop
values in total, being claude's `strategy` and antigravity's `insert`
(`src/main/drop/__tests__/store.test.ts:85` and `:88`); every other row is checked only for
membership in the three-value set (`:71-73`). So an edit that flipped CodeWhale from
`clipboard-attach` to `path-text`, or muse's `animatesWhenIdle` from true to false, would change what
a person sees and go green everywhere. Cost: a conformance script in the shape of the existing ones,
printing the per-agent capability matrix as data and pinning it. It is the cheapest way to stop this
document going stale.

Decide what `activity.tier`, `flagPresets` and `imageDrop.verified` are for (3.13, 3.14, 3.22).
Either delete the fields or give them a consumer. `flagPresets` is the one that is not a free
deletion, because its name is in the overlay's refusal list (3.14). Cost: an hour either way. Leaving them is the
option that costs the next reader, and 3.22 is the proof: this document read one of them as evidence
and scored a column wrong.

Give `verifiedProviders()` its own field (3.21). It decides which providers capture falls back to
when the probe fails, and it reads `specstory.verified`, which is a statement about exit codes. Muse
is excluded though the vendored binary lists it. Cost: one field and one test, and it is worth doing
before the next specstory bump moves the provider list again.

Add `~/.grok/bin` and `~/.opencode/bin` to `extraBinDirsFor` (`resolve.ts:150-165`), which restores
the bare-name protection for those two agents on machines whose login shell lacks them (3.16). Cost:
two lines and one test. Check first whether the eight-directory list has a cap or an ordering rule.

Give grok a harvest descriptor as a fallback for its pre-assignment. Cost: medium, and the research
is the hard half — grok's store layout would have to be measured the way muse's and antigravity's
were.

Publish the cursor create stall and the CodeWhale leading-extras rule (3.17, 3.18), either as
registry notes or as user-visible copy. Cost: minutes. The second one has a dead pane as its failure
mode, so it is worth a note beside the field.

### 5.2 Gaps that need a measurement, not a decision

Prove the resume round-trip for all thirteen at once. `npm run conformance:resume` is the full mode:
about three minutes, real turns, real tokens. It plants a turn, simulates a reboot and reads the
conversation back. It is the single step that would let the published table drop every "unproven"
caveat, and it would close the six SKIP rows the capture run leaves open. Cost: three minutes of
machine time and the operator's consent to spend the tokens.

Re-measure the SpecStory wrap against the vendored 2.10.0. Every `exitCodeFidelity` value on every
capture row was measured against 2.8.0. Muse's `verified` should move to `verified` or the note
should say why not. Cost: one run of `specstory/__tests__/wrap.integration.test.ts` plus a per-row
read, under an hour.

Measure the image drops nobody has watched. Gemini is the one that matters and it is the only
attachment row this document scores unmeasured on an installed agent: it is `paste-path`, so the drop
overlay tells a person "Drop to attach" before the path is pasted, and the registry note says the
value was inferred from upstream source. If gemini does not honour it, the overlay is lying and the
file silently becomes prose. Cursor, droid and grok are cheaper to leave: all three insert path text,
which cannot mislead, and the open question there is only whether they could do better. Cost: one
drop each in a real pane. Cursor needs a signed-in `cursor-agent`; droid needs droid installed at
all.

Install droid, or decide it stays unmeasured. Every droid cell in the matrix is unmeasured or absent
for one reason: no binary on any machine Tortie has been audited on. One create and one
`conformance:resume:capture` arm would move launch, id capture, resume, restore, activity and
attachments at once. The blocker is an account, not code.

### 5.3 Gaps that need Tortie code, and the cost is real

Catch Me Up reading for opencode. It needs a `keep-map.json` block and an entry in
`PATH_ARITHMETIC_PROVIDERS`. The block is data, which is the cheap half. The expensive half is that
the reader does path arithmetic over files and opencode's transcript lives in SQLite rows, exactly
the problem the opencode integration hit for the manifest harvest. Cost: medium, and it is a reader
of a second shape rather than a data edit.

Catch Me Up folding for the seven agents that have no recipe. Each needs the six measurements named
at `recipes.ts:506-513`: the one-shot invocation, the flags that turn tools and extra context and
thinking and caching off, the models worth offering, a structured output mode, a working directory
rule, and the median cost and wall clock over ten real folds. Each one spends tokens. The comment
already records why each failed on 2026-08-23 and 2026-08-24, and two of those reasons are unlikely
to move: gemini is a sign-in problem, and qwen has no flag that turns its tools off. Cost: roughly a
day per agent, and it is the most token-expensive item in this document.

Raise the four `cwd-newest` harvests to identity keys. Codex, CodeWhale, omp and opencode all key on
the folder, so two panes in one folder are separated only by time. Antigravity's `fd-owner` and
muse's `tmux-pane` show the shape of the answer: find a signal that binds a session to the pane
Tortie spawned. Cost: research per agent, and it may not exist for all four.

### 5.4 Gaps Tortie does not own

SpecStory capture for qwen, pi, omp and grok. The bundled CLI has no provider for them. Tortie's own
work when one ships is a registry field and a vendored-binary bump, which is an hour. The provider
itself is the SpecStory product's work.

Id capture at spawn for codex, CodeWhale, antigravity, omp and opencode. All five read their id back
at the first turn because none of them offers a flag that pre-assigns one. Only the agent's own CLI
can close this.

The cwd constraint on qwen and pi. Both find a conversation by looking inside the project directory.
Only the agent's own CLI can close this, and the guard at `restore.ts:876-900` is the right answer
until it does.

Agent-native activity for the eleven agents that have none. Claude publishes a session registry and
codex publishes its state through the pane title. The other eleven publish nothing, so the tiered
monitor infers. The registry type offers a third native channel, `shell-keypad` (`registry.ts:324`),
which no agent row names. Closing this for any agent means that agent publishing its state.

## 6. Limits

What this document did not establish, and what would establish it.

It did not open a pane. No agent process was started by me. The two investigators who ran
`conformance:resume:capture` did start real agent processes, on a scratch socket and a scratch
profile, and that run is the only live evidence in the document. Everything in the launch column is a
composed and inspected command line plus a confirmation that the binary exists and is executable on
this machine. `probe:p167` or one app run would close that.

It did not prove that any conversation comes back. The capture-mode run says so in its own words:
"capture mode asserted the manifest only — no turn was planted, no reboot simulated, no conversation
proven." Six rows are SKIP for that reason rather than for a defect: codex, CodeWhale, antigravity,
omp and opencode write their id at the first turn, and droid is not installed.
`npm run conformance:resume` closes it.

It did not measure how often the activity verdicts are right. The verdicts in the activity column
say which channel exists for each agent, not how accurate it is. The two native oracles carry
measured error rates in their own comments. The screen tier's 0 percent false negatives and 0 percent
false positives over 337 transitions (`src/main/activity/screen.ts:8-18`) is a measurement of the
mechanism, not a per-agent matrix. A per-agent accuracy claim would need a scored session per agent.

It did not read a real transcript for the Catch Me Up column. The reading verdicts come from the
provider gate and the keep map's own `status` values, not from reading a session on this machine.
The one `mapped-with-loss` status and the three `honest` notes are the map's measurements, made
earlier and not re-run here. Neither field is read by any code, so no gate would catch one of them
going stale either.

It did not run Electron. Nothing here is a statement about a drawn surface: the capture toggle in
Settings, the status dot, the Catch Me Up page, the agent picker. A Tier 2 app run would close that.

It did not re-measure SpecStory exit-code fidelity against the 2.10.0 the tree vendors. The provider
list was read from the binary; the fidelity values in the registry were measured against 2.8.0 and
are carried forward unverified.

It did not score the IDE pair. `cursoride` and `copilotide` are named as out of scope in section 1
and appear in no table row.

No gate holds the capability half of the matrix. The launch, id capture, resume, cwd and restore
columns sit on `conformance:agents` and `conformance:resume:capture`. The activity, attachments and
SpecStory capture columns sit on nothing executable, as section 5.1 now says. Every verdict in those
three columns is a reading of the code as it stands on this commit, and a registry edit tomorrow
could move any of them without a red gate anywhere.

It did not measure restore per agent. Restore branches on the agent in two places and one of them is
cosmetic, so the twelve works verdicts in section 2.1 are one reading of one shared path. A per-agent
restore claim would need a killed and restored session per agent, which is `probe:p167` territory.

It measured one machine. Every `command -v` result, the resolved binary paths, the installed
versions and the PATH-dependent findings in 3.16 are facts about the operator's Mac on 2026-09-14.

Three reported findings were checked and not accepted, recorded here so a later round does not
re-open them. A verifier reported that `src/main/agents/registry.ts` had been edited underneath this
document and that the document no longer described the tree. It does: the file is byte identical to
`df273525`, sha256 `05df8cd6b76a95a7345504b65879d72edd100581cb588129934546b81fba6a26`, 2002 lines.
What that verifier saw was another verifier's ablation in flight, restored by its own trap. A
verifier reported the registry's section banner at `:497`; the banner text is at `:498` and `:497` is
the rule above it. And a verifier reported that the shipping code tells a person droid's capture is
`measured`, as a defect. It does say `measured`, and that reading is sound: `confidence` is scoped at
`capture.ts:292-298` to exit-code behaviour, and droid's note says the wrapper was what got measured.
The wrong-side reader is `verifiedProviders()`, and section 3.21 is that finding rather than this
one.
