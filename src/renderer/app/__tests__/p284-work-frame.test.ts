/**
 * Phase 284, the quiet surround. The WORK's half: one outline, and everything
 * the work draws sits inside its curve.
 *
 * These are source-level assertions, for the reason work-area.test.ts gives:
 * what they guard needs a real layout engine and a real xterm to observe
 * (`probe:p284` is where it is observed), and each is cheap to break from a
 * file that looks unrelated.
 *
 *  - THE ONE OUTLINE. The point of the look is that the window has exactly one
 *    complete outline at region size. A second one can arrive from ANY
 *    stylesheet in the renderer, so the census below walks all of them rather
 *    than reading work-area.css and believing it.
 *  - NOTHING OVER A LIVE TERMINAL MOVES. Every animated frame on a box xterm
 *    is laid out in is a ResizeObserver fit and a resize sent to a real
 *    session (DESIGN.md §5, DESIGN-SPEC S12.7). The frame added rules to the
 *    terminal's own containers, which is exactly where such a declaration
 *    would do that damage, so the census holds them to none.
 *  - THE SCROLL LANE, THE DROP WASH AND THE EDITOR'S FIRST TAB each sit in a
 *    corner of the frame in one state, and each is outside the frame's clip
 *    or cut badly by it unless it carries a rule of its own. The arithmetic
 *    that says so is re-derived here from the tokens rather than copied.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  FRAME_EDGE,
  FRAME_GAP,
  FRAME_RADIUS,
  frameReservedWidth
} from '../../state/chrome-geometry';

const RENDERER = join(__dirname, '..', '..');
const read = (...parts: string[]): string =>
  readFileSync(join(RENDERER, ...parts), 'utf8');

/** A stylesheet with every comment removed. */
const bare = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  file: string;
  selectors: string[];
  decls: [string, string][];
}

/**
 * Every innermost rule of a stylesheet. A rule inside an at-rule is read with
 * its own selector, which is what matters here; a keyframe's `from` and `to`
 * come back as selectors too and match nothing below.
 */
function rulesOf(file: string, css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of bare(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (m[1] ?? '')
      .replace(/@import[^;]*;/g, '')
      .split(',')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter((s) => s.length > 0);
    const decls = (m[2] ?? '')
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d.includes(':'))
      .map((d): [string, string] => {
        const at = d.indexOf(':');
        return [d.slice(0, at).trim().toLowerCase(), d.slice(at + 1).trim()];
      });
    out.push({ file, selectors, decls });
  }
  return out;
}

function stylesheets(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) stylesheets(path, out);
    else if (name.endsWith('.css')) out.push(path);
  }
  return out;
}

const SHEETS = stylesheets(RENDERER);
const ALL: Rule[] = SHEETS.flatMap((path) =>
  rulesOf(relative(RENDERER, path), readFileSync(path, 'utf8'))
);

/**
 * The SUBJECT of a selector: its last compound, which is the element the rule
 * styles. Functional pseudo-classes are emptied first, because `:has(> .x)`
 * and `:not(.focused)` carry combinators and class names that describe some
 * OTHER element.
 */
function subject(selector: string): string {
  let flat = selector;
  for (;;) {
    const next = flat.replace(/\([^()]*\)/g, '');
    if (next === flat) break;
    flat = next;
  }
  const parts = flat
    .trim()
    .split(/\s*[>+~]\s*|\s+/)
    .filter((p) => p.length > 0);
  return parts[parts.length - 1] ?? '';
}

const hasClass = (compound: string, name: string): boolean =>
  new RegExp(`\\.${name}(?![\\w-])`).test(compound);

/**
 * Every box a live terminal is laid out in, from the frame down to xterm's
 * mount. `.work-area > *` reaches the first two by structure, not by name.
 */
const TERMINAL_CONTAINERS = [
  'work-area',
  'work-row',
  'center',
  'term-body',
  'surface-root',
  'surface-single',
  'split-root',
  'split-node',
  'split-cell',
  'split-pane',
  'split-pane-body',
  'gmux-terminal-host',
  'gmux-terminal-pane',
  'gmux-terminal-mount'
];

function stylesATerminalContainer(selector: string): boolean {
  if (/\.work-area\s*>\s*(\*|:first-child|:last-child)$/.test(selector)) {
    return true;
  }
  const last = subject(selector);
  return TERMINAL_CONTAINERS.some((name) => hasClass(last, name));
}

/** `selector | property`, for every declaration `wanted` accepts. */
function census(wanted: (prop: string) => boolean): string[] {
  const found: string[] = [];
  for (const rule of ALL) {
    for (const selector of rule.selectors) {
      if (!stylesATerminalContainer(selector)) continue;
      for (const [prop] of rule.decls) {
        if (wanted(prop)) found.push(`${rule.file} | ${selector} | ${prop}`);
      }
    }
  }
  return found.sort();
}

// ---------------------------------------------------------------------------
// The one outline
// ---------------------------------------------------------------------------

describe('the one outline (Phase 284)', () => {
  /** A line round a box: a border that is not a radius, or an outline. */
  const drawsALine = (prop: string): boolean =>
    (prop.startsWith('border') && !prop.endsWith('radius')) ||
    prop.startsWith('outline');

  it('walks a real set of stylesheets, so an empty census is not a pass', () => {
    expect(SHEETS.length).toBeGreaterThan(40);
    expect(ALL.length).toBeGreaterThan(1000);
  });

  it('is drawn by exactly ONE rule in the renderer, and that rule is the frame’s ::after', () => {
    // Two rules put a line round a box a terminal is laid out in, and only
    // the first is at region size. The second is Phase 40's focused-split
    // box, which exists only inside a group of two or more and is what the
    // probe's reading R4 names as the one sanctioned second outline.
    expect(census(drawsALine)).toEqual([
      'app/work-area.css | .work-area::after | border',
      "styles/app.css | .surface-root:not([data-leaf-count='1']) .split-pane.focused::after | border"
    ]);
  });

  it('is an overlay: a pseudo-element that takes no pointer event', () => {
    const lines = ALL.filter((r) => r.selectors.includes('.work-area::after'));
    // Only work-area.css names the bare selector. focus-mode.css section 7
    // takes the line away under a `.shell` prefix, and the next case reads it.
    expect(lines.map((r) => r.file).sort()).toEqual(['app/work-area.css']);
    const decls = new Map(lines[0]?.decls ?? []);
    expect(decls.get('pointer-events')).toBe('none');
    expect(decls.get('position')).toBe('absolute');
    expect(decls.get('content')).toBe("''");
    // No frame is drawn with `::before`, here or anywhere.
    expect(
      ALL.filter((r) =>
        r.selectors.some((s) => hasClass(subject(s), 'work-area') && s.includes('::before'))
      )
    ).toEqual([]);
  });

  it('is turned off by one rule and drawn by no other', () => {
    const touching = ALL.filter((r) =>
      r.selectors.some((s) => s.endsWith('.work-area::after'))
    ).map((r) => `${r.file} | ${r.decls.map(([p, v]) => `${p}: ${v}`).join('; ')}`);
    expect(touching.sort()).toEqual([
      'app/focus-mode.css | display: none',
      "app/work-area.css | content: ''; position: absolute; inset: calc(-1 * var(--frame-edge)); border: var(--frame-edge) solid var(--border-strong); border-radius: var(--r-frame); pointer-events: none; z-index: calc(var(--z-editor-overlay) + 1)"
    ]);
  });

  it('takes its colour from a token, and the strongest rung of the border ramp', () => {
    const line = ALL.find((r) => r.selectors.includes('.work-area::after'));
    const border = new Map(line?.decls ?? []).get('border') ?? '';
    expect(border).toContain('var(--border-strong)');
    expect(border).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});

// ---------------------------------------------------------------------------
// Nothing over a live terminal moves
// ---------------------------------------------------------------------------

describe('no terminal container gained motion, opacity or a shadow (Phase 284)', () => {
  it('declares no transition and no animation on any of them', () => {
    expect(
      census((p) => p.startsWith('transition') || p.startsWith('animation'))
    ).toEqual([]);
  });

  it('declares no box-shadow on any of them, inset or otherwise', () => {
    // xterm's canvas and the header backgrounds paint over an inset shadow,
    // which is why both the frame and Phase 40's box are overlays.
    expect(census((p) => p === 'box-shadow')).toEqual([]);
  });

  it('declares opacity on exactly the one Phase 40 already had', () => {
    // The unfocused split's one-step-back dim: static, a token, on the pane
    // BODY and never on its header. It was here before the frame. The frame
    // adds none, on the container or on its line.
    expect(census((p) => p === 'opacity')).toEqual([
      "styles/app.css | .surface-root:not([data-leaf-count='1']) .split-pane:not(.focused) .split-pane-body | opacity"
    ]);
  });

  it('adds none of the four in the three sheets the frame’s own rules live in', () => {
    // work-area.css as a whole, and the rules this phase added to the others.
    const BANNED = /^(transition|animation|opacity$|box-shadow$)/;
    const added = ALL.filter(
      (r) =>
        r.file === 'app/work-area.css' ||
        r.selectors.some(
          (s) =>
            s.includes('.work-area') &&
            (r.file === 'app/focus-mode.css' || r.file === 'editor/editor.css')
        )
    );
    expect(added.length).toBeGreaterThanOrEqual(9);
    for (const rule of added) {
      for (const [prop] of rule.decls) {
        expect(prop, `${rule.file} | ${rule.selectors.join(', ')}`).not.toMatch(
          BANNED
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The three things that sit in a corner of the frame
// ---------------------------------------------------------------------------

/** A `--name: <n>px` declaration, as a number. */
function px(css: string, name: string): number {
  const hit = new RegExp(`${name}:\\s*([\\d.]+)px\\s*;`).exec(bare(css));
  expect(hit, `${name} must be declared in px`).not.toBeNull();
  return Number(hit?.[1]);
}

const geometry = read('app', 'frame-geometry.css');
const tokens = read('styles', 'tokens.css');
const INNER = px(geometry, '--r-frame') - px(geometry, '--frame-edge');
const INNER_CSS = 'calc(var(--r-frame) - var(--frame-edge))';

/** How far the inner arc has come in, `x` pixels along the edge from a corner. */
const arcDepth = (x: number): number =>
  x >= INNER ? 0 : INNER - Math.sqrt(INNER * INNER - (INNER - x) * (INNER - x));

function onlyRule(file: string, selector: string): Map<string, string> {
  const hits = ALL.filter(
    (r) => r.file === file && r.selectors.length === 1 && r.selectors[0] === selector
  );
  expect(hits, `one "${selector}" rule in ${file}`).toHaveLength(1);
  return new Map(hits[0]?.decls ?? []);
}

describe('the scroll lane’s foot (Phase 284)', () => {
  const lane = onlyRule('terminal/scroll/scrollbar.css', '.gmux-terminal-scrollbar');

  it('is lifted by --space-4, and still pinned to the top and the right', () => {
    expect(lane.get('bottom')).toBe('var(--space-4)');
    expect(lane.get('top')).toBe('0');
    expect(lane.get('right')).toBe('0');
    expect(lane.get('position')).toBe('absolute');
  });

  it('clears the curve: the lift is more than the arc’s depth under the thumb', () => {
    // At live output the thumb rests at the lane's foot, which in the pane at
    // the frame's bottom-right corner is under the curve. Its right edge is
    // --scroll-thumb-inset in from the work's right edge.
    const lift = px(tokens, '--space-4');
    const inset = px(tokens, '--scroll-thumb-inset');
    const hover = px(tokens, '--scroll-thumb-w-hover');
    expect(arcDepth(inset)).toBeCloseTo(4.69, 2);
    expect(arcDepth(inset + hover)).toBeCloseTo(0.63, 2);
    expect(lift).toBeGreaterThan(arcDepth(inset));
    // And the whole thumb is inside the lane the fit addon reserves.
    expect(inset + hover).toBeLessThanOrEqual(px(tokens, '--scroll-lane'));
  });

  it('gained no motion of its own on the lane', () => {
    for (const prop of lane.keys()) {
      expect(prop).not.toMatch(/^(transition|animation|opacity$)/);
    }
  });
});

describe('the file drop wash (Phase 284)', () => {
  const wash = onlyRule('terminal/drop/drop.css', '.attach-drop-zone');

  it('wears the frame’s inner radius, because no clip of the frame’s can reach a fixed portal', () => {
    expect(wash.get('position')).toBe('fixed');
    expect(wash.get('border-radius')).toBe(INNER_CSS);
    // Still load-bearing: elementFromPoint must keep seeing the leaf.
    expect(wash.get('pointer-events')).toBe('none');
  });

  it('still snaps on and off, with nothing to fade over a live terminal', () => {
    const sheet = ALL.filter((r) => r.file === 'terminal/drop/drop.css');
    for (const rule of sheet) {
      for (const [prop] of rule.decls) {
        expect(prop, rule.selectors.join(', ')).not.toMatch(
          /^(transition|animation)/
        );
      }
    }
  });
});

describe('the editor at the top of the frame (Phase 284)', () => {
  const FIRST_TAB =
    '.work-area > .work-row:first-child > .ed-panel.ed-fill .ed-tab:first-child';
  const TABS_ROW = '.work-area > .work-row:first-child .ed-tabs';

  it('rounds the first tab in the ONE state that puts it in the frame’s corner', () => {
    // Fill mode in the "right" orientation: no strip above the row, and the
    // panel starts at the work's left edge. An inset box-shadow follows its
    // own box's radius, so the 2px accent and the focus ring follow the curve.
    const tab = onlyRule('editor/editor.css', FIRST_TAB);
    expect([...tab.entries()]).toEqual([['border-top-left-radius', INNER_CSS]]);
    // The accent really is an inset shadow, or the radius buys nothing.
    expect(onlyRule('editor/editor.css', '.ed-tab.active').get('box-shadow')).toBe(
      'inset 0 2px 0 var(--accent)'
    );
  });

  it('would otherwise cut the accent bar where the arc is as deep as the bar', () => {
    // The bar is 2px tall. The arc is 2px deep about 6px along the edge, so a
    // square tab's bar stopped dead there, well inside a 10px padded tab.
    const x = INNER - Math.sqrt(INNER * INNER - (INNER - 2) * (INNER - 2));
    expect(x).toBeCloseTo(6.07, 2);
    expect(arcDepth(10)).toBeCloseTo(0.35, 2);
  });

  it('takes the colour of the tabs row’s top rule and keeps its pixel', () => {
    // `--border` directly under the frame's `--border-strong` is a 2px double
    // rule. The colour goes and the pixel stays, so the row is still 36px.
    const row = onlyRule('editor/editor.css', TABS_ROW);
    expect([...row.entries()]).toEqual([['border-top-color', 'transparent']]);
    const base = onlyRule('editor/editor.css', '.ed-tabs');
    expect(base.get('border-top')).toBe('1px solid var(--border)');
    expect(base.get('height')).toBe('36px');
  });

  it('keeps the seam between the terminal and a split editor', () => {
    // A seam INSIDE the work, like a split's divider. The study keeps it
    // (design/prototypes/styles.css:158) and so does this phase.
    expect(onlyRule('editor/editor.css', '.ed-panel').get('border-left')).toBe(
      '1px solid var(--border)'
    );
    expect(
      onlyRule('editor/editor.css', '.ed-panel.ed-fill').get('border-left')
    ).toBe('none');
  });
});

describe('the editor’s foot (Phase 284 fix round, corrected in Phase 284.1)', () => {
  // The verifier scrolled a 400 line file to its end with the editor beside
  // the terminal: Monaco's vertical slider reached the frame's bottom-right
  // corner and the arc cut it, exactly as the scroll lane's thumb would have
  // without its lift. The roots the body draws come in THREE kinds: absolute
  // at `inset: 0` (Monaco's host, the diff, the preview, an image), static
  // in flow at `height: 100%` (the report, the context card) and RELATIVE in
  // flow at `height: 100%` (the map, for its drill overlay). The fix round
  // lifted the first two with a padding plus a per-child `bottom`, and the
  // third kind moved UP 8px under that `bottom`, painting over the tab strip
  // and ending 16px above the frame (build/p284/SPEC.md S14.4). The body now
  // ends 8px above the panel through ONE margin, and no root carries a rule.
  const SURFACES =
    '.ed-host, .ed-mount, .ed-diff, .ed-split, .ed-skeleton, .ed-state';
  const body = onlyRule('editor/editor.css', '.ed-body');
  const roots = ALL.filter(
    (r) => r.file === 'editor/editor.css' && r.selectors.some((s) => /\.ed-body\s*>\s*\*/.test(s))
  );

  it('lifts every root through the body’s margin, and through no padding', () => {
    expect(body.get('margin-bottom')).toBe('var(--space-4)');
    expect(body.get('padding-bottom')).toBeUndefined();
    expect(body.get('position')).toBe('relative');
  });

  it('positions no root by structure: the per-child rule is gone, and the surfaces keep inset 0', () => {
    // The margin shortens the body's own box, which is the box an absolute
    // root at `inset: 0` is placed against and an in-flow root at
    // `height: 100%` resolves against, so no `.ed-body > *` rule exists any
    // more, and none may come back: a `bottom` there lifted the map twice.
    // The shared surfaces rule is still `inset: 0`, lifted once by its root
    // and never a second time: the first build lifted it directly and Monaco
    // moved 16px, because its mount sits inside its host and both matched.
    expect(roots.map((r) => r.selectors.join(', '))).toEqual([]);
    const shared = ALL.filter(
      (r) => r.file === 'editor/editor.css' && r.selectors.join(', ') === SURFACES
    );
    expect(shared, `one "${SURFACES}" rule`).toHaveLength(1);
    expect(new Map(shared[0]?.decls ?? []).get('inset')).toBe('0');
  });

  it('reaches the relative root and the static ones through their own height', () => {
    // The two in-flow roots are `height: 100%` of the body, and the map is
    // the one that is `position: relative`, which is why a `bottom` on it
    // was a move and not a lift. Neither declares a `bottom` of its own.
    const map = onlyRule('arch/arch.css', '.arch-map-tab');
    expect(map.get('position')).toBe('relative');
    expect(map.get('height')).toBe('100%');
    expect(map.get('bottom')).toBeUndefined();
    expect(map.get('top')).toBeUndefined();
    const report = onlyRule('diagnostics/diagnostics.css', '.diag');
    expect(report.get('height')).toBe('100%');
    expect(report.get('position')).toBeUndefined();
  });

  it('is the same foot the terminal keeps, so the two surfaces end level', () => {
    expect(
      onlyRule('terminal/scroll/scrollbar.css', '.gmux-terminal-scrollbar').get(
        'bottom'
      )
    ).toBe('var(--space-4)');
    // Monaco's slider is flush with the work's right edge, so at the foot the
    // arc still reaches 1px into its outermost column. That pixel is stated
    // here rather than chased: lifting by the arc's full depth would put the
    // editor's last line 13px above the terminal's.
    const lift = px(tokens, '--space-4');
    const residual = INNER - Math.sqrt(INNER * INNER - (INNER - lift) * (INNER - lift));
    expect(residual).toBeCloseTo(1, 5);
  });
});

describe('the focused-split box at the frame’s corner (Phase 284 fix round)', () => {
  // Phase 40's ring sits at the pane's outermost pixel. Where the focused
  // pane's corner IS the frame's corner, the row's 13px clip cut the ring
  // square: measured by the verifier at x=work.left in the probe's own C
  // photograph, the ring's left edge stopped 12px above the bottom and the
  // frame's grey arc closed the corner instead. These rules give the ring the
  // inner radius on that corner only, so it follows the arc the way the first
  // tab does (§4.4), and the corner leaf is found by STRUCTURE rather than by
  // a stamp on the DOM.
  const BL =
    '.split-pane.focused:not(:is(.split-node.row > .split-cell:last-child, .split-node.column > .split-cell:first-child) .split-pane)::after';
  const BR =
    '.work-row > .center:last-child .split-pane.focused:not(.split-cell:first-child .split-pane)::after';
  const ruleFor = (selector: string): Map<string, string> => {
    const hits = ALL.filter(
      (r) => r.file === 'app/work-area.css' && r.selectors.join(', ') === selector
    );
    expect(hits, `one "${selector}" rule in app/work-area.css`).toHaveLength(1);
    return new Map(hits[0]?.decls ?? []);
  };

  it('rounds the bottom-left corner of the leaf no non-corner cell contains', () => {
    // A pane is at the tree's bottom-left when NO ancestor cell is the right
    // half of a row or the top half of a column, at any depth. `:not()` with
    // a complex selector says exactly "no such ancestor".
    expect([...ruleFor(BL).entries()]).toEqual([
      ['border-bottom-left-radius', 'var(--frame-corner)']
    ]);
  });

  it('rounds the bottom-right corner only while the terminal stack owns it', () => {
    // A split editor beside the stack owns the frame's bottom-right, and the
    // seam between them is straight. EditorPanel renders null when closed,
    // so `.center:last-child` is "no editor is drawn".
    expect([...ruleFor(BR).entries()]).toEqual([
      ['border-bottom-right-radius', 'var(--frame-corner)']
    ]);
  });

  it('reads the corner from ONE property the frame declares and focus mode zeroes', () => {
    // `inherit` reaches a direct child only; the ring is six levels down. The
    // property carries the inner radius to it, and focus-mode.css section 7
    // sets it to 0 in the same twin rule that squares the frame, so a ring at
    // the window's square corner is square too.
    expect(onlyRule('app/work-area.css', '.work-area').get('--frame-corner')).toBe(
      INNER_CSS
    );
    const off = ALL.filter(
      (r) =>
        r.file === 'app/focus-mode.css' &&
        r.selectors.includes('.shell.session-focus .work-area') &&
        r.selectors.includes('.shell.gmux-focus-measure .work-area')
    );
    expect(off).toHaveLength(1);
    expect(new Map(off[0]?.decls ?? []).get('--frame-corner')).toBe('0');
  });

  it('adds no line: the ring is still drawn by Phase 40’s one rule', () => {
    for (const selector of [BL, BR]) {
      for (const prop of ruleFor(selector).keys()) {
        expect(prop).toMatch(/^border-bottom-(left|right)-radius$/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The gutters are the width model's gutters
// ---------------------------------------------------------------------------

describe('the gutters the stylesheet opens are the ones the width model takes out (Phase 284)', () => {
  // ../state/chrome-geometry.ts predicts the terminal's width from the window
  // and the chrome, and everything that seats the editor trusts it. The
  // margins in work-area.css ARE the term it subtracts, so the two are held
  // together here BY VALUE: which sides open, when, and by how much.
  const frame = onlyRule('app/work-area.css', '.work-area');
  const beside = onlyRule('app/work-area.css', "[data-slot='sidebar'] + .work-area");

  /** `margin: top right bottom left`, each as a count of `--frame-gap`. */
  const sides = (frame.get('margin') ?? '').split(/\s+/).map((part) => {
    if (part === '0') return 0;
    expect(part, 'a gutter is --frame-gap or nothing').toBe('var(--frame-gap)');
    return 1;
  });

  it('declares four sides, in gaps', () => {
    expect(sides).toEqual([0, 1, 1, 0]);
  });

  it('takes one gap out of the row with the sidebar away, and two with it drawn', () => {
    const [, right = 0, , left = 0] = sides;
    const leftBesideSidebar =
      beside.get('margin-left') === 'var(--frame-gap)' ? 1 : left;
    expect((left + right) * FRAME_GAP).toBe(
      frameReservedWidth({ sidebarVisible: false })
    );
    expect((leftBesideSidebar + right) * FRAME_GAP).toBe(
      frameReservedWidth({ sidebarVisible: true })
    );
  });

  it('reads the same three numbers the model exports', () => {
    expect(px(geometry, '--frame-gap')).toBe(FRAME_GAP);
    expect(px(geometry, '--frame-edge')).toBe(FRAME_EDGE);
    expect(px(geometry, '--r-frame')).toBe(FRAME_RADIUS);
    expect(INNER).toBe(FRAME_RADIUS - FRAME_EDGE);
  });

  it('keeps the line out of the width: no border, padding or edge term on the frame', () => {
    // FRAME_EDGE is exported for the radius arithmetic and is in no width
    // formula, which is only true while the line is drawn in the gutter.
    expect(frame.get('margin')).not.toContain('--frame-edge');
    for (const prop of frame.keys()) {
      expect(prop).not.toMatch(/^(padding|border(?!-radius))/);
    }
  });
});

// ---------------------------------------------------------------------------
// The flying copy
// ---------------------------------------------------------------------------

describe('the flying copy’s radius (Phase 284)', () => {
  const flight = read('app', 'focus-flight.ts');
  const copy = read('app', 'focus-copy.ts');
  /** TypeScript with block and line comments removed. */
  const code = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('is read from the two tokens, and neither number is written down', () => {
    expect(flight).toContain("getPropertyValue('--r-frame')");
    expect(flight).toContain("getPropertyValue('--frame-edge')");
    for (const source of [code(flight), code(copy)]) {
      expect(source).not.toMatch(/\b1[34](\.0+)?\b/);
      // chrome-geometry.ts forbids a second copy of a layout constant, and
      // importing one here would tie a photograph to the width model.
      expect(source).not.toContain('chrome-geometry');
    }
  });

  it('is clipped by the rule the copy already had, so no child is added for it', () => {
    const rule = onlyRule('app/focus-mode.css', '.gmux-focus-copy');
    expect(rule.get('overflow')).toBe('hidden');
    expect(rule.get('position')).toBe('fixed');
  });

  it('is never animated: the one keyframe still names only transform', () => {
    expect(code(flight).match(/\.animate\(/g)).toHaveLength(1);
    expect(code(flight)).not.toMatch(/borderRadius|border-radius/);
    expect(code(copy)).not.toMatch(/\.animate\(|transition|animation/i);
  });
});
