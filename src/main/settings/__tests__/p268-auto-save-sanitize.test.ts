/**
 * PHASE 268 — the `autoSave` field: an invalid row is dropped WHOLE, a valid
 * mode keeps its mode and clamps its delay, and the choice survives a patch,
 * the disk and a fresh load.
 *
 * WHY THE WHOLE ROW GOES. `sanitizeArchSettings` sets the shape this follows
 * and the reason is the same one: half a choice here would be a timer with no
 * mode, or a mode carrying a delay nobody chose, and what sits at the other
 * end of it is a write to the person's own file. Off is the answer for a file
 * with no `autoSave` key, which is every settings file written before this
 * phase and every fresh install.
 *
 * The DELAY is different from the mode on purpose: it is a number rather than
 * a decision, so a silly one is clamped into range and the mode stands. The
 * floor is 250 rather than VS Code's 0, because a zero delay is a guarded read
 * and write per keystroke against files agents hold open.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AUTO_SAVE_DELAY_MS,
  MAX_AUTO_SAVE_DELAY_MS,
  MIN_AUTO_SAVE_DELAY_MS
} from '@shared/settings';

let userDataDir = '';

const fakeTheme = {
  shouldUseDarkColors: true,
  on(): void {},
  off(): void {}
};

vi.mock('electron', () => ({
  nativeTheme: fakeTheme,
  app: {
    isReady: () => true,
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected path: ${name}`);
      return userDataDir;
    }
  },
  safeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (text: string): Buffer =>
      Buffer.from(`sealed ${text}`, 'utf8'),
    decryptString: (buf: Buffer): string => {
      const text = buf.toString('utf8');
      if (!text.startsWith('sealed ')) throw new Error('not our key');
      return text.slice('sealed '.length);
    }
  }
}));

type Store = typeof import('../store');

async function freshStore(): Promise<Store> {
  vi.resetModules();
  return import('../store');
}

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'p268-auto-save-'));
});

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

const OFF = { mode: 'off', delayMs: DEFAULT_AUTO_SAVE_DELAY_MS };

describe('the shipped answer', () => {
  it('is off, with VS Code own 1000 ms delay behind it', async () => {
    const store = await freshStore();
    expect(store.sanitizeSettings({}).autoSave).toEqual(OFF);
    expect(store.getSettings().autoSave).toEqual(OFF);
  });
});

describe('an invalid row is dropped whole', () => {
  it('drops a row that is not an object at all', async () => {
    const store = await freshStore();
    for (const bad of [null, undefined, 3, 'afterDelay', true, []]) {
      expect(
        store.sanitizeSettings({ autoSave: bad }).autoSave,
        JSON.stringify(bad ?? null)
      ).toEqual(OFF);
    }
  });

  it('drops a row whose mode is not one of the three shipped', async () => {
    const store = await freshStore();
    // `onWindowChange` is VS Code's fourth and this phase refused it, so a
    // settings file naming it reads as off rather than as something halfway.
    for (const bad of ['onWindowChange', 'AfterDelay', 'on', 1, null, {}]) {
      expect(
        store.sanitizeSettings({ autoSave: { mode: bad, delayMs: 2000 } }).autoSave,
        JSON.stringify(bad)
      ).toEqual(OFF);
    }
  });

  it('drops the whole row rather than keeping the delay from it', async () => {
    const store = await freshStore();
    const out = store.sanitizeSettings({ autoSave: { mode: 'nope', delayMs: 5000 } });
    expect(out.autoSave.delayMs).toBe(DEFAULT_AUTO_SAVE_DELAY_MS);
  });
});

describe('a valid mode keeps its mode and clamps its delay', () => {
  it('keeps all three modes', async () => {
    const store = await freshStore();
    for (const mode of ['off', 'afterDelay', 'onFocusChange'] as const) {
      expect(
        store.sanitizeSettings({ autoSave: { mode, delayMs: 2000 } }).autoSave
      ).toEqual({ mode, delayMs: 2000 });
    }
  });

  it('clamps a silly delay into range rather than dropping the mode', async () => {
    const store = await freshStore();
    const at = (delayMs: unknown): number =>
      store.sanitizeSettings({ autoSave: { mode: 'afterDelay', delayMs } }).autoSave
        .delayMs;
    expect(at(0)).toBe(MIN_AUTO_SAVE_DELAY_MS);
    expect(at(-1)).toBe(MIN_AUTO_SAVE_DELAY_MS);
    expect(at(1)).toBe(MIN_AUTO_SAVE_DELAY_MS);
    expect(at(10_000_000)).toBe(MAX_AUTO_SAVE_DELAY_MS);
    expect(at(1500.6)).toBe(1501);
    // Not a number at all falls to the default, and the MODE stands.
    for (const bad of [NaN, Infinity, -Infinity, '2000', null, undefined, {}]) {
      expect(at(bad), JSON.stringify(bad ?? null)).toBe(DEFAULT_AUTO_SAVE_DELAY_MS);
    }
    expect(
      store.sanitizeSettings({ autoSave: { mode: 'afterDelay', delayMs: NaN } })
        .autoSave.mode
    ).toBe('afterDelay');
  });
});

describe('the round trip', () => {
  it('survives a patch, the disk and a fresh load, and a hand edit comes back off', async () => {
    const store = await freshStore();
    store.updateSettings({ autoSave: { mode: 'afterDelay', delayMs: 5000 } });
    const path = join(userDataDir, 'settings.json');
    const file = JSON.parse(readFileSync(path, 'utf8')) as {
      settings: { autoSave: { mode: string; delayMs: number } };
    };
    expect(file.settings.autoSave).toEqual({ mode: 'afterDelay', delayMs: 5000 });

    const again = await freshStore();
    expect(again.getSettings().autoSave).toEqual({ mode: 'afterDelay', delayMs: 5000 });

    // An agent, or a person, hand editing the file to something that is not a
    // mode gets the shipped answer back rather than a timer they did not pick.
    file.settings.autoSave.mode = 'everyKeystroke';
    writeFileSync(path, JSON.stringify(file), 'utf8');
    const third = await freshStore();
    expect(third.getSettings().autoSave).toEqual(OFF);
  });
});
