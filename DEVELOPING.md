# Developing the plugin

## TL;DR

```bash
cd ~/codeData/private_program/dsh-annotate
node scripts/dev.mjs            # or: --base /demo/ --app-port 5199 --port 3099 --open
```

That creates a **dedicated** DSH profile (`~/.dsh/profiles/dsh-annotate-dev`)
which loads both packages from this checkout and previews the bundled fixture,
boots the harness on its own port, and prints the tokenised URL. Your daily
profile is never touched.

Then: open a conversation, press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>B</kbd>. The tab
starts the fixture dev server itself — no terminal juggling, no URL typing.

## What needs a restart

| You changed | To see it |
| --- | --- |
| `packages/dsh-annotate/src/client.js`, `src/overlay.js` | `npm run build`, then **refresh the page** (the client half is served per file revision) |
| `packages/dsh-annotate/src/host.js` | `npm run build`, then **restart `scripts/dev.mjs`** (host plugins load at boot) |
| `packages/dsh-app-bridge/lib/index.js` | restart `scripts/dev.mjs` |
| `examples/demo-app/*` | just reload the preview (it is served with `no-store`) |

`npm run check` = build + syntax-check both halves, and CI asserts `lib/` matches
`src/` — so run `npm run build` before committing.

## Configuration

`dsh-annotate` takes everything project-specific from the profile patch:

```yaml
- name: dsh-annotate
  config:
    command: "npm run dev:panel"      # or argv: ["node", "/abs/server.mjs", "--port", "5180"]
    port: 5180                        # where that dev server listens
    base: "/app"                      # the prefix it serves under
    readyTimeoutMs: 45000             # how long start() waits for the port
```

```yaml
- name: dsh-app-bridge
  config:
    target: "http://127.0.0.1:5180"   # same host:port as above
    prefix: "/app"                    # same prefix as above
    # wsPaths: ["/app/", "/app"]      # defaults to both spellings
```

`command`/`port`/`base` must agree with the bridge's `target`/`prefix`, and the
project must serve its own assets under that prefix (`vite --base=/app/`), or its
asset URLs escape the prefix and land on the harness root.

## Previewing a real project instead of the fixture

1. In that project, add a script that serves the dev build under a prefix:
   `"dev:panel": "IDD_BASE=/app/ vite --host 127.0.0.1 --port 5180 --strictPort"`
   and make browser-facing API paths respect the base.
2. Point a profile at it:

```yaml
- insert:
    - name: dsh-app-bridge
      config: { target: "http://127.0.0.1:5180", prefix: "/app" }
    - name: dsh-annotate
      config: { command: "npm run dev:panel", port: 5180, base: "/app" }
```

3. Restart the harness. The tab runs that command **in the session's workspace**,
   so a relative command is fine here.

## The fixture

`examples/demo-app` is a zero-dependency, prefix-aware static server plus a page
with the layouts the overlay has to survive: card grid, form with `textarea`,
scroll region, fixed badge, two side-by-side pickers that must stay equal height,
a token list and a live contrast readout. It also exposes `POST api/echo` and an
SSE `api/stream`, so the bridge is exercised for real (methods, bodies, streaming).

It is deliberately not a React app: the **component chain** in an annotation only
appears when the previewed page runs a React dev build (the overlay reads the
fiber). Everything else — selector, match count, semantic anchors, computed
styles, viewport placement, live style tweaks — works on any page.

## Tests

```bash
PLAYWRIGHT_MODULE=~/path/to/project/node_modules/playwright/index.mjs npm run test:gui
# or install it here once: pnpm install
npm run test:overlay     # drives the injected overlay on a bare page
```

`test:gui` walks the whole flow against a running harness (pass the tokenised
URL as argv) — auto-start, preview, pick, style edit, send.

## Gotchas

- A bridge `prefix` of `/` would fight the harness for its own root: use a real
  prefix such as `/app`.
- Without a `command`, the host half assumes `npm run dev:panel`; if the project
  has no such script the tab reports the failure and shows the log (▤ in the
  toolbar) instead of silently doing nothing.
- `lib/` is committed on purpose: `pnpm add link:…` installs then work without a
  build step. CI fails if `lib/` drifts from `src/`.
- The fixture and the harness are separate processes; stopping `scripts/dev.mjs`
  stops the harness, and the fixture (started by the plugin) goes with it.
