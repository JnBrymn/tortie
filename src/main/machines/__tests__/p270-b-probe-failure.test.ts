/**
 * Phase 270, BUILDER B. THE INVARIANT THE NOTICE RESTS ON.
 *
 * `remoteCreate` posts `envProbe.missing` verbatim, and `EnvUnresolvedNotice`
 * documents `names` as "at least 1" (`@shared/notice:249-256`). So a probe
 * failure that came back with an EMPTY `missing` would post a notice naming
 * nothing — which is the silence this phase exists to end, wearing the costume
 * of a fix. Every way `probeRemoteEnvNames` can fail is driven here, and each
 * one must name what it was asked.
 *
 * It is a file of its own rather than a block inside
 * `./p270-b-remote-create-env.test.ts`, because that file replaces this very
 * function to drive the create, and a test that asserts a property of a
 * function it has replaced asserts a property of its own fake.
 *
 * NOTHING HERE CONTACTS A MACHINE. `runRemoteRead` is replaced, so no ssh runs,
 * no command is composed and no byte is sent. NO VALUE APPEARS IN THIS FILE.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RemoteMachineContext } from '../context';

const CTX: RemoteMachineContext = {
  kind: 'remote',
  machineId: 'popos',
  sshBin: '/usr/bin/ssh',
  host: 'pop-os.tail1a2b.ts.net',
  user: null,
  port: null,
  remoteTmuxPath: '/usr/bin/tmux',
  socket: 'gmux-p270-unit',
  controlPath: '/tmp/tortie-501/m-0123456789ab',
  hostKeys: { tortie: '/t/known-machines', user: '/u/known_hosts' }
};

const read = vi.hoisted(() => ({
  answer: null as null | (() => Promise<{ payload: string }>),
  /** Every ask that reached the door, so "asked nothing" is provable. */
  asks: [] as { id: string; args: string[] }[]
}));

vi.mock('../remote-run', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../remote-run')>()),
  runRemoteRead: (_ctx: unknown, id: string, args: readonly string[]) => {
    read.asks.push({ id, args: [...args] });
    return read.answer === null
      ? Promise.reject(new Error('no answer configured'))
      : read.answer();
  }
}));

const { probeRemoteEnvNames } = await import('../remote-env-probe');

beforeEach(() => {
  read.answer = null;
  read.asks = [];
});

describe('a probe that could not answer names everything it was asked', () => {
  const CASES: { why: string; answer: () => Promise<{ payload: string }> }[] = [
    {
      why: 'the machine could not be asked at all',
      answer: () => Promise.reject(new Error('not connected'))
    },
    {
      why: 'the login shell started and never finished, so no trailer came back',
      answer: () => Promise.resolve({ payload: 'some rc noise and nothing else' })
    },
    {
      why: 'the answer was empty',
      answer: () => Promise.resolve({ payload: '' })
    }
  ];

  for (const one of CASES) {
    it(`names both variables when ${one.why}`, async () => {
      read.answer = one.answer;
      const result = await probeRemoteEnvNames(CTX, [
        'FIREWORKS_API_KEY',
        'ANTHROPIC_API_KEY'
      ]);
      expect(result.probeFailed).toBe(true);
      expect(result.missing).toEqual([
        'ANTHROPIC_API_KEY',
        'FIREWORKS_API_KEY'
      ]);
      expect(result.resolved).toEqual([]);
    });
  }

  /**
   * It NEVER REJECTS, so a create never sees an error from it and never fails
   * because of one. A person gets a session they can use and a sentence they
   * can act on, which is strictly better than neither.
   */
  it('never rejects, whatever the door did', async () => {
    for (const one of CASES) {
      read.answer = one.answer;
      await expect(
        probeRemoteEnvNames(CTX, ['ANTHROPIC_API_KEY'])
      ).resolves.toBeDefined();
    }
  });
});

describe('a name that is not a variable name', () => {
  /** It is named in the notice rather than lost, and the machine is not asked. */
  it('comes back as missing without any round trip', async () => {
    const result = await probeRemoteEnvNames(CTX, ['A;id', 'A B', '1ABC']);
    expect(result.missing).toEqual(['1ABC', 'A B', 'A;id']);
    expect(result.resolved).toEqual([]);
    expect(result.probeFailed).toBe(false);
    expect(read.asks).toEqual([]);
  });

  /** Beside a legal one, the machine IS asked, and only about the legal one. */
  it('is dropped from the ask and still reported', async () => {
    read.answer = () => Promise.resolve({ payload: '' });
    const result = await probeRemoteEnvNames(CTX, ['A;id', 'ANTHROPIC_API_KEY']);
    expect(read.asks).toHaveLength(1);
    expect(read.asks[0]?.args[1]).toBe('ANTHROPIC_API_KEY');
    expect(read.asks[0]?.args.join(' ')).not.toContain('A;id');
    expect(result.missing).toEqual(['A;id', 'ANTHROPIC_API_KEY']);
  });
});

describe('an answer the far side really gave', () => {
  /**
   * The marker is a fresh nonce per probe and it travels as a POSITIONAL, so
   * this reads it back out of the ask rather than guessing it. A record carrying
   * any other marker is invisible, which is what stops rc output on that machine
   * forging one.
   */
  async function answerWith(
    make: (marker: string) => string,
    names: readonly string[]
  ): Promise<{ resolved: string[]; missing: string[]; probeFailed: boolean }> {
    let marker = '';
    read.answer = () => Promise.resolve({ payload: make(marker) });
    // The first ask records the marker; the door is called once per probe, so
    // the answer function reads it from the closure after `runRemoteRead` has
    // pushed it.
    const spy = read.asks;
    read.answer = () => {
      marker = spy[spy.length - 1]?.args[0] ?? '';
      return Promise.resolve({ payload: make(marker) });
    };
    return probeRemoteEnvNames(CTX, names);
  }

  it('reads one of two names as present and the other as unset', async () => {
    const result = await answerWith(
      (marker) => `${marker}ANTHROPIC_API_KEY${marker}${marker}.${marker}`,
      ['ANTHROPIC_API_KEY', 'FIREWORKS_API_KEY']
    );
    expect(result.probeFailed).toBe(false);
    expect(result.resolved).toEqual(['ANTHROPIC_API_KEY']);
    expect(result.missing).toEqual(['FIREWORKS_API_KEY']);
  });

  /** A forged record with a GUESSED marker is invisible. The nonce defeats it. */
  it('ignores a record carrying a marker this probe did not generate', async () => {
    const result = await answerWith(
      (marker) =>
        `__TORTIE_ENVP_00000000__ANTHROPIC_API_KEY__TORTIE_ENVP_00000000__` +
        `${marker}.${marker}`,
      ['ANTHROPIC_API_KEY']
    );
    expect(result.resolved).toEqual([]);
    expect(result.missing).toEqual(['ANTHROPIC_API_KEY']);
    expect(result.probeFailed).toBe(false);
  });
});
