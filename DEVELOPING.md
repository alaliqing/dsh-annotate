# Developing the plugin

## TL;DR

```bash
cd ~/codeData/private_program/dsh-annotate
node scripts/dev.mjs            # or: --base /demo/ --app-port 5199 --port 3099 --open
```

That starts the bundled fixture (an ordinary local web server) plus a
**dedicated, configuration-free** DSH profile (`~/.dsh/profiles/dsh-annotate-dev`)
loading this checkout, and prints the tokenised URL. Your daily profile is never
touched, and nothing in the profile tells the plugin where to look — it has to
*find* the fixture, exactly like a user's own project.

Then: open a conversation, press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>B</kbd>, and click
the fixture in the list.

## What needs a restart

| You changed | To see it |
| --- | --- |
| `src/client.js`, `src/overlay.js` | `npm run build`, then **refresh the page** (the client half is served per file revision) |
| `src/host.js` (discovery, proxy) | `npm run build`, then **restart `scripts/dev.mjs`** (host plugins load at boot) |
| `src/shim.js` | `npm run build`, then reload the previewed page (it is injected per HTML response) |
| `examples/demo-app/*` | reload the preview (served with `no-store`), or restart the script for server-side changes |

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

Nothing to configure: run that project's dev server, open the tab, click it in
the list. That is the whole integration, and it is the path worth keeping
honest — if a real project of yours does not show up or does not annotate, that
is a bug in discovery or in the proxy/shim, not a missing setting. The optional
`command` / `port` / `base` overrides exist for automated setups, and
`dsh-app-bridge` remains for a fixed, base-prefixed mount when a project's URLs
defeat the shim.

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
# with scripts/dev.mjs running (prints the tokenised URL):
PLAYWRIGHT_MODULE=~/path/to/project/node_modules/playwright/index.mjs npm run test:proxy
PLAYWRIGHT_MODULE=~/path/to/project/node_modules/playwright/index.mjs npm run test:gui
PLAYWRIGHT_MODULE=~/path/to/project/node_modules/playwright/index.mjs npm run test:overlay
```

- `test:proxy` — discovery lists the running server, the proxied page loads,
  `<base>` + shim are injected, a `location.origin` fetch is rewritten, and an
  absolute WebSocket is relayed. No GUI needed.
- `test:gui` — the whole product flow: list → click → annotate → send → back to
  the list → reopen by typing only a port.

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
