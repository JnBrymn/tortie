/**
 * The one place a credential is handed to `security`, and the shape of that
 * hand off (Phase 204).
 *
 * ## NO SECRET IS EVER ON AN ARGV
 *
 * orca writes its managed items with the payload on the command line
 * (`src/main/claude-accounts/keychain.ts`, its `-w "<payload>"`), and this
 * phase refuses that: an argv is readable by every process on the machine for
 * as long as the call lives. So every WRITE goes through `security -i`, which
 * reads its whole command from STDIN, and the payload is sent as HEX with
 * `-X`. Measured on 2026-09-02 on a scratch keychain this file made:
 *
 *  - `-X <hex>` round trips a payload holding double quotes, backslashes and
 *    newlines exactly, and `-w "<escaped>"` does not: the `-i` tokenizer ends
 *    the command at the first newline and answers `unknown command`.
 *  - `-U` updates the item rather than adding a second one. One item before,
 *    one item after, and the access control list is the one the item already
 *    had. Its PLACE is not kept: Phase 281's keychain verifier measured the
 *    updated item moving behind every other item of the same service name.
 *  - a payload that is not printable comes BACK as hex from `find-generic-
 *    password -w`, which is why {@link decodeKeychainPayload} exists.
 *
 * ## WHY THE VENDOR CAN STILL READ WHAT TORTIE WROTE
 *
 * Measured against the installed claude binary, version 2.1.259, an arm64
 * Mach-O: it names `/usr/bin/security`, `find-generic-password` and
 * `add-generic-password` in its own strings. So the vendor reaches its
 * keychain item through the same program this file does, and an item whose
 * access control list trusts `/usr/bin/security` is an item the vendor reads
 * without a prompt. Nothing here ever passes `-A`, which would trust every
 * program on the machine and would be a downgrade of the person's own
 * credential.
 *
 * ## HOW THE VENDOR ADDRESSES ITS ITEM, AND WHY EVERY CALL HERE DOES THE SAME
 *
 * The same program is only half of it. Claude Code names its item by SERVICE
 * AND ACCOUNT: its read, its write over `-i`, its delete and its startup read
 * all pass `-a` with its account function `Cv` (bundle offset 170,928,749 in
 * 2.1.274) against the service `mI("-credentials")` gives, and none of them
 * asks by service alone (research 126 §2.4 and §5, and the Phase 281 spec §1).
 * Until Phase 281 every reader here asked by service alone, and on the
 * operator's machine that name matched TWO items: `security` handed back a
 * stray under another account, which gave no usable credential, while every
 * claude session read the item under his user name.
 *
 * So every function below that names a service takes the account as an
 * explicit argument, and a name in the vendor's namespace
 * (`../usage/credentials.ts`'s `isClaudeVendorService`) with no account, or
 * with an account this file will not name, is REFUSED before anything is
 * spawned. There is no lookup without `-a` to fall back to, because that
 * lookup is exactly the read that landed on the stray. Tortie's own vault
 * names are not the vendor's and pass no account, so their command lines are
 * the ones they always were.
 *
 * ## WHAT IS NEVER LOGGED
 *
 * Nothing in this file writes a log line, and no error it raises carries the
 * payload, its length or any part of it. `security` writes the item's name to
 * its own output on failure and never the secret, and even that is not
 * forwarded: a failure answers a fixed sentence naming the service.
 */

import { runGuarded } from '../proc/guarded';
import { isClaudeVendorService } from '../usage/credentials';
import { credentialsAreOpen, ownCredentialChild } from './lifecycle';
import { decodeKeychainPayload } from './security-print';

/** How long any one `security` call may take. */
export const SECURITY_TIMEOUT_MS = 10_000;

/** The program, named once. Nothing composes this from a setting. */
export const SECURITY_BIN = '/usr/bin/security';

/**
 * The seam. The gate and the tests hand in their own and touch no keychain.
 *
 * `stdin` is how the write is made: the whole command line goes over the pipe,
 * so the payload reaches no argv.
 */
export interface SecurityRunner {
  run(
    argv: readonly string[],
    stdin?: string
  ): Promise<{ code: number; stdout: string }>;
}

let calls = 0;

/**
 * How many times the real `security` has been run by this process. A number
 * for a boot line and nothing else; nothing about any call is kept.
 */
export function securityCallCount(): number {
  return calls;
}

/**
 * A keychain file path this file will append to a `security` command line.
 *
 * It goes inside double quotes in the `-i` form, so the same three characters
 * {@link isPlainSecurityName} refuses are refused here, and a relative path is
 * refused because `security` would resolve it against a directory this process
 * did not choose.
 */
export function isPlainKeychainPath(path: string): boolean {
  if (typeof path !== 'string' || path === '') return false;
  if (!path.startsWith('/')) return false;
  if (path.length > 1024) return false;
  return !/["\\\n\r]/.test(path);
}

/**
 * The real `security`, over the login keychain, or over ONE keychain file.
 *
 * `keychainFile` is the Phase 208 harness seam. MEASURED on 2026-09-03 on a
 * scratch keychain made with `security create-keychain` under a scratch
 * directory and never added to the search list: every verb this file uses,
 * being `find-generic-password`, `delete-generic-password` and the
 * `add-generic-password` line sent over `-i`, takes a trailing keychain path
 * and acts on that keychain alone. With the path given, an item written was
 * found by name in the scratch keychain and NOT found in the login keychain,
 * `-U` still updated in place leaving one item, `-w` printed the payload back
 * exactly, and `delete-keychain` removed the file. So a launch that carries the
 * seam never reads, writes or deletes an item in the person's own keychain,
 * whatever names it composes. The shipped app passes nothing here.
 */
export function defaultSecurityRunner(
  keychainFile?: string,
  /**
   * PHASE 220. The program, so a test can drive the SHIPPING runner over a
   * child of its own that never exits, which is the only way to prove the
   * cancel really ends something. It defaults to {@link SECURITY_BIN}, no
   * shipping caller passes it, and nothing a person or an agent can write
   * reaches this argument. `../usage/credentials.ts` takes the same seam for
   * the same reason and says so in the same words.
   */
  bin: string = SECURITY_BIN
): SecurityRunner {
  const file =
    keychainFile !== undefined && isPlainKeychainPath(keychainFile)
      ? keychainFile
      : null;
  if (keychainFile !== undefined && file === null) {
    throw new Error('the keychain file for security is not a path this domain will name');
  }
  return {
    run: async (argv, stdin) => {
      // PHASE 220. NO NEW CHILD AFTER ADMISSION CLOSES. A call that arrives
      // during the quit answers the way a `security` that found nothing
      // answers, which every caller in this domain already treats as "no item"
      // or as a refusal, so nothing has to learn a new failure.
      if (!credentialsAreOpen()) return { code: 1, stdout: '' };
      calls += 1;
      const line = [...argv];
      let input = stdin;
      if (file !== null) {
        if (argv[0] === '-i') {
          // THE COMMAND IS ON STDIN, so the keychain goes on the end of it,
          // inside the same quotes the service and the account already use.
          input =
            stdin === undefined
              ? undefined
              : `${stdin.replace(/\n$/, '')} "${file}"\n`;
        } else {
          line.push(file);
        }
      }
      // PHASE 220. THROUGH `../proc/guarded` RATHER THAN A BARE `execFile`.
      // This was the one child in the product that nothing could reach: not
      // `reapGuardedChildren()` at quit, and not this domain's own disposer,
      // which did not exist. `runGuarded` puts it in the same registry every
      // other guarded child is in, always settles inside its deadline, and
      // takes an abort signal so {@link joinCredentialShutdown} can end it at
      // its own point. The argv is the same argv, the deadline is the same ten
      // seconds, and the payload still goes over stdin and reaches no command
      // line.
      const child = ownCredentialChild();
      try {
        const run = await runGuarded(bin, line, {
          timeoutMs: SECURITY_TIMEOUT_MS,
          maxOutputBytes: 4 * 1024 * 1024,
          cancel: child.signal,
          ...(input === undefined ? {} : { stdin: input })
        });
        if (run.spawnError !== null || run.timedOut || run.cancelled) {
          return { code: 1, stdout: '' };
        }
        return { code: run.code === 0 ? 0 : 1, stdout: run.stdout };
      } finally {
        child.done();
      }
    }
  };
}

/**
 * A name this file will put inside double quotes in a `security -i` command.
 *
 * The tokenizer understands double quotes with backslash escapes and ends the
 * command at a newline, so a name holding a quote, a backslash or a newline
 * could change what command runs. Every name Tortie composes is a service name
 * or an account name it minted or read back from an item it owns, so this is a
 * refusal rather than an escaping problem, and refusing is the safe half.
 */
export function isPlainSecurityName(name: string): boolean {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > 200) return false;
  return /^[A-Za-z0-9 ._@+-]+$/.test(name);
}

/**
 * What `find-generic-password -w` printed, as the bytes the item holds. It
 * lives in `./security-print.ts` since Phase 281, which imports nothing, so
 * the usage reader can decode without importing this file: this file asks
 * `../usage/credentials.ts` which names are the vendor's, and each importing
 * the other would be a runtime cycle. Re-exported here, beside the runner whose
 * output it reads.
 */
export { decodeKeychainPayload } from './security-print';

/**
 * The `-a` and `-s` half of a command line for one item, or null for an item
 * this file refuses to name (Phase 281).
 *
 * A VENDOR NAME WITHOUT AN ACCOUNT IS REFUSED, FAIL CLOSED. `null`, `''`, an
 * account {@link isPlainSecurityName} refuses, and `undefined` all refuse it,
 * the last because an untyped build probe can still call with two arguments
 * and must reach no lookup by service alone that way either. A name that is
 * not the vendor's with no account keeps the `-s` form it always had, which is
 * what Tortie's own vault names send. An account, when there is one, goes
 * BEFORE `-s`, in the order Claude Code's own argv uses and the one
 * {@link keychainWrite}'s `-i` line already had.
 */
function itemAddress(
  service: string,
  account: string | null | undefined
): readonly string[] | null {
  if (!isPlainSecurityName(service)) return null;
  if (account === null || account === undefined) {
    return isClaudeVendorService(service) ? null : ['-s', service];
  }
  if (!isPlainSecurityName(account)) return null;
  return ['-a', account, '-s', service];
}

/**
 * The item's payload, or null when there is no such item.
 *
 * `account` is REQUIRED and admits null so every call site states it: the
 * vendor's account for a vendor name, and null for Tortie's own names.
 */
export async function keychainRead(
  runner: SecurityRunner,
  service: string,
  account: string | null
): Promise<string | null> {
  const address = itemAddress(service, account);
  if (address === null) return null;
  const { code, stdout } = await runner.run([
    'find-generic-password',
    ...address,
    '-w'
  ]);
  if (code !== 0) return null;
  const payload = decodeKeychainPayload(stdout);
  return payload === '' ? null : payload;
}

/**
 * The item's `acct` attribute, or null. Asks for ATTRIBUTES and never `-w`.
 *
 * Asked with `-a` for a vendor name, so what it answers is that account read
 * back from the item it names, or null when no item under that account exists.
 * It no longer tells Tortie which account to write under: that is the vendor's
 * rule, never whatever item a name happened to match (Phase 281).
 */
export async function keychainAccount(
  runner: SecurityRunner,
  service: string,
  account: string | null
): Promise<string | null> {
  const address = itemAddress(service, account);
  if (address === null) return null;
  const { code, stdout } = await runner.run(['find-generic-password', ...address]);
  if (code !== 0) return null;
  const found = /"acct"<blob>="([^"\n]*)"/.exec(stdout);
  return found === null || found[1] === undefined || found[1] === ''
    ? null
    : found[1];
}

/**
 * The item's `mdat` attribute, being when it was last written, or null.
 * Asks for ATTRIBUTES and never `-w` (Phase 211 fix round).
 *
 * IT EXISTS FOR THE KEYCHAIN BACKSTOP. The first build fingerprinted the
 * `acct` attribute, which the vendor sets to `USER`, else the user name, else
 * `claude-code-user` (`Cv` at bundle offset 170,928,749 in 2.1.274), and
 * never changes on a sign in, so a credential rewritten with no file moving
 * never moved the fingerprint and the backstop could not see the one thing it
 * exists for. The modification date moves on every write and is an attribute
 * like any other.
 */
export async function keychainModified(
  runner: SecurityRunner,
  service: string,
  account: string | null
): Promise<string | null> {
  const address = itemAddress(service, account);
  if (address === null) return null;
  const { code, stdout } = await runner.run(['find-generic-password', ...address]);
  if (code !== 0) return null;
  const found = /"mdat"<timedate>=0x[0-9A-Fa-f]+\s+"([^"\n]*)"/.exec(stdout);
  return found === null || found[1] === undefined || found[1] === ''
    ? null
    : found[1];
}

/**
 * Does the item at this service, and this account when one is given, exist?
 * Attributes only, no payload.
 */
export async function keychainHasItem(
  runner: SecurityRunner,
  service: string,
  account: string | null
): Promise<boolean> {
  const address = itemAddress(service, account);
  if (address === null) return false;
  const { code } = await runner.run(['find-generic-password', ...address]);
  return code === 0;
}

/**
 * Write one item, updating in place when it is already there.
 *
 * THE PAYLOAD GOES OVER STDIN AS HEX and reaches no argv. `-U` is what makes
 * this an update rather than a second item beside the first.
 */
export async function keychainWrite(
  runner: SecurityRunner,
  service: string,
  account: string,
  payload: string
): Promise<boolean> {
  if (!isPlainSecurityName(service)) return false;
  if (!isPlainSecurityName(account)) return false;
  if (payload === '') return false;
  const hex = Buffer.from(payload, 'utf8').toString('hex');
  const command = `add-generic-password -U -a "${account}" -s "${service}" -X "${hex}"\n`;
  const { code } = await runner.run(['-i'], command);
  return code === 0;
}

/**
 * Remove one item, and SAY WHETHER IT WENT (Phase 219).
 *
 * It answered `void` until Phase 219, so every caller that counted a delete
 * counted the ASKING rather than the doing: a runner answering `security`'s
 * exit 44 to all six deletes of a migration still left `{deleted: 2}` in the
 * result and both old items on the machine. True means `security` exited 0.
 * Anything else, including the 44 it uses for an item it could not find, is
 * false, because every caller here reads the item first and a thing that was
 * there a moment ago and cannot now be found is an anomaly worth counting
 * rather than a tidy no-op. A name this module refuses is never asked at all,
 * which is a refusal and so also false.
 *
 * A vendor name is deleted under the vendor's account and no other (Phase
 * 281): `delete-generic-password -s` alone removes the FIRST item the name
 * matches, and on the operator's machine that is a stray under another
 * account, which nothing in Tortie may remove.
 */
export async function keychainDelete(
  runner: SecurityRunner,
  service: string,
  account: string | null
): Promise<boolean> {
  const address = itemAddress(service, account);
  if (address === null) return false;
  const { code } = await runner.run(['delete-generic-password', ...address]);
  return code === 0;
}
