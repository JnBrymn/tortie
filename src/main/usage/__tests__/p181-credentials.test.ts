/**
 * The credential readers (Phase 181). Every seam is injected, so this file
 * opens no keychain, reads nothing under anybody's home and spawns nothing.
 *
 * The tokens below are the literal word for a token. No real credential, no
 * fragment of one and no identifier from the operator's machine is here.
 */

import { describe, expect, it } from 'vitest';
import type { CredentialDeps } from '../credentials';
import {
  CLAUDE_KEYCHAIN_FALLBACK_ACCOUNT,
  CLAUDE_KEYCHAIN_SERVICE,
  claudeScopedService,
  readClaudeCredential,
  readCodexCredential
} from '../credentials';

function deps(over: Partial<CredentialDeps> = {}): {
  deps: CredentialDeps;
  asked: string[];
  /** PHASE 281. The account each keychain ask carried, in the same order. */
  accounts: string[];
  read: string[];
} {
  const asked: string[] = [];
  const accounts: string[] = [];
  const read: string[] = [];
  const base: CredentialDeps = {
    keychain: async (service, account) => {
      asked.push(service);
      accounts.push(account);
      return null;
    },
    readText: async (path) => {
      read.push(path);
      return null;
    },
    env: {},
    home: '/Users/example',
    ...over
  };
  return { deps: base, asked, accounts, read };
}

const CLAUDE_PAYLOAD = JSON.stringify({
  claudeAiOauth: {
    accessToken: 'ACCESS',
    refreshToken: 'REFRESH',
    expiresAt: 1,
    refreshTokenExpiresAt: 2,
    scopes: ['a', 'b', 'c', 'd', 'e'],
    subscriptionType: 'plan',
    rateLimitTier: 'tier'
  },
  mcpOAuth: { 'some-server': { accessToken: 'MCP_TOKEN' } }
});

describe('the Claude credential reader', () => {
  it('asks the PLAIN service name when no config dir is set', async () => {
    const bag = deps();
    bag.deps.keychain = async (service, account) => {
      bag.asked.push(service);
      bag.accounts.push(account);
      return CLAUDE_PAYLOAD;
    };
    await readClaudeCredential(bag.deps);
    expect(bag.asked).toEqual([CLAUDE_KEYCHAIN_SERVICE]);
    // PHASE 281. Under an account, always: no USER and no user name seam is
    // the vendor's own fallback, never a lookup without `-a`.
    expect(bag.accounts).toEqual([CLAUDE_KEYCHAIN_FALLBACK_ACCOUNT]);
    expect(await readClaudeCredential(bag.deps)).toEqual({
      kind: 'ok',
      token: 'ACCESS',
      accountId: null,
      plan: 'plan'
    });
  });

  it('asks under USER when it is set, and never asks the user name then', async () => {
    let askedName = 0;
    const bag = deps({
      env: { USER: 'p281-vendor' },
      osUserName: () => {
        askedName += 1;
        return 'p281-stray';
      }
    });
    await readClaudeCredential(bag.deps);
    expect(bag.accounts).toEqual(['p281-vendor']);
    expect(askedName).toBe(0);
  });

  // PHASE 281 REWROTE THIS ROW. It pinned the plain-name fallback: `asked`
  // was `[claudeScopedService('/tmp/cfg'), CLAUDE_KEYCHAIN_SERVICE]`. Research
  // 126 §5 read the vendor's `mI` and found no plain-name read under a set
  // `CLAUDE_CONFIG_DIR`, so the row now pins the ONE name and the branch B
  // case: a credential held only under the plain name answers missing.
  it('asks the scoped name and NOTHING ELSE when a config dir is set', async () => {
    const bag = deps({ env: { CLAUDE_CONFIG_DIR: '/tmp/cfg' } });
    await readClaudeCredential(bag.deps);
    expect(bag.asked).toEqual([claudeScopedService('/tmp/cfg')]);

    const plainOnly = deps({
      env: { CLAUDE_CONFIG_DIR: '/tmp/cfg' },
      keychain: async (service) =>
        service === CLAUDE_KEYCHAIN_SERVICE ? CLAUDE_PAYLOAD : null
    });
    expect(await readClaudeCredential(plainOnly.deps)).toEqual({ kind: 'missing' });
  });

  it('falls through to the file when the keychain has nothing', async () => {
    const bag = deps();
    bag.deps.readText = async (path) => {
      bag.read.push(path);
      return CLAUDE_PAYLOAD;
    };
    const out = await readClaudeCredential(bag.deps);
    expect(out).toEqual({
      kind: 'ok',
      token: 'ACCESS',
      accountId: null,
      plan: 'plan'
    });
    expect(bag.read).toEqual(['/Users/example/.claude/.credentials.json']);
  });

  it('reads claudeAiOauth and never mcpOAuth', async () => {
    const out = await readClaudeCredential(
      deps({ keychain: async () => CLAUDE_PAYLOAD }).deps
    );
    expect(JSON.stringify(out)).not.toContain('MCP_TOKEN');
  });

  it('says missing, and never signed out, on a payload that does not parse', async () => {
    const out = await readClaudeCredential(
      deps({ keychain: async () => 'not json at all' }).deps
    );
    expect(out).toEqual({ kind: 'missing' });
  });

  it('says missing when the keychain is empty and no file exists', async () => {
    expect(await readClaudeCredential(deps().deps)).toEqual({ kind: 'missing' });
  });

  // PHASE 281. A keychain that could not answer is not a sign out.
  it('THROWS rather than saying missing when the keychain could not be read', async () => {
    const bag = deps({
      keychain: async () => {
        throw new Error('p281: the keychain refused to interact');
      }
    });
    await expect(readClaudeCredential(bag.deps)).rejects.toThrow(
      'the Claude keychain item could not be read'
    );
    // The file was still tried first, because it may stand in for the store.
    expect(bag.read).toEqual(['/Users/example/.claude/.credentials.json']);
  });

  it('answers from the file when the keychain could not be read but the file can', async () => {
    const out = await readClaudeCredential(
      deps({
        keychain: async () => {
          throw new Error('p281: the keychain refused to interact');
        },
        readText: async () => CLAUDE_PAYLOAD
      }).deps
    );
    expect(out).toEqual({ kind: 'ok', token: 'ACCESS', accountId: null, plan: 'plan' });
  });
});

describe('the Codex credential reader', () => {
  const auth = (over: Record<string, unknown> = {}): string =>
    JSON.stringify({
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
      tokens: {
        id_token: 'ID',
        access_token: 'ACCESS',
        refresh_token: 'REFRESH',
        account_id: 'ACCOUNT'
      },
      last_refresh: '2026-08-31T10:00:00Z',
      ...over
    });

  it('reads the access token and the account id out of auth.json', async () => {
    const bag = deps();
    bag.deps.readText = async (path) => {
      bag.read.push(path);
      return auth();
    };
    expect(await readCodexCredential(bag.deps)).toEqual({
      kind: 'ok',
      token: 'ACCESS',
      accountId: 'ACCOUNT',
      plan: null
    });
    expect(bag.read).toEqual(['/Users/example/.codex/auth.json']);
  });

  it('answers api key billing when OPENAI_API_KEY is present', async () => {
    const out = await readCodexCredential(
      deps({ readText: async () => auth({ OPENAI_API_KEY: 'sk-EXAMPLE' }) }).deps
    );
    expect(out).toEqual({ kind: 'api-key' });
  });

  it('honours CODEX_HOME', async () => {
    const bag = deps({ env: { CODEX_HOME: '/tmp/codex' } });
    await readCodexCredential(bag.deps);
    expect(bag.read).toEqual(['/tmp/codex/auth.json']);
  });

  it('says missing on no file, bad json, or a half filled tokens object', async () => {
    expect(await readCodexCredential(deps().deps)).toEqual({ kind: 'missing' });
    expect(
      await readCodexCredential(deps({ readText: async () => '{' }).deps)
    ).toEqual({ kind: 'missing' });
    expect(
      await readCodexCredential(
        deps({ readText: async () => auth({ tokens: { access_token: 'A' } }) }).deps
      )
    ).toEqual({ kind: 'missing' });
  });
});
