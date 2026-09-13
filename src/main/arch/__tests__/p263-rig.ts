/**
 * The rig the Phase 263 fact-identity tests share.
 *
 * `p263-fact-identity.test.ts` and `p263-shared-cache.test.ts` both need the
 * same four things — a scratch root, a real {@link SymbolExtractor} over the
 * real grammars, that extractor turned into the `ArchFactParser` seam the
 * shared worker pool normally fills, and a scratch {@link ArchStore} on disk —
 * and both must dispose every one of them whatever happened. They were written
 * in parallel and each carried its own copy; this is the one copy, extracted
 * at integration per CLAUDE.md's growth guardrail.
 *
 * Nothing here fabricates a parse. The extractor is the shipping one, the
 * parser seam calls the shipping `extractFile`, and the store is the shipping
 * `ArchStore` against a real sqlite file under a temporary directory. What the
 * tests add on top is the INTERLEAVING, which is theirs to write because it is
 * what each of them is measuring.
 *
 * {@link p263Dispose} is the whole `afterEach`: every extractor disposed,
 * every store closed and every temporary root removed, in that order, whatever
 * the test did.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchStore } from '../db';
import type { ArchFactParser } from '../fact-parser';
import { readArchTreeFacts } from '../tree-facts';
import { SymbolExtractor } from '../../symbols/extract';
import { grammarPath } from '../../symbols/paths';

const require_ = createRequire(import.meta.url);
const roots: string[] = [];
const stores: ArchStore[] = [];
const extractors: SymbolExtractor[] = [];

/** The `afterEach` body, shared. Disposal order is extractors, stores, roots. */
export function p263Dispose(): void {
  for (const extractor of extractors.splice(0)) extractor.dispose();
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

/** A fresh temporary directory, removed by {@link p263Dispose}. */
export function p263Root(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** A real extractor over the real grammars, disposed by {@link p263Dispose}. */
export async function p263Extractor(): Promise<SymbolExtractor> {
  const extractor = await SymbolExtractor.create({
    runtimeWasm: require_.resolve('web-tree-sitter/web-tree-sitter.wasm'),
    grammarPath
  });
  extractors.push(extractor);
  return extractor;
}

/** An `ArchStore` on disk, closed by {@link p263Dispose}. */
export function p263Store(dbPath: string): ArchStore {
  const store = new ArchStore(dbPath);
  stores.push(store);
  return store;
}

/**
 * One extractor as the fact pass's parser seam. This is the shape
 * `sharedFactParser()` wraps the worker pool in, minus the thread: the pass
 * cannot tell the two apart, which is what makes an in-process drive of the
 * publication guard honest. `batchSize` is 4 because these fixtures hold one
 * file.
 */
export function p263Parser(extractor: SymbolExtractor): ArchFactParser {
  return {
    batchSize: 4,
    async run(files, ask) {
      const out = [];
      for (const file of files) {
        const got = await extractor.extractFile(file.relPath, file.absPath, ask);
        if (got !== null) out.push({ relPath: file.relPath, ...got });
      }
      return out;
    }
  };
}

/** Everything one of these tests needs, built and tracked for disposal. */
export interface P263Rig {
  root: string;
  store: ArchStore;
  parser: ArchFactParser;
  /** A fresh repository under the root holding `src/main/sample.ts` with these bytes. */
  repo(name: string, text: string): string;
  /** One fact pass over `src/main/sample.ts`, with `parser` unless another is handed in. */
  scan(repoPath: string, repoKey: string, reader?: ArchFactParser): Promise<unknown>;
  /** The surface subjects this repository holds, in store order. */
  surfaces(repoKey: string): string[];
}

/** The rig, over a scratch root named by `prefix`. */
export async function p263Rig(prefix: string): Promise<P263Rig> {
  const root = p263Root(prefix);
  const store = p263Store(join(root, 'arch.db'));
  const parser = p263Parser(await p263Extractor());
  const repo = (name: string, text: string): string => {
    const repoPath = join(root, name);
    mkdirSync(join(repoPath, 'src/main'), { recursive: true });
    writeFileSync(join(repoPath, 'src/main/sample.ts'), text);
    return repoPath;
  };
  const scan = (repoPath: string, repoKey: string, reader: ArchFactParser = parser): Promise<unknown> =>
    readArchTreeFacts({
      repoPath,
      repoKey,
      store,
      parser: reader,
      trackedFiles: ['src/main/sample.ts'],
      wrapperPass: false
    });
  const surfaces = (repoKey: string): string[] =>
    store
      .facts(repoKey)
      .filter((f) => f.category === 'surface')
      .map((f) => f.subject);
  return { root, store, parser, repo, scan, surfaces };
}
