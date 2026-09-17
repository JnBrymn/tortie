/**
 * Renderer-side settings state (S13) — one zustand store shared by the
 * Settings window AND the main window (the ⌘T modal's preset defaults and
 * the hotkey quick-create path read the same truth).
 *
 * Backing: the settings:* bridge extras, feature-detected — against an older
 * preload the store stays on defaults and `available` is false (the Settings
 * surface renders a friendly "not available" note instead of dead controls).
 * Cross-window coherence comes from EVT_SETTINGS_CHANGED: main broadcasts
 * every persisted change to every window.
 */

import { create } from 'zustand';
import type {
  AgentFlagCatalogs,
  EnvRejections,
  EnvVarCandidates,
  GmuxSettings,
  GmuxSettingsPatch
} from '@shared/settings';
import { defaultGmuxSettings, noEnvRejections } from '@shared/settings';
import type { AgentsScanResult } from '@shared/types';
import type { ArchOptions, FoldOptions } from '@shared/fold';
import type {
  ConfigRowsResult,
  EnvCandidateScope,
  InstalledGmuxApi
} from '@shared/ipc';
import { gmuxBridge } from '../bridge';

function bridge(): InstalledGmuxApi | undefined {
  return gmuxBridge();
}

export interface SettingsStoreState {
  /** Persisted settings (defaults until loaded). */
  settings: GmuxSettings;
  settingsLoaded: boolean;
  /** False when the preload lacks the settings bridge (older build). */
  available: boolean;
  /** Per-agent launch-flag catalogs (static per build). */
  catalogs: AgentFlagCatalogs;
  catalogsLoaded: boolean;
  /**
   * Full 12-agent detection scan (agents:list); null until a surface asks.
   *
   * PHASE 164. `init()` no longer requests this. The shell mounts the store
   * on every boot, so the request used to run at boot on every launch, and
   * with it main's full agent scan, fourteen version subprocesses on the
   * operator's machine, about ninety milliseconds after PATH was ready and
   * before the window was shown, whether or not anything on screen would read
   * the answer. A person reopening an existing terminal never reads it. The
   * surfaces that draw from the scan call `ensureScan()` when they mount or
   * open, and the answer is still main's one memoised scan, so Create Session
   * and Settings still receive one complete cached result.
   */
  scan: AgentsScanResult | null;
  scanning: boolean;

  /**
   * PHASE 23. What `agents.json` currently says, and what is on record for
   * each row that can cause a program to run.
   *
   * Null means "not read yet". A build whose preload has no `config` member
   * leaves it null for the life of the window and Settings draws nothing,
   * which is also the right answer for the ordinary machine that has no
   * configuration file: the result then carries no rows and no errors.
   *
   * This is the ONLY place the errors surface. A row Tortie dropped is a
   * sentence naming the field and the reason, and it has to be somewhere a
   * person can read it rather than only in a console nobody has open.
   */
  config: ConfigRowsResult | null;
  configBusy: string | null;

  /**
   * PHASE 138. Which agents may write the project line, and which models each
   * one exposes.
   *
   * Null means "not read yet", and it stays null for the life of the window
   * on a build whose preload has no overview member. Settings draws one
   * sentence then rather than a dead picker. The list is built in MAIN, out
   * of the merged agent table, the Phase 23 confirm gate and the compiled
   * table of recipes Tortie has measured. The renderer never assembles it and
   * never carries a copy of it, which is why there is no array of agent ids
   * anywhere in FoldSection.tsx.
   *
   * Reading the list starts nothing. It cannot spawn an agent, and picking a
   * row in the section cannot either. A fold runs only when a session
   * finishes a turn.
   */
  foldOptions: FoldOptions | null;
  foldOptionsLoaded: boolean;

  /**
   * PHASE 158. Which agents may fill in the architecture contract, and which
   * models each one exposes. The same posture as `foldOptions` above: built
   * in MAIN from the merged agent table, the Phase 23 confirm gate and the
   * compiled arch recipe table, never assembled here, and reading the list
   * starts nothing. Null means "not read yet", and stays null for the life
   * of the window on a build whose preload has no `archOptions` member.
   */
  archOptions: ArchOptions | null;
  archOptionsLoaded: boolean;

  /**
   * PHASE 269. The names this person's login shell exports, per agent, as
   * SUGGESTIONS for the shell-variable field in Launch defaults.
   *
   * NAMES ONLY. Main's probe asks `awk` for the KEYS of its environment and
   * never for a value, so "no value" is a property of the script rather than
   * of a filter applied afterwards, and nothing on this side of the bridge has
   * ever held one.
   *
   * It is PER OPENING and deliberately not a cache. An entry is cleared the
   * moment the picker opens and filled when the answer lands, so a person who
   * has just added a variable to their shell profile and reopened the picker
   * gets the new name rather than the answer from before they edited it. A
   * scope with no entry has not been asked this opening; `probeFailed` is the
   * answer that the shell did not reply at all, and the field stays typable in
   * both cases — nothing here ever blocks the person from naming a variable
   * their shell does not export yet.
   *
   * PHASE 275 KEYED IT BY SCOPE rather than by agent, because the shared list
   * is keyed by nothing and still has to ask the same question. The key is
   * `envScopeKey`'s, and the two key spaces cannot collide — see that
   * function.
   */
  envCandidates: Record<string, EnvVarCandidates | undefined>;

  /**
   * PHASE 275. What main's last read of `settings.json` DROPPED from the
   * shell-variable lists, so Launch defaults can say it on the card that lost
   * the name.
   *
   * A name no human confirmed through this window is dropped by the seal —
   * that is layer one and this phase did not move it. Before this phase the
   * only record of a drop was a line in `app.log`, so a person whose agent had
   * quietly stopped seeing a key had nowhere to find out why. Every string
   * here has already passed the shape gate in main, so nothing hostile can
   * arrive through it, and an entry that could NOT be named safely is a count
   * and never an echo.
   */
  envRejections: EnvRejections;

  /**
   * PHASE 276. Is the login shell being asked again right now?
   *
   * The one thing that rate-limits the [Re-read shell] button in Launch
   * defaults, and it does the whole job: the action returns early while it is
   * set and the button is `disabled` while it is set, which is the same shape
   * `scanning` gives Re-scan two sections up. There is no floor, no cooldown
   * and no toast, because pressing it spawns one login shell and a person who
   * pressed it asked for exactly that.
   *
   * NOTHING ELSE CROSSES. The channel resolves `void`, so this boolean is the
   * only thing this window learns from a refresh — not a name, not a count, and
   * never a value.
   */
  envRefreshing: boolean;

  /**
   * PHASE 175. Read the settings once and subscribe to main's broadcast, and
   * NOTHING else. Idempotent, and `init()` calls it so the two cannot drift.
   *
   * The main window needed this. Before Phase 175 the only callers of
   * `init()` in that window were the empty-state tiles, the Create Session
   * modal and the aim picker, so a launch that restored sessions and never
   * opened any of them left this store on its compiled defaults for the life
   * of the window and never heard a change. That was invisible while the
   * only readers were modals that call `init()` on mount. It stops being
   * invisible the moment the shell itself reads a setting, which is what the
   * Architecture switch made it do: the rail, the view chord and the map
   * door all read `arch.enabled` now, and flipping it in the Settings window
   * has to reach this window in the same session.
   *
   * It asks main for one value it already holds in memory and opens no file,
   * so the boot cost is one IPC round trip and no disk.
   */
  watchSettings(): void;
  /** Idempotent: load settings + catalogs + config + fold options, subscribe. Starts no scan. */
  init(): void;
  /**
   * PHASE 164. Ask main for the agent scan, once. A no-op while a scan is in
   * flight or after one has landed, so any number of surfaces may call it on
   * mount. This is the ONLY place the renderer requests `agents:list` on its
   * own; `rescan()` is the person's explicit re-probe and stays separate.
   * Starts nothing in the renderer: the probes, if main has not run them yet
   * this process, are main's and they run behind main's own cache.
   */
  ensureScan(): void;
  /** Persist a shallow patch; resolves the post-patch settings (or null
   *  when the bridge is absent). Optimistically applies locally first. */
  update(patch: GmuxSettingsPatch): Promise<GmuxSettings | null>;
  /** Settings → Agents [Re-scan]: drop main's cache and re-probe. */
  rescan(): Promise<void>;
  /**
   * PHASE 276. Settings → Launch defaults [Re-read shell]: drop main's cached
   * login-shell answer and ask the shell again.
   *
   * It exists for the one class main's shell-config watch provably cannot see,
   * being a key exported by a file the rc SOURCES, one a vault hands over at
   * shell start, or one a plugin loads from a `.env`. Nothing comes back: the
   * spinner running and the button returning to rest is the whole feedback, and
   * the next session a person starts gets the current values.
   */
  refreshShellEnv(): Promise<void>;

  /** Re-read the config rows and their confirmation state from main. */
  refreshConfig(): Promise<void>;
  /**
   * Record that this person read these lines and agreed to them.
   *
   * The hash and the lines are the ones the sheet was drawn from, so main can
   * refuse the confirmation if the file moved while the sheet was open. It
   * returns the error sentence when main refused, and null when it recorded.
   * Confirming starts nothing: the person still has to create a session.
   */
  confirmConfigRow(id: string): Promise<string | null>;
  /** Withdraw one agreement, so the row asks again before it may launch. */
  forgetConfigRow(id: string): Promise<string | null>;

  /** Re-read which agents and models may write the project line. Reads only. */
  refreshFoldOptions(): Promise<void>;

  /** Re-read which agents and models may fill in the contract. Reads only. */
  refreshArchOptions(): Promise<void>;

  /**
   * PHASE 269, scoped in Phase 275. Ask main which names this login shell
   * exports, for one agent or for the shared list.
   *
   * Called when the picker OPENS and nowhere else, so nothing is probed at
   * boot and a person who never opens it never starts a shell.
   * Feature-detected on the one method, exactly like `agentFlagPresets` above:
   * an older preload leaves the field typable and the line under it saying the
   * shell did not answer, which is the truth from where the person is
   * standing.
   */
  loadEnvCandidates(scope: EnvCandidateScope): void;

  /**
   * PHASE 275. Re-read what main dropped on its last read of the settings
   * file. Reads only, from memory in main — it opens no file and spawns
   * nothing.
   *
   * It is asked again after a write because `persistSettings` writes the
   * seal-filtered settings BACK: the dropped names are then gone from the
   * file, and going on saying they are ignored would be a lie.
   */
  refreshEnvRejections(): Promise<void>;
}

/**
 * PHASE 275. The key one scope's candidate answer is filed under.
 *
 * THE TWO KEY SPACES CANNOT COLLIDE. `*` can never begin a
 * `LaunchableAgentId`: `OVERLAY_ID_PATTERN` is `^[a-z][a-z0-9-]{0,31}$` and
 * every one of the thirteen compiled ids begins with a lowercase letter, so
 * the shared answer can never be served for an agent and an agent's answer can
 * never be served as the shared one. It is the same belt the seal uses one
 * layer down, where a per-agent seal key holds exactly one space and a bare
 * shared name holds none.
 */
export function envScopeKey(scope: EnvCandidateScope): string {
  return scope.kind === 'shared' ? '*shared' : scope.agentId;
}

let initialized = false;
/** Phase 175: the `watchSettings` latch, separate so `init` may call it. */
let watching = false;

export const useSettingsStore = create<SettingsStoreState>()((set, get) => ({
  settings: defaultGmuxSettings(),
  settingsLoaded: false,
  available: true, // optimistic until init() feature-detects
  catalogs: {},
  catalogsLoaded: false,
  scan: null,
  scanning: false,
  config: null,
  configBusy: null,
  foldOptions: null,
  foldOptionsLoaded: false,
  archOptions: null,
  archOptionsLoaded: false,
  envCandidates: {},
  envRejections: noEnvRejections(),
  envRefreshing: false,

  watchSettings() {
    if (watching) return;
    watching = true;
    const b = bridge();
    if (typeof b?.settingsGet !== 'function') {
      set({ available: false, settingsLoaded: true });
      return;
    }
    void b
      .settingsGet()
      .then((settings) => set({ settings, settingsLoaded: true }))
      .catch(() => set({ settingsLoaded: true }));
    // Never unsubscribed — the store lives as long as the window.
    b.onSettingsChanged?.((settings) => set({ settings, settingsLoaded: true }));
  },

  init() {
    if (initialized) return;
    initialized = true;
    const b = bridge();

    if (typeof b?.settingsGet !== 'function') {
      set({ available: false, settingsLoaded: true, catalogsLoaded: true });
      return;
    }

    // Phase 175. The read and the subscription are `watchSettings`' now, so
    // the shell's cheap call and this full one cannot drift apart. It is
    // idempotent, so a window that already watches pays nothing here.
    get().watchSettings();

    if (typeof b.agentFlagPresets === 'function') {
      void b
        .agentFlagPresets()
        .then((catalogs) => set({ catalogs, catalogsLoaded: true }))
        .catch(() => set({ catalogsLoaded: true }));
    } else {
      set({ catalogsLoaded: true });
    }

    // Phase 164. The agent scan is NOT requested here any more. See
    // `ensureScan` below, and the field comment on `scan` for why.

    // Phase 23. One read at init. It reaches memory in main, so it costs no
    // disk access, and a build with no `config` member leaves this null.
    void get().refreshConfig();

    // Phase 138. One read at init, for the same reason. Main answers from a
    // compiled table and the agreements it already holds, so nothing is
    // spawned and no file under the person's home is opened.
    void get().refreshFoldOptions();

    // Phase 158. The arch twin of the read above, and the same posture.
    void get().refreshArchOptions();

    // Phase 275. One read at init, same posture again: main answers from the
    // list it computed on its last settings read, so nothing is opened and
    // nothing is spawned. Launch defaults asks again after every write.
    void get().refreshEnvRejections();
  },

  async update(patch) {
    const b = bridge();
    if (typeof b?.settingsSet !== 'function') return null;
    // Optimistic local apply; the broadcast confirms with the sanitized
    // truth (and corrects it if main dropped anything).
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    try {
      const next = await b.settingsSet(patch);
      set({ settings: next });
      return next;
    } catch {
      // Re-pull the persisted truth rather than guessing.
      try {
        const current = await b.settingsGet?.();
        if (current) set({ settings: current });
      } catch {
        /* keep optimistic state — next broadcast reconciles */
      }
      return null;
    }
  },

  ensureScan() {
    if (get().scan !== null || get().scanning) return;
    const b = bridge();
    if (typeof b?.agentsList !== 'function') return;
    const list = b.agentsList.bind(b);
    set({ scanning: true });
    void list()
      .then((scan) => set({ scan, scanning: false }))
      // A failed read leaves `scan` null, so the next surface to mount asks
      // again rather than drawing the seed list for the life of the window.
      .catch(() => set({ scanning: false }));
  },

  async rescan() {
    const b = bridge();
    if (typeof b?.agentsRescan !== 'function' || get().scanning) return;
    set({ scanning: true });
    try {
      const scan = await b.agentsRescan();
      set({ scan, scanning: false });
    } catch {
      set({ scanning: false });
    }
  },

  /**
   * PHASE 276. Ask main to drop its cached login-shell answer and take a fresh
   * one, then let the button come back to rest.
   *
   * THE GUARD IS THE WHOLE RATE LIMIT, the same shape `rescan()` uses above: a
   * second press while one is in flight returns immediately, and the button is
   * disabled while it is. A failed refresh is not an error a person has to
   * read, because main cached nothing when the probe failed and the next
   * session probes for itself, so the `catch` only clears the flag.
   */
  async refreshShellEnv() {
    const b = bridge();
    if (typeof b?.envRefresh !== 'function' || get().envRefreshing) return;
    set({ envRefreshing: true });
    try {
      await b.envRefresh();
    } catch {
      // Nothing to say. Main cached nothing, and the next session asks again.
    } finally {
      set({ envRefreshing: false });
    }
  },

  async refreshConfig() {
    const b = bridge();
    if (b?.config === undefined) return;
    try {
      set({ config: await b.config.rows() });
    } catch {
      /* leave the last good answer up rather than blanking the list */
    }
  },

  async confirmConfigRow(id) {
    const b = bridge();
    if (b?.config === undefined) return 'This build cannot confirm rows.';
    const row = get().config?.rows.find((r) => r.id === id);
    if (row === undefined) return `There is no row called ${id} to confirm.`;
    set({ configBusy: id });
    try {
      // The hash and the lines are the ones this sheet was drawn from. Main
      // compares them against the file as it is NOW and refuses if the row
      // moved while the sheet was open, so an agent that rewrites the file
      // mid-read cannot have its new bytes agreed to by an old click.
      await b.config.confirm({ id, hashRead: row.hash, linesRead: row.lines });
      await get().refreshConfig();
      return null;
    } catch (err) {
      await get().refreshConfig();
      return err instanceof Error ? err.message : String(err);
    } finally {
      set({ configBusy: null });
    }
  },

  async forgetConfigRow(id) {
    const b = bridge();
    if (b?.config === undefined) return 'This build cannot withdraw a row.';
    set({ configBusy: id });
    try {
      await b.config.forget(id);
      await get().refreshConfig();
      return null;
    } catch (err) {
      await get().refreshConfig();
      return err instanceof Error ? err.message : String(err);
    } finally {
      set({ configBusy: null });
    }
  },

  async refreshFoldOptions() {
    const b = bridge();
    // Feature detected on the one method, not on the object, because the
    // overview object shipped in Phase 137 without this call on it.
    if (typeof b?.overview?.foldOptions !== 'function') {
      set({ foldOptionsLoaded: true });
      return;
    }
    try {
      set({ foldOptions: await b.overview.foldOptions(), foldOptionsLoaded: true });
    } catch {
      // Leave the last good list up rather than blanking the picker.
      set({ foldOptionsLoaded: true });
    }
  },

  async refreshArchOptions() {
    const b = bridge();
    // Feature detected on the one method, for the reason foldOptions is: the
    // overview object shipped without this call on it.
    if (typeof b?.overview?.archOptions !== 'function') {
      set({ archOptionsLoaded: true });
      return;
    }
    try {
      set({ archOptions: await b.overview.archOptions(), archOptionsLoaded: true });
    } catch {
      // Leave the last good list up rather than blanking the picker.
      set({ archOptionsLoaded: true });
    }
  },

  loadEnvCandidates(scope) {
    const b = bridge();
    const key = envScopeKey(scope);
    const put = (answer: EnvVarCandidates | undefined): void => {
      set((s) => ({ envCandidates: { ...s.envCandidates, [key]: answer } }));
    };
    // Clear first: the list is per OPENING, so a stale answer is never what a
    // person reopening the picker is shown. See the field comment above.
    put(undefined);
    if (typeof b?.envCandidateNames !== 'function') {
      put({ names: [], probeFailed: true });
      return;
    }
    void b
      .envCandidateNames(scope)
      .then(put)
      .catch(() => put({ names: [], probeFailed: true }));
  },

  async refreshEnvRejections() {
    const b = bridge();
    // Feature detected on the one method, for the reason `foldOptions` is: a
    // preload from before this phase has no such member, and a build that
    // cannot ask has nothing to report rather than something to claim.
    if (typeof b?.envRejections !== 'function') return;
    try {
      set({ envRejections: await b.envRejections() });
    } catch {
      // Leave the last good answer up rather than clearing a warning a person
      // may be in the middle of reading.
    }
  }
}));

/**
 * Is the Architecture surface on (Phase 175)? The one imperative read every
 * entry-point gate shares: the view chord, the aiming verb, the three menu
 * actions, the map tab opener and the store's own view setters all ask this
 * before they act, so a remembered `arch` view or a queued `show-arch`
 * cannot resurrect a surface the person has not turned on. Components
 * SUBSCRIBE to the same field through `useSettingsStore` instead, so a flip
 * re-renders them in the same session. Settings then Architecture is never
 * gated on it: that page is the only way back in.
 */
export function archSurfacesOn(): boolean {
  return useSettingsStore.getState().settings.arch.enabled;
}
