/**
 * The Catch Me Up page rides the session focus flight (Phase 137).
 *
 * This module writes NO second animation. The 200 ms is the same
 * FLIGHT_CLASS fade focus-mode.css already declares, the timing is the same
 * flightTiming() read of the two motion tokens, and the way back is the same
 * beginArrival attribute that fades the chrome in after a focus leave. The
 * page is the same flight landing on a different layer, and
 * flight-classes.test.ts holds this file to that.
 *
 * On an ENTER the chrome fades under FLIGHT_CLASS while the layout stands
 * still, the commit at the end adds `.overview-open` to the shell root, and
 * the layer fades in with the gmux-focus-chrome-in keyframes that
 * focus-mode.css declares. No photograph flies, because the destination is a
 * page and not the session surface.
 *
 * On a LEAVE the close swaps first and beginArrival fades the chrome back
 * in, exactly as a focus leave does. A leave never refuses and never waits.
 *
 * THE KEYBOARD SINCE PHASE 289. The leave does not wait, but the keyboard has
 * to: the terminal cannot take it until React has taken `.overview-open` off
 * the shell. `afterOverviewLeavesTheDom` is how a caller hears that, and
 * ./open-overview.ts decides what to do with it.
 */

import {
  ARRIVE_ATTR,
  FLIGHT_CLASS,
  beginArrival,
  clearArrival,
  flightTiming,
  nextFrame,
  prefersReducedMotion
} from '../app/focus-flight';

const SHELL_SELECTOR = '.shell';
/**
 * The class `../app/App.tsx` renders on the shell root while the page is
 * open. `./overview.css` hangs `display: none` for the work area on it.
 */
const OPEN_CLASS = 'overview-open';

/** One flight at a time. A second chord inside the 200 ms is dropped. */
let flying = false;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * How long the enter waits for the frame that ends it before it stops
 * waiting (Phase 183). Chromium stops the frame clock entirely for an
 * occluded window, a locked screen or a fully covered one, and Phase 171's
 * commit recorded the consequence: the bare frame wait below never settled,
 * the flying latch stayed held, and every later Catch Me Up toggle was
 * dropped in silence until a frame fired. Timers keep firing while frames
 * do not, so racing the frame against this bound opens the latch in bounded
 * time whatever the window is doing. On the normal path the frame arrives
 * in one paint, far inside the bound, so the flight's look and timing do
 * not move.
 */
const FRAME_BOUND_MS = 100;

function frameWithin(ms: number): Promise<void> {
  return Promise.race([nextFrame(), wait(ms)]);
}

/** True while a leave's chrome fade in is still running on the shell root. */
export function overviewChromeArriving(shell: HTMLElement): boolean {
  return shell.hasAttribute(ARRIVE_ATTR);
}

/**
 * Fade the chrome for 200 ms, then run the commit that opens the page.
 *
 * Under reduced motion the commit runs at once, which is the same shape the
 * focus flight takes there. The commit is the caller's store write, so the
 * swap happens in one React render exactly as focus mode swaps.
 */
export async function enterOverviewFlight(commit: () => void): Promise<void> {
  if (flying) return;
  const shell = document.querySelector<HTMLElement>(SHELL_SELECTOR);
  if (shell === null || prefersReducedMotion()) {
    commit();
    return;
  }
  flying = true;
  try {
    // A leave's arrival fade may still be running. Its attribute pins the
    // chrome at full opacity, so the enter takes the attribute off before
    // the fade out starts.
    clearArrival(shell);
    shell.classList.add(FLIGHT_CLASS);
    await wait(flightTiming().ms);
    commit();
    // The class comes off one frame later, for the reason focus-flight.ts
    // gives. The store write is flushed by React on its own clock, and the
    // chrome must not be caught drawn at full opacity in between. The wait
    // is bounded, because an occluded window gets no frames at all and the
    // finally below must always run. See FRAME_BOUND_MS.
    await frameWithin(FRAME_BOUND_MS);
  } finally {
    flying = false;
    shell.classList.remove(FLIGHT_CLASS);
  }
}

/**
 * Run the close, then fade the chrome back in.
 *
 * The order is the point, and the reason is written over section 4b of
 * focus-mode.css. A region that is display none cannot fade, so the chrome
 * is drawn again by the close and only its opacity moves after that.
 */
export function leaveOverviewFlight(close: () => void): void {
  const shell = document.querySelector<HTMLElement>(SHELL_SELECTOR);
  close();
  if (shell === null || prefersReducedMotion()) return;
  beginArrival(shell, flightTiming().ms);
}

/**
 * Run `then` once a close has reached the DOM, and hand back the cancel
 * (Phase 289).
 *
 * WHY ANYBODY HAS TO WAIT. The close is a store write, and React takes
 * OPEN_CLASS off the shell on its own clock, after the task that made the
 * write. Until it does the work area is `display: none`, and nothing inside a
 * box that is not drawn can take the keyboard. Measured on 2026-09-18, at
 * HEAD and at the parent: a leave that asked the terminal to take the
 * keyboard in the same task left `document.activeElement` on `body`, and what
 * the person typed arrived in no session.
 *
 * WHY THE CLASS ATTRIBUTE AND NOT A CLOCK. The class going is the fact the
 * caller is waiting for, so that is what is watched. A timer with a number in
 * it guesses at React's clock, and a frame never comes at all for an occluded
 * window, which is what FRAME_BOUND_MS above exists for. The observer hears
 * every write to the attribute, the flight's own class by hand among them, so
 * it answers only the write that leaves OPEN_CLASS off, once, and
 * disconnects itself.
 *
 * Null means there is nothing to wait for. The shell does not carry the
 * class, so whatever the caller did in its own task already had the DOM it
 * needed. The cancel is for the page opened again before the class goes.
 * Under reduced motion that open commits in the same task as the close, React
 * renders the class string it already drew, no write is ever delivered, and a
 * wait nobody cancelled would stay armed until some later close answered it.
 */
export function afterOverviewLeavesTheDom(
  then: () => void
): (() => void) | null {
  const shell = document.querySelector<HTMLElement>(SHELL_SELECTOR);
  if (shell === null || !shell.classList.contains(OPEN_CLASS)) return null;
  if (typeof MutationObserver !== 'function') return null;
  let live = true;
  const observer = new MutationObserver(() => {
    if (!live || shell.classList.contains(OPEN_CLASS)) return;
    live = false;
    observer.disconnect();
    then();
  });
  observer.observe(shell, { attributes: true, attributeFilter: ['class'] });
  return () => {
    live = false;
    observer.disconnect();
  };
}
