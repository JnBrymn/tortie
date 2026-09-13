# Phase 264 — a cached parse keeps the reason it was incomplete

**Subject.** `fix(arch): completeness travels with the bytes, not with the repository`
**First body line.** `Phase 264: a cached parse keeps the reason it was incomplete`
**Semver.** Patch.
**Parent.** `cb9c25c5`, worktree `/private/tmp/wt-p264`.
**Charter.** `docs/BACKLOG.md` "Phase 264", and audit 0.103.0 **R2** with its two-repository fixture.
**Tier 3.** Same shared-cache boundary as 263. Two independent methods, one an attack (below).

**Scratch that must never be committed.** The audit itself is present in the worktree as the
untracked file `audit-fixtures-AUDIT.md` (the 0.103.0 assessment). It is a reading copy of the
operator's own review. It is NOT committed. **The integrator deletes `audit-fixtures-AUDIT.md`
before the commit step**, and nothing under `src/` or `build/` imports from it. The committed proof
is a fixture Builder B writes from the audit's scenario, in the shape of the existing `p263-*`
tests, not a copy of the audit file.

---

## 0. The reproduction, run before anything was planned

The audit's two-repository scenario was built on the existing `p263-rig.ts` harness — the REAL
`SymbolExtractor` over the real grammars, the real `extractFile` seam, and a real `ArchStore` on
disk — and run in the foreground. A single scratch `arch.db` was shared by two fresh repository
directories, each holding the SAME bytes at the same path: a generated TypeScript file of 2,800,051
bytes, **above the parser's 2,097,152-byte cap (`MAX_INDEXED_FILE_BYTES`) so the extractor declines
it, and below the fact reader's 4,000,000-byte cap (`FACT_LIMITS.maxReadBytes`) so the reader does
buffer it and stores its line/path facts.** The stored `truncated` flag was read back from
`store.factStamps(repoKey)` after each scan.

```
$ npx vitest run src/main/arch/__tests__/p264-repro.test.ts --reporter=verbose
P264-REPRO bytes=2800051 repoA.truncated=true repoB.truncated=false
 ✓ R2 reproduction: truncated lost across repositories sharing one store 5937ms
```

Read it exactly. **Repo A**: the file is read (< 4 MB), not binary, grammar `typescript`, and on
first sight `hasFactsFor` is false, so it is queued; the worker declines the 2.8 MB file
(`extractFile` returns `null` at `src/main/symbols/extract.ts:283`, the worker skips it at
`worker.ts:135`), so the answer is `undefined` and `tree-facts.ts:480` sets
`q.link.truncated = true`; the line/path facts ARE written by `saveFacts`. Repo A reads
**`truncated: true`** and the disclosure would count one truncated file. **Repo B**, same bytes,
same path, same store: `hasFactsFor(oid, relPath)` now answers **true** off the `arch_fact` rows repo
A wrote (they are keyed `(oid, rel_path)`), so the reuse arm at `tree-facts.ts:412` runs;
`carried = factStamps.get(relPath)` is `undefined` because repo B has never linked this path, so
`tree-facts.ts:419` collapses to **`truncated: false`**. Repo B has not gained the missing call
list — it has LOST the sentence explaining why the list is missing.

The premise is confirmed at the parent with the shipping extractor and store. The scratch
`p264-repro.test.ts` was then deleted; `git status` is clean but for the untracked
`audit-fixtures-AUDIT.md` scratch. This SPEC file is `build/p264/SPEC.md`.

---

## 1. The reading, cited

### `src/main/arch/tree-facts.ts`

- **The reuse arm, `410`–`421`.** After the link is built with `truncated: false` (`409`), when
  `store.hasFactsFor(oid, file.relPath)` is true (`412`), the two carried fields are recovered from
  `carried = factStamps.get(file.relPath)` (`367`), which is **this repository's own previous link**:
  - `418` `link.wrapDigest = input.wrapperPass ? (carried?.wrapDigest ?? null) : null;`
  - `419` `link.truncated = carried !== undefined && carried.oid === oid ? carried.truncated : false;`
  With no `carried` in a second repository, `wrapDigest` collapses to `null` and `truncated`
  collapses to `false`. **`truncated`'s collapse is the defect** (a positive claim of completeness
  that was never established). §3 rules on `wrapDigest`.
- **The truthful write sites, from real worker answers** — untouched by this phase but named so the
  builder knows the fix flows through them:
  - `480` `q.link.truncated = file === undefined || file.callsTruncated === true;` (main parse path)
  - `718`, `747` the wrapper-pass reparse steps 1 and 3, each fed by a fresh worker answer.
  These are correct at their site; the reuse arm is the one place completeness is *reconstructed*
  rather than *measured*.
- **263's oid guards**, which this phase must not disturb: `476`
  (`if (file !== undefined && file.oid !== q.oid) continue;`, the worker-window guard) and `500`
  (`if (blobOid(buf) !== q.oid) continue;`, the reader-window guard). The completeness write in §2
  happens only on the path that passes BOTH.
- **`saveFacts` call sites**, the two places facts are recorded and therefore the two places the
  bytes-keyed completeness row is written in the same transaction: `425` (grammar-null / manifest,
  always complete) and `502` (the rule-read path, whose completeness is `q.link.truncated`).
- **`unreadLink`, `595`–`608`**, `truncated: false`, used for over-cap / binary / vendored files at
  `381`, `387`, `391`. These files return BEFORE `hasFactsFor`, so they never enter the reuse arm and
  they never call `saveFacts`. They are the "unread" state of §4 and are decided per repository from
  size/binary/vendor every scan — cheap and correct — so they need no bytes-keyed row.

### `src/main/arch/db.ts`

- **`hasFactsFor(oid, relPath)`, `1636`–`1650`.** Selects `arch_fact` by `(oid, rel_path)` first
  (bytes-keyed — answers across repositories), then falls back to `arch_fact_file` by `(oid,
  rel_path)` via `idx_arch_fact_file_oid` (`676`). This is why a truncated file with line/path facts
  is "reused" in repo B, and why a **complete-empty** file (no `arch_fact` rows) is NOT: it falls to
  the link, which is per-repo, so repo B re-parses it. §4.
- **`arch_fact_file` schema, `664`–`675`.** `PRIMARY KEY (repo_key, rel_path)` — a per-repository
  row. `truncated INTEGER NOT NULL DEFAULT 0` lives here. This is the error the schema's own comment
  forbids: a fact about the BYTES sitting on a per-repository row.
- **The governing comment, `636`–`646`** (beside `arch_fact_wrap`): "folding `arch_fact_wrap` into
  `arch_fact` for tidiness would put a repository-dependent row under a bytes-keyed primary key."
  `truncated` is the same rule inverted — a bytes-keyed fact under a repository-keyed row — and the
  fix restores the invariant by moving it to a `(oid, rel_path)` row.
- **The bytes-keyed precedent.** `arch_fact` (`650`, PK `(oid, rel_path, seq)`), `arch_decl` (`746`,
  PK `(oid, rel_path, seq)`) and `arch_fact_wrapper` (`678`, PK `(oid, rel_path, seq)`) are already
  keyed on the blob identity. The new completeness row follows their shape exactly.
- **263's migration `013-arch-fact-identity`, `920`–`930`**, and its comment `875`–`919` (which
  literally says "Phase 264 adds `014-…` beside this one and never edits it"). It `DELETE`s five
  derived tables: `arch_fact`, `arch_fact_file`, `arch_fact_wrap`, `arch_fact_wrapper`, `arch_decl`.
  264's migration extends this list, it does NOT edit 013.
- **`factStamps(repoKey)`, `1607`–**, reads `truncated: row.truncated === 1` off `arch_fact_file`.
  This reader stays; the link's `truncated` column is still written (from the fixed source) so
  `regionDenominators` keeps working with no change of its own. The link becomes a faithful copy of
  the bytes-keyed truth rather than a guess.
- **`saveFacts`, `1659`–`1679`**, one transaction that drops and re-inserts `arch_fact` for
  `(oid, relPath)`. This is where the completeness row is written, atomically with the facts.
- **The migration runner, `src/main/db/sqlite.ts:410`–`447`**: name-keyed, each migration atomic
  with its bookkeeping row. Adding `014` is one array entry.

### `src/main/arch/check-coordinator.ts`

- **`regionDenominators`, `726`–`745`.** Reads `archStore().factStamps(repoKey)` and, per region,
  counts `if (stamp.truncated) truncated += 1;` (`741`). This is the surfaces-list disclosure "read
  N of M files" plus the truncated count (Phase 258). In repo B at the parent, every `truncated` is
  false, so the disclosure silently reports full coverage. This is the downstream consumer the app
  run must drive and confirm still NAMES incomplete coverage after the fix.

---

## 2. The repair (Builder A)

### 2a. A bytes-keyed completeness row

Add a derived table keyed on the blob identity, in the same shape as `arch_decl`/`arch_fact_wrapper`:

```sql
CREATE TABLE IF NOT EXISTS arch_fact_scan (
  oid       TEXT    NOT NULL,
  rel_path  TEXT    NOT NULL,
  truncated INTEGER NOT NULL,          -- 1 iff the parse of THESE bytes was incomplete
  PRIMARY KEY (oid, rel_path)
);
```

Name it as Builder A judges best (`arch_fact_scan` / `arch_fact_read` / `arch_fact_complete`); the
SPEC uses `arch_fact_scan`. The row records, for the bytes at a path, whether the parse that read
them was complete. It is written for EVERY file that reaches `saveFacts` — including the
complete-empty file that writes zero `arch_fact` rows — so that "these bytes were read, completely,
and found nothing" is a recorded state distinct from "never read". This is what lets §4's four
states be told apart across repositories.

### 2b. Write completeness atomically with the facts

Extend `saveFacts` to take the completeness of the parse and write the `arch_fact_scan` row inside
the SAME `immediateTransaction` that writes the facts, e.g.
`saveFacts(oid, relPath, facts, { truncated })`. Both call sites pass what they already know:

- `tree-facts.ts:425` (grammar-null / manifest): `{ truncated: false }` — these are complete.
- `tree-facts.ts:502` (rule-read path): `{ truncated: q.link.truncated }` — the value computed at
  `480` from the worker's own answer, on the path that has already passed both 263 oid guards.

Atomicity matters: a crash between a facts write and a separate completeness write would leave facts
with no completeness record, which the reader in 2c must then treat conservatively — but folding the
write into one transaction removes the window entirely, matching how `saveFacts` already writes its
own rows.

### 2c. The reader, and the four-state distinction

Add a store reader `factScan(oid, relPath): { truncated: boolean } | undefined` (undefined = no row
recorded for these bytes at this path). The reuse arm at `tree-facts.ts:412`–`421` changes so that
completeness comes from the bytes, not from `carried`:

- Read `store.factScan(oid, file.relPath)`.
- **If present**, set `link.truncated = scan.truncated`. This is the fix: repo B recovers repo A's
  `truncated: true` by byte identity, with no link of its own.
- **If ABSENT while `hasFactsFor` is true** (an unknown-completeness state — a store written before
  this migration by a path 014 did not clear, a partial write, a future producer), treat it
  conservatively per the charter: **do not reuse with a fabricated flag — fall through and re-parse
  the file** (queue it exactly as the non-reuse path does). Never default to `false`. Name this in a
  comment as the conservative arm; it is the audit's "retain an incomplete outcome or reparse".

`hasFactsFor` should also consult `arch_fact_scan` so the complete-empty file (state 4) is recognised
as *read* by byte identity in a second repository and is not re-parsed on every fresh repo. Keep the
existing `arch_fact` / `arch_fact_file` checks as they are (after 014 they never disagree; the extra
check only ADDS the empty-complete case). Confirm this does not create a warm-scan retry loop (§5,
Builder B's loop test).

### 2d. The migration `014-…`, extending 013

Add one entry to `MIGRATIONS` AFTER `013-arch-fact-identity`, in 013's own shape. It:

1. `CREATE TABLE IF NOT EXISTS arch_fact_scan (…)` as in 2a.
2. Invalidates any existing links that may carry a false completeness. The safe, precedent-matching
   form is to **drop the same derived rows 013 drops** so the first post-migration scan re-parses
   and writes `arch_fact_scan` rows atomically — there is then never a state where facts exist with
   no completeness record:
   ```sql
   DELETE FROM arch_fact;
   DELETE FROM arch_fact_file;
   DELETE FROM arch_fact_wrap;
   DELETE FROM arch_fact_wrapper;
   DELETE FROM arch_decl;
   ```
   The comment states, as 013's does, exactly which tables and why, and that NOTHING else is touched:
   not `arch_repo`, not `arch_import*`, not `arch_tree_file`, not `arch_camera`/`arch_layout`, not
   `arch_verdict*`, and **not one semantic table** (`arch_claim`, `arch_claim_cite`,
   `arch_claim_rate`, `arch_journey`, `arch_semantic_run` — a model's sentences, which cost tokens).
   No source file, no manifest, no path under `<userData>/gmux`.
3. The comment records that `truncated` was a bytes fact on a per-repo row, that this migration is
   name-keyed and 013 is never edited, and that the re-parse is the price (≈1.25 ms/file, 013's own
   measured figure) of a clean completeness record.

`gate:cache-policy` must stay green: `arch_fact_scan` is a derived Architecture table and the
migration deletes only derived rows.

### 2e. The `wrapDigest` ruling — write it down, do not "finish it off"

**`wrapDigest` stays as `carried?.wrapDigest ?? null` and null is the CORRECT conservative answer.**
It is NOT the same bug as `truncated`, and it must NOT be moved to a bytes-keyed row. The reasons,
which Builder A writes as a comment at `tree-facts.ts:418` and the committer puts in the body:

1. **`wrapDigest` is not a fact about the file's own bytes.** The schema comment at `db.ts:636` says
   it plainly: a `+wrap` fact on a file exists because ANOTHER file declares a wrapper, so it is
   keyed on the file under a digest of the closed wrapper map, and it legitimately DIFFERS between
   repositories that hold different other files. A bytes-keyed row would be wrong for it in the same
   way a repo-keyed row is wrong for `truncated`. So it cannot move where `truncated` moves.
2. **`wrapDigest` is a cache KEY; `truncated` is a RESULT.** `null` means "no cached wrapper map is
   known for these bytes here" → the wrapper pass's step 1 (`tree-facts.ts:699` `held.filter(h =>
   h.digest === null)`) RE-PARSES the file for its wrapper arm. A missing key forces recomputation:
   fail-SAFE. `truncated: false` means "the parse was complete": a missing result defaulting to
   `false` asserts a positive completeness that was never established: fail-UNSAFE. The asymmetry is
   the finding, and it is stated rather than silently equalised.

So the phase fixes `truncated` and rules explicitly that `wrapDigest` is already correct. Both lines
are addressed; neither is left unmentioned.

**Builder A owns exactly:** `src/main/arch/db.ts` (the `arch_fact_scan` table, the `014` migration,
`saveFacts`'s completeness argument, the `factScan` reader, the `hasFactsFor` extension) and
`src/main/arch/tree-facts.ts` (the reuse arm reading `factScan` with the conservative-reparse arm,
the two `saveFacts` call sites passing completeness, and the `wrapDigest` comment). These two files
are one data-flow and are owned by one builder to keep it coherent. Builder A touches no other file.

---

## 3. The four states, defined and each mapped to storage

The audit asks that four outcomes be defined and told apart. After the repair:

| State | What happened | Storage signature at `(oid, relPath)` | Where decided |
| --- | --- | --- | --- |
| **No facts / unseen** | These bytes at this path were never read | no `arch_fact_scan` row (and no `arch_fact` row) | reuse arm not reached; file is parsed |
| **Unread** | Seen but declined before any parse: over 4 MB, binary, or vendored | no `arch_fact_scan` row; `arch_fact_file` link with `lang`/`vendored` set, `truncated:false` | `unreadLink`, `tree-facts.ts:381`/`387`/`391`, before `hasFactsFor` — recomputed per repo from size/binary/vendor |
| **Truncated** | Content read, parse incomplete: file over 2 MiB (declined) or worker call ceiling hit | `arch_fact_scan` row `truncated:1`; usually `arch_fact` line/path rows present | `saveFacts(..., {truncated:true})` at `502`; reuse arm recovers it by identity |
| **Complete empty** | Content fully parsed, zero facts found | `arch_fact_scan` row `truncated:0`; zero `arch_fact` rows | `saveFacts(..., {truncated:false})` with an empty list; `hasFactsFor` true via `arch_fact_scan` |

The conflation the audit names: at the parent, states **truncated** and **complete-empty** are told
apart only by the per-repo link's `truncated` flag, which a second repo does not have — so the reuse
arm collapses both to "complete" (`false`). And **complete-empty** vs **unseen** are conflated
because a complete-empty file writes no `arch_fact` row and `hasFactsFor` falls to the per-repo link.
The `arch_fact_scan` row is the bytes-keyed record that separates all four.

---

## 4. Builder B — the proof, run rather than read

Builder B owns the tests and the `conformance:facts` ablations. Builder B touches NO `src/main/arch`
production file (that is Builder A's), only test files under `src/main/arch/__tests__/` and
`build/conformance-facts.mjs` (+ any fixtures it needs). The two builders' file ownership is
disjoint.

### 4a. The committed two-repository fixture (the audit's own)

A test in the shape of `p263-shared-cache.test.ts`, using `p263-rig.ts` helpers (the real extractor,
real seam, real on-disk `ArchStore`) — do NOT stub the extractor or store; the audit names an
in-process fabrication as insufficient. A file **above 2,097,152 and below 4,000,000 bytes** at one
path, scanned in two fresh repositories over ONE shared store. Assertions:

1. Repo A stores `truncated: true` (`factStamps('A').get(relPath).truncated`), truncated-file count 1.
2. **Repo B stores `truncated: true`** for the same bytes and path — the fix. Count 1, not 0.
3. **After `store.close()` and reopening the `ArchStore` on the same db file**, a third fresh repo C
   still reads `truncated: true`. This is the arm that catches a fix living only in memory — the
   `arch_fact_scan` row must survive a reopen. (Set a generous per-test timeout; the reproduction
   ran ~6 s because the reader buffers 2.8 MB twice.)

### 4b. Complete-empty

A fully-parsed file that yields zero facts (an empty or comment-only source file within the parser's
cap). Assert: repo A records the read (state 4, `truncated:0`, zero `arch_fact` rows); repo B, same
bytes, is recognised as read-and-complete by byte identity (via `arch_fact_scan`) and is NOT
re-parsed on every fresh open, and its `truncated` reads false. Distinguish it in the assertions from
the "unseen" state (a path with no scan row at all).

### 4c. Unavailable-parser

The truncated case IS the unavailable-parser case at the file level (the extractor returns `null`
for the over-2-MiB file, exactly as it would for a grammar it cannot load), so 4a's big file already
drives "the parser declined; the result is truncated". Add an explicit small-file arm if a cleaner
decline is available, but do not move the 2 MiB cap to force a parse — that hides the finding.

### 4d. Migration-from-parent

Open an `ArchStore` on a db that has `013` applied but not `014` (or hand-craft one holding
`arch_fact` + `arch_fact_file` rows with `truncated:0` and no `arch_fact_scan` table), then run the
current `ArchStore` constructor so `014` applies. Assert: `014` creates `arch_fact_scan`, the
pre-existing rows that might carry false completeness are invalidated (no stale `truncated:0`
survives as an authoritative completeness claim), and the first scan afterwards writes the new rows.
Assert the semantic tables are UNTOUCHED by `014` (plant an `arch_claim`/`arch_journey` row and show
it survives) — this is the blast-radius arm.

### 4e. Warm second scan does not loop

Scan a repository twice with no change between (the "warm" path). Assert the second scan does NOT
re-parse the truncated file (it reuses via `factScan`), i.e. the conservative-reparse arm fires only
on genuinely unknown completeness, never on a known-truncated file. This is the failure mode a
conservative default invites and the audit calls out; drive it directly and pin that `factsReused`
counts the file rather than `factsRead`.

### 4f. `conformance:facts` ablations

`src/main/arch/db.ts` and `tree-facts.ts` are on the `conformance:facts` path. Add a Phase 264 rule
block (a new lettered group beside 263's F1–F4) with one ablation per clause shipped, each red under
ablation and named:

- The reuse arm reads `factScan`, not `carried`, for `truncated` — ablate back to `carried?.truncated
  ?? false` and the two-repository pin goes red.
- The completeness row is written in `saveFacts`'s transaction — ablate the write and the reopen pin
  goes red.
- The conservative arm re-parses on unknown completeness — ablate to "reuse with false" and the
  migration-from-parent / unknown pin goes red.
- `014` invalidates pre-existing links — ablate the migration's deletes and the migration-from-parent
  arm goes red.

Do not weaken 263's F1–F4 or any existing rule. If the rule/ablation count printed in the gate's
header is asserted anywhere, update it in the same commit and say so.

---

## 5. Tier, independent methods, and the app run

**Tier 3.** Independent methods, per `docs/BACKLOG.md` Phase 264:

1. **Run over real data.** Drive the two-repository reuse over one of THIS repository's own large
   real files (or a real file grown past 2 MiB), not only the synthetic generator, through the real
   `SymbolPool` on real `worker_threads` where feasible — a route the builder's in-process tests do
   not take (263's verifier found this the highest-yield method).
2. **Attack, do not confirm.** Try to produce a false `truncated: false` by a route Builder A did not
   close: a THIRD repository joining after A and B; a database CLOSED and REOPENED between the write
   and the read; a store migrated from a parent-written `013`-only db; a warm scan hammered to
   provoke a retry loop; a completeness row deleted out from under a live reuse (the unknown-arm).

**The app run (`probe:p264` or the existing arch probe path).** One Electron, one scratch profile,
scratch HOME, own tmux socket, all ended in a `finally`. Drive `check-coordinator.ts`'s regional
disclosure (`regionDenominators`, the surfaces-list "read N of M files … N truncated") over a
repository containing an over-2-MiB file, in a SECOND repository sharing the store, and confirm the
disclosure still NAMES the incomplete coverage rather than reporting full coverage — and that a warm
re-open does not spin re-parsing. `npm run shot` is forbidden; no token byte in any file, log, argv
or report.

A **fix round** is part of the phase: if any verdict is `needs_work`, fix and re-verify before commit.

---

## 6. Gates before commit

Path-triggered by the files this phase touches:

- `conformance:facts` (both `db.ts` and `tree-facts.ts` are on its path) — ~40 s, plus the new
  ablations all red.
- `gate:cache-policy` — the `014` migration deletes only derived Architecture rows; `arch_fact_scan`
  is derived; `<userData>/gmux` is never a target.
- `conformance:arch`, `conformance:reading`, `conformance:evidence`, `conformance:derived` — the arch
  readers, in case any read of `factStamps`/completeness shifts a pinned reading (expect no move).
- `gate:contract` — this phase adds no IPC channel, no storage key, no env name; the baseline must
  compare byte-identical. If a contract line moves, regenerate the baseline in the same commit and
  say which lines moved.

Battery minimum then full: `npm run typecheck && npm run build && npm run smoke:t1`; integrator runs
`test`, `smoke`, `smoke:t3`, `package`. Every gate run in the FOREGROUND, exit code read, never
piped to `tail`. Commit: conventional subject above, phase label the first body line, no trailers.

---

## 7. What is NOT in this phase

- The older remote-source incompleteness handling is not touched; **both existing `markScanPartial`
  paths stay where they are** (`check-coordinator.ts:443` and `:684`). This is a distinct failure at
  a different boundary, and the audit says so.
- **The parser's 2 MiB cap (`MAX_INDEXED_FILE_BYTES`) does not move.** Making the fixture's file
  parse would hide the finding, not fix it. The 4,000,000-byte read cap does not move either.
- Fact-cache persistence is NOT separated from semantic-reading persistence — the audit lists that
  under improvements carrying no deduction and says to finish the cache fixes first.
- No IPC channel, no new user-facing surface, no menu change, no CHANGELOG entry: this is
  derived-evidence correctness across a shared cache and a person sees no behavioural difference
  except that a second repository's coverage disclosure now tells the truth.
- 263's migration `013` is NOT edited (name-keyed; editing an applied migration is a silent no-op).
  264 adds `014` beside it.
- Builder A does not touch test files; Builder B does not touch `src/main/arch` production files.
