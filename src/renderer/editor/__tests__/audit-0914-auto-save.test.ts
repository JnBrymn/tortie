// Independent architecture audit, 14 September 2026. Inert documentation fixture.
// Copy into src/renderer/editor/__tests__/audit-0914-auto-save.test.ts in a
// disposable checkout. Run: npm test -- src/renderer/editor/__tests__/audit-0914-auto-save.test.ts
// Drives the real scheduler and tab IO, with a deferred bridge acknowledgement
// and a small model double. No Electron, real file writes, secrets or agent turns.
import { beforeEach, expect, it, vi } from 'vitest';
import type { FsGuardedWriteResult } from '@shared/fs-ops';
import type { AutoSaveSettings } from '@shared/settings';
import type { EditorTab } from '../tab-types';
import { createAutoSave } from '../auto-save';

const model = vi.hoisted(() => ({ text: 'first edit', getValue() { return this.text; } }));
vi.mock('../monaco-loader', () => ({
  getWorkingModel: () => model, resetWorkingModel() {}, disposeModels() {},
  dropViewState() {}, loadMonaco: async () => undefined, rememberLoaded() {}
}));
const writeGuarded = vi.fn<(input: unknown) => Promise<FsGuardedWriteResult>>();
vi.stubGlobal('window', {
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  gmux: { fs: { writeGuarded }, git: { onChanged: () => () => undefined },
    setSessionsPosition: async () => undefined, setProjectsPosition: async () => undefined }
});
vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
vi.stubGlobal('document', { body: { classList: { add() {}, remove() {}, contains: () => false } } });
const { createTabIo } = await import('../tab-io');

const ID = '/repo/notes.md';
function tab(): EditorTab {
  return {
    id: ID, path: ID, relPath: 'notes.md', origRelPath: null, repoPath: '/repo',
    name: 'notes.md', mode: 'file', canDiff: true, markdown: true,
    image: false, svg: false, html: false, imageData: null, imageHead: null,
    imageRevision: 0, preview: false, commit: null, pendingSelection: null,
    pendingFocus: true, dirty: true, deleted: false, truncated: false,
    loading: false, error: null, savedContents: 'original', headContents: null,
    lastUsed: 0, contextEntry: null
  };
}
function rig() {
  let current = tab();
  let timerId = 0;
  const timers = new Map<number, () => void>();
  const policy: AutoSaveSettings = { mode: 'afterDelay', delayMs: 1000 };
  const auto = createAutoSave({
    save: (id) => io.save(id, 'auto'), byId: () => current,
    openRoots: () => ['/repo'], policy: () => policy, blocked: () => false,
    toast() {}, setTimer(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimer(handle) { timers.delete(handle as number); }
  });
  const io = createTabIo({
    byId: () => current, worktreeTabsIn: () => [],
    patch(_id, patch) {
      const before = current;
      current = { ...current, ...patch };
      auto.notePatched(ID, before, current);
    },
    autoStop(id, why) { auto.recordStop(id, why); return false; }
  });
  return {
    auto, policy, current: () => current, pending: () => timers.size,
    tick() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    type(text: string) {
      model.text = text;
      current = { ...current, dirty: text !== current.savedContents };
      auto.noteChanged(ID);
    }
  };
}
const wrote: FsGuardedWriteResult = { outcome: 'wrote', sha256: 'fixture', bytes: 10 };
beforeEach(() => { vi.clearAllMocks(); model.text = 'first edit'; });

it('control: a settled buffer is saved and becomes clean', async () => {
  writeGuarded.mockResolvedValue(wrote);
  const r = rig();
  r.auto.noteChanged(ID);
  r.tick();
  await vi.waitFor(() => expect(r.current().dirty).toBe(false));
  expect(r.current().savedContents).toBe(model.text);
  expect(writeGuarded).toHaveBeenCalledTimes(1);
  r.auto.disposeAll();
});

it.each(['off', 'onFocusChange'] as const)(
  'a pending delay may not write after switching to %s', async (mode) => {
    writeGuarded.mockResolvedValue(wrote);
    const r = rig();
    r.auto.noteChanged(ID);
    r.policy.mode = mode;
    r.tick();
    // Let the real crypto digest and bridge call settle, without a timer race.
    await new Promise((resolve) => setTimeout(resolve, 50));
    console.log(JSON.stringify({ case: 'policy-changed', mode, writes: writeGuarded.mock.calls.length, dirty: r.current().dirty }));
    r.auto.disposeAll();
    expect(writeGuarded).not.toHaveBeenCalled();
  }
);

it('an acknowledgement for older text keeps a newer edit dirty and scheduled', async () => {
  let acknowledge!: (result: FsGuardedWriteResult) => void;
  writeGuarded.mockImplementation(() => new Promise((resolve) => { acknowledge = resolve; }));
  const r = rig();
  r.auto.noteChanged(ID);
  r.tick();
  await vi.waitFor(() => expect(writeGuarded).toHaveBeenCalledTimes(1));
  const sent = writeGuarded.mock.calls[0]![0] as { contents: string };
  expect(sent.contents).toBe('first edit');
  r.type('first edit plus newer typing');
  expect(r.pending()).toBe(1);
  acknowledge(wrote);
  await vi.waitFor(() => expect(r.current().savedContents).toBe('first edit'));
  const reading = { case: 'typing-during-save', sent: sent.contents, model: model.text,
    saved: r.current().savedContents, dirty: r.current().dirty, pending: r.pending() };
  console.log(JSON.stringify(reading));
  r.auto.disposeAll();
  expect(reading.dirty).toBe(true);
  expect(reading.pending).toBe(1);
});
