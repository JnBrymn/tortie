/**
 * The env-watch seed's two refusals (Phase 276).
 *
 * The seed opens `fs.watch` handles on the person's home directory and starts
 * a login shell, so a `GMUX_ENV_WATCH_SEED` left in a shell profile must never
 * reach a real launch, and a harness launch on a REAL profile must be refused
 * even with `GMUX_SHOT` set. Both refusals are the shared `seedRefusal`, and
 * this suite drives them the way `arch-seed.test.ts` drives that seed's, so
 * the sixth seed cannot be the one that quietly spells them differently.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { envWatchSeedRefusal } from '../env-watch-seed';

let harnessDir = '';
let profileDir = '';
let realProfile = '';

beforeEach(() => {
  harnessDir = mkdtempSync(join(tmpdir(), 'gmux-envwatch-seed-harness-'));
  profileDir = join(harnessDir, 'profile');
  mkdirSync(profileDir, { recursive: true });
  realProfile = mkdtempSync(join(tmpdir(), 'gmux-envwatch-seed-real-'));
});

afterEach(() => {
  rmSync(harnessDir, { recursive: true, force: true });
  rmSync(realProfile, { recursive: true, force: true });
});

function env(over: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    GMUX_ENV_WATCH_SEED: '1',
    GMUX_SHOT: '/tmp/shot.png',
    GMUX_HARNESS_DIR: harnessDir,
    ...over
  };
}

describe('envWatchSeedRefusal', () => {
  it('allows an isolated launch on a profile under the harness directory', () => {
    expect(envWatchSeedRefusal(env(), profileDir)).toBeNull();
  });

  it('allows a smoke launch the same way', () => {
    const e = env();
    delete e['GMUX_SHOT'];
    e['GMUX_SMOKE'] = 'basic';
    expect(envWatchSeedRefusal(e, profileDir)).toBeNull();
  });

  it('refuses a launch that is not isolated, even with the harness directory set', () => {
    const e = env();
    delete e['GMUX_SHOT'];
    expect(envWatchSeedRefusal(e, profileDir)).toMatch(
      /not an isolated harness launch/
    );
  });

  it('names its own variable in the refusal', () => {
    const e = env();
    delete e['GMUX_SHOT'];
    expect(envWatchSeedRefusal(e, profileDir)).toMatch(/^GMUX_ENV_WATCH_SEED /);
  });

  it('refuses a profile outside the harness directory', () => {
    expect(envWatchSeedRefusal(env(), realProfile)).toMatch(/could be a real profile/);
  });

  it('refuses when no harness directory was handed over', () => {
    const e = env();
    delete e['GMUX_HARNESS_DIR'];
    expect(envWatchSeedRefusal(e, profileDir)).toMatch(/could be a real profile/);
  });

  it('refuses a sibling whose name merely starts with the harness directory', () => {
    const sibling = `${harnessDir}-elsewhere`;
    mkdirSync(sibling, { recursive: true });
    try {
      expect(envWatchSeedRefusal(env(), sibling)).toMatch(/could be a real profile/);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });
});
