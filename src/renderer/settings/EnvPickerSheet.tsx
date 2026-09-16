/**
 * PHASE 275 — the shell-variable picker, and the control that replaces the
 * native `<datalist>` Phase 269 shipped.
 *
 * WHY THE DATALIST HAD TO GO, measured rather than assumed. The old field
 * rendered its candidates into a `<datalist>`, and the popup a person saw was
 * not in our document at all: driven in the running app
 * (`build/p275/probe-p275-gestures.mjs`), the element's own
 * `getBoundingClientRect()` was `[0,0,0,0]`, every `<option>`'s box was
 * `[0,0,0,0]`, and a real mousedown/mouseup/click on the field added zero
 * nodes to the document. There was nothing of ours to size, nothing to scroll
 * and no CSS of ours that reached it. It is Electron's own autofill popup
 * (`shell/browser/ui/views/autofill_popup_view.cc`): at the tag we ship it
 * asks for `rows * 24px` of height — 1,226 px for the 51 names the operator's
 * shell exports — hands that to `gfx::Rect::AdjustToFit`, which SHRINKS it to
 * the web contents view, and it holds no `views::ScrollView`, no
 * `OnMouseWheel` and a single `selected_line_`.
 *
 * SO THE TWO COMPLAINTS WERE ONE CONTROL. It did not scroll because it could
 * not, and it yielded one name per trip because the control holds one. Both
 * are fixed by owning the list, and that is one change rather than two.
 *
 * THE PROPERTY THE OLD COMMENT DEFENDED IS KEPT AND MADE STRONGER. Its words
 * were "a suggestion list and never a cage": a name this shell does not export
 * yet — one the person is about to add to their profile — is typed and
 * accepted. That is the Phase 174.1 ruling and it stands. Before this phase it
 * was true and nothing on screen said so; now the typed name is drawn as a row
 * at the top marked `not exported by your shell`, so there is exactly ONE rule
 * to learn instead of two: every name you can add is a row.
 *
 * ASSEMBLED, NEVER REIMPLEMENTED. No new list primitive is written here. The
 * sheet's header/scrolling-body/footer shape, its flat wrapping cursor, its
 * `scrollIntoView({block:'nearest'})`, its live count and its two-stage Escape
 * are `src/renderer/app/ShortcutsOverlay.tsx`'s. The multi-select aria —
 * `role="listbox"`, `aria-multiselectable`, and the KEYBOARD CURSOR kept
 * separate from the SELECTED SET — is `src/renderer/scm/ScmSection.tsx`'s. The
 * "tick several, then one confirm, and a row that cannot be chosen is shown
 * disabled with its reason printed rather than hidden" shape is
 * `src/renderer/context/enable/EnableForDialog.tsx`'s. The field is the app's
 * one `FilterField`.
 *
 * ROWS ARE `<div role="option">` AND NEVER `<button>`. `SymbolPalette.tsx`
 * uses a button and it is the half deliberately not copied: a focusable
 * control inside a listbox takes DOM focus itself, fights
 * `aria-activedescendant`, and makes Tab walk fifty rows. Focus stays in the
 * field; the field announces the active row.
 *
 * NAMES ONLY. Nothing on this surface, in this module or across the channel it
 * reads has ever held a VALUE. The probe behind `settings:envCandidates` asks
 * `awk` for the KEYS of its environment, so "no value" is a property of the
 * script rather than a filter applied afterwards.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EnvVarCandidates } from '@shared/settings';
import { envPassthroughRefusal, OVERLAY_LIMITS } from '@shared/agent-overlay';
import type { LaunchableAgentId } from '@shared/types';
import type { EnvCandidateScope } from '@shared/ipc';
import { Codicon } from '../icons';
import { FilterField } from '../controls/FilterField';
import { trapTabKey } from '../app/focus-trap';
import {
  ENV_NAMES_ONLY,
  ENV_PICKER_CANCEL,
  ENV_PICKER_NOTE_INHERITED,
  ENV_PICKER_NOTE_ON_LIST,
  ENV_PICKER_NOTE_SHARED,
  ENV_PICKER_NOTE_TYPED,
  ENV_PICKER_PLACEHOLDER,
  ENV_PROBE_FAILED,
  ENV_READING_SHELL,
  envPickerAdd,
  envPickerCount,
  envPickerNothing,
  envPickerTitle
} from './env-copy';
import { envScopeKey, useSettingsStore } from './settings-store';
import './env-picker.css';

/**
 * Which list this sheet is adding to. The shared arm carries no id because the
 * shared list is keyed by nothing — that is the whole point of it.
 */
export type EnvPickerTarget =
  | { kind: 'shared' }
  | { kind: 'agent'; agentId: LaunchableAgentId; agentName: string };

/** The subject every sentence on this surface takes. */
export function envSubject(target: EnvPickerTarget): string {
  return target.kind === 'shared' ? 'every agent' : target.agentName;
}

/**
 * A name that is only ever handed to `envPassthroughRefusal` to make it say
 * the CAP sentence, and is never added to anything.
 *
 * The sheet has to draw that sentence beside a row while a person ticks (§5.9
 * of the phase spec: nobody ticks twenty and is refused after they have
 * agreed), and there are TWO spellings of it — one for an agent list and one
 * for the shared list, which is read for every agent. Both live inside
 * `envPassthroughRefusal` on purpose, so the file that refuses cannot disagree
 * with the file that explains. Asking for the sentence with a probe name is
 * how this surface reads it instead of copying it.
 *
 * The refusal's checks run in order — shape, then duplicate, then cap — so the
 * probe only has to be shape-valid and absent from the list, which it is by
 * construction: no agent exports it and a person would have to type it.
 */
const CAP_PROBE_NAME = 'TORTIE_CAP_PROBE';

/**
 * PHASE 269, moved here in Phase 275 with the control it belongs to.
 *
 * It delegates the whole rule to `envPassthroughRefusal` and re-implements no
 * part of it; all it adds is the trim and the shape of the answer, so the
 * decision the sheet makes is the decision the suite can drive.
 */
export function envAddDecision(
  draft: string,
  ctx: {
    existing: readonly string[];
    agentEnvKeys: readonly string[];
    scope?: 'agent' | 'shared';
    /** How many more this list may take. Defaults to the overlay's sixteen. */
    cap?: number;
  }
): { refusal: string } | { name: string } {
  const name = draft.trim();
  const why = envPassthroughRefusal(name, {
    existing: ctx.existing,
    agentEnvKeys: ctx.agentEnvKeys,
    ...(ctx.scope !== undefined ? { scope: ctx.scope } : {}),
    ...(ctx.cap !== undefined ? { cap: ctx.cap } : {})
  });
  return why !== null ? { refusal: why } : { name };
}

/** One drawn row. */
export interface EnvPickerRow {
  name: string;
  /** Ticked right now. A locked row is always ticked. */
  ticked: boolean;
  /** Already on the list this sheet writes, or inherited — cannot be untouched. */
  locked: boolean;
  /** The muted right-hand note, or null when the row needs none. */
  note: string | null;
  /** Unticked with no room left, so it carries the cap sentence. */
  capped: boolean;
  /** The typed name at the top, which this shell does not export. */
  typed: boolean;
}

/** Everything the view draws, computed in one pure pass so a suite can drive it. */
export interface EnvPickerModel {
  rows: EnvPickerRow[];
  /** The always-present line under the field. */
  note: string;
  /** Is that line a refusal, and therefore drawn in --error? */
  noteIsRefusal: boolean;
  /** The live count beside the title. */
  count: string;
  /** The "nothing matches" line, or null. */
  nothing: string | null;
  /** The sentence a capped row carries, or null while there is room. */
  capReason: string | null;
  /** The names this sheet would commit, in the order they were ticked. */
  chosen: string[];
  /** The row the cursor lands on when the query changes. See the comment. */
  cursorOnQuery: number;
}

export interface EnvPickerInput {
  scope: 'agent' | 'shared';
  /** The names already on the list this sheet writes, in list order. */
  existing: readonly string[];
  /** The SHARED names an agent sheet inherits. Empty on the shared sheet. */
  inherited: readonly string[];
  /**
   * The compiled `launch.env` keys the refusal must know about: this agent's
   * own on an agent sheet, and the union over every launchable agent on the
   * shared sheet, because the shared list reaches them all.
   */
  agentEnvKeys: readonly string[];
  /** This opening's answer from the login shell; undefined until it lands. */
  candidates: EnvVarCandidates | undefined;
  query: string;
  /** Ticked names, in the order they were ticked. */
  ticked: readonly string[];
  cap: number;
}

/**
 * THE WHOLE OF THE SHEET'S THINKING, in one pure function.
 *
 * It is separate from the component for the reason `p1741-font-field.test.tsx`
 * wrote down next door: there is no DOM in the unit lane and zustand serves a
 * server render its INITIAL state, so the states worth pinning have to be
 * reachable without mounting anything. Every rule in the spec's §5 is decided
 * here and the view only draws the answer.
 */
export function envPickerModel(input: EnvPickerInput): EnvPickerModel {
  const existing = new Set(input.existing);
  const inherited = new Set(input.inherited);
  const tickedSet = new Set(input.ticked);

  // The base list keeps the SHELL's order and never the settings' order, so
  // the list has the same shape every time it opens. Phase 269's handler
  // filtered names a person already had straight out, which made the list
  // change shape between openings and sent people hunting for a name they
  // already owned; now they are drawn, ticked and locked. Anything on a list
  // the shell did not offer is appended, because a name can outlive the
  // profile line that exported it.
  const offered = new Set(input.candidates?.names ?? []);
  const seen = new Set<string>();
  const base: string[] = [];
  const push = (n: string): void => {
    if (seen.has(n)) return;
    seen.add(n);
    base.push(n);
  };
  for (const n of input.candidates?.names ?? []) push(n);
  for (const n of input.existing) push(n);
  for (const n of input.inherited) push(n);
  // A name a person TYPED and ticked is on no list yet and the shell does not
  // export it, so none of the three above would draw it. Without this line it
  // vanished the moment the filter changed and became a name they could no
  // longer untick, committed from a count alone.
  for (const n of input.ticked) push(n);

  // The names that will actually be written. A locked row is already there, so
  // it is never one of them and never spends a slot.
  const chosen = input.ticked.filter(
    (n) => !existing.has(n) && !inherited.has(n)
  );

  // An inherited name sits on the SHARED list and not on this one, so it costs
  // this agent's sixteen nothing. Two caps, one number, and they do not share
  // a budget.
  const filled = [...input.existing, ...chosen];
  const left = Math.max(0, input.cap - filled.length);
  const capReason =
    left === 0
      ? envPassthroughRefusal(CAP_PROBE_NAME, {
          existing: filled,
          agentEnvKeys: input.agentEnvKeys,
          cap: input.cap,
          scope: input.scope
        })
      : null;

  const trimmed = input.query.trim();
  const needle = trimmed.toLowerCase();
  const matches = (n: string): boolean =>
    needle === '' || n.toLowerCase().includes(needle);

  // The note says what this row ALREADY IS, and the order is its precedence:
  // being on the list this sheet writes is the most useful thing to know,
  // then being inherited from the shared card, then — the "never a cage"
  // case — being a name the shell does not export at all. `typed` is only
  // about WHERE the row came from, so a typed name a person has already
  // ticked keeps its note after it has joined the list above.
  const rowFor = (name: string, typed: boolean): EnvPickerRow => {
    const locked = existing.has(name) || inherited.has(name);
    const note = existing.has(name)
      ? input.scope === 'shared'
        ? ENV_PICKER_NOTE_SHARED
        : ENV_PICKER_NOTE_ON_LIST
      : inherited.has(name)
        ? ENV_PICKER_NOTE_INHERITED
        : offered.has(name)
          ? null
          : ENV_PICKER_NOTE_TYPED;
    const ticked = locked || tickedSet.has(name);
    return { name, ticked, locked, note, capped: !ticked && left === 0, typed };
  };

  const visible = base.filter(matches);

  // Never a cage. The typed row appears exactly when the query is a name this
  // window would accept and no row already IS that name — which is also the
  // condition under which a refusal is worth drawing, so the two are decided
  // together and can never both be on screen.
  const already = seen.has(trimmed);
  // THE TWO HALVES OF THE REFUSAL ARE ASKED ABOUT DIFFERENT LISTS, and running
  // them together was a bug worth writing down. `envPassthroughRefusal` reads
  // `existing` twice: once to refuse a DUPLICATE and once to refuse the
  // SEVENTEENTH name. Handing it the ticked names as `existing` made a typed
  // name refuse ITSELF as a duplicate the moment it was ticked, so the row a
  // person had just chosen vanished. The duplicate question is about the list
  // as it stands; the cap question is about the list plus what is ticked, which
  // is a smaller BUDGET rather than a longer list — and the budget excludes
  // this name, so a ticked typed row cannot refuse itself off the screen at the
  // sixteenth either.
  const pending = chosen.filter((n) => n !== trimmed).length;
  const decision =
    trimmed !== '' && !already
      ? envAddDecision(trimmed, {
          existing: input.existing,
          agentEnvKeys: input.agentEnvKeys,
          scope: input.scope,
          cap: Math.max(0, input.cap - pending)
        })
      : null;
  const refusal =
    decision !== null && 'refusal' in decision ? decision.refusal : null;
  const typedRow =
    decision !== null && 'name' in decision
      ? rowFor(decision.name, true)
      : null;

  const offeredRows = visible.map((n) => rowFor(n, false));
  const rows = typedRow !== null ? [typedRow, ...offeredRows] : offeredRows;

  return {
    rows,
    note:
      refusal ??
      (input.candidates === undefined
        ? ENV_READING_SHELL
        : input.candidates.probeFailed
          ? ENV_PROBE_FAILED
          : ENV_NAMES_ONLY),
    noteIsRefusal: refusal !== null,
    // The typed row is deliberately outside the count: it is not one of the
    // names the shell offered, so counting it would make the total move as a
    // person types. "0 of 48" beside a row marked "not exported by your shell"
    // is the whole story in two readings.
    count: envPickerCount({
      ticked: chosen.length,
      left,
      shown: visible.length,
      total: base.length,
      filtering: trimmed !== ''
    }),
    nothing:
      trimmed !== '' && visible.length === 0 && typedRow === null
        ? envPickerNothing(trimmed)
        : null,
    capReason,
    chosen,
    // WHERE THE CURSOR LANDS WHEN THE QUERY CHANGES, and it is not always the
    // first row. The typed row sits at the TOP, and ↩ toggles whatever the
    // cursor is on, so a person typing `anthropic` to FILTER and pressing ↩
    // would tick the literal name `anthropic` instead of the
    // `ANTHROPIC_API_KEY` they can see under it. When the shell offered
    // anything that matches, the cursor starts on the first of those; the
    // typed row is still one ArrowUp away, and it is the only row when nothing
    // matched.
    cursorOnQuery: typedRow !== null && offeredRows.length > 0 ? 1 : 0
  };
}

/** The id of one row, and the value `aria-activedescendant` carries. */
export function envPickerRowId(name: string): string {
  return `set-env-opt-${name}`;
}

/**
 * The sheet as drawn. Presentational on purpose, for the reason
 * `envPickerModel` is pure: every state worth pinning is one render away.
 */
export function EnvPickerSheetView({
  target,
  model,
  query,
  cursor,
  onQuery,
  onCursor,
  onToggle,
  onCancel,
  onCommit,
  inputRef,
  listRef,
  modalRef
}: {
  target: EnvPickerTarget;
  model: EnvPickerModel;
  query: string;
  /** Index into `model.rows`, or -1 when there is nothing to point at. */
  cursor: number;
  onQuery: (next: string) => void;
  onCursor: (next: number) => void;
  onToggle: (row: EnvPickerRow) => void;
  onCancel: () => void;
  onCommit: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  listRef?: React.Ref<HTMLDivElement>;
  modalRef?: React.Ref<HTMLDivElement>;
}): React.JSX.Element {
  const subject = envSubject(target);
  const listId = 'set-env-picker-list';
  const active = model.rows[cursor];
  const activeId = active !== undefined ? envPickerRowId(active.name) : null;

  const move = (delta: number): void => {
    if (model.rows.length === 0) return;
    const from = cursor < 0 ? 0 : cursor;
    onCursor((from + delta + model.rows.length) % model.rows.length);
  };

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={modalRef}
        className="modal set-env-picker"
        role="dialog"
        aria-modal="true"
        aria-label={envPickerTitle(subject)}
        onKeyDown={(e) => {
          trapTabKey(e, e.currentTarget);
          if (e.key === 'ArrowDown') {
            // Without this the caret walks the field instead of the list —
            // ShortcutsOverlay.tsx:186-194 learnt it first.
            e.preventDefault();
            move(1);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            // ⌘↩ commits; ↩ on its own toggles the active row and NEVER
            // commits, so the typed-name path costs no special case: one key,
            // one meaning, whether the row came from the shell or the field.
            if (e.metaKey || e.ctrlKey) {
              if (model.chosen.length > 0) onCommit();
              return;
            }
            if (active !== undefined) onToggle(active);
            return;
          }
          if (e.key === 'Escape') {
            // The first press is FilterField's own — it clears a non-empty
            // query and stops propagation, so this branch is reached only on
            // an empty field, which is the second press.
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <div className="set-env-picker-head">
          <h2 className="modal-title">{envPickerTitle(subject)}</h2>
          <span className="set-env-picker-count" aria-live="polite">
            {model.count}
          </span>
        </div>

        <FilterField
          className="set-env-picker-filter"
          value={query}
          onChange={onQuery}
          placeholder={ENV_PICKER_PLACEHOLDER}
          icon="filter"
          {...(inputRef !== undefined ? { inputRef } : {})}
          combobox={{ controls: listId, activeId }}
        />

        {/* ALWAYS in the tree and always saying one of its four things, so the
            list below it never moves under the cursor as a person types. If a
            state ever needs it gone it goes by `visibility` and never by
            `display` — the Phase 174.1 rule this window wrote down. */}
        <p
          className={`set-env-note${model.noteIsRefusal ? ' error' : ''}`}
          role={model.noteIsRefusal ? 'alert' : undefined}
        >
          {model.note}
        </p>

        {/* TWO ELEMENTS AND NOT ONE. The scroller is the outer box and the
            listbox is inside it, because a `role="listbox"` may hold options
            and nothing else — and the "nothing matches" line is not an option.
            Folding them together would have put a bare paragraph inside a
            listbox, which assistive tech is entitled to drop on the floor. */}
        <div ref={listRef} className="set-env-list">
          {model.nothing !== null ? (
            <p className="set-env-picker-empty">{model.nothing}</p>
          ) : null}
          <div
            id={listId}
            role="listbox"
            aria-label={envPickerTitle(subject)}
            aria-multiselectable="true"
            {...(activeId !== null
              ? { 'aria-activedescendant': activeId }
              : {})}
          >
            {model.rows.map((row, i) => {
              const disabled = row.locked || row.capped;
              return (
                <div
                  key={row.name}
                  id={envPickerRowId(row.name)}
                  role="option"
                  aria-selected={row.ticked}
                  {...(disabled ? { 'aria-disabled': true } : {})}
                  {...(i === cursor ? { 'data-cursor': 'true' } : {})}
                  className={`set-env-opt${row.ticked ? ' ticked' : ''}${
                    disabled ? ' off' : ''
                  }${i === cursor ? ' cursor' : ''}`}
                  // The field keeps focus, so the list keeps its keyboard and
                  // its announcement. A row that stole focus would fight
                  // `aria-activedescendant` and make Tab walk fifty rows.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (disabled) return;
                    onToggle(row);
                  }}
                >
                  <span className="set-env-opt-tick" aria-hidden="true">
                    {row.ticked ? <Codicon name="check" size="sm" /> : null}
                  </span>
                  <span className="set-env-opt-name">{row.name}</span>
                  {row.note !== null ? (
                    <span className="set-env-opt-note">{row.note}</span>
                  ) : null}
                  {/* The reason is PRINTED and not hidden behind a tooltip —
                    EnableForDialog's rule, because a fact behind a tooltip is
                    a fact most people never meet. */}
                  {row.capped && model.capReason !== null ? (
                    <span className="set-env-opt-note">{model.capReason}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            {ENV_PICKER_CANCEL}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={model.chosen.length === 0}
            onClick={onCommit}
          >
            {envPickerAdd(model.chosen.length)}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The container: the store read, the three pieces of local state, and the one
 * call that asks the login shell.
 *
 * Every hook is above the one return, which is the React #310 rule this
 * repository wrote down after a hook placed under an early return took a whole
 * pane down in the running app while every unit suite stayed green.
 */
export function EnvPickerSheet({
  target,
  initialTicked = [],
  onCommit,
  onCancel
}: {
  target: EnvPickerTarget;
  /**
   * Ticks to start with. Empty on a fresh open; the names a person had chosen
   * when they cancelled the confirm, so the sheet comes back as they left it —
   * the Phase 269 rule that a cancelled confirm returns what was typed,
   * applied to a list instead of to a field.
   */
  initialTicked?: readonly string[];
  /** The names the person agreed to tick. The confirm comes after this. */
  onCommit: (names: string[]) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings);
  const catalogs = useSettingsStore((s) => s.catalogs);
  const envCandidates = useSettingsStore((s) => s.envCandidates);
  const loadEnvCandidates = useSettingsStore((s) => s.loadEnvCandidates);

  const [query, setQuery] = useState('');
  const [ticked, setTicked] = useState<string[]>([...initialTicked]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const scope = target.kind === 'shared' ? 'shared' : 'agent';
  const agentId = target.kind === 'agent' ? target.agentId : null;
  const scopeArg = useMemo<EnvCandidateScope>(
    () => (agentId !== null ? { kind: 'agent', agentId } : { kind: 'shared' }),
    [agentId]
  );
  const candidates = envCandidates[envScopeKey(scopeArg)];

  const shared = settings.envPassthroughShared;
  const existing =
    agentId !== null ? (settings.envPassthrough[agentId] ?? []) : shared;
  const inherited = agentId !== null ? shared : [];

  /**
   * The compiled keys the refusal has to know about. On the shared sheet that
   * is the UNION over every agent whose catalog we hold, because the shared
   * list reaches all of them — the same union main computes from the registry
   * before it refuses the write. This side draws the sentence; main is still
   * the one that refuses.
   */
  const agentEnvKeys = useMemo(() => {
    if (agentId !== null) return catalogs[agentId]?.envKeys ?? [];
    const all = new Set<string>();
    for (const catalog of Object.values(catalogs)) {
      for (const key of catalog?.envKeys ?? []) all.add(key);
    }
    return [...all];
  }, [agentId, catalogs]);

  const model = useMemo(
    () =>
      envPickerModel({
        scope,
        existing,
        inherited,
        agentEnvKeys,
        candidates,
        query,
        ticked,
        cap: OVERLAY_LIMITS.maxEnvPassthroughNames
      }),
    [scope, existing, inherited, agentEnvKeys, candidates, query, ticked]
  );

  // Asked on OPEN and nowhere else, so nothing is probed at boot and a person
  // who never opens this sheet never starts a shell. The store clears the
  // entry first, so a person who has just edited their profile and reopened
  // the sheet gets the new name rather than the answer from before.
  useEffect(() => {
    loadEnvCandidates(scopeArg);
  }, [loadEnvCandidates, scopeArg]);

  // The field takes focus on open, so the sheet is typed into rather than
  // scrolled — and focusing it engages the Tab trap, which is what keeps the
  // page behind the scrim unreachable.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (inputRef.current !== null) inputRef.current.focus();
      else modalRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // The cursor goes back to the resting row whenever the query changes, so a
  // query that narrows to one row already reads as answered.
  useEffect(() => {
    setCursor(model.cursorOnQuery);
  }, [query, model.cursorOnQuery]);

  // Keep the active row in view without moving the page under the eye.
  // Nearest, never smooth: this fires on every arrow press.
  useEffect(() => {
    const row = listRef.current?.querySelector('[data-cursor="true"]');
    if (row instanceof HTMLElement) row.scrollIntoView({ block: 'nearest' });
  }, [cursor, model.rows.length]);

  return (
    <EnvPickerSheetView
      target={target}
      model={model}
      query={query}
      cursor={cursor}
      onQuery={setQuery}
      onCursor={setCursor}
      onToggle={(row) => {
        if (row.locked || row.capped) return;
        setTicked((prev) =>
          prev.includes(row.name)
            ? prev.filter((n) => n !== row.name)
            : [...prev, row.name]
        );
      }}
      onCancel={onCancel}
      onCommit={() => {
        if (model.chosen.length === 0) return;
        onCommit(model.chosen);
      }}
      inputRef={inputRef}
      listRef={listRef}
      modalRef={modalRef}
    />
  );
}
