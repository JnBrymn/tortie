/**
 * The digest survives the REAL worker message (Phase 263).
 *
 * The audit's own note on its counterexample is that an in-process adapter
 * test is not sufficient evidence: the whole claim is that the identity the
 * parser read reaches the publisher, and between those two sits a
 * `worker_threads` boundary and a structured clone. So this file spawns
 * `src/main/symbols/worker.ts` on a real thread, posts it a real batch, and
 * reads `oid` off the message that comes back.
 *
 * Three notes that cost time to find, kept so nobody finds them twice:
 *   - plain `node` cannot load `worker.ts`, whose relative imports are
 *     extensionless, so the tsx loader goes on the WORKER's own `execArgv`;
 *   - `@shared/*` needs `TSX_TSCONFIG_PATH` pointing at a tsconfig that
 *     carries the path alias, which `tsconfig.node.json` does;
 *   - only this TEST side imports `src/main/symbols/paths.ts`, which names
 *     electron and resolves through vitest's stub alias. The worker is handed
 *     finished absolute paths in `workerData` and imports that module never.
 *
 * The worker is terminated in a `finally` whatever happened.
 */

import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { blobOid } from '../facts/oid';
import { grammarPaths } from '../../symbols/paths';
import type { IndexedFile, SymbolWorkerMessage } from '../../symbols/worker';

const require_ = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * One real worker, booted and ready. The caller gets `ask`, which posts a
 * batch and resolves with the files of the answering message, and `end`, which
 * the caller runs in a `finally`.
 */
async function realWorker(): Promise<{
  ask: (
    files: { relPath: string; absPath: string }[],
    want: { imports?: boolean; calls?: boolean; wrappers?: boolean }
  ) => Promise<IndexedFile[]>;
  end: () => Promise<void>;
}> {
  const worker = new Worker(join(repoRoot, 'src/main/symbols/worker.ts'), {
    execArgv: ['--import', `file://${require_.resolve('tsx')}`],
    env: { ...process.env, TSX_TSCONFIG_PATH: join(repoRoot, 'tsconfig.node.json') },
    workerData: {
      runtimeWasm: require_.resolve('web-tree-sitter/web-tree-sitter.wasm'),
      grammarPaths: grammarPaths()
    }
  });
  const end = async () => {
    await worker.terminate();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      worker.on('error', reject);
      worker.on('message', (msg: SymbolWorkerMessage) => {
        if (msg.type === 'ready') resolve();
        if (msg.type === 'boot-failed') reject(new Error(msg.message));
      });
    });
  } catch (err) {
    await end();
    throw err;
  }
  let batchId = 0;
  const ask = (
    files: { relPath: string; absPath: string }[],
    want: { imports?: boolean; calls?: boolean; wrappers?: boolean }
  ) =>
    new Promise<IndexedFile[]>((resolve, reject) => {
      const id = (batchId += 1);
      const onMessage = (msg: SymbolWorkerMessage) => {
        if (msg.type !== 'result' || msg.batchId !== id) return;
        worker.off('message', onMessage);
        resolve(msg.files);
      };
      worker.on('message', onMessage);
      worker.on('error', reject);
      worker.postMessage({ batchId: id, files, ...want });
    });
  return { ask, end };
}

function scratch(name: string, text: string): { root: string; relPath: string; absPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'tortie-p263-worker-'));
  roots.push(root);
  const absPath = join(root, name);
  writeFileSync(absPath, text);
  return { root, relPath: name, absPath };
}

it(
  'carries the identity of the bytes the worker parsed across a real thread',
  async () => {
    const text = "ipcMain.handle('p263:worker', f);\n";
    const file = scratch('sample.ts', text);
    const expected = blobOid(Buffer.from(text));
    const { ask, end } = await realWorker();
    try {
      const asked = await ask([{ relPath: file.relPath, absPath: file.absPath }], { calls: true });
      expect(asked).toHaveLength(1);
      const answer = asked[0];
      expect(answer).toBeDefined();
      expect(answer?.oid).toBe(expected);
      expect(answer?.oid).toMatch(/^[0-9a-f]{40}$/);
      // Identity is not one of the asks: a request that wants neither calls nor
      // imports nor wrappers still names the bytes it read. ⌘⇧O pays 40
      // characters per file for it and that is the whole cost.
      const bare = await ask([{ relPath: file.relPath, absPath: file.absPath }], {});
      expect(bare[0]?.calls).toBeUndefined();
      expect(bare[0]?.oid).toBe(expected);
    } finally {
      await end();
    }
  },
  30_000
);

it(
  'names the bytes it READ, not the bytes on disk when the answer is read',
  async () => {
    // The mechanism of the whole phase, proved across a real structured clone:
    // the answer describes what the worker parsed, so a file rewritten after
    // the parse cannot make the answer claim the new bytes. That is what lets
    // the publisher compare the answer's identity against the one it is about
    // to key the row on, and refuse when a revert made its own two reads agree.
    const before = "ipcMain.handle('p263:before', f);\n";
    const after = "ipcMain.handle('p263:middle', f);\n";
    const file = scratch('sample.ts', before);
    const { ask, end } = await realWorker();
    try {
      const asked = await ask([{ relPath: file.relPath, absPath: file.absPath }], { calls: true });
      writeFileSync(file.absPath, after);
      expect(asked[0]?.oid).toBe(blobOid(Buffer.from(before)));
      expect(asked[0]?.oid).not.toBe(blobOid(Buffer.from(after)));
      expect(blobOid(Buffer.from(before))).not.toBe(blobOid(Buffer.from(after)));
    } finally {
      await end();
    }
  },
  30_000
);
