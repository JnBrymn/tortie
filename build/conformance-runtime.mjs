#!/usr/bin/env node
/**
 * conformance-runtime.mjs. The TypeScript runner loads each module ONCE, and
 * the declared range predicts which runtimes that is true on (Phase 262).
 *
 * ## Why this gate exists
 *
 * The 2026-09-12 audit's R4 finding: the control-deadline probe's driver
 * registered a machine and then could not find it again. The registry is a
 * module-level `Map` in src/main/machines/context.ts, and on some runtimes the
 * driver was holding two of them. The cause is tsx's own `moduleRegisterHooks`
 * feature gate, not Tortie's code and not Node's behaviour: above a measured
 * floor tsx installs ONE synchronous `module.registerHooks()` loader that
 * serves the import path and the require path from a single instance, and
 * below it tsx falls back to an async ESM hook plus a separate CJS path, which
 * is two loaders, two module instances and two copies of every module-level
 * Map. A check that runs there can pass or fail for the wrong reason.
 *
 * `build/verification-checks.mjs` carries the floors and refuses below them,
 * and `npm run gate:checks` keeps that declaration, `package.json`'s
 * `engines.node` and `.nvmrc` saying one thing. This gate is the MEASUREMENT
 * behind all three, and it is the one to re-run when tsx is upgraded.
 *
 * ## What it does, in about 4 seconds, launching no Electron
 *
 *  1. Runs the committed regression `build/p262-registry-loader.mts` through
 *     the pinned tsx on the runtime this gate is running on, and asserts its
 *     three readings — direct lookup, control-plane lookup and registration
 *     identity — are all true. One registration identity is the whole claim.
 *  2. RE-DERIVES rather than trusts: asserts `nodeIsSupported()` predicts that
 *     outcome. Agreement between the prediction and the measurement is the
 *     check, in both directions.
 *  3. Finds the other Node binaries already on this machine, at a small fixed
 *     list of conventional locations, and repeats 1 and 2 under each. A line
 *     that is not installed is REPORTED AND SKIPPED, never a failure: no
 *     machine is required to hold five Node installs, and a gate that demands
 *     one is a gate that is red everywhere but here.
 *
 * It installs nothing. Every child is a foreground `spawnSync` with a timeout,
 * so nothing is left running: there is no Electron, no tmux, no ssh and no
 * background process in this file, and `gate:electron` and `gate:background`
 * have nothing to hold. Keep it that way.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tsxCli } from './ts-runner.mjs';
import {
  SUPPORTED_NODE,
  nodeIsSupported,
  supportedNodeRange
} from './verification-checks.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = 'build/p262-registry-loader.mts';
const CHILD_TIMEOUT_MS = 120_000;

const failures = [];
const fail = (message) => failures.push(message);

// ---------------------------------------------------------------------------
// The runtimes this machine already has
// ---------------------------------------------------------------------------

/** Every entry of `dir`, joined, or nothing when the directory is absent. */
function childrenOf(dir) {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

/**
 * The conventional locations, as a fixed list. Nothing is installed and no
 * version manager is invoked; a location that holds no node is skipped.
 * `os.homedir()` honours HOME, which is why it is used rather than the passwd
 * entry.
 */
function candidateRuntimes() {
  const out = [{ label: 'the runtime this gate is running on', bin: process.execPath }];
  const nvmRoot = join(homedir(), '.nvm', 'versions', 'node');
  for (const version of childrenOf(nvmRoot)) {
    out.push({ label: `nvm ${version}`, bin: join(nvmRoot, version, 'bin', 'node') });
  }
  for (const kegName of childrenOf('/opt/homebrew/opt')) {
    if (!/^node(@\d+)?$/.test(kegName)) continue;
    out.push({
      label: `homebrew ${kegName}`,
      bin: join('/opt/homebrew/opt', kegName, 'bin', 'node')
    });
  }
  out.push({ label: 'homebrew node', bin: '/opt/homebrew/bin/node' });
  out.push({ label: '/usr/local', bin: '/usr/local/bin/node' });
  return out;
}

/** `process.versions.node` as that binary itself reports it, or null. */
function versionOf(bin) {
  const seen = spawnSync(bin, ['-p', 'process.versions.node'], {
    encoding: 'utf8',
    timeout: CHILD_TIMEOUT_MS
  });
  if (seen.status !== 0 || typeof seen.stdout !== 'string') return null;
  const version = seen.stdout.trim();
  return /^\d+\.\d+\.\d+/.test(version) ? version : null;
}

// The same binary reached by two paths is one runtime, so the matrix is keyed
// by what the path resolves to rather than by the path.
const runtimes = [];
const seenReal = new Set();
const skipped = [];
for (const candidate of candidateRuntimes()) {
  if (!existsSync(candidate.bin)) {
    skipped.push(`${candidate.label} — no node at ${candidate.bin}`);
    continue;
  }
  let real;
  try {
    real = realpathSync(candidate.bin);
  } catch {
    skipped.push(`${candidate.label} — ${candidate.bin} cannot be resolved`);
    continue;
  }
  if (seenReal.has(real)) continue;
  const version = versionOf(candidate.bin);
  if (version === null) {
    skipped.push(`${candidate.label} — ${candidate.bin} does not report a version`);
    continue;
  }
  seenReal.add(real);
  runtimes.push({ ...candidate, version, isSelf: real === realpathSync(process.execPath) });
}

// ---------------------------------------------------------------------------
// The fixture, under each of them
// ---------------------------------------------------------------------------

const runner = tsxCli();

/** One reading of the registry fixture under `bin`. */
function runFixture(bin) {
  const seen = spawnSync(
    bin,
    [runner, '--tsconfig', 'tsconfig.node.json', FIXTURE],
    { cwd: repoRoot, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS }
  );
  let reading = null;
  for (const line of String(seen.stdout ?? '').split('\n')) {
    const text = line.trim();
    if (!text.startsWith('{')) continue;
    try {
      reading = JSON.parse(text);
    } catch {
      /* not the JSON line */
    }
  }
  return { status: seen.status, reading, stderr: String(seen.stderr ?? '') };
}

const rows = [];
for (const runtime of runtimes) {
  const { status, reading, stderr } = runFixture(runtime.bin);
  const predicted = nodeIsSupported(runtime.version);
  const measured = status === 0;
  rows.push({ ...runtime, predicted, measured, reading });

  if (status === null) {
    fail(
      `the fixture did not finish under ${runtime.version} (${runtime.label}). ` +
        `Nothing is left running, but nothing was measured either.`
    );
    continue;
  }
  if (reading === null) {
    fail(
      `the fixture printed no JSON line under ${runtime.version} ` +
        `(${runtime.label}). It prints exactly one, and this gate parses it. ` +
        `stderr began: ${stderr.split('\n')[0] ?? ''}`
    );
    continue;
  }
  if (predicted !== measured) {
    fail(
      `the declared range and the measurement disagree on ${runtime.version} ` +
        `(${runtime.label}). nodeIsSupported() says ${String(predicted)} and ` +
        `the fixture exited ${String(status)} with direct=` +
        `${String(reading.direct)}, plane=${String(reading.plane)}, ` +
        `identity=${String(reading.identity)} (${String(reading.identityDetail)}). ` +
        `SUPPORTED_NODE is tsx's own table and a tsx upgrade moves it: ` +
        `re-measure it in build/verification-checks.mjs rather than widening ` +
        `the range to fit.`
    );
    continue;
  }
  if (predicted && !(reading.direct && reading.plane && reading.identity)) {
    fail(
      `${runtime.version} (${runtime.label}) is inside ` +
        `${supportedNodeRange()} and the registry still split: direct=` +
        `${String(reading.direct)}, plane=${String(reading.plane)}, ` +
        `identity=${String(reading.identity)} (${String(reading.identityDetail)}).`
    );
  }
}

// The runtime this gate is on must itself be one of the good ones. It cannot
// be anything else — `tsxCli()` above refuses first — so this is the assertion
// that the refusal is the reason, rather than an accident of the matrix.
const self = rows.find((row) => row.isSelf);
if (self === undefined) {
  fail('this gate did not measure the runtime it is running on.');
} else if (!self.measured) {
  fail(
    `this gate is running on ${self.version}, where the fixture fails. The ` +
      `preflight in build/verification-checks.mjs should have refused before ` +
      `this line was reached.`
  );
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const yesNo = (value) => (value ? 'yes' : 'no ');
process.stdout.write(
  `conformance:runtime: the range is ${supportedNodeRange()}, from the ` +
    `floors ${JSON.stringify(SUPPORTED_NODE)}.\n\n`
);
process.stdout.write(
  '  runtime     predicted  exit  direct  plane  identity  where\n'
);
for (const row of rows) {
  process.stdout.write(
    `  ${row.version.padEnd(11)} ${yesNo(row.predicted)}        ` +
      `${String(row.measured ? 0 : 1)}     ${yesNo(row.reading?.direct)}     ` +
      `${yesNo(row.reading?.plane)}    ${yesNo(row.reading?.identity)}       ` +
      `${row.label}\n`
  );
}
for (const one of skipped) process.stdout.write(`  (skipped) ${one}\n`);

if (failures.length > 0) {
  process.stderr.write('\nconformance:runtime: FAIL\n\n');
  for (const message of failures) process.stderr.write(`  - ${message}\n`);
  process.exit(1);
}

process.stdout.write(
  `\nconformance:runtime: PASS. ${String(rows.length)} runtime(s) measured, ` +
    `${String(rows.filter((row) => row.measured).length)} of them loading each ` +
    `module once, and the declared range predicted every one.\n`
);
