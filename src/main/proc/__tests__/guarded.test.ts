/**
 * Unit tests for src/main/proc/guarded.ts (Phase 13.8).
 *
 * The bar these tests hold: a guarded child ALWAYS settles its caller and
 * ALWAYS dies — including the fork it left behind, and including the case
 * where the app quits while the probe is still in flight, which is how five
 * `zsh -lic` orphans (oldest 19 h 41 m) got onto the reporting machine.
 *
 * Runner: vitest (`npm test`). Assertions on node:assert/strict.
 */

import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_KILL_GRACE_MS,
  guardedChildPids,
  killProcessGroup,
  reapGuardedChildren,
  runGuarded,
  type GuardedRunResult
} from '../guarded';

/**
 * The REAL timer functions, taken before any test fakes them. The fork test
 * below fakes `setTimeout` to hold runGuarded's deadline, and still has to
 * wait on the wall clock for its fixture. Calling into `node:timers` or
 * `node:timers/promises` while the clock is faked is no way round, because
 * vitest's fake timers swap those modules' functions too (read in the
 * @sinonjs/fake-timers 15.0.0 that vitest 4.1.10 bundles). So this file keeps
 * the globals it captured at module load and waits on those.
 */
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gmux-guarded-'));
});

afterEach(() => {
  reapGuardedChildren();
  rmSync(root, { recursive: true, force: true });
});

/** Wait for `pidFile` to exist, then return the pid it holds. */
async function forkedPid(pidFile: string): Promise<number> {
  for (let i = 0; i < 100 && !existsSync(pidFile); i += 1) {
    await new Promise((r) => setTimeout(r, 20));
  }
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  assert.ok(Number.isFinite(pid) && pid > 0, `no pid in ${pidFile}`);
  return pid;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Phase 279: readiness, the deadline and teardown fail in different words.
//
// Until this phase the fork test armed a real 300 ms deadline, AWAITED the
// call, and only then looked for the file its fixture writes once it has
// forked. In the 0.105.0 audit's full suite run (F4) the deadline answered,
// the file never appeared and the test died on ENOENT. The likely reading,
// which the audit did not trace, is a loaded runner where the deadline killed
// /bin/sh before it reached its `echo`. Either way a shell that never forked
// and a fork that outlived its deadline drew the same red line, and only the
// second is a defect in guarded.ts. The audit is careful that its run proves
// no leak, and so is this note.
//
// The fork test now holds the deadline on a fake clock. Only setTimeout and
// clearTimeout are faked: child exit and pipe events come from libuv and are
// untouched, and the waits here run on the real timers captured at the top of
// the file. runGuarded is called exactly as production calls it, and nothing
// in guarded.ts waits for a child to cooperate. The TEST waits, bounded, and
// then says which step did not happen.
//
// THE FORK IGNORES SIGTERM. The phase's first build used a fork that died on
// the SIGTERM alone, and its whole file stayed green with the escalation
// sending a second SIGTERM in place of the SIGKILL, because nothing ever
// needed the SIGKILL. The case that matters is the other one: every login
// shell PATH probe is an interactive zsh, which ignores SIGTERM by design
// (the Phase 167 note on killProcessGroup). So the fork sets its trap before
// it writes its own pid, readiness means the trap is in place, and only the
// escalation can end it. For the same reason the fork test waits on the real
// clock for the leader's exit BETWEEN the deadline and the grace. guarded.ts
// keeps the SIGKILL armed through that exit on purpose, and a test that fired
// both timers in one synchronous run passed a build that cancelled it there.
//
// Ablations, each run on a scratch worktree at b9cb4e7c and never on this
// tree. "fork" is the fake-clock test and "real" the real-clock check, and
// each line names the word they went red on. (*) marks the ones the first
// build passed whole, and (w) the ones where it named the wrong step.
//   - `process.kill(pid, …)` for `-pid` in killProcessGroup: TEARDOWN, both.
//   - no escalation timer at all: TEARDOWN, both.
//   - (*) the escalation sends SIGTERM, not SIGKILL: TEARDOWN, both.
//   - (*) the escalation cleared on the leader's exit: TEARDOWN, both. With
//     the leader-exit wait taken out of a copy, the fork test passes it again.
//   - spawned without `detached`: SPAWN, both, within milliseconds. With the
//     SPAWN check taken out of a copy: TEARDOWN, both. No sleeper survived
//     either, where the first build's cleanup left four sleepers and two
//     shells at ppid 1.
//   - (*) the deadline armed 100 times early: DEADLINE, both.
//   - the deadline answers `finish({})`: DEADLINE, both.
//   - (w) the deadline armed through a setTimeout read at module load:
//     DEADLINE, fork. Real passes, rightly, because that deadline still works.
//   - the fixture sleeps past READY_WITHIN_MS before it forks: READINESS,
//     fork. Real is skipped with its READINESS note.
//   - the fork stalls past READY_WITHIN_MS after its trap: the same, and the
//     finally ended the live fork it never heard from.
//   - (w) the fixture exits 7 before it forks: READINESS, both.
//   - the fixture without its execute bit: SPAWN, both.
// On a quiet machine the fork test takes 39 to 64 ms, and the real-clock check
// 1,510 to 1,530 ms. That is its deadline plus the grace, so on the real clock
// too it is the SIGKILL and not the SIGTERM that ends the fork.
// ---------------------------------------------------------------------------

/** The controlled deadline. On the fake clock it is only how far the test advances. */
const DEADLINE_MS = 300;
/** The real-clock check's deadline. Test data, and no production default. */
const REAL_DEADLINE_MS = 1_000;
/**
 * The real-clock check refuses a deadline that fired before HALF its time, not
 * before all of it. Node arms a timer from libuv's cached loop time, which
 * trails `Date.now()` by however long the current tick has already run, so a
 * floor at the full deadline would be a race of its own. Half still refuses a
 * deadline armed 100 times early, and the fork test pins the exact
 * millisecond on the fake clock.
 */
const REAL_DEADLINE_FLOOR_MS = REAL_DEADLINE_MS / 2;
/** How long a fixture may take to fork before the test says READINESS. */
const READY_WITHIN_MS = 5_000;
/** How long an answered deadline has to settle the call, and the leader to exit. */
const SETTLE_WITHIN_MS = 2_000;
/** How long the kill has to land before the test says TEARDOWN. */
const TEARDOWN_WITHIN_MS = 3_000;

/**
 * Every sleeper the fork fixtures start runs this. The odd duration is a
 * marker: `pgrep -fl 'sleep 30.279'` names exactly these processes and nothing
 * anybody else is running, so a run can be checked for survivors afterwards.
 */
const FORKER_SLEEP = 'sleep 30.279';

/**
 * A shell that forks a stdout-holder, then hangs. The fork ignores SIGTERM and
 * writes its OWN pid once its trap is set, so a fork that is ready is one only
 * a SIGKILL can end. Both halves `exec` their sleep, so the fixture is exactly
 * two processes: the leader, known the moment spawn returns, and the fork,
 * known from its file. Measured on this machine's /bin/sh before it was
 * written: the fork's `$$` is the parent's `$!`, it keeps the leader's group
 * through `exec`, it outlives a group SIGTERM at ppid 1, and a group SIGKILL
 * ends it.
 */
function writeForker(dir: string): { script: string; pidFile: string } {
  const script = join(dir, 'forker');
  const pidFile = join(dir, 'fork.pid');
  writeFileSync(
    script,
    '#!/bin/sh\n' +
      // inherits stdout — this is what wedges execFile
      `/bin/sh -c 'trap "" TERM; echo $$ > ${pidFile}; exec ${FORKER_SLEEP}' &\n` +
      `exec ${FORKER_SLEEP}\n`
  );
  chmodSync(script, 0o755);
  return { script, pidFile };
}

/** The guarded child spawned since `before` was read: the fixture's group id. */
function spawnedSince(before: readonly number[]): number | undefined {
  return guardedChildPids().find((pid) => !before.includes(pid));
}

type Readiness =
  | { kind: 'ready'; fork: number }
  | { kind: 'exited'; result: GuardedRunResult }
  | { kind: 'late' };

/**
 * Wait, bounded, for the fixture to report its fork. The answer is read BEFORE
 * the file, so a pid written just before the call settled still counts as
 * ready. The shell's `>` creates the file before `echo` writes into it, so an
 * empty or partial read is not ready yet.
 */
async function awaitReadiness(
  pidFile: string,
  answer: () => GuardedRunResult | null,
  withinMs: number
): Promise<Readiness> {
  const until = Date.now() + withinMs;
  for (;;) {
    const result = answer();
    const fork = readForkPid(pidFile);
    if (fork !== null) return { kind: 'ready', fork };
    if (result !== null) return { kind: 'exited', result };
    if (Date.now() >= until) return { kind: 'late' };
    await realDelay(10);
  }
}

function readForkPid(pidFile: string): number | null {
  let text: string;
  try {
    text = readFileSync(pidFile, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const match = /^(\d+)\n$/.exec(text);
  return match === null ? null : Number(match[1]);
}

function describeAnswer(r: GuardedRunResult): string {
  return (
    `timedOut=${r.timedOut} code=${r.code} signal=${r.signal} ` +
    `spawnError=${r.spawnError} stderr=${JSON.stringify(r.stderr.slice(0, 200))}`
  );
}

function realDelay(ms: number): Promise<void> {
  return new Promise((res) => {
    realSetTimeout(res, ms);
  });
}

async function settledWithin(
  pending: Promise<GuardedRunResult>,
  ms: number
): Promise<GuardedRunResult | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<null>((res) => {
        timer = realSetTimeout(() => res(null), ms);
      })
    ]);
  } finally {
    realClearTimeout(timer);
  }
}

async function within(ms: number, done: () => boolean): Promise<boolean> {
  const until = Date.now() + ms;
  for (;;) {
    if (done()) return true;
    if (Date.now() >= until) return false;
    await realDelay(20);
  }
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * SPAWN: the leader leads a process group of its own. Read synchronously the
 * moment spawn returns, before anything in this test can have ended the
 * leader, so a group found empty later is a group that EMPTIED and never one
 * that did not exist.
 */
function assertOwnGroup(leader: number): void {
  assert.ok(
    groupAlive(leader),
    `SPAWN: leader ${leader} leads no process group of its own, so no group kill can reach its fork`
  );
}

/**
 * End the fixture whatever happened, WITHOUT trusting the code under test to
 * have made a group. The first build signalled `-leader` alone. Its tests went
 * red under a spawn without `detached` and still left four sleepers and two
 * shells at ppid 1, because a group that was never made answers ESRCH.
 *
 * The leader is signalled, as a group and alone, only while the registry still
 * lists it. Node has not reaped it then, so neither its pid nor its group id
 * can belong to anybody else. The fork is signalled by the pid it wrote,
 * re-read here because readiness may never have seen it, and only while that
 * pid answers. That step is weaker, and it rests on the argument guarded.ts
 * makes about a pgid: a stranger could hold the pid only if the fork died, was
 * reaped by launchd and its number was handed out again within one test.
 *
 * What this cannot reach is a fork that has not yet written its pid, in a tree
 * whose spawn made no group. The SPAWN check fails that tree synchronously the
 * moment spawn returns, so this runs before the leader's shell can fork.
 */
function endFixture(leader: number | undefined, pidFile: string): void {
  if (leader !== undefined && guardedChildPids().includes(leader)) {
    for (const target of [-leader, leader]) {
      try {
        process.kill(target, 'SIGKILL');
      } catch {
        /* ESRCH: no such group, or the leader already went */
      }
    }
  }
  const fork = readForkPid(pidFile);
  if (fork !== null && isAlive(fork)) {
    try {
      process.kill(fork, 'SIGKILL');
    } catch {
      /* ESRCH: it went between the two calls */
    }
  }
}

describe('runGuarded — the happy path', () => {
  it('captures stdout and the exit code', async () => {
    const r = await runGuarded('/bin/sh', ['-c', 'printf hello; exit 3'], {
      timeoutMs: 5_000
    });
    assert.equal(r.stdout, 'hello');
    assert.equal(r.code, 3);
    assert.equal(r.timedOut, false);
    assert.equal(r.spawnError, null);
  });

  it('separates stderr from stdout', async () => {
    const r = await runGuarded(
      '/bin/sh',
      ['-c', 'printf out; printf err 1>&2'],
      { timeoutMs: 5_000 }
    );
    assert.equal(r.stdout, 'out');
    assert.equal(r.stderr, 'err');
  });

  it('a missing binary is a result, not a rejection', async () => {
    const r = await runGuarded(join(root, 'nope'), [], { timeoutMs: 1_000 });
    assert.ok(r.spawnError !== null, 'expected a spawnError');
    assert.equal(r.timedOut, false);
  });
});

describe('runGuarded — the deadline', () => {
  it('a hung child settles the caller and dies', async () => {
    const started = Date.now();
    const r = await runGuarded('/bin/sh', ['-c', 'sleep 30'], {
      timeoutMs: 200
    });
    const elapsed = Date.now() - started;
    assert.equal(r.timedOut, true);
    assert.ok(elapsed < 3_000, `did not settle: waited ${elapsed} ms`);
  });

  /**
   * The whole reason this module exists. `execFile`'s timeout signals the
   * DIRECT child only, and its callback fires on stdio close — so a child
   * that forks a stdout-holder both hangs the caller and orphans the fork.
   *
   * SPAWN, READINESS, THE DEADLINE, THEN TEARDOWN (Phase 279). The Phase 279
   * note above the helpers says why the deadline is a fake timer here and why
   * the fork ignores SIGTERM.
   */
  it('kills the FORK too, not just the direct child', async () => {
    const { script, pidFile } = writeForker(root);
    const before = guardedChildPids();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let leader: number | undefined;
    try {
      const pending = runGuarded(script, [], { timeoutMs: DEADLINE_MS });
      // Known the moment spawn returns, so the finally below can end the
      // fixture whether or not it ever becomes ready.
      leader = spawnedSince(before);
      const armed = vi.getTimerCount();
      const seen: { answer: GuardedRunResult | null } = { answer: null };
      void pending.then((r) => {
        seen.answer = r;
      });

      // 0. SPAWN, read before anything can end the leader. A deadline that is
      //    not on the controlled clock would put this test back on the race
      //    the audit lost, passing quietly whenever the fork is quick.
      if (leader !== undefined) {
        assertOwnGroup(leader);
        assert.equal(
          armed,
          1,
          `DEADLINE: runGuarded armed ${armed} timers on the controlled clock where its one deadline was expected, so this test cannot hold the deadline it advances`
        );
      }

      // 1. READINESS. The deadline is held, so nothing can kill the shell
      //    before it forks, and a slow shell costs this test time and never
      //    moves the production deadline.
      const ready = await awaitReadiness(pidFile, () => seen.answer, READY_WITHIN_MS);
      if (ready.kind === 'exited') {
        const r = ready.result;
        assert.fail(
          r.spawnError !== null
            ? `SPAWN: the fixture did not start: ${r.spawnError}`
            : r.timedOut
              ? `DEADLINE: the call timed out while this test held its deadline, so the deadline is not on the controlled clock: ${describeAnswer(r)}`
              : `READINESS: the fixture exited before it forked, with its deadline held: ${describeAnswer(r)}`
        );
      }
      if (ready.kind === 'late') {
        assert.fail(
          `READINESS: the fixture never became ready: fork.pid did not appear within ${READY_WITHIN_MS} ms, so the subject was not tested`
        );
      }
      const fork = ready.fork;
      assert.ok(leader !== undefined, 'SPAWN: the fixture forked but runGuarded tracked no child');
      const lead = leader;
      assert.ok(
        isAlive(fork),
        `READINESS: fork ${fork} wrote its pid and was gone before the deadline, so there was nothing left to test`
      );
      if (seen.answer !== null) {
        assert.fail(
          `DEADLINE: the call answered before the test advanced its deadline: ${describeAnswer(seen.answer)}`
        );
      }

      // 2. THE DEADLINE, one millisecond short and then on time. On time it
      //    answers `timedOut`, sends the group its SIGTERM and arms the one
      //    escalation timer.
      vi.advanceTimersByTime(DEADLINE_MS - 1);
      await realDelay(0); // an answer reaches `seen` only through a microtask
      if (seen.answer !== null) {
        assert.fail(
          `DEADLINE: the call answered ${DEADLINE_MS - 1} ms into its ${DEADLINE_MS} ms deadline: ${describeAnswer(seen.answer)}`
        );
      }
      vi.advanceTimersByTime(1);
      const answer = await settledWithin(pending, SETTLE_WITHIN_MS);
      if (answer === null) {
        assert.fail(
          `DEADLINE: no answer ${SETTLE_WITHIN_MS} ms after the clock passed the ${DEADLINE_MS} ms deadline`
        );
      }
      assert.equal(
        answer.timedOut,
        true,
        `DEADLINE: the call answered without timedOut: ${describeAnswer(answer)}`
      );

      // 3. TEARDOWN, one signal at a time. The leader honours the SIGTERM and
      //    the fork ignores it. The leader's exit is waited for on the REAL
      //    clock before the grace is advanced, so a build that cancels the
      //    SIGKILL when the leader exits has had its chance to.
      const leaderGone = await within(
        SETTLE_WITHIN_MS,
        () => !guardedChildPids().includes(lead)
      );
      assert.ok(
        leaderGone,
        `TEARDOWN: leader ${lead} was still running ${SETTLE_WITHIN_MS} ms after the deadline's SIGTERM`
      );
      assert.ok(
        isAlive(fork),
        `TEARDOWN: fork ${fork} ignores SIGTERM and was gone before the grace ran out, so the escalation was not what ended it`
      );
      const pendingTimers = vi.getTimerCount();
      vi.advanceTimersByTime(DEFAULT_KILL_GRACE_MS);
      vi.useRealTimers();
      const gone = await within(TEARDOWN_WITHIN_MS, () => !isAlive(fork));
      assert.ok(
        gone,
        `TEARDOWN: fork ${fork} survived the escalation: it ignores SIGTERM and was still alive ${TEARDOWN_WITHIN_MS} ms after the ${DEFAULT_KILL_GRACE_MS} ms grace ran out, with ${pendingTimers} timer(s) pending when the grace was advanced`
      );
    } finally {
      vi.useRealTimers(); // the held deadline, if any, is discarded and never runs
      endFixture(leader, pidFile);
    }
  });

  /**
   * The same fixture on the REAL clock, because the fake one cannot see the
   * wiring it replaces: a real deadline, a real unref'd escalation timer.
   *
   * Here the deadline and the fork race, which is the race the audit lost, so
   * readiness cannot be required. Every step still has its own word. SPAWN and
   * DEADLINE are asserted on every run. TEARDOWN is asserted on the whole
   * process group on every run, because an empty group means nothing the
   * fixture started survived, however far it got; and on the fork by pid
   * whenever the fork was reached. A run that did not reach the fork is
   * SKIPPED with a READINESS note rather than passed, so a loaded runner shows
   * up in the skipped count instead of as a green result that tested less.
   */
  it('on the real clock, the deadline ends the fork and its whole group', async ({ skip }) => {
    const { script, pidFile } = writeForker(root);
    const before = guardedChildPids();
    // One real tick first, so the loop time the deadline is armed from is
    // fresh when `started` is read. REAL_DEADLINE_FLOOR_MS says why it matters.
    await realDelay(0);
    const started = Date.now();
    const pending = runGuarded(script, [], { timeoutMs: REAL_DEADLINE_MS });
    const leader = spawnedSince(before);
    try {
      if (leader !== undefined) assertOwnGroup(leader);
      const seen: { answer: GuardedRunResult | null; at: number } = { answer: null, at: 0 };
      void pending.then((r) => {
        seen.answer = r;
        seen.at = Date.now();
      });
      const ready = await awaitReadiness(pidFile, () => seen.answer, READY_WITHIN_MS);

      const answer = await settledWithin(pending, REAL_DEADLINE_MS + SETTLE_WITHIN_MS);
      if (answer === null) {
        assert.fail(
          `DEADLINE: no answer ${Date.now() - started} ms after the call, against a ${REAL_DEADLINE_MS} ms deadline`
        );
      }
      const elapsed = seen.at - started;
      assert.equal(answer.spawnError, null, `SPAWN: the fixture did not start: ${answer.spawnError}`);
      assert.ok(leader !== undefined, 'SPAWN: runGuarded answered but tracked no child');
      // An exit code is the fixture reaching an `exit` of its own. The deadline
      // path answers with no code, and so does a close after its kill.
      if (!answer.timedOut && ready.kind === 'exited' && answer.code !== null) {
        assert.fail(
          `READINESS: the fixture exited ${elapsed} ms into its ${REAL_DEADLINE_MS} ms deadline, before it forked: ${describeAnswer(answer)}`
        );
      }
      assert.equal(
        answer.timedOut,
        true,
        `DEADLINE: the call answered without timedOut after ${elapsed} ms: ${describeAnswer(answer)}`
      );
      assert.ok(
        elapsed >= REAL_DEADLINE_FLOOR_MS,
        `DEADLINE: the ${REAL_DEADLINE_MS} ms deadline answered after ${elapsed} ms, under its ${REAL_DEADLINE_FLOOR_MS} ms floor`
      );

      if (ready.kind === 'ready') {
        const gone = await within(TEARDOWN_WITHIN_MS, () => !isAlive(ready.fork));
        assert.ok(
          gone,
          `TEARDOWN: fork ${ready.fork} survived the real deadline: it ignores SIGTERM, so only the escalation's SIGKILL ends it`
        );
      }
      const groupGone = await within(TEARDOWN_WITHIN_MS, () => !groupAlive(leader));
      assert.ok(
        groupGone,
        `TEARDOWN: process group ${leader} still has a member ${TEARDOWN_WITHIN_MS} ms after the real deadline`
      );
      if (ready.kind !== 'ready') {
        skip(
          `READINESS: the fixture had not reported its fork when the real ${REAL_DEADLINE_MS} ms deadline fired, so this run proved its process group empty and never reached the fork`
        );
      }
    } finally {
      endFixture(leader, pidFile);
    }
  });
});

describe('reapGuardedChildren — quit while a probe is in flight', () => {
  it('kills the child the deadline had not reached yet', async () => {
    const script = join(root, 'slow');
    const pidFile = join(root, 'slow.pid');
    writeFileSync(script, '#!/bin/sh\n' + `echo $$ > ${pidFile}\n` + 'sleep 30\n');
    chmodSync(script, 0o755);

    // A 60 s deadline that will never fire — quit has to be what reaps this.
    const pending = runGuarded(script, [], { timeoutMs: 60_000 });
    const pid = await forkedPid(pidFile);
    assert.ok(guardedChildPids().length > 0, 'child was not tracked');

    const killed = reapGuardedChildren();
    assert.ok(killed >= 1, 'reap reported nothing killed');
    const r = await pending; // and the caller is released, not left hanging
    assert.equal(r.timedOut, false);
    await new Promise((res) => setTimeout(res, 300));
    assert.equal(isAlive(pid), false, `pid ${pid} survived the reap`);
    assert.equal(guardedChildPids().length, 0);
  });
});

// ---------------------------------------------------------------------------
// Phase 167: the quit reap's SIGKILL is synchronous.
//
// Until 0.85.3 `reapGuardedChildren` called `killProcessGroup(child, 0)`, and
// the SIGKILL sat on an unref'd 0 ms timer. Nothing waited for that timer, so
// a quit that exited on its next tick left the child with only the SIGTERM,
// which an interactive zsh, the shape of every PATH probe, ignores by design.
// The tests fake `setTimeout` across the reap, so a SIGKILL parked on a timer
// never fires: on the parent tree the child lives and the caller never
// settles, on this tree it is dead before the reap returns.
// ---------------------------------------------------------------------------

describe('reapGuardedChildren, a child that ignores SIGTERM (Phase 167)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is dead with no timer left to fire', async () => {
    const pidFile = join(root, 'stubborn.pid');
    const pending = runGuarded(
      '/bin/sh',
      ['-c', `trap "" TERM; echo $$ > ${pidFile}; sleep 30`],
      { timeoutMs: 60_000 }
    );
    const pid = await forkedPid(pidFile);
    await new Promise((res) => setTimeout(res, 100)); // the trap is installed

    vi.useFakeTimers({ toFake: ['setTimeout'] });
    let killed: number;
    try {
      killed = reapGuardedChildren();
    } finally {
      vi.useRealTimers(); // any timer armed in there is discarded, never run
    }
    assert.equal(killed, 1);

    const settled = await Promise.race([
      pending.then(() => true),
      new Promise<false>((res) => setTimeout(() => res(false), 1_500))
    ]);
    assert.equal(settled, true, 'the caller was never released');
    assert.equal(isAlive(pid), false, `pid ${pid} survived the quit reap`);
  });

  it('killProcessGroup with a grace of zero arms no timer', () => {
    const child = spawn('/bin/sh', ['-c', 'trap "" TERM; sleep 30'], {
      detached: true,
      stdio: 'ignore'
    });
    try {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      killProcessGroup(child, 0);
      assert.equal(vi.getTimerCount(), 0, 'a SIGKILL was parked on a timer');
    } finally {
      vi.useRealTimers();
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* already gone, which is the point */
        }
      }
    }
  });

  it('killProcessGroup with a grace keeps the SIGTERM first and one escalation timer', () => {
    const child = spawn('/bin/sh', ['-c', 'sleep 30'], { detached: true, stdio: 'ignore' });
    try {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      killProcessGroup(child, 500);
      assert.equal(vi.getTimerCount(), 1);
    } finally {
      vi.useRealTimers();
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }
  });
});
