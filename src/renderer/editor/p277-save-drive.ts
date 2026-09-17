/**
 * The Phase 277 harness drive, being the renderer half of
 * `build/p277/probe-p277-save.mjs`.
 *
 * ## What the probe is proving with it
 *
 * Audit F1 in a real Monaco tab, which is the one place the audit says it was
 * never driven: hold a real save open, type into the real buffer while it is
 * in the air, and read back that the newer text is still DIRTY, that it saves
 * when it is allowed to, and that pressing close on it still asks the question
 * that exists to save a person's work. And audit F2's other half: with a long
 * delay, type, change the policy before the deadline, and read the file on disk.
 *
 * ## What is REAL in a run, and what this drive supplies
 *
 * Real: the project, the file on disk, the Monaco model and its own edit API,
 * the dirty flag, the settings field (written through the shipped `settings:set`
 * bridge), the timer, the guarded channel, the completion, the close prompt and
 * the toasts.
 *
 * Supplied: two gestures a probe cannot make with a mouse. `type` puts
 * characters into the model through Monaco's own edit API, which is what a
 * keystroke does. And `saveThenType` starts a save and applies an edit in the
 * SAME synchronous turn.
 *
 * ## `saveThenType` is real timing, not a test hook, and that matters
 *
 * There is no seam in this product for holding an acknowledgement, and adding
 * one would mean this arm proved a seam rather than the product. It does not
 * need one. `save` runs synchronously as far as the digest of `savedContents`
 * — `sha256Hex` in ./tab-io is the first `await` on the path, and the buffer
 * has already been read by then — so an edit applied in the same turn as the
 * un-awaited `save()` call lands strictly INSIDE the window between the text
 * being read and the bridge answering. That window is one WebCrypto digest plus
 * one IPC round trip, and it is the exact window audit F1 is about.
 *
 * It assigns exactly one object to `window` and changes nothing else. Outside
 * the harness it is one unused property.
 */

import type { AutoSaveMode } from '@shared/settings';
import { useApp } from '../state/store';
import { runMenuAction } from '../app/menu-actions';
import { useSettingsStore } from '../settings/settings-store';
import { useEditor } from './store';
import { getWorkingModel } from './monaco-loader';

/** One tab, as this probe needs to see it. */
export interface P277Tab {
  id: string;
  name: string;
  path: string;
  /** The flag the whole phase is about. `closeTab` prompts only when it is true. */
  dirty: boolean;
  /** What the tab believes is on disk. */
  savedContents: string;
  /** The buffer, straight off the Monaco model, or null when there is none. */
  value: string | null;
  mode: string;
  /** The auto-save stop record's kind, or null when there is none. */
  stopped: string | null;
  /** Has auto save WRITTEN this tab? */
  touched: boolean;
}

export interface P277Reading {
  mode: AutoSaveMode;
  delayMs: number;
  tabs: P277Tab[];
  activeId: string | null;
  toasts: string[];
  /** The confirm dialog's title, or null when none is open. */
  confirm: string | null;
  /** Its labels. The CONFIRM is the default: ConfirmDialog focuses it. */
  confirmLabels: { confirm: string; alt: string | null } | null;
  /**
   * Is the save this drive started still unresolved?
   *
   * Only a save `saveThenType` or `explicitSave` began is tracked. A timer's
   * save is the scheduler's and this never claims to know about it.
   */
  savePending: boolean;
  /** Is Monaco on screen? A rendered markdown tab has no editor at all. */
  monaco: boolean;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The save this drive last started, and whether it has answered. */
let started: Promise<void> | null = null;
let pending = false;
/** What that save answered, so a probe can read it after `settleSave`. */
let lastSaveSettledAt = 0;

function readNow(): P277Reading {
  const ed = useEditor.getState();
  const app = useApp.getState();
  const policy = useSettingsStore.getState().settings.autoSave;
  return {
    mode: policy.mode,
    delayMs: policy.delayMs,
    activeId: ed.activeId,
    tabs: ed.tabs.map((t) => ({
      id: t.id,
      name: t.name,
      path: t.path,
      dirty: t.dirty,
      savedContents: t.savedContents,
      value: getWorkingModel(t.id)?.getValue() ?? null,
      mode: t.mode,
      stopped: ed.autoSaveStopFor(t.id)?.kind ?? null,
      touched: ed.autoSaveTouched(t.id)
    })),
    toasts: app.toasts.map((t) => t.text),
    confirm: app.confirm?.title ?? null,
    confirmLabels:
      app.confirm === null
        ? null
        : {
            confirm: app.confirm.confirmLabel ?? 'OK',
            alt: app.confirm.altLabel ?? null
          },
    savePending: pending,
    monaco: document.querySelector('.monaco-editor .view-lines') !== null
  };
}

/** Put `text` at the end of a tab's buffer through Monaco's own edit API. */
function applyEdit(id: string, text: string): boolean {
  const model = getWorkingModel(id);
  if (model === null) return false;
  const end = model.getFullModelRange().getEndPosition();
  // `applyEdits` rather than `setValue`, so `onDidChangeContent` fires exactly
  // as it does for a person and `markDirty` runs on the shipped path.
  model.applyEdits([
    {
      range: {
        startLineNumber: end.lineNumber,
        startColumn: end.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column
      },
      text
    }
  ]);
  return true;
}

export interface P277Drive {
  read(): P277Reading;
  /** Put a tab in Source, which is what the mode chip does. A .md tab opens RENDERED. */
  sourceMode(id: string): Promise<P277Reading>;
  /** Type `text` at the end of a tab's buffer, one character every `everyMs`. */
  type(id: string, text: string, everyMs: number): Promise<P277Reading>;
  /** Set the mode and the delay through the shipped settings bridge. */
  setPolicy(mode: AutoSaveMode, delayMs: number): Promise<P277Reading>;
  /** Run one native menu row through the renderer's shipped handler. */
  menuAction(id: string): P277Reading;
  /**
   * THE ONE GESTURE THIS PHASE NEEDS. Start a save and type into the buffer in
   * the same synchronous turn, so the edit lands inside the window between the
   * text being read and the write being answered. See this file's header for
   * why that is real timing rather than a hook.
   */
  saveThenType(id: string, text: string): P277Reading;
  /** Wait for whatever save this drive started, and read back afterwards. */
  settleSave(): Promise<P277Reading>;
  /** The explicit save ⌘S runs, awaited. */
  explicitSave(id: string): Promise<P277Reading>;
  /** Press close on a tab. The store asks first when the tab is dirty. */
  closeTab(id: string): P277Reading;
  /** Press the open dialog's confirm — Save on a dirty close. */
  pressConfirm(): Promise<P277Reading>;
  /** Press the open dialog's alt — Don't Save on a close, Overwrite on a stale save. */
  pressAlt(): P277Reading;
  /** Dismiss every toast, so the next count starts from zero. */
  clearToasts(): P277Reading;
  /** Wait until a tab's `savedContents` is `text`, or give up and read anyway. */
  awaitSaved(id: string, text: string, timeoutMs: number): Promise<P277Reading>;
}

const drive: P277Drive = {
  read: readNow,

  async sourceMode(id) {
    const ed = useEditor.getState();
    ed.activate(id);
    if (ed.tabs.find((t) => t.id === id)?.mode !== 'file') ed.setMode(id, 'file');
    for (let i = 0; i < 100; i += 1) {
      if (getWorkingModel(id) !== null) break;
      await wait(100);
    }
    await wait(300);
    return readNow();
  },

  async type(id, text, everyMs) {
    useEditor.getState().activate(id);
    let model = getWorkingModel(id);
    for (let i = 0; model === null && i < 80; i += 1) {
      await wait(100);
      model = getWorkingModel(id);
    }
    if (model === null) return readNow();
    for (const ch of text) {
      applyEdit(id, ch);
      if (everyMs > 0) await wait(everyMs);
    }
    return readNow();
  },

  async setPolicy(mode, delayMs) {
    await useSettingsStore.getState().update({ autoSave: { mode, delayMs } });
    return readNow();
  },

  menuAction(id) {
    // The SHIPPED handler, which is what the native row's click reaches over
    // `ui:menuAction`. Nothing about the toggle is reimplemented here, so
    // File > Auto Save and the Settings dropdown are two real surfaces onto
    // one setting rather than two spellings of a probe.
    runMenuAction(id as Parameters<typeof runMenuAction>[0]);
    return readNow();
  },

  saveThenType(id, text) {
    const ed = useEditor.getState();
    ed.activate(id);
    if (getWorkingModel(id) === null) return readNow();
    pending = true;
    // NOT AWAITED, AND THAT IS THE WHOLE ARM. `save` reads the buffer and
    // reaches its first `await` — the digest of `savedContents` — before this
    // call returns, so the edit below is applied while the write is in the air.
    started = ed.save().finally(() => {
      pending = false;
      lastSaveSettledAt = Date.now();
    });
    applyEdit(id, text);
    return readNow();
  },

  async settleSave() {
    if (started !== null) await started;
    // One turn for the store's patch and the scheduler's `notePatched` to run.
    await wait(50);
    return readNow();
  },

  async explicitSave(id) {
    // ⌘S's own path: the menu action saves the ACTIVE tab, so the probe
    // activates first, exactly as pressing the chord on that tab would.
    const ed = useEditor.getState();
    ed.activate(id);
    pending = true;
    started = ed.save().finally(() => {
      pending = false;
      lastSaveSettledAt = Date.now();
    });
    await started;
    await wait(50);
    return readNow();
  },

  closeTab(id) {
    // The shipped route. `closeTab` asks `promptDirtyClose` when the tab is
    // dirty and force-closes when it is not, which is exactly the clause this
    // phase connects to losing work: a falsely clean tab is closed in silence.
    useEditor.getState().closeTab(id);
    return readNow();
  },

  async pressConfirm() {
    const confirm = useApp.getState().confirm;
    confirm?.onConfirm();
    useApp.getState().setConfirm(null);
    // The dirty-close confirm SAVES, which is a write and an IPC round trip, so
    // the reading a probe wants is not available on the next line.
    await wait(400);
    return readNow();
  },

  pressAlt() {
    const confirm = useApp.getState().confirm;
    confirm?.onAlt?.();
    useApp.getState().setConfirm(null);
    return readNow();
  },

  clearToasts() {
    const app = useApp.getState();
    for (const t of [...app.toasts]) app.dismissToast(t.id);
    return readNow();
  },

  async awaitSaved(id, text, timeoutMs) {
    // Polls the tab rather than sleeping for the delay, because the point of
    // the arm is that the pending timer really did fire, and a fixed sleep
    // would pass just as well if it never had.
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const tab = useEditor.getState().tabs.find((t) => t.id === id);
      if (tab?.savedContents === text) break;
      await wait(100);
    }
    return readNow();
  }
};

declare global {
  interface Window {
    /** `window.__gmuxP277`: the Phase 277 save-completion drive. */
    __gmuxP277?: P277Drive;
    /** When the drive's last save settled, for a probe reading timing. */
    __gmuxP277SettledAt?: () => number;
  }
}

export function registerP277SaveDrive(): void {
  window.__gmuxP277 = drive;
  window.__gmuxP277SettledAt = () => lastSaveSettledAt;
}
