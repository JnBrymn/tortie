/**
 * `captureLoginShellEnvNames` — the login shell's exported NAMES (Phase 269).
 *
 * It is the Phase 33 probe's shape with one difference that is the whole
 * point: the script asks `awk` for the KEYS of its environment and prints
 * nothing else, so a value never enters this process at all. These tests hold
 * that difference to the wire rather than to a comment — the fake shells below
 * export a sentinel VALUE the probe must never be able to report, and every
 * assertion reads the whole answer as JSON looking for it.
 *
 * The failure modes are the PATH probe's, because the shape is the PATH
 * probe's: a shell that never exits is killed on the deadline and leaves no
 * survivor, a shell that prints no markers is a failed probe rather than a
 * machine with no variables, and nothing ever rejects.
 *
 * NO REAL PROVIDER KEY APPEARS HERE. `P269_TEST_VALUE` is invented for this
 * file, and it exists so that finding it anywhere is a failure.
 */

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() }
}));

import { captureLoginShellEnvNames } from '../resolve';

/** Invented for this file. Its only job is to be findable, and never found. */
const SENTINEL = 'P269_TEST_VALUE';

let root = '';

/** A shell that exports what the test asks for, then runs the -c command. */
function fakeShell(name: string, body: string): string {
  const shell = join(root, name);
  writeFileSync(
    shell,
    '#!/bin/sh\n' +
      `${body}\n` +
      '# the last argument is the -c command\n' +
      'for last; do :; done\n' +
      'eval "$last"\n'
  );
  chmodSync(shell, 0o755);
  return shell;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gmux-p269-names-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('captureLoginShellEnvNames', () => {
  it('reads the names the shell exports, and NO value', async () => {
    const shell = fakeShell(
      'names-shell',
      `export P269_ALPHA=${SENTINEL}\nexport P269_BETA=${SENTINEL}\n` +
        'echo "rc noise from a chatty startup file"'
    );
    const out = await captureLoginShellEnvNames({ shell, timeoutMs: 5000 });
    assert.equal(out.probeFailed, false);
    assert.ok(out.names.includes('P269_ALPHA'), 'P269_ALPHA was not offered');
    assert.ok(out.names.includes('P269_BETA'), 'P269_BETA was not offered');
    // The claim of the whole module, asserted over the WHOLE answer.
    assert.ok(
      !JSON.stringify(out).includes(SENTINEL),
      'a value reached the answer'
    );
  });

  it('answers sorted and de-duplicated', async () => {
    const shell = fakeShell(
      'sorted-shell',
      'export P269_ZULU=1\nexport P269_ALPHA=1\nexport P269_MIKE=1'
    );
    const out = await captureLoginShellEnvNames({ shell, timeoutMs: 5000 });
    assert.deepEqual([...out.names].sort(), out.names);
    assert.equal(new Set(out.names).size, out.names.length);
  });

  it('cannot be forged by rc noise, because the markers frame the answer', async () => {
    // A startup file that prints a plausible name list of its own, before the
    // real one. Only what sits between the two nonce markers is read.
    const shell = fakeShell(
      'forge-shell',
      'echo "P269_FORGED"\necho "ANTHROPIC_API_KEY"\nexport P269_REAL=1'
    );
    const out = await captureLoginShellEnvNames({ shell, timeoutMs: 5000 });
    assert.ok(out.names.includes('P269_REAL'));
    assert.ok(!out.names.includes('P269_FORGED'), 'rc noise forged a name');
  });

  it('drops a name longer than the cap rather than offering it', async () => {
    const long = `P269_${'X'.repeat(80)}`;
    const shell = fakeShell('long-shell', `export ${long}=1\nexport P269_OK=1`);
    const out = await captureLoginShellEnvNames({ shell, timeoutMs: 5000 });
    assert.ok(out.names.includes('P269_OK'));
    assert.ok(!out.names.includes(long));
  });

  it('a missing shell is probeFailed, never a reject', async () => {
    const out = await captureLoginShellEnvNames({
      shell: join(root, 'no-such-shell'),
      timeoutMs: 500
    });
    assert.equal(out.probeFailed, true);
    assert.deepEqual(out.names, []);
  });

  it('a shell that prints no markers is a failed probe, not an empty machine', async () => {
    const shell = join(root, 'silent-shell');
    writeFileSync(shell, '#!/bin/sh\necho "not a marker in sight"\n');
    chmodSync(shell, 0o755);
    const out = await captureLoginShellEnvNames({ shell, timeoutMs: 2000 });
    assert.equal(out.probeFailed, true);
    assert.deepEqual(out.names, []);
  });

  it('kills a shell that never exits, on the deadline, leaving no survivor', async () => {
    // It prints nothing and sleeps far past the deadline. The answer must come
    // from the timer, and the process group must be gone afterwards.
    const shell = join(root, 'hang-shell');
    writeFileSync(
      shell,
      '#!/bin/sh\necho "p269-hanging-shell-marker"\nsleep 120\n'
    );
    chmodSync(shell, 0o755);
    const started = Date.now();
    const out = await captureLoginShellEnvNames({ shell, timeoutMs: 700 });
    assert.equal(out.probeFailed, true);
    assert.ok(Date.now() - started < 10_000, 'the deadline did not fire');
    // Give the group kill a moment to land, then count survivors by the
    // marker only this test's shell prints.
    await new Promise((r) => setTimeout(r, 400));
    const ps = execFileSync('/bin/ps', ['-Ao', 'command='], {
      encoding: 'utf8'
    });
    const survivors = ps
      .split('\n')
      .filter((line) => line.includes('hang-shell'));
    assert.deepEqual(survivors, [], `a probe survived: ${survivors.join(' | ')}`);
  });
});
