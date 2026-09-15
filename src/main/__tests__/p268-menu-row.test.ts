/**
 * PHASE 268 — File > Auto Save: the row, its tick, and the thing a click must
 * NOT do.
 *
 * CLAUDE.md: a phase that adds a user-facing surface updates the native menus
 * in the same commit. This is that row, and it is the whole of what changed in
 * any menu — one checkbox directly under Save.
 *
 * THE ELECTRON 43 TRAP IS WHY THE CLICK IS TESTED. ../menu.ts:313-320 records
 * it: assigning `checked = false` to an item that is already unchecked CHECKS
 * it. A checkbox row is safe only while the template is rebuilt FROM the
 * settings value on every build and the click never sets the mark itself, so
 * this file asserts both halves — the tick follows `getSettings()` across a
 * `rebuildAppMenu()`, and the click forwards `toggle-auto-save` and assigns
 * nothing.
 *
 * Same fake-electron pattern, and the same mutable settings mock, as
 * ./p175-arch-menu-flag.test.ts.
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVT_MENU_ACTION } from '@shared/ipc';

interface FakeItem {
  label?: string;
  role?: string;
  type?: string;
  accelerator?: string;
  icon?: unknown;
  checked?: boolean;
  visible?: boolean;
  click?: () => void;
  submenu?: FakeItem[];
}

class FakeMenu {
  constructor(readonly template: FakeItem[]) {}
  getMenuItemById(): FakeItem | null {
    return null;
  }
}

interface FakeWindow {
  readonly sent: unknown[][];
  isDestroyed(): boolean;
  isVisible(): boolean;
  webContents: { isDestroyed(): boolean; send(...args: unknown[]): void };
}

function makeWindow(): FakeWindow {
  const sent: unknown[][] = [];
  return {
    sent,
    isDestroyed: () => false,
    isVisible: () => true,
    webContents: {
      isDestroyed: () => false,
      send: (...args: unknown[]) => {
        sent.push(args);
      }
    }
  };
}

const state: { applicationMenu: FakeMenu | null; windows: FakeWindow[] } = {
  applicationMenu: null,
  windows: []
};

/** The mode, as main's settings store would answer it. Mutable on purpose. */
let autoSaveMode = 'off';

vi.mock('electron', () => ({
  app: {
    name: 'Tortie',
    isPackaged: true,
    getPath: () => join(tmpdir(), 'gmux-p268-menu-test'),
    getVersion: () => '0.0.1',
    setAboutPanelOptions: () => undefined,
    on: () => undefined,
    quit: () => undefined
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => state.windows
  },
  Menu: {
    buildFromTemplate: (template: FakeItem[]) => new FakeMenu(template),
    setApplicationMenu: (menu: FakeMenu | null) => {
      state.applicationMenu = menu;
    },
    getApplicationMenu: () => state.applicationMenu
  }
}));

vi.mock('../settings/window', () => ({
  isSettingsWindow: () => false,
  openSettingsWindow: () => undefined,
  closeSettingsWindowIfFocused: () => false
}));

vi.mock('../settings/store', () => ({
  getSettings: () => ({
    hotkeys: {},
    arch: { enabled: false },
    autoSave: { mode: autoSaveMode, delayMs: 1000 }
  })
}));

vi.mock('../native-menu-icon', () => ({
  nativeMenuGlyph: (name: string) => ({ icon: { name } }),
  menuIcon: () => null
}));

vi.mock('../manifest/reconstruct-operator', () => ({
  runOperatorReconstruction: () => Promise.resolve()
}));

const { installAppMenu, rebuildAppMenu } = await import('../menu');

// ---------------------------------------------------------------------------

function submenu(label: string): FakeItem[] {
  const top = state.applicationMenu?.template.find((it) => it.label === label);
  if (!Array.isArray(top?.submenu)) throw new Error(`no ${label} submenu`);
  return top.submenu;
}

function autoSaveRow(): FakeItem {
  const row = submenu('File').find((it) => it.label === 'Auto Save');
  if (row === undefined) throw new Error('no Auto Save row');
  return row;
}

const realPlatform = process.platform;
function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  });
}

beforeEach(() => {
  state.applicationMenu = null;
  state.windows = [];
  autoSaveMode = 'off';
  setPlatform('darwin');
});

afterEach(() => {
  setPlatform(realPlatform);
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('the row itself', () => {
  beforeEach(() => {
    installAppMenu();
  });

  it('is in the File menu, directly under Save', () => {
    const labels = submenu('File').map((it) => it.label);
    const at = labels.indexOf('Auto Save');
    expect(at).toBeGreaterThan(-1);
    expect(labels[at - 1]).toBe('Save');
  });

  it('is a checkbox, so macOS draws the state mark itself', () => {
    expect(autoSaveRow().type).toBe('checkbox');
  });

  it('carries no accelerator: a built-in chord is one a person cannot record', () => {
    expect(autoSaveRow().accelerator).toBeUndefined();
  });

  it('carries no glyph — the checkbox already draws a mark, and Save owns the picture', () => {
    expect(autoSaveRow().icon).toBeUndefined();
  });

  it('adds exactly one row to the File menu and moves nothing else', () => {
    expect(submenu('File').map((it) => it.label)).toEqual([
      'New Project…',
      'Open Project…',
      'Open Folder on a Machine…',
      'Clone Repository…',
      'Open Recent',
      undefined, // separator
      'Save',
      'Auto Save',
      undefined, // separator
      'Close Editor Tab'
    ]);
  });

  it('is the ONLY new row anywhere in the menu bar', () => {
    const out: string[] = [];
    const walk = (items: FakeItem[]): void => {
      for (const it of items) {
        if (typeof it.label === 'string') out.push(it.label);
        if (Array.isArray(it.submenu)) walk(it.submenu);
      }
    };
    walk(state.applicationMenu?.template ?? []);
    expect(out.filter((l) => l === 'Auto Save')).toHaveLength(1);
  });
});

describe('the tick follows the setting, and only the setting', () => {
  it('is unticked out of the box, because the mode ships off', () => {
    installAppMenu();
    expect(autoSaveRow().checked).toBe(false);
  });

  it('is ticked for afterDelay and for onFocusChange alike — ticked means "not off"', () => {
    autoSaveMode = 'afterDelay';
    installAppMenu();
    expect(autoSaveRow().checked).toBe(true);
    autoSaveMode = 'onFocusChange';
    rebuildAppMenu();
    expect(autoSaveRow().checked).toBe(true);
  });

  it('follows a flip in the SAME session, with no relaunch', () => {
    installAppMenu();
    expect(autoSaveRow().checked).toBe(false);
    autoSaveMode = 'afterDelay';
    rebuildAppMenu();
    expect(autoSaveRow().checked).toBe(true);
    autoSaveMode = 'off';
    rebuildAppMenu();
    expect(autoSaveRow().checked).toBe(false);
  });

  it('is a real second template rather than the first one mutated', () => {
    installAppMenu();
    const first = state.applicationMenu;
    autoSaveMode = 'afterDelay';
    rebuildAppMenu();
    expect(state.applicationMenu).not.toBe(first);
  });
});

describe('the click, which is where Electron 43 bites', () => {
  it('forwards toggle-auto-save and assigns no mark of its own', () => {
    const win = makeWindow();
    state.windows = [win];
    installAppMenu();
    const row = autoSaveRow();
    const before = row.checked;
    row.click?.();
    expect(win.sent).toEqual([[EVT_MENU_ACTION, 'toggle-auto-save']]);
    // The mark is main's, rebuilt from the value after settings:set. Setting
    // it here is the Electron 43 trap at menu.ts:313-320.
    expect(row.checked).toBe(before);
  });
});

describe('a settings store that cannot be read', () => {
  it('ships the default, which is off, rather than throwing', async () => {
    vi.resetModules();
    vi.doMock('../settings/store', () => ({
      getSettings: () => {
        throw new Error('settings unreadable');
      }
    }));
    const menu = await import('../menu');
    expect(() => menu.installAppMenu()).not.toThrow();
    expect(autoSaveRow().checked).toBe(false);
    vi.doUnmock('../settings/store');
    vi.resetModules();
  });
});
