# Research 123 — issue 20, the environment a session is born with

**Read and measured on 2026-09-14 at `1c5f6952`**, in the worktree `/private/tmp/wt-r20`. Every
line number below is from that tree. Nothing under `src/` was changed by this research, and PR #21
was read and never merged, commented on or closed.

Three readings fed this document and they disagreed in four places. **Every disagreement below was
settled by opening the file or by running the measurement, never by averaging**, and the paragraph
that settles each one says so.

No variable's VALUE appears anywhere in this document. Where presence had to be proved, only the
name, the count or the length is written down.

---

## 0. The two halves, and the answer to each in one sentence

Issue 20 is two complaints in one report, and they have different answers.

**Half one — the title.** *"Make each new session spawn not as a sub process but as a completely new
process… If I update a key or do something that involves changing the environment, then I have to
completely quit Tortie and restart it in order for it to be realized in new sessions. This is
because sessions are spawned as subprocesses of Tortie."*

> **A session is already not a subprocess of Tortie** — measured below, a pane's parent is the
> private tmux server and the server's parent is launchd, with the Tortie that asked for the session
> nowhere in the chain — so the fix he asks for is the thing that already happens, and the staleness
> he feels comes from somewhere else entirely.

**Half two — "maybe it's a bug".** *"After modifying the environment and config files for pi in
order to set up new models AND restarting Tortie I get model errors… If I start pi in a new terminal
it works fine."*

> **This one is real, it is exactly the problem Phase 33 was built for, and the mechanism Phase 33
> shipped is off by default** — `launch.envPassthrough` exists, works, and is set by no compiled
> agent row (`src/main/agents/registry.ts:230-242`), so a provider key exported in `~/.zshrc` reaches
> no freshly created agent pane on any machine until the person writes an `agents.json` file whose
> existence the running app never mentions.

The product finding underneath both is in §4, and it is neither of the above: **when an agent pane
starts without the environment it needs, Tortie says nothing at all.** The agent fails, minutes
later, with a message about its provider. That silence is what cost him the afternoon.

---

## 1. What is actually true about the process chain

### 1.1 The measurement

Scratch tmux server on socket `gmux-r20c-10416`, homebrew tmux 3.6a, started with this repository's
own `resources/gmux-tmux.conf`, killed and its socket unlinked in a `trap … EXIT` that reported
`r20c sockets left: 0` and `r20c tmux procs: 0`. The operator's `-L gmux` server was not contacted by
this measurement at all.

Walking the pane's ancestry:

```
pid=10553 ppid=10427 cmd=/bin/sh /private/tmp/r20c.7M8Pg3/report.sh …   <- the pane process
pid=10427 ppid=1     cmd=/opt/homebrew/bin/tmux -L gmux-r20c-10416 …    <- the tmux SERVER
pid=1     ppid=0     cmd=/sbin/launchd
```

The process that ran `new-session` was pid 10416. **It does not appear in that chain.** The pane's
parent is the server; the server's parent is launchd.

That is not an implementation detail, it is the product. `CLAUDE.md` states it as an invariant —
*"Sessions live in the PRIVATE tmux server (socket `-L gmux`, config resources/gmux-tmux.conf). The
app is a disposable client."* — and the code enforces it. `assertVerbAllowedOnSocket`
(`src/main/tmux/resolve.ts:1228`, verb set at `:1205`) throws on `kill-server` aimed at socket `gmux`
for every caller in the product, with the sentence *"Tortie does not end the session server."*
Grepping the tree, the only `kill-server` calls that execute are in harnesses on their own sockets
(`src/main/harness/basic.ts:56`, `src/main/harness/isolation.ts:115`). **Quitting Tortie cannot end
the server, and that is the whole durability design: sessions survive quit, crash and reboot, with
conversation resume.** JnBrymn's sessions outliving Tortie is the feature, not the bug.

### 1.2 Where a new pane's environment comes from, layer by layer

Same scratch run, four distinct marker sources, each set on exactly one of the server process, the
server globals, the client process, and the `new-session -e` line:

| Set on | Reached the pane? |
| --- | --- |
| the process that ran `start-server` | **yes** (`R20_WHO=SERVER`) |
| `set-environment -g` after the fact | **yes** (`R20_GLOBAL=yes`) |
| the client process that ran `new-session` | **no** (`R20_CLIENTONLY=UNSET`) |
| `-e` on the `new-session` line | **yes** (`R20_PANE_E=yes`) |
| `PATH`, set differently on all three | the **CLIENT's** (`/R20CLIENTPATH:…`) |

So: **every ordinary variable a pane sees comes from the server's environment, frozen at the instant
Tortie first started it; `PATH` is tmux's one exception and comes from the client.** This reproduces
what the supervisor's own comment already says at `src/main/tmux/supervisor.ts:442-452` — *"The
`set-environment -g PATH` call further down does NOT give a pane its PATH"* — and it is not
`update-environment` doing it: that option's default on 3.6a is the stock nine names
(`DISPLAY KRB5CCNAME MSYSTEM SSH_ASKPASS SSH_AUTH_SOCK SSH_AGENT_PID SSH_CONNECTION WINDOWID
XAUTHORITY`), and `PATH` is not among them.

The chain in the product, then:

- **The server's environment is Tortie's `process.env` at first start.** Every tmux command in the
  product goes through one spawn that passes `env: process.env` verbatim
  (`src/main/machines/exec-plane.ts:608`, and the second guarded site at `:754`), and `start-server`
  is one of those commands (`src/main/tmux/supervisor.ts:537`).
- **Tortie writes exactly two variables into the server globals**, `LANG` at
  `src/main/tmux/supervisor.ts:549` and `PATH` at `:577`, and no others.
- **The client's PATH is set once per app run** at `src/main/tmux/user-path.ts:49`
  (`process.env['PATH'] = userPath`), from a login-shell probe memoised for the life of the process
  (`getUserPath` at `src/main/tmux/resolve.ts:587-592`, `installUserPath` at `user-path.ts:45-72`).
- **The `-e` pairs come from one merge rule**, `paneEnvFor` at
  `src/main/sessions/launch-plan.ts:331`, called by the create (`create-local.ts:619`) and by the
  restore (`restore.ts:996`). Weakest first: `SECURITYSESSIONID` (`src/main/tmux/env.ts:94,136`), the
  row's `launch.env`, the resolved `launch.envPassthrough` values, the Phase 202 login directory,
  and last so it wins, `managedPaneEnv` (`src/main/tmux/env.ts:48`).

### 1.3 The live server on the operator's own machine

Read-only, names only, on `-L gmux` today:

```
__CF_USER_TEXT_ENCODING __CFBundleIdentifier COMMAND_MODE HOME LANG LaunchInstanceID LOGNAME
MallocNanoZone PATH PWD SECURITYSESSIONID SHELL SSH_AUTH_SOCK TMPDIR USER XPC_FLAGS XPC_SERVICE_NAME
```

**Seventeen names, and every one of them is launchd's.** `__CFBundleIdentifier`,
`XPC_SERVICE_NAME`, `LaunchInstanceID`, `MallocNanoZone` and `COMMAND_MODE` are the signature of a
Finder-launched app bundle. There is nothing of a login shell in it beyond the two Tortie writes
itself.

**This settles a disagreement between the readings.** One reading reported roughly 67 names
including `NVM_*` and `CLAUDE_CODE_*`, i.e. a development-terminal environment. That is not what the
socket holds today; I read it myself, twice, and it is the seventeen above. It also closes one of the
open items research 41 left behind — *"The packaged Finder launch environment was never measured"*
(`docs/research/41-pi-env-providers.md` §11) — at one remove: the frozen server environment IS a
packaged Tortie's process environment, and it is minimal.

The same read, on `PATH` only: **35 entries, 0 beginning with `~`, 0 relative.** (A second reading
reported 52 entries; that number is the freshly captured-and-merged PATH of a running app, not what
was published to the server at the boot that created it. Both can be true and only the second is
measurable from outside, so 35/0/0 is what this document claims.)

### 1.4 The finding neither reading had: tmux puts a shell in front of a ONE-word command

`createSession` pushes the argv after `--` at `src/main/tmux/sessions.ts:170-181`, whose comment says
tmux 3.4+ *"accepts the command as an argument vector (no shell quoting hazards)"*. That is true
**only when the vector has two or more elements.** Measured, same scratch server, the identical
script run both ways with a scratch `ZDOTDIR` holding a marker `.zshenv`, `.zprofile` and `.zshrc`:

| `new-session -- …` | `.zshenv` | `.zprofile` | `.zshrc` |
| --- | --- | --- | --- |
| **one element** (`"/…/report.sh /…/a.out"`) | **yes** | no | no |
| **two elements** (`"/…/report.sh" "/…/b.out"`) | no | no | no |

`show-options -g default-shell` read `/bin/zsh`, and one element is run through it as
`default-shell -c "<the string>"`. The interposed shell `exec`s in place — the pane's parent is still
the server, and no depth is added — but it is a zsh, and zsh reads `.zshenv` on **every** invocation.

**This closes the last open item in research 41 §11**, which wrote: *"For a single word pane command,
whether tmux 3.6a wraps it with /bin/sh -c or with the default-shell option was not measured. It does
not change the pi finding, because pi's argv is never one word."* Research 41 was right about pi and
right that it did not matter for pi. It matters for the other agents, because the split falls on an
incidental property:

- Every one of the thirteen launchable rows has a **one-element** `launch.argv`
  (`src/main/agents/registry.ts:522, 589, 669, 757, 825, 923, 1003, 1083, 1162, 1243, 1326, 1426,
  1549`).
- Four of them are `idCapture.mode === 'pre-assign'` — claude (`:530`), gemini (`:765`), pi
  (`:1257`), grok (`:1459`) — and `buildLaunchSpec` appends the flag and a fresh uuid at
  `src/main/manifest/agents.ts:783` via `launchArgvFor` (`registry.ts:1841-1850`). **Their create argv
  is three elements. No shell, no `.zshenv`.**
- The rest launch as one element and therefore get `zsh -c`, and therefore get `~/.zshenv`.
- **Any launch flag the person adds in Settings flips an agent from the second group to the first**,
  silently.

So the environment an agent pane is born with varies by agent, and by whether the person typed a
flag, for reasons nobody designed and nothing documents. **This is an observation, not a
recommendation.** Telling anybody to move their keys to `~/.zshenv` would be telling them to depend
on an accident that a one-word change to a registry row removes. It is written down here so a future
phase knows the seam exists.

### 1.5 The disagreement about "no shell between tmux and the agent", settled

One reading wrote *"There is no shell between tmux and the agent: tmux 3.4+ `execvp`s the multi-word
argv directly. No `.zshrc`, `.zprofile` or `.zshenv` ever runs in a fresh agent pane."* Another wrote
*"a pi pane is exec'd directly by tmux with no shell in between."* Opened and measured: **the first
is false as a general statement and the second is true for pi.** pi's create argv is
`['pi', '--session-id', '<uuid>']`, three elements, so pi genuinely gets no shell — but by accident
of its pre-assignment flag, not by a rule. For codex, droid, deepseek, antigravity, muse, qwen, omp
and opencode a zsh does run, and `.zshenv` is read.

For every one of the thirteen, `.zprofile` and `.zshrc` are **not** read. That part of both readings
stands.

### 1.6 Create and restore disagree, and now it is measured rather than deduced

`restoreSession` opens a **holder shell** for every row, not just shell rows
(`src/main/restore/restore.ts:918-950`): `const shell = process.env['SHELL'] ?? '/bin/zsh'`, then
`let shellArgv: string[] = [shell]`, and the `-l` flag is added only inside `if (rec.agent ===
'shell')`. The resume command is then **typed and not run** (`restore.ts:1080-1097`); the person
presses Enter.

Measured on the scratch server, with `$-` read inside the pane:

| pane | `.zshenv` | `.zprofile` | `.zshrc` | `$-` |
| --- | --- | --- | --- | --- |
| bare `zsh` holder — **every agent row** | yes | no | **yes** | `569XZims` (interactive, not login) |
| `zsh -l` holder — shell rows | yes | yes | yes | `569XZilms` (interactive **and** login) |

And the armed command, run from the first pane, reported `ZSHENV=yes ZPROFILE=UNSET ZSHRC=yes`, with
`parent cmd: /bin/zsh` and `grandparent: …tmux -L gmux-r20c-10416…`.

**So a restored agent inherits the person's `~/.zshrc` exports and a freshly created one does not.**
Research 41 §3 called this out in 2026-08 and §11 admitted *"It was not exercised against the live
app."* It is exercised now, and it is still true. A person whose agent works after a restore and
fails on a fresh create is seeing this, and nothing in the product explains it.

### 1.7 Therefore: what a restart refreshes, and what a person must actually do today

| Refreshed by quitting and reopening Tortie? | What |
| --- | --- |
| **Yes** | **`PATH`, for every session created after the restart.** The capture is memoised per process (`resolve.ts:587-592`, `user-path.ts:45-72`) with no product path that clears it, so a restart is the only thing that re-runs it — and the pane takes `PATH` from the client, so the new value lands without the server restarting. |
| **Yes** | `LANG` and the server-global `PATH` string, re-asserted at `supervisor.ts:549` and `:577`. The comment calls it *"repairs long lived servers"*. |
| **Yes** | `launch.envPassthrough` values, on every create and every restore — re-resolved, never replayed (`create-local.ts:604-606`, `restore.ts:962-964`). A key rotated an hour ago arrives correct with no restart at all. |
| **No** | **Every other variable in the server's frozen boot environment.** Seventeen launchd names on the operator's machine, unchanged since the day the server first started. |
| **No** | **Anything added to `~/.zshrc` that is not `PATH` and is not named in an `envPassthrough` row.** It reaches no freshly created agent pane, restart or no restart. |

**So the title's premise is wrong in its mechanism and half-right in its feeling.** He is right that a
restart is needed for a changed `PATH` — the memo is the reason, and it is a deliberate one-probe-per
-run trade. He is wrong that sessions are Tortie subprocesses, and wrong that the server's lifetime
is what stalls his key: **no restart of anything would deliver that key, because no layer carries it.**

**What a person must do today for a changed `~/.zshrc` to reach a NEW session:**

1. For a **shell tab** — nothing. `buildLaunchSpec` wraps `$SHELL` with `-l`
   (`src/main/manifest/agents.ts:746`, `src/main/manifest/login-shell.ts:20`) and the pane is
   interactive, so `.zprofile` and `.zshrc` both run. This already works.
2. For **`PATH`** — quit and reopen Tortie. The server keeps running; the new client re-probes.
3. For **anything else, into an agent pane** — name the variable in `launch.envPassthrough` in an
   `agents.json` row and confirm it in Settings → Agents. That is the whole list. §3 is the recipe.

---

## 2. Why his pi fails, named exactly

**Phase 33's problem statement is his issue, word for word.** `docs/BACKLOG.md:3466-3469`:

> **The problem.** A fresh agent pane inherits only PATH and LANG from the login shell, so provider
> keys exported in ~/.zshrc never reach a natively launched agent. pi with a Fireworks or custom
> backend fails inside Tortie while working in a plain terminal.

It shipped on 2026-08-15 as `67ce3e3`. What it built:

- **`launch.envPassthrough`** on an `agents.json` row: up to 16 environment variable **names**, never
  values. Parsed at `src/main/config/overlay.ts:431`, merged at `:1068` and `:1121`, surfaced to the
  confirm layer at `:171`.
- **Schema 2 is mandatory for the field.** `overlay.ts:525-533` drops a schema-1 row carrying it with
  the sentence *"launch.envPassthrough needs \"schema\": 2 at the top of agents.json."*
- **The names are execution-bearing.** `envPassthroughNames` joins `ConfigExecutionFields`
  (`src/main/config/confirm.ts:148`), canonicalised sorted (`:207`, `:329`), so adding or removing a
  name moves the confirm hash and reordering does not. The sheet prints one line per name at
  `confirm.ts:377`, `Reads from your shell at each launch: NAME`, and never a value. **Rotating a key
  asks nothing**, because the hash covers names only.
- **Values are resolved per launch by a probe and are persisted nowhere.**
  `captureLoginShellEnv` (`src/main/tmux/resolve.ts:444`) spawns
  `shell -lic '<printf per name>'` at `:499` — an **interactive login** shell, so `.zprofile` and
  `.zshrc` are both read — with a fresh 8-hex nonce in the marker per probe (`:463`) so rc output
  cannot forge a record, names filtered by `/^[A-Za-z_][A-Za-z0-9_]*$/` (`:437`, `:451`), and unset,
  empty or over-4096-byte values reported **missing** rather than injected as empty strings
  (`:481-493`). The manifest column `env_passthrough` (migration `011-env-passthrough`,
  `src/main/manifest/schema.ts:306-308`) holds **names only** and is excluded from
  `ManifestSessionPatch` at the type level (`src/main/manifest/codecs.ts:264`).
- **Refusals.** Everything `launch.env` refuses — `PATH`, `SHELL`, `BASH_ENV`, `ENV`, `ZDOTDIR`,
  `NODE_OPTIONS`, `ELECTRON_RUN_AS_NODE`, `TMUX*`, `DYLD_*`, `LD_*`, `GMUX_*`, `TORTIE_*` — plus
  `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR` (`ENV_PASSTHROUGH_REFUSED`,
  `src/shared/agent-overlay.ts:466`), because `src/main/agents/detection.ts` expands an agent's store
  directories against Tortie's own process env and a moved store loses conversation capture.

**And no compiled row turns it on.** `grep -c envPassthrough src/main/agents/registry.ts` is **1**,
and that hit is the type declaration at `registry.ts:242`, whose docstring says it in capitals:

> NO COMPILED ROW SETS THIS, and that is the design rather than an omission. Which variables an agent
> needs is a fact about one person's machine, not about the agent, so the route to this field is an
> agents.json row that restates `launch.argv` and passes the confirm gate.

pi's row (`registry.ts:1206-1291`) sets no `envPassthrough`. **The mechanism he needs shipped a month
ago, is correct, and is inert on his machine and on every machine.**

The shipped guide even carries his exact case as a copyable example,
`resources/config/examples/07-env-passthrough.json`, with `"id": "pi"` and
`"envPassthrough": ["FIREWORKS_API_KEY"]`. He has never seen it, for the reason §4 gives.

### The today-recipe

```text
ROUTE A — pi only. No Tortie configuration. Works on the shipped build right now.

  Start a pi session in Tortie and run:   /login <your provider>
  The key lands in ~/.pi/agent/auth.json at mode 0600, and auth.json BEATS
  environment variables in pi's credential order, so it works in a pane that
  has no shell environment at all.

  To keep the key out of a file, set that auth.json value to a "!" command:
      !security find-generic-password -s <service> -w
  pi runs it when it needs the key.

  This is the shipped guide's own wording, resources/config/README.md:242-248,
  and it is Phase 33's documented day-one stopgap (docs/BACKLOG.md:3495-3497).

  LIMIT: it carries a credential. It does not carry a base URL, a model list or
  anything else your provider setup reads out of the environment.


ROUTE B — launch.envPassthrough. The supported route, for pi and for every
other launchable agent, and the only one if your provider is reached through a
$VAR in pi's own config.

  1. Tortie's app menu -> "Open Configuration Folder"  (src/main/menu.ts:583).
     That opens
        ~/Library/Application Support/Tortie/gmux/config/
     It already holds README.md, agents.schema.json and examples/.
     It does NOT hold agents.json. Tortie never writes that file.

  2. Create agents.json there. resources/config/examples/07-env-passthrough.json
     is exactly this case and can be copied as-is. Minimal content, with the
     variable NAMES your provider uses and never a value:

        {
          "schema": 2,
          "agents": [
            {
              "id": "pi",
              "launch": {
                "argv": ["pi"],
                "envPassthrough": ["FIREWORKS_API_KEY", "MYPROVIDER_BASE_URL"]
              }
            }
          ]
        }

     "schema": 2 is REQUIRED. A file saying 1 that uses this field has that row
       dropped whole, with an error naming the schema number.
     "argv": ["pi"] must be restated. A patch replaces the whole launch block,
       and argv[0] must equal the compiled binary name.
     Up to 16 names. PATH, SHELL, ZDOTDIR, NODE_OPTIONS, DYLD_*, LD_*, GMUX_*,
       TORTIE_*, TMUX*, PI_CODING_AGENT_DIR and PI_CODING_AGENT_SESSION_DIR are
       refused and drop the row.

  3. Export those names in ~/.zshrc or ~/.zprofile. Both are read: the probe is
     an interactive LOGIN shell (resolve.ts:499).

  4. No restart. The config directory is watched with a 300 ms debounce
     (src/main/config/store.ts:392). Open Settings -> Agents. A new heading,
     "From your configuration file", now exists. Press "Show what it runs".
     You will see one line per name:
         Reads from your shell at each launch: FIREWORKS_API_KEY
     Press the confirm button.

     UNTIL YOU DO THIS, PI WILL NOT LAUNCH AT ALL. Patching the compiled row
     makes pi a configured agent, and its tile in the picker is greyed and
     refuses Enter until confirmed (src/renderer/app/AgentGrid.tsx:57).

  5. Start a NEW pi session. The values are injected when the pane is created.
     A pi session already running is untouched.

  ROTATING THE KEY LATER ASKS YOU NOTHING. The hash covers names, not values
  (confirm.ts:329). Change the export, start a session, done.
```

---

## 3. The discoverability gap — this is the real product finding

**A person whose agent silently lacks its provider environment gets a model error from the AGENT and
not one word from Tortie.** Three independent confirmations, all in the shipped tree:

1. **The `env-unresolved` notice cannot fire for him.** Both call sites are guarded —
   `create-local.ts:666` and `restore.ts:1035` fire only `if (envProbe !== null && …)`, and
   `envProbe` stays `null` unless the row already names variables (`create-local.ts:604`,
   `restore.ts:962`). Its own doc comment scopes it exactly (`src/shared/notice.ts:232`): *"An agent
   pane started without a variable **its row promises**."* The toast
   (`src/renderer/state/subscriptions.ts:520-537`) reads `"name" started without FIREWORKS_API_KEY.`,
   sticky, error-styled, no action button. **A person who never wrote an `agents.json` is outside
   this notice entirely and hears silence.** The notice is well built for the case where somebody has
   already found the feature; it is structurally unable to be the thing that tells them it exists.

2. **Settings → Agents draws nothing when there is no file.** `ConfiguredAgents.tsx:159-160`:
   `if (config === null) return null; if (config.rows.length === 0 && config.errors.length === 0)
   return null;` — commented *"the ordinary case and it must cost the user no space and no
   explanation."* So the heading, the sentence naming `agents.json` and the folder path are all
   invisible to the only people who need them.

3. **`agents.json` is named in exactly one renderer string in the whole app**
   (`ConfiguredAgents.tsx:166`) — inside the block above. The only other affordance is the app-menu
   item "Open Configuration Folder" (`src/main/menu.ts:583`), which names no purpose and carries no
   accelerator.

So his screenshot is the expected behaviour of the shipped build. pi failed with pi's own message;
Tortie said nothing; the mechanism that fixes it sits behind a file, a schema number and a confirm
gate that the running app never mentions. **Phase 33 built the mechanism and shipped no path to it.**

### What could close it without reopening a refusal

The refusals bind the *mechanism*, not the *signposting*. Nothing below adds a registry, an SDK, a
marketplace, third-party code, or a way for a configuration change to start a process on its own.

- **Draw the "From your configuration file" heading even when there is no file**, with one sentence
  and the folder button. Today's early return is right about cost and wrong about audience: it hides
  the feature from exactly the person who has not got it yet. One line, a disclosure for the rest,
  which is the "just enough words" rule rather than a violation of it.
- **Let Settings → Agents compose the row.** A control that takes variable names, writes the
  `agents.json` row for the selected agent, and then routes it through the *same* confirm sheet and
  the *same* hash. **This does not reopen refusal 8**: refusal 8 requires that a human confirm the
  bytes out of band of any agent turn, bound to a hash of the execution fields, and the human is
  still doing exactly that at exactly the one surface the refusal names. What it does change is that
  **Tortie becomes a writer of `agents.json`, which it has never been** — that is the real design
  question, and it belongs to a phase, not to this document.
- **Say the fact once, at the moment it is true.** A pane whose agent is known to need provider
  credentials, started with none of them and no `envPassthrough` row, could earn one sticky line.
  This one is the most useful and the most dangerous: Tortie cannot know what any agent needs, and a
  guess that nags people whose `auth.json` is fine is worse than silence. If a phase takes it, the
  trigger must come from the registry as a recorded fact per agent, and it must be dismissible.

---

## 4. PR #21 — the honest verdict

`fix/issue-20-shell-environment`, head `3ee4588`, one commit, three files, +20/−5, **no test
changes**. The author's own note, in the PR body: *"Not tested: Vitest is unavailable in this
checkout. I do not know whether this fixes the issue."* He also said in the issue: *"I didn't intend
it to make a PR, but you have one incoming!"*

Three changes.

### Change 1 — `LOGIN_SHELL_FLAG` from `-l` to `-il`. Decline.

**It cannot reach a pi pane.** `withLoginShellFlag` (`src/main/manifest/login-shell.ts:34`) has
exactly two callers and both are gated: `src/main/manifest/agents.ts:746`, inside `if (agent ===
'shell')`, and `src/main/restore/restore.ts:950`, inside `if (rec.agent === 'shell')`. The repository
already pins this as a rule — `src/main/manifest/__tests__/login-shell.test.ts:56` is named *"no agent
gets the login flag, which is the Phase 33 gate"*. Changing `-l` to `-il` changes what a **Terminal
tab** does and nothing else.

**And a shell pane is already interactive.** Measured in §1.6: a `zsh -l` pane reports `$-` of
`569XZilms` — the `i` is already there, because zsh sets it itself when stdin is a tty and no command
is given. So the `-i` buys nothing even on the one surface it reaches.

**Where `-i` is not a no-op, it is a regression.** The docstring at `login-shell.ts:22-31` warns about
exactly one shape, `shell -l -c '…'`, and nine harness call sites use it
(`src/main/harness/durability.ts:54,199`, `identity.ts:183,215`, `quit-doors.ts:184`,
`partition.ts:640`, `remote-matrix.ts:824`, `shutdown-refusal.ts:62`, `p163-capture.ts:184`). Reading
3 measured `/bin/zsh -c` with each flag on this machine: `-l` at **68 ms** with 7 bytes of stdout and
0 of stderr; `-il` at **1714 ms**, with macOS's `/etc/zshrc_Apple_Terminal` session banner
(`Restored session: …`) **prepended to stdout** and 107 bytes of rc noise on stderr. I did not re-run
that measurement, deliberately: `zsh -il` writes under `~/.zsh_sessions`, and this research does not
write in the operator's home. The shape of the cost is not in doubt — a 25× slowdown on every shell
create in every smoke run, and a contaminated stdout that today's `includes` marker checks survive by
luck rather than by rule.

There is also the failure class Phase 13.5.1 paid for, recorded at `src/main/tmux/resolve.ts:236-265`:
a machine whose `zsh -lic` forks a copy of itself and holds the stdout pipe open, which wedged
`conformance:resume` for nine minutes. The PATH probe survives that only because it has a nonce
marker, an independent deadline, `detached: true` and a process-group kill. A pane started as
`zsh -il -c` has none of those.

**Which Phase 33 refusal this collides with, stated precisely.** Phase 33 gave two reasons for
rejecting a login-shell wrapper (`docs/BACKLOG.md:3486-3488`):

> Wrapping launches in a login shell re-runs agent writable rc code on every launch and deepens the
> process tree, which endangers the bare name pkill property and descendant pid matching.

**Only the first half applies to this diff, and a review that leans on the second half is wrong.**
`restore.ts:927-931` already records why: *"Phase 33's other reason, that a login shell deepens the
process tree and endangers the bare name pkill property, does not apply: `zsh -l` execs in place and
adds no process."* My own §1.4 measurement agrees — even the shell tmux interposes for a one-word
command `exec`s in place, and the pane's parent is the server either way. The diff never reaches an
agent argv, and the bare-name property (`src/main/sessions/launch-plan.ts:112,251`,
`src/main/diagnostics/owned-processes.ts:6`) is about the agent's argv[0]. **The half that does bite
is "re-runs agent writable rc code on every launch"**, and the diff extends that to the `-c` shapes
that deliberately did not do it.

**It would not survive the gates.** Reading 3 applied the diff, ran the affected suites and reverted:
three files failed, four tests — `create-path-gate.test.ts`, two in `login-shell.test.ts`, and
`extras.test.ts > round trips through buildLaunchSpec`. I verified the fourth by reading rather than
running, and it is the substantive one, not a literal-string update. `extras.test.ts:191-205` asserts
that `['/bin/zsh', '-l']` recovers and rebuilds to `['/bin/zsh', '-l']`. Under the diff,
`recoverLaunchExtras`'s new three-way match strips index 1, returns `[]`, and `buildLaunchSpec`
rebuilds `['/bin/zsh', '-il']`. **Restarting an existing shell session would silently change what it
runs.** The diff's compatibility skip-list is the best-engineered part of it, and its unstated
consequence is a permanent split: rows made before keep `-l` forever, rows made after get `-il`, and
two shell panes on one machine behave differently.

### Change 2 — the three-way match in `extras.ts`. Decline as written.

It exists only to carry change 1, and it is where the round-trip breaks. The instinct — that a flag
constant which appears in a recorded argv can never be changed without a recovery story — is exactly
right and worth keeping.

### Change 3 — expanding `~` in captured PATH entries. Adapt, do not adopt.

**This one is not already handled, and the readings disagreed about it.** Settled by opening the
file: `src/main/tmux/resolve.ts:638` and `:665` expand `~/` in the **binary argument** only
(`resolveBinaryAgainst`, `resolveBinaryAllAgainst`), and both then do `join(dir, expanded)` over the
raw PATH entries. `extraBinDirs` builds absolute paths from `homedir()` already (`resolve.ts:147-166`).
Nothing anywhere expands a `~` **entry inside a captured PATH string**. The PR's change does, and it
is genuinely new.

Measured, with a scratch `HOME` and a probe binary under `$HOME/bin`, a literal `~/bin` PATH entry:

| lookup | result |
| --- | --- |
| `zsh -f -c` | `command not found` |
| `bash --noprofile --norc -c` | FOUND |
| `/bin/sh -c` | FOUND |
| control, expanded entry, zsh | FOUND |
| Tortie's own `join(dir, bin)` over raw entries | `null` |

So there is a real, narrow gap, on a bash user whose `PATH` carries an unexpanded `~`. Two things
keep it from being the reported bug: the operator's own server PATH has **35 entries, 0 with `~`, 0
relative** (§1.3), and a missing PATH entry produces exit 127 and "command not found", never "only
cached/Codex models". As written it is also incomplete — it expands only the captured group, not
`env['PATH']` or the other groups in the same `mergePathDirs` call, and it does not handle `~user/…`.
**It should be its own small entry with a fixture and a test, not a rider on a login-shell change.**

### A paragraph the operator can paste

> Thank you for this, and thank you for filing the issue rather than just working around it. The
> part everyone gets wrong you got right: you did not try to dump the login environment into the tmux
> server, which would put provider keys where every pane and every process on the machine can read
> them. That restraint is genuinely appreciated.
>
> Two things I owe you in return. First, the title's premise turns out to be the opposite of what is
> happening: I measured the process tree and a session's parent is the private tmux server, whose own
> parent is launchd — Tortie is nowhere in the chain. That is deliberate, and it is why your sessions
> survive a quit, a crash and a reboot. Second, and this is the part that is my fault rather than
> yours: `withLoginShellFlag` is gated to `agent === 'shell'` at both call sites
> (`src/main/manifest/agents.ts:746`, `src/main/restore/restore.ts:950`), so it only affects Tortie's
> plain terminal tabs and never reaches a pi pane. A shell tab is also already interactive — zsh sets
> that itself when stdin is a tty, and I confirmed `$-` contains `i` under plain `-l`. Where `-i`
> does change something is our harness panes, which run `zsh -l -c '…'`: that goes from 68 ms to
> 1714 ms and gets macOS's "Restored session:" banner prepended to stdout. Four existing tests go red
> on the diff, and one of them is real rather than cosmetic — an existing shell session would come
> back running a different command after a restart.
>
> Your third change, expanding `~` inside captured PATH entries, is the one thing in the diff that
> nothing in the tree already does. I am keeping it as its own item. It needs a test and it needs to
> cover `~user` too, and it is unrelated to your model errors — an unexpanded PATH entry gives you
> "command not found", not a provider error.
>
> The actual fix for your case shipped a month ago and I never gave anyone a way to find it, which is
> the real bug your report found. `agents.json` takes a `launch.envPassthrough` list of variable
> NAMES; Tortie reads their values from your login shell at every launch and every restore and hands
> them to that one pane, writing no value to any file. There is a copyable example in your config
> folder — `examples/07-env-passthrough.json` — and it is literally a pi row with a Fireworks key
> name in it. The recipe is in the issue thread. I am also filing the discoverability gap, because
> nothing in the running app mentions any of this and it cost you an afternoon.

---

## 5. The options, ranked

The want underneath the title is *"environment changes without quitting"*. Ranked by value per unit
of risk. "Safe" below means: it does not weaken the durability invariant, does not move a credential
into the server globals or the manifest, and does not create a way for a configuration change alone
to start a process.

**1. Close the discoverability gap (§3). SAFE. Highest value.**
Draw the configuration heading with no file; state the fact that provider keys do not cross into an
agent pane; point at the example that already ships. Touches one renderer component and some copy. It
is the only option here that addresses what actually happened to him. Cost against the refusals:
none — signposting is not a mechanism. Cost against "just enough words": one line and a disclosure,
which is what that rule asks for.

**2. Make `envPassthrough` reachable from Settings. SAFE, with one real design question.**
A control that composes the row and routes it through the existing confirm sheet and hash. Refusal 8
is satisfied because the human still confirms the execution fields at the one surface that gate has.
The question a phase must answer first: **Tortie has never written `agents.json`**, and the shipped
guide says so out loud (`resources/config/README.md`). A writer changes the file's ownership story,
and an agent that can drive Settings is a different threat model from an agent that can only drop a
file. Answer it before building it.

**3. A documented, human-run way to end the session server. SAFE, and mostly already written.**
The copy exists: `TMUX_VERSION_BLOCKED_COPY` at `src/renderer/app/tmux-block-copy.ts:63-88` already
says *"That command ends every session on the old server. Tortie will not run it for you, because
ending a server that holds your work is your decision. Restarting your Mac has the same effect."*,
with a copy button for `tmux -L gmux kill-server` (`src/main/tmux/version.ts:579`). Today it is
reachable only from the version-mismatch refusal. Putting the same block behind a disclosure in
Settings costs almost nothing and Tortie still never runs the command
(`assertVerbAllowedOnSocket`, `resolve.ts:1228`, is untouched). **Be honest about what it buys: very
little.** It refreshes the seventeen launchd names in the frozen server environment and it does not
deliver a provider key, because nothing carries one. It is worth shipping as an answer to *"how do I
get a genuinely clean server"*, not as an answer to issue 20.

**4. Re-probe `PATH` without a restart. SAFE, small, and it answers the title's literal complaint.**
The capture is memoised per process and `resetUserPathCache` is a test hook only
(`resolve.ts:587-592`, `user-path.ts:45-72`). A Settings action, or a re-probe on window focus after
a long idle, would make a changed `PATH` reach new sessions with no quit. The cost is a login-shell
spawn per invocation and a cache-generation bump that anything keyed on `userPathGeneration` must
respect. Not urgent, and it is the only item here that makes the title's sentence stop being true.

**5. Settle the create-versus-restore disagreement (§1.6). SAFE but not free, and it is a
correctness item rather than a feature.** A restored agent inherits `~/.zshrc` and a fresh one does
not. Two directions and neither is obviously right: stop using an interactive holder shell (removes
an environment some people are unknowingly relying on) or give the create the same (Phase 33's
rejected option, with all of §4's costs). The honest answer is probably neither — `envPassthrough` is
the intended path and the holder shell is a by-product of arming the resume as typed text — but a
phase should decide it on purpose rather than leave two paths disagreeing.

**6. Expand `~` and `~user` in every PATH group the capture merges (§4, change 3). SAFE, small,
unrelated to issue 20.** Own entry, fixture, test, and it must cover `env['PATH']` and the fallback
groups, not only the captured one.

**7. REFUSED — inject the login environment into the tmux server globals.** Phase 33, verbatim
(`docs/BACKLOG.md:3480-3483`): *"Injecting the login env into the tmux server globals puts provider
keys where every pane and every same user process can read them, and lets an agent that edits .zshrc
change every session's credentials with no confirm. That is the refusal 8 pattern."* §1.2 measures
why it would work and §1.3 shows the server environment is durable for months, which is the reason it
must not hold a secret. Credit to PR #21 for not doing this.

**8. REFUSED — wrap every agent launch in a login shell.** Phase 33, verbatim: *"re-runs agent
writable rc code on every launch."* The rc file is writable by every agent Tortie runs. §4 measures
the cost on the `-c` shapes.

**9. REFUSED — spawn sessions outside the tmux server, as the title asks.** This is the one that has
to be said plainly and kindly. It would end durability. A session that is a child of Tortie dies when
Tortie dies, and the product exists because it does not. `CLAUDE.md`: *"Sessions live in the PRIVATE
tmux server… The app is a disposable client. Never move durability-critical state into the app."*

---

## 6. What this research does NOT establish

- **Nothing about JnBrymn's machine.** His login shell, where his keys are exported, whether his
  `PATH` carries a literal `~`, his pi version, and what his pi config actually reads are all
  unmeasured. Every measurement here is on the operator's machine or on a scratch server.
- **Whether his failure is an environment-variable problem at all.** His words are *"modifying the
  environment **and config files** for pi"*, and his screenshot shows a model list, not an auth
  refusal. pi reads `~/.pi/agent/auth.json` ahead of the environment, and pi's model list comes from
  its own config under `$PI_CODING_AGENT_DIR` (default `~/.pi/agent`). **If his provider setup lives
  in a non-default config directory, `envPassthrough` cannot carry him there**, because
  `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR` are refused by name
  (`src/shared/agent-overlay.ts:466`) so that conversation capture keeps working. That is a real
  limit of the shipped mechanism and a phase should ask him which case he is in before assuming.
- **No Electron was launched and no app surface was driven.** The confirm sheet's lines, the picker's
  greyed tile and the `env-unresolved` toast are read from source and from their unit tests, not seen.
- **The four red tests under PR #21 are reading 3's measurement, not mine.** I verified the
  substantive one (`extras.test.ts:191-205`) by reading its assertions against the diff, and I did
  not re-apply the diff to this worktree.
- **The `-il` timing numbers are reading 3's**, deliberately not re-run, because `zsh -il` writes
  under the operator's home.
- **The shell-interposition split (§1.4) is measured on tmux 3.6a with `default-shell` of
  `/bin/zsh` only.** Whether it holds on other tmux versions, or when a person's `SHELL` is bash or
  fish, is unmeasured. A phase that wants to depend on it — and §1.4 argues no phase should — must
  measure the matrix.
- **Whether Tortie should become a writer of `agents.json`** is a design question this document
  raises and does not answer.

### Two documentation drifts found, reported and NOT repaired

1. **The probe deadline is 10 seconds, and three places say 3.** `PATH_CAPTURE_TIMEOUT_MS = 10_000`
   at `src/main/tmux/resolve.ts:115`, used by `captureLoginShellEnv` at `:463`. The shipped guide
   says *"It is given 3 seconds"* (`resources/config/README.md:198`), the Phase 33 backlog entry says
   3 seconds twice (`docs/BACKLOG.md:3475`, `:3507`), and the code comment at
   `src/main/sessions/create-local.ts:594` says *"3 second deadline"*. Phase 48 moved the constant and
   the prose did not follow. A person reading the shipped guide is told the wrong number.
2. **`docs/research/41-pi-env-providers.md` §11 has three open items this document closes** — the
   single-word pane command's shell (§1.4), the restored pane's `~/.zshrc` (§1.6), and the packaged
   Finder launch environment, at one remove (§1.3). A phase that touches research 41 should update
   §11 rather than leaving them listed as unmeasured.
