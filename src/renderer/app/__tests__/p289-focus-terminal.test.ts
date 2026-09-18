/**
 * Phase 289, mechanism item 4: `focusTerminal()` prefers the pane that is
 * outlined.
 *
 * The recorded defect (Phase 286's reverify, its finding N1): the helper asked
 * for `.gmux-terminal-mount textarea`, which `querySelector` answers with the
 * FIRST one in document order. In a split whose selected pane is not the first
 * one, Enter on a session row put the keyboard in the first pane while the
 * outline sat on another, and the menu path into session focus, which Phase
 * 286 taught to land in the outlined pane, disagreed with it from the same
 * seat.
 *
 * What is held here:
 *  - two panes with the SECOND one marked focused end with the second one's
 *    textarea holding the keyboard. This is the case that is red at the
 *    parent, where the first pane took it;
 *  - nothing marked falls back to document order, which is what every caller
 *    had before and must keep when the marks are absent;
 *  - a surface of one (`.surface-single`) is its own pane;
 *  - a marked pane that draws no terminal (its session ended, so the leaf
 *    draws its ended state and no textarea) falls back the same way, because
 *    the compound selector matches nothing there;
 *  - no textarea anywhere focuses nothing and does not throw;
 *  - the selector is Phase 286's own constant, imported and never spelled a
 *    second time, so the two doors cannot drift apart again;
 *  - no other file under src/renderer asks `querySelector` for the terminal's
 *    textarea itself. Five doors did, each landing in the first pane while
 *    the helper landed in the outlined one, so the fix above reached none of
 *    them. The pin reads every file as TEXT, and each file that keeps its
 *    own question is named in a table with the reason;
 *  - no other file SPELLS the terminal's textarea at all (the fix round, from
 *    the re-derive verifier's R3). The pin above saw one spelling, a string
 *    literal inside the call, and the likeliest sixth door walked past it:
 *    `querySelector('.xterm-helper-textarea')?.focus()` beside the helper
 *    call left every test green. A door has to spell the selector SOMEWHERE
 *    in its file, in the call, in a constant or in two halves, so the file is
 *    what is asked, and the verifier's nine hostile shapes are the fixture.
 *
 * WHAT A TEXT PIN STILL CANNOT SEE, stated rather than implied: a selector
 * assembled from pieces that are each innocent (`'.xterm-helper-' + kind`), a
 * bare `querySelector('textarea')` with no mount beside it, and a door that
 * reaches the terminal without a selector at all, the way TerminalPane.tsx
 * calls xterm's own `focus()`. Those are a reviewer's.
 *
 * The vitest environment is node and jsdom is not a dependency of this
 * repository, so the document is the same hand built shape
 * focus-flight.test.ts uses. It models the one thing under test, which is
 * what `querySelector` answers for the two selectors over panes in document
 * order.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

vi.mock('../../state/store', () => ({
  useApp: { getState: () => ({ sessions: [], projects: [] }) },
  effectiveStatusOf: () => 'running'
}));

vi.mock('../focus-copy', () => ({
  buildStillCopy: vi.fn(() => Promise.resolve(null))
}));

/**
 * The outlined pane's textarea, spelled out here rather than imported, the
 * way focus-flight.test.ts spells it, so a change to the constant has to be
 * made in two places on purpose.
 */
const OUTLINED_PANE_TEXTAREA =
  '.split-pane.focused .xterm-helper-textarea, ' +
  '.surface-single .xterm-helper-textarea';
/** The selector the helper has always asked, which is now the fallback. */
const FIRST_TEXTAREA = '.gmux-terminal-mount textarea';

interface Textarea {
  name: string;
  focus: ReturnType<typeof vi.fn>;
}

/** One pane of the surface, in document order. */
interface Pane {
  /** The marks the pane's wrapper wears. */
  marks: ('split-pane' | 'focused' | 'surface-single')[];
  /** Null when the leaf draws no terminal, being an ended session. */
  textarea: Textarea | null;
}

function textarea(name: string): Textarea {
  return { name, focus: vi.fn() };
}

/** Whether a pane is the outlined one, by the two marks the surface wears. */
function outlined(pane: Pane): boolean {
  return (
    (pane.marks.includes('split-pane') && pane.marks.includes('focused')) ||
    pane.marks.includes('surface-single')
  );
}

/**
 * Install a document over the panes. `querySelector` answers the first match
 * in document order, which is the rule the defect came from. Every selector
 * asked is logged, so the ORDER of the two questions is part of the claim.
 */
function installDom(panes: Pane[]): { asked: string[] } {
  const asked: string[] = [];
  vi.stubGlobal('document', {
    querySelector: (sel: string): Textarea | null => {
      asked.push(sel);
      if (sel === OUTLINED_PANE_TEXTAREA) {
        return (
          panes.find((p) => outlined(p) && p.textarea !== null)?.textarea ?? null
        );
      }
      if (sel === FIRST_TEXTAREA) {
        return panes.find((p) => p.textarea !== null)?.textarea ?? null;
      }
      return null;
    }
  });
  return { asked };
}

const { focusTerminal } = await import('../session-focus');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('focusTerminal() in a split (Phase 289)', () => {
  it('hands the keyboard to the outlined pane, not the first one in the document', () => {
    const first = textarea('first');
    const second = textarea('second');
    installDom([
      { marks: ['split-pane'], textarea: first },
      { marks: ['split-pane', 'focused'], textarea: second }
    ]);

    focusTerminal();

    expect(second.focus).toHaveBeenCalledTimes(1);
    expect(
      first.focus,
      'the first pane in document order is not the outlined one'
    ).not.toHaveBeenCalled();
  });

  it('asks for the outlined pane FIRST and for document order only after it', () => {
    const { asked } = installDom([
      { marks: ['split-pane'], textarea: textarea('first') }
    ]);

    focusTerminal();

    expect(asked).toEqual([OUTLINED_PANE_TEXTAREA, FIRST_TEXTAREA]);
  });

  it('falls back to the first textarea when no pane is marked', () => {
    const first = textarea('first');
    const second = textarea('second');
    installDom([
      { marks: ['split-pane'], textarea: first },
      { marks: ['split-pane'], textarea: second }
    ]);

    focusTerminal();

    expect(first.focus).toHaveBeenCalledTimes(1);
    expect(second.focus).not.toHaveBeenCalled();
  });

  it('takes the one pane of a surface of one', () => {
    const only = textarea('only');
    const { asked } = installDom([
      { marks: ['surface-single'], textarea: only }
    ]);

    focusTerminal();

    expect(only.focus).toHaveBeenCalledTimes(1);
    // The outlined selector answered, so document order was never asked.
    expect(asked).toEqual([OUTLINED_PANE_TEXTAREA]);
  });

  it('falls back when the outlined pane draws no terminal', () => {
    // An ended session's leaf draws its ended state and no textarea, so the
    // compound selector matches nothing. The keyboard goes where it always
    // went rather than nowhere.
    const first = textarea('first');
    installDom([
      { marks: ['split-pane'], textarea: first },
      { marks: ['split-pane', 'focused'], textarea: null }
    ]);

    focusTerminal();

    expect(first.focus).toHaveBeenCalledTimes(1);
  });

  it('focuses nothing, and does not throw, when no terminal is drawn', () => {
    const { asked } = installDom([]);

    expect(() => {
      focusTerminal();
    }).not.toThrow();
    expect(asked).toEqual([OUTLINED_PANE_TEXTAREA, FIRST_TEXTAREA]);
  });
});

describe('one spelling of the outlined pane (Phase 289)', () => {
  const app = join(__dirname, '..');
  const focus = readFileSync(join(app, 'session-focus.ts'), 'utf8');
  const flight = readFileSync(join(app, 'focus-flight.ts'), 'utf8');
  /** Comments first, so the prose above the helper may name the marks. */
  const code = focus
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('focus-flight.ts exports the constant it already had', () => {
    expect(flight).toContain('export const FOCUSED_LEAF_TEXTAREA_SELECTOR =');
  });

  it('session-focus.ts imports it and spells neither mark itself', () => {
    expect(code).toMatch(
      /import\s*\{[^}]*\bFOCUSED_LEAF_TEXTAREA_SELECTOR\b[^}]*\}\s*from\s*'\.\/focus-flight'/
    );
    expect(code).not.toContain('.split-pane');
    expect(code).not.toContain('.surface-single');
    expect(code).not.toContain('xterm-helper-textarea');
  });

  it('the constant still reads as the two marks the surface wears', async () => {
    const mod = await import('../focus-flight');
    expect(
      (mod as unknown as Record<string, unknown>)[
        'FOCUSED_LEAF_TEXTAREA_SELECTOR'
      ]
    ).toBe(OUTLINED_PANE_TEXTAREA);
  });
});

/**
 * Phase 289, the doors. The helper above was taught the outlined pane, and
 * five doors never called it: the strip's session row and its group row,
 * the sidebar chord's way back, the editor's close, and the per agent
 * hotkey. Each asked `.gmux-terminal-mount textarea` itself, so in a split
 * each still put the keyboard in the first pane. They call the helper now,
 * and this pin is what keeps a sixth from being written.
 *
 * It is read as TEXT over every source file under src/renderer, the list
 * derived by walking rather than written down, so a new file is asked the
 * day it is added. Comments are taken out first, because the prose beside a
 * door may say what the door used to ask.
 */

const RENDERER = join(__dirname, '..', '..');
/** The one file that may ask document order itself, being the helper's. */
const HOME = 'app/session-focus.ts';

/**
 * A file that keeps its own question, and why. Each row must still match
 * something, so a row whose file stopped asking cannot sit here as a
 * standing permission for the next one.
 */
const EXCEPTIONS: Record<string, string> = {
  'zoom/shot-probe.ts':
    'a harness probe that needs the ELEMENT back, to dispatch the real zoom ' +
    'chord on it. It hands nobody the keyboard, and the helper returns nothing.'
};

/**
 * Every file that may SPELL the terminal's textarea, and why. The helper's
 * own file is `HOME` and is not a row. Each row must still spell it, for the
 * reason the table above gives.
 */
const SPELLERS: Record<string, string> = {
  ...EXCEPTIONS,
  'app/focus-flight.ts':
    'the home of the outlined pane selector the helper imports, and the ' +
    'focus flight’s own return, which asks INSIDE the surface it hid and ' +
    'gives the keyboard back to the element that held it.',
  'terminal/p95-scroll-drive.ts':
    'a harness drive that dispatches ⇧PageUp on the element xterm listens ' +
    'on. It hands nobody the keyboard.',
  'editor/shot-hook.ts':
    'a harness hook that dispatches ⇧PageUp on one session’s textarea, ' +
    'addressed by session id. It hands nobody the keyboard.'
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__') out.push(...walk(full));
    } else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * `source` with its comments taken out, by a walk that knows a string from a
 * comment. The two replaces this file used until the fix round read `//`
 * inside a string as a comment and dropped the rest of that line, selector
 * and all (the re-derive verifier's shape h6). A quote that is never closed
 * ends at the line break, so a stray apostrophe in JSX text costs one line's
 * comments being KEPT, which is the loud direction.
 */
function stripComments(source: string): string {
  let out = '';
  let quote: string | null = null;
  let i = 0;
  while (i < source.length) {
    const c = source.charAt(i);
    const next = source.charAt(i + 1);
    if (quote !== null) {
      out += c;
      if (c === '\\') {
        out += next;
        i += 2;
        continue;
      }
      if (c === quote || (c === '\n' && quote !== '`')) quote = null;
      i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      out += ' ';
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Whether `source` spells the terminal's textarea anywhere in its code: the
 * class xterm gives it, or the mount's class in a file that also names a
 * `textarea` in lower case (`HTMLTextAreaElement` is not that).
 */
function spellsTheTerminalTextarea(source: string): boolean {
  const code = stripComments(source);
  if (code.includes('xterm-helper-textarea')) return true;
  return code.includes('gmux-terminal-mount') && /(^|[^A-Za-z])textarea\b/.test(code);
}

/**
 * How many times `source` asks `querySelector` for a textarea under the
 * terminal's mount. The type argument and the line breaks prettier puts
 * between the call and its string are both allowed for, because three of the
 * five doors were spelled across four lines.
 */
function inlineTerminalQueries(source: string): number {
  const code = stripComments(source);
  const asked =
    /\bquerySelector(?:All)?\s*(?:<[^<>()]*>)?\s*\(\s*(['"`])[^'"`]*\.gmux-terminal-mount\b[^'"`]*textarea[^'"`]*\1/g;
  return (code.match(asked) ?? []).length;
}

/** The strip's door as it shipped, across the lines prettier gave it. */
const SHIPPED_STRIP = `
          setActiveSession(session.id);
          document
            .querySelector<HTMLTextAreaElement>(
              '.gmux-terminal-mount textarea'
            )
            ?.focus();
`;

/** The sidebar chord's door as it shipped, on one line. */
const SHIPPED_CHORD = `
    document
      .querySelector<HTMLTextAreaElement>('.gmux-terminal-mount textarea')
      ?.focus();
`;

const REPAIRED_STRIP = `
          setActiveSession(session.id);
          // It used to ask \`.gmux-terminal-mount textarea\` itself.
          focusTerminal();
          document.querySelector('.gmux-terminal-mount .xterm');
`;

describe('every door asks the one helper (Phase 289)', () => {
  it('the scanner catches both shapes that shipped and passes the repaired one', () => {
    expect(inlineTerminalQueries(SHIPPED_STRIP)).toBe(1);
    expect(inlineTerminalQueries(SHIPPED_CHORD)).toBe(1);
    expect(inlineTerminalQueries(REPAIRED_STRIP)).toBe(0);
  });

  it('no file but the helper asks for the terminal textarea itself', () => {
    const files = walk(RENDERER);
    // The walk found the tree, rather than an empty directory passing.
    expect(files.length).toBeGreaterThan(200);
    const findings: string[] = [];
    for (const file of files) {
      const rel = file.slice(RENDERER.length + 1).split(sep).join('/');
      if (rel === HOME || rel in EXCEPTIONS) continue;
      const n = inlineTerminalQueries(readFileSync(file, 'utf8'));
      if (n > 0) findings.push(`${rel}: ${String(n)}`);
    }
    expect(findings).toEqual([]);
  });

  /**
   * A door that stopped asking anything would pass the pin above, so each
   * of the five is also held to calling the helper. The count is the number
   * of doors in the file. EditorPanel.tsx imports it under another name
   * because it keeps a function of its own, which still falls back to the
   * terminal stack when no terminal took the keyboard.
   */
  const DOORS: { file: string; from: string; uses: RegExp; count: number }[] = [
    {
      file: 'app/SessionStrip.tsx',
      from: './session-focus',
      uses: /\bfocusTerminal\(\)/g,
      count: 2
    },
    {
      file: 'app/shell-actions.ts',
      from: './session-focus',
      uses: /\bfocusTerminal\(\)/g,
      count: 1
    },
    {
      file: 'settings/launch-agent.ts',
      from: '../app/session-focus',
      uses: /requestAnimationFrame\(focusTerminal\)/g,
      count: 1
    },
    {
      file: 'editor/EditorPanel.tsx',
      from: '../app/session-focus',
      uses: /\bfocusSessionTerminal\(\)/g,
      count: 1
    }
  ];

  it.each(DOORS)('$file imports the helper and calls it', (door) => {
    const code = stripComments(readFileSync(join(RENDERER, door.file), 'utf8'));
    const from = door.from.replace(/[.\/]/g, '\\$&');
    const imported = new RegExp(
      `import\\s*\\{[^}]*\\bfocusTerminal\\b[^}]*\\}\\s*from\\s*'${from}'`
    );
    expect(code).toMatch(imported);
    // A local copy is how launch-agent.ts and EditorPanel.tsx drifted.
    expect(code).not.toMatch(/function focusTerminal\(\)[^{]*\{\s*document/);
    expect((code.match(door.uses) ?? []).length).toBe(door.count);
  });

  it('EditorPanel.tsx still falls back to the terminal stack, after the helper', () => {
    const code = readFileSync(join(RENDERER, 'editor/EditorPanel.tsx'), 'utf8');
    const helper = code.indexOf('focusSessionTerminal();');
    const stack = code.indexOf(`'[data-slot="terminal-stack"]'`);
    expect(helper).toBeGreaterThan(-1);
    expect(stack).toBeGreaterThan(helper);
  });

  /**
   * The fix round's wider pin. The shapes are the re-derive verifier's own
   * table (its scratch scan, h0 to h6), and each one is a way to write a
   * sixth door. The call pin above saw the first two.
   */
  const HOSTILE: Record<string, string> = {
    'h0 the shape that shipped': SHIPPED_STRIP,
    'h1a a plain template': "document.querySelector(`.gmux-terminal-mount textarea`)?.focus();",
    'h1b the mount interpolated':
      "const MOUNT = '.gmux-terminal-mount';\ndocument.querySelector(`${MOUNT} textarea`)?.focus();",
    'h2 two halves joined':
      "const MOUNT = '.gmux-terminal-mount';\ndocument.querySelector(MOUNT + ' textarea')?.focus();",
    'h3b a constant in the same file':
      "const SEL = '.gmux-terminal-mount textarea';\ndocument.querySelector(SEL)?.focus();",
    'h4 two steps':
      "document.querySelector('.gmux-terminal-mount')?.querySelector('textarea')?.focus();",
    'h5 the class xterm gives it, beside the helper call':
      "focusTerminal();\ndocument.querySelector('.xterm-helper-textarea')?.focus();",
    'h6 a // inside a string earlier on the line':
      "const u = 'a//b'; document.querySelector('.gmux-terminal-mount textarea')?.focus();"
  };

  it.each(Object.entries(HOSTILE))('a sixth door is seen: %s', (_name, source) => {
    expect(spellsTheTerminalTextarea(source)).toBe(true);
  });

  it('prose, a type and the mount alone are not a spelling', () => {
    expect(spellsTheTerminalTextarea(REPAIRED_STRIP)).toBe(false);
    expect(
      spellsTheTerminalTextarea(
        "const el = document.activeElement as HTMLTextAreaElement | null;\n" +
          "if (el?.closest('.gmux-terminal-mount') !== null) return; /* .xterm-helper-textarea */"
      )
    ).toBe(false);
  });

  it('no file but the helper and the named ones spells the terminal textarea', () => {
    const findings: string[] = [];
    for (const file of walk(RENDERER)) {
      const rel = file.slice(RENDERER.length + 1).split(sep).join('/');
      if (rel === HOME || rel in SPELLERS) continue;
      if (spellsTheTerminalTextarea(readFileSync(file, 'utf8'))) findings.push(rel);
    }
    expect(findings).toEqual([]);
  });

  it('nobody but the helper borrows the outlined pane selector', () => {
    // A door that imported the constant would spell nothing, and would still
    // be a second answer to where the keyboard goes.
    const findings: string[] = [];
    for (const file of walk(RENDERER)) {
      const rel = file.slice(RENDERER.length + 1).split(sep).join('/');
      if (rel === HOME || rel === 'app/focus-flight.ts') continue;
      if (stripComments(readFileSync(file, 'utf8')).includes('FOCUSED_LEAF_TEXTAREA_SELECTOR')) {
        findings.push(rel);
      }
    }
    expect(findings).toEqual([]);
  });

  it('every file that may spell it still does, so that table cannot rot either', () => {
    expect(spellsTheTerminalTextarea(readFileSync(join(RENDERER, HOME), 'utf8'))).toBe(true);
    for (const [rel, why] of Object.entries(SPELLERS)) {
      expect(why.length).toBeGreaterThan(0);
      expect(
        spellsTheTerminalTextarea(readFileSync(join(RENDERER, rel), 'utf8')),
        `${rel} no longer spells it, so its row comes out of the table`
      ).toBe(true);
    }
  });

  it('the helper asks it exactly once, as the fallback', () => {
    expect(
      inlineTerminalQueries(readFileSync(join(RENDERER, HOME), 'utf8'))
    ).toBe(1);
  });

  it('every exception still asks, so the table cannot rot', () => {
    for (const [rel, why] of Object.entries(EXCEPTIONS)) {
      expect(why.length).toBeGreaterThan(0);
      expect(
        inlineTerminalQueries(readFileSync(join(RENDERER, rel), 'utf8')),
        `${rel} no longer asks, so its row comes out of the table`
      ).toBeGreaterThan(0);
    }
  });
});
