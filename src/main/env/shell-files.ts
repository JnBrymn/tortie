/**
 * Which files the login shell reads, derived from `$SHELL` and never hardcoded
 * (Phase 276).
 *
 * ## WHY THIS IS A TABLE AND NOT A LIST
 *
 * Phase 276 caches the answer `captureLoginShellEnv` gives, so something has to
 * notice when the person's shell would now answer differently. The files that
 * decide that are the ones the login shell actually reads, and WHICH those are
 * depends on the shell. On the operator's own machine `~/.zshrc`, `~/.zprofile`,
 * `~/.zshenv`, `~/.bashrc` and `~/.profile` all exist and `~/.zlogin` and
 * `~/.bash_profile` do not, so a hardcoded list would be wrong for him in both
 * directions at once — it would watch files his shell never reads and miss the
 * ones it does the moment he creates one.
 *
 * ## THIS MODULE IS PURE, AND THAT IS THE POINT
 *
 * It imports `node:path` for `basename` and nothing else. No `node:fs`, no
 * spawn, no settings, no log. It takes three strings and returns absolute
 * paths, so the whole table is unit-testable and gate-assertable with zero
 * filesystem and zero shells. Whether any of these files EXISTS is not asked
 * here and is deliberately not this module's business: a file that does not
 * exist yet is exactly the case the watch in ./watch.ts exists for, because
 * creating `~/.zshrc` for the first time is when a key first appears.
 *
 * ## THE FOUR ROWS, AND WHAT WAS MEASURED FOR EACH
 *
 * **zsh — all four, and the set moves with `ZDOTDIR`.** `zsh -lic` reads
 * `.zshenv`, `.zprofile`, `.zshrc` and `.zlogin`. `zsh -lc` reads three and NOT
 * `.zshrc`, which is the independent confirmation that the `-i` in
 * `resolve.ts`'s spawn is what reads the rc — and it is why that flag is
 * refused a removal by Phase 276 §9 however expensive it is.
 *
 * **bash — all four, even though at most two are ever read**, because WHICH is
 * read depends on which EXIST. Measured, one scratch HOME per row: with all
 * four present `bash -lic` read `.bash_profile`; with `.bash_login .profile
 * .bashrc` it read `.bash_login`; with `.profile .bashrc` it read `.profile`;
 * with `.bashrc` alone it read NOTHING. So creating `.bash_profile` changes the
 * answer and has to invalidate, which means all four are watched. (That last
 * row — a login shell never reading `.bashrc` — is a pre-existing Tortie
 * feature gap and not Phase 276's to fix.)
 *
 * **sh, dash, ksh — `.profile` alone.**
 *
 * **Anything else — `[]`, and the caller never arms the cache.** That is not a
 * hedge, and two concrete shells show why. `/bin/tcsh` rejects the probe's
 * argument vector outright with `Usage: tcsh [ -bcdefilmnqstvVxX ]`, so its
 * probe already fails today and caching a failed probe would be strictly worse
 * than caching nothing. In `nu`, `$NAME` is not environment access at all, so
 * the probe's `printf` recipe cannot resolve a value there either. An empty set
 * means no watcher handle opens, which means ./watch.ts never arms the cache,
 * which means every create pays today's cost and nothing can ever be stale.
 *
 * **`fish` IS NOT IN THE TABLE, and that is a decision rather than an
 * oversight.** Its files (`~/.config/fish/config.fish`, `conf.d/`,
 * `$XDG_CONFIG_HOME`) were reasoned from documentation and never measured,
 * because fish is not installed on the machine this phase was built on, and an
 * unmeasured row would arm a cache whose invalidation nobody has driven. A
 * later round adds it by measuring the same three things measured above: which
 * files `fish -lic` actually reads, whether the `printf '…' "$NAME"` recipe
 * resolves a value under fish at all, and whether `$__fish_config_dir` moves
 * the set.
 */

import { basename } from 'node:path';

/** What the table is asked about. Three strings, and no I/O. */
export interface ShellFilesInput {
  /**
   * `$SHELL`, as an absolute path or a bare name. The caller supplies the same
   * fallback `captureLoginShellEnv` uses when `$SHELL` is unset, so the set is
   * derived from the shell the probe ACTUALLY spawns rather than from a
   * different guess — see `shellForWatch` in ./watch.ts.
   */
  shell: string | undefined;
  /** The person's home directory. */
  home: string;
  /**
   * `$ZDOTDIR`, or undefined when it is not set.
   *
   * IT IS TAKEN WITH `??` AND NEVER `||` AT EVERY CALL SITE, including the one
   * below. Setting `ZDOTDIR` to the EMPTY STRING is still SET: zsh then looks
   * for `/.zshenv` and reads nothing out of `$HOME` at all. `||` would fall
   * back to the home directory and describe a shell that is not the one
   * running.
   */
  zdotdir?: string | undefined;
}

/** zsh, in the order the shell itself reads them. */
const ZSH_FILES = ['.zshenv', '.zprofile', '.zshrc', '.zlogin'] as const;

/** bash, in the order a login shell tries them, plus the rc for completeness. */
const BASH_FILES = ['.bash_profile', '.bash_login', '.profile', '.bashrc'] as const;

/** The POSIX family. */
const SH_FILES = ['.profile'] as const;

/**
 * The absolute candidate paths the given login shell would read.
 *
 * Returns `[]` for a shell this phase has not measured, which is the caller's
 * signal to arm nothing.
 */
export function shellFilesFor(input: ShellFilesInput): string[] {
  const shell = input.shell;
  if (shell === undefined || shell.length === 0) return [];
  const name = basename(shell);
  if (name === 'zsh') {
    // `??` AND NEVER `||`. See ShellFilesInput.zdotdir.
    return ZSH_FILES.map((file) => join(input.zdotdir ?? input.home, file));
  }
  if (name === 'bash') return BASH_FILES.map((file) => join(input.home, file));
  if (name === 'sh' || name === 'dash' || name === 'ksh') {
    return SH_FILES.map((file) => join(input.home, file));
  }
  return [];
}

/**
 * `dir` and `file` the way the SHELL joins them, which is not the way
 * `node:path`'s `join` does.
 *
 * zsh expands `$ZDOTDIR/.zshenv` literally, so an empty `ZDOTDIR` gives
 * `/.zshenv` — an absolute path at the root, and the one the shell really
 * looks for. `path.join('', '.zshenv')` gives the relative `.zshenv` instead,
 * which is a path to somewhere else entirely and would be watched relative to
 * whatever this process's working directory happened to be. Trailing slashes
 * are trimmed so a home of `/` gives `/.zshenv` rather than `//.zshenv`.
 */
function join(dir: string, file: string): string {
  return `${dir.replace(/\/+$/, '')}/${file}`;
}
