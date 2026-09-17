/**
 * PHASE 277, audit F1. THE COMPLETION RULE, ATTACKED.
 *
 * The auditor shipped one counterexample and this file is the rest of the
 * closure the phase entry asks for: the four cases the audit named that the
 * fixture does not cover, plus a fifth of ours, plus the unchanged-buffer
 * control, plus the same attack repeated on every door a save can take rather
 * than only the one the fixture drives.
 *
 * ## The defect, in one sentence
 *
 * Each of the four success arms in ../tab-io moved `savedContents` to the text
 * it wrote and asserted a CLEAN tab in the same `deps.patch`, without asking
 * what the buffer holds now. So an acknowledgement for text the person had
 * already typed past said the tab was clean. `completeSave` moves the baseline
 * always and ASKS the model about dirty, with `MonacoHost.tsx:311`'s own
 * question, and patches nothing at all when the id no longer holds the instance
 * the save read its text from.
 *
 * ## Why the model INSTANCE is the identity, and why that decides this rig
 *
 * A tab id is an absolute path (../tab-identity), reused across lifetimes by
 * construction. ../monaco-loader keys one model per tab id, disposes it on
 * close and creates a fresh one on the next open, so the two lifetimes of one
 * path are two objects and `===` is the whole test. That is why the double
 * below is a REGISTRY — a Map that open and close move — rather than a function
 * answering with a fresh object. A double that answers with a new object every
 * call is a tab whose lifetime ends between the write and its answer, which is
 * arm D happening on every single save, and it would make this whole file pass
 * for the wrong reason.
 *
 * ## What is NOT proved here
 *
 * Nothing in this file touches disk, a machine, Monaco or Electron. The
 * channel's own promise — that a write refuses when somebody else got there
 * first — is `conformance:redline-write` and `probe:p268`, and this phase does
 * not change one byte of it. What is proved here is the other promise, the one
 * the audit says nothing else was keeping: whether the editor correctly
 * represents its OWN unsaved work.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FsGuardedWriteResult } from '@shared/fs-ops';
import type { EditorTab } from '../tab-types';

// --------------------------------------------------------------------------
// The model registry double: open, close, type. One object per lifetime.
// --------------------------------------------------------------------------

const models = vi.hoisted(() => {
  const map = new Map<string, { text: string; getValue(): string }>();
  return {
    map,
    open(id: string, text: string) {
      const model = {
        text,
        getValue(): string {
          return this.text;
        }
      };
      map.set(id, model);
      return model;
    }
  };
});
/** Every `resetWorkingModel` the watcher asked for, which is arm E's reading. */
const resets = vi.hoisted(() => [] as { id: string; text: string }[]);
vi.mock('../monaco-loader', () => ({
  getWorkingModel: (id: string) => models.map.get(id) ?? null,
  // The production one applies the text to the live buffer, so the double does
  // too: arm E is about a buffer being REPLACED, and a spy that recorded the
  // call without replacing anything would not measure the loss.
  resetWorkingModel: (id: string, text: string) => {
    resets.push({ id, text });
    const model = models.map.get(id);
    if (model !== undefined) model.text = text;
  },
  disposeModels: (id: string) => {
    models.map.delete(id);
  },
  dropViewState: () => undefined,
  loadMonaco: async () => undefined,
  rememberLoaded: () => undefined
}));

// --------------------------------------------------------------------------
// The bridge
// --------------------------------------------------------------------------

const writeGuarded = vi.fn<(input: unknown) => Promise<FsGuardedWriteResult>>();
const writeFile = vi.fn(async () => undefined);
const readFile = vi.fn(async () => ({ contents: 'on disk\n', truncated: false }));
const readDir = vi.fn(async () => ({ entries: [{ name: 'notes.md' }] }));
type PutInput = import('@shared/ipc').MachineFilePutInput;
type PutResult = import('@shared/ipc').MachineFilePutResult;
const putFile = vi.fn<(input: PutInput) => Promise<PutResult>>();
const showHead = vi.fn(async () => '');

vi.stubGlobal('window', {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  gmux: {
    fs: { writeGuarded, writeFile, readFile, readDir },
    git: { showHead, onChanged: () => () => undefined },
    machines: { putFile }
  }
});
vi.stubGlobal(
  'CustomEvent',
  class {
    detail: unknown;
    constructor(_name: string, init: { detail: unknown }) {
      this.detail = init.detail;
    }
  }
);
vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
vi.stubGlobal('document', {
  body: { classList: { add() {}, remove() {}, contains: () => false } }
});

const { createTabIo } = await import('../tab-io');
const { useApp } = await import('../../state/store');
type ConfirmSpec = import('../../state/overlays-slice').ConfirmSpec;
type MachineStateView = import('@shared/ipc').MachineStateView;

// --------------------------------------------------------------------------
// The tab and the rig
// --------------------------------------------------------------------------

const REPO = '/repo';
const ID = '/repo/notes.md';
/**
 * What Tortie last read, which is what the buffer was built from and what every
 * precondition below is the digest of.
 *
 * IT IS DELIBERATELY NOT THE TEXT ANY WRITE SENDS. A rig whose baseline already
 * equals the bytes being written cannot wait for a completion: `await
 * vi.waitFor(() => expect(tab.savedContents).toBe(X))` returns on the first
 * tick, before the acknowledgement has landed, and four arms of this file
 * passed under an ablation that put the parent's unconditional clean patch
 * back. The baseline MOVES here, so waiting on it waits for the thing the arm
 * is about.
 */
const READ = 'original';
/** What the buffer holds when the save starts — the text the write carries. */
const FIRST = 'first edit';
/** What the person types while that first write is still in the air. */
const NEWER = 'first edit plus newer typing';

const wrote: FsGuardedWriteResult = { outcome: 'wrote', sha256: 'new', bytes: 10 };

function tabOf(over: Partial<EditorTab> = {}): EditorTab {
  return {
    id: ID,
    path: ID,
    relPath: 'notes.md',
    origRelPath: null,
    repoPath: REPO,
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
    savedContents: READ,
    headContents: null,
    lastUsed: 0,
    contextEntry: null,
    ...over
  } as EditorTab;
}

/**
 * One tab, one model, one IO layer, and a `patch` that really merges — because
 * every arm here turns on what a LATER read of the tab says, and a rig that
 * only records patches cannot answer that.
 */
function rig(over: Partial<EditorTab> = {}, buffer: string = FIRST) {
  let current = tabOf(over);
  const patches: Partial<EditorTab>[] = [];
  const model = models.open(ID, buffer);
  const io = createTabIo({
    patch: (_id, patch) => {
      patches.push(patch);
      current = { ...current, ...patch };
    },
    byId: (id) => (id === current.id ? current : undefined),
    worktreeTabsIn: () => [current],
    autoStop: () => false as const
  });
  return {
    io,
    model,
    patches,
    tab: () => current,
    /** A keystroke: the buffer moves and MonacoHost's own rule marks it dirty. */
    type(text: string) {
      model.text = text;
      current = { ...current, dirty: text !== current.savedContents };
    },
    /** `forceCloseTab` disposes the model and drops the key. */
    close() {
      models.map.delete(ID);
    }
  };
}

/** One machine with a folder a person has confirmed Tortie may write under. */
function machine(writeRoot: string | null): MachineStateView[] {
  return [
    {
      id: 'studio',
      label: 'Studio',
      color: 'blue',
      link: 'connected',
      everAnswered: true,
      lastAnsweredAt: 0,
      detail: null,
      writeRoot
    }
  ];
}

/** Hold the next guarded write open, and hand back the answer to release it. */
function holdGuarded(): () => void {
  let acknowledge!: (result: FsGuardedWriteResult) => void;
  writeGuarded.mockImplementationOnce(
    () =>
      new Promise<FsGuardedWriteResult>((resolve) => {
        acknowledge = resolve;
      })
  );
  return () => {
    acknowledge(wrote);
  };
}

const confirm = (): ConfirmSpec | null => useApp.getState().confirm;
const toasts = (): string[] =>
  useApp.getState().toasts.map((t: { text: string }) => t.text);

beforeEach(() => {
  vi.clearAllMocks();
  models.map.clear();
  resets.length = 0;
  writeGuarded.mockResolvedValue(wrote);
  readFile.mockResolvedValue({ contents: 'on disk\n', truncated: false });
  putFile.mockResolvedValue({
    outcome: 'wrote',
    sha256: 'b'.repeat(64),
    bytes: 10
  } as PutResult);
  useApp.setState({ toasts: [], confirm: null, machineStates: machine(null) } as never);
});

// ==========================================================================
// Arm A — explicit-save overlap
// ==========================================================================

describe('arm A: ⌘S while a save is already in flight', () => {
  /**
   * AT THE PARENT, TWO WRITES WENT OUT AGAINST THE SAME FROZEN PRECONDITION.
   * Both doors computed `expect` from the same `tab.savedContents`, so the
   * second one could only ever be answered `stale`, and the person read
   * "'notes.md' changed on disk / Something wrote to it after Tortie read it"
   * about a writer that does not exist. Spending issue 16's one sentence on
   * Tortie's own save teaches a person to press Overwrite on the dialog that
   * exists to stop them.
   *
   * The second answer here is `stale` deliberately: that is what main WOULD
   * say to a second write carrying an out-of-date precondition, so if the slot
   * ever stops holding, this arm reproduces the parent's dialog rather than
   * passing quietly.
   */
  it('is one write, one answer, and no dialog about a writer that does not exist', async () => {
    const r = rig();
    const release = holdGuarded();
    writeGuarded.mockResolvedValue({
      outcome: 'stale',
      sha256: 'digest-of-nobodys-bytes',
      reason: 'the file changed'
    } as FsGuardedWriteResult);

    const first = r.io.save(ID, 'auto');
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    const second = r.io.save(ID);
    release();

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(writeGuarded).toHaveBeenCalledTimes(1);
    expect(confirm()).toBeNull();
    expect(toasts()).toEqual([]);
    // The buffer never moved, so the follow-up found a tab already on disk and
    // wrote nothing. That is the ONE place a save is skipped for being clean.
    expect(r.tab().savedContents).toBe(FIRST);
    expect(r.tab().dirty).toBe(false);
  });

  it("joins a person's requests to ONE follow-up, and refuses a timer's", async () => {
    const r = rig();
    const release = holdGuarded();
    const first = r.io.save(ID, 'auto');
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    // Ten presses' worth of requests during one write are one extra save.
    r.type(NEWER);
    const joined = [
      r.io.save(ID, 'auto'),
      r.io.save(ID),
      r.io.save(ID, 'auto'),
      r.io.save(ID)
    ];
    release();

    expect(await first).toBe(true);
    // FIX ROUND. The two timer requests answer false and join nothing. A timer
    // that finds a save running is not remembered here, because a remembered
    // request runs a whole write later, after the policy, a dialog or a close
    // may have changed. ../auto-save re-arms it instead, so it asks every
    // question again when it next falls due.
    expect(await Promise.all(joined)).toEqual([false, true, false, true]);
    expect(writeGuarded).toHaveBeenCalledTimes(2);
  });
});

// ==========================================================================
// Arm C — a second request during a held write is DEFERRED, not dropped
// ==========================================================================

describe('arm C: typing during a held write', () => {
  /**
   * TWO DIFFERENT PARENT READINGS REACH ONE END STATE, which is why the audit
   * asked for this arm separately from the fixture's.
   *
   *  - Through the scheduler, the second timer was DROPPED: `run` deleted its
   *    handle before the in-flight check and nothing re-armed, so the reading
   *    was `writes=1, pending=0` with the newer typing never written. That arm
   *    reaches the fixture's end state with the clean-edge cancellation never
   *    involved at all, so a repair that only stopped the cancellation would
   *    have left it broken.
   *  - Through ../tab-io alone, as this rig drives it, the two requests RACED:
   *    both froze the same precondition and the loser was answered `stale`.
   *
   * One slot per tab answers both. The second request is remembered, runs when
   * the first releases, and reads the tab and the buffer fresh at that moment.
   */
  it('writes the newer text, and the tab is clean about the text on disk', async () => {
    const r = rig();
    const release = holdGuarded();
    const first = r.io.save(ID, 'auto');
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    expect((writeGuarded.mock.calls[0]?.[0] as { contents: string }).contents).toBe(
      FIRST
    );

    r.type(NEWER);
    // FIX ROUND. The follow-up is a person's ⌘S. A timer's request is refused
    // while the slot is held; the next describe block is that case.
    const second = r.io.save(ID);
    release();

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(writeGuarded).toHaveBeenCalledTimes(2);
    // The follow-up read the buffer when it RAN, not when it was asked for.
    expect((writeGuarded.mock.calls[1]?.[0] as { contents: string }).contents).toBe(
      NEWER
    );
    expect(r.tab().savedContents).toBe(NEWER);
    expect(r.tab().dirty).toBe(false);
  });

  it('the first acknowledgement leaves the newer typing DIRTY', async () => {
    const r = rig();
    const release = holdGuarded();
    // Nothing releases the follow-up's write, so the reading below is the state
    // the parent left permanently: baseline moved, buffer newer.
    writeGuarded.mockImplementation(() => new Promise<FsGuardedWriteResult>(() => {}));
    void r.io.save(ID, 'auto');
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    r.type(NEWER);
    release();
    await vi.waitFor(() => {
      expect(r.tab().savedContents).toBe(FIRST);
    });

    // The file really does hold `FIRST`, so the baseline is a true statement.
    // The buffer holds something else, so the tab is dirty — and at the parent
    // this read `false`, which is a tab `closeTab` closes without asking.
    expect(r.tab().dirty).toBe(true);
    expect(r.model.getValue()).toBe(NEWER);
  });
});

// ==========================================================================
// Arm D — close and reopen of the same path
// ==========================================================================

describe('arm D: the tab that was closed while the write was in the air', () => {
  /**
   * The parent's reading, from the audit's rig with a close/reopen arm:
   * `{"saved":"first edit","dirty":false,"modelNow":"what the file says now"}`
   * — the previous lifetime's acknowledgement set the NEW tab's baseline to the
   * OLD buffer's text and cleared its dirty flag, so the new tab claimed to
   * hold bytes nobody had written.
   */
  it('patches nothing when the id now holds a different model', async () => {
    const r = rig();
    const release = holdGuarded();
    const first = r.io.save(ID, 'auto');
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });

    // Close, then reopen the same path: same id, a different buffer.
    r.close();
    const reopened = models.open(ID, 'what the file says now');
    release();

    expect(await first).toBe(true);
    expect(r.patches).toEqual([]);
    expect(reopened.getValue()).toBe('what the file says now');
  });

  it('patches nothing when the tab was closed and never reopened', async () => {
    const r = rig();
    const release = holdGuarded();
    const first = r.io.save(ID, 'auto');
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    r.close();
    release();

    expect(await first).toBe(true);
    expect(r.patches).toEqual([]);
  });

  it('still answers true, because a write really happened', async () => {
    // `promptDirtyClose` closes the tab when a save answers true. A dead
    // lifetime is not a failed write, and by the time this answers, the tab it
    // would have closed is already gone.
    const r = rig();
    const release = holdGuarded();
    const first = r.io.save(ID);
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    r.close();
    release();
    expect(await first).toBe(true);
    expect(toasts()).toEqual([]);
  });
});

// ==========================================================================
// Arm E — ours: the watcher writes an agent's bytes over the live buffer
// ==========================================================================

describe('arm E: what a falsely clean tab costs at the next watcher tick', () => {
  /**
   * THIS IS THE FIFTH ATTACK, AND IT IS A STRONGER LOSS ROUTE THAN `closeTab`.
   *
   * `refreshRepo` reloads a tab only `if (!tab.dirty)`, and this file's own
   * header says that skip "is what stops the watcher overwriting a person's
   * typing". A falsely clean tab is not skipped: the next agent write to that
   * file reaches `resetWorkingModel`, which applies the disk bytes over the
   * live buffer, and because `savedContents` was patched first, MonacoHost then
   * recomputes dirty as false. Silent, complete, and it needs no close at all.
   *
   * It is a UNIT arm rather than an app arm on purpose: it is the only form
   * that can measure the parent honestly, because at the parent the loss is
   * invisible on screen — the typing is simply not there any more.
   */
  it('the tab stays dirty, so the watcher skips it and the typing survives', async () => {
    const r = rig();
    const release = holdGuarded();
    writeGuarded.mockImplementation(() => new Promise<FsGuardedWriteResult>(() => {}));
    void r.io.save(ID, 'auto');
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    r.type(NEWER);
    release();
    await vi.waitFor(() => {
      expect(r.tab().savedContents).toBe(FIRST);
    });

    // An agent writes the file, and the watcher ticks.
    readFile.mockResolvedValue({
      contents: 'what the agent wrote\n',
      truncated: false
    });
    await r.io.refreshRepo(REPO);

    expect(resets).toEqual([]);
    expect(r.model.getValue()).toBe(NEWER);
  });

  it('and this is what the skip protects: a clean tab really is replaced', async () => {
    // The control that makes the arm above mean something. Same watcher tick,
    // same agent write, one flag different — the buffer is gone.
    const r = rig({ dirty: false, savedContents: FIRST }, FIRST);
    readFile.mockResolvedValue({
      contents: 'what the agent wrote\n',
      truncated: false
    });
    await r.io.refreshRepo(REPO);

    expect(resets).toEqual([{ id: ID, text: 'what the agent wrote\n' }]);
    expect(r.model.getValue()).toBe('what the agent wrote\n');
  });
});

// ==========================================================================
// The unchanged-buffer control the audit asked for
// ==========================================================================

describe('the unchanged-buffer control', () => {
  it('an explicit ⌘S on a clean tab still writes', async () => {
    // Refused deliberately as a place to add a short circuit: main has no
    // identical-bytes shortcut, it stages and renames, so skipping would be a
    // visible change to a gesture nobody complained about. The audit asked for
    // a TEST of unchanged-buffer success, not a new refusal.
    const r = rig({ dirty: false, savedContents: FIRST }, FIRST);
    expect(await r.io.save(ID)).toBe(true);
    expect(writeGuarded).toHaveBeenCalledTimes(1);
    expect(r.tab().savedContents).toBe(FIRST);
    expect(r.tab().dirty).toBe(false);
  });

  it('a settled buffer is written and the tab goes clean', async () => {
    const r = rig();
    r.type('settled');
    expect(await r.io.save(ID, 'auto')).toBe(true);
    expect(r.tab().savedContents).toBe('settled');
    expect(r.tab().dirty).toBe(false);
  });
});

// ==========================================================================
// EVERY door, not only the one the fixture drives
// ==========================================================================

describe('the completion rule is the same on all four doors', () => {
  it('the guarded door keeps newer typing dirty', async () => {
    const r = rig();
    const release = holdGuarded();
    writeGuarded.mockImplementation(() => new Promise<FsGuardedWriteResult>(() => {}));
    void r.io.save(ID, 'auto');
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    r.type(NEWER);
    release();
    await vi.waitFor(() => {
      expect(r.tab().savedContents).toBe(FIRST);
    });
    expect(r.tab().dirty).toBe(true);
  });

  it('the plain door keeps newer typing dirty', async () => {
    // A file outside every open project root — the `~/.claude/CLAUDE.md` shape
    // an agent edits. It takes `fs:writeFile`, which has no compare-and-swap at
    // all, so its await is one IPC round trip a person can type through.
    const OUT = '/elsewhere/notes.md';
    let current = tabOf({ id: OUT, path: OUT, savedContents: READ });
    const model = models.open(OUT, FIRST);
    const io = createTabIo({
      patch: (_id, patch) => {
        current = { ...current, ...patch };
      },
      byId: () => current,
      worktreeTabsIn: () => [],
      autoStop: () => false as const
    });
    readFile.mockResolvedValue({ contents: READ, truncated: false });
    let landed!: () => void;
    writeFile.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          landed = () => {
            resolve(undefined);
          };
        })
    );

    const save = io.save(OUT);
    await vi.waitFor(() => {
      expect(writeFile).toHaveBeenCalledTimes(1);
    });
    model.text = NEWER;
    current = { ...current, dirty: true };
    landed();

    expect(await save).toBe(true);
    expect(current.savedContents).toBe(FIRST);
    expect(current.dirty).toBe(true);
  });

  it('the deliberate Overwrite keeps newer typing dirty', async () => {
    // The widest window of the four: `value` was captured before the dialog was
    // drawn, and a person can read a dialog for as long as they like.
    const r = rig();
    writeGuarded.mockResolvedValueOnce({
      outcome: 'stale',
      sha256: 'digest-of-the-agents-bytes',
      reason: 'the file changed'
    } as FsGuardedWriteResult);
    readFile.mockResolvedValue({
      contents: 'what the agent wrote\n',
      truncated: false
    });
    expect(await r.io.save(ID)).toBe(false);
    const spec = confirm();
    expect(spec?.title).toBe("'notes.md' changed on disk");

    const release = holdGuarded();
    spec?.onAlt?.();
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(2);
    });
    // The person types between pressing Overwrite and the write landing.
    r.type(NEWER);
    release();
    await vi.waitFor(() => {
      expect(r.tab().savedContents).toBe(FIRST);
    });

    // The Overwrite wrote the text the dialog was ABOUT, which is right, and
    // the tab is dirty about the typing that came after it, which is the rule.
    expect((writeGuarded.mock.calls[1]?.[0] as { contents: string }).contents).toBe(
      FIRST
    );
    expect(r.tab().dirty).toBe(true);
  });

  it('the remote door keeps newer typing dirty, and still announces', async () => {
    useApp.setState({ machineStates: machine('/home/greg') } as never);
    const remote = {
      machineId: 'studio',
      machineLabel: 'Studio',
      repoPath: '/home/greg/api'
    };
    const RID = '/home/greg/api/src/auth.ts';
    let current = tabOf({
      id: RID,
      path: RID,
      repoPath: remote.repoPath,
      relPath: 'src/auth.ts',
      name: 'auth.ts',
      remote
    } as Partial<EditorTab>);
    const model = models.open(RID, FIRST);
    const io = createTabIo({
      patch: (_id, patch) => {
        current = { ...current, ...patch };
      },
      byId: () => current,
      worktreeTabsIn: () => [],
      autoStop: () => false as const
    });
    let landed!: () => void;
    putFile.mockImplementationOnce(
      () =>
        new Promise<PutResult>((resolve) => {
          landed = () => {
            resolve({
              outcome: 'wrote',
              sha256: 'b'.repeat(64),
              bytes: 10
            } as PutResult);
          };
        })
    );

    const save = io.save(RID);
    await vi.waitFor(() => {
      expect(putFile).toHaveBeenCalledTimes(1);
    });
    model.text = NEWER;
    current = { ...current, dirty: true };
    landed();

    expect(await save).toBe(true);
    expect(current.savedContents).toBe(FIRST);
    expect(current.dirty).toBe(true);
  });

  it('the remote door patches nothing across a close and reopen', async () => {
    useApp.setState({ machineStates: machine('/home/greg') } as never);
    const remote = {
      machineId: 'studio',
      machineLabel: 'Studio',
      repoPath: '/home/greg/api'
    };
    const RID = '/home/greg/api/src/auth.ts';
    const patches: Partial<EditorTab>[] = [];
    let current = tabOf({
      id: RID,
      path: RID,
      repoPath: remote.repoPath,
      relPath: 'src/auth.ts',
      name: 'auth.ts',
      remote
    } as Partial<EditorTab>);
    models.open(RID, FIRST);
    const io = createTabIo({
      patch: (_id, patch) => {
        patches.push(patch);
        current = { ...current, ...patch };
      },
      byId: () => current,
      worktreeTabsIn: () => [],
      autoStop: () => false as const
    });
    let landed!: () => void;
    putFile.mockImplementationOnce(
      () =>
        new Promise<PutResult>((resolve) => {
          landed = () => {
            resolve({
              outcome: 'wrote',
              sha256: 'b'.repeat(64),
              bytes: 10
            } as PutResult);
          };
        })
    );

    const save = io.save(RID);
    await vi.waitFor(() => {
      expect(putFile).toHaveBeenCalledTimes(1);
    });
    models.map.delete(RID);
    models.open(RID, 'what that machine says now');
    landed();

    expect(await save).toBe(true);
    expect(patches).toEqual([]);
  });
});

// ==========================================================================
// FIX ROUND — what the two verifiers found the slot and the watcher still did
// ==========================================================================

describe('fix round: a timer request never waits in the slot', () => {
  /**
   * THE ATTACK VERIFIER'S T1, T2 AND T7 AT THIS LEVEL. As the phase first
   * built it, an `auto` request that found a save running was remembered as a
   * follow-up, and the follow-up ran a whole write later without asking the
   * policy, a dialog or the tab's lifetime again. So a timer that fell due
   * during a held write still wrote after the person switched auto save Off,
   * and wrote under "Save changes to 'notes.md'?". The scheduler's own last
   * gate had been asked before the request was queued, not before it ran.
   *
   * Refusing it here is half the repair. ../auto-save re-arms a timer whose
   * save left the tab dirty, which is the other half, and
   * ./p277-timer-policy.test.ts drives the two together.
   */
  it('writes nothing, queues nothing, and answers false', async () => {
    const r = rig();
    const release = holdGuarded();
    const first = r.io.save(ID);
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    r.type(NEWER);
    const timer = r.io.save(ID, 'auto');
    release();
    expect(await first).toBe(true);
    expect(await timer).toBe(false);
    // Let a follow-up run if one had been queued.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(writeGuarded).toHaveBeenCalledTimes(1);
    // The typing is still unsaved and the tab says so.
    expect(r.tab().savedContents).toBe(FIRST);
    expect(r.tab().dirty).toBe(true);
  });
});

describe("fix round: a request queued by a tab's earlier lifetime", () => {
  /**
   * THE ATTACK VERIFIER'S T3. `forceCloseTab` clears the scheduler's state and
   * disposes the model, and nothing cleared the slot's queue. The queued
   * request looked the tab up by id when it ran, so it wrote whatever the
   * REOPENED tab held — typing the person had not asked to save.
   */
  it('writes nothing in the reopened tab, and answers false', async () => {
    const r = rig();
    const release = holdGuarded();
    const first = r.io.save(ID);
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    r.type(NEWER);
    const queued = r.io.save(ID);

    // Close, reopen the same path, and type in the new lifetime.
    r.close();
    const reopened = models.open(ID, 'what the file says now');
    reopened.text = 'new lifetime typing, not asked to be saved';
    release();

    expect(await first).toBe(true);
    expect(await queued).toBe(false);
    expect(writeGuarded).toHaveBeenCalledTimes(1);
  });
});

describe('fix round: a write that never answers', () => {
  /**
   * THE ATTACK VERIFIER'S T5. A slot keyed by the id alone was held by a write
   * that never answered for every later lifetime of that path, so after a
   * close and reopen every ⌘S joined a queue that could never drain, and said
   * nothing. The slot now belongs to the buffer that took it, so a new
   * lifetime is never blocked by a dead one's write.
   */
  it('does not hold the slot for the next lifetime of the same path', async () => {
    const r = rig();
    writeGuarded.mockImplementationOnce(() => new Promise<FsGuardedWriteResult>(() => {}));
    void r.io.save(ID);
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });

    r.close();
    const reopened = models.open(ID, READ);
    reopened.text = 'typed in the new lifetime';
    const second = r.io.save(ID);
    const answer = await Promise.race([
      second,
      new Promise<string>((resolve) => setTimeout(() => resolve('never answered'), 300))
    ]);

    expect(answer).toBe(true);
    expect(writeGuarded).toHaveBeenCalledTimes(2);
    expect((writeGuarded.mock.calls[1]?.[0] as { contents: string }).contents).toBe(
      'typed in the new lifetime'
    );
  });

  it('within ONE lifetime, a queued request still waits for the write it is behind', async () => {
    // The control that keeps the slot a slot: the same buffer, a second ⌘S,
    // and the first write still unanswered. Nothing goes out.
    const r = rig();
    writeGuarded.mockImplementationOnce(() => new Promise<FsGuardedWriteResult>(() => {}));
    void r.io.save(ID);
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    r.type(NEWER);
    void r.io.save(ID);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writeGuarded).toHaveBeenCalledTimes(1);
  });
});

describe('fix round: the slot is released when a save throws', () => {
  /**
   * SPEC rule C6, which the re-derive verifier found no test would miss. A
   * slot released only on a normal return is held for ever by one throw, and
   * every later ⌘S on that tab then waits on a queue nothing drains.
   */
  it('a throw inside the body still releases the slot and runs the follow-up', async () => {
    let current = tabOf();
    let boom = false;
    models.open(ID, FIRST);
    const io = createTabIo({
      patch: (_id, patch) => {
        if (boom) {
          boom = false;
          throw new Error('a patch that threw');
        }
        current = { ...current, ...patch };
      },
      byId: () => current,
      worktreeTabsIn: () => [],
      autoStop: () => false as const
    });
    const release = holdGuarded();
    const first = io.save(ID);
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    const model = models.map.get(ID) as { text: string };
    model.text = NEWER;
    current = { ...current, dirty: true };
    const second = io.save(ID);
    boom = true;
    release();

    await expect(first).rejects.toThrow('a patch that threw');
    expect(await second).toBe(true);
    expect(writeGuarded).toHaveBeenCalledTimes(2);
    expect(current.savedContents).toBe(NEWER);
    // And the slot is free afterwards.
    expect(await io.save(ID)).toBe(true);
    expect(writeGuarded).toHaveBeenCalledTimes(3);
  });
});

describe('fix round: the watcher re-reads the tab after it waits', () => {
  /**
   * THE ATTACK VERIFIER'S T6, WHICH PREDATES THIS PHASE, and it is the fifth
   * door: the one place outside a save that moves `savedContents` over a live
   * buffer. `refreshRepo` asked `!tab.dirty` of the snapshot it took before the
   * loop, then awaited the directory and the file, then patched the baseline
   * and replaced the buffer without asking again. Typing that landed during
   * either wait was replaced by the agent's bytes, and MonacoHost then worked
   * the tab out as clean. ⌘Z could bring it back; nothing told the person to.
   */
  const AGENT = 'what the agent wrote\n';

  it('typing during the file read survives, and the tab stays dirty', async () => {
    const r = rig({ dirty: false, savedContents: FIRST }, FIRST);
    readFile.mockImplementationOnce(async () => {
      r.type(NEWER);
      return { contents: AGENT, truncated: false };
    });
    await r.io.refreshRepo(REPO);

    expect(resets).toEqual([]);
    expect(r.model.getValue()).toBe(NEWER);
    expect(r.tab().savedContents).toBe(FIRST);
    expect(r.tab().dirty).toBe(true);
  });

  it('typing during the directory read survives too', async () => {
    const r = rig({ dirty: false, savedContents: FIRST }, FIRST);
    readDir.mockImplementationOnce(async () => {
      r.type(NEWER);
      return { entries: [{ name: 'notes.md' }] };
    });
    // No one-shot answer for the file read: the fixed build does not read the
    // file at all, and a one-shot left unconsumed would answer the NEXT test's
    // read. The default answer differs from the baseline, so a build that does
    // read and reload is still caught here.
    await r.io.refreshRepo(REPO);

    expect(resets).toEqual([]);
    expect(r.model.getValue()).toBe(NEWER);
  });

  it('a tab closed and reopened during the read is left to its own load', async () => {
    const r = rig({ dirty: false, savedContents: FIRST }, FIRST);
    readFile.mockImplementationOnce(async () => {
      r.close();
      models.open(ID, 'the reopened buffer');
      return { contents: AGENT, truncated: false };
    });
    await r.io.refreshRepo(REPO);

    expect(resets).toEqual([]);
    expect(r.patches.filter((p) => 'savedContents' in p)).toEqual([]);
  });

  it('and a buffer nobody touched still follows the agent', async () => {
    const r = rig({ dirty: false, savedContents: FIRST }, FIRST);
    readFile.mockResolvedValueOnce({ contents: AGENT, truncated: false });
    await r.io.refreshRepo(REPO);

    expect(resets).toEqual([{ id: ID, text: AGENT }]);
    expect(r.tab().savedContents).toBe(AGENT);
  });
});
