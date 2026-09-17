/**
 * The login-shell env answer, asked once instead of once per session (Phase 276).
 *
 * WHAT THIS SUITE IS FOR. `captureLoginShellEnv` spawns `$SHELL -lic`, which on
 * the operator's machine is about a second, because `-i` is what reads `.zshrc`
 * and `.zshrc` is what sources oh-my-zsh, nvm and rbenv. Phase 276 pays that
 * once per process instead of once per session. The danger is not the saving,
 * it is the invalidation: a cache that misses a rotated key hands an agent a
 * stale credential and the session then fails against its provider with an error
 * that has nothing to do with Tortie, which is issue 20's original symptom
 * re-created by our own optimisation.
 *
 * SO THESE TESTS ARE ABOUT WHEN THE CACHE REFUSES TO ANSWER, not about when it
 * answers. Rules 1 to 19 of build/p276/SPEC.md §7, driven here.
 *
 * NOTHING HERE SPAWNS A SHELL. `setLoginShellEnvCaptureForTests` is the seam the
 * cache calls, and every test hands it a counting fake, so the whole of the
 * coverage relation, the projection, the widening, the in-flight join, the
 * generation guard and the failure rule is driven with no child process at all.
 *
 * NO REAL PROVIDER KEY APPEARS HERE. `P276_TEST_VALUE` is invented for this
 * file, and it exists so that finding it anywhere it should not be is a failure.
 */

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() }
}));

import type { CaptureEnvResult } from '../resolve';

/** Invented for this file. Its only job is to be findable, and never found. */
const SENTINEL = 'P276_TEST_VALUE';

const MAIN = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..');
const resolveTs = readFileSync(join(MAIN, 'tmux', 'resolve.ts'), 'utf8');
const tmuxIndexTs = readFileSync(join(MAIN, 'tmux', 'index.ts'), 'utf8');
const createLocalTs = readFileSync(
  join(MAIN, 'sessions', 'create-local.ts'),
  'utf8'
);
const restoreTs = readFileSync(join(MAIN, 'restore', 'restore.ts'), 'utf8');

type ResolveModule = typeof import('../resolve');

/** A FRESH copy of the module, so the slot and the counter are this test's own. */
async function load(): Promise<ResolveModule> {
  vi.resetModules();
  return await import('../resolve');
}

/**
 * A capture that answers out of a pretend shell, and counts what it was asked.
 *
 * It mimics `finish`'s own rule, which is what the projection has to agree with:
 * a name the shell has no value for is `missing` and never an empty string, and
 * `missing` comes back sorted.
 */
function fakeShell(env: Record<string, string>): {
  capture: (names: readonly string[]) => Promise<CaptureEnvResult>;
  asks: string[][];
} {
  const asks: string[][] = [];
  const capture = (names: readonly string[]): Promise<CaptureEnvResult> => {
    asks.push([...names]);
    return Promise.resolve(answerFrom(env, names, false));
  };
  return { capture, asks };
}

function answerFrom(
  env: Record<string, string>,
  names: readonly string[],
  probeFailed: boolean
): CaptureEnvResult {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of new Set(names)) {
    const value = probeFailed ? undefined : env[name];
    if (value === undefined || value.length === 0) {
      missing.push(name);
      continue;
    }
    values[name] = value;
  }
  return { values, missing: missing.sort(), probeFailed };
}

/** A capture the test settles by hand, so a race can be arranged on purpose. */
function manualShell(env: Record<string, string>): {
  capture: (names: readonly string[]) => Promise<CaptureEnvResult>;
  asks: string[][];
  settle: (index: number, probeFailed?: boolean) => void;
} {
  const asks: string[][] = [];
  const settlers: Array<(result: CaptureEnvResult) => void> = [];
  const capture = (names: readonly string[]): Promise<CaptureEnvResult> => {
    asks.push([...names]);
    return new Promise<CaptureEnvResult>((res) => {
      settlers.push(res);
    });
  };
  const settle = (index: number, probeFailed = false): void => {
    const names = asks[index];
    const res = settlers[index];
    assert.ok(names !== undefined && res !== undefined, `no probe ${index}`);
    res(answerFrom(env, names, probeFailed));
  };
  return { capture, asks, settle };
}

let mod: ResolveModule;

beforeEach(async () => {
  mod = await load();
});

afterEach(() => {
  // Leave the real capture in place whatever the test did, so a later import of
  // this module can never inherit a fake.
  mod.setLoginShellEnvCaptureForTests(null);
});

// ---------------------------------------------------------------------------
// Rules 11 and 12 — OFF until something is watching
// ---------------------------------------------------------------------------

describe('the cache is off until something arms it', () => {
  it('rule 11: a fresh module holds nothing and reports epoch 0', () => {
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], []);
    assert.equal(mod.loginShellEnvEpoch(), 0);
  });

  it('rule 11: disarmed, N asks are N captures and nothing is held', async () => {
    const shell = fakeShell({ A: SENTINEL });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    await mod.loginShellEnvFor(['A']);
    await mod.loginShellEnvFor(['A']);
    await mod.loginShellEnvFor(['A']);

    assert.equal(shell.asks.length, 3, 'a disarmed cache answered from a slot');
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], []);
    assert.equal(mod.loginShellEnvEpoch(), 0, 'a disarmed ask moved the epoch');
  });

  it('rule 11: disarmed, two asks on ONE tick are two captures — no join', async () => {
    const shell = manualShell({ A: SENTINEL });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    const first = mod.loginShellEnvFor(['A']);
    const second = mod.loginShellEnvFor(['A']);
    assert.equal(
      shell.asks.length,
      2,
      'a disarmed cache joined an in-flight probe. An in-flight share IS a ' +
        'cache with a lifetime of one second, and the rule is that no answer ' +
        'is reused while nothing is watching.'
    );
    shell.settle(0);
    shell.settle(1);
    await Promise.all([first, second]);
  });

  it('rule 12: disarming drops the slot and moves the epoch', async () => {
    const shell = fakeShell({ A: SENTINEL });
    mod.setLoginShellEnvCaptureForTests(shell.capture);
    mod.enableLoginShellEnvCache(true);

    await mod.loginShellEnvFor(['A']);
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], ['A']);
    const filled = mod.loginShellEnvEpoch();

    mod.enableLoginShellEnvCache(false);
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], []);
    assert.equal(mod.loginShellEnvEpoch(), filled + 1);

    // And the next ask is a capture again, because the cache is off.
    await mod.loginShellEnvFor(['A']);
    assert.equal(shell.asks.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Rules 2 to 6 — the coverage relation, the projection, the widening, the cap
// ---------------------------------------------------------------------------

describe('coverage protects the NAME set', () => {
  beforeEach(() => {
    mod.enableLoginShellEnvCache(true);
  });

  it('rule 2: a covered ask hits and spawns nothing', async () => {
    const shell = fakeShell({ A: 'a-value', B: 'b-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    await mod.loginShellEnvFor(['A', 'B']);
    const second = await mod.loginShellEnvFor(['B']);

    assert.equal(shell.asks.length, 1, 'a covered ask probed again');
    assert.deepEqual(second.values, { B: 'b-value' });
    assert.deepEqual(second.missing, []);
  });

  it('rule 2: a name the slot does not mention is a MISS, with no listener', async () => {
    // THE CASE A PERSON WILL HIT. They have one key on the shared list, Tortie
    // has been up for an hour, and they add a second one in Settings and start a
    // session. Nothing here subscribes to anything: the ask mentions a name the
    // slot does not, so the read itself says miss.
    const shell = fakeShell({ DEEP: 'one', FIRE: 'two' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    await mod.loginShellEnvFor(['DEEP']);
    const after = await mod.loginShellEnvFor(['DEEP', 'FIRE']);

    assert.equal(shell.asks.length, 2, 'an uncovered name was served from a slot');
    assert.deepEqual(after.values, { DEEP: 'one', FIRE: 'two' });
  });

  it('rule 3: every hit is a FRESH object, so a caller cannot mutate the slot', async () => {
    const shell = fakeShell({ A: 'a-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    const first = await mod.loginShellEnvFor(['A']);
    const second = await mod.loginShellEnvFor(['A']);

    assert.notEqual(first.values, second.values, 'two asks shared one record');
    assert.notEqual(first.missing, second.missing, 'two asks shared one array');

    // create-local.ts does `resolvedEnv = envProbe.values`, which ALIASES what
    // it was handed. A downstream write must not reach the next create.
    first.values['A'] = 'mutated';
    const third = await mod.loginShellEnvFor(['A']);
    assert.deepEqual(third.values, { A: 'a-value' });
  });

  it('rule 4: the projection keeps the CALLER order and dedupes first-seen', async () => {
    // Phase 275 promised no argv order moves for a person who never uses the
    // shared list, and the `-e` order is this record's key insertion order.
    const shell = fakeShell({ ROW: '1', PER: '2', SHARED: '3' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    await mod.loginShellEnvFor(['SHARED', 'PER', 'ROW']);
    const hit = await mod.loginShellEnvFor(['ROW', 'PER', 'ROW', 'SHARED']);

    assert.deepEqual(Object.keys(hit.values), ['ROW', 'PER', 'SHARED']);
  });

  it('rule 4: missing comes back sorted, and probeFailed is false on a hit', async () => {
    const shell = fakeShell({ B: 'b-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    await mod.loginShellEnvFor(['Z', 'A', 'B']);
    const hit = await mod.loginShellEnvFor(['Z', 'A']);

    assert.deepEqual(hit.missing, ['A', 'Z']);
    assert.equal(hit.probeFailed, false);
    assert.equal(shell.asks.length, 1);
  });

  it('rule 4: __proto__ is answered as unresolved rather than as a value', async () => {
    // ENV_NAME_RE admits it, and `values['__proto__']` on a plain object answers
    // Object.prototype rather than undefined. An own-property read is what makes
    // the cached answer the honest one.
    const shell = fakeShell({ A: 'a-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    await mod.loginShellEnvFor(['A', '__proto__']);
    const hit = await mod.loginShellEnvFor(['__proto__']);

    assert.deepEqual(hit.missing, ['__proto__']);
    // OWN KEYS ARE THE ANSWER. A `[]` read of that name on any plain object
    // answers its prototype, here and at the parent alike; what matters is that
    // the record does not OWN it, because `paneEnvFor` spreads it and a spread
    // copies own enumerable keys.
    assert.equal(
      Object.prototype.hasOwnProperty.call(hit.values, '__proto__'),
      false
    );
    assert.deepEqual(Object.keys(hit.values), []);
  });

  it('rule 5: a miss probes for the UNION, widening and never narrowing', async () => {
    const shell = fakeShell({ SHARED: 's', X: 'x', Y: 'y' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    await mod.loginShellEnvFor(['SHARED', 'X']);
    await mod.loginShellEnvFor(['SHARED', 'Y']);

    assert.deepEqual([...shell.asks[1]!].sort(), ['SHARED', 'X', 'Y']);
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], ['SHARED', 'X', 'Y']);

    // And now agent X hits, which is what widening is for: two agents with
    // different per-agent lists must not evict each other.
    const back = await mod.loginShellEnvFor(['SHARED', 'X']);
    assert.equal(shell.asks.length, 2);
    assert.deepEqual(back.values, { SHARED: 's', X: 'x' });
  });

  it('rule 6: past the cap the slot is REPLACED, never truncated', async () => {
    const big: Record<string, string> = {};
    const first: string[] = [];
    for (let i = 0; i < 256; i += 1) {
      const name = `P276_BIG_${String(i)}`;
      big[name] = `v${String(i)}`;
      first.push(name);
    }
    big['LATE'] = 'late-value';
    const shell = fakeShell(big);
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    await mod.loginShellEnvFor(first);
    assert.equal(mod.loginShellEnvNamesHeld().length, 256);

    const after = await mod.loginShellEnvFor(['LATE']);
    // The union would be 257, so the caller's own names replace the slot. The
    // ask itself is never cut: a truncated ask would report a name as missing
    // that the shell was never asked about.
    assert.deepEqual([...shell.asks[1]!], ['LATE']);
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], ['LATE']);
    assert.deepEqual(after.values, { LATE: 'late-value' });
  });
});

// ---------------------------------------------------------------------------
// Rules 7 and 8 — the in-flight join
// ---------------------------------------------------------------------------

describe('the in-flight join', () => {
  beforeEach(() => {
    mod.enableLoginShellEnvCache(true);
  });

  it('rule 7: two callers on ONE tick share one capture', async () => {
    const shell = manualShell({ A: 'a-value', B: 'b-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    const first = mod.loginShellEnvFor(['A', 'B']);
    const second = mod.loginShellEnvFor(['A']);
    assert.equal(shell.asks.length, 1, 'the pointer was not assigned before an await');

    shell.settle(0);
    const [one, two] = await Promise.all([first, second]);
    // SHARING A CAPTURE IS NOT SHARING AN ANSWER. Each projects onto its own
    // list, so create A never gets agent B's names on its `-e` line.
    assert.deepEqual(Object.keys(one.values), ['A', 'B']);
    assert.deepEqual(Object.keys(two.values), ['A']);
  });

  it('rule 8: an ask the probe in flight does not cover starts its own', async () => {
    const shell = manualShell({ A: 'a-value', C: 'c-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    const first = mod.loginShellEnvFor(['A']);
    const second = mod.loginShellEnvFor(['C']);
    assert.equal(shell.asks.length, 2, 'a caller was answered out of a probe that never mentioned its name');

    shell.settle(0);
    shell.settle(1);
    const [, two] = await Promise.all([first, second]);
    assert.deepEqual(two.values, { C: 'c-value' });
  });

  it('rules 17 and 8: a FAILED shared probe is projected onto each caller list', async () => {
    const shell = manualShell({ A: 'a-value', B: 'b-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    const wide = mod.loginShellEnvFor(['A', 'B']);
    const narrow = mod.loginShellEnvFor(['A']);
    shell.settle(0, true);
    const [one, two] = await Promise.all([wide, narrow]);

    assert.equal(one.probeFailed, true);
    assert.equal(two.probeFailed, true);
    // The narrow caller must not be told about a variable it never asked for:
    // its env-unresolved notice names what IT asked for and nothing else.
    assert.deepEqual(two.missing, ['A']);
    assert.deepEqual(one.missing, ['A', 'B']);
  });
});

// ---------------------------------------------------------------------------
// Rules 9 and 10 — the generation, and the late-landing guard
// ---------------------------------------------------------------------------

describe('the generation', () => {
  beforeEach(() => {
    mod.enableLoginShellEnvCache(true);
  });

  it('rule 9: it moves on an install and on a drop, and never rewinds', async () => {
    const shell = fakeShell({ A: 'a-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    assert.equal(mod.loginShellEnvEpoch(), 0);
    await mod.loginShellEnvFor(['A']);
    assert.equal(mod.loginShellEnvEpoch(), 1, 'an install did not move the epoch');

    await mod.loginShellEnvFor(['A']);
    assert.equal(mod.loginShellEnvEpoch(), 1, 'a HIT moved the epoch');

    mod.dropLoginShellEnvCache();
    assert.equal(mod.loginShellEnvEpoch(), 2, 'a drop did not move the epoch');

    await mod.loginShellEnvFor(['A']);
    assert.equal(mod.loginShellEnvEpoch(), 3);
  });

  it('rule 10: a probe stamped before a drop installs NOTHING after it', async () => {
    // THE RACE THIS PHASE CREATES. A probe started before a rotation can land
    // after it and install a pre-rotation answer over a slot the watcher has
    // just cleared. That is a stale key delivered silently.
    const shell = manualShell({ KEY: 'old-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    const inFlight = mod.loginShellEnvFor(['KEY']);
    const beforeDrop = mod.loginShellEnvEpoch();

    // The watcher sees ~/.zshrc move while the probe is out.
    mod.dropLoginShellEnvCache();
    assert.equal(mod.loginShellEnvEpoch(), beforeDrop + 1);

    shell.settle(0);
    const answer = await inFlight;

    // The caller that started it still gets its answer — it really did read the
    // shell — and the SLOT is left empty, so the next create probes again.
    assert.deepEqual(answer.values, { KEY: 'old-value' });
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], []);
    assert.equal(mod.loginShellEnvEpoch(), beforeDrop + 1, 'a late probe installed');

    const next = mod.loginShellEnvFor(['KEY']);
    assert.equal(shell.asks.length, 2, 'the next create did not probe');
    shell.settle(1);
    await next;
  });
});

// ---------------------------------------------------------------------------
// Rules 17, 18 and 19 — failure is never cached as success
// ---------------------------------------------------------------------------

describe('failure', () => {
  beforeEach(() => {
    mod.enableLoginShellEnvCache(true);
  });

  it('rule 17: a failed probe is returned and never installed', async () => {
    const shell = manualShell({ KEY: 'a-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    const first = mod.loginShellEnvFor(['KEY']);
    shell.settle(0, true);
    const failed = await first;

    assert.equal(failed.probeFailed, true);
    assert.deepEqual(failed.values, {});
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], []);
    assert.equal(mod.loginShellEnvEpoch(), 0, 'a failure moved the epoch');
  });

  it('rule 18: a failure clears the in-flight pointer, so the next ask is fresh', async () => {
    const shell = manualShell({ KEY: 'a-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    const first = mod.loginShellEnvFor(['KEY']);
    shell.settle(0, true);
    await first;

    const second = mod.loginShellEnvFor(['KEY']);
    assert.equal(shell.asks.length, 2, 'a failure was remembered for the process');
    shell.settle(1);
    const good = await second;
    assert.deepEqual(good.values, { KEY: 'a-value' });
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], ['KEY']);
  });

  it('rule 18: a failure does not drop a slot that is still true', async () => {
    const shell = manualShell({ A: 'a-value', B: 'b-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    const fill = mod.loginShellEnvFor(['A']);
    shell.settle(0);
    await fill;
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], ['A']);

    // A second agent asks for a name the slot does not hold, and that probe
    // fails — a shell that timed out once under load. The answer we already
    // have is still true, so it stays.
    const miss = mod.loginShellEnvFor(['B']);
    shell.settle(1, true);
    await miss;
    assert.deepEqual([...mod.loginShellEnvNamesHeld()], ['A']);

    const stillWarm = await mod.loginShellEnvFor(['A']);
    assert.equal(shell.asks.length, 2, 'a failure elsewhere cost the warm slot');
    assert.deepEqual(stillWarm.values, { A: 'a-value' });
  });

  it('rule 19: a PARTIAL answer is not a failure and it IS cached', async () => {
    // probeFailed:false with names in `missing` means the shell answered and has
    // no usable value for them. A stale miss is self-announcing — it raises
    // env-unresolved naming the variable on every create — and a stale hit is
    // silent. That asymmetry is why the miss is cached.
    const shell = fakeShell({ HAVE: 'a-value' });
    mod.setLoginShellEnvCaptureForTests(shell.capture);

    const first = await mod.loginShellEnvFor(['HAVE', 'HAVE_NOT']);
    assert.deepEqual(first.missing, ['HAVE_NOT']);
    assert.equal(first.probeFailed, false);

    const second = await mod.loginShellEnvFor(['HAVE', 'HAVE_NOT']);
    assert.equal(shell.asks.length, 1, 'a partial answer was not cached');
    assert.deepEqual(second.missing, ['HAVE_NOT']);
  });
});

// ---------------------------------------------------------------------------
// Rules 1, 13, 14, 15 and 16 — the shape of the module, read as text
// ---------------------------------------------------------------------------

describe('the module', () => {
  it('rule 13: NAMES leave the cache and no value does', async () => {
    mod.enableLoginShellEnvCache(true);
    const shell = fakeShell({ KEY: SENTINEL });
    mod.setLoginShellEnvCaptureForTests(shell.capture);
    await mod.loginShellEnvFor(['KEY']);

    assert.deepEqual([...mod.loginShellEnvNamesHeld()], ['KEY']);
    assert.ok(
      !JSON.stringify(mod.loginShellEnvNamesHeld()).includes(SENTINEL),
      'the names door answered with a value'
    );

    // The cache's own exported surface is five functions plus the test seam, and
    // none of them is a value door.
    const cacheExports = Object.keys(mod)
      .filter((k) =>
        /[Ll]oginShellEnv(Cache|For|Epoch|NamesHeld|CaptureForTests)$/.test(k)
      )
      .sort();
    assert.deepEqual(cacheExports, [
      'dropLoginShellEnvCache',
      'enableLoginShellEnvCache',
      'loginShellEnvEpoch',
      'loginShellEnvFor',
      'loginShellEnvNamesHeld',
      'setLoginShellEnvCaptureForTests'
    ]);
  });

  it('rule 14: the probe still spawns an INTERACTIVE login shell', () => {
    // THE `-i` IS LOAD-BEARING. `.zshrc` is read by interactive shells and by
    // nothing else, and a provider key exported there is the whole of issue 20.
    // A round that makes this cache look fast by dropping the `i` has made the
    // feature useless, which is the mistake PR #21 made.
    const lic = resolveTs.match(/'-lic'/g) ?? [];
    assert.equal(lic.length, 3, 'a login-shell probe lost its -i');
    assert.equal(typeof mod.captureLoginShellEnv, 'function');
  });

  it('rule 15: the two production call sites go through the one door', () => {
    for (const [what, text] of [
      ['create-local.ts', createLocalTs],
      ['restore.ts', restoreTs]
    ] as const) {
      assert.ok(
        /await tmux\.loginShellEnvFor\(/.test(text),
        `${what} does not call loginShellEnvFor`
      );
      assert.ok(
        !/await tmux\.captureLoginShellEnv\(/.test(text),
        `${what} still calls captureLoginShellEnv directly, so a create or a ` +
          'restore pays the login shell whatever the cache holds'
      );
    }
  });

  it('rule 15: the five doors are re-exported from the tmux facade', () => {
    for (const name of [
      'loginShellEnvFor',
      'enableLoginShellEnvCache',
      'dropLoginShellEnvCache',
      'loginShellEnvEpoch',
      'loginShellEnvNamesHeld'
    ]) {
      assert.ok(
        new RegExp(`\\n  ${name},`).test(tmuxIndexTs),
        `${name} is not re-exported from src/main/tmux/index.ts`
      );
    }
    // And captureLoginShellEnv stays exported, because it is what a disarmed
    // cache is and it is what the cache calls.
    assert.ok(/\n  captureLoginShellEnv,/.test(tmuxIndexTs));
  });

  it('rule 16: the header says the answer is cached, and says who watches it', () => {
    assert.ok(
      /PHASE 276 MOVED WHO PAYS FOR IT/.test(resolveTs),
      'the §1b header still claims one probe per launch and per restore'
    );
    assert.ok(
      /PHASE 276 CACHED THE OTHER ONE AND NOT THIS ONE/.test(resolveTs),
      'loginShellEnvNames does not say why it still has no cross-ask cache'
    );
  });

  it('rule 1: nothing in this module writes a captured value to disk', () => {
    // The slot lives in memory for the life of the process and is written
    // nowhere. This module has no reason to write at all.
    assert.ok(!/writeFileSync|createWriteStream|appendFileSync/.test(resolveTs));
  });
});
