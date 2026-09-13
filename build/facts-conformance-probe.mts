/**
 * The probe behind `npm run conformance:facts` (Phase 257).
 *
 * Handed a list of module roots, each holding a copy of `src/main` (the
 * shipping tree, or one with exactly one clause edited), it loads THAT root's
 * `main/arch/facts/index.ts`, `main/symbols/extract.ts`, `main/arch/db.ts`
 * and `main/settings/store.ts`, runs the arms the gate asked for, and prints
 * one JSON line per run for `build/conformance-facts.mjs` to pin. The grammar
 * wasm paths always come from the SHIPPING `src/main/symbols/paths.ts`,
 * because that module finds the runtime relative to its own location.
 *
 * IT SPAWNS NOTHING. No git, no Electron, no tmux, no agent, no request, and
 * it reads nothing under the person's home: the fixtures are data, this
 * checkout's own `src/` is read with `node:fs` for the recall arm, and the
 * one database it opens is a scratch `arch.db` under a directory the gate
 * removes.
 *
 * The arms, each named by the gate rule it answers:
 *   fixtures  rules 1, 2, 5, 6, 7, 13, 14: every committed fixture read with
 *             the pass on, and again with it off
 *   recall    rules 3 and 4: this checkout's src/** against the baseline's
 *             invoke channels
 *   symbols   rule 5: src/main/symbols/** with the pass on and off
 *   identity  rule 9: composed twice, the same bytes at a test path, the oid
 *   limits    rule 15: the call ceiling, the manifest cap, the subject cut
 *   store     rules 10 and 16: a scratch ArchStore driven end to end
 *   setting   rule 12: the sanitizer and the seal
 *   publish   rules F3 and F4 (Phase 263): the fact pass's two publication
 *             windows, driven one at a time over a scratch repository and a
 *             scratch arch.db, so that ablating either guard alone goes red
 *
 * PHASE 263 also extends the `identity` arm with rules F1 and F2: the second
 * spelling of the blob name in `main/symbols/oid.ts` agrees with the fact
 * domain's own, and `extractFile` answers the identity of the bytes it parsed.
 *
 * Usage: tsx build/facts-conformance-probe.mts '<json>' where the json is
 * { "roots": [{ "name", "root", "arms": [...] }], "checkout": "<abs>", "scratch": "<abs>" }
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import type { ArchFactDraft } from '../src/shared/arch';
import {
  ARCH_BOUNDARY_START_KINDS,
  ARCH_FACT_CATEGORIES,
  ARCH_FACT_KINDS,
  ARCH_MODULE_ROOT_KIND
} from '../src/shared/arch';
import { grammarFor } from '../src/main/symbols/languages';
import { grammarPath, runtimeWasmPath } from '../src/main/symbols/paths';
import {
  countByCategory,
  countByRule,
  readTree,
  walkFiles,
  type DriverCall,
  type DriverFact,
  type DriverResult,
  type FactsModule
} from './p257/facts-driver.mts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(repoRoot, 'build', 'fixtures', 'facts');

/** The eight committed fixtures, one directory each. */
export const FIXTURES = ['ts-electron', 'ts-next', 'python', 'go', 'rust', 'ruby', 'swift', 'manifests'] as const;

interface RootSpec {
  name: string;
  root: string;
  arms: string[];
}

const spec = JSON.parse(process.argv[2] ?? '{"roots":[]}') as {
  roots: RootSpec[];
  checkout: string;
  scratch: string;
};

function importFrom(root: string, rel: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(join(root, rel)).href) as Promise<Record<string, unknown>>;
}

interface Loaded {
  facts: FactsModule & Record<string, unknown>;
  extractor: { extractAll: FactsModule['readFacts'] extends never ? never : (...a: never[]) => Promise<never> } & {
    extractAll(rel: string, text: string, ask?: { calls?: boolean; wrappers?: boolean }): Promise<{
      calls: DriverCall[];
      wrappers: never[];
      callsTruncated: boolean;
    }>;
    /**
     * PHASE 263. The whole answer, including `oid`, the identity of the bytes
     * THIS parse read. Rules F2, F3 and F4 are about that field, so the arms
     * below reach the same door the shared worker pool reaches rather than
     * `extractAll`, which never touches a file.
     */
    extractFile(
      rel: string,
      abs: string,
      ask?: { calls?: boolean; wrappers?: boolean }
    ): Promise<({ oid: string; mtimeMs: number; size: number; calls: DriverCall[]; callsTruncated: boolean } & Record<string, unknown>) | null>;
    dispose(): void;
  };
  db: Record<string, unknown>;
  settings: Record<string, unknown>;
}

async function load(root: string): Promise<Loaded> {
  const facts = (await importFrom(root, 'main/arch/facts/index.ts')) as Loaded['facts'];
  const extractMod = await importFrom(root, 'main/symbols/extract.ts');
  const SymbolExtractor = extractMod['SymbolExtractor'] as {
    create(o: { runtimeWasm: string; grammarPath: typeof grammarPath }): Promise<Loaded['extractor']>;
  };
  const extractor = await SymbolExtractor.create({ runtimeWasm: runtimeWasmPath(), grammarPath });
  const db = await importFrom(root, 'main/arch/db.ts');
  const settings = await importFrom(root, 'main/settings/store.ts');
  return { facts, extractor, db, settings };
}

/** One fixture or tree, read with the pass on or off, reported in the terms the gate pins. */
async function readAt(loaded: Loaded, root: string, files: readonly string[], wrapperPass: boolean): Promise<DriverResult> {
  return readTree({
    root,
    files,
    facts: loaded.facts,
    extractor: loaded.extractor,
    grammarFor,
    wrapperPass
  });
}

function summarize(r: DriverResult) {
  return {
    facts: r.facts,
    counts: {
      tracked: r.links.length,
      parsed: r.parsed,
      manifests: r.manifests,
      pathOnly: r.pathOnly,
      vendored: r.vendored,
      truncated: r.truncated,
      unread: r.unread,
      byCategory: countByCategory(r.facts),
      byRule: countByRule(r.facts)
    },
    wrapFacts: r.wrapFacts,
    wrapDigest: r.wrapDigest,
    wrapperMap: r.wrapperMap,
    wrapperCandidates: r.wrapperCandidates,
    vendoredFiles: r.links.filter((l) => l.vendored !== null).map((l) => ({ file: l.relPath, reason: l.vendored })),
    truncatedFiles: r.links.filter((l) => l.truncated).map((l) => l.relPath),
    ms: r.ms
  };
}

/** The invoke channels the product registers, read from the gated baseline. */
function baselineChannels(): string[] {
  const t = readFileSync(join(repoRoot, 'docs', 'audits', 'contract-baseline.txt'), 'utf8').split('\n');
  const out: string[] = [];
  let inSec = false;
  for (const l of t) {
    if (l.startsWith('[')) inSec = l.startsWith('[ipc.invoke.channels]');
    else if (inSec && l.trim() !== '' && !l.startsWith('#')) out.push(l.trim());
  }
  return out;
}

function recallAnswer(r: DriverResult, truth: readonly string[]) {
  const served = new Set(
    r.facts.filter((f) => f.kind === 'ipc-channel' && f.subject.startsWith('IPC serves ')).map((f) => f.subject.slice('IPC serves '.length))
  );
  const truthSet = new Set(truth);
  const found = truth.filter((t) => served.has(t)).length;
  const extras = [...served].filter((k) => !truthSet.has(k)).sort();
  const missing = truth.filter((t) => !served.has(t));
  return {
    truth: truth.length,
    found,
    extras: extras.length,
    extrasList: extras.slice(0, 50),
    missingList: missing.slice(0, 50),
    wrapFacts: r.wrapFacts,
    wrapperMap: r.wrapperMap,
    wrapperCandidates: r.wrapperCandidates,
    files: r.links.length,
    parsed: r.parsed,
    ms: r.ms,
    wrapperMs: r.wrapperMs
  };
}

type Answer = Record<string, unknown>;

async function runRoot(rs: RootSpec): Promise<Answer> {
  const answer: Answer = { name: rs.name };
  let loaded: Loaded | null = null;
  try {
    loaded = await load(rs.root);
    const F = loaded.facts;
    const arms = new Set(rs.arms);
    answer['ruleIds'] = [
      ...(F['CALL_RULES'] as { id: string }[]).map((r) => r.id),
      ...(F['LINE_RULES'] as { id: string }[]).map((r) => r.id)
    ];
    answer['emptyDigest'] = F.wrapperDigest(new Map());

    if (arms.has('fixtures')) {
      const fixtures: Record<string, unknown> = {};
      const fixturesOff: Record<string, unknown> = {};
      for (const name of FIXTURES) {
        const root = join(fixturesDir, name);
        const files = walkFiles(root);
        fixtures[name] = summarize(await readAt(loaded, root, files, true));
        const off = await readAt(loaded, root, files, false);
        fixturesOff[name] = { facts: off.facts, wrapFacts: off.wrapFacts };
      }
      answer['fixtures'] = fixtures;
      answer['fixturesOff'] = fixturesOff;
    }

    if (arms.has('recall')) {
      const src = join(spec.checkout, 'src');
      const files = walkFiles(src).map((f) => `src/${f}`);
      const r = await readAt(loaded, spec.checkout, files, true);
      answer['recall'] = recallAnswer(r, baselineChannels());
    }

    if (arms.has('symbols')) {
      const sub = join(spec.checkout, 'src', 'main', 'symbols');
      const files = walkFiles(sub)
        .filter((f) => !f.includes('__tests__'))
        .map((f) => `src/main/symbols/${f}`);
      const on = await readAt(loaded, spec.checkout, files, true);
      const off = await readAt(loaded, spec.checkout, files, false);
      answer['symbols'] = {
        files: files.length,
        on: on.facts.length,
        off: off.facts.length,
        same: JSON.stringify(on.facts) === JSON.stringify(off.facts),
        wrapFacts: on.wrapFacts,
        wrapperMap: on.wrapperMap
      };
    }

    if (arms.has('identity')) {
      const rel = 'src/main/spawn.ts';
      const text = readFileSync(join(fixturesDir, 'ts-electron', rel), 'utf8');
      const read = await loaded.extractor.extractAll(rel, text, { calls: true });
      const a = F.readFacts({ relPath: rel, lang: 'typescript', text, calls: read.calls });
      const b = F.readFacts({ relPath: rel, lang: 'typescript', text, calls: [...read.calls].reverse() });
      const srcRead = F.readFacts({ relPath: 'src/x.ts', lang: 'typescript', text, calls: read.calls });
      const testRead = F.readFacts({ relPath: 'test/x.test.ts', lang: 'typescript', text, calls: read.calls });
      const planted = Buffer.from('app.get("/facts", h);\n', 'utf8');
      // PHASE 263, rules F1 and F2. The extractor lives behind a directory
      // wall that forbids it importing the fact domain's `blobOid`, so it
      // carries a second spelling. That duplication is what makes the
      // publication guard a comparison between two independent readers rather
      // than a function agreeing with itself — and it is only worth anything
      // while the two answer the same. F1 asks the ROOT'S OWN second spelling
      // for the same constant rule 9 pins for the first. F2 asks `extractFile`
      // over a real file whether the identity it answers is the identity of
      // the bytes it read.
      const oidMod = await importFrom(rs.root, 'main/symbols/oid.ts');
      const symbolBlobOid = oidMod['symbolBlobOid'] as (buf: Buffer) => string;
      const parseDir = join(spec.scratch, `parse-${rs.name}`);
      mkdirSync(parseDir, { recursive: true });
      const parseAbs = join(parseDir, 'facts.ts');
      writeFileSync(parseAbs, planted);
      const parsed = await loaded.extractor.extractFile('src/facts.ts', parseAbs, { calls: true });
      answer['identity'] = {
        reversedSame: JSON.stringify(a) === JSON.stringify(b),
        facts: a.length,
        src: srcRead.map((f) => `${f.rule} ${f.subject}`),
        test: testRead.map((f) => `${f.rule} ${f.subject}`),
        oid: F.blobOid(planted),
        symbolOid: symbolBlobOid(planted),
        parsedOid: parsed === null ? null : parsed.oid,
        parsedTruth: F.blobOid(planted),
        parsedCalls: parsed === null ? -1 : parsed.calls.length
      };
    }

    if (arms.has('limits')) {
      const many = `${'f(\'x\');\n'.repeat(20_001)}`;
      const read = await loaded.extractor.extractAll('src/many.ts', many, { calls: true });
      const bigManifest = `{ "name": "big", "main": "./x.js", "pad": "${'x'.repeat(2 * 1024 * 1024 + 16)}" }`;
      const manifestFacts = F.readFacts({ relPath: 'package.json', lang: null, text: bigManifest, calls: [] });
      const smallManifest = F.readFacts({ relPath: 'package.json', lang: null, text: '{ "name": "s", "main": "./x.js" }', calls: [] });
      const longText = `child_process.spawn('${'a'.repeat(300)}');\n`;
      const longRead = await loaded.extractor.extractAll('src/long.ts', longText, { calls: true });
      const longFacts = F.readFacts({ relPath: 'src/long.ts', lang: 'typescript', text: longText, calls: longRead.calls });
      const r = await readTree({
        root: spec.scratch,
        files: [],
        facts: F,
        extractor: loaded.extractor,
        grammarFor,
        wrapperPass: false
      });
      answer['limits'] = {
        calls: read.calls.length,
        callsTruncated: read.callsTruncated,
        bigManifestFacts: manifestFacts.length,
        smallManifestFacts: smallManifest.length,
        longSubject: Math.max(0, ...longFacts.map((f) => f.subject.length)),
        longFacts: longFacts.length,
        driverEmpty: r.links.length
      };
    }

    if (arms.has('store')) {
      answer['store'] = await storeArm(loaded, rs.name);
    }

    if (arms.has('publish')) {
      answer['publish'] = await publishArm(loaded, rs.root, rs.name);
    }

    if (arms.has('completeness')) {
      answer['completeness'] = await completenessArm(loaded, rs.root, rs.name);
    }

    if (arms.has('setting')) {
      const S = loaded.settings;
      const sanitizeArch = S['sanitizeArchSettings'] as (raw: unknown) => { wrapperPass: boolean };
      const sanitizeAll = S['sanitizeSettings'] as (raw: unknown) => Record<string, unknown>;
      const dangerStateOf = S['dangerStateOf'] as (s: unknown) => unknown;
      const wrapperPassOn = F['wrapperPassOn'] as (arch: { wrapperPass: boolean }) => boolean;
      const base = sanitizeAll({});
      const withOn = { ...base, arch: { ...(base['arch'] as object), wrapperPass: true } };
      const withOff = { ...base, arch: { ...(base['arch'] as object), wrapperPass: false } };
      answer['setting'] = {
        absent: sanitizeArch({ enabled: true }).wrapperPass,
        yes: sanitizeArch({ enabled: true, wrapperPass: 'yes' }).wrapperPass,
        one: sanitizeArch({ enabled: true, wrapperPass: 1 }).wrapperPass,
        trueCase: sanitizeArch({ enabled: true, wrapperPass: true }).wrapperPass,
        sealSame: JSON.stringify(dangerStateOf(withOn)) === JSON.stringify(dangerStateOf(withOff)),
        readerOn: wrapperPassOn({ wrapperPass: true }),
        readerOff: wrapperPassOn({ wrapperPass: false })
      };
    }
  } catch (error) {
    answer['error'] = error instanceof Error ? `${error.message}\n${error.stack ?? ''}`.slice(0, 2000) : String(error);
  } finally {
    try {
      loaded?.extractor.dispose();
    } catch {
      /* best effort */
    }
  }
  return answer;
}

/** Rules 10 and 16 over a scratch ArchStore made from the root's own db.ts. */
async function storeArm(loaded: Loaded, name: string): Promise<Answer> {
  const ArchStore = loaded.db['ArchStore'] as new (path: string) => StoreLike;
  const dir = join(spec.scratch, `store-${name}`);
  mkdirSync(dir, { recursive: true });
  const store = new ArchStore(join(dir, 'arch.db'));
  const out: Answer = {};
  try {
    const OID_A = 'a'.repeat(40);
    const OID_B = 'b'.repeat(40);
    const draft = (over: Partial<ArchFactDraft>): ArchFactDraft => ({
      category: 'surface',
      kind: 'ipc-channel',
      subject: 'IPC serves arch:map',
      line: 12,
      rule: 'surface.ipc.electron',
      evidence: "ipcMain.handle('arch:map', fn)",
      ...over
    });
    const link = (relPath: string, oid: string) => ({
      relPath,
      oid,
      mtimeMs: 100,
      size: 20,
      lang: 'typescript',
      vendored: null,
      truncated: false,
      wrapDigest: null
    });

    // Rule 10: the closed sets, byte for byte, and the refusal that writes nothing.
    out['categories'] = ARCH_FACT_CATEGORIES;
    out['kinds'] = ARCH_FACT_KINDS;
    let refusal: string | null = null;
    try {
      store.saveFacts(OID_A, 'src/a.ts', [draft({}), draft({ category: 'boundary', kind: 'barrel' })]);
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
    store.linkFactFiles('k', [link('src/a.ts', OID_A)]);
    out['refusal'] = refusal;
    out['writtenAfterRefusal'] = store.facts('k').length;

    // Rule 10: the two boundary readers over the ts-electron fixture's rows.
    const fixture = (await readAt(loaded, join(fixturesDir, 'ts-electron'), walkFiles(join(fixturesDir, 'ts-electron')), true));
    const byFile = new Map<string, DriverFact[]>();
    for (const f of fixture.facts) {
      if (f.viaWrapper) continue;
      const list = byFile.get(f.file) ?? [];
      list.push(f);
      byFile.set(f.file, list);
    }
    const links = fixture.links.map((l) => ({ ...l, mtimeMs: 1 }));
    for (const l of links) {
      store.saveFacts(l.oid, l.relPath, (byFile.get(l.relPath) ?? []).map(({ file: _f, viaWrapper: _w, ...d }) => d));
    }
    store.linkFactFiles('fixture', links);
    const starts = store.boundaryStarts('fixture');
    const roots = store.moduleRoots('fixture');
    const boundary = store.facts('fixture').filter((f) => f.category === 'boundary');
    const startKeys = new Set(starts.map((f) => `${f.file}:${f.line}:${f.subject}`));
    out['boundary'] = {
      starts: starts.length,
      startKinds: [...new Set(starts.map((f) => f.kind))].sort(),
      roots: roots.length,
      rootKinds: [...new Set(roots.map((f) => f.kind))].sort(),
      all: boundary.length,
      disjoint: roots.every((f) => !startKeys.has(`${f.file}:${f.line}:${f.subject}`)),
      union: starts.length + roots.length === boundary.length,
      expectedStartKinds: [...ARCH_BOUNDARY_START_KINDS],
      moduleRootKind: ARCH_MODULE_ROOT_KIND
    };

    // Rule 16: the round trip.
    store.saveFacts(OID_B, 'src/shared.ts', [draft({ line: 30, subject: 'IPC serves z' }), draft({ line: 2, subject: 'IPC serves a' })]);
    store.saveWrapperDecls(OID_B, 'src/shared.ts', [
      { name: 'handle', innerCallee: 'ipc.handle', innerLast: 'handle', paramIndex: 1, innerIndex: 0, hops: 1, line: 4 }
    ]);
    store.linkFactFiles('r1', [{ ...link('src/shared.ts', OID_B), mtimeMs: 1.5, size: 9, truncated: true, wrapDigest: 'd'.repeat(64) }]);
    store.linkFactFiles('r2', [link('src/shared.ts', OID_B)]);
    const stamp = store.factStamps('r1').get('src/shared.ts');
    const sorted = store.facts('r1').map((f) => f.line);
    store.forgetFactFiles('r1', ['src/shared.ts']);
    const prunedFirst = store.pruneUnlinkedFacts();
    const keptForR2 = store.facts('r2').length;
    const declsKept = store.wrapperDecls([{ oid: OID_B, relPath: 'src/shared.ts' }]).size;
    store.forgetFactFiles('r2', ['src/shared.ts']);
    const prunedSecond = store.pruneUnlinkedFacts();
    const gone = !store.hasFactsFor(OID_B, 'src/shared.ts');
    store.linkFactFiles('w', [link('src/w.ts', OID_A)]);
    store.saveWrapFacts('w', 'src/w.ts', [draft({ rule: 'x+wrap', subject: 'IPC serves one' }), draft({ rule: 'x+wrap', subject: 'IPC serves two', line: 13 })]);
    store.saveWrapFacts('w', 'src/w.ts', [draft({ rule: 'x+wrap', subject: 'IPC serves one' })]);
    const wrapAfterReplace = store.facts('w');
    out['roundTrip'] = {
      stamp,
      sorted,
      prunedFirst,
      keptForR2,
      declsKept,
      prunedSecond,
      gone,
      wrapCount: wrapAfterReplace.length,
      wrapVia: wrapAfterReplace.every((f) => f.viaWrapper),
      counts: store.factCounts('w')
    };
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}


// ---------------------------------------------------------------------------
// PHASE 263, rules F3 and F4. The publication windows.
// ---------------------------------------------------------------------------
// The path under a fact pass is read THREE times: once by the pass for the oid
// the row is keyed on, once by the PARSER for the calls and the symbols, and
// once again by the pass for the text the rules are read over. Only the outer
// two were ever compared, so a change followed by a REVERT around the parser's
// read left them agreeing while the parser had seen something else.
//
// There are therefore TWO windows and two guards, and this arm drives them one
// at a time so that ablating either alone goes red. That is the whole point of
// driving both: a single scenario would let one guard cover for the other and
// the gate would call a redundant pair proved.
//
//   worker window  the racing seam rewrites the file BEFORE it parses and puts
//                  it back before it answers. The pass's own two reads agree;
//                  only the answer's identity disagrees.
//   reader window  the seam parses the real bytes and rewrites the file AFTER
//                  it answers. The answer's identity agrees; only the pass's
//                  third read disagrees.
//
// Each carries a control, because a refusal with no control might be refusing
// everything. F4 is the same question in the wrapper pass, whose step 1 caches
// declarations BY OID and so shares a wrong one with every other repository.
// ---------------------------------------------------------------------------

/**
 * A seam over one extractor, the shape `sharedFactParser()` gives the pass.
 *
 * `asks` counts what the pass actually ASKED FOR, split by whether it wanted
 * wrappers, because every refusal below has to be proved to have refused
 * something: a scenario where the pass never reached the parser at all would
 * read exactly like a guard working, and the pins assert the counts.
 */
function seamOver(loaded: Loaded, around?: (phase: 'before' | 'after', wrappers: boolean) => void) {
  const asks = { withWrappers: 0, withoutWrappers: 0 };
  const parser = {
    batchSize: 4,
    async run(
      files: readonly { relPath: string; absPath: string }[],
      ask: { calls: true; wrappers: boolean }
    ): Promise<unknown[]> {
      if (ask.wrappers) asks.withWrappers += 1;
      else asks.withoutWrappers += 1;
      around?.('before', ask.wrappers);
      const out: unknown[] = [];
      try {
        for (const file of files) {
          const got = await loaded.extractor.extractFile(file.relPath, file.absPath, ask);
          if (got !== null) out.push({ relPath: file.relPath, ...got });
        }
      } finally {
        around?.('after', ask.wrappers);
      }
      return out;
    }
  };
  return { parser, asks };
}

async function publishArm(loaded: Loaded, root: string, name: string): Promise<Answer> {
  const treeMod = await importFrom(root, 'main/arch/tree-facts.ts');
  const readArchTreeFacts = treeMod['readArchTreeFacts'] as (input: Record<string, unknown>) => Promise<unknown>;
  const ArchStore = loaded.db['ArchStore'] as new (path: string) => StoreLike;
  const F = loaded.facts;
  const dir = join(spec.scratch, `publish-${name}`);
  mkdirSync(dir, { recursive: true });
  const store = new ArchStore(join(dir, 'arch.db'));
  const REL = 'src/main/sample.ts';
  const out: Answer = {};
  try {
    const repo = (key: string, text: string): string => {
      const repoPath = join(dir, key);
      mkdirSync(join(repoPath, 'src', 'main'), { recursive: true });
      writeFileSync(join(repoPath, REL), text);
      return repoPath;
    };
    const scan = (repoPath: string, repoKey: string, parser: unknown, wrapperPass: boolean) =>
      readArchTreeFacts({ repoPath, repoKey, store, parser, trackedFiles: [REL], wrapperPass });
    const surfaces = (repoKey: string): string[] =>
      store.facts(repoKey).filter((f) => f.category === 'surface').map((f) => f.subject);
    const wrapSubjects = (repoKey: string): string[] =>
      store.facts(repoKey).filter((f) => f.viaWrapper).map((f) => f.subject);
    const linked = (repoKey: string): boolean => store.factStamps(repoKey).has(REL);
    const stampDigest = (repoKey: string): string | null => {
      const stamp = store.factStamps(repoKey).get(REL) as { wrapDigest?: string | null } | undefined;
      return stamp?.wrapDigest ?? null;
    };

    // Each scenario gets its OWN bytes. `hasFactsFor` answers off (oid,
    // relPath) alone, so two scenarios sharing one store, one path and one
    // text would let the second be answered from the first's row without ever
    // reaching the parser — which is the very sharing F3 exists to protect,
    // and which would make the second scenario prove nothing.

    // The worker window: rewritten BEFORE the parse and put back before the
    // answer, so the pass's own two reads agree and only the answer disagrees.
    {
      const before = "ipcMain.handle('facts:w-before', f);\n";
      const middle = "ipcMain.handle('facts:w-middle', f);\n";
      const repoPath = repo('worker-window', before);
      const abs = join(repoPath, REL);
      const racing = seamOver(loaded, (phase) => {
        writeFileSync(abs, phase === 'before' ? middle : before);
      });
      await scan(repoPath, 'worker-window', racing.parser, false);
      const first = surfaces('worker-window');
      const stillLinked = linked('worker-window');
      const clean = seamOver(loaded);
      await scan(repoPath, 'worker-window', clean.parser, false);
      out['workerWindow'] = {
        first,
        linked: stillLinked,
        afterClean: surfaces('worker-window'),
        asked: racing.asks.withWrappers + racing.asks.withoutWrappers,
        reparsed: clean.asks.withWrappers + clean.asks.withoutWrappers
      };
    }

    // The reader window: parsed over the real bytes, rewritten AFTER the
    // answer, so only the pass's third read disagrees.
    {
      const before = "ipcMain.handle('facts:r-before', f);\n";
      const middle = "ipcMain.handle('facts:r-middle', f);\n";
      const repoPath = repo('reader-window', before);
      const abs = join(repoPath, REL);
      const racing = seamOver(loaded, (phase) => {
        if (phase === 'after') writeFileSync(abs, middle);
      });
      await scan(repoPath, 'reader-window', racing.parser, false);
      const first = surfaces('reader-window');
      const stillLinked = linked('reader-window');
      writeFileSync(abs, before);
      const clean = seamOver(loaded);
      await scan(repoPath, 'reader-window', clean.parser, false);
      out['readerWindow'] = {
        first,
        linked: stillLinked,
        afterClean: surfaces('reader-window'),
        asked: racing.asks.withWrappers + racing.asks.withoutWrappers,
        reparsed: clean.asks.withWrappers + clean.asks.withoutWrappers
      };
    }

    // The control beside them: a steady file publishes and is then reused
    // without a parse at all, which is what proves neither guard refuses
    // everything.
    {
      const steady = "ipcMain.handle('facts:steady', f);\n";
      const repoPath = repo('steady', steady);
      const honest = seamOver(loaded);
      await scan(repoPath, 'steady', honest.parser, false);
      const first = surfaces('steady');
      const again = seamOver(loaded);
      await scan(repoPath, 'steady', again.parser, false);
      out['control'] = {
        first,
        linked: linked('steady'),
        asked: honest.asks.withWrappers + honest.asks.withoutWrappers,
        reparsed: again.asks.withWrappers + again.asks.withoutWrappers,
        second: surfaces('steady')
      };
    }

    // F4, the wrapper pass's STEP 1. Its declarations are cached BY OID and it
    // had no identity check of any kind, so a racing answer there is shared
    // with every repository holding the same bytes. The first scan runs with
    // the pass OFF so the link carries no digest, which is what puts the file
    // in step 1's `unread` list on the second.
    {
      const base = "ipcMain.handle('facts:wrapbase', f);\n";
      const racingText = "export function serve(name, f) { ipcMain.handle(name, f); }\nserve('facts:w1-injected', g);\n";
      const repoPath = repo('wrap-race', base);
      const abs = join(repoPath, REL);
      await scan(repoPath, 'wrap-race', seamOver(loaded).parser, false);
      const racing = seamOver(loaded, (phase) => {
        writeFileSync(abs, phase === 'before' ? racingText : base);
      });
      await scan(repoPath, 'wrap-race', racing.parser, true);
      const oid = F.blobOid(Buffer.from(base, 'utf8'));
      const decls = store.wrapperDecls([{ oid, relPath: REL }]).get(REL) ?? [];
      out['wrapperRace'] = {
        decls: (decls as { name: string }[]).map((d) => d.name),
        digest: stampDigest('wrap-race'),
        subjects: surfaces('wrap-race'),
        wrapSubjects: wrapSubjects('wrap-race'),
        asked: racing.asks.withWrappers
      };
    }
    {
      const steady = "export function serve(name, f) { ipcMain.handle(name, f); }\nserve('facts:w1-wrapped', g);\n";
      const repoPath = repo('wrap-steady', steady);
      await scan(repoPath, 'wrap-steady', seamOver(loaded).parser, false);
      const honest = seamOver(loaded);
      await scan(repoPath, 'wrap-steady', honest.parser, true);
      const oid = F.blobOid(Buffer.from(steady, 'utf8'));
      const decls = store.wrapperDecls([{ oid, relPath: REL }]).get(REL) ?? [];
      out['wrapperControl'] = {
        decls: (decls as { name: string }[]).map((d) => d.name),
        digest: stampDigest('wrap-steady'),
        wrapSubjects: wrapSubjects('wrap-steady'),
        asked: honest.asks.withWrappers
      };
    }

    // F4's second half: the wrapper pass's STEP 3, which re-asks a file whose
    // cached wrapper-only facts were computed under a map that has moved. Its
    // answer is read over step 4's own bytes, so it has a window of its own.
    {
      const xBefore = "export function serve(name, f) { ipcMain.handle(name, f); }\nserve('facts:s3-x', g);\n";
      const xRacing = "export function serve(name, f) { ipcMain.handle(name, f); }\nserve('facts:s3-injected', g);\n";
      const yBefore = "ipcMain.handle('facts:s3-y', f);\n";
      const yAfter = "export function relay(name, f) { ipcMain.handle(name, f); }\nrelay('facts:s3-y2', g);\n";
      const repoPath = join(dir, 'step3');
      mkdirSync(join(repoPath, 'src', 'main'), { recursive: true });
      const xAbs = join(repoPath, 'src/main/x.ts');
      const yAbs = join(repoPath, 'src/main/y.ts');
      writeFileSync(xAbs, xBefore);
      writeFileSync(yAbs, yBefore);
      const tracked = ['src/main/x.ts', 'src/main/y.ts'];
      const pass = (parser: unknown) =>
        readArchTreeFacts({ repoPath, repoKey: 'step3', store, parser, trackedFiles: tracked, wrapperPass: true });
      await pass(seamOver(loaded).parser);
      // Y gains a declaration of its own, so the closed map's digest moves and
      // X — untouched, reused, and holding wrapper-only facts computed under
      // the old map — is what step 3 re-asks.
      writeFileSync(yAbs, yAfter);
      // Step 3 is the one ask that wants NO wrappers; the base pass and step 1
      // both ask with them on, which is how the seam tells them apart.
      const racing = seamOver(loaded, (phase, wrappers) => {
        if (wrappers) return;
        writeFileSync(xAbs, phase === 'before' ? xRacing : xBefore);
      });
      await pass(racing.parser);
      out['step3'] = {
        wrapSubjects: wrapSubjects('step3'),
        surfaces: surfaces('step3'),
        asked: racing.asks.withoutWrappers
      };
    }
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// PHASE 264. Completeness travels with the BYTES, not with the repository.
// ---------------------------------------------------------------------------
// The reuse arm reconstructed `truncated` from `carried`, this repository's own
// previous link. A SECOND repository holding the same bytes had no `carried`,
// so a declined parse read as fully complete (audit 0.103.0 R2). The fix records
// completeness on a bytes-keyed `arch_fact_scan` row written inside `saveFacts`'s
// own transaction, and the reuse arm reads it by identity; when no row exists
// (unknown completeness) it RE-PARSES rather than assume complete.
//
// This arm drives that, WITHOUT a 2 MiB file — it seeds a repository's truncated
// result directly through `saveFacts(..., { truncated: true })` (which is the
// only place a real truncated result is ever recorded) and reads it back from a
// second repository over the same bytes through the real `readArchTreeFacts`
// reuse arm. Four observables, each the target of one ablation:
//   reuseTruncated   the second repository recovered truncated:true by identity
//   scanRowTruncated the bytes-keyed row itself reads truncated:1
//   reopenTruncated  a third repository after a close + REOPEN still reads it
//   unknownReparsed  a link-only (unknown-completeness) seed is RE-PARSED, so the
//                    conservative arm asked the parser rather than assuming complete
async function completenessArm(loaded: Loaded, root: string, name: string): Promise<Answer> {
  const treeMod = await importFrom(root, 'main/arch/tree-facts.ts');
  const readArchTreeFacts = treeMod['readArchTreeFacts'] as (input: Record<string, unknown>) => Promise<unknown>;
  const ArchStore = loaded.db['ArchStore'] as new (path: string) => StoreLike;
  const F = loaded.facts;
  const dir = join(spec.scratch, `completeness-${name}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, 'arch.db');
  const REL = 'src/main/sample.ts';
  const REL2 = 'src/main/other.ts';
  const out: Answer = {};
  const repo = (key: string, relPath: string, text: string): string => {
    const repoPath = join(dir, key);
    mkdirSync(join(repoPath, 'src', 'main'), { recursive: true });
    writeFileSync(join(repoPath, relPath), text);
    return repoPath;
  };
  const truncatedOf = (store: StoreLike, repoKey: string, relPath: string): boolean | undefined =>
    (store.factStamps(repoKey).get(relPath) as { truncated: boolean } | undefined)?.truncated;
  const link = (relPath: string, oid: string, size: number) => ({
    relPath,
    oid,
    mtimeMs: 1,
    size,
    lang: 'typescript',
    vendored: null,
    truncated: false,
    wrapDigest: null
  });

  let store = new ArchStore(dbPath);
  try {
    // A repository recorded these bytes as truncated (the only real producer of
    // a truncated result is a declined/ceiling parse reaching saveFacts).
    const truncText = "ipcMain.handle('facts:trunc', f);\n";
    const oidT = F.blobOid(Buffer.from(truncText, 'utf8'));
    store.saveFacts(
      oidT,
      REL,
      [
        {
          category: 'surface',
          kind: 'ipc-channel',
          subject: 'IPC serves facts:trunc',
          line: 1,
          rule: 'surface.ipc.electron',
          evidence: truncText.trim()
        }
      ],
      { truncated: true }
    );
    // A SECOND repository over the same bytes: the reuse arm must recover
    // truncated:true by identity, with no link of its own.
    const repoB = repo('B', REL, truncText);
    await readArchTreeFacts({
      repoPath: repoB,
      repoKey: 'B',
      store,
      parser: seamOver(loaded).parser,
      trackedFiles: [REL],
      wrapperPass: false
    });
    out['reuseTruncated'] = truncatedOf(store, 'B', REL) ?? null;
    out['scanRowTruncated'] = store.factScan(oidT, REL)?.truncated ?? null;

    // Survives a close + reopen: a third repository still reads it off disk.
    store.close();
    store = new ArchStore(dbPath);
    const repoC = repo('C', REL, truncText);
    await readArchTreeFacts({
      repoPath: repoC,
      repoKey: 'C',
      store,
      parser: seamOver(loaded).parser,
      trackedFiles: [REL],
      wrapperPass: false
    });
    out['reopenTruncated'] = truncatedOf(store, 'C', REL) ?? null;

    // Unknown completeness must RE-PARSE, never assume complete. A link-only
    // seed makes hasFactsFor true with no bytes-keyed completeness row, so the
    // reuse arm's conservative branch must fall through and ask the parser.
    const unknownText = "ipcMain.handle('facts:unknown', f);\n";
    const oidU = F.blobOid(Buffer.from(unknownText, 'utf8'));
    store.linkFactFiles('seedU', [link(REL2, oidU, unknownText.length)]);
    const repoD = repo('D', REL2, unknownText);
    const seam = seamOver(loaded);
    await readArchTreeFacts({
      repoPath: repoD,
      repoKey: 'D',
      store,
      parser: seam.parser,
      trackedFiles: [REL2],
      wrapperPass: false
    });
    out['unknownReparsed'] = seam.asks.withoutWrappers > 0;
    out['unknownPublished'] = store
      .facts('D')
      .filter((f) => f.category === 'surface')
      .map((f) => f.subject);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

interface StoreLike {
  saveFacts(
    oid: string,
    relPath: string,
    facts: readonly ArchFactDraft[],
    completeness?: { truncated: boolean }
  ): void;
  factScan(oid: string, relPath: string): { truncated: boolean } | undefined;
  saveWrapperDecls(oid: string, relPath: string, decls: readonly unknown[]): void;
  wrapperDecls(files: readonly { oid: string; relPath: string }[]): Map<string, unknown[]>;
  linkFactFiles(repoKey: string, rows: readonly unknown[]): void;
  saveWrapFacts(repoKey: string, relPath: string, facts: readonly ArchFactDraft[]): void;
  forgetFactFiles(repoKey: string, relPaths: readonly string[]): void;
  pruneUnlinkedFacts(): number;
  hasFactsFor(oid: string, relPath: string): boolean;
  factStamps(repoKey: string): Map<string, unknown>;
  facts(repoKey: string): (DriverFact & { viaWrapper: boolean })[];
  factCounts(repoKey: string): unknown;
  boundaryStarts(repoKey: string): DriverFact[];
  moduleRoots(repoKey: string): DriverFact[];
  close(): void;
}

const answers: Record<string, Answer> = {};
for (const rs of spec.roots) {
  answers[rs.name] = await runRoot(rs);
}
process.stdout.write(`${JSON.stringify(answers)}\n`);
