# Publishing this plugin as its own repo

This folder is a complete, self-contained opencode plugin. Here's how to turn it
into a public repo people can install from. There is **no server** — a plugin is
a file people install, so "deploy" just means "publish the files."

> Replace `richardgubangxa` below with your real GitHub username if different,
> and confirm the npm name `opencode-plugin-codebuddy-redact` is free
> (https://www.npmjs.com/package/opencode-plugin-codebuddy-redact — a 404 means
> it's available).

---

## Step 1 — make this folder its own repo

Copy it out of the monorepo so it stands alone (the parent `code-buddy` is
already a git repo; nesting another inside is messy):

```bash
cp -r codebuddy-redact-opencode ~/opencode-plugin-codebuddy-redact
cd ~/opencode-plugin-codebuddy-redact
git init
git add .
git commit -m "Code Buddy redaction guard for opencode"
```

## Step 2 — create the GitHub repo and push

You need the GitHub CLI signed in once: `gh auth login` (follow the prompts).

```bash
gh repo create opencode-plugin-codebuddy-redact --public --source=. --push
```

That creates the repo and pushes in one go. Done — people can now install it by
copying `plugin/codebuddy-redact.mjs` (see the README).

*(Manual alternative if you don't use `gh`: create the repo on github.com, then
`git remote add origin https://github.com/<you>/opencode-plugin-codebuddy-redact.git`
and `git push -u origin main`.)*

## Step 3 (optional) — publish to npm

Only if you want `npm install` to work. Sign in once: `npm login`.

```bash
npm publish --access public
```

Now anyone can:
```bash
npm install -g opencode-plugin-codebuddy-redact
```
and add `"plugin": ["opencode-plugin-codebuddy-redact"]` to their opencode config.

## Step 4 — how users install it (this is in README.md)

Simplest, no npm needed:
```bash
mkdir -p ~/.config/opencode/plugin
cp plugin/codebuddy-redact.mjs ~/.config/opencode/plugin/
```
Restart opencode — the guard is active on every agent.

---

## Updating later

Make your change, then:
```bash
git add . && git commit -m "..." && git push
# if on npm, bump the version and republish:
npm version patch && npm publish
```

## What NOT to do
- Don't publish `.codebuddy/` (redaction logs) — it's in `.gitignore`.
- Don't add secrets to the repo — this is a public package.
