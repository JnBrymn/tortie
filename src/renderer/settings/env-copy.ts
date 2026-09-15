/**
 * Every sentence Settings → Launch defaults draws for the shell-variable
 * control (Phase 269), in one module, the house pattern of machines-copy.ts,
 * arch-copy.ts and fold-copy.ts.
 *
 * TWO RULES BIND EVERY STRING HERE, and they are not style preferences.
 *
 * 1. NAMES ONLY. Not one string in this file interpolates, formats, hints at
 *    or measures a VALUE. A length is a value. The control exists so a person
 *    can say which of their own shell variables an agent is handed, and the
 *    value is resolved from the login shell at the moment a session starts and
 *    is stored nowhere — not in settings, not in the session database, not in
 *    a log, and never in this window. `__tests__/p269-env-names.test.tsx`
 *    holds the surface to that.
 *
 * 2. JUST ENOUGH WORDS (the operator's rule, 2026-08-28). The resting face is
 *    a label, a button and ONE line. A card for an agent nobody has configured
 *    costs one head row and that line. There is no paragraph anywhere on this
 *    surface, and the only long sentences a person can meet are the refusals,
 *    which appear one at a time, at the field they typed into, and say what to
 *    do instead.
 *
 * The refusal sentences are NOT here. They come from `envPassthroughRefusal`
 * in @shared/agent-overlay, which is the one spelling of the rule, read both
 * by this window (which shows the sentence) and by the settings store (which
 * only asks whether it is null). A copy of them here could disagree with the
 * file that does the refusing, which is the whole reason they live there.
 */

/** The head label of the group, inside the agent's existing card. */
export const ENV_GROUP_LABEL = 'Shell variables';

/** The button, closed. The ellipsis says "there is a step after this". */
export const ENV_ADD_OPEN = 'Add…';

/** The same button, with the field open. No ellipsis: this one commits. */
export const ENV_ADD_COMMIT = 'Add';

/** One aria-label for both states — it is one button doing one job. */
export function envAddLabel(agentName: string): string {
  return `Add a shell variable for ${agentName}`;
}

/**
 * The quiet line, and the whole of the empty state.
 *
 * It is TRUE as written and was checked against the measurement rather than
 * assumed: Tortie writes exactly two variables into the tmux server globals,
 * LANG and PATH, and no others (research 123 §1.2; supervisor.ts:549, :577).
 */
export function envEmptyLine(agentName: string): string {
  return `Gets your shell's PATH and LANG. Add any others ${agentName} needs.`;
}

/** Under the chips, once names are set. One line, and it is the promise. */
export const ENV_SET_CAPTION =
  'Read from your shell at every launch. Never stored.';

/** The ✕ on a chip. Removing never confirms, as disabling a preset never does. */
export function envRemoveLabel(name: string, agentName: string): string {
  return `Remove ${name} from ${agentName}`;
}

/** The field itself. */
export function envFieldLabel(agentName: string): string {
  return `Shell variable name for ${agentName}`;
}

export const ENV_FIELD_PLACEHOLDER = 'Variable name';

/**
 * The reserved line under the field, at rest. It says what the list IS,
 * because a list of a person's own variable names beside a field is exactly
 * the shape that makes somebody wonder whether the values came with them.
 */
export const ENV_NAMES_ONLY =
  'Names only. Tortie never reads a value into this window.';

/** The reserved line when the login shell did not answer. Typing still works. */
export const ENV_PROBE_FAILED = 'Your shell did not answer, so type the name.';

/** The confirm modal's title. Every add confirms; there is no acknowledgement. */
export function envConfirmTitle(name: string, agentName: string): string {
  return `Pass ${name} to every new ${agentName} session?`;
}

/** Body 1, after the name itself, which is drawn in the code slot. */
export const ENV_CONFIRM_BODY_1 =
  'is read from your login shell each time a session starts, and given to ' +
  'that session only.';

/** Body 2. The sentence that is the point of the whole phase. */
export const ENV_CONFIRM_BODY_2 =
  'Tortie keeps the name. It never stores the value — not in settings, not ' +
  'in the session database, not in a log.';

export const ENV_CONFIRM_CANCEL = 'Cancel';

/**
 * The confirming button. `btn-primary`, never `btn-destructive`: this turns no
 * safeguard off, and spending the destructive style here would dull it where
 * it is earned, which is the danger presets two rows above.
 */
export const ENV_CONFIRM_ADD = 'Add';
