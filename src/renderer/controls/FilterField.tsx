/**
 * FilterField — the app's ONE filter input with a leading glyph.
 *
 * It exists because the same field was being rebuilt per surface, and one of
 * those rebuilds got the geometry wrong (Phase 14.2): an absolutely-positioned
 * magnifier over an input whose start padding was written as `padding-left`,
 * which `.input`'s own `padding` shorthand clobbers whenever the bundler puts
 * globals.css last — and the glyph landed on the first letter of the
 * placeholder. Both halves of the fix are stated once and only here: the
 * padding is derived from the icon in filter-field.css, and the only way to
 * get a leading glyph is to use this component.
 *
 * The surface is deliberately five props. Everything a filter should do the
 * same way everywhere — Esc clears it, a clear button appears the moment
 * there is something to clear, the placeholder is also the accessible name —
 * is behaviour, not configuration.
 */

import React from 'react';
import { Codicon } from '../icons';
import './filter-field.css';

export interface FilterFieldProps {
  value: string;
  onChange: (next: string) => void;
  /** Placeholder text, and the field's accessible name. */
  placeholder: string;
  /**
   * Leading codicon id: 'search' looks something up, 'filter' narrows a list
   * that is already on screen. The app makes that distinction elsewhere, so
   * the field has to be able to as well.
   */
  icon?: string;
  /** Layout only — width and placement belong to the surface. */
  className?: string;
  /**
   * PHASE 275. A handle on the input itself, for a surface that has to focus
   * it or read where the caret is. Optional, and absent from all five call
   * sites that existed before this phase.
   */
  inputRef?: React.Ref<HTMLInputElement>;
  /**
   * PHASE 275. The field is the filter AND the keyboard driver for a listbox
   * beside it.
   *
   * The shell-variable picker keeps focus in this field while ArrowUp and
   * ArrowDown walk a list of fifty names, so the row a person has landed on
   * has to be announced from HERE: `aria-activedescendant` is read off the
   * element that holds DOM focus and nowhere else, and putting it on the
   * listbox — which nothing is focused inside — announces nothing. The
   * alternative already shipped next door is ShortcutsOverlay's
   * `aria-current="true"` on the row with no activedescendant at all, which
   * is weaker for exactly this reason: a screen reader is never told the
   * cursor moved.
   *
   * Absent it emits NOTHING — no role, no aria — so every existing call site
   * renders the byte-identical input it rendered before.
   */
  combobox?: { controls: string; activeId: string | null };
}

export function FilterField({
  value,
  onChange,
  placeholder,
  icon = 'search',
  className,
  inputRef,
  combobox
}: FilterFieldProps): React.JSX.Element {
  return (
    <div
      className={`filter-field${className !== undefined ? ` ${className}` : ''}`}
    >
      <Codicon name={icon} size="md" className="filter-field-icon" />
      <input
        className="input"
        type="text"
        {...(inputRef !== undefined ? { ref: inputRef } : {})}
        {...(combobox !== undefined
          ? {
              role: 'combobox',
              'aria-expanded': true,
              'aria-controls': combobox.controls,
              ...(combobox.activeId !== null
                ? { 'aria-activedescendant': combobox.activeId }
                : {})
            }
          : {})}
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Esc empties the field, and stops there. The layer behind a filter
          // is usually something Esc would close, and losing the whole panel
          // because you wanted to undo a query is the wrong trade.
          if (e.key === 'Escape' && value !== '') {
            e.stopPropagation();
            onChange('');
          }
        }}
      />
      {value !== '' ? (
        <button
          type="button"
          className="filter-field-clear"
          aria-label="Clear filter"
          title="Clear filter"
          onClick={() => onChange('')}
        >
          <Codicon name="close" size="sm" />
        </button>
      ) : null}
    </div>
  );
}
