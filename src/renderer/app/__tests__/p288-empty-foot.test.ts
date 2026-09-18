/**
 * THE METERS KEEP THE FOOT OF AN EMPTY SESSION LIST (Phase 288).
 *
 * With the session list on the right and no session in the project, the
 * operator photographed the usage meters halfway down the collapsed rail, and
 * the expanded list has the mirror defect at its other end: the full meter
 * sits directly under "No sessions yet". Once a session exists both sit at the
 * foot, directly above the position button. The cause is one fact read at two
 * densities. The list is the one flex item with `flex: 1`, and it is not drawn
 * when there is nothing to list, so the column has free height. In the rail
 * the meter (Phase 181.1) and the footer (Phase 18) BOTH carry
 * `margin-top: auto`, and CSS Flexible Box Layout §8.1 hands free space to auto
 * margins in equal shares, so the meter took half. In the expanded list the
 * meter carried no auto margin at all, so it took none and stayed at the top.
 *
 * The fix is one rule per density: the footer gives up its auto margin when a
 * meter is drawn beside it, and the full meter gains one. probe:p288 reads the
 * rectangles in the running app and is not in the commit battery. This file is
 * what the battery runs, and it holds the things a later tidy-up would undo
 * in a line without any other test noticing: either rule deleted as
 * redundant-looking, `.rail-footer` or the rail's mini rule losing the auto
 * margin the fix depends on, `.dock-stub` growing a `flex: 1` as a second idea
 * for the same defect, the sibling order in SessionDock.tsx moving so the
 * adjacent-sibling rule matches nothing, or the full meter's new rule written
 * as a `margin` shorthand that throws the side insets away. It reads the
 * stylesheets as bytes because there is no CSSOM in this lane, the way
 * p1811-mini-clothes.test.ts and p284-quiet-surround.test.ts next door do.
 *
 * THE FIX ROUND. Both verifiers ran the first version of this file over
 * mutated copies of the sources and found six shapes that reopen the defect
 * with every case green: a wrapper around the mini meter AND the footer
 * together, which keeps them adjacent but takes both auto margins out of the
 * column into block layout; the full meter wrapped, so the child combinator
 * matches nothing; a THIRD auto margin, `margin-bottom: auto` on any of the
 * three rules, which splits the free height again; a later rule of higher
 * specificity handing `.rail-footer` its auto margin back; a fixed
 * `margin-bottom` on the mini meter, which is a gap in every state; and the
 * root class strings in UsageMeter.tsx renamed, which is every selector here
 * matching nothing. So this file now pins the NESTING and not only the order
 * (the two meters are their aside's last children, and the aside closes on
 * them), ENUMERATES every vertical margin a rule naming a meter or the footer
 * sets across the three sheets, holds every vertical auto margin in those
 * sheets to the three the fix depends on, and reads the two root class
 * strings out of UsageMeter.tsx.
 *
 * THE SECOND FIX ROUND. The reverify ran that version over its own mutated
 * copies and found two shapes still green. A wrapper around the meter's root
 * INSIDE UsageMeter.tsx leaves SessionDock.tsx exactly as pinned, while in the
 * DOM the root is no longer its aside's child and all three selectors match
 * nothing; the two root strings swapped between the branches is the same
 * hole, because the case that read them only COUNTED them. So each string is
 * now bound to the element its own branch returns. And `margin-top: AUTO` is
 * an auto margin, because CSS keywords are case-insensitive, so the auto
 * reading folds the case of a value before it looks.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_DIR = join(__dirname, '..');
const read = (...parts: string[]): string =>
  readFileSync(join(APP_DIR, ...parts), 'utf8');

const SHEETS = {
  app: read('..', 'styles', 'app.css'),
  rail: read('session-rail.css'),
  usage: read('usage-meter.css')
} as const;

type SheetName = keyof typeof SHEETS;
const SHEET_NAMES = Object.keys(SHEETS) as SheetName[];

interface Rule {
  selector: string;
  body: string;
}

/** Every rule in a sheet, comments stripped, selector whitespace folded. */
function rulesOf(css: string): Rule[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(bare)) !== null) {
    out.push({
      selector: (match[1] ?? '').trim().replace(/\s+/g, ' '),
      body: (match[2] ?? '').trim()
    });
  }
  return out;
}

const RULES: Record<SheetName, Rule[]> = {
  app: rulesOf(SHEETS.app),
  rail: rulesOf(SHEETS.rail),
  usage: rulesOf(SHEETS.usage)
};

/** The one rule with exactly this selector list. More than one is a finding. */
function rule(sheet: SheetName, selector: string): Rule {
  const found = RULES[sheet].filter((one) => one.selector === selector);
  expect(found.map((one) => one.selector), `${selector} in ${sheet}`).toHaveLength(1);
  return found[0] as Rule;
}

/** The value a rule gives one property, or null. Longhands are not folded. */
function valueOf(body: string, property: string): string | null {
  const escaped = property.replace(/[-]/g, '\\-');
  const match = new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`, 'i').exec(body);
  return match === null ? null : (match[1] ?? '').trim().replace(/\s+/g, ' ');
}

/** The declarations of a body as `property: value` pairs, empties dropped. */
const declarations = (body: string): string[] =>
  body
    .split(';')
    .map((one) => one.trim().replace(/\s+/g, ' '))
    .filter((one) => one !== '');

/** The two rules this phase writes, one per density. */
const RAIL_RULE = '.usage-mini + .rail-footer';
const FULL_RULE = '.session-dock > .usage-full';
/** The rail's mini rule (Phase 181.1), whose auto margin is the whole fix. */
const MINI_RULE = '.session-dock.collapsed > .usage-mini';

/**
 * The properties that can move a flex item along the column. `margin-left`,
 * `margin-right` and `margin-inline` cannot, and are not read.
 */
const VERTICAL_MARGIN_PROPS = new Set([
  'margin',
  'margin-top',
  'margin-bottom',
  'margin-block',
  'margin-block-start',
  'margin-block-end'
]);

/**
 * Whether one declaration hands `auto` to the top or the bottom edge. The
 * `margin` shorthand is read by position (top, horizontal, bottom, with the
 * missing ones copied), so `margin: 0 auto`, which centres a block and moves
 * nothing along a column, is not counted; anything the tokenizer cannot place
 * is counted, because a miss here is the defect coming back unread.
 *
 * The second fix round: a CSS keyword is case-insensitive, so `AUTO` and
 * `Auto` are the same auto margin to the browser. The tokens are lower-cased
 * before they are compared and the fallback ignores case, where the first
 * round compared bytes and read `margin: 0 0 AUTO` as no auto margin at all.
 * Property names and keywords are both ASCII case-insensitive in CSS, so both
 * sides are folded: `verticalMargins` lower-cases the name it collects and
 * `valueOf` ignores case, or `MARGIN-TOP: auto` is never enumerated at all.
 */
function verticalAuto(property: string, value: string): boolean {
  const tokens = value.toLowerCase().split(' ');
  if (property === 'margin' && tokens.length >= 2 && tokens.length <= 4) {
    return tokens[0] === 'auto' || (tokens.length >= 3 && tokens[2] === 'auto');
  }
  if (property === 'margin-block' && tokens.length === 2) {
    return tokens.includes('auto');
  }
  return /\bauto\b/i.test(value);
}

interface Margin {
  sheet: SheetName;
  selector: string;
  property: string;
  value: string;
}

/** Every vertical margin declaration in the three sheets, in source order. */
function verticalMargins(): Margin[] {
  const out: Margin[] = [];
  for (const sheet of SHEET_NAMES) {
    for (const one of RULES[sheet]) {
      for (const declaration of declarations(one.body)) {
        const at = declaration.indexOf(':');
        if (at < 0) continue;
        const property = declaration.slice(0, at).trim().toLowerCase();
        const value = declaration.slice(at + 1).trim();
        if (VERTICAL_MARGIN_PROPS.has(property)) {
          out.push({ sheet, selector: one.selector, property, value });
        }
      }
    }
  }
  return out;
}

/** A selector that names a meter or the footer anywhere in it. */
const NAMES_A_METER_OR_THE_FOOTER =
  /\.(?:rail-footer|usage-mini|usage-full|usage-meter)(?![\w-])|data-slot="usage-meter"/;

const line = (m: Margin): string => `${m.sheet} ${m.selector} { ${m.property}: ${m.value} }`;

describe('the three sheets were read', () => {
  it('finds rules in every one, so nothing below passes on an empty read', () => {
    expect(RULES.rail.length).toBeGreaterThan(2);
    expect(RULES.usage.length).toBeGreaterThan(2);
    expect(RULES.app.length).toBeGreaterThan(200);
  });
});

describe('the collapsed rail', () => {
  it('takes the footer its auto margin when a meter is drawn beside it', () => {
    // With the list gone the meter and the footer were the two auto margins in
    // the column and split the free height between them. Now the meter is the
    // one auto margin and takes it all, so it sits directly on the footer.
    expect(valueOf(rule('rail', RAIL_RULE).body, 'margin-top')).toBe('0');
  });

  it('is one declaration and nothing else', () => {
    expect(declarations(rule('rail', RAIL_RULE).body)).toEqual(['margin-top: 0']);
  });

  it('leaves the footer its own auto margin, for when the meters are off', () => {
    // Both providers off draws no meter, which is every fresh install, and
    // then this is the one auto margin that pins the footer to the foot.
    expect(valueOf(rule('rail', '.rail-footer').body, 'margin-top')).toBe('auto');
  });

  it('leaves the mini meter its auto margin in the rail, which is the whole fix', () => {
    expect(valueOf(rule('usage', MINI_RULE).body, 'margin-top')).toBe('auto');
  });

  it('keeps the meter the footer’s immediate previous sibling in SessionDock.tsx', () => {
    // An adjacent-sibling rule is a sentence about DOM order, and nothing else
    // in the battery reads that order. A wrapper or a reorder between the two
    // would leave the rule matching nothing and the split back.
    //
    // This is deliberately STRICTER than the DOM. A JSX comment, a Fragment or
    // a conditional between the two lines leaves the rendered order intact
    // and still goes red here, because the text is what this lane can read.
    // Whoever loosens it keeps the nesting pin below, which is the one that
    // catches a wrapper around both.
    const dock = read('SessionDock.tsx');
    expect(dock).toMatch(
      /<UsageMeter density="mini" \/>\s*<div className="rail-footer">/
    );
  });
});

describe('the expanded list', () => {
  it('gives the full meter the auto margin it never had', () => {
    // Nothing else in the expanded column carries one, so with the stub the
    // meter drops to the foot and with the list (flex: 1) nothing moves.
    expect(valueOf(rule('usage', FULL_RULE).body, 'margin-top')).toBe('auto');
  });

  it('is one declaration and nothing else', () => {
    expect(declarations(rule('usage', FULL_RULE).body)).toEqual(['margin-top: auto']);
  });

  it('keeps the seam’s side insets on the class rule, and never a shorthand on the new one', () => {
    // `.session-dock > .usage-full` is (0,2,0) against `.usage-full`'s (0,1,0),
    // so a `margin` shorthand there would win every side and drop the 6px
    // insets Phase 284 chose. A longhand touches the top and nothing else.
    expect(valueOf(rule('usage', '.usage-full').body, 'margin')).toBe('0 var(--space-3)');
    expect(valueOf(rule('usage', FULL_RULE).body, 'margin')).toBeNull();
  });

  it('gives the stub no flex, because the fix is the meter’s and lives in its sheet', () => {
    const body = rule('app', '.dock-stub').body;
    expect(valueOf(body, 'flex')).toBeNull();
    expect(valueOf(body, 'flex-grow')).toBeNull();
    expect(valueOf(body, 'margin-top')).toBeNull();
    expect(valueOf(body, 'margin-bottom')).toBeNull();
  });
});

describe('the nesting, read as text (the fix round)', () => {
  // The adjacency regex above is satisfied by a wrapper around BOTH the meter
  // and the footer, and that wrapper is the defect back in a new coat: the
  // `+` rule still matches, `.session-dock.collapsed > .usage-mini` no longer
  // does, and both auto margins fall out of the flex column into block
  // layout, where `auto` is 0. So the pair is pinned as the collapsed aside's
  // LAST TWO CHILDREN at the aside's own child depth, with the aside closing
  // on the footer. A wrapper that is re-indented moves the meter line to ten
  // spaces; one that is not leaves its own `</div>` between the footer's and
  // `</aside>`. Either is red.
  const dock = read('SessionDock.tsx');
  const RAIL_TAIL =
    /\n {8}<UsageMeter density="mini" \/>\n {8}<div className="rail-footer">\n {10}<SessionsPositionButton \/>\n {8}<\/div>\n {6}<\/aside>/g;
  // The full meter the same way: the expanded aside's last child, at its
  // child depth, and the aside closing on it. A wrapper here is the child
  // combinator matching nothing and the meter back under the stub.
  const LIST_TAIL = /\n {6}<UsageMeter density="full" \/>\n {4}<\/aside>/g;

  it('keeps the mini meter and the footer the collapsed aside’s last two children, unwrapped', () => {
    expect([...dock.matchAll(RAIL_TAIL)].map((m) => m.index)).toHaveLength(1);
  });

  it('keeps the full meter the expanded aside’s last child, unwrapped', () => {
    expect([...dock.matchAll(LIST_TAIL)].map((m) => m.index)).toHaveLength(1);
  });

  it('pins each tail to its own aside, in the order the file returns them', () => {
    // Two asides, two tails: the collapsed one first. Without this a tail
    // could match inside the other aside and the pin would say nothing.
    const collapsedOpen = dock.indexOf('className="session-dock collapsed"');
    const expandedOpen = dock.search(/className="session-dock"\s/);
    const railTail = dock.search(RAIL_TAIL);
    const listTail = dock.search(LIST_TAIL);
    expect(collapsedOpen).toBeGreaterThanOrEqual(0);
    expect(railTail).toBeGreaterThan(collapsedOpen);
    expect(expandedOpen).toBeGreaterThan(railTail);
    expect(listTail).toBeGreaterThan(expandedOpen);
  });

  it('reads the two root class strings out of UsageMeter.tsx, once each, on the element each branch returns', () => {
    // Every selector in this file matches on `usage-mini` and `usage-full`.
    // Renamed in the component, they all match nothing and every case above
    // stays green over a rule that reaches no element.
    const meter = read('UsageMeter.tsx');
    expect(meter.match(/className="usage-meter usage-mini"/g)).toHaveLength(1);
    expect(meter.match(/className="usage-meter usage-full"/g)).toHaveLength(1);

    // The second fix round. The two counts say each string exists and not
    // WHERE. Both rules need the meter's ROOT to be its aside's direct child,
    // and SessionDock.tsx can pin where the component sits but not what it
    // returns. A wrapper around the root inside the component, being
    // `<div className="usage-host">` above it, left all 20 cases green with
    // all three selectors matching nothing in the DOM. So did the two strings
    // swapped between the branches, which is the full meter's class in the
    // rail and the mini's in the list. So each string is bound to the FIRST
    // element its own branch returns: the `density === 'full'` return, and
    // the return at the component's own depth that every other density falls
    // through to, which is the mini one. Stricter than the DOM again, because
    // a Fragment or a re-indent is red too, and the text is what this lane
    // can read.
    const FULL_ROOT =
      /density === 'full'\) \{\n {4}return \(\n {6}<div\n {8}ref=\{hostRef\}\n {8}className="usage-meter usage-full"\n {8}data-slot="usage-meter"/g;
    const MINI_ROOT =
      /\n {2}return \(\n {4}<div\n {6}ref=\{hostRef\}\n {6}className="usage-meter usage-mini"\n {6}data-slot="usage-meter"/g;
    expect(meter.match(FULL_ROOT)).toHaveLength(1);
    expect(meter.match(MINI_ROOT)).toHaveLength(1);
  });
});

describe('the vertical margins, enumerated (the fix round)', () => {
  it('sets a vertical margin on a meter or the footer in exactly five places', () => {
    // Every rule across the three sheets that names a meter or the footer and
    // touches a vertical margin, as `sheet selector { property: value }`. A
    // sixth line is a third idea about the column: a later rule of higher
    // specificity handing `.rail-footer` its auto margin back, a fixed
    // `margin-bottom` on the mini meter that is a gap in every state, or a
    // shorthand rewrite of any of the five. A tidy-up that needs a sixth
    // writes it here on purpose, beside the reason.
    const found = verticalMargins()
      .filter((m) => NAMES_A_METER_OR_THE_FOOTER.test(m.selector))
      .map(line)
      .sort();
    expect(found).toEqual(
      [
        'rail .rail-footer { margin-top: auto }',
        `rail ${RAIL_RULE} { margin-top: 0 }`,
        `usage ${FULL_RULE} { margin-top: auto }`,
        `usage ${MINI_RULE} { margin-top: auto }`,
        'usage .usage-full { margin: 0 var(--space-3) }'
      ].sort()
    );
  });

  it('gives no rule a margin-bottom, on either meter or the footer', () => {
    // The shape both verifiers named first: `margin-bottom: auto` on any of
    // these is a THIRD auto margin, and §8.1 splits the free height again.
    for (const [sheet, selector] of [
      ['rail', '.rail-footer'],
      ['rail', RAIL_RULE],
      ['usage', MINI_RULE],
      ['usage', '.usage-full'],
      ['usage', FULL_RULE]
    ] as const) {
      expect(valueOf(rule(sheet, selector).body, 'margin-bottom'), selector).toBeNull();
      expect(valueOf(rule(sheet, selector).body, 'margin-block-end'), selector).toBeNull();
    }
  });

  it('holds every vertical auto margin in the three sheets to the three the fix depends on', () => {
    // Read over EVERY rule, whatever its selector, so an auto margin reached
    // through `[data-slot]`, a universal selector or a new class is a finding
    // too. The three: the footer's own, the rail's mini rule and the full
    // meter's new one. Their sharing is the whole phase.
    const found = verticalMargins()
      .filter((m) => verticalAuto(m.property, m.value))
      .map(line)
      .sort();
    expect(found).toEqual(
      [
        'rail .rail-footer { margin-top: auto }',
        `usage ${FULL_RULE} { margin-top: auto }`,
        `usage ${MINI_RULE} { margin-top: auto }`
      ].sort()
    );
  });
});

describe('the populated case, which must not move', () => {
  // With a session the list takes every spare pixel, both auto margins resolve
  // to zero and nothing this phase wrote can be seen. That holds only while
  // the lists keep `flex: 1`.
  it('keeps the rail list and the dock list at flex: 1', () => {
    expect(valueOf(rule('rail', '.rail-list').body, 'flex')).toBe('1');
    expect(valueOf(rule('app', '.dock-list').body, 'flex')).toBe('1');
  });
});

describe('every colour is a token', () => {
  // conformance:hue rule 26 is the gate, and it takes 13 minutes. These are
  // its two patterns (build/conformance-hue.mjs, COLOUR_IN_VALUE and
  // COLOUR_NAME_IN_VALUE), read over the two rules this phase writes.
  const COLOUR_IN_VALUE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(\s*[\d.]/;
  const COLOUR_NAME_IN_VALUE = /(?:^|[\s,(])(?:white|black)(?=$|[\s,;)])/i;

  for (const [sheet, selector] of [
    ['rail', RAIL_RULE],
    ['usage', FULL_RULE]
  ] as const) {
    it(`${selector} holds no colour literal`, () => {
      const body = rule(sheet, selector).body;
      expect(body).not.toMatch(COLOUR_IN_VALUE);
      expect(body).not.toMatch(COLOUR_NAME_IN_VALUE);
      expect(body).not.toMatch(/#|rgb\(|hsl\(/);
    });
  }
});
