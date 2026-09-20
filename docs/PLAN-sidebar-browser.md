# Plan: sidebar annotation for whatever local web is running

> **Historical document.** This is the plan that produced discovery and the
> two-face pane, and it is kept for the reasoning it records. Its **proxy
> design is superseded**: the shipped plugin previews each app on its own
> isolated loopback origin, so the app's own paths are preserved and its DOM and
> web storage stay out of the harness. There is no `/__dsh_anno/<enc>/…` route
> and no `legacyProxy` option. The validation scripts this document names
> (`tests/proxy.mjs`, `tests/gui-smoke.mjs`) were removed; `tests/reliability.mjs`
> is the current acceptance suite. See [DEVELOPING.md](../DEVELOPING.md) and
> [PLAN-reliability-and-ux.md](PLAN-reliability-and-ux.md) for the current state.

> **Status at the time.** Work 1–3 were implemented and verified: discovery
> (`detect`), the dynamic loopback proxy (with `<base>` + shim, per-target
> cookies, WS relay) and the two-face pane.

> Replaces the earlier "annotate any web" draft. Scope is deliberately small:
> **local web only, zero configuration, discovery instead of setup.**

## The shape we want

1. Open the sidebar tab. It lists the **local web servers that are actually
   running** (port, URL, page title), best guess first.
2. Click one → it opens in the pane → **annotation works immediately**. Or type
   any address in the address bar and open that instead.
3. Nothing detected → say so, and **hint how to start one** (the session
   workspace's own dev scripts), instead of silently doing nothing.
4. Comments go back to the conversation as one structured block (already done).
5. Install once, restart once, no per-project configuration. Forever after, the
   capability is just there.

## The one non-obvious requirement

"Detect → open → annotate" only works if we can reach **into** the opened page.
A page served by `http://127.0.0.1:5173` is a *different origin* from the harness
on `http://127.0.0.1:3080`, and the browser forbids reading a cross-origin
iframe's DOM. So detection is the visible half; the enabling half is a **local
proxy on the harness origin**:

```
detected            http://127.0.0.1:5173/settings
loaded as           <harness>/__dsh_anno/<base64url("http://127.0.0.1:5173")>/settings
proxy maps back to  http://127.0.0.1:5173/settings   (+ <base> injection, upgrades)
```

This is what lets us drop the old `target`/`prefix`/`base`/`command`
configuration: the target is whatever the user picked, decided per request.

Because it is loopback-only, the awkward parts of a general proxy (public sites,
login flows, CSP on third-party content) simply do not apply.

## Work

### 1. Discovery (host half)

New RPC `detect`:

- list loopback TCP listeners (`lsof -nP -iTCP -sTCP:LISTEN` on macOS,
  `/proc/net/tcp` on Linux, `netstat` fallback);
- HTTP-probe each one (`GET /`, 800 ms) and keep what looks like a page;
- return `{ port, url, title, status }`, common dev ports first (5173, 3000,
  4173, 5180, 8080, 8000, 5000, 5500, 9000), cached for a couple of seconds;
- never probes anything off loopback.

### 2. Local proxy (host half)

- One route prefix, target encoded in the path (static `target`/`prefix` stays as
  an optional override for people who want a fixed mount).
- `<base href>` injection so root-absolute asset/API URLs resolve inside the
  proxy; rewrite `Location`/`Content-Location`; drop `X-Frame-Options` and
  `frame-ancestors` for the proxied response.
- Dynamic upgrade routing so dev-server HMR sockets survive.
- A small injected shim prefixing `fetch`/`XHR`/`EventSource`/`WebSocket` calls
  that were built from `location.origin` (the usual SPA failure mode).

### 3. The pane (client half)

- **No page open** → the detected list as one-click rows, the address bar below
  it, and a hint line: what to run (read from the session workspace's
  `package.json` scripts, e.g. `npm run dev`) if the list is empty.
- **Page open** → the current stage, plus back / forward / reload / `⌘L`, and a
  "back to the list" affordance. Keep `⌘⇧B`, the conversation-header button and
  the sidebar guide entry as the ways in.
- Non-local addresses are allowed to open but are labelled for what they are
  (no support promise), so the panel never implies more than it delivers.

### 4. Installation

- Fold the proxy into `dsh-annotate`; `dsh-app-bridge` remains published for
  fixed mounts.
- Install = `dsh plugin --profile web add dsh-annotate` + one restart. No YAML
  block, no project-side script, no base prefix.
- Auto-starting a dev server (`command`) is demoted to an optional override; the
  default is: detect and hint.

## Kept as-is

Annotation payload (selector + match count + semantic anchors + component chain +
viewport placement + style edits), the sidebar tab shape, live style tweaks,
composer chips and ⌘-click instant send, the fixture app and `scripts/dev.mjs`.

## Acceptance

- With `examples/demo-app` running **without any base prefix** on 5199, the tab
  lists it by itself; one click opens it; an annotation on it reaches the
  composer with the right selector.
- With nothing running, the tab explains how to start something instead of
  showing an empty pane.
- Typing any loopback URL by hand behaves exactly like picking it from the list.
- `tests/gui-smoke.mjs` passes against a discovered (not configured) target.
