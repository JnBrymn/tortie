# Phase 276 — the shell is asked once, not once per session

**The contract for the builders, the integrator and the verifier.** It decides. Where a researcher
offered two answers, one of them is written here and the other is named as refused, with the reason.
Read `docs/BACKLOG.md` "## Phase 276" first — this file is subordinate to it and adds only the
decisions the entry left to the spec.

Subject: `feat(launch): the login shell is asked once, not once per session`
First body line: `Phase 276: ask the shell once`
Semver: **minor**, because §4 builds a visible control. Tier 3, because the invalidation is what moves.

**THE SUBJECT TYPE MOVED FROM THE ENTRY'S `perf` TO `feat`, ON PURPOSE.** The entry wrote
`perf(launch): …` and said in the same breath *"If the refresh becomes a visible control it is minor,
and the phase says which it built."* §4 decides it is visible. A minor release is `feat` in this
repository's convention, so the type follows the semver rather than the substance. The substance is
still the speed-up and the commit body leads with the measurement.

---

## 0. The four corrections the research made to the brief, adopted here

These are load-bearing and every section below assumes them.

1. **NEITHER WATCH ARM IS SUFFICIENT ALONE, and the entry only names one.** The entry says to follow
   `src/main/credentials/watch.ts` and watch the DIRECTORY. Measured: a directory watch on `$HOME`
   goes completely silent when `~/.zshrc` is a symlink into a dotfiles repo, because nothing in
   `$HOME` moves when the repo is edited. A FILE watch catches that one and is useless for everything
   else — after the rename-over every editor does it reported 1 event, then 0 and 0 on the next two
   edits, and it cannot be opened at all for a file that does not exist yet (`ENOENT`). §3 builds
   **both arms**: the literal directory with a basename filter, and the realpath's directory with the
   realpath's basename.

2. **THE DEBOUNCE MUST NOT BE COPIED VERBATIM, and copying it would ship a staleness hole on
   purpose.** `credentials/watch.ts` debounces its whole reaction at 400 ms because its reaction READS
   vendor stores and WRITES Tortie's own. Ours is two things with opposite costs: dropping the cache
   is an assignment, and re-warming spawns a login shell. §3.4 debounces only the second. A 400 ms
   debounce on the drop would leave a window in which a create reads a value we already know is stale.

3. **THE COVERAGE KEY AND THE SETTINGS LISTENER ARE NOT ALTERNATIVES.** The entry offers *"either the
   key includes the set, or adding a name invalidates"*. §1 builds both and says which is
   load-bearing: coverage is the CORRECTNESS device and needs no listener at all, and the listener is
   a RESIDENCY and WARMTH device. A build with only the listener is wrong; a build with only coverage
   is correct and colder.

4. **`resolve.ts` MAY NOT IMPORT THE SETTINGS STORE, and the reason is measured.**
   `src/main/settings/store.ts:60` imports `electron`; `src/main/tmux/resolve.ts` is deliberately pure
   Node except two lazy `require('electron')` calls (`:37`, `:884`). More than that,
   `src/main/machines/remote-env-probe.ts:43-54` records the cost of getting exactly this wrong: a
   settings read placed in `remote-env-carriage.ts` took `machines/context.ts` — the door every LOCAL
   session goes through — from 78 modules and no settings module to 87 and one, and the cycle gate
   stayed green throughout because a new EDGE is not a cycle. So the cache lives in `resolve.ts` and
   the union computation and the settings subscription live in a new domain under `src/main/env/`
   which nothing low-level imports.

---

## 1. The cache

### 1.1 Where it lives, and in whose idiom

In `src/main/tmux/resolve.ts`, beside `getUserPath` (`:755-762`), in the promise-plus-generation shape
that module already has. Not a new module and not a second caching idiom in a file that has one twelve
lines away, which is the entry's own instruction.

What is borrowed from `getUserPath`, exactly:

- **The slot is filled SYNCHRONOUSLY on the first ask**, before any await, so there is no window in
  which two callers both see an empty slot. `getUserPath` assigns `userPathPromise` on the same line
  that starts the capture (`:757-758`).
- **The generation moves ON THE LINE THAT ASSIGNS**, not when the capture answers. `resolve.test.ts:515-519`
  pins that for the PATH counter with no `await` in it, commented *"the counter moves where the
  promise is assigned, which is synchronous"*.
- **The generation is monotonic and a drop never rewinds it.** `resetUserPathCache` (`:776-779`)
  deliberately leaves `userPathGeneration` alone — *"Leaves the epoch alone, so the next capture moves
  it"* — and that is what makes it usable as a key part.

What is NOT borrowed, and each has its own section: the failure handling (§2), because
`captureLoginShellEnv` signals failure by VALUE and never by rejection; and the arming (§1.6), because
this cache must be off until something is watching it.

### 1.2 The key is COVERAGE, and there is exactly one slot

```ts
/** One answered capture, and the names it was asked for. NEVER handed out. */
interface EnvSlot {
  /** The de-duplicated set the probe was asked for, invalid names included. */
  readonly names: ReadonlySet<string>;
  readonly result: CaptureEnvResult;
}
let envSlot: EnvSlot | null = null;
let envInFlight: { names: ReadonlySet<string>; promise: Promise<CaptureEnvResult> } | null = null;
let envGeneration = 0;
let envCacheArmed = false;
```

**An ask for the set S is a HIT if and only if every name in S is in `envSlot.names`.** On a hit the
answer is PROJECTED onto S (§1.3). On a miss the probe runs for `union(S, envSlot?.names ?? [])` —
widening, never narrowing — and the answer becomes the new slot.

**Why coverage and not equality.** Equality keying makes the phase's own warm-up (§5) unusable:
nothing at boot knows which agent a person is about to create, so the set the warm-up probes with
would equal no later ask and every create would miss. Coverage is the only key under which a startup
probe that does not know the agent can serve a later create. It also collapses the per-agent thrash
equality has — agent X asking `[SHARED, X_KEY]` and agent Y asking `[SHARED, Y_KEY]` is two entries,
two probes and two copies of the shared values under an equality map, and one slot and one probe here.

**Why widening on a miss is free, measured rather than assumed.** The cost is the shell start and not
the number of `printf`s: on the calibrated slow home, `zsh -lic` for **1 name** read 811, 818, 828,
834, 838 ms and for **52 names** read 918, 853, 850, 854, 839 ms. So probing for more names than the
caller asked costs nothing, and widening is what stops two agents with different per-agent lists from
evicting each other.

**The slot is capped at `ENV_SLOT_MAX_NAMES = 256`.** The settings doors cap each list at
`OVERLAY_LIMITS.maxEnvPassthroughNames` (16), and `LAUNCHABLE_AGENT_IDS` is 13 rows, so the
configuration can declare at most 13 × 16 + 16 = 224 names. 256 is that with room. Past it the slot is
**replaced by the caller's own names** rather than grown — never a partial merge, and never a silent
truncation of what the caller asked for, because a truncated ask would report a name as `missing` that
the shell was never asked about. A population past 224 is a manifest full of old `agents.json` rows
rather than a configuration, and it is the case the cap exists for.

### 1.3 The projection, and why it is not a new rule

`finish` (`resolve.ts:478-496`) already decides `missing` as *asked, and not in `values`*: an unset
name, an empty value and a value over `ENV_CAPTURE_MAX_VALUE_BYTES` all fall through to `missing` and
never reach `values` (`:484-491`). So the projection is the same function expressed over a wider
input:

```ts
function projectEnvSlot(slot: EnvSlot, names: readonly string[]): CaptureEnvResult {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of new Set(names)) {
    const value = slot.result.values[name];
    if (value === undefined) { missing.push(name); continue; }
    values[name] = value;
  }
  return { values, missing: missing.sort(), probeFailed: false };
}
```

Three properties that are each a rule in §7:

- **A FRESH object every time.** `create-local.ts:650` does `resolvedEnv = envProbe.values`, which
  ALIASES the record it was handed. Today every caller gets a new object from `finish`. Under a slot,
  handing out `slot.result.values` would let one create's downstream mutate the cache for every later
  one. The projection allocates.
- **THE CALLER'S ORDER, NEVER THE SLOT'S.** `finish` builds `values` by `for (const name of usable)`
  (`:483`), so key insertion order is the ask's own row-then-per-agent-then-shared order; `paneEnvFor`
  spreads it (`launch-plan.ts:344-357`) and `createSession` emits one `-e` per key via
  `Object.entries` (`tmux/sessions.ts:176`). Phase 275 promised *"no argv order … changes for a person
  who never uses the shared list"* (`launch-env.ts:53-57`). A projection that iterated the slot's set
  would move that order, so the loop is over `names` and the dedupe preserves first-seen order.
- **`probeFailed` is always `false` on a projection**, and that is provable rather than asserted,
  because §2 refuses to install a failed result into the slot. A name failing `ENV_NAME_RE` is not a
  special case: it was never in `values`, so it lands in `missing`, which is what `finish`'s
  `unusable` arm (`:447-461`) already does.

### 1.4 The case a person WILL hit, traced step by step

> *Add a second key in Settings, start a session, get the new one.*

The person already has `DEEPSEEK_API_KEY` on the shared list. Tortie has been running for an hour and
the slot holds `{DEEPSEEK_API_KEY, HOME, ZDOTDIR}`. They open Settings → Launch defaults, add
`FIREWORKS_API_KEY` through the picker, confirm it, close Settings, and start a session.

1. **The add is sealed and persisted.** `updateSettings` (`settings/store.ts:1138-1141`) writes the
   file and calls every listener.
2. **The listener fires (§3.5).** `declaredEnvNames()` now reads `[DEEPSEEK_API_KEY,
   FIREWORKS_API_KEY]`, which differs from the last value, so the slot is dropped, `envGeneration`
   moves, and a re-warm is scheduled 400 ms out.
3. **Suppose the person beats the re-warm and creates the session within 400 ms.**
   `create-local.ts:649` asks for `[DEEPSEEK_API_KEY, FIREWORKS_API_KEY]`. The slot is empty, so it is
   a miss, so the create probes — one second, once — and both values arrive. **The listener was not
   needed for this to be correct.**
4. **Now suppose the listener had never been built at all.** The slot still holds
   `{DEEPSEEK_API_KEY, HOME, ZDOTDIR}`. The ask contains `FIREWORKS_API_KEY`, which is not in
   `envSlot.names`, so **coverage says MISS** and the create probes. The new key still arrives.
5. **And suppose the re-warm did run first.** The slot holds both names, the create HITS, and the
   create costs a median 22 ms instead of 1,015 ms.

**That is why coverage is the load-bearing half.** Adding a name can never be served from a slot that
does not mention it, by construction, with no listener, no event and no timer in the path. The
listener buys two things and neither of them is correctness: a name a person REMOVED stops being held
in memory, and the create after an edit is not the one that pays the second.

**And here is the case coverage does NOT cover, stated in the same breath, because it is the whole
reason §3 exists.** The person does not add a name — they ROTATE the value of a name the slot already
covers. Coverage hits and serves the old value. That is the phase's blocking finding, it is silent,
and the only things that catch it are the watcher (§3) and the refresh (§4).

**Coverage protects the NAME set. The watcher protects the VALUES. The refresh protects what neither
can see.** Those three sentences are the whole design and they belong in the commit body.

### 1.5 The exported surface

```ts
/** The one door. Every consumer of a login-shell env answer goes through it. */
export function loginShellEnvFor(names: readonly string[]): Promise<CaptureEnvResult>;

/** Arm or disarm the cache. OFF until something is watching it — see §1.6. */
export function enableLoginShellEnvCache(on: boolean): void;

/** Drop the slot and the in-flight pointer, and move the generation. */
export function dropLoginShellEnvCache(): void;

/** How many times the slot has been filled or dropped in this process. */
export function loginShellEnvEpoch(): number;

/** The names the slot covers, sorted. NAMES ONLY — there is no value door. */
export function loginShellEnvNamesHeld(): readonly string[];
```

Re-exported from `src/main/tmux/index.ts` beside `captureLoginShellEnv` (`:44-70`).

`captureLoginShellEnv` **stays exported and stays unchanged, byte for byte.** It is what
`loginShellEnvFor` calls, and it is what a disarmed cache is.

`loginShellEnvNamesHeld` is a main-process read for the gate and for a unit suite. **It does not go on
the IPC contract**, and the probe does not need it: a hit is ~22 ms and a miss is ~1,000 ms, so the
probe proves hit-versus-miss by the create's own duration, which is also the phase's headline number.

### 1.6 THE CACHE IS OFF UNTIL SOMETHING IS WATCHING IT

`envCacheArmed` starts `false`. While it is false, `loginShellEnvFor(names)` is exactly
`captureLoginShellEnv(names)` — **no slot read, no slot write, and no in-flight join** — which is
today's behaviour byte for byte.

It is armed by `startEnvWatch()` (§5) and only after that function has derived a non-empty watch set
AND opened at least one watcher handle. It is disarmed by `stopEnvWatch()`, which also drops the slot.

**This is the structural property the Tier 3 verdict rests on, and it should be the first sentence of
the commit body's safety paragraph.** A stale key requires the cache to be on; the cache being on
requires the invalidation to be armed. So every way this phase can fail to build its watcher — an
unrecognised `$SHELL` (§3.2), a home no watcher can open, a start that lost its race with the quit, a
harness launch that returned before the boot chain — lands on today's cost rather than on an
uninvalidatable cache. It is a proof rather than a convention.

**The in-flight join is refused while disarmed, deliberately.** Sharing a probe between two concurrent
creates would be safe and would help a restore burst, and it is still refused, because an in-flight
share is a cache with a lifetime of one second and this phase's rule is that no answer is reused while
nothing is watching. One create, one probe, today's behaviour, nothing to argue about.

### 1.7 The in-flight join

`envInFlight` holds `{ names, promise }`. A second ask joins it **iff its names are all in
`envInFlight.names`**, by the same coverage test as the slot read. Otherwise it starts its own probe
and replaces `envInFlight`.

Under §1.2's widening the second branch is nearly dead — the in-flight probe is usually the warm-up's
full declared cover, and every real ask is a subset of it — but it must exist, because the alternative
is serving a caller an answer that does not mention the name it asked for.

**Two callers sharing a capture do not share an ANSWER.** Each projects onto its own list, so create A
never sees agent B's values and never gets B's names on its `-e` line.

**Sharing cannot poison either caller**, and this is stronger than `installUserPath`'s equivalent
(`user-path.ts:46-71`). `captureLoginShellEnv` **never rejects** — its docstring says so at `:442-445`
and every arm proves it: the deadline calls `finish(true)` (`:531`), `close` calls
`finish(found.size === 0)` (`:537`), the spawn `error` handler calls `finish(true)` (`:544`) and the
outer catch calls `finish(true)` (`:553`). So the shared promise always resolves and no waiter can
inherit an unhandled rejection. That is why §2's failure handling is a `.then` and never a `.catch`.

### 1.8 The late-landing guard, which is a race this phase CREATES

`captureLoginShellPath`'s `finish` writes the module-level `lastCapture` (`:289`) whenever it lands, so
a probe started before a reset could land after it and overwrite the newer verdict. It never fires
today because `resetUserPathCache` has no production caller — grep over `src/` and `build/` finds only
tests and the re-export at `tmux/index.ts:55`.

**This phase gives its cache a PRODUCTION invalidator, so the race becomes live and routine.** A probe
started before a rotation can land after it and install a pre-rotation answer over a slot the watcher
has just cleared. That is a stale key delivered silently — the phase's own blocking finding, arriving
by the back door.

The fix is one line of the idiom the module already has: **every probe is stamped with the generation
it was started at, and on settle it refuses to install if `envGeneration` has moved.**

```ts
const started = envGeneration;
const probe = captureLoginShellEnv([...ask]).then((result) => {
  if (envInFlight?.promise === probe) envInFlight = null;
  if (started !== envGeneration) return result;     // a drop overtook us
  if (result.probeFailed) return result;            // §2
  envSlot = { names: new Set(ask), result };
  envGeneration += 1;
  return result;
});
```

Note the guard is `started !== envGeneration` and not `<`, and that `envGeneration` moves on a
successful INSTALL as well as on a drop, so the epoch counts fills and drops alike and is monotonic in
both.

---

## 2. Failure is never cached as success

**`probeFailed: true` is a RESOLVED value and not a rejection**, so the naive `promise ??= capture()`
would remember a failure for the life of the process and every session for the rest of the app run
would launch with no values and an `env-unresolved` notice. That is Phase 269's silent,
provider-shaped failure re-created by our own optimisation, and it is the outcome the entry names as
blocking.

**The rule: SHARE THE IN-FLIGHT PROMISE, NEVER FILL THE SLOT FROM A FAILED ONE.**

1. Every concurrent waiter gets the failed result, and each posts its own `env-unresolved` with
   `probeFailed: true` (`create-local.ts:711-717`). Correct: each of them really did launch a pane
   without the values.
2. On settle, install into the slot **only when `result.probeFailed === false`**.
3. When it is true, clear `envInFlight` and leave the slot as it was, so the next create probes again.
   This is `installUserPath`'s *"a rejection clears the memo … so a retry after the user fixes their
   machine is a fresh attempt"* (`user-path.ts:41-44`) adapted to a function that signals failure by
   value.

**A PARTIAL ANSWER IS NOT A FAILURE, AND IT IS CACHED.** `probeFailed: false` with names in `missing`
means the shell answered and has no usable value for those names — unset, empty, or over the 4096-byte
cap (`:484-491`). That is a true statement about the shell and it is cached.

The argument, because a reviewer will want to refuse this and the refusal costs a person a full second
per create forever: **a stale MISS is self-announcing and a stale HIT is silent.** A cached miss
produces an `env-unresolved` notice naming the variable on every create, which is a sentence a person
can act on and the exact sentence Phase 269 built. A cached hit that is stale says nothing at all. The
asymmetry is why the miss is cached and routed through the watcher and the refresh, and it belongs in
the comment.

**What a failed probe must NOT do:** it must not disarm the cache, must not drop the slot, and must
not schedule a re-warm. A shell that timed out once under load is not a reason to throw away an answer
that is still true, and a re-warm on failure is a retry loop against a machine that is already busy.

---

## 3. The watch

### 3.1 The primitive: `node:fs`'s own `watch`, non-recursive, never `src/main/watcher/`

`credentials/watch.ts:13-22` already argues this and the research measured it. Three numbers decide it
and they go in the module header:

- **Non-recursive is the whole answer to cost.** A home directory's write traffic is in its subtrees.
  On the operator's real home, read-only, one non-recursive `fs.watch` delivered **0 events in 30
  seconds and 5 in 120 seconds** across 4 distinct names, **none of them an rc basename**.
- **The primitive choice is load-bearing.** `src/main/config/store.ts:396` and
  `src/main/machines/store.ts:430` use `@parcel/watcher` for the CONFIG directory. `watcher.subscribe`
  is recursive and has no non-recursive mode. Over the same home-shaped scratch tree — 2,000 writes in
  `Library/Caches` and `node_modules` subtrees plus one edit to `.zshrc` — **`@parcel/watcher`
  delivered 2,001 events and `fs.watch` delivered 1.** Both caught the edit.
- **`src/main/watcher/` is refused for a second reason beyond "it wants a repository root".** Every
  subscription it makes carries the FSEvents exclusion plan, and `ignored-roots.ts:28-46` records the
  budget: `FSEventStreamSetExclusionPaths` accepts at most EIGHT paths, at nine it returns false and
  ZERO exclusions apply including the `.git` one, and `@parcel/watcher` never checks the return value.
  A home-directory subscription inside that budget has silent total failure of every OTHER
  repository's exclusions as its overflow mode. `node:fs`'s watch is a different primitive with its
  own stream and no exclusion array, so the budget is untouched — and **`npm run conformance:watcher`
  runs anyway to prove it**, exactly as `credentials/watch.ts:16-17` says it does for its own watcher.

### 3.2 The watch set, derived from `$SHELL` and never hardcoded

`src/main/env/shell-files.ts` is a **pure** function. It touches no filesystem, takes
`{ shell, home, zdotdir }` and returns candidate absolute paths, so the table is unit-testable and
gate-assertable with zero fs and zero spawns.

| `basename($SHELL)` | Directory | Files |
| --- | --- | --- |
| `zsh` | `zdotdir ?? home` | `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin` |
| `bash` | `home` | `.bash_profile`, `.bash_login`, `.profile`, `.bashrc` |
| `sh`, `dash`, `ksh` | `home` | `.profile` |
| anything else | — | **`[]`, and the cache is never armed** |

**All four zsh files, measured.** `zsh -lic` reads `.zshenv .zprofile .zshrc .zlogin`; `zsh -lc` reads
three and **not** `.zshrc`, which is the independent confirmation that the `-i` is what reads the rc
and is the flag §9 refuses to remove.

**All four bash files, even though at most two are ever read**, because WHICH is read depends on which
EXIST. Measured, one scratch HOME per row: with all four present `bash -lic` read `.bash_profile`;
with `.bash_login .profile .bashrc` it read `.bash_login`; with `.profile .bashrc` it read `.profile`;
with `.bashrc` alone it read **nothing**. So creating `.bash_profile` changes the answer and must
invalidate. (That last row — `.bashrc` alone is never read under `-lic` — is a pre-existing Tortie
feature gap, recorded in the commit body and **not** this phase's to fix.)

**`ZDOTDIR` is the trap, and three things about it are measured.** Setting it moves ALL FOUR files off
`$HOME` entirely. Setting it to the EMPTY STRING is SET — zsh then looks for `/.zshenv` and reads
nothing from `$HOME` at all. And it is usually set INSIDE `~/.zshenv`, so it is not in Electron's
`process.env` at all. Therefore:

- `process.env.ZDOTDIR ?? home` and **never** `|| home`. `??` keeps the empty string, `||` falls back
  to `$HOME` and is wrong. Rule 19 asserts the behaviour, not the operator.
- The provisional set is derived from `process.env`; the real set is derived from **the shell's own
  answer** (§5.3), which costs no extra shell because `ZDOTDIR` and `HOME` ride the warm-up's own
  cover list as two ordinary passthrough names.
- **STATED LIMIT.** `finish` sorts an empty value into `missing` (`:484-491`), so through that channel
  `ZDOTDIR=""` and `ZDOTDIR` unset are indistinguishable and both read as unset. The watch then covers
  `$HOME`, the shell reads nothing from `$HOME`, every candidate is absent, and the automatic
  invalidation is blind for that person. The cache is still CORRECT (coverage and the refresh both
  work) and only the convenience is lost. The one-line fix is a second marker record in the probe's
  script, which is a change to `captureLoginShellEnv`'s contract and is out of scope here. Write it in
  the commit body; do not build it.

**`fish` is NOT in the table, and that is a decision rather than an oversight.** Its files
(`~/.config/fish/config.fish`, `conf.d/`, `$XDG_CONFIG_HOME`) were reasoned from documentation and
never measured, because fish is not installed on this machine. An unmeasured row would arm a cache
whose invalidation nobody has driven. A later round adds it by measuring the same three things this
spec measured for zsh and bash: which files `fish -lic` actually reads, whether the `printf '…' "$NAME"`
recipe resolves a value under fish at all, and whether `$__fish_config_dir` moves the set.

**An unrecognised shell keeps today's behaviour and pays today's cost**, and the two concrete cases
show why that is not a hedge. `/bin/tcsh` rejects the probe's argument vector outright with
`Usage: tcsh [ -bcdefilmnqstvVxX ]`, so its probe already returns `probeFailed` today and caching a
failed probe would be strictly worse than caching nothing. In `nu`, `$NAME` is not env access, so the
script cannot resolve a value there either.

### 3.3 Directory AND realpath, both arms, deduped

For each candidate path, up to two watch targets, deduped by `(dir, basename)`:

1. **The literal arm, always.** `dirname(path)` watched, filtered to `basename(path)`. This is the arm
   that catches creation of a file that does not exist yet, the rename-over, and replacement of the
   symlink itself. Measured, same scratch directory, 1.5 s settle per step: rename-over → file watch 1
   event, directory watch 2; the next edit → file 0, directory 1; the edit after that → file 0,
   directory 1. Unlink-and-recreate behaves identically. `fs.watch` on a path that does not exist
   **threw `ENOENT`**, and the directory arm caught the later creation at +11 ms.
2. **The realpath arm, when the path exists, its realpath differs, AND the realpath is inside the home
   tree.** `dirname(realpath(path))` watched, filtered to `basename(realpath(path))`. This is the only
   thing that catches a dotfiles repo: with `~/.zshrc` a symlink into one, the `$HOME` directory watch
   saw **0 events** and the realpath arm saw the edit.

**The home-tree condition is this phase's own refusal, kept.** The entry forbids *"watching of a
directory outside the person's own home"*. A dotfiles repo at `~/src/dotfiles` is inside the home and
is watched; one on `/Volumes/work` is not watched at all and falls to the deliberate refresh. Say it
in the module header rather than letting somebody discover it.

**The whole set is re-derived on every fire**, for `credentials/watch.ts:193-228`'s own reason: a
rename can move the target, and the first build of that watcher never looked again. `refresh()` closes
every target that is gone and opens every one that is new, keyed the way that module keys them
(`watch.ts:189-190`).

**A null filename is treated as "maybe ours"** and schedules, which is `watch.ts:217-222`'s rule for
the platform not telling us which file moved.

**A directory that cannot be watched is skipped rather than fatal.** If NO handle opens at all, the
cache is never armed (§1.6) and every create probes.

### 3.4 The debounce: the drop is immediate, the re-warm is debounced and floored

This is correction 2 and it is the single most important difference from the precedent.

1. **THE DROP HAS NO DEBOUNCE AT ALL.** `dropLoginShellEnvCache()` is called synchronously in the
   watch callback, on the first matching event. It is an assignment. Debouncing it would open a 400 ms
   window in which a create reads a value we already know is stale, and buy nothing, because the
   expensive work is not the drop.
2. **THE RE-WARM IS DEBOUNCED AT `ENV_WATCH_DEBOUNCE_MS = 400`.** Measured bursts are tiny — a
   vim-style backup-then-rename gives 2 events with a 0 ms spread, `sed -i` gives 2 with a 0 ms
   spread, an append gives 1, a truncate-rewrite gives 1 — so 400 ms is generous and the exact value
   is not load-bearing.
   **The number is DEFINED in this module and not imported from `credentials/watch.ts`.** An import
   would put a credentials edge in this domain's graph to borrow a coincidence: the two debounces
   govern different reactions and only happen to agree. The comment names `WATCH_DEBOUNCE_MS`
   (`credentials/watch.ts:64`), says they agree, and says why they are not the same constant.
3. **THE RE-WARM HAS A FLOOR OF `ENV_WARM_MIN_INTERVAL_MS = 5_000`**, the same shape as
   `OBSERVE_MIN_INTERVAL_MS` (`watch.ts:67`) and for the same reason: a `chezmoi apply`, a `stow`, or a
   `git checkout` in a dotfiles repo can move all four files at once, and without a floor that is four
   login shells. `lastWarmAt` is initialised a full interval in the past (`watch.ts:232-235`) so the
   FIRST burst waits only the debounce.
   **The floor NEVER gates the drop, and it NEVER gates a create.** A create arriving while the floor
   holds probes for itself at today's cost, which is the fallback §9 requires.
4. **A re-warm in flight is SHARED, never duplicated**, because the re-warm goes through
   `loginShellEnvFor` and §1.7 owns the sharing. A create arriving mid-warm joins that promise rather
   than starting a second `zsh -lic`.
5. **Every timer is `unref`'d and cleared in the disposer**, the way `watch.ts:172-185` does it.

### 3.5 The settings listener, and the one thing a naive build gets wrong

`onSettingsUpdated` (`settings/store.ts:1148-1151`) fires for **every** settings write — a theme
change, a window bound, a hotkey. A listener that dropped the cache on every call would spawn a login
shell every time a person moved a slider in Settings.

**So the listener compares and does nothing when equal.** It holds the last `declaredEnvNames()`
sorted and joined, recomputes on each notification, and returns immediately when the string is
unchanged. Only a change to the declared cover drops the slot and schedules a re-warm.

`declaredEnvNames()` lives in `src/main/env/watch.ts` and is the union over every launchable id:

```ts
const settings = getSettings();
const names = new Set<string>();
for (const id of LAUNCHABLE_AGENT_IDS) {
  for (const n of envPassthroughFor(undefined, settings.envPassthrough[id], settings.envPassthroughShared) ?? []) {
    names.add(n);
  }
}
```

The row argument is `undefined` on purpose: `agents.json` rows are a per-agent compiled source the
warm-up cannot enumerate cheaply, and a name that only a row supplies simply misses on its first ask
and widens the slot for every ask after (§1.2). Note that `grep -c 'envPassthrough:' src/main/agents/registry.ts`
is **0** today — the only occurrence is the optional field declaration at `:250` — so no compiled row
contributes anything at all on a shipped build.

**What the listener is for, said once so no later round deletes it as redundant:** residency, so a name
a person REMOVED stops being held in memory; and warmth, so the create after an edit is not the one
that pays. It is not correctness. Correctness is §1.2.

---

## 4. What the watch cannot catch, and the deliberate refresh

### 4.1 The list, plainly

Exactly one class survives the watch and it has one sentence: **the value does not live in a file we
can name.** Eight concrete shapes, the first three measured.

1. **A key exported by a file the rc SOURCES.** Measured **0 events on both arms** after appending to
   `~/.zsh/keys.zsh` which `~/.zshrc` sources — the rc itself never moved and the sourced file is one
   directory down from a non-recursive watch. This is live on the operator's own machine: his
   `.zshrc` holds **3** `source`/`.` lines and his `.zshenv` holds **1**, counted read-only without
   reading content. Following them would mean parsing shell — command substitution, conditionals,
   globs, a sourced file that itself sources — which is arbitrary code analysis, and the entry already
   refuses recursion. **Refused by name so a later round does not try.**
2. **A key read from a vault at shell start** — `op read`, `vault kv get`, `aws sso`,
   `security find-generic-password`. Nothing on disk moves when the SECRET rotates; the rc is
   byte-identical before and after, and the watch is correct to say nothing.
3. **A `.env` a plugin loads** — direnv, dotenv, asdf. Same as 1, and direnv's is per-PROJECT-directory,
   so it is not even inside the home tree this phase may watch.
4. **A credential rotated in the KEYCHAIN and read by the rc.** `credentials/watch.ts` has a 30-second
   attribute poll for its own version of exactly this (`watch.ts:69-70`, `:280-302`). There is no
   equivalent here, because the keychain item is the vendor's and we do not know which one to
   fingerprint.
5. **The environment the shell INHERITS rather than sets** — `launchctl setenv`, a value already in
   Electron's own process env. No file at all.
6. **A dotfiles target that realpaths OUTSIDE the home tree** (§3.3's own refusal).
7. **An unrecognised shell** (§3.2). Listed for completeness: for that person the cache is never armed,
   so nothing is ever stale and every create pays today's cost.
8. **The 11-to-38 ms latency window** between the write and the first event. Measured across the five
   catchable rows: 11, 12, 11, 11, 11 ms; across the four save shapes: 21, 15, 38, 11 ms. No watcher
   of any kind closes it, nobody edits a file and clicks New Session in 13 ms, and the refresh is the
   answer for anybody who cares.

**So the refresh's job, in one sentence a person could read:** *I changed something my shell reads, and
Tortie cannot see what I changed.*

### 4.2 IT IS A VISIBLE CONTROL. The phase is minor.

**Decided: visible.** The argument is the measured table's rather than a preference. Watching covers
rows a through e of the save-shape table completely once the realpath arm is in, so the button is NOT
the primary mechanism and a person will almost never press it. But it provably cannot cover row 1
above, and row 1 is where a careful person puts a key — a separate sourced file, a vault call, a
`.env`. **Four such indirections exist on the operator's own machine today.** Without a control, the
fallback for that class is "quit and reopen Tortie", which is precisely the sentence Phase 269
promised nobody would have to say. The entry's own charter already concedes it: *"there must also be a
deliberate way to refresh."*

**Therefore the semver is MINOR and the subject type is `feat`, and the native menus are checked in the
same commit** — see §4.6.

**The cheaper alternative, stated so the operator can overrule.** Stay at patch by making the refresh
implicit: drop the cache whenever the shell-variable picker opens, since `settings:envCandidates`
(`settings/ipc.ts:181`) already spawns a login shell there. **Not recommended.** It covers the person
who ADDS a name — which §1.4 shows coverage already covers for free — and not the person who ROTATES
one, and rotation is what issue 20 was about and what Phase 269's quotable promise names.

**And one option refused outright: a TTL.** It is a second caching idiom in a module that already has
one twelve lines away, it silently rewrites *"takes effect on the next session you start"* into
*"takes effect within N minutes"*, and it spawns a login shell on a timer for the majority of people
who never rotate anything.

### 4.3 Where it is drawn

**Settings → Launch defaults, in a `set-section-toolbar` at the top of the section**, between the
second `set-section-caption` and `<SharedDefaultsCard>` (`LaunchDefaultsSection.tsx:776-790`).
Right-aligned and alone.

**Not beside Agents → Re-scan.** That control's subject is which binaries are installed on this Mac,
and folding "re-read my shell" into it makes both labels vaguer.

**Not on the Every agent card.** Its subject is the shared LIST, and a person with only per-agent names
would not look there. The section toolbar's subject is the page, which is where every shell-variable
list on this machine is.

**It is drawn only when at least one shell variable name is set anywhere** — `envPassthroughShared`
non-empty, or any entry of `envPassthrough` non-empty. A person who has never named a variable has no
cache, would get nothing from the button, and never meets the control. That is the same instinct as
`envInheritLine`, which is drawn only when the shared list is non-empty (`env-copy.ts`, Phase 275).

**Assembled, not invented.** It reuses `.btn.btn-secondary.set-rescan`, `.set-section-toolbar` and
`.set-spinner`, all already in `settings.css:623`. This repository draws this exact control twice —
`AgentsSection.tsx:115-130` and `SpecStorySection.tsx:632-648` — and a third instance is assembly of an
established pattern. **No new CSS rule is added by this phase.**

**NO AGE LINE.** Follow SpecStory, not Agents. Its comment gives the reason and it applies here:
*"an age that climbs while you watch it is the one thing this section has refused since Phase 15."* An
age reading "your keys are 14 minutes old" invites a press that is almost never needed and turns a
rare control into a nag.

### 4.4 The exact words, under Just enough words

Three constants, added to `src/renderer/settings/env-copy.ts` under its two standing rules:

```ts
/** PHASE 276 — the refresh. A short verb phrase, the shape of Re-scan and Re-check. */
export const ENV_REFRESH_BUTTON = 'Re-read shell';

/** In flight, beside the spinner. The present participle both siblings use. */
export const ENV_REFRESH_BUSY = 'Reading…';

/**
 * PHASE 276 — the whole explanation, and it lives behind HOVER.
 *
 * "Just enough words" puts explanation a person might want behind hover rather
 * than on the resting face, and this is the sentence that earns it: the button
 * is for the one case the watcher cannot see, and a person who does not have
 * that case never needs to read it.
 *
 * IT SAYS "THE NEXT SESSION" AND NEVER "THIS WINDOW", which is rule 1 of this
 * file holding. Nothing is read into the window by pressing it: the answer is
 * dropped and re-taken in main, and the channel resolves with nothing at all.
 */
export const ENV_REFRESH_HINT =
  'Ask your shell again. The next session you start gets the current values.';
```

**The visible text is the accessible name — no `aria-label`.** Both siblings do the same. The hint is
the `title` and nothing else; a person who never hovers meets one two-word label.

**What the button never says.** No age. No count. No name. No value, no length, no "your key looks
right" — rule 1 of `env-copy.ts` binds this string like every other one there.

### 4.5 What the refresh actually does, and what it returns

New invoke channel `settings:envRefresh`, `req: []`, `res: void`, registered in
`src/main/settings/ipc.ts` beside `settings:envCandidates` (`:181`).

Main's handler calls one function, `refreshEnvNow()` in `src/main/env/watch.ts`, which:

1. calls `dropLoginShellEnvCache()` — immediate, no debounce;
2. calls `refresh()` on the watch targets, so a shell config file created since the last derive is
   watched from this moment;
3. re-warms **bypassing the 5-second floor** — a person who pressed a button asked for it — and awaits
   that warm so the spinner means something;
4. resolves `void` **whatever happened**.

**It resolves `void`, and that is a decision.** Nothing the probe learned can cross this channel
without risking rule 1, and nothing a person needs is on the other side: if the probe failed, nothing
was cached, so the next create probes anyway and the existing `env-unresolved` notice is the sentence
that names the variable. A button that returns nothing can never lie. The spinner running for about a
second and the button returning to rest is the feedback.

**When the declared cover is empty it spawns nothing.** `captureLoginShellEnv([])` resolves without a
spawn by its own contract (`:451-457`), so a press with nothing configured is instant — and the control
is not drawn in that state anyway (§4.3).

**It is rate-limited by one thing only: `disabled` while in flight.** `settings-store.ts` holds a
`envRefreshing` boolean beside `scanning` (`:179-180`), the action returns early when it is set
(`rescan()`'s own guard at `:359-370`), and the button is `disabled` while it is true. No floor, no
cooldown, no toast.

### 4.6 The native menus

**They do not change.** CLAUDE.md requires a phase that adds a user-facing surface to say what changed
in the menus, and the answer here is nothing: the control is a button inside an existing Settings
section, reached through the existing `settings:openWindow` item, and `src/main/menu.ts` gains no item,
no accelerator and no glyph. `npm run gate:menu-glyphs` and `npm run gate:menu-accelerators` are run in
the integrator's battery to prove it, and the commit body says so in one line.

---

## 5. The warm-up

### 5.1 The position, which is already proved by a probe that is already there

This is the strongest reading of the whole investigation and it should be in the commit body.

**The app ALREADY spawns exactly this shell at boot**, to capture PATH. With a realistic slow rc the
`path-ready` milestone lands at **1329.5, 1349.3, 1337.2, 1344.0, 1411.3 ms**; with a trivial rc it
lands at **294.5 ms**. That is a ~1,050 ms swing in a login-shell probe. Over the same launches,
`window-shown` **does not move**: 362.9, 358.8, 360.0, 341.0, 398.9 ms with the slow rc and 355.0 ms
with the trivial one. The position this phase wants is already measured on the operator's own boot
path.

**What runs before the first window, read from the tree.** In `app.whenReady()` (`index.ts:443`) the
ONLY awaited step between the app-ready mark (`:452`) and the window (`:617`) is
`await proveNativeModules()` at `:549`. Everything else on that stretch is fire-and-forget:
`void initAgentOverlay()` (`:537`), `void initMachines()` (`:558`), `getGmuxCore().catch(…)` (`:561`),
the Phase 208 boot-observe chain (`:585-594`) and the three update/orphan calls (`:601-614`).

### 5.2 The hook: one chain, two steps

A SIBLING of the Phase 208 chain, not a link in it, so a slow or failing `security` sweep can neither
delay nor skip the warm-up and vice versa. Added immediately after `:585-594`:

```ts
// PHASE 276. The login-shell env answer, warmed once instead of once per
// session. TWO STEPS AND ONE CHAIN, and the split is the point.
//
// STEP ONE ARMS, AND IT DOES NOT WAIT. `startEnvWatch()` derives the watch set
// from $SHELL, opens the fs.watch handles and turns the cache on. It is
// synchronous and it is here rather than above `proveNativeModules()` because
// fs.watch's setup is a kernel call and a home on a stalled mount BLOCKS IN THE
// KERNEL where a try/catch cannot reach it — Phase 274's argument, and the same
// call Phase 211 already makes on the same directory one second later.
//
// ARMING EARLY IS WHAT BUYS THE RESTORE BURST. Restore runs right after the
// core is open, so with the cache armed the FIRST restored session's probe
// fills the slot and every session after it hits. Waiting the full second to
// arm would have twenty restored sessions pay twenty login shells, which is
// what the parent does.
//
// STEP TWO PROBES, AND IT WAITS THE SAME SECOND THE LOGIN OBSERVE WAITS, for
// the same reason its comment gives: the first paint and the restore burst are
// not made to compete with a shell start. Nothing awaits either step, and
// `window-shown` is measured at the parent and at HEAD to prove it.
void getGmuxCore()
  .then(() => { startEnvWatch(); })
  .then(() => new Promise<void>((r) => setTimeout(r, BOOT_OBSERVE_DELAY_MS)))
  .then(() => warmEnvAtBoot())
  .catch(() => undefined);
```

`BOOT_OBSERVE_DELAY_MS` (`index.ts:441`) is reused rather than a second constant added.

**A harness launch never reaches this line**, because `dispatchHarness` returns above it (`:492`),
which is the same protection the Phase 208 chain has.

### 5.3 What the warm-up asks for

`warmEnvAtBoot()` computes `declaredEnvNames()` (§3.5) and:

- **when it is empty, spawns NOTHING and returns.** A person who has configured no shell variable must
  not start paying for a login shell at boot that they never paid for before. This is a rule, not an
  optimisation.
- **when it is non-empty, asks `loginShellEnvFor([...cover, 'HOME', 'ZDOTDIR'])`**, then re-derives the
  watch set from those two answers and calls `refresh()`.

**The two extra names cost nothing and are how the watch set stops being a guess.** The name count is
free (§1.2's measurement), `captureLoginShellEnv`'s script is not touched, and `HOME` and `ZDOTDIR` are
paths that are already in this process's own environment — they are not credentials, and holding them
in the slot reveals nothing. `ZDOTDIR` absent reads as `missing`, which falls back to the home the
shell reported, which falls back to `homedir()`. §3.2 records the `ZDOTDIR=""` limit this cannot see.

### 5.4 A create arriving mid-flight

It shares the in-flight promise, and the enforcement is that **`envInFlight` is assigned synchronously
before the first await** — `getUserPath`'s own shape (`:755-762`). §1.7 owns the join rule; the only
thing to add here is that a create whose names are covered by the warm-up's cover joins it, which is
every create on a configured machine, because the warm-up's cover is the declared union.

**Exactly two production call sites reach `captureLoginShellEnv` today and both move to
`loginShellEnvFor`:** `src/main/sessions/create-local.ts:649` and `src/main/restore/restore.ts:997`. A
grep of `CaptureEnvResult|resolvedEnv` across `src/` returns nothing else outside tests and the type's
own declaration. **Neither holds a derived answer** — `create-local.ts:643-645` says the pairs *"live
in this local and in the tmux `-e` set, and nowhere else"* — so an invalidation drops the slot and
nothing else.

**Nothing else must be dropped, and the one derived thing does not need an epoch.** The
`env-unresolved` notice (`create-local.ts:711-717`) carries `names` and `probeFailed` and no value, and
its latch key is `kind:sessionId` (`notice/index.ts:52-60`), so it is a statement about ONE session's
launch rather than a cached answer about the shell. It IS mirrored to `app.log` by `logEvent`
(`notice/index.ts:89-94`) — names only, which the no-value rule already permits and which this phase
must not widen.

**`userPathEpoch` is NOT reused and nothing keyed on it moves.** `src/main/agents/health.ts:410-431`,
`:452-457` folds that epoch into a binary-inspection key because it resolves binaries against the PATH,
and no shell VALUE takes part in that. `loginShellEnvEpoch` is a separate counter beside
`userPathGeneration`, which is what lets a future consumer key on the env answer the way `health.ts`
keys on the PATH.

**WHAT AN INVALIDATION DOES NOT REACH, and the phase writes this sentence down rather than letting
somebody discover it: a RUNNING pane.** The value left this process on the `-e` argv and now lives in
the tmux server's session environment; dropping the cache revises nothing already running. That is not
a limitation to apologise for — it is Phase 269's promise stated exactly: *"rotating a key takes effect
on the next session you start, with nothing to restart."*

### 5.5 What cancels it at quit

**`stopEnvWatch()` in the one ordered disposer**, beside `stopLoginsWatch()` (`capabilities.ts:446`),
for the reason that line gives: it holds `fs.watch` handles and timers and both must be released
whatever the rest of teardown does. It is synchronous, cannot throw, and calling it twice is calling it
once. It clears both timers, closes every handle, unsubscribes the settings listener, and calls
`enableLoginShellEnvCache(false)`, which drops the slot.

**The LATE START is refused on both sides of every await**, which is the shape Phase 220 found and
fixed for the credentials watcher (`logins/ipc.ts:283-311`): a quit landing inside the fire-and-forget
chain ran the disposer against a `null` watcher, and the chain then installed handles AFTER the
disposer had finished with the domain. `startEnvWatch()` is synchronous so it has no such window, and
`warmEnvAtBoot()` asks whether the watch is still running both before its probe and before it installs
anything.

**The spawned shell is already ended by machinery that exists.** `captureLoginShellEnv` spawns
`detached: true` so the child leads its own process group (`:502`) and registers it with
`trackGuardedChild` (`:506`). At quit, `disposeMainCapabilities` calls `reapGuardedChildren()`
(`capabilities.ts:643`), which uses `killProcessGroup(child, 0)` — a grace of ZERO, SIGKILL sent
synchronously with no timer, because an interactive zsh ignores SIGTERM by design and a SIGTERM on an
unref'd timer is how a probe once outlived its app and turned up at ppid 1. Its own deadline
(`:526-533`, `PATH_CAPTURE_TIMEOUT_MS = 10_000`) covers the non-quit case.

**Two honest gaps, stated rather than hidden.** The PROMISE is not cancellable —
`captureLoginShellEnv` does not go through `runGuarded` and has no `cancel: AbortSignal` — so at quit
the shell is killed and the promise then settles `probeFailed: true` through its `close` handler, and
installs nothing because §2 refuses a failed result and §1.8's generation has moved anyway. And the
`spawn` runs synchronously on the calling tick inside the Promise executor, so the call's POSITION
matters even though nothing awaits it, which is why §5.2 places it where it does.

---

## 6. The remote probe

**`src/main/machines/remote-env-probe.ts` DOES NOT CACHE, and this phase does not touch it.** Four
reasons, and the last one is the decisive one.

1. **Its own header already ruled it, with the reason.** `:30-35`: *"Per create, never cached per
   connection … because rotating a value and starting a second session must pick the new one up, and
   because a name exported after the last connect must still be found."*
2. **The cost being paid down is on THIS Mac.** The remote round trip is already inside a connection
   the person is waiting on, and no measurement in this phase says it is a cost at all. A speed-up
   nobody measured is not this phase's to take.
3. **The failure mode is the worst one available here.** A cache keyed without the machine would hand
   one machine's values to another. The entry names that outcome by name.
4. **THE HALF THAT MAKES THE LOCAL CACHE SAFE DOES NOT EXIST OVER THERE.** §1.6's whole argument is
   that the cache is off until something is watching it. Tortie cannot watch another machine's
   dotfiles — there is no `fs.watch` across ssh, and the only invalidation available would be a button
   and a hope. A cache we cannot invalidate is exactly what this phase refuses to build.

**Rule 34 asserts it stays that way**: the module still names no cache, `REMOTE_ENV_ALLOWED` is still
exactly two names, and no value is ever sent from this Mac.

**If a later round does cache it, the key shape already exists next door.**
`src/main/machines/remote-path.ts` caches the far side's PATH *"once per connect … for the
generation"*, so **machine identity AND connection generation must both be in the key** — and note
that module uses `-lc` and not `-lic`, with the reason stated, because there is no terminal on that
connection.

---

## 7. The rules

A builder implements each one; a gate or a suite asserts each one. One sentence, one file.

### The cache — CACHE

1. The slot, the in-flight pointer, the generation and the armed flag are four module-level values in
   `resolve.ts`, beside `userPathPromise`/`userPathGeneration`. — `src/main/tmux/resolve.ts:725-726`
2. A hit is `names.every((n) => slot.names.has(n))` and nothing else; a name not in `slot.names` is
   never answered from the slot. — `resolve.ts`
3. A hit is PROJECTED: a fresh `Record` and a fresh array every ask, never the slot's own objects. —
   `resolve.ts`
4. The projection iterates the CALLER's list in the caller's first-seen order, deduped, so the `-e`
   argv order Phase 275 promised does not move. — `resolve.ts`, proved against `launch-env.ts:53-57`
5. A miss probes for `union(asked, slot.names)` — widening, never narrowing. — `resolve.ts`
6. Past `ENV_SLOT_MAX_NAMES = 256` the slot is REPLACED by the caller's own names, never partially
   merged and never truncated. — `resolve.ts`
7. `envInFlight` is assigned SYNCHRONOUSLY before any await, so two callers on one tick share one
   capture. — `resolve.ts`
8. A second ask joins the in-flight promise iff its names are covered by the in-flight names;
   otherwise it starts its own. — `resolve.ts`
9. The generation moves on the line that INSTALLS and on the line that DROPS, never on a settle, and
   never rewinds. — `resolve.ts`
10. A probe stamped at generation G installs nothing if `envGeneration !== G` when it settles. —
    `resolve.ts`
11. `enableLoginShellEnvCache` defaults to **false**, and while false `loginShellEnvFor` reads no slot,
    writes no slot and joins no in-flight promise. — `resolve.ts`
12. `enableLoginShellEnvCache(false)` drops the slot. — `resolve.ts`
13. `loginShellEnvNamesHeld()` returns names and there is no exported function, field or channel
    through which a VALUE leaves the cache. — `resolve.ts`, `src/main/tmux/index.ts`
14. `captureLoginShellEnv` is unchanged, byte for byte, and stays exported. — `resolve.ts:447-556`
15. `create-local.ts:649` and `restore.ts:997` are the only two production call sites and both call
    `loginShellEnvFor`; nothing else in `src/` calls `captureLoginShellEnv`. —
    `src/main/sessions/create-local.ts`, `src/main/restore/restore.ts`
16. The module header's §1b sentence *"run once per launch and once per restore"* is rewritten, and
    `loginShellEnvNames`'s *"it is NOT a cross-ask cache"* docstring gains one sentence saying why the
    two now differ. — `resolve.ts:18-21`, `:704-712`

### Failure — CACHE

17. A result with `probeFailed: true` is returned to every waiter and is NEVER installed into the slot.
    — `resolve.ts`
18. A failed settle clears `envInFlight` so the next ask is a fresh attempt, and does not disarm, does
    not drop and does not schedule a re-warm. — `resolve.ts`
19. A result with `probeFailed: false` and a non-empty `missing` IS installed, and the comment gives
    the self-announcing argument. — `resolve.ts`

### The watch set — WATCH

20. `shellFilesFor({ shell, home, zdotdir })` is pure: it imports nothing from `node:fs`, spawns
    nothing and returns absolute paths. — `src/main/env/shell-files.ts`
21. The table is exactly §3.2's four rows, and an unrecognised shell returns `[]`. —
    `src/main/env/shell-files.ts`
22. `zdotdir` is taken with `??` and never `||`, asserted behaviourally: an empty-string `zdotdir`
    yields `/.zshenv` and not `<home>/.zshenv`. — `src/main/env/shell-files.ts`
23. Every candidate gets a literal watch target `(dirname(p), basename(p))`, whether or not the file
    exists. — `src/main/env/watch.ts`
24. A candidate that exists, whose realpath differs, and whose realpath is INSIDE the home tree gets a
    second target from the realpath; one outside the home tree gets none. — `src/main/env/watch.ts`
25. Targets are deduped by `(dir, basename)`, the callback matches that one basename, and a null
    filename is treated as "maybe ours". — `src/main/env/watch.ts`
26. Nothing is recursive, nothing is watched outside the home tree, and no `@parcel/watcher`
    subscription and no `src/main/watcher/` seam is used. — `src/main/env/watch.ts`
27. The whole target set is re-derived on every fire and on every refresh, closing what is gone and
    opening what is new. — `src/main/env/watch.ts`
28. A directory that cannot be watched is skipped; if NO handle opens, the cache is never armed. —
    `src/main/env/watch.ts`

### The reaction — WATCH

29. The drop is called synchronously in the watch callback with NO debounce. — `src/main/env/watch.ts`
30. The re-warm is debounced at `ENV_WATCH_DEBOUNCE_MS = 400`, defined in this module with the comment
    naming `credentials/watch.ts:64` and saying why it is not imported. — `src/main/env/watch.ts`
31. The re-warm is floored at `ENV_WARM_MIN_INTERVAL_MS = 5_000`, `lastWarmAt` starts a full interval
    in the past, and the floor gates neither the drop nor any create. — `src/main/env/watch.ts`
32. Every timer is `unref`'d and cleared by `stopEnvWatch()`. — `src/main/env/watch.ts`
33. The settings listener recomputes `declaredEnvNames()`, compares it sorted-and-joined against the
    last value, and does NOTHING when equal — so an unrelated settings write spawns no shell. —
    `src/main/env/watch.ts`
34. `remote-env-probe.ts` is unchanged: it names no cache, `REMOTE_ENV_ALLOWED` is still exactly two
    names, and no value is sent from this Mac. — `src/main/machines/remote-env-probe.ts`,
    `src/main/machines/remote-env.ts:85`

### The warm-up and the lifecycle — WATCH

35. `startEnvWatch()` is synchronous, arms the cache only after at least one handle opened, and is
    called from `index.ts` inside the `getGmuxCore()` chain with NO delay. — `src/main/index.ts:585-600`
36. `warmEnvAtBoot()` runs after `BOOT_OBSERVE_DELAY_MS`, is never awaited by anything on the boot
    path, and reuses the existing constant. — `src/main/index.ts:441`, `:585-600`
37. An empty declared cover spawns NOTHING, at boot and on a refresh. — `src/main/env/watch.ts`
38. The warm-up asks for `[...cover, 'HOME', 'ZDOTDIR']` and re-derives the watch set from the answer,
    falling back to `process.env`/`homedir()` for anything `missing`. — `src/main/env/watch.ts`
39. `stopEnvWatch()` is called from the one ordered disposer beside `stopLoginsWatch()`, is
    synchronous, cannot throw, is idempotent, and refuses every later start. —
    `src/main/capabilities.ts:446`
40. `warmEnvAtBoot()` asks whether the watch is still running on both sides of its await. —
    `src/main/env/watch.ts`
41. `GMUX_NO_ENV_CACHE=1` turns the whole feature off — no watch, no warm, no cache — so the parent's
    behaviour is reachable at HEAD for the measurement and for an ablation. — `src/main/env/watch.ts`

### The refresh — WATCH

42. `settings:envRefresh` is `req: []`, `res: void`, and resolves `void` whatever happened. —
    `src/shared/ipc/app.ts`, `src/main/settings/ipc.ts`
43. The handler drops, refreshes the targets, re-warms bypassing the floor, and awaits the warm. —
    `src/main/env/watch.ts`, `src/main/settings/ipc.ts`
44. The button is drawn only when at least one shell variable name is set anywhere. —
    `src/renderer/settings/LaunchDefaultsSection.tsx`
45. It reuses `.btn.btn-secondary.set-rescan`, `.set-section-toolbar` and `.set-spinner`, and this
    phase adds no CSS rule. — `src/renderer/settings/settings.css`
46. There is no age line, no count, and no `aria-label` overriding the visible text. —
    `LaunchDefaultsSection.tsx`
47. The three strings are `ENV_REFRESH_BUTTON`, `ENV_REFRESH_BUSY` and `ENV_REFRESH_HINT`, verbatim as
    §4.4 writes them, and none of them interpolates, formats, hints at or measures a VALUE. —
    `src/renderer/settings/env-copy.ts`
48. The store action returns early while `envRefreshing` is true and the button is `disabled` then. —
    `src/renderer/settings/settings-store.ts`
49. `docs/audits/contract-baseline.txt` is regenerated in the same commit with
    `node build/contract-inventory.mjs --out docs/audits/contract-baseline.txt`, and the commit body
    names the moved lines (`settings:envRefresh`, `GMUX_NO_ENV_CACHE`). —
    `docs/audits/contract-baseline.txt`
50. The native menus do not change, and `gate:menu-glyphs` and `gate:menu-accelerators` are run to
    prove it. — `src/main/menu.ts`

### The gate — GATE

51. `conformance:shellenv` runs with no Electron, no tmux, no ssh and **spawns no shell**: the capture
    is a seam the gate hands a fake, and the clock and the watcher are fakes it fires by hand. —
    `build/conformance-shellenv.mjs`
52. It drives the coverage relation, the projection (fresh objects, caller's order, dedupe, `missing`
    sorted, `probeFailed` always false), the widening, the 256 cap, the in-flight join and its refusal,
    the generation guard of rule 10, and rules 17 to 19. — `build/conformance-shellenv.mjs`
53. It drives `shellFilesFor` over every row of §3.2's table plus `ZDOTDIR` set, unset and empty. —
    `build/conformance-shellenv.mjs`
54. It drives the reaction with a fake clock: the drop lands before any timer fires, the re-warm lands
    after the debounce, the floor holds a second burst, and an unrelated settings write changes
    nothing. — `build/conformance-shellenv.mjs`
55. It asserts the disarmed path is today's path: with `enableLoginShellEnvCache(false)`, N asks are N
    captures with no slot read and no join. — `build/conformance-shellenv.mjs`
56. It asserts the refusals of §9 as text over the tree: the `-lic` spawn still carries the `i`,
    `remote-env-probe.ts` names no cache, `REMOTE_ENV_ALLOWED` has two entries, and no file this phase
    adds writes a captured value to disk. — `build/conformance-shellenv.mjs`
57. `ablation:p276` flips one clause per rule and each must go red on the rule that owns it, with at
    minimum: coverage weakened to "slot is non-empty"; the projection handing out the slot's own
    object; the projection iterating the slot's order; the generation guard removed; the
    `probeFailed` install guard removed; the drop debounced; the settings listener made
    unconditional; `??` changed to `||`. — `build/p276/ablation.mjs`
58. `probe:p276` and `ablation:p276` and `conformance:shellenv` are declared in `package.json`, each
    carrying a header saying what it drives, what it refuses and which environment variables it needs.
    — `package.json`
59. Every process the probe starts it ends in a `finally`, its Electron goes through
    `build/electron-run.mjs`, and `HELPER_USER_FLOOR` is raised in the same commit. —
    `build/p276/probe-p276.mjs`, `build/assert-electron-teardown.mjs`
60. The CLAUDE.md path-triggered-gate table gains a `conformance:shellenv` row naming
    `src/main/tmux/resolve.ts`'s cache, `src/main/env/**` and the two call sites. — `CLAUDE.md`
    (INTEGRATOR)

---

## 8. File ownership — disjoint, three builders

### BUILDER CACHE

| File | What |
| --- | --- |
| `src/main/tmux/resolve.ts` | The slot, the generation, the arming, `loginShellEnvFor`, the projection, the in-flight join, the failure rule, the two header rewrites (rule 16) |
| `src/main/tmux/index.ts` | The five re-exports |
| `src/main/sessions/create-local.ts` | `:649` moves to `loginShellEnvFor`. **This line and its comment only** |
| `src/main/restore/restore.ts` | `:997` moves to `loginShellEnvFor`. **This line and its comment only** |
| `src/main/tmux/__tests__/p276-env-cache.test.ts` | The unit suite for rules 1–19 |

### BUILDER WATCH

| File | What |
| --- | --- |
| `src/main/env/shell-files.ts` | NEW. The pure `$SHELL` → files table |
| `src/main/env/watch.ts` | NEW. `startEnvWatch`, `stopEnvWatch`, `refreshEnvNow`, `warmEnvAtBoot`, `declaredEnvNames`, the debounce, the floor, the settings listener |
| `src/main/env/__tests__/p276-watch.test.ts` | The unit suite for rules 20–41 |
| `src/main/index.ts` | The two-step chain of §5.2 |
| `src/main/capabilities.ts` | `stopEnvWatch()` beside `stopLoginsWatch()` at `:446` |
| `src/main/settings/ipc.ts` | The `settings:envRefresh` registration |
| `src/shared/ipc/app.ts` | The channel and the `GmuxSettingsExtras` member |
| `src/preload/index.ts` | `envRefresh: () => invoke('settings:envRefresh')` |
| `src/renderer/settings/settings-store.ts` | `envRefreshing` and the action |
| `src/renderer/settings/LaunchDefaultsSection.tsx` | The toolbar and the button |
| `src/renderer/settings/env-copy.ts` | The three strings |
| `src/renderer/settings/__tests__/p276-refresh.test.tsx` | The renderer suite for rules 44–48 |
| `docs/audits/contract-baseline.txt` | Regenerated (obligation 3) |

### BUILDER GATE

| File | What |
| --- | --- |
| `build/conformance-shellenv.mjs` | NEW. Rules 51–56 |
| `build/p276/ablation.mjs` | NEW. Rule 57 |
| `build/p276/probe-p276.mjs` | NEW. The one app run of §10 |
| `package.json` (scripts block ONLY) | `conformance:shellenv`, `probe:p276`, `ablation:p276` |
| `build/assert-electron-teardown.mjs` | `HELPER_USER_FLOOR` raised by one |

### The two places the brief's split collided, and how it was changed

**The brief gave `src/main/index.ts` to nobody and both CACHE and WATCH want it.** The brief's split
put the warm-up with the cache and the watcher with the watch, and both hook at `index.ts:585-594`.
Resolved by giving the whole warm-up to WATCH, which is also the better design: the warm-up and the
invalidation are one domain — *keep the shell answer fresh* — so they get one module, one boot call,
one disposer and one env knob. CACHE supplies the primitives and hooks nothing.

**The brief gave `declaredEnvNames()` nowhere, and it is the union computation correction 4 forbids
`resolve.ts` from holding.** It lives in `src/main/env/watch.ts`, owned by WATCH, and CACHE never sees
it. The two create call sites ask for their OWN list and never the union, so nothing CACHE owns needs
the registry or the settings store, and `resolve.ts`'s import graph does not move by one module.

**CACHE touches two files WATCH's domain also cares about — `create-local.ts` and `restore.ts` — and
nobody else is allowed in them.** Those two edits are one line and one comment each. If a builder finds
itself widening either file, it has the wrong design.

---

## 9. What must not change

1. **THE `-i` STAYS.** `.zshrc` is read by interactive shells and by nothing else, and a provider key
   exported there is the whole of issue 20. Dropping it makes the probe fast and the feature useless
   and is the same mistake PR #21 made. Measured again here as an independent confirmation: on the
   calibrated slow home `zsh -lic` is 811–918 ms and `zsh -lc` is 3–5 ms, and `zsh -lc` **does not read
   `.zshrc` at all**. Any round tempted to remove it stops.
2. **NO VALUE IS PERSISTED ANYWHERE.** Not in settings, not in the manifest, not in a log, not in an
   argv, not in a file this phase adds, not in the answer of the channel §4.5 adds. The answer lives in
   one process-lifetime slot and nowhere else. This is Phase 269's rule and it does not move because
   the answer is now kept longer — it moves in the other direction, because a longer-lived answer earns
   a stricter reading, which is rule 13.
3. **THE PER-CREATE PROBE STAYS AS THE FALLBACK.** A cold slot, a dropped slot, a disarmed cache, an
   unrecognised shell, a miss, a failed probe and a floor that is holding all land on
   `captureLoginShellEnv` at today's cost. A session that starts without a key a person set is worse
   than a session that takes a second.
4. **`REMOTE_ENV_ALLOWED` STAYS AT EXACTLY TWO NAMES** and no value is ever sent from this Mac. §6.
5. **PHASE 275 IS UNTOUCHED:** the shared set, its own seal field, its confirmation, its picker and its
   list. This phase adds one button to the section that draws them and changes nothing they do.
6. **`captureLoginShellEnv`'s BODY IS UNTOUCHED**, byte for byte — the nonce marker, the tail buffer,
   the per-name `maxOutput`, the early settle on `usable.every`, the deadline, the group kill, the
   deadline cleared on `close` and never on `exit`. This phase wraps it and never edits it, and rule
   14 asserts that.
7. **NOTHING RECURSIVE AND NOTHING OUTSIDE THE HOME.** §3.3.
8. **`agents.json` IS NEVER WRITTEN**, and the shell stays the one source — no `.env` import, no
   keychain import, no vendor config import. That is a different phase with its own research.

---

## 10. Verification — Tier 3, and the independent methods named in advance

**The tier is the entry's, and its reason is the invalidation rather than the cache.** State the tier
and the methods in the phase brief before the work starts.

### The two independent methods, which are the verifier's and not the builder's

**METHOD 1 — ATTACK THE INVALIDATION, over real save shapes.** Not "does the cache work". Drive a
rotation the way a person does, in a scratch HOME, with invented sentinel values and never a real key,
and prove the NEW value arrives with no restart:

| Shape | Must |
| --- | --- |
| append to `~/.zshrc` | invalidate |
| truncate-and-rewrite | invalidate |
| `sed -i` (backup then rename) | invalidate |
| editor-style rename-over from a temp file | invalidate |
| unlink and recreate | invalidate |
| create `~/.zshrc` for the FIRST time | invalidate |
| edit through a SYMLINKED path | invalidate |
| edit the dotfiles-repo target of a symlinked `~/.zshrc` | invalidate |
| `touch` with no content change | may invalidate; must not be wrong either way |
| edit a file the rc SOURCES | **must NOT invalidate**, and the refresh must then deliver it |
| a settings write that is not a shell variable | **must NOT spawn a shell** |

A stale key delivered silently is the blocking finding. The verifier proves staleness would be VISIBLE
by rotating to a second sentinel and reading what the pane actually received.

**METHOD 2 — RE-DERIVE THE COST BY A DIFFERENT RULER, AND MEASURE THE PARENT.** Time the creates from
OUTSIDE the app — poll `tmux -L <scratch socket> list-sessions` every 25 ms until the session appears —
and say whether the two agree. The research's own reading agreed within 3% (external 1087/1000/1036 ms
against in-app median 1015 ms). Then run the same probe against `P276_PARENT_CHECKOUT`, one Electron
after the other and **never at once** (Phase 258's rule), and put both numbers in the commit body. A
phase claiming a speed-up without a before-and-after has not earned it.

### The one app run

`npm run probe:p276` — ONE Electron through `build/electron-run.mjs`, scratch profile, scratch HOME
with a realistic slow rc, its own tmux socket, everything ended in a `finally`. It drives, in one
session: the boot milestones; a cold create; six warm creates; a create for a SECOND agent; the whole
Method 1 table; the deliberate refresh; and a create after the refresh. The stand-in agent each pane
runs reads its OWN `environ` and writes down a NAME and one of three words — `absent`,
`present-matches-sentinel`, `present-matches-old-sentinel` — and **never a value**, which is Phase
275's probe shape (`build/p275/probe-p275.mjs`) reused.

**The boot measurement is a separate arm of the same script**, `P276_BOOT_ONLY=1`: six launches with
the feature on and six with `GMUX_NO_ENV_CACHE=1`, reading `window-shown` through the shipped
`window.gmux.diagnostics` channel. The baseline to beat is 341–399 ms warm, median ~360, with the first
launch after a build (937 ms, cold page cache) excluded and stated separately. **If `window-shown`
moves, the warm-up is on the boot path and the design is wrong.** `path-ready` is read on the same
launches as the control that proves the ruler works, because it is the milestone that SHOULD move.

### The gates this phase's paths earn

`conformance:shellenv` and `ablation:p276` (new), `conformance:agents` (the two create call sites),
`gate:contract` with the baseline regenerated, `conformance:watcher` (to prove the FSEvents budget is
untouched, §3.1), `gate:electron` and `gate:background` (they run inside `npm run build` anyway),
`gate:menu-glyphs` and `gate:menu-accelerators` (§4.6), plus the full integrator battery.

### Machine discipline

Probes may run up to four at once; this phase needs two at most and never at once when both launch
Electron. Count what is left ONCE, at the end, with
`ps -Ao pid,ppid,rss,comm | grep -E "[E]lectron|Tortie$|chrome_crashpad" | grep -v defunct` — the bare
`Tortie` line is the main process and neither a grep for `Electron` nor one for the profile path finds
it. Never SIGKILL the `node_modules/.bin/electron` shim. The operator's `-L gmux` socket is READ ONLY
and is listed before and after every run.
