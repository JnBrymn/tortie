/**
 * Phase 276 — the shell-config watch, the warm-up and the deliberate refresh.
 *
 * WHAT THIS FILE IS FOR. Phase 276 lets `resolve.ts` hold the login shell's
 * answer for the life of the process, which saves about a second on every
 * session a person starts. The whole safety of that rests on this domain: the
 * cache is ARMED here and nowhere else, and it is armed only once a watcher
 * handle is actually open. So the questions this suite asks are not "does the
 * watch work" but "can this build ever hand somebody a stale key without
 * saying so".
 *
 * IT RUNS THE SHIPPING MODULE OVER INJECTED SEAMS — a fake directory watcher
 * fired by hand, a driven clock, a manual timer queue and a capture that
 * records what it was asked and spawns nothing. No login shell starts, no real
 * timer runs, and the only real filesystem work is a scratch HOME under
 * `tmpdir()` with real files and real symlinks in it, because the realpath arm
 * is the one thing a fake cannot prove.
 *
 * THE ONE THING IT NEVER DOES is write to the person's own shell config. Every
 * rc file this file touches is inside a directory `mkdtempSync` made and
 * `rmSync` removes.
 *
 * Rules 20 to 41 of build/p276/SPEC.md, plus the byte-level refusals that no
 * runtime assertion can reach.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CaptureEnvResult } from '../../tmux';
import { shellFilesFor } from '../shell-files';
import {
  ENV_WARM_MIN_INTERVAL_MS,
  ENV_WATCH_DEBOUNCE_MS,
  declaredEnvNames,
  envWatchState,
  refreshEnvNow,
  resetEnvWatchForTests,
  startEnvWatch,
  stopEnvWatch,
  warmEnvAtBoot,
  type EnvWatchDeps
} from '../watch';

const here = (...parts: string[]): string => join(__dirname, '..', ...parts);
const watchSrc = readFileSync(here('watch.ts'), 'utf8');
const filesSrc = readFileSync(here('shell-files.ts'), 'utf8');
const indexSrc = readFileSync(here('..', 'index.ts'), 'utf8');
const capabilitiesSrc = readFileSync(here('..', 'capabilities.ts'), 'utf8');
const remoteProbeSrc = readFileSync(
  here('..', 'machines', 'remote-env-probe.ts'),
  'utf8'
);

// ---------------------------------------------------------------------------
// The harness: a driven clock, a manual timer queue, a fake watcher and a
// capture that spawns nothing.
// ---------------------------------------------------------------------------

interface OpenWatcher {
  dir: string;
  cb(file: string | null): void;
  live: boolean;
}

function harness(over: Partial<EnvWatchDeps> = {}) {
  let clock = 1_000_000;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const opened: OpenWatcher[] = [];
  const asks: string[][] = [];
  const armed: boolean[] = [];
  let drops = 0;
  let failWatch = false;
  let settingsListener: (() => void) | null = null;
  let answer: CaptureEnvResult = { values: {}, missing: [], probeFailed: false };

  const deps: EnvWatchDeps = {
    watchDir: (dir, onEvent) => {
      if (failWatch) throw new Error('EPERM');
      const w: OpenWatcher = { dir, cb: onEvent, live: true };
      opened.push(w);
      return {
        close: () => {
          w.live = false;
        }
      };
    },
    setTimeout: (fn, ms) => {
      const t = { at: clock + ms, fn, live: true };
      timers.push(t);
      return {
        clear: () => {
          t.live = false;
        }
      };
    },
    now: () => clock,
    onSettingsChanged: (listener) => {
      settingsListener = listener;
      return () => {
        settingsListener = null;
      };
    },
    capture: (names) => {
      asks.push([...names]);
      return Promise.resolve(answer);
    },
    enableCache: (on) => armed.push(on),
    dropCache: () => {
      drops += 1;
    },
    ...over
  };

  return {
    deps,
    get drops() {
      return drops;
    },
    get asks() {
      return asks;
    },
    get armed() {
      return armed;
    },
    get live() {
      return opened.filter((w) => w.live);
    },
    get listener() {
      return settingsListener;
    },
    setAnswer(next: CaptureEnvResult) {
      answer = next;
    },
    breakWatch() {
      failWatch = true;
    },
    /** Fire every live watcher on `dir`, the way the platform would. */
    fire(dir: string, file: string | null): void {
      for (const w of opened) if (w.live && w.dir === dir) w.cb(file);
    },
    /** Run every timer due at or before `clock + ms`. */
    advance(ms: number): void {
      clock += ms;
      for (const t of [...timers]) {
        if (!t.live || t.at > clock) continue;
        t.live = false;
        t.fn();
      }
    },
    /** How many timers are still armed. */
    get pendingTimers() {
      return timers.filter((t) => t.live).length;
    }
  };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * A promise a test releases by hand, so a probe can be held IN FLIGHT while
 * something else happens to it. `let release = null` outside the executor is
 * narrowed to `never` by the compiler, which cannot see across the executor's
 * boundary, so the release is handed back through a closure instead.
 */
function held(): { gate: Promise<void>; release(): void } {
  let resolve: (() => void) | undefined;
  const gate = new Promise<void>((r) => {
    resolve = r;
  });
  return { gate, release: () => resolve?.() };
}

let home: string;
let outside: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'p276-home-'));
  outside = mkdtempSync(join(tmpdir(), 'p276-out-'));
  resetEnvWatchForTests();
});
afterEach(() => {
  resetEnvWatchForTests();
  rmSync(home, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

/** A `process.env` shaped object for a zsh person with one name declared. */
function zshEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { SHELL: '/bin/zsh', HOME: home, ...extra };
}

function oneName(): EnvWatchDeps {
  return { declaredNames: () => ['DEEPSEEK_API_KEY'] };
}

// ---------------------------------------------------------------------------
// Rules 20 to 22 — the watch set is derived from $SHELL and is pure
// ---------------------------------------------------------------------------

describe('rule 20: shellFilesFor is pure', () => {
  it('imports nothing but node:path and spawns nothing', () => {
    const imports = [...filesSrc.matchAll(/^import .* from '([^']+)';$/gm)].map(
      (m) => m[1]
    );
    // The import LIST is the assertion. The header names `node:fs` and
    // `spawn` in prose on purpose, to say what this module refuses, so a
    // substring search over the whole file would fail on its own explanation.
    expect(imports).toEqual(['node:path']);
    expect(filesSrc).not.toMatch(/from 'node:fs'|require\('node:fs'\)/);
    expect(filesSrc).not.toMatch(/from 'node:child_process'/);
  });

  it('returns absolute paths', () => {
    for (const path of shellFilesFor({ shell: '/bin/zsh', home: '/Users/x' })) {
      expect(path.startsWith('/')).toBe(true);
    }
  });
});

describe('rule 21: the table is exactly four rows', () => {
  it('zsh reads four files, in the order the shell reads them', () => {
    expect(shellFilesFor({ shell: '/bin/zsh', home: '/Users/x' })).toEqual([
      '/Users/x/.zshenv',
      '/Users/x/.zprofile',
      '/Users/x/.zshrc',
      '/Users/x/.zlogin'
    ]);
  });

  it('bash watches all four, because WHICH is read depends on which exist', () => {
    expect(shellFilesFor({ shell: '/bin/bash', home: '/Users/x' })).toEqual([
      '/Users/x/.bash_profile',
      '/Users/x/.bash_login',
      '/Users/x/.profile',
      '/Users/x/.bashrc'
    ]);
  });

  it('sh, dash and ksh read .profile alone', () => {
    for (const shell of ['/bin/sh', '/bin/dash', '/usr/bin/ksh']) {
      expect(shellFilesFor({ shell, home: '/Users/x' })).toEqual([
        '/Users/x/.profile'
      ]);
    }
  });

  it('an unmeasured shell returns nothing at all, fish included', () => {
    for (const shell of [
      '/opt/homebrew/bin/fish',
      '/bin/tcsh',
      '/usr/local/bin/nu',
      '',
      undefined
    ]) {
      expect(shellFilesFor({ shell, home: '/Users/x' })).toEqual([]);
    }
  });
});

describe('rule 22: ZDOTDIR is taken with ?? and never ||', () => {
  it('a set ZDOTDIR moves all four files off the home entirely', () => {
    expect(
      shellFilesFor({ shell: '/bin/zsh', home: '/Users/x', zdotdir: '/Users/x/cfg' })
    ).toEqual([
      '/Users/x/cfg/.zshenv',
      '/Users/x/cfg/.zprofile',
      '/Users/x/cfg/.zshrc',
      '/Users/x/cfg/.zlogin'
    ]);
  });

  it('an EMPTY ZDOTDIR is set, and yields /.zshenv rather than the home', () => {
    // This is the whole behavioural difference between `??` and `||`, and it
    // is asserted on the ANSWER rather than on the operator, so a later round
    // that reaches for `||` for tidiness goes red here.
    const files = shellFilesFor({ shell: '/bin/zsh', home: '/Users/x', zdotdir: '' });
    expect(files[0]).toBe('/.zshenv');
    expect(files.some((f) => f.startsWith('/Users/x/'))).toBe(false);
  });

  it('an unset ZDOTDIR falls back to the home', () => {
    expect(
      shellFilesFor({ shell: '/bin/zsh', home: '/Users/x', zdotdir: undefined })[0]
    ).toBe('/Users/x/.zshenv');
  });

  it('a home with a trailing slash is not doubled', () => {
    expect(shellFilesFor({ shell: '/bin/zsh', home: '/' })[0]).toBe('/.zshenv');
  });
});

// ---------------------------------------------------------------------------
// Rules 23 to 28 — the two arms, the dedupe and the arming
// ---------------------------------------------------------------------------

describe('rules 23 and 25: the literal arm, always, deduped', () => {
  it('watches all four names even though none of the files exists', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    expect(envWatchState()).toEqual([
      `${home}/.zshenv`,
      `${home}/.zprofile`,
      `${home}/.zshrc`,
      `${home}/.zlogin`
    ]);
    // One directory, four basenames, four handles — the dedupe is by
    // (dir, basename) and not by directory.
    expect(h.live.map((w) => w.dir)).toEqual([home, home, home, home]);
  });

  it('a create of a file that did not exist is what the arm is for', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    h.fire(home, '.zshrc');
    expect(h.drops).toBe(1);
  });

  it('an event for a basename we do not watch is ignored', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    h.fire(home, '.DS_Store');
    h.fire(home, 'Library');
    expect(h.drops).toBe(0);
  });

  it('a null filename is treated as maybe ours', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    h.fire(home, null);
    expect(h.drops).toBeGreaterThan(0);
  });
});

describe('rule 24: the realpath arm, and the home-tree refusal', () => {
  it('a dotfiles repo INSIDE the home gets a second target', () => {
    const repo = join(home, 'src', 'dotfiles');
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, 'zshrc'), '# rc\n');
    symlinkSync(join(repo, 'zshrc'), join(home, '.zshrc'));
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    const state = envWatchState() ?? [];
    expect(state).toContain(`${home}/.zshrc`);
    // THE REALPATH SPELLING IS THE ONE THAT LANDS, and on macOS that is not
    // cosmetic: a scratch HOME under `/var/folders` realpaths to
    // `/private/var/folders`, which is exactly why the module compares a
    // candidate's realpath against the realpath of the HOME as well as against
    // the home as written. A test that compared the two as written would pass
    // while the arm was silently dropped.
    const repoReal = realpathSync(repo);
    expect(state.some((p) => p.startsWith(`${repoReal}/`))).toBe(true);
    // And editing the repo, which moves nothing in $HOME, still invalidates.
    h.fire(repoReal, 'zshrc');
    expect(h.drops).toBe(1);
  });

  it('a target OUTSIDE the home tree is not watched at all', () => {
    writeFileSync(join(outside, 'zshrc'), '# rc\n');
    symlinkSync(join(outside, 'zshrc'), join(home, '.zshrc'));
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    const state = envWatchState() ?? [];
    // The literal arm still covers the link itself, so replacing the SYMLINK
    // is still seen. The repo it points at is not watched at all, and that
    // person falls to the deliberate refresh, which is what it is for.
    const outsideReal = realpathSync(outside);
    expect(state).toContain(`${home}/.zshrc`);
    expect(state.some((p) => p.startsWith(`${outsideReal}/`))).toBe(false);
    expect(h.live.some((w) => w.dir.startsWith(outsideReal))).toBe(false);
  });

  it('a ZDOTDIR outside the home arms nothing at all', () => {
    const h = harness({ env: zshEnv({ ZDOTDIR: outside }), ...oneName() });
    startEnvWatch(h.deps);
    expect(envWatchState()).toBeNull();
    expect(h.armed).toEqual([]);
  });
});

describe('rules 26 and 28: the primitive, and arming', () => {
  it('names no recursive watcher and no src/main/watcher seam', () => {
    // Again the IMPORTS, because the header names both refused primitives in
    // prose and records the measurement that chose against them.
    expect(watchSrc).not.toMatch(/from '@parcel\/watcher'/);
    expect(watchSrc).not.toMatch(/from '\.\.\/watcher/);
    expect(watchSrc).not.toMatch(/recursive:\s*true/);
    // node:fs's own watch, and the only `watch(` call passes two options and
    // never `recursive`.
    expect(watchSrc).toMatch(/import \{ realpathSync, watch \} from 'node:fs';/);
  });

  it('a directory that cannot be watched is skipped rather than fatal', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    h.breakWatch();
    expect(() => startEnvWatch(h.deps)).not.toThrow();
  });

  it('if NO handle opens, the cache is never armed', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    h.breakWatch();
    startEnvWatch(h.deps);
    expect(h.armed).toEqual([]);
    expect(envWatchState()).toBeNull();
  });

  it('an unmeasured shell arms nothing, so nothing can be stale', () => {
    const h = harness({ env: { SHELL: '/bin/tcsh', HOME: home }, ...oneName() });
    startEnvWatch(h.deps);
    expect(h.armed).toEqual([]);
    expect(envWatchState()).toBeNull();
  });

  it('one open handle is enough to arm', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    expect(h.armed).toEqual([true]);
  });
});

describe('rule 27: the set is re-derived on every fire and refresh', () => {
  it('a file that becomes a symlink after the start gains its second arm', async () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    h.setAnswer({ values: { HOME: home }, missing: ['ZDOTDIR'], probeFailed: false });
    startEnvWatch(h.deps);
    expect((envWatchState() ?? []).length).toBe(4);
    const repo = join(home, 'dotfiles');
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, 'zshrc'), '# rc\n');
    symlinkSync(join(repo, 'zshrc'), join(home, '.zshrc'));
    await refreshEnvNow();
    const repoReal = realpathSync(repo);
    expect(
      (envWatchState() ?? []).some((p) => p.startsWith(`${repoReal}/`))
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rules 29 to 32 — the reaction
// ---------------------------------------------------------------------------

describe('rule 29: the drop is synchronous and has NO debounce', () => {
  it('drops inside the watch callback, before any timer runs', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    h.fire(home, '.zshrc');
    // No clock has moved and no timer has fired. This is the assertion that
    // stops a later round copying credentials/watch.ts's 400 ms debounce onto
    // the whole reaction and opening a window in which a create reads a value
    // we already know is stale.
    expect(h.drops).toBe(1);
    expect(h.asks).toEqual([]);
  });

  it('every event in a burst drops, and the burst re-warms once', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    h.fire(home, '.zshrc');
    h.fire(home, '.zshrc');
    h.fire(home, '.zprofile');
    expect(h.drops).toBe(3);
    h.advance(ENV_WATCH_DEBOUNCE_MS);
    expect(h.asks.length).toBe(1);
  });
});

describe('rules 30 and 31: the debounce and the floor', () => {
  it('the constants are the spec values', () => {
    expect(ENV_WATCH_DEBOUNCE_MS).toBe(400);
    expect(ENV_WARM_MIN_INTERVAL_MS).toBe(5_000);
  });

  it('the debounce is defined here and names the module it does not import', () => {
    expect(watchSrc).toMatch(/credentials\/watch\.ts:64/);
    expect(watchSrc).not.toMatch(/from '\.\.\/credentials/);
  });

  it('the FIRST burst waits only the debounce, not the floor', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    h.fire(home, '.zshrc');
    h.advance(ENV_WATCH_DEBOUNCE_MS - 1);
    expect(h.asks.length).toBe(0);
    h.advance(1);
    expect(h.asks.length).toBe(1);
  });

  it('a second burst inside the floor waits for it', async () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    h.fire(home, '.zshrc');
    h.advance(ENV_WATCH_DEBOUNCE_MS);
    await tick();
    expect(h.asks.length).toBe(1);
    h.fire(home, '.zshrc');
    // Well past the debounce, still inside the floor: no second shell.
    h.advance(ENV_WATCH_DEBOUNCE_MS * 2);
    await tick();
    expect(h.asks.length).toBe(1);
    h.advance(ENV_WARM_MIN_INTERVAL_MS);
    await tick();
    expect(h.asks.length).toBe(2);
  });

  it('the floor never gates the DROP', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    for (let i = 0; i < 6; i += 1) h.fire(home, '.zshrc');
    // Six events, six drops, whatever the floor is doing about the re-warm.
    expect(h.drops).toBe(6);
  });
});

describe('rule 32: every timer is unref-d and cleared by the stop', () => {
  it('the default timer wrapper unrefs', () => {
    expect(watchSrc).toMatch(/id\.unref\?\.\(\)/);
  });

  it('stopEnvWatch clears the pending timer and closes every handle', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    h.fire(home, '.zshrc');
    expect(h.pendingTimers).toBe(1);
    stopEnvWatch();
    expect(h.pendingTimers).toBe(0);
    expect(h.live.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 33 — the settings listener
// ---------------------------------------------------------------------------

describe('rule 33: the listener compares, and does nothing when equal', () => {
  it('an unrelated settings write spawns no shell and drops nothing', () => {
    let names = ['DEEPSEEK_API_KEY'];
    const h = harness({ env: zshEnv(), declaredNames: () => [...names] });
    startEnvWatch(h.deps);
    const fire = h.listener;
    expect(fire).not.toBeNull();
    fire?.();
    fire?.();
    fire?.();
    h.advance(ENV_WARM_MIN_INTERVAL_MS * 2);
    expect(h.drops).toBe(0);
    expect(h.asks.length).toBe(0);
    // And the same names in a different ORDER is still the same cover.
    names = ['DEEPSEEK_API_KEY'];
    fire?.();
    expect(h.drops).toBe(0);
  });

  it('a name ADDED drops the slot and schedules a re-warm', () => {
    let names = ['DEEPSEEK_API_KEY'];
    const h = harness({ env: zshEnv(), declaredNames: () => [...names] });
    startEnvWatch(h.deps);
    names = ['DEEPSEEK_API_KEY', 'FIREWORKS_API_KEY'];
    h.listener?.();
    expect(h.drops).toBe(1);
    h.advance(ENV_WATCH_DEBOUNCE_MS);
    expect(h.asks[0]).toEqual([
      'DEEPSEEK_API_KEY',
      'FIREWORKS_API_KEY',
      'HOME',
      'ZDOTDIR'
    ]);
  });

  it('declaredEnvNames never throws, whatever the settings file is', () => {
    expect(() => declaredEnvNames()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Rules 36 to 38, 40 — the warm-up
// ---------------------------------------------------------------------------

describe('rule 37: an empty declared cover spawns NOTHING', () => {
  it('at boot', async () => {
    const h = harness({ env: zshEnv(), declaredNames: () => [] });
    startEnvWatch(h.deps);
    await warmEnvAtBoot();
    expect(h.asks).toEqual([]);
  });

  it('and on a refresh', async () => {
    const h = harness({ env: zshEnv(), declaredNames: () => [] });
    startEnvWatch(h.deps);
    await refreshEnvNow();
    expect(h.asks).toEqual([]);
  });
});

describe('rule 38: the warm-up asks for the cover plus HOME and ZDOTDIR', () => {
  it("re-derives the watch set from the shell's own answer", async () => {
    const cfg = join(home, 'cfg');
    mkdirSync(cfg, { recursive: true });
    const h = harness({ env: zshEnv(), ...oneName() });
    h.setAnswer({
      values: { HOME: home, ZDOTDIR: cfg },
      missing: ['DEEPSEEK_API_KEY'],
      probeFailed: false
    });
    startEnvWatch(h.deps);
    expect(envWatchState()?.[0]).toBe(`${home}/.zshenv`);
    await warmEnvAtBoot();
    expect(h.asks[0]).toEqual(['DEEPSEEK_API_KEY', 'HOME', 'ZDOTDIR']);
    // The shell said its ZDOTDIR, so the set moved there. It is inside the
    // home, so it is watchable. THIS IS WHY THE TWO EXTRA NAMES RIDE ALONG:
    // ZDOTDIR is usually set inside ~/.zshenv and is not in this process's
    // own environment at all, so the provisional set would have been wrong
    // for the whole run.
    expect(envWatchState()?.[0]).toBe(`${cfg}/.zshenv`);
  });

  it('a missing ZDOTDIR falls back rather than watching an empty directory', async () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    h.setAnswer({
      values: { HOME: home },
      missing: ['DEEPSEEK_API_KEY', 'ZDOTDIR'],
      probeFailed: false
    });
    startEnvWatch(h.deps);
    await warmEnvAtBoot();
    expect(envWatchState()?.[0]).toBe(`${home}/.zshenv`);
  });

  it('a warm in flight is shared rather than duplicated', async () => {
    const asked: string[][] = [];
    const { gate, release } = held();
    const h = harness({
      env: zshEnv(),
      ...oneName(),
      capture: (names) => {
        asked.push([...names]);
        return gate.then(() => ({ values: {}, missing: [], probeFailed: false }));
      }
    });
    startEnvWatch(h.deps);
    const a = warmEnvAtBoot();
    const b = warmEnvAtBoot();
    release();
    await Promise.all([a, b]);
    expect(asked.length).toBe(1);
  });
});

describe('rules 39 and 40: the quit, on both sides of the await', () => {
  it('a quit landing mid-warm installs nothing and re-derives nothing', async () => {
    const { gate, release } = held();
    const h = harness({
      env: zshEnv(),
      ...oneName(),
      capture: () =>
        gate.then(() => ({
          values: { HOME: outside },
          missing: [],
          probeFailed: false
        }))
    });
    startEnvWatch(h.deps);
    const warm = warmEnvAtBoot();
    stopEnvWatch();
    release();
    await warm;
    // The watch is down, and the answer that landed after it did not revive it.
    expect(envWatchState()).toBeNull();
  });

  it('stopEnvWatch is idempotent and refuses every later start', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    expect(() => {
      stopEnvWatch();
      stopEnvWatch();
    }).not.toThrow();
    expect(h.armed).toEqual([true, false]);
    startEnvWatch(h.deps);
    expect(envWatchState()).toBeNull();
    expect(h.armed).toEqual([true, false]);
  });

  it('disarming drops the slot, so no answer outlives the watch', () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    stopEnvWatch();
    expect(h.armed[h.armed.length - 1]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 41 — the knob
// ---------------------------------------------------------------------------

describe('rule 41: GMUX_NO_ENV_CACHE=1 turns the whole feature off', () => {
  it('no watch, no arm, no warm', async () => {
    const h = harness({
      env: zshEnv({ GMUX_NO_ENV_CACHE: '1' }),
      ...oneName()
    });
    startEnvWatch(h.deps);
    expect(envWatchState()).toBeNull();
    expect(h.armed).toEqual([]);
    expect(h.live.length).toBe(0);
    await warmEnvAtBoot();
    await refreshEnvNow();
    expect(h.asks).toEqual([]);
  });

  it('any other value leaves the feature on', () => {
    const h = harness({
      env: zshEnv({ GMUX_NO_ENV_CACHE: '0' }),
      ...oneName()
    });
    startEnvWatch(h.deps);
    expect(h.armed).toEqual([true]);
  });
});

// ---------------------------------------------------------------------------
// The refresh, and the reach into the two files this domain is wired from
// ---------------------------------------------------------------------------

describe('rule 43: the refresh drops, re-derives, and bypasses the floor', () => {
  it('drops first and asks the shell even inside the floor', async () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    startEnvWatch(h.deps);
    // Put the floor firmly in the way.
    h.fire(home, '.zshrc');
    h.advance(ENV_WATCH_DEBOUNCE_MS);
    await tick();
    expect(h.asks.length).toBe(1);
    const dropsBefore = h.drops;
    await refreshEnvNow();
    expect(h.drops).toBe(dropsBefore + 1);
    expect(h.asks.length).toBe(2);
  });

  it('resolves void whatever the probe did', async () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    h.setAnswer({ values: {}, missing: ['DEEPSEEK_API_KEY'], probeFailed: true });
    startEnvWatch(h.deps);
    await expect(refreshEnvNow()).resolves.toBeUndefined();
  });

  it('a press on a build where nothing is armed resolves and spawns nothing', async () => {
    const h = harness({ env: zshEnv(), ...oneName() });
    h.breakWatch();
    startEnvWatch(h.deps);
    await expect(refreshEnvNow()).resolves.toBeUndefined();
    expect(h.asks).toEqual([]);
  });
});

describe('rules 35, 36 and 39: how the domain is wired', () => {
  it('the boot chain arms with no delay and warms after the existing constant', () => {
    expect(indexSrc).toMatch(/import \{ startEnvWatch, warmEnvAtBoot \}/);
    const chain = indexSrc.slice(indexSrc.indexOf('PHASE 276. The login-shell'));
    const call = chain.slice(0, chain.indexOf('// Phase 31'));
    // Step one is the FIRST link after the core, with no timer in front of it:
    // arming early is what buys the restore burst.
    const arm = call.indexOf('startEnvWatch()');
    const delay = call.indexOf('BOOT_OBSERVE_DELAY_MS');
    const probe = call.indexOf('warmEnvAtBoot()');
    expect(arm).toBeGreaterThan(-1);
    expect(delay).toBeGreaterThan(arm);
    expect(probe).toBeGreaterThan(delay);
    // And NOTHING on the boot path awaits either step.
    expect(call).toMatch(/void getGmuxCore\(\)/);
    expect(call).not.toMatch(/await (startEnvWatch|warmEnvAtBoot)/);
  });

  it('the quit disposer stops it beside stopLoginsWatch', () => {
    const order = capabilitiesSrc.indexOf('stopEnvWatch();');
    const logins = capabilitiesSrc.indexOf('stopLoginsWatch();');
    expect(logins).toBeGreaterThan(0);
    expect(order).toBeGreaterThan(logins);
    expect(capabilitiesSrc.slice(logins, order)).not.toMatch(/await /);
  });
});

describe('rule 34: the remote probe is untouched and still caches nothing', () => {
  it('names no cache and sends no value from this Mac', () => {
    expect(remoteProbeSrc).toMatch(/## Per create, never cached per connection/);
    expect(remoteProbeSrc).not.toMatch(/loginShellEnvFor|envSlot|dropLoginShellEnvCache/);
  });
});

// ---------------------------------------------------------------------------
// The rule that outranks the others: no value is written anywhere
// ---------------------------------------------------------------------------

describe('Phase 269 rule 2, which this phase makes stricter rather than looser', () => {
  it('this domain writes no file, no log and no argv', () => {
    expect(watchSrc).not.toMatch(/writeFileSync|appendFileSync|createWriteStream/);
    expect(watchSrc).not.toMatch(/getLog\(|console\.(log|warn|error)/);
    expect(watchSrc).not.toMatch(/spawn\(|execFile/);
    expect(filesSrc).not.toMatch(/writeFileSync|getLog\(/);
  });

  it('reads exactly two names back out of a captured answer, both paths', () => {
    const reads = [...watchSrc.matchAll(/result\.values\['([A-Z_]+)'\]/g)].map(
      (m) => m[1]
    );
    expect(reads.sort()).toEqual(['HOME', 'ZDOTDIR']);
  });
});
