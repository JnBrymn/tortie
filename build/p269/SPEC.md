# Phase 269 — the shell variables an agent needs, where you already set how it launches

**Subject:** `feat(agents): name the shell variables an agent needs`
**First body line:** `Phase 269: the shell variables an agent needs`
**Semver:** minor — a new per-agent control; nothing changes for anyone who does not use it.
**Tier:** 3. It decides which of a person's shell variables — API keys among them — are handed to a
spawned process, and the values are resolved from a login shell at every launch.
**Independent methods (two, one an attack):**
(a) a LIVE app run where a named variable reaches a real pane and appears in NO manifest row, NO tmux
server environment and NO log, and where a rotated value is picked up by the NEXT session with no
Tortie restart and no tmux server restart;
(b) an ATTACK ON THE SEAL — a passthrough name written straight into `settings.json`, the way any
agent on the machine can, is refused on read, while the same name written through the app's own door
survives a restart and reaches the pane.

**Charter:** [issue 20](https://github.com/gregce/tortie/issues/20) (JnBrymn), the Phase 269 entry at
`docs/BACKLOG.md:27144`, `docs/research/123-issue-20-session-environment.md` (the measured chain) and
`docs/research/41-pi-env-providers.md` + the Phase 33 entry (`docs/BACKLOG.md:3462`), which built the
mechanism this phase makes reachable.

**YOU ARE NOT BUILDING A MECHANISM. YOU ARE MAKING AN EXISTING ONE REACHABLE.** Everything under the
create and the restore already works and is not rebuilt.

---

## 1. The reading — what is already there, with cites

| Fact | Cite |
| --- | --- |
| `launch.envPassthrough` is a type with nothing behind it — **no compiled row sets it** | `src/main/agents/registry.ts:242` (and its own comment at `:230-241`) |
| The spec copies the names only when a row names some | `src/main/manifest/agents.ts:770-772` |
| The create probes the login shell for the row's names and merges them beside the spawn | `src/main/sessions/create-local.ts:604-606`, `:619` |
| The record carries NAMES only, written once at insert | `src/main/sessions/launch-plan.ts:438-443` |
| `paneEnvFor` is the ONE merge rule, GMUX stamps LAST | `src/main/sessions/launch-plan.ts:331-344` |
| The restore RE-RESOLVES from the row's names, never replays a value | `src/main/restore/restore.ts:952-965`, `:996-997` |
| `captureLoginShellEnv`: `spawn` detached, settle on markers, independent deadline, group kill, fresh 8-byte nonce per probe, value cap 4096 refused WHOLE, never rejects | `src/main/tmux/resolve.ts:444-553`, cap at `:393`, name pattern at `:397`, deadline `PATH_CAPTURE_TIMEOUT_MS = 10_000` at `:115` |
| The refused names, with their reasons | `src/shared/agent-overlay.ts:417-428` (`ENV_REFUSED_EXACT`), `:444-457` (`ENV_REFUSED_PATTERNS`), `:466-478` (`ENV_PASSTHROUGH_REFUSED` — `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`) |
| The overlay's per-name checks, in the order a person reads them | `src/main/config/overlay.ts:431-497`; caps `maxEnvPassthroughNames: 16`, `maxEnvKeyLength: 64` at `src/shared/agent-overlay.ts:370-372`; name pattern `OVERLAY_ENV_KEY_PATTERN` at `:390` |
| The `env-unresolved` notice — fires only when the row already names a variable | `src/main/sessions/create-local.ts:666-674`, `src/main/restore/restore.ts:1036`, shape at `src/shared/notice.ts:232-252`, copy at `src/renderer/state/subscriptions.ts:520-537` |
| Settings → Agents draws NOTHING when there is no `agents.json` | `src/renderer/settings/ConfiguredAgents.tsx:152-160` |
| Tortie never writes `agents.json` | `src/main/config/guide.ts:25` |
| "one group card per launchable agent, detected agents first" | `src/renderer/settings/LaunchDefaultsSection.tsx:1-8`, ordering at `:231-236`, the card at `:143-223` |
| The confirm-once modal's shape and copy | `src/renderer/settings/LaunchDefaultsSection.tsx:84-141`; its write at `:238-253` |
| The section writes `settings.launchDefaults[agentId]` wholesale through `update()` | `src/renderer/settings/LaunchDefaultsSection.tsx:159-169` |
| **Why the seal exists**, in the section's own words | `src/renderer/settings/LaunchDefaultsSection.tsx:10-17` |
| The seal: `DangerState`, `dangerStateOf`, `withSealedDangerState`, `sealDangerState`, `openDangerSeal`, `persistSettings`, `getSettings` | `src/main/settings/store.ts:180-199` (`DangerState`), `:203-222` (`dangerStateOf`), `:229-236` (`isDangerStateEmpty`), `:246-306` (`withSealedDangerState`), `:351-421` (the seal itself), `:705-729` (`persistSettings`), `:740-763` (`getSettings`) |
| Shape-check first, seal second — and the shape check "cannot tell who wrote the file" | `src/main/settings/store.ts:424-430` (the doc), `:430` (`sanitizeSettings`), `:452-462` (launchDefaults), `:515-521` (fold), `:522-525` (arch) |
| The two compiled rows that set `launch.env` at all | `src/main/agents/registry.ts:590` (cursor `FORCE_COLOR`), `:1448` (grok `GROK_PRIVACY_NOTICE_ROLLOUT`) |
| A pane's ordinary variables come from the tmux SERVER, frozen at first start; **Tortie writes exactly two into the server globals, `LANG` and `PATH`** | research 123 §1.2 (`docs/research/123-issue-20-session-environment.md:76-114`), `src/main/tmux/supervisor.ts:549`, `:577` |
| Remote create never reads `envPassthrough` at all | `src/main/machines/remote-sessions.ts` — no occurrence (grepped) |
| The datalist precedent in this very window: a text field that offers what the machine has and is never a cage | `src/renderer/settings/AppearanceSection.tsx:855-883`, `:1009-1027`; its pinned test `src/renderer/settings/__tests__/p1741-font-field.test.tsx:126-140`; the reserved-line lesson at `src/renderer/settings/settings.css:169-220` |

**The defect in one line, confirmed:** the mechanism is complete and no route reaches it, and
`ConfiguredAgents` returns `null` for exactly the people who need it.

---

## 2. The decisions

### 2.1 The settings field

`GmuxSettings` gains one member, a sibling of `launchDefaults`:

```ts
/**
 * Per-agent environment variable NAMES Tortie reads from the login shell at
 * each launch of that agent (Phase 269). Values are resolved fresh per launch
 * and are stored NOWHERE. The names are SEALED — see store.ts, "The danger
 * seal" — because a name is a decision about which of a person's secrets a
 * spawned process is handed.
 */
envPassthrough: Partial<Record<LaunchableAgentId, string[]>>;
```

Default `{}` (`defaultGmuxSettings`, `src/shared/settings.ts:712`). `LaunchableAgentId` excludes
`shell` by construction, so a plain shell session — which runs the login shell itself — can never
carry one.

### 2.2 The seal, and it is the security of the phase

`DangerState` (`src/main/settings/store.ts:176`) gains a fifth member:

```ts
/**
 * "<agentId> <NAME>" for every passthrough name the person set in the
 * Settings window (Phase 269). A name is what decides which of the person's
 * secrets a spawned process is handed, so an agent that appended a name to
 * another agent's list could read a key it was never given. An old seal has
 * no `env` member at all, which opens as [] and fails safe to no names.
 */
readonly env: readonly string[];
```

- `envNameKey(agentId, name)` joins with a space, exactly like `dangerKey`
  (`src/shared/settings.ts:747`). New export in `src/shared/settings.ts`.
- `dangerStateOf` collects and sorts them.
- `isDangerStateEmpty` gains `state.env.length === 0`.
- `withSealedDangerState` drops every name the seal does not cover, pushes each dropped key into
  `rejected` (so `warnRejected`, `store.ts:676-684`, names it in `app.log`), and leaves an agent with
  no surviving name absent from the map rather than present and empty.
- `openDangerSeal` reads `env` with the same `strings()` helper the other two lists use and defaults
  it to `[]`.
- `EMPTY_DANGER_STATE` gains `env: []`.

Nothing else about the seal moves. Sealing still happens in `persistSettings` and checking still
happens in `getSettings`, which stays the only read outside the module.

**One consequence to state in the commit body:** a machine that sets a passthrough name leaves the
"never touches the keychain" common case (`store.ts:744-748`), exactly as a danger flag or a fold
choice already does. A machine that sets none is byte-for-byte unchanged.

### 2.3 The shape check, and where the refusal sentences live

Two pure additions, both leaf, both usable by main AND the renderer.

**`src/shared/agent-overlay.ts`** (it already owns every denylist and every reason, and it imports
nothing) gains ONE function. Its sentences are DERIVED from the three existing arrays, so a name
added to a denylist later is refused on this route with no second edit:

```ts
export interface EnvPassthroughContext {
  /** Names this agent already has on its list. */
  readonly existing?: readonly string[];
  /** Names the agent's own compiled `launch.env` sets (two agents have any). */
  readonly agentEnvKeys?: readonly string[];
  /** How many names one agent may carry. Defaults to the overlay's 16. */
  readonly cap?: number;
}

/**
 * Why Tortie will not read this variable for this agent, or null when it will.
 * ONE spelling of the rule, read by the Settings window (which shows the
 * sentence) and by the settings store (which only asks whether it is null).
 */
export function envPassthroughRefusal(
  name: string,
  ctx?: EnvPassthroughContext
): string | null;
```

Checked in this order, and the order is the sentence a person gets:

1. not a usable name (`OVERLAY_ENV_KEY_PATTERN`, `maxEnvKeyLength`) →
   `A variable name is letters, digits and underscores, and never starts with a digit.`
2. already on the list →
   `That name is already on the list.`
3. the list is full →
   `Sixteen names is the most Tortie will read for one agent.`
4. `ENV_REFUSED_EXACT` → `` `${name} decides which program or which startup file runs.` ``
5. `ENV_REFUSED_PATTERNS` → `` `${name} may not be named, because ${why}.` `` (the array's own `why`)
6. `ENV_PASSTHROUGH_REFUSED` → `` `${why}` `` (the array's own two-sentence reason, verbatim)
7. the agent's own `launch.env` sets it →
   `` `This agent already sets ${name} itself. Pick one source for each name.` ``

Rule 7 is not decoration: without it a session whose `FORCE_COLOR` comes from cursor's compiled row
could raise an `env-unresolved` notice saying the pane started WITHOUT a variable the pane actually
has, which is the dishonest report the overlay's own last check exists to prevent
(`src/main/config/overlay.ts:486-496`).

**`src/shared/settings.ts`** gains the non-throwing sanitizer the store calls:

```ts
export function sanitizeEnvPassthrough(
  raw: unknown,
  isLaunchable: (id: string) => boolean,
  agentEnvKeys: (id: string) => readonly string[]
): Partial<Record<LaunchableAgentId, string[]>>;
```

It drops an unknown id, a non-array, a non-string entry and every name
`envPassthroughRefusal` refuses, keeps the rest in order, and never throws. It is SILENT, like every
other sanitizer in that file: the shape layer bounds what a value may be, and the person hears about
a refusal at the door they typed it into.

`sanitizeSettings` calls it (`store.ts`, beside the `launchDefaults` block at `:452-462`) with
`LAUNCHABLE_SET.has` and a new one-line export from the registry:

```ts
/** The env keys an agent's COMPILED row sets. Empty for all but two. */
export function compiledLaunchEnvKeys(agentId: string): readonly string[];
```
in `src/main/agents/registry.ts` — a read of the compiled table only, never the overlay, so no import
cycle and no dependence on a configuration file.

### 2.4 How the names reach a launch

ONE new pure helper, next to the merge rule it feeds, in `src/main/sessions/launch-plan.ts`:

```ts
/**
 * The names this launch will read from the login shell: the agent row's own
 * `launch.envPassthrough` (agents.json, Phase 33) UNIONED with the names the
 * person set in Settings (Phase 269), row first, deduped.
 *
 * Returns undefined when both are empty, so the spec of an agent nobody has
 * configured is byte for byte what it was before this phase and no launch
 * pays for a feature it does not use.
 */
export function envPassthroughFor(
  rowNames: readonly string[] | undefined,
  settingsNames: readonly string[] | undefined
): string[] | undefined;
```

`src/main/sessions/create-local.ts` calls it ONCE, after the spec is resolved (`:445-449`) and
**before** the record is composed (`:553`), so the row carries the names and the existing restore
(`restore.ts:962`) re-resolves them with no edit at all:

```ts
// PHASE 269. The names the person set in Settings → Launch defaults, beside
// the flags they are a sibling of. getSettings() is the SEAL-CHECKED read, so
// a name an agent wrote into settings.json was already dropped before this
// line. agents.json stays the other route and both are honoured.
const chosen = envPassthroughFor(
  spec.envPassthrough,
  getSettings().envPassthrough[input.agent as LaunchableAgentId]
);
if (chosen !== undefined) spec.envPassthrough = chosen;
```

Nothing under this changes: one probe, the merge, the notice, the row.

**Restore reads the ROW and only the row, and that is deliberate.** A name added after a session was
created reaches that session's NEXT sibling, not that session's restore — the same contract the
launch-default flags already have (restore replays `rec.argv`). A later phase may widen it; this one
does not, and §7 records it as a refusal.

### 2.5 The candidate names — offering rather than making people hunt docs

`src/main/tmux/resolve.ts` gains a sibling of `captureLoginShellEnv`, **the same probe shape, line
for line**, and it is the only new spawn in the phase:

```ts
export interface CaptureEnvNamesResult {
  /** Names the login shell exports, sorted, de-duplicated. Never a value. */
  names: string[];
  /** True when the shell failed to spawn, timed out, or printed no markers. */
  probeFailed: boolean;
}

export function captureLoginShellEnvNames(
  options: CapturePathOptions = {}
): Promise<CaptureEnvNamesResult>;
```

- Script: `printf '%s' '<marker>'; awk 'BEGIN{for (k in ENVIRON) print k}' </dev/null; printf '%s' '<marker>'`
  with a fresh 8-byte nonce marker, the same reason `captureLoginShellEnv` uses one
  (`resolve.ts:429-434`). **`awk` prints the KEYS of `ENVIRON` and never a value**, which is what
  makes "names only" a property of the script rather than of a later filter. `env` and `printenv`
  are refused for this job because both print `NAME=VALUE`.
- `detached: true`, `trackGuardedChild`, settle on the second marker, independent deadline
  `PATH_CAPTURE_TIMEOUT_MS`, `killProcessGroup` on the deadline, deadline cleared on `close` and
  never on `exit`. Never rejects.
- Output cap `512 * 65 + 64 * 1024`, tail kept. Names filtered by `ENV_NAME_RE`, `<= 64` bytes,
  sorted, capped at 512.
- A shell that answers with no names is `{ names: [], probeFailed: false }`; only a spawn error, a
  deadline or an absent marker pair is `probeFailed: true`.
- One in-flight promise is shared by concurrent asks; **no cross-ask cache**, so a person who has
  just edited their shell profile and reopens the picker gets a fresh answer. Cost is one probe,
  measured at about 80 ms on the happy path for the PATH probe (`resolve.ts:246-262`).

**The value never enters a Tortie process on this path.** That is worth one sentence in the module
header, because it is the difference between this probe and the Phase 33 one.

### 2.6 The channel

Appended to `SettingsInvokeChannelMap` (`src/shared/ipc/app.ts:402-413`):

```ts
/** The names the person's login shell exports, as suggestions. NAMES ONLY. */
'settings:envCandidates': { req: [agentId: LaunchableAgentId]; res: EnvVarCandidates };
```

`EnvVarCandidates` lives in `src/shared/settings.ts`:

```ts
export interface EnvVarCandidates {
  /** Offerable names: refused names and the agent's own are already gone. */
  names: string[];
  /** True when the login shell did not answer at all. */
  probeFailed: boolean;
}
```

`GmuxSettingsExtras` (`app.ts:423-431`) gains
`envCandidateNames(agentId: LaunchableAgentId): Promise<EnvVarCandidates>`, `src/preload/index.ts`
gains the one line beside `agentFlagPresets` (`:195`), and
`src/main/settings/ipc.ts` registers the handler beside `agents:flagPresets` (`:113`): it calls
`captureLoginShellEnvNames()`, then filters with `envPassthroughRefusal(name, { existing, agentEnvKeys })`
against the CURRENT sealed settings for that agent and the agent's compiled env keys, so the picker
offers only names that will actually be accepted.

`AgentFlagCatalogView` (`src/shared/settings.ts`) gains `envKeys: string[]`, filled in
`getFlagCatalogViews` (`src/main/settings/ipc.ts:38-56`) from `compiledLaunchEnvKeys`, so the
renderer can say the rule-7 sentence without a second round trip.

**No name a person has not chosen is ever sent anywhere else, and no value crosses this channel.**

---

## 3. The delight — the surface and its copy, verbatim

All of it lives inside the group card that already exists
(`LaunchDefaultsSection.tsx:188-222`), under the preset rows, separated by the same 1px border the
preset rows already use. **No new section, no new window, no fifteen new affordances.** An agent
nobody configures costs one head row and one quiet line.

### 3.1 At rest, nothing named (the empty state)

```
┌──────────────────────────────────────────────────────────┐
│ ▣  Claude Code                                           │
│ ──────────────────────────────────────────────────────── │
│ [•] Skip permissions   --dangerously-skip-permissions    │
│     Runs without asking before each tool call            │
│ ──────────────────────────────────────────────────────── │
│ Shell variables                                 [ Add… ] │
│ Gets your shell's PATH and LANG. Add any others Claude   │
│ Code needs.                                              │
└──────────────────────────────────────────────────────────┘
```

**The one quiet line, verbatim:**

> `Gets your shell's PATH and LANG. Add any others Claude Code needs.`

It is TRUE as written and was checked against the measurement, not assumed: Tortie writes exactly two
variables into the tmux server globals, `LANG` and `PATH`, and no others
(research 123 §1.2; `supervisor.ts:549`, `:577`). The agent's display name is interpolated.

Head label: `Shell variables`. Button: `Add…`, `aria-label="Add a shell variable for Claude Code"`.

### 3.2 At rest, names set — compact, never a paragraph

```
│ Shell variables                                 [ Add… ] │
│ ⟨FIREWORKS_API_KEY ✕⟩  ⟨FIREWORKS_BASE_URL ✕⟩            │
│ Read from your shell at every launch. Never stored.      │
```

Chips reuse `.set-chip` (mono, `--bg-raised`, `settings.css:500-512`) with a new `.set-chip.envname`
modifier for the ✕ (`Codicon name="close" size="sm"`),
`aria-label="Remove FIREWORKS_API_KEY from Claude Code"`. **Removing never confirms**, exactly as
disabling a preset never confirms (`LaunchDefaultsSection.tsx:3-5`).

**The caption, verbatim:**

> `Read from your shell at every launch. Never stored.`

### 3.3 The name picker

`Add…` reveals, in the same row, a text field that OFFERS the person's own exported names:

```tsx
<input
  className="set-select"
  type="text"
  aria-label="Shell variable name for Claude Code"
  placeholder="Variable name"
  spellCheck={false}
  autoComplete="off"
  autoFocus
  list={`set-env-names-${agentId}`}
  value={draft}
  onChange={…}
  onKeyDown={/* Enter = ask, Escape = close the field */}
/>
<datalist id={`set-env-names-${agentId}`}>
  {candidates.names.map((n) => <option key={n} value={n} />)}
</datalist>
```

- **It is a text field and never a cage**, which is the Phase 174.1 ruling in this same window
  (`AppearanceSection.tsx:891-893`, pinned by `p1741-font-field.test.tsx:126`). A name the shell does
  not export — a key the person is about to add to their profile — is typed and accepted.
- The candidate list is fetched ON OPEN, once per opening, through
  `settings:envCandidates` (§2.5/§2.6). The field is typable while the answer is in flight; nothing
  spins and nothing blocks.
- **The list shows NAMES and never a value, and the surface says so**, in a line reserved under the
  field the way `.set-font-missing` reserves its line (`settings.css:196-222`: `visibility`, never
  `display`, so the field's box does not move while a person types).

**The reserved line, resting, verbatim:**

> `Names only. Tortie never reads a value into this window.`

**When the probe failed, verbatim:**

> `Your shell did not answer, so type the name.`

### 3.4 The refusal

The reserved line carries the refusal instead, in `--error`, the moment Enter or `Add` is pressed on
a name `envPassthroughRefusal` refuses. All six sentences come from the ONE shared function (§2.3),
so the file it is refused in cannot disagree with the file it is explained in:

| The person typed | What they read |
| --- | --- |
| `PI_CODING_AGENT_DIR` | `It moves where the agent keeps its sessions, and Tortie would keep looking in the old place and lose the conversation.` |
| `PI_CODING_AGENT_SESSION_DIR` | the same sentence (both share it in `ENV_PASSTHROUGH_REFUSED`) |
| `PATH`, `SHELL`, `ZDOTDIR`, … | `PATH decides which program or which startup file runs.` |
| `GMUX_SESSION_ID`, `DYLD_…`, `LD_…`, `TORTIE_…` | `GMUX_SESSION_ID may not be named, because it is how Tortie recognises the panes it owns, and a pane carrying another session's stamp is a session claiming an identity that is not its own.` |
| `2FAST`, `my-key`, 65 bytes | `A variable name is letters, digits and underscores, and never starts with a digit.` |
| a name already on the list | `That name is already on the list.` |
| the 17th name | `Sixteen names is the most Tortie will read for one agent.` |
| `FORCE_COLOR` for cursor | `This agent already sets FORCE_COLOR itself. Pick one source for each name.` |

The field keeps what was typed so it can be corrected. Nothing is written.

### 3.5 The confirm

An accepted name opens the confirm modal in the shape the section already uses
(`ConfirmDangerModal`, `LaunchDefaultsSection.tsx:84-141`) — same `modal-scrim`, same
`modal set-confirm`, same `role="alertdialog"`, same Escape handling, same two-button footer.
Builder B adds a second component, `ConfirmEnvModal`, rather than widening the first: the two say
different things and the danger modal's copy is pinned by its own tests.

**Title, verbatim:**

> `Pass FIREWORKS_API_KEY to every new Claude Code session?`

**Body 1, verbatim** (the `<code className="set-agent-cmd">` slot the danger modal uses for the
argv holds the NAME here):

> `FIREWORKS_API_KEY` ` is read from your login shell each time a session starts, and given to that session only.`

**Body 2, verbatim:**

> `Tortie keeps the name. It never stores the value — not in settings, not in the session database, not in a log.`

Footer: `Cancel` (`btn btn-secondary`) and `Add` (`btn btn-primary`, `autoFocus`). Not
`btn-destructive`: this turns no safeguard off, and spending the destructive style here would dull it
where it is earned.

**Every add confirms.** There is no per-agent acknowledgement and `dangerAcknowledged` is not touched:
unlike a flag, which comes from a fixed catalogue, each name is a separate decision about a separate
secret. Re-adding a name that was removed asks again, which is correct.

### 3.6 The failure he actually hit becomes loud

No new code. Once a name is set, an unset or empty variable at launch reaches the existing
`env-unresolved` notice (`create-local.ts:666-674`) and the existing toast
(`subscriptions.ts:520-537`): `"pi-1" started without FIREWORKS_API_KEY.`, sticky. Before this phase
that notice could not fire for anybody without an `agents.json`. **The probe in §5 must read that
toast**, because "silence is no longer a possible outcome" is a claim of this phase.

### 3.7 What the section caption gains

One clause on the existing first caption (`LaunchDefaultsSection.tsx:258-262`), because the section
is no longer only about flags:

> `Flags and shell variables applied to every new session of an agent. Sessions created from ⌘T show the flags pre-checked — turning one off there affects that session only.`

**Corrected in the fix round.** The clause first written here said "show these pre-checked", and
"these" read as the whole subject. It is false of the shell-variables half: `seededFlags`
(`CreateSessionModal.tsx`) and `agentPresetOptions` (`presets.ts`) read `settings.launchDefaults`
and nothing else, so a name is not offered in ⌘T, is not pre-checked there, and cannot be turned
off there. The clause is scoped to the flags, which is the half it is true of.

The second caption (`:263-267`) is the seal's own sentence, and it is the best sentence on this
surface, because the seal is what stops an agent on the machine granting itself a name. It was
scoped to "an option marked with a warning", and a shell variable name carries no warning marker,
so a reader scoped it away from the names. It now names them:

> `A flag marked with a warning, and every shell variable name, can only be set here. Tortie ignores one that was added by editing its settings file, because the agents you run can write that file too.`

---

## 4. The two builders — disjoint files

### BUILDER A — main, shared, gates, probe

**Owns, and nobody else touches:**

- `src/shared/agent-overlay.ts` — `EnvPassthroughContext`, `envPassthroughRefusal` (§2.3). APPEND
  only; do not restructure the existing arrays and **do not refactor
  `src/main/config/overlay.ts`'s `envPassthroughField`** (§7).
- `src/shared/settings.ts` — `envPassthrough` on `GmuxSettings`, `{}` in `defaultGmuxSettings`,
  `envNameKey`, `sanitizeEnvPassthrough`, `EnvVarCandidates`, `envKeys` on `AgentFlagCatalogView`.
- `src/shared/ipc/app.ts` — the channel, the bridge member.
- `src/preload/index.ts` — one line.
- `src/main/settings/store.ts` — the `env` member of `DangerState` through all five sites (§2.2), and
  the `sanitizeEnvPassthrough` call in `sanitizeSettings`.
- `src/main/settings/ipc.ts` — the `settings:envCandidates` handler, `envKeys` in
  `getFlagCatalogViews`.
- `src/main/tmux/resolve.ts` (+ the re-export in `src/main/tmux/index.ts` if one is needed) —
  `captureLoginShellEnvNames`.
- `src/main/sessions/launch-plan.ts` — `envPassthroughFor`.
- `src/main/sessions/create-local.ts` — the three-line merge at §2.4 and its comment. NOTHING else.
- `src/main/agents/registry.ts` — `compiledLaunchEnvKeys` ONLY. **No compiled row gains
  `envPassthrough`**, and the comment at `:230-241` is updated to say the route is now Settings OR
  `agents.json`, still never a compiled row.
- `src/main/harness/p269-env.ts` + its dispatch arm in `src/main/harness/index.ts`.
- `build/p269/probe-p269-env.mjs`, the `probe:p269` script in `package.json`,
  `HELPER_USER_FLOOR` in `build/assert-electron-teardown.mjs:195` (131 → 132, named in the commit
  body).
- `build/conformance-agents.mjs` + `build/agents-conformance-probe.mts` — Section 7 (§6).
- `docs/audits/contract-baseline.txt` — regenerated (§6).
- Tests: `src/main/settings/__tests__/p269-env-seal.test.ts`,
  `src/main/tmux/__tests__/p269-env-names.test.ts`,
  `src/main/sessions/__tests__/p269-env-merge.test.ts`.

**Bound by:**

- The merge is the ONLY edit to the create path. `paneEnvFor`, the probe, the notice, the record and
  the whole restore path are untouched.
- `getSettings()` is the only read — never `loadFile`, never the raw file. The seal is the point.
- `captureLoginShellEnvNames` copies the five properties of the Phase 33 probe and states in its
  header that a value never enters a Tortie process on this path.
- No secret value in any test, fixture, log line or comment. Test with names and a sentinel you
  invent; never a real provider key.

### BUILDER B — renderer only

**Owns, and nobody else touches:**

- `src/renderer/settings/LaunchDefaultsSection.tsx` — the `EnvNamesGroup` inside `AgentDefaultsCard`,
  the picker, the chips, `ConfirmEnvModal`, the one caption clause (§3).
- `src/renderer/settings/env-copy.ts` — NEW, every string in §3 in one module, the house pattern of
  `machines-copy.ts` / `arch-copy.ts` / `fold-copy.ts`.
- `src/renderer/settings/settings.css` — `.set-env-*`, `.set-chip.envname`, tokens only, reserved
  line by `visibility` (settings.css §3.3 lesson).
- `src/renderer/settings/settings-store.ts` — `envCandidates(agentId)` action + its per-open state;
  feature-detected exactly like `agentFlagPresets`.
- `src/renderer/settings/__tests__/p269-env-names.test.tsx`.

**Bound by:**

- The write is `update({ envPassthrough: { ...settings.envPassthrough, [agentId]: [...] } })` —
  wholesale, the same shape as `setEnabled` (`LaunchDefaultsSection.tsx:159-169`). The renderer never
  writes a value and never holds one.
- It imports `envPassthroughRefusal` from `@shared/agent-overlay` (Builder A's signature is fixed in
  §2.3; write against it) and re-implements NO part of the rule.
- Colors via tokens only. No DOM-drawn menu (the picker is a `<datalist>`, which is the platform's
  own, and is the precedent this window already set).
- **No native menu change** — this adds a control inside an existing Settings section, not a surface.
  Say so in the commit body.
- The card must not grow when an agent has no names: the empty line occupies the slot the chips will
  occupy, so the resting height is the same either way.

**The integrator** reconciles `src/shared/*` (append-only during the parallel build), runs the full
battery, regenerates the contract baseline if Builder A's regen drifted, and confirms the two
builders' files did not overlap.

---

## 5. The proof — run rather than read

### 5.1 `probe:p269` — the LIVE run (independent method (a))

`build/p269/probe-p269-env.mjs`, driven by a new harness mode `GMUX_SMOKE=p269-env`
(`src/main/harness/p269-env.ts`), launched through `build/electron-run.mjs`'s `withElectron` and
**never** `npm run shot`. Scratch profile, scratch `HOME`, scratch `ZDOTDIR`, and its own tmux socket
from `build/harness-socket.mjs --fresh gmux-p269-env`. Package script:

```
"probe:p269": "npm run build && node build/harness-socket.mjs --fresh gmux-p269-env 'node build/p269/probe-p269-env.mjs'"
```

The sentinel: name `P269_TEST_NAME`, value `P269_TEST_VALUE` plus a per-run random suffix. **Never a
real provider key, and the value never appears in the probe's own output.**

ARM 1 — **it reaches the pane** (Electron #1):
1. Write a scratch rc under the scratch `ZDOTDIR` exporting the sentinel.
2. Through the SHIPPED door — the real `settings:set` handler, so the seal is produced exactly as the
   Settings window produces it — set `envPassthrough: { <agent>: ['P269_TEST_NAME'] }`.
3. Create one real session for that agent (a plain-shell-shaped scratch executable is fine; the agent
   binary itself is not the subject).
4. Read the value INSIDE the pane and assert it is the sentinel.

ARM 2 — **it is written nowhere**, same Electron:
5. `tmux -L <scratch socket> show-environment -g` carries neither the name nor the value.
6. A byte scan of the whole manifest file finds the NAME and finds **no byte of the value**.
7. A byte scan of every file under the scratch profile's `logs/` finds no byte of the value.
8. A byte scan of `settings.json` finds the NAME (sealed state is opaque) and no value.

ARM 3 — **rotation, which is what the reporter was trying to achieve by restarting**:
9. Rewrite the scratch rc with a SECOND value.
10. Create a second session **without restarting Tortie and without restarting the tmux server**, and
    read the NEW value in the new pane. Assert the first session still holds the first value.

ARM 4 — **the notice is reachable**:
11. Set a name nothing exports, create a session, and read the sticky `env-unresolved` toast naming
    it. This is the sentence that was structurally unreachable before the phase.

ARM 5 — **THE ATTACK ON THE SEAL** (independent method (b), Electron #2, started only after #1 has
fully exited — never two at once):
12. With the app down, write `envPassthrough: { <agent>: ['P269_TEST_NAME'] }` straight into
    `settings.json` by hand, leaving the seal alone — the file an agent on the machine can write.
13. Boot Electron #2 on the same profile: `settings:get` comes back WITHOUT the name, `app.log`
    carries the `warnRejected` line naming `"<agent> P269_TEST_NAME"`, and a session created now does
    **not** carry the variable.
14. The ablation that stops this passing vacuously: the name written through the app's own door in
    ARM 1 **is** still present after this same restart and still reaches a pane.
15. A stale-seal replay: a seal covering `agentA P269_TEST_NAME` does not cover
    `agentB P269_TEST_NAME`.

`finally`, always: end the Electron (withElectron does), end this run's tmux server and unlink its
socket BY NAME, and remove every scratch directory the run created. Count what is left ONCE at the
end with
`ps -Ao pid,ppid,rss,comm | grep -E "[E]lectron|Tortie$|chrome_crashpad" | grep -v defunct`.

**SAFETY, absolute.** Only ever `tmux -L gmux` READ-ONLY, and only to count the operator's sessions
before and after so the run can prove it moved none. Never attach, never kill, never `pkill`, never
create on his server. Never touch `/Users/gdc/gmux`. Never remove a tilde or `HOME` path. Every
process started is ended in a `finally` that names it.

### 5.2 Unit tests (RED at the parent, green after)

- `p269-env-seal.test.ts` — modelled line for line on
  `src/main/settings/__tests__/arch-seal.test.ts` (same `vi.mock('electron')` keystore double,
  `freshStore()`, `writeByHand()`): a hand-written name is dropped on read and reported; the same
  name written through `updateSettings` survives a reload; a seal written before this phase (no `env`
  member) opens and covers no name; an unavailable keystore refuses to WRITE the name and warns; a
  seal covering agent A's name does not cover agent B's; a removed name cannot be replayed from a
  stale file.
- `p269-env-names.test.ts` — `captureLoginShellEnvNames` against the fake-shell harness that already
  exists (`src/main/tmux/__tests__/resolve.test.ts:348-362`): names come back and **no value does**,
  rc noise cannot forge a record, a shell that never exits is killed on the deadline with
  `probeFailed: true` and leaves no survivor, a shell that prints nothing gives
  `{ names: [], probeFailed: true }`.
- `p269-env-merge.test.ts` — `envPassthroughFor`: union, row-first order, dedupe, `undefined` for two
  empties, inputs not mutated.
- `p269-env-names.test.tsx` (renderer) — the empty line's exact sentence, the chips with their
  remove labels, the field is an `<input>` with a `list` attribute and an `<option>` per candidate
  (mirroring `p1741-font-field.test.tsx`), each refusal sentence for its name, the confirm modal's
  two body lines, and that removing renders no modal.

---

## 6. Gates for this commit

- Minimum: `npm run typecheck && npm run build && npm run smoke:t1`. Integrator runs the full battery
  (`test`, `smoke`, `smoke:t3`, `package`).
- **`conformance:agents` — MOVES.** `src/main/agents/registry.ts`, `src/main/manifest/agents.ts`'s
  neighbours, `src/main/config/**` and `src/renderer/state/agents.ts` are in its trigger set, and the
  phase touches the registry. Section 5 (Phase 33) is UNCHANGED. **Add Section 7 — the settings
  route (Phase 269)**, with these assertions, all pure, spawning nothing:
  1. Every name in `ENV_REFUSED_EXACT`, every `ENV_REFUSED_PATTERNS` prefix probed as `<prefix>X`,
     and both `ENV_PASSTHROUGH_REFUSED` names are refused by `envPassthroughRefusal` with a non-empty
     sentence. **Derived from the arrays**, so a denylist entry added later is covered with no edit.
  2. `A_B9` and `FIREWORKS_API_KEY` are accepted; a lower-case name, a leading digit, a 65-byte name
     and `''` are refused.
  3. The 16th name for one agent is accepted and the 17th is refused.
  4. A duplicate is refused, and the agent's own compiled env key is refused — driven from
     `compiledLaunchEnvKeys('cursor')`, asserted NON-EMPTY first so the row cannot go vacuous if that
     row ever loses its `launch.env`.
  5. `sanitizeEnvPassthrough` drops an unknown id, a non-array, a non-string entry and every refused
     name, keeps the good ones in order, and never throws.
  6. `envPassthroughFor` unions row-first, dedupes, answers `undefined` for two empties and mutates
     neither input.
  7. **No compiled registry row sets `launch.envPassthrough`** — asserted over `AGENT_REGISTRY`, so
     the Phase 33 promise survives the arrival of a second route.
  8. Every `AgentFlagCatalogView` carries `envKeys`, equal to that agent's compiled `launch.env` keys.
  Print the rows in the existing table style; a section that cannot import reports SKIPPED OUT LOUD
  the way Section 5 does, never a silent pass.
- **`gate:contract` — regenerate the baseline** with
  `node build/contract-inventory.mjs --out docs/audits/contract-baseline.txt` in the SAME commit
  (obligation 3): one new invoke channel, one new preload member, one new harness smoke mode. The
  commit body says which lines moved and why.
- **`conformance:resume:capture`** (~16 s) — `agents/registry.ts` is in its trigger set. Must stay
  green; nothing about resume moves.
- **`gate:electron` and `gate:background`** — a new `build/` script starts an Electron.
  `HELPER_USER_FLOOR` rises 131 → 132 in the same commit (obligation 1), and the body names the file.
- **`gate:checks`** — new `*.test.ts` files under `src/` are added.
- Not triggered, and do not run them: `conformance:hue` (13 min, no appearance file moves),
  `conformance:credentials`, `conformance:logins`, `conformance:machines`, every arch gate.
- `probe:p269` runs ONCE for the phase. It is not in the commit battery.

---

## 7. What is NOT in this phase

- **No change to the process model, and no session spawned outside the tmux server.** The
  independence issue 20 asks for already exists (research 123 §1.1), and the server's lifetime is the
  durability design.
- **No injection into the tmux server environment, ever.** Research 41's refusal: keys readable by
  every pane and every same-user process, and an agent that edits `.zshrc` changing every session's
  credentials with no confirm.
- **No login-shell wrapping of agent launches**, and no `-il`. PR #21 is not merged; research 123 §4
  measured 68 ms → 1714 ms and four red tests.
- **No variable passed through by default, for any agent, ever.** No compiled row gains
  `envPassthrough`; naming one stays a decision a person confirms, once per name.
- **Tortie still never writes `agents.json`** (`src/main/config/guide.ts:25`). The names live in
  Tortie's own settings; `agents.json` remains the power-user route and keeps working unchanged.
- **No refactor of `src/main/config/overlay.ts`'s `envPassthroughField`.** Its sentences are pinned by
  `conformance:agents` Section 5 and by the guide tests. One SHARED denylist feeds both routes; the
  overlay's own copy does not move.
- **No remote support.** `remote-sessions.ts` has never read `envPassthrough` and does not start now:
  the values come from THIS Mac's login shell. A later phase may take it; this one names the limit.
- **Restore does not union the current settings.** It reads the row, which is what the session was
  created with — the same contract the launch-default flags have.
- **No `dangerAcknowledged` entry and no confirm-once for names.** Every add confirms.
- **No new Settings section, no new window, no native-menu change**, and no widening of
  `ConfiguredAgents`'s early return — research 123 §3's other two suggestions are not this phase.
- **No value anywhere.** Not in the UI, not in a log, not in a test fixture, not in the manifest, not
  in the confirm record, not in a report. Names only, and a length is a value.
