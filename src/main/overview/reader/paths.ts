/**
 * The path index extractor, section 6.5 of the Phase 137 spec.
 *
 * At parse time the reader keeps the distinct path shaped strings each turn
 * named, from tool calls and from the text of asks, answers and shell
 * commands, and throws the payload away. On the operator's own driving
 * session that is 218 paths at 8.0 KB against 2.13 MB of payload. The git
 * mark and the store read this list and never the tool output behind it.
 *
 * PHASE 274 — THE PREFIX TEST NOW ASKS TWO ROOTS.
 *
 * `projectPath` is the row's STORED spelling, which is whatever the person
 * typed when they opened the folder. Every path an agent writes into its own
 * log is spelled the way the agent's cwd resolved, which on macOS is the
 * canonical one. On a case-insensitive volume — the APFS default — those are
 * two spellings of one folder, and a byte-exact `startsWith` says they are
 * unrelated. That is the reporter's own incident 2 in our product, and issue
 * 25's shape one layer down from the project row.
 *
 * MEASURED at the parent `30f4bd8d` and after, over a real folder the disk
 * spells `<b>/Source/proj` opened as `<b>/source/proj` — one inode, two
 * spellings:
 *
 *   parent, absolute token -> path '<b>/Source/proj/src/index.ts', inside false
 *   parent, relative token -> DROPPED, the list comes back empty
 *   after,  either token    -> path 'src/index.ts', inside true
 *
 * The absolute half filled the index a person reads with absolute strings and
 * left the git mark no repository-relative path to check. The relative half was
 * worse and is the reason this is not cosmetic: `continue` threw the mention
 * away, so a whole class of the file's own input vanished with no error
 * anywhere.
 *
 * The repair is the phase's rule everywhere: never fold, ask the filesystem
 * once, then compare byte-exactly against BOTH answers. Nothing here
 * lowercases a string and nothing here normalises one.
 */

import { relative, resolve, sep } from 'node:path';
import { canonicalPathSync } from '../../fs/folder-identity';

export interface PathMention {
  /** Project relative when inside, absolute when outside. */
  path: string;
  mentions: number;
  source: 'command' | 'tool' | 'text';
  inside: boolean;
}

/** A token with none of these still names a file the git mark can check. */
const PATH_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.css', '.py', '.go',
  '.rs', '.sh', '.yml', '.yaml', '.toml', '.txt', '.html', '.sql', '.swift',
  '.rb', '.java', '.kt', '.c', '.h', '.cpp'
];

const LEAD_STRIP = new Set(['(', '[', "'", '"', '`']);
const TRAIL_STRIP = new Set(['.', ',', ';', ':', ')', ']', "'", '"', '`']);

const MAX_TOKEN = 300;
const MAX_PATHS_PER_TURN = 200;

function stripToken(raw: string): string {
  let a = 0;
  let b = raw.length;
  while (a < b && LEAD_STRIP.has(raw[a] as string)) a++;
  while (b > a && TRAIL_STRIP.has(raw[b - 1] as string)) b--;
  return raw.slice(a, b);
}

function hasPathExtension(token: string): boolean {
  const lower = token.toLowerCase();
  return PATH_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function normalizeRoot(p: string): string {
  return p.length > 1 && p.endsWith(sep) ? p.slice(0, -1) : p;
}

function isUnder(child: string, root: string): boolean {
  return child === root || child.startsWith(root + sep);
}

/**
 * The project root's canonical spelling, or null when it has none to add.
 *
 * ONE SYSCALL PER READER RUN, NOT ONE PER TURN. A session read calls
 * {@link extractPathsFromText} up to three times per turn and a long session
 * has thousands of turns, so the answer is memoised on the LAST root asked
 * about. One reader run walks one project, so the memo hits on every call after
 * the first; it holds one entry and cannot grow.
 *
 * A root that cannot be resolved — a project on an unmounted volume, a folder
 * that has been deleted — memoises `null`, which puts the test back exactly
 * where it was before this phase. `null` is also the answer when the canonical
 * spelling IS the stored spelling, which is the common case, so the second
 * comparison below costs nothing at all for a person whose project is spelled
 * the way the disk spells it.
 *
 * THE LIMIT, declared rather than hidden: the memo lives as long as the process,
 * so a folder renamed on disk under a running app keeps its old canonical answer
 * until some other project is read. That costs a stale second prefix to compare
 * against — the stored root is still asked FIRST and still answers — and a
 * renamed folder has already broken the stored row itself, which is a different
 * repair.
 */
let lastRootAsked: string | null = null;
let lastRootCanonical: string | null = null;

function canonicalRootOf(root: string): string | null {
  if (root === lastRootAsked) return lastRootCanonical;
  let answer: string | null = null;
  try {
    const real = normalizeRoot(canonicalPathSync(root));
    answer = real === root ? null : real;
  } catch {
    answer = null;
  }
  lastRootAsked = root;
  lastRootCanonical = answer;
  return answer;
}

/**
 * Which spelling of the root holds this path, or null when neither does.
 *
 * BYTE-EXACT ON EACH ROOT SEPARATELY. This is not a case-insensitive prefix
 * test and it must never become one: folding is the reporter's own recorded
 * wrong fix, and it corrupts anything recorded on a case-sensitive volume,
 * which is every Linux host this product reads paths from over ssh. The two
 * spellings come from the filesystem, and each is then compared as bytes.
 *
 * The STORED spelling is asked first, so a project whose spelling matches the
 * disk answers exactly as it did before Phase 274 and pays for nothing.
 */
function rootHolding(
  child: string,
  root: string,
  canonicalRoot: string | null
): string | null {
  if (isUnder(child, root)) return root;
  if (canonicalRoot !== null && isUnder(child, canonicalRoot)) {
    return canonicalRoot;
  }
  return null;
}

/**
 * Scan free text for path shaped tokens. The rule set is mechanical, section
 * 6.5. A token qualifies when it holds a `/` or ends in a known source file
 * extension, holds no `://` and no `${`, is not a `--` flag, and is at most
 * 300 characters once wrapping punctuation is stripped. An absolute token
 * inside the project is recorded project relative. A relative token is
 * resolved against the cwd and dropped when it escapes the project.
 */
export function extractPathsFromText(
  text: string,
  cwd: string,
  projectPath: string,
  source: PathMention['source'] = 'text'
): PathMention[] {
  const root = normalizeRoot(projectPath);
  const found = new Map<string, PathMention>();
  if (!text) return [];
  const canonicalRoot = canonicalRootOf(root);
  for (const raw of text.split(/\s+/)) {
    if (raw === '') continue;
    const token = stripToken(raw);
    if (token === '' || token.length > MAX_TOKEN) continue;
    if (token.startsWith('--')) continue;
    if (token.includes('://') || token.includes('${')) continue;
    if (!token.includes('/') && !hasPathExtension(token)) continue;
    let recorded: string;
    let inside: boolean;
    if (token.startsWith('/')) {
      // The root the token is recorded against is whichever of the two
      // spellings it actually sits under, so `relative()` never has to bridge
      // them and the recorded path is project relative either way.
      const under = rootHolding(token, root, canonicalRoot);
      if (under !== null) {
        recorded = token === under ? '.' : relative(under, token);
        inside = true;
      } else {
        recorded = token;
        inside = false;
      }
    } else {
      const abs = resolve(cwd, token);
      const under = rootHolding(abs, root, canonicalRoot);
      if (under === null) continue;
      recorded = abs === under ? '.' : relative(under, abs);
      inside = true;
    }
    if (recorded === '') continue;
    const prev = found.get(recorded);
    if (prev) prev.mentions++;
    else found.set(recorded, { path: recorded, mentions: 1, source, inside });
  }
  return capAndSort([...found.values()]);
}

/**
 * Merge per source lists into one per turn list. Mentions are summed and the
 * strongest source wins, a tool argument over a shell command over prose,
 * because a path a tool was pointed at is direct evidence and a path in a
 * sentence is only a mention. Sorted by mentions descending, capped at 200.
 */
const SOURCE_RANK: Record<PathMention['source'], number> = { tool: 2, command: 1, text: 0 };

export function mergePathMentions(lists: PathMention[][]): PathMention[] {
  const merged = new Map<string, PathMention>();
  for (const list of lists) {
    for (const m of list) {
      const prev = merged.get(m.path);
      if (prev) {
        prev.mentions += m.mentions;
        if (SOURCE_RANK[m.source] > SOURCE_RANK[prev.source]) prev.source = m.source;
      } else {
        merged.set(m.path, { ...m });
      }
    }
  }
  return capAndSort([...merged.values()]);
}

function capAndSort(list: PathMention[]): PathMention[] {
  return list.sort((a, b) => b.mentions - a.mentions).slice(0, MAX_PATHS_PER_TURN);
}
