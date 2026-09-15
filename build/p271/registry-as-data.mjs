// Phase 271 verifier — reads src/main/agents/registry.ts AS TEXT and parses the
// AGENT_REGISTRY object literal with a hand-written recursive-descent reader.
// It NEVER imports the module. No process is started. Nothing is written.
//
// Usage: node build/p271/registry-as-data.mjs [--json] [--table]
import { readFileSync } from 'node:fs';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(here, '..', '..');
const SRC = resolvePath(ROOT, 'src/main/agents/registry.ts');

const text = readFileSync(SRC, 'utf8');

// ---- reader -------------------------------------------------------------
let i = 0;
let s = text;

function lineOf(pos) {
  let n = 1;
  for (let k = 0; k < pos && k < s.length; k++) if (s[k] === '\n') n++;
  return n;
}

function skipTrivia() {
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (s[i] === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unterminated block comment at ' + lineOf(i));
      i = end + 2;
      continue;
    }
    return;
  }
}

function readStringLiteral() {
  const q = s[i];
  i++;
  let out = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '`': '`', '0': '\0' };
      if (n in map) { out += map[n]; i += 2; continue; }
      if (n === 'u') { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16)); i += 6; continue; }
      out += n; i += 2; continue;
    }
    if (c === q) { i++; return out; }
    if (q === '`' && c === '$' && s[i + 1] === '{') throw new Error('template substitution at line ' + lineOf(i));
    out += c;
    i++;
  }
  throw new Error('unterminated string at ' + lineOf(i));
}

function readValue() {
  skipTrivia();
  const start = i;
  const c = s[i];
  if (c === '{') return readObject();
  if (c === '[') return readArray();
  if (c === "'" || c === '"' || c === '`') {
    let v = readStringLiteral();
    // string concatenation with +
    for (;;) {
      const save = i;
      skipTrivia();
      if (s[i] === '+') {
        i++;
        skipTrivia();
        if (s[i] === "'" || s[i] === '"' || s[i] === '`') { v += readStringLiteral(); continue; }
        i = save; break;
      }
      i = save; break;
    }
    return { v, line: lineOf(start) };
  }
  // identifier / keyword / number
  const m = /^[A-Za-z_$][A-Za-z0-9_$.]*|^-?\d[\d_.eE+-]*/.exec(s.slice(i));
  if (!m) throw new Error('unparsed value at line ' + lineOf(i) + ': ' + JSON.stringify(s.slice(i, i + 40)));
  i += m[0].length;
  const tok = m[0];
  if (tok === 'true') return { v: true, line: lineOf(start) };
  if (tok === 'false') return { v: false, line: lineOf(start) };
  if (tok === 'null') return { v: null, line: lineOf(start) };
  if (tok === 'undefined') return { v: undefined, line: lineOf(start) };
  if (/^-?\d/.test(tok)) return { v: Number(tok.replace(/_/g, '')), line: lineOf(start) };
  // an identifier reference to a constant defined elsewhere in the module
  return { v: { __ref: tok }, line: lineOf(start) };
}

function readArray() {
  const startLine = lineOf(i);
  i++; // [
  const out = [];
  for (;;) {
    skipTrivia();
    if (s[i] === ']') { i++; break; }
    const val = readValue();
    out.push(val.v);
    skipTrivia();
    if (s[i] === ',') { i++; continue; }
    if (s[i] === ']') { i++; break; }
    throw new Error('array separator at line ' + lineOf(i));
  }
  out.__line = startLine;
  return { v: out, line: startLine };
}

function readObject() {
  const startLine = lineOf(i);
  i++; // {
  const out = {};
  const lines = {};
  for (;;) {
    skipTrivia();
    if (s[i] === '}') { i++; break; }
    let key;
    const keyPos = i;
    if (s[i] === "'" || s[i] === '"') key = readStringLiteral();
    else {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(s.slice(i));
      if (!m) throw new Error('bad key at line ' + lineOf(i) + ': ' + JSON.stringify(s.slice(i, i + 40)));
      key = m[0];
      i += m[0].length;
    }
    skipTrivia();
    if (s[i] !== ':') throw new Error('expected : after key ' + key + ' at line ' + lineOf(i));
    i++;
    const val = readValue();
    out[key] = val.v;
    lines[key] = lineOf(keyPos);
    skipTrivia();
    if (s[i] === ',') { i++; continue; }
    if (s[i] === '}') { i++; break; }
    throw new Error('object separator after ' + key + ' at line ' + lineOf(i));
  }
  Object.defineProperty(out, '__lines', { value: lines, enumerable: false });
  Object.defineProperty(out, '__line', { value: startLine, enumerable: false });
  return { v: out, line: startLine };
}

// ---- locate AGENT_REGISTRY ---------------------------------------------
const decl = /export const AGENT_REGISTRY\s*:[^=]*=\s*/.exec(text);
if (!decl) throw new Error('AGENT_REGISTRY declaration not found');
i = decl.index + decl[0].length;
skipTrivia();
if (s[i] !== '[') throw new Error('AGENT_REGISTRY is not an array literal');
const registry = readArray().v;

// ---- also parse a few sibling constants so refs can be resolved ---------
function parseConst(name) {
  const re = new RegExp('(?:export )?const ' + name + '\\s*(?::[^=]*)?=\\s*');
  const m = re.exec(text);
  if (!m) return undefined;
  const save = i;
  i = m.index + m[0].length;
  let out;
  try { out = readValue().v; } catch { out = undefined; }
  i = save;
  return out;
}

const constants = {};
for (const name of ['LF', 'SESSION_ID_SLOT', 'DEFAULT_IMAGE_DROP', 'DEFAULT_MULTILINE_KEY']) {
  const v = parseConst(name);
  if (v !== undefined) constants[name] = v;
}

export { registry, constants, text as registrySource };

// ---- CLI ---------------------------------------------------------------
const args = process.argv.slice(2);
function lineNo(obj, key) {
  return obj && obj.__lines && obj.__lines[key] ? obj.__lines[key] : null;
}

if (args.includes('--json')) {
  const plain = registry.map((e) => ({ ...e, __line: e.__line }));
  process.stdout.write(JSON.stringify(plain, null, 2) + '\n');
} else {
  const rows = [];
  for (const e of registry) {
    rows.push({
      id: e.id,
      displayName: e.displayName,
      line: e.__line,
      kind: e.kind,
      launchable: e.launchable,
      status: e.status,
      confidence: e.confidence,
      unverified: e.unverified === true,
      binaries: (e.binaries || []).join('|'),
      extraProbeDirs: (e.extraProbeDirs || []).join('|'),
      storeDb: e.storeDb === undefined ? '-' : JSON.stringify(e.storeDb),
      // launch
      launch_present: e.launch !== null && e.launch !== undefined,
      launch_argv: e.launch ? JSON.stringify(e.launch.argv) : '-',
      resumeExtrasPosition: e.resume ? String(e.resume.resumeExtrasPosition ?? 'trailing(default)') : '-',
      launch_env: e.launch && e.launch.env ? JSON.stringify(e.launch.env) : '-',
      // resume
      resume_strategy: e.resume ? e.resume.strategy : '-',
      resume_template: e.resume && e.resume.template ? JSON.stringify(e.resume.template) : '-',
      resume_requiresOriginalCwd:
        e.resume && 'requiresOriginalCwd' in e.resume ? String(e.resume.requiresOriginalCwd) : 'omitted',
      idCapture_mode: e.resume && e.resume.idCapture ? e.resume.idCapture.mode : '-',
      idCapture_key: e.resume && e.resume.idCapture ? (e.resume.idCapture.key ?? '-') : '-',
      idCapture_availableAt: e.resume && e.resume.idCapture ? (e.resume.idCapture.availableAt ?? '-') : '-',
      bareResumeIsDangerous: e.resume && 'bareResumeIsDangerous' in e.resume ? String(e.resume.bareResumeIsDangerous) : 'omitted',
      idCapture_confidence: e.resume && e.resume.idCapture ? (e.resume.idCapture.confidence ?? '-') : '-',
      // activity
      activity_present: e.activity !== undefined,
      activity_tier: e.activity ? e.activity.tier : '-',
      activity_native: e.activity ? (e.activity.native ?? '-') : '-',
      activity_hooks: e.activity ? (e.activity.hooks ?? '-') : '-',
      activity_animatesWhenIdle: e.activity ? String(e.activity.animatesWhenIdle) : '-',
      activity_verified: e.activity ? e.activity.verified : '-',
      // specstory
      specstory_present: e.specstory !== undefined,
      specstory_provider: e.specstory ? JSON.stringify(e.specstory.provider) : '-',
      specstory_fidelity: e.specstory ? (e.specstory.exitCodeFidelity ?? '-') : '-',
      specstory_verified: e.specstory ? String(e.specstory.verified) : '-',
      // image drop
      imageDrop_present: e.imageDrop !== undefined,
      imageDrop_mode: e.imageDrop ? `${e.imageDrop.strategy}/${e.imageDrop.insert}` : '-',
      imageDrop_verified: e.imageDrop ? String(e.imageDrop.verified) : '-',
      // multiline
      multiline_present: e.multilineKey !== undefined,
      multiline_seq: e.multilineKey ? JSON.stringify(e.multilineKey.sequence) : '-',
      multiline_verified: e.multilineKey ? String(e.multilineKey.verified) : '-',
      // misc declared fields
      flagPresets: e.flagPresets === undefined ? 'undefined' : JSON.stringify(e.flagPresets),
      reconstructionTarget: String(e.reconstructionTarget),
      versionProbe: e.versionProbe === null ? 'null' : JSON.stringify(e.versionProbe && e.versionProbe.args),
      install_canonical: e.install ? (e.install.canonical === null ? 'null' : 'present') : '-'
    });
  }
  if (args.includes('--table')) {
    // long form, one line per agent per capability
    const caps = ['launch', 'resume', 'idCapture', 'activity', 'specstory', 'imageDrop', 'multilineKey', 'flagPresets'];
    for (const r of rows) {
      for (const cap of caps) {
        let present, detail;
        if (cap === 'launch') { present = r.launch_present; detail = `argv=${r.launch_argv} env=${r.launch_env}`; }
        else if (cap === 'resume') { present = r.resume_strategy !== '-'; detail = `strategy=${r.resume_strategy} template=${r.resume_template} requiresOriginalCwd=${r.resume_requiresOriginalCwd} extrasPosition=${r.resumeExtrasPosition} bareResumeIsDangerous=${r.bareResumeIsDangerous}`; }
        else if (cap === 'idCapture') { present = r.idCapture_mode !== '-'; detail = `mode=${r.idCapture_mode} key=${r.idCapture_key} availableAt=${r.idCapture_availableAt} confidence=${r.idCapture_confidence}`; }
        else if (cap === 'activity') { present = r.activity_present; detail = `tier=${r.activity_tier} native=${r.activity_native} hooks=${r.activity_hooks} animatesWhenIdle=${r.activity_animatesWhenIdle} verified=${r.activity_verified}`; }
        else if (cap === 'specstory') { present = r.specstory_present; detail = `provider=${r.specstory_provider} fidelity=${r.specstory_fidelity} verified=${r.specstory_verified}`; }
        else if (cap === 'imageDrop') { present = r.imageDrop_present; detail = `mode=${r.imageDrop_mode} verified=${r.imageDrop_verified}`; }
        else if (cap === 'multilineKey') { present = r.multiline_present; detail = `seq=${r.multiline_seq} verified=${r.multiline_verified}`; }
        else { present = r.flagPresets !== 'undefined'; detail = `value=${r.flagPresets}`; }
        console.log([r.id.padEnd(12), String(r.launchable).padEnd(5), cap.padEnd(13), (present ? 'present' : 'ABSENT').padEnd(8), detail].join(' '));
      }
    }
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  console.error(`# parsed ${registry.length} entries from ${SRC}`);
  console.error(`# constants resolved: ${JSON.stringify(constants)}`);
}

// --lines : every field path with the source line it is declared on.
if (args.includes('--lines')) {
  const walk = (obj, prefix) => {
    if (!obj || typeof obj !== 'object') return;
    const lines = obj.__lines;
    for (const k of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      const ln = lines && lines[k] ? lines[k] : (Array.isArray(obj) ? obj.__line : null);
      console.log(`${String(ln ?? '?').padStart(5)}  ${path}`);
      const v = obj[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path);
      if (Array.isArray(v)) v.forEach((el, n) => { if (el && typeof el === 'object') walk(el, `${path}[${n}]`); });
    }
  };
  for (const e of registry) {
    console.log(`--- ${e.id} (entry opens line ${e.__line}) ---`);
    walk(e, '');
  }
}
