# Research 126 — why the Claude meter tells a signed-in person to sign in

**Read and measured on 2026-09-17 at `50a75b39`**, in the worktree `/private/tmp/wt-p280`. Every line
number below is from that tree. Nothing under `src/` was changed by this research.

**The evidence boundary.** No token was read. No keychain item was opened with `-w` or `-g`. The only
`security` form run was `find-generic-password -s "<service>"`, which prints attributes and never a
payload. No `.credentials.json`, `auth.json` or keychain payload was opened. No network request went to
Anthropic or OpenAI. No claude turn was run. Every shipping reader was driven with presence-only
dependencies: the keychain seam ran the attributes-only form and answered a synthetic payload when the
item existed, and the file seam answered a synthetic payload when `existsSync` said the file was there.
The app logs were parsed with a field whitelist (`ts`, `pid`, `msg`, `provider`, `outcome`, `state`,
`reason`, `kind`). Every throwaway test was deleted in a `finally` or a trap, and
`git status --porcelain src/` was empty afterwards. For §2.4, one claude session process was read for its
start time, its binary path, the NAMES of its environment variables and the value of `GMUX_SESSION_ID`
alone. No other value was printed.

No token byte, token prefix, token length or account id appears in this document. Login names appear
because his own panel draws them.

Four readings fed this document: the credential search, the poll cycle, the status-line tap and Codex as
the control. They disagreed in two places. Both were settled by re-running the measurement, and the
paragraphs that settle them say so. The Phase 280 verifier then drove the shipping code over layouts this
document had not tried. Where its runs changed a conclusion, the paragraph says so and names it.

---

## 1. The answer

**The Claude row says "Sign in with Claude Code to see usage." because Tortie asks the keychain for
`Claude Code-credentials` by service name alone, and on his machine that name now matches two items.**
`security` hands back a stray item whose account attribute is `unknown`, created on 2026-09-10 and never
written since, and that item gives Tortie no usable credential. Claude Code reads a different item under
the same name, addressed by service AND account. His sessions read that one, and they post live numbers.
§2.4 shows the second item exists, from a session that started six days after the stray item.

The panel still names him because the name comes from `~/.claude.json`, not from the credential.

Fixing the lookup removes the sign-in line. It does not make the Claude row as steady as Codex. The
tap's ordering defects (§4.2) still let the number jump backwards, and an `expired` answer still clears
it (§7.3).

Codex does not do this because its credential is one file with one fixed name and one writer. There is
no second item for Tortie to land on.

---

## 2. The hypothesis, refuted

The Phase 280 entry's hypothesis was: the chosen login is the empty directory `162d9e5e3eeec40e`, the
chosen-login branch has no fallback, so the reader answers `missing`.

**Refuted. No Claude login is chosen.** The mechanism the hypothesis describes is real, but it is not the
branch his meter runs.

### 2.1 Which login is chosen

`src/main/logins/store.ts:5-12` and `:64-70` say `logins.json` holds names, ids, dates and one chosen name
per provider, and no path or token. It was opened on that basis. It holds three Claude rows and
`"chosen": {}`:

| Login name | Directory | Created | Chosen |
| --- | --- | --- | --- |
| specstory.com | `240800e63706721c` | 2026-09-02T22:10:29Z | no |
| itavero | `ec0e1e77dd0c3bc4` | 2026-09-03T20:16:44Z | no |
| gregce.gmail | `162d9e5e3eeec40e` | 2026-09-08T00:51:55Z | no |

There is no Codex login. The shipping readers over the real logins root answered:

- `readLoginsFile`: 3 rows, 0 problems.
- `chosenLoginFor(root, 'claude')`: `null`.
- `effectiveLogin(root, 'claude')` (`store.ts:482-487`): `name: null, dir: null, fellBack: false`.

Tortie's own process has no `CLAUDE_CONFIG_DIR`. Neither do the 14 managed claude processes nor the
`-L gmux` server's global environment. So the meter runs the third branch of `readClaudeCredential`: the
plain service name, then `~/.claude/.credentials.json`.

`logins.json` was last written 2026-09-10 13:11 EDT. Every `signed-out` line after that ran the default
branch.

### 2.2 What the reader answered, per login

Shipping `readClaudeCredential` (`src/main/usage/credentials.ts:229-262`), presence-only seams:

| Case | Result | What it consulted, in order |
| --- | --- | --- |
| The effective login (default), what the meter reads | ok | plain item: present |
| No login, `CLAUDE_CONFIG_DIR=~/.claude` | ok | scoped item: absent; plain item: present |
| Login `240800e63706721c` (specstory.com) | ok | its scoped item: present |
| Login `ec0e1e77dd0c3bc4` (itavero) | ok | its scoped item: present |
| Login `162d9e5e3eeec40e` (gregce.gmail) | **missing** | its scoped item: absent; its `.credentials.json`: absent |

Shipping `readCodexCredential` on the default branch answered `ok`: `~/.codex/auth.json` exists.

So the empty directory WOULD answer `missing` if it were chosen. It is not chosen. And a presence check
says the default branch finds an item. The fault is therefore not the search order. It is what the item
the search lands on gives back.

### 2.3 Every place a Claude credential can live, and which branch tries it

| | Location | A: login chosen | B: `CLAUDE_CONFIG_DIR` set in Tortie | C: neither (his case) |
| --- | --- | --- | --- | --- |
| L1 | `Claude Code-credentials`, looked up by service only | — | 2nd | **1st** |
| L1v | the same service AND the vendor's account | never | never | **never** |
| L2 | `Claude Code-credentials-<sha256(dir)[0:8]>` for Tortie's own dir | — | 1st | — |
| L3 | the same scoped name per login directory | 1st | — | — |
| L4 | `<loginDir>/.credentials.json` | 2nd | — | — |
| L5 | `$CLAUDE_CONFIG_DIR/.credentials.json` | — | 3rd | — |
| L6 | `~/.claude/.credentials.json` | — | — | 2nd |
| L7 | `CLAUDE_SECURESTORAGE_CONFIG_DIR`, a vendor override | never | never | never |
| L8 | Tortie's own vault copies | never, by design | never | never |

Branch A skipping L1 is the documented refusal to lie across accounts (`credentials.ts:207-222`), not a
bug. L8 is never read for usage, and rightly: a kept refresh token may already be spent.

**The finding in this table is row L1v.** No branch ever asks for the item the way Claude Code asks for
it.

**Branch B asking L1 second is a defect too.** Claude Code never makes that read. §5 has the vendor
reading and what it costs.

### 2.4 Two items, one name

Claude Code addresses its keychain item by service AND account. Read from the installed binary
(`~/.local/share/claude/versions/2.1.274`, and the same in 2.1.263 to 2.1.274):

- read: `security find-generic-password -a <account> -w -s <service>`
- write: `add-generic-password -U -a <account> -s <service> -X <hex>`
- delete: `delete-generic-password -a <account> -s <service>`
- the account: `process.env.USER || userInfo().username`, and `claude-code-user` when that throws or
  fails `^[a-zA-Z0-9._-]+$`

Tortie addresses the same item by service only, at every call site:

- the meter's read, `src/main/usage/credentials.ts:120`
- the presence check, `src/main/usage/login-accounts.ts:423`
- the observe and lift, `src/main/credentials/security.ts:222-291` via `stores.ts:147` and `:184`
- the write target's account, `stores.ts:285`, `:323` and `:331`
- the keychain backstop, `src/main/credentials/watch.ts:356-357`

Measured on his keychain, attributes only, five times by the credential reading and once more by this
writer: the item `security find-generic-password -s "Claude Code-credentials"` returns has account
`unknown`, and its creation and modification dates are both 2026-09-10T02:44:31Z. Its account is not
the macOS user name (0 matches). No installed Claude Code can write the account `unknown` for this user.

What the stray item holds, and why its `-w` read gives nothing usable, was NOT measured, because that
needs `-w`. It does not give a usable credential, and two readers that never compare notes show it:

- **The meter.** Every Claude poll logged since 2026-09-10T21:01:45Z answered `signed-out`.
- **The observe.** Tortie's vault copy of the default store, `claude.default`, was last written
  2026-09-09T20:46:11Z, about six hours before the stray item appeared. Claude Code rewrites its own item
  as tokens refresh, and the observe copies any change. The copy has not moved in seven days.

**That Claude Code's own `(service, $USER)` item exists and works is a deduction from one process.** The
Phase 280 verifier traced it, and this fix round re-ran the checks, reading variable names only:

- The tap stamp `21a49ef3…` was written at 2026-09-17T00:28:02Z. The stamp is named after the pane's
  `GMUX_SESSION_ID` (`statusline.ts:298-304`).
- The process carrying that `GMUX_SESSION_ID` is pid 48329, Claude Code 2.1.273. It started at
  2026-09-16T23:26:09Z, six days after the stray item appeared.
- Its startup environment has no `CLAUDE_*` variable, and no variable naming a token or an API key.
- `~/.claude/.credentials.json` does not exist.
- The tap's shell guard (`src/main/usage/statusline.ts:291-294`) writes no stamp without `rate_limits`.
  A new process has `rate_limits` only after its own API call succeeds.
- Claude Code 2.1.273 and 2.1.274 read the credential only as `find-generic-password -a <account> -w -s
  <service>`. No read leaves out `-a`. The one service-only `find-generic-password -s` string in the
  2.1.273 bundle is help text for a credential helper.

So that process found a working item at (`Claude Code-credentials`, `$USER`). The service-only lookup
lands on account `unknown` every time: five times in the credential reading, once more by this writer
and three times by the verifier. So two items share the name. §7.2 proof step 1 stays as a check to run
before building.

Tortie did not write the stray item. Tortie's writes take the account from the matched item, then from
the user name (`src/main/credentials/index.ts:148`), and the harness uses `harness`. No path writes
`unknown`. Who wrote it is not established (§9).

### 2.5 The log, and the first disagreement settled

The readings disagreed about when `signed-out` began. The tap reading said 2026-09-06T16:09Z "ever
since". The others said after 2026-09-07. The whitelisted parse of `app.log.1` and `app.log` settles it:

| When | Process | Outcome |
| --- | --- | --- |
| 2026-09-04T12:40Z and 12:41Z | 49332 | expired, expired |
| 2026-09-06T16:07:40Z | 905 | expired |
| 2026-09-06T16:09Z and 16:24Z | 905 | signed-out, signed-out |
| 2026-09-07T02:39:15Z | 18793 | expired |
| 2026-09-07T15:12Z to 2026-09-10T21:01Z | — | no long-running app process wrote a log |
| 2026-09-10T02:44:31Z | — | the stray item is created |
| 2026-09-10T21:01:45Z to 2026-09-16T20:59:14Z | 9 processes | 69 × signed-out, nothing else |

So the tap reading was wrong: an `expired` answer on 2026-09-07 shows a read that found a token after the
09-06 pair. The two `signed-out` answers on 2026-09-06 are unexplained. The other disagreement was a
count: "7 launches" against "9 processes". Nine processes logged a Claude failure after the gap.

Across the whole log (2026-08-15 to 2026-09-16) there are 71 Claude `signed-out`, 4 Claude `expired` and
**0 Codex failures of any kind.**

The gap matters. The log cannot say whether reads succeeded between 2026-09-07 and 2026-09-10. It can
say that every long-running process after the stray item appeared answered `signed-out`, and that the
last one before it found a token.

### 2.6 Why one card names him and says he is signed out

The two lines come from two readers that ask different questions of the same login.

- **The name.** `UsageMeter.tsx:187` calls `usageLoginLine` (`usage-copy.ts:70`) with the email from
  `loginEmailOf` (`UsageMeter.tsx:273`). That email comes from `logins:list` → `wholeList`
  (`src/main/logins/ipc.ts:345`) → `loginFacts` (`login-accounts.ts:512`) → `readLoginAccount`, which
  reads `oauthAccount.emailAddress` from `~/.claude.json`. Presence (`login-accounts.ts:378-390`) only
  asks whether an item with the service name exists, and the stray item does.
- **The sentence.** `src/main/usage/ipc.ts:106` → `effectiveLogin` → `fetchProvider`
  (`service.ts:339`) → `readClaudeCredential`, which needs `claudeAiOauth.accessToken` out of the payload.
  `missing` becomes `signed-out` at `service.ts:350`, which draws `usage-copy.ts:104`.

Measured with both readers on the same default item: presence answered `true`, the credential answered
`missing` when the payload did not parse.

### 2.7 Expired or missing

He is not silently expired while being told he is signed out.

- `CredentialResult` has no expired kind (`credentials.ts:33-45`). The reader never looks at `expiresAt`
  (`:15-17` calls it advisory).
- Expiry is decided only by the server: 401 or 403 becomes `expired` (`service.ts:305`), which draws "Run
  Claude Code to refresh the login."
- Measured with a fake transport: a past `expiresAt` reads `ok`, a 401 reads `expired`, a missing
  credential reads `signed-out`.

Two real caveats. First, `keychainReader` turns every failure into `null` (`credentials.ts:127-131`): a
non-zero exit, a spawn error, the 5 s deadline and a cancel. Measured: an exit 51 and a deadline at
5003 ms both drew the sign-in sentence. That breaks the file's own rule, "A SIGN IN LINE ONLY ON A
CONFIRMED SIGN OUT" (`service.ts:16-18`), and sends a person to the wrong remedy. `security` exits 44 for
an item that does not exist, so a miss can be told apart from a failure. Second, the meter's reader
returns raw stdout, while the credentials domain decodes a hex printing (`security.ts:209-219`). Measured:
a payload containing a newline printed as hex reads `missing` in the meter and reads correctly in the
credentials domain.

---

## 3. The cycle

### 3.1 The rules that make it

- **The poll.** The renderer ticks every 60 s and asks only when the window is visible, focused, and 15
  minutes have passed since this window last asked (`src/renderer/state/usage.ts:117-120`, `:157`). Focus
  and visibility changes call the same tick (`:158-159`). Main keeps its own 15 minute floor
  (`service.ts:69`, `:446-447`).
- **The tap holds the poll off for 5 minutes** after the last applied post (`service.ts:81`,
  `:439-445`). The refresh control is never held off and has a 60 s floor (`service.ts:447`). At compact
  and mini density the whole meter is that control.
- **There is no retry or backoff.** A failure stamps `lastAttemptAt`, and the next try is the ordinary
  15 minutes.
- **The last writer wins, and a `signed-out` writer erases.** A tap post sets state `ok`
  (`service.ts:539-547`). A `signed-out` poll clears the numbers, the plan word and `readAt`
  (`service.ts:397-404`). A signed-out poll sends no request (`service.ts:350`), so holding it off saves
  no budget. It only delays the wipe.

Each rule was written on purpose. Their interaction was not. The suppression comment at
`service.ts:434-438` assumes the poll "has nothing to add". Nothing anywhere considers a failed credential
read erasing a number that a session of the same account posted minutes earlier.

### 3.2 What a person sees, step by step

Reproduced without the network: the shipping service behind the shipping renderer store, an injected
clock, a fake transport, a presence-only keychain, synthetic numbers. The keychain child exited non-zero
through the shipping `keychainReader`. That ends in the same `missing` answer the stray item gives,
whichever of its possible causes (§8.2) is the real one.

| Time | What happened | Face | Hover card |
| --- | --- | --- | --- |
| 0:00 | app starts, poll | Claude icon, no bar | Login: <his address> / Sign in with Claude Code to see usage. |
| 5:00 | a turn; the tap posts | 33% bar, "33% 5h · 58% wk" | the two windows with their resets, no plan word |
| 15:00 | the renderer asks; the tap is 9 min old, so the poll runs | no bar | the sign-in sentence again |
| 28:00 to 32:00 | turns; posts every 15 s | numbers | numbers |
| 30:00 | ask held off, last post under 5 min old | numbers | numbers |
| 45:00 | next ask, poll runs | no bar | sign-in sentence |
| 50:00 | one post | numbers | numbers |
| 50:30 | he clicks the meter | no bar | sign-in sentence |
| 72:00 | window unfocused; a post | numbers | numbers |
| 88:10 | focus returns | no bar | sign-in sentence |

A tap's number stays up for 10 minutes after one turn, 17 minutes after a run of turns, 30 seconds if he
clicks, and until the window is next focused if it is not. Codex read `88% wk` and "Pro plan" at every
step.

The same timeline with a credential the reader could use never flipped. Claude stayed `ok`, polls and
taps took turns writing numbers, and no sign-in line was drawn. Taking turns is where the §4.2 defects
show: the last writer wins, whichever reading is newer.

His real log fits this. Of 63 gaps between failures in one process, 21 are 14 to 17 minutes, which is the
focused cadence plus the tick. Six are under 14 minutes, which only the refresh control, a login choice or
a switch flip can cause.

### 3.3 Why /usage makes it "update and reset"

The "reset" half is measured: it is the next poll erasing the tap's number, 5 to 20 minutes after the
last post, or at once on a click.

The "update" half was not measured, because no claude turn could be run. Typing `/usage` in a session
changes that session's state, Claude Code re-runs its status line on such changes, and the re-run posts
the session's held `rate_limits`. That is the tap working. The `/usage` dialog also fetches usage with
`refreshOAuth: true`, which can rewrite Claude Code's own keychain item. On this machine that cannot help
the meter, because Tortie never reads that item.

---

## 4. The operator's diagnosis, tested

He believes the status-line approach may need to change.

**Partly right.** He is wrong about the sign-in line, and right that the tap makes the row unsteady.

- **The sign-in line.** The tap did not cause it. The poll's credential read is the whole cause, and
  Phase 281 does not need to touch the tap to remove it. Today the tap is the only thing that puts
  numbers on his Claude row.
- **The number that "updates and resets".** Today that is mostly the poll wiping the tap's number
  (§3.2). After 281 the poll works, and the tap's ordering defects (§4.2) are what move the number. An
  idle session's older reading replaces a newer one and then holds the poll off for five minutes. A poll
  sent before a tap overwrites the tap when it lands. **So 281 alone will not make the Claude row as
  steady as Codex.** The ordering defects need their own phase (§7.3).

The evidence that the tap works on his machine:

- **It is installed.** 26 of 27 per-session settings files name `statusLine`, including all 14 live
  claude sessions. The one without it is from 2026-08-15, before Phase 182.
- **It passes the account rule** (`service.ts:519`). No managed claude process, no tmux session and no
  Tortie process has `CLAUDE_CONFIG_DIR`, and nothing is chosen, so both sides are the default.
- **It is sending.** Stamps were written after the current app started: 2026-09-16T23:26Z,
  2026-09-17T00:28Z and 2026-09-17T03:14Z.
- **It is not refused.** Across the whole log there is one `usage.tap.dropped`, reason `account`, on
  2026-09-04.

The control that proves the poll alone is enough: with a credential the reader can use and no tap at
all, the shipping service kept the Claude row `ok` with its plan word for 120 minutes, from 9 requests.
That is how Codex works.

A tap-only design cannot replace the poll. Claude Code only learns its usage numbers from API response
headers, so an idle session has nothing new to say. With no Tortie claude session running, after a
reboot, or when a person owns their status line (`src/main/activity/hooks.ts:783-786`), the tap says
nothing at all.

### 4.1 Why Codex is stable

Codex's failure policy is identical. Driven through the shipping service: a credential failure clears the
numbers for both providers, and a network failure keeps them under the stale glyph for both.

What differs is how exposed the read is:

| | Claude | Codex |
| --- | --- | --- |
| Store | keychain item, read by spawning `security -w` with a 5 s deadline | a 0600 file, read in-process |
| Name | derived, and must match the vendor's naming and account | fixed, `auth.json` |
| Writers of that name on this machine | Claude Code, the stray writer, and Tortie's lift | the Codex CLI |
| Failures that read as `missing` | no item, wrong item, spawn error, exit, deadline, bad shape | no file, bad shape |

`~/.codex/auth.json` was last written 2026-09-13 by the Codex CLI, and its bearer was accepted until at
least 2026-09-16. No Tortie switch can have written it: there is no Codex login row, no Codex vault slot
and no pending file.

Codex having no tap is incidental. The missing fallback in the chosen-login branch is incidental too:
both readers lack one identically, and no login is chosen.

### 4.2 The tap's own defects

None of these caused the sign-in line. All of them are still there after 281, and the first two are
what will move his number once the poll works. They are separate work (§7.3).

- **An older reading can overwrite a newer one.** A post carries no observation time. An idle session
  re-sends its last reading when its status line re-runs, for example on Claude Code's reset timer
  (reset time plus 1,000 ms). `applyTap` treats that as fresh. Measured: a busy session's 55% weekly was
  replaced by an idle session's 30%. On his machine, 16 of 22 last posts land one second after a
  ten-minute mark, four sessions in the same second, which is that timer and not human turns. The
  verifier drove it with a usable credential, which is the state after 281. The poll drew 58% weekly and
  a busy tap drew 59%. Then an idle re-post of 30% was applied and drawn. A read at 7.9 minutes still
  drew 30% and sent no request, because the tap holds the poll off (`service.ts:81`, `:439-445`). The
  poll at 15 minutes drew 58% again.
- **A poll sent before a tap overwrites it.** `run` sends the request (`service.ts:633-650`), and
  `applyOutcome` (`:387-395`) writes the poll's numbers without asking whether a tap landed after the
  request went out. The verifier drove it: a tap posted 61% while a read was in flight and the face drew
  61%, then the read came back with 58% and the face drew 58%.
- **A passed five-hour window is kept.** After a reset, idle sessions post the weekly window only, and
  `service.ts:540` keeps the old five-hour value. Measured: 97% stayed up with a reset time already
  passed.
- **Losses are silent.** The stamp is written before the post (`statusline.ts:357`), so a post that
  fails still costs the 15 s throttle and nothing retries. A changed number inside the throttle is
  dropped. Nothing logs either loss.
- **No plan word.** A tap carries no plan, and a `signed-out` poll has already cleared it.

---

## 5. The fallback, argued both ways

The question: when a chosen login's own store is empty, should the reader fall back to the plain item?

**For.** It would turn a blank into a number.

**Branch B's fallback is not precedent. It is the same lie, and it is live code.** When Tortie's own
process has `CLAUDE_CONFIG_DIR` set, `readClaudeCredential` asks the scoped item and then the plain item
(`credentials.ts:237-238`). `claudeServicesFor` does the same for presence, the observe and the write
account (`login-accounts.ts:140-142`). Claude Code never makes that read. In 2.1.274 the service name is
`mI` (near byte offset 170928463):

- `CLAUDE_SECURESTORAGE_CONFIG_DIR` defined and empty: the plain name.
- `CLAUDE_SECURESTORAGE_CONFIG_DIR` defined and not empty: the scoped name of its NFC form.
- Otherwise, `CLAUDE_CONFIG_DIR` not empty: the scoped name of `(CLAUDE_CONFIG_DIR).normalize("NFC")`
  (`we`, near offset 169220682), and nothing else.
- Otherwise: the plain name.

The keychain store's read, write and delete and its startup read all use `mI(Bee)`, where `Bee` is
`"-credentials"`, and all pass `-a`. Their only fallback is the plaintext file. None of them falls back
to the plain name. 2.1.273 has the same rule. So the vendor's code refutes the caveat at
`credentials.ts:73-79`. That caveat called the scoped form unmeasured and tries the plain name as well
whenever `CLAUDE_CONFIG_DIR` is set.

What branch B costs was driven by the verifier with the shipping code, over a keychain addressed by
service and user. Tortie ran with `CLAUDE_CONFIG_DIR=D`. `D/.claude.json` named account Y. D had no
scoped item. The plain item held account X. The reader asked scoped(D), then plain, and answered `ok`
with X's token. The card drew X's plan word and X's weekly number. `readLoginAccount` read Y from
`D/.claude.json`, the file `claudeAccountFileFor` names (`login-accounts.ts:169-171`). So the card said
`Login: <Y's address>` (`usage-copy.ts:74`). A tap from a Y session under D was applied beside it.
One card showed X's numbers and Y's numbers in turn, under Y's name. Phase 281 removes that fallback (§7.2).

**Against, with evidence.**

1. **It would not fix his symptom.** No login is chosen. The default branch already reads the plain item.
2. **The plain item holds different accounts over time, by design and in practice.** The gregce.gmail
   login exists because the account in the default store changed on 2026-09-08. Phase 211's default lift
   writes the chosen account into the plain item whenever a default-login session runs. A fallback would
   draw whichever account was written last, under the chosen login's name. That is exactly the lie
   `credentials.ts:207-222` removed.
3. **It would split the launch from the meter.** `store.ts:435-438` says one resolver serves both. New
   sessions under the chosen login would launch signed out while the meter described another account.

**Is there a way to verify an account before showing its numbers?**

- **For Claude, not from anything Tortie reads today.** The credential payload carries tokens, expiry
  times, scopes, `subscriptionType` and `rateLimitTier`. None identifies the account, and a plan word is
  shared by many accounts. The usage body carries windows and limits only. An organisation id arrives as
  a response header the transport does not expose, and an organisation is not an account. The account
  identity lives in `.claude.json`, a different file with a different writer that a Tortie switch never
  writes, so the two can disagree straight after a switch. The only check tied to the credential bytes
  is the digest in `kept.json`. It proves the same bytes, not the same account, and it stops matching at
  the next token rotation.
- **For Codex, yes.** `tokens.account_id` and the email claim sit in the same bytes as the bearer.

**Recommendation: keep the refusal.** A fallback cannot be checked for Claude, it cannot fix what he
sees, and a wrong answer about whose numbers these are is worse than a blank.

---

## 6. How the empty login directory came to exist

`162d9e5e3eeec40e` (gregce.gmail) was minted by Tortie's observe. Nobody added it by hand.

- `mintPromotion` (`src/main/credentials/keep.ts:781-822`) calls `addLogin`
  (`src/main/logins/store.ts:507-564`). That creates an empty 0700 directory (`:556-557`) and puts the
  outgoing account only into Tortie's vault slot (`keep.ts:801-802`).
- The name is the shape `loginNameFromEmail` gives (`src/shared/logins.ts:143-165`).
- `kept.json` records the slot `claude.162d9e5e3eeec40e` with `from: claude.default` (slot keys and
  provenance only were read).
- The row's `createdAt`, the vault item's creation date and the directory's birth time all read
  2026-09-08T00:51:55Z, to the second. The directory's birth, change and modification times are equal, so
  nothing was ever created or removed inside it. No session ran under it and no lift took its lock.

So on 2026-09-08 the account in his default Claude store changed. The observe kept the outgoing account
as a login he could switch back to. Its vendor store stays empty until he chooses it, and then
`activateLogin` writes it (`keep.ts:1353-1362`). `keep.ts:398-402` says a promoted login draws exactly
this row until it is chosen.

**The empty directory is not its own defect.** It is the design. It played no part in his screenshot.

**But the stray item makes choosing it unsafe on this machine.** This document derived it from the code
and the measured attribute, and the verifier then drove it (§8.10). `storeTarget`
(`stores.ts:280-287`) takes the scoped item's existing account, and there is none, so it falls to `ownAccountName` (`:329-335`). That returns the
account of whatever the plain service name matches, which is now `unknown`. Choosing gregce.gmail would
write its scoped item under the account `unknown`. Claude Code reads with the user name and would not find
it, so sessions under that login would start signed out. The same fault reaches the default store:
`defaultStoreTarget` (`:311-326`) would write a switch into the stray item, which no Claude session reads,
and the keychain backstop (`watch.ts:351-363`) watches the stray item's modification date, which never
moves.

So the fault is wider than the meter. Since 2026-09-10, Tortie's Claude login switching on this machine
reads and would write the wrong item too.

---

## 7. The repair

### 7.1 Is there one obvious fix?

**Yes, with one measurement before building.** Name and address Claude Code's keychain item exactly
the way Claude Code does: its service name rule, and service AND account, at every call site in both
domains. Let only a confirmed miss draw the sign-in sentence.

It needs no decision about accounts. It keeps every existing refusal and adds one: when `CLAUDE_CONFIG_DIR`
is set, nothing falls back to the plain name, because Claude Code never reads it then (§5). It does not
touch the tap, so on its own it will not make the Claude row as steady as Codex (§4). If the measurement
in §8.1 does not show Claude Code's own item, stop: this document's cause is wrong.

### 7.2 Phase 281, as it should be queued

**Phase 281 — the Claude meter reads the item Claude Code reads (operator reported, 2026-09-16)**

- **Subject.** `fix(credentials): address Claude's keychain item by service and account`
- **First body line.** `Phase 281: the Claude meter reads the item Claude Code reads`
- **Semver.** Patch.
- **Tier 3.** It reads and writes the person's credential store, and he reported it, so the parent
  commit measurement is mandatory.
- **Charter.** This document, and the Phase 280 entry's screenshot.

**The rule.** Tortie reads the item Claude Code reads, and only that item. Two small functions copy the
vendor, and every call site uses them:

- **The account** (`Cv` in 2.1.274): `env.USER || userInfo().username`, and `claude-code-user` when that
  throws or fails `^[a-zA-Z0-9._-]+$`. Every `security` call aimed at a Claude Code vendor service
  (`Claude Code-credentials` and every `Claude Code-credentials-<hash>`) carries `-a <account>`.
- **The service name** (`mI`, §5). For the default login: `CLAUDE_SECURESTORAGE_CONFIG_DIR` defined and
  empty means the plain name, and defined and not empty means the scoped name of its NFC form. Otherwise
  a non-empty `CLAUDE_CONFIG_DIR` means the scoped name of its NFC form and NOTHING ELSE. Otherwise it is
  the plain name. A login directory's name hashes the directory's NFC form. `claudeScopedService`
  normalizes to NFC before hashing.

**The files.**

1. `src/main/usage/credentials.ts`. Add the account function and the service name function beside
   `claudeScopedService` (`:80-83`), which both domains already import. Pass `-a` in `keychainReader`
   (`:120`). Decode the output with `decodeKeychainPayload` (`src/main/credentials/security.ts:209-219`)
   instead of raw stdout. That helper exists, so do not write another.
2. **No plain fallback when `CLAUDE_CONFIG_DIR` is set.** `readClaudeCredential` (`credentials.ts:237-238`)
   and `claudeServicesFor` (`src/main/usage/login-accounts.ts:140-142`) answer the one name the vendor
   rule gives. Rewrite the caveat at `credentials.ts:73-79`, which the vendor reading refutes, and the
   branch description at `:211-213`.
3. **A miss is not a failure.** The keychain seam answers three ways: found, absent (`security` exit 44),
   and unreadable (any other exit, a spawn error, the deadline). `readClaudeCredential` returns `missing`
   only when every store it tried was absent. An unreadable store surfaces as `unavailable`.
   `fetchProvider` already maps a thrown read to `unavailable` (`service.ts:345-349`), so the stale policy
   keeps the last numbers under the glyph.
4. `src/main/usage/login-accounts.ts:423`. The presence check passes `-a`.
5. `src/main/credentials/security.ts`. `keychainRead`, `keychainAccount`, `keychainModified`,
   `keychainHasItem` and `keychainDelete` (`:222-335`) take the account for vendor services.
   `keychainWrite` already does.
6. `src/main/credentials/stores.ts`. `readStore` (`:147`, `:184`), `keychainTarget` (`:243-254`),
   `storeTarget` (`:285`), `defaultStoreTarget` (`:323`) and the forget path (`:369-371`) address by the
   vendor account. `ownAccountName` (`:329-335`) stops copying whatever item the service name matched and
   answers the vendor rule. Rewrite the comments at `:280-284` and `:317-321`, which describe the old
   behaviour.
7. `src/main/credentials/watch.ts:351-363`. The backstop fingerprints the vendor-account item.

Tortie's own vault items (`src/main/credentials/vault.ts:160-169`) are not vendor items and stay as they
are.

**The refusals it must carry.**

- No service-only lookup of a vendor item survives, and there is no fallback to one when the
  account-qualified lookup misses. A fallback brings the stray item straight back.
- Tortie never reads the payload of, rewrites or deletes a vendor-named item whose account is not the
  vendor rule's. The stray item on his machine is left exactly as it is.
- A chosen login still never falls back to the plain item (`credentials.ts:207-222`).
- **No plain fallback when `CLAUDE_CONFIG_DIR` is set in Tortie's process.** No reader, presence check,
  observe or write target asks the plain name after the scoped one. A fixture row pins it: Tortie with
  `CLAUDE_CONFIG_DIR=D`, no scoped item for D, and a plain item holding another account answers
  `missing`, never `ok`. A Claude Code session under D would find nothing either, so the sign-in line is
  the honest answer.
- No `-w` or `-g` in any presence or attribute call. No token byte, prefix or length in any log, test
  output or commit body. No account attribute is logged.
- The first observe after the fix must not mint a promotion when the account in `.claude.json` has not
  changed, even though the item it now reads holds bytes seven days newer than the vault copy.
- The scratch keychain in the proof is never added to the person's keychain search list.

**The proof, run rather than read.**

1. **Before building, on his machine and with his approval:**
   `security find-generic-password -a "$USER" -s "Claude Code-credentials"`, attributes only, reading
   the exit status and `mdat`. Expect exit 0 and a date after 2026-09-10. Exit 44 stops the phase.
2. **A hostile fixture, the independent method.** A scratch keychain under `/private/tmp` made with
   `security create-keychain`, holding two items under `Claude Code-credentials` with synthetic payloads,
   one under the vendor account and one under `unknown`, and a scoped pair built the same way. Drive the
   shipping readers and the credentials domain's runner over it through their existing seams. At the
   parent, record which item the service-only read lands on, and arrange the fixture so it lands on the
   stray. At HEAD, every reader and writer lands on the vendor-account item. Add the branch B row: with
   `CLAUDE_CONFIG_DIR=D`, no scoped item for D and a plain item for another account, the parent answers
   `ok` and HEAD answers `missing`. Add a directory whose name is not in NFC form, and check that its
   scoped name matches the vendor's. Delete the scratch keychain in a `finally`.
3. **A gate rule** in `conformance:credentials` and `conformance:logins`: every `find-`, `add-` and
   `delete-generic-password` argv aimed at a vendor service carries `-a`. Read it from source over every
   call site, and pin the call-site count so a new site cannot skip it. A second rule: no service list
   names the plain name after a scoped one. Ablate `-a` at each site: the gate goes red and the fixture
   reads the stray. Put back the branch B fallback: the gate goes red and the branch B row answers `ok`.
4. **The miss and failure split.** The shipping `keychainReader` over children exiting 44, 36 and 1,
   one that cannot spawn and one that never answers. Only 44 draws "Sign in with Claude Code to see
   usage.". The others keep a tap's numbers under the stale glyph. Exit 36 is the keychain refusing
   interaction, such as when it is locked. Claude Code's own read treats 36 as absent. Tortie should not,
   because a locked keychain is not a sign-out, and the brief says this is a deliberate difference.
5. **The observe and the switch over the fixture.** A switch writes the vendor-account item and never the
   stray. The first observe after the fix mints no promotion.
6. **The parent commit, on real data, with his approval.** One app run at the parent and one at HEAD,
   never at once, Claude switch on, two polls apart. The parent logs `usage.read.failed claude
   signed-out`. HEAD logs no `signed-out`. Just before each run, he runs one turn in a default-login
   claude session, so Claude Code's item holds a fresh token. Without that turn, HEAD can still log
   `expired` when every session has been idle long enough for the token to lapse (§7.3), and that is not
   this phase's defect. After the turn, an `expired` at HEAD fails the step. Successes are not logged
   (`service.ts:651` logs only other outcomes), so the pass also reads the row's state and plan word from
   the app at each poll. This run sends his token to the usage endpoint, which is the product's ordinary
   poll, and the brief must say so.
7. **The gates.** `conformance:credentials`, `conformance:logins`, and the unit suites under
   `src/main/usage` and `src/main/credentials`.

**What is NOT in this phase.**

- No change to the status-line tap, its script, its stamp, its throttle, or the precedence between the
  tap and the poll.
- No cross-account fallback and no account check before drawing numbers.
- No deletion, repair or migration of the stray item, and no surface that tells a person about it.
- `CLAUDE_SECURESTORAGE_CONFIG_DIR` changes only the default login's service name, because the name rule
  copies the vendor's whole. The storage lock it also moves stays the limit `locks.ts:59-62` states. A
  chosen login under that variable is not handled: Claude Code gives every login the plain item when the
  variable is empty and the variable's own scoped item when it is set (corrected by Phase 281.1; "the
  one name" stood here before, wrong for the empty case, and `build/p281/SPEC.md` §8.2 pins the class).
- No change to Tortie's vault item addressing, and no change to Codex.
- Not the Codex observe refusal: `logins.observe provider=codex kind=refused` is logged 2,329 times
  between 2026-09-04 and 2026-09-16. That is its own entry.

### 7.3 What only the operator decides, and none of it blocks 281

1. **The stray item.** He can find its writer without seeing the secret. Open Keychain Access, search for
   `Claude Code-credentials`, open the row whose Account reads `unknown`, and read its Access Control tab,
   which lists the apps allowed to read it. Whether to delete it is his call. Another tool may depend on
   it. After 281, Tortie reads neither way.
2. **Whether a fresh tap should outlive a cleared row.** A tap that passed the account rule is evidence
   a working credential exists. Decide this after 281 lands and the cycle is watched. 281 removes the
   known route to `signed-out`. It leaves two routes to a cleared row:
   - **`signed-out` from an unknown cause.** The two answers on 2026-09-06 came before the stray item
     existed (§2.5, §8.8), and 281 does not explain them.
   - **`expired`.** A 401 or 403 clears the numbers too (`service.ts:405-413`) and draws "Run Claude Code
     to refresh the login.". The log holds four, all before the stray item existed: pid 49332 at
     2026-09-04T12:40Z and 12:41Z, pid 905 at 2026-09-06T16:07:40Z and pid 18793 at
     2026-09-07T02:39:15Z. The likely cause is a token no session had refreshed because every session
     was idle. That cause was not measured.

   Successes are never logged (`service.ts:651`), so the log shows every failure but not every poll.
   Watch for both routes before deciding.
3. **The tap follow-up, recommended.** Queue the ordering defects in §4.2 as the phase after 281. They
   did not cause the sign-in line, but 281 alone will not make the Claude row as steady as Codex. A post
   carries no observation time, so an idle session's older reading replaces a newer one. A poll sent
   before a tap overwrites it. What that phase should change, the ordering or the tap's role, is its own
   research. It is also the honest test of his belief that the status-line approach may need to change.

---

## 8. Limits

What this document did not establish, and what would establish it.

1. **Claude Code's own `(service, $USER)` item was not looked up directly.** The brief allowed only the
   service-only form. §2.4 deduces it from one session process: it started after the stray item, had no
   config directory, no token variable and no plaintext file, and posted `rate_limits`. The
   attributes-only `-a` form in §7.2 proof step 1 confirms it before building.
2. **What the stray item holds, and why its read gives nothing usable, was not measured.** The candidates
   are an access list that does not trust `/usr/bin/security` (a non-zero exit), a payload that is not the
   `claudeAiOauth` shape, or a hex printing. This does not change the fix, because the fix stops reading
   it. It does decide whether the miss and failure split alone would have changed his sentence. Only a
   `-w` read establishes it, and that stays refused.
3. **Who wrote the stray item is not established.** Tortie's code has no path that writes the account
   `unknown`. CodexBar 0.26.1 is installed, reads `Claude Code-credentials` and links the keychain write
   APIs. It was installed on 2026-05-15, months before the item, which neither proves nor clears it. The
   Access Control tab in §7.3 would establish it.
4. **Which of two same-named items `security` returns is undocumented.** Before 2026-09-10 the
   service-only read found a token. It may find something else after any change to the keychain. The fix
   makes the order irrelevant. The Phase 281 keychain verifier later measured the order on a scratch
   keychain (2026-09-17): a service-only lookup answered in creation order, and an
   `add-generic-password -U` of an existing item kept one item but moved it behind every other item of the
   same service name. That fits his machine: every Claude Code refresh is an `add -U` of its own item, so
   each one put it back behind the stray.
5. **The real cycle was not watched in his app.** It was reproduced with the shipping service and store
   under an injected clock. The Phase 280 entry asked for a long app run. That would be one Electron on
   his real profile for at least 95 minutes, with a session producing turns and then going quiet, reading
   the panel at each step. It was not done, because it would read his real keychain through the shipping
   default dependencies.
6. **The blank state was not reproduced through the Electron bridge.** It was reproduced at the service
   and renderer store level.
7. **The "update" half of "update and reset" was not measured**, because no claude turn was allowed.
8. **The two `signed-out` answers on 2026-09-06 are unexplained.** The stray item did not exist yet. They
   are a second route to the sign-in line, and 281 does not fix it.
9. **The log has a gap** from 2026-09-07T15:12Z to 2026-09-10T21:01Z with no long-running logging
   process, and the running dev build (`npm run dev`, started 2026-09-16T21:00Z) writes no file log. So
   nothing says whether reads succeeded between 2026-09-07 and the stray item's creation, and there is no
   log evidence after 2026-09-16T21:00Z.
10. **The write-side consequences in §6 were driven over a model, not a real keychain.** The verifier
    drove the shipping `storeTarget` and `defaultStoreTarget` with a fake runner whose service-only
    lookup matches `unknown` first. `storeTarget` for `162d9e5e3eeec40e` committed `add -U -a "unknown"`
    to that directory's scoped name. `defaultStoreTarget` committed `add -U -a "unknown"` to the plain
    name, which updates the stray item and not Claude Code's. Proof step 5 drives them over a real scratch
    keychain.
11. **What Claude's endpoint answers to a refused token is still unmeasured** (`service.ts:287-298`). A
    refused token may arrive as 429 and draw old numbers for a day instead of `expired`.
12. **Vendor coverage.** The keychain addressing was read from installed Claude Code 2.1.263 to 2.1.274.
    The service name rule `mI`, its NFC step and the absence of any plain-name read under
    `CLAUDE_CONFIG_DIR` were read from 2.1.273 and 2.1.274. Older or newer versions were not read.
