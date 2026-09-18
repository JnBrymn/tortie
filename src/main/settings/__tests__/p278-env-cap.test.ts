/**
 * A confirmed shell variable name survives a filled cap (Phase 278).
 *
 * Every list Tortie reads from settings.json stops at sixteen names. Until
 * Phase 278 the sixteen were the first sixteen ENTRIES of the file, and the
 * seal asked who wrote them afterwards. So sixteen names appended by anything
 * with write access to the home directory pushed out the one a person had
 * confirmed in the Settings window. Phase 278 spends the sixteen on names the
 * seal covers instead, in the file's own order.
 *
 * THE INVARIANT HAS TWO HALVES, AND THE SECOND OUTRANKS THE FIRST.
 *  (a) A name a person confirmed survives any unconfirmed entries ahead of it.
 *  (b) Nothing unconfirmed is admitted — refusal 8 in CLAUDE.md — and every
 *      list, card and log line stays bounded.
 *
 * WHY THIS FILE EXISTS. The auditor's fixture (audit-0914-env-cap.test.ts)
 * passes on `reported` and stays green with the repair removed, and the Phase
 * 275 test covers only the SHARED list. The fix round's verifiers ablated the
 * build and found no committed test that went red for the per-agent repair,
 * the cap inside the pass, the tripwire, the echo bound or the launchable-id
 * filter. Each `describe` below names the clause it guards, and the fix round
 * ablated each clause and saw the row go red.
 *
 * Every row drives the SHIPPING `getSettings` over a real settings.json in a
 * scratch directory, with the same reversible keystore stand-in the Phase 269
 * and 275 tests use, except where a row says it calls the pure function.
 *
 * NO SECRET VALUE APPEARS ANYWHERE IN THIS FILE. Every name is invented for
 * this test, nothing here resolves one, and the keystore is a stand-in.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LaunchableAgentId } from '@shared/types';
import type { DangerState } from '../store';

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
const AUTH = 'P278_AUTH_NAME';
const AGENT = 'claude';
const OTHER_AGENT = 'codex';
const SEAL_PREFIX = 'gmux-danger-seal-v1:';

type Store = typeof import('../store');

async function freshStore(): Promise<Store> {
  vi.resetModules();
  return import('../store');
}

function settingsPath(): string {
  return join(userDataDir, 'settings.json');
}

function readRaw(): Record<string, unknown> {
  return JSON.parse(readFileSync(settingsPath(), 'utf8')) as Record<string, unknown>;
}

function rawSettings(): Record<string, unknown> {
  return readRaw()['settings'] as Record<string, unknown>;
}

/** The sealed text of the file on disk, opened with the stand-in keystore. */
function sealedStateOnDisk(): Record<string, unknown> {
  const blob = readRaw()['dangerSeal'];
  if (typeof blob !== 'string') throw new Error('no seal on disk');
  const text = Buffer.from(blob, 'base64').toString('utf8');
  const prefix = `sealed ${SEAL_PREFIX}`;
  if (!text.startsWith(prefix)) throw new Error('not our seal');
  return JSON.parse(text.slice(prefix.length)) as Record<string, unknown>;
}

/**
 * Write a settings file WITH a seal we chose. A real attacker cannot forge one;
 * this test can, and that is the point — it asks what the seal COVERS.
 */
function writeSealed(
  settings: Record<string, unknown>,
  state: Record<string, unknown>
): void {
  const blob = Buffer.from(
    `sealed ${SEAL_PREFIX}${JSON.stringify(state)}`,
    'utf8'
  ).toString('base64');
  writeFileSync(
    settingsPath(),
    JSON.stringify({ version: 1, settings, dangerSeal: blob }, null, 2),
    'utf8'
  );
}

function sealOf(env: string[], envShared: string[]): Record<string, unknown> {
  return { defaults: [], acks: [], fold: null, arch: null, env, envShared };
}

function junk(count: number, tag = 'JUNK'): string[] {
  return Array.from({ length: count }, (_v, i) => `P278_${tag}_${String(i)}`);
}

let warnings: string[] = [];

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'gmux-p278-cap-'));
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

// ---------------------------------------------------------------------------
// (a) SURVIVAL
// ---------------------------------------------------------------------------

describe('SURVIVAL — a confirmed per-agent name outlives the junk ahead of it', () => {
  it.each([16, 17, 50])('with %i unconfirmed names ahead of it', async (count) => {
    writeSealed(
      { envPassthrough: { [AGENT]: [...junk(count), AUTH] } },
      sealOf([`${AGENT} ${AUTH}`], [])
    );
    const store = await freshStore();
    expect(store.getSettings().envPassthrough).toEqual({ [AGENT]: [AUTH] });
    const r = store.envRejectionsNow();
    // Delivered, so never also counted as missing, nor named as missing.
    expect(r.perAgentMissing).toEqual({});
    expect(warnings.join('\n')).not.toContain(`${AGENT} ${AUTH}`);
    // The seal still refuses the junk, and the report is still bounded.
    expect(r.perAgent[AGENT]).toEqual(junk(16));
  });
});

describe('SURVIVAL — a confirmed shared name outlives the junk ahead of it', () => {
  it.each([17, 50])('with %i unconfirmed names ahead of it', async (count) => {
    writeSealed({ envPassthroughShared: [...junk(count), AUTH] }, sealOf([], [AUTH]));
    const store = await freshStore();
    expect(store.getSettings().envPassthroughShared).toEqual([AUTH]);
    const r = store.envRejectionsNow();
    expect(r.sharedMissing).toBe(0);
    expect(warnings.join('\n')).not.toContain(`* ${AUTH}`);
    expect(r.sharedUnread).not.toContain(AUTH);
    expect(r.shared).toEqual(junk(16));
  });
});

describe('SURVIVAL — the kept list is in the FILE order, never the seal order', () => {
  it('keeps interleaved confirmed names in the order the file has them', async () => {
    const [ZULU, ALPHA, MIKE, BRAVO] = [
      'P278_ZULU',
      'P278_ALPHA',
      'P278_MIKE',
      'P278_BRAVO'
    ];
    const list = [
      ZULU,
      ...junk(8, 'A'),
      ALPHA,
      ...junk(8, 'B'),
      MIKE,
      ...junk(8, 'C'),
      BRAVO
    ];
    // The seal is sorted, the way `dangerStateOf` writes it.
    writeSealed(
      { envPassthrough: { [AGENT]: list }, envPassthroughShared: list },
      sealOf(
        [ALPHA, BRAVO, MIKE, ZULU].map((n) => `${AGENT} ${n}`),
        [ALPHA, BRAVO, MIKE, ZULU]
      )
    );
    const store = await freshStore();
    const s = store.getSettings();
    expect(s.envPassthrough[AGENT]).toEqual([ZULU, ALPHA, MIKE, BRAVO]);
    expect(s.envPassthroughShared).toEqual([ZULU, ALPHA, MIKE, BRAVO]);
  });
});

// ---------------------------------------------------------------------------
// (b) NOTHING UNCONFIRMED IS ADMITTED
// ---------------------------------------------------------------------------

describe('ADMISSION — a lookalike of a confirmed name is not that name', () => {
  // Each entry differs from AUTH by case, whitespace, a zero-width character or
  // a Cyrillic letter. None of them is the confirmed string.
  const lookalikes = [
    AUTH.toLowerCase(),
    ` ${AUTH}`,
    `${AUTH} `,
    `${AUTH}\t`,
    `${AUTH}​`,
    `﻿${AUTH}`,
    `Р${AUTH.slice(1)}`
  ];

  it('admits none of them behind a filled cap, on either list', async () => {
    writeSealed(
      {
        envPassthrough: { [AGENT]: [...junk(16), ...lookalikes] },
        envPassthroughShared: [...junk(16), ...lookalikes]
      },
      sealOf([`${AGENT} ${AUTH}`], [AUTH])
    );
    const store = await freshStore();
    const s = store.getSettings();
    expect(s.envPassthrough).toEqual({});
    expect(s.envPassthroughShared).toEqual([]);
    // The confirmed name is not in effect, and the agent card says so.
    expect(store.envRejectionsNow().perAgentMissing).toEqual({ [AGENT]: 1 });
  });

  it('admits none of them even when a forged seal covers them exactly', async () => {
    writeSealed(
      {
        envPassthrough: { [AGENT]: [...junk(16), ...lookalikes] },
        envPassthroughShared: [...junk(16), ...lookalikes]
      },
      sealOf(
        lookalikes.map((n) => `${AGENT} ${n}`),
        lookalikes
      )
    );
    const store = await freshStore();
    const s = store.getSettings();
    // The lowercase one is a well-formed name, so a seal that covers it
    // exactly admits it. Every other lookalike is refused on shape.
    expect(s.envPassthrough).toEqual({ [AGENT]: [AUTH.toLowerCase()] });
    expect(s.envPassthroughShared).toEqual([AUTH.toLowerCase()]);
  });
});

describe('ADMISSION — a seal for one list is not a seal for another, behind a filled cap', () => {
  it('does not admit a name sealed for a different agent', async () => {
    writeSealed(
      { envPassthrough: { [AGENT]: [...junk(16), AUTH] } },
      sealOf([`${OTHER_AGENT} ${AUTH}`], [])
    );
    const store = await freshStore();
    expect(store.getSettings().envPassthrough).toEqual({});
  });

  it('does not admit a shared agreement on an agent list, or the reverse', async () => {
    writeSealed(
      {
        envPassthrough: { [AGENT]: [...junk(16), AUTH] },
        envPassthroughShared: [...junk(16), 'P278_OTHER_NAME']
      },
      sealOf([`${AGENT} P278_OTHER_NAME`], [AUTH])
    );
    const store = await freshStore();
    const s = store.getSettings();
    expect(s.envPassthrough).toEqual({});
    expect(s.envPassthroughShared).toEqual([]);
  });
});

describe('ADMISSION — only an agent this build launches can hold a name', () => {
  const ids = ['notanagent', 'constructor', 'toString', 'hasOwnProperty'];

  it('through getSettings, whatever the seal covers', async () => {
    const map: Record<string, string[]> = {};
    for (const id of ids) map[id] = [...junk(16), AUTH];
    writeSealed(
      { envPassthrough: map },
      sealOf(
        ids.map((id) => `${id} ${AUTH}`),
        []
      )
    );
    const store = await freshStore();
    const s = store.getSettings();
    expect(Object.keys(s.envPassthrough)).toEqual([]);
  });

  it('through the pure function, which keeps this promise on its own', async () => {
    const store = await freshStore();
    const { defaultGmuxSettings } = await import('@shared/settings');
    // The ids are not launchable, which is the attack, so the map is cast.
    const perAgent = Object.fromEntries(ids.map((id) => [id, [AUTH]])) as Partial<
      Record<LaunchableAgentId, string[]>
    >;
    const got = store.withSealedDangerState(
      defaultGmuxSettings(),
      sealOf(
        ids.map((id) => `${id} ${AUTH}`),
        []
      ) as unknown as DangerState,
      { perAgent, shared: [], agentEnvKeys: () => [], sharedRefusedEnvKeys: [] }
    );
    expect(Object.keys(got.settings.envPassthrough)).toEqual([]);
  });
});

/**
 * A seeded property over the real load path, judged by a model written here
 * rather than by the code under test: exact strings, the file's own order,
 * first occurrence wins, sixteen at most, and the two denylisted names and the
 * one malformed entry never kept. It checks both halves at once, and it checks
 * the shared card's accounting: every refused entry whose name Tortie does not
 * read is either named or counted, once.
 */
describe('BOTH HALVES — a seeded property against an independent model', () => {
  const invented = Array.from({ length: 24 }, (_v, i) => `P278_N${String(i)}`);
  const refusedOnShape = ['PATH', 'DYLD_INSERT_LIBRARIES'];
  const wellFormedUnsealable = ['p278_lower'];
  const malformed = [' P278_N0'];
  const pool = [...invented, ...refusedOnShape, ...wellFormedUnsealable, ...malformed];
  const sealable = [...invented, ...refusedOnShape];

  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick<T>(r: () => number, from: readonly T[]): T {
    return from[Math.floor(r() * from.length)] as T;
  }

  /** What Tortie should use: the model, not the code. */
  function model(file: readonly string[], sealed: ReadonlySet<string>): string[] {
    const kept: string[] = [];
    for (const entry of file) {
      if (!sealed.has(entry)) continue;
      if (!invented.includes(entry)) continue;
      if (kept.includes(entry)) continue;
      if (kept.length >= 16) continue;
      kept.push(entry);
    }
    return kept;
  }

  /** What the shape layer keeps, which knows nothing of the seal. */
  function shapeKept(file: readonly string[]): string[] {
    const kept: string[] = [];
    for (const entry of file) {
      if (![...invented, ...wellFormedUnsealable].includes(entry)) continue;
      if (kept.includes(entry)) continue;
      if (kept.length >= 16) continue;
      kept.push(entry);
    }
    return kept;
  }

  it('holds over 60 seeded settings files', async () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const r = rng(seed);
      const agentFile = Array.from({ length: Math.floor(r() * 60) }, () => pick(r, pool));
      const sharedFile = Array.from({ length: Math.floor(r() * 60) }, () => pick(r, pool));
      const agentSeal = new Set(sealable.filter(() => r() < 0.4));
      const sharedSeal = new Set(sealable.filter(() => r() < 0.4));
      writeSealed(
        { envPassthrough: { [AGENT]: agentFile }, envPassthroughShared: sharedFile },
        sealOf(
          [...agentSeal].map((n) => `${AGENT} ${n}`),
          [...sharedSeal]
        )
      );
      const store = await freshStore();
      const s = store.getSettings();
      const rej = store.envRejectionsNow();
      const label = `seed ${String(seed)}`;

      const agentWant = model(agentFile, agentSeal);
      expect(s.envPassthrough[AGENT] ?? [], label).toEqual(agentWant);
      const sharedWant = model(sharedFile, sharedSeal);
      expect(s.envPassthroughShared, label).toEqual(sharedWant);

      // Missing: every sealed per-agent name not delivered; every sealed shared
      // name not delivered AND not in the file.
      const agentMissing = [...agentSeal].filter((n) => !agentWant.includes(n)).length;
      expect(rej.perAgentMissing[AGENT] ?? 0, label).toBe(agentMissing);
      const sharedMissing = [...sharedSeal].filter(
        (n) => !sharedWant.includes(n) && !sharedFile.includes(n)
      ).length;
      expect(rej.sharedMissing, label).toBe(sharedMissing);

      // The shared card's accounting, entry by entry.
      const kept = shapeKept(sharedFile);
      const refused: string[] = [];
      const seenKept = new Set<string>();
      for (const entry of sharedFile) {
        if (malformed.includes(entry)) continue;
        if (kept.includes(entry) && !seenKept.has(entry)) {
          seenKept.add(entry);
          continue;
        }
        refused.push(entry);
      }
      const unreadWant = refused.filter((n) => !sharedWant.includes(n));
      expect(rej.sharedUnread.length + rej.sharedUnreadOver, label).toBe(
        unreadWant.length
      );
      expect(rej.sharedUnread.length, label).toBeLessThanOrEqual(16);
      for (const name of rej.sharedUnread) {
        expect(sharedWant, label).not.toContain(name);
      }
      expect(rej.unnamed, label).toBe(
        sharedFile.filter((n) => malformed.includes(n)).length
      );
    }
  });
});

// ---------------------------------------------------------------------------
// (b) THE INPUT STAYS BOUNDED
// ---------------------------------------------------------------------------

describe('BOUNDED — the cap still holds inside the pass', () => {
  it('keeps the first sixteen of seventeen confirmed names and counts the last', async () => {
    const confirmed = junk(17, 'OK');
    writeSealed(
      { envPassthrough: { [AGENT]: confirmed }, envPassthroughShared: confirmed },
      sealOf(
        confirmed.map((n) => `${AGENT} ${n}`),
        confirmed
      )
    );
    const store = await freshStore();
    const s = store.getSettings();
    expect(s.envPassthrough[AGENT]).toEqual(confirmed.slice(0, 16));
    expect(s.envPassthroughShared).toEqual(confirmed.slice(0, 16));
    const r = store.envRejectionsNow();
    // The agent card has no unread line, so the count is how it is said.
    expect(r.perAgentMissing).toEqual({ [AGENT]: 1 });
    // The shared card names it on the unread line, and says it once.
    expect(r.sharedUnread).toEqual([confirmed[16]]);
    expect(r.sharedMissing).toBe(0);
  });

  it('holds sixteen and sixteen when 20,000 names are all sealed', async () => {
    const many = junk(20_000, 'MANY');
    writeSealed(
      { envPassthrough: { [AGENT]: many }, envPassthroughShared: many },
      sealOf(
        many.map((n) => `${AGENT} ${n}`),
        many
      )
    );
    const store = await freshStore();
    const s = store.getSettings();
    expect(s.envPassthrough[AGENT]).toHaveLength(16);
    expect(s.envPassthroughShared).toHaveLength(16);
    const r = store.envRejectionsNow();
    expect(r.perAgentMissing).toEqual({ [AGENT]: 19_984 });
    expect(r.sharedUnread).toHaveLength(16);
    expect(r.sharedUnreadOver).toBe(19_968);
    expect(JSON.stringify(r).length).toBeLessThan(2_048);
    expect(warnings.join('\n').length).toBeLessThan(4_096);
  });
});

describe('BOUNDED — no seal can author a paragraph in app.log', () => {
  it('names at most sixteen missing keys per list, and counts the rest', async () => {
    // A seal covering 2,000 names per list, and a file that holds none of them.
    const many = junk(2_000, 'GONE');
    writeSealed(
      {},
      sealOf(
        many.map((n) => `${AGENT} ${n}`),
        many
      )
    );
    const store = await freshStore();
    store.getSettings();
    const r = store.envRejectionsNow();
    expect(r.perAgentMissing).toEqual({ [AGENT]: 2_000 });
    expect(r.sharedMissing).toBe(2_000);
    const log = warnings.join('\n');
    expect(log.length).toBeLessThan(4_096);
    expect(log.split(`${AGENT} P278_GONE_`).length - 1).toBe(16);
    expect(log.split(`* P278_GONE_`).length - 1).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// The report tells the truth
// ---------------------------------------------------------------------------

describe('THE TRIPWIRE — a seal beside emptied lists is still asked', () => {
  it('counts a confirmed name the file no longer holds, on both cards', async () => {
    writeSealed({}, sealOf([`${AGENT} ${AUTH}`], [AUTH]));
    const store = await freshStore();
    const s = store.getSettings();
    expect(s.envPassthrough).toEqual({});
    expect(s.envPassthroughShared).toEqual([]);
    expect(keystore.calls).toBeGreaterThan(0);
    const r = store.envRejectionsNow();
    expect(r.perAgentMissing).toEqual({ [AGENT]: 1 });
    expect(r.sharedMissing).toBe(1);
  });

  it('still never touches the keystore on an ordinary install', async () => {
    writeFileSync(
      settingsPath(),
      JSON.stringify({ version: 1, settings: { defaultAgent: AGENT } }),
      'utf8'
    );
    const store = await freshStore();
    store.getSettings();
    expect(keystore.calls).toBe(0);
    expect(store.envRejectionsNow().sharedMissing).toBe(0);
  });
});

describe('THE LOG — a confirmed name is never described as one nobody set', () => {
  it('says the missing keys under their own sentence, in words true of both causes', async () => {
    // PATH is in the file and refused on shape; AUTH is gone from the file.
    writeSealed(
      { envPassthrough: { [AGENT]: ['PATH'] } },
      sealOf([`${AGENT} PATH`, `${AGENT} ${AUTH}`], [])
    );
    const store = await freshStore();
    store.getSettings();
    const log = warnings.join('\n');
    expect(log).toContain(`${AGENT} PATH`);
    expect(log).toContain(`${AGENT} ${AUTH}`);
    expect(log).not.toContain('not in settings.json');
    expect(log).not.toMatch(/were not set in Tortie's Settings window: [^\n]*claude P278_AUTH/);
    expect(log).toContain('not on the list Tortie reads any more');
  });
});

describe('THE SHARED CARD — one sentence per name', () => {
  it('names a confirmed name this build refuses on the unread line only', async () => {
    writeSealed(
      { envPassthroughShared: ['PATH', AUTH] },
      sealOf([], ['PATH', AUTH])
    );
    const store = await freshStore();
    expect(store.getSettings().envPassthroughShared).toEqual([AUTH]);
    const r = store.envRejectionsNow();
    expect(r.sharedUnread).toEqual(['PATH']);
    expect(r.sharedMissing).toBe(0);
  });

  it('never calls a copy of a name Tortie reads unread, nor counts it', async () => {
    const K = 'P278_UNSEALED_K';
    const rows: { file: string[]; unread: string[]; over: number }[] = [
      // A restored name written twice past the cap.
      { file: [...junk(16), AUTH, AUTH, K], unread: [K], over: 0 },
      // A name the shape layer kept, written twice.
      { file: [AUTH, AUTH], unread: [], over: 0 },
      // A restored name past the echo cap, behind sixteen refused names.
      { file: [...junk(16), ...junk(16, 'LATE'), AUTH], unread: junk(16, 'LATE'), over: 0 },
      // The same, written three times.
      {
        file: [...junk(16), ...junk(16, 'LATE'), AUTH, AUTH, AUTH, K],
        unread: junk(16, 'LATE'),
        over: 1
      },
      // Twenty thousand copies of the one name.
      { file: Array.from({ length: 20_000 }, () => AUTH), unread: [], over: 0 }
    ];
    for (const row of rows) {
      writeSealed({ envPassthroughShared: row.file }, sealOf([], [AUTH]));
      const store = await freshStore();
      expect(store.getSettings().envPassthroughShared).toEqual([AUTH]);
      const r = store.envRejectionsNow();
      expect(r.sharedUnread).toEqual(row.unread);
      expect(r.sharedUnreadOver).toBe(row.over);
      expect(r.sharedMissing).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Durability of the repair
// ---------------------------------------------------------------------------

describe('CLOSING THE SETTINGS WINDOW keeps the repair', () => {
  it('leaves the settings half of the file as it was, and the name survives the next launch', async () => {
    writeSealed(
      {
        envPassthrough: { [AGENT]: [...junk(16), AUTH, 'PATH'] },
        envPassthroughShared: [...junk(16), AUTH]
      },
      sealOf([`${AGENT} ${AUTH}`, `${AGENT} PATH`], [AUTH])
    );
    const before = readRaw();
    const first = await freshStore();
    expect(first.getSettings().envPassthrough[AGENT]).toEqual([AUTH]);
    first.saveSettingsWindowBounds({ x: 10, y: 20, width: 800, height: 600 });

    const after = readRaw();
    expect(after['settings']).toEqual(before['settings']);
    expect(after['dangerSeal']).toEqual(before['dangerSeal']);
    expect(after['settingsWindowBounds']).toEqual({ x: 10, y: 20, width: 800, height: 600 });

    const next = await freshStore();
    const s = next.getSettings();
    expect(s.envPassthrough[AGENT]).toEqual([AUTH]);
    expect(s.envPassthroughShared).toEqual([AUTH]);
    expect(next.getSettingsWindowBounds()).toEqual({ x: 10, y: 20, width: 800, height: 600 });
  });

  /**
   * PHASE 282.1. THE ARM THE FIX ROUND LEFT: a file that fails to parse at the
   * re-read — a hand edit with a syntax error, or an editor mid-write, which is
   * the population Phase 278 is about. The fix round's arm for it wrote the
   * SANITIZED cache, the exact Phase 278 write one door over: the reverify
   * read the confirmed seventeenth name dropped from disk, the seal left
   * beside a state that no longer held it, and the next launch reporting it
   * missing. The arm now writes this load's healed settings, which the seal on
   * disk covers, so the name survives; and when the seal's answer is not final
   * it writes nothing rather than strip a confirmed flag.
   */
  const BOUNDS = { x: 1, y: 2, width: 300, height: 400 };
  function seedSeventeen(): Record<string, unknown> {
    writeSealed(
      {
        envPassthrough: { [AGENT]: [...junk(16), AUTH] },
        envPassthroughShared: [...junk(16), AUTH]
      },
      sealOf([`${AGENT} ${AUTH}`], [AUTH])
    );
    return readRaw();
  }

  it.each([
    ['truncated by twenty bytes', (text: string): string => text.slice(0, -20)],
    ['a JSON array rather than an object', (): string => '[1, 2, 3]\n'],
    ['deleted', (): string | null => null]
  ])('a file %s at the re-read: the confirmed name and the seal survive on disk, the junk does not, and the next launch delivers it', async (_what, mangle) => {
    const before = seedSeventeen();
    const store = await freshStore();
    expect(store.getSettings().envPassthroughShared).toEqual([AUTH]);
    const mangled = mangle(readFileSync(settingsPath(), 'utf8'));
    if (mangled === null) rmSync(settingsPath());
    else writeFileSync(settingsPath(), mangled, 'utf8');

    store.saveSettingsWindowBounds(BOUNDS);

    const after = readRaw();
    const settings = after['settings'] as Record<string, unknown>;
    expect({
      shared: settings['envPassthroughShared'],
      perAgent: settings['envPassthrough'],
      seal: after['dangerSeal'] === before['dangerSeal'],
      bounds: after['settingsWindowBounds'],
      junkOnDisk: readFileSync(settingsPath(), 'utf8').includes('P278_JUNK_')
    }).toEqual({
      shared: [AUTH],
      perAgent: { [AGENT]: [AUTH] },
      seal: true,
      bounds: BOUNDS,
      junkOnDisk: false
    });
    // The load's reports are about a file that no longer says what it said.
    const r = store.envRejectionsNow();
    expect({ shared: r.shared, sharedUnread: r.sharedUnread, perAgent: r.perAgent }).toEqual({ shared: [], sharedUnread: [], perAgent: {} });

    // The first load's own line about the junk it ignored is the only one so far.
    const warnedBefore = warnings.length;
    const next = await freshStore();
    const s = next.getSettings();
    expect({ shared: s.envPassthroughShared, perAgent: s.envPassthrough, bounds: next.getSettingsWindowBounds() }).toEqual({
      shared: [AUTH],
      perAgent: { [AGENT]: [AUTH] },
      bounds: BOUNDS
    });
    const nr = next.envRejectionsNow();
    expect({ sharedMissing: nr.sharedMissing, perAgentMissing: nr.perAgentMissing, warnings: warnings.length - warnedBefore }).toEqual({
      sharedMissing: 0,
      perAgentMissing: {},
      warnings: 0
    });
  });

  it('with the seal not open at the re-read, nothing is written and one line says so; the bounds are kept for this run', async () => {
    seedSeventeen();
    const store = await freshStore();
    // The keystore has not answered: every danger value is stripped for now,
    // and nothing is cached, so a write from here would strip a confirmed flag.
    keystore.ready = false;
    expect(store.getSettings().envPassthroughShared).toEqual([]);
    const mangled = readFileSync(settingsPath(), 'utf8').slice(0, -20);
    writeFileSync(settingsPath(), mangled, 'utf8');

    store.saveSettingsWindowBounds(BOUNDS);

    expect({
      onDisk: readFileSync(settingsPath(), 'utf8'),
      inMemory: store.getSettingsWindowBounds(),
      warnings: warnings.length,
      said: warnings.join('\n').includes(
        'settings.json could not be read and the seal is not open, so the Settings window bounds were not written'
      )
    }).toEqual({ onDisk: mangled, inMemory: BOUNDS, warnings: 1, said: true });
  });

  it('CONTROL: a fresh install with no file yet still gets its bounds written, beside the defaults', async () => {
    const store = await freshStore();
    store.saveSettingsWindowBounds(BOUNDS);
    const after = readRaw();
    expect({ keys: Object.keys(after).sort(), bounds: after['settingsWindowBounds'] }).toEqual({
      keys: ['settings', 'settingsWindowBounds', 'version'],
      bounds: BOUNDS
    });
    const next = await freshStore();
    expect(next.getSettingsWindowBounds()).toEqual(BOUNDS);
  });
});

describe('THE FIRST SAVE heals the file and launders nothing', () => {
  it('writes the confirmed names only, and seals only those', async () => {
    writeSealed(
      {
        envPassthrough: { [AGENT]: [...junk(16), AUTH] },
        envPassthroughShared: [...junk(16), AUTH]
      },
      sealOf([`${AGENT} ${AUTH}`], [AUTH])
    );
    const store = await freshStore();
    store.getSettings();
    store.updateSettings({});

    const text = readFileSync(settingsPath(), 'utf8');
    expect(text).not.toContain('P278_JUNK_');
    expect(Object.keys(readRaw()).sort()).toEqual(['dangerSeal', 'settings', 'version']);
    const settings = rawSettings();
    expect(settings['envPassthrough']).toEqual({ [AGENT]: [AUTH] });
    expect(settings['envPassthroughShared']).toEqual([AUTH]);
    const sealed = sealedStateOnDisk();
    expect(sealed['env']).toEqual([`${AGENT} ${AUTH}`]);
    expect(sealed['envShared']).toEqual([AUTH]);

    const next = await freshStore();
    expect(next.getSettings().envPassthrough).toEqual({ [AGENT]: [AUTH] });
    const r = next.envRejectionsNow();
    expect(r.perAgent).toEqual({});
    expect(r.shared).toEqual([]);
    expect(r.perAgentMissing).toEqual({});
    expect(r.sharedMissing).toBe(0);
  });
});
