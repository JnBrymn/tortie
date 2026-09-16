/**
 * Phase 269 — the shell-variable control in Settings → Launch defaults.
 *
 * WHAT THIS FILE IS FOR. The mechanism under this control has existed since
 * Phase 33 and nothing on any machine could reach it. The control is the
 * whole phase from a person's side, so what the battery has to hold is the
 * surface: the quiet empty state, the names offered without a value beside
 * them, the refusal a person reads, the confirm that names what is about to
 * happen, and the compact resting row.
 *
 * ONE RULE IS ABOVE THE REST AND THIS FILE EXISTS MOSTLY FOR IT: **not one
 * byte of a value may appear on this surface.** The rendered markup is
 * scanned for a sentinel in the cases where a value could plausibly ride
 * along, because "names only" is a promise about bytes rather than about
 * intentions. The sentinel is invented here and is never a real key.
 *
 * It renders the exported pieces directly and reads the source files as bytes
 * rather than mounting the section, for the reason `p1741-font-field.test.tsx`
 * next door wrote down: there is no DOM in this lane, and zustand serves a
 * server render its INITIAL state, so a store a test sets is invisible to
 * `renderToStaticMarkup`.
 *
 * PHASE 275 MOVED THREE THINGS OUT OF THIS FILE AND THE MOVES ARE DELIBERATE.
 * The inline field, its `<datalist>` and the note line under it are gone with
 * the control that replaced them, so every assertion about a field lives in
 * `p275-env-shared.test.tsx` beside the picker sheet. The refusal helper moved
 * to `EnvPickerSheet.tsx` with the control that calls it, and is still the one
 * and only call to `envPassthroughRefusal` in this window. Everything Phase
 * 269 promised that a person still meets is asserted here, unchanged.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ENV_PASSTHROUGH_REFUSED,
  ENV_REFUSED_EXACT,
  ENV_REFUSED_PATTERNS
} from '@shared/agent-overlay';
import { ConfirmEnvModal, EnvNamesGroup } from '../LaunchDefaultsSection';
import { envAddDecision } from '../EnvPickerSheet';
import { ENV_SET_CAPTION, envEmptyLine } from '../env-copy';

const section = readFileSync(
  join(__dirname, '..', 'LaunchDefaultsSection.tsx'),
  'utf8'
);
const picker = readFileSync(
  join(__dirname, '..', 'EnvPickerSheet.tsx'),
  'utf8'
);
const css = readFileSync(join(__dirname, '..', 'settings.css'), 'utf8');
const pickerCss = readFileSync(
  join(__dirname, '..', 'env-picker.css'),
  'utf8'
);
const copy = readFileSync(join(__dirname, '..', 'env-copy.ts'), 'utf8');

/**
 * A value this repository invents, so a scan for it means something. It is
 * never a provider key and it is never read from anywhere.
 */
const SENTINEL = 'P269_TEST_VALUE_not_a_real_key';

/** The declaration blocks of every rule whose selector names this class. */
function blocksFor(cls: string, sheet: string = css): { selector: string; body: string }[] {
  const bare = sheet.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(bare)) !== null) {
    const selector = (match[1] ?? '').trim();
    if (selector.includes(cls)) {
      out.push({ selector, body: (match[2] ?? '').trim() });
    }
  }
  return out;
}

/** The group, with everything a caller does not care about defaulted. */
function group(
  over: Partial<Parameters<typeof EnvNamesGroup>[0]> = {}
): string {
  return renderToStaticMarkup(
    <EnvNamesGroup
      scope="claude"
      subject="Claude Code"
      names={[]}
      emptyLine={envEmptyLine('Claude Code')}
      inheritCount={0}
      rejected={[]}
      unread={[]}
      unreadOver={0}
      unnamed={0}
      onOpen={() => undefined}
      onRemove={() => undefined}
      {...over}
    />
  );
}

/**
 * A source file with its comments removed, so a scan for a construct reads the
 * CODE rather than the prose about it. Both headers say the word "datalist"
 * because both explain why it went.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/** The markup with tags stripped, which is what a person actually reads. */
function words(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('the empty state', () => {
  const html = group();

  it('draws the head label, the button and ONE line', () => {
    expect(html).toContain('Shell variables');
    expect(html).toContain('Add…');
    expect(html).toContain(
      "Gets your shell&#x27;s PATH and LANG. Add any others Claude Code needs."
    );
    expect(words(html)).toBe(
      "Shell variables Add… Gets your shell's PATH and LANG. " +
        'Add any others Claude Code needs.'
    );
  });

  it('is one sentence, and no paragraph — just enough words', () => {
    const line = envEmptyLine('Claude Code');
    expect(line.split('. ').length).toBe(2);
    expect(line.length).toBeLessThan(90);
  });

  it('names the agent it is about', () => {
    expect(group({ emptyLine: envEmptyLine('Codex') })).toContain(
      'Add any others Codex needs.'
    );
  });

  it('is TRUE about what a session already gets: PATH and LANG, no others', () => {
    // Tortie writes exactly two variables into the tmux server globals
    // (research 123 §1.2; supervisor.ts:549, :577). A later round that puts a
    // third there has to come back and edit this sentence.
    const line = envEmptyLine('Claude Code');
    expect(line).toContain('PATH and LANG');
    expect(/\b(SHELL|TERM|HOME|LC_ALL)\b/.test(line)).toBe(false);
  });

  it('opens no field and draws no confirm at rest', () => {
    expect(html).not.toContain('<input');
    expect(html).not.toContain('alertdialog');
  });

  // Phase 275. The datalist is gone from the whole window, not just from the
  // resting row: it is Electron's own autofill popup, outside our document,
  // which is why it could neither be scrolled nor take more than one name.
  it('there is no datalist anywhere in this window any more', () => {
    const src = `${code(section)} ${code(picker)}`;
    expect(src).not.toContain('datalist');
    // And nothing attaches one: `list=` on an input is the only way in.
    expect(src).not.toMatch(/\blist=/);
  });

  it('holds the slot the chips will take, so the card does not jump', () => {
    // The Phase 174.1 lesson, applied to the group: the empty line and the
    // chips-plus-caption occupy the same reserved box.
    expect(html).toContain('class="set-env-detail"');
    const slot = blocksFor('.set-env-detail');
    expect(slot).toHaveLength(1);
    expect(slot[0]?.body).toContain('min-height');
  });

  it('no rule in the group or the picker hides anything by display', () => {
    for (const rule of [
      ...blocksFor('.set-env-'),
      ...blocksFor('.set-env-', pickerCss)
    ]) {
      expect(
        /display\s*:\s*none/.test(rule.body),
        `${rule.selector} { ${rule.body} }`
      ).toBe(false);
    }
  });
});

describe('the refusal', () => {
  const ctx = { existing: [] as string[], agentEnvKeys: [] as string[] };

  /** The one place a sentence may come from. */
  function refusalFor(
    name: string,
    over: Partial<typeof ctx> = {}
  ): string {
    const d = envAddDecision(name, { ...ctx, ...over });
    expect(d, `${name} should have been refused`).not.toHaveProperty('name');
    return (d as { refusal: string }).refusal;
  }

  it('refuses every name the shared denylists refuse, with a sentence', () => {
    // Derived from the arrays, so a name added to a denylist later is covered
    // here with no second edit.
    for (const name of ENV_REFUSED_EXACT) {
      expect(refusalFor(name).length).toBeGreaterThan(0);
    }
    for (const p of ENV_REFUSED_PATTERNS) {
      const probe = `${p.pattern.source.replace(/^\^/, '')}X`;
      expect(refusalFor(probe)).toContain(p.why);
    }
    for (const r of ENV_PASSTHROUGH_REFUSED) {
      expect(refusalFor(r.name)).toBe(r.why);
    }
  });

  it('names the field in the sentence a person reads', () => {
    expect(refusalFor('PATH')).toContain('PATH');
    expect(refusalFor('GMUX_SESSION_ID')).toContain('GMUX_SESSION_ID');
  });

  it('refuses a name that is not a name, and says what a name is', () => {
    const shape = 'A variable name is letters, digits and underscores, and never starts with a digit.';
    expect(refusalFor('2FAST')).toBe(shape);
    expect(refusalFor('my-key')).toBe(shape);
    expect(refusalFor('A'.repeat(65))).toBe(shape);
    expect(refusalFor('')).toBe(shape);
  });

  it('refuses a duplicate and says so plainly', () => {
    expect(refusalFor('FIREWORKS_API_KEY', { existing: ['FIREWORKS_API_KEY'] })).toBe(
      'That name is already on the list.'
    );
  });

  it('refuses the seventeenth name', () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => `P269_NAME_${i}`);
    expect(refusalFor('P269_ONE_MORE', { existing: sixteen })).toBe(
      'Sixteen names is the most Tortie will read for one agent.'
    );
  });

  it('refuses a name the agent already sets itself, so no notice can lie', () => {
    // Without this the pane could raise an "env-unresolved" notice about a
    // variable the pane actually has.
    expect(refusalFor('FORCE_COLOR', { agentEnvKeys: ['FORCE_COLOR'] })).toBe(
      'This agent already sets FORCE_COLOR itself. Pick one source for each name.'
    );
  });

  it('accepts an ordinary name, which is what opens the confirm', () => {
    expect(envAddDecision('  FIREWORKS_API_KEY  ', ctx)).toEqual({
      name: 'FIREWORKS_API_KEY'
    });
    expect(envAddDecision('A_B9', ctx)).toEqual({ name: 'A_B9' });
  });

  it('re-implements no part of the rule, and asks it from ONE place', () => {
    expect(picker).toContain(
      "import { envPassthroughRefusal, OVERLAY_LIMITS } from '@shared/agent-overlay';"
    );
    // Two call sites in the window and both are in the picker: the decision
    // helper, and the one that reads the CAP sentence rather than copying it.
    expect(picker.split('envPassthroughRefusal(').length - 1).toBe(2);
    expect(section).not.toContain('envPassthroughRefusal');
  });

  it('nothing in the copy module can interpolate a value', () => {
    // There is no function here that takes anything but a name, a count or an
    // agent's display name, which is what keeps rule 1 of that file
    // mechanical.
    expect(copy).not.toMatch(/\bvalue\b\s*:/);
    expect(copy).toContain('NAMES ONLY');
  });
});

describe('the confirm, for one name on one agent', () => {
  const html = renderToStaticMarkup(
    <ConfirmEnvModal
      pending={{
        target: { kind: 'agent', agentId: 'claude', agentName: 'Claude Code' },
        names: ['FIREWORKS_API_KEY']
      }}
      onCancel={() => undefined}
      onAdd={() => undefined}
    />
  );

  it('asks the question with the name and the agent in it', () => {
    expect(html).toContain(
      'Pass FIREWORKS_API_KEY to every new Claude Code session?'
    );
  });

  it('says what will happen, and what is not kept', () => {
    expect(words(html)).toContain(
      'FIREWORKS_API_KEY is read from your login shell each time a session ' +
        'starts, and given to that session only.'
    );
    expect(words(html)).toContain(
      'Tortie keeps the name. It never stores the value — not in settings, ' +
        'not in the session database, not in a log.'
    );
  });

  it('wears the shape the danger confirm already uses', () => {
    expect(html).toContain('class="modal-scrim"');
    expect(html).toContain('class="modal set-confirm"');
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('<code class="set-agent-cmd">FIREWORKS_API_KEY</code>');
  });

  it('is not destructive-styled, because it turns no safeguard off', () => {
    expect(html).toContain('btn btn-primary');
    expect(html).not.toContain('btn-destructive');
    expect(html).toContain('>Cancel</button>');
    expect(html).toContain('>Add</button>');
  });

  it('carries no value and no acknowledgement', () => {
    expect(html).not.toContain(SENTINEL);
    // Every add confirms: `dangerAcknowledged` is not touched by this route.
    const arm = section.slice(
      section.indexOf('const confirmAddEnv'),
      section.indexOf('return (\n    <section')
    );
    expect(arm).not.toContain('dangerAcknowledged');
  });
});

describe('the resting row once names are set', () => {
  const names = [
    'FIREWORKS_API_KEY',
    'FIREWORKS_BASE_URL',
    'P269_THIRD_NAME',
    'P269_FOURTH_NAME'
  ];
  const html = group({ names });

  it('is chips and ONE caption, and never a paragraph', () => {
    for (const n of names) expect(html).toContain(`>${n}<`);
    expect(html.split('class="set-chip envname"').length - 1).toBe(names.length);
    expect(html.split('<p ').length - 1).toBe(1);
    expect(words(html)).toBe(`Shell variables Add… ${names.join(' ')} ${ENV_SET_CAPTION}`);
  });

  it('the caption is the promise, in one line', () => {
    expect(ENV_SET_CAPTION).toBe(
      'Read from your shell at every launch. Never stored.'
    );
    expect(ENV_SET_CAPTION.length).toBeLessThan(60);
  });

  it('every chip has a remove with a label that says what it removes', () => {
    for (const n of names) {
      expect(html).toContain(`aria-label="Remove ${n} from Claude Code"`);
    }
    expect(html.split('codicon-close').length - 1).toBe(names.length);
  });

  it('removing never opens a confirm, exactly as disabling a preset never does', () => {
    expect(html).not.toContain('alertdialog');
    const from = section.indexOf('onRemove={(name) => {');
    const arm = section.slice(from, section.indexOf('}}', from));
    expect(arm).toContain('envPassthroughShared: names.filter');
    expect(arm).not.toContain('setPendingEnv');
  });

  it('carries no value anywhere in the row', () => {
    expect(html).not.toContain(SENTINEL);
    // A name and never a NAME=VALUE pair: nothing a person reads on this row
    // carries an equals sign, which is the shape a value would arrive in.
    expect(words(html)).not.toContain('=');
  });

  it('the chip is not muted on its raised ground', () => {
    // settings.css §1.1: --text-muted does not pass on --bg-raised.
    for (const rule of blocksFor('.set-chip.envname')) {
      expect(rule.body).not.toContain('--text-muted');
    }
    for (const rule of blocksFor('.set-env-remove')) {
      expect(rule.body).not.toContain('--text-muted');
    }
  });
});

describe('the group lives in the card that already exists', () => {
  it('is drawn inside AgentDefaultsCard and is not a section of its own', () => {
    expect(section).toContain('<EnvNames');
    expect(section.split('<h1 className="set-title">').length - 1).toBe(1);
    expect(section.split('<section').length - 1).toBe(1);
  });

  it('sits behind the same border the preset rows use', () => {
    const rule = blocksFor('.set-env-group');
    expect(rule).toHaveLength(1);
    expect(rule[0]?.body).toContain('border-top: 1px solid var(--border)');
  });

  it('draws every colour through a token', () => {
    for (const r of [
      ...blocksFor('.set-env-'),
      ...blocksFor('.set-env-', pickerCss),
      ...blocksFor('.set-confirm-names')
    ]) {
      const colours = r.body.match(/(?:^|[\s:])(#[0-9a-fA-F]{3,8}|rgba?\()/g);
      expect(colours, `${r.selector} { ${r.body} }`).toBe(null);
    }
  });

  it('the caption now says the section is about both things', () => {
    expect(section).toContain(
      'Flags and shell variables applied to every new session of an agent.'
    );
  });

  // The fix round. The pre-check clause is true of FLAGS and of nothing else:
  // `seededFlags` in CreateSessionModal.tsx and `agentPresetOptions` in
  // presets.ts read `settings.launchDefaults` and never `envPassthrough`, so
  // a name is not offered in the create dialog, is not pre-checked there, and
  // cannot be turned off there. A caption that said "these" promised all three
  // for the names as well.
  it('scopes the pre-check clause to the flags, which is the half it is true of', () => {
    expect(section).toContain('show the flags');
    expect(section).toContain('pre-checked');
    expect(section).not.toContain('show these');
  });

  // The seal is what stops an agent on the machine granting itself a name, and
  // a name carries no warning marker, so a caption scoped to warning-marked
  // options read as if it did not cover them. It does: `dangerStateOf` seals
  // every name and `withSealedDangerState` drops an unsealed one.
  it('the seal caption names the shell variables, which carry no warning marker', () => {
    // JSX wraps the sentence over several source lines, so the caption is
    // read the way a person reads it rather than the way it is indented.
    const flat = section.replace(/\s+/g, ' ');
    expect(flat).toContain(
      'A flag marked with a warning, and every shell variable name, can only be set here.'
    );
    expect(flat).toContain('the agents you run can write that file too');
  });

  it('uses no tmux word and no DOM-drawn menu', () => {
    const all = `${copy} ${section} ${picker}`;
    expect(/\bpane\b|\bprefix\b/i.test(copy)).toBe(false);
    expect(all).not.toContain('popupMenu');
  });
});
