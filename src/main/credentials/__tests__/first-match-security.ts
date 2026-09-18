/**
 * THE FIRST-MATCH `security` (Phase 281), the one model of the keychain both
 * domains' Phase 281 tests run the shipping code over.
 *
 * Research 126 §2.4 measured it and §8.10 drove it: `security` answers a lookup
 * with the FIRST item matching everything the lookup named. On the operator's
 * machine a stray item under another account sat before Claude Code's own
 * under the same service name, so a lookup by service alone landed on the
 * stray. Section 8.4 calls the order undocumented, which is why a test places
 * the stray FIRST: a reader that is right only because of the order would
 * pass a model that put the vendor row first.
 *
 * The model, over rows kept in order:
 *
 *  - `find-generic-password` answers the first row whose service matches and,
 *    when `-a` was given, whose account matches too. `-w` prints the payload
 *    and one newline, AS HEX when the payload holds any byte outside
 *    0x20–0x7E (`securityPrintsRaw`, the one predicate the shipping decoder
 *    reads too; measured in Phase 281.1, a tab or any non-ASCII character
 *    prints hex, which the Phase 281 model got wrong and no test could see);
 *    without `-w`, the attribute lines the credentials domain parses (`acct`,
 *    and `mdat` when the row carries one).
 *  - `delete-generic-password` removes the first row matching the same way.
 *    `-w` on a delete is a malformed call.
 *  - the `-i` add line updates the row matching service AND account, or
 *    appends one, stamping `mdat` from a clock this runner owns. AN UPDATE
 *    MOVES THE ROW TO THE BACK. The Phase 281 keychain verifier measured the
 *    real `/usr/bin/security` on a scratch keychain: a lookup by service alone
 *    answers in creation order, and `add-generic-password -U` of an existing
 *    item keeps one item but moves it behind every other item of the same
 *    service name. An in-place model predicted the wrong first match after
 *    any write. It also explains the operator's machine: every Claude Code
 *    refresh is an `add -U` of its own item, which put it back behind the
 *    stray each time.
 *  - no match is exit 44, errSecItemNotFound. Any flag it does not know, and a
 *    call with no `-s`, is exit 1, so a malformed argv never looks like a miss.
 *
 * `answer` is the model called directly, so a test can ask what a command line
 * the shipping code no longer sends (the parent's service-only form) would
 * have got. `run` is the same model behind the `SecurityRunner` seam, and every
 * call it is handed is recorded in `sent` in order.
 *
 * NOTHING HERE SPAWNS, OPENS A KEYCHAIN OR READS THE MACHINE. Every row a test
 * seeds is synthetic.
 */

import type { SecurityRunner } from '../security';
import { securityPrintsRaw } from '../security-print';

/** One keychain item, in the order `security` would meet it. */
export interface KeychainRow {
  service: string;
  account: string;
  payload: string;
  /** The modification date `keychainModified` reads, as `security` prints it. */
  mdat?: string;
}

/** One call the runner was handed. */
export interface SentCall {
  argv: string[];
  stdin?: string;
}

/** The one `-i` line the credentials domain writes, as `keychainWrite` composes it. */
export const ADD_LINE = /^add-generic-password -U -a "([^"]*)" -s "([^"]*)" -X "([0-9a-f]*)"\n$/;

export interface FirstMatchSecurity extends SecurityRunner {
  sent: SentCall[];
  answer(argv: readonly string[], stdin?: string): { code: number; stdout: string };
}

export function firstMatchSecurity(rows: KeychainRow[]): FirstMatchSecurity {
  const sent: SentCall[] = [];
  let clock = 0;
  const stamp = (): string => {
    clock += 1;
    return `20260917${String(clock).padStart(6, '0')}Z`;
  };
  const find = (service: string, account: string | null): number =>
    rows.findIndex((r) => r.service === service && (account === null || r.account === account));
  const attributes = (row: KeychainRow): string => {
    const lines = [
      'keychain: "/p281-scratch.keychain-db"',
      'class: "genp"',
      'attributes:',
      `    "acct"<blob>="${row.account}"`
    ];
    if (row.mdat !== undefined) {
      // The date and its NUL terminator, which `security` prints as hex first.
      const hex = Buffer.concat([Buffer.from(row.mdat, 'utf8'), Buffer.alloc(1)])
        .toString('hex')
        .toUpperCase();
      lines.push(`    "mdat"<timedate>=0x${hex}  "${row.mdat}\\000"`);
    }
    lines.push(`    "svce"<blob>="${row.service}"`);
    return `${lines.join('\n')}\n`;
  };

  const answer = (
    argv: readonly string[],
    stdin?: string
  ): { code: number; stdout: string } => {
    if (argv[0] === '-i') {
      const line = ADD_LINE.exec(stdin ?? '');
      if (line === null) return { code: 1, stdout: '' };
      const account = line[1] ?? '';
      const service = line[2] ?? '';
      const payload = Buffer.from(line[3] ?? '', 'hex').toString('utf8');
      const at = find(service, account);
      const existing = at < 0 ? undefined : rows[at];
      // AN UPDATE MOVES THE ITEM TO THE BACK, as the real program was measured
      // to: still one item, but behind every other item of its name.
      if (existing !== undefined) rows.splice(at, 1);
      rows.push({ ...existing, service, account, payload, mdat: stamp() });
      return { code: 0, stdout: '' };
    }
    let service: string | null = null;
    let account: string | null = null;
    let wantsPayload = false;
    for (let i = 1; i < argv.length; i += 1) {
      const flag = argv[i];
      if (flag === '-s') service = argv[(i += 1)] ?? null;
      else if (flag === '-a') account = argv[(i += 1)] ?? null;
      else if (flag === '-w') wantsPayload = true;
      else return { code: 1, stdout: '' };
    }
    if (service === null) return { code: 1, stdout: '' };
    const at = find(service, account);
    const row = at < 0 ? undefined : rows[at];
    if (argv[0] === 'find-generic-password') {
      if (row === undefined) return { code: 44, stdout: '' };
      if (!wantsPayload) return { code: 0, stdout: attributes(row) };
      // The real program's printing: raw only when every byte is 0x20–0x7E,
      // lowercase hex otherwise (Phase 281.1).
      const body = securityPrintsRaw(row.payload)
        ? row.payload
        : Buffer.from(row.payload, 'utf8').toString('hex');
      return { code: 0, stdout: `${body}\n` };
    }
    if (argv[0] === 'delete-generic-password') {
      if (wantsPayload) return { code: 1, stdout: '' };
      if (row === undefined) return { code: 44, stdout: '' };
      rows.splice(at, 1);
      return { code: 0, stdout: '' };
    }
    return { code: 1, stdout: '' };
  };

  return {
    sent,
    answer,
    run: async (argv, stdin) => {
      sent.push(stdin === undefined ? { argv: [...argv] } : { argv: [...argv], stdin });
      return answer(argv, stdin);
    }
  };
}
