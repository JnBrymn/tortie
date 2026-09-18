/**
 * Reading the person's stored agent credential (Phase 181). READ ONLY, and
 * that is the whole contract of this file.
 *
 * NOTHING HERE WRITES, REFRESHES, ROTATES, DELETES OR COPIES A CREDENTIAL.
 * The measurement behind that rule: Claude Code rewrites its keychain item
 * roughly hourly, and the item's `expiresAt` fell fifty minutes after the
 * call. An access token found stale therefore means only that the agent has
 * not run recently, and the honest answer is to say so. Taking custody of a
 * single use refresh token would log the person out of their own agent the
 * first time a rotation raced, which is the failure orca's kimi arm exists to
 * avoid.
 *
 * NOTHING HERE IS LOGGED. Not the payload, not a token, not a length, not a
 * prefix. Callers log a provider name and a fixed sentence. `expiresAt` is
 * ADVISORY and is not used to refuse a call, because the item can be rewritten
 * under the reader at any moment; the server decides.
 *
 * `mcpOAuth` IS NEVER TOUCHED. The Claude keychain payload has two top level
 * keys, and the other one is a map of unrelated OAuth entries, one per
 * configured MCP server, each carrying its own access token. This file reads
 * `claudeAiOauth` and never names the other key except to say that.
 */

import { usagePlanWord } from '@shared/usage';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
// The decoder's own leaf rather than `../credentials/security`, which imports
// this file for `isClaudeVendorService`: each importing the other is a runtime
// cycle (Phase 281).
import { decodeKeychainPayload } from '../credentials/security-print';
import { runGuarded } from '../proc/guarded';

/** What a credential read answers. Never a vendor sentence, never a token in a log. */
export type CredentialResult =
  /**
   * A bearer token was found. `accountId` is set for Codex only, and it is an
   * identifier that goes in one request header and NOWHERE ELSE. `plan` is
   * the plain plan word the Claude item names in `subscriptionType`, already
   * through `usagePlanWord`, and null for Codex, whose file names no plan;
   * Codex's own plan word comes off the usage response instead.
   */
  | { kind: 'ok'; token: string; accountId: string | null; plan: string | null }
  /** No credential exists at all. The one answer that earns a sign in line. */
  | { kind: 'missing' }
  /** API key billing rather than a subscription, so there is no window. */
  | { kind: 'api-key' };

/** The seams. Tests hand in their own and touch neither keychain nor disk. */
export interface CredentialDeps {
  /**
   * `security find-generic-password -a <account> -s <service> -w`.
   *
   * THREE ANSWERS, and Phase 281 is why there are three rather than two.
   * Resolves the payload decoded through `decodeKeychainPayload` (possibly
   * ''), resolves null ONLY when the item does not exist (security exit 44),
   * and THROWS when the item could not be read: any other exit including 36,
   * a signal, a spawn error, the deadline, a cancel, or a refused argument.
   * A miss is the one answer that may draw the sign in line, and a keychain
   * that could not answer is not a miss (research 126 §7.2, item 3 of the
   * files, "A miss is not a failure").
   */
  keychain(service: string, account: string): Promise<string | null>;
  /** The file's text, or null when it does not exist or cannot be read. */
  readText(path: string): Promise<string | null>;
  env: Record<string, string | undefined>;
  home: string;
  /**
   * `userInfo().username`, for {@link claudeKeychainAccount} (Phase 281).
   * Optional: absent means the user name is not known, which gives the
   * vendor's own fallback account rather than the machine's user name, so a
   * test seam that leaves it out never depends on who runs it.
   */
  osUserName?(): string;
  /**
   * PHASE 200. End everything this reader has in flight, and answer how many
   * were ended. Called by the usage service's own shutdown, so the disposer
   * cannot resolve while a keychain child of its own is still running.
   *
   * Optional, because a test seam that reads a map has nothing to cancel.
   */
  cancel?(): number;
}

const KEYCHAIN_TIMEOUT_MS = 5_000;

/**
 * The exit `security` gives when no item matches (errSecItemNotFound), and the
 * ONLY exit this domain reads as "no credential here" (Phase 281, research 126
 * §7.2). The vendor's own store reads the same number as absent (`Q=44`,
 * bundle 2.1.274 offset 170,936,447).
 */
const KEYCHAIN_EXIT_NOT_FOUND = 44;

// ---------------------------------------------------------------------------
// PHASE 281. THE ITEM CLAUDE CODE READS, NAMED THE WAY CLAUDE CODE NAMES IT
// ---------------------------------------------------------------------------
//
// Claude Code addresses its credential item by service AND account. Until this
// phase Tortie asked by service alone, and on the operator's machine that name
// matched two items: `security` handed back a stray under another account
// that gave no usable credential, while every claude session read the item
// under his user name and posted live numbers. Research 126 §2.4 is the
// measurement, and the attributes-only `-a` lookup he ran before this phase
// started confirmed the item exists (exit 0, written that day).
//
// The functions below COPY the vendor rather than approximate it, read out of
// the installed 2.1.274 bundle (the same rule in 2.1.273): `Cv` is the
// account, `mI` the service name, and the store's read, write, delete and
// startup read all pass `-a Cv()` against `mI("-credentials")`. The one
// service-only `find-generic-password -s` string in that bundle is help text
// for a credential helper. So "Tortie finds nothing" and "Claude Code finds
// nothing" are the same fact, and the sign in line only ever says what a
// Claude Code session in the same configuration would itself conclude.

/** The plain service name, which is what a default install actually has. */
export const CLAUDE_KEYCHAIN_SERVICE = 'Claude Code-credentials';

/**
 * The account Claude Code gives its item when it cannot use the user name:
 * `Cv`'s fallback, a fixed string in the bundle.
 */
export const CLAUDE_KEYCHAIN_FALLBACK_ACCOUNT = 'claude-code-user';

/** `Cv`'s pattern, byte for byte. A user name outside it is not used. */
const CLAUDE_KEYCHAIN_ACCOUNT_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * The account attribute of the item Claude Code reads (Phase 281), a copy of
 * the vendor's `Cv`:
 *
 * ```
 * try { n = process.env.USER || userInfo().username }
 * catch { n = "claude-code-user" }
 * if (!/^[a-zA-Z0-9._-]+$/.test(n)) return "claude-code-user"
 * ```
 *
 * `USER` wins when it is set and not empty, and the user name is then never
 * asked, exactly as `||` short circuits in the vendor. `osUserName` is the
 * `userInfo().username` half, INJECTED so a test never depends on the machine
 * it runs on. Leaving it out means this process could not learn the user
 * name, which is the vendor's throw branch and answers the fallback; a
 * shipping seam always passes it. A name that is not a string is refused the
 * same way, which only matters for a seam that lies about its type.
 *
 * Every `security` call aimed at a vendor service ({@link
 * isClaudeVendorService}) carries this as `-a`, in both domains, and nothing
 * falls back to a lookup without it: a lookup by service alone is exactly the
 * read that landed on the stray item.
 */
export function claudeKeychainAccount(
  env: Readonly<Record<string, string | undefined>>,
  osUserName?: () => string
): string {
  let name: unknown;
  try {
    const fromEnv = env['USER'];
    if (fromEnv !== undefined && fromEnv !== '') {
      name = fromEnv;
    } else {
      if (osUserName === undefined) throw new Error('the user name is not known');
      name = osUserName();
    }
  } catch {
    name = CLAUDE_KEYCHAIN_FALLBACK_ACCOUNT;
  }
  return typeof name === 'string' && CLAUDE_KEYCHAIN_ACCOUNT_RE.test(name)
    ? name
    : CLAUDE_KEYCHAIN_FALLBACK_ACCOUNT;
}

/**
 * The config-dir-scoped service name: the plain name, a hyphen, and the first
 * eight hex characters of the sha256 of the directory.
 *
 * THE DIRECTORY IS HASHED IN ITS NFC FORM (Phase 281), because the vendor's
 * `mI` hashes `CLAUDE_CONFIG_DIR.normalize("NFC")` (through `we`) and
 * `CLAUDE_SECURESTORAGE_CONFIG_DIR.normalize("NFC")`. A directory spelled with
 * a decomposed accent names the same item as its composed spelling, and a
 * digest of the raw bytes would name an item no Claude Code ever writes.
 *
 * The string is hashed AS GIVEN otherwise: no resolving, no trailing slash
 * removed, no `~` expanded, because the vendor does none of those. So the
 * directory handed here must be the exact string a session's
 * `CLAUDE_CONFIG_DIR` carries.
 *
 * The caveat that stood here until Phase 281 called this form unmeasured and
 * had every reader try the plain name as well whenever a config dir was set.
 * Research 126 §5 refutes it from the vendor's own code: with a non-empty
 * `CLAUDE_CONFIG_DIR`, Claude Code asks the scoped name and NOTHING ELSE, and
 * the plain-name fallback drew one account's numbers under another account's
 * name when the Phase 280 verifier drove it.
 */
export function claudeScopedService(configDir: string): string {
  const digest = createHash('sha256')
    .update(configDir.normalize('NFC'))
    .digest('hex');
  return `${CLAUDE_KEYCHAIN_SERVICE}-${digest.slice(0, 8)}`;
}

/**
 * The ONE service name the item for this login has (Phase 281). There is no
 * list and no order, because Claude Code asks exactly one name.
 *
 *  - A LOGIN DIRECTORY Tortie made gets the scoped name of that directory,
 *    which is what the vendor names for a session launched with that
 *    `CLAUDE_CONFIG_DIR`. Never the plain name: that would read the person's
 *    own default credential under the second login's name.
 *  - Otherwise, the default login, a copy of the vendor's `mI`:
 *    `CLAUDE_SECURESTORAGE_CONFIG_DIR` DEFINED AND EMPTY gives the plain name,
 *    and defined and not empty gives the scoped name of its NFC form. That
 *    variable is asked with `!== undefined`, not for being non-empty, because
 *    the vendor asks `e !== void 0`: an empty value is a deliberate choice of
 *    the plain name even when `CLAUDE_CONFIG_DIR` is set.
 *  - Otherwise a non-empty `CLAUDE_CONFIG_DIR` gives the scoped name of its
 *    NFC form and nothing else, and an empty or unset one gives the plain name.
 *
 * THE LIMIT, stated rather than handled, and PINNED (Phase 281.1): a chosen
 * login under `CLAUDE_SECURESTORAGE_CONFIG_DIR` gets its directory's scoped
 * name here, while Claude Code, for every login, reads the plain item when
 * the variable is empty and the variable's own scoped item when it is set.
 * Empty is the worse half: the "second login" session then runs on the
 * DEFAULT account's credential while the meter, presence and a switch target
 * the login's scoped item, a name no session reads. `conformance:logins` rule
 * 18 and `__tests__/p281-vendor-address.test.ts` pin the class to exactly
 * those two rows, so it cannot widen in silence; the fix is `loginPaneEnv`
 * setting the variable beside `CLAUDE_CONFIG_DIR` on the pane (SPEC §8), which
 * research 126 §7.2 leaves out of Phase 281 and nothing has built.
 */
export function claudeKeychainService(
  env: Readonly<Record<string, string | undefined>>,
  loginDir: string | null
): string {
  if (loginDir !== null && loginDir !== '') return claudeScopedService(loginDir);
  const secure = env['CLAUDE_SECURESTORAGE_CONFIG_DIR'];
  if (secure !== undefined) {
    return secure === '' ? CLAUDE_KEYCHAIN_SERVICE : claudeScopedService(secure);
  }
  const own = env['CLAUDE_CONFIG_DIR'];
  return own !== undefined && own !== ''
    ? claudeScopedService(own)
    : CLAUDE_KEYCHAIN_SERVICE;
}

/**
 * Is this a keychain service name in Claude Code's namespace (Phase 281)?
 *
 * The plain name, any name beginning with the plain name and a hyphen (every
 * scoped name, and a scoped name's `.tortie-pending` staged place), and any
 * name beginning with the plain name and a dot (the plain name's own
 * `Claude Code-credentials.tortie-pending`, which `../credentials/stores.ts`
 * stages beside the default item). Every `security` call aimed at such a name
 * carries `-a` with {@link claudeKeychainAccount}, and `../credentials/
 * security.ts` refuses one that does not before anything is spawned.
 *
 * A name that merely STARTS with the same letters, `Claude Code-credentialsX`,
 * is not the vendor's and answers false. So does `Claude Code` on its own,
 * the vendor's API key item, which Tortie never names.
 */
export function isClaudeVendorService(service: string): boolean {
  if (typeof service !== 'string') return false;
  if (service === CLAUDE_KEYCHAIN_SERVICE) return true;
  const rest = service.slice(CLAUDE_KEYCHAIN_SERVICE.length);
  return (
    service.startsWith(CLAUDE_KEYCHAIN_SERVICE) &&
    (rest.startsWith('-') || rest.startsWith('.'))
  );
}

/** The one program this domain runs, and the only one it ever will. */
export const KEYCHAIN_BIN = '/usr/bin/security';

/**
 * PHASE 200. The keychain child goes through the OWNED registry now, and the
 * reader and its cancel are one pair.
 *
 * It used to be a bare `execFile('/usr/bin/security', ...)`, which is the one
 * child in this domain that nothing could reach: not `reapGuardedChildren()`
 * at quit, and not the usage disposer, which returned while it was still
 * running. `runGuarded` puts it in the registry every other guarded child of
 * Tortie's is in, always settles inside its deadline, and takes an abort
 * signal so this domain's own shutdown can end it at once.
 *
 * PHASE 281 CHANGED WHAT IS ASKED AND WHAT A FAILURE MEANS.
 *
 *  - THE ACCOUNT IS PASSED, as `-a`. Claude Code reads its item by service
 *    AND account (bundle 2.1.274, the async read at offset 170,936,315), and
 *    a lookup by service alone landed on a stray item under another account
 *    on the operator's machine (research 126 §2.4). An empty account is
 *    refused before anything is spawned, because asking without one is that
 *    same service-only read.
 *  - THE OUTPUT IS DECODED through `decodeKeychainPayload`, the credentials
 *    domain's one reading of what `security` prints. A payload holding a
 *    character `security` will not print raw comes out as HEX, and the raw
 *    stdout used to reach the JSON parser as that hex and read `missing`
 *    (research 126 §2.7).
 *  - A MISS AND A FAILURE ARE NO LONGER THE SAME ANSWER. Exit 44, no such
 *    item, is null. Everything else throws: another exit, a signal, a spawn
 *    error, the deadline and a cancel. The usage service already maps a thrown
 *    read to `unavailable`, which keeps the last numbers under the stale glyph
 *    instead of clearing them and telling a signed in person to sign in.
 *
 * Neither the failure nor the output is logged, and the thrown sentence is
 * fixed: it names no service, no account and nothing `security` printed.
 *
 * `bin` exists so a test can drive the SHIPPING code over a child of its own
 * that never exits, which is the only way to prove the cancel actually kills
 * something. It defaults to `KEYCHAIN_BIN` and no shipping caller passes it;
 * nothing a person or an agent can write reaches this argument.
 */
export function keychainReader(bin: string = KEYCHAIN_BIN): {
  keychain(service: string, account: string): Promise<string | null>;
  cancel(): number;
} {
  const live = new Set<AbortController>();
  return {
    keychain: async (service, account) => {
      if (typeof account !== 'string' || account === '') {
        throw new Error('the keychain read was refused: no account');
      }
      const ending = new AbortController();
      live.add(ending);
      try {
        const run = await runGuarded(
          bin,
          ['find-generic-password', '-a', account, '-s', service, '-w'],
          {
            timeoutMs: KEYCHAIN_TIMEOUT_MS,
            maxOutputBytes: 1024 * 1024,
            cancel: ending.signal
          }
        );
        const answered =
          run.spawnError === null && !run.timedOut && !run.cancelled;
        if (answered && run.code === 0) return decodeKeychainPayload(run.stdout);
        // EXIT 36 IS NOT ABSENT HERE, and that is a deliberate difference from
        // Claude Code. The vendor's own read answers null for 36 as well as 44
        // (bundle 2.1.274, `o===Q||o===ee` at offset 170,936,447). 36 is
        // errSecInteractionNotAllowed, the keychain refusing to interact, and
        // the vendor's own lock test reads `security show-keychain-info`
        // answering 36 (offset 170,936,603). A locked keychain is not a sign
        // out: reading it as one would draw "Sign in with Claude Code" for a
        // person who is signed in and send them to the wrong remedy (research
        // 126 §7.2 proof step 4).
        //
        // A LOCKED KEYCHAIN HAS ANSWERED THREE WAYS ON THIS MACHINE, and every
        // one of them throws here, which is the point. 36, per the vendor's
        // reading. A hold with nothing printed until the child was killed,
        // measured by the Phase 281 keychain verifier on a locked scratch
        // keychain in an Aqua session, which the deadline above ends. And 152,
        // errAuthorizationInternal, at once (22 to 145 ms, no prompt), measured
        // twice in Phase 281.1 on a locked scratch keychain in an Aqua session,
        // sandboxed and not, with `show-keychain-info` on it answering 152 as
        // well. The login keychain in the search list was not measured locked.
        // So the deadline is ONE route a locked keychain takes and not the
        // route, and the rule is the one below: 44 alone is absent, everything
        // else keeps the last numbers under the stale state. A locked
        // keychain's ATTRIBUTES still read (exit 0), so presence in
        // `login-accounts.ts` says present for it. THE LIMIT, stated and not
        // new (the parent sent the same `-w` read): a poll that does raise an
        // unlock prompt holds for five seconds.
        if (answered && run.code === KEYCHAIN_EXIT_NOT_FOUND) return null;
        throw new Error('the keychain item could not be read');
      } finally {
        live.delete(ending);
      }
    },
    cancel: () => {
      const ending = live.size;
      for (const one of live) one.abort();
      live.clear();
      return ending;
    }
  };
}

export function defaultCredentialDeps(): CredentialDeps {
  const reader = keychainReader();
  return {
    keychain: reader.keychain,
    readText: async (path) => {
      try {
        return await readFile(path, 'utf8');
      } catch {
        return null;
      }
    },
    env: process.env,
    home: homedir(),
    // Asked only when `USER` is unset or empty, exactly as the vendor's `Cv`
    // asks it, and a throw here (no passwd entry) is that function's own
    // fallback rather than a failed read.
    osUserName: () => userInfo().username,
    cancel: reader.cancel
  };
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * `claudeAiOauth.accessToken` out of a keychain or file payload, and the plan
 * word beside it.
 *
 * `subscriptionType` is a short plan word, measured in docs/research/72
 * section 8.1, and Phase 181.2 draws it on the hover card so a person can see
 * whose quota is on screen. The two other strings in that object are the
 * refresh token and its expiry, and neither is read here. `rateLimitTier` is
 * a tier name rather than a plan and is not read either.
 */
function claudeLoginFrom(
  text: string
): { token: string; plan: string | null } | null {
  const obj = parseJson(text);
  if (obj === null) return null;
  const oauth = obj['claudeAiOauth'];
  if (oauth === null || typeof oauth !== 'object' || Array.isArray(oauth)) {
    return null;
  }
  const bag = oauth as Record<string, unknown>;
  const token = bag['accessToken'];
  if (typeof token !== 'string' || token === '') return null;
  return { token, plan: usagePlanWord(bag['subscriptionType']) };
}

/**
 * Claude's credential: the keychain first, the file second.
 *
 * `~/.claude/.credentials.json` DOES NOT EXIST on a default macOS install,
 * measured. The file path is still read, because it is where a person who
 * turned the keychain off keeps it, but a reader that tries the file FIRST
 * and stops on a miss is the bug this order exists to prevent.
 *
 * PHASE 202 ADDED THE LOGIN AND TOOK AWAY A FALLBACK, and the second half is
 * the one that matters. `loginDir` names the directory of a login a person
 * added in Tortie, or null for their own default sign in.
 *
 * PHASE 281 MADE IT ONE ITEM, ADDRESSED THE WAY CLAUDE CODE ADDRESSES IT. The
 * keychain is asked exactly once, for the one service name
 * {@link claudeKeychainService} gives under the one account
 * {@link claudeKeychainAccount} gives:
 *
 *  - NULL, the default login: the vendor's own `mI` over Tortie's process
 *    environment, which is the plain name on a default install and the scoped
 *    name of `CLAUDE_CONFIG_DIR` when that is set. THERE IS NO PLAIN NAME
 *    AFTER THE SCOPED ONE. Phase 181 asked both, and research 126 §5 refutes
 *    that from the vendor's code: a Claude Code session under that directory
 *    never reads the plain item, and the verifier drove the fallback drawing
 *    one account's numbers under another account's name.
 *  - A DIRECTORY, a second login: the SCOPED service name for that directory
 *    and NOTHING ELSE, then that directory's own credentials file.
 *
 * The removal is the point. Falling through to the plain item for a second
 * login would read the PERSON'S OWN default credential and draw its numbers
 * under the second login's name, which is precisely the lie research 72
 * section 4 forbids: never lie across accounts. So a second login that has not
 * been signed into yet answers `missing`, which is the honest answer and the
 * one that earns the sign in line.
 *
 * `missing` is also what a login answers between being added and being signed
 * into. On macOS that sign in writes a KEYCHAIN ITEM rather than a file, so
 * "Tortie reads nothing until the file exists" is more exactly "until the
 * scoped item or the file exists", and both are asked here.
 *
 * `missing` IS ONLY EVER A CONFIRMED ANSWER (Phase 281). It is returned when
 * the keychain said there is no such item, or held nothing usable, AND the
 * file gave nothing either. A keychain that could not be read at all, being
 * locked, slow, cancelled or refused, with no file to stand in for it, THROWS
 * instead, and `fetchProvider` maps that to `unavailable`, which keeps the
 * last numbers under the stale glyph rather than telling a signed in person to
 * sign in. A payload that parses to no `claudeAiOauth.accessToken` is "held
 * nothing usable" and not unreadable: the store answered, and its answer is
 * that no credential Tortie can use is there.
 */
export async function readClaudeCredential(
  deps: CredentialDeps,
  loginDir: string | null = null
): Promise<CredentialResult> {
  const service = claudeKeychainService(deps.env, loginDir);
  const account = claudeKeychainAccount(deps.env, deps.osUserName);
  let unreadable = false;
  let payload: string | null = null;
  try {
    payload = await deps.keychain(service, account);
  } catch {
    // Nothing of the failure is kept or logged. It decides one thing, below:
    // whether an empty file read may still be called a sign out.
    unreadable = true;
  }
  if (payload !== null) {
    const login = claudeLoginFrom(payload);
    if (login !== null) {
      return { kind: 'ok', token: login.token, accountId: null, plan: login.plan };
    }
  }
  const own = deps.env['CLAUDE_CONFIG_DIR'];
  const dir =
    loginDir !== null && loginDir !== ''
      ? loginDir
      : own !== undefined && own !== ''
        ? own
        : join(deps.home, '.claude');
  const text = await deps.readText(join(dir, '.credentials.json'));
  if (text !== null) {
    const login = claudeLoginFrom(text);
    if (login !== null) {
      return { kind: 'ok', token: login.token, accountId: null, plan: login.plan };
    }
  }
  if (unreadable) throw new Error('the Claude keychain item could not be read');
  return { kind: 'missing' };
}

/**
 * Codex's credential: a file, mode 0600, and no keychain is involved.
 *
 * `OPENAI_API_KEY` is null on a subscription login, so ITS PRESENCE is how
 * API key billing announces itself. That case answers `api-key` rather than
 * `missing`, because the two mean different things to a person: one says sign
 * in, the other says there is no subscription window to show.
 */
export async function readCodexCredential(
  deps: CredentialDeps,
  loginDir: string | null = null
): Promise<CredentialResult> {
  // PHASE 202. A login's own directory outranks Tortie's process environment,
  // which outranks the vendor's default location. There is no fallback from a
  // second login to the default one, for the reason the claude reader states:
  // another account's numbers under this account's name is a lie rather than a
  // stale value.
  const home = deps.env['CODEX_HOME'];
  const dir =
    loginDir !== null && loginDir !== ''
      ? loginDir
      : home !== undefined && home !== ''
        ? home
        : join(deps.home, '.codex');
  const text = await deps.readText(join(dir, 'auth.json'));
  if (text === null) return { kind: 'missing' };
  const obj = parseJson(text);
  if (obj === null) return { kind: 'missing' };
  const apiKey = obj['OPENAI_API_KEY'];
  if (typeof apiKey === 'string' && apiKey !== '') return { kind: 'api-key' };
  const tokens = obj['tokens'];
  if (tokens === null || typeof tokens !== 'object' || Array.isArray(tokens)) {
    return { kind: 'missing' };
  }
  const bag = tokens as Record<string, unknown>;
  const token = bag['access_token'];
  const accountId = bag['account_id'];
  if (typeof token !== 'string' || token === '') return { kind: 'missing' };
  if (typeof accountId !== 'string' || accountId === '') {
    return { kind: 'missing' };
  }
  // `auth_mode` is measured `chatgpt`, which is a login method rather than a
  // plan, so nothing here is drawn as one. Codex's plan word is `plan_type`
  // on the usage response and ./parse.ts reads it there.
  return { kind: 'ok', token, accountId, plan: null };
}
