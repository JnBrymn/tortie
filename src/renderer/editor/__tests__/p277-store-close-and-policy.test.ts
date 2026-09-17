/**
 * PHASE 277 FIX ROUND — the three things the verifiers could only reach through
 * the REAL editor store, and so the three things no test here had reached.
 *
 *  1. THE CLOSE PROMPT'S SAVE BUTTON (attack S2). `promptDirtyClose` closed the
 *     tab whenever the save answered true. A save answers true when a write
 *     landed, and since this phase a write that landed can leave the tab DIRTY,
 *     because typing arrived while it was in the air. So the button that exists
 *     to keep a person's work closed a tab still holding some of it, and asked
 *     nothing. The same `true` also closed a REOPENED tab of the same path when
 *     the first lifetime ended under the save.
 *  2. A FILE ON A MACHINE (attack S1, found before this phase, since Phase 101).
 *     Phase 101 made a remote tab an edit surface on a machine with a confirmed
 *     folder, and `markDirty` went on refusing every remote tab. So typing into
 *     it never made it dirty, and `closeTab` closed it with no question.
 *  3. THE SETTINGS SUBSCRIPTION (SPEC rule S6, re-derive finding 2). The
 *     timer tests call `notePolicyChanged()` by hand, so deleting the store's
 *     one subscription left every one of them green.
 *
 * The model registry is the REAL ../monaco-loader over a fake Monaco that hands
 * out plain objects, so a close really disposes an instance and a reopen really
 * creates a different one. That is the identity every rule above turns on.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FsGuardedWriteResult } from '@shared/fs-ops';

const writeGuarded = vi.fn<(input: unknown) => Promise<FsGuardedWriteResult>>();
const readFile = vi.fn(async () => ({ contents: 'on disk\n', truncated: false }));
type PutResult = import('@shared/ipc').MachineFilePutResult;
const putFile = vi.fn(
  async (): Promise<PutResult> => ({
    outcome: 'wrote',
    sha256: 'a'.repeat(64),
    bytes: 6,
    writeRoot: '/home/greg'
  })
);
const reviewFile = vi.fn(async () => ({
  oldContents: 'before\n',
  newContents: 'after\n',
  binary: false,
  truncated: false,
  note: null as string | null,
  bytes: 6
}));

vi.stubGlobal('window', {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  gmux: {
    setSessionsPosition: async () => {},
    setProjectsPosition: async () => {},
    fs: {
      readFile,
      readImage: vi.fn(),
      writeFile: vi.fn(),
      readDir: vi.fn(),
      writeGuarded
    },
    git: { showHead: async () => '', onChanged: () => () => {} },
    machines: { reviewFile, putFile }
  }
});
vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
vi.stubGlobal('document', {
  body: { classList: { add() {}, remove() {}, contains: () => false } }
});

const { useEditor } = await import('../store');
const { useApp } = await import('../../state/store');
const { useSettingsStore } = await import('../../settings/settings-store');
const { disposeModels, getWorkingModel, workingModel } = await import('../monaco-loader');

type OpenFileRequest = import('../../state/open-file').OpenFileRequest;
type Monaco = Parameters<typeof workingModel>[0];
type MachineStateView = import('@shared/ipc').MachineStateView;

interface FakeModel {
  text: string;
  getValue(): string;
  isDisposed(): boolean;
  dispose(): void;
  updateOptions(): void;
}

const fakeMonaco = {
  Uri: { from: (o: { scheme: string; path: string }) => ({ ...o }) },
  editor: {
    getModel: () => null,
    createModel: (contents: string): FakeModel => {
      let disposed = false;
      return {
        text: contents,
        getValue() {
          return this.text;
        },
        isDisposed: () => disposed,
        dispose: () => {
          disposed = true;
        },
        updateOptions() {}
      };
    }
  }
} as unknown as Monaco;

const PROJECT = { id: 'proj', path: '/work/alpha', name: 'alpha' };
const NAME = 'notes.md';
const PATH = `${PROJECT.path}/${NAME}`;
const wrote: FsGuardedWriteResult = { outcome: 'wrote', sha256: 'new', bytes: 10 };

/** A macrotask, which is what every await in the save path has settled by. */
const turn = (): Promise<void> => new Promise((done) => setImmediate(done));
const turns = async (n = 8): Promise<void> => {
  for (let i = 0; i < n; i += 1) await turn();
};

function request(extra: Partial<OpenFileRequest> = {}): OpenFileRequest {
  return {
    repoPath: PROJECT.path,
    relPath: NAME,
    path: PATH,
    mode: 'file',
    source: 'tree',
    preview: false,
    ...extra
  };
}

/** Open the file for keeps and mount its buffer, as MonacoHost would. */
async function open(extra: Partial<OpenFileRequest> = {}): Promise<{
  id: string;
  model: FakeModel;
}> {
  useEditor.getState().openFromRequest(request(extra));
  await turns();
  const tab = useEditor.getState().activeTab();
  if (tab === null) throw new Error('no tab opened');
  const model = workingModel(
    fakeMonaco,
    tab.id,
    tab.savedContents,
    'plaintext'
  ) as unknown as FakeModel;
  return { id: tab.id, model };
}

/** A keystroke, with MonacoHost.tsx's own dirty rule applied to the store. */
function typeInto(id: string, model: FakeModel, text: string): void {
  model.text = text;
  const tab = useEditor.getState().tabs.find((t) => t.id === id);
  if (tab === undefined) return;
  useEditor.getState().markDirty(id, model.getValue() !== tab.savedContents);
}

/** The dialog's own order: the question is taken down, then the button runs. */
function press(which: 'confirm' | 'alt'): void {
  const spec = useApp.getState().confirm;
  if (spec === null) throw new Error('no question on screen');
  useApp.getState().setConfirm(null);
  if (which === 'confirm') spec.onConfirm();
  else spec.onAlt?.();
}

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

const tabOpen = (id: string): boolean =>
  useEditor.getState().tabs.some((t) => t.id === id);

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

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  for (const t of useEditor.getState().tabs) disposeModels(t.id);
  useEditor.setState({ tabs: [], activeId: null, panelOpen: false });
  useApp.setState({
    projects: [PROJECT],
    activeProjectId: PROJECT.id,
    confirm: null,
    toasts: [],
    machineStates: machine(null)
  } as never);
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...settings, autoSave: { mode: 'off', delayMs: 1000 } }
  });
  writeGuarded.mockResolvedValue(wrote);
  readFile.mockResolvedValue({ contents: 'on disk\n', truncated: false });
});

// ==========================================================================
// 1. The close prompt's Save button
// ==========================================================================

describe("the close prompt's Save closes only a tab whose buffer is on disk", () => {
  it('typing that lands during the save keeps the tab open, and asks again', async () => {
    const { id, model } = await open();
    typeInto(id, model, 'first edit');
    useEditor.getState().closeTab(id);
    expect(useApp.getState().confirm?.title).toBe(`Save changes to '${NAME}'?`);

    const release = holdGuarded();
    press('confirm');
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });
    typeInto(id, model, 'first edit plus newer typing');
    release();
    await turns();

    const tab = useEditor.getState().tabs.find((t) => t.id === id);
    const reading = {
      sent: (writeGuarded.mock.calls[0]?.[0] as { contents: string }).contents,
      tabStillOpen: tabOpen(id),
      modelAlive: getWorkingModel(id) !== null,
      dirty: tab?.dirty ?? null,
      saved: tab?.savedContents ?? null,
      askedAgain: useApp.getState().confirm?.title ?? null
    };
    expect(reading).toEqual({
      sent: 'first edit',
      tabStillOpen: true,
      modelAlive: true,
      dirty: true,
      saved: 'first edit',
      askedAgain: `Save changes to '${NAME}'?`
    });

    // Answering Save again writes the rest and closes the tab.
    press('confirm');
    await turns();
    expect(writeGuarded).toHaveBeenCalledTimes(2);
    expect((writeGuarded.mock.calls[1]?.[0] as { contents: string }).contents).toBe(
      'first edit plus newer typing'
    );
    expect(tabOpen(id)).toBe(false);
  });

  it('a buffer that did not move is saved and closed in one press, as before', async () => {
    const { id, model } = await open();
    typeInto(id, model, 'first edit');
    useEditor.getState().closeTab(id);
    press('confirm');
    await turns();
    expect(writeGuarded).toHaveBeenCalledTimes(1);
    expect(tabOpen(id)).toBe(false);
    expect(useApp.getState().confirm).toBeNull();
  });

  it('never closes a REOPENED tab of the same path when the first one ended under the save', async () => {
    const first = await open();
    typeInto(first.id, first.model, 'first edit');
    useEditor.getState().closeTab(first.id);
    const release = holdGuarded();
    press('confirm');
    await vi.waitFor(() => {
      expect(writeGuarded).toHaveBeenCalledTimes(1);
    });

    // The tab is closed some other way, then the same file is opened again.
    useEditor.getState().forceCloseTab(first.id);
    const second = await open();
    expect(second.id).toBe(first.id);
    expect(second.model).not.toBe(first.model);
    release();
    await turns();

    expect(tabOpen(second.id)).toBe(true);
    expect(getWorkingModel(second.id)).toBe(second.model);
  });
});

// ==========================================================================
// 2. A file on a machine with a confirmed folder
// ==========================================================================

describe('a file on a machine is dirty when a person can type into it', () => {
  const REMOTE = {
    machineId: 'studio',
    machineLabel: 'Studio',
    repoPath: '/home/greg/api'
  };
  const remoteRequest: Partial<OpenFileRequest> = {
    repoPath: REMOTE.repoPath,
    relPath: 'src/auth.ts',
    path: `${REMOTE.repoPath}/src/auth.ts`,
    mode: 'diff',
    source: 'machine',
    remote: REMOTE
  };

  it('on a confirmed machine, typing marks it dirty and closing asks', async () => {
    useApp.setState({ machineStates: machine('/home/greg') } as never);
    const { id, model } = await open(remoteRequest);
    typeInto(id, model, 'typed on the machine\n');
    const reading = {
      dirtyAfterTyping: useEditor.getState().tabs.find((t) => t.id === id)?.dirty ?? null,
      prompt: (() => {
        useEditor.getState().closeTab(id);
        return useApp.getState().confirm?.title ?? null;
      })(),
      tabStillOpen: tabOpen(id)
    };
    expect(reading).toEqual({
      dirtyAfterTyping: true,
      prompt: "Save changes to 'auth.ts'?",
      tabStillOpen: true
    });

    // The Save press takes the machine's own door, and the tab closes clean.
    press('confirm');
    await turns();
    expect(putFile).toHaveBeenCalledTimes(1);
    expect(tabOpen(id)).toBe(false);
  });

  it('typing back to the saved text clears it again', async () => {
    useApp.setState({ machineStates: machine('/home/greg') } as never);
    const { id, model } = await open(remoteRequest);
    typeInto(id, model, 'typed\n');
    typeInto(id, model, 'after\n');
    expect(useEditor.getState().tabs.find((t) => t.id === id)?.dirty).toBe(false);
  });

  it('on a machine with no confirmed folder it stays what it was: never dirty', async () => {
    const { id, model } = await open(remoteRequest);
    typeInto(id, model, 'typed on the machine\n');
    expect(useEditor.getState().tabs.find((t) => t.id === id)?.dirty).toBe(false);
  });
});

// ==========================================================================
// 3. The store's one subscription to the settings store
// ==========================================================================

describe("a policy change reaches the scheduler through the store's subscription", () => {
  const setAutoSave = (mode: 'off' | 'afterDelay' | 'onFocusChange', delayMs: number): void => {
    const settings = useSettingsStore.getState().settings;
    // Replaced immutably, as `SettingsStoreState.update` does.
    useSettingsStore.setState({ settings: { ...settings, autoSave: { mode, delayMs } } });
  };

  it('a delay change moves a pending deadline', async () => {
    const { id, model } = await open();
    setAutoSave('afterDelay', 5000);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    typeInto(id, model, 'first edit');

    setAutoSave('afterDelay', 20_000);
    vi.advanceTimersByTime(6000);
    await turns();
    // The old 5 s deadline would have written by now.
    expect(writeGuarded).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15_000);
    await turns();
    expect(writeGuarded).toHaveBeenCalledTimes(1);
  });

  it('switching to Off clears the pending handle, not only the write', async () => {
    const { id, model } = await open();
    setAutoSave('afterDelay', 5000);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const before = vi.getTimerCount();
    typeInto(id, model, 'first edit');
    expect(vi.getTimerCount()).toBe(before + 1);

    setAutoSave('off', 5000);
    // `run`'s own re-read would refuse the write anyway; the subscription is
    // what takes the timer away, and that is what this reads.
    expect(vi.getTimerCount()).toBe(before);
    vi.advanceTimersByTime(60_000);
    await turns();
    expect(writeGuarded).not.toHaveBeenCalled();
  });
});
