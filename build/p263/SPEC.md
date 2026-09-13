# Phase 263 — a parsed fact names the bytes it was parsed from

**Subject.** `fix(arch): a fact carries the identity of the bytes it was read from`
**First body line.** `Phase 263: a parsed fact names the bytes it was parsed from`
**Semver.** Patch.
**Parent.** `d5a24351`, worktree `/private/tmp/wt-p263`.
**Charter.** `docs/BACKLOG.md` "Phase 263", and audit 0.103.0 **R1** with its independent fixture.

The audit copy under `audit-fixtures/` is a SCRATCH READING COPY of the operator's own unpushed
commit. **It is never committed. The integrator deletes `audit-fixtures/` before the commit step**,
and nothing under `src/` or `build/` may import from it.

---

## 0. The reproduction, run before anything was planned

The fixture was copied to `src/main/arch/__tests__/p263-fact-identity.test.ts` and run in the
foreground:

```
$ npx vitest run src/main/arch/__tests__/p263-fact-identity.test.ts
 ❯ src/main/arch/__tests__/p263-fact-identity.test.ts (3 tests | 2 failed) 196ms
   × keeps the parser completeness flag when two repositories share a cached blob 131ms
   × does not publish parser facts about temporary bytes under the restored blob identity 21ms
 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
```

The control passed. The two safety assertions failed. The R1 arm printed, verbatim:

```json
{"case":"worker-read-aba","disk":"ipcMain.handle('audit:before', f);\n",
 "subjects":["IPC serves audit:middle"],
 "afterCleanScan":["IPC serves audit:middle"],
 "stamp":{"mtimeMs":1789332293141.015,"size":35,
          "oid":"846486240ef104fbbd1a36a138aa8414b1324e83",
          "wrapDigest":null,"lang":"typescript","vendored":null,"truncated":false}}
```

```
AssertionError: expected [ 'IPC serves audit:middle' ] to not include 'IPC serves audit:middle'
 ❯ src/main/arch/__tests__/p263-fact-identity.test.ts:99:24
```

Read it exactly: the disk holds `audit:before`, the stored stamp names `846486…`, which is the blob
name of the `audit:before` bytes, and the fact stored under that name says `audit:middle`. **A later
clean scan did not repair it** — `afterCleanScan` is still `audit:middle`, because the second scan
hashes the reverted bytes, finds `hasFactsFor(846486…, 'src/main/sample.ts')` true, and reuses the
lie without a parse. The premise of the phase is confirmed at the parent.

The scratch copy was then deleted; `git status` is clean but for the untracked `audit-fixtures/`.
`npm run typecheck` at the parent: exit 0.

**One thing the reproduction says that the backlog entry does not.** The fixture's OTHER failure,
"keeps the parser completeness flag when two repositories share a cached blob", is audit **R2** and
is **Phase 264's charter**, which this entry's own *What is NOT in this phase* hands to 264 in as
many words. It is therefore NOT committed here and NOT fixed here. §7 rules on the sentence in the
entry that this appears to contradict.

---

## 1. The defect, read from the tree at `d5a24351`

Three reads of one path, two of them compared.

| # | Who reads | Where | What it produces |
| --- | --- | --- | --- |
| 1 | main | `src/main/arch/tree-facts.ts:328` (`await readFile(file.absPath)`) → `:365` `const oid = blobOid(buf)` | the PUBLICATION identity `q.oid` |
| 2 | the worker | `src/main/symbols/extract.ts:276` `buf = readFileSync(absPath)` → `:285` `extractAll(relPath, buf.toString('utf8'), ask)` | the calls, symbols and wrappers actually parsed — **and no digest** (`:286` returns `{ ...found, mtimeMs, size }`) |
| 3 | main | `src/main/arch/tree-facts.ts:444` `buf = await readFile(q.absPath)` → `:455` `if (blobOid(buf) !== q.oid) continue;` | the guard, and the `text` the rules are read over at `:456` |

Read 2 is never compared to anything. The `97c021ef` repair is read 3, and it compares read 1 to
read 3. A change **followed by a revert** between reads 1 and 3 leaves 1 and 3 agreeing while 2 saw
something else, and the evidence of read 2's bytes is written under read 1's identity at:

- `tree-facts.ts:457` `store.saveFacts(q.oid, q.relPath, readFacts({ …, text, calls }))` — the calls come from read 2, the text from read 3;
- `tree-facts.ts:465-466` `readDecls(file?.symbols ?? [], text.split('\n'))` then `store.saveDecls(q.oid, …)` — the Phase 259 declaration half, off the SAME message;
- `tree-facts.ts:472` `store.saveWrapperDecls(q.oid, q.relPath, own)` — wrapper declarations cached by oid.

`store.hasFactsFor(oid, relPath)` (`src/main/arch/db.ts:1578`) then answers TRUE for those bytes in
**any** repository, because `idx_arch_fact_file_oid` is `(oid, rel_path)` and exists for exactly
that (`db.ts:676`). So the mislabelled row is not only kept, it is shared.

**The wrapper pass has the same hole twice, and neither is the example row.**

- step 1, `tree-facts.ts:658-667`: `askParser` answers, then `store.saveWrapperDecls(h.oid, h.relPath, own)` at `:662` with **no** identity check of any kind. The step-4 guard at `:709` is downstream of it and does not protect it.
- step 3, `tree-facts.ts:679-697`: the re-asked `calls` are pushed into `wrapWork` at `:687-695` and consumed by `readWrapFacts` at `:712`, behind the step-4 third read only.

**What is NOT racing, and must not be touched.** `tree-facts.ts:404-410`, the no-grammar and manifest
arm, reads the rules over the SAME `buf` that produced the oid at `:365`. One read, no window. Leave
it exactly as it is.

### Why the repair closes it

After the repair the chain is: read 1 → `A`; read 2 → `W`, now reported; read 3 → `C`. Publication
requires `W === A` **and** `C === A`. Then all three reads saw the same bytes, so the `calls` of read
2 and the `text` of read 3 describe the same object that `q.oid` names. Neither comparison alone is
enough and neither is dropped.

### The three refusals of alternative designs, so a later round does not "simplify" them

1. **The worker does not send its buffer back.** `worker.ts:6-9` states the measured reason: a batch of 500 TypeScript files is ~5 MB that would be structured-cloned for no reason. A 40-character digest is the whole payload of this fix.
2. **The worker does not receive the expected oid and refuse for itself.** The worker reports what it read; the PUBLISHER decides what may be stored. Moving the refusal into the thread would put policy in the dumb end and still leave the publisher unguarded.
3. **The third read is not removed.** The entry says "keeping the existing third-read guard rather than replacing it", and §1's chain says why: dropping it would let read 3 supply `text` that read 1 never saw.

---

## 2. The one design decision that is not obvious: where the worker's digest comes from

`blobOid` lives at `src/main/arch/facts/oid.ts:15`. **`src/main/symbols/` may not import it.**
`build/assert-import-boundaries.mjs:194-199` gives `main/arch/` `onlyFrom: 'main/arch/'` with one
door, `main/arch/ipc`, and its fixture at `:479-480` refuses exactly this import shape from outside
the domain. `typecheck` runs that gate, so the import would not survive the first gate a builder
runs.

**The ruling: the symbols layer gets its own four-line spelling of git's blob name, in a new module
`src/main/symbols/oid.ts`, and a gate pins the two spellings equal.**

This is a deliberate exception to "grep for an existing helper before writing one", and it is
written down here so a later round does not merge them and break the boundary:

- the boundary forbids reuse, and moving `blobOid` out of `arch/facts/` would move the claim in `facts/oid.ts:9` that it is "the one `node:` import the directory makes", plus `conformance:facts` rule 8's purity scan, plus `conformance:reading`'s copy list at `build/conformance-reading.mjs:130`. That is a large blast radius for a race fix;
- two independent spellings that are PINNED EQUAL are stronger here than one shared function. The whole point of the guard is that two readers of the same bytes must agree; if a single function is wrong, it agrees with itself, and the guard passes while both halves are wrong.

The pin is not optional and is part of Builder C's work (§5.C, rule F1): `conformance:facts` already
pins `PINNED_OID = 'b6cc0c85baa88c2ca7f89ce1c7635aebd0c84c7c'` at `build/conformance-facts.mjs:124`,
being what `git hash-object` printed on 2026-09-11 over the bytes `app.get("/facts", h);\n`. The new
clause asks the SYMBOLS-side spelling for the same bytes and requires the same 40 characters, and a
unit test asserts the two agree over a corpus (empty file, a lone newline, CRLF, four-byte UTF-8, a
file with a NUL past the sniff window, a 2 MiB-minus-one file).

---

## 3. Tier and the independent methods, decided before the work starts

**Tier 3.** It corrupts the person's derived evidence and that evidence is shared between
repositories through `hasFactsFor`. Budget: the gates, plus real data, plus TWO independent methods
one of which is an attack, plus a fix round if any verdict is `needs_work`.

The verifier must do at least one thing no builder did, and name it in the verdict. The two required
methods, from the entry:

1. **Re-derive independently.** The verifier writes its OWN change-and-revert driver against the real
   extractor and the real store — not this phase's fixture, not this phase's tests, not the
   in-process adapter this phase ships. A driver that only re-runs `p263-fact-identity.test.ts` has
   re-run the builder's own check and has verified nothing.
2. **Attack, do not confirm.** The verifier tries to DEFEAT the new guard rather than reproduce the
   old bug. The entry names three shapes and they are the floor, not the ceiling:
   - an **mtime collision** — rewrite with the same size and restore the mtime with `utimesSync`, so the freshness key never moves;
   - a **size-preserving rewrite** — `audit:before` and `audit:middl` are the same length;
   - a **worker answering a file that vanished** between the ask and the answer.
   Each attack must end either in a correct fact or in an unlinked file, never in a wrong fact.

**Real data.** `conformance:facts`'s recall arm over this checkout's own `src/` with the wrapper pass
on: 229 of 229 baseline channels, 0 extras, before and after. A guard that costs a single true row on
a quiet tree is a defect.

**Known limit, stated here so the attack lands on a written boundary rather than a surprise.**
Freshness is `(mtimeMs, size)` (`tree-facts.ts:292-294`). A rewrite that preserves BOTH is never
noticed, and this phase does not change that. What it does guarantee is that no scan which DOES read
the file may store a fact under bytes it did not parse. If the verifier's mtime-collision attack
produces a stale-but-self-consistent row, that is the pre-existing freshness limit and belongs in the
verdict as a stated limit, not as a regression of this phase.

**Second known limit.** A file rewritten on every scan is unlinked on every scan and re-read on the
next one, forever. That is already true of the third-read guard at `:455` and of the wrapper pass's
step 4 at `:709`; this phase widens the window that behaviour applies to. It costs a re-parse, never
a wrong row, and it converges the moment the file stops moving.

---

## 4. What is NOT in this phase

- **The completeness flag is Phase 264's.** `truncated` is not moved, not defaulted differently, and its cross-repository test is not committed here. §7 says how 264 builds ON this migration rather than competing with it.
- **No parser is replaced and no grammar is upgraded.**
- **`MAX_INDEXED_FILE_BYTES` stays 2 MiB** (`src/main/symbols/languages.ts:155`) and **`FACT_LIMITS.maxReadBytes` stays 4,000,000** (`tree-facts.ts:102`). Moving either would make the fixture parse and hide a finding rather than fix one.
- **No claim about frequency.** This is a controlled interleaving. The phase says so in the audit's own words: "These are controlled interleavings, not a measurement of how often normal editing encounters the race." That sentence goes in the commit body verbatim.
- **The semantic tables are not deleted by the migration.** `arch_claim`, `arch_claim_cite`, `arch_claim_rate`, `arch_journey` and `arch_semantic_run` hold a model's sentences and cost tokens to make. Their drift refresh already handles a moved oid (`src/main/arch/semantic/drift.ts:110-146`). Deleting them would spend the operator's money to fix a fact table.
- **No IPC channel, no shared contract, no surface and no menu moves.** `gate:contract`'s baseline must not move; if it does, something was built that this phase did not ask for.

---

## 5. The three builders, with disjoint file ownership

**No file appears in two columns. A builder that needs an edit in another builder's file writes it in
its brief for the integrator instead of making it.**

| Builder | Owns, exclusively |
| --- | --- |
| **A** | `src/main/symbols/extract.ts`, `src/main/symbols/worker.ts`, `src/main/symbols/pool.ts`, **new** `src/main/symbols/oid.ts`, `src/main/symbols/__tests__/service.test.ts`, **new** `src/main/symbols/__tests__/p263-oid.test.ts` |
| **B** | `src/main/arch/tree-facts.ts` — and nothing else |
| **C** | `src/main/arch/db.ts`, `src/main/arch/__tests__/tree-facts.test.ts`, **new** `src/main/arch/__tests__/p263-fact-identity.test.ts`, **new** `src/main/arch/__tests__/p263-worker-message.test.ts`, **new** `src/main/arch/__tests__/p263-shared-cache.test.ts`, `build/conformance-facts.mjs`, `build/facts-conformance-probe.mts` |

`src/main/arch/fact-parser.ts` is touched by NOBODY: its seam is structural (`IndexedFile[]`) and
gains the field for free.

---

### BUILDER A — the extractor names its own input, and the name survives a real thread

**Owns:** `src/main/symbols/extract.ts`, `worker.ts`, `pool.ts`, new `oid.ts`,
`__tests__/service.test.ts`, new `__tests__/p263-oid.test.ts`.

**A1. `src/main/symbols/oid.ts`, new.** One exported function returning the 40-hex git blob name of a
`Buffer` — `sha1` over `blob <len>\0` then the bytes. Its header says, in the house voice: that this
is a SECOND spelling of `src/main/arch/facts/oid.ts:15`; that it exists because
`build/assert-import-boundaries.mjs:194-199` forbids `src/main/symbols/` from importing
`src/main/arch/`; that the duplication is deliberate and is what makes the publication guard a
comparison between two independent readers rather than a function agreeing with itself; and that
`conformance:facts` rule F1 and `p263-oid.test.ts` pin the two equal, so a change to either that
moves a digit turns a gate red. Give the function its own name (`symbolBlobOid`, or similar) rather
than `blobOid`, so a grep for `blobOid` still finds one definition per layer.

**A2. `extract.ts:261-287`, `extractFile`.** Compute the digest over **the exact buffer that was
parsed**, and return it:

- the return type becomes `Promise<(Extracted & { mtimeMs: number; size: number; oid: string }) | null>`;
- the digest is taken over `buf` — the same `buf` whose `toString('utf8')` is handed to `extractAll` at `:285` — and on the line that builds the answer at `:286`, not from a re-read and not from a second `statSync`;
- every existing `return null` at `:266`, `:273`, `:278` and `:284` stays a `null`. A file with no grammar, over the 2 MiB cap, unreadable or binary contributes nothing and therefore names nothing;
- the doc comment says what the field means: the identity of the bytes THIS parse read, which the fact pass compares against the identity it is about to publish under.

Cost: one sha1 per parsed file, on the worker thread, over bytes already in memory. **Measure it**
and put the number in the brief: the recall arm's `ms` over this checkout's `src/` before and after,
same machine, back to back. If it is inside the run-to-run spread, say that rather than inventing a
delta.

**A3. `worker.ts`.** `IndexedFile` (`:65-78`) gains `oid: string`, **required, not optional**, with a
comment saying it is the identity of the bytes the worker parsed and that the fact pass refuses a
row whose identity is not the one it is publishing under. Required is the point: an optional field
lets a future producer omit it silently and a conservative publisher would then unlink everything
without anybody noticing. The push at `:126-134` sets `oid: got.oid` unconditionally — it is not
behind `raw.calls`, `raw.imports` or `raw.wrappers`, because identity is not an ask. `⌘⇧O` pays 40
characters per file for it and that is the whole cost.

`SymbolWorkerMessage` at `:80-83` does not change shape; the field travels inside `files`.

**A4. `pool.ts`.** Read `:112-128` and `:192-199` and confirm what is already true: the pool routes
`msg.files` through untouched and constructs no `IndexedFile` of its own. **Expect zero production
changes here.** If none is needed, say so in the brief in one line rather than editing the file for
symmetry. The `exit` handler at `:208-212` resolves `[]` — a dead worker answers nothing, which the
publisher already treats as `truncated`, and that stays.

**A5. `__tests__/service.test.ts:44-80`.** `fakePool` constructs `IndexedFile` by hand and will not
compile. Give it a real digest of the file it stats, not a placeholder: the fake already reads the
path. The symbol index does not consume the field, so nothing else in that file moves.

**A6. `__tests__/p263-oid.test.ts`, new.** The agreement pin, per §2: `symbolBlobOid(buf)` equals
`blobOid(buf)` from `src/main/arch/facts/oid.ts` over a corpus — the empty buffer (which must be
`e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`, as `facts/__tests__/vendored-oid.test.ts:58` already
pins), a lone newline, CRLF text, four-byte UTF-8, bytes with a NUL past `BINARY_SNIFF_BYTES`, and
the exact bytes `app.get("/facts", h);\n` which must give
`b6cc0c85baa88c2ca7f89ce1c7635aebd0c84c7c`. **A test file may import across the boundary; a
production file may not** — this is the one place the two spellings meet, and that is why it is a
test.

Second half of the same file: `extractFile` over a written temp file answers an `oid` equal to
`blobOid` of the bytes on disk, and answers `null` — not an object with an empty oid — for a binary,
for a file over `MAX_INDEXED_FILE_BYTES`, and for a path with no grammar.

**A must not:** change any parse, any query, any limit, any refusal, or the batch protocol.

---

### BUILDER B — the publisher requires the answer's identity, and keeps the third read

**Owns:** `src/main/arch/tree-facts.ts`. Nothing else.

**B0, the constraint that will bite.** `conformance:reading` loads `tree-facts.ts` from a BARE COPY
of `src/main/arch` plus only `src/main/symbols/languages.ts` and `calls.ts`
(`build/conformance-reading.mjs:130-131`), and `build/reading-conformance-probe.mts:226` imports it
under plain node. **Add no runtime import to this file.** `blobOid` is already imported at `:73` and
`IndexedFile` at `:94` is already `import type`. Anything new from `../symbols/` must be
`import type` or the reading gate dies with a module-not-found instead of a pin.

**B1. The base pass, `:436-475`.** Before the third read, refuse an answer that names other bytes:

- after `const file = answered.get(q.relPath)` at `:437`, when `file !== undefined` and `file.oid !== q.oid`, the file is **rejected whole**: no `saveFacts`, no `saveDecls`, no `saveWrapperDecls`, no `wrapWork` push, and **not** added to `answeredFiles`, so `:482` deletes its link and the next run reads it. This is the wrapper pass's own step-4 behaviour (`:622-623`) and not a new refusal;
- `file === undefined` is **NOT** a disagreement. It is the existing "the worker did not answer" case — over its own cap, half-written, or a dead batch — and it keeps `q.link.truncated = true` at `:441` and its line and path facts exactly as today;
- the check goes **before** `await readFile(q.absPath)` at `:444`: a rejected file should not cost a third read;
- the existing guard at `:455` stays exactly as it is, byte for byte, and the comment above it at `:448-454` is extended rather than replaced — it currently explains one window and must now explain two, naming which read each comparison closes.

**B2. The wrapper pass, step 1, `:658-667`.** `store.saveWrapperDecls(h.oid, h.relPath, own)` at
`:662` is reached with no identity check at all. Apply the same rule: when the answer names bytes
other than `h.oid`, save nothing, push nothing into `wrapWork`, and **`links.delete(h.relPath)`** so
the next run re-reads that file. When the answer is missing, today's `truncated` behaviour stands.

**B3. The wrapper pass, step 3, `:679-697`.** The re-asked `calls` feed `readWrapFacts` at `:712`.
Same rule: a disagreeing answer contributes no `wrapWork` entry and the file's link is deleted. The
step-4 guard at `:709` stays.

**B4. The module header.** `:20-62` is the account of this pass and is where a future round reads the
rules. Add to the stated-limits paragraph, in its voice: that the extractor now names the bytes it
parsed; that publication requires the parse identity and the second-read identity to both equal the
identity the row is keyed on; that a disagreement leaves the file unlinked for the next run; and that
a file rewritten on every scan is therefore re-read on every scan and never mislabelled.

**B must not:** touch the reuse arm at `:393-403` (that is R2 and Phase 264's), touch the
no-grammar/manifest arm at `:404-410` (one read, no window), change `readArchTreeFacts`'s signature,
change `ArchFactParser`, change any count in `ArchFactPassResult`, or move a limit.

**Existing tests B must keep green** (all in `src/main/arch/__tests__/tree-facts.test.ts`, and note
Builder C owns that file — B reports a needed change rather than making one): `:473` the base pass
guard, `:496` the cancelled loop, `:330`/`:359`/`:381`/`:392`/`:406` the wrapper arms, `:231` the
declarations, `:418` two repositories over one fact list, `:461` the file over the worker's cap.
`:473`'s racing parser writes AFTER the parse, so the worker's answer agrees with `q.oid` and the
THIRD read catches it — the outcome is unchanged and the test proves the two guards are distinct.

---

### BUILDER C — the invalidation, and the three tests the audit names

**Owns:** `src/main/arch/db.ts`, `src/main/arch/__tests__/tree-facts.test.ts`, the three new
`p263-*` tests under `src/main/arch/__tests__/`, `build/conformance-facts.mjs`,
`build/facts-conformance-probe.mts`.

**C1. The migration, `db.ts:378` `MIGRATIONS`.** Append `013-arch-fact-identity` after
`012-arch-semantic` (`:794`), in the exact form of `011-arch-decl` (`:740-759`): a name, an `up`, and
a comment above it in the house voice that says WHY. The comment must say: that a row written before
this commit may describe bytes other than the ones it is keyed on, because the parser's result
carried no identity; that the fact base is DERIVED and costs one re-parse at about 1.25 ms per file,
the same sentence `002`, `007`, `008` and `011` already carry; and that the links go with the facts
because `hasFactsFor` (`:1578`) answers true off a link alone, so a migration that dropped the facts
and kept the links would re-link every file without parsing one — which is the mistake `011`'s own
comment at `:733-739` already records.

Delete exactly these five, and name each in the comment:

```
DELETE FROM arch_fact;          -- the mislabelled rows themselves
DELETE FROM arch_fact_file;     -- the links, or nothing is ever re-parsed
DELETE FROM arch_fact_wrap;     -- derived from those rows under a wrapper map
DELETE FROM arch_fact_wrapper;  -- wrapper declarations cached by oid, saved with no guard at all
DELETE FROM arch_decl;          -- the Phase 259 half, written at the same call site
```

`arch_fact_wrapper` and `arch_decl` were NOT dropped by `011` and must be dropped now: `:662` wrote
wrapper declarations under an unverified identity, and `:466` wrote declarations off the same
message as the calls.

**Nothing else is deleted, and the comment says so:** not `arch_repo`, not `arch_import`, not
`arch_import_file`, not `arch_tree_file`, not `arch_canvas*`, and **not one semantic table** —
`arch_claim`, `arch_claim_cite`, `arch_claim_rate`, `arch_journey`, `arch_semantic_run` hold a
model's sentences that cost the operator tokens, and their own drift refresh handles a moved oid.
No source file, no manifest, no path under `<userData>/gmux`, nothing outside this database.
`gate:cache-policy` stays green and unmodified.

**C2. `p263-fact-identity.test.ts`, new — the audit's fixture, committed.** Two tests, taken from
`audit-fixtures/fact-identity.test.ts.fixture` with its setup helper intact:

- the **control**, `'control: publishes the real steady-file call and reuses it without a parse'`, byte for byte as the audit wrote it. It passed at the parent and must pass at HEAD;
- the **change-and-revert** test, `'does not publish parser facts about temporary bytes under the restored blob identity'`, as the audit wrote it, keeping its `console.log` of the four readings, and gaining **one added assertion** so both of its readings are judged:

```ts
  expect(subjects).not.toContain('IPC serves audit:middle');
  expect(afterCleanScan).not.toContain('IPC serves audit:middle');
  expect(afterCleanScan).toEqual(['IPC serves audit:before']);
```

The added lines are the entry's "two safety assertions": at the parent `subjects` and
`afterCleanScan` BOTH read `IPC serves audit:middle`, measured in §0, and the audit's own mechanism
paragraph names both — "both the first result and a subsequent clean scan return `IPC serves
audit:middle`". The `toEqual` is the repair assertion: the clean scan does not merely avoid the lie,
it produces the truth, because with nothing stored under `846486…` the second scan must parse.

The file's header says where it came from, that its setup uses the real `SymbolExtractor`, the real
rule reader and a real `ArchStore` and fabricates no parsed call, and that the interleaving is
controlled rather than a frequency claim. **The imports move from `'../db'` etc. to the same
relative paths — the fixture was written for this directory and needs no rewriting.** Its
`afterEach` disposes every extractor, closes every store and removes every temp root; keep it.

**C3. `p263-worker-message.test.ts`, new — the REAL worker message.** The audit is explicit that an
in-process adapter test is insufficient. This one spawns the real `src/main/symbols/worker.ts` on a
real thread and reads the field off a real structured clone. **The recipe is proven — it was run
during this spec and passed in 531 ms under vitest:**

```ts
const w = new Worker(join(repo, 'src/main/symbols/worker.ts'), {
  execArgv: ['--import', `file://${require_.resolve('tsx')}`],
  env: { ...process.env, TSX_TSCONFIG_PATH: join(repo, 'tsconfig.node.json') },
  workerData: { runtimeWasm: runtimeWasmPath(), grammarPaths: grammarPaths() }
});
```

Notes that cost time to find, so do not re-find them: plain `node` cannot load `worker.ts` because
its relative imports are extensionless (`ERR_MODULE_NOT_FOUND` on `'./languages'`), so the tsx
loader goes on the worker's own `execArgv`; `@shared/*` needs `TSX_TSCONFIG_PATH` pointing at a
tsconfig carrying the path mapping (`tsconfig.node.json:27-29`); and only the TEST side imports
`src/main/symbols/paths.ts`, which names electron and resolves through vitest's stub alias — the
worker receives finished absolute paths in `workerData` and imports it never.

It must assert: `msg.files[0].oid` equals `blobOid` of the bytes the test wrote; that it is 40 hex
characters; that it is present when the request asks for `calls` and present when it asks for
nothing, because identity is not an ask; and that a file changed on disk after the worker's read
still reports the identity the worker READ, not the one on disk — write the file, let the worker
answer, rewrite it, and assert the answered oid is the first one's. That last assertion is the whole
mechanism, proved across a real thread. **Terminate the worker in a `finally`**, whatever happened,
and give the test an explicit timeout.

**C4. `p263-shared-cache.test.ts`, new — the shared-cache upgrade.** Two arms.

*Arm 1, two repositories, one store, no upgrade.* Repository `one` publishes under a change-and-
revert racing parser; repository `two` holds the same bytes at the same path and scans cleanly.
Neither may end holding `audit:middle`. This is the cross-repository half the audit names as the
consequence: `hasFactsFor` shares by `(oid, rel_path)`, so a lie written in one repository is read by
the other.

*Arm 2, a store written at the parent, opened by this build.* Build an `ArchStore`, write a fact row
under an identity whose bytes never held it, plus its link, plus an `arch_decl` row and an
`arch_fact_wrapper` row under the same identity. Then, with the store closed, open the file with
`better-sqlite3` and `DELETE FROM migrations WHERE name = '013-arch-fact-identity'` — the shape
`src/main/manifest/__tests__/exit-detail.test.ts:181-184` and `pre-schema-copy.test.ts:90` already
use. Reopen through `ArchStore` and assert: all five tables are empty of those rows; a planted
`arch_tree_file` row, a planted `arch_import` row and a planted `arch_claim` row are **still there**;
and a scan after the upgrade re-parses and produces the true fact. Arm 2 is the arm that catches a
fix living only in memory.

**C5. `tree-facts.test.ts`.** The in-process adapter at `:33-56` builds its answer field by field and
must now carry `oid: got.oid` — one line. Leave its `asks` recording alone. Then add, in this file,
the coverage the base fixture does not reach, because the entry says the rule applies to every row
the same message carries:

- the same change-and-revert with **`wrapperPass: true`**, asserting that `store.declsOf` returns no
  declaration of the temporary bytes, that `store.wrapperDecls([{ oid, relPath }])` holds no wrapper
  declaration of them, and that no `+wrap` fact names them;
- a **wrapper pass step 1** race: a wrapper-grammar file held from a previous run with a null digest,
  whose bytes change and revert around the step-1 ask, must leave `arch_fact_wrapper` without the
  temporary declaration and must leave the file unlinked;
- a **control beside each**, being the same shape with a steady file, asserting the ordinary row IS
  written. A refusal with no control is a refusal that might be refusing everything.

**C6. `conformance:facts` — an ablation per clause, each red on the rule that owns it.** The gate
(`build/conformance-facts.mjs`) copies `src/main` per ablation and runs
`build/facts-conformance-probe.mts` over it; the arms are `fixtures`, `recall`, `symbols`,
`identity`, `limits`, `store`, `setting` (`facts-conformance-probe.mts:185-290`). Today no arm drives
`tree-facts.ts`'s publication, so the guard would be ablatable with the gate green. Add:

- **rule F1, the two spellings agree.** In the `identity` arm, load the root's own
  `main/symbols/oid.ts` and require it to answer `PINNED_OID` (`conformance-facts.mjs:124`) for
  `app.get("/facts", h);\n`, the same constant rule 9 already pins for `blobOid`. Ablate one
  character of either spelling and F1 goes red.
- **rule F2, a parse names its bytes.** Same arm: `extractFile` over a written file answers an `oid`
  equal to the root's own `blobOid` of those bytes.
- **rule F3, publication requires the parse identity.** A new `publish` arm that imports the root's
  own `main/arch/tree-facts.ts` and `main/arch/db.ts`, drives one change-and-revert through the
  parser seam over a scratch repository and a scratch `arch.db`, and reads back: no fact of the
  temporary bytes, the file unlinked, and a clean second scan producing the true fact. The arm
  lives under the gate's own scratch directory and is removed in the existing `finally`.
  `tree-facts.ts`'s only non-type imports outside `main/arch` are `../symbols/languages`, which the
  ablated copy carries because it copies all of `src/main`.
- **rule F4**, the same over the wrapper pass with the pass on, reading `arch_fact_wrapper`.
- **the ablations**, one per clause Builders A and B ship, each named and each with the pin it must
  turn red: the digest returned by `extractFile`; `oid` carried on the push in `worker.ts`; B1's base
  guard; B2's step-1 guard; B3's step-3 guard; and the existing `:455` third read, which no ablation
  covers today and should gain one now that a second comparison exists beside it — ablating either
  one alone must go red, which is what proves the two are not redundant.

Follow the file's own conventions exactly: an ablation is `{ name, file, from, to, arms, red }` and
its `from` must be found in the copy or the gate throws (`conformance-facts.mjs:533`). Update the
header's numbered rule list and its Phase-263 paragraph in the same commit — that header is the
index a later round reads.

**C must not:** change any existing migration's `name` or `up`, change `hasFactsFor`, `saveFacts`,
`saveDecls`, `saveWrapperDecls`, `linkFactFiles` or `pruneUnlinkedFacts`, or commit the audit's
cross-repository `truncated` test.

---

## 6. Gates, and which are earned by the paths this phase touches

Minimum before any commit: `npm run typecheck && npm run build && npm run smoke:t1`. The integrator
runs the full battery (`test`, `smoke`, `smoke:t3`, `package`). `gate:electron`, `gate:background`,
`gate:knownhosts`, `gate:checks` and `gate:contract` run inside `npm run build`.

Earned by path, from `CLAUDE.md`'s table:

| Touching | Gate | Cost |
| --- | --- | --- |
| `symbols/{extract,worker,pool}.ts`, `arch/tree-facts.ts`, the `arch_fact*` half of `arch/db.ts` | `conformance:facts` | ~40 s |
| `arch/tree-facts.ts` | `conformance:reading` | ~1.2 s |
| `src/main/arch/` | `conformance:arch` | ~0.3 s |
| `arch/db.ts` | `conformance:evidence` | ~4 s |
| a `*.test.ts` added under `src/` | `gate:checks` | in `build` |
| the boundary the migration must not cross | `gate:cache-policy` | ~0.1 s |

`conformance:facts` is the one that must be read carefully: its recall arm is the real-data evidence
of §3 and its ablations are C6's deliverable. `gate:contract`'s baseline must NOT move; if
`docs/audits/contract-baseline.txt` diffs, something outside this phase was built.

**Not run:** `probe:p257` and every Electron probe. This phase adds no surface, and the entry's proof
is executable rather than photographed. `npm run shot` is forbidden.

---

## 7. The ruling on the entry's "two safety assertions", and the handoff to Phase 264

The entry says the fixture's "two safety assertions must go from red at the parent to green at HEAD",
and its refusals say the completeness flag is Phase 264's. Taken as "the two assertions that failed
in §0" those sentences contradict each other, because one of the two failures IS the completeness
flag.

**The ruling: the two safety assertions of THIS phase are the two readings of the change-and-revert
test** — `subjects` and `afterCleanScan` — both of which read `IPC serves audit:middle` at the
parent, and both of which the audit's own mechanism paragraph names. The cross-repository
`truncated` test is not committed here. A test committed red is not a proof, and a test committed
`skip`ped is invisible; it is handed to 264 whole, where the audit's R2 fixture is its charter.

**How 264 builds on 263 rather than competing with it.** The audit is explicit that separate commits
are useful and competing migrations are not. Concretely:

1. **263 owns migration `013-arch-fact-identity`. 264 adds `014-…` and never edits `013`.** A migration is name-keyed (`src/main/db/sqlite.ts:410-444`); editing an applied one is a no-op on every machine that already ran it, which is the silent failure this note exists to prevent.
2. **263's delete already empties every table 264 would have had to backfill.** `arch_fact`, `arch_fact_file`, `arch_fact_wrap`, `arch_fact_wrapper` and `arch_decl` are empty after 263, so 264's "backfill or invalidate existing links that may already contain false completeness" is satisfied for every store that has run 263, and 264's own migration needs to handle only the bytes-keyed row it introduces.
3. **263 does not touch `tree-facts.ts:393-403`, the reuse arm**, which is where 264's repair lives: `link.truncated = carried !== undefined && carried.oid === oid ? carried.truncated : false` at `:400`, and `link.wrapDigest = input.wrapperPass ? (carried?.wrapDigest ?? null) : null` at `:399`, whose asymmetry 264 must rule on explicitly. 263 leaves both lines untouched so 264 inherits a clean diff.
4. **263's publication guard is the precondition for 264's honesty.** A completeness flag stored beside facts that describe other bytes would be a true flag about a false row. 264 stores completeness keyed on bytes; that key is only meaningful once the bytes a parse saw are known, which is what 263 adds.

---

## 8. Definition of done

1. `p263-fact-identity.test.ts`'s control green at the parent AND at HEAD; its two safety assertions red at the parent (measured, §0) and green at HEAD.
2. The real worker-message test and both arms of the shared-cache test green.
3. The existing race, cancellation, wrapper and declaration tests in `tree-facts.test.ts` green.
4. `conformance:facts` green, with every new ablation red on its own rule, and the recall arm reading 229 of 229 with 0 extras.
5. `conformance:reading`, `conformance:arch`, `conformance:evidence`, `gate:cache-policy` green.
6. The full battery green; `contract-baseline.txt` unchanged.
7. `audit-fixtures/` deleted; nothing under `src/` or `build/` names it.
8. `docs/BACKLOG.md` gains ONE line at the END of the running log — date, what happened, hash and version — and nothing above it is reordered.
9. `CHANGELOG.md` gains one Fixed item in the operator's style: one or two sentences, what no longer goes wrong, plain words, no file names and no gate names. A draft to sharpen, not to paste: *"Architecture no longer stores what it read about a file under the wrong version of that file. A file edited and put back while it was being read used to leave a wrong description behind that later checks kept rather than repaired; it is now re-read instead, and any description stored that way before this release is discarded and rebuilt."* The version bumps by a patch, and the item is written before the hash exists, then linked by the committer.
10. Commit subject `fix(arch): a fact carries the identity of the bytes it was read from`, first body line `Phase 263: a parsed fact names the bytes it was parsed from`, the build story in the body, the audit's controlled-interleaving sentence verbatim, no trailers.
