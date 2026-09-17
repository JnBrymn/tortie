/**
 * Phase 276 — the [Re-read shell] control in Settings → Launch defaults.
 *
 * WHAT THIS FILE IS FOR. Phase 276 makes main hold the login shell's answer for
 * the life of the process and watch the person's shell config files so a
 * rotated key still takes effect on the next session they start. This button is
 * the deliberate half, for the one class the watch provably cannot see: a key
 * exported by a file the rc SOURCES, one read from a vault at shell start, a
 * `.env` a plugin loads. So what the surface has to hold is that it appears
 * only for somebody it could help, that it says almost nothing on its resting
 * face, that it cannot be pressed twice at once, and that pressing it reads
 * NOTHING back into this window.
 *
 * It reads the source files as bytes and drives the store directly rather than
 * mounting the section, for the reason `p269-env-names.test.tsx` next door
 * wrote down: there is no DOM in this lane, and zustand serves a server render
 * its INITIAL state, so a store a test sets is invisible to
 * `renderToStaticMarkup`.
 *
 * Rules 42 and 44 to 48 of build/p276/SPEC.md.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENV_REFRESH_BUSY,
  ENV_REFRESH_BUTTON,
  ENV_REFRESH_HINT
} from '../env-copy';

const section = readFileSync(
  join(__dirname, '..', 'LaunchDefaultsSection.tsx'),
  'utf8'
);
const storeSrc = readFileSync(
  join(__dirname, '..', 'settings-store.ts'),
  'utf8'
);
const copy = readFileSync(join(__dirname, '..', 'env-copy.ts'), 'utf8');
const css = readFileSync(join(__dirname, '..', 'settings.css'), 'utf8');
const contract = readFileSync(
  join(__dirname, '..', '..', '..', 'shared', 'ipc', 'app.ts'),
  'utf8'
);

// ---------------------------------------------------------------------------
// The store, driven against a bridge that counts its calls
// ---------------------------------------------------------------------------

let refreshCalls = 0;
let refreshAnswer: () => Promise<void> = () => Promise.resolve();

vi.stubGlobal('window', {
  addEventListener() {},
  removeEventListener() {},
  gmux: {
    settingsGet: () => Promise.resolve({}),
    agentFlagPresets: () => Promise.resolve({}),
    envRefresh: () => {
      refreshCalls += 1;
      return refreshAnswer();
    }
  }
});
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem() {},
  removeItem() {}
});

const { useSettingsStore } = await import('../settings-store');

beforeEach(() => {
  refreshCalls = 0;
  refreshAnswer = () => Promise.resolve();
  useSettingsStore.setState({ envRefreshing: false });
});

// ---------------------------------------------------------------------------
// Rule 47 — the words
// ---------------------------------------------------------------------------

describe('rule 47: the three strings, and what they never say', () => {
  it('are the spec words, verbatim', () => {
    expect(ENV_REFRESH_BUTTON).toBe('Re-read shell');
    expect(ENV_REFRESH_BUSY).toBe('Reading…');
    expect(ENV_REFRESH_HINT).toBe(
      'Ask your shell again. The next session you start gets the current values.'
    );
  });

  it('none of them interpolates, formats or measures anything', () => {
    // The hint does say the WORD "values", because that is the noun for what
    // the next session gets and saying it plainly is the point. What rule 1 of
    // env-copy.ts forbids is a string that could ever CARRY one: an
    // interpolation, a number, or a name. All three are constants with no
    // parameter, which is the structural half of the same promise.
    for (const s of [ENV_REFRESH_BUTTON, ENV_REFRESH_BUSY, ENV_REFRESH_HINT]) {
      expect(typeof s).toBe('string');
      expect(s).not.toMatch(/\$\{/);
      expect(s).not.toMatch(/\d/);
      expect(s.toLowerCase()).not.toMatch(/token|secret|length|bytes?\b/);
    }
    // And none of the three is a FUNCTION, unlike the six in this file that
    // take a subject or a count. A constant cannot be handed a value.
    expect(copy).not.toMatch(/export function envRefresh/);
  });

  it('the hint says THE NEXT SESSION and never this window', () => {
    // Nothing is read into the window by pressing it: the answer is dropped
    // and re-taken in main, and the channel resolves with nothing at all. A
    // sentence promising otherwise would be this file's rule 1 broken.
    expect(ENV_REFRESH_HINT).toMatch(/next session/);
    expect(ENV_REFRESH_HINT.toLowerCase()).not.toMatch(/window|running|now\b/);
  });

  it('all three are exported constants and none is built in the component', () => {
    expect(copy).toMatch(/export const ENV_REFRESH_BUTTON = 'Re-read shell';/);
    expect(copy).toMatch(/export const ENV_REFRESH_BUSY = 'Reading…';/);
    expect(copy).toMatch(/export const ENV_REFRESH_HINT =/);
  });
});

// ---------------------------------------------------------------------------
// Rules 44 to 46 — the control
// ---------------------------------------------------------------------------

describe('rule 44: it is drawn only when a name is set somewhere', () => {
  it('the condition reads BOTH lists and asks main nothing', () => {
    const cond = section.slice(
      section.indexOf('const anyEnvNames ='),
      section.indexOf('const launchable =')
    );
    expect(cond).toMatch(/settings\.envPassthroughShared\.length > 0/);
    expect(cond).toMatch(/Object\.values\(settings\.envPassthrough\)/);
    expect(cond).not.toMatch(/await|invoke|gmux\./);
  });

  it('the toolbar is behind that condition', () => {
    expect(section).toMatch(
      /\{anyEnvNames \? \(\s*\n\s*<div className="set-section-toolbar set-toolbar-end">/
    );
  });
});

describe('rule 45: assembled from classes that already exist', () => {
  it('reuses the Re-scan button, the toolbar and the spinner', () => {
    const toolbar = section.slice(
      section.indexOf('{anyEnvNames ? ('),
      section.indexOf('{/* Phase 275. Drawn ONCE')
    );
    expect(toolbar).toMatch(/className="btn btn-secondary set-rescan"/);
    expect(toolbar).toMatch(/className="set-spinner" aria-hidden="true"/);
    for (const cls of ['set-section-toolbar', 'set-rescan', 'set-spinner']) {
      expect(css).toMatch(new RegExp(`\\.${cls}\\s*\\{`));
    }
  });

  it('adds exactly ONE declaration, and it is a justification', () => {
    // The spec asked for no new CSS rule at all, on the belief that
    // `.set-section-toolbar` right-aligns. IT DOES NOT: it is display:flex with
    // no justification, and the Agents section gets the alignment from its
    // "Last scanned" age carrying margin-right:auto while the SpecStory section
    // spells `justify-content: flex-end` locally as `.ss-toolbar`. This is the
    // third instance of the shape and the second with nothing to its left, so
    // the declaration is written once here rather than a third time in a third
    // file. It is one line, it is a justification, and it adds no colour, no
    // size and no spacing.
    const rule = css.slice(css.indexOf('.set-toolbar-end {'));
    const body = rule.slice(0, rule.indexOf('}') + 1);
    expect(body).toBe('.set-toolbar-end {\n  justify-content: flex-end;\n}');
  });
});

describe('rule 46: no age, no count, no aria-label', () => {
  it('draws no age line and no number beside the button', () => {
    const toolbar = section.slice(
      section.indexOf('{anyEnvNames ? ('),
      section.indexOf('{/* Phase 275. Drawn ONCE')
    );
    // An age that climbs while you watch it turns a control a person almost
    // never needs into a nag — SpecStory's own reason, and it applies here.
    expect(toolbar).not.toMatch(/set-scan-age|formatAge|Date\.now/);
    expect(toolbar).not.toMatch(/\{\s*\w*[Cc]ount\s*\}/);
  });

  it('the visible text IS the accessible name', () => {
    const toolbar = section.slice(
      section.indexOf('{anyEnvNames ? ('),
      section.indexOf('{/* Phase 275. Drawn ONCE')
    );
    expect(toolbar).not.toMatch(/aria-label/);
    // The hint is the title and nothing else, so a person who never hovers
    // meets one two-word label.
    expect(toolbar).toMatch(/title=\{ENV_REFRESH_HINT\}/);
  });
});

// ---------------------------------------------------------------------------
// Rule 48 — the one thing that rate-limits it
// ---------------------------------------------------------------------------

describe('rule 48: disabled while in flight, and the action returns early', () => {
  it('the button is disabled from the same boolean the action sets', () => {
    const toolbar = section.slice(
      section.indexOf('{anyEnvNames ? ('),
      section.indexOf('{/* Phase 275. Drawn ONCE')
    );
    expect(toolbar).toMatch(/disabled=\{envRefreshing\}/);
    expect(toolbar).toMatch(/envRefreshing \? \(/);
  });

  it('a second press while one is in flight starts nothing', async () => {
    // `let release = null` outside the executor is narrowed to `never` by the
    // compiler, which cannot see across the executor's boundary, so the release
    // is handed back through a closure instead.
    let resolve: (() => void) | undefined;
    refreshAnswer = () =>
      new Promise<void>((r) => {
        resolve = r;
      });
    const first = useSettingsStore.getState().refreshShellEnv();
    expect(useSettingsStore.getState().envRefreshing).toBe(true);
    await useSettingsStore.getState().refreshShellEnv();
    expect(refreshCalls).toBe(1);
    resolve?.();
    await first;
    expect(useSettingsStore.getState().envRefreshing).toBe(false);
    expect(refreshCalls).toBe(1);
  });

  it('a failed refresh clears the flag and says nothing', async () => {
    refreshAnswer = () => Promise.reject(new Error('no'));
    await expect(
      useSettingsStore.getState().refreshShellEnv()
    ).resolves.toBeUndefined();
    expect(useSettingsStore.getState().envRefreshing).toBe(false);
  });

  it('there is no floor, no cooldown and no toast', () => {
    const action = storeSrc.slice(
      storeSrc.indexOf('async refreshShellEnv()'),
      storeSrc.indexOf('async refreshConfig()')
    );
    expect(action).not.toMatch(/setTimeout|Date\.now|toast|notice/);
    expect(action).toMatch(/get\(\)\.envRefreshing/);
  });
});

// ---------------------------------------------------------------------------
// Rule 42, and the promise that outranks all of them
// ---------------------------------------------------------------------------

describe('rule 42: the channel takes nothing and answers nothing', () => {
  it('is declared req [] res void', () => {
    expect(contract).toMatch(
      /'settings:envRefresh': \{ req: \[\]; res: void \};/
    );
  });

  it('the bridge member takes no argument and resolves void', () => {
    expect(contract).toMatch(/envRefresh\(\): Promise<void>;/);
  });

  it('the store reads nothing out of the answer', () => {
    const action = storeSrc.slice(
      storeSrc.indexOf('async refreshShellEnv()'),
      storeSrc.indexOf('async refreshConfig()')
    );
    // `await b.envRefresh()` and nothing assigned from it. A button that
    // returns nothing can never lie about a value.
    expect(action).toMatch(/await b\.envRefresh\(\);/);
    expect(action).not.toMatch(/=\s*await b\.envRefresh/);
    expect(action).not.toMatch(/set\(\{\s*env(?!Refreshing)/);
  });
});

describe('a build whose preload has no envRefresh is a no-op', () => {
  it('does not throw and sets no flag', async () => {
    const store = useSettingsStore.getState();
    const gmux = (window as unknown as { gmux: Record<string, unknown> }).gmux;
    const saved = gmux['envRefresh'];
    delete gmux['envRefresh'];
    try {
      await expect(store.refreshShellEnv()).resolves.toBeUndefined();
      expect(useSettingsStore.getState().envRefreshing).toBe(false);
    } finally {
      gmux['envRefresh'] = saved;
    }
  });
});
