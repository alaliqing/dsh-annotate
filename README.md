# dsh-annotate

Point at a rendered element in your running app, write the note, and hand it to
**DeepSeek Harness** — inside the harness, from a native right-sidebar tab.

Two Cordis plugins:

| Package | What it does |
| --- | --- |
| [`dsh-annotate`](packages/dsh-annotate) | Right-sidebar review tab: same-origin preview, element picking, comments, live style tweaks, one structured block into the composer. Starts and stops the dev server itself. |
| [`dsh-app-bridge`](packages/dsh-app-bridge) | Same-origin bridge: reverse-proxies a local dev server (all methods + WebSocket) onto the harness origin under `/app/`. |

## Why the bridge is not optional

Annotating elements inside an `<iframe>` means reading that document's DOM, and
the browser only allows it Same-Origin. A dev server on `localhost:5173` is a
*different* origin from the harness on `127.0.0.1:3080`, so no overlay — however
clever — can reach into it. Existing DSH preview plugins agree: they proxy
*external* sites and deliberately skip loopback, which is exactly the case that
matters when you are building the app yourself.

`dsh-app-bridge` closes that gap by serving the dev server **on the harness
origin**:

```
dev server (base /app/)            harness origin
http://127.0.0.1:5180/app/   <--   http://127.0.0.1:3080/app/     ← previewed here
                                   (same origin ⇒ DOM is readable ⇒ annotatable)
```

Everything the app needs — assets, HMR socket, its own `/app/api/*` calls —
stays under `/app/`, so nothing collides with the harness' own `/api/*`.

## Install (private, from disk)

```bash
# in the DSH profile that should load them
cd ~/.dsh/profiles/web
pnpm add link:<path-to-repo>/packages/dsh-app-bridge
pnpm add link:<path-to-repo>/packages/dsh-annotate

# mount them (cordis.patch.yml)
#   - insert:
#       - name: dsh-app-bridge
#         config: { target: http://127.0.0.1:5180, prefix: /app }
#       - name: dsh-annotate

# restart the harness
dsh web
```

## Pointing it at a project

Two config blocks have to agree, and the project has to serve under one prefix:

```yaml
- insert:
    - name: dsh-app-bridge
      config: { target: "http://127.0.0.1:5180", prefix: "/app" }
    - name: dsh-annotate
      config:
        command: "npm run dev:panel"   # or argv: [...]; default `npm run dev:panel`
        port: 5180                     # default 5180
        base: "/app"                   # default /app
```

```json
{ "scripts": { "dev:panel": "IDD_BASE=/app/ vite --host 127.0.0.1 --port 5180 --strictPort" } }
```

`dsh-annotate` runs that command in the session's workspace when the tab opens,
waits for the port, and reuses an already-running server instead of fighting for
the port. Browser-facing API paths must follow the base (`import.meta.env.BASE_URL`)
or they will miss the prefix. Nothing else about the project is assumed — the
bundled `examples/demo-app` is a zero-dependency example that satisfies exactly
these requirements.

Then: `⌘⇧B` (or `⌘⇧A`, the conversation header's **标注** button, or the right
sidebar's `+` → guide entry) → the preview loads → pick elements, write notes,
optionally tweak styles live → **发给 AI** puts one structured block in the
composer.

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
- `pnpm` on PATH for `dsh plugin` commands (or `npx pnpm@10`)
- The consuming project: Node + a dev server that accepts a base prefix

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

## Status

Private tooling, not published. MIT licensed, see [LICENSE](LICENSE) and
[NOTICE](NOTICE).
