# dsh-annotate

Point at a rendered element in your running app, write the note, and hand it to
**DeepSeek Harness** — inside the harness, from a native right-sidebar tab.

Two Cordis plugins:

| Package | What it does |
| --- | --- |
| [`dsh-annotate`](packages/dsh-annotate) | Right-sidebar review tab: same-origin preview, element picking, comments, live style tweaks, one structured block into the composer. Starts and stops the dev server itself. |
| [`dsh-app-bridge`](packages/dsh-app-bridge) | Same-origin bridge: reverse-proxies a local dev server (all methods + WebSocket) onto the harness origin under `/app/`. |

## Quickstart

### A. Just try it (nothing of yours involved)

```bash
cd ~/codeData/private_program/dsh-annotate     # this checkout
node scripts/dev.mjs
```

Starts the bundled fixture plus a dedicated DSH profile with **no
configuration**, and prints a URL like `http://127.0.0.1:3099/?token=…`. Open it
→ open a conversation → <kbd>⌘</kbd><kbd>⇧</kbd><kbd>B</kbd> → the fixture is
listed → click it → annotate.

### B. Use it on your own project

1. **Install one package** into your profile.

   `dsh plugin` shells out to `pnpm`, so if `pnpm` is not on your PATH either
   install it once (`npm i -g pnpm`) or skip it and run pnpm inside the profile:

   ```bash
   REPO=~/codeData/private_program/dsh-annotate     # this checkout
   cd ~/.dsh/profiles/web
   npx --yes pnpm@10 add link:$REPO/packages/dsh-annotate
   ```

   Then append this to `~/.dsh/profiles/web/cordis.patch.yml`:

   ```yaml
   - insert:
       - name: dsh-annotate
   ```

   and restart the harness (`dsh web`). The mount is read at boot, so an
   already-running harness keeps the old state until it restarts.

2. **Start your dev server the way you always do** (`npm run dev`, `pnpm dev`,
   whatever it is). You do **not** tell the plugin about it, and it does **not**
   need a base prefix or a special script.

3. **Open the tab** (`⌘⇧B`, or the conversation header's **标注** button, or the
   right sidebar's `+` → guide entry). It lists the local web servers that are
   actually running, with their page titles. Click one → the page loads → pick
   elements, write notes (optionally tweak styles live) → **发给 AI**, or
   <kbd>⌘</kbd>/<kbd>Ctrl</kbd>-click an element to write and send in one step.

4. Nothing running? The tab says so and shows the command to run (read from the
   session workspace's `package.json`), with a copy button. Refresh and it
   appears.

An address bar is always there if you would rather type one: `5173`,
`localhost:3000/x` and full URLs all work.

### Optional overrides

Everything below is unnecessary for the normal path:

```yaml
- insert:
    - name: dsh-annotate
      config:
        command: "npm run dev:panel"   # let the plugin start it for you
        port: 5180
        base: "/app"
        proxyPrefix: "/__dsh_anno"     # where proxied pages are mounted
        detect: { extraPorts: [4321], probeTimeoutMs: 900 }
```

`command` turns on the toolbar's start/stop controls; without it the plugin
never touches your processes. `packages/dsh-app-bridge` remains for people who
prefer a fixed mount of a base-prefixed dev server (higher fidelity, more
setup).

### When something is off

| Symptom | Cause / fix |
| --- | --- |
| `⌘⇧B` does nothing | The conversation has no content yet, so no header/sidebar surface exists — use a conversation that already has messages. |
| The list is empty but a server is running | It may not answer `GET /` with HTML, or it is on an unusual port: add `detect.extraPorts`, or type the address by hand. |
| Preview is blank, assets 404 | The app builds absolute URLs the shim cannot see (rare) — set `proxyPrefix` aside and try `dsh-app-bridge` with a base-prefixed dev server instead. |
| No component chain in an annotation | Component names come from a React dev build's fiber; non-React pages omit that line. |

## Why a proxy is involved (you never see it)

Annotating elements inside an `<iframe>` means reading that document's DOM, and
the browser only allows it Same-Origin. A dev server on `localhost:5173` is a
*different* origin from the harness on `127.0.0.1:3080`, so no overlay — however
clever — can reach into it. Existing DSH preview plugins agree: they proxy
*external* sites and deliberately skip loopback, which is exactly the case that
matters when you are building the app yourself.

So the plugin serves the picked page **on the harness origin**, automatically:

```
detected            http://127.0.0.1:5173/settings
loaded as           <harness>/__dsh_anno/<encoded target>/settings
mapped back to      http://127.0.0.1:5173/settings
```

Root-absolute URLs (`/src/main.tsx`, `/@vite/client`) are the hard part: a
`<base>` cannot help, because parsing `/x` replaces the whole path. So the proxy
rewrites them in HTML, injects an import map for the module graph, and a small
shim prefixes what only appears at runtime (`fetch`, `XHR`, `EventSource`,
`WebSocket`, `pushState`). Upgrades go through one relay path, and the app's
cookies are scoped per target so nothing leaks into the harness. Only loopback
targets are ever probed or opened.

## Install (private, from disk)

The short version is in [Quickstart](#b-use-it-on-your-own-project); this is the
same thing spelled out, for a profile that has never had the plugin:

```bash
REPO=~/codeData/private_program/dsh-annotate       # this checkout

# 1. the package (pnpm is what `dsh plugin` shells out to; this form needs none)
cd ~/.dsh/profiles/web
npx --yes pnpm@10 add link:$REPO/packages/dsh-annotate

# 2. the mount — append to ~/.dsh/profiles/web/cordis.patch.yml
#    - insert:
#        - name: dsh-annotate

# 3. restart the harness (mounts and host halves are read at boot)
dsh web
```

Then, with any local dev server running: <kbd>⌘</kbd><kbd>⇧</kbd><kbd>B</kbd> →
pick it from the list → annotate → **发给 AI** (or <kbd>⌘</kbd>-click to send at
once). Nothing about the project has to be configured, and nothing in the project
has to change.

Optional, for projects whose URLs defeat the shim (rare): `dsh-app-bridge` can
mount a base-prefixed dev server at a fixed path instead —

```yaml
- insert:
    - name: dsh-app-bridge
      config: { target: "http://127.0.0.1:5173", prefix: "/app" }
```

## Using the panel

```
←  →  ⟳   [ address ]                      ☰   ?      ← navigation, list, help
┌───────────────────────────────────────────────────┐
│                  the page you picked              │
├───────────────────────────────────────────────────┤
│ ① button.idd-… · 这个框和左边不一样高              │  annotations, newest last
├───────────────────────────────────────────────────┤
│  ✎ 标记    ↗ 打开                    2 条    [发送] │  actions at the bottom
└───────────────────────────────────────────────────┘
```

- **标记** turns element picking on; click an element in the page, write the note,
  <kbd>Enter</kbd> saves it. **<kbd>Esc</kbd> leaves picking** — browse, scroll or
  follow a link, then press 标记 again to keep annotating.
- <kbd>⌘</kbd>/<kbd>Ctrl</kbd>-click an element to write and send in one step.
- **「样式」** in the card edits font size, padding, gap, radius and colours, live
  on the page; the edits travel with the annotation.
- **发送** delivers the collected annotations straight to the conversation.
  <kbd>⌥</kbd>/<kbd>Alt</kbd>+click keeps them in the composer instead, if you want
  to add your own words first. If the harness refuses the automatic send (for
  example a session owned by another instance), the block stays in the composer
  with a chip and the panel says so.
- **?** (top right) opens the short version of all of this.

## What an annotation carries

Enough to find the element without a screenshot: selector path **and how many
elements it matches**, `role` / `aria-label` / `alt` / `name` / `data-testid`,
the **component chain**, size, position and viewport placement, computed styles,
the visible text, and any live style edits.

```
#1 button.idd-visual-select-trigger  组件:VisualSelect
   语义: aria-label="Content typeface"
   组件链: VisualSelect > TypefacePicker > ThemeRecipeSettings
   选择器: div#idd-settings-panel-appearance > section... > button.idd-visual-select-trigger（命中 1 个元素）
   位置/尺寸: 211×45 @ (1346, 348) · 视口 中右（91%W × 52%H）
   当前样式: display:grid; padding:5px 12px 5px 6px; border-radius:9px; ...
   批注: 这个和左侧的这个框不是一样高，看起来有点奇怪
```

Screenshots were tried and dropped: they are a second render (scroll position,
transient state and data may differ from what the reader saw), they carry no DOM
truth, and the structured fields above already identify the element. For visual
defects the note describes the symptom, and the fix is verified by re-rendering.

## Requirements

- DeepSeek Harness with a web profile (`dsh web`)
- `pnpm` on PATH for `dsh plugin` commands, or `npx --yes pnpm@10` (needed once,
  to install)
- A local dev server to look at — anything that answers `GET /` with HTML on a
  loopback port. No configuration, no base prefix, no special script
- Playwright only to run this repo's tests

## Development

```bash
node packages/dsh-annotate/build.mjs     # src/ -> lib/ (lib is committed so
                                          # `link:` installs work unbuilt)
node --check packages/dsh-annotate/lib/client.js
```

One command brings up the whole loop against the bundled fixture, on its own
profile and port, without touching your daily harness:

```bash
node scripts/dev.mjs                      # or --base /demo/ --app-port 5199 --port 3099
```

`tests/` holds two Playwright checks against a running harness: `overlay.mjs`
drives the injected overlay on a bare page, `gui-smoke.mjs` walks the whole
sidebar-tab flow (auto-start → preview → annotate → send). See
[DEVELOPING.md](DEVELOPING.md) for the restart matrix, the config reference and
the fixture's ground rules.

## Direction

The target shape is Codex's in-app browser, scoped to **local** web: open the
sidebar tab, it lists the local dev servers that are actually running, one click
opens one — and annotation works on it immediately, with no per-project
configuration. Install once, restart once.
[docs/PLAN-sidebar-browser.md](docs/PLAN-sidebar-browser.md) has the plan,
including the one non-obvious requirement (a page on `:5173` is cross-origin
from the harness, so detection has to be paired with a loopback proxy on the
harness origin to be annotatable at all).

## Status

Private tooling, not published. MIT licensed, see [LICENSE](LICENSE) and
[NOTICE](NOTICE).
