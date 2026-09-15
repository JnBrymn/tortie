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
 */

import React, { useEffect, useState } from 'react';
import type { AgentFlagPresetView, EnvVarCandidates } from '@shared/settings';
import { dangerKey } from '@shared/settings';
import { envPassthroughRefusal } from '@shared/agent-overlay';
import type { DetectedAgent, LaunchableAgentId } from '@shared/types';
import { keyDisplay } from '@shared/keymap';
import { AgentIcon, Codicon } from '../icons';
import {
  ENV_ADD_COMMIT,
  ENV_ADD_OPEN,
  ENV_CONFIRM_ADD,
  ENV_CONFIRM_BODY_1,
  ENV_CONFIRM_BODY_2,
  ENV_CONFIRM_CANCEL,
  ENV_FIELD_PLACEHOLDER,
  ENV_GROUP_LABEL,
  ENV_NAMES_ONLY,
  ENV_PROBE_FAILED,
  ENV_SET_CAPTION,
  envAddLabel,
  envConfirmTitle,
  envEmptyLine,
  envFieldLabel,
  envRemoveLabel
} from './env-copy';
import { useSettingsStore } from './settings-store';
import { Switch } from './Switch';

interface PendingConfirm {
  agentId: LaunchableAgentId;
  agentName: string;
  binary: string;
  preset: AgentFlagPresetView;
}

/** Phase 269: one accepted name, waiting for the person to confirm it. */
interface PendingEnv {
  agentId: LaunchableAgentId;
  agentName: string;
  name: string;
}

/**
 * Phase 269. The separator that joins a name list into the one primitive a
 * `useEffect` dependency can compare.
 *
 * It is written as an ESCAPE and never as a raw byte: a literal NUL in a
 * source file is refused by `src/shared/__tests__/source-scan.test.ts`, which
 * holds every file in this repository to text. A NUL is the separator because
 * `OVERLAY_ENV_KEY_PATTERN` admits letters, digits and underscores only, so no
 * name can contain one and no two lists can join to the same string.
 */
const NAME_SEP = '\u0000';

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
 * PHASE 269 — what pressing Add does with what is in the field.
 *
 * It delegates the whole rule to `envPassthroughRefusal` and re-implements no
 * part of it; all it adds is the trim and the shape of the answer, so the
 * decision the container makes is the decision the suite can drive. A refusal
 * is a sentence to draw and nothing is written; a name is the thing the
 * confirm opens on.
 */
export function envAddDecision(
  draft: string,
  ctx: { existing: readonly string[]; agentEnvKeys: readonly string[] }
): { refusal: string } | { name: string } {
  const name = draft.trim();
  const why = envPassthroughRefusal(name, {
    existing: ctx.existing,
    agentEnvKeys: ctx.agentEnvKeys
  });
  return why !== null ? { refusal: why } : { name };
}

/**
 * PHASE 269 — the shell variables group, drawn INSIDE the agent's existing
 * card, under the preset rows, behind the same 1px border the preset rows use.
 *
 * It is presentational on purpose: every piece of state it draws arrives as a
 * prop and every action it offers is a callback. That is what lets the suite
 * render it, because zustand serves a server render its INITIAL state, so a
 * store a test sets is invisible to `renderToStaticMarkup` (the lesson
 * `p1741-font-field.test.tsx` wrote next door). `EnvNames` below is the
 * container that reads the store and owns the three pieces of local state.
 *
 * THE RESTING HEIGHT IS THE SAME WHETHER OR NOT NAMES ARE SET. The empty
 * line occupies the slot the chips and their caption will occupy, so adding
 * the first name does not make the card jump under the person's cursor.
 */
export function EnvNamesGroup({
  agentId,
  agentName,
  names,
  candidates,
  open,
  draft,
  refusal,
  onOpen,
  onClose,
  onDraft,
  onSubmit,
  onRemove
}: {
  agentId: string;
  agentName: string;
  /** The names on this agent's list, in the order they were added. */
  names: readonly string[];
  /** This opening's suggestions; undefined until the answer lands. */
  candidates: EnvVarCandidates | undefined;
  open: boolean;
  draft: string;
  /** `envPassthroughRefusal`'s sentence, or null when nothing is refused. */
  refusal: string | null;
  onOpen: () => void;
  onClose: () => void;
  onDraft: (next: string) => void;
  onSubmit: () => void;
  onRemove: (name: string) => void;
}): React.JSX.Element {
  const listId = `set-env-names-${agentId}`;
  // The reserved line says one of three things and is never absent while the
  // field is open, so the field's box does not move while a person types.
  const note =
    refusal ??
    (candidates?.probeFailed === true ? ENV_PROBE_FAILED : ENV_NAMES_ONLY);

  return (
    <div className="set-env-group" data-agent-id={agentId}>
      <div className="set-env-head">
        <span className="set-env-label">{ENV_GROUP_LABEL}</span>
        {open ? (
          <>
            <input
              className="set-select set-env-field"
              type="text"
              aria-label={envFieldLabel(agentName)}
              placeholder={ENV_FIELD_PLACEHOLDER}
              spellCheck={false}
              autoComplete="off"
              autoFocus
              list={listId}
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSubmit();
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  onClose();
                }
              }}
            />
            {/* A datalist renders no box, so it costs the row no layout. It is
                a suggestion list and never a cage: a name this shell does not
                export yet — one the person is about to add to their profile —
                is typed and accepted (the Phase 174.1 ruling in this window). */}
            <datalist id={listId}>
              {(candidates?.names ?? []).map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary set-env-add"
          aria-label={envAddLabel(agentName)}
          onClick={open ? onSubmit : onOpen}
        >
          {open ? ENV_ADD_COMMIT : ENV_ADD_OPEN}
        </button>
      </div>

      {open ? (
        <p className={`set-env-note${refusal !== null ? ' error' : ''}`}>
          {note}
        </p>
      ) : null}

      <div className="set-env-detail">
        {names.length === 0 ? (
          <p className="set-env-empty">{envEmptyLine(agentName)}</p>
        ) : (
          <>
            <div className="set-env-chips">
              {names.map((n) => (
                <span key={n} className="set-chip envname">
                  {n}
                  <button
                    type="button"
                    className="set-env-remove"
                    aria-label={envRemoveLabel(n, agentName)}
                    onClick={() => onRemove(n)}
                  >
                    <Codicon name="close" size="sm" />
                  </button>
                </span>
              ))}
            </div>
            <p className="set-env-caption">{ENV_SET_CAPTION}</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * PHASE 269 — the confirm.
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
  const title = envConfirmTitle(pending.name, pending.agentName);
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
        <p className="set-confirm-body">
          <code className="set-agent-cmd">{pending.name}</code>{' '}
          {ENV_CONFIRM_BODY_1}
        </p>
        <p className="set-confirm-body">{ENV_CONFIRM_BODY_2}</p>
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
 * PHASE 269 — the container: the store read, the local field state, and the
 * ONE call to the shared rule.
 *
 * The refusal sentence is `envPassthroughRefusal`'s and nothing here
 * re-implements any part of it, so the file a name is refused in cannot
 * disagree with the file it is explained in. The renderer never writes a
 * value, never holds one and never asks for one.
 *
 * Every hook is above the one return, which is the React #310 rule this
 * repository already wrote down after a hook placed under an early return took
 * a whole pane down in the running app while every unit suite stayed green.
 */
function EnvNames({
  agentId,
  agentName,
  agentEnvKeys,
  onRequestEnv
}: {
  agentId: LaunchableAgentId;
  agentName: string;
  /** The env keys this agent's COMPILED row sets, for the rule-7 sentence. */
  agentEnvKeys: readonly string[];
  onRequestEnv: (p: PendingEnv) => void;
}): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings);
  const candidates = useSettingsStore((s) => s.envCandidates[agentId]);
  const loadEnvCandidates = useSettingsStore((s) => s.loadEnvCandidates);
  const update = useSettingsStore((s) => s.update);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  /** The name the confirm is open for, so the field knows when it landed. */
  const [asked, setAsked] = useState<string | null>(null);

  const names = settings.envPassthrough[agentId] ?? [];
  const namesKey = names.join(NAME_SEP);

  // The field closes when the name it asked about actually arrives in the
  // settings, and not a moment before: a person who cancels the confirm gets
  // their field back with what they typed still in it.
  useEffect(() => {
    if (asked === null) return;
    if (!namesKey.split(NAME_SEP).includes(asked)) return;
    setAsked(null);
    setDraft('');
    setRefusal(null);
    setOpen(false);
  }, [asked, namesKey]);

  const writeNames = (next: string[]): void => {
    void update({
      envPassthrough: { ...settings.envPassthrough, [agentId]: next }
    });
  };

  const submit = (): void => {
    const decision = envAddDecision(draft, { existing: names, agentEnvKeys });
    if ('refusal' in decision) {
      // The field keeps what was typed so it can be corrected, and nothing
      // is written.
      setRefusal(decision.refusal);
      return;
    }
    setRefusal(null);
    setAsked(decision.name);
    onRequestEnv({ agentId, agentName, name: decision.name });
  };

  return (
    <EnvNamesGroup
      agentId={agentId}
      agentName={agentName}
      names={names}
      candidates={candidates}
      open={open}
      draft={draft}
      refusal={refusal}
      onOpen={() => {
        setOpen(true);
        setDraft('');
        setRefusal(null);
        // Asked on OPEN and nowhere else, so nothing is probed at boot and a
        // person who never opens this field never starts a shell.
        loadEnvCandidates(agentId);
      }}
      onClose={() => {
        setOpen(false);
        setDraft('');
        setRefusal(null);
        setAsked(null);
      }}
      onDraft={(next) => {
        setDraft(next);
        // A refusal is about what was typed, so it goes the moment it changes.
        if (refusal !== null) setRefusal(null);
      }}
      onSubmit={submit}
      onRemove={(name) => {
        // Removing never confirms, exactly as disabling a preset never does.
        writeNames(names.filter((n) => n !== name));
      }}
    />
  );
}

function AgentDefaultsCard({
  agent,
  onRequestDanger,
  onRequestEnv
}: {
  agent: DetectedAgent;
  onRequestDanger: (p: PendingConfirm) => void;
  onRequestEnv: (p: PendingEnv) => void;
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
            agentEnvKeys={catalog?.envKeys ?? []}
            onRequestEnv={onRequestEnv}
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
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [pendingEnv, setPendingEnv] = useState<PendingEnv | null>(null);

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
   * Phase 269. The write is wholesale, the same shape `setEnabled` uses above.
   * The name goes on the end of the list, so the order is the order the person
   * added them in. Nothing about a VALUE crosses this line.
   */
  const confirmAddEnv = (): void => {
    if (pendingEnv === null) return;
    const current = settings.envPassthrough[pendingEnv.agentId] ?? [];
    if (!current.includes(pendingEnv.name)) {
      void update({
        envPassthrough: {
          ...settings.envPassthrough,
          [pendingEnv.agentId]: [...current, pendingEnv.name]
        }
      });
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
            onRequestEnv={setPendingEnv}
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

      {pendingEnv !== null ? (
        <ConfirmEnvModal
          pending={pendingEnv}
          onCancel={() => setPendingEnv(null)}
          onAdd={confirmAddEnv}
        />
      ) : null}
    </section>
  );
}
