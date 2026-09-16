/**
 * Every sentence Settings → Launch defaults draws for the shell-variable
 * control (Phase 269, widened by Phase 275), in one module, the house pattern
 * of machines-copy.ts, arch-copy.ts and fold-copy.ts.
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
 * Phase 275's two cap sentences and its two "already sets it itself" sentences
 * stayed in that function for the same reason, and this file does not repeat
 * either of them.
 *
 * PHASE 275 ADDED A SECOND SUBJECT. Until this phase every sentence here was
 * about one agent, so the agent's display name was the only variable. There is
 * now a list keyed by nothing that every agent reads, and the word for it is
 * **every agent** — never "all agents", never "globally", never "sessions",
 * because the thing that changed is that the AGENT stopped being the boundary.
 * The functions below take a SUBJECT, which is either an agent's display name
 * or the literal `every agent`, so both cards read as one grammar.
 */

/** The head label of the group, inside the card. */
export const ENV_GROUP_LABEL = 'Shell variables';

/**
 * The button. The ellipsis says "there is a step after this" and it is honest
 * on both cards now: Phase 269's second state, where the same button committed
 * what was in an inline field, is gone with the field.
 */
export const ENV_ADD_OPEN = 'Add…';

/**
 * One aria-label for the button on either card. PLURAL since Phase 275 — the
 * picker it opens takes several names at once, so "a shell variable" would
 * understate what pressing it leads to.
 *
 * `subject` is an agent's display name or `every agent`, and both read: "Add
 * shell variables for Claude Code", "Add shell variables for every agent".
 */
export function envAddLabel(subject: string): string {
  return `Add shell variables for ${subject}`;
}

/**
 * The quiet line, and the whole of an agent card's empty state.
 *
 * It is TRUE as written and was checked against the measurement rather than
 * assumed: Tortie writes exactly two variables into the tmux server globals,
 * LANG and PATH, and no others (research 123 §1.2; supervisor.ts:549, :577).
 */
export function envEmptyLine(agentName: string): string {
  return `Gets your shell's PATH and LANG. Add any others ${agentName} needs.`;
}

/**
 * PHASE 275 — the shared card's whole empty state. One line, and it is the
 * OFFER rather than a description: the card exists because a person was
 * setting the same key once per agent, so the empty state's job is to say
 * that they do not have to any more.
 */
export const ENV_SHARED_EMPTY_LINE =
  'Set a key once here and every agent gets it.';

/** Under the chips, once names are set. One line, and it is the promise. */
export const ENV_SET_CAPTION =
  'Read from your shell at every launch. Never stored.';

/**
 * PHASE 275 — what an agent card gets from the card at the top of the page.
 *
 * ONE LINE, AND IT POINTS UP RATHER THAN REPEATING. The names are already on
 * screen one card above, under a head that says "Every agent", so naming them
 * again here would be the same list drawn eleven times on a page a person
 * scrolls. Just enough words.
 *
 * It is drawn only when the shared list is non-empty, so a person who has
 * never opened the shared card meets no extra sentence at all.
 */
export function envInheritLine(sharedCount: number): string {
  return sharedCount === 1
    ? 'Plus the variable every agent gets.'
    : `Plus the ${sharedCount} variables every agent gets.`;
}

/** The ✕ on a chip. Removing never confirms, as disabling a preset never does. */
export function envRemoveLabel(name: string, subject: string): string {
  return `Remove ${name} from ${subject}`;
}

/**
 * The reserved line under the picker's field, at rest. It says what the list
 * IS, because a list of a person's own variable names beside a field is
 * exactly the shape that makes somebody wonder whether the values came with
 * them.
 */
export const ENV_NAMES_ONLY =
  'Names only. Tortie never reads a value into this window.';

/** The reserved line when the login shell did not answer. Typing still works. */
export const ENV_PROBE_FAILED = 'Your shell did not answer, so type the name.';

/**
 * PHASE 275 — the reserved line while the shell is being asked.
 *
 * The probe is one `$SHELL -lic` with a ten second deadline, so on a slow
 * profile the list is genuinely empty for a moment. Before this phase that
 * moment was indistinguishable from "your shell exports nothing", which is
 * the one answer a person must not be given wrongly.
 */
export const ENV_READING_SHELL = 'Reading your shell…';

// ---------------------------------------------------------------------------
// The picker sheet (Phase 275)
// ---------------------------------------------------------------------------

/**
 * PHASE 275 — the sheet's title, on either card.
 *
 * It names the SUBJECT and not the source: a person opening this from the
 * shared card has to see "every agent" in the title, because that is the one
 * fact this sheet's confirm will ask them to agree to.
 */
export function envPickerTitle(subject: string): string {
  return `Add shell variables for ${subject}`;
}

/**
 * The field's placeholder, and its accessible name. It says BOTH jobs in four
 * words, because the field is the filter and the name being added — one
 * control, one caret, nothing to learn.
 */
export const ENV_PICKER_PLACEHOLDER = 'Filter or type a name';

/**
 * PHASE 275 — the count beside the title, in `aria-live="polite"`.
 *
 * ONE FUNCTION AND THREE STATES, so the precedence is decided here rather than
 * in the component. Ticking wins over filtering, because once a person has
 * chosen something the question they are holding is "how many more may I
 * take", and the cap's remaining room is the answer to it. The cap is said
 * HERE, while they tick, and never for the first time at the confirm.
 */
export function envPickerCount(state: {
  /** How many rows are ticked and not already on the list. */
  ticked: number;
  /** How many more this list may still take before the cap. */
  left: number;
  /** Rows the filter is showing. */
  shown: number;
  /** Rows there are in total, filter aside. */
  total: number;
  /** Is there a query in the field? */
  filtering: boolean;
}): string {
  if (state.ticked > 0) {
    return `${state.ticked} selected, ${state.left} left`;
  }
  if (state.filtering) return `${state.shown} of ${state.total}`;
  return state.total === 1 ? '1 name' : `${state.total} names`;
}

/** The footer's commit. The ellipsis is honest: it opens the confirm. */
export function envPickerAdd(count: number): string {
  return count === 0 ? 'Add…' : `Add ${count}…`;
}

export const ENV_PICKER_CANCEL = 'Cancel';

/**
 * PHASE 275 — the row for a name the shell does not export.
 *
 * THE PHASE 174.1 RULING, MADE VISIBLE. The list is a suggestion list and
 * never a cage: a name a person is about to add to their profile is typed and
 * accepted. Until this phase that was true and nothing said so — you typed it,
 * saw no suggestion, and had to guess whether it had taken. Drawing it as a
 * row with this note leaves exactly ONE rule to learn instead of two: every
 * name you can add is a row.
 */
export const ENV_PICKER_NOTE_TYPED = 'not exported by your shell';

/** The note on a name already on the shared list, seen from the shared card. */
export const ENV_PICKER_NOTE_SHARED = 'already shared';

/** The note on a name already on this agent's own list. */
export const ENV_PICKER_NOTE_ON_LIST = 'already on this list';

/**
 * The note on a name an agent card inherits from the shared list. Ticked and
 * LOCKED, because adding it per-agent changes nothing a launch would do and
 * would spend one of that agent's sixteen slots on a no-op.
 */
export const ENV_PICKER_NOTE_INHERITED = 'already shared with every agent';

/** The one line a query matching nothing draws. */
export function envPickerNothing(query: string): string {
  return `Nothing matches “${query}”.`;
}

// ---------------------------------------------------------------------------
// The confirms (Phase 269, made plural and given a shared sibling in 275)
// ---------------------------------------------------------------------------

/**
 * The per-agent confirm's title, for ONE name. Kept byte for byte from Phase
 * 269: nothing about a single per-agent add has changed, and
 * `__tests__/p269-env-names.test.tsx` pins it.
 */
export function envConfirmTitle(name: string, agentName: string): string {
  return `Pass ${name} to every new ${agentName} session?`;
}

/**
 * PHASE 275 — the same sheet when the picker committed more than one name.
 *
 * ONE CONFIRMATION FOR THE BATCH, never one per name. The names themselves are
 * drawn as chips above the body, because a person agreeing to a list has to be
 * able to read the list, and sixteen is the cap so the row can never be long.
 */
export function envConfirmTitleMany(count: number, agentName: string): string {
  return `Pass ${count} shell variables to every new ${agentName} session?`;
}

/** Body 1, after the name itself, which is drawn in the code slot. */
export const ENV_CONFIRM_BODY_1 =
  'is read from your login shell each time a session starts, and given to ' +
  'that session only.';

/** Body 2. The sentence that is the point of the whole phase. */
export const ENV_CONFIRM_BODY_2 =
  'Tortie keeps the name. It never stores the value — not in settings, not ' +
  'in the session database, not in a log.';

/** PHASE 275 — body 1 when the chips above it are a list rather than a name. */
export const ENV_CONFIRM_BODY_1_MANY =
  'Each is read from your login shell each time a session starts, and given ' +
  'to that session only.';

/** PHASE 275 — body 2 in the plural. */
export const ENV_CONFIRM_BODY_2_MANY =
  'Tortie keeps the names. It never stores the values — not in settings, not ' +
  'in the session database, not in a log.';

/**
 * PHASE 275 — the shared confirm's title.
 *
 * "every agent" AND NOT "every session": the per-agent title above already
 * says "every new <Agent> session", and the one thing this sheet has to make a
 * person notice is that the AGENT is no longer the boundary. The breadth,
 * including agents that do not exist on this machine yet, is body line 1 and
 * not the title, because a title carrying a subordinate clause stops being
 * read.
 */
export function envSharedConfirmTitle(count: number): string {
  return count === 1
    ? 'Pass this shell variable to every agent?'
    : `Pass ${count} shell variables to every agent?`;
}

/**
 * Body 1, under the names. THE SENTENCE THIS PHASE EXISTS TO MAKE A PERSON
 * READ.
 *
 * It is layer two of the seal moving, said out loud. Until this phase a name
 * confirmed for `claude` could not reach `codex` even if an agent copied it
 * across, because the agent id was in the seal key. A shared list means one
 * confirmation covers every agent by design — so the confirmation has to say
 * that, once, in words a person can decline.
 */
export const ENV_SHARED_CONFIRM_BODY_1 =
  'Every agent Tortie launches gets these, including agents you install later.';

/** Body 2. The same promise the per-agent sheet makes, in the plural. */
export const ENV_SHARED_CONFIRM_BODY_2 =
  'Each is read from your login shell when a session starts, and given to ' +
  'that session only.';

/** Body 3. Names only, said at the last place a person can still say no. */
export const ENV_SHARED_CONFIRM_BODY_3 =
  'Tortie keeps the names. It never stores the values — not in settings, not ' +
  'in the session database, not in a log.';

export const ENV_CONFIRM_CANCEL = 'Cancel';

/**
 * The confirming button. `btn-primary`, never `btn-destructive`: this turns no
 * safeguard off, and spending the destructive style here would dull it where
 * it is earned, which is the danger presets two rows above.
 */
export const ENV_CONFIRM_ADD = 'Add';

// ---------------------------------------------------------------------------
// The rejection line (Phase 275)
// ---------------------------------------------------------------------------

/**
 * PHASE 275 — a name in `settings.json` that this window did not put there.
 *
 * THE SEAL dropped it, and this line is where a person finds out, instead of
 * discovering it when an agent stops seeing a key. Every name drawn here has
 * already passed `OVERLAY_ENV_KEY_PATTERN` — letters, digits and underscore,
 * at most 64 bytes — so nothing hostile can reach the DOM through it. That is
 * the difference between "never silently dropped" and handing an attacker a
 * rendering primitive.
 *
 * It says WHY in the same breath as WHAT, because "ignored" on its own reads
 * as a bug rather than as the safeguard it is.
 *
 * "NOT ADDED HERE" IS A DIRECTION AND THAT IS WHY IT IS ONLY THE SEAL'S LINE.
 * It tells a person the fix: add the name in this window and it will work. That
 * is true of a seal drop and FALSE of a shape drop, which is the whole reason
 * `envUnreadLine` below exists — see the fix round's account on
 * `envRejectionsNow` in src/main/settings/store.ts.
 */
export function envRejectedLine(names: readonly string[]): string {
  return `Ignored, because they were not added here: ${names.join(', ')}.`;
}

/**
 * PHASE 275, THE FIX ROUND — a name in `settings.json` that Tortie will not
 * read at all, whoever put it there.
 *
 * THE SECOND SENTENCE, BECAUSE THE FIRST ONE WAS UNTRUE FOR THESE NAMES. The
 * build the verifiers attacked drew `envRejectedLine` over BOTH layers of
 * rejection. So a person who had added `V_REAL` in this window, and who then
 * hit the sixteen-name cap because junk sat ahead of it in the file, was told
 * `V_REAL` "was not added here" — about the one name they cared about, on the
 * one surface that exists to tell them the truth about it. And `PATH`, which
 * this window would refuse if they typed it, was given the same sentence and
 * with it an invitation to go and type it.
 *
 * So the shape layer gets its own words, and they point in the other direction:
 * adding these here does not help. The causes are the ones
 * `envPassthroughRefusal` lists — not a name, on a denylist, already on the
 * list, a variable some agent's own row already sets, or past the sixteen this
 * door reads — and one sentence covers all of them, because what a person needs
 * from this line is which of the two fixes is theirs, not a taxonomy.
 *
 * `over` IS A COUNT AND NEVER A LIST, and it is the second half of the fix. The
 * shape layer runs over the RAW file, so the number of these names is chosen by
 * whoever wrote the file; main caps the echo at sixteen and counts the rest.
 * Drawing "and 984 more" is the honest end of a line that cannot draw them all.
 */
export function envUnreadLine(names: readonly string[], over = 0): string {
  const list = over > 0 ? `${names.join(', ')}, and ${over} more` : names.join(', ');
  return names.length === 1 && over === 0
    ? `Ignored, because Tortie will not read it: ${list}.`
    : `Ignored, because Tortie will not read them: ${list}.`;
}

/** The same fact for entries that could not be named safely enough to draw. */
export function envRejectedUnnamedLine(count: number): string {
  return count === 1
    ? 'One entry was ignored because it is not a variable name.'
    : `${count} entries were ignored because they are not variable names.`;
}
