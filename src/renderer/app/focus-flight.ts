/**
 * Session focus mode, the flight (Phase 80.1).
 *
 * One chord gives the session surface the whole window. The project tabs, the
 * activity bar, the sidebar, the session strip or dock and the editor stop
 * being drawn, and the surface grows into the space they leave. The same
 * chord puts every region back.
 *
 * THE SENTENCE THAT IS THE WHOLE DESIGN. Nothing animates the live terminal's
 * layout box while it is attached. The flight runs on a still copy
 * (./focus-copy.ts) and swaps to the live hosts once, at the end. Two rules
 * follow, and they bind every line below.
 *
 *  1. Only `transform` and `opacity` are animated, and only on the copy and
 *     on the chrome. No keyframe here may name a layout property.
 *  2. The live surface's border box does not change size between the moment
 *     the chord is pressed and the moment the flight finishes. That is why
 *     the chrome is FADED during the flight rather than removed, and why the
 *     destination is measured in one unpainted layout pass.
 *
 * WHY THERE IS NO MEMENTO. Editor fill needs one because it writes
 * `sidebarVisible` and `dockCollapsed` on the way in. Focus writes neither.
 * Every region it hides is hidden by one CSS class on the shell root, so the
 * sidebar's width, the dock's width, the editor's width and the strip's
 * orientation are never touched and come back byte for byte because they
 * never left. The state is one boolean in the chrome slice.
 *
 * THE NAME. `./session-focus.ts` already means "land the person IN a session"
 * for the attention overlay and the menu bar sentinel. This module is the
 * mode, not the jump, so it is named for what it does.
 *
 * WHO CALLS `toggleSessionFocus` SINCE PHASE 129. The chord no longer arrives
 * here directly. `./fill-chord.ts` reads the region the keyboard is in and
 * sends the chord either here or to the editor's own fill. Escape and the
 * native View row still call this module directly, because both of them mean
 * the session and nothing else. Nothing in this file changed for that.
 *
 * THE WORK'S FRAME SINCE PHASE 284. The work area wears one rounded outline
 * (./work-area.css) and the mode turns it off (focus-mode.css section 7), so
 * one end of every flight is framed and the other is not. The photograph is
 * above the frame's clip, so it wears the curve itself: `fly` reads the frame
 * at its framed end, with no toggle and no forced layout of its own, and hands
 * it to ./focus-copy.ts. Nothing is animated for it. The radius is a static style
 * on the copy and `transform` is still the only property a keyframe names.
 *
 * THE KEYBOARD SINCE PHASE 286. Hiding the surface under the photograph blurs
 * whatever inside it held the keyboard, so `fly` remembers that element before
 * the hide and gives the keyboard back in the tidy up. One keyboard is MOVED,
 * and only on the way in: one parked in the session list, which the mode stops
 * drawing, goes to the focused pane. The chord's refusal in no region
 * (./fill-chord.ts) is untouched. Two limits, stated rather than fixed. Keys
 * pressed while the photograph is in the air, about 200 ms, are not delivered
 * to the session. And Escape no longer leaves the mode from inside a session,
 * because the keyboard is now in the session and Escape there is the agent's
 * (./keyboard.ts); the chord is the way out, and ../terminal/keys keeps it
 * from reaching the session as a carriage return.
 */

import type { SessionStatus } from '@shared/types';
import { effectiveStatusOf, useApp } from '../state/store';
import {
  buildStillCopy,
  type CopyFrame,
  type FlightRect,
  type StillCopy
} from './focus-copy';
import { keyboardIsInASessionList } from './session-list-keyboard';

export type { FlightRect };

/** The class React puts on the shell root while the mode is on. */
export const FOCUS_CLASS = 'session-focus';
/**
 * The class the measurement borrows for one unpainted layout pass. It hides
 * exactly the set `.session-focus` hides, declared as one grouped selector in
 * focus-mode.css, so what is measured is what React will render.
 */
export const MEASURE_CLASS = 'gmux-focus-measure';
/** The class that is on the shell root while the copy is in the air. */
export const FLIGHT_CLASS = 'gmux-focusing';
/**
 * The ATTRIBUTE that fades the chrome back in after a LEAVE has swapped.
 *
 * TWO THINGS ARE DELIBERATE HERE AND BOTH WERE MEASURED.
 *
 * It runs AFTER the swap rather than during the flight, for the reason that
 * governs this whole module. A region that is `display: none` cannot fade,
 * and drawing it during the flight would give the sidebar and the dock their
 * widths back, which would change the live surface's border box and send a
 * resize to every leaf mid gesture. So the chrome comes back at the swap,
 * laid out, and only its opacity is animated from there. Opacity moves no
 * box, so nothing is resized twice.
 *
 * It is an attribute and not a class because React owns this element's class
 * attribute. `App.tsx` renders `className={'shell' + (sessionFocus ? ' ...`,
 * so the swap makes that string change and React writes the whole attribute,
 * which erases anything added to `classList` by hand. Measured on 2026-08-18:
 * the first version of this used a class, and a frame by frame reading of the
 * sidebar over a leave went from `shell session-focus gmux-focusing` at
 * opacity 0 straight to `shell` at opacity 1, with the class gone and no fade.
 * React never wrote `data-focus-arriving`, so React never takes it away.
 * FLIGHT_CLASS survives its own 200 ms for the opposite reason. Nothing
 * re-renders during a flight, and the swap is where it is meant to end.
 */
export const ARRIVE_ATTR = 'data-focus-arriving';

/** The surface, and the gate. Absent means there is nothing to focus. */
const SURFACE_SELECTOR = '[data-surface-leaves]';
const SHELL_SELECTOR = '.shell';
/**
 * The work's frame (Phase 284): the ancestor of the surface that
 * ./work-area.css rounds and outlines, and that focus-mode.css section 7
 * squares off again while the mode is on.
 */
const FRAME_SELECTOR = '.work-area';
/**
 * xterm's own textarea, the element that holds the keyboard inside a
 * terminal (Phase 286). Named here for the two cases where the flight has to
 * choose one: the element that held the keyboard on the way in is gone by the
 * way out, or the keyboard was parked in a session list the mode un-draws.
 */
const HELPER_TEXTAREA_SELECTOR = '.xterm-helper-textarea';
/**
 * The focused pane's textarea, by the two marks the surface already wears.
 * `./split/SplitSurface.tsx` puts `focused` on the one `.split-pane` whose
 * session is the layout's active leaf, and `./TerminalRegion.tsx` draws a
 * surface of one as `.surface-single`, whose only pane is that leaf. These
 * are the panes `TerminalPane` is handed `focused` for, so the keyboard and
 * the outline end up on the same pane.
 *
 * Exported since Phase 289, for `focusTerminal()` in ./session-focus.ts, so
 * Enter on a session row and the menu path into the mode ask one question.
 */
export const FOCUSED_LEAF_TEXTAREA_SELECTOR =
  `.split-pane.focused ${HELPER_TEXTAREA_SELECTOR}, ` +
  `.surface-single ${HELPER_TEXTAREA_SELECTOR}`;

/** Fallbacks for the two motion tokens, used only when they cannot be read. */
const FALLBACK_MS = 200;
const FALLBACK_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/** The two refusals, in the words DESIGN.md section 6 asks for. */
export const NOTHING_TO_FOCUS = 'There is no session to focus.';
export const RESTORE_FIRST = 'Restore this session before you focus it.';

/** Which way the flight is going. */
export type FlightDestination = 'focused' | 'ordinary';

/**
 * One flight at a time. A second chord arriving mid flight is dropped rather
 * than queued, because the person pressing twice in 200 ms wants the gesture
 * they can already see, not two of them.
 */
let flying = false;

/**
 * The pending removal of ARRIVE_ATTR. It is held so a second gesture can
 * cancel it: a finished animation with `both` fill pins opacity at 1, and a
 * left-behind attribute would stop the chrome fading OUT on the next enter.
 */
let arriveTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Pure decisions
// ---------------------------------------------------------------------------

/** Four decimal places, with no trailing zeroes. */
function round(value: number): string {
  return String(Number(value.toFixed(4)));
}

/**
 * The ordinary First Last Invert Play transform. Applied to an element laid
 * out at `last`, it puts that element exactly where `first` is.
 *
 * A zero sized destination cannot be divided by, and a scale of 1 is the
 * honest answer there. The copy simply does not grow.
 */
export function invertTransform(first: FlightRect, last: FlightRect): string {
  const sx = last.width === 0 ? 1 : first.width / last.width;
  const sy = last.height === 0 ? 1 : first.height / last.height;
  const tx = first.left - last.left;
  const ty = first.top - last.top;
  return `translate(${round(tx)}px, ${round(ty)}px) scale(${round(sx)}, ${round(sy)})`;
}

/** A leaf in this state has no live output, so there is nothing to grow. */
function needsRestore(status: SessionStatus): boolean {
  return status === 'restorable' || status === 'exited';
}

/**
 * True when every leaf on screen is one the person must restore first.
 *
 * An empty list is not an answer and returns false, because "I could not see
 * the leaves" must never become "I refuse". A group with one live leaf and
 * five restorable ones is still worth focusing, and this says so.
 */
export function everyLeafNeedsRestore(statuses: SessionStatus[]): boolean {
  return statuses.length > 0 && statuses.every(needsRestore);
}

/** The statuses of the leaves TerminalRegion says it drew, in leaf order. */
function visibleLeafStatuses(): SessionStatus[] {
  const app = useApp.getState();
  const byId = new Map(app.sessions.map((session) => [session.id, session]));
  return app.visibleSessionIds.flatMap((id) => {
    const session = byId.get(id);
    return session === undefined ? [] : [effectiveStatusOf(session)];
  });
}

/**
 * Why the mode will not open, or null when it will.
 *
 * TWO GATES, and the second one exists because the first one was not enough.
 *
 * The first gate is the DOM query the flight itself uses to find its subject.
 * No `[data-surface-leaves]` node means there is nothing to photograph, which
 * is the single-session case: a restorable or ended session renders the quiet
 * Restore state instead, and a project with no sessions renders the empty
 * board, so neither carries the attribute.
 *
 * The second gate reads the store. A SPLIT GROUP writes the attribute from
 * TerminalRegion whatever its leaves are doing, and each ended leaf draws its
 * own Restore card inside the surface. Resting on the DOM alone therefore let
 * a group of four restorable sessions fill the window with four Restore cards
 * under an empty title band. Measured on 2026-08-18 before this gate existed.
 * So the leaves are read as well, and the mode refuses when every one of them
 * is waiting to be restored.
 *
 * Refusing in silence from a menu row is the one thing a menu row must never
 * do, so both answers are sentences the caller can put in a toast.
 */
export function focusRefusal(): string | null {
  if (document.querySelector(SURFACE_SELECTOR) === null) {
    const active = useApp.getState().activeSession();
    const status = active === null ? null : effectiveStatusOf(active);
    return status !== null && needsRestore(status)
      ? RESTORE_FIRST
      : NOTHING_TO_FOCUS;
  }
  return everyLeafNeedsRestore(visibleLeafStatuses()) ? RESTORE_FIRST : null;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

function rectOf(el: Element): FlightRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/**
 * Where each of `elements` will be once the swap has happened, in the order
 * they were given.
 *
 * The class is added and removed inside ONE task, so the browser never paints
 * the intermediate layout and the ResizeObserver in TerminalPane is never
 * notified. An observer compares the box at delivery time, and by then it is
 * back to the value it started at. `getBoundingClientRect` is what forces the
 * synchronous layout in between.
 *
 * Both directions share these three lines with the add and the remove
 * swapped, which is the reason the mode hides its chrome with a class rather
 * than with a memento.
 *
 * SEVERAL ELEMENTS, ONE TOGGLE (Phase 284). A leave needs the surface's
 * destination AND the work's frame at that destination, because the frame is
 * only drawn once the mode is off. Asking twice would be two toggles and two
 * forced layouts inside the gesture. The first read after the class flips
 * forces the one layout, and every read after it is answered from that same
 * layout.
 */
export function measureFocusRects(
  shell: HTMLElement,
  elements: readonly Element[],
  to: FlightDestination
): FlightRect[] {
  const wasFocused = shell.classList.contains(FOCUS_CLASS);
  if (to === 'focused') shell.classList.add(MEASURE_CLASS);
  else shell.classList.remove(FOCUS_CLASS);
  const rects = elements.map(rectOf);
  if (to === 'focused') shell.classList.remove(MEASURE_CLASS);
  else if (wasFocused) shell.classList.add(FOCUS_CLASS);
  return rects;
}

/** Where the surface will be once the swap has happened. One element. */
export function measureFocusRect(
  shell: HTMLElement,
  surface: Element,
  to: FlightDestination
): FlightRect {
  const [rect] = measureFocusRects(shell, [surface], to);
  // One element in is one rect out, so this is unreachable. It is an honest
  // answer all the same: a surface with no size does not fly anywhere.
  return rect ?? { left: 0, top: 0, width: 0, height: 0 };
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * Read at the moment the chord fires, never cached, because a person can turn
 * the setting on while the app is open.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * The duration and curve, read from the tokens the chrome's own fade uses, so
 * the copy and the chrome cannot drift apart. The fallbacks are only reached
 * where there is no computed style to read, which is unit tests.
 */
export function flightTiming(): { ms: number; easing: string } {
  try {
    const styles = getComputedStyle(document.documentElement);
    const rawMs = styles.getPropertyValue('--dur-panel').trim();
    const parsed = Number.parseFloat(rawMs);
    const easing = styles.getPropertyValue('--ease-out').trim();
    return {
      ms: Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_MS,
      easing: easing.length > 0 ? easing : FALLBACK_EASING
    };
  } catch {
    return { ms: FALLBACK_MS, easing: FALLBACK_EASING };
  }
}

/**
 * The INNER radius of the work's frame, in CSS pixels (Phase 284).
 *
 * Read from the two tokens ./work-area.css draws the frame with, the outer
 * radius less the width of the line, so the photograph and the live curve it
 * covers cannot drift apart and no copy of either number lives in this file.
 * Read at the moment the chord fires, as the timing above is.
 *
 * UNREADABLE MEANS ZERO, AND ZERO MEANS A SQUARE COPY, which is every flight
 * before Phase 284 and is what a unit test gets, where there is no computed
 * style to read.
 */
export function frameInnerRadius(): number {
  try {
    const styles = getComputedStyle(document.documentElement);
    const outer = Number.parseFloat(styles.getPropertyValue('--r-frame'));
    const edge = Number.parseFloat(styles.getPropertyValue('--frame-edge'));
    if (!Number.isFinite(outer) || outer <= 0) return 0;
    const inner = outer - (Number.isFinite(edge) && edge > 0 ? edge : 0);
    return inner > 0 ? inner : 0;
  } catch {
    return 0;
  }
}

/**
 * The work's frame at the ONE end of this flight that has one, or undefined
 * when the copy should stay square.
 *
 * Session focus turns the frame off, so an enter is framed at `first` and a
 * leave at `last`. `frameNow` is the frame's rect read before anything
 * toggled, which is the framed end of an enter. `frameThen` is its rect from
 * the same unpainted pass that measured the destination, which is the framed
 * end of a leave.
 */
export function framedEnd(
  to: FlightDestination,
  frameNow: FlightRect | null,
  frameThen: FlightRect | null,
  radius: number
): CopyFrame | undefined {
  const frame = to === 'focused' ? frameNow : frameThen;
  if (frame === null || !(radius > 0)) return undefined;
  return { frame, end: to === 'focused' ? 'first' : 'last', radius };
}

/** Drop the arrival attribute now, and cancel any removal already scheduled. */
export function clearArrival(shell: HTMLElement | null): void {
  if (arriveTimer !== null) {
    clearTimeout(arriveTimer);
    arriveTimer = null;
  }
  if (shell !== null) shell.removeAttribute(ARRIVE_ATTR);
}

/**
 * Start the chrome's fade in, and schedule the class off again.
 *
 * The fade is a CSS animation rather than a transition on purpose. A
 * transition needs the browser to have already computed opacity 0 on a drawn
 * element, and the swap is a store write that React's scheduler flushes on
 * its own clock, so there is no frame this code can name where that is
 * guaranteed to be true. An animation starts when the element is first drawn,
 * whenever that is.
 */
export function beginArrival(shell: HTMLElement, ms: number): void {
  clearArrival(shell);
  shell.setAttribute(ARRIVE_ATTR, '');
  arriveTimer = setTimeout(() => {
    arriveTimer = null;
    shell.removeAttribute(ARRIVE_ATTR);
  }, ms + 60);
}

export function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(() => {
        resolve();
      }, 16);
      return;
    }
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// The keyboard (Phase 286)
// ---------------------------------------------------------------------------

/**
 * Where the keyboard was when the gesture began, in the three answers the
 * tidy up can act on.
 */
type KeyboardBefore =
  | { where: 'surface'; held: HTMLElement }
  | { where: 'list' }
  | { where: 'elsewhere' };

/**
 * Read the keyboard. Called BEFORE the hide, which is the only moment an
 * element inside the surface still has it.
 *
 * `surface` is an element inside the surface, and it is given back as it was.
 *
 * `list` is the session strip or the session dock, and it is an answer on the
 * way IN only. The mode does not draw the session list (focus-mode.css section
 * 1), so a keyboard parked there cannot stay there: the swap un-draws the list
 * and the keyboard falls to `body`, where typing goes nowhere and the chord is
 * silent. Measured on 2026-09-18 with the keyboard on a strip tab and the mode
 * entered the way View > Focus the Session or File enters it, by a keydown no
 * row handler sees: `body` after the enter, the typed text in no session, and
 * the leave chord doing nothing. ⇧⌘↩ pressed ON a row never gets this far,
 * because the row's own Enter handler is blind to modifiers and hands the
 * keyboard to the terminal about 1.5 ms before the hide, which the flight then
 * keeps as `surface`. On the way OUT the list is not drawn, so it is never the
 * answer there and a leave moves nothing.
 *
 * `elsewhere` is left alone, on the way in and on the way out.
 */
function keyboardBefore(
  surface: HTMLElement,
  to: FlightDestination
): KeyboardBefore {
  const active = document.activeElement;
  if (active !== null && surface.contains(active)) {
    return { where: 'surface', held: active as HTMLElement };
  }
  if (to === 'focused' && keyboardIsInASessionList()) return { where: 'list' };
  return { where: 'elsewhere' };
}

/**
 * Put the keyboard where `keyboardBefore` says it belongs.
 *
 * WHY IT LEFT. The flight sets the surface `visibility: hidden` so the
 * photograph can fly over it, and Chromium blurs a focused element the
 * moment it becomes hidden. The keyboard fell to `body` on every flight
 * since Phase 80.1, and nothing brought it back. Measured on 2026-09-17:
 * `textarea.xterm-helper-textarea` before the chord, `body` 100 ms after it,
 * and still `body` at 1.5 s with the mode on. What a person typed went
 * nowhere, and the chord that leaves was silent, because ./fill-chord.ts
 * reads the region the keyboard is in and `body` is in no region.
 *
 * WHY HERE AND NOT IN FILL-CHORD. The chord's refusal in no region is right
 * and stays. The flight is what moved the keyboard, so the flight is what
 * gives it back, beside the line that undoes the hide and after it, because
 * a hidden element cannot take the keyboard.
 *
 * WHEN THE FLIGHT OUTLIVED THE ELEMENT the focused pane's textarea is the
 * honest answer, and with no pane marked NOTHING is focused. A pane that
 * closes mid flight makes another pane the focused one, and `TerminalPane`
 * asks for the keyboard for it through its own `focused` effect. A request
 * made under the hide is refused, so the tidy up repeats it for that same
 * pane and for no other. The first textarea in document order, which this
 * took until the fix round, is a different pane from the outlined one in any
 * split where the first pane is not the selected one (measured: held
 * `split-4`, outlined `split-2`, and the keyboard went to `p286-a`).
 *
 * FROM THE LIST the focused pane's textarea again, and only when no pane is
 * marked, or the marked one draws no terminal, the first one the surface
 * draws. That was all `focusTerminal()` in ./session-focus.ts asked for Enter
 * on a row until Phase 289, and it is that function's fallback still, so the
 * two doors give one answer in both cases.
 *
 * `preventScroll` because the row is `overflow: clip` since Phase 284 and a
 * scroll container is exactly what it refuses to be.
 */
function giveKeyboardBack(surface: HTMLElement, before: KeyboardBefore): void {
  if (before.where === 'elsewhere') return;
  if (before.where === 'surface' && before.held.isConnected) {
    before.held.focus({ preventScroll: true });
    return;
  }
  const target =
    surface.querySelector<HTMLElement>(FOCUSED_LEAF_TEXTAREA_SELECTOR) ??
    (before.where === 'list'
      ? surface.querySelector<HTMLElement>(HELPER_TEXTAREA_SELECTOR)
      : null);
  target?.focus({ preventScroll: true });
}

/**
 * The gesture with no flight in it: reduced motion, or no photograph could be
 * built. Nothing is hidden, so a keyboard inside the surface never leaves it
 * and there is nothing to give back. A keyboard in the session list still
 * loses its seat at the swap, so on the way in it is handed over now, while
 * the surface is drawn and before the store write un-draws the list. Measured
 * under `prefers-reduced-motion` on 2026-09-18: `body` without this.
 */
function handOverWithoutAFlight(
  surface: HTMLElement,
  to: FlightDestination
): void {
  const before = keyboardBefore(surface, to);
  if (before.where === 'list') giveKeyboardBack(surface, before);
}

// ---------------------------------------------------------------------------
// The gesture
// ---------------------------------------------------------------------------

/**
 * Enter or leave, whichever the store says is next.
 *
 * Leaving never refuses. A mode you cannot get out of is the failure this
 * whole phase is built to avoid, so the only guard on the way out is the one
 * that stops two flights overlapping.
 */
export async function toggleSessionFocus(): Promise<void> {
  if (flying) return;
  if (useApp.getState().sessionFocus) {
    await leaveSessionFocus();
    return;
  }
  await enterSessionFocus();
}

/** Grow the session surface until it fills the window. */
export async function enterSessionFocus(): Promise<void> {
  if (flying) return;
  if (useApp.getState().sessionFocus) return;
  const refusal = focusRefusal();
  if (refusal !== null) {
    useApp.getState().toast('info', refusal);
    return;
  }
  await fly('focused');
}

/** Put every region back. */
export async function leaveSessionFocus(): Promise<void> {
  if (flying) return;
  if (!useApp.getState().sessionFocus) return;
  await fly('ordinary');
}

async function fly(to: FlightDestination): Promise<void> {
  const commit = (): void => {
    useApp.getState().setSessionFocus(to === 'focused');
  };
  const shell = document.querySelector<HTMLElement>(SHELL_SELECTOR);
  const surface = document.querySelector<HTMLElement>(SURFACE_SELECTOR);
  // A gesture arriving while the last one's fade in is still running takes
  // the attribute off first, so the two never fight over the chrome's
  // opacity.
  clearArrival(shell);
  // No shell and no surface means there is nothing to photograph. On the way
  // out that is still a state the person must be able to reach, so the mode
  // flips with no motion rather than refusing.
  if (shell === null || surface === null || prefersReducedMotion()) {
    if (surface !== null) handOverWithoutAFlight(surface, to);
    commit();
    return;
  }

  flying = true;
  /** The photograph, once it is in the document. The tidy up is its guard. */
  let node: HTMLElement | null = null;
  /** Where the keyboard was before the hide. Read once, just before it. */
  let before: KeyboardBefore = { where: 'elsewhere' };
  try {
    const first = rectOf(surface);
    // PHASE 284. The work's frame, so the photograph can wear its curve. The
    // guard is for the unit tests' surface, which is a plain object with no
    // `closest`. With no frame found the copy is square, as it always was.
    const frame =
      typeof surface.closest === 'function'
        ? surface.closest(FRAME_SELECTOR)
        : null;
    // The framed end of an ENTER is now. Nothing has toggled and `first` above
    // already forced this layout, so this read costs no second one.
    const frameNow = frame !== null && to === 'focused' ? rectOf(frame) : null;
    // The framed end of a LEAVE is the destination, so the frame rides along
    // in the SAME toggle that measures the surface. One toggle, one layout.
    const [measured, frameThen] = measureFocusRects(
      shell,
      frame !== null && to === 'ordinary' ? [surface, frame] : [surface],
      to
    );
    const last = measured ?? first;
    const framed = framedEnd(
      to,
      frameNow,
      frameThen ?? null,
      frame === null ? 0 : frameInnerRadius()
    );

    let copy: StillCopy | null = null;
    try {
      copy = await buildStillCopy(surface, first, last, undefined, framed);
    } catch {
      copy = null;
    }
    if (copy === null || typeof copy.node.animate !== 'function') {
      handOverWithoutAFlight(surface, to);
      commit();
      return;
    }

    node = copy.node;
    document.body.appendChild(node);
    // PHASE 286. Read BEFORE the hide, because the hide is what blurs it, and
    // a read one line later finds `body`.
    before = keyboardBefore(surface, to);
    // `visibility` changes no border box, so this fires no ResizeObserver and
    // sends no resize. `display: none` here would send one per leaf.
    surface.style.visibility = 'hidden';
    shell.classList.add(FLIGHT_CLASS);

    const timing = flightTiming();
    const animation = node.animate(
      [{ transform: invertTransform(first, last) }, { transform: 'none' }],
      { duration: timing.ms, easing: timing.easing, fill: 'both' }
    );
    await animation.finished.catch(() => undefined);

    // THIS IS THE SWAP. React puts the class on the shell root, the chrome
    // regions become display:none, the surface reflows to `last`, and each
    // visible leaf gets exactly one ResizeObserver notification, one fit and
    // one sessions.resize.
    commit();

    // Leaving only. On the way in the chrome is already fading out under the
    // photograph. On the way out this is its only chance, because until this
    // line every region it names was not drawn at all.
    if (to === 'ordinary') beginArrival(shell, timing.ms);

    // The spec drops the flight class in the same task as the swap. It is
    // dropped one frame later here, because a store write outside a React
    // event is flushed by React's scheduler and is not guaranteed to reach
    // the DOM before the next paint. Waiting one frame means the chrome can
    // never be caught drawn at full opacity in the frame between the two.
    await nextFrame();
    shell.classList.remove(FLIGHT_CLASS);

    // A second frame, because the fit lands on the frame after the observer
    // fires. Holding the photograph across both is what stops the person
    // seeing the old column count stretched into the new box.
    await nextFrame();
  } finally {
    flying = false;
    // The tidy up lives here and nowhere else, so a throw anywhere above
    // cannot leave a photograph pinned over the app with the live surface
    // invisible underneath it. That state has no way out from the keyboard.
    if (node !== null) {
      shell.classList.remove(FLIGHT_CLASS);
      surface.style.visibility = '';
      node.remove();
      // PHASE 286. After the visibility, never before it: a hidden element
      // refuses the keyboard, and this is the one place the hide is undone.
      giveKeyboardBack(surface, before);
    }
  }
}
