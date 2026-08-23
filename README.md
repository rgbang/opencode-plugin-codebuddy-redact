# Code Buddy — redaction guard for opencode

An [opencode](https://opencode.ai) **plugin** that automatically masks secrets
and **South African ID numbers** before they ever reach the cloud model — in
files your agents read *and* in what you type into chat.

```
you: review config.js        (file contains AWS_KEY=AKIA1234567890ABCD00)
model sees:  AWS_KEY=<REDACTED:AWS-KEY-1>      ← the real key never left your machine
```

- **Runs on every agent** (build, plan, reviewer, all of them) — it hooks the
  tool layer, which sits below agents.
- **Deterministic** — regex + the **Luhn checksum** (for SA IDs) + **Shannon
  entropy** (for generic secrets). No AI, no network.
- **Records only, never the value** — masks are logged as kind + placeholder +
  time to `.codebuddy/redactions.jsonl`; the secret itself is never written.

## What it masks

- **Secrets (always):** AWS, GitHub, Stripe, Slack, Google, OpenAI keys; JWTs;
  `Bearer` tokens; `-----BEGIN … PRIVATE KEY-----` blocks; `postgres://user:pass@…`
  connection strings; high-entropy `password=`/`secret=`/`token=`/`api_key=`.
- **South African ID numbers (always):** 13-digit IDs, validated by Luhn + a
  birth-date check, so random 13-digit numbers are left alone.
- **PII (opt-in):** emails, phone numbers (incl. SA `+27`/`0`), SSNs, card numbers.

Obvious placeholders (`sk-XXXX`, `your-key-here`, `changeme`) are never masked.

## Install

You need opencode first: `npm install -g opencode-ai` (or see opencode.ai).

### Option A — drop-in (simplest, no config edit)

opencode auto-loads any file in its plugin directory:

**Global (every project):**
```bash
mkdir -p ~/.config/opencode/plugin
cp plugin/codebuddy-redact.mjs ~/.config/opencode/plugin/
```

**Or per-project (commit it with your repo):**
```bash
mkdir -p .opencode/plugin
cp plugin/codebuddy-redact.mjs .opencode/plugin/
```

That's it — restart opencode and the guard is active.

### Option B — as an npm package

```bash
npm install -g codebuddy-redact-opencode
```

Then register it in your `~/.config/opencode/opencode.json`:
```json
{
  "plugin": ["codebuddy-redact-opencode"]
}
```

## Settings (optional)

Defaults are sensible (secrets + SA IDs on, PII off). To change them, drop a
`codebuddy-redaction.json` in your **project root** or in
`~/.config/opencode/`:
```json
{ "enabled": true, "includePII": false }
```
Project settings override global; both override the built-in defaults.

## See what's been masked

Every mask is recorded (kind + placeholder + time — **never** the value) in
`<your-project>/.codebuddy/redactions.jsonl`. Add `.codebuddy/` to your
`.gitignore`.

To list them from inside opencode, add the `/codebuddy-redactions` command from
`opencode.example.json` to your config, then run `/codebuddy-redactions`.

## How it works (the honest version)

It uses two opencode plugin hooks:
- `tool.execute.after` — masks secrets in file/command output an agent reads.
- `experimental.chat.messages.transform` — masks secrets you type into chat.

Both rewrite the text in place before it's sent to the provider. The chat hook
is an experimental engine API; it's stable on current opencode but may change —
the file-read masking does not depend on it.

## The same engine works beyond opencode

The detection here (regex + Luhn checksum + entropy) is the **same brain** used
by the standalone `codebuddy-redact` tool, which masks secrets in *any* AI tool
(Cursor, ChatGPT, Claude Desktop, …) by cleaning your text before you paste it.
This opencode plugin is one "hook" onto that brain; the standalone is another.
If you want automatic masking inside a different tool, you write a thin hook for
that tool and reuse the same detection rules — you don't reinvent the detector.

- **opencode** → this plugin (automatic, every agent).
- **any AI tool** → the standalone `codebuddy-redact` (run it on your text).
- **other editors / a clipboard guard** → a small adapter calling the same rules.

## License

MIT © Richard Jacob Monde Gubangxa. Not affiliated with or endorsed by the
opencode team.
