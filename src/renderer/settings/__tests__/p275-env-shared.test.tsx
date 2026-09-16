/**
 * Phase 275 — the shared list, and the picker that replaced the datalist.
 *
 * THREE COMPLAINTS, ONE SURFACE, and this file holds the two halves a person
 * meets. The reporter said: "why do we need to set each individual key per
 * agent? also the pop up list doesn't scroll and you have to add one at a
 * time." The second and third are one control — a native `<datalist>` is
 * Electron's own autofill popup, outside our document, with no scroll view and
 * one `selected_line_` — so replacing it fixes both at once. The first is
 * answered by a shared list drawn once above the agent cards, with per-agent
 * narrowing kept beside it.
 *
 * WHAT THIS FILE PROVES, and what it deliberately does not. It drives
 * `envPickerModel`, which is every decision the sheet makes, and it renders
 * the sheet and both cards to markup. It does NOT prove that the seal drops an
 * unconfirmed shared name — that is main's, and it is driven against the
 * shipping `withSealedDangerState` in
 * `src/main/settings/__tests__/p275-env-shared-seal.test.ts`. There is no DOM
 * in this lane, so every state worth pinning is reachable through the pure
 * model rather than through a click.
 *
 * NAMES ONLY, STILL. The sentinel below is invented here, is never a real key,
 * and is scanned for in every render where a value could plausibly ride along.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { OVERLAY_LIMITS } from '@shared/agent-overlay';
import { FilterField } from '../../controls/FilterField';
import {
  ConfirmEnvModal,
  EnvNamesGroup
} from '../LaunchDefaultsSection';
import type { EnvPickerInput } from '../EnvPickerSheet';
import {
  EnvPickerSheetView,
  envPickerModel,
  envPickerRowId,
  envSubject
} from '../EnvPickerSheet';
import {
  ENV_NAMES_ONLY,
  ENV_PICKER_NOTE_INHERITED,
  ENV_PICKER_NOTE_ON_LIST,
  ENV_PICKER_NOTE_SHARED,
  ENV_PICKER_NOTE_TYPED,
  ENV_PROBE_FAILED,
  ENV_READING_SHELL,
  ENV_SHARED_CONFIRM_BODY_1,
  ENV_SHARED_EMPTY_LINE,
  envInheritLine,
  envPickerCount,
  envRejectedLine,
  envRejectedUnnamedLine,
  envSharedConfirmTitle,
  envUnreadLine
} from '../env-copy';

const SENTINEL = 'P275_TEST_VALUE_not_a_real_key';

const pickerSrc = readFileSync(
  join(__dirname, '..', 'EnvPickerSheet.tsx'),
  'utf8'
);
const sectionSrc = readFileSync(
  join(__dirname, '..', 'LaunchDefaultsSection.tsx'),
  'utf8'
);
const pickerCss = readFileSync(join(__dirname, '..', 'env-picker.css'), 'utf8');
const filterSrc = readFileSync(
  join(__dirname, '..', '..', 'controls', 'FilterField.tsx'),
  'utf8'
);

/**
 * Fifty-one names, which is what `printenv | wc -l` reads on the operator's
 * own shell — the measurement the phase entry took before any of this was
 * written, and the number the old control could not draw.
 */
const FIFTY_ONE = Array.from({ length: 51 }, (_, i) =>
  i === 0 ? 'ANTHROPIC_API_KEY' : `P275_SHELL_NAME_${i}`
);

function model(over: Partial<EnvPickerInput> = {}) {
  return envPickerModel({
    scope: 'shared',
    existing: [],
    inherited: [],
    agentEnvKeys: [],
    candidates: { names: FIFTY_ONE, probeFailed: false },
    query: '',
    ticked: [],
    cap: OVERLAY_LIMITS.maxEnvPassthroughNames,
    ...over
  });
}

function words(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The declaration blocks of every rule whose selector names this class. */
function blocksFor(cls: string, sheet: string): { selector: string; body: string }[] {
  const bare = sheet.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bare)) !== null) {
    const selector = (m[1] ?? '').trim();
    if (selector.includes(cls)) out.push({ selector, body: (m[2] ?? '').trim() });
  }
  return out;
}

describe('the list a person can actually read — 51 names', () => {
  it('draws every name the shell answered, one row each', () => {
    const m = model();
    expect(m.rows).toHaveLength(51);
    expect(m.rows.map((r) => r.name)).toEqual(FIFTY_ONE);
    expect(m.count).toBe('51 names');
  });

  it('keeps the SHELL order, so the list has the same shape every opening', () => {
    // Phase 269's handler filtered a name you already had straight out, which
    // made the list change shape between openings. Now it is drawn in place.
    const m = model({ existing: ['P275_SHELL_NAME_9'] });
    expect(m.rows.map((r) => r.name)).toEqual(FIFTY_ONE);
  });

  it('scrolls in OUR document: the body scrolls and the sheet does not', () => {
    const sheet = blocksFor('.modal.set-env-picker', pickerCss);
    expect(sheet).not.toHaveLength(0);
    expect(sheet[0]?.body).toContain('overflow: hidden');
    const list = blocksFor('.set-env-list', pickerCss)[0];
    expect(list?.body).toContain('overflow-y: auto');
    expect(list?.body).toContain('min-height: 0');
    expect(list?.body).toContain('flex: 1 1 auto');
  });

  it('is written .modal.set-env-picker so it beats .modal whatever order wins', () => {
    expect(pickerCss).toContain('.modal.set-env-picker {');
    expect(pickerCss).not.toMatch(/^\.set-env-picker\s*\{/m);
  });
});

describe('several at once', () => {
  it('ticks more than one name and commits them together', () => {
    const m = model({ ticked: ['ANTHROPIC_API_KEY', 'P275_SHELL_NAME_3'] });
    expect(m.chosen).toEqual(['ANTHROPIC_API_KEY', 'P275_SHELL_NAME_3']);
    expect(m.count).toBe('2 selected, 14 left');
  });

  it('keeps the tick order, so names land in the order they were chosen', () => {
    const m = model({ ticked: ['P275_SHELL_NAME_3', 'ANTHROPIC_API_KEY'] });
    expect(m.chosen).toEqual(['P275_SHELL_NAME_3', 'ANTHROPIC_API_KEY']);
  });

  it('the footer says how many, and is dead at zero', () => {
    const none = renderToStaticMarkup(sheet(model()));
    expect(none).toContain('>Add…</button>');
    expect(none).toContain('disabled=""');
    const some = renderToStaticMarkup(sheet(model({ ticked: ['ANTHROPIC_API_KEY'] })));
    expect(some).toContain('>Add 1…</button>');
  });

  it('ONE confirmation for the batch, and it names every variable in it', () => {
    const names = ['ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'P275_SHELL_NAME_3'];
    const html = renderToStaticMarkup(
      <ConfirmEnvModal
        pending={{ target: { kind: 'shared' }, names }}
        onCancel={() => undefined}
        onAdd={() => undefined}
      />
    );
    // The count in the title and the list in the body are the same fact said
    // twice on purpose: the title is what a person skims, the chips are what
    // they check.
    expect(html).toContain('Pass 3 shell variables to every agent?');
    for (const n of names) {
      expect(html).toContain(`<code class="set-agent-cmd">${n}</code>`);
    }
    expect(html.split('class="modal-actions"').length - 1).toBe(1);
  });
});

describe('never a cage — the Phase 174.1 ruling, made visible', () => {
  it('draws a name the shell does not export as the TOP row', () => {
    const m = model({ query: 'MY_NEW_KEY' });
    expect(m.rows[0]?.name).toBe('MY_NEW_KEY');
    expect(m.rows[0]?.typed).toBe(true);
    expect(m.rows[0]?.note).toBe(ENV_PICKER_NOTE_TYPED);
    expect(m.rows[0]?.locked).toBe(false);
  });

  it('that row ticks and commits exactly like any other', () => {
    const m = model({ query: 'MY_NEW_KEY', ticked: ['MY_NEW_KEY'] });
    expect(m.rows[0]?.ticked).toBe(true);
    expect(m.rows[0]?.note).toBe(ENV_PICKER_NOTE_TYPED);
    expect(m.chosen).toEqual(['MY_NEW_KEY']);
  });

  it('and it stays drawn once the filter that created it is cleared', () => {
    // Otherwise it is a name a person can no longer untick, committed from a
    // count alone.
    const m = model({ query: '', ticked: ['MY_NEW_KEY'] });
    const row = m.rows.find((r) => r.name === 'MY_NEW_KEY');
    expect(row?.ticked).toBe(true);
    expect(row?.note).toBe(ENV_PICKER_NOTE_TYPED);
    expect(m.chosen).toEqual(['MY_NEW_KEY']);
  });

  it('works when the shell answered NOTHING at all', () => {
    // The probe-failed path. Typing is the whole of the control here, and it
    // still has to work.
    const failed = model({
      candidates: { names: [], probeFailed: true },
      query: 'MY_NEW_KEY'
    });
    expect(failed.note).toBe(ENV_PROBE_FAILED);
    expect(failed.rows.map((r) => r.name)).toEqual(['MY_NEW_KEY']);
    expect(failed.nothing).toBeNull();
  });

  it('says it is reading rather than claiming the shell exports nothing', () => {
    expect(model({ candidates: undefined }).note).toBe(ENV_READING_SHELL);
    expect(model().note).toBe(ENV_NAMES_ONLY);
  });

  it('draws the refusal instead of a row when the typed name is refused', () => {
    const m = model({ query: 'PATH' });
    expect(m.noteIsRefusal).toBe(true);
    expect(m.note).toContain('PATH');
    expect(m.rows.some((r) => r.typed)).toBe(false);
  });

  it('never draws a refusal and a typed row at once', () => {
    for (const q of ['PATH', 'MY_NEW_KEY', '2FAST', 'ANTHROPIC_API_KEY', '']) {
      const m = model({ query: q });
      expect(m.noteIsRefusal && m.rows.some((r) => r.typed)).toBe(false);
    }
  });
});

describe('a name you already have is shown, ticked and locked — never hidden', () => {
  it('on the shared card', () => {
    const m = model({ existing: ['ANTHROPIC_API_KEY'] });
    const row = m.rows.find((r) => r.name === 'ANTHROPIC_API_KEY');
    expect(row?.ticked).toBe(true);
    expect(row?.locked).toBe(true);
    expect(row?.note).toBe(ENV_PICKER_NOTE_SHARED);
    expect(m.chosen).toEqual([]);
  });

  it("on an agent card, for that agent's own name", () => {
    const m = model({ scope: 'agent', existing: ['ANTHROPIC_API_KEY'] });
    expect(m.rows.find((r) => r.name === 'ANTHROPIC_API_KEY')?.note).toBe(
      ENV_PICKER_NOTE_ON_LIST
    );
  });

  it('on an agent card, for a name the SHARED list already gives it', () => {
    // Adding it per-agent changes nothing a launch would do and would spend
    // one of that agent's sixteen slots on a no-op.
    const m = model({ scope: 'agent', inherited: ['ANTHROPIC_API_KEY'] });
    const row = m.rows.find((r) => r.name === 'ANTHROPIC_API_KEY');
    expect(row?.locked).toBe(true);
    expect(row?.ticked).toBe(true);
    expect(row?.note).toBe(ENV_PICKER_NOTE_INHERITED);
  });

  it('shows a name the shell no longer exports, rather than losing it', () => {
    const m = model({
      candidates: { names: [], probeFailed: false },
      existing: ['P275_GONE_FROM_PROFILE']
    });
    expect(m.rows.map((r) => r.name)).toEqual(['P275_GONE_FROM_PROFILE']);
  });

  it('an inherited name costs the agent list none of its sixteen', () => {
    const m = model({
      scope: 'agent',
      inherited: FIFTY_ONE.slice(0, 16),
      existing: []
    });
    expect(m.count).toBe('51 names');
    expect(m.capReason).toBeNull();
  });
});

describe('filtering', () => {
  it('is case-insensitive substring over the name, and nothing cleverer', () => {
    // Not the repository's fuzzy scorer: a variable name is typed exactly, and
    // fuzzy matching over fifty SHOUTY_SNAKE names ranks noise above the exact
    // hit a person is aiming at.
    const m = model({ query: 'anthropic' });
    expect(m.rows.filter((r) => !r.typed).map((r) => r.name)).toEqual([
      'ANTHROPIC_API_KEY'
    ]);
    expect(m.count).toBe('1 of 51');
  });

  it('a lowercase filter is ALSO a name, so it is offered — but not first', () => {
    // One rule and not two: every name you can add is a row, including
    // `anthropic`, which a person could genuinely export. The cursor lands on
    // the first thing the shell actually has, so ↩ never ticks the literal
    // query when a real match is on screen.
    const m = model({ query: 'anthropic' });
    expect(m.rows[0]?.typed).toBe(true);
    expect(m.cursorOnQuery).toBe(1);
    expect(m.rows[m.cursorOnQuery]?.name).toBe('ANTHROPIC_API_KEY');
  });

  it('the typed row IS the cursor when nothing the shell has matched', () => {
    const m = model({ query: 'MY_NEW_KEY' });
    expect(m.cursorOnQuery).toBe(0);
    expect(m.rows[0]?.typed).toBe(true);
  });

  it('draws ONE line when nothing matches and the query is not a name', () => {
    const m = model({ query: 'no-such-thing' });
    expect(m.rows).toHaveLength(0);
    expect(m.nothing).toBe('Nothing matches “no-such-thing”.');
  });

  it('draws the typed row instead of that line when the query IS a name', () => {
    const m = model({ query: 'ANTRHOPIC_API_KEY' });
    expect(m.nothing).toBeNull();
    expect(m.rows[0]?.typed).toBe(true);
  });

  it('leaves the typed row out of the count, so the total does not move', () => {
    expect(model({ query: 'MY_NEW_KEY' }).count).toBe('0 of 51');
  });

  it('says nothing about a count while the list is at rest and untouched', () => {
    expect(envPickerCount({ ticked: 0, left: 16, shown: 1, total: 1, filtering: false })).toBe(
      '1 name'
    );
  });
});

describe('the cap is said while ticking, not at the confirm', () => {
  const sixteen = FIFTY_ONE.slice(0, 16);

  it('every unticked row goes disabled at sixteen, with the reason printed', () => {
    const m = model({ ticked: sixteen });
    expect(m.count).toBe('16 selected, 0 left');
    const spare = m.rows.find((r) => !r.ticked);
    expect(spare?.capped).toBe(true);
    expect(m.capReason).toBe(
      'Sixteen names is the most Tortie will read for every agent.'
    );
  });

  it('the AGENT list says the agent sentence and the SHARED list says its own', () => {
    // Two caps, one number, and they do not share a budget: a shared name must
    // never silently shrink what an agent may add on its own card.
    expect(model({ scope: 'agent', ticked: sixteen }).capReason).toBe(
      'Sixteen names is the most Tortie will read for one agent.'
    );
  });

  it('reads both sentences from the refusal rather than copying either', () => {
    // The file that refuses must not be able to disagree with the file that
    // explains, so neither sentence is written in this window.
    expect(pickerSrc).not.toContain('Sixteen names is the most');
    expect(readFileSync(join(__dirname, '..', 'env-copy.ts'), 'utf8')).not.toContain(
      'Sixteen names is the most'
    );
  });

  it('the row a person already ticked stays ticked at the cap', () => {
    const m = model({ ticked: sixteen });
    expect(m.rows.filter((r) => r.ticked).map((r) => r.name)).toEqual(sixteen);
  });
});

/** The sheet, at whatever model a test hands it. */
function sheet(m: ReturnType<typeof envPickerModel>, cursor = 0): React.JSX.Element {
  return (
    <EnvPickerSheetView
      target={{ kind: 'shared' }}
      model={m}
      query=""
      cursor={cursor}
      onQuery={() => undefined}
      onCursor={() => undefined}
      onToggle={() => undefined}
      onCancel={() => undefined}
      onCommit={() => undefined}
    />
  );
}

describe('the keyboard, and what announces it', () => {
  const html = renderToStaticMarkup(sheet(model(), 2));

  it('is a multi-select listbox of divs, and never a list of buttons', () => {
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-multiselectable="true"');
    expect(html).toContain('role="option"');
    // A focusable control inside a listbox takes DOM focus itself, fights
    // aria-activedescendant, and makes Tab walk fifty rows.
    const list = html.slice(html.indexOf('role="listbox"'));
    expect(list).not.toContain('<button role="option"');
  });

  it('announces the active row from the element that HOLDS focus', () => {
    // aria-activedescendant is read off the focused element and nowhere else.
    // Focus is in the field, so the field carries it.
    const id = envPickerRowId(FIFTY_ONE[2] ?? '');
    const field = html.slice(0, html.indexOf('role="listbox"'));
    expect(field).toContain('role="combobox"');
    expect(field).toContain(`aria-activedescendant="${id}"`);
  });

  it('marks the ticked row with aria-selected and the cursor separately', () => {
    const m = model({ ticked: ['ANTHROPIC_API_KEY'] });
    const out = renderToStaticMarkup(sheet(m, 5));
    expect(out).toContain('aria-selected="true"');
    // The keyboard cursor is a class and a data attribute, never the tick:
    // one is where the arrows are, the other is what Add will take.
    expect(out).toContain('data-cursor="true"');
    expect(out.split('data-cursor="true"').length - 1).toBe(1);
  });

  it('↩ toggles and never commits; ⌘↩ is what commits', () => {
    const arm = pickerSrc.slice(
      pickerSrc.indexOf("if (e.key === 'Enter')"),
      pickerSrc.indexOf("if (e.key === 'Escape')")
    );
    expect(arm).toContain('e.metaKey || e.ctrlKey');
    expect(arm).toContain('onToggle(active)');
  });

  it('SPACE types a space — a text field must not refuse a character', () => {
    expect(pickerSrc).not.toContain("e.key === ' '");
    expect(pickerSrc).not.toContain("e.key === 'Space'");
  });

  it('the arrows stop the caret walking the field', () => {
    const arm = pickerSrc.slice(
      pickerSrc.indexOf("if (e.key === 'ArrowDown')"),
      pickerSrc.indexOf("if (e.key === 'Enter')")
    );
    expect(arm.split('e.preventDefault()').length - 1).toBe(2);
  });

  it('keeps the active row in view without moving the page under the eye', () => {
    expect(pickerSrc).toContain("scrollIntoView({ block: 'nearest' })");
  });

  it('traps Tab inside the sheet', () => {
    expect(pickerSrc).toContain('trapTabKey(e, e.currentTarget)');
  });

  it('a row cannot steal focus from the field', () => {
    expect(pickerSrc).toContain('onMouseDown={(e) => e.preventDefault()}');
  });
});

describe('FilterField gained two optional props and nothing else moved', () => {
  it('emits no role and no aria when they are absent', () => {
    const plain = renderToStaticMarkup(
      <FilterField value="" onChange={() => undefined} placeholder="Search" />
    );
    expect(plain).not.toContain('role=');
    expect(plain).not.toContain('aria-activedescendant');
    expect(plain).not.toContain('aria-expanded');
  });

  it('emits the combobox aria when they are given', () => {
    const combo = renderToStaticMarkup(
      <FilterField
        value=""
        onChange={() => undefined}
        placeholder="Filter or type a name"
        combobox={{ controls: 'x', activeId: 'y' }}
      />
    );
    expect(combo).toContain('role="combobox"');
    expect(combo).toContain('aria-controls="x"');
    expect(combo).toContain('aria-activedescendant="y"');
  });

  it('both props are optional, so the five older call sites are unchanged', () => {
    expect(filterSrc).toContain('inputRef?: React.Ref<HTMLInputElement>;');
    expect(filterSrc).toContain('combobox?: {');
  });

  it('is the app ONE filter field, not a hand-rolled copy', () => {
    expect(pickerSrc).toContain("import { FilterField } from '../controls/FilterField';");
    expect(pickerSrc).not.toContain('filter-field-icon');
  });
});

describe('the shared card', () => {
  const empty = renderToStaticMarkup(
    <EnvNamesGroup
      scope="shared"
      subject={envSubject({ kind: 'shared' })}
      names={[]}
      emptyLine={ENV_SHARED_EMPTY_LINE}
      inheritCount={0}
      rejected={[]}
      unread={[]}
      unreadOver={0}
      unnamed={0}
      onOpen={() => undefined}
      onRemove={() => undefined}
    />
  );

  it('is drawn ONCE, above the agent cards, and is not an agent', () => {
    expect(sectionSrc.split('<SharedDefaultsCard').length - 1).toBe(1);
    const shared = sectionSrc.indexOf('<SharedDefaultsCard');
    const agents = sectionSrc.indexOf('<AgentDefaultsCard');
    expect(shared).toBeGreaterThan(-1);
    expect(shared).toBeLessThan(agents);
    // A glyph, never a borrowed agent mark.
    expect(sectionSrc).toContain('<Codicon name="symbol-variable" size="md" />');
    expect(sectionSrc).toContain('<span className="set-defaults-name">Every agent</span>');
  });

  it('has no preset rows, because no launch flag belongs to every agent', () => {
    const card = sectionSrc.slice(
      sectionSrc.indexOf('function SharedDefaultsCard'),
      sectionSrc.indexOf('function EnvNames(')
    );
    expect(card).not.toContain('PresetRow');
    expect(card).not.toContain('dangerAcknowledged');
  });

  it('its empty state is ONE line, and it is the offer', () => {
    expect(words(empty)).toBe(`Shell variables Add… ${ENV_SHARED_EMPTY_LINE}`);
    expect(ENV_SHARED_EMPTY_LINE).toBe(
      'Set a key once here and every agent gets it.'
    );
    expect(ENV_SHARED_EMPTY_LINE.length).toBeLessThan(60);
  });

  it('says "every agent" in every label it hands a person', () => {
    expect(empty).toContain('aria-label="Add shell variables for every agent"');
    const set = renderToStaticMarkup(
      <EnvNamesGroup
        scope="shared"
        subject="every agent"
        names={['ANTHROPIC_API_KEY']}
        emptyLine={ENV_SHARED_EMPTY_LINE}
        inheritCount={0}
        rejected={[]}
        unread={[]}
        unreadOver={0}
        unnamed={0}
        onOpen={() => undefined}
        onRemove={() => undefined}
      />
    );
    expect(set).toContain(
      'aria-label="Remove ANTHROPIC_API_KEY from every agent"'
    );
  });
});

describe('each agent card says what it inherits, in one line', () => {
  function withInherit(n: number): string {
    return renderToStaticMarkup(
      <EnvNamesGroup
        scope="claude"
        subject="Claude Code"
        names={[]}
        emptyLine="Gets your shell's PATH and LANG. Add any others Claude Code needs."
        inheritCount={n}
        rejected={[]}
        unread={[]}
        unreadOver={0}
        unnamed={0}
        onOpen={() => undefined}
        onRemove={() => undefined}
      />
    );
  }

  it('draws nothing at all while the shared list is empty', () => {
    expect(withInherit(0)).not.toContain('set-env-inherit');
  });

  it('points UP rather than repeating the names one card above', () => {
    expect(words(withInherit(3))).toContain('Plus the 3 variables every agent gets.');
    expect(envInheritLine(1)).toBe('Plus the variable every agent gets.');
    expect(envInheritLine(3)).toBe('Plus the 3 variables every agent gets.');
    // Just enough words: one short sentence, and no name in it.
    expect(envInheritLine(3).length).toBeLessThan(50);
    expect(envInheritLine(3)).not.toContain('_');
  });
});

describe('a name the file had that this window did not put there', () => {
  it('says so on the card that lost it, in the error colour', () => {
    const html = renderToStaticMarkup(
      <EnvNamesGroup
        scope="shared"
        subject="every agent"
        names={[]}
        emptyLine={ENV_SHARED_EMPTY_LINE}
        inheritCount={0}
        rejected={['SNUCK_IN_BY_AN_AGENT']}
        unread={[]}
        unreadOver={0}
        unnamed={2}
        onOpen={() => undefined}
        onRemove={() => undefined}
      />
    );
    expect(html).toContain('class="set-env-note error"');
    expect(words(html)).toContain(
      envRejectedLine(['SNUCK_IN_BY_AN_AGENT'])
    );
    expect(words(html)).toContain(envRejectedUnnamedLine(2));
  });

  it('says WHY in the same breath as WHAT', () => {
    expect(envRejectedLine(['A_KEY'])).toBe(
      'Ignored, because they were not added here: A_KEY.'
    );
    expect(envRejectedUnnamedLine(1)).toBe(
      'One entry was ignored because it is not a variable name.'
    );
  });

  /**
   * THE FIX ROUND. Two verifiers, one in a harness and one in the running
   * window, found the same defect from two directions: the card drew the SEAL's
   * sentence over the SHAPE layer's drops too. "Ignored, because they were not
   * added here" is a direction — go and add it — and for a shape drop that is a
   * dead end, while for a CAP drop of a name that IS sealed it is simply untrue
   * about the one name the person came to the window about.
   */
  it('gives the shape layer its own sentence, pointing the other way', () => {
    const html = renderToStaticMarkup(
      <EnvNamesGroup
        scope="shared"
        subject="every agent"
        names={[]}
        emptyLine={ENV_SHARED_EMPTY_LINE}
        inheritCount={0}
        rejected={['NEVER_CONFIRMED']}
        unread={['PATH', 'V_PAST_THE_CAP']}
        unreadOver={0}
        unnamed={0}
        onOpen={() => undefined}
        onRemove={() => undefined}
      />
    );
    const said = words(html);
    expect(said).toContain('Ignored, because they were not added here: NEVER_CONFIRMED.');
    expect(said).toContain(
      'Ignored, because Tortie will not read them: PATH, V_PAST_THE_CAP.'
    );
    // The seal's direction is never given to a shape drop.
    expect(said).not.toContain('not added here: PATH');
    expect(said).not.toContain('not added here: NEVER_CONFIRMED, PATH');
  });

  it('says it in the singular for one name, and never lists past the cap', () => {
    expect(envUnreadLine(['PATH'])).toBe(
      'Ignored, because Tortie will not read it: PATH.'
    );
    // The shape layer runs over the RAW file, so the COUNT of these names is
    // the file writer's to choose. Main echoes sixteen and counts the rest;
    // this is the line that ends honestly rather than drawing 200,000 names.
    expect(envUnreadLine(['A_ONE', 'A_TWO'], 984)).toBe(
      'Ignored, because Tortie will not read them: A_ONE, A_TWO, and 984 more.'
    );
  });

  it('draws the shape line ALONE when the seal dropped nothing', () => {
    const html = renderToStaticMarkup(
      <EnvNamesGroup
        scope="shared"
        subject="every agent"
        names={[]}
        emptyLine={ENV_SHARED_EMPTY_LINE}
        inheritCount={0}
        rejected={[]}
        unread={['PATH']}
        unreadOver={3}
        unnamed={0}
        onOpen={() => undefined}
        onRemove={() => undefined}
      />
    );
    expect(html).toContain('class="set-env-note error"');
    expect(words(html)).toContain(
      'Ignored, because Tortie will not read them: PATH, and 3 more.'
    );
    expect(words(html)).not.toContain('not added here');
  });

  it('draws nothing when there is nothing to report', () => {
    const clean = renderToStaticMarkup(
      <EnvNamesGroup
        scope="claude"
        subject="Claude Code"
        names={[]}
        emptyLine="x"
        inheritCount={0}
        rejected={[]}
        unread={[]}
        unreadOver={0}
        unnamed={0}
        onOpen={() => undefined}
        onRemove={() => undefined}
      />
    );
    expect(clean).not.toContain('set-env-note');
  });
});

describe('the shared confirm is the one place this phase earns three lines', () => {
  const html = renderToStaticMarkup(
    <ConfirmEnvModal
      pending={{ target: { kind: 'shared' }, names: ['ANTHROPIC_API_KEY'] }}
      onCancel={() => undefined}
      onAdd={() => undefined}
    />
  );

  it('says the AGENT is no longer the boundary, in the title', () => {
    expect(html).toContain('Pass this shell variable to every agent?');
    expect(envSharedConfirmTitle(2)).toBe(
      'Pass 2 shell variables to every agent?'
    );
  });

  it('says the breadth out loud, including agents not installed yet', () => {
    expect(words(html)).toContain(ENV_SHARED_CONFIRM_BODY_1);
    expect(ENV_SHARED_CONFIRM_BODY_1).toBe(
      'Every agent Tortie launches gets these, including agents you install later.'
    );
  });

  it('is three body lines and no more', () => {
    expect(html.split('class="set-confirm-body"').length - 1).toBe(3);
  });

  it('turns no safeguard off, so it is primary and never destructive', () => {
    expect(html).toContain('btn btn-primary');
    expect(html).not.toContain('btn-destructive');
  });

  it('never mentions a value, a length, or what your shell has', () => {
    expect(html).not.toContain(SENTINEL);
    expect(words(html)).not.toContain('=');
    expect(words(html)).not.toContain('found in your shell');
    expect(words(html)).not.toContain('characters');
  });
});

describe('the per-agent confirm learnt the plural and kept the singular', () => {
  it('one name on one agent is Phase 269 byte for byte', () => {
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
    expect(html).toContain(
      'Pass FIREWORKS_API_KEY to every new Claude Code session?'
    );
    expect(html).toContain(
      '<code class="set-agent-cmd">FIREWORKS_API_KEY</code>'
    );
    expect(html.split('class="set-confirm-body"').length - 1).toBe(2);
  });

  it('several names on one agent count them and draw them all', () => {
    const html = renderToStaticMarkup(
      <ConfirmEnvModal
        pending={{
          target: { kind: 'agent', agentId: 'codex', agentName: 'Codex' },
          names: ['A_ONE', 'A_TWO']
        }}
        onCancel={() => undefined}
        onAdd={() => undefined}
      />
    );
    expect(html).toContain('Pass 2 shell variables to every new Codex session?');
    expect(html).toContain('<code class="set-agent-cmd">A_ONE</code>');
    expect(html).toContain('<code class="set-agent-cmd">A_TWO</code>');
    expect(words(html)).toContain('Each is read from your login shell');
  });
});

describe('names only, and nothing is probed before a person asks', () => {
  it('the sheet asks the shell on OPEN and nowhere else', () => {
    // One call, inside the mount effect, so nothing probes at boot and a
    // person who never opens the sheet never starts a shell.
    expect(pickerSrc.split('loadEnvCandidates(').length - 1).toBe(1);
    const arm = pickerSrc.slice(
      pickerSrc.indexOf('loadEnvCandidates(scopeArg)') - 200,
      pickerSrc.indexOf('loadEnvCandidates(scopeArg)') + 80
    );
    expect(arm).toContain('useEffect');
    expect(sectionSrc).not.toContain('loadEnvCandidates');
  });

  it('no render on this surface can carry a value', () => {
    const renders = [
      renderToStaticMarkup(sheet(model())),
      renderToStaticMarkup(sheet(model({ ticked: ['ANTHROPIC_API_KEY'] }))),
      renderToStaticMarkup(sheet(model({ query: 'MY_NEW_KEY' })))
    ];
    for (const html of renders) {
      expect(html).not.toContain(SENTINEL);
      expect(html).not.toContain('=' + SENTINEL);
    }
  });

  it('the model has no field a value could sit in', () => {
    const m = model({ ticked: ['ANTHROPIC_API_KEY'] });
    const keys = new Set(Object.keys(m.rows[0] ?? {}));
    expect(keys).toEqual(
      new Set(['name', 'ticked', 'locked', 'note', 'capped', 'typed'])
    );
  });

  it('draws every colour through a token', () => {
    for (const r of blocksFor('', pickerCss)) {
      const colours = r.body.match(/(?:^|[\s:])(#[0-9a-fA-F]{3,8}|rgba?\()/g);
      expect(colours, `${r.selector} { ${r.body} }`).toBe(null);
    }
  });

  it('is a form control in a dialog, and never a DOM-drawn context menu', () => {
    expect(pickerSrc).not.toContain('popupMenu');
    expect(pickerSrc).toContain('role="dialog"');
    expect(pickerSrc).toContain('aria-modal="true"');
  });

  it('mutates nothing it was handed', () => {
    const existing = ['ANTHROPIC_API_KEY'];
    const ticked = ['P275_SHELL_NAME_1'];
    const inherited = ['P275_SHELL_NAME_2'];
    const names = [...FIFTY_ONE];
    envPickerModel({
      scope: 'agent',
      existing,
      inherited,
      agentEnvKeys: [],
      candidates: { names, probeFailed: false },
      query: 'P275',
      ticked,
      cap: 16
    });
    expect(existing).toEqual(['ANTHROPIC_API_KEY']);
    expect(ticked).toEqual(['P275_SHELL_NAME_1']);
    expect(inherited).toEqual(['P275_SHELL_NAME_2']);
    expect(names).toEqual(FIFTY_ONE);
  });
});
