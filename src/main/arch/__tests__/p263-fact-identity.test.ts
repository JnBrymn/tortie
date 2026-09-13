/**
 * A parsed fact names the bytes it was parsed from (Phase 263).
 *
 * Taken from the Architecture audit of 12 September 2026, R1, and committed
 * here as the audit wrote it. Nothing in it is fabricated: the rig builds a
 * real {@link SymbolExtractor} over the real grammars, hands it to the fact
 * pass through the parser seam the shared worker pool normally fills, and
 * reads back through a real `ArchStore` on disk. No parsed call, no symbol and
 * no digest is invented anywhere below. The setup itself lives in
 * `p263-rig.ts` because `p263-shared-cache.test.ts` needs the same one; the
 * interleaving, which is what this file measures, is here.
 *
 * At the parent (`d5a24351`) the control passed and BOTH readings of the
 * change-and-revert test said `IPC serves audit:middle` — the first scan's
 * facts and, because `hasFactsFor` answers off (oid, relPath) alone, a
 * following CLEAN scan's too. The `console.log` of the four readings is the
 * audit's and is kept, so a run of this file prints what it measured rather
 * than only whether it agreed.
 *
 * THE INTERLEAVING IS CONTROLLED. The racing parser rewrites the file around
 * its own answer on purpose. These are controlled interleavings, not a
 * measurement of how often normal editing encounters the race.
 *
 * Only fresh temporary repositories and a scratch architecture database are
 * written; every extractor is disposed, every store closed and every temporary
 * root removed in `afterEach`.
 */

import { afterEach, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArchFactParser } from '../fact-parser';
import { p263Dispose, p263Rig } from './p263-rig';

afterEach(p263Dispose);

it('control: publishes the real steady-file call and reuses it without a parse', async () => {
  const { store, repo, scan, surfaces } = await p263Rig('tortie-p263-facts-');
  const repoPath = repo('steady', "ipcMain.handle('audit:steady', f);\n");
  await scan(repoPath, 'steady');
  expect(surfaces('steady')).toEqual(['IPC serves audit:steady']);
  await scan(repoPath, 'steady', { batchSize: 4, run: async () => { throw new Error('unexpected parse'); } });
  expect(store.factStamps('steady').get('src/main/sample.ts')?.truncated).toBe(false);
  expect(surfaces('steady')).toEqual(['IPC serves audit:steady']);
});

it('does not publish parser facts about temporary bytes under the restored blob identity', async () => {
  const { store, repo, scan, parser, surfaces } = await p263Rig('tortie-p263-facts-');
  const original = "ipcMain.handle('audit:before', f);\n";
  const temporary = "ipcMain.handle('audit:middle', f);\n";
  const repoPath = repo('aba', original);
  const path = join(repoPath, 'src/main/sample.ts');
  const racing: ArchFactParser = { batchSize: 4, async run(files, ask) {
    writeFileSync(path, temporary);
    try { return await parser.run(files, ask); }
    finally { writeFileSync(path, original); }
  } };
  await scan(repoPath, 'aba', racing);
  const subjects = surfaces('aba');
  await scan(repoPath, 'aba');
  const afterCleanScan = surfaces('aba');
  console.log(JSON.stringify({ case: 'worker-read-aba', disk: readFileSync(path, 'utf8'), subjects,
    afterCleanScan,
    stamp: store.factStamps('aba').get('src/main/sample.ts') }));
  // The two safety assertions of this phase, being the two readings the audit's
  // own mechanism paragraph names. Both said `IPC serves audit:middle` at the
  // parent: the first because the middle bytes' calls were stored under the
  // outer bytes' oid, the second because a clean scan found that row by oid and
  // reused it rather than repairing it.
  expect(subjects).not.toContain('IPC serves audit:middle');
  expect(afterCleanScan).not.toContain('IPC serves audit:middle');
  // And the repair rather than only the refusal: with nothing stored under the
  // restored bytes' identity, the second scan has to parse, and what it parses
  // is what is on the disk.
  expect(afterCleanScan).toEqual(['IPC serves audit:before']);
});
