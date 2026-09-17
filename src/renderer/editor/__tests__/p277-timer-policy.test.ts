/**
 * PHASE 277 — A TIMER MAY NOT OUTLIVE THE POLICY THAT ARMED IT (audit F2),
 * and it may not race a person's ⌘S (attack arm B).
 *
 * The 14 September architecture audit, finding F2: `arm` checked the mode when
 * it created a timer, `run` checked dialogs, eligibility and its own in-flight
 * set and never re-read the mode at all, and no settings change cancelled a
 * pending timer. So the answer a save acted on could be a whole delay period
 * out of date, and the auditor's own counterexample
 * (docs/audits/fixtures/2026-09-14/auto-save-interleavings.test.ts.fixture)
 * measured a real guarded save submitted after the person had switched auto
 * save to Off. That fixture is copied unedited to ./audit-0914-auto-save.test.ts
 * and is the phase's closure test; this file is the rest of the argument.
 *
 * WHAT IS PROVED WHERE, so neither file is read for something it cannot say:
 *
 *  - §1 drives `policyPermits` directly. It is the pure half, so the whole
 *    mode-to-trigger matrix is six assertions and no clock.
 *  - §2 to §6 drive the real controller with an injected clock and an injected
 *    `save`, so every claim about WHEN a save is asked for is measured with no
 *    real time in it. They prove nothing about the write; that is ./tab-io's,
 *    `npm run conformance:save` reads the doors structurally, and
 *    `npm run probe:p277` drives the running app.
 *  - §7 is attack arm B, and it drives REAL ./tab-io: a ⌘S held open with a
 *    deferred acknowledgement while a timer falls due underneath it.
 *    Everything above it passes with the scheduler alone; arm B needs the
 *    serialiser too, because that is the defect.
 *  - §8 is the fix round, on arm B's rig: a timer that falls due during a held
 *    save, then Off, a dialog, or the stale dialog a ⌘S raised. As first built,
 *    each of the three wrote a second time.
 *  - The store's own subscription to the settings store is not driven here;
 *    ./p277-store-close-and-policy.test.ts drives it through the real store.
 *
 * THE TWO HALVES OF F2 ARE TESTED SEPARATELY ON PURPOSE. §2 changes the policy
 * and NEVER calls `notePolicyChanged`, because the re-read inside `run` is the
 * belt that has to survive a round which unwires the hook. §3 then drives the
 * hook and reads the timer count, which is the braces.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutoSaveSettings } from '@shared/settings';
import type { FsGuardedWriteInput, FsGuardedWriteResult } from '@shared/fs-ops';
import type { EditorTab } from '../tab-types';
import {
  createAutoSave,
  policyPermits,
  type AutoSaveController,
  type AutoSaveStopWhy
} from '../auto-save';

// ---------------------------------------------------------------------------
// The doubles §7 needs, hoisted, because they have to be in place before
// ./tab-io is imported. §1 to §6 never touch them.
//
// `getWorkingModel` answers the SAME object every time, which is what makes the
// completion rule's reference check pass in the ordinary case; the close-and-
// reopen case that makes it fail is ./p277-save-completion.test.ts's.
// ---------------------------------------------------------------------------

const model = vi.hoisted(() => ({
  text: 'first edit',
  getValue(): string {
    return this.text;
  }
}));
vi.mock('../monaco-loader', () => ({
  getWorkingModel: () => model,
  resetWorkingModel() {},
  disposeModels() {},
  dropViewState() {},
  loadMonaco: async () => undefined,
  rememberLoaded() {}
}));
const writeGuarded = vi.fn<(input: unknown) => Promise<FsGuardedWriteResult>>();
// FIX ROUND. The stale arm reads the disk once more before it raises its
// dialog, so arm B's rig answers that read from the same string main writes.
const readFile = vi.fn(async () => ({ contents: '', truncated: false }));
vi.stubGlobal('window', {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  gmux: {
    fs: { writeGuarded, readFile },
    git: { onChanged: () => () => undefined },
    setSessionsPosition: async () => undefined,
    setProjectsPosition: async () => undefined
  }
});
vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
vi.stubGlobal('document', {
  body: { classList: { add() {}, remove() {}, contains: () => false } }
});
const { createTabIo } = await import('../tab-io');
const { useApp } = await import('../../state/store');

beforeEach(() => {
  vi.clearAllMocks();
  model.text = 'first edit';
});

const ROOT = '/repo';
const ID = `${ROOT}/notes.md`;

function tab(over: Partial<EditorTab> = {}): EditorTab {
  return {
    id: ID,
    path: ID,
    relPath: 'notes.md',
    origRelPath: null,
    repoPath: ROOT,
    name: 'notes.md',
    mode: 'file',
    canDiff: true,
    markdown: true,
    image: false,
    svg: false,
    html: false,
    imageData: null,
    imageHead: null,
    imageRevision: 0,
    preview: false,
    commit: null,
    pendingSelection: null,
    pendingFocus: true,
    dirty: true,
    deleted: false,
    truncated: false,
    loading: false,
    error: null,
    savedContents: 'original',
    headContents: null,
    lastUsed: 0,
    contextEntry: null,
    ...over
  };
}

// ---------------------------------------------------------------------------
// A clock with no time in it, kept in p268's shape so the two files read alike.
// ---------------------------------------------------------------------------

interface Clock {
  now: number;
  advance(ms: number): void;
  pending(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

function makeClock(): Clock {
  let seq = 0;
  let now = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    get now() {
      return now;
    },
    set(fn, ms) {
      seq += 1;
      due.set(seq, { at: now + ms, fn });
      return seq;
    },
    clear(handle) {
      due.delete(handle as number);
    },
    pending: () => due.size,
    advance(ms) {
      now += ms;
      // THE SNAPSHOT IS LOAD-BEARING SINCE PHASE 277, and it was verified
      // before this file relied on it. A blocked `delay` timer now RE-ARMS from
      // inside `run`, so firing one adds an entry to `due` while this loop is
      // running. Two things stop that looping: the snapshot means the new entry
      // is not examined at all, and the new entry's deadline is `now + delayMs`
      // against a `now` this call has already advanced, so it is not due either.
      // p268's own blocked-dialog test (:468) depends on the same two facts.
      for (const [id, entry] of [...due.entries()]) {
        if (entry.at <= now) {
          due.delete(id);
          entry.fn();
        }
      }
    }
  };
}

interface Harness {
  auto: AutoSaveController;
  clock: Clock;
  saves: string[];
  toasts: string[];
  tabs: Map<string, EditorTab>;
  patch(id: string, patch: Partial<EditorTab>): void;
  policy: AutoSaveSettings;
  /** What the injected `save` does. Default: it patches clean and resolves. */
  onSave: (id: string) => Promise<boolean>;
  blocked: boolean;
  roots: string[];
}

function harness(over: Partial<EditorTab> = {}): Harness {
  const clock = makeClock();
  const saves: string[] = [];
  const toasts: string[] = [];
  const first = tab(over);
  const tabs = new Map<string, EditorTab>([[first.id, first]]);

  const h: Harness = {
    auto: undefined as unknown as AutoSaveController,
    clock,
    saves,
    toasts,
    tabs,
    policy: { mode: 'afterDelay', delayMs: 1000 },
    onSave: (id) => {
      h.patch(id, { savedContents: `saved-${String(saves.length)}`, dirty: false });
      return Promise.resolve(true);
    },
    blocked: false,
    roots: [ROOT],
    patch(id, patch) {
      const before = tabs.get(id);
      const after = { ...(before as EditorTab), ...patch };
      tabs.set(id, after);
      h.auto.notePatched(id, before, after);
    }
  };

  h.auto = createAutoSave({
    save: (id) => {
      saves.push(id);
      return h.onSave(id);
    },
    byId: (id) => tabs.get(id),
    openRoots: () => h.roots,
    policy: () => h.policy,
    blocked: () => h.blocked,
    toast: (text) => toasts.push(text),
    setTimer: (fn, ms) => clock.set(fn, ms),
    clearTimer: (handle) => clock.clear(handle)
  });

  return h;
}

/** Let an injected `save` promise settle. No in-flight mark is involved. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// ---------------------------------------------------------------------------
// 1. The predicate, which is the rule spelled once.
// ---------------------------------------------------------------------------

describe('policyPermits — the whole mode-to-trigger matrix', () => {
  it('authorises a delay only under afterDelay', () => {
    expect(policyPermits('afterDelay', 'delay')).toBe(true);
    expect(policyPermits('onFocusChange', 'delay')).toBe(false);
    expect(policyPermits('off', 'delay')).toBe(false);
  });

  it('authorises a blur only under onFocusChange', () => {
    expect(policyPermits('onFocusChange', 'blur')).toBe(true);
    expect(policyPermits('afterDelay', 'blur')).toBe(false);
    expect(policyPermits('off', 'blur')).toBe(false);
  });

  it('authorises nothing at all under off, which is the shipped default', () => {
    expect(policyPermits('off', 'delay')).toBe(false);
    expect(policyPermits('off', 'blur')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. THE LAST GATE. The policy moves and the hook is NEVER called, because
//    `run`'s own re-read has to hold on its own.
// ---------------------------------------------------------------------------

describe('a pending delay re-reads the policy in the last moment before the save', () => {
  it('writes nothing after a switch to off', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    expect(h.clock.pending()).toBe(1);
    h.policy = { mode: 'off', delayMs: 1000 };
    h.clock.advance(1000);
    expect(h.saves).toEqual([]);
    expect(h.tabs.get(ID)?.dirty).toBe(true);
  });

  it('writes nothing after a switch to onFocusChange', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    h.policy = { mode: 'onFocusChange', delayMs: 1000 };
    h.clock.advance(1000);
    // Refused by the clause that authorises DELAYS, not by "is auto save on":
    // the tab is still an auto-save tab, it is just not one a clock may write.
    expect(h.saves).toEqual([]);
    h.auto.noteBlur(ID);
    expect(h.saves).toEqual([ID]);
  });

  it('still saves when the policy did not move, so the gate is not just off', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    expect(h.saves).toEqual([ID]);
  });

  it('honours a mode switched BACK before the timer fires', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    h.policy = { mode: 'off', delayMs: 1000 };
    h.policy = { mode: 'afterDelay', delayMs: 1000 };
    h.clock.advance(1000);
    expect(h.saves).toEqual([ID]);
  });
});

// ---------------------------------------------------------------------------
// 3. THE HOOK. What the store's one settings subscription calls.
// ---------------------------------------------------------------------------

describe('notePolicyChanged re-arms what is pending and nothing else', () => {
  it('cancels a pending delay on the switch to off, rather than leaving it to expire', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    expect(h.clock.pending()).toBe(1);
    h.policy = { mode: 'off', delayMs: 1000 };
    h.auto.notePolicyChanged();
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
  });

  it('cancels a pending delay on the switch to onFocusChange, and the blur still works', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    h.policy = { mode: 'onFocusChange', delayMs: 1000 };
    h.auto.notePolicyChanged();
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
    h.auto.noteBlur(ID);
    expect(h.saves).toEqual([ID]);
  });

  it('ARMS NOTHING when auto save is switched ON over an already-dirty tab', () => {
    // The chosen difference from VS Code's EditorAutoSave, which saves every
    // dirty editor the moment auto save goes on. A person's open files are not
    // opted into timed writes by a change of setting alone.
    const h = harness();
    h.policy = { mode: 'off', delayMs: 1000 };
    h.auto.noteChanged(ID);
    expect(h.clock.pending()).toBe(0);
    h.policy = { mode: 'afterDelay', delayMs: 1000 };
    h.auto.notePolicyChanged();
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
    // The next keystroke is what starts it, and it works immediately.
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    expect(h.saves).toEqual([ID]);
  });

  it('survives REPEATED changes without arming, writing or leaking a timer', () => {
    const h = harness();
    h.policy = { mode: 'off', delayMs: 1000 };
    for (let i = 0; i < 10; i += 1) {
      h.policy = { mode: i % 2 === 0 ? 'afterDelay' : 'off', delayMs: 1000 };
      h.auto.notePolicyChanged();
      expect(h.clock.pending()).toBe(0);
    }
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
  });

  it('re-arms a pending timer once per change and never accumulates them', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    for (let i = 0; i < 10; i += 1) {
      h.policy = { mode: 'afterDelay', delayMs: 1000 + i };
      h.auto.notePolicyChanged();
      expect(h.clock.pending()).toBe(1);
    }
    h.clock.advance(60_000);
    expect(h.saves).toEqual([ID]);
  });

  it('leaves a tab that went clean under the change alone', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    h.tabs.set(ID, { ...(h.tabs.get(ID) as EditorTab), dirty: false });
    h.policy = { mode: 'afterDelay', delayMs: 2000 };
    h.auto.notePolicyChanged();
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
  });

  it('touches only the tabs that hold a timer, per tab', () => {
    const h = harness();
    const other = tab({
      id: `${ROOT}/other.md`,
      path: `${ROOT}/other.md`,
      name: 'other.md'
    });
    h.tabs.set(other.id, other);
    // Only ID is typed into, so only ID holds a timer.
    h.auto.noteChanged(ID);
    h.policy = { mode: 'off', delayMs: 1000 };
    h.auto.notePolicyChanged();
    expect(h.clock.pending()).toBe(0);
    h.policy = { mode: 'afterDelay', delayMs: 1000 };
    h.auto.notePolicyChanged();
    // Neither is re-armed: ID's timer is gone and other.md never had one.
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. The delay change, which RESCHEDULES rather than cancelling or keeping an
//    old deadline computed from a number the person has just replaced.
// ---------------------------------------------------------------------------

describe('a changed delay reschedules from now', () => {
  it('lengthening the delay moves the deadline out', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    h.clock.advance(500);
    h.policy = { mode: 'afterDelay', delayMs: 2000 };
    h.auto.notePolicyChanged();
    // The old deadline was 1000. It is gone, and the new one is now + 2000.
    h.clock.advance(1999);
    expect(h.saves).toEqual([]);
    h.clock.advance(1);
    expect(h.saves).toEqual([ID]);
  });

  it('SHORTENING THE DELAY LATE EXTENDS THE CURRENT WAIT, which was decided', () => {
    // The map holds a handle and no arm time, so a re-arm runs the new delay
    // from NOW rather than from the last keystroke. At 900 ms into a 1000 ms
    // wait, dropping the setting to 500 ms means 1400 rather than 1000. An arm
    // timestamp would buy a few hundred milliseconds of precision on a gesture
    // nobody times; this is the trade, written down so a later round does not
    // "fix" it without knowing it was chosen.
    const h = harness();
    h.auto.noteChanged(ID);
    h.clock.advance(900);
    h.policy = { mode: 'afterDelay', delayMs: 500 };
    h.auto.notePolicyChanged();
    h.clock.advance(100);
    expect(h.saves).toEqual([]);
    h.clock.advance(399);
    expect(h.saves).toEqual([]);
    h.clock.advance(1);
    expect(h.saves).toEqual([ID]);
  });

  it('does not cancel, which is the answer this phase refused', () => {
    const h = harness();
    h.auto.noteChanged(ID);
    h.policy = { mode: 'afterDelay', delayMs: 5000 };
    h.auto.notePolicyChanged();
    expect(h.clock.pending()).toBe(1);
    h.clock.advance(5000);
    expect(h.saves).toEqual([ID]);
  });
});

// ---------------------------------------------------------------------------
// 5. THE BLOCKED DIALOG. `blocked()` is GLOBAL, so this is about every dirty
//    tab in the window and not only the one the question is about.
// ---------------------------------------------------------------------------

describe('a confirm on screen defers a delay instead of killing it', () => {
  it('re-arms the due timer and saves once the question is answered', () => {
    const h = harness();
    h.blocked = true;
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    // Nothing was written underneath the question...
    expect(h.saves).toEqual([]);
    // ...and the work was not thrown away either. At the parent this was 0.
    expect(h.clock.pending()).toBe(1);
    h.clock.advance(1000);
    expect(h.saves).toEqual([]);
    expect(h.clock.pending()).toBe(1);
    h.blocked = false;
    h.clock.advance(1000);
    expect(h.saves).toEqual([ID]);
  });

  it("keeps EVERY other dirty tab's timer, which is the shape that lost work", () => {
    // Closing dirty tab A raises "Save changes to 'A'?" — and while the person
    // reads it, the pending timer of every OTHER dirty tab used to die for
    // good, because `blocked()` asks about the window rather than the tab.
    const h = harness();
    const other = tab({
      id: `${ROOT}/other.md`,
      path: `${ROOT}/other.md`,
      name: 'other.md'
    });
    h.tabs.set(other.id, other);
    h.auto.noteChanged(ID);
    h.auto.noteChanged(other.id);
    h.blocked = true;
    h.clock.advance(1000);
    expect(h.saves).toEqual([]);
    expect(h.clock.pending()).toBe(2);
    h.blocked = false;
    h.clock.advance(1000);
    expect([...h.saves].sort()).toEqual([other.id, ID].sort());
  });

  it('arms nothing for a tab that went clean while the question was up', () => {
    const h = harness();
    h.blocked = true;
    h.auto.noteChanged(ID);
    h.tabs.set(ID, { ...(h.tabs.get(ID) as EditorTab), dirty: false });
    h.clock.advance(1000);
    // The re-arm goes through `arm`, so the skip list refuses it.
    expect(h.clock.pending()).toBe(0);
    h.blocked = false;
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
  });

  it('arms nothing when the policy changed while the question was up', () => {
    const h = harness();
    h.blocked = true;
    h.auto.noteChanged(ID);
    h.policy = { mode: 'off', delayMs: 1000 };
    h.clock.advance(1000);
    // `arm` re-reads the mode, so "blocked" needs no policy code of its own.
    expect(h.clock.pending()).toBe(0);
    h.blocked = false;
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
  });

  it('DROPS a blocked blur, because the gesture is over and the next blur retries', () => {
    const h = harness();
    h.policy = { mode: 'onFocusChange', delayMs: 1000 };
    h.blocked = true;
    h.auto.noteBlur(ID);
    expect(h.saves).toEqual([]);
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
    h.blocked = false;
    h.auto.noteBlur(ID);
    expect(h.saves).toEqual([ID]);
  });
});

// ---------------------------------------------------------------------------
// 6. The scheduler keeps no in-flight set, and every cancellation survives.
// ---------------------------------------------------------------------------

describe("serialisation is ./tab-io's, so the scheduler asks freely", () => {
  it('ASKS AGAIN while a save is unresolved, instead of dropping the work', async () => {
    // At the parent this was the drop: `run` deleted the handle and then
    // returned on its own in-flight set, and nothing re-armed. Measured there
    // as one save, no pending timer, and the newer typing never written.
    const h = harness();
    let release!: (ok: boolean) => void;
    h.onSave = () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      });
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    expect(h.saves).toEqual([ID]);

    // More typing while the first save is still unanswered.
    h.patch(ID, { dirty: true });
    h.auto.noteChanged(ID);
    h.clock.advance(1000);
    expect(h.saves).toEqual([ID, ID]);
    release(true);
    await settle();
  });

  it('still cancels on a stop, on a patch to clean, on forget and on disposeAll', async () => {
    const h = harness();
    // Stopped.
    h.auto.noteChanged(ID);
    h.auto.recordStop(ID, { kind: 'stale' } satisfies AutoSaveStopWhy);
    expect(h.clock.pending()).toBe(0);
    h.auto.forget(ID);

    // Gone clean, through the store's patch funnel.
    h.patch(ID, { dirty: true });
    h.auto.noteChanged(ID);
    expect(h.clock.pending()).toBe(1);
    h.patch(ID, { dirty: false });
    expect(h.clock.pending()).toBe(0);

    // Closed.
    h.patch(ID, { dirty: true });
    h.auto.noteChanged(ID);
    h.auto.forget(ID);
    expect(h.clock.pending()).toBe(0);

    // Disposed.
    h.auto.noteChanged(ID);
    expect(h.clock.pending()).toBe(1);
    h.auto.disposeAll();
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.saves).toEqual([]);
  });

  it('re-arms on every change, so a burst still writes once after the LAST one', () => {
    const h = harness();
    for (let i = 0; i < 3; i += 1) {
      h.auto.noteChanged(ID);
      h.clock.advance(100);
    }
    expect(h.clock.pending()).toBe(1);
    h.clock.advance(899);
    expect(h.saves).toEqual([]);
    h.clock.advance(1);
    expect(h.saves).toEqual([ID]);
  });
});

// ---------------------------------------------------------------------------
// 7. ATTACK ARM B — a timer falling due underneath a held ⌘S.
//
// This one drives the REAL ./tab-io, because the defect is the two halves
// meeting: a person presses ⌘S, the bridge has not answered yet, the debounce
// expires, and a second guarded write goes out carrying the SAME precondition.
// One of the two is then answered `stale` — a dialog, or a permanent auto-save
// stop and a sticky toast, about a concurrent writer that does not exist.
// Spending issue 16's one sentence on Tortie's own timer teaches a person to
// press Overwrite on the dialog that exists to stop them.
//
// The channel double below is a compare-and-swap over one string, processed in
// ARRIVAL ORDER, with the first request held open until the test releases it.
// That is main's real shape: each `fs:writeGuarded` reads, compares and renames
// on its own, so the second one to commit sees the first one's bytes.
// ---------------------------------------------------------------------------

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

interface ArmBRig {
  auto: AutoSaveController;
  save(reason?: 'explicit' | 'auto'): Promise<boolean>;
  current(): EditorTab;
  disk(): string;
  /** FIX ROUND. Another writer puts these bytes on disk. */
  writeDisk(text: string): void;
  /** FIX ROUND. The live policy, which `run` and `arm` read on every call. */
  policy: AutoSaveSettings;
  sent(): { expect: string; contents: string }[];
  pending(): number;
  tick(): void;
  type(text: string): void;
  releaseFirst(): Promise<void>;
}

function armBRig(): ArmBRig {
  let current = tab({ savedContents: 'first edit', dirty: false });
  let timerId = 0;
  const timers = new Map<number, () => void>();
  const policy: AutoSaveSettings = { mode: 'afterDelay', delayMs: 1000 };
  const disk = { text: 'first edit' };
  const sent: { expect: string; contents: string }[] = [];
  let openGate: (() => void) | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  readFile.mockImplementation(async () => ({ contents: disk.text, truncated: false }));
  writeGuarded.mockImplementation((raw) => {
    const input = raw as FsGuardedWriteInput;
    sent.push({ expect: input.expect, contents: input.contents });
    const mine = sent.length;
    const answer = chain.then(async (): Promise<FsGuardedWriteResult> => {
      if (mine === 1) {
        await new Promise<void>((resolve) => {
          openGate = resolve;
        });
      }
      const onDisk = await sha256Hex(disk.text);
      if (input.expect !== onDisk) {
        return { outcome: 'stale', sha256: onDisk, reason: 'changed on disk' };
      }
      disk.text = input.contents;
      return {
        outcome: 'wrote',
        sha256: await sha256Hex(input.contents),
        bytes: input.contents.length
      };
    });
    chain = answer.then(
      () => undefined,
      () => undefined
    );
    return answer;
  });

  const auto = createAutoSave({
    save: (id) => io.save(id, 'auto'),
    byId: () => current,
    openRoots: () => [ROOT],
    policy: () => policy,
    // FIX ROUND. The store's own question, so a dialog raised by the save path
    // blocks the timer exactly as it does in the app.
    blocked: () => useApp.getState().confirm !== null,
    toast() {},
    setTimer(fn) {
      timerId += 1;
      timers.set(timerId, fn);
      return timerId;
    },
    clearTimer(handle) {
      timers.delete(handle as number);
    }
  });
  const io = createTabIo({
    byId: () => current,
    worktreeTabsIn: () => [],
    patch(_id, patch) {
      const before = current;
      current = { ...current, ...patch };
      auto.notePatched(ID, before, current);
    },
    autoStop(id, why) {
      auto.recordStop(id, why);
      return false;
    }
  });

  return {
    auto,
    save: (reason) => io.save(ID, reason),
    current: () => current,
    disk: () => disk.text,
    writeDisk(text) {
      disk.text = text;
    },
    policy,
    sent: () => sent,
    pending: () => timers.size,
    tick() {
      for (const [id, fn] of [...timers]) {
        timers.delete(id);
        fn();
      }
    },
    type(text) {
      model.text = text;
      current = { ...current, dirty: text !== current.savedContents };
      auto.noteChanged(ID);
    },
    async releaseFirst() {
      await vi.waitFor(() => {
        expect(openGate).not.toBeNull();
      });
      (openGate as unknown as () => void)();
    }
  };
}

describe('arm B — a due timer under a held ⌘S', () => {
  it('sends ONE guarded write, is never answered stale, and stops nothing', async () => {
    const r = armBRig();
    r.type('first edit plus a word');
    expect(r.pending()).toBe(1);

    // The person presses ⌘S. The bridge has it; main has not answered.
    const pressed = r.save();
    await vi.waitFor(() => {
      expect(r.sent()).toHaveLength(1);
    });

    // The debounce expires underneath it. At the parent this submitted a
    // SECOND guarded write carrying the same precondition. Real time rather
    // than a microtask turn, because the save path awaits a WebCrypto digest
    // before it reaches the bridge and a turn or two would let this pass while
    // the second request was still on its way.
    r.tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(r.sent()).toHaveLength(1);

    await r.releaseFirst();
    expect(await pressed).toBe(true);
    await vi.waitFor(() => {
      expect(r.current().dirty).toBe(false);
    });

    expect(r.sent()).toHaveLength(1);
    expect(r.disk()).toBe('first edit plus a word');
    // The reading that matters: no stale answer, so no stop record, no sticky
    // toast, and no dialog about a writer that does not exist.
    expect(r.auto.stoppedFor(ID)).toBeUndefined();
    expect(r.pending()).toBe(0);
    r.auto.disposeAll();
  });

  it('the typing that happened DURING the held save is written by the next timer', async () => {
    const r = armBRig();
    r.type('first edit plus a word');
    const pressed = r.save();
    await vi.waitFor(() => {
      expect(r.sent()).toHaveLength(1);
    });
    expect(r.sent()[0]?.contents).toBe('first edit plus a word');

    // More typing, then the debounce, both while the ⌘S is unanswered. Nothing
    // may go out while the slot is held, whatever the digest is doing.
    r.type('first edit plus a word and another');
    r.tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(r.sent()).toHaveLength(1);

    // FIX ROUND. The timer that fell due was not queued behind the ⌘S; it was
    // RE-ARMED, so the work is deferred rather than dropped and every question
    // is asked again when it next falls due. As first built, this test read a
    // queued follow-up writing straight after the release, and that follow-up
    // is what wrote under Off and under a dialog.
    expect(r.pending()).toBe(1);
    await r.releaseFirst();
    expect(await pressed).toBe(true);
    expect(r.current().dirty).toBe(true);
    expect(r.pending()).toBe(1);
    r.tick();
    await vi.waitFor(() => {
      expect(r.disk()).toBe('first edit plus a word and another');
    });
    expect(r.auto.stoppedFor(ID)).toBeUndefined();
    expect(r.current().dirty).toBe(false);
    expect(r.current().savedContents).toBe('first edit plus a word and another');
    // Two writes, one after the other, neither of them racing the other.
    expect(r.sent()).toHaveLength(2);
    expect(r.pending()).toBe(0);
    r.auto.disposeAll();
  });
});

// ---------------------------------------------------------------------------
// 8. FIX ROUND — a timer that falls due during a held save asks again later.
//
// Both verifiers found the same hole in the first build: a timer request that
// found the slot held was QUEUED in ../tab-io, and a queued request ran a whole
// write later without asking the policy, a dialog or the tab's lifetime again.
// `run`'s last gate had been asked before the request was queued, not before
// it ran. Now ../tab-io refuses a timer's request while the slot is held, and
// `run` re-arms a tab its save left dirty, through `arm`, so the next time the
// timer falls due every question is asked again.
// ---------------------------------------------------------------------------

describe('fix round — a timer that falls due during a held save', () => {
  beforeEach(() => {
    useApp.setState({ confirm: null } as never);
  });

  it('does not write after the policy is switched to Off (attack T1)', async () => {
    const r = armBRig();
    r.type('first edit plus a word');
    r.tick();
    await vi.waitFor(() => {
      expect(r.sent()).toHaveLength(1);
    });
    // Typing arms timer 2, and it falls due while write 1 is still held.
    r.type('first edit plus a word and more');
    r.tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(r.sent()).toHaveLength(1);

    r.policy.mode = 'off';
    r.auto.notePolicyChanged();
    await r.releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const reading = { writes: r.sent().length, pending: r.pending(), dirty: r.current().dirty };
    expect(reading).toEqual({ writes: 1, pending: 0, dirty: true });
    r.auto.disposeAll();
  });

  it('does not write under a dialog raised while the save was held (attack T2)', async () => {
    const r = armBRig();
    r.type('first edit plus a word');
    r.tick();
    await vi.waitFor(() => {
      expect(r.sent()).toHaveLength(1);
    });
    r.type('first edit plus a word and more');
    r.tick();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // "Save changes to 'notes.md'?" goes up while the write is still held.
    useApp.getState().setConfirm({
      title: "Save changes to 'notes.md'?",
      body: '',
      confirmLabel: 'Save',
      onConfirm: () => undefined
    });
    await r.releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 20));
    r.tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(r.sent()).toHaveLength(1);
    expect(r.pending()).toBe(1);

    // The question is answered some other way and the timer is let through.
    useApp.setState({ confirm: null } as never);
    r.tick();
    await vi.waitFor(() => {
      expect(r.sent()).toHaveLength(2);
    });
    expect(r.sent()[1]?.contents).toBe('first edit plus a word and more');
    r.auto.disposeAll();
  });

  it("does not write under the stale dialog a person's ⌘S raised (attack T7)", async () => {
    const r = armBRig();
    r.type('first edit plus a word');
    const pressed = r.save();
    await vi.waitFor(() => {
      expect(r.sent()).toHaveLength(1);
    });
    r.type('first edit plus a word and more');
    r.tick();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Somebody else writes the file before main answers the ⌘S.
    r.writeDisk('an agent paragraph');
    await r.releaseFirst();
    expect(await pressed).toBe(false);
    expect(useApp.getState().confirm?.title).toBe("'notes.md' changed on disk");
    await new Promise((resolve) => setTimeout(resolve, 20));
    r.tick();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(r.sent()).toHaveLength(1);
    expect(r.disk()).toBe('an agent paragraph');
    expect(r.auto.stoppedFor(ID)).toBeUndefined();
    r.auto.disposeAll();
  });
});
