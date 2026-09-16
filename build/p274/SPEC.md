# Phase 274 — one folder is one project however it is spelled

**Subject:** `fix(paths): one folder is one project however it is spelled`
**First body line:** `Phase 274: one folder, two spellings`
**Semver:** **patch**, and §5 is why: no migration ships, no column is added, no channel is added,
and `docs/audits/contract-baseline.txt` does not move. The entry allowed minor "if it turns out a
manifest migration is needed". It is not needed, and §5 argues that rather than assuming it.
**Tier: 3**, not negotiable. It is the manifest, restore and session lifecycle, and the measured
failure is a person's sessions dividing between two rows for one folder.

**Charter:** [issue 25](https://github.com/gregce/tortie/issues/25) (belucid), the **correction block**
inside Phase 272's entry, Phase 273's entry, and Phase 274's own entry at `docs/BACKLOG.md:27887`,
including its section **THE VOLUME CAN BE ASKED, MEASURED 2026-09-16**. Four surveys and one live
three-Electron reproduction are already in. **Do not re-derive them.** Everything quoted below with a
`file:line` was read from this worktree at `30f4bd8d`; the builder reads the file rather than this
summary before editing.

---

## 0. The six things this phase may not trade

1. **NEVER CASE-FOLD A COMPARISON.** No `toLowerCase`, no `toUpperCase`, no `localeCompare`, no
   case-insensitive regex on a path. It is the reporter's own recorded wrong fix and it corrupted
   sessions recorded on another platform. Rule 23 makes it a gate.
2. **NEVER `String.prototype.normalize()` A PATH.** This is the Unicode twin of rule 1 and it is new
   in this phase, because the shape survey measured the reason: a canonicalising `realpath` returns
   whichever normalisation form is **on disk** — asked for NFD `cafe<U+301>-proj` over a real NFC
   `caf<U+E9>-proj` it answers NFC, and asked over a real NFD name it answers NFD. Normalising its
   output re-creates the mismatch it just removed. Rule 23 covers both words.
3. **What the person SEES does not change.** The tab spine shows the folder as they opened it, with
   the spelling they opened it with. Nothing in this phase re-spells a stored path, a tab label or a
   tooltip. §4 is built around this and §10.3 is the one gesture it costs us.
4. **Phase 273's gate is not re-opened.** `resolveInsideRoot`, `resolveProjectRoot`,
   `resolveOpenProjectRoot`, the `FsPathRefusal` vocabulary at `src/main/fs/paths.ts:120-126` and
   `conformance:containment` all stand unchanged. This phase adds no caller a flag and no channel a
   softer door.
5. **Remote is out of scope**, and §6 says why that is safe rather than merely declaring it.
6. **No Windows work**, no new IPC channel, no telemetry, nothing leaves the machine.

---

## 1. The decision, on one page

The defect is **three layers**, not one, and the surveys separate them cleanly. This phase fixes two
and refuses the third with a named reason.

> **LAYER 1 — THE PRODUCER (durable).** `addProject` mints a **second project row** for a folder that
> already has one, because `projects.path` is `UNIQUE` (`src/main/manifest/schema.ts:49`) and SQLite
> uniqueness is byte-exact, while `addProject` stores `resolvePath(path)` —
> `node:path.resolve`, never a `realpath` — at `src/main/sessions/core.ts:2891`. Two rows means two
> tabs with the same name, sessions divided by `WHERE project_path = ?`
> (`src/main/manifest/sessions-repository.ts:812`, `:847`), and a session that survives a tab close
> with nowhere to be drawn. **Measured live, three Electrons, in the running app.**
>
> **LAYER 2 — THE ANSWER (live, inside one window).** Two kinds of channel serve one tree. `fs:readDir`
> **echoes** the caller's spelling (`src/main/fs/ipc.ts:208`). Every mutation verb behind
> `resolveInsideRoot` **resolves** it, because `entry()` composes `path` from `realRoot`
> (`src/main/fs/file-ops.ts:88-93`). So the tree asks for a file at one spelling and is handed it at
> another, and every `===`, every `startsWith` and every `entriesByDir` key in the renderer then
> disagrees with itself. **Measured: 23 of 23 tree steps pass on the disk spelling and 6 of 23 pass on
> the person's, all 17 failures silent, no toast and no console error.** The same split sends ⌘S out of
> the compare-and-swap door, which is the shape issue 16 exists to prevent.
>
> **LAYER 3 — A REALPATH THAT DOES NOTHING.** Node has two functions spelled `realpath` and only one
> canonicalises. Re-measured independently for this spec on node v22.23.1, typed
> `<d>/alpha/beta/gamma.txt` over a real `<d>/Alpha/Beta/Gamma.txt`:
> ```
> fs.realpathSync         -> /private/tmp/p274-spec-check/alpha/beta/gamma.txt   (UNCHANGED)
> fs.realpathSync.native  -> /private/tmp/p274-spec-check/Alpha/Beta/Gamma.txt   (canonical)
> fs/promises.realpath    -> /private/tmp/p274-spec-check/Alpha/Beta/Gamma.txt   (canonical)
> ```
> `fs.realpathSync` is Node's own JS walk; it `lstat`s each component and rewrites only the ones that
> are symlinks, so it hands back the case it was given. **This rewrites the entry's line "this
> repository HAS the working tool; every defect here is a place that does not call it."** There are
> places that DO call something named `realpath` and get nothing, and two of them carry a comment
> saying they need the canonical form.

**THE ONE DECISION, applied to all three layers:**

> ### Ask the filesystem what a folder IS, never what it is called.
>
> Two paths name one folder when the filesystem hands back the same `st.dev` and the same `st.ino`.
> That is the only definition in this phase. Where the question is *identity* — is this the folder
> that row already names — the answer is dev+ino. Where the question is *spelling* — what do I call
> the thing I just did for you — the answer is **the caller's own root**, echoed back, exactly as
> `fs:readDir` already does. Where a path must be canonicalised, it goes through **one door** that
> calls the `realpath` that actually canonicalises.

Three consequences that make this the cheap answer rather than the expensive one:

- **Nothing is re-spelled, so nothing migrates.** §4 and §5.
- **`src/shared/workspace-target.ts` does not change.** Phase 273's commit named `sameTarget` and
  `targetKey` as reasons not to normalise. With one row per folder, both sides of every `sameTarget`
  comparison are the same stored string, and a module whose header at `:28` says *"It imports nothing,
  exactly like the rest of src/shared"* is not asked to make a syscall. It gains a comment recording
  the ruling and no code.
- **The renderer's tree does not change either.** `FsOpEntry.relPath` is already correct in every verb
  (measured: `sub/new.md`), so once `entry()` composes `path` from the caller's root, `finishCreate`'s
  `path: entry.path` (`src/renderer/tree/tree-ops.ts:725`), the `followMoves` pair at `:849-850` and
  the three `forgetUnder` calls at `:856`, `:951`, `:1196` are all correct with no edit. Rule 24 makes
  that a claim the probe must prove rather than a hope.

**THE PRIOR ART IS IN THIS REPOSITORY AND IT IS NOT NEW.** dev+ino is already the shipping answer in
two places, in this exact domain, for this exact reason:

- `src/main/fs/file-ops.ts:110-118`, `sameEntry`, under the comment *"Case-insensitive volumes (the
  macOS default) report a `Foo.txt` destination as EXISTING when the source is `foo.txt` — that is a
  case-only rename, not a collision."*
- `src/main/arch/db.ts:96-102`, `archRepoKey`, `${st.dev}:${st.ino}` — the reporter's incident 4
  (unstable hashed workspace ids) already answered here in three lines.

And two more that collapse two spellings without folding anything: `src/main/baselines/store.ts:477-484`
(*"two spellings of one project share one record rather than making two"*) and
`src/main/manifest/harvest/stores.ts:1320`'s `samePath`. **This phase mostly finishes applying four
patterns the repository already has.**

---

## 2. The probe

The entry requires that this phase be able to answer *"does THIS volume fold case"* per volume rather
than per machine. It ships, in product code, with the signature below. **§2.4 states honestly what it
does and does not decide**, because a module built to satisfy a requirement and then used for nothing
is worse than no module.

### 2.1 The module

**`src/main/fs/folder-identity.ts`** — new, owned by builder IDENTITY. It **writes nothing, spawns
nothing, opens no file, and starts no process.** It calls `statSync` and `realpathSync.native` and
nothing else. It lives beside `paths.ts`, `file-ops.ts` and `path-door.ts` because it is the third
question that domain answers, after containment and door choice.

```ts
/** What the filesystem says about two paths. Never a guess. */
export type FolderSameness = 'same' | 'different' | 'unknown';

/** Does the volume holding `path` fold case? */
export type CaseFolding = 'folds' | 'separates' | 'unknown';

/**
 * Do these two paths name ONE directory on disk?
 * Asked of DIRECTORIES only; the caller has already proved both are folders.
 */
export function sameFolder(a: string, b: string): FolderSameness;

/** The volume probe. Two stats, no write, no spawn. */
export function volumeFoldsCase(path: string): CaseFolding;

/**
 * The ONE canonicalising realpath in the owned domain.
 * `fs.realpathSync` is Node's JS walk and does NOT restore case; this is
 * `fs.realpathSync.native`, which goes through libuv to realpath(3). Measured
 * on node v22.23.1 — see §1 layer 3.
 */
export function canonicalPathSync(path: string): string;

/** Groups of two or more paths that name one folder. For the log line in rule 8. */
export function duplicateFolderGroups(paths: readonly string[]): string[][];
```

Every function takes an injectable stat seam (a single optional last parameter, defaulted to the real
`statSync`) so `conformance:samefolder` can drive the case-sensitive column deterministically with no
mount. The seam is the module's ONLY test affordance; there is no second implementation.

### 2.2 `sameFolder`, exactly

1. If the two strings are byte-equal, `'same'`. No syscall. This is the overwhelmingly common answer
   and it costs nothing.
2. `statSync` both. If both succeed: `'same'` iff `dev` and `ino` both match, else `'different'`.
3. If either throws `ENOENT` or `ENOTDIR`: `'different'`. A path that names nothing is not the same
   folder as one that names something. Certain, and no probe is involved.
4. If either throws anything else (`EACCES`, `EIO`, `ELOOP`, an unmounted volume): `'unknown'`.
   **Never `'different'`** — an unreadable folder is not a proven-absent one, and the caller must not
   be allowed to treat "I could not look" as "they are not the same".
5. A caller may act on `'same'`. **No caller in this phase acts on `'unknown'`**; `'unknown'` takes
   the same branch `'different'` takes, which is exactly today's behaviour and therefore cannot
   regress anybody.

Why dev+ino and not `canonicalPathSync` on both sides: **the APFS firmlink is the one shape a
canonicalising realpath does not collapse**, re-measured for this spec —
`/Users/gdc/gmux` and `/System/Volumes/Data/Users/gdc/gmux` are `16777231:334386926` on both sides,
one folder beyond doubt, while `realpathSync.native` answers two different strings. dev+ino answers
every shape in §8; realpath answers all but that one. Reachability of the firmlink prefix is
**unmeasured** — the shape survey said so honestly and nothing in `src/`, `build/` or `docs/` names it
— so this is a property of the design and not a claimed fix.

### 2.3 `volumeFoldsCase`, and the three hard answers the brief demands

The method is the entry's own: take a path that exists, flip the case of its last component, `stat`
both, compare `dev` and `ino`. Re-measured for this spec on the machine's own volumes: `/private/tmp`
17 µs, `/Users/gdc/gmux` 45 µs, a scratch directory 43 µs — all `folds`.

- **A path that does not exist yet.** The probe walks UP by `dirname` to the nearest component that
  stats, and probes that, because case folding is a property of the VOLUME and every directory on it
  answers the same. It stops at `/`. The walk may cross a mount point, so the answer can belong to a
  different volume than the absent leaf would live on. **THE FIX ROUND REPLACED THAT DECLARED LIMIT
  WITH A RULE, because the limit did not describe the defect.** A directory's NAME is an entry in its
  PARENT's directory, so flipping the name asks the volume the PARENT is on — and at a mount point
  the parent is another volume. Measured on a real case-sensitive APFS image mounted under
  `/private/tmp`, which folds: a deep path on the image read `'separates'` and the mount point itself
  read `'folds'`, because the flipped spelling of the mount point resolved back through the folding
  parent to the same inode. The old cache then handed that wrong answer to every later question about
  that volume. The walk now proves `dirname(at)` shares `at`'s device before it either asks that
  component or climbs past it, and answers `'unknown'` at the boundary.
- **A path whose last component has no case to flip** — `2026`, a name of digits or punctuation only.
  Re-measured: `/private/tmp/2026` → the flip produces the same string, so the component cannot be
  asked. The probe walks up to the nearest ancestor that contains a cased letter. If none does,
  `'unknown'`. The shape survey measured the sharp end of this: over the operator's **nine real
  project paths the case question is answered 9 of 9 and the normalisation question 0 of 9**, because
  every project name is plain ASCII with nothing to flip. That is why the probe answers **case only**
  and §3 handles normalisation by a different route.
- **A stat that fails for an unrelated reason.** Only `ENOENT` on the flipped spelling means
  `'separates'`. Any other errno on either side means `'unknown'`. An `EACCES` on the flipped spelling
  is not proof the folder is absent.

### 2.4 What the probe decides, stated plainly, because it is less than the entry assumed

**The probe decides no merge.** `sameFolder` answers the merge question by itself and is strictly
stronger than a volume flag: on a case-sensitive volume `Source` and `source` have different inodes,
so `sameFolder` answers `'different'` **without being told anything about the volume**. The entry's
stated danger — *"a repair that treats spellings as interchangeable would merge two real projects into
one identity"* — cannot arise for a repair that never compares two spellings for anything but byte
equality. **This is the spec attacking the entry's central premise rather than confirming it**, and it
is the reason the repair needs no migration.

The probe therefore ships with exactly two callers, both real and both permanent:

1. **`conformance:samefolder` and `measure:p274-volumes` (rule 22).** The fixture table in §8 has two
   columns and the gate must know which one to assert. The probe is the gate's own oracle, so the
   gate is correct on the operator's insensitive boot volume, on a mounted case-sensitive image, and
   on a case-sensitive CI volume, without being told which it is on. That is precisely *per volume,
   not per machine*, and it is permanent.
2. **The duplicate log line (rule 8).** When two project rows name one folder, the line says whether
   the volume folds case, because *"these two strings are one folder"* is otherwise an unfalsifiable
   claim in a log, and because it is what tells a reader whether they are looking at a folding volume
   or at a symlink.

### 2.5 Caching and invalidation — THE FIX ROUND DELETED THE CACHE, AND THE MEASUREMENT IS WHY

The first build cached the volume's case answer in a `Map` keyed by the `st.dev` of the directory the
answer was taken on, capped at 64 entries, and argued invalidation was structural rather than
scheduled:

- a volume's case behaviour **cannot change while it is mounted** — true, it is decided at format
  time;
- a remount that assigns a **different `dev`** is a cache miss under a new key — true;
- a remount that assigns the **same `dev`** is the same volume, and the cached answer is still true —
  **FALSE, and it was measured rather than argued.**

macOS hands a freshly attached disk image the `dev` a detached one had. Three images created and
attached one after another, each detached before the next, all received dev `16777241`:
`Case-sensitive APFS`, then plain `APFS`, then `Case-sensitive APFS`. Driven end to end through the
shipped module in ONE process: ask the sensitive volume (`'separates'`, cached under 16777241),
detach it, attach a case-INSENSITIVE volume that receives the same number, and the module answers
`'separates'` for a volume that in fact folds — proved independently by a second `mkdir` of the
flipped name being refused.

**So there is no cache.** There is no reliable cheap key for "this is still the same volume" — the
root inode of an APFS volume is 2 on every one of them — and the probe's only product caller is the
duplicate log line of rule 8, which runs once per folder that already has more than one project row,
a population measured at ZERO. Two or three `statSync` calls at about 200 µs bought nothing and cost
a wrong answer.

**`sameFolder` caches nothing and stats both sides every time**, as it always did. A folder's identity
can change under a running app — a directory can be replaced between two gestures — so the identity
question is asked fresh. Now the volume question is too.

---

## 3. What "same folder" means, exactly

> **Two paths name the same folder when the filesystem hands back the same `st.dev` and the same
> `st.ino` for both. Nothing else is a definition.**

Case, Unicode normalisation, symlinks, firmlinks, `/tmp` against `/private/tmp`, trailing separators,
doubled separators, `.` and `..` are **not enumerated as rules**. They are shapes the definition
already covers, and `src/main/fs/paths.ts:71-73` already states this repository's idiom for why:
*"an enumeration of the ways one directory can be spelled is a promise nobody can keep."* §8 lists
them as **fixtures that prove the definition**, never as clauses that implement it.

**Unicode normalisation is IN SCOPE at the identity door and needs no mechanism of its own.** The
shape survey measured the fact that would otherwise trap a later round: a **case-SENSITIVE APFS volume
still FOLDS normalisation** — NFC `caf<U+E9>-proj` and NFD `cafe<U+301>-proj` are the same inode there
and a second `mkdir` is refused `EEXIST`, while `RealName` and `realname` on the same volume are two
different inodes. Case sensitivity and normalisation sensitivity are **independent properties and on
APFS they go opposite ways.** A design that asked the volume about case and inferred normalisation
would get the wrong answer on exactly the volume created to be careful about. dev+ino asks about
neither and is right about both, because it folds whatever the volume folds without knowing which.

**Unicode normalisation is OUT of scope for the probe**, which answers case only, for the measured
reason in §2.3: on real project paths the normalisation question is unanswerable 9 times out of 9.

**Two shapes are a different class and are refused entry to this phase**, with the reason stated so a
later round does not fold them in by symmetry: a zero-width space (U+200B) and a non-breaking space
(U+00A0) in a name give `ENOENT` on **both** kinds of volume. There is no one-folder-two-spellings
there — there are two names, one of which names nothing, and what a person sees is a refusal rather
than a silent split. They are a display and paste-hygiene problem. §10.6 carries the one line they
earn.

---

## 4. Which side normalises — the central decision

**NEITHER SIDE IS RE-SPELLED. THE IDENTITY QUESTION MOVES ABOVE THE STRING.**

The entry offers three candidates. Here is what each costs, measured, and why the answer is a fourth
that is cheaper than all of them.

**(a) Normalise on the way in** — store the canonical spelling. Phase 273 refused it and its reasons
stand. The storage sweep priced them: re-spelling `projects.path` strands `sessions.project_path`
(34 distinct values in his live manifest, of which only 9 appear in `projects`, so the column is
free-form and a re-spell by join is not even well defined for the other 25), `sessions.cwd`, the
`project_tombstone` JSON payload at `src/main/manifest/schema.ts:508-512`, **and nine localStorage
record sets main cannot reach** — `gmux.splitLayouts`, `gmux.quickopen.recents`, `gmux.treeOpen.*`,
`gmux.scm.historyScope.*`, `gmux.context.agent.*`, `gmux.context.collapsed.*`, `gmux.editorWidth`,
eight SCM collapse keys and `<userData>/recents.json`. `src/main/recents/store.ts:13-14` is the proof
that main cannot read localStorage. **And it breaks refusal 0.3 outright**: a person who opened
`~/source/proj` would start seeing `~/Source/proj` in the tab tooltip, which is a visible change
nobody asked for.

**(b) Normalise at every comparison** — what 273 did for the one gate it touched. No migration, and
the entry names the cost: every future comparison is a new chance to forget. The surveys found **34**
places where two paths meet. It is also **insufficient on its own**: the live reproduction proved the
split is created **at the add**, before anything compares, so a comparison-only repair leaves every
person who already has two rows split forever with no surface that would ever merge them.

**(c) A case-insensitive identity** — a generated column, a collation, a normalised key beside the
display path. It keeps what the person typed and compares canonically, and it owes the same migration
questions as (a), plus a schema change, plus a contract-baseline diff. And **a collation is
case-folding wearing a schema** — SQLite's `NOCASE` is ASCII-only and knows nothing about the volume,
which makes it wrong on a case-sensitive volume and wrong on any non-ASCII name. It is refusal 0.1 in
SQL.

**(d) THE DECISION: the identity question is asked ABOVE the string, at one door, by the filesystem.**

`addProject` stops asking *"is there a row whose `path` column equals this string"* and starts asking
*"is there a row that names this folder"*. If one does, it returns **that row, unchanged** — its uuid,
its spelling, its sessions, its layouts, its tab. Nothing is written, nothing is re-spelled, and the
second tab is never minted. `upsertProject` and `getProjectByPath`
(`src/main/manifest/projects-repository.ts:62-78`) stay byte-exact and **unchanged**, because the
identity question is asked above them, in `addProject`, where the disk is already being touched
(`isDirectory(abs)` at `src/main/sessions/core.ts:2892`).

```
addProject(path):
  abs = resolvePath(path)                       # unchanged, still path.resolve
  refuse unless isDirectory(abs)                # unchanged
  existing = byte-exact getProjectByPath(abs)   # the fast path: one SELECT, no syscall
          ?? first LOCAL row r, in listProjects order, with sameFolder(r.path, abs) === 'same'
  if existing: clearProjectTabClosed({ path: existing.path }); return existing
  ... otherwise today's insert, with today's spelling, unchanged
```

**Why (d) answers 273's objection instead of ignoring it.** 273 refused (a) because the stored path is
a durable identity in four sites. It still is. (d) does not touch it. The four sites keep comparing a
stored spelling against the same stored spelling, which is a comparison that has always worked, and
the **only** thing that changes is that there is now exactly one stored spelling per folder to
compare. `sameTarget`, `targetKey`, `WHERE project_path = ?` and the `UNIQUE` constraint are all
correct as written, and rule 18 pins them as unchanged so a later round does not "finish" them.

**Cost.** The fast path is one `SELECT` and zero syscalls, which is what happens on every add of a
folder spelled the way it was first opened. A miss walks the local rows at two `statSync` each — 9
rows and roughly 45 µs per stat on the operator's machine, so under a millisecond, once per project
add, on a gesture that already stats and already opens SQLite.

**Layer 2's half of the same decision: a channel answers in the spelling its caller asked with.**
`fs:readDir` already does (`src/main/fs/ipc.ts:208` resolves the caller's `dirPath` and composes each
child onto it), which is exactly why the file tree is internally consistent and why every defect sits
where the tree's spelling meets main's resolved one. The mutation verbs are made to match. This is not
a weakening: main still resolves internally and still proves containment against `realRoot`, and
Phase 273 already made the caller-spelled absolute form admissible on re-entry, so the path handed
back is re-proved by `resolveOpenProjectRoot` + `resolveInsideRoot` the next time it is used.

---

## 5. Whether a migration ships — **NO**

**No migration ships. There is nothing to interrupt and nothing to roll back.**

Three reasons, in order of weight.

1. **It cannot be applied atomically, because it spans a boundary main cannot cross.** Any migration
   that re-spells or merges must move nine localStorage record sets in the renderer as well as four
   manifest columns in main. `src/main/recents/store.ts:13-14` exists precisely because main cannot
   read localStorage. A half-applied migration leaves a person whose manifest says `Source` and whose
   split layout, tree expansion, editor width, recents, history scope, Context agent choice and eight
   SCM collapse keys all still say `source` — **every one of them silently defaulting, with no error**
   — which is a worse state than the split it set out to fix. A merge is worse again: `gmux.tabOrder`,
   `gmux.activeProject`, `gmux.sidebarView` and `gmux.filesCollapsed` are keyed by project **uuid**,
   so the losing row's entries orphan on the other side of the same wall.
2. **The measured population is zero.** Read read-only from a **copy** of the operator's live
   manifest: 9 project rows, **0 folders holding more than one row**, 0 session spellings that resolve
   to an open project under a different spelling, 0 duplicate symbol or arch roots, and `realpath`
   equals the stored spelling for all nine. Every one of his nine folders is on a case-folding volume
   (probed at 15–355 µs each, two stats, no write), so the defect is **latent, not active**. Shipping
   an irreversible durable write over a person's manifest, at app open, without asking, driven by a
   heuristic, for a population measured at zero, is the shape this repository's machine-discipline
   rules exist to prevent.
3. **The producer fix makes the migration unnecessary going forward.** After rule 1 no second row can
   be minted, so the population cannot grow.

### What a person who already has two rows gets

**The split stops growing. It does not heal.** Stated plainly so nobody reads a green gate as a heal.

- Their two tabs stay two tabs. Their sessions stay divided.
- **Re-opening either spelling now lands on the SAME one of the two rows, every time** (rule 2 fixes
  the order), so the second tab stops being re-created and one tab is focused. This is the one thing
  that gets better for them without a write. Which of the two it is comes out of `ORDER BY name ASC`
  and is therefore the OLDER row only when the two rows share a basename, which is the reporter's
  shape; see rule 2 for the shape where it is the alphabet instead. Nothing turns on it — both rows
  name the same folder — but the phase is not allowed to claim age and deliver alphabet.
- **They must NOT "just close the duplicate tab."** The live reproduction measured what that does:
  closing the duplicate removed its project row, left its sessions in the manifest at the other
  spelling with a `closedProject` stamp, still running in tmux, still resumable — **and drawn
  nowhere.** Restore reproduced the amputation rather than healing it. The close dialog says *"Its
  sessions keep running and reappear when you reopen it"*, which is **false for a duplicate row**,
  measured. That sentence becomes true again once no duplicate row can exist, which is why §10.5
  leaves the copy alone.
- **The product tells them**, in the cheapest admissible way: rule 8's log line, written once at
  manifest open, naming the folder and both spellings and the volume's answer, and nothing else. No
  new surface, no dialog, no badge — a new user-facing surface would earn a native-menu obligation and
  a design pass, which a durability phase does not pay for on a population of zero.
- **The CHANGELOG entry says it in a person's words**: opening one folder under two spellings no
  longer makes two tabs; if you already have two, they stay two for now.

**The detector ships even though the heal does not.** `duplicateFolderGroups` is a pure function with
a gate (rule 21), so a later phase that decides to heal inherits proved detection instead of
re-deriving it. That is the handoff, and it is named in the "what is NOT in this phase" section of the
backlog entry this phase appends.

---

## 6. The remote question

**Out of scope, and here is why that is safe rather than merely declared.**

`remote_projects` keeps `UNIQUE(machine_id, path)` byte-exact (`src/main/manifest/schema.ts:459-471`)
and nothing about it changes. `sameFolder` is **never asked about a remote target**; rule 6 makes that
a gate assertion, and the guard is `isLocalTarget`.

The safety argument, in three steps:

1. **We cannot ask that machine.** `src/main/manifest/codecs.ts:163-165` already states the rule that
   no local `existsSync` may run against a far path, and `harvest/remote.ts:52` says in prose that it
   never realpaths because the path belongs to another machine. There is no `stat` to take, so there
   is no dev+ino to compare.
2. **Byte-exact is the conservative answer, not the lazy one.** A far side may be Linux, and Linux is
   always case-sensitive. Byte-exact never merges two folders that might genuinely be different. The
   cost is that a person who opens the same far folder under two spellings gets two tabs, which is
   **today's behaviour, unchanged**, so nobody regresses.
3. **Applying this phase's rule there by symmetry would be the data-loss direction.** The storage
   sweep names this explicitly, and so does the entry. A later round must not "finish" remote by
   analogy.

The survey looked for a comparison that crosses a local path against a remote one and **found none**:
`remote-rehome.ts`, `remote-arch.ts:504` and `project-counterpart.ts` all compare far paths to far
paths. The single `toLowerCase()` the sweep found (`project-counterpart.ts:166,172`) is on a **DNS
hostname**, which is correct and is not a path; rule 19's gate carries it as its one named exception.

If remote is ever wanted, the mechanism is named and not built: the frozen `dir-list` script could
report the far `stat`, and the far side's own identity would answer the same question the same way.
That is its own entry.

---

## 7. The rules

Each is one sentence, each names its file, and each is assertable. Rules 1–12 are IDENTITY's, 13–18
are SPELLING's, 19–25 are GATE's.

**The identity door**

1. `src/main/sessions/core.ts`'s `addProject` returns an existing local project row whenever
   `sameFolder(row.path, abs)` answers `'same'`, and mints a new row only when no row does.
2. When more than one local row answers `'same'`, `addProject` returns the **first in
   `listProjects()` order**, deterministically. **THE FIX ROUND NARROWED THIS CLAIM.** That order is
   `SELECT * FROM projects ORDER BY name ASC` with SQLite's default BINARY collation, so it is an
   alphabet, not an age. Where the case difference is ABOVE the leaf — `~/source/proj` against
   `~/Source/proj`, which is the reporter's shape — both rows are named `proj`, the key ties, and the
   rows come back in rowid order, which is insertion order, which is the oldest row; driven, two rows
   sharing the basename `proj` came back oldest first. Where the case difference is IN the leaf —
   `<b>/split` against `<b>/Split` — the names do not tie and `'S'` (0x53) sorts before `'s'` (0x73),
   so the row inserted SECOND comes back first; driven through the shipped repository. Every row in
   the group names one folder, so the choice decides which of two tabs a person already had is
   focused and nothing else.
3. `addProject` never writes, never re-spells and never deletes a row on the found path; it clears the
   tab tombstone for the **found row's own** spelling (`src/main/sessions/core.ts:2909`) and returns.
4. `src/main/manifest/projects-repository.ts`'s `upsertProject`, `getProjectByPath` and the
   `ON CONFLICT(path)` clause stay byte-exact and **textually unchanged**; the identity question is
   asked above them and never inside the SQL.
5. `src/main/fs/folder-identity.ts` is the only module in `src/main` that answers whether two paths
   name one folder, and it answers by `st.dev` and `st.ino` and by a byte-equality fast path, never by
   any other comparison of two strings.
6. `sameFolder` is asked only about paths on **this** Mac; a remote target never reaches it, and
   `src/main/sessions/core.ts`'s remote add path is unchanged.
7. `sameFolder` answers `'unknown'` — never `'different'` — when a `stat` fails with anything but
   `ENOENT` or `ENOTDIR`, and no caller in this phase acts on `'unknown'`.
8. At manifest open, `src/main/sessions/core.ts` writes **one log line per duplicate group** through
   the existing `getLog` (`core.ts:216`), naming the folder, both spellings and `volumeFoldsCase`'s
   answer, and writes **nothing at all** when there are no duplicates.
9. `volumeFoldsCase` walks up by `dirname` past a component that does not exist and past a component
   with no cased letter, stops at `/`, and answers `'unknown'` rather than guessing.
10. `src/main/fs/folder-identity.ts` writes no file, creates no directory, spawns no process and opens
    no handle; its only syscalls are `statSync` and `realpathSync.native`.
11. `canonicalPathSync` is the one door for synchronous canonicalisation in the owned domain, and the
    five sites that call a `realpath` for its canonical answer go through it:
    `src/main/manifest/harvest/watch.ts:139`, `src/main/manifest/harvest/stores.ts:358`,
    `src/main/manifest/reconstruct.ts:829`, `src/main/watcher/repo-watcher.ts:208` (and `:466`, `:473`),
    `src/main/shell/arrival.ts:70` and `:80`, `src/main/overview/reader/resolve.ts:68`.
12. `src/main/overview/reader/paths.ts`'s `isUnder` tests the token against **both** the stored root
    and its canonical form, byte-exactly on each, and folds nothing.

**The answer spelling**

13. `src/main/fs/file-ops.ts`'s `entry()` composes `path` from the **root the caller named** and
    `relPath` from `realRoot`, so every `FsOpEntry` this module returns is spelled under the caller's
    own root.
14. Every one of the fifteen `entry()` call sites in `src/main/fs/file-ops.ts` passes the caller's
    root; none composes an `FsOpEntry` by hand.
15. Containment is unchanged: `resolveOpenProjectRoot` and `resolveInsideRoot` are called in the same
    order with the same arguments, and `realRoot` remains the value every guard is asked about.
16. `src/shared/path-doors.ts`'s `PathDoorAnswer` gains **one optional additive field** carrying the
    answer re-spelled under the caller's literal base; `path` keeps its current value byte for byte so
    every `conformance:pathdoors` ruling stays true.
17. `src/renderer/terminal/path-links.ts` opens the re-spelled field when it is present and the
    existing `path` otherwise, and `src/main/fs/path-door.ts` populates it only when the real path is
    inside the real base.
18. `src/renderer/context/open-detail.ts` never produces an absolute `relPath`: when the prefix test
    misses, the open is refused with a named reason rather than silently carrying an absolute path
    onto a tab.
19. `src/shared/workspace-target.ts` **does not change**, and gains one comment recording that
    `sameTarget` and `targetKey` are correct once one folder has one row.

**The gate**

20. `build/p274/conformance-samefolder.mjs` imports the **shipped** `src/main/fs/folder-identity.ts`,
    never a copy, and asserts the §8 table in the column `volumeFoldsCase` names for the volume it is
    running on.
21. The gate asserts `duplicateFolderGroups` over planted fixtures, including a group of three and a
    group whose folder has been removed mid-run.
22. `build/p274/measure-volumes.mjs` creates, attaches and **detaches in a `finally`** a
    case-sensitive APFS image with `hdiutil create -size 20m -fs "Case-sensitive APFS"` (no sudo),
    removes the `.dmg` in the same `finally`, and runs the §8 table's sensitive column against the
    shipped module; it is **not** in the commit battery, exactly as `conformance:watcher:cap` is not.
23. The gate asserts, over `src/main/fs/**`, `src/main/manifest/**`, `src/main/sessions/**`,
    `src/main/watcher/**`, `src/main/shell/**` and `src/main/overview/**`: **no bare `realpathSync(`
    call**, **no `toLowerCase`, `toUpperCase`, `localeCompare` or case-insensitive regex applied to a
    path**, and **no `.normalize(` on a path**, with a derived file set and a floor so the domain
    cannot be shrunk to make the gate green.
24. `build/p274/probe-p274.mjs` is one Electron through `build/electron-run.mjs` with a scratch
    profile, a scratch `HOME` and its own tmux socket, ended in a `finally`, and it drives every claim
    in §11.2 in **one** session.
25. The gate ships **one ablation per rule above**, each red on the rule that owns it and green on
    every other, and the ablation for rule 13 must redden the tree's create-and-open step rather than
    only a unit assertion.

---

## 8. The fixture table

Every shape from the shape survey, with the expected answer on both kinds of volume, before and
after. **Before** means what today's `addProject` does: two byte-different strings become two rows.
**After** means `sameFolder`'s answer and the number of rows. Rows marked *refused* never reach the
identity question because `isDirectory(abs)` at `src/main/sessions/core.ts:2892` rejects them first.

| # | shape | folding volume, before | folding volume, after | separating volume, before | separating volume, after |
|---|---|---|---|---|---|
| 1 | case: `RealName` vs `realname`, both real folders | 2 rows | `same` → 1 row | 2 rows | **`different` → 2 rows**, correct: two real folders |
| 2 | case: `RealName` real, `realname` asked, nothing created | 2 rows | `same` → 1 row | *refused* | *refused* |
| 3 | **case ABOVE the root** — `/b/Outer/M/proj` vs `/b/outer/M/proj` (**the reporter's exact shape**) | 2 rows | `same` → 1 row | *refused* | *refused* |
| 4 | unicode: made NFC `caf<U+E9>-proj`, asked NFD | 2 rows | `same` → 1 row | 2 rows | **`same` → 1 row** — a separating volume still folds normalisation |
| 5 | unicode: made NFD, asked NFC | 2 rows | `same` → 1 row | 2 rows | `same` → 1 row |
| 6 | unicode **and** case: made `Caf<U+E9>-Proj`, asked `cafe<U+301>-proj` | 2 rows | `same` → 1 row | *refused* | *refused* |
| 7 | trailing separator `/proj/` | 1 row (`path.resolve` strips it) | 1 row | 1 row | 1 row |
| 8 | doubled separator `/b//proj` | 1 row (`resolve`) | 1 row | 1 row | 1 row |
| 9 | `.` component `/b/./proj` | 1 row (`resolve`) | 1 row | 1 row | 1 row |
| 10 | `..` component `/b/a/../proj`, `a` a real directory | 1 row (`resolve`) | 1 row | 1 row | 1 row |
| 11 | `..` through a **symlinked** `a` | 2 rows | `same` → 1 row | 2 rows | `same` → 1 row |
| 12 | symlinked ancestor `/b/real/proj` vs `/b/link/proj` (**Phase 273's shape**) | 2 rows | `same` → 1 row | 2 rows | `same` → 1 row |
| 13 | `/tmp/x` vs `/private/tmp/x` | 2 rows | `same` → 1 row | n/a (machine-level) | n/a |
| 14 | **APFS firmlink** `/Users/g/p` vs `/System/Volumes/Data/Users/g/p` | 2 rows | **`same` → 1 row** — the row `realpath` alone would fail | n/a | n/a |
| 15 | firmlink **and** case together | 2 rows | `same` → 1 row | n/a | n/a |
| 16 | zero-width space appended (U+200B) | *refused* | *refused* | *refused* | *refused* |
| 17 | non-breaking space for space (U+00A0) | *refused* | *refused* | *refused* | *refused* |
| 18 | the real name holds U+200B, asked plain | *refused* | *refused* | *refused* | *refused* |
| 19 | a stored row whose folder has been **deleted**, vs a live folder | 2 rows | `different` → 2 rows, unchanged | 2 rows | `different` → 2 rows |
| 20 | a stored row on an **unmounted** volume | 2 rows | `different` → 2 rows, unchanged and stated as the accepted limit | 2 rows | `different` → 2 rows |
| 21 | a stored row the process may not `stat` (`EACCES`) | 2 rows | **`unknown` → 2 rows**, never a merge on a guess | 2 rows | `unknown` → 2 rows |

**Rows 1 and 4 together are the proof the design is right and a volume flag would have been wrong.**
On a separating volume row 1 answers `different` and row 4 answers `same`, from the same volume, in
the same run. Any design that asks the volume one question and infers the other gets row 4 wrong.

**Layer 2 fixtures**, driven over a real case-mismatched folder (disk `<s>/Proj`, opened as
`<s>/proj`, one inode), each measured at the parent first:

| # | gesture | at `30f4bd8d` | after |
|---|---|---|---|
| L1 | `fs:createFile` under the mis-spelled root | answers `<s>/Proj/sub/new.md` | answers `<s>/proj/sub/new.md`, `relPath` `sub/new.md` unchanged |
| L2 | New File from the tree, then look for the tab | tab exists at the `Proj` spelling, tree reports *no tab opened* | one tab, at the spelling the tree uses |
| L3 | Rename with a tab open on the file | *tab left pointing at the old path*; rename reported *did not land* | tab id, path and label move with the file |
| L4 | the 23-step tree battery | **6 of 23 pass** | 23 of 23 pass |
| L5 | a move that would overwrite | *no confirmation was raised — this would have clobbered* | the confirmation is raised and names the file |
| L6 | `.git` as a drag source and destination | *a .git drop was not refused* | refused on both |
| L7 | `[data-item-path]` after the verbs | `p274mops/inner/` drawn **twice** | drawn once |
| L8 | ⌘S on a file created from the tree | `fileInRepo` false → the **plain** door, auto-save refused | `fileInRepo` true → `fs:writeGuarded`, auto-save allowed |
| L9 | a terminal path link into the project | opens at the canonical spelling, unguarded | opens at the caller's spelling, guarded |

---

## 9. File ownership — disjoint, three builders

**The split is by LAYER, not by directory**, because the layers in §1 cut across `src/main/fs`,
`src/main/manifest` and `src/renderer`. The brief's directory split would have put
`src/main/fs/file-ops.ts` (layer 2) and `src/main/fs/folder-identity.ts` (layer 1) in the same hand
while separating `src/main/manifest/harvest/watch.ts` from the one-word rule it shares with
`src/main/overview/reader/resolve.ts`. Ownership is per FILE and no file appears twice.

### Builder A — IDENTITY (layer 1 and layer 3)

- `src/main/fs/folder-identity.ts` **(new)** — `sameFolder`, `volumeFoldsCase`, `canonicalPathSync`,
  `duplicateFolderGroups`.
- `src/main/sessions/core.ts` — `addProject` only, plus the one log call at manifest open.
- `src/main/manifest/projects-repository.ts` — **assigned so nobody else edits it; it does not change**
  (rule 4).
- `src/main/manifest/harvest/watch.ts`, `src/main/manifest/harvest/stores.ts`,
  `src/main/manifest/reconstruct.ts` — rule 11.
- `src/main/watcher/repo-watcher.ts`, `src/main/shell/arrival.ts` — rule 11.
- `src/main/overview/reader/resolve.ts` — rule 11; `src/main/overview/reader/paths.ts` — rule 12.
- `src/main/fs/__tests__/folder-identity.test.ts` **(new)**.

### Builder B — SPELLING (layer 2)

- `src/main/fs/file-ops.ts` — rules 13–15.
- `src/main/fs/path-door.ts`, `src/shared/path-doors.ts` — rules 16–17.
- `src/renderer/terminal/path-links.ts` — rule 17.
- `src/renderer/context/open-detail.ts` — rule 18.
- `src/renderer/editor/tab-menu.ts`, `src/renderer/editor/editor-menu.ts`,
  `src/renderer/editor/use-editor-menu.ts` — rule 18's other half, ADDED BY THE FIX ROUND because the
  build edited the first of these and this list did not name it. Rule 18 replaces an absolute path in
  `relPath` with the `''` the renderer already means "no repo-relative path" by, so every consumer of
  that field is part of rule 18. `tab-menu.ts` was updated; `editor-menu.ts` was not, and the editor's
  own right-click `Copy Relative Path` copied an empty string and toasted that it had copied a path.
  The three are listed together so a later round cannot update one and miss the others.
- `src/shared/workspace-target.ts` — rule 19, a comment and no code.
- `src/shared/fs-ops.ts` — the `FsOpEntry.path` doc comment at `:82-83` only.

### Builder C — GATE

- `build/p274/**` **(new)** — `conformance-samefolder.mjs`, `measure-volumes.mjs`, `probe-p274.mjs`,
  the fixture table as data, the ablations.
- `package.json` — the `scripts` block only: `conformance:samefolder`, `measure:p274-volumes`,
  `probe:p274`.
- `build/assert-electron-teardown.mjs` — `HELPER_USER_FLOOR` only (obligation 1 below).
- `CLAUDE.md` — one row in the path-triggered gate table.
- `docs/BACKLOG.md` — the phase's own entry and its one running-log line.
- `CHANGELOG.md` — the entry, in the house style, two items at most.

**Integrator reconciles** `src/shared/` if both B and C need it; `src/shared/*` is append-only during
parallel work.

---

## 10. What is NOT in this phase, each with its reason

1. **No migration, no heal, no merge tool.** §5.
2. **Remote.** §6.
3. **`src/main/shell/shim.ts:102`'s `pwd`.** It is the logical path, `pwd -P` is the physical one, and
   the reporter's own reproduction is literally that pair. It is **out** because with rule 1 the shim
   can no longer split anything — a `tortie .` from a wrong-case shell now lands on the existing row —
   so what remains is which spelling a **first** open stores, and changing that changes what the
   person sees, which refusal 0.3 forbids. It becomes its own entry.

   **AND THE FIX ROUND HAS TO SAY THAT THE OTHER DOOR DID MOVE.** `src/main/shell/arrival.ts:79` was
   changed from `fs.realpathSync` to `canonicalPathSync` in this phase (rule 11), so a Finder, Dock or
   "Open With" arrival now reaches `addProject` in the DISK's case. That is the same question this
   item defers for the shim, answered one way at one door. It is left as built rather than reverted,
   for two reasons: Finder supplies a canonical path already, so the change is invisible for the
   gesture that dominates the door; and rule 1 protects every SECOND open, so the row a person already
   has, and its spelling, still win. What it decides is which spelling a **first** open from that door
   stores. Phase 274.1 must be read knowing this, and its entry now says so.
4. **`src/main/context/scan.ts:151`'s `~/.claude.json` lookup.** It is the same shape and it is the
   reporter's incident 1 in our product: a mis-spelled project reads local-scope MCP servers and the
   whole approval state as empty, silently. It is **out** because the far side's spelling is
   **unmeasured** — Claude Code writes that key from the cwd we launched it with, which is
   `sessions.cwd`, which is the person's spelling, so canonicalising our lookup could break a lookup
   that works today. Its own entry, and the measurement to take first is named: read the key shapes in
   a real `~/.claude.json` against the cwds we launched with.
5. **The close dialog's sentence.** *"Its sessions keep running and reappear when you reopen it"* is
   false for a duplicate row, measured. It becomes true again once no duplicate row can exist, so the
   copy is correct as written and is left alone.
6. **U+200B and U+00A0 in a name.** §3. A one-line deferred entry: if a refusal ever quotes a path,
   invisible characters should be escaped, because two visually identical strings in one sentence
   help nobody.
7. **The other 20-odd `realpathSync` sites** — `specstory/`, `skills/`, `credentials/`, `logins/`,
   `harness/`, `agents/detection.ts`, `updates/shipit-state.ts`, `machines/remote-smoke.ts`. Each
   compares a path against a value composed the same way, each belongs to a domain with its own
   conformance gate, and none produces a measured defect. Rule 23's domain deliberately excludes them,
   and the floor makes a later widening a deliberate act.
8. **The 34-site survey's long tail** — the symbol index's `(repo_path, rel_path)` primary key
   (`src/main/symbols/persist.ts:75-93`), the eight SCM collapse keys, `gmux.editorWidth`,
   `gmux.treeOpen.*`, `skill-pins.json`. Every one of them splits only when two project rows exist,
   and rule 1 is what stops two project rows existing. They are named here so the verifier can check
   that claim rather than take it.
9. **`src/main/arch/db.ts:96-102`'s `path:` fallback**, which is byte-exact when `stat` throws, so a
   key written while a volume was unmounted does not merge with the same folder's later key. Named,
   not fixed: `arch.db` is a cache and a miss costs a re-derivation, not a person's work.
10. **Phase 273's gate, vocabulary and `conformance:containment`.** Refusal 0.4.
11. **`src/main/manifest/reconstruct.ts:980-987`'s `new Set(rows.map((r) => r.projectPath))` into
    `upsertProject`.** THE FIX ROUND NAMES IT, because rule 4 says "the identity question is asked
    above them, in `addProject`" and a later round reading that would believe `addProject` is the only
    producer of `projects.path` rows. It is not: the "Rebuild the Session List…" menu item is a
    shipping surface that writes project rows through a byte-exact `Set`. It is **out** and it is
    bounded, which is why it is a line here and not code: the recipe's `projectPath` comes from
    `session.project_path`, which came from a project row in the first place, so reconstruct can only
    REPRODUCE a split that already exists rather than mint a new one — which §5 already accepts ("the
    split stops growing, it does not heal"). `fill.projectPath` is the other input and is unreachable
    from the shipping dialog.

---

## 11. Proof, run rather than read

**Tier 3 budget: the gates, real data or a per-row matrix, TWO independent methods one of which is an
attack, and a fix round on any needs_work.**

### 11.1 The parent measurement — mandatory

Every defect this phase claims to fix is driven at **`30f4bd8d`** first and shown failing, then shown
fixed. The §8 layer-2 table already carries the parent readings from the live reproduction; the
identity table's parent readings are the two-row inserts. **A claimed defect that cannot be made to
fail at the parent is struck from the phase.**

### 11.2 The one app run — `probe:p274`, one Electron, one session

Scratch profile, scratch `HOME`, its own tmux socket, everything ended in a `finally`. It drives, in
order: open a folder by its disk spelling; open it again by the flipped spelling and assert **one**
tab and **one** project row in the manifest read directly; make a session under each spelling and
assert both appear in the one tab's strip; close the tab and assert no session is orphaned; relaunch
and assert restore draws every session; then the L1–L9 table from §8 in the same window. It asserts
the volume folds case **first** and refuses to continue if it does not, exactly as the reproduction
did.

### 11.3 Independent method 1 — **the attack**, and it is on this spec's own ruling

Attack the claim that dev+ino cannot merge two folders that are genuinely different. On a mounted
case-sensitive image, with both `RealName` and `realname` real and distinct, try to make `sameFolder`
answer `'same'`. Then attack from the other side: try to make it answer `'different'` for one folder,
through a symlink chain, a firmlink, `/tmp`, an NFD name and a `..` climb through a symlinked
component. **And try the hard link.** `sameFolder` is asked about directories only and macOS does not
let an ordinary process hardlink a directory, but the attack must demonstrate that rather than assert
it, because two hard links to one **file** do share dev+ino and a later round that widened
`sameFolder` to files would be wrong. Every shape that answers `'same'` for two genuinely different
folders is a defect and the phase does not land.

### 11.4 Independent method 2 — **re-derive the duplicate detector by a different method**

Compute the duplicate groups over a **copy** of the operator's live manifest twice: once by dev+ino
and once by `canonicalPathSync` on both sides. Diff the two answers. They must agree on all nine rows
today. Then plant a firmlink-spelled row and re-run: **the two methods must now disagree**, with
dev+ino finding the duplicate and realpath missing it. A run where they never disagree has not
exercised the property that chose dev+ino over realpath.

### 11.5 The gates the paths earn

- Always: `npm run typecheck && npm run build && npm run test && npm run smoke:t1`, and the
  integrator's full battery.
- **New:** `conformance:samefolder`.
- **Path-triggered, and all of them because this phase touches their paths:** `conformance:save`
  (rule 13's whole point is that ⌘S reaches the guarded door), `conformance:redline-write`,
  `conformance:pathdoors` (rules 16–17), `conformance:containment` (rule 15 asserts it is unchanged),
  `conformance:overview` (rules 11–12), `conformance:derived` (rule 11 in `harvest/`),
  `conformance:watcher` (rule 11 in `watcher/`), `gate:contract` (to prove the baseline does **not**
  move), `gate:electron` and `gate:background` (rule 24).
- **Once per phase, not in the battery:** `measure:p274-volumes`, `probe:p274`, and `probe:p273` re-run
  to prove 273's repair is intact.

### 11.6 The two things a verifier must not accept

- A verdict whose evidence is only the builder's own checks re-run. The governing rule stands: **name
  the independent step.**
- A green `conformance:samefolder` on a folding volume alone. The sensitive column is half the table
  and `measure:p274-volumes` is the only thing that proves it against a real volume.

---

## 12. The obligations that ride along in the same commit

1. **`probe:p274` reaches `build/electron-run.mjs`**, so `HELPER_USER_FLOOR` in
   `build/assert-electron-teardown.mjs:202` rises from 134 to 135 in **this same commit**. Adding a
   script can never turn `gate:electron` red, so a floor left behind would let the new script be
   deleted again in silence.
2. **`gate:contract` must show no diff.** No channel, no sqlite column, no `gmux.*` key, no `GMUX_*`
   env name and no smoke mode changes. If a diff appears, something in this phase overstepped §4 and
   the phase stops rather than regenerating the baseline.
3. **`CLAUDE.md` gains one row** in the path-triggered gate table:
   `src/main/fs/folder-identity.ts`, `src/main/sessions/core.ts`'s `addProject`,
   `src/main/overview/reader/paths.ts` → `conformance:samefolder`, ~2 s, no Electron, no mount.
4. **`docs/BACKLOG.md` gains the full phase section** in the house shape, appended above THE RUNNING
   LOG, and **one line at the end of the running log**, newest last, never reordered.
5. **The deferred entries in §10.3, §10.4 and §10.6 are written down** as queued entries in the same
   commit, because a refusal that is not recorded is a refusal a later round will undo.
6. **THE NATIVE MENUS CHANGE AND THE PHASE BRIEF SAYS SO.** Added by the fix round, because CLAUDE.md's
   UI rules require it and this document did not carry the line. Rule 18's `relPath: ''` removes ONE
   ROW from TWO native menus, conditionally: `Copy Relative Path` is absent from the tab-strip menu
   (`src/renderer/editor/tab-menu.ts`) and from the editor's right-click menu
   (`src/renderer/editor/editor-menu.ts`) on a tab whose file is outside its project — a Context detail
   tab on `~/.claude/CLAUDE.md` is the shipped shape. Nothing is added, nothing is renamed, and every
   other tab keeps every row. The row is removed rather than greyed because before this phase it
   pasted an ABSOLUTE path out of a row labelled Relative, and after rule 18 it would paste nothing
   while saying it had succeeded. Refusal 0.3, "what the person SEES does not change", is about the
   spelling of the folder on the tab spine and is unchanged; this is the one deliberate exception and
   it is named here rather than left implicit.
