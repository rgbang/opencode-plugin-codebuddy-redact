// Confirmation test for the Code Buddy redaction plugin.
// Run:  node test/verify.mjs
// Proves the guard actually masks the right things and honours every setting.
// Exits non-zero if anything is wrong, so it can gate a release.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'codebuddy-redact.mjs');

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

// Load the guard with a given settings object (or none), in a throwaway dir.
async function guardWith(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbverify-'));
  if (settings) fs.writeFileSync(path.join(dir, 'codebuddy-redaction.json'),
    typeof settings === 'string' ? settings : JSON.stringify(settings));
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (m) => warnings.push(String(m));
  const mod = await import('file://' + PLUGIN.replace(/\\/g, '/') + '?t=' + Math.max(pass + fail, 1));
  const hooks = await mod.CodebuddyRedact({ directory: dir });
  console.warn = origWarn;
  const read = async (text) => {
    const o = { output: text };
    if (hooks['tool.execute.after']) await hooks['tool.execute.after']({ tool: 'read', args: {} }, o);
    return o.output;
  };
  const chat = async (text) => {
    const m = { parts: [{ text }] };
    if (hooks['experimental.chat.messages.transform']) await hooks['experimental.chat.messages.transform']({}, { messages: [m] });
    return m.parts[0].text;
  };
  return { dir, hooks, warnings, read, chat };
}

console.log('— Core protection (default settings) —');
{
  const g = await guardWith(null);
  ok('masks AWS key in a file read', (await g.read('AWS_KEY=AKIA1234567890ABCD00')).includes('<REDACTED:AWS-KEY-1>'));
  ok('masks a secret you TYPE in chat', (await g.chat('my key AKIA1234567890ABCD00')).includes('<REDACTED:AWS-KEY-1>'));
  ok('masks a valid SA ID', (await g.read('id 8001015009087')).includes('<REDACTED:SA-ID-1>'));
  ok('leaves an obvious placeholder alone', !(await g.read('key = "sk-XXXXXXXXXXXX"')).includes('REDACTED'));
  ok('does NOT mask a random 13-digit number', !(await g.read('num 8001015009088')).includes('REDACTED'));
}

console.log('\n— Per-user settings actually take effect —');
{
  const g = await guardWith({ enabled: true, customWords: ['Project-Zeus'], allowlist: ['AKIAEXAMPLEKEY0000000'], disableKinds: ['SA-ID'] });
  ok('customWords masks your word', (await g.read('codename Project-Zeus')).includes('<REDACTED:CUSTOM-1>'));
  ok('allowlist leaves a sample key unmasked', (await g.read('sample AKIAEXAMPLEKEY0000000')).includes('AKIAEXAMPLEKEY0000000'));
  ok('disableKinds turns SA-ID off', !(await g.read('id 8001015009087')).includes('REDACTED'));
  ok('a real secret is STILL masked with custom settings', (await g.read('AKIA1234567890ABCD00')).includes('<REDACTED:AWS-KEY-1>'));
}

console.log('\n— customPatterns (regex) —');
{
  const g = await guardWith({ enabled: true, customPatterns: ['\\bINT-\\d{6}\\b'] });
  ok('customPatterns masks a described shape', (await g.read('ticket INT-004521')).includes('<REDACTED:CUSTOM-1>'));
  ok('customPatterns ignores a non-match', !(await g.read('ticket INT-99')).includes('REDACTED'));
}

console.log('\n— Fail-safe behaviour —');
{
  const broken = await guardWith('{ "enabled": true, "customWords": ["x",] ');   // typo: trailing comma + unclosed
  ok('broken settings file WARNS the user', broken.warnings.some((w) => w.includes('couldn\'t read')));
  ok('broken settings STILL masks secrets (fail-safe)', (await broken.read('AKIA1234567890ABCD00')).includes('<REDACTED:AWS-KEY-1>'));

  const off = await guardWith({ enabled: false });
  ok('enabled:false disables the guard entirely', Object.keys(off.hooks).length === 0);
}

console.log('\n— Records only, never the secret value —');
{
  const g = await guardWith({ enabled: true });
  await g.read('AKIA1234567890ABCD00');
  const logFile = path.join(g.dir, '.codebuddy', 'redactions.jsonl');
  const logged = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
  ok('a record was written', logged.includes('AWS-KEY'));
  ok('the real secret value is NOT in the log', !logged.includes('AKIA1234567890ABCD00'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
