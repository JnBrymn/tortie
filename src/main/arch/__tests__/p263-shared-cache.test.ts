/**
 * The lie is shared between repositories, and the upgrade throws it away
 * (Phase 263).
 *
 * Two arms, and they answer two different questions.
 *
 * ARM 1 is the CONSEQUENCE the audit names. `hasFactsFor` answers off
 * (oid, rel_path) alone and `idx_arch_fact_file_oid` exists for exactly that,
 * so a row written under bytes a parse never saw is not merely kept in the
 * repository that wrote it — it is READ BY EVERY OTHER repository holding the
 * same bytes at the same path, without a parse. One store, two repositories,
 * one racing and one clean, and neither may end up holding the temporary
 * bytes' call.
 *
 * ARM 2 is the arm that catches a fix living only in memory. A store is built
 * holding exactly the shape the parent could write — a fact under an identity
 * whose bytes never held it, its link, its Phase 259 declaration and its
 * wrapper declaration — and migration `013-arch-fact-identity` is then removed
 * from the `migrations` table with `better-sqlite3` so that reopening through
 * {@link ArchStore} runs it for the first time, the shape
 * `src/main/manifest/__tests__/exit-detail.test.ts` already uses. After the
 * upgrade the five derived tables are empty of those rows, the tree row, the
 * import row and the model's own claim are all STILL THERE, and a scan of the
 * real bytes produces the true fact.
 *
 * The interleaving in arm 1 is controlled on purpose. These are controlled
 * interleavings, not a measurement of how often normal editing encounters the
 * race.
 */

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ArchStore } from '../db';
import type { ArchFactParser } from '../fact-parser';
import { blobOid } from '../facts/oid';
import { readArchTreeFacts } from '../tree-facts';
import { p263Dispose, p263Extractor, p263Parser, p263Rig, p263Root, p263Store } from './p263-rig';

afterEach(p263Dispose);

it('arm 1: a racing repository writes nothing a second repository can read back', async () => {
  const { repo, scan, parser, surfaces } = await p263Rig('tortie-p263-shared-');
  const original = "ipcMain.handle('shared:before', f);\n";
  const temporary = "ipcMain.handle('shared:middle', f);\n";
  const one = repo('one', original);
  const path = join(one, 'src/main/sample.ts');
  const racing: ArchFactParser = {
    batchSize: 4,
    async run(files, ask) {
      writeFileSync(path, temporary);
      try {
        return await parser.run(files, ask);
      } finally {
        writeFileSync(path, original);
      }
    }
  };
  await scan(one, 'one', racing);
  // The second repository holds the same bytes at the same path, so it asks
  // `hasFactsFor` the same (oid, relPath) the first one just answered under.
  const two = repo('two', original);
  await scan(two, 'two');
  expect(surfaces('one')).not.toContain('IPC serves shared:middle');
  expect(surfaces('two')).not.toContain('IPC serves shared:middle');
  expect(surfaces('two')).toEqual(['IPC serves shared:before']);
  // And the repair reaches the racing repository too, on its next clean scan.
  await scan(one, 'one');
  expect(surfaces('one')).toEqual(['IPC serves shared:before']);
});

it('arm 2: a store written before the migration loses only the rows that may be wrong', async () => {
  const root = p263Root('tortie-p263-upgrade-');
  const dbPath = join(root, 'arch.db');
  const repoKey = 'legacy';
  const relPath = 'src/main/sample.ts';
  const truth = "ipcMain.handle('legacy:before', f);\n";
  const lie = "ipcMain.handle('legacy:middle', f);\n";
  // The identity the row is KEYED on is the truth's, and every derived row
  // written under it describes the lie. That is precisely what the parent
  // could produce and what no reader could tell apart afterwards.
  const oid = blobOid(Buffer.from(truth));

  const before = new ArchStore(dbPath);
  before.saveFacts(oid, relPath, [
    {
      category: 'surface',
      kind: 'ipc-channel',
      subject: 'IPC serves legacy:middle',
      line: 1,
      rule: 'surface.ipc.electron',
      evidence: lie.trim()
    }
  ]);
  before.linkFactFiles(repoKey, [
    {
      relPath,
      oid,
      mtimeMs: 1,
      size: truth.length,
      lang: 'typescript',
      vendored: null,
      truncated: false,
      wrapDigest: null
    }
  ]);
  before.saveDecls(oid, relPath, [
    { kind: 'function', subject: 'legacyMiddle', line: 1, evidence: lie.trim() }
  ]);
  before.saveWrapperDecls(oid, relPath, [
    {
      name: 'legacyWrap',
      innerCallee: 'ipcMain.handle',
      innerLast: 'handle',
      paramIndex: 0,
      innerIndex: 0,
      hops: 1,
      line: 1
    }
  ]);
  before.saveWrapFacts(repoKey, relPath, [
    {
      category: 'surface',
      kind: 'ipc-channel',
      subject: 'IPC serves legacy:middle',
      line: 1,
      rule: '+wrap',
      evidence: lie.trim()
    }
  ]);
  // The rows that are NOT derived from a parse of those bytes, and which the
  // migration must leave exactly where they are.
  before.saveTreeFacts(repoKey, [
    { relPath, mtimeMs: 1, size: truth.length, lines: 1, declares: null }
  ]);
  before.saveImports(repoKey, [
    {
      relPath,
      mtimeMs: 1,
      size: truth.length,
      imports: [
        {
          fromPath: relPath,
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
    subjects: ['part:%'],
    runId: 'run-legacy',
    writtenAt: 1,
    journeySource: null,
    journeys: [],
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
            relPath,
            line: 1,
            why: 'the handler',
            grade: 'call-site',
            factKind: 'ipc-channel',
            factSubject: 'IPC serves legacy:middle',
            factLine: 1,
            blobOid: oid
          }
        ]
      }
    ]
  });
  before.close();

  // Make the file look like a store this build has never migrated: drop the
  // markers for BOTH the identity migration (013) and the completeness
  // migration (014), and drop the bytes-keyed `arch_fact_scan` table that
  // Phase 264's `saveFacts` wrote a row into above — so on reopen 013 re-drops
  // the five derived tables and 014 re-creates an EMPTY completeness table,
  // exactly as a genuinely pre-migration store upgrades. Without dropping
  // `arch_fact_scan` its stale row would prove a read the migration is meant to
  // invalidate (014's own body only `CREATE ... IF NOT EXISTS`, it does not
  // clear the table).
  const raw = new Database(dbPath);
  try {
    raw.prepare("DELETE FROM migrations WHERE name = '013-arch-fact-identity'").run();
    raw.prepare("DELETE FROM migrations WHERE name LIKE '014-%'").run();
    raw.exec('DROP TABLE IF EXISTS arch_fact_scan');
    expect(raw.prepare('SELECT COUNT(*) AS n FROM arch_fact').get()).toEqual({ n: 1 });
  } finally {
    raw.close();
  }

  const after = p263Store(dbPath);
  const counted = new Database(dbPath, { readonly: true });
  try {
    for (const table of ['arch_fact', 'arch_fact_file', 'arch_fact_wrap', 'arch_fact_wrapper', 'arch_decl']) {
      expect({ table, ...(counted.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as object) }).toEqual({
        table,
        n: 0
      });
    }
    for (const table of ['arch_tree_file', 'arch_import', 'arch_import_file', 'arch_claim', 'arch_claim_cite']) {
      expect({ table, ...(counted.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as object) }).toEqual({
        table,
        n: 1
      });
    }
  } finally {
    counted.close();
  }
  expect(after.facts(repoKey)).toEqual([]);
  expect(after.hasFactsFor(oid, relPath)).toBe(false);
  expect(after.treeFacts(repoKey)).toHaveLength(1);
  expect(after.imports(repoKey)).toHaveLength(1);
  expect(after.semanticRows(repoKey).claims.map((c) => c.claimId)).toEqual(['claim-legacy']);

  // And the store is still usable: a scan after the upgrade re-parses and
  // publishes the TRUE fact under the same identity the lie was keyed on.
  const repoPath = join(root, 'legacy-repo');
  mkdirSync(join(repoPath, 'src/main'), { recursive: true });
  writeFileSync(join(repoPath, relPath), truth);
  await readArchTreeFacts({
    repoPath,
    repoKey,
    store: after,
    trackedFiles: [relPath],
    wrapperPass: false,
    parser: p263Parser(await p263Extractor())
  });
  expect(
    after
      .facts(repoKey)
      .filter((f) => f.category === 'surface')
      .map((f) => f.subject)
  ).toEqual(['IPC serves legacy:before']);
  expect(after.hasFactsFor(oid, relPath)).toBe(true);
});
