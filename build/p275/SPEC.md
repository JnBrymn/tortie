# Phase 275 — the keys an agent needs, set once

**The contract for the builders, the integrator and the verifier.** It decides. Where a researcher
offered two answers, one of them is written here and the other is named as refused, with the reason.
Read `docs/BACKLOG.md` "## Phase 275" first — this file is subordinate to it and adds only the
decisions the entry left to the spec.

Subject: `feat(settings): shell variables set once, for every agent`
First body line: `Phase 275: set the keys once`
Semver: minor. Tier 3, because the seal is what moves.

---

## 0. The three corrections the research made to the brief, adopted here

These are load-bearing and every section below assumes them.

1. **There are TWO mechanisms and the entry runs them together.** The **confirm hash**
   (`executionHash`, `src/main/config/confirm.ts:255-257`) covers `agents.json` rows and **does not
   gain the shared set**. The **seal** (`sealDangerState`, `src/main/settings/store.ts:427-438`) is
   what covers the Settings route; it is not a hash, it is a `safeStorage` ciphertext over
   `JSON.stringify(dangerStateOf(settings))`. When the entry says "the hash moves", the thing that
   must move is the sealed TEXT. §1 and §8 say both, separately.

2. **`isDangerStateEmpty` (`store.ts:264-272`) is the single most important line in this phase.**
   `getSettings` short-circuits on it at `:839` and returns the file **verbatim, without opening the
   seal**. It is a boolean expression over an object, so adding a field to `DangerState` leaves it
   **compiling and wrong**. A `settings.json` whose only danger value is a shared name would be
   admitted UNSEALED — a complete bypass of layer one. Rule 7 is that line and rule 31 is the
   ablation that proves it was not forgotten.

3. **`filterRemoteEnvNames` caps the union at 16 and truncates SILENTLY**
   (`src/main/machines/remote-env-carriage.ts:125-134`, called from `remoteEnvNamesFor` at
   `remote-env-probe.ts:250`). The comment at `remote-env-carriage.ts:86-92` calling it "the cap the
   settings door already enforces" is already untrue with two sources and becomes badly untrue with
   three (3 × 16 = 48 possible). §4.3 rules on it.

---

## 1. The shared seal key

### 1.1 The shape, decided

`DangerState` (`src/main/settings/store.ts:184-227`) gains a **separate, non-optional field** holding
**bare names**:

```ts
/**
 * Every shell variable name on the SHARED list (Phase 275) — a BARE name, with
 * no agent id in front of it, sorted so the state seals to one text.
 *
 * A SEPARATE FIELD rather than more entries in `env`, for the reason `arch`
 * is a separate field from `fold` twenty lines above: agreeing to one must
 * never be replayable as agreeing to the other. Here the two agreements are
 * different in SCOPE — `env` covers one agent, this covers every agent Tortie
 * can launch, including agents installed later — so a per-agent agreement
 * replayed as a shared one is exactly the widening this phase exists to make
 * a person ask for out loud. An old seal has no `envShared` member at all,
 * which opens as [] and fails safe to no shared name.
 */
readonly envShared: readonly string[];
```

And a display-only key text in `src/shared/settings.ts`, beside `envNameKey` (`:859-861`):

```ts
/**
 * How a shared name is WRITTEN when it has to be read beside a per-agent key —
 * in the rejection log line and in the rejection the Settings window draws.
 *
 * IT IS NOT A SEAL KEY. The seal holds bare names in their own field
 * (`DangerState.envShared`), and this prefix is never put into that field,
 * never compared against it, and never parsed back apart. It exists so
 * `warnRejected` can print "* ANTHROPIC_API_KEY" next to "claude FOO" and a
 * person can tell which list lost a name.
 */
export function envSharedKey(name: string): string {
  return `* ${name}`;
}
```

### 1.2 Why a separate field and not a new entry in `env`

This repository already decided this question twice and both precedents are in the same file.
`store.ts:206-213` says it for `arch` against `fold`: *"A separate field from `fold` on purpose: the
two choices spawn different passes, so agreeing to one must never be replayable as agreeing to the
other."* And `defaults`/`acks` are both `dangerKey` strings of **identical shape**, kept apart only by
being compared against different Sets (`:285-286`, `:316`, `:337`). Field separation is already
load-bearing in this module. It makes cross-admission **impossible by construction** rather than by
string discipline, which is the difference between a proof and a convention.

### 1.3 The proof that no agent id can produce the shared key, and no per-agent key can be
mistaken for it — two independent belts

**Belt one, structural, and it holds even if the strings were identical.**
`withSealedDangerState` (`store.ts:282-360`) builds `sealedEnv = new Set(sealed.env)` and will build
`sealedShared = new Set(sealed.envShared)`. A per-agent name is tested **only** against `sealedEnv`
(`:331`); a shared name **only** against `sealedShared`. Neither Set is consulted for the other kind,
anywhere, on any path. A name sealed one way cannot be admitted the other way.

**Belt two, textual, and it survives a later round merging the fields.**
`envNameKey(agentId, name)` returns `agentId + ' ' + name`. `sanitizeEnvPassthrough` refuses any name
that fails `OVERLAY_ENV_KEY_PATTERN = '^[A-Za-z_][A-Za-z0-9_]{0,63}$'`
(`src/shared/agent-overlay.ts:390`, tested first at `:531-537`), and that pattern **forbids a space**.
So:

- every per-agent seal key contains **exactly one** space;
- every shared seal key (a bare name) contains **none**;
- the two key spaces are disjoint, with no shared member possible.

**And the `* ` display form is provably unproducible too**, which matters because the log line mixes
both. The id half of a seal key is **never pattern-matched** — it is drawn from a **closed compiled
set of 13 literals**. `LaunchableAgentId` is those literals (`src/shared/types.ts:946-961` minus the
two IDE rows), `LAUNCHABLE_AGENT_IDS` is the registry rows filtered by `launchable`
(`src/main/agents/registry.ts:1724-1727`), and `sanitizeSettings` admits a key only when
`LAUNCHABLE_SET.has(id)` (`store.ts:531`). The 13 are `claude cursor codex gemini droid deepseek
antigravity muse qwen pi omp grok opencode`. **Every one begins with a lowercase letter**, so no
`envNameKey` output can begin with `*`. As a second belt, `OVERLAY_ID_PATTERN = '^[a-z][a-z0-9-]{0,31}$'`
(`agent-overlay.ts:381`) is the same shape, so even if a later phase let a configured agent id into
the settings map, it still begins `[a-z]`.

**AN AGENT ID IS ITSELF A LEGAL VARIABLE NAME, and the disjointness deliberately does not rest on its
not being one.** A verifier's first assertion failed on exactly this and read it as a dead limb in the
argument above — it is not one, because nothing above claims otherwise: the ids' shape is used here for
the `*` question alone (they begin `[a-z]`, so no `envNameKey` output can begin `*`), and the
disjointness rests on the SPACE. Measured: `new RegExp(OVERLAY_ENV_KEY_PATTERN).test('claude')` is
**true**. It is written down so a later round does not reach for the stronger claim, which is false.

One fact that simplifies everything: **no seal key is ever split back into parts.** There is no
`split(' ')` over a seal key anywhere in `src/main/settings`, `src/main/config` or `src/shared`. Keys
are compared as opaque whole strings, so a key only has to be unambiguous, never parseable.

### 1.4 The two refusals, as rules a gate asserts

- **R-A. A shared name sealed per-agent is dropped.** Put `claude ANTHROPIC_API_KEY` in the seal's
  `env` and `ANTHROPIC_API_KEY` in `settings.envPassthroughShared`. The shared list comes back
  **empty** and `ANTHROPIC_API_KEY` is reported as rejected. (Rules 27, 29.)
- **R-B. A per-agent name sealed as shared is dropped.** Put `ANTHROPIC_API_KEY` in the seal's
  `envShared` and `{"claude":["ANTHROPIC_API_KEY"]}` in `settings.envPassthrough`. The claude list
  comes back **empty** and `claude ANTHROPIC_API_KEY` is reported as rejected. (Rules 28, 29.)

Both run in `src/main/settings/__tests__/p275-env-shared-seal.test.ts` against the **shipping**
`withSealedDangerState`, using the `safeStorage` mock already written at
`src/main/settings/__tests__/p269-env-seal.test.ts:41-65`.

---

## 2. The confirmation wording

All of it lives in `src/renderer/settings/env-copy.ts`, under that file's own two rules (names only;
just enough words). **The refusals stay in `envPassthroughRefusal`** — the file that refuses must not
be able to disagree with the file that explains.

### 2.1 The shared confirm — the sentences, verbatim

```ts
/**
 * PHASE 275 — the shared confirm's title.
 *
 * "every agent" and not "every session": the per-agent title one function down
 * already says "every new <Agent> session", and the ONE thing this sheet has
 * to make a person notice is that the AGENT is no longer the boundary. The
 * breadth, including agents that do not exist yet, is body line 1 and not the
 * title, because a title that carries a subordinate clause stops being read.
 */
export function envSharedConfirmTitle(count: number): string {
  return count === 1
    ? 'Pass this shell variable to every agent?'
    : `Pass ${count} shell variables to every agent?`;
}

/** Body 1, under the names. THE SENTENCE THIS PHASE EXISTS TO MAKE A PERSON READ. */
export const ENV_SHARED_CONFIRM_BODY_1 =
  'Every agent Tortie launches gets these, including agents you install later.';

/** Body 2. The same promise the per-agent sheet makes, in the plural. */
export const ENV_SHARED_CONFIRM_BODY_2 =
  'Each is read from your login shell when a session starts, and given to ' +
  'that session only.';

/** Body 3. Names only, said at the last place a person can still say no. */
export const ENV_SHARED_CONFIRM_BODY_3 =
  'Tortie keeps the names. It never stores the values — not in settings, not ' +
  'in the session database, not in a log.';
```

**Three body lines is the cap on this sheet, and the shared sheet is the only surface in this phase
allowed three.** A confirm is the one place in Launch defaults where a sentence is earned (the
resting faces get a label and one line, `env-copy.ts:16-22`), and line 1 is not decoration: it is the
whole of layer two moving.

### 2.2 The per-agent confirm — kept, and made plural

`envConfirmTitle(name, agentName)` (`env-copy.ts:83-86`) is **kept byte for byte** for the
one-name case, because `__tests__/p269-env-names.test.tsx` pins it and nothing about a single
per-agent add has changed. It gains a plural sibling, because the picker can now add several at once:

```ts
/** PHASE 275 — the same sheet when the picker committed more than one name. */
export function envConfirmTitleMany(count: number, agentName: string): string {
  return `Pass ${count} shell variables to every new ${agentName} session?`;
}
```

`ENV_CONFIRM_BODY_1` and `ENV_CONFIRM_BODY_2` (`env-copy.ts:88-96`) are kept unchanged for one name
and joined by plural siblings `ENV_CONFIRM_BODY_1_MANY` / `ENV_CONFIRM_BODY_2_MANY` that say
"Each is read…" and "Tortie keeps the names… never stores the values". No third line on the per-agent
sheet: its breadth has not changed and it has nothing extra to say.

### 2.3 The names are drawn, never counted only

Both sheets draw **every name** as a `<code class="set-agent-cmd">` chip in a wrapped row above body
line 1. The entry's words: *"the confirmation names every variable in it, because a person agreeing
to a list must be able to read the list."* The count in the title and the list in the body are the
same fact said twice on purpose — the title is what a person skims, the chips are what they check.
Sixteen is the cap (§3.4), so the list can never be longer than sixteen short chips.

### 2.4 What the confirm never says

No value, no length of a value, no "found in your shell" and no "not found in your shell" — the
picker already said that on the row (§5.5), and repeating it inside a confirm would turn a decision
sheet into a shell report. `btn-primary`, never `btn-destructive` (`env-copy.ts:98-104`): this turns
no safeguard off.

---

## 3. The settings shape

### 3.1 Where it lives and what it is

`src/shared/settings.ts`, in `GmuxSettings`, **immediately after** `envPassthrough` (`:62`):

```ts
/**
 * The shell variable NAMES every agent gets (Phase 275), beside the per-agent
 * map above. Keyed by nothing: one list, every launchable agent, including
 * agents installed after the name was confirmed.
 *
 * IT DOES NOT REPLACE THE MAP ABOVE, and a phase that deletes that map to
 * simplify the drawing has removed the only reason the per-agent design was
 * defensible. A launch reads the UNION (see @shared/launch-env), so a person
 * who set both meant both.
 *
 * SEALED IN ITS OWN FIELD — `DangerState.envShared` in
 * src/main/settings/store.ts, never in `env`. The agreement this list carries
 * is wider than a per-agent one, so a per-agent agreement must never be
 * replayable as this one.
 *
 * VALUES ARE STORED NOWHERE, exactly as above.
 */
envPassthroughShared: string[];
```

**Default: `[]`**, in `defaultGmuxSettings` beside `envPassthrough: {}` (`:811`). Empty at install is
not a nicety — it is what keeps `envPassthroughFor` returning `undefined` for a person who has
configured nothing, which is what keeps the login-shell probe unspawned (§4.4).

### 3.2 The sanitizer, and exactly what it does to a malformed list

A **new** function in `src/shared/settings.ts`, beside `sanitizeEnvPassthrough` (`:887-909`). It is
new rather than a widening because `sanitizeEnvPassthrough` takes a MAP and asks `agentEnvKeys(id)`,
and a shared list has no agent — and because that function's documented silence (`:880-885`) is a
contract Phase 269 wrote and this phase does not edit.

```ts
export function sanitizeEnvPassthroughShared(
  raw: unknown,
  sharedRefusedEnvKeys: readonly string[]
): { names: string[]; refused: string[]; refusedOver: number; unnamed: number };
```

**`refusedOver` IS THE FIX ROUND'S, and it closes a hole this section did not consider.** Every bullet
below is about the CONTENT of an entry and none is about the COUNT of them. `names` was always bounded,
because the cap counts it; `refused` was not, because it runs over the RAW file, whose length is chosen
by whoever wrote the file — which since this phase is the exact actor layer one of the seal names. The
verified build pushed every refused entry into it, `store.ts` copied the list whole into the
`settings:envRejections` answer, and `env-copy.ts` joined the lot into ONE `<p>`. Measured against the
shipping store on 2026-09-16, with a 53-byte name: 1,000 names gave a 57,932-byte line, 50,000 gave
2,988,932 bytes, and 200,000 gave 12,088,932 bytes at a 115 ms load; a second re-derivation the same
day with a short name read 11,888 bytes at 1,000. Nothing unsafe was delivered — every echoed byte had
passed the alphabet — but **a rendering primitive is a size as well as a character set**. The echo now
stops at `OVERLAY_LIMITS.maxEnvPassthroughNames`, the number this domain already spells, and the rest
is a count. It is separate from `unnamed` because the two say different things: `unnamed` means "that
was not a variable name", `refusedOver` means "there were more and Tortie stopped listing them".
(Rule 16b.)

**The decisions, each one a rule below:**

- **The unit that is dropped WHOLE is one NAME.** A name is kept entirely or dropped entirely. It is
  never trimmed, case-folded, truncated, de-duplicated into something else, or otherwise repaired
  into an acceptable shape. (Rule 14.)
- **The FIELD is dropped whole when it is not an array** — `null`, an object, a string, a number all
  give `{ names: [], refused: [], unnamed: 0 }`, which is the default. (Rule 14.)
- **One bad entry never denies the rest.** Dropping the whole list because one entry is junk is a
  denial an agent with write access could author in one line, and it would take away every key a
  person set. Per-name dropping fails closed per name and is the treatment `sanitizeEnvPassthrough`
  already gives. (Rule 15.)
- **A refused name is REPORTED ONLY WHEN IT IS SAFE TO DRAW.** `refused` carries the entry only when
  the string passes `OVERLAY_ENV_KEY_PATTERN` — letters, digits and underscore, at most 64 bytes, so
  it is provably safe in a log line and in the DOM. Anything else (a non-string, a 4 KB blob, a
  string with a newline in it) increments `unnamed` and is **never echoed**. That is the difference
  between "never silently dropped" and "hand an attacker a rendering primitive". (Rule 16.)
- **It never throws.** (Rule 14.)

`sharedRefusedEnvKeys` is the **union of every launchable agent's compiled `launch.env` keys**,
computed once in `store.ts` from `LAUNCHABLE_AGENT_IDS` and `compiledLaunchEnvKeys`
(`registry.ts:1724-1727`, `:1762-1766`) and exported for `ipc.ts` to read, so the number is spelled
once. Today it is exactly two names, `FORCE_COLOR` (cursor, `registry.ts:598`) and
`GROK_PRIVACY_NOTICE_ROLLOUT` (grok, `registry.ts:1456`). **Refusing them on the shared list is the
honest answer**: the shared list reaches cursor too, and a shared `FORCE_COLOR` would make the
`env-unresolved` notice say a cursor pane started WITHOUT a variable that pane actually has — the
exact dishonesty `envPassthroughRefusal`'s last check exists to prevent (`agent-overlay.ts:519-524`).
(Rule 17.)

### 3.3 Where the invalid row becomes VISIBLE

The shape layer stays silent — it cannot tell who wrote the file, and Phase 269 wrote that down. The
**seal layer** and the **shape layer's return value** are what surface, and the phase adds one
read-only channel so the Settings window can draw them:

```
'settings:envRejections': { req: []; res: EnvRejections }

interface EnvRejections {
  /** Shared names THE SEAL dropped on the last read, bare, safe to draw. */
  shared: string[];
  /** Shared names THE SHAPE LAYER dropped, bare, safe to draw, capped at 16. */
  sharedUnread: string[];
  /** Shape-layer drops past the echo cap: counted, never echoed (§3.2). */
  sharedUnreadOver: number;
  /** Per-agent names the seal dropped on the last read, by agent id. */
  perAgent: Partial<Record<LaunchableAgentId, string[]>>;
  /** Entries dropped that could not be named safely (§3.2). */
  unnamed: number;
}
```

**THE TWO LAYERS GET TWO FIELDS, AND THE FIX ROUND IS WHY.** The build the verifiers attacked held the
two layers apart in `store.ts` — with a comment saying in as many words that they "are not
interchangeable" — and then concatenated them one line before the answer left the process, so the
window drew the SEAL's sentence over both. Two independent readings of the same defect:

- a hand-written sealed `settings.json` holding `PATH` plus twenty junk names drew **21** names under
  *"Ignored, because they were not added here"*, while `app.log` — which sees the seal layer alone —
  named **12**. The window and the log disagreed about what had happened;
- sixteen shape-valid junk names placed **ahead** of a name the seal DOES cover push the real name out
  at the SHAPE layer, because the cap counts kept-so-far in file order. The card then drew that name
  **first** and said it had never been added here. It had. Measured: `kept=[]`,
  `rejections.shared=["V_REAL","V_JUNK_0",…]`.

Nothing unsafe was delivered on either reading — the names were dropped, the cap still failed closed,
and no value moved — so this is an honesty defect, on the one surface whose entire purpose is to say
honestly why a key stopped arriving. It is repaired where the two answers are still apart rather than
after they are joined, and each half gets its own sentence in §6.4. (Rule 20b.)

Three facts make it safe and make it honest:

1. **Every name in `shared`/`perAgent` already passed `OVERLAY_ENV_KEY_PATTERN`.** Seal rejection
   happens in `withSealedDangerState`, which runs over the **sanitized** settings, so no hostile byte
   can reach the DOM through this channel. (Rule 20.)
2. **The log line stays.** `warnRejected` (`store.ts:771-778`) keeps naming every key, and a shared
   one is printed through `envSharedKey` so `* ANTHROPIC_API_KEY` reads differently from
   `claude FOO`. (Rule 19.)
3. **The list is the one computed at the last seal check of this load, and the next write clears
   it** — because `persistSettings` writes the seal-filtered settings back, so the dropped names are
   gone from `settings.json` and saying they are still ignored would be a lie. (Rule 21.)

Drawn as one line per card (§6.4).

### 3.4 The cap: TWO CAPS, ONE NUMBER

**Shared gets its own 16. Per-agent keeps its own 16. They do not share a budget.**

The cap is a property of a DOOR, not of a launch. A single 16 split between the two lists would mean a
shared name silently shrinks what an agent may add on its own card — which takes away per-agent
narrowing at exactly the moment the phase promises to keep it — and a person who filled the shared
list would meet a per-agent refusal about a list they are not looking at. Refused.

The number is the existing constant, `OVERLAY_LIMITS.maxEnvPassthroughNames = 16`
(`agent-overlay.ts:372`), read at a **fourth** door (the three today are the generated JSON schema's
`maxItems` at `:839`, the overlay validator `envPassthroughField` at `overlay.ts:438-445`, and
`envPassthroughRefusal` at `:542-545`). One number, four doors. (Rule 18.)

**The refusal sentence is false at the new door and is therefore parameterised.**
`envPassthroughRefusal`'s cap sentence reads *"Sixteen names is the most Tortie will read for one
agent."* (`agent-overlay.ts:544`). `EnvPassthroughContext` gains `scope?: 'agent' | 'shared'`,
defaulting to `'agent'` so every existing call site is unchanged, and the shared branch says:

> `Sixteen names is the most Tortie will read for every agent.`

Both sentences stay inside `envPassthroughRefusal`. They do **not** move to `env-copy.ts`, for the
reason that file itself gives at `:23-27`. (Rule 18.)

**Phase 269's recorded cap limit, restated for the shared list and NOT fixed here.**
`sanitizeEnvPassthrough` passes `existing: kept`, so the cap counts kept-so-far **in file order**,
before the seal is consulted: sixteen shape-valid junk names ahead of a legitimate one push it out at
the shape layer. The shared sanitizer has the same property and it is **worse in reach and the same in
kind** — sixteen junk names at the front of the shared list deny every agent at once where today they
deny one. It is still denial and never escalation: the seal then rejects all sixteen and no value is
delivered. The ORDERING is **recorded as a limit, not repaired**, because repairing it means reordering
what a person's own file says, and a sanitizer that reorders is a sanitizer that admits a list nobody
wrote. (Rule 22 records it; §10 refuses to fix it here.)

**THE REPORTING HALF WAS NOT A LIMIT, IT WAS A DEFECT, AND THE FIX ROUND REPAIRED IT.** This paragraph
originally predicted that "the rejection names the junk rather than the name that went missing". A
verifier drove it and found the opposite: it names **both**, and mislabels the one that matters. The
confirmed name lands in the SHAPE layer's report, the verified build concatenated that with the seal's,
and the card told a person their own sealed key "was not added here". Reporting is the half this phase
ADDED, so it is this phase's to get right — see §3.3 and rule 20b. What remains a limit is only the
file-order cap itself.

---

## 4. The union

### 4.1 The exact new signature

`src/shared/launch-env.ts`:

```ts
export function envPassthroughFor(
  rowNames: readonly string[] | undefined,
  settingsNames: readonly string[] | undefined,
  sharedNames: readonly string[] | undefined
): string[] | undefined {
  const union = [
    ...new Set([
      ...(rowNames ?? []),
      ...(settingsNames ?? []),
      ...(sharedNames ?? [])
    ])
  ];
  return union.length === 0 ? undefined : union;
}
```

**Order: row, then per-agent settings, then shared.** Decided, and the reason is that the existing
two-source order **does not move by one byte** — every person who has a row and a per-agent list gets
the identical list in the identical order they got at the parent, so no argv order, no manifest row
and no notice list changes for anybody who does not use the new feature. The third source joins on the
end, on the rule the file already states: *"Neither shadows the other, because a person who has set
both meant both."*

The parameter is **optional in position but not in type** — it is `readonly string[] | undefined` like
its two siblings, and the third argument is passed explicitly at every call site rather than defaulted,
so a call site that forgets it is a compile error rather than a quiet regression to two sources.
(Rule 23.)

`undefined` for three empties is load-bearing and §4.4 says why.

### 4.2 The proof that `src/shared/launch-env.ts` still imports nothing

**Measured at `74d51848`: the file is 53 lines with `0` import statements.** A third parameter of
`readonly string[] | undefined` needs none. The three things a builder is likely to reach for, each of
which WOULD break it, are refused here by name:

- taking the whole settings object instead of a name list → needs `GmuxSettings` from `./settings`. **Refused.**
- keying the shared set by agent inside the function → needs `LaunchableAgentId` from `./types`. **Refused.**
- enforcing the 16-name cap in the union → needs `OVERLAY_LIMITS` from `./agent-overlay`. **Refused**, and it is
  also why the union is deliberately **uncapped**: the cap belongs to the doors (§3.4), and a literal
  `16` in this file would be a second spelling of a number this repository spells once.

**Nothing mechanical protects that rule today.** `build/assert-import-boundaries.mjs:91` allows
shared→shared, `build/assert-no-runtime-cycles.mjs:157-173` skips type-only imports, and no gate and
no test names this file. So the phase gives the rule a gate: `conformance:agents` asserts the file's
import count is **zero**. (Rule 24.)

### 4.3 The three call sites, and the remote cap

**Local create** — `src/main/sessions/create-local.ts:476-480`:

```ts
const settings = getSettings();
const chosenPassthrough = envPassthroughFor(
  spec.envPassthrough,
  settings.envPassthrough[input.agent as LaunchableAgentId],
  settings.envPassthroughShared
);
```

**Both remote paths** — one edit, at `remoteEnvNamesFor`
(`src/main/machines/remote-env-probe.ts:239-251`), which is read by the remote create
(`remote-sessions.ts:1553`) and the remote restore (`remote-restore.ts:467-470`).

**Local restore** — `src/main/restore/restore.ts:960-965`, **and this is a divergence the phase
closes rather than inherits.** Today that path replays `rec.envPassthrough` off the manifest row and
nothing else, and `envPassthrough` is **write-once** (deliberately excluded from
`ManifestSessionPatch`, `src/main/manifest/codecs.ts:264-290`). The remote restore re-reads the
settings union **by design** and says so in as many words (`remote-restore.ts:461-466`). So at the
parent, a name added in Settings after a session was created reaches that session on a **remote**
restore and never on a **local** one.

**Ruling: the local restore reads the union too** — the row, the per-agent settings list and the
shared list — so a restored local session and a restored remote session carry the same names. Three
reasons, and all three are needed:

1. *Remote feels identical to local* is the operator's standing rule and this is the one place in the
   env path where it is not true.
2. The reporter's own sentence is *"applies to any agent session that needs keys"*. A restored session
   is a session that needs keys, and a shared key that works only on sessions created after he set it
   is not what he asked for.
3. It is **strictly safer than what is there now**, not riskier: the names it adds come from the
   SEALED settings, while the names it already replays come from the manifest row, which is not
   sealed (Phase 269's second recorded limit). The row is kept in the union because it is the only
   record of an `agents.json` name from a session created under a different `agents.json`.

**The remote cap, ruled.** `REMOTE_ENV_NAMES_MAX` stays at **16** and the far-side probe script,
`REMOTE_ENV_ALLOWED` and the transport do not move. But with three sources the union can reach 48, and
`remoteEnvNamesFor` caps it at `:250` **before** `probeRemoteEnvNames` gets it, so the names past 16
never reach the `dropped` list that `probeRemoteEnvNames` already computes and already reports
(`remote-env-probe.ts:181-198`) — they vanish with nothing said, on remote only. That is a silent
remote/local divergence this phase would create.

**The fix uses Phase 270's own machinery and adds no new one.** `remote-env-probe.ts` gains one pure
export beside `remoteEnvNamesFor`:

```ts
/** The union's names this rung will NOT carry — the cap's overflow and the alphabet's refusals. */
export function remoteEnvNamesDroppedFor(
  entry: LaunchableEntryLike | null,
  agent: LaunchableAgentKind
): string[];
```

built from `droppedRemoteEnvNames` (`remote-env-carriage.ts:137-140`), and the remote create
(`remote-sessions.ts:1793-1803`) and the remote restore merge its answer into the `names` the
`env-unresolved` notice already draws. A person over the cap is told **which names did not travel**,
by name, once per session. (Rules 25, 26.) The stale comment at `remote-env-carriage.ts:86-92` is
corrected in the same commit to say what is now true: the cap is asked a **second** time here over a
union three doors can fill, and what it drops is reported rather than assumed impossible.

### 4.4 What it costs a person who configured nothing, and what it costs once one name exists

**Nothing, as long as the shared list is empty by default** — and it is, because the seal drops
anything a human did not confirm and `defaultGmuxSettings` gives `[]`. The union of three empties is
still `undefined`, so `spec.envPassthrough` is untouched (`create-local.ts:480`), the local probe at
`:622-626` spawns nothing, and on the remote side `passthrough.length === 0` still means no
`probeRemoteEnvNames`, no `REMOTE_ENV_SLOT` in the argv, and no `ensureRemoteServer(ctx)`
(`remote-sessions.ts:1583`). Byte for byte what Phase 270 left.

**What moves the moment ANY shared name exists is who pays for the login-shell probe.** Today a
person who set a name for claude alone pays it on claude launches and nowhere else. With a shared set,
one name makes **every** agent's local create, **every** local restore and every remote create pay it.
**Measured on the operator's own login shell with the product's own recipe** (`$SHELL -lic` with the
markered awk from `src/main/tmux/resolve.ts:655`): **52 names, median 1,110 ms over five runs
(1029, 1087, 1110, 1318, 1690)**. So one shared name is about a second added to the front of every
session he starts, per agent, for as long as the name is there.

**That is a stated cost, not a defect, and it is not repaired here.** A person who sets a key wants
the key. It is the argument for the shared list being empty at install and for never probing on a
launch whose union is empty, and both of those are already true. The commit body says the number.
(Rule 22 records it.)

**One drift to fix in the same commit:** `create-local.ts:613` says "3 second deadline" and the
deadline is `PATH_CAPTURE_TIMEOUT_MS = 10_000` (`src/main/tmux/resolve.ts:118`). (Rule 34.)

---

## 5. The list control

### 5.1 What is being replaced, and why it is one defect and not two

`LaunchDefaultsSection.tsx:300-308` renders the candidate names into a native `<datalist>`. **Measured
in the running app** (`build/p275/probe-p275-gestures.mjs`, readings in `out/reading.json`): the
datalist held **94 options**; its `getBoundingClientRect()` is `[0,0,0,0]`; the first `<option>`'s box
is `[0,0,0,0]`; a real mousedown/mouseup/click on the field added **0 nodes** to the document; and no
option ever has a non-zero box. **The popup a person sees is not in our document.** There is nothing of
ours to size, nothing to scroll, and no CSS of ours that reaches it.

**And it is Electron's own control, not Chromium's.** The shipped binary carries
`electron/shell/browser/ui/views/autofill_popup_view.cc`. At the tag we ship (43.3.0):
`GetDesiredPopupHeight()` is `2 * kPopupBorderThickness + values_.size() * kRowHeight` with
`kRowHeight = 24`, so 51 names ask for **1,226 px**; `CalculatePopupYAndHeight` hands that to
`gfx::Rect::AdjustToFit`, which **shrinks** (`AdjustAlongAxis` begins `*size = std::min(dst_size,
*size);`); the space is measured against the web contents view, so it can never leave the 760×560
Settings window (`src/main/settings/window.ts:41-45`); there is **no `views::ScrollView` and no
`OnMouseWheel`** in the view; and it holds a single `selected_line_` with no notion of more than one
selection. The 512-name `kMaxListSize` is real and never bites at 51.

So: it does not scroll **because it cannot**, and it yields one value per trip **because the control
holds one**. One control, both complaints, one replacement.

### 5.2 The precedent it is assembled from — three controls this repository already owns

There is no single existing control that does scroll + size + filter + keyboard + multi-select, and
**no new list primitive is written.** Each half is copied from the surface that already owns it.

| Half | Taken from | What comes with it |
| --- | --- | --- |
| **The sheet** | `src/renderer/app/ShortcutsOverlay.tsx` + `shortcuts-overlay.css:16-63` | A modal that does not scroll wrapping a body that does; `FilterField` above it; a flat ↑↓ cursor that wraps (`:162-165`); `e.preventDefault()` on the container's `onKeyDown` (`:186-194`, *"Without this the caret walks the search field instead"*); `scrollIntoView({block:'nearest'})` on every arrow press (`:132-137`, *"Nearest, never smooth"*); a live `n of m` count with `aria-live="polite"` (`:214-219`); a "nothing matches" line (`:232-236`); the two-stage Escape (`:198-209`); the cursor reset on a query change (`:113-116`) |
| **Multi-select and its aria** | `src/renderer/scm/ScmSection.tsx:1850-1861` and `:413-418`, with the rules in `src/renderer/scm/selection.ts` | Container `role="listbox"` + `aria-multiselectable="true"` + `aria-activedescendant` + `tabIndex` + one `onKeyDown`; rows are plain `<div role="option" id={…} aria-selected={…}>`; and the one thing only this surface does — the keyboard **cursor** kept separate from the **selected set**, which is exactly the `aria-activedescendant` vs `aria-selected` distinction |
| **Pick several, then confirm** | `src/renderer/context/enable/EnableForDialog.tsx:96-148` | Tick several, then one button that opens the shared confirm; a row that cannot be chosen shown **disabled with its reason printed** rather than hidden (`:122-132`, *"a fact behind a tooltip is a fact most people never meet"*); the honest ellipsis (`:145-148`) |
| **The filter input** | `src/renderer/controls/FilterField.tsx` | The app's ONE filter input; its header says a hand-rolled copy is refused, after four rebuilds and a padding bug in Phase 14.2 |

**Explicitly not copied:** `src/renderer/search/SymbolPalette.tsx:184-196` uses
`<button role="option">`. A focusable button inside a listbox takes DOM focus itself, fights
`aria-activedescendant`, and makes Tab walk every row. SCM's `<div role="option">` with focus held on
the field is the correct half. (Rule 41.)

**No portal.** `.modal-scrim` is `position: fixed; inset: 0; z-index: var(--z-modal)`
(`src/renderer/styles/app.css:1276-1284`), so it escapes `.set-content`'s `overflow-y: auto`
(`settings.css:62-66`). `ConfirmDangerModal` and `ConfirmEnvModal` already render from inside that
scrolling column and work.

### 5.3 The one shared-control widening, and it is two optional props

`FilterField` exposes five props and no ref (`FilterField.tsx:23-36`), so `aria-activedescendant`
cannot be placed on the element that actually holds focus. It gains two optional props:

```ts
/** PHASE 275. The sheet keeps focus in this field while the arrows walk a listbox
    beside it, so the active row has to be announced from HERE — an
    `aria-activedescendant` on any other element is not read. Both props are
    optional and emit nothing when absent, so all five existing call sites are
    unchanged. */
inputRef?: React.Ref<HTMLInputElement>;
combobox?: { controls: string; activeId: string | null };
```

When `combobox` is given the input carries `role="combobox"`, `aria-expanded`, `aria-controls` and
`aria-activedescendant`; when it is absent nothing is emitted. **The alternative was
ShortcutsOverlay's `aria-current="true"` on the row with no activedescendant at all** — shipped, real,
and weaker, because a screen reader is never told the cursor moved. For a control whose entire job is
keyboard navigation over fifty rows, take the two props. (Rule 39; the ownership consequence is §9.)

### 5.4 The sheet — `EnvPickerSheet`, five bands

One component in `src/renderer/settings/EnvPickerSheet.tsx`, opened by the existing `Add…` button on
**every** card (shared and per-agent — one control, one rule, both complaints fixed everywhere), and
rendered beside `ConfirmEnvModal` in `LaunchDefaultsSection`. `.modal-scrim` + `.modal.set-env-picker`,
`role="dialog" aria-modal="true"`, `trapTabKey` (`src/renderer/app/focus-trap.ts:20`),
`width: min(560px, calc(100vw - var(--space-9)))` to match the settings column's own 560 px cap
(`settings.css:68-72`).

**Written `.modal.set-env-picker`, never `.set-env-picker`**, for the reason
`shortcuts-overlay.css:16-18` records: it has to beat `.modal`'s own `overflow-y: auto` and `width`
whatever order the bundler emits. Flex column, `overflow: hidden`; **the body scrolls, never the
sheet.** (Rule 36.)

1. **Head.** `<h2 class="modal-title">` — `Add shell variables for every agent` from the shared card,
   `Add shell variables for Claude Code` from an agent card. Beside it a count span with
   `aria-live="polite"`: `48 names` at rest, `6 of 48` while filtering, `3 selected, 13 left` once
   something is ticked.
2. **`<FilterField placeholder="Filter or type a name" icon="filter">`.** It is the filter **and** the
   text field. One control, one caret, nothing to learn.
3. **The note line, ALWAYS present**, hidden by `visibility` and never `display` — the Phase 174.1
   rule this window already wrote down at `settings.css:1183-1196`. One of four sentences, in this
   order: the refusal from `envPassthroughRefusal`, else `Reading your shell…` while the answer is in
   flight, else `ENV_PROBE_FAILED`, else `ENV_NAMES_ONLY`.
4. **The list.** `<div role="listbox" aria-multiselectable="true" aria-activedescendant={activeId}
   class="set-env-list">`, `flex: 1 1 auto; min-height: 0; overflow-y: auto`, 24 px rows with
   `scroll-margin`. It grows with the window rather than carrying a magic number, exactly
   `.shortcut-groups`. Rows are
   `<div role="option" id={`set-env-opt-${name}`} aria-selected={ticked}>` holding a tick slot
   (`Codicon name="check"`), the name in `--font-mono`, and a muted right-hand note when there is one.
5. **Footer `.modal-actions`:** `Cancel`, then `Add 3…` — `btn-primary`, disabled at zero ticked, and
   the ellipsis is honest because it opens the confirm.

### 5.5 How an unexported name is still accepted — "never a cage", made visible

The Phase 174.1 ruling stands and **gets stronger**. Today an unexported name is accepted but nothing
on screen says so: a person types it, sees no suggestion, and has to guess whether it took. In the
sheet, whenever the trimmed query is a name `envPassthroughRefusal` returns `null` for and no offered
row matches it exactly, the list draws **one row at the top**:

```
  ANTHROPIC_API_KEY                       not exported by your shell
```

It ticks, scrolls and commits like every other row. There is now **exactly one rule to learn instead
of two**: every name you can add is a row. (Rule 37.)

### 5.6 Rows already on the list are shown, ticked and locked — never hidden

`settings:envCandidates` filters `existing` out today (`src/main/settings/ipc.ts:158-170`), so a name
you already have **vanishes** and the list changes shape between openings. That filter is removed
(the handler keeps `cap: Number.MAX_SAFE_INTEGER`, so nothing else moves) and the renderer draws the
name instead: ticked, `aria-disabled`, with a muted note. That is EnableForDialog's `locked`
treatment and it is why a person does not hunt for a name they already have. (Rule 38.)

Three notes, and the third is the inherit story made visible:

- on the shared card: `already shared`
- on an agent card, for a name on that agent's own list: `already on this list`
- on an agent card, for a name on the SHARED list: `already shared with every agent` — **ticked and
  locked**, because adding it per-agent changes nothing and would spend a cap slot on a no-op.

### 5.7 Filtering

**Case-insensitive substring over the name, and nothing cleverer.** Not the repository's fuzzy
scorer: a variable name is typed exactly, and fuzzy matching over fifty SHOUTY_SNAKE names ranks noise
above the exact hit a person is aiming at. The count line says `6 of 48` while a query is present.
A query matching nothing draws one line — `Nothing matches “ANTRHOPIC”.` — unless the query is itself
a valid name, in which case the typed-name row of §5.5 is what is drawn. (Rule 40.)

### 5.8 The keyboard map

| Key | What it does | Why |
| --- | --- | --- |
| **↑ / ↓** | Move the active row, wrapping. `e.preventDefault()` on the container. | Without the preventDefault the caret walks the field (`ShortcutsOverlay.tsx:186-194`). The active row is kept in view with `scrollIntoView({block:'nearest'})`. |
| **↩** | Toggle the active row's tick. **Never commits.** | One meaning whether the row is offered or typed, so the typed-name path costs no special case. |
| **⌘↩** | Commit — the `Add n…` button's accelerator. | |
| **Esc** | First press clears a non-empty filter, second closes the sheet. | `FilterField.tsx:59-67` already does the first half and stops propagation. |
| **Tab** | Trapped inside the sheet. | `trapTabKey`. |
| **Space** | **Types a space. It does NOT toggle.** | Focus is in a text input. A surface that swallowed Space would be a text field that refuses a character, and the list researcher's proposed Space-toggles binding is **refused for that reason**. |

Typing filters, and is also the name being added. The active row resets to index 0 whenever the query
changes shape. (Rule 42.)

### 5.9 The cap is said while ticking, not at the confirm

The count line reads `3 selected, 13 left`. When `existing.length + ticked === 16` every unticked row
goes `aria-disabled` carrying the sentence the rule already owns (§3.4, the shared or the per-agent
wording depending on the sheet's scope). **Nobody ticks twenty and is refused after they have
agreed.** (Rule 43.)

### 5.10 The candidates channel gains a scope

A shared list has no agent, so the channel cannot take one:

```ts
export type EnvCandidateScope =
  | { kind: 'agent'; agentId: LaunchableAgentId }
  | { kind: 'shared' };

'settings:envCandidates': { req: [scope: EnvCandidateScope]; res: EnvVarCandidates };
```

The `shared` arm refuses `sharedRefusedEnvKeys` (§3.2) instead of one agent's compiled keys. The
renderer store's `loadEnvCandidates` keys its cache by `'shared'` or the agent id and keeps its Phase
269 rule: **cleared first, asked on OPEN and nowhere else**, so nothing is probed at boot and a person
who never opens the sheet never starts a shell. (Rules 44, 45.)

### 5.11 Why not a native menu

`ui:popupMenu` (`src/shared/ipc/app.ts:240-272`) has `item` and `separator` and nothing else — no
checkbox type — and resolves to `string | null`, one id, then closes. It cannot multi-select and it
cannot filter as you type. The UI rule bans DOM-drawn **context** menus; this is a form control in a
dialog, the shape QuickOpen, the symbol palette, the shortcuts overlay and the SCM changes list all
already use. **A native menu is refused, on capability.**

---

## 6. Where things are drawn

### 6.1 The shared card

**Drawn ONCE, above every per-agent card**, under the section's two captions in
`LaunchDefaultsSection` (`:672-683`). It is **not** a fourth copy of the agent card: it has a head, a
chip row and one line, and no preset rows, because there are no flags that belong to every agent.

```
┌──────────────────────────────────────────────────────────┐
│  ⟨symbol-variable⟩  Every agent                          │
├──────────────────────────────────────────────────────────┤
│  Shell variables                                [Add…]   │
│  ANTHROPIC_API_KEY ✕   DEEPSEEK_API_KEY ✕                │
│  Read from your shell at every launch. Never stored.     │
└──────────────────────────────────────────────────────────┘
```

Head label: **`Every agent`**, in the `.set-defaults-name` slot, with `Codicon name="symbol-variable"`
in the `.set-agent-icon` slot — a glyph and never a borrowed agent mark, because this card is not an
agent. (`symbol-variable` is in the installed set, `node_modules/@vscode/codicons/dist/codicon.csv`.)

Empty state, one line, verbatim:

```ts
/** The shared card's whole empty state. One line, and it is the offer. */
export const ENV_SHARED_EMPTY_LINE =
  'Set a key once here and every agent gets it.';
```

The chips, the `✕`, `ENV_SET_CAPTION` and the reserved-height rule (`settings.css:1141-1147`,
*"THE RESTING HEIGHT IS THE SAME WITH NAMES AND WITHOUT THEM"*) are exactly the agent card's, reused.
(Rule 46.)

### 6.2 Each agent card's inherit line, VERBATIM

Drawn inside the existing `.set-env-detail` slot, **below** the chips or the empty line and above
`ENV_SET_CAPTION`, and **only when the shared list is non-empty**:

```ts
/**
 * PHASE 275 — what this agent gets from the card at the top of the page.
 *
 * One line, and it points UP rather than repeating: the names are already on
 * screen one card above, under a head that says "Every agent", so naming them
 * again here would be the same list drawn eleven times. Just enough words.
 */
export function envInheritLine(sharedCount: number): string {
  return sharedCount === 1
    ? 'Plus the variable every agent gets.'
    : `Plus the ${sharedCount} variables every agent gets.`;
}
```

So the two sentences, verbatim, are:

> `Plus the variable every agent gets.`

> `Plus the 3 variables every agent gets.`

`envEmptyLine(agentName)` (`env-copy.ts:51-53`) is **unchanged** —
`Gets your shell's PATH and LANG. Add any others Claude Code needs.` — because it is still true and
`p269-env-names.test.tsx` pins it. (Rule 47.)

### 6.3 What is removed from the agent card

The inline text field, its `<datalist>`, and `EnvNamesGroup`'s `open` / `draft` / `refusal` local
state all go. The `Add…` button stays on every card and opens the sheet with the right scope.
`ENV_ADD_COMMIT` (`env-copy.ts:36`) loses its only caller and is deleted; the sheet's footer label is
its own function. PICKER updates the Phase 269 renderer suites in the same commit. (Rule 48.)

### 6.4 The rejection line

One line per card, drawn in `.set-env-note error` (`settings.css:1194-1196`, `--error`), present only
when the card has something to report:

```ts
/** PHASE 275 — a name in the file that this window did not put there. THE SEAL. */
export function envRejectedLine(names: readonly string[]): string {
  return `Ignored, because they were not added here: ${names.join(', ')}.`;
}

/** THE FIX ROUND — a name Tortie will not read at all. THE SHAPE LAYER. */
export function envUnreadLine(names: readonly string[], over = 0): string {
  const list = over > 0 ? `${names.join(', ')}, and ${over} more` : names.join(', ');
  return names.length === 1 && over === 0
    ? `Ignored, because Tortie will not read it: ${list}.`
    : `Ignored, because Tortie will not read them: ${list}.`;
}

/** The same fact for entries that cannot be named safely (§3.2). */
export function envRejectedUnnamedLine(count: number): string {
  return count === 1
    ? 'One entry was ignored because it is not a variable name.'
    : `${count} entries were ignored because they are not variable names.`;
}
```

**TWO SENTENCES AND NOT ONE, BECAUSE "NOT ADDED HERE" IS A DIRECTION.** It tells a person the fix: add
the name in this window and it will work. That is true of a seal drop and **false** of a shape drop —
`PATH` is refused at this door however many times they type it — and when the cap is what dropped the
name it is simply untrue, because the name IS in the seal. One sentence sends them to the Add sheet;
the other tells them adding it there will not help. One sentence covers every shape cause rather than a
taxonomy of them, because what a person needs from this line is which of the two fixes is theirs.

**`over` IS A COUNT AND NEVER A LIST.** The shape half runs over the RAW file, so main echoes sixteen
and counts the rest (§3.2); "and 984 more" is the honest end of a line that cannot draw them all.

The shared card draws `rejections.shared`, then `rejections.sharedUnread` with its own sentence, then
the `unnamed` line. Each agent card draws `rejections.perAgent[agentId]` and has no shape half at all,
because Phase 269's per-agent sanitizer is documented silent and §10.10 keeps that contract — the
asymmetry is a **stated limit** rather than a second widening inside this phase. Every name drawn has
already passed `OVERLAY_ENV_KEY_PATTERN` (§3.3). (Rules 49, 20b.)

### 6.5 The native menus

**No user-facing surface is added, renamed or removed from the menus.** The shared card and the picker
sheet both live inside the existing Settings window, reached by the existing `⌘,` and the existing
Launch defaults rail item. There is no new window, no new view and no new command, so
`src/main/menus/` does not change and the phase brief says so. (Rule 50.)

---

## 7. The `env-unresolved` notice under a shared set

**Once per SESSION, never once per agent, and no code changes.**

The latch key is `kind:sessionId` (`src/main/notice/index.ts:55-60`), chosen deliberately: *"Two
sessions missing a variable are two facts, and a per-kind latch would let the first session's launch
silence the second's"* (`:34-40`). **The agent id is not in the key and never was**, so a shared name
nothing exports raises the notice once for each session that starts carrying it, whatever agent that
session runs. Local (`create-local.ts:684-691`, `restore.ts:1035-1042`) and remote
(`remote-sessions.ts:1793-1803`, `remote-restore.ts:609`) post through the same
`postDurabilityNotice`, so the two already agree and stay agreeing.

**The honest consequence, written down rather than discovered.** A shared set makes MORE sessions
carry the name, so **a typo in a shared name is louder than a typo in a per-agent one** — every
session a person starts says it once until they fix the name or their shell. That is correct: each
session really did start without something it was promised. It is also the strongest argument for the
batch confirmation naming every variable in the list (§2.3), because the confirm is the last place a
typo can be caught before it becomes one toast per session. (Rule 51.)

---

## 8. The rules

A builder implements each one; a gate or a suite asserts each one. One sentence, one file.

### The seal — CORE

1. `DangerState` gains `readonly envShared: readonly string[]`, non-optional so the compiler forces
   every construction site. — `src/main/settings/store.ts:184-227`
2. `dangerStateOf` pushes every `settings.envPassthroughShared` name **bare** into `envShared` and
   **sorts** it, the way `env` is sorted at `:259`. — `store.ts:230-260`
3. A bare name and never `envSharedKey`'s output is what goes into the sealed field; `envSharedKey` is
   display-only and is never a Set member, never compared and never parsed. — `store.ts`, `src/shared/settings.ts`
4. `EMPTY_DANGER_STATE` gains `envShared: []`. — `store.ts:409-415`
5. `openDangerSeal` reads `envShared: strings(asState.envShared)`, so a seal written before this phase
   opens and covers no shared name. — `store.ts:449-481`
6. `withSealedDangerState` builds `sealedShared` from `sealed.envShared`, filters
   `settings.envPassthroughShared` against it **and against nothing else**, and pushes
   `envSharedKey(name)` into `rejected` for each drop. — `store.ts:282-360`
7. **`isDangerStateEmpty` gains `state.envShared.length === 0`.** — `store.ts:264-272`
8. `sealedEnv` is never consulted for a shared name and `sealedShared` is never consulted for a
   per-agent name, on any path. — `store.ts:282-360`
9. `persistSettings`'s strip path (`:801-828`) carries the shared list, so a keystore that cannot seal
   writes no shared name rather than writing one the next load will refuse. — `store.ts:801-828`
10. The confirm hash **does not** gain the shared set: `executionFieldsOf` is byte-identical whatever
    the shared settings hold. — `src/main/config/overlay.ts:153-181`

### The settings shape — CORE

11. `GmuxSettings` gains `envPassthroughShared: string[]` immediately after `envPassthrough`. — `src/shared/settings.ts:62`
12. `defaultGmuxSettings` gives it `[]`. — `src/shared/settings.ts:811`
13. `sanitizeSettings` fills it through `sanitizeEnvPassthroughShared` beside the `envPassthrough`
    call, and `applySettingsPatch` re-runs it (`store.ts:713-718`) so a patch is sanitized too. — `store.ts:527-533`
14. `sanitizeEnvPassthroughShared` drops the whole FIELD when it is not an array, drops one NAME whole
    when it is refused, repairs nothing, and never throws. — `src/shared/settings.ts`
15. One bad entry never denies the rest of the list. — `src/shared/settings.ts`
16. A refused entry is echoed in `refused` only when it passes `OVERLAY_ENV_KEY_PATTERN`; anything
    else increments `unnamed` and is never echoed. — `src/shared/settings.ts`
16b. **(Fix round.)** `refused` stops at `OVERLAY_LIMITS.maxEnvPassthroughNames` and the rest is
    `refusedOver`, a count that is never echoed. A rendering primitive is a SIZE as well as a
    character set, and this list's length is the file writer's to choose. — `src/shared/settings.ts`
17. The shared list refuses every name any launchable agent's compiled `launch.env` sets, computed
    once from `LAUNCHABLE_AGENT_IDS` × `compiledLaunchEnvKeys` and exported from `store.ts`. — `store.ts`, `src/main/settings/ipc.ts`
18. The cap is `OVERLAY_LIMITS.maxEnvPassthroughNames` at a fourth door, counted **separately** for
    the shared list and each agent list, and `envPassthroughRefusal` gains `scope?: 'agent' | 'shared'`
    with the two sentences of §3.4 — both sentences staying inside that function. — `src/shared/agent-overlay.ts:527-560`
19. `warnRejected` prints a shared rejection through `envSharedKey`. — `store.ts:771-778`
20. `settings:envRejections` returns only names that already passed the shape gate, plus an integer. — `src/main/settings/ipc.ts`, `src/shared/ipc/app.ts`
20b. **(Fix round.)** The shape layer's drops and the seal layer's leave main in TWO fields and are
    drawn with TWO sentences; `envRejectionsNow` concatenates nothing, and `envUnreadLine`'s words
    never say "not added here". — `src/main/settings/store.ts`, `src/renderer/settings/env-copy.ts`,
    `LaunchDefaultsSection.tsx`
21. The rejection list is the one from the last seal check of this load, and is cleared by the next
    successful write. — `store.ts`, `src/main/settings/ipc.ts`
22. The **four** stated limits are written into the phase's commit body and are not repaired here. —
    commit body
    - **The file-order cap (§3.4).** Sixteen shape-valid junk names ahead of a real one push the real
      one out at the shape layer. It fails closed and the card now says so with the right sentence
      (rule 20b), but the ORDER is not repaired, because a sanitizer that reorders admits a list
      nobody wrote.
    - **The per-launch login-shell probe (§4.4).** One shared name makes every agent's create pay it.
      Measured at 52 names: median 1,110 ms over five runs.
    - **The seal is a bearer token, not bound to the file or the profile.** `safeStorage` ciphertext is
      keyed to the login keychain, so a `dangerSeal` blob copied out of one `settings.json` and pasted
      into another on the same machine opens and covers its names — driven by a verifier, who read
      `ADMITTED_ACROSS_PROFILES=["V_COPIED"]` back from a second profile that had confirmed nothing.
      This phase does not create it (it is Phase 138/269's mechanism, unchanged) but it **widens what
      one replayed blob buys**: a blob whose `envShared` covers a name now covers it for every
      launchable agent, including ones installed later. It is replay of a genuine human agreement and
      never a forgery — the human must have confirmed that exact name somewhere, and a forged or
      truncated blob still opens as `EMPTY_DANGER_STATE`.
    - **The per-agent card has no shape-layer half.** Phase 269's sanitizer is documented silent
      (§10.10), so a per-agent shape drop is reported nowhere. The shared card is the only one with
      both sentences, and the two cards therefore mean slightly different things by "a drop".

### The union — CORE

23. `envPassthroughFor` takes a third `readonly string[] | undefined`, unions row → per-agent →
    shared, dedupes, mutates nothing, and returns `undefined` for three empties. — `src/shared/launch-env.ts:47-53`
24. `src/shared/launch-env.ts` has **zero** import statements. — `src/shared/launch-env.ts`
25. All four launch paths read the same union: local create, local restore, remote create and remote
    restore. — `create-local.ts:476-480`, `restore.ts:960-965`, `remote-env-probe.ts:239-251`
26. What the remote cap drops is reported by name in the `env-unresolved` notice, through
    `remoteEnvNamesDroppedFor`. — `remote-env-probe.ts`, `remote-sessions.ts:1793-1803`, `remote-restore.ts`

### The two refusals, driven — CORE's suite + GATE

27. A shared name sealed per-agent is dropped and reported (R-A). — `src/main/settings/__tests__/p275-env-shared-seal.test.ts`
28. A per-agent name sealed as shared is dropped and reported (R-B). — same file
29. A shared name written into `settings.json` by hand is dropped, named in `app.log`, and drawn in
    the Settings window. — same file + `build/p275/probe-p275.mjs`
30. The sealed blob **moves** when a shared name is added through the door and **returns** when it is
    removed. — same file
31. **The ablation that proves rule 7:** a settings file whose ONLY danger value is a shared name
    still reaches the seal — `getSettings` must not short-circuit. — same file
32. A seal with no `envShared` member covers no shared name. — same file
33. `LAUNCHABLE_AGENT_IDS.length > 0` is asserted BEFORE any per-id assertion, so no cross-admission
    check can pass vacuously. — `build/conformance-agents.mjs`
34. `create-local.ts:613`'s "3 second deadline" comment is corrected to the real
    `PATH_CAPTURE_TIMEOUT_MS = 10_000`. — `create-local.ts:613`

### The gate — GATE

35. `conformance:agents` section 7 gains: the shared sanitizer's shape table; the three-source union
    (order, dedupe, `undefined`, no input mutated); the two key spaces asserted **disjoint** over
    every launchable id; the NEGATIVE that `executionFieldsOf` does not move; rule 24's import count;
    and the two cap sentences read from `envPassthroughRefusal` rather than from a literal. — `build/conformance-agents.mjs:673-800`, `build/agents-conformance-probe.mts`
35d. **(Fix round.)** `ablation:p275` gains a SECOND LANE for the picker. A verifier counted its
    coverage at 23 of these 53 rules: every rule from 36 down rested on the renderer suite with
    nothing asserting the suite could go red. The lane runs the two renderer test files in the same
    clone — no Electron, `ELECTRON_OVERRIDE_DIST_PATH` doing the work `vitest.config.ts` documents —
    and ablates four rules chosen for four different KINDS of promise: a row that must exist (37, the
    cage), a row that must be shown rather than hidden (38), a state that must be said while ticking
    (43), and the element the keyboard model rests on (41). Measured: 5, 2, 1 and 1 failing tests
    respectively, which is the same reading the verifier got by hand. — `build/p275/ablation.mjs`

### The picker — PICKER

36. The sheet is `.modal.set-env-picker`, `overflow: hidden`, with only the list scrolling. — `src/renderer/settings/env-picker.css`
37. A valid name the shell does not export is drawn as the top row, marked `not exported by your
    shell`, and ticks like any other row. — `EnvPickerSheet.tsx`
38. A name already on the target list is drawn ticked, `aria-disabled`, with its note — never hidden —
    and `settings:envCandidates` stops filtering `existing` out. — `EnvPickerSheet.tsx`, `src/main/settings/ipc.ts`
39. `FilterField` gains `inputRef` and `combobox`, both optional, emitting nothing when absent, with
    every existing call site unchanged. — `src/renderer/controls/FilterField.tsx`
40. Filtering is case-insensitive substring; the count line says `n of m`; a query matching nothing
    draws one line unless it is itself a valid name. — `EnvPickerSheet.tsx`
41. The container holds focus-adjacent aria: `role="listbox"`, `aria-multiselectable`,
    `aria-activedescendant`; rows are `<div role="option">` and never a `<button>`. — `EnvPickerSheet.tsx`
42. The keyboard map of §5.8 exactly, including **Space types a space**. — `EnvPickerSheet.tsx`
43. The cap is said while ticking: unticked rows go `aria-disabled` at the cap with the scope's own
    sentence. — `EnvPickerSheet.tsx`
44. `settings:envCandidates` takes `EnvCandidateScope`; the shared arm refuses the union of compiled
    env keys. — `src/shared/ipc/app.ts`, `src/preload/index.ts`, `src/main/settings/ipc.ts`
45. The candidate list is cleared first and asked on OPEN and nowhere else. — `src/renderer/settings/settings-store.ts:393-409`
46. The shared card is drawn once, above the agent cards, with head `Every agent` and the empty line
    of §6.1. — `LaunchDefaultsSection.tsx`, `env-copy.ts`
47. Each agent card draws `envInheritLine(n)` verbatim, only when the shared list is non-empty. — `LaunchDefaultsSection.tsx`, `env-copy.ts`
48. The inline field and the `<datalist>` are removed from the agent card and `ENV_ADD_COMMIT` is
    deleted with them. — `LaunchDefaultsSection.tsx:279-310`, `env-copy.ts:36`
49. Each card draws its own rejection line when it has one. — `LaunchDefaultsSection.tsx`, `env-copy.ts`
50. No native menu changes, and the phase brief says so. — `src/main/menus/`
51. The `env-unresolved` notice is untouched; the latch stays `kind:sessionId`. — `src/main/notice/index.ts`
52. Every colour is a token; no literal outside a theme constant file. — `env-picker.css`, `settings.css`
53. Not one string in `env-copy.ts` interpolates, formats, hints at or measures a VALUE — a length is
    a value. — `env-copy.ts`, `__tests__/p269-env-names.test.tsx`

---

## 9. File ownership — disjoint, three builders

**CORE** — the seal, the shape, the union and the launch paths.

```
src/shared/settings.ts
src/shared/launch-env.ts
src/shared/agent-overlay.ts
src/shared/ipc/app.ts
src/preload/index.ts
src/main/settings/store.ts
src/main/settings/ipc.ts
src/main/settings/__tests__/p275-env-shared-seal.test.ts        (new)
src/main/settings/__tests__/p269-env-seal.test.ts               (extend only)
src/main/sessions/create-local.ts
src/main/restore/restore.ts
src/main/machines/remote-env-probe.ts
src/main/machines/remote-env-carriage.ts                        (the stale comment at :86-92 only)
src/main/machines/remote-sessions.ts
src/main/machines/remote-restore.ts
src/main/machines/__tests__/p270-a-remote-env-carriage.test.ts  (extend only)
```

**PICKER** — everything a person looks at.

```
src/renderer/settings/LaunchDefaultsSection.tsx
src/renderer/settings/env-copy.ts
src/renderer/settings/EnvPickerSheet.tsx                        (new)
src/renderer/settings/env-picker.css                            (new)
src/renderer/settings/settings.css
src/renderer/settings/settings-store.ts
src/renderer/settings/__tests__/**
src/renderer/controls/FilterField.tsx
src/renderer/controls/filter-field.css
```

**GATE** — the gates and the probes.

```
build/conformance-agents.mjs
build/agents-conformance-probe.mts
build/p275/**                                                   (the app run, and the gesture probe already there)
package.json                                                    (the scripts block only)
docs/audits/contract-baseline.txt
```

### The two places the brief's split collided, and how it was changed

1. **`src/renderer/controls/FilterField.tsx` is not under `src/renderer/settings/**`**, and the picker
   cannot place `aria-activedescendant` on the element that holds focus without it (§5.3). It is
   **added to PICKER by name**, along with its CSS. No other builder touches `src/renderer/controls/`
   in this phase, so the split stays disjoint. The alternative — hand-rolling an input with a leading
   glyph — is refused by that component's own header.
2. **`src/shared/ipc/app.ts` and `src/preload/index.ts` are not in the brief's list at all**, and the
   scoped `settings:envCandidates` and the new `settings:envRejections` need both. They go to **CORE**,
   because the contract is a core concern and `src/shared/*` is append-only during parallel builds
   (PICKER reads the types, writes none of them). **`docs/audits/contract-baseline.txt` goes to
   GATE**, and the **integrator** runs
   `node build/contract-inventory.mjs --out docs/audits/contract-baseline.txt` after CORE lands,
   naming the moved lines in the commit body.

### Verification — Tier 3, and the two independent methods named in advance

- **Method 1, the ATTACK, on the seal.** R-A and R-B driven against the shipping
  `withSealedDangerState`, plus a hand-written `settings.json` proven dropped and drawn, plus the
  rule 31 ablation. The verifier's own independent step: **re-derive the disjointness by a different
  method** — enumerate `envNameKey(id, name)` over all 13 compiled ids against a fixture name and
  assert no output equals the bare name or `envSharedKey(name)`, computed in a plain node process
  with no import of the code under test.
- **Method 2, over REAL data.** One Electron, scratch profile, scratch `HOME`, its own tmux socket,
  every process ended in a `finally` through `build/electron-run.mjs`. It drives the shared set, a
  per-agent narrowing beside it, a shell answering **at least 51 names** (proving the list scrolls,
  filters and selects several), a shell answering **zero** names (proving typing still works), the
  batch confirm, and a session that **actually receives the variable, read back from the pane's own
  environment and not from our record of it**.
- **One app run for all of it** — `probe:p275` — not one per claim.
- **Measure the parent commit.** Already done and the numbers are the commit body's headline:
  **at the parent, one key on every agent this Mac can launch is AT LEAST 57 gestures and 11
  confirmations (one key on one agent is 7, the same key on three agents is 19 with three
  confirmations, driven in the real Settings window). After, one key on every agent is 6 gestures and
  1 confirmation, and three keys on every agent is 8 gestures and 1 confirmation.**

  **"At least" is the fix round's correction, and it makes this line agree with how the 19 was
  computed.** 57 is `1 + 1 + 11 × 5` and charges no scrolls, while the three-agent figure of 19 is
  `1 + 1 + 3 × 5 + 2 scrolls` and does. The probe's own last line has always said "57 gestures at
  least"; this sentence had dropped the qualifier. With eleven cards spread over 3,577 px in a 532 px
  content viewport — both read from the probe at the rebuilt parent — the honest figure is about 67.
  It understates the parent, so it errs conservatively, but the commit body says "at least 57" or
  gives the scrolled figure rather than a flat one.
- **Gates:** `typecheck`, `build`, `test`, `smoke:t1`, plus `conformance:agents`,
  `conformance:contract`, and the integrator's full battery.

---

## 10. What must not change

1. **Layer one of the seal does not move.** A name no human confirmed is dropped. Refusal 8 in
   `CLAUDE.md`. Any proposal that makes a configuration change take effect without a human confirming
   the bytes out of band of an agent turn is **refused outright**, and a shared set is not an
   exception to it — it is why the shared set gets its own confirmation with its own words.
2. **Per-agent sets remain.** `GmuxSettings.envPassthrough`, `DangerState.env`, `envNameKey` and the
   per-agent card all stay. A phase that deletes them to simplify the drawing has removed the only
   reason the per-agent design was defensible.
3. **Names only, everywhere, always.** `ENV_NAMES_ONLY` holds. No value enters the window, the
   settings file, the manifest, a log, an argv or another machine. A length is a value. The manifest
   keeps names and never values.
4. **`REMOTE_ENV_ALLOWED` stays at exactly two**, `GMUX_MANAGED` and `GMUX_SESSION_ID`
   (`src/main/machines/remote-env.ts:85-88`). Passthrough names travel as `input.envNames`, which
   becomes one literal `REMOTE_ENV_SLOT` element (`remote-sessions.ts:875`) and never enters the `env`
   record `assertRemoteEnvAllowed` guards at `:861`. Nothing in this phase touches either.
5. **No import of a secret from a `.env` file, a keychain or a vendor's config.** The login shell is
   the one source. Widening it is a different phase with its own research.
6. **The far-side probe script, the transport and `REMOTE_ENV_NAMES_MAX = 16` do not move.** The phase
   makes the cap's drop **audible** using `droppedRemoteEnvNames`, which Phase 270 already built; it
   does not raise the cap, change the script, or change what crosses the wire.
7. **`captureLoginShellEnv` does not change** (`src/main/tmux/resolve.ts:447-556`): one `$SHELL -lic`,
   a fresh nonce, group-killed on a deadline, and anything unset, empty or over 4,096 bytes reported
   missing and never injected.
8. **The confirm hash does not gain the shared set.** Adding a shared key must not re-arm every
   configured `agents.json` row's confirmation for a change that cannot alter what that row runs —
   `src/main/config/confirm.ts:104-111`: *"asking a person to re-approve it trains them to click
   through the sheet that matters."*
9. **`src/shared/launch-env.ts` imports nothing, now with a gate behind the rule.**
10. **The per-agent map's sanitizer keeps its documented silence.** `sanitizeEnvPassthrough`'s contract
    at `src/shared/settings.ts:880-885` is Phase 269's and is not edited here; the new reporting
    belongs to the new function and the new field.
11. **The `env-unresolved` latch stays per session.** No per-agent latch, no per-kind latch.
12. **No DOM-drawn context menu, and no native menu change.** The picker is a form control in a dialog.
13. **The phase does not declare the reporter's first complaint solved.** He is the judge: it is
    solved when he has set a key once and seen it reach two agents.
