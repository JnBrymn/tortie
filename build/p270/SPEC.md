# Phase 270 — a remote session reads the remote machine's shell

**Subject:** `feat(machines): a remote agent reads its own machine's shell`
**First body line:** `Phase 270: a remote session reads the remote machine's shell`
**Semver:** minor — a named variable starts working on a machine where it was silently ignored.
**Tier:** 3. It resolves a person's provider keys on another computer and puts them on a process
there, over a link Tortie does not own, and the create path it changes is durability-critical.
**Independent methods (two, one an attack):**
(a) a LIVE create on the operator's Mac Pro proving the value the pane holds is the REMOTE machine's
and could not have come from this Mac, and that no value of this Mac's ever crosses;
(b) an ATTACK proving no value crosses the wire by any route and `assertRemoteEnvAllowed` still
refuses every name outside its two.

**Charter:** [issue 20](https://github.com/gregce/tortie/issues/20),
`docs/research/123-issue-20-session-environment.md`, the Phase 270 entry at `docs/BACKLOG.md:27250`,
Phase 269's own recorded gap at `docs/BACKLOG.md:27222-27232`, and
`docs/research/52-remote-env-and-review.md` (the measurement `src/main/machines/remote-env.ts`
argues from).

**THE ONE SENTENCE THAT BOUNDS THE PHASE.** `REMOTE_ENV_ALLOWED` does not move, no value is composed
into any command line on this Mac, and no value comes back to this Mac at all. The NAMES travel; the
values are expanded by the far machine's own login shell, on the far machine, into the argv of the
far machine's own tmux.

---

## 1. The reading — what is already there, with cites

### 1.1 The probe this phase extends

| Fact | Cite |
| --- | --- |
| `REMOTE_PATH_MARKER = '__TORTIE_PATH__'`, and its own comment says it "is the recipe `PATH_MARKER` in `../tmux/resolve.ts` already uses … a chatty login file on the other machine must not be able to corrupt the answer" | `src/main/machines/carriage.ts:130-141` |
| The whole far-side command it composes, verbatim: `` `"$SHELL" -lc 'printf ${REMOTE_PATH_MARKER}%s${REMOTE_PATH_MARKER} "$PATH"'` `` — `"$SHELL"` is left UNQUOTED so the far side expands it, and the inner script is a single-quoted region inside one ssh argv element | `src/main/machines/remote-path.ts:70-72` |
| It is delimited by a marker PAIR and parsed by `REMOTE_PATH_RE = /__TORTIE_PATH__(.*?)__TORTIE_PATH__/s`; "the markers never arrived, they arrived empty, and they arrived carrying something with no absolute directory" are ONE answer to the caller, being null | `src/main/machines/remote-path.ts:51`, `:88-104` |
| `-lc` and not `-lic`, because "there is no terminal on this connection, and an interactive shell reading from a pipe prints job control noise for nothing" | `src/main/machines/remote-path.ts:14-20` |
| Its deadline is 10,000 ms, "the same budget `PATH_CAPTURE_TIMEOUT_MS` gives the shell on this Mac" | `src/main/machines/remote-path.ts:53-61` |
| It runs ONCE PER CONNECT, before any mutating verb | `src/main/machines/remote-path.ts:116-146` |
| The carriage underneath: `shellCommand` puts the command as ONE ssh argv element | `src/main/machines/context.ts:274-290` |

**Therefore it cannot literally be the same call.** The PATH capture happens once per connect and is
cached for the generation (`setMachineRemotePath`). A value must be read at every create, because the
phase's own proof is that rotating a value and starting a second session picks the new one up. So
this phase reuses the RECIPE — a marker-delimited question asked through the far machine's login
shell — and asks it at create time. That is the same relationship `captureLoginShellEnv` has to
`captureLoginShellPath` locally.

### 1.2 The create, and the argv the conformance gate reads

| Fact | Cite |
| --- | --- |
| `remoteCreateArgs`, the pure composer, "so the conformance gate can read it without starting anything" | `src/main/machines/remote-sessions.ts:789-841` |
| Its order: `new-session -d -P -F <fmt> -s <name>`, then `-c <cwd>` when a folder was named, then the `-e` pairs, then `-- <argv>` | `:805-840` |
| The `-e` pairs come from `const env = { ...managedPaneEnv(input.sessionId), ...input.env }` and the allowlist is asked **before the loop** | `:835-839` |
| `assertRemoteEnvAllowed(env)` is the call site, at `:836`, one line above the loop at `:837-839` | `src/main/machines/remote-sessions.ts:836` |
| `remoteCreate`'s eleven ordered steps; the bin search is step 5, the manifest row step 7, `new-session` step 8 | `:1370-1400`, `:1446-1560` |
| The create is sent by `execOn` → `spawnTmux` → `tmuxCommand`, with a default `timeout` of 10,000 ms | `src/main/machines/remote-sessions.ts:1561`; `src/main/machines/exec-plane.ts:571-616` |
| `tmuxCommand` is the ONE composer for both kinds and quotes the whole remote tmux argv into ONE ssh argument, because "ssh does not carry an argv to the other machine" — with the two measured manglings that forced it | `src/main/machines/context.ts:222-272`; `remoteTmuxArgv` at `:209-221` |
| `remote-restore.ts` calls the SAME composer | `src/main/machines/remote-restore.ts:443-450` |
| The agent entry a remote create launches from, with the confirm gate asked on the way | `src/main/machines/remote-sessions.ts:1228-1241` |

### 1.3 The allowlist — **THIS FILE DOES NOT CHANGE IN THIS PHASE**

`src/main/machines/remote-env.ts` is read, cited and left **byte for byte as it is**. No name is
added to it, no name is removed from it, and `assertRemoteEnvAllowed` keeps exactly the job it has.

| Fact | Cite |
| --- | --- |
| `REMOTE_ENV_ALLOWED` is exactly `['GMUX_MANAGED', 'GMUX_SESSION_ID']` | `src/main/machines/remote-env.ts:85-88` |
| `REMOTE_ENV_MEASURED_AND_REFUSED = 'PATH'`, "exported so `build/conformance-machines.mjs` condition 47 can assert that it is NOT in the set" | `:90-97` |
| The refusal is thrown "BEFORE anything is composed and therefore before anything is sent, so a refusal here means no process was started and no byte left this Mac" | `:102-126` |
| The header's measurement: `build/probe-remote-env.mjs` planted a value and looked for it at four points — "The value is one element of the argv of the sign in program running on this Mac, and the whole far side command is one element of that same argv… the bytes stand in two process tables at once for as long as the create takes." | `:14-24` |
| Why the refusal, and the honest gap in it: "On macOS one account cannot read another account's arguments… On Linux the ordinary default is that `/proc/<pid>/cmdline` can be read by every account on the machine, and NO LINUX MACHINE WAS MEASURED HERE." | `:26-38` |
| Phase 84 proposed `PATH` and measurement refused it: tmux takes a pane's PATH from the SERVER, so `-e PATH=` reaches no pane | `:40-62`; the same measurement at `src/main/machines/remote-sessions.ts:1400-1428` |

**The design consequence, stated once and relied on everywhere below.** Because no passthrough value
is ever put into `remoteCreateArgs`'s `input.env`, the allowlist is never consulted about a provider
name and therefore never has to widen. The `-e` pair for a passthrough name does not exist on this
Mac at any instant; it is manufactured on the far side.

### 1.4 The local probe whose discipline is copied

| Fact | Cite |
| --- | --- |
| `captureLoginShellEnv(names, options)` | `src/main/tmux/resolve.ts:447-553` |
| Fresh nonce per probe: `` const marker = `__GMUX_ENVP_${randomBytes(4).toString('hex')}__` `` — because "the framing has to survive rc output that an agent could have written, and a static marker would let that output forge a record" | `:433-437`, `:467` |
| Independent deadline, group kill, cleared on `close` and never on `exit`; "NEVER REJECTS, and never hangs" | `:421-431`, `:526-545` |
| An unset name, an empty value and a value over the cap are all MISSING and never injected — "Never an empty string" | `:438-444`, `:484-495` |
| `ENV_CAPTURE_MAX_VALUE_BYTES = 4096`, refused WHOLE rather than truncated | `:388-397` |
| `const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/` — the names "the probe will interpolate into its script" | `:399-400`, filtered at `:454-455` |
| `CaptureEnvResult { values, missing, probeFailed }` — `probeFailed` is "the shell failed to spawn, timed out, or printed no markers" | `:402-410` |
| No record at all on `close` means a failed probe rather than a set of unset variables | `:546-551` |

### 1.5 Where the names come from, and where the remote path diverges

| Fact | Cite |
| --- | --- |
| `envPassthroughFor(rowNames, settingsNames)` — the union of `agents.json`'s `launch.envPassthrough` and Settings → Launch defaults, deduped, `undefined` when both are empty "so… no probe is spawned" | `src/main/sessions/launch-plan.ts:285-308` |
| `paneEnvFor(base, resolved, sessionId, processEnv, login)` — the one merge rule, "The GMUX stamps go LAST and therefore win" | `src/main/sessions/launch-plan.ts:310-369` |
| The local create resolves the names with ONE probe and hands the pairs to the pane and nowhere else | `src/main/sessions/create-local.ts:612-630` |
| **The divergence:** the remote branch returns at `src/main/sessions/create-local.ts:283` (`return session;`), while `envPassthroughFor` is first reached at `:476-480`. Everything between is about this Mac | `src/main/sessions/create-local.ts:200-284`, `:471-480` |
| `src/main/machines/remote-sessions.ts` contains ZERO occurrences of `envPassthrough` or `captureLoginShellEnv` (grepped at the parent) | — |
| The entry carries the names at `entry.launch.envPassthrough` | `src/main/agents/registry.ts:230-250`, `:1834-1845` |
| The name alphabet a person's name is validated by: `OVERLAY_ENV_KEY_PATTERN = '^[A-Za-z_][A-Za-z0-9_]{0,63}$'`, cap 16 names | `src/shared/agent-overlay.ts:390`, `:370-372`, refusals at `:417-481`, one spelling at `:527-561` |

### 1.6 The `env-unresolved` notice — raised locally, reused verbatim

| Fact | Cite |
| --- | --- |
| The shape: `{ kind, sessionId, sessionName, names: string[], probeFailed: boolean }` | `src/shared/notice.ts:249-256`; kind registered at `:396` |
| Raised locally AFTER the pane is running and bound, "so the notice can name a session that exists" | `src/main/sessions/create-local.ts:665-692` |
| The same notice at restore | `src/main/restore/restore.ts:1030-1040` |
| Its latch is PER SESSION, not per kind — "Two sessions missing a variable are two facts" | `src/main/notice/index.ts:34-60`, `:52-57` |
| The renderer's copy already handles both arms, including `probeFailed` | `src/renderer/state/subscriptions.ts:520-537` |

**No contract change.** The kind, its fields and its copy already exist. `gate:contract` is not
expected to move, and if the emitted inventory moves at all the commit is wrong.

### 1.7 The remote script catalogue — the door the probe uses

| Fact | Cite |
| --- | --- |
| The catalogue and its `RemoteScript` shape (`id`, `mode`, `params`, `text`, `reason`) | `src/main/machines/remote-scripts.ts:405-419`, array at `:3427` |
| The seven rules every text obeys — text is a constant with no backtick; values are read as `"$1"`–`"$9"` and are ALWAYS quoted; a LIST is read into a local name in quotes first; `set -e` then `umask 077`; payload between `REMOTE_SCRIPT_MARKER`; a `read` names none of `rm`/`mv`/… and every `>` is part of `2>/dev/null`; EIGHT writers and no more | `src/main/machines/remote-scripts.ts:204-289` |
| `REMOTE_SCRIPT_MARKER = '__TORTIE_RUN__'` — "a different string from both, so an answer to one door can never be read as an answer to another" | `:421-428` |
| `REMOTE_SCRIPT_MAX_BYTES = 131_072` — Linux's `MAX_ARG_STRLEN`, because the whole command is one argument of the far login shell | `:441-455` |
| `composeRemoteScriptCommand` — `shellQuoteArgv(['/bin/sh', '-c', script.text, remoteScriptName(id), ...args])`; "Every value is quoted by the one `shellQuoteArgv` call… there is exactly one place in this module where a value becomes part of a command line" | `src/main/machines/remote-run.ts:154-181` |
| `runRemoteRead`'s eight steps: catalogue, mode, arity, connected-only, generation, send, parse, generation again | `src/main/machines/remote-run.ts:22-51`, `:203-210` |
| `parseRemoteScriptAnswer` — markers absent, reversed or empty are one answer, being null | `:186-202` |
| `program-find` is the precedent for the LIST case, and condition 46 asserts it | `src/main/machines/remote-scripts.ts:1021-1048`, `:3494-3498` |
| `shellQuoteArg`'s `SAFE_ARG` — a word of `[A-Za-z0-9_\-./:@%+,]` passes bare, everything else is single-quoted with `'` escaped as `'\''` | `src/main/restore/command.ts:40-56` |

### 1.8 `build/conformance-machines.mjs` — the conditions this phase joins

| Fact | Cite |
| --- | --- |
| Condition 47, the three clauses: the allowed set is exactly the two names; `REMOTE_ENV_MEASURED_AND_REFUSED` still reads `PATH`; and that name is NOT in the set | `build/conformance-machines.mjs:5741-5773`; its data at `build/machines-conformance-probe.mts:1782-1785` |
| Condition 46's shape — the ordering assertions are made by BYTE INDEX inside the script text (`one.at > one.loopAt`), which is the technique the new clauses reuse | `build/conformance-machines.mjs:5603-5660`; probe at `build/machines-conformance-probe.mts:1758-1780` |
| The probe half "SPAWNS NOTHING… starts no ssh, no tmux server and no Electron" | `build/machines-conformance-probe.mts:14-17` |
| The highest condition number at the parent is **87** (`build/conformance-machines.mjs:7811`) | — |
| The live-machine harness: the five refusals, `scratchSocket`, `farTmux`, `listFarSessions`, `diffSessionLists`, `countOperatorSessions`, `hostKeyFileFacts`, `endRecordedPids` | `build/real-machine.mjs:117-160`, `:288-330`, `:511-524`, `:525-548`, `:692-714`, `:741-770` |
| The in-app machine harness: `bringUp` = `addMachineRow` + `confirmMachine` + `recordHostKeys`, then `remoteCreate` against it | `src/main/harness/remote-matrix.ts:338`, `:545`, `:569`, `:616-640` |
| Phase 269's live probe, the shape to copy | `build/p269/probe-p269-env.mjs`, driver `src/main/harness/p269-env.ts` |

### 1.9 The ssh known-hosts quirk — asked and answered

The operator's brief asks whether the option-parser quirk that bit the agent on the command line also
bites the app. **It does not, and here is why in this repository's own terms.**
`composeKnownHostsOption` returns `UserKnownHostsFile="<tortie file>" "<user file>"` with **both paths
double-quoted inside the value** (`src/main/machines/carriage.ts:178-191`), and `sshOptions` hands
that whole string to a spawn as ONE argv element after `-o`. The double quotes are *ssh's own syntax*
for a whitespace-separated list of files — the function's own comment says so and says it "was
measured working against a scratch server before it was written here". A shell command line strips
those quotes before ssh's parser ever sees them, which is what breaks a hand-typed `ssh -o
UserKnownHostsFile=…`; the app never passes through a shell, so nothing strips them. **No change is
needed and none is made.** The live probe records the finding by asserting that
`composeKnownHostsOption`'s output still carries a quote at both ends of both paths and that Tortie's
own file is FIRST (`conformance:machines` already asserts the order — condition 48's family).

---

## 2. The decisions

### 2.1 The shape in one paragraph

At create time, when and only when the agent has passthrough names, Tortie asks the machine ONE
marker-delimited question through its own login shell — *which of these names has a usable value?* —
and then sends the create through that same login shell, with a SLOT in the tmux argv that the far
side replaces with `-e NAME=<value>` pairs it expands itself. The answer to the question carries
**names and nothing else**; no value is ever printed back to this Mac, never mind composed into a
command line here.

### 2.2 The far-side probe, and it is ONE round trip for N names

A new catalogue script, `env-names`, `mode: 'read'`, `params: 2`. Two positionals: the per-probe
nonce marker, and the whole name list as ONE space-separated string. It is run through
`runRemoteRead`, so it inherits the catalogue's frozen text, its quoting, its connected-only check,
its generation check and its size cap for free.

**Never one call per name.** A remote round trip costs a login shell start (`remote-path.ts:53-61`
budgets 10 s for exactly that reason), and sixteen of them would be sixteen login shells. One call,
one shell, N answers.

**The script TEXT** (a constant, the same array-of-literals form `program-find` uses at
`remote-scripts.ts:1021-1048`). Single quotes appear only around the INNER login-shell script, so the
inner script itself contains none:

```sh
set -e
umask 077
m="$1"
n="$2"
printf "__TORTIE_RUN__"
"$SHELL" -lc 'm="$1"; n="$2"; while [ -n "$n" ]; do k="${n%% *}"; case "$n" in *" "*) n="${n#* }" ;; *) n= ;; esac; case "$k" in ""|[!A-Za-z_]*|*[!A-Za-z0-9_]*) continue ;; esac; eval "v=\${$k-}"; if [ -n "$v" ] && [ "${#v}" -le 4096 ]; then printf "%s%s%s" "$m" "$k" "$m"; fi; done; printf "%s.%s" "$m" "$m"' tortie-env-names "$m" "$n"
printf "__TORTIE_RUN__\n"
```

**The composed far-side string**, which is what `composeRemoteScriptCommand`
(`remote-run.ts:167-181`) hands to ssh as ONE argv element. `shellQuoteArg` single-quotes the whole
text and rewrites each embedded `'` as `'\''`, which is why the inner script's delimiters read
`'\''` below:

```
/bin/sh -c 'set -e
umask 077
m="$1"
n="$2"
printf "__TORTIE_RUN__"
"$SHELL" -lc '\''m="$1"; n="$2"; while [ -n "$n" ]; do k="${n%% *}"; …; eval "v=\${$k-}"; …; done; printf "%s.%s" "$m" "$m"'\'' tortie-env-names "$m" "$n"
printf "__TORTIE_RUN__\n"' tortie-env-names __TORTIE_ENVP_9f3c21ab__ 'ANTHROPIC_API_KEY FIREWORKS_API_KEY'
```

Read the tail: the names are the LAST argument, single-quoted by `shellQuoteArg` because the joined
string holds a space. The script text holds no name and no value, in the shape rule 1 demands.

**Why `${n%% *}` and not word splitting.** The inner shell is `$SHELL`, which on the operator's
machines is zsh, and **zsh does not word-split an unquoted parameter by default** (`SH_WORD_SPLIT` is
off). `for k in $n` would hand zsh one word holding every name. So the list is walked with POSIX
parameter expansion, which behaves identically in sh, dash, bash, ksh and zsh. This is a deliberate
departure from `program-find`'s `IFS=:` split, and the reason is written here because the two scripts
now split lists two different ways: `program-find`'s splitting happens in `/bin/sh`, this one's would
have happened in `$SHELL`.

**The two marker layers, and both are load-bearing.**
- The OUTER pair is the catalogue's own `__TORTIE_RUN__`, which keeps the ssh session's login banner
  out of the answer. `parseRemoteScriptAnswer` strips it (`remote-run.ts:186-202`).
- The INNER marker is a **fresh nonce per probe**, `__TORTIE_ENVP_<8 hex>__` from
  `randomBytes(4).toString('hex')`, exactly `captureLoginShellEnv`'s recipe and for exactly its
  reason (`resolve.ts:433-437`): the rc files that run inside the outer markers are files an agent on
  that machine could have written, and a static marker would let their output forge a record. The
  nonce is a POSITIONAL; the script text contains no marker of its own.

**Distinguishing an unset name from a failed probe — the trailer record.** The inner shell's last act
is to print `<nonce>.<nonce>`. A dot is not a legal character in a variable name, so it can never
collide with a name record.

| What came back | Verdict |
| --- | --- |
| Outer pair parsed, trailer record present | The login shell ran and answered. Every requested name with no record is **unset or empty or over the cap on that machine** → `missing`, `probeFailed: false` |
| Outer pair parsed, trailer record ABSENT | The login shell started and did not finish, or something ate the tail → `probeFailed: true` |
| Outer pair absent, or `runRemoteRead` threw (deadline, link, not answering, arity, catalogue) | → `probeFailed: true` |

`set -e` in the outer script is what makes the second and third rows reachable rather than
theoretical: a `$SHELL` that exits non-zero (fish, csh, a missing shell) aborts the script before the
closing `__TORTIE_RUN__` is printed, so the pair never forms.

**The deadline.** `REMOTE_ENV_PROBE_TIMEOUT_MS = 10_000`, the same number and the same reasoning as
`REMOTE_PATH_TIMEOUT_MS` (`remote-path.ts:53-61`). On expiry `execFileP` SIGKILLs the child
(`exec-plane.ts:604-609`) and `execRemoteShell` throws.
**`probeRemoteEnvNames` NEVER REJECTS AND NEVER FAILS A CREATE.** It catches every error and returns
`{ resolved: [], missing: [...names], probeFailed: true }`. The create carries on and the notice is
raised. This is `captureLoginShellEnv`'s own contract (`resolve.ts:444-446`) and it is the half of the
phase that repays issue 20 even on a machine whose probe cannot run.

**An honest asymmetry, stated rather than hidden.** `probeFailed: true` means *Tortie could not ask*,
not *the variable is absent*. Because the create expands the values on the far side independently of
the probe, a variable can be injected successfully while the notice says the probe failed. The
notice's existing copy already says "the probe itself failed or timed out"
(`src/shared/notice.ts:255`), which is the true sentence.

### 2.3 The create carriage, and how a value reaches `-e` without crossing the wire

`remoteCreateArgs` gains ONE optional field and ONE behaviour:

```ts
export function remoteCreateArgs(input: {
  readonly tmuxName: string;
  readonly cwd?: string;
  readonly sessionId: string;
  readonly argv: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  /** PHASE 270. Names whose VALUES the far side expands. Never a value. */
  readonly envNames?: readonly string[];
}): string[]
```

When `envNames` is non-empty it pushes exactly one element, `REMOTE_ENV_SLOT`, immediately **before**
the `-e` loop at `:837`. When it is empty or absent it pushes nothing and the composed argv is
**byte for byte what it is at the parent commit**. `assertRemoteEnvAllowed(env)` at `:836` is
untouched, is still asked before anything is composed, and still sees only `managedPaneEnv`'s two
stamps plus whatever a caller put on `input.env` — which is still nothing in production.

```ts
/**
 * The one element the far side replaces with its own `-e` pairs (Phase 270).
 * It can never be a real argv element: it is not a tmux flag, not a session
 * name Tortie composes and not a path.
 */
export const REMOTE_ENV_SLOT = '__TORTIE_ENV_SLOT__';
```

**The slot sits before the GMUX stamps, and that is the whole ordering rule.** tmux applies `-e`
pairs left to right and the last one for a name wins, so the pairs the far side manufactures are
overridden by `GMUX_MANAGED` and `GMUX_SESSION_ID`, exactly as `paneEnvFor` puts `managedPaneEnv`
last locally (`launch-plan.ts:345-350`). A passthrough name may not start `GMUX_` anyway
(`agent-overlay.ts:448-451`); this is the second answer to the same question, which is the shape that
file already asks for.

**The carriage.** `tmuxCommand` gains a third parameter, `envNames`, and one new branch:

```ts
export function tmuxCommand(
  ctx: MachineContext,
  args: readonly string[],
  envNames: readonly string[] = []
): SpawnPlan
```

- local, or remote with no names → **unchanged**, byte for byte.
- remote with names → `{ file: ctx.sshBin, argv: [...sshOptions(ctx), ctx.host, composeEnvCreateCommand(remoteTmuxArgv(ctx, args), envNames)] }`.

`ExecTmuxOptions` gains `envNames?: readonly string[]`, `spawnTmux` passes it to `tmuxCommand`
(`exec-plane.ts:602`), and `execOn` forwards it. **The composition stays inside the run**, which is
the Phase 118 rule at `exec-plane.ts:599-601`.

The new pure module `src/main/machines/remote-env-carriage.ts` (it imports `../restore/command` and
nothing else) holds the slot, the cap, the script text and:

```ts
export function composeEnvCreateCommand(
  tmuxArgv: readonly string[],
  names: readonly string[]
): string;
```

which returns, for the tmux argv and a two-name list:

```
"$SHELL" -lc 'set -e
umask 077
n="$1"
shift
t=$#
for a in "$@"; do
  if [ "$a" = "__TORTIE_ENV_SLOT__" ]; then
    while [ -n "$n" ]; do
      k="${n%% *}"
      case "$n" in *" "*) n="${n#* }" ;; *) n= ;; esac
      case "$k" in ""|[!A-Za-z_]*|*[!A-Za-z0-9_]*) continue ;; esac
      eval "v=\${$k-}"
      if [ -n "$v" ] && [ "${#v}" -le 4096 ]; then set -- "$@" -e "$k=$v"; fi
    done
  else
    set -- "$@" "$a"
  fi
done
shift $t
exec "$@"' tortie-create-env 'ANTHROPIC_API_KEY FIREWORKS_API_KEY' /usr/local/bin/tmux -L gmux -f /dev/null new-session -d -P -F '#{session_id}	#{session_name}	#{pane_pid}' -s work __TORTIE_ENV_SLOT__ -e GMUX_MANAGED=1 -e GMUX_SESSION_ID=6f2… -- /Users/gdc/.local/bin/claude
```

`"$SHELL"` is written unquoted so the far side expands it, which is `remotePathCommand`'s own shape
(`remote-path.ts:71`). Everything after it is quoted by the one `shellQuoteArg`/`shellQuoteArgv` call
in the composer, so there is exactly one place where a value becomes part of a command line — the
rule `remote-run.ts:162-165` already states.

**Why the single rebuild pass rather than arithmetic.** `for a in "$@"` expands its word list ONCE,
before the loop body runs, in every POSIX shell and in zsh, so appending to `$@` inside the loop does
not disturb the iteration. `t=$#` is taken before anything is appended and `shift $t` drops the
originals, leaving exactly `HEAD… -e pairs… TAIL…` in the order tmux needs. The alternative —
counting the head and rotating — was written and rejected: it hard-codes how many elements
`remoteTmuxArgv` puts in front of `new-session`, and a later change to that prefix would silently
put the pairs in the wrong place.

**The create's deadline grows only when names are present.** `execOn`'s default is 10,000 ms
(`exec-plane.ts:605`) and a login shell has been measured at up to 3.4 s
(`remote-path.ts:57-60`). So `remoteCreate` passes `timeoutMs: REMOTE_CREATE_ENV_TIMEOUT_MS`
(`20_000`, being the create's own 10 s plus the login shell's own 10 s) **only on the branch that has
names**. A create with no names keeps every number it has today.

### 2.4 The security of the phase — why no NAME can become a far-side command

A variable name is chosen by a person. It is validated three times, on both computers, and the
composed string above is what the argument is about.

**Layer 1 — the alphabet, on this Mac, before anything is composed.** Every name is tested against
`OVERLAY_ENV_KEY_PATTERN`, `^[A-Za-z_][A-Za-z0-9_]{0,63}$` (`agent-overlay.ts:390`), by
`remoteEnvNamesFor` in `remote-env-carriage.ts`. A name that fails is **dropped whole**, is never
sent, and is reported in `missing` so the person sees it named in the notice. The list is capped at
`REMOTE_ENV_NAMES_MAX = 16`, the same cap the settings door enforces
(`agent-overlay.ts:370-372`). This is the same door Phase 269's seal and shape check already put in
front of the names; this phase adds a second, unconditional test at the machines boundary so that a
name reaching here from any future caller is still filtered.

**Layer 2 — the quoting, on this Mac.** The surviving names are joined with single spaces into ONE
string and that string becomes ONE argv element handed to `shellQuoteArg`
(`src/main/restore/command.ts:47-51`). Two or more names contain a space, so `SAFE_ARG` fails and the
whole string is single-quoted with any `'` rewritten as `'\''`. One name passes `SAFE_ARG` and
travels bare — which is safe for the same reason the next paragraph gives.

**Layer 3 — the guard, on the far side, inside the frozen text.** Every candidate is re-tested by

```
case "$k" in ""|[!A-Za-z_]*|*[!A-Za-z0-9_]*) continue ;; esac
```

before it is used for anything, and `[!…]` bracket negation behaves identically in sh, dash, bash,
ksh and zsh. Only a token that survives this reaches `eval "v=\${$k-}"`.

**The argument.** A token drawn from `[A-Za-z_][A-Za-z0-9_]{0,63}` contains none of
`'`, `"`, `` ` ``, `$`, `\`, `;`, `&`, `|`, `(`, `)`, `{`, `}`, `<`, `>`, `*`, `?`, `[`, `]`, `~`,
`#`, `!`, `=`, space, tab or newline. Therefore:

- it cannot close the single-quoted region it sits in, because it holds no `'`;
- it cannot introduce a second word, because it holds no whitespace;
- it cannot introduce a command, a pipeline, a subshell or a redirection, because it holds none of
  `;`, `&`, `|`, `` ` ``, `(`, `<`, `>`, `\n`;
- it cannot introduce an expansion, because it holds no `$`, no `` ` `` and no `~`;
- inside `eval "v=\${$k-}"` — the ONE place a name is ever substituted into shell SOURCE — the string
  the shell evaluates is `v=${NAME-}`, whose only possible readings are "assign the value of NAME to
  v" and "assign the empty string to v". A name holding `}` could close the brace early, and `}` is
  outside the alphabet; a name holding `$` could nest an expansion, and `$` is outside the alphabet.

`eval` appears **exactly once in each script text**, in both cases on the line immediately after the
`case` guard, and the gate asserts both facts by byte index in the same way condition 46 asserts
`program-find`'s assignment-before-loop ordering (`conformance-machines.mjs:5694-5709`).

**The one attack the layers do not stop, written down.** A name the person legitimately owns can be
the name of a variable whose VALUE is hostile — but the value is never parsed as shell source
anywhere. It is bound by `eval` into `v`, and then reaches only `set -- "$@" -e "$k=$v"`, which makes
one argv word. tmux takes it as one `-e` pair.

### 2.5 What crosses, and what does not — the containment table

| Byte | This Mac | The wire | The far machine |
| --- | --- | --- | --- |
| The NAME | in memory, in `settings.json` / `agents.json`, in one ssh argv element | yes, encrypted | in the login shell's argv and in the tmux `-e` pair |
| The VALUE, from this Mac's shell | **never read for a remote create** | **never** | **never** |
| The VALUE, from the far machine's shell | **never** — it is not printed back by the probe and never enters any argv, log, manifest row or file here | **never** | in the far tmux CLIENT's argv for the life of the create, then in that session's tmux environment, then in the pane |

**The limit this phase accepts and does not hide.** The value stands in the far machine's own process
table for the life of one create, in the argv of that machine's own tmux, expanded by that account's
own shell from a variable that account already had. That is the second half of research 51 §7's
measurement, and it is taken here — where the first half is refused — because the two halves are not
the same thing. Carrying a value from this Mac puts a secret on a computer where it did not exist and
into a process table Tortie has not counted the readers of. Expanding a value on the machine that
already holds it does neither. It is also exactly what `managedPaneEnv`'s two stamps already do on
every remote create today.

### 2.6 Where the names come from on a remote create

In `remoteCreate`, between step 5 (the bin search, `remote-sessions.ts:1489`) and step 7 (the
manifest row, `:1512`):

```ts
const passthrough = remoteEnvNamesFor(entry, input.agent);   // [] for every agent nobody configured
const envProbe = passthrough.length === 0
  ? null
  : await probeRemoteEnvNames(ctx, passthrough);              // never rejects
```

`remoteEnvNamesFor` is `envPassthroughFor(entry?.launch.envPassthrough, getSettings().envPassthrough[agent])`
filtered by the alphabet and capped — the SAME union rule the local create uses
(`launch-plan.ts:285-308`), reached through the same `getSettings()` seal-checked read the local
create uses (`create-local.ts:471-480`). If importing `envPassthroughFor` from
`../sessions/launch-plan` into `src/main/machines/` closes an import cycle or fails
`gate:contract`'s scratch bundle, the builder MOVES that pure function to
`src/shared/launch-env.ts` and both callers import it there — **one spelling, never two**, and the
commit body says which happened.

The probe runs **per create**, never cached per connection generation, because the phase's own proof
is that a rotated value is picked up by the next session and because a name exported after the last
connect must still be found.

`remoteCreateArgs` is then called with `envNames: passthrough`, and `execOn` with
`envNames: passthrough` and the wider deadline.

### 2.7 The notice

Immediately before `remoteCreate` returns its session — the same position the local create uses,
after the session exists and is bound (`create-local.ts:665-692`):

```ts
if (envProbe !== null && (envProbe.missing.length > 0 || envProbe.probeFailed)) {
  postDurabilityNotice({
    kind: 'env-unresolved',
    sessionId,
    sessionName: oneLine(input.name),
    names: envProbe.missing,
    probeFailed: envProbe.probeFailed
  });
}
```

`src/main/notice/index.ts` imports only `@shared/notice`, `@shared/ipc`, `../log` and
`../typed-events` (`:43-46`), so there is no cycle into the machines layer.

### 2.8 The remote restore gets the same treatment

`src/main/machines/remote-restore.ts:443-450` calls the same composer. It gains the same two lines —
the names from `remoteEnvNamesFor`, and `envNames` on both `remoteCreateArgs` and `execOn` — because
otherwise a person's remote session would hold the variable until the first restore and then quietly
lose it, which is the silence this phase exists to end. It reads the names from the ENTRY and the
SETTINGS rather than from the manifest row, so **no manifest schema changes and the row still carries
no name and no value.** That is a deliberate difference from the local restore, which reads
`rec.envPassthrough` off the row (`restore.ts:962`), and it is the safer of the two: Phase 269's
second recorded limit is that the manifest is not sealed, and this path never consults it.

### 2.9 The value cap

`REMOTE_ENV_MAX_VALUE_CHARS = 4096`, matching `ENV_CAPTURE_MAX_VALUE_BYTES` (`resolve.ts:397`) and
enforced by `${#v}` in BOTH script texts, so the probe's answer and the create's injection can never
disagree about which names are usable. The gate asserts the literal appears in both texts and equals
the exported constant, which is the technique `repo-search`'s `head -c` literal already uses
(condition 52).

**A stated divergence.** `${#v}` counts CHARACTERS in zsh and BYTES in dash, while the local cap is
bytes (`Buffer.byteLength`). A multi-byte value between 4096 characters and 4096 bytes is therefore
treated differently on the two sides. No credential in any provider's documented format is affected;
it is written down because a later round should not discover it.

### 2.10 A second stated divergence: `-lc` against local `-lic`

Both new scripts ask the far shell with `-lc`, which is `remote-path.ts`'s choice and its reason
(`:14-20`). The local probe uses `-lic` (`resolve.ts:316`, `:504`). So a variable exported only in an
interactive-only branch of the person's rc is found locally and not remotely. Recorded, not fixed.

---

## 3. The two builders — disjoint files

### BUILDER A — the far side: scripts, carriage, create, restore, notice

**Owns, and nothing outside this list:**
- `src/main/machines/remote-env-carriage.ts` (NEW)
- `src/main/machines/remote-env-probe.ts` (NEW)
- `src/main/machines/remote-scripts.ts` (the `ENV_NAMES` text and its catalogue row only)
- `src/main/machines/context.ts` (`tmuxCommand`'s third parameter and its remote branch)
- `src/main/machines/exec-plane.ts` (`ExecTmuxOptions.envNames`, forwarded through `execOn`/`spawnTmux`)
- `src/main/machines/remote-sessions.ts` (`REMOTE_ENV_SLOT` in `remoteCreateArgs`; the probe, the deadline, the notice in `remoteCreate`)
- `src/main/machines/remote-restore.ts` (the same two lines)
- `src/main/machines/index.ts` (re-exports)
- `src/shared/launch-env.ts` (ONLY if the cycle above forces the move; then `src/main/sessions/launch-plan.ts` re-exports from it and its behaviour does not change by one byte)
- `src/main/machines/__tests__/p270-*.test.ts`

**MUST NOT TOUCH:** `src/main/machines/remote-env.ts` (not one byte), `src/main/sessions/create-local.ts`,
`src/main/restore/restore.ts`, `src/main/tmux/resolve.ts`, anything under `src/renderer/`, anything
under `build/`.

**The exports the gate will read, pinned here so BUILDER B can write against them:**

```ts
// src/main/machines/remote-env-carriage.ts
export const REMOTE_ENV_SLOT: string;                  // '__TORTIE_ENV_SLOT__'
export const REMOTE_ENV_MAX_VALUE_CHARS: number;       // 4096
export const REMOTE_ENV_NAMES_MAX: number;             // 16
export const REMOTE_ENV_NAME_GUARD: string;            // the far-side `case` pattern, one literal
export const REMOTE_ENV_CREATE_SCRIPT: string;         // the constant text
export function remoteEnvNamesFor(entry: LaunchableEntryLike | null, agent: LaunchableAgentKind): string[];
export function composeEnvCreateCommand(tmuxArgv: readonly string[], names: readonly string[]): string;

// src/main/machines/remote-env-probe.ts
export const REMOTE_ENV_PROBE_TIMEOUT_MS: number;      // 10_000
export const REMOTE_ENV_PROBE_SCRIPT_ID: string;       // 'env-names'
export interface RemoteEnvProbeResult { resolved: string[]; missing: string[]; probeFailed: boolean }
export function remoteEnvProbeMarker(): string;        // fresh nonce, one per call
export function parseRemoteEnvAnswer(payload: string, marker: string, asked: readonly string[]): RemoteEnvProbeResult;
export function probeRemoteEnvNames(ctx: RemoteMachineContext, names: readonly string[]): Promise<RemoteEnvProbeResult>;

// src/main/machines/remote-sessions.ts
export const REMOTE_CREATE_ENV_TIMEOUT_MS: number;     // 20_000
```

**Unit tests BUILDER A owns (RED at the parent, green after):**
1. `remoteCreateArgs` with no `envNames` is byte-identical to the parent's output for six shapes
   (with/without cwd, with/without argv, with a pre-assigned id).
2. `remoteCreateArgs` with `envNames: ['FOO']` emits exactly one `REMOTE_ENV_SLOT`, positioned after
   `-s`/`-c` and BEFORE the first `-e`, and emits **no `-e FOO=` pair**.
3. `assertRemoteEnvAllowed` is still reached with only the two stamps, and still throws for a third
   name passed on `input.env` (the Phase 73 behaviour is unchanged).
4. `composeEnvCreateCommand` output: `"$SHELL"` appears unquoted exactly once; the script text
   appears exactly once; each hostile name from the attack list appears **zero** times (they are
   filtered) and each legal name appears exactly once, inside the names positional.
5. The script text bytes are pinned by sha256 in both files, including `eval "v=\${$k-}"` — note the
   TypeScript literal must be written `'      eval "v=\\${$k-}"'` so the emitted shell text carries
   the backslash. A test asserts the emitted text contains the exact byte sequence
   `eval "v=\${$k-}"`.
6. `parseRemoteEnvAnswer`: trailer present with two of three names → one `missing`, `probeFailed`
   false; trailer absent → all missing, `probeFailed` true; a forged record carrying a DIFFERENT
   marker is ignored; records whose token is not a legal name are ignored; a name asked for that
   comes back twice is counted once.
7. `remoteEnvNamesFor` drops every hostile name whole, caps at 16, dedupes, and returns `[]` for
   every compiled agent as shipped (so no probe is spawned for anybody who configured nothing).
8. `tmuxCommand(localCtx, args, ['FOO'])` is byte-identical to `tmuxCommand(localCtx, args)`.

### BUILDER B — the proof: gates, the live probe, the harness

**Owns, and nothing outside this list:**
- `build/machines-conformance-probe.mts` (a new `phase270` block)
- `build/conformance-machines.mjs` (conditions **88 to 96**, appended after condition 87)
- `build/p270/probe-p270-remote-env.mjs` (NEW)
- `src/main/harness/p270-remote-env.ts` (NEW) and its one registration line in `src/main/harness/index.ts`
- `package.json` (`"probe:p270"`)
- `DEVELOPMENT.md` (the probe's row, if the file's table names probes)

**MUST NOT TOUCH:** anything under `src/main/machines/`, `src/main/sessions/`, `src/main/restore/`,
`src/shared/`, `src/renderer/`.

**The nine new gate conditions.** The probe half still spawns nothing, starts no ssh, opens no
manifest and reads nothing under his home.

88. **The allowlist did not move.** Re-assert condition 47's three clauses AFTER this phase, and add
    a fourth: no name outside `REMOTE_ENV_ALLOWED` reaches an `-e` pair composed by
    `remoteCreateArgs` for any input, including `envNames: [...sixteen legal names]`.
89. **The slot.** Present exactly once when `envNames` is non-empty, absent otherwise; positioned
    strictly before the first `-e` in the composed argv; and never present in a plain
    `tmuxCommand(ctx, args)` output.
90. **Byte identity at the parent.** `tmuxCommand(remoteCtx, remoteCreateArgs({...}))` with no names
    is compared against a pinned string captured from the parent commit. Any drift fails.
91. **The hostile-NAME battery.** Twelve shapes — `A'B`, `A;id`, `A$(id)`, `` A`id` ``, `A B`,
    `A\nB`, `A|B`, `A>B`, `A}`, `${IFS}`, `1ABC`, `''`, a 300-character name, `GMUX_SESSION_ID`,
    `PATH` — are run through `remoteEnvNamesFor` and every one is dropped. Then each is forced past
    the filter straight into `composeEnvCreateCommand` and the composed string is asserted to hold
    the script text UNCHANGED and the hostile bytes only inside the single-quoted names positional.
92. **`eval` is bounded.** Each of the two script texts holds exactly ONE `eval`, its byte index is
    greater than the byte index of the `case` guard in the same text, and the guard literal is byte
    equal to `REMOTE_ENV_NAME_GUARD` in both.
93. **The cap agrees in three places.** `REMOTE_ENV_MAX_VALUE_CHARS`, the literal in the probe text
    and the literal in the create text are all `4096`, and the local
    `ENV_CAPTURE_MAX_VALUE_BYTES` is the same number.
94. **The catalogue did not widen.** `env-names` is in `REMOTE_SCRIPTS` with `mode: 'read'` and
    `params: 2`; `remoteWriteScripts()` still returns **eight** ids in the pinned order; the new text
    names none of `rm`, `mv`, `cp`, `mkdir`, `touch`, `chmod`, `chown`, `ln`, `dd`, `tee`,
    `truncate`, no git verb at all, holds no backtick, begins `set -e` then `umask 077`, and every
    `>` in it is part of `2>/dev/null` (there are none). **No bare positional is walked in either
    text** — every `$1`/`$2` is read into a local name in quotes, so rule 2 holds without needing
    `program-find`'s list exemption at all.
95. **No value spelling anywhere.** Neither script text contains any parameter expansion outside the
    closed set `$1 $2 $@ $# $SHELL $a $k $m $n $t $v ${n%% *} ${n#* } ${#v} ${$k-}`, and neither
    text contains a marker literal for the NONCE — the nonce arrives as a positional. Two calls to
    `remoteEnvProbeMarker()` differ.
96. **The stamps still win.** In a composed argv with `envNames`, the index of the slot is less than
    the index of every `-e GMUX_` pair.

**`probe:p270` — the LIVE run on the operator's Mac Pro (independent method (a)).**

Refusals first, before anything is contacted: `build/real-machine.mjs`'s `gate()` (two environment
variables must agree, `CI` unset, the socket not a real one, the host not loopback). Then:

- **Socket.** The whole run is inside `node build/harness-socket.mjs --fresh gmux-p270-env '…'`, so
  `activeTmuxSocket()` answers `gmux-p270-env` for BOTH the local and the remote context
  (`src/main/machines/context.ts:351`, `:455` — it is the ONE place the remote socket name comes
  from). His `-L gmux` is therefore never written on either machine.
  `build/electron-run.mjs` reads the socket announcement and ends a launch that disagrees
  (`context.ts:310-333`).
- **His server is counted, read only, before and after**, on both machines: `countOperatorSessions()`
  here and one `list-sessions` on `-L gmux` over there (`real-machine.mjs:692-714`, `:741-749`).
  A difference fails the probe whatever else passed. **No other verb is ever sent to `-L gmux`.**
- **Everything the run makes on his Mac Pro lives under one scratch directory** it creates and
  removes in a `finally`, and its own far-side tmux server is `kill-server`ed and its socket file
  unlinked in the same `finally` (`scratchSocket`, `farTmux`).
- **Machine row.** `src/main/harness/p270-remote-env.ts` seeds and confirms the Mac Pro in the
  scratch profile with `bringUp`, the way `remote-matrix.ts:338`, `:545`, `:569` does.
  `recordHostKeys` writes **Tortie's own** known-hosts inside the scratch profile. **`~/.ssh` is
  never written, no key is added to an agent and no key material is read.**

The five readings, in ONE Electron:

| # | What is driven | What must be true |
| --- | --- | --- |
| 1 | `P270_FROM_HERE` is exported in the harness's own scratch login-shell profile **on this Mac only**, and named as a passthrough for the agent | The remote pane does **not** hold it; an `env-unresolved` notice fires naming exactly `P270_FROM_HERE`. **This is the containment proof: a value this Mac has does not cross.** |
| 2 | `SSH_CONNECTION` is named as a passthrough. It is set by the far side's own sshd and **this Mac's login shell has no such variable at all** (asserted by running `captureLoginShellEnv(['SSH_CONNECTION'])` here and reading `missing`) | The remote pane holds a non-empty `SSH_CONNECTION`. A value that exists ONLY on the far side reached the pane, so it can only have come from that machine's shell. **This is the "the value is the REMOTE one" proof, and it needs not one byte written in his home.** Its VALUE is never printed — the probe asserts shape and non-emptiness only |
| 3 | Rotation, without writing a dotfile: the second session is created after the first is closed, and its `SSH_CONNECTION` differs from the first's (a new ssh session, a new port) | The value is resolved per create, not cached, with no Tortie restart and no tmux server restart |
| 4 | Containment on this Mac, during and after: `ps -Ao pid,ppid,command` is read for the planted `P270_FROM_HERE` value and for the pane's `SSH_CONNECTION` value | Zero matches, at every sample. Neither value is ever composed here |
| 5 | Containment on the far side, after the create: one `ps -Ao args` over there, plus the manifest row, both logs, and `show-environment -g` on the scratch socket on BOTH machines | Zero matches. The in-flight presence in the far tmux client's argv is **declared, not denied**: the composed string the gate reads is the evidence, and §2.5's table is what the probe prints beside the result |

Electron is launched through `build/electron-run.mjs` and ended in a `finally`; `npm run shot` is not
used; nothing runs in the background; every child the probe starts is killed in a `finally` that
names it (`gate:background`); every ssh goes through `build/ssh-run.mjs` (`gate:knownhosts`).
Electrons are counted ONCE, at the end, with
`ps -Ao pid,ppid,rss,comm | grep -E "[E]lectron|Tortie$|chrome_crashpad" | grep -v defunct`.

**The ATTACK (independent method (b)), and it is BUILDER B's too.** In one run, all of:
1. `remoteCreateArgs({ …, env: { ANTHROPIC_API_KEY: 'planted' } })` still throws
   `REMOTE_ENV_PASSTHROUGH_REFUSED` naming that name, before anything is composed — proving the old
   route is not re-opened by the new one.
2. `remoteCreateArgs({ …, envNames: ['ANTHROPIC_API_KEY'] })` composes a slot and **no pair carrying
   that name**, and the composed ssh command line is searched for a planted value set in THIS Mac's
   environment under that name: zero matches.
3. A far-side rc file under the scratch HOME that prints a forged record with a GUESSED marker
   (`__TORTIE_ENVP_00000000__`) is ignored by `parseRemoteEnvAnswer` — the nonce defeats it. Run
   against a loopback scratch machine (`build/scratch-machine.mjs`), never against his home.
4. A name that is legal but whose VALUE on the far side is `x'; id; echo '` reaches the pane as that
   exact string and executes nothing — read back with `show-environment -t` and inside the pane.

---

## 4. Gates for this commit

`npm run typecheck && npm run build && npm run test && npm run smoke:t1`, plus, from the
path-triggered table:

| Touching | Gate |
| --- | --- |
| `src/main/machines/**` | `conformance:machines` (~2 s) |
| `src/main/machines/remote-sessions.ts` and `src/main/sessions/core.ts`'s remove path | `conformance:remoteclose` — run it; this phase does not touch the remove path but the file is named |
| `build/` — a script that runs ssh | `gate:knownhosts` (in `npm run build`) |
| `build/` — a script that starts a process it does not wait for | `gate:background` (in `npm run build`) |
| `build/` — a script that starts an Electron | `gate:electron`, and **`HELPER_USER_FLOOR` is raised in this same commit** because `build/p270/probe-p270-remote-env.mjs` reaches `build/electron-run.mjs` |
| a `*.test.ts` added under `src/` | `gate:checks` (in `npm run build`) |
| the shared IPC contract | `gate:contract` — **expected NOT to move.** If `docs/audits/contract-baseline.txt` diffs, the commit is wrong |

Once per phase: `probe:p270` (the live run), and `conformance:resume:capture` is **not** triggered —
no file in its path list is touched.

---

## 5. What is NOT in this phase

- **`REMOTE_ENV_ALLOWED` does not grow.** `src/main/machines/remote-env.ts` is not edited by one
  byte. A later round that wants a value to travel from this Mac reads research 51 §7 and argues with
  the two-process-tables measurement first.
- **No value is sent from this Mac to another machine, and no value is returned to this Mac.** The
  probe answers with names.
- **No change to the local path Phase 269 shipped.** `create-local.ts`, `restore.ts` and
  `resolve.ts` are untouched.
- **No per-machine UI.** The card stays per agent. The names are a property of the agent; the values
  are a property of whatever machine it runs on.
- **No manifest schema change and no seal change.** The row still carries no name and no value for a
  remote session. Phase 269's unsealed-manifest limit stays its own follow-up.
- **No `update-environment` change on any tmux server.** It was considered — setting it globally
  would let a pane take the value from the far tmux CLIENT's ENVIRONMENT rather than its argv, which
  would remove the last argv exposure in §2.5 — and it is refused here because it mutates a global
  option on a server the operator has live sessions on, it changes behaviour for every session and
  every future attach, and no measurement of it exists. A later round may take it, with a
  measurement.
- **Nothing connects on its own.** The probe runs on a create a person asked for, and on nothing
  else.
- **No retry.** `runRemoteRead` does not retry (`remote-run.ts:62-69`) and neither does the create.
