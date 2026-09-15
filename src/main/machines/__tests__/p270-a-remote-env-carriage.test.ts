/**
 * Phase 270, BUILDER A. The far side resolves the names; this Mac composes no
 * value.
 *
 * NOTHING HERE SPAWNS ANYTHING. Every function under test is pure, no ssh runs,
 * no tmux server is started, no machine is contacted and no shell is spawned on
 * either side. The two far-side script texts are read as bytes.
 *
 * THE FILE IS RED AT THE PARENT by construction: `../remote-env-carriage` and
 * `../remote-env-probe` do not exist there, and `remoteCreateArgs` takes no
 * `envNames`.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { LocalMachineContext, RemoteMachineContext } from '../context';
import { remoteTmuxArgv, tmuxCommand } from '../context';
import {
  composeEnvCreateCommand,
  droppedRemoteEnvNames,
  filterRemoteEnvNames,
  REMOTE_ENV_CREATE_NAME,
  REMOTE_ENV_CREATE_SCRIPT,
  REMOTE_ENV_MAX_VALUE_CHARS,
  REMOTE_ENV_NAME_GUARD,
  REMOTE_ENV_NAMES_MAX,
  REMOTE_ENV_SLOT
} from '../remote-env-carriage';
// THE INTEGRATOR'S ROUND MOVED `remoteEnvNamesFor` HERE. It reads the settings
// door, so it is impure and belongs beside the probe; leaving it in the
// carriage put `settings/store` into `../context`'s import graph, which every
// LOCAL session goes through and which reached no settings module at the
// parent.
import {
  parseRemoteEnvAnswer,
  remoteEnvNamesFor,
  remoteEnvProbeMarker,
  REMOTE_ENV_PROBE_SCRIPT_ID
} from '../remote-env-probe';
import { remoteScript } from '../remote-scripts';
import { remoteCreateArgs } from '../remote-sessions';

const LOCAL: LocalMachineContext = {
  kind: 'local',
  machineId: 'local',
  bin: '/opt/homebrew/bin/tmux',
  socket: 'gmux-p270-unit',
  confPath: '/x/gmux-tmux.conf',
  binSource: 'dev-path',
  packaged: false
};

const REMOTE: RemoteMachineContext = {
  kind: 'remote',
  machineId: 'macpro',
  sshBin: '/usr/bin/ssh',
  host: 'gregs-mac-pro.example.ts.net',
  user: null,
  port: null,
  remoteTmuxPath: '/usr/local/bin/tmux',
  socket: 'gmux-p270-unit',
  controlPath: '/tmp/tortie-501/m-0123456789ab',
  hostKeys: { tortie: '/t/known-machines', user: '/u/known_hosts' }
};

const SID = '6f2e0b3c-0000-4000-8000-0123456789ab';

/** The six shapes rule 1 compares, and none of them names a variable. */
const SHAPES = [
  { tmuxName: 'work', sessionId: SID, argv: ['/u/b/claude'] },
  { tmuxName: 'work', sessionId: SID, argv: [] },
  { tmuxName: 'work', cwd: '/far/repo', sessionId: SID, argv: ['/u/b/claude'] },
  { tmuxName: 'work', cwd: '/far/repo', sessionId: SID, argv: [] },
  { tmuxName: 'w-2', cwd: '/far/x y', sessionId: SID, argv: ['/u/b/codex', '-m'] },
  { tmuxName: 'w-3', sessionId: SID, argv: ['/u/b/claude'], env: {} }
] as const;

describe('rule 1 — a create that names no variable did not move', () => {
  it('composes what it composed at the parent, for all six shapes', () => {
    for (const shape of SHAPES) {
      const without = remoteCreateArgs(shape);
      expect(without).not.toContain(REMOTE_ENV_SLOT);
      // The same call with an EMPTY list is the same bytes, so the field being
      // present can never be what changes a create.
      expect(remoteCreateArgs({ ...shape, envNames: [] })).toEqual(without);
      // And the stamps are still the only `-e` pairs there are.
      const pairs = without.filter((_, i) => without[i - 1] === '-e');
      expect(pairs).toEqual([`GMUX_MANAGED=1`, `GMUX_SESSION_ID=${SID}`]);
    }
  });

  it('pins the bytes of the plain remote create line', () => {
    const args = remoteCreateArgs(SHAPES[2]);
    expect(tmuxCommand(REMOTE, args).argv.at(-1)).toBe(
      "/usr/local/bin/tmux -L gmux-p270-unit -f /dev/null new-session -d -P " +
        "-F '#{session_id}' -s work -c /far/repo -e GMUX_MANAGED=1 " +
        `-e GMUX_SESSION_ID=${SID} -- /u/b/claude`
    );
  });
});

describe('rule 2 — the slot, and it is not a pair', () => {
  const args = remoteCreateArgs({
    tmuxName: 'work',
    cwd: '/far/repo',
    sessionId: SID,
    argv: ['/u/b/claude'],
    envNames: ['FOO']
  });

  it('appears exactly once', () => {
    expect(args.filter((a) => a === REMOTE_ENV_SLOT)).toHaveLength(1);
  });

  it('sits after -s and -c and before the first -e', () => {
    const slot = args.indexOf(REMOTE_ENV_SLOT);
    expect(slot).toBeGreaterThan(args.indexOf('-s'));
    expect(slot).toBeGreaterThan(args.indexOf('-c'));
    expect(slot).toBeLessThan(args.indexOf('-e'));
  });

  it('emits no pair of its own for the name', () => {
    expect(args.some((a) => a.startsWith('FOO='))).toBe(false);
    expect(args.join(' ')).not.toContain('-e FOO');
  });

  it('is still ahead of every GMUX stamp, so the stamps win', () => {
    const slot = args.indexOf(REMOTE_ENV_SLOT);
    for (const [i, a] of args.entries()) {
      if (a.startsWith('GMUX_')) expect(slot).toBeLessThan(i);
    }
  });
});

describe('rule 3 — the Phase 73 allowlist is untouched', () => {
  it('still refuses a third name passed on input.env', () => {
    expect(() =>
      remoteCreateArgs({
        tmuxName: 'work',
        sessionId: SID,
        argv: [],
        env: { ANTHROPIC_API_KEY: 'planted' }
      })
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('refuses it just the same when names are also asked for', () => {
    expect(() =>
      remoteCreateArgs({
        tmuxName: 'work',
        sessionId: SID,
        argv: [],
        env: { ANTHROPIC_API_KEY: 'planted' },
        envNames: ['ANTHROPIC_API_KEY']
      })
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('never carries a value for a passthrough name by any route', () => {
    const args = remoteCreateArgs({
      tmuxName: 'work',
      sessionId: SID,
      argv: [],
      envNames: ['ANTHROPIC_API_KEY']
    });
    const line = tmuxCommand(REMOTE, args, ['ANTHROPIC_API_KEY']).argv.join(' ');
    // The NAME is there, because the name is what travels.
    expect(line).toContain('ANTHROPIC_API_KEY');
    // No pair carrying it is composed on this Mac at any instant.
    expect(line).not.toContain('-e ANTHROPIC_API_KEY=');
  });
});

describe('rule 4 — the composed far-side string', () => {
  const NAMES = ['ANTHROPIC_API_KEY', 'FIREWORKS_API_KEY'];
  const line = composeEnvCreateCommand(
    remoteTmuxArgv(REMOTE, remoteCreateArgs({
      tmuxName: 'work',
      sessionId: SID,
      argv: ['/u/b/claude'],
      envNames: NAMES
    })),
    NAMES
  );

  it('asks the far side for its own shell, exactly once and unquoted', () => {
    expect(line.startsWith('"$SHELL" -lc ')).toBe(true);
    expect(line.split('"$SHELL"')).toHaveLength(2);
  });

  it('carries the script text exactly once', () => {
    expect(line.split(REMOTE_ENV_CREATE_SCRIPT)).toHaveLength(2);
  });

  it('puts every name in ONE single-quoted positional and nowhere else', () => {
    expect(line).toContain(
      `${REMOTE_ENV_CREATE_NAME} 'ANTHROPIC_API_KEY FIREWORKS_API_KEY' `
    );
    for (const name of NAMES) expect(line.split(name)).toHaveLength(2);
  });

  it('holds the slot in the tmux argv the far side will rebuild', () => {
    expect(line).toContain(` ${REMOTE_ENV_SLOT} `);
  });
});

describe('rule 5 — the two frozen texts, by their bytes', () => {
  const probe = remoteScript(REMOTE_ENV_PROBE_SCRIPT_ID);

  it('has the probe in the catalogue as a read taking two values', () => {
    expect(probe).not.toBeNull();
    expect(probe?.mode).toBe('read');
    expect(probe?.params).toBe(2);
  });

  it('pins both texts by sha256', () => {
    const sha = (t: string): string =>
      createHash('sha256').update(t, 'utf8').digest('hex');
    expect(sha(REMOTE_ENV_CREATE_SCRIPT)).toBe(
      'f6ad895bc789aec1ff8af1502211a303ce78e9e825beb78991a1e7922e850566'
    );
    expect(sha(probe?.text ?? '')).toBe('52d5c27bceb085f2eafba38a10c8af5e47cc028dd4c9bbce4d4b4ddc92c088d0');
  });

  it('carries the one eval, spelt with its backslash, in both', () => {
    for (const text of [REMOTE_ENV_CREATE_SCRIPT, probe?.text ?? '']) {
      expect(text).toContain('eval "v=\\${$k-}"');
      expect(text.split('eval ')).toHaveLength(2);
    }
  });

  it('puts the guard immediately before the eval in both', () => {
    for (const text of [REMOTE_ENV_CREATE_SCRIPT, probe?.text ?? '']) {
      expect(text).toContain(REMOTE_ENV_NAME_GUARD);
      expect(text.indexOf(REMOTE_ENV_NAME_GUARD)).toBeLessThan(
        text.indexOf('eval ')
      );
    }
  });

  it('spells the value cap the same number in both texts', () => {
    for (const text of [REMOTE_ENV_CREATE_SCRIPT, probe?.text ?? '']) {
      expect(text).toContain(
        `[ "\${#v}" -le ${String(REMOTE_ENV_MAX_VALUE_CHARS)} ]`
      );
    }
  });

  it('names no variable and no value of its own', () => {
    for (const text of [REMOTE_ENV_CREATE_SCRIPT, probe?.text ?? '']) {
      expect(text).not.toContain('`');
      expect(text).not.toContain('__TORTIE_ENVP_');
    }
    expect(REMOTE_ENV_CREATE_SCRIPT).toContain(REMOTE_ENV_SLOT);
  });
});

describe('rule 6 — reading the answer', () => {
  const M = '__TORTIE_ENVP_9f3c21ab__';
  const asked = ['A_KEY', 'B_KEY', 'C_KEY'];

  it('reports one missing when two of three came back', () => {
    const out = parseRemoteEnvAnswer(
      `noise${M}A_KEY${M}${M}C_KEY${M}${M}.${M}`,
      M,
      asked
    );
    expect(out.resolved).toEqual(['A_KEY', 'C_KEY']);
    expect(out.missing).toEqual(['B_KEY']);
    expect(out.probeFailed).toBe(false);
  });

  it('is a failed probe when the trailer never arrived', () => {
    const out = parseRemoteEnvAnswer(`${M}A_KEY${M}`, M, asked);
    expect(out.resolved).toEqual([]);
    expect(out.missing).toEqual(['A_KEY', 'B_KEY', 'C_KEY']);
    expect(out.probeFailed).toBe(true);
  });

  it('ignores a record forged under a guessed marker', () => {
    const forged = '__TORTIE_ENVP_00000000__';
    const out = parseRemoteEnvAnswer(
      `${forged}A_KEY${forged}${M}.${M}`,
      M,
      asked
    );
    expect(out.resolved).toEqual([]);
    expect(out.probeFailed).toBe(false);
  });

  it('ignores a record whose token is not a variable name', () => {
    const out = parseRemoteEnvAnswer(`${M}A-KEY${M}${M}.${M}`, M, asked);
    expect(out.resolved).toEqual([]);
  });

  it('counts a name asked for twice once', () => {
    const out = parseRemoteEnvAnswer(`${M}A_KEY${M}${M}.${M}`, M, [
      'A_KEY',
      'A_KEY'
    ]);
    expect(out.resolved).toEqual(['A_KEY']);
    expect(out.missing).toEqual([]);
  });

  it('makes a fresh marker per probe', () => {
    expect(remoteEnvProbeMarker()).not.toBe(remoteEnvProbeMarker());
    expect(remoteEnvProbeMarker()).toMatch(/^__TORTIE_ENVP_[0-9a-f]{8}__$/);
  });
});

describe('rule 7 — the names, filtered on this Mac before anything is composed', () => {
  const HOSTILE = [
    "A'B",
    'A;id',
    'A$(id)',
    'A`id`',
    'A B',
    'A\nB',
    'A\n',
    'A|B',
    'A>B',
    'A}',
    '${IFS}',
    '1ABC',
    '',
    'A'.repeat(300)
  ];

  it('drops every hostile shape whole', () => {
    expect(filterRemoteEnvNames(HOSTILE)).toEqual([]);
    expect(droppedRemoteEnvNames(HOSTILE).length).toBe(
      new Set(HOSTILE).size
    );
  });

  it('keeps the legal ones beside them and reports the rest', () => {
    const mixed = [...HOSTILE, 'ANTHROPIC_API_KEY', '_X9'];
    expect(filterRemoteEnvNames(mixed)).toEqual(['ANTHROPIC_API_KEY', '_X9']);
    expect(droppedRemoteEnvNames(mixed)).not.toContain('ANTHROPIC_API_KEY');
  });

  it('dedupes and caps at sixteen', () => {
    expect(filterRemoteEnvNames(['A_KEY', 'A_KEY'])).toEqual(['A_KEY']);
    const many = Array.from({ length: 40 }, (_, i) => `N${String(i)}`);
    expect(filterRemoteEnvNames(many)).toHaveLength(REMOTE_ENV_NAMES_MAX);
  });

  it('answers with nothing for an agent nobody configured', () => {
    expect(remoteEnvNamesFor(null, 'shell')).toEqual([]);
    expect(remoteEnvNamesFor({ launch: {} } as never, 'claude')).toEqual([]);
  });

  it('reads the row it is given, filtered', () => {
    expect(
      remoteEnvNamesFor(
        { launch: { envPassthrough: ['ANTHROPIC_API_KEY', 'A;id'] } } as never,
        'claude'
      )
    ).toEqual(['ANTHROPIC_API_KEY']);
  });
});

describe('rule 8 — a local command cannot grow a far-side shell', () => {
  it('composes the same plan whatever names are passed', () => {
    const args = remoteCreateArgs({ tmuxName: 'w', sessionId: SID, argv: [] });
    expect(tmuxCommand(LOCAL, args, ['FOO'])).toEqual(tmuxCommand(LOCAL, args));
    expect(tmuxCommand(LOCAL, args, ['FOO']).argv).not.toContain('"$SHELL"');
  });

  it('leaves a remote command with no names byte identical too', () => {
    const args = remoteCreateArgs({ tmuxName: 'w', sessionId: SID, argv: [] });
    expect(tmuxCommand(REMOTE, args, [])).toEqual(tmuxCommand(REMOTE, args));
  });
});

describe('rule 9 — the real bytes a login shell printed', () => {
  /**
   * CAPTURED, not invented. This is what the `env-names` text printed between
   * its `__TORTIE_RUN__` markers when it was run for real on 2026-09-14 under
   * `/bin/sh` with `SHELL=/bin/zsh`, asking for three names where the first was
   * set, the second unset and the third held a hostile VALUE
   * (`x'; id; echo '`). The value is not here because no value was ever
   * printed — only the names were.
   */
  const PAYLOAD =
    '__TORTIE_ENVP_9f3c21ab__P270_A__TORTIE_ENVP_9f3c21ab__' +
    '__TORTIE_ENVP_9f3c21ab__P270_C__TORTIE_ENVP_9f3c21ab__' +
    '__TORTIE_ENVP_9f3c21ab__.__TORTIE_ENVP_9f3c21ab__';

  it('reads the set one, the unset one and the hostile-valued one', () => {
    const out = parseRemoteEnvAnswer(PAYLOAD, '__TORTIE_ENVP_9f3c21ab__', [
      'P270_A',
      'P270_B',
      'P270_C'
    ]);
    expect(out.resolved).toEqual(['P270_A', 'P270_C']);
    expect(out.missing).toEqual(['P270_B']);
    expect(out.probeFailed).toBe(false);
  });

  it('holds no value of any kind', () => {
    expect(PAYLOAD).not.toContain('hello');
    expect(PAYLOAD).not.toContain('id');
  });

  /**
   * Also captured on 2026-09-14: `/bin/sh`, `/bin/bash` and `/bin/ksh` all
   * printed rc noise inside the outer markers, being two `.profile` lines
   * complaining about a missing file. The nonce framing is why that noise is
   * not an answer, and this is the shape of it.
   */
  it('is unmoved by rc output the far machine printed first', () => {
    const noisy =
      '/Users/x/.profile: line 2: /Users/x/.local/bin/env: No such file\n' +
      PAYLOAD;
    expect(
      parseRemoteEnvAnswer(noisy, '__TORTIE_ENVP_9f3c21ab__', ['P270_A'])
    ).toEqual({ resolved: ['P270_A'], missing: [], probeFailed: false });
  });
});
