/**
 * Completeness travels with the BYTES, not with the repository (Phase 264).
 *
 * Taken from the Architecture audit of the 0.103.0 assessment, R2, and
 * committed here as the audit's own two-repository scenario. Nothing is
 * fabricated: every arm drives a real {@link SymbolExtractor} over the real
 * grammars, through the parser seam the shared worker pool normally fills, and
 * reads back through a real `ArchStore` on disk. The big file is a generated
 * TypeScript source ABOVE the parser's 2 MiB cap
 * (`MAX_INDEXED_FILE_BYTES` = 2,097,152) so the extractor DECLINES it and the
 * pass records the parse as truncated, and BELOW the fact reader's
 * 4,000,000-byte cap (`FACT_LIMITS.maxReadBytes`) so the reader still buffers
 * it and writes its line/path facts. Neither cap is moved: moving the 2 MiB
 * cap to make the file parse would HIDE the finding, not fix it.
 *
 * THE DEFECT, at the parent `cb9c25c5`. `tree-facts.ts`'s reuse arm recovers
 * `truncated` from `carried`, which is THIS repository's own previous link:
 *
 *     link.truncated = carried !== undefined && carried.oid === oid ? carried.truncated : false;
 *
 * A second repository holding the same bytes at the same path has no `carried`,
 * so `truncated` defaults to `false` and a file that was DECLINED reads as
 * fully parsed. The facts are keyed by content (`hasFactsFor(oid, relPath)`
 * answers across repositories), but the completeness flag lived on
 * `arch_fact_file`, whose primary key is `(repo_key, rel_path)` — a fact about
 * the BYTES sitting on a per-repository row. The second repository has not
 * gained the missing call list; it has LOST the sentence explaining why the
 * list is missing.
 *
 * The fix records completeness on a bytes-keyed row (`arch_fact_scan`) written
 * inside `saveFacts`'s own transaction, and the reuse arm reads it by
 * identity. So a second repository recovers `truncated: true` with no link of
 * its own, and it survives a database reopen.
 *
 * RED AT THE PARENT. Every "the fix" assertion below is red at `cb9c25c5`,
 * where the reproduction reads `repoB.truncated=false`, and green at HEAD.
 * Only fresh temporary repositories and a scratch architecture database are
 * written; every extractor is disposed, every store closed and every temporary
 * root removed in `afterEach`.
 */

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ArchStore } from '../db';
import type { ArchFactParser } from '../fact-parser';
import { blobOid } from '../facts/oid';
import { readArchTreeFacts } from '../tree-facts';
import { p263Dispose, p263Extractor, p263Parser, p263Root, p263Store } from './p263-rig';

afterEach(p263Dispose);

const REL = 'src/main/sample.ts';

/** The MAX_INDEXED_FILE_BYTES (2,097,152) and FACT_LIMITS.maxReadBytes (4,000,000) window. */
const BIG_BYTES = 2_800_051;

/**
 * A generated TypeScript source of at least `bytes` bytes, all ASCII (never
 * binary), holding no call the rules would read. It is above the parser's cap
 * so it is never parsed; its content only has to be valid-looking text.
 */
function bigTypeScript(bytes: number): string {
  const out: string[] = [];
  let size = 0;
  let n = 0;
  while (size < bytes) {
    const one = `export const filler_${n} = ${n};\n`;
    out.push(one);
    size += Buffer.byteLength(one);
    n += 1;
  }
  return out.join('');
}

/** Write `text` into a fresh repository directory under `root` and return its path. */
function makeRepo(root: string, name: string, text: string): string {
  const repoPath = join(root, name);
  mkdirSync(join(repoPath, 'src/main'), { recursive: true });
  writeFileSync(join(repoPath, REL), text);
  return repoPath;
}

/** One fact pass over `REL` in `repoPath`, with `reader` as the parser seam. */
function scan(store: ArchStore, repoPath: string, repoKey: string, reader: ArchFactParser) {
  return readArchTreeFacts({
    repoPath,
    repoKey,
    store,
    parser: reader,
    trackedFiles: [REL],
    wrapperPass: false
  });
}

/** The truncated flag of `REL` in `repoKey`, from the STABLE `factStamps` reader (the link column). */
function truncatedFlag(store: ArchStore, repoKey: string): boolean | undefined {
  return store.factStamps(repoKey).get(REL)?.truncated;
}

/** How many of `repoKey`'s files read as truncated. */
function truncatedCount(store: ArchStore, repoKey: string): number {
  return [...store.factStamps(repoKey).values()].filter((s) => s.truncated).length;
}

/**
 * Does an `arch_fact_scan` row exist for (oid, relPath), and what is its
 * truncated bit? Returns `undefined` when the table itself is absent (the
 * parent, before migration 014) or when no row is recorded for those bytes.
 * Read straight off the db file with a fresh readonly handle, so it is
 * independent of whatever reader Builder A names.
 */
function scanRow(dbPath: string, oid: string, relPath: string): { truncated: number } | undefined {
  const raw = new Database(dbPath, { readonly: true });
  try {
    const exists = raw
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'arch_fact_scan'")
      .get();
    if (exists === undefined) return undefined;
    return raw
      .prepare<[string, string], { truncated: number }>(
        'SELECT truncated FROM arch_fact_scan WHERE oid = ? AND rel_path = ?'
      )
      .get(oid, relPath);
  } finally {
    raw.close();
  }
}

/** The blob oid of `REL` as the store keys it, read back from repo A's own link. */
function oidOf(store: ArchStore, repoKey: string): string {
  const oid = store.factStamps(repoKey).get(REL)?.oid;
  if (oid === undefined) throw new Error('the file was never linked');
  return oid;
}

// ---------------------------------------------------------------------------
// 4a. The two-repository fixture, and the reopen arm.
// ---------------------------------------------------------------------------

it(
  '4a: a second repository recovers truncated:true for the same bytes, and it survives a reopen',
  async () => {
    const root = p263Root('tortie-p264-tworepo-');
    const dbPath = join(root, 'arch.db');
    const store = p263Store(dbPath);
    const big = bigTypeScript(BIG_BYTES);
    expect(Buffer.byteLength(big)).toBeGreaterThan(2_097_152);
    expect(Buffer.byteLength(big)).toBeLessThan(4_000_000);

    // Repo A: the file is read (< 4 MB) but declined by the extractor (> 2 MiB),
    // so the pass records the parse as truncated.
    const repoA = makeRepo(root, 'A', big);
    await scan(store, repoA, 'A', p263Parser(await p263Extractor()));
    expect(truncatedFlag(store, 'A')).toBe(true);
    expect(truncatedCount(store, 'A')).toBe(1);
    const oid = oidOf(store, 'A');

    // Repo B: same bytes, same path, same store. `hasFactsFor` answers true off
    // the bytes-keyed rows/link A wrote, so the reuse arm runs with no link of
    // its own. THE FIX: it recovers truncated:true by byte identity.
    // At the parent it read `false` — the sentence explaining the missing call
    // list was lost.
    const repoB = makeRepo(root, 'B', big);
    await scan(store, repoB, 'B', p263Parser(await p263Extractor()));
    expect(truncatedFlag(store, 'B')).toBe(true); // RED at parent (false), green at HEAD.
    expect(truncatedCount(store, 'B')).toBe(1); // count 1, not 0.
    // The bytes-keyed completeness row is where the truth lives.
    expect(scanRow(dbPath, oid, REL)?.truncated).toBe(1); // RED at parent (no table).

    // The arm that catches a fix living only in memory: close, REOPEN, and a
    // third fresh repository still reads truncated:true off the persisted row.
    store.close();
    const reopened = p263Store(dbPath);
    const repoC = makeRepo(root, 'C', big);
    await scan(reopened, repoC, 'C', p263Parser(await p263Extractor()));
    expect(truncatedFlag(reopened, 'C')).toBe(true); // RED at parent, green at HEAD, AFTER a reopen.
    expect(truncatedCount(reopened, 'C')).toBe(1);
  },
  90_000
);

// ---------------------------------------------------------------------------
// 4b. Complete-empty: a fully parsed file with no calls is READ, not truncated,
// and it is a state distinct from "unseen".
// ---------------------------------------------------------------------------

it(
  '4b: a complete-empty file reads as read-and-complete, distinct from unseen',
  async () => {
    const root = p263Root('tortie-p264-empty-');
    const dbPath = join(root, 'arch.db');
    const store = p263Store(dbPath);
    // A small file the parser reads fully and finds no call in: complete, empty.
    const empty = '// a comment-only source file, parsed completely, holding no call\n';

    const repoA = makeRepo(root, 'A', empty);
    const resA = await scan(store, repoA, 'A', p263Parser(await p263Extractor()));
    expect(truncatedFlag(store, 'A')).toBe(false);
    // It was READ (the pass parsed it this run), and its bytes carry no call.
    expect(resA.facts.read).toBeGreaterThan(0);
    const oid = oidOf(store, 'A');
    // State 4: a bytes-keyed completeness row exists, truncated:0 — "these
    // bytes were read, completely, and found nothing" is a RECORDED state.
    expect(scanRow(dbPath, oid, REL)?.truncated).toBe(0); // RED at parent (no table).

    // "Unseen" is the distinct state: no scan row for bytes never read.
    expect(scanRow(dbPath, 'f'.repeat(40), 'src/main/never-seen.ts')).toBeUndefined();

    // Repo B, same bytes: recognised as read-and-complete by identity, NOT
    // re-parsed, and truncated is false — the complete-empty file must never be
    // conflated with a declined parse.
    const repoB = makeRepo(root, 'B', empty);
    const throwing: ArchFactParser = {
      batchSize: 4,
      run: async () => {
        throw new Error('a complete-empty file must be reused, not re-parsed');
      }
    };
    const resB = await scan(store, repoB, 'B', throwing);
    expect(truncatedFlag(store, 'B')).toBe(false);
    expect(resB.facts.read).toBe(0); // reused by identity, not parsed again.
  },
  60_000
);

// ---------------------------------------------------------------------------
// 4c. Unavailable-parser: the declined file IS the unavailable-parser case at
// the file level. The extractor returns null for the over-2-MiB file exactly
// as it would for a grammar it could not load, and the result is TRUNCATED, not
// silently complete.
// ---------------------------------------------------------------------------

it(
  '4c: a parser that declines a file yields a truncated result, never silent completeness',
  async () => {
    const root = p263Root('tortie-p264-decline-');
    const dbPath = join(root, 'arch.db');
    const store = p263Store(dbPath);
    const big = bigTypeScript(BIG_BYTES);

    const repoA = makeRepo(root, 'A', big);
    // A parser that answers NOTHING for the file — the shape a grammar/worker
    // that is unavailable produces (the real extractor does exactly this for
    // the over-cap file). The pass must call this truncated.
    const declines: ArchFactParser = { batchSize: 4, run: async () => [] };
    await scan(store, repoA, 'A', declines);
    expect(truncatedFlag(store, 'A')).toBe(true);
    const oid = oidOf(store, 'A');
    expect(scanRow(dbPath, oid, REL)?.truncated).toBe(1); // RED at parent.

    // And a second repository holding the same bytes reads its OWN state, the
    // truncation, rather than defaulting to complete.
    const repoB = makeRepo(root, 'B', big);
    await scan(store, repoB, 'B', { batchSize: 4, run: async () => [] });
    expect(truncatedFlag(store, 'B')).toBe(true); // RED at parent.
  },
  60_000
);

// ---------------------------------------------------------------------------
// 4d. Migration-from-parent: a store written before migration 014 has its
// possibly-false completeness invalidated, its semantic tables untouched, and
// stays usable.
// ---------------------------------------------------------------------------

it('4d: migration 014 invalidates false completeness and leaves the model sentences alone', async () => {
  const root = p263Root('tortie-p264-migrate-');
  const dbPath = join(root, 'arch.db');
  const repoKey = 'legacy';
  const truth = "ipcMain.handle('legacy:before', f);\n";
  const oid = blobOid(Buffer.from(truth));

  // Build a store and seed it the way a pre-014 build could: a fact under an
  // identity, a link claiming completeness (truncated:false) that the parent
  // could never actually prove for a second repository, and — the blast-radius
  // guard — a model's claim and journey that cost the operator tokens.
  const before = new ArchStore(dbPath);
  before.saveFacts(oid, REL, [
    {
      category: 'surface',
      kind: 'ipc-channel',
      subject: 'IPC serves legacy:before',
      line: 1,
      rule: 'surface.ipc.electron',
      evidence: truth.trim()
    }
  ]);
  before.linkFactFiles(repoKey, [
    {
      relPath: REL,
      oid,
      mtimeMs: 1,
      size: truth.length,
      lang: 'typescript',
      vendored: null,
      truncated: false,
      wrapDigest: null
    }
  ]);
  before.saveTreeFacts(repoKey, [{ relPath: REL, mtimeMs: 1, size: truth.length, lines: 1, declares: null }]);
  before.saveImports(repoKey, [
    {
      relPath: REL,
      mtimeMs: 1,
      size: truth.length,
      imports: [
        {
          fromPath: REL,
          line: 1,
          specifier: 'electron',
          toPath: null,
          resolution: 'external',
          language: 'typescript'
        }
      ]
    }
  ]);
  before.replaceSemantic({
    repoKey,
    subjects: ['part:%', 'journey:%'],
    runId: 'run-legacy',
    writtenAt: 1,
    journeySource: 'model',
    journeys: [{ journeyId: 'j-legacy', name: 'The legacy journey', source: 'model', steps: [{ seq: 0, partId: 'part:main', label: 'starts' }] }],
    claims: [
      {
        claimId: 'claim-legacy',
        subject: 'part:main',
        field: 'purpose',
        text: 'A sentence a model wrote, which cost the operator a token.',
        question: null,
        answer: null,
        cites: [
          {
            relPath: REL,
            line: 1,
            why: 'the handler',
            grade: 'call-site',
            factKind: 'ipc-channel',
            factSubject: 'IPC serves legacy:before',
            factLine: 1,
            blobOid: oid
          }
        ]
      }
    ]
  });
  before.close();

  // Make the file look like a store this build has never migrated past 013:
  // drop the 014 marker and the completeness table, whatever they are named.
  const raw = new Database(dbPath);
  try {
    raw.prepare("DELETE FROM migrations WHERE name LIKE '014-%'").run();
    raw.exec('DROP TABLE IF EXISTS arch_fact_scan');
    // A false completeness claim is present going in.
    expect(raw.prepare('SELECT COUNT(*) AS n FROM arch_fact').get()).toEqual({ n: 1 });
  } finally {
    raw.close();
  }

  // Reopen through the current constructor so 014 applies for the first time.
  const after = p263Store(dbPath);
  const counted = new Database(dbPath, { readonly: true });
  try {
    // 014 created the completeness table.
    const table = counted
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'arch_fact_scan'")
      .get();
    expect(table?.name).toBe('arch_fact_scan'); // RED at parent (no 014).

    // The possibly-false completeness is INVALIDATED: the derived fact rows and
    // links 013 drops are dropped again, so nothing carries a stale truncated:0
    // as an authoritative claim. Below the parser's cap they are re-parsed on
    // the next scan and written afresh with a real completeness row.
    for (const t of ['arch_fact', 'arch_fact_file', 'arch_fact_wrap', 'arch_fact_wrapper', 'arch_decl']) {
      expect({ t, ...(counted.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as object) }).toEqual({ t, n: 0 });
    }
    // The blast radius: NOT ONE semantic table is touched, nor tree/import.
    for (const t of ['arch_tree_file', 'arch_import', 'arch_import_file', 'arch_claim', 'arch_claim_cite', 'arch_journey']) {
      const got = counted.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number };
      expect({ t, n: got.n }).toEqual({ t, n: 1 });
    }
    // The scan row for the invalidated bytes is gone, not left claiming complete.
    expect(counted.prepare('SELECT COUNT(*) AS n FROM arch_fact_scan').get()).toEqual({ n: 0 });
  } finally {
    counted.close();
  }
  expect(after.hasFactsFor(oid, REL)).toBe(false);
  expect(after.semanticRows(repoKey).claims.map((c) => c.claimId)).toEqual(['claim-legacy']);
  expect(after.semanticRows(repoKey).journeys.map((j) => j.journeyId)).toContain('j-legacy');

  // Still usable: a scan re-parses and publishes the true fact AND records
  // completeness afresh for the read bytes.
  const repoPath = join(root, 'legacy-repo');
  mkdirSync(join(repoPath, 'src/main'), { recursive: true });
  writeFileSync(join(repoPath, REL), truth);
  await readArchTreeFacts({
    repoPath,
    repoKey,
    store: after,
    trackedFiles: [REL],
    wrapperPass: false,
    parser: p263Parser(await p263Extractor())
  });
  expect(
    after
      .facts(repoKey)
      .filter((f) => f.category === 'surface')
      .map((f) => f.subject)
  ).toEqual(['IPC serves legacy:before']);
  expect(after.hasFactsFor(oid, REL)).toBe(true);
  expect(scanRow(dbPath, oid, REL)?.truncated).toBe(0); // a real, complete read is recorded.
}, 60_000);

// ---------------------------------------------------------------------------
// 4e. A warm second scan of a known-truncated file does NOT loop retrying it.
// ---------------------------------------------------------------------------

it(
  '4e: a warm second scan reuses a known-truncated file rather than re-parsing it in a loop',
  async () => {
    const root = p263Root('tortie-p264-warm-');
    const dbPath = join(root, 'arch.db');
    const store = p263Store(dbPath);
    const big = bigTypeScript(BIG_BYTES);

    // First scan of repo A: the file is declined and recorded truncated.
    const repoA = makeRepo(root, 'A', big);
    await scan(store, repoA, 'A', p263Parser(await p263Extractor()));
    expect(truncatedFlag(store, 'A')).toBe(true);

    // Warm second scan, same repository, nothing changed: the fact stamp is
    // fresh, so the file is not even re-read, let alone re-parsed. The
    // conservative-reparse arm must fire only on genuinely UNKNOWN completeness,
    // never on a known-truncated file, or a warm scan would spin.
    const throwing: ArchFactParser = {
      batchSize: 4,
      run: async () => {
        throw new Error('a warm scan of a known-truncated file must not re-parse it');
      }
    };
    const warm = await scan(store, repoA, 'A', throwing);
    expect(warm.facts.read).toBe(0);
    expect(warm.facts.reused).toBeGreaterThan(0);
    expect(truncatedFlag(store, 'A')).toBe(true);

    // And a SECOND repository over the same bytes reuses by identity — the
    // conservative arm does not fire, because completeness is known — so the
    // throwing parser is never called and the truncation is preserved.
    const repoB = makeRepo(root, 'B', big);
    const resB = await scan(store, repoB, 'B', throwing);
    expect(resB.facts.read).toBe(0); // reused, not re-parsed: no loop.
    expect(truncatedFlag(store, 'B')).toBe(true); // RED at parent (false), green at HEAD.
  },
  60_000
);
