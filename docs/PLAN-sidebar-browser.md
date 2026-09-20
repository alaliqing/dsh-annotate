# Plan: sidebar browser with annotation (Codex-shaped)

## The expectation, restated

1. The right sidebar **is a browser**: open any URL — a local dev server, a file,
   a public page. The plugin does not decide which URL matters.
2. When a page is open, **annotating it is one gesture** (a mode/toggle), and the
   comments land in the conversation as something DeepSeek can act on.
3. Install **once**, restart **once**, then the capability is permanent and
   applies to whatever the user opens. No per-project wiring.
4. At most, the plugin may **suggest** a URL (never require one).

## Where we are today

| Expectation | Current state | Verdict |
| --- | --- | --- |
| Sidebar is a browser (any URL, navigation) | Address bar + reload + pick mode; one URL per session; no back/forward | **Partial** |
| Annotate any page | Only **Same-Origin** pages, and only those mounted by a statically configured bridge (`target`/`prefix`) | **No** |
| No per-project wiring | Install requires `command`/`port`/`base` on the plugin *and* `target`/`prefix` on the bridge *and* the project must serve under that prefix (`--base=/app/`) | **No** |
| Suggest a URL | Nothing | **No** |
| One install, one restart | Two packages, a YAML block, a project-side dev script | **Partial** |
| Comments → DeepSeek from the composer | Structured block, chips, ⌘-click instant send | **Yes** |

So the *core* (annotate → structured comment → composer → DeepSeek) is done and
good. What does not match is the **framing**: we built "preview *this project*",
while the expectation is "a browser that can annotate *whatever* is open".

### Why the gap exists (first principles)

Codex's in-app browser reads and injects into arbitrary pages because it owns a
**native WebContents** — a real browser process it controls. A web page (our
plugin) only has an `<iframe>`, and the browser forbids reading a cross-origin
frame's DOM. Nobody can code around that from inside a page. There are exactly
three ways to get "annotate any web":

| Vehicle | Covers | Cost |
| --- | --- | --- |
| A. Same-Origin mount (what we do now) | One project, configured | Zero fragility, but per-project setup |
| B. **Server-side proxy through the harness origin** | Any `http(s)` URL the harness machine can reach — localhost dev servers, file servers, most public pages | Needs HTML rewriting + header surgery; login/CSP-heavy sites stay broken |
| C. **Browser extension / native shell** | Truly any page, including logged-in ones | A second delivery vehicle; not a DSH plugin |

The plan below moves the default from **A (configured)** to **B (automatic)**,
keeps A as an opt-in for pixel-perfect fidelity, and documents C as the honest
escape hatch rather than pretending B covers everything.

## Plan

### Phase 1 — Generic same-origin proxy (the enabling change)

Replace the static mount with a per-request one, so the plugin never needs to be
told about a project:

```
user types            http://localhost:5173/settings
plugin loads          <harness>/__dsh_bridge/<base64url("http://localhost:5173")>/settings
proxy maps back to    http://localhost:5173/settings
```

1. One route prefix (`/__dsh_bridge/`), target encoded in the path; `target`/
   `prefix` config becomes optional (fixed mode kept for compatibility).
2. HTML rewriting on the way out: inject `<base href="<proxied prefix>">` so
   root-absolute asset/API URLs resolve inside the proxy; rewrite `Location` and
   `Content-Location`.
3. Header surgery: drop `X-Frame-Options` / `frame-ancestors`, keep the rest,
   pass cookies through with the proxy's own scope.
4. Dynamic upgrade routing so Vite/Next HMR sockets survive.
5. A tiny injected SDK shim that prefixes `fetch`/`XHR`/`EventSource`/`WebSocket`
   when a page builds URLs from `location.origin` — the main SPA failure mode.

Exit criteria: the fixture, started **without any base prefix**, opens by typing
`http://localhost:5199/` and is fully annotatable; `tests/gui-smoke.mjs` still
passes; a proxy test suite covers rewriting, streaming, upgrades and 502s.

### Phase 2 — Make the sidebar an actual browser

6. Navigation: back / forward / reload / `⌘L` to focus the address bar; the field
   follows in-page navigation.
7. Open-or-proxy decision at load time: Same-Origin → load directly; anything
   else → through the proxy; on failure show a clear notice plus "open in the
   system browser".
8. **Suggestions instead of configuration**: the host half reads the session
   workspace's `package.json` scripts, probes the usual ports (5173, 3000, 4173,
   5180, 8080…) for something listening, and remembers recent URLs. The tab shows
   them as one-click chips ("detected http://localhost:5173 — open"), and typing
   a URL always works.

### Phase 3 — Installation and first-run polish

9. **One package.** Fold the proxy into `dsh-annotate` (keep `dsh-app-bridge` as
   an optional standalone for fixed mounts). Install becomes
   `dsh plugin --profile web add dsh-annotate` + one restart, with **no** YAML
   config and **no** project changes — the `dev:panel`/base-prefix requirement
   disappears for the default path.
10. First-run surface: with no URL yet, show the suggestion chips plus a short
    "how this works" line; the pick-mode toggle and `⌘⇧B` stay the only gestures.

### Phase 4 — Boundaries (explicitly out of scope, or a separate vehicle)

11. Logged-in sites, strict-CSP/anti-proxy sites: the proxy cannot be honest
    here. Document it, detect the common cases (a login redirect, a CSP
    `frame-ancestors` refusal) and say so in the panel.
12. If true "any web" is needed later, the escape hatch is a browser extension
    reusing this same overlay + payload protocol; it is a sibling project, not a
    rewrite of this one.

## What we keep

The annotation data model and payload (selector + match count + semantic anchors
+ component chain + viewport placement + style edits), the right-sidebar tab
shape (push-mode column, flat styling, guide entry, `⌘⇧B`), live style tweaks,
the composer handoff with chips and ⌘-click instant send, the fixture and the
`scripts/dev.mjs` loop.

## What we drop or demote

`command`/`port`/`base` and the bridge's `target`/`prefix` as *required* install
steps: they become optional overrides. The project-side `dev:panel` base-prefix
requirement stops being the documented path (it stays as the high-fidelity
option).

## Risks

- HTML rewriting is inherently lossy: absolute URLs built inside JS, SRI hashes,
  service workers, cookie domains. Mitigation: the injected shim, plus A as an
  opt-in for projects that must be pixel-perfect.
- Proxying public sites raises content-integrity questions; the panel should mark
  proxied pages (a small "proxied" badge) so nobody mistakes the rewritten copy
  for the original.
- Two loaders (direct + proxied) means two code paths in the client: keep the
  decision in one place, and keep the direct path first-class.
