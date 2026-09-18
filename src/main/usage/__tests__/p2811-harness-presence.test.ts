/**
 * Phase 281.1. A harness launch that installed no knob spawns no `security`
 * for the login list.
 *
 * The Phase 281.1 measure verifier found, by reading, that `probe:p281`'s
 * launch (`GMUX_PROBES=1`, no `GMUX_USAGE_FIXTURE`, no `GMUX_HARNESS_KEYCHAIN`)
 * gave the credentials domain its refusing file shape while this domain's
 * presence seam stayed `defaultLoginAccountDeps`, so a hover over the meter
 * asked `logins:list` and spawned an attributes-only `/usr/bin/security`
 * against the person's login keychain, against the probe's own safety
 * sentence. `currentDeps` now installs `harnessLoginAccountDeps` under
 * `isHarnessLaunch`, the same widest predicate the credentials domain uses.
 *
 * NOTHING HERE SPAWNS. `node:child_process` is mocked before the module under
 * test loads, so the one `execFile` the default seam would make is recorded
 * and answered with an error instead of run. The control arm, with no harness
 * term in the environment, shows the mock is live: the default seam reaches
 * it once. The login directory is a synthetic path that does not exist, so
 * the file half reads nothing under any home, and no argv is printed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawned: string[][] = [];

vi.mock('node:child_process', () => ({
  execFile: (
    file: string,
    args: readonly string[],
    _opts: unknown,
    cb: (err: Error | null) => void
  ) => {
    spawned.push([file, ...args]);
    cb(new Error('p2811: refused by the test'));
    return { on: () => undefined };
  }
}));

const HARNESS_TERMS = ['GMUX_PROBES', 'GMUX_SMOKE', 'GMUX_SHOT', 'GMUX_HARNESS_DIR'] as const;
const LOGIN_DIR = '/p2811-no-such-dir/logins/claude/0011223344556677';

describe('Phase 281.1: the login list under a harness launch with no knob', () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const term of HARNESS_TERMS) {
      saved.set(term, process.env[term]);
      delete process.env[term];
    }
    spawned.length = 0;
  });

  afterEach(async () => {
    for (const term of HARNESS_TERMS) {
      const was = saved.get(term);
      if (was === undefined) delete process.env[term];
      else process.env[term] = was;
    }
    const mod = await import('../login-accounts');
    mod.setLoginAccountDeps(null);
    vi.resetModules();
  });

  it('spawns no security for presence when GMUX_PROBES=1 and nothing installed a seam', async () => {
    process.env['GMUX_PROBES'] = '1';
    vi.resetModules();
    const mod = await import('../login-accounts');
    mod.setLoginAccountDeps(null);
    const facts = await mod.loginFacts('claude', LOGIN_DIR);
    expect(facts.present).toBe(false);
    expect(spawned).toEqual([]);
  });

  it('the control: with no harness term the default seam reaches execFile once, attributes only', async () => {
    vi.resetModules();
    const mod = await import('../login-accounts');
    mod.setLoginAccountDeps(null);
    const facts = await mod.loginFacts('claude', LOGIN_DIR);
    expect(facts.present).toBe(false);
    expect(spawned.length).toBe(1);
    const argv = spawned[0] ?? [];
    expect(argv[0]).toBe('/usr/bin/security');
    expect(argv[1]).toBe('find-generic-password');
    expect(argv).not.toContain('-w');
    expect(argv).not.toContain('-g');
  });

  it('harnessLoginAccountDeps is the fixture knob shape: the keychain answers no, spawning nothing', async () => {
    vi.resetModules();
    const mod = await import('../login-accounts');
    const deps = mod.harnessLoginAccountDeps();
    await expect(deps.keychainHas('Claude Code-credentials', 'p281-vendor')).resolves.toBe(false);
    expect(spawned).toEqual([]);
  });
});
