/**
 * The far side's own shell resolves a person's named variables (Phase 270).
 *
 * ## The one sentence this module exists to make true
 *
 * **The NAMES travel. No value ever does.** A session on another machine can
 * now carry the shell variables an agent row names, and the value of every one
 * of them is expanded by THAT machine's own login shell, on that machine, into
 * the argv of that machine's own tmux. Nothing is read out of this Mac's
 * environment for a remote create, nothing is composed into an ssh command line
 * here, and no value is ever printed back to this Mac.
 *
 * `./remote-env.ts` is the reason that boundary is where it is, and **this
 * phase does not move it by one byte**. `REMOTE_ENV_ALLOWED` is still exactly
 * `GMUX_MANAGED` and `GMUX_SESSION_ID`, `assertRemoteEnvAllowed` still throws
 * before anything is composed, and the pairs this module manufactures never go
 * near that route: they do not exist on this Mac at any instant. Research 51
 * section 7's measurement is what forbids the other route — a value sent as an
 * `-e` pair is one element of the ssh argv HERE while the whole far side
 * command is one element of that same argv, so the bytes stand in two process
 * tables at once. Expanding a value on the machine that already holds it does
 * neither of those things.
 *
 * ## What this module is, and what it is not
 *
 * It is PURE and it imports `../restore/command`, `@shared/agent-overlay` and
 * nothing else. It holds the slot, the caps, the frozen far-side script text
 * and the one composer. It starts nothing, reads no file and asks no machine
 * anything. `./context.ts` imports it, which is why it may not import anything
 * that reaches a connection, a setting or a manifest row.
 *
 * THAT LAST SENTENCE IS A MEASUREMENT AND NOT A WISH, and the integrator's
 * round is what made it true again. The build that came out of BUILDER A put
 * `remoteEnvNamesFor` in this file, and that function reads the settings door,
 * so `node build/assert-no-runtime-cycles.mjs` stayed green while the import
 * graph of `./context.ts` — the door EVERY LOCAL SESSION goes through — grew a
 * path it did not have at the parent commit:
 * `machines/context.ts -> machines/remote-env-carriage.ts ->
 * settings/store.ts`, measured over both trees, 78 modules at the parent
 * reaching no settings module and 87 here reaching one. The function moved to
 * `./remote-env-probe.ts`, which is the file this header already named as its
 * home, and `context.ts` reaches no settings module again.
 *
 * The impure half — where the names come from, and the one round trip that
 * asks the machine which of them it has — is `./remote-env-probe.ts`.
 */

import { OVERLAY_ENV_KEY_PATTERN } from '@shared/agent-overlay';
import { shellQuoteArg, shellQuoteArgv } from '../restore/command';

// ---------------------------------------------------------------------------
// The slot
// ---------------------------------------------------------------------------

/**
 * The one element the far side replaces with its own `-e` pairs.
 *
 * It can never collide with a real argv element: it is not a tmux flag, not a
 * session name Tortie composes and not a path. `remoteCreateArgs` pushes it
 * exactly once, immediately BEFORE the `-e` pairs for `GMUX_MANAGED` and
 * `GMUX_SESSION_ID`, so the stamps are applied after whatever the far side
 * manufactures and therefore win — which is `paneEnvFor`'s own ordering rule on
 * this Mac, said a second time on the other computer.
 */
export const REMOTE_ENV_SLOT = '__TORTIE_ENV_SLOT__';

/** The name the create script runs under on the far side, which is its `$0`. */
export const REMOTE_ENV_CREATE_NAME = 'tortie-create-env';

/**
 * The longest value the far side will put on a pane, in the units its own
 * shell counts in.
 *
 * 4096, matching `ENV_CAPTURE_MAX_VALUE_BYTES` in `../tmux/resolve.ts`, and
 * enforced by `${#v}` in BOTH far-side texts so the probe's answer and the
 * create's injection can never disagree about which names are usable.
 *
 * A STATED DIVERGENCE. `${#v}` counts CHARACTERS in zsh and BYTES in dash,
 * while the local cap is bytes. A multi-byte value between 4096 characters and
 * 4096 bytes is therefore treated differently on the two sides. No credential
 * in any provider's documented format is affected; it is written down because a
 * later round should not have to discover it.
 */
export const REMOTE_ENV_MAX_VALUE_CHARS = 4096;

/**
 * The most names one create may carry, being 16.
 *
 * IT IS THE SAME NUMBER AS THE SETTINGS DOOR'S AND IT IS NOT THE SAME CAP.
 * `OVERLAY_LIMITS.maxEnvPassthroughNames` (`@shared/agent-overlay`) is enforced
 * PER DOOR, and since Phase 275 there are three doors a name can arrive
 * through: an agents.json row, the per-agent settings list, and the shared
 * list. Sixteen each, so the union reaching this rung can be 48.
 *
 * PHASE 275 CORRECTED THIS COMMENT, which read "the cap the settings door
 * already enforces". That was already untrue with two sources and would have
 * been badly untrue with three: it invited a reader to believe this cap can
 * never bite, and `filterRemoteEnvNames` below truncates SILENTLY. What is true
 * is that this cap is asked a SECOND time over a union no single door bounds,
 * and that what it drops is now REPORTED — `remoteEnvNamesDroppedFor` in
 * ./remote-env-probe.ts builds the answer from `droppedRemoteEnvNames` below,
 * and the remote create and the remote restore merge it into the
 * `env-unresolved` notice. The number itself does not move, and neither does
 * the far-side script or the transport.
 */
export const REMOTE_ENV_NAMES_MAX = 16;

/**
 * The guard the far side re-tests every candidate with, before the name is
 * used for anything at all.
 *
 * It appears VERBATIM in both far-side texts, and `[!…]` bracket negation
 * behaves identically in sh, dash, bash, ksh and zsh. Only a token that
 * survives it reaches `eval`.
 */
export const REMOTE_ENV_NAME_GUARD =
  'case "$k" in ""|[!A-Za-z_]*|*[!A-Za-z0-9_]*) continue ;; esac';

// ---------------------------------------------------------------------------
// The alphabet, asked on this Mac before anything is composed
// ---------------------------------------------------------------------------

const ENV_NAME_RE = new RegExp(OVERLAY_ENV_KEY_PATTERN);

/**
 * Drop every name that is not a variable name, and cap the list. Pure.
 *
 * A name that fails is dropped WHOLE — it is never sent, never quoted into a
 * command line, and the caller reports it in `missing` so a person sees it
 * named in the notice rather than losing it in silence.
 *
 * THE NEWLINE TEST IS A BELT AND THE REASON WRITTEN HERE USED TO BE WRONG.
 *
 * It said JavaScript's `$` matches at the end of the input OR immediately
 * before a final newline with no `m` flag, so `"NAME\n"` would pass
 * {@link OVERLAY_ENV_KEY_PATTERN} on its own. THAT IS PYTHON AND PERL, NOT
 * JAVASCRIPT. Measured on 2026-09-16 with this repository's own pattern:
 * `new RegExp('^[A-Za-z_][A-Za-z0-9_]{0,63}$').test('ABC\n')` is **false**, and
 * it is only `true` once the `m` flag is added. Phase 275 found it because an
 * ablation that deleted the two lines below left every gate green.
 *
 * THE TWO LINES STAY ANYWAY, and the honest reason is a different one. A
 * trailing newline is the byte that would start a second word in a shell, and
 * this is the last place on this Mac a name is checked before it is quoted into
 * a command line that the far machine's login shell will read. A guard at that
 * boundary should not rest on where a regular expression decides `$` is: the
 * pattern is a shared constant, an `m` flag added to it for some other caller
 * would open this hole silently, and two `includes` calls cost nothing. They
 * are belt and braces, stated as belt and braces.
 */
export function filterRemoteEnvNames(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of new Set(names)) {
    if (out.length >= REMOTE_ENV_NAMES_MAX) break;
    if (name.includes('\n') || name.includes('\r')) continue;
    if (!ENV_NAME_RE.test(name)) continue;
    out.push(name);
  }
  return out;
}

/** The names of `names` this rung refuses, so a caller can report them. Pure. */
export function droppedRemoteEnvNames(names: readonly string[]): string[] {
  const kept = new Set(filterRemoteEnvNames(names));
  return [...new Set(names)].filter((name) => !kept.has(name)).sort();
}

// ---------------------------------------------------------------------------
// The far side's own create
// ---------------------------------------------------------------------------

/**
 * The script the far machine's LOGIN SHELL runs in place of the bare tmux
 * call. A constant. Nothing a caller passes is ever inside it.
 *
 * ## What it does, and why it is a single rebuild pass
 *
 * `$1` is the whole name list as one string; everything after it is the tmux
 * argv `remoteTmuxArgv` composed. The loop walks the argv once, copying every
 * element through and replacing {@link REMOTE_ENV_SLOT} with the `-e NAME=value`
 * pairs it expands itself.
 *
 * `for a in "$@"` expands its word list ONCE, before the body runs, in every
 * POSIX shell and in zsh, so appending to `$@` inside the body does not disturb
 * the iteration. `t=$#` is taken before anything is appended and `shift $t`
 * drops the originals, leaving exactly `HEAD… -e pairs… TAIL…` in the order
 * tmux needs. The alternative — counting the head and rotating — was written
 * and rejected: it hard-codes how many elements `remoteTmuxArgv` puts in front
 * of `new-session`, and a later change to that prefix would silently put the
 * pairs in the wrong place.
 *
 * ## Why the list is walked with parameter expansion rather than word splitting
 *
 * The shell running this is `$SHELL`, which on the operator's machines is zsh,
 * and **zsh does not word-split an unquoted parameter by default**
 * (`SH_WORD_SPLIT` is off). `for k in $n` would hand zsh one word holding every
 * name. `${n%% *}` and `${n#* }` behave identically in sh, dash, bash, ksh and
 * zsh. This is a deliberate departure from `program-find`'s `IFS=:` split,
 * whose splitting happens in `/bin/sh` where the default is the other way.
 *
 * ## `eval` appears exactly once, on the line after the guard
 *
 * `eval "v=\${$k-}"` is the ONE place a name is ever substituted into shell
 * SOURCE. The string the shell evaluates is `v=${NAME-}`, whose only possible
 * readings are "assign the value of NAME to v" and "assign the empty string to
 * v". See {@link composeEnvCreateCommand} for why no name that reaches it can
 * read any other way.
 *
 * A VALUE IS NEVER PARSED AS SHELL SOURCE. It is bound by `eval` into `v` and
 * then reaches only `set -- "$@" -e "$k=$v"`, which makes one argv word. tmux
 * takes it as one `-e` pair.
 */
export const REMOTE_ENV_CREATE_SCRIPT = [
  'set -e',
  'umask 077',
  'n="$1"',
  'shift',
  't=$#',
  'for a in "$@"; do',
  '  if [ "$a" = "__TORTIE_ENV_SLOT__" ]; then',
  '    while [ -n "$n" ]; do',
  '      k="${n%% *}"',
  '      case "$n" in *" "*) n="${n#* }" ;; *) n= ;; esac',
  '      case "$k" in ""|[!A-Za-z_]*|*[!A-Za-z0-9_]*) continue ;; esac',
  '      eval "v=\\${$k-}"',
  '      if [ -n "$v" ] && [ "${#v}" -le 4096 ]; then set -- "$@" -e "$k=$v"; fi',
  '    done',
  '  else',
  '    set -- "$@" "$a"',
  '  fi',
  'done',
  'shift $t',
  'exec "$@"'
].join('\n');

/**
 * The ONE command the far side's login shell is asked to run for a create that
 * carries names. Pure, so the conformance gate can read it without starting
 * anything.
 *
 * `"$SHELL"` is written so the FAR side expands it, which is
 * `remotePathCommand`'s own shape in `./remote-path.ts`. Everything after it is
 * quoted by the one `shellQuoteArg`/`shellQuoteArgv` call below, so there is
 * exactly one place in this module where a value becomes part of a command
 * line — the rule `./remote-run.ts` already states for the script door.
 *
 * ## THE EXACT FAR-SIDE STRING, with a name substituted
 *
 * For `names = ['ANTHROPIC_API_KEY', 'FIREWORKS_API_KEY']` and the tmux argv a
 * create composes, this function returns (newlines inside the script are real
 * newlines; the script is elided in the middle for width):
 *
 * ```
 * "$SHELL" -lc 'set -e
 * umask 077
 * n="$1"
 * shift
 * t=$#
 * for a in "$@"; do
 *   if [ "$a" = "__TORTIE_ENV_SLOT__" ]; then
 *     while [ -n "$n" ]; do
 *       k="${n%% *}"
 *       case "$n" in *" "*) n="${n#* }" ;; *) n= ;; esac
 *       case "$k" in ""|[!A-Za-z_]*|*[!A-Za-z0-9_]*) continue ;; esac
 *       eval "v=\${$k-}"
 *       if [ -n "$v" ] && [ "${#v}" -le 4096 ]; then set -- "$@" -e "$k=$v"; fi
 *     done
 *   else
 *     set -- "$@" "$a"
 *   fi
 * done
 * shift $t
 * exec "$@"' tortie-create-env 'ANTHROPIC_API_KEY FIREWORKS_API_KEY' \
 *   /usr/local/bin/tmux -L gmux-p270-env -f /dev/null new-session -d -P -F \
 *   '#{session_id}' -s work -c /Users/gdc/repo \
 *   __TORTIE_ENV_SLOT__ -e GMUX_MANAGED=1 \
 *   -e GMUX_SESSION_ID=6f2e0b3c-0000-4000-8000-0123456789ab -- \
 *   /Users/gdc/.local/bin/claude
 * ```
 *
 * That is not an illustration. It is the string this function RETURNED on
 * 2026-09-14, read out of the product's own `remoteCreateArgs` and
 * `remoteTmuxArgv`, with only the line breaks after `\` added for width.
 * `src/main/machines/__tests__/p270-a-remote-env-carriage.test.ts` rule 4 pins
 * every clause of it.
 *
 * Read the tail: the names are ONE argument, single-quoted by `shellQuoteArg`
 * because the joined string holds a space. The script text holds no name and no
 * value. A single name passes `SAFE_ARG` and travels bare, which is safe for
 * the same reason the next paragraph gives.
 *
 * ## WHY A NAME PASSING THE ALPHABET CANNOT BREAK OUT OF THAT STRING
 *
 * A token drawn from `[A-Za-z_][A-Za-z0-9_]{0,63}` contains none of `'`, `"`,
 * `` ` ``, `$`, `\`, `;`, `&`, `|`, `(`, `)`, `{`, `}`, `<`, `>`, `*`, `?`,
 * `[`, `]`, `~`, `#`, `!`, `=`, space, tab or newline. Therefore:
 *
 * - it cannot close the single-quoted region it sits in, because it holds no
 *   `'` — and `shellQuoteArg` would rewrite one as `'\''` even if it did;
 * - it cannot introduce a second word, because it holds no whitespace;
 * - it cannot introduce a command, a pipeline, a subshell or a redirection,
 *   because it holds none of `;`, `&`, `|`, `` ` ``, `(`, `<`, `>`, newline;
 * - it cannot introduce an expansion, because it holds no `$`, no `` ` `` and
 *   no `~`;
 * - inside `eval "v=\${$k-}"`, the one place a name is substituted into shell
 *   SOURCE, the evaluated string is `v=${NAME-}`. A name holding `}` could
 *   close the brace early and `}` is outside the alphabet; a name holding `$`
 *   could nest an expansion and `$` is outside the alphabet.
 *
 * Three layers say that, and they are independent: the alphabet here on this
 * Mac before anything is composed ({@link filterRemoteEnvNames}), the quoting
 * here, and {@link REMOTE_ENV_NAME_GUARD} on the far side inside the frozen
 * text. This function deliberately does NOT filter, so the gate can force a
 * hostile shape past the first layer and watch the other two hold.
 */
export function composeEnvCreateCommand(
  tmuxArgv: readonly string[],
  names: readonly string[]
): string {
  return (
    `"$SHELL" -lc ${shellQuoteArg(REMOTE_ENV_CREATE_SCRIPT)} ` +
    shellQuoteArgv([REMOTE_ENV_CREATE_NAME, names.join(' '), ...tmuxArgv])
  );
}
