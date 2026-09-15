# Phase 273 — a symlinked project saves, and a refusal says what it measured

**Subject:** `fix(save): a symlinked project saves, and a refusal says what it measured`
**First body line:** `Phase 273: symlink resilience and an honest refusal`
**Semver:** patch. It repairs a shipped defect and adds no capability.
**Tier: 3**, and the entry's three clauses stand: it is the save path, the operator relayed it, and it
changes `resolveInsideRoot`, the one containment gate every fs mutation asks.

**Charter:** [issue 25](https://github.com/gregce/tortie/issues/25) (belucid), Phase 272's entry in
`docs/BACKLOG.md` (whose reproduction is this phase's whole basis), and Phase 273's own entry at
`docs/BACKLOG.md:27740`. Three researchers read the gate, the callers and the refusal before this was
written; **do not re-derive their work.** Everything in §1 is quoted from this worktree's HEAD
(`d3fb8223`) with line numbers, and the builder reads the files rather than this summary before editing.

---

## 0. The three things this phase may not trade, quoted from the entry

1. *"The gate does not get weaker, and this is the refusal that binds every later round."* The escape
   checklist in §6 is how that is proved, shape by shape, before and after.
2. *"`resolveOpenProjectRoot` stays the one gate create, rename, move, trash, drag-out and Open With
   all ask, and the save path does not get a private, softer door."* No caller gets a flag, no channel
   gets a bypass, and `writeGuarded` keeps calling the same two functions in the same order.
3. *"No new IPC channel: the reason is already on the wire. No telemetry, nothing leaves the machine,
   and the log holds a path and a cause and never a byte of the file."*

And one more the entry names: *"No change to the plain door, to auto save's stop, or to the three
answers a stale save offers."* Phases 240 and 268 own those and this phase does not touch them.

---

## 1. The reading (cited, do not re-derive)

### 1.1 The defect

`addProject` stores `resolvePath(path)` — `path.resolve`, not `realpath` — at
`src/main/sessions/core.ts:2891`, so the stored project path keeps every symlink it was opened
through. `src/renderer/tree/FileTree.tsx:501` builds each tab's path from that stored spelling by
concatenation. `resolveProjectRoot` realpaths the root at `paths.ts:103`. Then `resolveInsideRoot`
compares the two **lexically** at `paths.ts:190-193`, with no `realpath` on the path, and throws
`outside()`. `guarded-write.ts:369-370` turns that throw into `refused('outside')`, and
`save-sentences.ts:95-96` renders it as *"Tortie did not save README.md, because its project is not
open — open it again and save. Nothing was written."*

### 1.2 The three facts the repair rests on

- **The real guard already admits the alias.** `paths.ts:205-207` calls
  `realpathOfAncestors(dirname(lexical))` and re-checks containment against the RESOLVED parent. For a
  symlinked project that check passes. The lexical test at `:193` is a pre-filter throwing before the
  real guard can answer.
- **The discriminator is absolute versus relative.** `lexical` is `resolve(trimmed)` for an absolute
  input and `resolve(realRoot, trimmed)` for a relative one, and a path resolved FROM `realRoot` is
  inside it by construction. Save sends `tab.path` (absolute) and breaks;
  `src/renderer/tree/tree-ops.ts:767-770` and `:1175-1177` send `toRel(...)` and work.
- **Three renderer call sites send an absolute path and all three are broken today**, measured through
  the shipped functions: `fs:writeGuarded` from `tab-io.ts:1233-1237` and `:1175-1180`;
  `fs:writeGuarded` from `redline-write.ts:117-122` fed by `RedlineDocument.tsx:409`; and
  `fs:openWithApps` / `fs:openWith` from `use-tree-menu.ts:146` and `:112`, both composing
  `absOf(rootPath, canonical)` (`tree-paths.ts:37-40`, plain concatenation). **Open With is the second
  absolute caller the entry predicted and did not name, and its failure is SILENT**: the catch at
  `use-tree-menu.ts:148-152` returns `null` and the submenu is simply absent.

### 1.3 The escape inventory, measured (do not re-measure to decide; re-measure to verify)

The escape researcher ran an instrumented copy of `paths.ts:150-217` beside the shipped function over
17,989 distinct inputs × 2 `allowRoot` settings = 35,978 runs, with 0 disagreements, then diffed the
verdicts against a copy with `:193` deleted. Hit counts: `:193` fired 23,038 times; `:207` fired 1,638;
`:214` fired 3,822; `:213`'s `..` clause fired 704; and **`:210`'s two clauses, `:213`'s empty clause
and `:81`'s root-walk throw never fired at all.** Deleting `:193` newly accepted 2,040 of those runs
and newly refused none.

**THE COMMITTER RE-COUNTED THAT LAST SET FROM THE LISTING RATHER THAN FROM THE TOOL'S HEADER, AND THE
TWO DISAGREE.** The header calls it "1966 distinct"; the body holds 2,040 `(input, allowRoot)` lines
over **1,057 distinct inputs**, of which **983 are spelled through the project's own symlink alias**
and **74 are relative paths beginning with the real file `..hidden.txt`** — §1.4's second defect,
which is not a symlink story at all. The first round of this document wrote "every one of the 1,966
was spelled through the alias", and the listing refutes it. The numbers that decide anything here are
the hit counts above and the both-bases tables in §2.6 and §6, which were re-derived against the
shipped function; this paragraph is the corpus's shape and nothing rests on it.

**`:193` is redundant for containment and load-bearing for blast radius.** Everything it stops is
stopped again by `:207`. What it also does, and what a repair owes an answer for:

- (a) it bounds where the gate touches disk — today `realpathOfAncestors` only ever walks a chain
  already lexically inside the root;
- (b) it stops the gate becoming an oracle — `paths.ts:76` rethrows a RAW `EACCES`/`ELOOP` whose
  message carries the probed path, distinguishable from the single `outside` sentence;
- (c) it is why a hostile path cannot make the gate do unbounded work before refusing.

**What the shipped repair owes each of them** (§2.4a): (a) is answered by the placing step, which is
what an absolute input passes before the walk is asked anything; (b) is answered by that same step
reading containment of an ancestor and never an errno, so an unreadable stranger and a missing one get
one word; (c) is bounded by path depth in both the placing climb and the walk, which is what it always
was for a lexically contained path.

### 1.4 Two live defects that are not symlinks and produce the same sentence

- **A real top-level file whose name begins with two dots.** `paths.ts:213`'s `rel.startsWith('..')`
  fired 704 times in the corpus and every distinct `rel` that reached it began with the real file
  `..hidden.txt`. It cannot catch an escape: `containedIn` is a strict prefix-plus-separator test, so
  `relative(realRoot, abs)` for a contained `abs` is the remainder and never a traversal. Measured
  through the shipping `writeGuarded`: `<root>/..notes.md` in an open project, addressed by its real
  spelling and its real root, answers `{"outcome":"refused","why":"outside"}` and the person reads
  *"because its project is not open"*. One level down (`src/..dots.md`) it saves.
- **A raw errno as the answer.** `paths.ts:74-77` rethrows a bare `NodeJS.ErrnoException` for any code
  that is not `ENOENT` or `ENOTDIR`. Measured: `locked/sub/x.txt` under a mode-000 directory gives
  `EACCES: permission denied, realpath '<root>/locked/sub'`; a symlink loop gives `ELOOP`.
  `guarded-write.ts:369-370` puts that machine string on the wire as `reason` and tells the person
  their project is not open. In `file-ops`, `drag-out` and `open-with` it leaves the module unwrapped
  altogether. **This is a sixth cause reaching the one sentence, beyond the five Phase 272 enumerated.**

### 1.5 What the entry got wrong, corrected here so no round repeats it

- *"The contract baseline moves if the refusal words change."* **It does not.**
  `docs/audits/contract-baseline.txt` holds five sections — `[ipc.invoke.channels]`, `[sqlite.*]`,
  `[localStorage.keys]`, `[env.names]`, `[harness.smoke.modes]`, `[bundle.refusals]` — and the only
  line this channel owns is `fs:writeGuarded` at line 86. `FsGuardedWriteRefusal` appears nowhere in
  it. **Do not regenerate the baseline**, and do not commit a regenerated copy with no diff.
- The trap at `paths.ts:79-81` is a documentation problem under a naive relaxation and **not even that
  under the repair chosen here.** §3 settles it.

---

## 2. THE REPAIR — resolve inside `resolveInsideRoot`, through a bounded second chance

**Chosen: candidate 1, in `resolveInsideRoot`, narrowed.** Not the naive relaxation the escape
research measured, and not either of the other two candidates.

### 2.1 Why not `addProject` (candidate 2) — it changes a durable identity key

The entry costed this at "a visible change nobody asked for". It is worse than that, and the reason is
measured from the tree rather than argued:

**The stored project path IS the identity of a project, in four places that are string equalities.**

| Where | What | File |
| --- | --- | --- |
| `projects.path` | the row | `src/main/manifest/projects-repository.ts:68` |
| `sessions.project_path` | the join, `WHERE project_path = ?` | `src/main/manifest/sessions-repository.ts:812`, `:847` |
| `targetKey(target)` | *"A local target's key is the bare path"* — the `gmux.splitLayouts` record key | `src/shared/workspace-target.ts:123-133`, `src/renderer/state/layout.ts:172-176` |
| `sameTarget(a, b)` | `left.path === right.path`, how the renderer joins a session to a project | `src/shared/workspace-target.ts:110-117` |

Normalising the stored spelling therefore strands every session row, every persisted layout and every
per-project storage record of every project a person opened through a symlink, unless the phase also
migrates two SQLite columns and rewrites a `localStorage` record set the main process cannot reach. That
is a durability change, and `CLAUDE.md`'s first architecture invariant is that durability-critical state
does not move for convenience. **It is a larger blast radius than the gate fix, not a smaller one.**

It also does not finish the job. `session-actions.tsx:571` sets `repoPath: list.repoPath` from a
SESSION, so an absolute `tab.path` composed from a session's own cwd spelling still reaches the gate
with a spelling nobody normalised. The gate is where the two spellings meet, so the gate is where the
repair belongs.

And the module already promises what this repair delivers. `paths.ts:112-116`, unchanged since Phase 39:
*"The comparison is between REAL paths on both sides, so a symlinked spelling of an open project is
accepted."* `resolveOpenProjectRoot` keeps that promise; `resolveInsideRoot` silently withdraws it one
function later. **This phase makes the second function agree with the first.**

### 2.2 Why not "hold both spellings" (candidate 3)

A manifest column, a migration, and two values every one of the four readers above must then choose
between. Two spellings of one folder is the defect. Storing both institutionalises it.

### 2.3 Why not the naive relaxation either

Deleting `:193` costs (a), (b) and (c) of §1.3 and admits TWO families rather than one. The repair
below keeps a bound on all three and is measurably narrower than the deletion.

### 2.4 The mechanism, in one paragraph

> **SUPERSEDED BY THE FIX ROUND. §2.4a is what shipped.** The paragraph below is kept because §2.6's
> measurement and §3's argument were both written against it, and a later round reading only the
> corrected text would not know why the bound existed or what measured it away.

When the lexical containment test fails and the input was **absolute**, the function gets exactly one
more question: `realpath(dirname(lexical))`, ONE call, no walk. Any throw is the containment refusal
with the errno discarded. A resolved parent outside `realRoot` is the containment refusal. A resolved
parent inside `realRoot` is carried forward as `realParent`, and the leaf is never resolved, so `abs`
is composed exactly as it is today. A **relative** input that fails the lexical test climbed out with
`..` and gets no second chance at all.

### 2.4a The mechanism as it shipped — PLACING and RESOLVING, in that order

**Why §2.4 changed.** Two verifiers measured the same defect in it from different directions. The one
`realpath` answers only "does the parent exist and resolve inside", and it throws the errno away, so
for a project opened through a symlink — where **every** absolute path the renderer composes is the
alias spelling — the honest words half two had just written were unreachable. Driven through the
shipping `writeGuarded` over one fixture, the same file in the same disk state read:

| disk state | real spelling | alias spelling under §2.4 |
| --- | --- | --- |
| a folder on the way was removed | `refused/missing`, "it is no longer on disk" | `refused/outside`, "it is not inside the project it was opened from" |
| an ancestor is mode 000 | `refused/unreadable`, `"sub" could not be read (EACCES).` | `refused/outside` |
| an ancestor is a symlink loop | `refused/unreadable`, `"loopa" could not be read (ELOOP).` | `refused/outside` |

The right-hand column is false in all three, in the exact project shape the phase exists for, and §2.7
had argued no product caller could reach it — refuted by the first row, because the folder existed when
the tab was opened and an agent removed it before the save.

**What shipped instead.** The function asks the string comparison one question and the disk a different
one, in that order:

1. **PLACE the path.** Is this spelling a spelling of something inside the project? A relative input,
   and an absolute one already under the real root, is placed by `containedIn(realRoot, lexical)`.
   Anything else is placed by `hasAncestorInsideRoot(realRoot, dirname(lexical))`, which climbs to the
   FIRST ancestor that `realpath`s and compares that to the real root, **with the errno never
   consulted**. A relative input that fails the string comparison is refused here having made no
   filesystem call at all.
2. **RESOLVE it.** `realpathOfAncestors(dirname(lexical))`, for every input alike, then containment
   against its answer, then `abs = resolve(realParent, basename(lexical))`. The leaf is still never
   resolved.

Only a path that passed 1 reaches 2. That ordering is the anti-oracle property §2.4 got from discarding
the errno, and it is strictly sharper: the errno now survives for a path proven inside the project and
is still unreachable for everything else.

**What it costs.** One extra `realpath` on an alias-spelled save, and nothing at all on a relative path
or on a path under the real root. Two calls answer two different questions, which is why they are not
one call.

### 2.5 What that admits, stated exactly, because the entry's wording is not precise enough

The entry asks the phase to show *"it admitted exactly one new shape and not a class"*. That wording
cannot be met by any repair in this function, and pretending otherwise would be the guess this phase
exists to remove. **The honest claim, and the one the proof must carry:**

> The repair admits exactly one new CLASS, defined by a property: an **absolute** input whose
> **parent chain resolves inside the real root**. Every member of that class names a file the relative
> spelling already reached, because `abs` is composed from the RESOLVED parent and never from the
> caller's spelling, and it is compared to the root twice more after that.

**THE PROPERTY IS THE DECLARATION. What follows are examples of it, not an enumeration**, and the
correction matters: the first round wrote *"that class has two known members, and both are declared"*,
and the escape verifier then measured at least three more families that are neither the alias nor the
case variant. None of them escaped — every one lands inside the real root and names a file the relative
spelling already reached — but an enumeration of the ways one directory can be spelled is a promise
nobody can keep, and §2.5 sets the standard itself ("a phase that does not declare it has made a false
claim"). So the declaration is the property, and these are what it covers:

1. **The symlink alias** — belucid's, and the point. 983 of the 1,057 distinct newly-accepted corpus
   inputs (§1.3 for why that is not the 1,966 the first round wrote). A CHAIN of aliases too
   (`conformance:containment` row 32).
2. **The case variant on a case-insensitive volume** — `<SCRATCH>/PROJ/src/index.ts` against a root of
   `<scratch>/proj`. It is not an escape: on that volume it names the same file, the ancestors come
   back canonical from `realpath`, and only the LEAF keeps the caller's case — which is **already true
   today** for relative inputs, where `src/INDEX.TS` is accepted with `rel = 'src/INDEX.TS'`.
3. **A symlink anywhere on the disk pointing INTO the project**, and one pointing at the project's
   PARENT. Measured: `<scratch>/into/index.ts` where `into` → `<root>/src` answers `rel = src/index.ts`
   and the write lands inside the root.
4. **`/tmp/…` for `/private/tmp/…`**, which matters because `/tmp`, `/var` and `/etc` are symlinks on
   every Mac.
5. **An absolute spelling whose parent does not exist yet** — added by the fix round (§2.4a), and it is
   the relative spelling's own behaviour rather than a new one: `gone/README.md` and
   `<root>/gone/README.md` were both accepted at `d3fb8223` and `<alias>/gone/README.md` now agrees
   with them. The same holds for a dangling ancestor (§6 row 22).

### 2.6 Measured, three arms over one fixture

`node /private/tmp/p273-spec/probe.mjs` ran the SHIPPED decision, the naive `delete :193` decision and
the ARM decision over one fixture holding the alias, eight symlinks, a prefix-sibling decoy, a `.git`
tree, a dangling link, a loop and a real `..notes.md`. Every escape row answered `OUTSIDE` in all three
arms. The rows that moved:

| input | SHIPPED | delete :193 | ARM |
| --- | --- | --- | --- |
| `<alias>/README.md` (belucid) | OUTSIDE | OK:README.md | **OK:README.md** |
| `<alias>/src/index.ts` | OUTSIDE | OK:src/index.ts | **OK:src/index.ts** |
| `<alias>/.git/config` | OUTSIDE | GIT | **GIT** |
| `<REALROOT uppercased>/src/index.ts` | OUTSIDE | OK:src/index.ts | **OK:src/index.ts** |
| `<alias>/gone/README.md` (parent deleted) | OUTSIDE | OK:gone/README.md | **OUTSIDE** |

The last row was the whole difference between ARM and the naive relaxation, and it was the bound: a
create target whose parent does not exist got no second chance. **The fix round moved that row to
`OK:gone/README.md`** (§2.4a) — not to the naive relaxation, which deletes the containment question
altogether, but to the same answer the RELATIVE spelling gave at `d3fb8223`, with the placing step
still asked and every containment check still made. The difference between the shipped repair and the
naive one is now the placing step rather than the bound, and `conformance:containment`'s ablation
"the placing step is skipped and the walk speaks for any path at all" is what holds it: it reddens the
unreadable-stranger row, which is the naive relaxation's cost.

### 2.7 The one stated limit that is left

> The bound this section used to describe — an alias path whose parent does not exist — is gone, and
> §2.4a says why. **Its argument was wrong and is worth keeping as a warning**: it read "no product
> caller can reach it: every renderer caller that sends an absolute path sends one whose parent
> exists". A tab open on a file whose folder an agent removes before ⌘S is that caller, it is an
> everyday thing in this product, and "no caller can reach it" is the shape of claim a phase should
> measure rather than reason its way to.

**The limit that remains is the ALIAS ROOT ITSELF.** `resolveInsideRoot(realRoot, '<scratch>/alias',
{ allowRoot: true })` answers `outside`, because `dirname` of the alias is the folder the link sits in
and that is outside the project, so the placing step refuses it. Nothing reaches it: `tree-ops.ts`
sends a move destination relative (`''` or `'.'`) and the empty spelling is handled above. Lifting it
would mean resolving the **LEAF**, which the module's SYMLINK RULE (`paths.ts:15-21`) refuses, so it is
declared rather than fixed and `conformance:containment` row 10 holds it.

### 2.8 What an existing manifest row does on upgrade

**Nothing.** No row is read, written, migrated or re-spelled. A `projects.path` holding
`/Users/x/work/proj` where `work` is a symlink keeps holding exactly that; `sessions.project_path`
keeps matching it; `targetKey` keeps producing it; the tab spine keeps showing the path the person
opened. The only thing that changes is that the gate stops refusing paths built from it. **The upgrade
is invisible and there is no migration**, and that is the strongest argument for this candidate over
the other two.

---

## 3. THE TRAP — `realpathOfAncestors` at `paths.ts:79-81`

The entry warns that relaxing `:193` voids the premise of the comment
(*"cannot happen for a path already proven to sit under an existing root"*). Two things are true and the
builder must act on both.

**The premise is RE-WORDED, not re-established.** The first round kept `realpathOfAncestors` on the
lexically-contained branch alone and called the premise unchanged; §2.4a's repair sends both spellings
through the walk, so that is no longer true and the comment says so. What holds instead is the same
property stated about the caller rather than about one line: **this function is only ever asked about a
path the caller has already PLACED inside an existing project root**, and there are now two placers —
the lexical comparison, and `hasAncestorInsideRoot`, which resolves an ancestor inside the real root.
Both place first and ask second. Rules C3 and C4 are what hold it, and rule 4 of
`conformance:containment` is what stops a later round turning the second placer into something that
reads an errno or throws.

**And the comment is still wrong, for a second reason it never gave, so it is rewritten anyway.** The
throw at `:81` is unreachable and always was: `dirname` of a resolved absolute path terminates at `/`
and `realpath('/')` always succeeds (measured: `realpath("/") === "/"`), so the loop returns at `/` with
the missing segments re-appended lexically, and containment is then decided by the caller. Measured
directly: `/nope-xyz/deep/file.txt` is refused by the containment check at `:207` and `:81` never sees
it. A comment whose only stated reason is a premise a later round can lift is a comment that invites the
lift. So it names both reasons.

**The exact replacement text** (the builder writes this, not a paraphrase):

```ts
    const parent = dirname(current);
    // Hitting the filesystem root. TWO things keep this unreachable and the
    // second is the one that survives a later round.
    //
    // First, this function is only ever asked about a path the caller has
    // already placed inside an existing project root. Until Phase 273's fix
    // round that placement was always the LEXICAL comparison in
    // `resolveInsideRoot`, and the comment here said so; it no longer is. An
    // absolute input spelled through a symlinked project fails that comparison
    // and is placed by `hasAncestorInsideRoot` instead, which resolves an
    // ancestor of it inside the real root. Both callers place the path first
    // and ask second, so the premise holds — but it is now a premise about two
    // callers rather than about one line, which is exactly the kind of premise
    // a later round breaks without noticing.
    //
    // Second, and this holds even if a later round lifts the first: `dirname`
    // of a resolved absolute path terminates at '/', and realpath('/') always
    // succeeds. Measured: realpath("/") === "/". So the loop returns at '/'
    // with the missing segments re-appended lexically, and the CALLER's
    // containment check is what refuses. Measured with '/nope-xyz/deep/file.txt',
    // which resolveInsideRoot refuses at its resolved-parent check and which
    // never reaches this line.
    //
    // It stays as a throw rather than becoming an assertion because a path that
    // somehow had no existing ancestor is not inside any project, and `outside`
    // is the true answer for it.
    if (parent === current) throw refuseOutside(dir);
```

---

## 4. THE RULES

Each is one sentence, testable, and names the file it lives in. C = Builder CONTAINMENT, V = Builder
VOCABULARY.

### Half one — containment (`src/main/fs/paths.ts`)

- **C1.** `resolveInsideRoot` keeps `containedIn(realRoot, lexical)` at its current position and a
  failure of it no longer throws unconditionally.
- **C2.** When that test fails and `trimmed` is NOT absolute, the function throws the containment
  refusal having made no filesystem call.
- **C3.** *(rewritten by the fix round, §2.4a.)* When that test fails and `trimmed` IS absolute, the
  function PLACES the path with `hasAncestorInsideRoot(realRoot, dirname(lexical))` and refuses with
  the containment refusal if that answers false. The placing block resolves nothing itself, walks no
  ancestors, reads no errno, and can only refuse — it never returns a value.
- **C4.** *(rewritten by the fix round.)* `hasAncestorInsideRoot` climbs from `dir` to the FIRST
  ancestor that `realpath`s and answers `containedIn(realRoot, …)` of that one. It reads and never
  throws, never reads an errno, and terminates at the filesystem root. **This is the anti-oracle
  clause**: a path outside the root answers the same whether it is missing, unreadable or a loop.
- **C5.** A resolved parent that is not `containedIn(realRoot, ...)` becomes the containment refusal.
- **C6.** *(rewritten by the fix round.)* There is ONE resolution rule and both spellings take it:
  `const realParent = await realpathOfAncestors(dirname(lexical));`, named once, with
  `resolveInsideRoot` itself calling `realpath` zero times. A path that failed the lexical test reaches
  it only after C3 placed it, which is the premise §3 now rests on.
- **C7.** The leaf is never resolved: `abs` stays `resolve(realParent, basename(lexical))` and the
  module's SYMLINK RULE at `paths.ts:15-21` is unchanged in text and in behaviour.
- **C8.** `realpathOfAncestors`'s root-walk comment is replaced by the text in §3, verbatim, and it
  names `hasAncestorInsideRoot` as the second placer.
- **C9.** `realpathOfAncestors` rethrows no raw `NodeJS.ErrnoException`: a code that is not `ENOENT` or
  `ENOTDIR` becomes a `GmuxError` stamped `unreadable` whose message names the errno in parentheses
  (`guarded-write.ts:399`'s `io` sentence is the form) and whose `detail` is the bare errno token
  (`fs/errors.ts:8-12`'s convention).
- **C10.** `resolveProjectRoot`'s `realpath` catch reads the errno: `ENOENT` and `ENOTDIR` keep the
  message *"That project folder does not exist."* byte for byte and keep `root` as `detail`; every
  other code answers *"That project folder could not be read (CODE)."* with the errno as `detail`; both
  are stamped `unreadable`.
- **C11.** The NUL check at `paths.ts:158` throws a refusal stamped `input` whose message is
  *"A path cannot contain a NUL byte."*, never the containment one.
- **C12.** The `..` clause at `paths.ts:213` asks about a SEGMENT — `rel === '..' || rel.startsWith('..' + sep)`
  — with a comment recording that the prefix form refused every real top-level name beginning with two
  dots and that the resolved-`abs` containment check above it is why no traversal can reach the line.
- **C13.** No `throw gmuxError(` survives anywhere in `src/main/fs/paths.ts`: every throw in the module
  goes through one stamping factory, so a site added later is stamped or is a compile error.
- **C14.** `paths.ts` exports the closed word set and one structural reader, and nothing else of the
  mechanism:

  ```ts
  /** Which question a path guard refused on. One word per remedy. */
  export type FsPathRefusal =
    | 'input'         // a field the caller composed wrongly
    | 'outside'       // containment: the path is not inside the real root
    | 'unreadable'    // a realpath on the way to it threw
    | 'protected'     // the .git rule
    | 'projectClosed' // the root resolved and matches no open project
  ;

  /** The word a guard in THIS module stamped, or null for anything else. */
  export function fsPathRefusalOf(err: unknown): FsPathRefusal | null;
  ```

  It reads the shape and never the constructor, on the same terms `gmuxErrorPayloadOf`
  (`src/main/errors.ts:118`) states, and a value that is not exactly what this module writes is `null`
  whole. **Null is load-bearing: it is how a throw from `deps.listProjectRoots()` is told from a throw
  from this module.**
- **C15.** The words each throw site carries, and there is no sixth: `resolveProjectRoot:93`,
  `:96-100` → `input`; `:105` → `unreadable`; `resolveOpenProjectRoot:135-139` → `projectClosed`;
  `resolveInsideRoot:156`, `:158`, `:179`, `:198-201` → `input`; `:193`'s placing step, `:81`, `:207`,
  `:210`, `:213` → `outside`; `:214` → `protected`; `realpathOfAncestors:76` → `unreadable`;
  `hasAncestorInsideRoot` throws nothing at all, which rule 4 of `conformance:containment` asserts in
  text; `assertBasename`
  and `assertIncomingBasename` → `input` except their `.git` throws, which are `protected`;
  `resolveIncomingSource` → `input` except its `realpath` catch, which is `unreadable`.

### Half two — vocabulary (`guarded-write.ts`, `fs-ops.ts`, `save-sentences.ts`, `rewind.ts`, the log)

- **V1.** `FsGuardedWriteRefusal` (`src/shared/fs-ops.ts:339-348`) gains exactly four words —
  `projectClosed`, `unreadable`, `protected`, `projectsUnknown` — each with its one-line meaning in the
  doc block above it, and loses none.
- **V2.** `guarded-write.ts:369-370`'s catch reads `fsPathRefusalOf(err)` and answers that word,
  defaulting to `projectsUnknown` when it is `null`; `reason` stays `sentenceOf(err)` unchanged.
- **V3.** `projectsUnknown` is the DEFAULT rather than an enumerated set, and the comment beside it says
  why that is total: every throw from `paths.ts` is stamped (C13), so the only unstamped throw that can
  reach this catch came from `deps.listProjectRoots()`, which is the lazy import at `fs/ipc.ts:113-116`
  plus `getGmuxCore()` (`sessions/core.ts:3253-3258`) plus two SQLite reads
  (`projects-repository.ts:133-138`, `:153-157`).
- **V4.** `save-sentences.ts`'s `SENTENCES` map gains exactly four entries and changes exactly one, per
  §5. `SaveRefusalWord` stays `Exclude<FsGuardedWriteRefusal, 'link'>` so a fifth word without a
  sentence does not compile.
- **V5.** The existing `outside` sentence moves to `projectClosed` **byte for byte**, because it was
  written for that cause and is right for it; the phase writes no new prose for the one case it already
  got right.
- **V6.** `save-write.ts` is NOT edited: it passes the word through (`saveRefusalWord`,
  `save-write.ts:77-81`) and only maps `link` to `null`.
- **V7.** `rewindRefusalKey` (`src/renderer/editor/rewind.ts:331-348`) maps `projectClosed` to
  `outsideRoot` and `outside`, `unreadable`, `protected` and `projectsUnknown` to `io`, by explicit
  `case` labels rather than by falling into `default:` — because `outsideRoot`'s sentence is *"{name}
  is not in an open project"* (`redline-sentences.ts:33`) and letting the new words fall into it would
  put this phase's own lie on the redline's surface. No new redline sentence is written.
- **V7a.** *(the fix round.)* `rewind.ts` is in `conformance:redline`'s rule-9 trigger set in
  CLAUDE.md, so **that gate runs and its arm 4 moves with V7.** The arm was written for the shipped-
  before mapping: it drove `why: 'outside'` and expected `outsideRoot`, and both halves of it went red
  — the reading, and the ablation, which could no longer find its edit target and therefore proved
  nothing. `build/redline-rewind-probe.mts` now reads all five words in that arm and
  `build/conformance-redline.mjs` carries **two** ablations for it, because the two clauses fail in
  opposite directions: one puts `projectClosed` onto `io` and reddens the word that keeps its sentence,
  the other puts the four split causes back onto `outsideRoot` and reddens the split itself.
- **V8.** `build/conformance-redline-write.mjs:128-130`'s expected readings move with the words:
  `outsideRoot` → `refused/projectClosed untouched`, `dotGit` → `refused/protected untouched`,
  `outsidePath` → `refused/outside untouched`, unchanged. **The three rows coming apart is half two's
  central evidence, and a build where they do not move has separated nothing.**
- **V9.** The one log call site is the `fs:writeGuarded` registration at `src/main/fs/ipc.ts:275-277`,
  and it becomes:

  ```ts
  handle(ipc, 'fs:writeGuarded', async (_e, input) => {
    const result = await writeGuarded(
      { listProjectRoots: () => fsDeps.listProjectRoots() },
      input
    );
    if (result.outcome === 'refused') {
      logEvent('fs', 'warn', 'fs.save.refused', 'a guarded write was refused', {
        why: result.why,
        reason: result.reason,
        root: typeof input?.root === 'string' ? input.root : null,
        path: typeof input?.path === 'string' ? input.path : null
      });
    }
    return result;
  });
  ```

  **It is here and not in `guarded-write.ts` for a mechanical reason, not a preference:**
  `build/redline-write-probe.mts` loads the SHIPPING `guarded-write.ts` under plain node, and
  `src/main/log/index.ts:31` imports `electron`, so a log call in that module makes
  `conformance:redline-write` unable to load the channel at all. The module's own header already
  refuses it (`guarded-write.ts:131-135`, *"No log line naming the bytes"*). The `typeof` guards are
  load-bearing: `refused('input')` is answered at `guarded-write.ts:352-362` precisely when `root` or
  `path` is not a string.
- **V10.** The line carries exactly four fields — `why`, `reason`, `root`, `path` — and a fifth is a
  defect. It never names `input.contents`, never `input.expect` (a sha256 of a short document is a
  fingerprint of it, and a digest tells a reader nothing they can act on), never a byte length, never
  an excerpt of either side. Level is `warn`, not `error`: `readOnly` and `tooLarge` are ordinary
  answers, and `sessions/core.ts:988` and `:998` are the precedent. Only `refused` is logged — `stale`
  is the compare-and-swap working and already opens a dialog, and `wrote` would put a line in the file
  per auto-save tick.
- **V11.** The path may be written because it is redacted at write time and this call site arranges
  nothing: `src/main/log/format.ts:62` runs `redactValue` over the whole fields object and
  `src/main/log/redact.ts:18-23` turns the home prefix into `~`. Scope `'fs'` is new — nothing under
  `src/main/fs` logs today — and `src/main/arch/enrich/run.ts:346` is the `logEvent` precedent.

---

## 5. THE REFUSAL VOCABULARY — the final list

Twelve words. Four are new, one changes its sentence, one changes only the word it is reached by, and
six are untouched.

| word | sentence (`{name}` is the file) | reached from | remedy |
| --- | --- | --- | --- |
| `projectClosed` **NEW** | `Tortie did not save {name}, because its project is not open — open it again and save. Nothing was written.` | `paths.ts:135-139` only | open the project again; a closed project does not close its tabs, so this is a state a person can undo |
| `outside` *(sentence changes)* | `Tortie did not save {name}, because it is not inside the project it was opened from. Nothing was written.` | `paths.ts:193`'s arm, `:81`, `:207`, `:210`, `:213` | **none, and the sentence names none.** The renderer composed the path; after half one a person should never meet this word, and if they do it is a bug report and the log line answers it |
| `unreadable` **NEW** | `Tortie did not save {name}, because a folder on the way to it could not be read — check that the folder is still there. Nothing was written.` | `paths.ts:105` and `:76` | check the folder is still there — honest for a deleted folder, an ejected disk, a chmod, a TCC denial and a stalled mount alike. The word does not assert an errno; the errno is in the log |
| `protected` **NEW** | `Tortie did not save {name}, because it is inside a .git folder and Tortie never writes there. Nothing was written.` | `paths.ts:214` | none |
| `projectsUnknown` **NEW** | `Tortie could not check which projects are open, so it did not save {name} — restart Tortie and try again. Nothing was written.` | the DEFAULT: `fs/ipc.ts:114`, `core.ts:3254`, `core.ts:3258`, `projects-repository.ts:134-138` and `:154-157` | restart Tortie |
| `input` *(unchanged)* | `Tortie could not work out where to save {name}. Nothing was written.` | `paths.ts:93`, `:96-100`, `:156`, `:158`, `:179`, `:198-201` | none; the sentence already shipped and is already honest for all six |
| `missing`, `readOnly`, `tooLarge`, `notUtf8`, `raced`, `io` | unchanged, `save-sentences.ts:97-109` | unchanged | unchanged |
| `link` | no sentence, by decision (`save-sentences.ts:37-73`) | — | — |

**Why `protected` does not merge into `outside`.** Its remedy is the same — none — and the ruthless
rule would merge them. It does not merge, because the merged sentence would be FALSE: a file under
`.git` IS inside the project, and telling somebody it is not is exactly the lie this half exists to
stop. That is the rule's second clause: **same remedy merges, unless the merged sentence would assert
something that was not measured.** It costs nothing, because `paths.ts:214` already throws its own true
sentence and `guarded-write.ts` is currently throwing that sentence away.

**Why `projectsUnknown`'s subject is Tortie and not the file.** It is the only sentence in the family
that does not begin *"Tortie did not save {name}"*, and that is the design. In all five of its causes
Tortie never got as far as asking whether the project is open, so saying it is not open is a lie about
the person's world to cover a fault in Tortie's own. The meetable one is concrete: on a machine where
tmux cannot be found, `getGmuxCore()` re-runs `boot` (`core.ts:3256-3258`), `core.ts:976` awaits
`tmux.ensureServer()` unguarded, and **every save today reads "its project is not open"**.

**Why `unreadable` is one word for two throw sites.** They are the same sentence to a person —
something between Tortie and the file cannot be read — and a cause with the same remedy is the same
cause. `paths.ts:104`'s bare catch destroys the errno today; even once C10 keeps it, "gone" and
"unreadable" cannot be told apart in a sentence without guessing for the `EIO`, NFS and
unmounted-volume cases. The errno goes in the log, which is what makes the next report answerable.

---

## 6. THE ESCAPE CHECKLIST — the phase's central promise

**This table IS the verifier's checklist.** Every row must be driven, and every row must be proved to
have answered the same way at the parent commit `d3fb8223`. A build that cannot show both columns has
not proved the gate did not get weaker. "after" means: after C1–C15 land.

| # | shape | example | must still be refused | what refuses it AFTER the change |
| --- | --- | --- | --- | --- |
| 1 | Relative traversal out of the root | `../outside/secret.txt`, `src/../../outside/secret.txt`, `..` | **YES** | C2 — the arm is absolute-only, so the lexical check still throws with no syscall |
| 2 | Absolute path to a stranger | `/etc/passwd`, `<scratch>/outside/secret.txt` | **YES** | C5 — `realpath(dirname)` lands outside `realRoot` |
| 3 | Absolute path merely sharing a string prefix | `<root>-evil/x.txt` | **YES** | C5, via `containedIn`'s separator rule (`paths.ts:56`) |
| 4 | Directory symlink inside the project pointing OUT, existing leaf | `escape/secret.txt` | **YES** | `paths.ts:207` unchanged — it is lexically inside, so the arm never runs |
| 5 | Directory symlink OUT with ancestors that do not exist yet | `escape/deep/new.txt` | **YES** | `paths.ts:207` unchanged |
| 6 | Symlink to the filesystem root | `slash/etc/passwd` | **YES** | `paths.ts:207` unchanged, `realParent = /etc` |
| 7 | Symlink into ANOTHER open project | `toother/theirs.txt` | **YES** | `paths.ts:207` unchanged — the comparison is against THIS root only |
| 8 | Relative traversal wearing a symlinked prefix, landing outside | `escape/../../outside/secret.txt` | **YES** | C2 for the relative spelling, C5 for the absolute one. **This is the shape a verifier will try to ride the new admission with**: the alias prefix collapses away in `resolve()` before any `realpath`, so what is left is a plain stranger |
| 9 | Absolute traversal through the alias | `<scratch>/alias/../outside/secret.txt` | **YES** | C5 |
| 10 | The alias root itself, with `allowRoot` | `resolveInsideRoot(realRoot, '<scratch>/alias', { allowRoot: true })` | **YES, unchanged** | C5 — `dirname(alias)` is the scratch dir. A pre-existing limit: `paths.ts:195` compares the UNRESOLVED spelling, so a symlinked root spelling is not recognised as the root. Nothing reaches it because `tree-ops.ts` sends `destDir` relative (`''` or `'.'`). **Declared, not fixed** |
| 11 | `.git` at any depth, case-folded, and through a symlink | `.git/config`, `src/.git/hooks`, `.GIT/config`, `gitlink/config` | **YES**, and now says `protected` | `paths.ts:214` unchanged; `rel` is still derived from the resolved parent, which is why the symlinked spelling is caught |
| 12 | `.git` reached through the ALIAS | `<alias>/.git/config` | **YES** | `paths.ts:214`, after the arm admits the alias. Measured: `GIT` in all three arms |
| 13 | Absolute path where nothing on the chain exists | `/nope-xyz/deep/file.txt` | **YES** | C4 — the placing step climbs to `/`, which is not contained. **Not** the `:81` root-walk throw, which is unreachable (§3) |
| 14 | An ancestor the process cannot traverse | `locked/sub/x.txt` under mode 000 | **refused, and no longer with a raw errno** | C9 — a stamped `unreadable`, so the person reads "a folder on the way to it could not be read" instead of `EACCES: permission denied, realpath '...'` |
| 14a | **The same ancestor addressed through the ALIAS** | `<alias>/locked/sub/x.txt` | **refused, and with the SAME word row 14 gets** | C3 + C4 + C9. Added by the fix round. Under §2.4 this answered `outside` — "it is not inside the project it was opened from", about a file that is — so half two's honest word was unreachable for exactly the person half one was written for, since every absolute path in a symlinked project is the alias spelling |
| 15 | A symlink loop with a child | `loopa/child.txt` | **refused, no raw errno** | C9 |
| 16 | An absolute stranger whose ancestor is unreadable | `<some unreadable dir>/x` | **YES, and indistinguishably** | C4 — the placing step answers on containment of an ancestor and never on an errno, so the answer is `outside`, the same answer a missing path gets. This is what keeps the gate from becoming an oracle for paths outside the root, and it is the one row the "placing step is skipped" ablation reddens |
| 17 | NUL byte | `a\0b` | **YES**, and now says `input` | C11 — a NUL is a malformed request, not a containment fact |
| 18 | Whitespace-only path | `'   '` | **YES**, unchanged | `paths.ts:177-180`. Note `src/   /x.txt` is ACCEPTED and always was: a space-named entry is addressable mid-path and not at the top level |
| — | **Not escapes. Must still be ACCEPTED, and a verifier must not score them as holes.** | | | |
| 19 | Relative traversal wearing a symlinked prefix that lands back INSIDE | `escape/../secret.txt` where `escape` → outside | accepted as `rel = secret.txt`, unchanged | `resolve()` collapses `..` textually, so the gate names `<root>/secret.txt`. **A repair must not "fix" this by resolving the leaf** — that breaks the SYMLINK RULE at `paths.ts:15-21` |
| 20 | A symlink whose LEAF is `.git` | `gitlink` → `<root>/.git`, input `gitlink` | accepted as `rel = gitlink`, unchanged | the leaf is never resolved. Pre-existing, not this phase's, and on the checklist so a verifier does not attribute it here |
| 21 | A LEAF symlink pointing out of the project | `leaf.txt` → `<scratch>/outside/secret.txt` | accepted, unchanged, **by design** | `paths.ts:15-21` states the rule and the reason. `guarded-write` refuses it `link` via `O_NOFOLLOW`; rename/trash/duplicate act on the link. **The phase must not narrow this by accident** |
| 22 | A dangling symlink as an ancestor | `dangle/evil.txt`, and `<alias>/dangle/evil.txt` | accepted, unchanged | entirely inside `realpathOfAncestors` and unaffected either way. A real hole and **not this phase's**: it needs a second actor to create the target between the check and the write (the create sequence alone fails `ENOENT` at `mkdir`, measured). Measured at `d3fb8223`: the relative AND the real absolute spelling were BOTH accepted there, so the alias spelling agreeing with them after the fix round is parity and not a widening. On the checklist so the verifier does not score it as a regression |
| 23 | A real directory swapped for a symlink AFTER the check (TOCTOU) | `<root>/d` → link, between the check and the write | accepted, unchanged | `sameEntry` (`guarded-write.ts:238-246`) compares the LEAF's `ino`, `size`, `mtimeNs` and `ctimeNs`, none of which a directory rename moves. Pre-existing, unchanged, out of scope, and stated so nobody claims this phase closed it |
| 24 | An ancestor that is a FILE | `src/index.ts/deep/f.txt` | accepted, unchanged | `ENOTDIR` is treated as "not there yet"; the disk call fails afterwards |
| 25 | A real top-level file beginning with two dots | `<root>/..notes.md` | **must become ACCEPTED** — it is refused today and wrongly | C12. This is a live defect producing this phase's exact sentence and it is not a symlink story at all |
| 26 | The symlinked project spelling — belucid's | `<scratch>/alias/README.md` | **must become ACCEPTED**, `rel = README.md` | C3 + C6. The point of the phase |
| 27 | The case variant on a case-insensitive volume | `<SCRATCH>/PROJ/src/index.ts` | **newly accepted, and DECLARED** (§2.5) | C3 + C6 |
| 28 | An absolute alias path whose parent does not exist | `<alias>/gone/README.md` | **accepted**, `rel = gone/README.md`, exactly as the relative spelling was at `d3fb8223` | C3 + C6. **The fix round moved this row and §2.4a is why.** Refused, it told a person whose folder an agent had just removed that the file was not inside the project it was opened from, while the real spelling said `missing` |
| 29 | An unreadable ancestor inside the root, through the alias | `<alias>/locked/sub/x.txt` | **refused `unreadable`**, the same word row 14 gets | C3 + C4 + C9 |
| 30 | A symlink loop inside the root, through the alias | `<alias>/loopa/child.txt` | **refused `unreadable`**, the same word row 15 gets | C3 + C4 + C9 |
| 31 | A dangling ancestor through the alias | `<alias>/dangle/evil.txt` | **accepted**, as row 22's relative spelling always was | C3 + C6 |
| 32 | A CHAIN of aliases | `<scratch>/alias2/README.md` where `alias2` → `alias` → `<root>` | **accepted** | C3 + C6. The class is a property and not one hop (§2.5) |
| 33 | A link inside the root pointing at the root's PARENT | `up/outside/secret.txt` and `<alias>/up/outside/secret.txt` | **YES, both** | C5 — the walk resolves `up` to the scratch dir and containment refuses. This is the shape that would climb back out if the check after the walk were dropped |

---

## 7. FILE OWNERSHIP — disjoint

### Builder CONTAINMENT

| file | what |
| --- | --- |
| `src/main/fs/paths.ts` | C1–C15 |
| `src/main/fs/__tests__/paths.test.ts` | the existing suite stays green as written; add nothing here |
| `src/main/fs/__tests__/p273-alias-containment.test.ts` **new** | rows 26, 27, 28, 25, 12 and one per refused row of §6 that a unit test can reach |
| `build/conformance-containment.mjs` **new** | the §6 table as an executable gate, over a fixture it builds and removes in a `finally`, with one ablation per admitted row |
| `package.json` | one new script, `conformance:containment` |
| `build/verification-checks.mjs` | classify the new gate both ways (`gate:checks` requires it) |
| `CLAUDE.md` | one row in the path-triggered gate table for `src/main/fs/paths.ts` |

**CONTAINMENT does NOT touch `src/main/sessions/core.ts` and writes no migration.** §2.8 is why: the
chosen repair reads no manifest row and rewrites none.

### Builder VOCABULARY

| file | what |
| --- | --- |
| `src/shared/fs-ops.ts` | V1 |
| `src/main/fs/guarded-write.ts` | V2, V3 |
| `src/renderer/editor/save-sentences.ts` | V4, V5 |
| `src/renderer/editor/rewind.ts` | V7 |
| `src/main/fs/ipc.ts` | V9 only — the `fs:writeGuarded` registration and the `logEvent` import. Nothing else in the file moves |
| `build/conformance-redline-write.mjs` | V8 |
| `build/conformance-save.mjs` | new rules 15–17 (below) |
| `src/renderer/editor/__tests__/p273-refusal-words.test.ts` **new** | one assertion per word, and the `projectsUnknown` default |

**The seam between them, agreed here so neither waits.** VOCABULARY codes against exactly this, and
CONTAINMENT delivers exactly this and nothing wider:

```ts
import { fsPathRefusalOf } from './paths';        // main/fs/guarded-write.ts
import type { FsPathRefusal } from './paths';
```

`fsPathRefusalOf(err)` answers one of `'input' | 'outside' | 'unreadable' | 'protected' | 'projectClosed'`
or `null`. **Nothing else crosses.** `paths.ts` never imports `@shared/fs-ops`'s refusal union and
never names a save word, so the containment module stays ignorant of what a save says — which is the
reason the two halves can be built at once.

**Neither builder owns `build/p273/probe-p273-symlink.mjs`.** The app run is the integrator's, written
once both halves are in one tree, because it drives both.

### The three new `conformance:save` rules (VOCABULARY)

- **15.** The sentence map's `projectClosed` entry is the string that shipped as `outside`, **byte for
  byte**, and no sentence in the map is the old `outside` string under any other key. One ablation: a
  copy whose `projectClosed` has been reworded must go red.
- **16.** `guarded-write.ts`'s containment catch names `fsPathRefusalOf` and its fallback word is
  `projectsUnknown`; the body holds no literal list of causes, because V3's totality comes from the
  stamp rather than from an enumeration. One ablation: a copy whose fallback is `'outside'` must go red.
- **17.** The `fs:writeGuarded` handler in `src/main/fs/ipc.ts` logs exactly `why`, `reason`, `root`
  and `path`, and its body names neither `contents` nor `expect`. Read by matching braces through
  `functionBodyOf`, the gate's own reader. One ablation: a copy of the handler with `contents` in the
  fields must go red — **a rule that cannot fail proves nothing.**

---

## 8. PROOF, run rather than read (Tier 3)

The tier's budget is the gates, real data, **two independent methods one of which is an attack**, and a
fix round on any `needs_work`. State the independent step in the verdict; a verdict whose evidence is
only the builders' own checks re-run is not a verification.

1. **Measure the parent commit. Mandatory**, because the operator relayed it. At `d3fb8223`, in the
   running app, a project opened through a real symlink refuses every save and has no Open With
   submenu on any row; after, both work. Both readings go in the commit body, from the app rather than
   a unit test, because a unit test is where this defect hid.
2. **Method 1, the attack — drive §6 whole, both ways.** Every "must still be refused" row is proved
   refused at the parent AND at HEAD, and every "must become accepted" row is proved refused at the
   parent and accepted at HEAD. A row that cannot be made to fire is a finding about the row, not a
   pass. **A repair that makes saving work and cannot produce this table is a failed phase.**
3. **Method 2 — something neither builder did.** Candidates, pick by risk: re-derive the admitted set
   independently by running a corpus through the shipped function and the parent's copy and diffing the
   verdicts (the escape researcher's method, re-run against the REAL repair rather than against a
   deletion); or write a hostile fixture of shapes §6 does not name and show each lands in a declared
   row or is a finding; or drive the three `conformance:redline-write` rows and show they came apart.
4. **One app run drives everything.** A scratch profile, a scratch `HOME`, its own tmux socket, a
   project opened through a real symlink, all ended in a `finally`. In that one session: save a file,
   auto-save a file, rewind a redline change, undo the rewind, open the Open With submenu, rename,
   trash, create, drag out, and search a hit's context. They share the gate this phase changes.
5. **Read the log.** After a refusal, `<userData>/logs/app.log` holds one `fs.save.refused` line with
   four fields and a `~`-redacted path, and **no line at all** for a `wrote` or a `stale`.
6. **The gates:** `npm run typecheck && npm run build && npm run smoke:t1` minimum; the integrator runs
   the full battery. Path-triggered, all of them: `conformance:save`, `conformance:redline-write`,
   `conformance:pathdoors`, `conformance:redline`, and the new `conformance:containment`.
   **`conformance:redline` is on this list because the fix round found it red and the first round had
   not run it.** `src/renderer/editor/rewind.ts` is in that gate's rule-9 trigger set in CLAUDE.md, and
   the phase edits it; its arm 4 drove `why: 'outside'` and expected `outsideRoot`, which is precisely
   the mapping this phase splits. The lesson generalises and is worth writing down: **check the touched
   paths against CLAUDE.md's gate table rather than against the phase's own proof list**, because the
   proof list is written before the files are known.

---

## 9. WHAT IS NOT IN THIS PHASE

- **The gate does not get weaker.** §6 is the proof obligation, not a summary.
- **`resolveOpenProjectRoot` stays the one gate** every mutation asks. It is measured symlink-safe
  already (`paths.ts:125`, `:129` realpath both sides) and **no line of it changes.**
- **The save path gets no private, softer door.** `writeGuarded` calls the same two functions in the
  same order; the repair is inside the shared gate, which is why Open With and the redline are fixed by
  it too.
- **No new IPC channel.** The reason was already on the wire and unread.
- **No telemetry.** One local `logEvent` line, in the bounded `<userData>/logs/app.log` the log module
  already rotates.
- **No file contents in any log.** Four fields, and a fifth is a defect the verifier names.
- **No manifest migration, no `addProject` change, no stored-path rewrite** (§2.8).
- **No redline sentence is written** and the plain door, auto save's stop and the three answers of a
  stale save are untouched.
- **Remote projects are out of scope**: their paths are on another machine and never reach `realpath`
  here.
- **The contract baseline is NOT regenerated** (§1.5).
- **Rows 20, 21, 22, 23 and 10 of §6 are pre-existing and stay pre-existing.** The phase names them so
  a verifier does not attribute them here and a later round does not think they were closed.
- **The phase does not close issue 25 on a green gate.** It closes when belucid confirms on a build, or
  it stays open and says what is still unknown.
