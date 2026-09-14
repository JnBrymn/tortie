/**
 * THE BASELINE DOMAIN HAS ONE SHUTDOWN OWNER (Phase 265, the second half).
 *
 * A functional test of `../shutdown.ts`, the sibling of
 * `../../credentials/__tests__/p220-shutdown.test.ts`. Every case here was red
 * at the parent commit, because at the parent this domain had no disposer at
 * all: `capabilities.ts` registered its IPC and its pruning timer and joined
 * nothing at quit.
 *
 * The cases the spec §5 names:
 *  - admission closes synchronously;
 *  - a `store()` after `beginBaselineShutdown()` is refused rather than begun;
 *  - a tracked write that settles inside the bound is joined and counted;
 *  - a tracked write that never settles is bounded, not wedged;
 *  - a second join answers the first one's report with `already: true`;
 *  - an idle quit walks an empty set and resolves in the same tick.
 *
 * WHAT THIS FILE STARTS: nothing. No Electron, no keychain, no store on disk,
 * no process, no timer left armed. It drives the owner's own functions over
 * resolved and hung promises it makes itself, and resets the module state
 * before every case.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BaselineStoreResult } from '@shared/baselines';
import {
  BASELINE_CLOSING_REASON,
  BASELINE_SHUTDOWN_JOIN_MS,
  admitBaselineStore,
  baselineWorkCount,
  baselinesAreOpen,
  beginBaselineShutdown,
  joinBaselineShutdown,
  resetBaselineLifecycle
} from '../shutdown';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A write that resolves when its returned `release` is called. */
function heldWrite(): {
  run: () => Promise<BaselineStoreResult>;
  release: () => void;
  calls: () => number;
} {
  let release = (): void => undefined;
  let calls = 0;
  const held = new Promise<BaselineStoreResult>((resolve) => {
    release = () => resolve({ stored: true, bytes: 1 });
  });
  return {
    run: () => {
      calls += 1;
      return held;
    },
    release,
    calls: () => calls
  };
}

beforeEach(() => {
  resetBaselineLifecycle();
});

afterEach(() => {
  resetBaselineLifecycle();
});

describe('Phase 265: the baseline domain has one shutdown owner', () => {
  it('the bound is a small named constant in the 200-500 ms range', () => {
    expect(BASELINE_SHUTDOWN_JOIN_MS).toBeGreaterThanOrEqual(200);
    expect(BASELINE_SHUTDOWN_JOIN_MS).toBeLessThanOrEqual(500);
  });

  it('closes admission synchronously', () => {
    expect(baselinesAreOpen()).toBe(true);
    beginBaselineShutdown();
    expect(baselinesAreOpen()).toBe(false);
  });

  it('refuses a store after begin rather than beginning it', async () => {
    const write = heldWrite();
    beginBaselineShutdown();
    const result = await admitBaselineStore(write.run);
    // THE WRITE WAS NOT BEGUN — `run` was never called — and nothing is held.
    expect(write.calls()).toBe(0);
    expect(baselineWorkCount()).toBe(0);
    expect(result).toEqual({
      stored: false,
      refused: 'io',
      reason: BASELINE_CLOSING_REASON
    });
  });

  it('joins a tracked write that settles inside the bound, and counts it', async () => {
    const write = heldWrite();
    // The write is admitted while open, so it is begun and owned.
    const pending = admitBaselineStore(write.run);
    expect(write.calls()).toBe(1);
    expect(baselineWorkCount()).toBe(1);

    beginBaselineShutdown();
    let settled = false;
    const join = joinBaselineShutdown(5_000).then((report) => {
      settled = true;
      return report;
    });
    await sleep(20);
    // THE JOIN DOES NOT RESOLVE WHILE THE WRITE IS STILL RUNNING.
    expect(settled).toBe(false);

    write.release();
    const report = await join;
    expect(report.tracked).toBe(1);
    expect(report.joined).toBe(true);
    expect(report.already).toBe(false);
    // The caller still gets the store's own result, unchanged.
    expect(await pending).toEqual({ stored: true, bytes: 1 });
    expect(baselineWorkCount()).toBe(0);
  });

  it('bounds a write that never settles, and does not wedge', async () => {
    const write = heldWrite(); // never released
    void admitBaselineStore(write.run);
    expect(baselineWorkCount()).toBe(1);

    const startedAt = Date.now();
    beginBaselineShutdown();
    const report = await joinBaselineShutdown(80);
    // THE JOIN RESOLVED AT THE DEADLINE, and said so truthfully.
    expect(report.joined).toBe(false);
    expect(report.tracked).toBe(1);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(70);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    // Release it so the suite leaves nothing hung.
    write.release();
  });

  it('answers a second join with the first report and already: true', async () => {
    const write = heldWrite();
    void admitBaselineStore(write.run);
    write.release();

    const first = await joinBaselineShutdown(5_000);
    expect(first.already).toBe(false);
    expect(first.tracked).toBe(1);

    const second = await joinBaselineShutdown(5_000);
    expect(second.already).toBe(true);
    expect(second.tracked).toBe(1);
    expect(second.joined).toBe(first.joined);
    expect(baselinesAreOpen()).toBe(false);
  });

  it('is immediate on an idle quit, with tracked: 0', async () => {
    const startedAt = Date.now();
    const report = await joinBaselineShutdown();
    expect(report).toEqual({
      already: false,
      tracked: 0,
      joined: true,
      waitedMs: 0
    });
    // No artificial delay on an idle quit.
    expect(Date.now() - startedAt).toBeLessThan(100);

    const second = await joinBaselineShutdown();
    expect(second.already).toBe(true);
    expect(second.tracked).toBe(0);
  });
});
