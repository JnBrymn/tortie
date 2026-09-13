# opencode as a supported CLI

Date: 13 September 2026. Author: measured on the operator's machine at his request; he installed
opencode and authed it so the CLI could be driven.

The operator asked for opencode to be integrated as another supported terminal CLI, "in a first
class way", with its source at `/Users/gdc/opencode` and the install command
`curl -fsSL https://opencode.ai/install | bash`. This document is the measurement the phase inherits
so it does not re-derive. Everything below was read from the installed binary (1.18.30), a READ-ONLY
copy of its session database, and its source checkout — never by guessing.

## What opencode is, and why it is not just a fourteenth row

opencode is a terminal coding agent, like the fourteen already in `src/main/agents/registry.ts`. The
launch and resume surfaces are ordinary. **Two things are not, and they are the whole phase:**

1. **Sessions live in ONE SQLite database, not in per-session files.** Every agent the registry
   currently harvests writes a file — a `.jsonl` or a `.json` per session — and the harvest layer
   under `src/main/manifest/harvest/` reads files. opencode writes rows in
   `~/.local/share/opencode/opencode.db`. `storeDirs` and the harvest reader both assume a directory
   of files, and neither can read a row. This is the architectural heart of the work.
2. **The bundled specstory (2.8.0) does not know opencode.** `specstory --help` lists antigravity,
   claude, codex, copilotide, cursor, cursoride, deepseek, droid, gemini and muse — not opencode. So
   capture is OFF for opencode until specstory ships a provider, and that is a stated limit rather
   than a thing to work around. The registry's `specstory` field must say `provider: null` /
   unsupported, exactly as an honest row should.

## The binary and the install

- `~/.opencode/bin/opencode`, version `1.18.30`. `--version` prints the bare version (no ANSI to
  strip on this build; confirm `versionProbe` on the shipped build).
- Canonical install, given by the operator and confirmed against
  `/Users/gdc/opencode/install`: `curl -fsSL https://opencode.ai/install | bash`. Alternates the
  source advertises: npm (`opencode-ai`), Homebrew, and the upgrade subcommand `opencode upgrade`.
  The install field is DISPLAY AND CLIPBOARD ONLY, like every other row — Tortie never runs it.
- `canonicalIsPackageManager: false` (it is a curl-to-bash script, not a package manager).

## Launch

The default invocation is the TUI: `opencode [project]`, where the positional is the directory to
start in. Tortie launches by bare name (the manifest holds the absolute path; the login-shell PATH
reaches the binary) exactly as it does for every agent. No unusual quirks were observed at launch.

## Resume — harvest, not arm-at-launch, and why

The TUI accepts, measured from `opencode --help`:

- `-c, --continue` — continue the last session
- `-s, --session <id>` — continue a specific session id
- `--fork` — fork the session when continuing

So resume BY FLAG works: `opencode --session <id>` reopens a known conversation. **But there is no
flag that PRE-ASSIGNS a session id at create.** `-s` continues an *existing* session; it does not
create one with a chosen id. That is the test that separates a Tier-1 arm-at-launch agent (like
Claude Code's `--session-id`) from a harvest agent. opencode is **harvest**.

`generateID` in `packages/opencode/src/id/id.ts` does accept a `given` id, and the HTTP server route
`server/routes/instance/httpapi/handlers/tui.ts:101` accepts a payload `sessionID` that
`startsWith("ses")` — but neither is reachable from the `run`/TUI command line, so Tortie cannot use
them to arm a launch. Do not put a pre-assign flag on the launch argv; a wrong one is a dead pane
(the standing registry rule).

### The harvest is reliable, and stronger than deepseek's

The id capture pattern is `cwd-newest`, the same family as deepseek's, but the evidence is better:

- The `session` table has columns `id`, `directory` (the ABSOLUTE cwd, verified — rows read
  `/Users/gdc/runstory/scratch/phase5/5c`), `slug`, `title`, `time_created`, `time_updated`, `agent`,
  `model`, and token/cost columns. `directory` is the project binding, held in a real indexed column
  rather than inside a JSON blob written on the first turn.
- Session ids are `ses_` + a 12-hex time field + 14 base62 random chars, generated **descending and
  monotonic** (`id.ts`: `now = ~now`, timestamp × 0x1000 + counter). So the newest session sorts
  FIRST lexically, and `Identifier.timestamp(id)` decodes the creation time straight from the id.
  The harvest can therefore both pick the newest row for a cwd AND verify its age against the id,
  which deepseek's opaque uuid cannot do.
- Reliability is still WEAK in exactly one way deepseek's is: two opencode panes started in one
  directory within the same session are not separable by cwd alone. The claim stays takeable
  (`src/main/manifest/harvest/claim-strength.ts`), consistent with the existing weak-harvest rows.

So `resume.strategy` is `flag-uuid`, `template` is `['--session', SESSION_ID_SLOT]`, and `idCapture`
is a NEW SQLite reader: newest `session.id` whose `directory` equals the pane's realpath'd cwd. This
reader is the new code the phase owns.

### `session list` and `export` exist and can corroborate

`opencode session list` enumerates sessions and `opencode export [sessionID]` dumps one as JSON.
Either can be a cross-check in the conformance harness, but the resume argv itself should read the
db, not shell out, so a slow or locked CLI never blocks a restore.

## Auth and models

`auth.json` holds an OpenAI oauth credential (the operator authed before handing this over). It is
READ ONLY to Tortie and no token byte is ever read, logged or copied — the same rule the credentials
domain already enforces. Model selection is opencode's own (`-m provider/model`); Tortie does not
need to drive it for a first-class launch/resume/restore integration.

## The SpecStory gap, stated plainly

The bundled specstory 2.8.0 cannot capture opencode. The registry row says so, capture stays off for
opencode sessions, and nothing pretends otherwise. If a later specstory bundles an opencode provider,
the row flips in that phase, not this one. The SpecStory rename rule in CLAUDE.md is untouched: this
is about which agents the bundled binary supports, not about the integration's name.

## What the phase must build

1. A registry row for opencode: `id: 'opencode'`, `displayName` (product name "opencode"),
   `binaries: ['opencode']`, `extraProbeDirs` including `~/.opencode/bin`, the install block above,
   `versionProbe`, `launch`, the `resume` block (flag-uuid, `--session`, cwd-newest harvest), an
   icon key, a default hotkey hint, `multilineKey` and `imageDrop` measured hands-on (opencode is
   installed, so these are VERIFIED, not docs-only), and `specstory: { provider: null }` /
   unsupported with a note naming specstory 2.8.0.
2. **The store abstraction the registry has never needed: a SQLite-backed store.** `storeDirs`
   currently names directories of files. opencode's store is a `.db` file. The phase decides how the
   type expresses that — a `storeKind: 'sqlite'` discriminant, or a `storeDb` field beside
   `storeDirs` — and the harvest reader gains a SQLite path. Read
   `src/main/manifest/harvest/` in full first; the reader must open the db READ ONLY (immutable open
   / `mode=ro`), never take a write lock, and never touch opencode's WAL.
3. Detection: `command -v opencode` plus `~/.opencode/bin` on the probe path.
4. The conformance harness (`conformance:resume`, `conformance:resume:capture`) gains an opencode arm
   that creates a real session, harvests the id from the db, resumes by `--session <id>`, and reads
   the original turn back on screen — measured, not asserted, because that is the Tier-3 bar for a
   durability-critical claim.

## What is NOT in this phase

- No specstory provider is written; capture stays off for opencode. That is specstory's product, not
  Tortie's, and the SpecStory boundary rule forbids "finishing off" that work here.
- No opencode plugin, MCP server, ACP server or web/serve mode is integrated. opencode has all of
  those; Tortie launches the TUI and restores it, nothing more.
- No pre-assign-id launch flag is invented from the source's internal `given` path. If opencode ships
  a CLI pre-assign flag later, opencode becomes a Tier-1 arm-at-launch agent in a follow-up, not now.
- No model or provider is driven on opencode's behalf.

## The tier

Tier 3. It can lose or misattribute a person's session (restore is durability-critical), it claims to
work by reading a store shape the registry has never read, and it holds — READ ONLY — a place where
the person's credential lives. The evidence is a real create/harvest/resume/read-back matrix over the
live binary, plus a hostile arm (two panes in one cwd, a locked db, a db mid-write) and an attack on
the SQLite reader's read-only guarantee.
