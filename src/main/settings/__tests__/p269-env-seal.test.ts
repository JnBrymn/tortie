/**
 * The shell variable NAMES are sealed (Phase 269).
 *
 * The hole this file keeps closed is the one the danger seal was built for,
 * asked about a different value. `<userData>/settings.json` is plain JSON in
 * the home directory that every agent Tortie runs can write, and a name on
 * `envPassthrough` decides which of the person's own secrets Tortie reads out
 * of their login shell and hands to a spawned process. An agent that appended
 * one name to another agent's list would be handed a key it was never given,
 * at every later launch, and nothing anywhere would say so.
 *
 * What is pinned here:
 *  - no name at all is the shipped answer, and a file written before this
 *    phase reads as none;
 *  - A NAME WRITTEN INTO THE FILE BY HAND IS REFUSED ON READ — this is the
 *    attack, and it is the security of the phase;
 *  - the refusal is REPORTED, naming the agent and the name, so a person whose
 *    variable stopped arriving has one line that says why;
 *  - the same name written through Tortie's own door survives a restart;
 *  - a seal covering agent A's name does not cover agent B's;
 *  - a seal written before this phase opens and covers no name at all;
 *  - a removed name cannot be replayed by putting it back in the file;
 *  - the shape check drops a refused name, an over-cap list and an unknown
 *    agent before the seal is ever asked;
 *  - a settings file with no name and no danger value still never reaches the
 *    OS keystore.
 *
 * NO SECRET VALUE APPEARS ANYWHERE IN THIS FILE. The names are invented for
 * this test and nothing here resolves one.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Set per test. Counts every call so the "no keystore access" claim is real. */
const keystore = { available: true, ready: true, calls: 0 };

let userDataDir = '';

vi.mock('electron', () => ({
  app: {
    isReady: () => keystore.ready,
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected path: ${name}`);
      return userDataDir;
    }
  },
  safeStorage: {
    isEncryptionAvailable: (): boolean => {
      keystore.calls += 1;
      return keystore.available;
    },
    encryptString: (text: string): Buffer => {
      keystore.calls += 1;
      return Buffer.from(`sealed ${text}`, 'utf8');
    },
    decryptString: (buf: Buffer): string => {
      keystore.calls += 1;
      const text = buf.toString('utf8');
      if (!text.startsWith('sealed ')) throw new Error('not our key');
      return text.slice('sealed '.length);
    }
  }
}));

/** Invented for this test. Nothing on any machine exports it. */
const NAME = 'P269_TEST_NAME';
const OTHER = 'P269_OTHER_NAME';
const AGENT = 'claude';
const AGENT_B = 'codex';

type Store = typeof import('../store');

async function freshStore(): Promise<Store> {
  vi.resetModules();
  return import('../store');
}

function settingsPath(): string {
  return join(userDataDir, 'settings.json');
}

/** Write a settings file the way a hostile agent would: JSON, and no seal. */
function writeByHand(settings: Record<string, unknown>): void {
  writeFileSync(
    settingsPath(),
    JSON.stringify({ version: 1, settings }, null, 2),
    'utf8'
  );
}

function readRaw(): Record<string, unknown> {
  return JSON.parse(readFileSync(settingsPath(), 'utf8')) as Record<
    string,
    unknown
  >;
}

/** Rewrite only the settings half, keeping whatever seal the file carries. */
function tamperSettings(over: Record<string, unknown>): void {
  const file = readRaw();
  writeFileSync(
    settingsPath(),
    JSON.stringify(
      {
        ...file,
        settings: { ...(file['settings'] as Record<string, unknown>), ...over }
      },
      null,
      2
    ),
    'utf8'
  );
}

let warnings: string[] = [];

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'gmux-p269-seal-'));
  keystore.available = true;
  keystore.ready = true;
  keystore.calls = 0;
  warnings = [];
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map((a) => String(a)).join(' '));
  });
});

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('no name at all is the shipped answer', () => {
  it('is what a fresh install reads', async () => {
    const store = await freshStore();
    expect(store.getSettings().envPassthrough).toEqual({});
  });

  it('is what a settings file written before this phase reads', async () => {
    writeByHand({ defaultAgent: 'claude', scrollbackLines: 25_000 });
    const store = await freshStore();
    expect(store.getSettings().envPassthrough).toEqual({});
  });

  it('still never touches the OS keystore', async () => {
    writeByHand({ defaultAgent: 'claude' });
    const store = await freshStore();
    store.getSettings();
    expect(keystore.calls).toBe(0);
  });
});

describe('THE ATTACK — a name written straight into settings.json', () => {
  it('is refused on read', async () => {
    writeByHand({ envPassthrough: { [AGENT]: [NAME] } });
    const store = await freshStore();
    expect(store.getSettings().envPassthrough).toEqual({});
  });

  it('is reported, naming the agent and the name', async () => {
    writeByHand({ envPassthrough: { [AGENT]: [NAME] } });
    const store = await freshStore();
    store.getSettings();
    expect(warnings.join('\n')).toContain(`${AGENT} ${NAME}`);
  });

  it('leaves an agent absent rather than present and empty', async () => {
    writeByHand({ envPassthrough: { [AGENT]: [NAME, OTHER] } });
    const store = await freshStore();
    expect(AGENT in store.getSettings().envPassthrough).toBe(false);
  });

  it('cannot ride in on a seal that covers a different agent', async () => {
    const first = await freshStore();
    first.updateSettings({ envPassthrough: { [AGENT]: [NAME] } });
    // The agent moves the name to a SECOND agent and keeps the seal it found.
    tamperSettings({ envPassthrough: { [AGENT_B]: [NAME] } });
    const store = await freshStore();
    expect(store.getSettings().envPassthrough).toEqual({});
    expect(warnings.join('\n')).toContain(`${AGENT_B} ${NAME}`);
  });

  it('cannot be replayed after the person removed it', async () => {
    const first = await freshStore();
    first.updateSettings({ envPassthrough: { [AGENT]: [NAME] } });
    // The person removes it through the app's own door, which re-seals.
    first.updateSettings({ envPassthrough: {} });
    tamperSettings({ envPassthrough: { [AGENT]: [NAME] } });
    const store = await freshStore();
    expect(store.getSettings().envPassthrough).toEqual({});
  });
});

describe("the same name through Tortie's own door", () => {
  it('survives a restart', async () => {
    const first = await freshStore();
    expect(
      first.updateSettings({ envPassthrough: { [AGENT]: [NAME] } })
        .envPassthrough[AGENT]
    ).toEqual([NAME]);
    const second = await freshStore();
    expect(second.getSettings().envPassthrough[AGENT]).toEqual([NAME]);
  });

  it('writes the NAME and a seal beside it', async () => {
    const store = await freshStore();
    store.updateSettings({ envPassthrough: { [AGENT]: [NAME] } });
    const raw = readRaw();
    expect(typeof raw['dangerSeal']).toBe('string');
    expect(readFileSync(settingsPath(), 'utf8')).toContain(NAME);
  });

  it('is REFUSED at the write when the keystore is unavailable, and says so', async () => {
    keystore.available = false;
    const store = await freshStore();
    const next = store.updateSettings({ envPassthrough: { [AGENT]: [NAME] } });
    expect(next.envPassthrough).toEqual({});
    expect(warnings.join('\n')).toContain(`${AGENT} ${NAME}`);
  });
});

describe('an old seal covers no name', () => {
  it('opens, and answers no names', async () => {
    // A seal in exactly the pre-Phase-269 shape: four members, no `env`.
    const old = { defaults: [], acks: [], fold: null, arch: null };
    writeFileSync(
      settingsPath(),
      JSON.stringify(
        {
          version: 1,
          settings: { envPassthrough: { [AGENT]: [NAME] } },
          dangerSeal: Buffer.from(
            `sealed gmux-danger-seal-v1:${JSON.stringify(old)}`,
            'utf8'
          ).toString('base64')
        },
        null,
        2
      ),
      'utf8'
    );
    const store = await freshStore();
    expect(store.getSettings().envPassthrough).toEqual({});
  });
});

describe('the shape check runs first, and is silent', () => {
  it('drops an unknown agent id', async () => {
    const store = await freshStore();
    expect(
      store.sanitizeSettings({ envPassthrough: { 'not-an-agent': [NAME] } })
        .envPassthrough
    ).toEqual({});
  });

  it('drops a non-array and a non-string entry', async () => {
    const store = await freshStore();
    expect(
      store.sanitizeSettings({ envPassthrough: { [AGENT]: NAME } })
        .envPassthrough
    ).toEqual({});
    expect(
      store.sanitizeSettings({ envPassthrough: { [AGENT]: [7, NAME] } })
        .envPassthrough
    ).toEqual({ [AGENT]: [NAME] });
  });

  it('drops a refused name and keeps the rest in order', async () => {
    const store = await freshStore();
    expect(
      store.sanitizeSettings({
        envPassthrough: {
          [AGENT]: [OTHER, 'PATH', NAME, 'PI_CODING_AGENT_DIR', 'GMUX_SESSION_ID']
        }
      }).envPassthrough
    ).toEqual({ [AGENT]: [OTHER, NAME] });
  });

  it('keeps sixteen names and drops the seventeenth', async () => {
    const store = await freshStore();
    const many = Array.from({ length: 17 }, (_v, i) => `P269_N${i}`);
    expect(
      store.sanitizeSettings({ envPassthrough: { [AGENT]: many } })
        .envPassthrough[AGENT]
    ).toEqual(many.slice(0, 16));
  });

  it("drops a name the agent's own compiled row already sets", async () => {
    const store = await freshStore();
    expect(
      store.sanitizeSettings({ envPassthrough: { cursor: ['FORCE_COLOR'] } })
        .envPassthrough
    ).toEqual({});
  });
});
