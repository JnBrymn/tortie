/**
 * Settings IPC (Phase 10 S13) — settings:get / settings:set /
 * settings:openWindow / agents:flagPresets.
 *
 * settings:set persists the patch, rebuilds the native menu when hotkeys
 * changed (accelerators live on Session-menu items — src/main/menu.ts) OR
 * when the Architecture switch flipped (Phase 175: three menu rows are drawn
 * only while it is on), and broadcasts EVT_SETTINGS_CHANGED to EVERY window
 * so the main window's ⌘T-modal defaults, its activity rail and the Settings
 * window stay in lockstep.
 */

import type { IpcMain } from 'electron';
import { EVT_SETTINGS_CHANGED } from '@shared/ipc';
import type {
  AgentFlagCatalogs,
  AgentFlagCatalogView,
  EnvVarCandidates,
  GmuxSettings
} from '@shared/settings';
import type { LaunchableAgentId } from '@shared/types';
// Phase 269: the ONE spelling of "will Tortie read this variable?", shared
// with the Settings window so the file a name is refused in cannot disagree
// with the file it is explained in.
import { envPassthroughRefusal } from '@shared/agent-overlay';
import { AGENT_FLAG_PRESETS } from '../agents/flags';
import { compiledLaunchEnvKeys } from '../agents/registry';
// Phase 269: the login shell's exported names, NAMES ONLY. One shared probe
// per concurrent ask, and no cross-ask cache, so a person who has just edited
// their profile gets a fresh answer.
import { loginShellEnvNames } from '../tmux';
import { disarmArchWatch } from '../arch/ipc';
import { rebuildAppMenu } from '../menu';
import { handle } from '../typed-ipc';
import { broadcastEvent } from '../typed-events';
import { registerSpecStoryStatusIpc } from '../specstory';
import { getSettings, updateSettings } from './store';
import { openSettingsWindow } from './window';

// ---------------------------------------------------------------------------
// Flag catalogs → renderer-safe views (static per build; renderers cache)
// ---------------------------------------------------------------------------

let catalogViews: AgentFlagCatalogs | null = null;

/** The flag catalogs (src/main/agents/flags.ts) as wire views. */
export function getFlagCatalogViews(): AgentFlagCatalogs {
  if (catalogViews !== null) return catalogViews;
  const views: AgentFlagCatalogs = {};
  for (const [id, catalog] of Object.entries(AGENT_FLAG_PRESETS)) {
    const agentId = id as LaunchableAgentId;
    const view: AgentFlagCatalogView = {
      agentId,
      binary: catalog.binary,
      helpVerifiedVersion: catalog.helpVerifiedVersion,
      presets: catalog.presets.map((p) => ({
        flag: p.flag,
        label: p.label,
        description: p.description,
        danger: p.danger,
        verified: p.provenance === 'VERIFIED'
      })),
      // Phase 269. What this agent's COMPILED row already sets, so the
      // Settings window can say "this agent already sets FORCE_COLOR itself"
      // without a second round trip. Empty for all but two agents.
      envKeys: [...compiledLaunchEnvKeys(agentId)]
    };
    views[agentId] = view;
  }
  catalogViews = views;
  return views;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function broadcastSettings(settings: GmuxSettings): void {
  broadcastEvent(EVT_SETTINGS_CHANGED, settings);
}

/** Did the patch change the persisted hotkey map? (menu rebuild trigger) */
function hotkeysChanged(before: GmuxSettings, after: GmuxSettings): boolean {
  return JSON.stringify(before.hotkeys) !== JSON.stringify(after.hotkeys);
}

/**
 * Did the patch flip the Architecture switch (Phase 175)? Second menu
 * rebuild trigger: the two View menu rows are present only while the switch
 * is on, so a flip must rebuild the native menu in the same breath or the
 * menu would show the state from before the change until the next hotkey
 * edit.
 */
function archVisibilityChanged(
  before: GmuxSettings,
  after: GmuxSettings
): boolean {
  return before.arch.enabled !== after.arch.enabled;
}

/**
 * PHASE 268. Did the auto-save MODE move? The File > Auto Save row draws its
 * tick from it, so the menu is rebuilt when it does. The DELAY is deliberately
 * not asked about: no menu row draws it, and rebuilding the whole application
 * menu because a person moved a select from 1 second to 2 would be work for a
 * template that comes back byte-identical.
 */
function autoSaveModeChanged(
  before: GmuxSettings,
  after: GmuxSettings
): boolean {
  return before.autoSave.mode !== after.autoSave.mode;
}

export function registerSettingsIpc(ipc: IpcMain): void {
  handle(ipc, 'settings:get', () => getSettings());

  handle(ipc, 'settings:set', (_e, patch) => {
    const before = getSettings();
    const next = updateSettings(patch);
    if (
      hotkeysChanged(before, next) ||
      archVisibilityChanged(before, next) ||
      autoSaveModeChanged(before, next)
    ) {
      // Accelerators are Session-menu items — the menu is the source of
      // nativeness (S13 Hotkeys). Rebuild picks up the new chord map, and
      // since Phase 175 the Architecture rows' presence too, and since Phase
      // 268 the tick on File > Auto Save.
      rebuildAppMenu();
    }
    if (archVisibilityChanged(before, next) && !next.arch.enabled) {
      // Phase 197 item 7. Off means off: a repository armed while the switch
      // was on stops being re-checked on file changes, rather than running
      // for the life of the app behind a hidden surface.
      disarmArchWatch();
    }
    broadcastSettings(next);
    return next;
  });

  handle(ipc, 'settings:openWindow', () => {
    openSettingsWindow();
  });

  handle(ipc, 'agents:flagPresets', () => getFlagCatalogViews());

  // PHASE 269. The names the person's login shell exports, as suggestions for
  // the shell-variable field in Launch defaults. NAMES ONLY: the probe asks
  // `awk` for the KEYS of its environment and prints nothing else, so there is
  // no path by which a value could reach this handler, let alone a renderer.
  //
  // The list is filtered by the SAME refusal the field shows a sentence for,
  // against this agent's current sealed names and its compiled env keys, so
  // the picker offers only names that would actually be accepted.
  handle(ipc, 'settings:envCandidates', async (_e, agentId) => {
    const probe = await loginShellEnvNames();
    const existing = getSettings().envPassthrough[agentId] ?? [];
    const agentEnvKeys = compiledLaunchEnvKeys(agentId);
    const names = probe.names.filter(
      (name) =>
        envPassthroughRefusal(name, {
          existing,
          agentEnvKeys,
          // The list is a suggestion, not the add itself: a full list still
          // shows what the shell has, and the add is where the cap is said.
          cap: Number.MAX_SAFE_INTEGER
        }) === null
    );
    const answer: EnvVarCandidates = { names, probeFailed: probe.probeFailed };
    return answer;
  });

  // Phase 15: the SpecStory section's status pull + its two auth actions. It
  // registers here rather than from src/main/index.ts because the Settings
  // window is its only consumer and this registrar already owns that surface;
  // when capture grows a registrar of its own, the call moves there.
  registerSpecStoryStatusIpc(ipc);
}
