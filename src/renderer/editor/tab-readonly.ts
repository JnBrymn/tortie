/**
 * The four reasons a tab is not an edit surface (Phase 96, Phase 101), pure.
 *
 * PHASE 268 MOVED IT OUT OF ./MonacoHost.tsx and changed not one line of it.
 * The auto-save policy (./auto-save.ts) asks this exact question before it
 * arms a timer, and reaching it through the host would have made
 * `store -> auto-save -> MonacoHost -> store` — the cycle ./store.ts's own
 * header already refuses for the markdown barrel. `tabIsReadOnly` is still
 * exported FROM ./MonacoHost.tsx, so every importer and both of its existing
 * tests read the same name from the same place.
 */

import type { EditorTab } from './tab-types';

/**
 * The four reasons a tab is not an edit surface. Exported for its test.
 *
 * A deleted file has nothing left to write to. A truncated file holds only the
 * head of what is on disk, so a save would cut the rest off. A history tab
 * shows a file as it was at one commit, and the past is not an edit surface
 * (VS Code opens commit contents read-only for the same reason, because a save
 * would write an old revision over the live file).
 *
 * PHASE 96. `tab.remote` is the fourth reason and it was missing. A review tab
 * names a file on another computer, so `save` in ./tab-io.ts has refused it
 * since Phase 73 and says so out loud since Phase 90.3. Monaco was never told,
 * so a person typed freely into a tab whose every save is refused, and the band
 * ./EditorPanel.tsx draws over it already promised that typing changes nothing.
 * This makes that promise true.
 *
 * PHASE 101 MADE THE FOURTH REASON CONDITIONAL, and it is the only one that
 * is. `remoteWriteRoot` is the folder on that machine a person confirmed Tortie
 * may replace a file under, and null means there is none. A remote tab is an
 * edit surface when it is a non-empty string and is read only otherwise, so the
 * default for every machine, and for every build before this phase, is
 * unchanged. The other three reasons are unchanged and none of them is
 * conditional: a deleted file, a cut file and a past commit are not edit
 * surfaces on any machine.
 *
 * The caller reads the root from the link state main pushes, so the answer is
 * never older than the last confirmation. This function decides nothing about
 * whether a write is allowed. Main refuses that on the row on disk at call
 * time, and this only decides whether Monaco takes the keystroke.
 */
export function tabIsReadOnly(
  tab: EditorTab,
  remoteWriteRoot: string | null
): boolean {
  // PHASE 240: a compare tab holds two versions and neither is on disk, so
  // there is nothing under it a keystroke could legitimately change. It never
  // reaches File mode — its mode chip offers nothing and setMode refuses — and
  // this is the same belt-and-braces the commit tab has carried since Phase 12.
  if (tab.deleted || tab.truncated || tab.commit !== null || tab.compare !== undefined) {
    return true;
  }
  if (tab.remote === undefined) return false;
  return remoteWriteRoot === null || remoteWriteRoot.length === 0;
}
