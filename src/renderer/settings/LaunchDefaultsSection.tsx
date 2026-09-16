/**
 * Settings → Launch defaults (S13): one group card per launchable agent,
 * detected agents first; VERIFIED presets render as switches (danger presets
 * warning-styled). First enable of a danger preset opens the confirm-once
 * modal; disabling never confirms, later re-enables don't re-confirm.
 *
 * Enabled defaults pre-check the ⌘T Options rows (shared selector in
 * ./presets.ts) and apply to quick-create + hotkey launches.
 *
 * THIS WINDOW IS THE ONLY WAY IN for a danger preset (Phase 18.5). Both
 * things this section writes for a danger preset — the launch default and the
 * confirm-once acknowledgement — are sealed by main when they are written and
 * checked when they are read (src/main/settings/store.ts, "The danger seal").
 * A value that turns a safeguard off cannot arrive from an edit to
 * settings.json, which any agent running on the machine could make. That is
 * why the confirm-once behaviour below can still trust `dangerAcknowledged`,
 * and why the section says so in its caption.
 *
 * PHASE 269 added a second control to the SAME card: the shell variables an
 * agent is handed. A passthrough NAME is the same class of decision as a
 * danger flag — an agent that could append a name to another agent's list
 * could read a key it was never given — so the names are sealed by main on
 * write and checked on read exactly as the two things above are.
 *
 * The captions were corrected in the fix round, because both of them had been
 * left saying something the code does not do. The pre-check clause is true of
 * the FLAGS alone: `seededFlags` and `agentPresetOptions` read
 * `settings.launchDefaults` and never `envPassthrough`, so a name is not
 * offered in the ⌘T sheet, is not pre-checked there, and cannot be turned off
 * there. And the seal's own sentence was scoped to an option "marked with a
 * warning", which a name never carries, so it read as if the seal did not
 * cover the names. It does cover them, and that is the most important thing
 * this surface has to say, so it now names them.
 *
 * It is one more control in a card that already exists, and never a new
 * section: an agent nobody configures costs one head row and one quiet line.
 *
 * PHASE 275 ADDED A CARD ABOVE THE AGENTS AND TOOK A CONTROL OUT OF EACH ONE.
 *
 * The card is **Every agent**: one shell-variable list, keyed by nothing, that
 * every agent Tortie launches reads. It exists because an API key is a
 * property of a PROVIDER and not of an agent — one DeepSeek key is the same
 * key whichever agent talks to DeepSeek — so the per-agent map made a person
 * repeat identical work once per agent, which is what issue 20's reporter hit.
 * It is drawn ONCE, above the agent cards, and it is deliberately not a
 * fourteenth copy of the agent card: it has a head, a chip row and one line,
 * and no preset rows, because there is no launch flag that belongs to every
 * agent.
 *
 * PER-AGENT NARROWING STAYS. Both lists, never either: a person who wants one
 * agent to have a narrower set must still be able to say so, and a phase that
 * deleted the per-agent map to simplify this drawing would have taken away the
 * only reason the per-agent design was defensible. A launch reads the UNION.
 * Each agent card says what it inherits in one line that points UP at the card
 * above rather than repeating its names.
 *
 * THE SEAL IS WHAT MAKES BOTH CARDS SAFE, and only one of its two layers moved.
 * Layer one did not: a name no human confirmed through this window is dropped
 * on read, whichever list it was written into. Layer two did, by design —
 * until this phase a name confirmed for `claude` could not reach `codex` even
 * if an agent copied it across, because the agent id was in the seal key, and
 * a shared name is confirmed once for every agent including agents installed
 * later. That is why the shared list has its OWN seal field and its OWN
 * confirmation, whose first body line says exactly that in words a person can
 * decline.
 *
 * THE INLINE FIELD AND ITS `<datalist>` ARE GONE from both cards. `Add…` now
 * opens `EnvPickerSheet`, which scrolls, filters and takes several names at
 * once — see that file's header for the measurements that ended the datalist.
 */

import React, { useEffect, useState } from 'react';
import type { AgentFlagPresetView } from '@shared/settings';
import { dangerKey } from '@shared/settings';
import type { DetectedAgent, LaunchableAgentId } from '@shared/types';
import { keyDisplay } from '@shared/keymap';
import { AgentIcon, Codicon } from '../icons';
import {
  ENV_ADD_OPEN,
  ENV_CONFIRM_ADD,
  ENV_CONFIRM_BODY_1,
  ENV_CONFIRM_BODY_1_MANY,
  ENV_CONFIRM_BODY_2,
  ENV_CONFIRM_BODY_2_MANY,
  ENV_CONFIRM_CANCEL,
  ENV_GROUP_LABEL,
  ENV_SET_CAPTION,
  ENV_SHARED_CONFIRM_BODY_1,
  ENV_SHARED_CONFIRM_BODY_2,
  ENV_SHARED_CONFIRM_BODY_3,
  ENV_SHARED_EMPTY_LINE,
  envAddLabel,
  envConfirmTitle,
  envConfirmTitleMany,
  envEmptyLine,
  envInheritLine,
  envRejectedLine,
  envRejectedUnnamedLine,
  envUnreadLine,
  envRemoveLabel,
  envSharedConfirmTitle
} from './env-copy';
import type { EnvPickerTarget } from './EnvPickerSheet';
import { EnvPickerSheet, envSubject } from './EnvPickerSheet';
import { useSettingsStore } from './settings-store';
import { Switch } from './Switch';

interface PendingConfirm {
  agentId: LaunchableAgentId;
  agentName: string;
  binary: string;
  preset: AgentFlagPresetView;
}

/**
 * Phase 269, made plural in Phase 275: the names the picker committed, waiting
 * for the person to confirm them.
 *
 * ONE CONFIRMATION FOR THE BATCH and never one per name. The sheet draws every
 * name it is about, because a person agreeing to a list has to be able to read
 * the list, and sixteen is the cap so the row can never be long.
 */
interface PendingEnv {
  target: EnvPickerTarget;
  names: string[];
}

/** The picker, and the ticks to restore if its confirm is cancelled. */
interface PickerState {
  target: EnvPickerTarget;
  ticked: readonly string[];
}

/**
 * The shared list, said once. It is keyed by nothing, so there is exactly one
 * of these and it carries no id — which is the whole point of the card.
 */
const SHARED_TARGET: EnvPickerTarget = { kind: 'shared' };

function PresetRow({
  agentId,
  agentName,
  binary,
  preset,
  enabled,
  disabled,
  onToggle
}: {
  agentId: string;
  agentName: string;
  binary: string;
  preset: AgentFlagPresetView;
  enabled: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <div
      className={`set-preset-row${preset.danger ? ' danger' : ''}`}
      data-agent-id={agentId}
      data-flag={preset.flag}
    >
      <Switch
        checked={enabled}
        disabled={disabled}
        danger={preset.danger}
        label={`${preset.label} for ${agentName}`}
        onChange={onToggle}
      />
      <div className="set-preset-text">
        <span className="set-preset-head">
          {preset.danger ? (
            <span className="set-preset-warn" aria-label="Danger" title={`Skips protections — ${binary} sessions will run with fewer safeguards`}>
              <Codicon name="warning" size="md" />
            </span>
          ) : null}
          <span className="set-preset-label">{preset.label}</span>
          <code className={`set-chip flag${preset.danger ? ' danger' : ''}`}>
            {preset.flag}
          </code>
        </span>
        <span className="set-preset-desc">{preset.description}</span>
      </div>
    </div>
  );
}

function ConfirmDangerModal({
  pending,
  onCancel,
  onEnable
}: {
  pending: PendingConfirm;
  onCancel: () => void;
  onEnable: () => void;
}): React.JSX.Element {
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="modal set-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={`Enable ${pending.preset.label} for ${pending.agentName}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <h2 className="modal-title">
          {pending.preset.label} for every new {pending.agentName} session?
        </h2>
        <p className="set-confirm-body">
          <code className="set-agent-cmd">
            {pending.binary} {pending.preset.flag}
          </code>{' '}
          {pending.preset.description}
        </p>
        <p className="set-confirm-body">
          Every new {pending.agentName} session will start this way. You can
          still turn it off per session in the create dialog.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-destructive"
            onClick={onEnable}
            autoFocus
          >
            Enable
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * PHASE 269, rewritten in Phase 275 — the shell variables group, drawn INSIDE
 * a card, under whatever else that card holds, behind the same 1px border the
 * preset rows use.
 *
 * IT SERVES BOTH CARDS. `subject` is the agent's display name on an agent card
 * and the literal `every agent` on the shared one, so both read as one
 * grammar: "Add shell variables for Claude Code", "Remove FOO from every
 * agent". One component means the two lists cannot drift apart in how they
 * offer, draw or remove a name.
 *
 * It is presentational on purpose: every piece of state it draws arrives as a
 * prop and every action it offers is a callback. That is what lets the suite
 * render it, because zustand serves a server render its INITIAL state, so a
 * store a test sets is invisible to `renderToStaticMarkup` (the lesson
 * `p1741-font-field.test.tsx` next door wrote down).
 *
 * THE RESTING HEIGHT IS THE SAME WHETHER OR NOT NAMES ARE SET. The empty line
 * occupies the slot the chips and their caption will occupy, so adding the
 * first name does not make the card jump under the person's cursor.
 *
 * THERE IS NO FIELD AND NO `<datalist>` HERE ANY MORE. `Add…` opens the picker
 * sheet, which is the one control that scrolls, filters and takes several
 * names at once.
 */
export function EnvNamesGroup({
  scope,
  subject,
  names,
  emptyLine,
  inheritCount,
  rejected,
  unread,
  unreadOver,
  unnamed,
  onOpen,
  onRemove
}: {
  /** `shared`, or the agent id this list belongs to. */
  scope: string;
  /** The agent's display name, or `every agent`. */
  subject: string;
  /** The names on this list, in the order they were added. */
  names: readonly string[];
  /** The one line drawn while the list is empty. */
  emptyLine: string;
  /**
   * How many names this card INHERITS from the shared list. Zero on the shared
   * card and zero while the shared list is empty, and the line is drawn only
   * when it is not zero — so a person who has never opened the shared card
   * meets no extra sentence anywhere on this page.
   */
  inheritCount: number;
  /** Names THE SEAL dropped from this list on main's last read of the file. */
  rejected: readonly string[];
  /**
   * Names THE SHAPE LAYER dropped — ones Tortie will not read whoever added
   * them. A different sentence from `rejected`, because the fix for one is
   * "add it here" and for the other there is no fix; see `envUnreadLine`.
   * Always empty on an agent card: Phase 269's per-agent sanitizer is silent by
   * a contract this phase did not edit, so only the shared card has this half.
   */
  unread: readonly string[];
  /** Shape-layer drops past the echo cap: counted, never echoed. */
  unreadOver: number;
  /** Entries main dropped that could not be named safely enough to draw. */
  unnamed: number;
  onOpen: () => void;
  onRemove: (name: string) => void;
}): React.JSX.Element {
  return (
    <div
      className="set-env-group"
      data-env-scope={scope}
      {...(scope !== 'shared' ? { 'data-agent-id': scope } : {})}
    >
      <div className="set-env-head">
        <span className="set-env-label">{ENV_GROUP_LABEL}</span>
        <button
          type="button"
          className="btn btn-secondary set-env-add"
          aria-label={envAddLabel(subject)}
          onClick={onOpen}
        >
          {ENV_ADD_OPEN}
        </button>
      </div>

      <div className="set-env-detail">
        {names.length === 0 ? (
          <p className="set-env-empty">{emptyLine}</p>
        ) : (
          <div className="set-env-chips">
            {names.map((n) => (
              <span key={n} className="set-chip envname">
                {n}
                <button
                  type="button"
                  className="set-env-remove"
                  aria-label={envRemoveLabel(n, subject)}
                  onClick={() => onRemove(n)}
                >
                  <Codicon name="close" size="sm" />
                </button>
              </span>
            ))}
          </div>
        )}
        {/* One line, and it points UP rather than repeating: the names are
            already on screen one card above, under a head that says "Every
            agent". Naming them again here would be the same list drawn eleven
            times on a page a person scrolls. */}
        {inheritCount > 0 ? (
          <p className="set-env-inherit">{envInheritLine(inheritCount)}</p>
        ) : null}
        {names.length > 0 ? (
          <p className="set-env-caption">{ENV_SET_CAPTION}</p>
        ) : null}
      </div>

      {/* A name in the file that this window did not put there. Every name here
          has already passed the shape gate in main, so nothing hostile can
          reach the DOM through it, and an entry that could not be named safely
          is a count and never an echo.

          THREE SENTENCES AND NOT ONE, WHICH IS THE FIX ROUND'S REPAIR. They
          answer different questions and the first two point opposite ways: the
          seal's line means "add it here and it works", the shape line means
          "adding it here will not help", and joining them under the seal's
          words told a person their own confirmed key had never been added.
          Each is one short sentence and the block is drawn at all only when
          somebody has edited settings.json by hand. */}
      {rejected.length > 0 || unread.length > 0 || unnamed > 0 ? (
        <p className="set-env-note error">
          {rejected.length > 0 ? envRejectedLine(rejected) : null}
          {rejected.length > 0 && (unread.length > 0 || unnamed > 0) ? ' ' : null}
          {unread.length > 0 ? envUnreadLine(unread, unreadOver) : null}
          {unread.length > 0 && unnamed > 0 ? ' ' : null}
          {unnamed > 0 ? envRejectedUnnamedLine(unnamed) : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * PHASE 269, made plural and given a shared sibling in Phase 275 — the confirm.
 *
 * A SECOND component rather than a widening of `ConfirmDangerModal`: the two
 * say different things and the danger modal's copy is pinned by its own tests.
 * Same scrim, same `modal set-confirm`, same `role="alertdialog"`, same
 * Escape, same two-button footer, so the two read as one family.
 *
 * EVERY ADD CONFIRMS. `dangerAcknowledged` is not touched and there is no
 * per-agent acknowledgement: unlike a flag, which comes from a fixed
 * catalogue, each name is a separate decision about a separate secret.
 * Re-adding a name that was removed asks again, which is correct.
 *
 * THREE SHAPES, AND THE ONE-NAME PER-AGENT SHAPE IS BYTE FOR BYTE PHASE 269'S.
 * That sheet reads as one sentence — the name in a code slot, then "is read
 * from your login shell…" — and `p269-env-names.test.tsx` pins it, so nothing
 * about a single per-agent add has changed. The two new shapes draw the names
 * as a WRAPPED ROW of chips above the body, because "Each is read…" needs its
 * subjects above it rather than inside it.
 *
 * THE SHARED SHEET IS THE ONLY SURFACE IN THIS PHASE ALLOWED THREE LINES. A
 * confirm is the one place in Launch defaults where a sentence is earned, and
 * its first line is not decoration: it is the whole of the seal's second layer
 * moving, said out loud at the last moment a person can decline it.
 */
export function ConfirmEnvModal({
  pending,
  onCancel,
  onAdd
}: {
  pending: PendingEnv;
  onCancel: () => void;
  onAdd: () => void;
}): React.JSX.Element {
  const { target, names } = pending;
  const one = names.length === 1 ? names[0] : undefined;
  const title =
    target.kind === 'shared'
      ? envSharedConfirmTitle(names.length)
      : one !== undefined
        ? envConfirmTitle(one, target.agentName)
        : envConfirmTitleMany(names.length, target.agentName);

  const chips = (
    <p className="set-confirm-names">
      {names.map((n) => (
        <code key={n} className="set-agent-cmd">
          {n}
        </code>
      ))}
    </p>
  );

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="modal set-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <h2 className="modal-title">{title}</h2>
        {target.kind === 'shared' ? (
          <>
            {chips}
            <p className="set-confirm-body">{ENV_SHARED_CONFIRM_BODY_1}</p>
            <p className="set-confirm-body">{ENV_SHARED_CONFIRM_BODY_2}</p>
            <p className="set-confirm-body">{ENV_SHARED_CONFIRM_BODY_3}</p>
          </>
        ) : one !== undefined ? (
          <>
            <p className="set-confirm-body">
              <code className="set-agent-cmd">{one}</code> {ENV_CONFIRM_BODY_1}
            </p>
            <p className="set-confirm-body">{ENV_CONFIRM_BODY_2}</p>
          </>
        ) : (
          <>
            {chips}
            <p className="set-confirm-body">{ENV_CONFIRM_BODY_1_MANY}</p>
            <p className="set-confirm-body">{ENV_CONFIRM_BODY_2_MANY}</p>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {ENV_CONFIRM_CANCEL}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onAdd}
            autoFocus
          >
            {ENV_CONFIRM_ADD}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * PHASE 275 — the shared card, drawn ONCE above the agent cards.
 *
 * It is NOT a fourteenth copy of the agent card. It has a head, a chip row and
 * one line, and no preset rows, because there is no launch flag that belongs
 * to every agent. The head wears a glyph and never a borrowed agent mark,
 * because this card is not an agent.
 */
function SharedDefaultsCard({
  onOpenPicker
}: {
  onOpenPicker: (target: EnvPickerTarget) => void;
}): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings);
  const rejections = useSettingsStore((s) => s.envRejections);
  const update = useSettingsStore((s) => s.update);
  const names = settings.envPassthroughShared;

  return (
    <div className="set-defaults-card">
      <div className="set-defaults-head">
        <span className="set-agent-icon" aria-hidden="true">
          <Codicon name="symbol-variable" size="md" />
        </span>
        <span className="set-defaults-name">Every agent</span>
      </div>
      <EnvNamesGroup
        scope="shared"
        subject={envSubject(SHARED_TARGET)}
        names={names}
        emptyLine={ENV_SHARED_EMPTY_LINE}
        inheritCount={0}
        rejected={rejections.shared}
        unread={rejections.sharedUnread}
        unreadOver={rejections.sharedUnreadOver}
        unnamed={rejections.unnamed}
        onOpen={() => onOpenPicker(SHARED_TARGET)}
        onRemove={(name) => {
          // Removing never confirms, exactly as disabling a preset never does.
          void update({
            envPassthroughShared: names.filter((n) => n !== name)
          });
        }}
      />
    </div>
  );
}

/**
 * PHASE 269, thinned in Phase 275 — the container for one agent's list.
 *
 * All three pieces of local state it used to hold (the open field, the draft
 * and the refusal) went with the field. What is left is the store read, the
 * one write and the inherit count, so the only decision made here is what to
 * hand the presentational group above.
 */
function EnvNames({
  agentId,
  agentName,
  onOpenPicker
}: {
  agentId: LaunchableAgentId;
  agentName: string;
  onOpenPicker: (target: EnvPickerTarget) => void;
}): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings);
  const rejections = useSettingsStore((s) => s.envRejections);
  const update = useSettingsStore((s) => s.update);

  const names = settings.envPassthrough[agentId] ?? [];

  return (
    <EnvNamesGroup
      scope={agentId}
      subject={agentName}
      names={names}
      emptyLine={envEmptyLine(agentName)}
      inheritCount={settings.envPassthroughShared.length}
      rejected={rejections.perAgent[agentId] ?? []}
      // Phase 269's per-agent sanitizer is documented silent, so an agent card
      // has no shape-layer half to draw. The fix round left that contract
      // alone and recorded the asymmetry as a stated limit rather than widening
      // a second phase's promise inside this one.
      unread={[]}
      unreadOver={0}
      unnamed={0}
      onOpen={() => onOpenPicker({ kind: 'agent', agentId, agentName })}
      onRemove={(name) => {
        // Removing never confirms, exactly as disabling a preset never does.
        void update({
          envPassthrough: {
            ...settings.envPassthrough,
            [agentId]: names.filter((n) => n !== name)
          }
        });
      }}
    />
  );
}

function AgentDefaultsCard({
  agent,
  onRequestDanger,
  onOpenPicker
}: {
  agent: DetectedAgent;
  onRequestDanger: (p: PendingConfirm) => void;
  onOpenPicker: (target: EnvPickerTarget) => void;
}): React.JSX.Element | null {
  const settings = useSettingsStore((s) => s.settings);
  const catalogs = useSettingsStore((s) => s.catalogs);
  const update = useSettingsStore((s) => s.update);

  const agentId = agent.id as LaunchableAgentId;
  const catalog = catalogs[agentId];
  const presets = (catalog?.presets ?? []).filter((p) => p.verified);
  const enabled = new Set(settings.launchDefaults[agentId] ?? []);

  const setEnabled = (flag: string, next: boolean): void => {
    const flags = new Set(settings.launchDefaults[agentId] ?? []);
    if (next) flags.add(flag);
    else flags.delete(flag);
    void update({
      launchDefaults: {
        ...settings.launchDefaults,
        [agentId]: [...flags]
      }
    });
  };

  const toggle = (preset: AgentFlagPresetView, next: boolean): void => {
    if (
      next &&
      preset.danger &&
      !settings.dangerAcknowledged.includes(dangerKey(agentId, preset.flag))
    ) {
      onRequestDanger({
        agentId,
        agentName: agent.displayName,
        binary: catalog?.binary ?? agentId,
        preset
      });
      return;
    }
    setEnabled(preset.flag, next);
  };

  return (
    <div className={`set-defaults-card${agent.installed ? '' : ' uninstalled'}`}>
      <div className="set-defaults-head">
        <span className="set-agent-icon" aria-hidden="true">
          <AgentIcon agent={agent.iconKey} size={16} />
        </span>
        <span className="set-defaults-name">{agent.displayName}</span>
        {!agent.installed ? (
          <span className="set-agent-missing">not installed</span>
        ) : null}
      </div>
      {agent.installed ? (
        <>
          {presets.length > 0 ? (
            <div className="set-defaults-body">
              {presets.map((p) => (
                <PresetRow
                  key={p.flag}
                  agentId={agentId}
                  agentName={agent.displayName}
                  binary={catalog?.binary ?? agentId}
                  preset={p}
                  enabled={enabled.has(p.flag)}
                  disabled={false}
                  onToggle={(next) => toggle(p, next)}
                />
              ))}
            </div>
          ) : (
            <div className="set-empty-line">
              No launch options cataloged for this agent yet.
            </div>
          )}
          {/* Phase 269. A sibling of the flags above, in the card they are
              already in, behind the same border the preset rows use. */}
          <EnvNames
            agentId={agentId}
            agentName={agent.displayName}
            onOpenPicker={onOpenPicker}
          />
        </>
      ) : null}
    </div>
  );
}

export function LaunchDefaultsSection(): React.JSX.Element {
  const scan = useSettingsStore((s) => s.scan);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const refreshEnvRejections = useSettingsStore((s) => s.refreshEnvRejections);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [pendingEnv, setPendingEnv] = useState<PendingEnv | null>(null);

  // PHASE 275. Ask main what its last read of the settings file dropped, on
  // mount and after every write — because `persistSettings` writes the
  // seal-filtered settings BACK, so the dropped names are then gone from the
  // file and going on saying they are ignored would be a lie. It is a read of
  // a list main already holds in memory: no file is opened and nothing is
  // spawned.
  useEffect(() => {
    void refreshEnvRejections();
  }, [refreshEnvRejections, settings]);

  const launchable = (scan?.agents ?? []).filter((a) => a.launchable);
  // Detected agents first (S13), registry order within each half.
  const ordered = [
    ...launchable.filter((a) => a.installed),
    ...launchable.filter((a) => !a.installed)
  ];

  const confirmEnable = (): void => {
    if (pending === null) return;
    const key = dangerKey(pending.agentId, pending.preset.flag);
    const flags = new Set(settings.launchDefaults[pending.agentId] ?? []);
    flags.add(pending.preset.flag);
    void update({
      launchDefaults: {
        ...settings.launchDefaults,
        [pending.agentId]: [...flags]
      },
      dangerAcknowledged: settings.dangerAcknowledged.includes(key)
        ? settings.dangerAcknowledged
        : [...settings.dangerAcknowledged, key]
    });
    setPending(null);
  };

  /**
   * Phase 269, made plural in Phase 275. The write is wholesale, the same shape
   * `setEnabled` uses above. Names go on the END of the list, in the order the
   * person ticked them, so the list reads as the order they were added in.
   * Nothing about a VALUE crosses this line.
   *
   * ONE WRITE FOR THE BATCH. A name already on the list is skipped rather than
   * duplicated — the picker draws those locked, so it takes a stale render for
   * one to arrive here at all.
   */
  const confirmAddEnv = (): void => {
    if (pendingEnv === null) return;
    const { target, names } = pendingEnv;
    if (target.kind === 'shared') {
      const current = settings.envPassthroughShared;
      const next = names.filter((n) => !current.includes(n));
      if (next.length > 0) {
        void update({ envPassthroughShared: [...current, ...next] });
      }
    } else {
      const current = settings.envPassthrough[target.agentId] ?? [];
      const next = names.filter((n) => !current.includes(n));
      if (next.length > 0) {
        void update({
          envPassthrough: {
            ...settings.envPassthrough,
            [target.agentId]: [...current, ...next]
          }
        });
      }
    }
    setPendingEnv(null);
  };

  return (
    <section aria-label="Launch defaults">
      <h1 className="set-title">Launch defaults</h1>
      <p className="set-section-caption">
        Flags and shell variables applied to every new session of an agent.
        Sessions created from {keyDisplay('session.new')} show the flags
        pre-checked — turning one off there affects that session only.
      </p>
      <p className="set-section-caption">
        A flag marked with a warning, and every shell variable name, can only
        be set here. Tortie ignores one that was added by editing its settings
        file, because the agents you run can write that file too.
      </p>

      {/* Phase 275. Drawn ONCE, above the agent cards, because the list it
          holds is keyed by nothing. It is drawn whether or not the scan
          answered: the shared list is not about which agents this machine
          has. */}
      <SharedDefaultsCard onOpenPicker={(target) => setPicker({ target, ticked: [] })} />

      {ordered.length === 0 ? (
        <div className="set-card">
          <div className="set-empty-line">
            Agent list unavailable — re-scan from the Agents section.
          </div>
        </div>
      ) : (
        ordered.map((a) => (
          <AgentDefaultsCard
            key={a.id}
            agent={a}
            onRequestDanger={setPending}
            onOpenPicker={(target) => setPicker({ target, ticked: [] })}
          />
        ))
      )}

      {pending !== null ? (
        <ConfirmDangerModal
          pending={pending}
          onCancel={() => setPending(null)}
          onEnable={confirmEnable}
        />
      ) : null}

      {/* One picker for every card, and only one on screen at a time. It is
          unmounted while the confirm is up, so the sheet a person agrees to is
          the only thing they can act on. */}
      {picker !== null && pendingEnv === null ? (
        <EnvPickerSheet
          target={picker.target}
          initialTicked={picker.ticked}
          onCancel={() => setPicker(null)}
          onCommit={(names) => {
            setPendingEnv({ target: picker.target, names });
          }}
        />
      ) : null}

      {pendingEnv !== null ? (
        <ConfirmEnvModal
          pending={pendingEnv}
          // Cancelling gives the picker back with the ticks still on it — the
          // Phase 269 rule that a cancelled confirm returns what was typed,
          // applied to a list instead of to a field.
          onCancel={() => {
            setPicker({ target: pendingEnv.target, ticked: pendingEnv.names });
            setPendingEnv(null);
          }}
          onAdd={() => {
            confirmAddEnv();
            setPicker(null);
          }}
        />
      ) : null}
    </section>
  );
}
