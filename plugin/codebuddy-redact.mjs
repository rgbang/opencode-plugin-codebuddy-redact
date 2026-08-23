// Code Buddy — redaction guard for opencode (self-contained plugin).
//
// Masks real secrets AND South African ID numbers in everything an agent reads
// (files, command output) and in what you type into chat — BEFORE it reaches
// the cloud model. Runs on EVERY agent, because it hooks the tool layer, which
// sits below agents. Deterministic (regex + Luhn checksum + Shannon entropy),
// no AI, no network. It records what it masked (kind + placeholder + time,
// NEVER the value).
//
// Drop this one file into ~/.config/opencode/plugin/ (global) or
// .opencode/plugin/ (per-project) and opencode loads it automatically.
//
// Optional settings: a JSON file `codebuddy-redaction.json` in your project
// root, or ~/.config/opencode/codebuddy-redaction.json (global). Shape:
//   { "enabled": true, "includePII": false }
// Secrets and SA ID numbers are always masked when enabled; includePII adds
// emails, phone numbers, SSNs and card numbers.
import fs from 'fs';
import os from 'os';
import path from 'path';

// ── Settings: defaults < global file < project file ──────────────────────────
function loadSettings(directory) {
  let s = { enabled: true, includePII: false };
  const candidates = [
    path.join(os.homedir(), '.config', 'opencode', 'codebuddy-redaction.json'),
    directory ? path.join(directory, 'codebuddy-redaction.json') : null,
  ].filter(Boolean);
  for (const p of candidates) {
    try { s = { ...s, ...JSON.parse(fs.readFileSync(p, 'utf8')) }; } catch { /* optional */ }
  }
  return s;
}

// ── Secret patterns (high-confidence formats, always on) ─────────────────────
const SECRET_PATTERNS = [
  ['AWS-KEY', /\bAKIA[0-9A-Z]{16}\b/g],
  ['AWS-KEY', /\bASIA[0-9A-Z]{16}\b/g],
  ['GITHUB-TOKEN', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g],
  ['STRIPE-KEY', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g],
  ['SLACK-TOKEN', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ['GOOGLE-KEY', /\bAIza[0-9A-Za-z_\-]{35}\b/g],
  ['OPENAI-KEY', /\bsk-(?:proj-)?[A-Za-z0-9_\-]{20,}\b/g],
  ['JWT', /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g],
  ['BEARER', /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/g],
  ['PRIVATE-KEY', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g],
  ['CONNECTION-STRING', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|amqps):\/\/[^\s:@/]+:[^\s:@/]+@[^\s]+/g],
];

// ── PII patterns (only when includePII is true) ──────────────────────────────
const PII_PATTERNS = [
  ['EMAIL', /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g],
  ['SSN', /\b\d{3}-\d{2}-\d{4}\b/g],
  ['CREDIT-CARD', /\b(?:\d[ \-]?){13,16}\b/g],
  ['SA-PHONE', /(?:\+27|0)(?:[\s-]?\d){9}\b/g],
  ['PHONE', /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g],
];

// Generic "name = value" assignment where value is a real, high-entropy secret.
const ASSIGN = /\b(pass(?:word|wd)?|secret|token|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*(["'])([^"']{8,})\2/gi;

const PLACEHOLDER = /^(?:x+|\*+|\.+|-+|_+|<[^>]*>|\$\{[^}]*\}|(?:your|my|the|a|an|some|example|sample|placeholder|dummy|fake|test|changeme|replace|redacted|todo|xxx|abc|1234|0000|null|none|empty|password|secret|token|key)[\w.-]*)$/i;

function isPlaceholder(v) {
  if (!v || v.length < 8) return true;
  if (PLACEHOLDER.test(v)) return true;
  if (/^(?:sk|pk|api)[-_]x+$/i.test(v)) return true;
  if (/(.)\1{5,}/.test(v)) return true;
  return false;
}

function entropy(s) {
  const freq = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  let e = 0;
  for (const c in freq) { const p = freq[c] / s.length; e -= p * Math.log2(p); }
  return e;
}

// South African ID: 13 digits, validated with birth-date + Luhn checksum.
function isValidSAID(s) {
  if (!/^\d{13}$/.test(s)) return false;
  const mm = +s.slice(2, 4), dd = +s.slice(4, 6);
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  let sum = 0, alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = +s[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ── The guard, per session ────────────────────────────────────────────────────
export const CodebuddyRedact = async ({ directory } = {}) => {
  const settings = loadSettings(directory);
  if (!settings.enabled) return {};
  const patterns = settings.includePII ? [...SECRET_PATTERNS, ...PII_PATTERNS] : SECRET_PATTERNS;

  const root = directory || process.cwd();
  const seen = new Map();
  const counters = {};
  const logFile = path.join(root, '.codebuddy', 'redactions.jsonl');

  const logMask = (kind, placeholder, tool, file) => {
    try {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, JSON.stringify({
        at: new Date().toISOString(), placeholder, kind, tool, file: file || '',
      }) + '\n');
    } catch { /* best-effort */ }
  };

  const placeholderFor = (value, kind, tool, file) => {
    if (seen.has(value)) return seen.get(value);
    counters[kind] = (counters[kind] || 0) + 1;
    const ph = `<REDACTED:${kind}-${counters[kind]}>`;
    seen.set(value, ph);
    logMask(kind, ph, tool, file);
    return ph;
  };

  const redact = (text, tool, file) => {
    if (typeof text !== 'string' || text.length < 8) return text;
    let out = text;
    out = out.replace(/\b\d{13}\b/g, (m) => (isValidSAID(m) ? placeholderFor(m, 'SA-ID', tool, file) : m));
    for (const [kind, re] of patterns) {
      out = out.replace(re, (m) => {
        if (kind === 'EMAIL' && /@(?:example|test|localhost|domain)\b/i.test(m)) return m;
        return placeholderFor(m, kind, tool, file);
      });
    }
    out = out.replace(ASSIGN, (m, name, q, value) => {
      if (isPlaceholder(value)) return m;
      if (value.length < 12 && entropy(value) < 3) return m;
      return m.replace(value, placeholderFor(value, 'SECRET', tool, file));
    });
    return out;
  };

  const redactMessage = (m) => {
    if (!m) return;
    if (Array.isArray(m.parts)) {
      for (const p of m.parts) if (p && typeof p.text === 'string') p.text = redact(p.text, 'chat', '');
    }
    if (typeof m.content === 'string') m.content = redact(m.content, 'chat', '');
    else if (Array.isArray(m.content)) {
      for (const c of m.content) if (c && typeof c.text === 'string') c.text = redact(c.text, 'chat', '');
    }
  };

  return {
    'tool.execute.after': async (input, output) => {
      if (!output) return;
      const tool = (input && input.tool) || '';
      const file = input && input.args && (input.args.filePath || input.args.path || input.args.file);
      if (typeof output.output === 'string') output.output = redact(output.output, tool, file);
      if (typeof output.title === 'string') output.title = redact(output.title, tool, file);
      if (output.metadata && typeof output.metadata.output === 'string') {
        output.metadata.output = redact(output.metadata.output, tool, file);
      }
    },
    'experimental.chat.messages.transform': async (_input, output) => {
      if (!output || !Array.isArray(output.messages)) return;
      for (const m of output.messages) redactMessage(m);
    },
  };
};

export default CodebuddyRedact;
