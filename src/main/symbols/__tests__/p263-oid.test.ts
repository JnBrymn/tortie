/**
 * The agreement pin between the two spellings of git's blob name (Phase 263).
 *
 * `src/main/symbols/oid.ts` is a second spelling of `src/main/arch/facts/oid.ts`
 * because `build/assert-import-boundaries.mjs` forbids this directory from
 * importing that one. The duplication is what makes the fact pass's publication
 * guard a comparison between two independent readers rather than a function
 * agreeing with itself — so the two must be pinned equal, and this is the one
 * place they meet. A TEST may import across the boundary; a production file may
 * not, and that is why this lives here rather than in a module.
 *
 * The second half pins what `extractFile` answers: the digest is of the exact
 * buffer it parsed, and a file that contributes nothing still answers `null`
 * rather than an object carrying an empty identity.
 */

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { blobOid } from '../../arch/facts/oid';
import { symbolBlobOid } from '../oid';
import { SymbolExtractor } from '../extract';
import { BINARY_SNIFF_BYTES, MAX_INDEXED_FILE_BYTES } from '../languages';
import { grammarPath } from '../paths';

const require_ = createRequire(import.meta.url);
const runtimeWasm = require_.resolve('web-tree-sitter/web-tree-sitter.wasm');

const extractorPromise = SymbolExtractor.create({ runtimeWasm, grammarPath });

const root = mkdtempSync(join(tmpdir(), 'p263-oid-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The corpus §2 names: the shapes a digest could disagree on. */
const CORPUS: { what: string; buf: Buffer }[] = [
  { what: 'the empty file', buf: Buffer.alloc(0) },
  { what: 'a lone newline', buf: Buffer.from('\n') },
  { what: 'CRLF text', buf: Buffer.from('a();\r\nb();\r\n') },
  { what: 'four-byte UTF-8', buf: Buffer.from('const s = "𝟘𝟙🫠";\n', 'utf8') },
  {
    what: 'a NUL past the sniff window',
    buf: Buffer.concat([Buffer.alloc(BINARY_SNIFF_BYTES, 0x61), Buffer.from([0x00, 0x62])])
  },
  { what: 'the bytes conformance:facts pins', buf: Buffer.from('app.get("/facts", h);\n') }
];

describe('the two spellings of the blob name agree', () => {
  for (const { what, buf } of CORPUS) {
    it(`agrees over ${what}`, () => {
      const mine = symbolBlobOid(buf);
      expect(mine).toMatch(/^[0-9a-f]{40}$/);
      expect(mine).toBe(blobOid(buf));
    });
  }

  it('is the name git itself prints, on the two bytes already pinned elsewhere', () => {
    // facts/__tests__/vendored-oid.test.ts:58 pins the empty blob.
    expect(symbolBlobOid(Buffer.alloc(0))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    // build/conformance-facts.mjs:124's PINNED_OID, `git hash-object` 2026-09-11.
    expect(symbolBlobOid(Buffer.from('app.get("/facts", h);\n'))).toBe(
      'b6cc0c85baa88c2ca7f89ce1c7635aebd0c84c7c'
    );
  });

  it('moves with one byte', () => {
    expect(symbolBlobOid(Buffer.from('a'))).not.toBe(symbolBlobOid(Buffer.from('b')));
  });
});

describe('extractFile names the bytes it parsed', () => {
  function write(relPath: string, body: Buffer | string): string {
    const abs = join(root, relPath);
    writeFileSync(abs, body);
    return abs;
  }

  it('answers the blob name of the bytes on disk', async () => {
    const extractor = await extractorPromise;
    const bytes = Buffer.from('export function alpha(): void {}\n');
    const abs = write('alpha.ts', bytes);
    const got = await extractor.extractFile('alpha.ts', abs, { calls: true });
    expect(got).not.toBeNull();
    expect(got?.oid).toBe(blobOid(bytes));
    expect(got?.size).toBe(bytes.length);
  });

  it('answers null — not an empty identity — for a binary file', async () => {
    const extractor = await extractorPromise;
    const abs = write('binary.ts', Buffer.from([0x69, 0x00, 0x66, 0x0a]));
    expect(await extractor.extractFile('binary.ts', abs, {})).toBeNull();
  });

  it('answers null — not an empty identity — for a file over the cap', async () => {
    const extractor = await extractorPromise;
    const abs = write('huge.ts', Buffer.alloc(MAX_INDEXED_FILE_BYTES + 1, 0x61));
    expect(await extractor.extractFile('huge.ts', abs, {})).toBeNull();
  });

  it('answers null — not an empty identity — for a path with no grammar', async () => {
    const extractor = await extractorPromise;
    const abs = write('notes.txt', 'plain words\n');
    expect(await extractor.extractFile('notes.txt', abs, {})).toBeNull();
  });

  it('answers null — not an empty identity — for a file that is not there', async () => {
    const extractor = await extractorPromise;
    expect(await extractor.extractFile('gone.ts', join(root, 'gone.ts'), {})).toBeNull();
  });
});
