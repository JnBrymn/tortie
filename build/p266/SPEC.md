# Phase 266 — opencode as a supported CLI. SPEC.

Subject `feat(agents): opencode joins the registry`. First body line `Phase 266: opencode as a
supported CLI`. Semver **minor** (a new agent a person can launch, resume and restore). **Tier 3**
(restore is durability-critical and can misattribute a session; it reads a store shape the registry
has never read; it holds — READ ONLY — a place a person's credential lives).

Charter: `docs/BACKLOG.md` "Phase 266" entry (operator request, 2026-09-13) on top of
`docs/research/121-opencode-integration.md`, which is the spec and was measured on the operator's
machine against the installed binary (1.18.30), a read-only copy of its session db, and its source at
`/Users/gdc/opencode`. This spec does not re-derive research 121; it confirms its live facts against
the installed binary a second time, resolves the open decisions the research left to the phase, maps
the compile blast radius of the new agent id, and turns the work into two disjoint builder briefs, a
gate story, and a Tier-3 proof.

**Every live fact below was re-confirmed by the spec agent on 2026-09-13**, READ ONLY against
`~/.opencode/bin/opencode` (1.18.30), a *copied* db opened as a copy (never the original), and one
real create in a scratch HOME writing its own scratch db. The operator's real db
(`~/.local/share/opencode/opencode.db`) and `auth.json` were never opened for write and no token byte
of any credential was read.

What this settles, in order: §1 the live facts; §2 the decisions the builders inherit rather than
re-decide (store discriminant, the read-only open rule, the harvest key, `availableAt`, the specstory
row); §3 the compile blast radius of the new id; §4 Builder A's brief; §5 Builder B's brief; §6 the
Tier-3 proof and its independent methods; §7 refusals and stated limits.

---------------------------------------------------------------------------------------------------

## 1. The live facts, re-confirmed 2026-09-13

**F1 — binary and version.** `~/.opencode/bin/opencode --version` prints `1.18.30` bare, one line, no
ANSI. So `versionProbe: { args: ['--version'] }`, default `postProcess: 'first-line'`, no
`identitySubstring` needed (a stray `opencode` on PATH is not a concern the way a stray `claude` is;
add none unless the builder finds one).

**F2 — the store is ONE SQLite database.** `~/.local/share/opencode/opencode.db`. Tables include
`session`, `message`, `part`, `project`, `credential`, `account`. The `session` schema (read from a
copy):

```
CREATE TABLE `session` (
  `id` text PRIMARY KEY, `project_id` text NOT NULL, `workspace_id` text, `parent_id` text,
  `slug` text NOT NULL, `directory` text NOT NULL, `path` text, `title` text NOT NULL,
  `version` text NOT NULL, ... `agent` text, `model` text,
  `time_created` integer NOT NULL, `time_updated` integer NOT NULL,
  `time_compacting` integer, `time_archived` integer, ...
);
```

- `directory` is the ABSOLUTE cwd, held in a real column (rows read e.g. `/Users/gdc/gmux`,
  `/Users/gdc/runstory/scratch/phase5/5c`). NOT realpath-guaranteed by opencode (source sets it from
  `ctx.directory`/`input.directory`, `packages/opencode/src/session/session.ts:229,517`, no realpath
  seen) — so the harvest MUST compare with the codebase's `samePath` resolver, exactly as deepseek
  does, never a raw string `=`.
- `model` is a JSON blob, not a plain id: `{"id":"gpt-5.6-sol","providerID":"openai",...}`. Not
  load-bearing for this phase (no model driving) — noted so nobody keys on it as a string.
- `parent_id` exists: opencode HAS sub-sessions. A resume must name a top-level session, not a child
  — see D5 (derivedStream).

**F3 — ids are descending, newest sorts FIRST ascending.** Confirmed: `SELECT id,time_created FROM
session ORDER BY id ASC` returns the row with the LARGEST `time_created` first
(`ses_f634…|1789335751475` before `ses_fc86…|1787638875800`). So "newest for a cwd" is
`… WHERE <samePath> ORDER BY id ASC LIMIT 1` (equivalently `MIN(id)`). Generation is `now = ~now` at
`packages/opencode/src/id/id.ts:62`, prefix `ses_`.

**F4 — CORRECTION to research 121: `Identifier.timestamp(id)` does NOT decode a session id's age.**
`id.ts:73` `timestamp()` carries the comment *"Extract timestamp from an ascending ID. Does not work
with descending IDs."* Session ids are `descending`. The research's claim that the harvest can
"verify a row's age against the id" via `Identifier.timestamp` is wrong as written. **Use the
`time_created` COLUMN for age** — it is authoritative and simpler. (If age-from-id is ever wanted,
the decode is `ts = Number((~encoded48) / 0x1000)`, not `timestamp()`.) This correction saves Builder
B a silent bug.

**F5 — resume is by flag, no pre-assign flag exists.** `opencode --help` and `opencode run --help`
both list `-c, --continue`, `-s, --session <id>`, `--fork` (fork requires `--continue`/`--session`).
The default command is the TUI `opencode [project]` and it accepts `-s`. There is NO flag that
pre-assigns a chosen session id at create (`--title` sets a title, not an id; the source's internal
`given` id path and the HTTP `sessionID` payload are not reachable from the CLI). So resume is
**harvest, not arm-at-launch**: `resume.strategy = 'flag-uuid'`, `template = ['--session',
SESSION_ID_SLOT]`, `idCapture.mode = 'harvest'`, `key = 'cwd-newest'`.

**F6 — a scratch-HOME create writes a scratch db row carrying the cwd, and a real turn completes
without touching real auth.json.** The spec agent ran `opencode run "…"` under
`HOME`/`XDG_DATA_HOME`/`XDG_CONFIG_HOME` pointed at a scratch dir. Exit 0, a model reply printed, and
a fresh `<scratchHOME>/.local/share/opencode/opencode.db` appeared holding one `session` row whose
`directory` equalled the scratch project's realpath. No `auth.json` was created in or copied into the
scratch HOME, and no `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` was in the environment — the credential
opencode used came from outside the redirected data/config dirs (keychain or a global config), which
is exactly the property the Tier-3 harness needs: **it can drive a real create + turn in a scratch
HOME, writing only a scratch db, without ever reading his auth.json.**

**F7 — the live db currently has both `-wal` and `-shm` sidecars present** (a live opencode had it
open). This matters for the read-only rule in D2.

---------------------------------------------------------------------------------------------------

## 2. Decisions the builders inherit rather than re-decide

### D1 — Store discriminant: add `storeDb?: string` to the registry entry; keep `storeDirs` for detection. RECOMMENDED, with reason.

The task offered two shapes: a `storeKind: 'sqlite'` discriminant, or a `storeDb` field beside
`storeDirs`. **Recommend `storeDb?: string`** — the template path
`~/.local/share/opencode/opencode.db` — for these reasons:

1. `storeDirs` is a list of DIRECTORIES whose existence means "installed AND in use" and which double
   as the harvest watcher roots (`detection.ts:435` does
   `expandDirs(entry.storeDirs).some(existsSync)`; `watch.ts` `readdir`s them). A SQLite store is a
   single FILE — a different kind of thing. Overloading `storeDirs` with a file path would break the
   file-store `readdir` scan; a bare `storeKind` enum would still need the filename from *somewhere*,
   hiding a convention. `storeDb` names the exact bytes Tortie opens, as DATA (like `storeDirs`), not
   behaviour.
2. Detection stays trivial and honest: opencode keeps `storeDirs: ['~/.local/share/opencode']` (the
   containing directory — its existence is the install-and-in-use signal), and `storeDb` names the db
   inside it. No detection code change is required.
3. It reads cleanly in the registry as the counterpart to every file agent's `sessionStore` template
   string, so the row documents its own store the way the others do.

The **harvest-side** discriminant is separate and lives on the harvest descriptor (§5): the
descriptor gains a `storeKind: 'files' | 'sqlite'` tag so `watch.ts` branches once. The db path the
descriptor reads comes from a **single shared constant** (§5, `src/shared/`) that the registry's
`storeDb` field and the descriptor both import, so the two never drift. Do NOT hardcode the path in
two places.

`storeDb` is NOT added to the agents.json overlay (`src/shared/agent-overlay.ts`): no user overrides
opencode's db path, the overlay is a hand-written PARTIAL of the base, and a base-only field needs no
overlay entry. Confirm no test asserts registry-keys ⊆ overlay-keys (there is none today); the
overlay type and its JSON schema are UNTOUCHED. This satisfies the task's "must not break the
hand-written overlay type or its validation."

### D2 — Read-only open: follow the codebase's MEASURED rule (`readonly:true, fileMustExist:true`, no pragma, guarded by `safeToOpenReadOnly`). This OVERRIDES the task's "immutable" phrasing, and here is why.

`src/main/manifest/harvest/codex-state.ts` already opens a vendor SQLite store read-only and has
settled this exact question (lines 106–133):

- Open is `new Database(dbPath, { readonly: true, fileMustExist: true })` and **NOTHING else — no
  pragma is ever run** (a `journal_mode` or `optimize` on someone else's store is a write).
- **`immutable=1` is explicitly FORBIDDEN there**, for two stated reasons: it is STALE (reads a
  frozen snapshot and would MISS the just-created session — fatal for a harvest whose whole job is to
  find the NEWEST row seconds after create), and the code refuses it on principle.
- The one real write risk is that a read-only open of a **WAL** db creates the `-shm` sidecar when a
  `-wal` exists without one. `safeToOpenReadOnly(dbPath)` encodes the whole rule: exists AND (no
  `-wal`, OR `-shm` already present). Reuse it verbatim.

So the task's SAFETY intent — "take NO write lock, NEVER touch the WAL, never mutate" — is honored by
`readonly + fileMustExist + safeToOpenReadOnly`, NOT by `immutable`. Builder B reuses
`safeToOpenReadOnly` (export it from `codex-state.ts` if not already; it is exported) and the same
open options, and runs a schema probe in front of the query (as codex-state does) so a future
opencode column rename degrades to null rather than throwing. On the live db (F7) both sidecars are
present, so the guard passes and the open creates nothing; the risky `-wal`-without-`-shm` case
returns null and the harvest simply retries next poll.

### D3 — Harvest key is `cwd-newest`, not `sqlite-index`. Claim stays takeable.

`AgentHarvestKey` already contains `sqlite-index` ("an index carries id + cwd in one row"), which
literally describes opencode. But `claim-strength.ts` classes BOTH `cwd-newest` and `sqlite-index` as
NON-identity/weak, and `sqlite-index` is currently used by no descriptor (only named in the type and
one provenance test). Research 121 and the backlog both say `cwd-newest`, same family as deepseek,
and the weakness is identical (two panes in one cwd are not separable). **Use `cwd-newest`**, so the
claim ladder, `deriveResumeConfidence`, and the whole `weak`/`matched` path apply unchanged and no new
key needs wiring across `watch.ts`/`remote.ts`/`derived.ts`. `confidence: 'weak'`. Note in the
descriptor comment that the store happens to be a SQLite index but the ownership evidence is still
only the directory, which is why the key is `cwd-newest`.

### D4 — `availableAt`: measure it; default to `'first-turn'` if unsure.

In `run` mode the row appeared only after the turn (F6). Whether the TUI (what Tortie launches)
writes the `session` row at OPEN or at FIRST TURN is unconfirmed. Builder B/the verifier MUST measure
it: launch the TUI in a scratch HOME, and check whether a `session` row for the cwd exists BEFORE any
message is sent. If yes → `availableAt: 'session-open'` (better; id captured sooner). If no →
`availableAt: 'first-turn'` (matches deepseek; the resume-conformance harness already handles
first-turn harvest by waiting after the turn). Default to `'first-turn'` if the measurement is
ambiguous — it is the safe, harness-supported value.

### D5 — derivedStream: opencode HAS sub-sessions (`parent_id`), so this is NOT `none`.

The `session` table has a `parent_id` column, so opencode writes child/sub-sessions into the SAME
table. A resume must never name a child. The descriptor's `derivedStream` rule (required, no default)
must be a real rule with evidence: the SQLite reader filters to rows with `parent_id IS NULL` (and/or
`time_archived IS NULL`) so a sub-session or an archived session is never harvested as this pane's
resumable id. Builder B confirms the exact predicate against the copied db and writes the measured
evidence into the `derivedStream.measured` string (row counts with/without `parent_id`,
`time_archived`). This is the opencode analogue of codex's sub-agent-rollout refusal.

### D6 — the specstory row: extend `AgentSpecstoryCapture` to a discriminated union with a `{ provider: null }` arm. RECOMMENDED, with reason.

The operator wants `specstory: { provider: null }` / unsupported with a note naming specstory 2.8.0.
Today `AgentSpecstoryCapture.provider` is a non-null `SpecstoryProviderId`, and the qwen/pi
convention for "no capture" is to OMIT the field. **Omitting is WRONG for opencode**, because
`providerIdFor` (`capture.ts:340`) falls through to `probed.has(entry.id) ? entry.id : null` when the
field is absent — so the day a future specstory build advertises an `opencode` provider, capture
would AUTO-enable with no measured exit-code fidelity and no human flip, contradicting research 121's
"the row flips in that phase, not this one."

An explicit `{ provider: null }` arm makes `providerIdFor` return null at `capture.ts:338`
(`entry.specstory !== undefined → return entry.specstory.provider` = null) and NOT probe — capture
stays deliberately OFF until a human edits the row. The current type can't hold `provider: null`, and
faking an `exitCodeFidelity` for an unsupported provider is dishonest. So make it a discriminated
union:

```ts
export type AgentSpecstoryCapture =
  | { provider: SpecstoryProviderId; exitCodeFidelity: 'exact' | 'collapsed';
      verified: 'verified' | 'unverified'; notes?: string }
  | { provider: null; notes: string };   // checked against the bundled CLI; unsupported
```

Consumers to fix in the SAME change (all in `src/main/specstory/capture.ts`, Builder A's territory
since the type lives in `registry.ts`):

- `verifiedProviders()` (~line 170): guard the null arm —
  `e.specstory !== undefined && e.specstory.provider !== null && e.specstory.verified === 'verified'`.
- `providerIdFor()` (~line 338): already returns `SpecstoryProviderId | null`; returning
  `entry.specstory.provider` (null) is correct and needs no change beyond the type narrowing the
  compiler forces.

opencode's row: `specstory: { provider: null, notes: 'specstory 2.8.0 (bundled) lists antigravity,
claude, codex, copilotide, cursor, cursoride, deepseek, droid, gemini and muse — not opencode, so
capture is off. Flip this row when a bundled specstory ships an opencode provider.' }`. `AGENTS.md`
SpecStory boundary rule is untouched: no provider is written; this is only which agents the bundled
binary supports.

*(If the integrator judges the union too broad a change for one phase, the fallback is to widen only
`provider` to `SpecstoryProviderId | null` and keep `exitCodeFidelity`/`verified` present with
`verified: 'unverified'` and an honest `exitCodeFidelity` placeholder — but the union is the honest
shape and is preferred.)*

### D7 — gate:contract does NOT need regeneration for this row. Do not preemptively regenerate.

Agent registry ids are NOT serialized into `docs/audits/contract-baseline.txt` (verified: `claude`,
`deepseek`, `grok` all count 0 in that file). The registry is compiled data, not the IPC contract /
manifest schema / storage-key inventory that `gate:contract` guards. `gate:contract` runs inside
`npm run build`; if it flags a diff (it should not), regenerate per the obligation and say which
lines moved — but do not regenerate on spec. The backlog's "gate:contract regenerates the baseline
for the new registry row" line is inaccurate for this repository as it stands.

---------------------------------------------------------------------------------------------------

## 3. The compile blast radius of the new agent id

Adding `'opencode'` to `AgentRegistryId` (in `src/shared/types.ts`) flows into `LaunchableAgentId`
(opencode is not in the excluded IDE pair). Every TOTAL `Record<LaunchableAgentId|AgentRegistryId,…>`
then fails to compile until opencode is added. The full set (found by grep; the builder confirms via
`npm run typecheck`):

1. **`src/main/conformance/cases.ts:44` `BYPASS_FLAGS: Record<LaunchableAgentId, readonly string[]>`**
   — add `opencode: []` (see §4). Total record; compile-forcing.
2. **`src/main/context/agent-context.ts:1205` `SKILLS_CLI_NAMES: Record<AgentRegistryId, string |
   null>`** — add `opencode: null` (the bundled skills CLI has no opencode target; the honest null).
   Total record; compile-forcing. **This file is a `conformance:context` trigger path — Builder A
   runs `npm run conformance:context`.**
3. `src/shared/settings.ts:782` uses `Partial<Record<LaunchableAgentId,…>>` — NOT forced.

There may also be exhaustive `switch (agent)` blocks with no default; the typecheck will surface any.
Neither total record is a data claim that needs measurement — both are honest "opencode has no
special bypass flag / no skills-CLI name" until proven otherwise.

---------------------------------------------------------------------------------------------------

## 4. BUILDER A — the registry row and the id's fan-out

**Owns:** `src/main/agents/registry.ts`, `src/main/specstory/capture.ts`,
`src/main/conformance/cases.ts`, `src/main/context/agent-context.ts`,
`src/renderer/state/agents.ts`. **Coordinates with B on `src/shared/`** — B appends `'opencode'` to
the union and the shared db-path constant; A imports them. A does NOT edit `src/shared/`.

**A1 — the opencode row in `AGENT_REGISTRY`**, appended AFTER `grok` (last), template from the
`deepseek` row (the cwd-newest exemplar) and `droid`. Fields:

- `id: 'opencode'`, `displayName: 'opencode'` (lowercase — the product's own spelling),
  `kind: 'cli'`, `launchable: true`, `status: 'shipped-main'`, `confidence: 'high'` (installed and
  driven live).
- `binaries: ['opencode']`, `extraProbeDirs: ['~/.opencode/bin']`,
  `storeDirs: ['~/.local/share/opencode']`, `storeDb: '~/.local/share/opencode/opencode.db'`
  (the new field, from the shared constant B provides — import it, do not spell the path inline).
- `install`: `canonical.command = 'curl -fsSL https://opencode.ai/install | bash'`,
  `docUrl` opencode's install page, `readOn: '2026-09-13'`; alternates: npm `opencode-ai`, Homebrew,
  and `opencode upgrade`; `canonicalIsPackageManager: false`; `signature: null` (or a
  `realpath-under ~/.opencode` marker if the builder confirms one — optional). Must satisfy the six
  `conformance:installs` shape rules (no `sudo`, non-empty commands, packageManager flag agrees with
  first word, bounded signature paths).
- `versionProbe: { args: ['--version'] }` (F1).
- `launch: { argv: ['opencode'], quirks: [] }` (argv[0] must equal binaries[0] — `registry.test.ts:105`).
- `resume`: `strategy: 'flag-uuid'`, `template: ['--session', SESSION_ID_SLOT]`,
  `idCapture: { mode: 'harvest', key: 'cwd-newest', source: 'newest session.id whose directory
  matches the pane cwd (samePath), read from ~/.local/share/opencode/opencode.db', availableAt:
  <D4>, confidence: 'weak' }`, `sessionStore: '~/.local/share/opencode/opencode.db (session table,
  row keyed by directory)'`, `requiresOriginalCwd`: measure (qwen-style hard-fail vs pi-style silent
  new session) — set only if confirmed; `notes`: the measured resume facts (TUI takes `-s <id>`;
  `-c`/`--fork` exist; NO pre-assign flag; two panes in one cwd not separable). Default extras
  position is trailing — confirm `opencode <flags> --session <id>` order is accepted, else set
  `resumeExtrasPosition`.
- `reconstructionTarget: false` (Tortie does not reconstruct INTO opencode's db — it is read-only;
  confirm against how the field is used, but read-only store ⇒ not a reconstruction target).
- `activity`: measure hands-on; `{ tier: 'screen', animatesWhenIdle: <measured>, verified: 'partial'
  }` is the safe shape unless a stronger channel is found.
- `iconKey: 'opencode'` (see A5), `defaultHotkeyHint`: a free mnemonic (e.g. `'o'` if unused — check
  the other rows' hints for collision).
- `multilineKey` and `imageDrop`: **measured hands-on** (opencode is installed → `verified: true`).
  Launch opencode in a pane, confirm Shift+Enter inserts a newline (`sequence: LF` almost certainly)
  and how a dropped/pasted file path reaches the prompt (`strategy`/`insert`). Record traps.
- `specstory: { provider: null, notes: '…specstory 2.8.0…' }` per D6.
- `unverified: false`.
- `notes`: a short row-level note pointing at research 121 and the SQLite-store fact.

**A2 — the `AgentSpecstoryCapture` type change** per D6 (in `registry.ts`), plus the two consumer
fixes in `capture.ts` (`verifiedProviders` null-guard; `providerIdFor` compiles).

**A3 — `BYPASS_FLAGS`** (`cases.ts`): add `opencode: []` by default. If A's hands-on launch shows
opencode gates on a trust/permission dialog BEFORE reaching a usable prompt, add `['--auto']`
(opencode's autonomy flag, `--help`: "auto-approve permissions that are not explicitly denied") AND a
matching VERIFIED entry in `AGENT_FLAG_PRESETS` so `assertBypassFlagsAreCataloged` stays green; if it
reaches the prompt with no gate (like omp/grok), leave it empty and say so in a comment.

**A4 — `SKILLS_CLI_NAMES`** (`agent-context.ts`): add `opencode: null`. Run `conformance:context`.

**A5 — the renderer seed** (`src/renderer/state/agents.ts` `SEED_AGENTS`): append
`{ id: 'opencode', label: 'opencode', unverified: false }` at the END (order and `unverified` must
match the registry — `conformance:agents` Section 3 checks this). An `opencode` icon SVG under
`src/renderer/assets/agents/opencode.svg` is ideal; if none is commissioned, `iconKey: 'opencode'`
falls back to the terminal glyph (acceptable, like antigravity/muse per the registry comment) — do
not block on the asset.

**A gates:** `npm run typecheck && npm run build && npm run smoke:t1`; plus `conformance:agents`,
`conformance:installs`, `conformance:context` (SKILLS path); the registry/agent unit suites.

---------------------------------------------------------------------------------------------------

## 5. BUILDER B — the READ-ONLY SQLite store

**Owns:** `src/shared/` (APPEND ONLY): the `'opencode'` union member and the shared db-path constant
and reader row type; and `src/main/manifest/harvest/`: the SQLite reader plus the descriptor and the
one `watch.ts` branch that consumes it. B does NOT edit `registry.ts`.

**B1 — `src/shared/types.ts` (append):** add `| 'opencode'` to `AgentRegistryId` (line ~952, after
`grok` or in the existing block). It flows to `LaunchableAgentId` automatically. Update the doc
comment count ("all 14 entries" → 15). This is the ONE shared edit both builders depend on — land it
first / coordinate so A can reference the id.

**B2 — a shared db-path constant + reader row type.** Add (append-only, e.g. a small
`src/shared/opencode-store.ts` or an addition to an existing shared module — pick the smallest
surface):
- `OPENCODE_DB_RELPATH = '.local/share/opencode/opencode.db'` (or the `~/`-template the registry
  wants), so `registry.ts`'s `storeDb` and the harvest descriptor both import ONE spelling.
- a row type `interface OpencodeSessionRow { sessionId: string; directory: string; timeCreatedMs:
  number }`.

**B3 — the SQLite reader** in `src/main/manifest/harvest/` (new module, e.g. `opencode-store.ts`,
modelled on `codex-state.ts`):
- `import Database from 'better-sqlite3'` (already a dependency, electron-rebuilt; runs in main, same
  as codex-state).
- Reuse `safeToOpenReadOnly` from `codex-state.ts` (export it if the barrel does not already —
  `index.ts` already re-exports it). Open `new Database(dbPath, { readonly: true, fileMustExist:
  true })`, NO pragma (D2).
- A schema probe in front of the query (like codex-state): confirm `session` has `id`, `directory`,
  `time_created`, `parent_id`, `time_archived`; compose the select from columns actually present so a
  future schema change degrades to null, not a throw.
- The query: newest top-level session for a cwd —
  `SELECT id, directory, time_created FROM session WHERE parent_id IS NULL AND time_archived IS NULL
  ORDER BY id ASC` (newest first, F3), returned as rows; the CALLER filters `samePath(row.directory,
  cwd)` and takes the first match (do NOT `WHERE directory = ?` on a raw string — F2/D-samePath). Or
  push a bounded LIMIT and filter in JS. Keep it small; the store is tiny.
- Errors (locked, mid-recovery, refused shape, guard false) → return `null`/empty; the harvest simply
  finds nothing this cycle and retries. Never throw up the stack.
- Close the `Database` in a `finally` (or keep a cached reader per db path with an explicit close, as
  codex-state does — prefer close-per-read here since there is one db and reads are infrequent).

**B4 — the harvest descriptor + the single `watch.ts` branch.** The house rule (`harvest/index.ts`)
is "adding an agent is a descriptor, never a second harvester." Honor it: opencode gets a
`DESCRIPTORS.opencode` entry, and the shared watch/settle/grace/claim machinery is reused — it must
NOT be reimplemented.

The `HarvestDescriptor` is file/dir-oriented (`roots()`, `entry`, `recurse`, `maxDepth`,
`identify(path)`, `confirm(path)`, consumed by `watch.ts` `scan()`/`consider()`). A SQLite store has
no directory of candidate files. The minimal, contained wiring:
- Add a discriminant to `HarvestDescriptor`: `storeKind?: 'files' | 'sqlite'` (absent ⇒ `'files'`, so
  every existing descriptor is unchanged). The sqlite arm carries `dbPath(de: DescriptorEnv): string`
  (from the B2 constant) and delegates to the B3 reader.
- In `watch.ts`: ONE branch. Where the poll does `for (root of roots) scan(...)` then `consider(p)`,
  the sqlite branch instead calls the reader for `dbPath`, gets the newest matching row, and feeds a
  SYNTHETIC candidate carrying `{ sessionId, nameTs: timeCreatedMs }` into the SAME `consider()`
  settle path (so grace, rivals, claim-ladder, `deriveResumeConfidence` all apply unchanged). The
  native FS watcher watches the db's PARENT DIRECTORY (not `readdir` of a file) plus the `-wal` for
  change events to trigger a re-poll. `confirm` for the sqlite arm returns `'match'` (the query
  already filtered by cwd/samePath) — or re-checks samePath for belt-and-braces.
- `derivedStream` per D5 (filter `parent_id`/`time_archived` — enforced in the reader query AND
  declared on the descriptor with measured evidence).
- Keep the branch SMALL and localized. `consider()`/`decide()`/the claim map are UNTOUCHED. If the
  cleanest seam turns out to be a descriptor method `scanStore(ctx, de)` that returns synthetic
  candidates (called by the poll instead of `readdir` when `storeKind==='sqlite'`), that is
  acceptable — the test is that the settle path is shared, not duplicated.

**B5 — unit tests** over a committed fixture db (a tiny hand-built `session`-only sqlite fixture, or
the read-only COPY shape): the reader picks newest-by-id for a cwd, ignores `parent_id`/archived
rows, matches via samePath (symlinked cwd), and returns null on a missing/guard-failed/locked db.
Add an attack test asserting the open never writes: snapshot db mtime + sidecar set before and after
a read; `safeToOpenReadOnly` false when `-wal` present without `-shm`.

**B gates:** `npm run typecheck && npm run build`; the harvest unit suites; `conformance:derived`
(the `harvest/derived.ts` path — every descriptor declares `derivedStream`), `conformance:resume:capture`
(~16s), and any harvest/claim tests. Note `conformance:watcher` if `watch.ts`'s exclusion planner is
touched (the sqlite watch adds a root — keep within the FSEvents cap).

---------------------------------------------------------------------------------------------------

## 6. The Tier-3 proof and its independent methods

Tier 3 budget: the gates, plus real data / a per-row matrix, plus TWO independent methods one of
which is an ATTACK, plus a fix round on any needs_work. The verifier must do at least one thing the
builders did not, and name it.

**Method 1 (real data, live binary) — create/harvest/resume/read-back over opencode 1.18.30 in a
scratch HOME.** In a scratch `HOME`/`XDG_DATA_HOME`/`XDG_CONFIG_HOME` (writes only a scratch db, per
F6): create an opencode session in a scratch project dir, drive a turn, let the harvest read the
newest `session.id` for that cwd from the scratch db, compose `--session <id>`, resume, and assert
the ORIGINAL turn is back on screen. This is the `conformance:resume` arm — opencode is picked up
automatically once launchable and detected (the harness iterates launchable agents). Run
`GMUX_CONF_AGENTS=opencode npm run conformance:resume` (~real turns) as the phase's opencode arm, and
`conformance:resume:capture` for the capture-off claim. Evidence: the captured id, the resume argv,
the read-back screen text.

**Method 2 (ATTACK on the read-only guarantee).** Prove the reader never writes the store or its WAL:
- Copy the real db to a fixture (READ ONLY on the original). Record `md5`/size/mtime of `.db`, `-wal`,
  `-shm` and the exact sidecar SET. Run the reader hundreds of times (and concurrently). Assert every
  hash/mtime/sidecar-set is byte-identical after — no `-shm` created, no `-wal` touched, no `.db`
  mutated.
- Assert `safeToOpenReadOnly` returns FALSE for a `-wal`-without-`-shm` db (construct the fixture),
  so the reader refuses rather than creating a `-shm`.
- Assert no pragma is issued (grep the reader; assert the open options are exactly `readonly` +
  `fileMustExist`).
- Assert no token byte: grep the reader, its query, its returned rows, and any log for `credential`,
  `account`, `auth`, or a token shape — the reader selects only `id`, `directory`, `time_created` and
  touches only the `session` table.

**Hostile arm (research-mandated):** two opencode panes started in ONE cwd (assert the claim is
`weak`/`matched` and takeable, not `confirmed` — `claim-strength.ts`); a LOCKED db (a live opencode
holding it — assert the reader returns null and the harvest degrades, never throws); a db mid-write
(assert no partial/garbage id is accepted).

**Independent re-derivation (recommended, cheap):** the verifier writes its OWN newest-for-cwd query
by a different method (e.g. `MAX(time_created)` filtered by samePath) and confirms it names the SAME
id the id-ascending reader does, over the copied db — catching an ordering-direction bug (F3/F4 are
exactly where such a bug hides).

**Per-row matrix** (the universality claim): create · harvest · resume · read-back · capture-off,
each PASS/measured, for opencode, on the live binary.

---------------------------------------------------------------------------------------------------

## 7. Refusals and stated limits (carry these; a later round must not "finish them off")

- **No specstory provider is written.** Capture stays OFF for opencode; the row says so with a note
  naming specstory 2.8.0. That is specstory's product; the `AGENTS.md` SpecStory boundary rule
  forbids finishing it off here.
- **No opencode plugin, MCP server, ACP server, `serve`/`web` mode, `attach`, or GitHub/PR flow** is
  integrated. Tortie launches the TUI and restores it, nothing more.
- **No pre-assign-id flag is invented** from the source's internal `given` path or the HTTP
  `sessionID` payload. If opencode ships a CLI pre-assign flag later, it becomes a Tier-1
  arm-at-launch agent in a follow-up, not now.
- **No model or provider is driven** on opencode's behalf (`-m provider/model` is opencode's own).
- **The db and `auth.json` are READ ONLY.** Open `readonly + fileMustExist`, guarded by
  `safeToOpenReadOnly`, NO pragma, NO immutable, never the WAL. **No token byte of any credential is
  read, logged, copied, or put in an argv.** For live create/resume tests, a SCRATCH HOME writes its
  own scratch db (F6) — never his real one, and auth.json is never copied into scratch.
- **Stated weakness:** two opencode panes started in one directory are not separable (same as
  deepseek); the claim is takeable, not confirmed. This is honest and unchanged by the SQLite store —
  the store's directory column is still not a per-pane identity.
- **`Identifier.timestamp` is not used** to age a session id (F4); the `time_created` column is
  authoritative.

---------------------------------------------------------------------------------------------------

## 8. Sequencing

1. Builder B lands the `src/shared/` union member + db-path constant + row type FIRST (so A compiles).
2. Builders A and B proceed on disjoint files; A imports B's shared symbols.
3. Integrator reconciles, runs the full battery (typecheck, build, test, smoke:t1/t3, package) plus
   the path-triggered gates named in §4/§5, and the `conformance:resume` opencode arm.
4. Independent verifier runs the §6 Tier-3 proof (both methods + the attack + the hostile arm).
5. Fix round on any needs_work. Commit per phase, conventional subject, phase label first body line,
   no trailers.
