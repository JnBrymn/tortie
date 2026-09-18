/**
 * Phase 281.1. A `-i` line `security` would cut is never sent.
 *
 * MEASURED (2026-09-17, twice, scratch keychain under a scratch HOME with no
 * default keychain): an `add-generic-password` line of 3,995 characters writes
 * and reads back exactly, and one of 4,195 characters writes nothing to the
 * keychain named at its end and holds `security -i` until it is killed. The
 * cut end is the keychain suffix a harness runner appends, so a long payload
 * would have aimed a harness write at the default keychain. Two refusals now
 * stand before the spawn, and each is driven here over a runner or a program
 * of this file's own: no `/usr/bin/security` runs, no keychain is opened.
 *
 *  1. `keychainWrite` answers false for a command line over
 *     `SECURITY_LINE_MAX` and never calls its runner.
 *  2. `defaultSecurityRunner` with a keychain file answers exit 1 for an `-i`
 *     input whose suffix takes it over the cap, and spawns nothing; under the
 *     cap it spawns the program with the suffixed line on stdin.
 */

import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  defaultSecurityRunner,
  keychainWrite,
  SECURITY_LINE_MAX,
  type SecurityRunner
} from '../security';

const scratch = mkdtempSync(join(tmpdir(), 'p2811-line-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const SERVICE = 'Tortie-credentials-p2811.line';
const ACCOUNT = 'p281-vendor';
const HEAD = `add-generic-password -U -a "${ACCOUNT}" -s "${SERVICE}" -X "`;

/** A payload whose composed `-i` line, newline included, is exactly `chars` long. */
function payloadForLine(chars: number): string {
  const hexChars = chars - HEAD.length - '"\n'.length;
  expect(hexChars % 2).toBe(0);
  return 'x'.repeat(hexChars / 2);
}

function recording(): SecurityRunner & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    run: async (_argv, stdin) => {
      lines.push(stdin ?? '');
      return { code: 0, stdout: '' };
    }
  };
}

describe('Phase 281.1: keychainWrite refuses a line security would cut', () => {
  it('sends a line of exactly SECURITY_LINE_MAX characters and refuses one character more', async () => {
    const at = recording();
    expect(await keychainWrite(at, SERVICE, ACCOUNT, payloadForLine(SECURITY_LINE_MAX))).toBe(true);
    expect(at.lines.length).toBe(1);
    expect(at.lines[0]?.length).toBe(SECURITY_LINE_MAX);

    const over = recording();
    expect(await keychainWrite(over, SERVICE, ACCOUNT, payloadForLine(SECURITY_LINE_MAX + 2))).toBe(false);
    expect(over.lines).toEqual([]);
  });

  it('the cap sits under the measured cut and above the measured pass', () => {
    // 3,995 wrote and read back; 4,195 was cut and hung. Both measured twice.
    expect(SECURITY_LINE_MAX).toBeGreaterThanOrEqual(3_995);
    expect(SECURITY_LINE_MAX).toBeLessThan(4_123);
  });
});

describe('Phase 281.1: the real runner refuses an -i line its keychain suffix takes over the cap', () => {
  const program = join(scratch, 'security');
  const record = join(scratch, 'stdin');
  writeFileSync(program, `#!/bin/sh\ncat > "${record}"\nexit 0\n`, 'utf8');
  chmodSync(program, 0o755);
  const keychainFile = join(scratch, 'p2811-scratch.keychain-db');
  const suffix = ` "${keychainFile}"\n`;

  it('answers exit 1 and spawns nothing when the suffixed line is over the cap', async () => {
    const runner = defaultSecurityRunner(keychainFile, program);
    // Under the cap on its own, over it once the suffix is appended.
    const bare = `${HEAD}${'ab'.repeat((SECURITY_LINE_MAX - HEAD.length - 2 - 2) / 2)}"\n`;
    expect(bare.length).toBeLessThanOrEqual(SECURITY_LINE_MAX);
    expect(bare.length - 1 + suffix.length).toBeGreaterThan(SECURITY_LINE_MAX);
    expect(await runner.run(['-i'], bare)).toEqual({ code: 1, stdout: '' });
    expect(existsSync(record)).toBe(false);
  });

  it('spawns the program with the suffixed line when it fits', async () => {
    const runner = defaultSecurityRunner(keychainFile, program);
    const bare = `${HEAD}${'ab'.repeat(8)}"\n`;
    expect(await runner.run(['-i'], bare)).toEqual({ code: 0, stdout: '' });
    expect(readFileSync(record, 'utf8')).toBe(`${bare.replace(/\n$/, '')}${suffix}`);
  });
});
