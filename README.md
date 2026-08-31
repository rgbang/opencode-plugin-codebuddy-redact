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
- **Manage it in plain English** — view, add, remove, and allow rules by just
  asking an agent (or with `/codebuddy-redact-*` commands). No JSON required.
- **Verified** — ships with a 32-check test (`npm test`) proving it actually
  masks the right things and honours every setting.

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

## Settings — adjust it without touching code

> **You don't need to create anything to start.** The guard works out of the box
> with safe defaults (secrets + SA IDs are masked). Settings are only for
> *customizing* — and you don't even make the file yourself: just ask an agent
> (below) and it creates and edits it for you. Hand-editing is the optional path.

### Easiest: just ask the AI (or use a command)

Because opencode agents edit files, you don't have to touch JSON at all — tell
any agent in plain English:

> "add Project-Zeus to my codebuddy redaction custom words"

It creates/edits `codebuddy-redaction.json` for you. Or add the ready-made
commands from `opencode.example.json` — a little control panel for the guard:

| Command | What it does |
|---|---|
| `/codebuddy-redact-settings` | **See** your current setup (what's on, your words, what's off) + the options you can change |
| `/codebuddy-redact-add <word OR description>` | **Add** something to mask — a plain word, **or describe a pattern and the AI writes the regex for you** |
| `/codebuddy-redact-allow <values>` | **Allow** value(s) to never mask (false positives) |
| `/codebuddy-redact-remove <items>` | **Remove** a rule you added earlier (a custom word, an allowlist entry, or a pattern) |
| `/codebuddy-redact-off` · `/codebuddy-redact-on` | **Switch** the whole guard off or back on |
| `/codebuddy-redactions` | **View** what's already been masked (the log) |

Full control — **view, add, remove, allow** — all in plain conversation. (These
edit your *own* rules. Built-in secret and SA-ID detection is turned off only via
`disableKinds`, so it can't be dropped by accident.)

```
/codebuddy-redact-settings                                # view everything first
/codebuddy-redact-add Project-Zeus                        # a word → added as-is
/codebuddy-redact-add anything like INT- then 6 digits    # a pattern → AI writes the regex
/codebuddy-redact-allow AKIAEXAMPLEKEY0000000             # stop a false positive
/codebuddy-redact-remove Project-Zeus                     # remove a rule you added
```

You never write regex yourself — describe the shape in plain English and the
agent turns it into the pattern. Restart opencode after a change and it's live.
(Prefer editing by hand? The full file format is below.)

#### Enabling the commands (optional — nothing extra to install)

The commands are **optional convenience** — the guard already masks everything on
its own without them. To turn them on, copy the `command` block from
`opencode.example.json` into your `~/.config/opencode/opencode.json` (or a
project `.opencode/opencode.json`). No new agent or skill to create: the editing
commands run as opencode's **built-in `build` agent** (the default one that can
write files). opencode may ask you to approve the file edit the first time —
that's expected. The read-only `codebuddy` reviewer agent can't edit files, which
is why these commands use `build`.

### The file itself

Drop a `codebuddy-redaction.json` in your **project root** or in
`~/.config/opencode/`, then restart opencode. Every field is optional; project
settings override global, both override the defaults.

```json
{
  "enabled": true,
  "includePII": false,

  "customWords": ["Project-Zeus", "internal.acme.corp"],
  "allowlist": ["AKIAEXAMPLEKEY0000000"],
  "disableKinds": ["CREDIT-CARD"],
  "customPatterns": ["\\bINT-\\d{6}\\b"]
}
```

| Field | What it does | Needs regex? |
|---|---|---|
| `enabled` | turn the whole guard on/off | no |
| `includePII` | also mask emails / phones (incl. SA `+27`) / SSNs / cards | no |
| `customWords` | **your own** things to always mask — codenames, internal hostnames, a specific token | **no** — plain text |
| `allowlist` | things that look like secrets but should **never** be masked (sample keys in docs) | no — plain text |
| `disableKinds` | turn **off** categories you don't want (e.g. `"SA-ID"`, `"CREDIT-CARD"`) | no |
| `customPatterns` | advanced: your own regular expressions | yes |

`disableKinds` accepts any built-in kind: `AWS-KEY`, `GITHUB-TOKEN`,
`STRIPE-KEY`, `SLACK-TOKEN`, `GOOGLE-KEY`, `OPENAI-KEY`, `JWT`, `BEARER`,
`PRIVATE-KEY`, `CONNECTION-STRING`, `SA-ID`, `SECRET`, `EMAIL`, `SSN`,
`CREDIT-CARD`, `SA-PHONE`, `PHONE`.

The typical user only ever touches `customWords` (add my stuff) and `allowlist`
(stop masking this) — both plain text, no regex knowledge needed.

**If a setting doesn't seem to work, check the terminal.** If your
`codebuddy-redaction.json` has a typo (a missing comma, a stray quote), Code
Buddy prints a warning like:

```
⚠ Code Buddy redaction: couldn't read …/codebuddy-redaction.json — check for a JSON typo (e.g. a missing comma). Using defaults for now.
```

and falls back to the safe defaults (secrets + SA IDs still masked). Fix the JSON
and restart opencode. Tip: paste your file into a JSON validator (or let your
editor highlight the error) if you're unsure.

### Example — adding your own rule (start to finish)

Say your team has a codename `Project-Zeus` you never want sent to a model.

1. Create `codebuddy-redaction.json` in your project root:
   ```json
   { "customWords": ["Project-Zeus"] }
   ```
2. Restart opencode.
3. Now, any time an agent reads a file — or you type a message — containing
   `Project-Zeus`, the model sees `<REDACTED:CUSTOM-1>` instead.

That's the whole loop: **edit the list → restart → it's masked everywhere.** Add
more words to the array as you go; commit the file to share the rules with your
team.

## See what's been masked

Every mask is recorded (kind + placeholder + time — **never** the value) in
`<your-project>/.codebuddy/redactions.jsonl`. Add `.codebuddy/` to your
`.gitignore`.

To list them from inside opencode, add the `/codebuddy-redactions` command from
`opencode.example.json` to your config, then run `/codebuddy-redactions`.

## Verify it works

Don't take it on trust — confirm it:

```bash
npm test
```

This runs 32 checks proving the guard actually masks secrets (in file reads
*and* typed chat), SA IDs (including calendar-correct dates and leap years),
your custom words, generic high-entropy assignments, and tool-result output
(including MCP servers); honours `allowlist`, `disableKinds`, and
`customPatterns`; warns on a broken settings file yet still
masks secrets (fail-safe); disables cleanly with `enabled:false`; and never
writes a secret value to the log. All 32 must pass.

To confirm your *own* live setup any time, run `/codebuddy-redact-settings`
inside opencode — it shows exactly what's active.

## How it works (the honest version)

The guard sits at the boundary of your machine. Raw text flows in; only masked
text crosses to the cloud model — the real secret is stopped and never even
logged:

```
  your machine                                        │  cloud
  ──────────────────────────────────────────────────┐│
   file an agent reads ─┐                            ││
                        ├─►  Redaction Guard  ───────┼┼─►  AI model
   text you type ───────┘    regex · Luhn · entropy  ││    sees <REDACTED>
                                   │                  ││
                                   ▼                  ││
              real secret  ✕  stops here — never crosses
              log: kind + placeholder only (never the value)
```

**What's a hook?** A function opencode calls at one moment in its own flow — like
a checkpoint on the road the data travels. opencode pauses, hands your function
the text, you clean it, and it continues. It only runs when triggered; it is not
a background process.

It uses two such hooks:
- `tool.execute.after` — masks secrets in file/command output an agent reads.
- `experimental.chat.messages.transform` — masks secrets you type into chat,
  *and* re-masks tool results in the history — which is also what catches the
  output of MCP servers (their text is only assembled *after* the tool hook
  fires, so the chat hook is the backstop for them).

The key part of the code is tiny — the hook rewrites the text *in place* before
it ever leaves:

```js
// runs right after any tool returns, before the model sees the result
'tool.execute.after': (input, output) => {
  // output.output is the text about to go to the model — rewrite it in place
  output.output = redact(output.output);   // secrets → <REDACTED:AWS-KEY-1>
}
```

`redact()` is the deterministic detector (regex · Luhn · entropy) — no network,
no AI. The chat hook is an experimental engine API; it's stable on current
opencode but may change — the file-read masking does not depend on it.

## The same engine works beyond opencode

The detection here (regex + Luhn checksum + entropy) is the **same brain** used
by the standalone `codebuddy-redact` tool, which masks secrets in *any* AI tool
(Cursor, ChatGPT, Claude Desktop, …) by cleaning your text before you paste it.
One detector, many hooks — only the thin hook changes per surface:

```
   opencode plugin ─┐
   standalone CLI  ─┼─►  detection core  (regex · Luhn · entropy)
   clipboard guard ─┘         same rules on every surface
```

This opencode plugin is one "hook" onto that brain; the standalone is another.
If you want automatic masking inside a different tool, you write a thin hook for
that tool and reuse the same detection rules — you don't reinvent the detector.

- **opencode** → this plugin (automatic, every agent).
- **any AI tool** → the standalone `codebuddy-redact` (run it on your text).
- **other editors / a clipboard guard** → a small adapter calling the same rules.

## License

MIT © Richard Jacob Monde Gubangxa. Not affiliated with or endorsed by the
opencode team.
