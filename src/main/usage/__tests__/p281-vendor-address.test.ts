/**
 * The item Claude Code reads, named the way Claude Code names it (Phase 281).
 *
 * Every function here is pure. This file opens no keychain, spawns nothing,
 * reads no environment of the machine it runs on and asks no user name of
 * the operating system: every environment is a literal and every user name is
 * a function this file wrote. The account names are synthetic.
 *
 * TWO METHODS, so the copy is not checked against itself. The first is the
 * branch by branch table from research 126 §5 and §7.2. The second is a
 * TRANSCRIPTION of the vendor's own `Cv` and `mI`, as they read in the
 * installed 2.1.274 bundle, run over a matrix of environments and compared
 * with the shipping functions answer for answer. The scoped digest is
 * re-derived here with `node:crypto` rather than trusted.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_KEYCHAIN_FALLBACK_ACCOUNT,
  CLAUDE_KEYCHAIN_SERVICE,
  claudeKeychainAccount,
  claudeKeychainService,
  claudeScopedService,
  isClaudeVendorService
} from '../credentials';

type Env = Record<string, string | undefined>;

/** This file's own spelling of a scoped name, over the NFC form. */
function scoped(dir: string): string {
  const digest = createHash('sha256')
    .update(dir.normalize('NFC'), 'utf8')
    .digest('hex');
  return `Claude Code-credentials-${digest.slice(0, 8)}`;
}

/** A user name function that says whether it was asked. */
function userName(answer: string | (() => never)): {
  fn: () => string;
  asked: () => number;
} {
  let asked = 0;
  return {
    fn: () => {
      asked += 1;
      return typeof answer === 'string' ? answer : answer();
    },
    asked: () => asked
  };
}

const throws = (): never => {
  throw new Error('p281: no passwd entry');
};

// A directory whose name is NOT in NFC form: `e` followed by U+0301, the
// combining acute, where NFC spells one U+00E9.
const DECOMPOSED = '/p281/cafe\u0301/logins/claude/0011223344556677';
const COMPOSED = '/p281/caf\u00e9/logins/claude/0011223344556677';

/** Every pairing of unset, empty, plain, decomposed, composed and slashed. */
const DIRS = [undefined, '', '/p281/cfg', DECOMPOSED, COMPOSED, '/p281/cfg/'];

const ENVS: Env[] = DIRS.flatMap((secure) =>
  DIRS.map((config) => {
    const env: Env = {};
    if (secure !== undefined) env['CLAUDE_SECURESTORAGE_CONFIG_DIR'] = secure;
    if (config !== undefined) env['CLAUDE_CONFIG_DIR'] = config;
    return env;
  })
);

describe('Phase 281: the account, a copy of the vendor Cv', () => {
  it('is USER when it is set and fits the pattern, and never asks the user name', () => {
    const who = userName('p281-stray');
    expect(claudeKeychainAccount({ USER: 'p281-vendor' }, who.fn)).toBe('p281-vendor');
    expect(who.asked()).toBe(0);
    // `||` short circuits in the vendor, so a user name that would throw is
    // never reached either.
    expect(claudeKeychainAccount({ USER: 'p281-vendor' }, throws)).toBe('p281-vendor');
  });

  it('keeps every character the pattern allows', () => {
    expect(claudeKeychainAccount({ USER: 'p281.Vendor_9-x' })).toBe('p281.Vendor_9-x');
  });

  it('asks the user name when USER is unset or empty', () => {
    const unset = userName('p281-vendor');
    expect(claudeKeychainAccount({}, unset.fn)).toBe('p281-vendor');
    expect(unset.asked()).toBe(1);
    const empty = userName('p281-vendor');
    expect(claudeKeychainAccount({ USER: '' }, empty.fn)).toBe('p281-vendor');
    expect(empty.asked()).toBe(1);
  });

  it('falls back when USER fails the pattern, WITHOUT trying the user name', () => {
    // The vendor takes a non-empty USER and only then tests it, so a USER that
    // fails the pattern gives the fallback rather than the user name.
    for (const bad of [
      'p281 vendor',
      'p281@vendor',
      'p281/vendor',
      'p281-vendor\n',
      'jos\u00e9',
      '"p281"'
    ]) {
      const who = userName('p281-vendor');
      expect(claudeKeychainAccount({ USER: bad }, who.fn)).toBe('claude-code-user');
      expect(who.asked()).toBe(0);
    }
  });

  it('falls back when the user name throws, is empty, fails the pattern, or is not known', () => {
    expect(claudeKeychainAccount({}, throws)).toBe('claude-code-user');
    expect(claudeKeychainAccount({ USER: '' }, throws)).toBe('claude-code-user');
    expect(claudeKeychainAccount({}, () => '')).toBe('claude-code-user');
    expect(claudeKeychainAccount({}, () => 'p281 stray')).toBe('claude-code-user');
    expect(claudeKeychainAccount({})).toBe('claude-code-user');
    expect(CLAUDE_KEYCHAIN_FALLBACK_ACCOUNT).toBe('claude-code-user');
  });

  it('reads the environment it is handed and never the process one', () => {
    // Whatever USER the machine running this suite has, an empty handed-in
    // environment with no user name function answers the fallback.
    expect(claudeKeychainAccount({})).toBe('claude-code-user');
    expect(claudeKeychainAccount({ USER: undefined }, () => 'p281-vendor')).toBe(
      'p281-vendor'
    );
  });
});

describe('Phase 281: the service name, a copy of the vendor mI', () => {
  it('is the plain name with nothing set', () => {
    expect(claudeKeychainService({}, null)).toBe(CLAUDE_KEYCHAIN_SERVICE);
    expect(claudeKeychainService({}, null)).toBe('Claude Code-credentials');
  });

  it('is the plain name for an empty CLAUDE_CONFIG_DIR', () => {
    expect(claudeKeychainService({ CLAUDE_CONFIG_DIR: '' }, null)).toBe(
      'Claude Code-credentials'
    );
  });

  it('is the scoped name of a non-empty CLAUDE_CONFIG_DIR, and ONE name, never a list', () => {
    const got = claudeKeychainService({ CLAUDE_CONFIG_DIR: '/p281/cfg' }, null);
    expect(typeof got).toBe('string');
    expect(got).toBe(scoped('/p281/cfg'));
    expect(got).not.toBe('Claude Code-credentials');
  });

  it('is the plain name for CLAUDE_SECURESTORAGE_CONFIG_DIR defined and empty, even with a config dir', () => {
    expect(
      claudeKeychainService(
        { CLAUDE_SECURESTORAGE_CONFIG_DIR: '', CLAUDE_CONFIG_DIR: '/p281/cfg' },
        null
      )
    ).toBe('Claude Code-credentials');
    expect(claudeKeychainService({ CLAUDE_SECURESTORAGE_CONFIG_DIR: '' }, null)).toBe(
      'Claude Code-credentials'
    );
  });

  it('is the scoped name of CLAUDE_SECURESTORAGE_CONFIG_DIR when it is not empty, over any config dir', () => {
    expect(
      claudeKeychainService(
        {
          CLAUDE_SECURESTORAGE_CONFIG_DIR: '/p281/secure',
          CLAUDE_CONFIG_DIR: '/p281/cfg'
        },
        null
      )
    ).toBe(scoped('/p281/secure'));
    expect(
      claudeKeychainService({ CLAUDE_SECURESTORAGE_CONFIG_DIR: '/p281/secure' }, null)
    ).toBe(scoped('/p281/secure'));
  });

  it('treats a key holding undefined as unset, the way the vendor asks !== void 0', () => {
    expect(
      claudeKeychainService(
        { CLAUDE_SECURESTORAGE_CONFIG_DIR: undefined, CLAUDE_CONFIG_DIR: '/p281/cfg' },
        null
      )
    ).toBe(scoped('/p281/cfg'));
  });

  it('gives a login directory its own scoped name and nothing else, whatever the process has set', () => {
    const dir = '/p281/logins/claude/aabbccddeeff0011';
    for (const env of [
      {},
      { CLAUDE_CONFIG_DIR: '/p281/cfg' },
      { CLAUDE_SECURESTORAGE_CONFIG_DIR: '' },
      { CLAUDE_SECURESTORAGE_CONFIG_DIR: '/p281/secure', CLAUDE_CONFIG_DIR: '/p281/cfg' }
    ] satisfies Env[]) {
      expect(claudeKeychainService(env, dir)).toBe(scoped(dir));
    }
  });

  it('reads an empty login directory as the default login', () => {
    expect(claudeKeychainService({}, '')).toBe('Claude Code-credentials');
    expect(claudeKeychainService({ CLAUDE_CONFIG_DIR: '/p281/cfg' }, '')).toBe(
      scoped('/p281/cfg')
    );
  });

  it('hashes the NFC form, so a decomposed name reaches the item its composed twin names', () => {
    expect(DECOMPOSED).not.toBe(COMPOSED);
    expect(DECOMPOSED.normalize('NFC')).toBe(COMPOSED);
    // The step is real: a digest of the raw decomposed bytes names another item.
    const raw = `Claude Code-credentials-${createHash('sha256')
      .update(DECOMPOSED, 'utf8')
      .digest('hex')
      .slice(0, 8)}`;
    expect(raw).not.toBe(scoped(COMPOSED));

    expect(claudeScopedService(DECOMPOSED)).toBe(claudeScopedService(COMPOSED));
    expect(claudeScopedService(DECOMPOSED)).toBe(scoped(COMPOSED));
    expect(claudeScopedService(DECOMPOSED)).not.toBe(raw);
    expect(claudeKeychainService({}, DECOMPOSED)).toBe(scoped(COMPOSED));
    expect(claudeKeychainService({ CLAUDE_CONFIG_DIR: DECOMPOSED }, null)).toBe(
      scoped(COMPOSED)
    );
    expect(
      claudeKeychainService({ CLAUDE_SECURESTORAGE_CONFIG_DIR: DECOMPOSED }, null)
    ).toBe(scoped(COMPOSED));
  });

  it('hashes the string as given otherwise, with no trailing slash removed', () => {
    expect(claudeScopedService('/p281/cfg/')).toBe(scoped('/p281/cfg/'));
    expect(claudeScopedService('/p281/cfg/')).not.toBe(claudeScopedService('/p281/cfg'));
  });
});

describe('Phase 281: the vendor namespace', () => {
  it('holds the plain name, every scoped name and both staged places', () => {
    const one = claudeScopedService('/p281/logins/claude/aa');
    for (const name of [
      'Claude Code-credentials',
      one,
      `${one}.tortie-pending`,
      'Claude Code-credentials.tortie-pending',
      'Claude Code-credentials-00000000'
    ]) {
      expect(isClaudeVendorService(name)).toBe(true);
    }
  });

  it('refuses look-alikes and every name that is not the vendor credential', () => {
    for (const name of [
      'Claude Code-credentialsX',
      'Claude Code-credential',
      'Claude Code',
      'Claude Code-doctor-probe',
      'claude code-credentials',
      ' Claude Code-credentials',
      'XClaude Code-credentials',
      'Tortie-credentials-claude.default-0a1b2c3d',
      ''
    ]) {
      expect(isClaudeVendorService(name)).toBe(false);
    }
  });

  it('holds every name the service rule can produce', () => {
    for (const env of ENVS) {
      for (const dir of [null, '', '/p281/logins/claude/aa', DECOMPOSED]) {
        expect(isClaudeVendorService(claudeKeychainService(env, dir))).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The second method: the vendor's own code, transcribed, against the copies
// ---------------------------------------------------------------------------

/**
 * `Cv` in Claude Code 2.1.274, transcribed from the bundle with the process
 * environment and `userInfo` made arguments:
 *
 * `function Cv(){let n;try{n=process.env.USER||u().username}catch{n="claude-code-user"}if(!s.test(n))return"claude-code-user";return n}`
 * with `var s=/^[a-zA-Z0-9._-]+$/`.
 */
function vendorCv(env: Env, username: (() => string) | undefined): string {
  let n: string;
  try {
    // A missing function throws a TypeError here, which is the catch branch.
    n = env['USER'] || (username as () => string)();
  } catch {
    n = 'claude-code-user';
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(n)) return 'claude-code-user';
  return n;
}

/**
 * `mI("-credentials")` in Claude Code 2.1.274, transcribed from the bundle,
 * with `OAUTH_FILE_SUFFIX` the production `""` and `we()` being
 * `(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude")).normalize("NFC")`:
 *
 * `function mI(n=""){let e=process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR,t=e!==void 0?!e:!process.env.CLAUDE_CONFIG_DIR,r=e!==void 0?e.normalize("NFC"):we(),c=t?"":\`-${a("sha256").update(r).digest("hex").substring(0,8)}\`;return\`Claude Code${Xt().OAUTH_FILE_SUFFIX}${n}${c}\`}`
 */
function vendorMI(env: Env): string {
  const e = env['CLAUDE_SECURESTORAGE_CONFIG_DIR'];
  const t = e !== undefined ? !e : !env['CLAUDE_CONFIG_DIR'];
  const r =
    e !== undefined
      ? e.normalize('NFC')
      : (env['CLAUDE_CONFIG_DIR'] ?? '/p281-home/.claude').normalize('NFC');
  const c = t
    ? ''
    : `-${createHash('sha256').update(r).digest('hex').substring(0, 8)}`;
  return `Claude Code${''}${'-credentials'}${c}`;
}

describe('Phase 281: the copies agree with the transcribed vendor', () => {
  it('names the item mI names for the default login, over every pairing of the two variables', () => {
    expect(ENVS).toHaveLength(36);
    for (const env of ENVS) {
      expect(claudeKeychainService(env, null)).toBe(vendorMI(env));
    }
  });

  it('names the item mI names for a session launched with a login directory as its CLAUDE_CONFIG_DIR', () => {
    for (const dir of ['/p281/logins/claude/aa', DECOMPOSED, '/p281/cfg/']) {
      expect(claudeKeychainService({}, dir)).toBe(vendorMI({ CLAUDE_CONFIG_DIR: dir }));
      expect(claudeKeychainService({ CLAUDE_CONFIG_DIR: '/p281/other' }, dir)).toBe(
        vendorMI({ CLAUDE_CONFIG_DIR: dir })
      );
    }
  });

  it('THE NAMED EXCEPTION (Phase 281.1): a chosen login under CLAUDE_SECURESTORAGE_CONFIG_DIR is the one class where the two disagree, pinned so it cannot widen in silence', () => {
    // A session Tortie launches for a chosen login carries CLAUDE_CONFIG_DIR=dir
    // and inherits the rest of Tortie's environment. If that environment
    // defines CLAUDE_SECURESTORAGE_CONFIG_DIR, Claude Code's mI ignores the
    // login directory: EMPTY, it reads and writes the PLAIN item, the default
    // account's credential, so the "second login" session runs on the default
    // account while Tortie's meter, presence and switch target the login's
    // scoped item, a name no session reads; SET, it reads the variable's own
    // scoped item for every login. The Phase 281 vendor verifier graded this
    // major and asked for this pin; the fix is loginPaneEnv setting the
    // variable beside CLAUDE_CONFIG_DIR (SPEC §8, not built in Phase 281).
    const dir = '/p281/logins/claude/aabbccddeeff0011';
    const secure = '/p281/secure';
    // Empty: the vendor names the plain item, Tortie the login's scoped item.
    expect(vendorMI({ CLAUDE_SECURESTORAGE_CONFIG_DIR: '', CLAUDE_CONFIG_DIR: dir })).toBe('Claude Code-credentials');
    expect(claudeKeychainService({ CLAUDE_SECURESTORAGE_CONFIG_DIR: '' }, dir)).toBe(scoped(dir));
    // Set: the vendor names the variable's scoped item, Tortie the login's.
    expect(vendorMI({ CLAUDE_SECURESTORAGE_CONFIG_DIR: secure, CLAUDE_CONFIG_DIR: dir })).toBe(scoped(secure));
    expect(claudeKeychainService({ CLAUDE_SECURESTORAGE_CONFIG_DIR: secure }, dir)).toBe(scoped(dir));
    // Equal to the login directory, which is what the follow-up would set on
    // the pane: the two agree, so the exception is exactly the two rows above.
    expect(vendorMI({ CLAUDE_SECURESTORAGE_CONFIG_DIR: dir, CLAUDE_CONFIG_DIR: dir })).toBe(
      claudeKeychainService({ CLAUDE_SECURESTORAGE_CONFIG_DIR: dir }, dir)
    );
    // And with the variable unset the two agree for a login directory, so the
    // exception is the variable's alone.
    expect(vendorMI({ CLAUDE_CONFIG_DIR: dir })).toBe(claudeKeychainService({}, dir));
  });

  it('gives the account Cv gives, over every USER and user name shape', () => {
    const users = [undefined, '', 'p281-vendor', 'p281 stray', 'p281.v_1-x', 'jos\u00e9'];
    const names: ((() => string) | undefined)[] = [
      undefined,
      throws,
      () => 'p281-vendor',
      () => '',
      () => 'p281 stray'
    ];
    let compared = 0;
    for (const user of users) {
      for (const name of names) {
        const env: Env = user === undefined ? {} : { USER: user };
        expect(claudeKeychainAccount(env, name)).toBe(vendorCv(env, name));
        compared += 1;
      }
    }
    expect(compared).toBe(30);
  });
});
