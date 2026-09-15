/**
 * The Phase 268 harness drive, being the renderer half of
 * `build/p268/probe-p268-autosave.mjs`.
 *
 * ## What the probe is proving with it
 *
 * That a timer writes a person's file through the guarded door, that a second
 * process writing that file underneath the buffer STOPS the timer for that
 * file, and that the person is told once. The events that matter — the
 * keystroke, the delay, the outside write, the refusal, the toast — are all
 * real; this drive only reads them back and supplies the two gestures a probe
 * cannot make with a mouse.
 *
 * ## What is REAL in a run, and what this drive supplies
 *
 * Real: the project, the file on disk, the Monaco model, the dirty flag, the
 * settings field (written through the shipped `settings:set` bridge), the
 * timer, the guarded channel, the refusal word, the stop record and the toast.
 *
 * Supplied: `type` puts characters into the model through Monaco's own edit
 * API, which is what a keystroke does, and `blur` moves focus off the editor
 * widget, which is what clicking into a terminal does. Neither calls the store
 * action a real gesture would have skipped — `markDirty` still fires from
 * `onDidChangeContent` and `autoSaveOnBlur` still fires from
 * `onDidBlurEditorWidget`.
 *
 * It assigns exactly one object to `window` and changes nothing else. Outside
 * the harness it is one unused property.
 */

import type { AutoSaveMode } from '@shared/settings';
import { useApp } from '../state/store';
import { requestOpenFile } from '../state/open-file';
import { runMenuAction } from '../app/menu-actions';
import { useSettingsStore } from '../settings/settings-store';
import { useEditor } from './store';
import { getWorkingModel } from './monaco-loader';

/** One tab, as the probe needs to see it. */
export interface P268Tab {
  id: string;
  name: string;
  path: string;
  dirty: boolean;
  /** Which view the tab is drawing. A markdown tab opens RENDERED. */
  mode: string;
  /** The buffer, straight off the Monaco model, or null when there is none. */
  value: string | null;
  /** What the tab believes is on disk. */
  savedContents: string;
  /** The stop record's kind, or null when auto save has not stopped for it. */
  stopped: string | null;
  /** Has auto save WRITTEN this tab? The eviction filter's own question. */
  touched: boolean;
}

export interface P268Reading {
  mode: AutoSaveMode;
  delayMs: number;
  tabs: P268Tab[];
  activeId: string | null;
  /** Every toast on screen, newest last, text only. */
  toasts: string[];
  /** The confirm dialog's title, or null when none is open. */
  confirm: string | null;
  /** The confirm dialog's three labels, when one is open. Confirm is the DEFAULT. */
  confirmLabels: { confirm: string; alt: string | null } | null;
  /** Does the editor widget hold focus right now? */
  editorFocused: boolean;
  /** Is Monaco on screen? A rendered markdown tab has no editor at all. */
  monaco: boolean;
  panelOpen: boolean;
}

function readNow(): P268Reading {
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
      mode: t.mode,
      value: getWorkingModel(t.id)?.getValue() ?? null,
      savedContents: t.savedContents,
      stopped: ed.autoSaveStopFor(t.id)?.kind ?? null,
      touched: ed.autoSaveTouched(t.id)
    })),
    monaco: document.querySelector('.monaco-editor .view-lines') !== null,
    editorFocused:
      document.activeElement !== null &&
      document.activeElement.closest('.monaco-editor') !== null,
    panelOpen: ed.panelOpen,
    toasts: app.toasts.map((t) => t.text),
    confirm: app.confirm?.title ?? null,
    confirmLabels:
      app.confirm === null
        ? null
        : {
            confirm: app.confirm.confirmLabel ?? 'OK',
            alt: app.confirm.altLabel ?? null
          }
  };
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface P268Drive {
  read(): P268Reading;
  /** Set the mode and the delay through the shipped settings bridge. */
  setPolicy(mode: AutoSaveMode, delayMs: number): Promise<P268Reading>;
  /**
   * Put a tab in Source, which is what the mode chip does.
   *
   * A MARKDOWN TAB OPENS RENDERED whatever the open request asked for
   * (store.ts's mode ladder reads `readMarkdownMode()` for `.md`), and a
   * rendered tab has no Monaco model, so nothing can be typed into it. This
   * is the chip's own shipped action, awaited until the editor is mounted.
   */
  sourceMode(id: string): Promise<P268Reading>;
  /** Type `text` at the end of a tab's buffer, one character every `everyMs`. */
  type(id: string, text: string, everyMs: number): Promise<P268Reading>;
  /** Put focus in the editor, which is what clicking into it does. */
  focusEditor(): P268Reading;
  /** Leave the editor, which is what clicking into a terminal does. */
  blur(): P268Reading;
  /** Press the Compare/Overwrite dialog's alt answer. */
  pressOverwrite(): P268Reading;
  /** Dismiss every toast, so the next count starts from zero. */
  clearToasts(): P268Reading;
  /** The explicit save ⌘S runs, awaited. */
  explicitSave(id: string): Promise<P268Reading>;
  /**
   * Open a file OUTSIDE the project root, carrying that project's `repoPath`
   * — the `~/.claude/CLAUDE.md` shape exactly, which is how `openFileAt`
   * opens a Context detail. The shot drive can only compose a path under the
   * project, and this arm is about the door a file outside one takes.
   */
  openOutside(repoPath: string, path: string): Promise<P268Reading>;
  /** Run one native menu action through the renderer's shipped handler. */
  menuAction(id: string): P268Reading;
}

const drive: P268Drive = {
  read: readNow,

  async setPolicy(mode, delayMs) {
    await useSettingsStore.getState().update({ autoSave: { mode, delayMs } });
    return readNow();
  },

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
    const ed = useEditor.getState();
    ed.activate(id);
    let model = getWorkingModel(id);
    for (let i = 0; model === null && i < 80; i += 1) {
      await wait(100);
      model = getWorkingModel(id);
    }
    if (model === null) return readNow();
    for (const ch of text) {
      const end = model.getFullModelRange().getEndPosition();
      // Monaco's own edit API, which is the path a keystroke takes, so
      // `onDidChangeContent` fires exactly as it does for a person.
      model.applyEdits([
        {
          range: {
            startLineNumber: end.lineNumber,
            startColumn: end.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column
          },
          text: ch
        }
      ]);
      if (everyMs > 0) await wait(everyMs);
    }
    return readNow();
  },

  focusEditor() {
    // Monaco's own hidden input is what holds focus when a person is typing,
    // and `onDidBlurEditorWidget` only fires for a widget that HAD focus. A
    // probe that types through the model never focuses it, so the blur arm
    // has to put focus where a person's click would have put it first.
    const input = document.querySelector<HTMLTextAreaElement>(
      '.monaco-editor textarea.inputarea'
    );
    input?.focus();
    return readNow();
  },

  blur() {
    // The mounted host listens on `onDidBlurEditorWidget`; moving focus off
    // the editor is what a click into a terminal does to it. The element is
    // named rather than taken from `document.activeElement`, so a blur that
    // reaches nothing is a reading rather than a silent no-op.
    const input = document.querySelector<HTMLTextAreaElement>(
      '.monaco-editor textarea.inputarea'
    );
    input?.blur();
    (document.activeElement as HTMLElement | null)?.blur();
    return readNow();
  },

  pressOverwrite() {
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

  async openOutside(repoPath, path) {
    requestOpenFile({
      repoPath,
      relPath: path,
      path,
      mode: 'file',
      source: 'tree',
      preview: false
    });
    for (let i = 0; i < 80; i += 1) {
      if (useEditor.getState().tabs.some((t) => t.path === path)) break;
      await wait(100);
    }
    const opened = useEditor.getState().tabs.find((t) => t.path === path);
    if (opened !== undefined) await drive.sourceMode(opened.id);
    await wait(400);
    return readNow();
  },

  menuAction(id) {
    // The SHIPPED handler, which is what the native row's click reaches over
    // `ui:menuAction`. Nothing about the toggle is reimplemented here.
    runMenuAction(id as Parameters<typeof runMenuAction>[0]);
    return readNow();
  },

  async explicitSave(id) {
    // ⌘S's own path: the menu action saves the ACTIVE tab, so the probe
    // activates first, exactly as pressing the chord on that tab would.
    useEditor.getState().activate(id);
    await useEditor.getState().save();
    return readNow();
  }
};

declare global {
  interface Window {
    /** `window.__gmuxP268`: the Phase 268 auto-save drive. */
    __gmuxP268?: P268Drive;
  }
}

export function registerP268AutoSaveDrive(): void {
  window.__gmuxP268 = drive;
}
