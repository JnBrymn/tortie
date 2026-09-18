# Phase 278 — an untrusted name may not push out an authorised one

`fix(settings): a confirmed variable name survives a filled cap`
First body line: `Phase 278: the name the cap pushed out`
Semver: patch. Tier 3.

Charter: the 0.105.0 audit's **F3, second half**, and its fixture
`docs/audits/fixtures/2026-09-14/env-cap-disclosure.test.ts.fixture`. F3's first half is closed by
Phase 270 and is not reopened here. The third limit Phase 269 recorded — "the cap runs before the
seal, so sixteen junk names can evict a real one without saying which was lost" — is this entry, and
Phase 275 half-closed it with a sentence and recorded honestly that it had not repaired the order.

This is a DECISION document. Where it says "must", a builder implements it and a gate asserts it.

---

## 0. What is broken, and what is not

`sanitizeEnvPassthrough` (`src/shared/settings.ts:1135`) admits names **in file order** and stops at
sixteen. `withSealedDangerState` (`src/main/settings/store.ts:392`) asks who wrote them, four steps
later inside `getSettings` (`store.ts:1058`). So sixteen valid-looking names written by anything with
write access to the home directory consume the whole budget before anything asks who wrote them, and
the seventeenth — the one the person confirmed in the Settings window — is gone at the shape layer
before the seal ever sees it. The seal then rejects the sixteen. The person ends with no names, and
the rejection list names sixteen strings they never typed and not the one they did.

**It fails closed and this document says so in the same breath, so nobody reads it as an escalation.**
No extra name is authorised. No value is resolved. Nothing leaks. Measured `accepted = {}` on every
attack shape. The defect is that a person loses a setting they made and is not told which one.

**And the loss becomes permanent at the next save**, which is what sets the urgency. `persistSettings`
(`store.ts:1016`) writes the seal-filtered settings and re-seals `dangerStateOf(next)` at
`store.ts:1030-1041`, so after one save from the Settings window the confirmed name is gone from
`settings.json` **and** from the seal; `store.ts:1043-1044` clears both rejection fields in the same
call, wiping the one sentence that would have explained it. Whatever this phase does has to be right
on the FIRST load.

Two things are out of scope and stay stated, not closed:

- **The restore boundary.** `src/main/restore/restore.ts:988` still hands `rec.envPassthrough` off the
  manifest to `envPassthroughFor`, as it already hands over the recorded argv. The settings seal does
  not authenticate manifest recipes. This predates Phase 269 and the audit is explicit that recipe
  authentication is a separate durability and security design. **Keep the limitation stated; do not
  close it here.**
- **F3's first half.** Phase 270 landed. `remote-sessions.ts` reads the passthrough through
  `remote-env-carriage.ts` and `remote-env-probe.ts`. Do not reopen it.

---

## 1. THE REPAIR

### 1.1 The decision, in one sentence

**Once the seal is open, Tortie recomputes each shell-variable list from the file's own entries in the
file's own order, keeping only entries the seal covers and still stopping at sixteen — so the list
Tortie uses is always a SUBSEQUENCE of the list in the file — and a backstop names, on the rejection
list the audit's fixture reads, every sealed name the finished lists do not contain.**

Two mechanisms. Neither is redundant and §1.5 proves it with the auditor's own fixture.

- **The seal-aware pass (§3.2, §3.4).** It is what makes the person's key keep working in the running
  app. It does not reorder anything and it adds nothing to any list.
- **The backstop (§3.5).** It is what makes a lost confirmed name impossible to hide anywhere else,
  including on paths the pass cannot reach, and it is what the auditor's fixture asserts.

### 1.2 Why the research rejected this and why it is free here

The research drove the shipping functions and rejected candidates (a) "apply the seal before the cap"
and (c) "count only names that pass the seal against the cap" for four mechanical reasons. **Every one
of those four reasons is about placing the seal inside `sanitizeEnvPassthrough`.** Placed at the seal
site instead — inside `withSealedDangerState`, which `getSettings` already calls with the opened seal
in hand — each one dissolves:

| The research's objection | Why it does not apply at the seal site |
| --- | --- |
| (i) The uncapped intermediate is attacker-sized, and `dangerStateOf` would sort 200,000 keys | No intermediate list is built. The pass walks entries and stops accumulating at sixteen; its accumulator is never larger than sixteen. `dangerStateOf` still runs over the SANITIZED settings at `store.ts:1061`, unchanged |
| (ii) `sanitizeSettings` is memoised at `store.ts:929` and may run before `app.isReady()` | The pass is not in `sanitizeSettings`. It runs in `withSealedDangerState`, on the branch `getSettings` already re-asks until the keystore answers (`store.ts:1077-1078`) |
| (iii) `sanitizeSettings` is also the WRITE path through `applySettingsPatch` (`store.ts:874-879`), where the seal must NOT be consulted | The pass never runs on the write path. `applySettingsPatch` calls `sanitizeSettings`, which is untouched |
| (iv) It rewrites Phase 269's contract at `store.ts:638-639` — "This bounds the SHAPE of a value. It cannot tell who wrote the file" | That contract is untouched and is now MORE true: shape stays at the shape layer and "who wrote it" stays at the seal, which is where the pass lives |

That is this phase's contribution over the research: the candidate is not wrong, it was in the wrong
module.

### 1.3 Phase 275's objection, quoted, and the answer

> "the card now says so with the right sentence, but the ORDER is not repaired, because a sanitizer
> that reorders admits a list nobody wrote."

That reasoning is real. It is already mechanical: `conformance:agents` R14 pins
`s.order.names === ['P275_Z','P275_A','P275_M']` under the rule that a name is kept entirely or
dropped entirely and is "never trimmed, case-folded, truncated, de-duplicated into something else, or
otherwise repaired into an acceptable shape" (`src/shared/settings.ts:1015-1018`). A reorder is a
repair.

**The repair does not reorder.** Three separate answers, and any one of them would be enough:

1. **No sanitizer changes.** `sanitizeEnvPassthrough` (`settings.ts:1135`) and
   `sanitizeEnvPassthroughShared` (`settings.ts:1059`) keep their signatures, their return shapes,
   their order, their cap and their outputs **byte for byte**. R14 is untouched, and every assertion
   in `src/main/settings/__tests__/p275-env-shared-seal.test.ts` and
   `p269-env-seal.test.ts:282` passes unedited. The phase adds functions; it edits neither of those
   two.
2. **The pass's output is a subsequence of the file's own list.** It walks the file's entries in the
   file's order and SKIPS the ones the seal does not cover. A subsequence contains no element the file
   did not contain and no pair of elements in an order the file did not have. "Admits a list nobody
   wrote" is not merely avoided, it is unreachable: every element and every adjacency belongs to the
   file.
3. **The rule added is not "put the confirmed names first". It is "do not spend the budget on names
   that are about to be thrown away".** Today the cap is spent on entries the seal is about to discard
   one step later. The pass spends it on entries that survive. Skipping an unconfirmed name is exactly
   what the seal already does; the only change is WHEN, and "when" is not an order.

Candidate (e4), sorting the authorised names to the front, is **REFUSED** for Phase 275's reason, and
it is named here so a later round does not propose it as a simplification.

### 1.4 What else was refused, and why, so nobody re-proposes it

- **(b) Two budgets, one for authorised names and one for the rest.** REFUSED. Up to thirty-two valid
  names would survive the shape layer per agent, and the door's own promise at
  `src/shared/agent-overlay.ts:571` — "Sixteen names is the most Tortie will read for one agent" —
  would stop being true of what the shape layer accepts. The audit says do not remove input bounds.
- **(e1) Refuse the whole over-cap list, the way `src/main/config/overlay.ts:440-444` does for
  `agents.json`.** REFUSED. It is a denial amplifier. Today a person with ten confirmed names and ten
  appended junk names keeps all ten; drop-whole would take all ten away, handing an attacker the power
  to deny names that currently survive. `conformance:agents` R15 already asserts the opposite in as
  many words. It is named here because the sibling loader does exactly this and a later round will
  ask why settings does not.
- **(e3) Raise or remove the sixteen.** REFUSED by the audit's own resolution and by the phase entry.
  The cap does not move: not raised, not removed, not split.
- **A byte bound on `settings.json`.** NOT TAKEN, and §5.2 gives the reason and the measurement.

### 1.5 Why BOTH mechanisms, proved by the auditor's own fixture

The fixture is copied unedited and it composes the two shipping functions directly:

```ts
const shaped = sanitizeSettings({ ...original, envPassthrough: { claude: [...junk, NAME] } });
const got = withSealedDangerState(shaped, seal);
const retained = got.settings.envPassthrough.claude?.includes(NAME) ?? false;
const reported = got.rejected.includes(envNameKey('claude', NAME));
expect(retained || reported).toBe(true);
```

That call has **two arguments**. It supplies no candidates, because `sanitizeSettings` already threw
the name away. So `retained` is false in the fixture even after the repair, and the fixture passes on
`reported` — **the backstop is what closes the audit's finding executably, and it stays a real test of
the backstop after the pass makes the running app survive.** The pass is what a person gets; the
backstop is what a test can prove from the outside. Neither substitutes for the other.

---

## 2. THE INVARIANT

Stated so a gate can assert it, as three clauses that must hold **together**. Any repair that buys one
by spending another has traded one defect for a different one.

> **I1 — SURVIVAL.** For every settings file and every seal, a name the seal covers survives whatever
> unconfirmed entries sit ahead of it in the file, up to sixteen names per list. Formally: the list
> Tortie returns for a key equals the file's own list for that key, in the file's own order, filtered
> to entries the seal covers and that `envPassthroughRefusal` accepts, truncated at
> `OVERLAY_LIMITS.maxEnvPassthroughNames`.
>
> **I2 — NOTHING UNCONFIRMED IS ADMITTED.** For every settings file and every seal, the returned
> `envPassthrough[id]` is a subset of `{ n : sealed.env contains envNameKey(id, n) }` and the returned
> `envPassthroughShared` is a subset of `sealed.envShared`. The returned lists are a superset of what
> the parent commit returned and a subset of the parent's shape-valid ∩ sealed set.
>
> **I3 — THE INPUT STAYS BOUNDED.** `OVERLAY_LIMITS.maxEnvPassthroughNames` is still sixteen, is still
> declared once at `src/shared/agent-overlay.ts:372`, and still bounds every list that reaches a login
> shell, a remote command line, a drawn face or a log line. No list this phase adds is echoed, and no
> echo this phase touches grows.

I1 restated as a property a gate can check mechanically, and this is the wording the gate uses:
**every returned list is a SUBSEQUENCE of the file's own list for that key** — same elements, same
relative order, nothing added, nothing moved — **and it contains every element of that list the seal
covers, up to sixteen.**

---

## 3. THE MECHANISM

### 3.1 Two new pure functions in `src/shared/settings.ts`

Both are pure, import nothing new, and are injected the way `sanitizeEnvPassthrough` already is.

```ts
/**
 * Every entry of a raw passthrough list that is a NAME, in the file's own
 * order. Nothing is trimmed, case-folded, truncated or repaired.
 */
export function envCandidateNames(raw: unknown): string[];

/**
 * The names of one list that Tortie will actually use, given the seal.
 * Walks `candidates` in order; keeps a name when the seal covers it AND
 * `envPassthroughRefusal` accepts it against the names kept so far; stops
 * accumulating at OVERLAY_LIMITS.maxEnvPassthroughNames.
 */
export function confirmedEnvNames(
  candidates: readonly string[],
  isSealed: (name: string) => boolean,
  agentEnvKeys: readonly string[],
  scope: 'agent' | 'shared'
): string[];
```

`envCandidateNames` uses the existing `isDrawableEnvName` (`settings.ts:1113`), which is where the
length test, the two explicit newline tests and `OVERLAY_ENV_KEY_PATTERN` already live. Export it or
keep it private and export only `envCandidateNames`; one spelling of that answer, either way.

**The seal is asked FIRST and the refusal second**, and the order is the whole point: a name the seal
does not cover never enters the accumulator, so it never consumes a slot. Asking the refusal first
would give the same kept list — `existing` is the accumulator either way — but it would read as if the
budget were still being spent on names that are about to be discarded, and this function exists to say
that it is not.

`confirmedEnvNames` re-uses `envPassthroughRefusal` (`src/shared/agent-overlay.ts:541`) and **must not
copy any of its rules.** The duplicate check, the cap, the three denylists and the compiled-key check
are that function's and stay there.

### 3.2 `withSealedDangerState` gains an OPTIONAL third argument

```ts
export function withSealedDangerState(
  settings: GmuxSettings,
  sealed: DangerState,
  candidates?: {
    perAgent: Partial<Record<LaunchableAgentId, readonly string[]>>;
    shared: readonly string[];
    agentEnvKeys: (id: string) => readonly string[];
    sharedRefusedEnvKeys: readonly string[];
  }
): { settings: GmuxSettings; rejected: string[]; missing: string[]; envRejected: SealEnvRejections };
```

Optional, because the auditor's fixture, `persistSettings`'s strip path (`store.ts:1020`) and every
existing test call it with two arguments and **must keep behaving exactly as they do today**, plus the
backstop. The compiled-key readers ride in the argument rather than being reached for inside, so the
function stays pure and stays exported for tests.

When `candidates` is present:

- `envPassthrough[id]` is `confirmedEnvNames(candidates.perAgent[id] ?? [], …, candidates.agentEnvKeys(id), 'agent')`
  for every launchable id the candidates name, and an agent left with no surviving name is **absent
  from the map rather than present and empty**, which is the shape the file already uses.
- `envPassthroughShared` is `confirmedEnvNames(candidates.shared, …, candidates.sharedRefusedEnvKeys, 'shared')`.

When `candidates` is absent, both lists are computed by today's filter over `settings`, unchanged.

### 3.3 The report loops do not move, and that is what keeps the echo bounded

The existing loops at `store.ts:433-474` — the ones that fill `rejected` and `envRejected` — keep
running over the **sanitized** lists on `settings`, which are capped at sixteen. They are the report,
not the result. Two consequences, and both are rules:

- Nothing this phase adds can grow a drawn or logged list. `envRejected.shared` and
  `envRejected.perAgent[id]` stay bounded by sixteen per list exactly as they are today, whatever the
  file contains.
- The pass's output must be a **superset** of the report loop's kept set, always, for every input.
  That is a re-derivation a gate asserts (§6, rule G4), and it is the cheapest proof that the pass
  only ever adds sealed names.

### 3.4 `loadFile` holds the candidates, and never on `SettingsFile`

`loadFile` (`store.ts:928`) gains a module field beside `shapeEnvRejections`:

```ts
let envCandidates: {
  perAgent: Partial<Record<LaunchableAgentId, string[]>>;
  shared: string[];
} = { perAgent: {}, shared: [] };
```

filled from the RAW `obj['settings']` with `envCandidateNames`, the same way the shared shape report
is already re-derived at `store.ts:963-972` rather than smuggled out of the pure sanitizer. That
comment's own reason applies here word for word and the builder should say so.

**THIS FIELD MAY NEVER BE PUT ON `SettingsFile`.** `writeFile` (`store.ts:996`) serialises that object
whole into `settings.json`. A later round that "tidies" the candidates onto `cached` would write an
attacker's junk names back into the person's own file. That is a rule, it is cheap to break, and it
belongs in a comment on the field.

It is cleared on the next `loadFile` and in `persistSettings` beside the two rejection fields, so it
is never held for the life of the process.

**It adds no unboundedness that is not already paid.** `loadFile` already reads the whole file with
`readFileSync` and `JSON.parse`s it with no bound, and `sanitizeEnvPassthrough` already walks every
entry of every list. The candidates are a subset of what the parse already holds, and every entry in
them is at most `OVERLAY_LIMITS.maxEnvKeyLength` bytes because `isDrawableEnvName` says so.

### 3.5 THE BACKSTOP

After the env lists are final, `withSealedDangerState` computes what the seal covers and the answer
does not contain:

- **Per agent.** Build `present`, the set of `envNameKey(id, name)` composed from the returned
  `envPassthrough`. Every key in `sealed.env` that `present` does not hold is pushed onto `rejected`
  **as the sealed key itself**, and counted.
- **Shared.** Every name in `sealed.envShared` the returned shared list does not include is pushed onto
  `rejected` as `envSharedKey(name)`, and counted.

Both are also returned in `missing: string[]`, so the caller can tell the two classes apart without
looking inside a key.

**No seal key is ever split.** `present` is COMPOSED with `envNameKey`, never parsed. Attribution of a
missing key to an agent card, which the count needs, is a **prefix test against a composed prefix**:
`key.startsWith(envNameKey(id, ''))` over the compiled closed set `LAUNCHABLE_AGENT_IDS`. The name
half is never read. This is unambiguous by the argument `envSharedKey` already makes at
`settings.ts:903-917`: `OVERLAY_ENV_KEY_PATTERN` forbids a space, `OVERLAY_ID_PATTERN` forbids a
space, so `claude ` cannot prefix a key belonging to `claude-x`, and no per-agent key can begin with
`* `. The module's rule that a key has to be unambiguous and never parseable is kept, and the comment
on the backstop must say which of the two it is relying on.

**The backstop covers `env` and `envShared` and nothing else.** A sealed launch-default flag that
vanishes from the file is drawn as an unchecked checkbox a person can see; a vanished variable name
leaves no trace at all on the card. That is the difference, and it is why the fold choice, the arch
choice and the danger flags do not get a backstop in this phase.

**The echo is bounded here too**: at most `OVERLAY_LIMITS.maxEnvPassthroughNames` keys per list are
pushed and the rest are counted, so no seal, however it came to exist, can author a paragraph.

### 3.6 The identity early-return

`store.ts:476` returns `settings` by identity when nothing was dropped and no ack was filtered. It must
now be decided by **what was dropped, what was restored and what acks were filtered — never by the
backstop.** A missing sealed name changes nothing about the settings object, and making the function
rebuild it would change an object identity for a reason that is only a report.

### 3.7 The short-circuit tripwire

`getSettings` returns the file VERBATIM without opening the seal when
`isDangerStateEmpty(dangerStateOf(file.settings))` (`store.ts:1061`). That branch is deliberate and its
reason stands: "A settings file with no danger value never reaches the keystore at all"
(`store.ts:548-550`). It is also a hole in the backstop — a file whose lists were emptied outright
takes it and nothing ever asks the seal what it covers.

**Close it for free.** Take the seal path when `file.dangerSeal` is a non-empty string even though the
danger state is empty, because **Tortie never writes that pair**: `sealDangerState` returns `undefined`
exactly when `isDangerStateEmpty(state)` (`store.ts:572-573`), and `persistSettings` omits the `dangerSeal`
key entirely when the seal is `undefined` (`store.ts:1030-1036`). A blob beside an empty state is a
state only tampering or a rollback produces. An ordinary install has no blob at all, so this costs it
no keychain access and no prompt, and the existing cost sentence on the seal header stays true.

A builder must READ both of those sites and confirm the pair is unwritable before relying on it; a
gate must prove it by setting a danger value, clearing it, and reading the file back (§6, rule G12).

---

## 4. THE REPORTING

### 4.1 What a person sees after the repair, on the phase's own attack

Sixteen junk names ahead of one confirmed `ANTHROPIC_API_KEY` in `settings.json`:

- The name is **on the card and working**. It reaches the pane at the next create and the next restore.
- One existing line, unchanged, tells the person what else is in their file:
  `Ignored, because they were not added here: AUDIT_UNTRUSTED_0, AUDIT_UNTRUSTED_1, … AUDIT_UNTRUSTED_15.`
- `app.log` says the same through `warnRejected`.
- **The first save from the Settings window heals the file.** `persistSettings` writes the
  seal-filtered settings — now `[ANTHROPIC_API_KEY]` — and re-seals to them, so the sixteen junk names
  leave `settings.json` and the seal names only what a human confirmed. At the parent commit that same
  save is what made the loss permanent.

**No new sentence is needed for the case the phase is named after**, and that is the strongest form of
the fix: the surface says less than it did, not more.

### 4.2 The one case still lost, and the one new sentence

A name the seal covers can still fail to appear on the card for two reasons the pass cannot repair: the
file no longer contains it at all (something deleted it), or a future version refuses it for a shape
reason that did not exist when it was confirmed. Both are rare, both are real, and both are silent
today. The backstop counts them and the card says one sentence.

`src/renderer/settings/env-copy.ts` gains a THIRD function. It must be neither of the two that exist,
and the file's own account of why says it best: `envRejectedLine`'s "not added here" is **false** about
this name — the person did add it — and `envUnreadLine`'s "Tortie will not read it" points at a dead
end.

```ts
export function envMissingLine(count: number): string {
  return count === 1
    ? 'One name you added here is not on this list any more. Add it again if you still want it.'
    : `${count} names you added here are not on this list any more. Add them again if you still want them.`;
}
```

**A count and never a name.** A per-agent seal key cannot be turned back into a bare name without
splitting it, and §3.5 refuses to split it. One rule for both lists rather than a cleverer rule that
names them on the shared card and counts them on the agent cards.

**Why the words are these words.** "you added here" says the person is not being blamed for a file they
did not write. "not on this list any more" is true whether the name was deleted or has become
unreadable, which is what lets one sentence cover both causes without a taxonomy. "Add it again if you
still want it" is an action that works: re-adding a deleted name restores and re-seals it, and
re-adding a newly refused one meets the Add sheet's own specific refusal, which is the honest end of
that road rather than a dead end. Under Just enough words this is one short sentence on a block that is
drawn at all only when somebody has edited `settings.json` by hand.

### 4.3 The shared card stops saying a false thing

`shapeEnvRejections.shared` comes from `sanitizeEnvPassthroughShared(...).refused`, which today
includes a name dropped for being past the cap. After the repair such a name may be **restored**, and
drawing `envUnreadLine` over it would tell a person Tortie will not read a name it is reading — the
exact class of untruth Phase 275's fix round existed to end.

`envRejectionsNow` (`store.ts:1126`) is where both halves are already in hand, so the subtraction goes
there and nowhere else:

- remove from `sharedUnread` every name that is on the final shared list;
- reduce `sharedUnreadOver` by the number of restored shared names that were **not** in `sharedUnread`,
  floored at zero.

That is exact rather than approximate, because every restored name was either echoed or counted, never
both and never neither. `sanitizeEnvPassthroughShared` itself is not touched, so every Phase 275
assertion on its shape table stays green.

### 4.4 The log stops saying a false thing

`warnRejected` (`store.ts:987`) says "ignoring N setting(s) … that were not set in Tortie's Settings
window". That is true of a drop and **false of a backstop entry**, which is a setting the person DID
make. It takes both lists and composes at most two sentences, doing one Set difference over opaque
strings and never a parse:

- the drops keep today's sentence, byte for byte;
- the missing get their own, naming the keys and saying they were set here and are not in effect.

### 4.5 The wire

`EnvRejections` (`src/shared/settings.ts:988`) gains two fields, and `noEnvRejections`
(`settings.ts:1002`) gains their zero values:

```ts
  /** Sealed shared names the last read did not find. A count, never a list. */
  sharedMissing: number;
  /** Sealed per-agent names the last read did not find, by agent id. Counts. */
  perAgentMissing: Partial<Record<LaunchableAgentId, number>>;
```

`SealEnvRejections` (`store.ts:368`) gains the same two, filled by the backstop. Nothing else on the
path changes: `src/main/settings/ipc.ts:211` returns the whole object and
`src/renderer/settings/settings-store.ts:528` stores the whole object.

**NAMES ONLY, still.** There is no field on any shape this phase adds that could carry a value, and the
two it adds are integers.

---

## 5. THE SHARED SET AND THE PER-AGENT SETS

Both are covered, the rule is the same for each, and the work is not the same on each.

### 5.1 The rule for each

| | Per-agent list | Shared list |
| --- | --- | --- |
| Where it lives | `settings.envPassthrough[id]` | `settings.envPassthroughShared` |
| Its seal field | `sealed.env`, keyed `envNameKey(id, name)` (`store.ts:459`) | `sealed.envShared`, BARE (`store.ts:471`) |
| Its cap | its own sixteen | its own sixteen, not shared with any agent's |
| The pass | `confirmedEnvNames(candidates.perAgent[id], k => sealedEnv.has(envNameKey(id, k)), agentEnvKeys(id), 'agent')` | `confirmedEnvNames(candidates.shared, k => sealedShared.has(k), sharedRefusedEnvKeys, 'shared')` |
| The backstop | prefix-attributed count into `perAgentMissing[id]` | count into `sharedMissing` |
| The new sentence | `envMissingLine(perAgentMissing[id])` on the agent card | `envMissingLine(sharedMissing)` on the shared card |
| Shape-layer reporting | still silent (Phase 269's contract, unchanged) | unchanged, minus §4.3's subtraction |

**Phase 275's belt one of two is untouched and must stay untouched.** A per-agent name is tested ONLY
against `sealedEnv` and a shared name ONLY against `sealedShared`, on every path, including the two new
ones. A name sealed one way may not be admitted the other way. `conformance:agents`' cross-admission
rows stay green and the gate re-drives them through the new pass as well as through the old filter.

**The two budgets stay two budgets.** `agent-overlay.ts:557-570` records why, and the pass inherits it
for free by calling `envPassthroughRefusal` once per list with that list's own accumulator.

### 5.2 What is NOT bounded here, said plainly

`loadFile` reads `settings.json` whole with no size bound (`store.ts:932`), where
`src/main/config/store.ts:229` bounds `agents.json` at `OVERLAY_LIMITS.maxFileBytes` (262,144).
**This phase does not add that bound**, and the reason is a hazard rather than an oversight: Tortie
never writes `agents.json`, but it does write `settings.json`, so refusing an over-size file whole
would leave the load holding defaults and the very next `persistSettings` would write those defaults
over the person's real file. That is a worse denial than the one it prevents, and closing it properly
means a load that refuses to write, which is its own entry.

The measurement, so the next round starts from a number: the operator's own `settings.json` is
**1,253 bytes** with a 176-byte seal blob, against a 262,144-byte sibling bound — a bound with 209×
headroom that still needs a refusal-to-write path to be safe. Record this in the phase's **What is NOT
in this phase**.

---

## 6. NUMBERED RULES

A builder implements each; a gate asserts each. One sentence each, with its file.

**The shape layer does not move**

1. `sanitizeEnvPassthrough` keeps its signature, its return type, its order, its cap and its documented
   silence, byte for byte — `src/shared/settings.ts:1135`.
2. `sanitizeEnvPassthroughShared` keeps its signature and its four-field return, so every Phase 275
   shape-table assertion passes unedited — `src/shared/settings.ts:1059`.
3. `envPassthroughRefusal` is unchanged: the number sixteen, the cap check's position BEFORE the three
   denylists, and both cap sentences word for word — `src/shared/agent-overlay.ts:541-598`.
4. `OVERLAY_LIMITS.maxEnvPassthroughNames` stays 16 and stays declared exactly once —
   `src/shared/agent-overlay.ts:372`.

**The two new pure functions**

5. `envCandidateNames(raw)` returns every entry that is a string and passes `isDrawableEnvName`, in the
   file's own order, and repairs nothing — `src/shared/settings.ts`.
6. `confirmedEnvNames` keeps a name only when the seal covers it AND `envPassthroughRefusal` accepts it
   against the names kept so far, asks the seal first, and stops accumulating at
   `OVERLAY_LIMITS.maxEnvPassthroughNames` — `src/shared/settings.ts`.
7. `confirmedEnvNames` copies no rule from `envPassthroughRefusal`: the duplicate check, the cap, the
   denylists and the compiled-key check are reached, never restated — `src/shared/settings.ts`.
8. `confirmedEnvNames`' output is a SUBSEQUENCE of its input on every input — same elements, same
   relative order, nothing added, nothing moved — `src/shared/settings.ts`.

**The seal site**

9. `withSealedDangerState` takes an optional third `candidates` argument and, without it, behaves
   exactly as it does today apart from the backstop — `src/main/settings/store.ts:392`.
10. With `candidates`, each returned env list is `confirmedEnvNames` over that list's candidates, and an
    agent with no surviving name is absent from the map rather than present and empty —
    `src/main/settings/store.ts:392`.
11. The report loops still run over the SANITIZED lists, so `rejected` and `envRejected` stay bounded by
    sixteen per list whatever the file holds — `src/main/settings/store.ts:433-474`.
12. THE BACKSTOP: every sealed key the returned lists do not contain is pushed onto `rejected` and
    returned in `missing`, echo-capped at sixteen per list — `src/main/settings/store.ts:392`.
13. No seal key is split: `present` is composed with `envNameKey`, and agent attribution is a
    `startsWith` test against a composed prefix over the compiled id set — `src/main/settings/store.ts`.
14. The backstop covers `env` and `envShared` only, and nothing else on `DangerState` —
    `src/main/settings/store.ts:392`.
15. The identity early-return is decided by drops, restores and filtered acks, never by the backstop —
    `src/main/settings/store.ts:476`.
16. `persistSettings`'s strip path stays a two-argument call, so it restores nothing, reports no missing
    name, and its log line keeps its meaning — `src/main/settings/store.ts:1020`.

**The load**

17. `loadFile` fills `envCandidates` from the RAW settings object with `envCandidateNames`, and clears it
    on the next load and in `persistSettings` — `src/main/settings/store.ts:928`, `:1016`.
18. `envCandidates` is a module field and is NEVER placed on `SettingsFile`, which `writeFile`
    serialises whole into the person's own file — `src/main/settings/store.ts:996`.
19. `getSettings` takes the seal path when `file.dangerSeal` is a non-empty string even though the
    danger state is empty, because `sealDangerState` and `persistSettings` together never write that
    pair — `src/main/settings/store.ts:1061`, `:572-573`, `:1030-1036`.
20. The not-known-yet branch is unchanged: a null seal answers safely, caches nothing and announces
    nothing — `src/main/settings/store.ts:1077-1078`.

**The reporting**

21. `warnRejected` takes the drops and the missing and composes at most two sentences, by one Set
    difference over opaque strings and never a parse — `src/main/settings/store.ts:987`.
22. `envRejectionsNow` subtracts every restored shared name from `sharedUnread`, and reduces
    `sharedUnreadOver` by the restored names that were not echoed, floored at zero —
    `src/main/settings/store.ts:1126`.
23. `EnvRejections` and `SealEnvRejections` gain `sharedMissing` and `perAgentMissing` as COUNTS, and
    `noEnvRejections` gains their zeros — `src/shared/settings.ts:988`, `:1002`,
    `src/main/settings/store.ts:368`.
24. `envMissingLine(count)` is a third sentence, is neither existing sentence, and names no variable —
    `src/renderer/settings/env-copy.ts`.
25. The shared card draws it from `sharedMissing` and each agent card from `perAgentMissing[agentId]`;
    the agent card's hard-coded `unread={[]} unreadOver={0} unnamed={0}` stays, because Phase 269's
    per-agent silence is not widened here — `src/renderer/settings/LaunchDefaultsSection.tsx:394`,
    `:545`, `:591-604`.

**The three clauses of the invariant, as gate rules**

26. I1: for every fixture, the returned list is a subsequence of the file's own list AND contains every
    element of it the seal covers, up to sixteen.
27. I2: for every fixture, the returned per-agent list is a subset of the seal's names for that agent,
    the returned shared list is a subset of `sealed.envShared`, and the returned lists are a superset of
    what the parent commit returned.
28. I3: every returned list is at most sixteen long; `envRejected.shared`, `envRejected.perAgent[id]`
    and `rejected` are each at most sixteen per list plus a count; and nothing this phase adds is
    echoed.

**What must keep holding**

29. `dangerStateOf`, `isDangerStateEmpty` and the sealed text are unchanged; the sealed text still sorts
    `env` and `envShared` and is still a set — `src/main/settings/store.ts:291`, `:346`, `:576`.
30. Laundering is impossible: after a tampered load and any save, the sealed text names only what a
    human confirmed and `settings.json` holds only those names — `src/main/settings/store.ts:1016`.
31. `src/main/config/overlay.ts` and `src/main/config/confirm.ts` are not touched and gain no import, so
    `conformance:agents` R10's static rule stays green.
32. `src/shared/launch-env.ts` is not touched; the union stays uncapped by design and the four launch
    paths and the shell watcher keep reading the single seal-filtered `getSettings()` —
    `src/shared/launch-env.ts:79`.
33. `src/main/machines/remote-env-carriage.ts` is not touched; its own sixteen over the union is a
    different door and it already reports what it drops.
34. `restore.ts`'s trust of `rec.envPassthrough` is unchanged and the limitation is restated in the
    commit body and in the backlog entry — `src/main/restore/restore.ts:988`.
35. No value anywhere: every field, sentence, log line and test fixture this phase adds carries a name
    or a count, and every name has passed `OVERLAY_ENV_KEY_PATTERN`.

---

## 7. PROOF

### 7.1 The closure test

`docs/audits/fixtures/2026-09-14/env-cap-disclosure.test.ts.fixture` is copied **unedited** to
`src/main/settings/__tests__/audit-0914-env-cap.test.ts`. Both tests pass. Measured at `b4569686`:
`× untrusted prefix entries cannot silently displace an authenticated name` / `✓` the control /
`Tests 1 failed | 1 passed (2)`. The attack passes on `reported`, not on `retained`, for the reason in
§1.5, and the builder states that in the file's header so a later round does not "fix" the fixture.

### 7.2 The gate — `conformance:envcap`, `build/p278/conformance.mjs`

No Electron, no tmux, no ssh, no keychain; the seal is supplied as a `DangerState` the way the
auditor's fixture supplies it. Under a second, the battery cost of the domain it guards. It drives
rules 1 to 35 and it must include, as its own independent derivation rather than as a re-run of the
builder's tests:

- **G1 — the subsequence check, computed by the gate's own longest-common-subsequence over the file's
  raw list and the returned list**, not by comparing to an expected array the builder wrote.
- **G2 — the attack matrix**, one row each and every row asserting I1, I2 and I3 together: 16 junk
  ahead; 200 junk ahead; 16 junk ahead and 16 behind; case-variant squatters (`anthropic_api_key`
  ahead of `ANTHROPIC_API_KEY`); a duplicate of the authorised name placed first; non-strings
  interleaved; a name copied from another agent's list; the authorised name deleted outright; the cap
  reached by sixteen CONFIRMED names alone; a list of sixteen confirmed plus one confirmed
  seventeenth; and the same ten over the shared list.
- **G3 — the parent comparison.** Every row is run against the parent commit's composition as well, and
  the gate prints both answers, so "it is fixed" is a difference rather than an assertion.
- **G4 — the superset re-derivation.** For every row, the pass's output is a superset of the report
  loop's kept set and a subset of shape-valid ∩ sealed.
- **G5 — the cross-admission rows**, through the new pass: a shared name sealed under an agent id is not
  admitted as shared, and a per-agent name sealed as shared is not admitted for that agent.
- **G6 — the two budgets**: sixteen shared and sixteen per-agent both survive together, through the pass.
- **G7 — the echo bounds**: 200,000 entries in one list produce a `rejected`, an `envRejected` and a
  drawn line each bounded by sixteen plus a count, and the gate measures the joined byte length the way
  Phase 275 measured 12,088,932.
- **G8 — the sentences**, read FROM `env-copy.ts` rather than written out in the gate, and asserted
  distinct from each other: `envRejectedLine`, `envUnreadLine`, `envMissingLine`.
- **G9 — `sharedUnread` never names a restored name**, and `sharedUnread.length + sharedUnreadOver`
  accounts for every shape-layer drop that was not restored.
- **G10 — the log** says two sentences and the missing keys never appear under the drops' words.
- **G11 — the laundering counter-attack**: tamper, load, save, read the sealed text back, and show it
  names only what a human confirmed and that `settings.json` no longer holds the junk.
- **G12 — the tripwire's premise**: set a danger value, clear it, read the file back, and prove Tortie
  wrote no `dangerSeal` key beside an empty danger state.
- **G13 — purity**: `src/shared/settings.ts` and `src/shared/agent-overlay.ts` import nothing new, and
  neither names a keystore, a path or a process.

### 7.3 The ablations — `ablation:p278`, `build/p278/ablation.mjs`

One clause each, each red on the rule that owns it, restored by checksum. At least: remove the seal
test from `confirmedEnvNames` (I2 goes red, not I1); remove the cap from `confirmedEnvNames` (I3 red);
remove the backstop (the auditor's fixture goes red and nothing else does); remove the tripwire (only
the outright-deletion row goes red); remove the `sharedUnread` subtraction (G9 red); wire the pass into
`sanitizeSettings` instead of the seal site (the write-path row goes red); put `envCandidates` on
`SettingsFile` (the "junk written back to the file" row goes red).

### 7.4 The app run — `probe:p278`, `build/p278/probe-p278.mjs`

**One Electron**, one scratch profile, one scratch `HOME`, its own tmux socket, all ended and unlinked
in a `finally`, launched through `build/electron-run.mjs`. It drives every claim in that one session
and it is the only launch of the phase:

1. Confirm a name for one agent and a name on the shared list through the running Settings window, so
   the seal is real rather than composed.
2. Quit the window, write sixteen junk names ahead of each of them in `settings.json` by hand — the
   thing any agent on the machine can do — and start Tortie again.
3. Read both cards: the confirmed names are drawn, and the junk is named under "not added here".
4. Start a session whose agent is a **stand-in executable the probe writes**, which reads its own
   `environ` and records WHICH NAMES it received and never a value. The confirmed name is in that list.
   This is Phase 275's technique and it is the only honest proof, because our own record of what we
   sent is not evidence that it arrived.
5. Save anything from the Settings window, quit, and read `settings.json` back: the junk is gone and
   the seal names only the two confirmed names.
6. Delete the confirmed name from the file by hand, start again, and read the new sentence off the
   card.
7. Measure the parent commit on steps 3, 4 and 6 and print both answers.

`probe:p278:parent` may be a mode of the same script rather than a second file. Every process it starts
it ends in a `finally`. It launches no agent CLI, spends no token and reads no real key: every name is
invented and matches no provider's.

### 7.5 Tier 3, and the independent methods named in advance

The domain decides which of a person's shell variables reach a process Tortie starts, and the seal is
the thing being reasoned about, so the tier is not negotiable. The two independent methods, one of
which is an attack:

- **Re-derive independently.** The verifier writes its OWN subsequence and subset checker by a
  different method than G1's, over its own fixtures, and disagrees with the gate before it agrees with
  it.
- **Attack, do not confirm.** The verifier's job is to find a settings file and a seal for which a
  confirmed name is lost without a sentence, or for which an unconfirmed name survives. Shapes the gate
  does not already run: a seal replayed from an older file; a seal covering an agent id no longer
  launchable; sixteen confirmed names and a seventeenth confirmed one; a name confirmed on the shared
  list and written into an agent's list; and the same over the `--bg` of a real restore.

---

## 8. WHAT MUST NOT CHANGE

Eight refusals. Each is a thing a later round could undo for convenience, so each says what it costs.

1. **The seal's first layer.** A name no human confirmed is dropped. Refusal 8: a human confirms the
   bytes, out of band of any agent turn. The pass admits a name only when the seal covers it, which is
   the same test `withSealedDangerState` makes today; it does not relax it, widen it, or move it.
2. **The input bounds.** Sixteen per list, declared once, unmoved, unraised, unsplit. The cap still
   bounds the login-shell probe at every create and every restore
   (`src/main/sessions/create-local.ts:656`, `src/main/restore/restore.ts:995`,
   `src/main/tmux/resolve.ts:1010`), the names quoted into the far machine's command line
   (`remote-env-carriage.ts:105`), and every drawn and logged list. **What its number means now** is
   sixteen names Tortie will actually use, rather than sixteen entries at the front of the file: the
   Add sheet's "Sixteen names is the most Tortie will read for one agent" becomes true of what Tortie
   reads rather than of what it parses.
3. **The confirm hash moves when, and only when, the name set changes.** There are two hashes and the
   phase must not confuse them. `executionHash` (`src/main/config/confirm.ts:258`) covers `agents.json`
   overlay rows and normalises `envPassthroughNames` as a sorted set at `:207`; `conformance:agents`
   R10 asserts statically that `overlay.ts` and `confirm.ts` never name `envPassthroughShared` or
   `envShared` and never import settings outside `@shared`, so this phase keeps it green by touching
   neither file. The settings-side equivalent is the SEALED TEXT,
   `JSON.stringify(dangerStateOf(settings))` at `store.ts:576`, and `dangerStateOf` sorts both `env`
   and `envShared` at `:310-326` so it too is a set: R30 (moves on add, returns on remove,
   order-insensitive), R2 (the shared field holds BARE names) and R7 (`isDangerStateEmpty` still sees a
   shared-only file) must all still hold, and rule 29 asserts it.
4. **The restore boundary at `restore.ts:988`.** Unchanged, and it stays a STATED limitation in the
   commit body, in the backlog entry and in the release note's silence about it. Do not close it here.
5. **No value anywhere.** No field, sentence, log line, probe output or test fixture this phase adds
   may carry a value, a length or a hint of one. The probe's stand-in executables report names.
6. **The order of the checks in `envPassthroughRefusal`.** The cap check stays before the three
   denylists, because "The order of the checks IS the sentence a person gets"
   (`agent-overlay.ts:530-533`), and moving it moves what the Add sheet says.
7. **Phase 269's per-agent silence, and Phase 275's two-field split.** The per-agent sanitizer stays
   silent and the agent card keeps `unread={[]}`; `shared` stays the seal's answer and `sharedUnread`
   the shape layer's, each with its own sentence. This phase adds a third field and a third sentence;
   it does not merge the two that exist.
8. **The remote rung.** `remote-env-carriage.ts` and `remote-env-probe.ts` are not touched.
   `REMOTE_ENV_ALLOWED` stays at exactly two names. Its sixteen over the union is a different door,
   asked a second time on purpose, and `conformance:remoteclose` and R26 stay green untouched.

---

## 9. FILE OWNERSHIP — two builders, disjoint

### CORE — the repair and the sentence

```
src/shared/settings.ts
src/shared/agent-overlay.ts                       (comments only; no value moves)
src/main/settings/store.ts
src/renderer/settings/env-copy.ts
src/renderer/settings/LaunchDefaultsSection.tsx
src/main/settings/__tests__/audit-0914-env-cap.test.ts       (new, copied unedited)
src/main/settings/__tests__/p278-env-cap.test.ts             (new)
```

`LaunchDefaultsSection.tsx` is CORE's because the third sentence has to be drawn and GATE owns nothing
under `src/`. `agent-overlay.ts` is listed so nobody else edits it; the expected diff there is a
comment on `OVERLAY_LIMITS.maxEnvPassthroughNames` recording that the cap now counts names that
survive, and **no change to the number or to any check**.

CORE must **not** edit `src/main/settings/__tests__/p269-env-seal.test.ts` or
`p275-env-shared-seal.test.ts`. They pass unedited or the repair is wrong (rules 1 and 2). If one goes
red, that is a finding, not a test to update.

### GATE — the proof

```
build/p278/**                                     (conformance.mjs, ablation.mjs, probe-p278.mjs)
package.json                                      (the "scripts" block only)
docs/audits/contract-baseline.txt
build/agents-conformance-probe.mts                (only if a row must be re-driven through the pass)
build/conformance-agents.mjs                      (same)
```

New scripts: `conformance:envcap`, `ablation:p278`, `probe:p278`. GATE raises `HELPER_USER_FLOOR` in
the same commit if `probe-p278.mjs` reaches `build/electron-run.mjs`, and adds `probe-p278.mjs` to
`build/background-fixtures.mjs` only if it walks past `gate:background`.

`EnvRejections` gaining two fields may move the contract inventory. GATE regenerates
`docs/audits/contract-baseline.txt` with
`node build/contract-inventory.mjs --out docs/audits/contract-baseline.txt` in the same commit and
names the moved lines in the commit body.

### The integrator, so the two builders never touch the same file

```
CLAUDE.md                     (one row in the path-triggered gate table for conformance:envcap)
docs/BACKLOG.md               (the Phase 278 section's outcome and ONE running-log line at the bottom)
CHANGELOG.md, package.json's "version"
```

---

## 10. THE COMMIT BODY MUST SAY THESE FOUR THINGS

1. **It fails closed.** No extra name was authorised, no value was resolved, nothing leaked, at the
   parent or after. The defect was that a person lost a setting they made and was not told which one.
2. **The loss was becoming permanent at the next save**, and now the next save heals the file instead.
3. **Phase 275's objection was answered rather than ignored**: nothing is reordered, no sanitizer
   changes, and the list Tortie uses is a subsequence of the list in the file.
4. **The restore boundary at `restore.ts:988` is unchanged and still trusts the manifest row**, as it
   already trusts the recorded argv; recipe authentication is a separate durability and security
   design and is not closed here.

---

## Corrections after verification (2026-09-17)

This section records where the build diverged from the text above, so a later round reads what shipped rather
than what was planned. Where it conflicts with an earlier section, this section wins.

1. **The p275 test WAS edited (§1.3 point 1, §9).** `p275-env-shared-seal.test.ts`, "never tells a person a name
   they DID confirm was not added here", asserted Phase 275's LIMIT as expected behaviour: sixteen junk names
   ahead of a sealed name gave `envPassthroughShared: []` and put the sealed name on `sharedUnread`. This phase
   exists to remove that limit, so the test went red for the right reason. It now asserts the confirmed name is
   delivered exactly (`toEqual([SHARED])`), is on neither drop list (`sharedUnread: []`, `sharedUnreadOver: 0`,
   `sharedMissing: 0`), and that all sixteen junk names are still refused by the seal. It passes at HEAD and
   fails at `b4569686`. §9's rule that a red p275 test "is a finding, not a test to update" was right in general
   and wrong for this one test, whose subject was the defect.
2. **Closing the Settings window undid the repair, and that was fixed.** `saveSettingsWindowBounds` wrote
   `cached.settings` — the SANITIZED list, already cut at sixteen in file order — back to `settings.json` with its
   seal, so a confirmed name survived the load and was lost on disk the next time Settings closed. It now re-reads
   `settings.json`, replaces only `settingsWindowBounds`, and writes everything else back exactly as the file holds
   it, seal included. One reader, `readSettingsObject()`, serves both it and `loadFile`.
3. **The tripwire has three causes, not two (§3.7, rule 19):** an emptied danger state beside a seal, a sealed
   name this build refuses on shape, and — before item 2 — the bounds door writing the pair.
4. **Renames (§3.1, rules 5 and 17).** `envCandidateNames` in `src/shared/settings.ts` became `envFileEntryNames`,
   and the store's module field `envCandidates` became `fileEnvEntries`, because both names already meant
   something else (the preload bridge method and the renderer store field).
5. **`sharedMissing` counts only sealed shared names the file no longer holds.** A sealed name still in the file is
   reported once, on the unread line, rather than twice. The app.log sentence reads "not on the list Tortie reads
   any more, so they are not in effect", which is true for both causes.
6. **`withSealedDangerState` filters `candidates.perAgent` to launchable ids itself**, with `hasOwnProperty`
   lookups, so the pure function keeps its own promise rather than relying on `loadFile`'s filter.
7. **No `conformance:envcap`, `ablation:p278` or `probe:p278` shipped (§8).** The committed guard is
   `src/main/settings/__tests__/p278-env-cap.test.ts` (23 tests over the shipping `getSettings` and a real scratch
   `settings.json`), proved by 21 ablations run against a copy of HEAD, each restored by sha256. The half-built
   probe files the stalled gate builder left in this directory (`envcap-probe.mts`, `rows.mjs`,
   `electron-seal-stub.ts`, `tsconfig.json`) had no judge, no script and no gate, and the rename in item 4 broke the
   probe's lookup, so they were deleted rather than committed.
8. **The card gives a count for a name the file no longer holds, not the name (§4.2).** A verifier asked for the
   name; §4.2's choice of a count stands. app.log names every missing key.

## Corrections after Phase 282.1 (the reverify of 2026-09-18)

1. **The bounds door's unreadable-file arm wrote the Phase 278 shape one door over (item 2 above).** The fix
   round's `saveSettingsWindowBounds` re-reads the file and replaces one key, and when the re-read fails — a file
   truncated by a hand edit or an editor mid-write, a JSON array, a missing file — it fell back to writing
   `cached`, whose `settings` is the SANITIZED list cut at sixteen in file order, beside the old seal. Two
   reverifiers reproduced it independently: 16 junk names plus a confirmed `AUTH` on both lists, the file
   truncated by 20 bytes at the re-read, then `saveSettingsWindowBounds` → the disk held 16 junk names and no
   `AUTH` on both lists with the seal kept, and the next launch delivered nothing from either list and reported
   `sharedMissing: 1`, `perAgentMissing: {claude: 1}`. The arm now writes THIS LOAD'S HEALED SETTINGS — `getSettings()`,
   the confirmed names put back and the junk dropped, which the seal on disk covers exactly, so it is what
   `persistSettings` writes minus the re-seal this door still never does — and clears the load's reports the same
   way (`settingsHalfWritten`, shared with `persistSettings`). When the seal's answer is not final (keystore not
   ready, so `getSettings` answered with every danger value stripped and cached nothing) it writes NOTHING and
   logs one line, because a bounds write that stripped a confirmed flag would be worse than a window that opens
   where it did last time; the bounds stay in memory for the run. A fresh install with no file still gets its
   bounds written beside the defaults. `p278-env-cap.test.ts`, "CLOSING THE SETTINGS WINDOW keeps the repair",
   gains the three unreadable arms, the seal-not-open arm and the fresh-install control; the four new arms are
   red at `ecaa1353`.
2. **A settings write racing a bounds save cannot interleave (item 3 of the Phase 282.1 entry).** Both are
   synchronous in main — `readFileSync`, `writeFileSync`, `renameSync`, no await between the re-read and the
   write — so a name confirmed "between" them lands whole before or after. Read, not driven; the attack verifier's
   arm (c) drives the two orders and reads both files whole.
