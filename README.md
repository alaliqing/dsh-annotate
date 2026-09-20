# dsh-annotate

[![CI](https://github.com/alaliqing/dsh-annotate/actions/workflows/ci.yml/badge.svg)](https://github.com/alaliqing/dsh-annotate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-annotate.svg)](https://www.npmjs.com/package/dsh-annotate)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/node/v/dsh-annotate.svg)](package.json)

**Point at the UI, not at the code.** A review panel for the
[DeepSeek Harness](https://www.npmjs.com/search?q=%40deepseek-ai%2Fdsh) web
client: open a local app you are already running, click the elements you want
changed, write a note on each, and send the whole review to the conversation as
one structured block.

The panel lives in a normal sidebar tab, so it behaves like part of the harness
rather than a bolted-on tool.

![The annotation panel next to a previewed app: the toolbar, the annotation list and a numbered marker on the page](docs/panel-overview.png)

*The suite's own fixture: the toolbar, the in-flow annotation list, and a marker
attached to a picked element. Regenerate with `npm test`.*

```
  ⌘⇧B  →  pick a running local service  →  click an element  →  write a note
        →  Send annotations (or Add to composer)  →  the agent gets selectors,
           component names, geometry and computed styles with your comment
```

## Requirements

- Node.js 20 or newer.
- A DeepSeek Harness instance whose web client you can restart. The harness
  packages (`@deepseek-ai/dsh-*`) are public on npm.
- Chromium is the validated browser. See [limits](#preview-architecture-and-limits).

Nothing else: `dsh-annotate` ships no runtime dependencies, and the built files
are committed, so an install needs no build step.

## Install

Into a harness profile, with pnpm (what `dsh plugin` forwards to):

```sh
dsh plugin --profile web add dsh-annotate
```

Then add the plugin to that profile's `cordis.patch.yml`:

```yaml
- insert:
    - name: dsh-annotate
```

Restart `dsh web`. Without pnpm on `PATH`, install it manually:

```sh
cd ~/.dsh/profiles/web
npx --yes pnpm@10 add dsh-annotate
```

To run a checkout instead of the published package:

```sh
cd ~/.dsh/profiles/web
npx --yes pnpm@10 add "link:/absolute/path/to/dsh-annotate/packages/dsh-annotate"
```

Host-side changes need a harness restart; client-only changes need a page
refresh.

## Review a local app

1. Start the project's own development server, the way you normally would.
2. Open a conversation and press `⌘/Ctrl⇧B`, or use the **Annotate** header
   button, or the sidebar `+` guide. The harness needs a materialized
   conversation/sidebar surface; an empty welcome screen may not have one.
3. Pick a detected service, or type `5173`, `localhost:3000/path`, or a local
   URL. The list refreshes every five seconds while it is visible, and both IPv4
   and IPv6 are probed.
4. Press **Mark**, click an element, and write your note.

   | Key | Effect |
   | --- | --- |
   | `Enter` | Save and keep marking |
   | `Shift+Enter` | Newline |
   | `Esc` | Cancel the editor and leave marking mode |
   | `⌘/Ctrl`+click | Save this note and send the batch immediately |

   Confirming a Chinese IME candidate is not treated as a save.
5. Choose **Add to composer** to merge the review into your draft, or **Send
   annotations** to send the review alone.

Sending goes through the addressed harness session and waits for acceptance. A
rejected send keeps the annotations; unrelated composer text and attachments are
never touched. If the agent is busy, the review queues.

Markers track their live element through window and nested scrolling, resizing
and layout shifts. A marker whose element is clipped or gone is hidden rather
than left at stale coordinates. Click a marker to edit its note, or open the
**annotations** button in the toolbar for an in-flow list that can locate and
delete comments without covering the preview. Deletion can be undone.

## Language

The panel ships in English and Chinese. It starts from your browser language and
the toolbar button (`中` / `EN`) switches it; the choice is remembered per
browser and is pushed into the previewed page, so the overlay's own labels follow.

Strings live in [`src/i18n.js`](packages/dsh-annotate/src/i18n.js), and
`npm run check` fails if the two languages drift apart.

## Preview architecture and limits

The hard part is that a page served from `http://127.0.0.1:5173` is a different
origin from the harness, and a cross-origin iframe's DOM cannot be read — so no
overlay can annotate it. The plugin solves that with **one loopback preview
origin per session and app**:

- A dedicated ephemeral HTTP server on `localhost` or `127.0.0.1`, deliberately
  the *opposite* hostname from the harness, so the two never share an origin.
- The browser sees the app's original paths: `/settings` stays `/settings`.
  Root-absolute scripts, styles, SPA routes and WebSocket upgrades therefore work
  with no proxy path prefix and no `<base>`.
- The host injects a small shim (absolute fetch/XHR/EventSource/WebSocket URLs,
  SPA navigation reports) plus the overlay, into every HTML document.
- The overlay and the panel talk over `postMessage`, checked on both sides by
  source **and** origin. The panel never reaches into the preview's DOM.
- Proxy targets are restricted to `localhost`, `127.0.0.1` and `[::1]`. External
  hosts, credentials in the URL, and the harness itself are rejected, for both
  HTTP and WebSocket upgrades.
- Host API writes are rejected unless they come from the harness's own origin.
- App cookies are namespaced and sent as `SameSite=None; Secure; Partitioned`;
  non-prefixed cookies are stripped in both directions. Chromium is the validated
  engine for partitioned cookies.
- Preview servers and their sockets close when the plugin is disposed. At most 24
  session/app previews are retained per boot.

An earlier design proxied the app under a path prefix on the harness origin. It
was removed outright rather than kept behind an option: it isolated nothing, and
it put an unauthenticated WebSocket tunnel to any loopback port on the harness
origin.

This is a local development preview, not a general-purpose browser:

- Origin-sensitive apps may need app-specific setup or a normal browser: OAuth
  redirects, origin allowlists, hard-coded origins, and service workers.
- HTTPS upstreams use normal certificate validation. An untrusted certificate
  fails visibly; validation is never silently disabled.
- A CSP that forbids inline scripts can prevent injection. HTTP CSP headers are
  removed on the preview, but in-document policies still apply.
- Shadow DOM internals and cross-origin child frames are not selectable. Canvas
  content is selectable as a canvas element, not as individual drawn objects.
- Remote harness instances, HTTPS reverse-proxy deployments, and reaching a
  host's loopback services from another computer are out of scope for a
  local-only design.
- The preview is trusted local code, not a security boundary between you and the
  app you chose to preview.

## What an annotation carries

Each note is sent with the evidence an agent needs to find the element again:

| Field | Content |
| --- | --- |
| Location | Original URL, page, viewport size, and the element's zone in the viewport |
| Identity | Escaped CSS selector, how many elements it matches, tag, first class |
| Semantic anchors | `role`, `aria-label`, `alt`, `name`, `data-testid` when present |
| Component | Nearest component name and the component chain (needs a development build) |
| Geometry | Width × height and position |
| Styles | A small set of computed values, as evidence — not an editing tool |
| Text | The element's visible text, when short enough to be useful |
| Note | Your comment |

No screenshots are taken and no style is changed by the payload.

Annotations and in-progress drafts are scoped to the harness session plus the
full app URL (query and hash included), so SPA routes restore independently.
They are mirrored in the preview origin's storage and on the harness side, so a
reload does not lose the review. Old `v1` records are left untouched rather than
guessed into an unrelated session.

## Configuration

Everything is optional; the panel uses discovery and needs no configuration.

```yaml
- insert:
    - name: dsh-annotate
      config:
        detect:
          extraPorts: [4321]     # always probe these, beyond the common list
          probeTimeoutMs: 900    # per-port HTTP probe budget
          cacheMs: 2000          # how long a scan result is reused
          staticPorts: false     # true (default) also probes the common list
```

Process control is off unless you configure it. The host API accepts `command`
(space-separated) or `argv` (preferred when paths contain spaces), plus `port`,
`base` and `readyTimeoutMs`. The panel does not expose start/stop buttons: by
default the plugin never starts or stops your development server, and only ever
opens one you started.

## `dsh-app-bridge`

A second, small package in this repository, for the case where an app must be
mounted at a **fixed path on the harness origin** (for example a base-prefixed
dev server that cannot be served any other way):

```yaml
- insert:
    - name: dsh-app-bridge
      config:
        target: http://127.0.0.1:5180   # must be a loopback http(s) URL
        prefix: /app                    # where it appears on the harness origin
        # wsPaths: ['/app/', '/app']    # optional; defaults to both spellings
        # forwardCredentials: false     # default; see below
```

It registers one prefix route (streamed both ways, so SSE works) and HTTP upgrade
routes for the dev server's WebSocket. Because the bridged app shares the harness
origin, the harness's cookies and `Authorization` header would be visible to it
and its `Set-Cookie` would land on the harness origin; credentials are stripped in
both directions unless you opt in with `forwardCredentials: true`.

It is a proxy and nothing more — it injects no script. Prefer the ordinary
`dsh-annotate` preview, which does not share an origin with the harness at all.

## Development

```sh
npm ci
npx playwright install chromium
npm run check   # build lib/, syntax-check every file, validate the i18n catalog
npm test        # distributions guard + assertion-based Chromium suite
```

`npm test` starts disposable loopback services and drives the real built client,
shim and overlay through a React fixture. It covers discovery, preview isolation,
path preservation, cookie/fetch/WebSocket round-trips, Chinese IME, nested wheel
scrolling, clipping, layout shifts, route and session separation, rejected and
accepted sends, attaching, the language switch, and narrow layouts. No model is
called. Screenshots are written to the ignored `tests/shots/`.

For a live harness, `node scripts/dev.mjs` seeds a throwaway profile and runs the
bundled fixture against it. See [CONTRIBUTING.md](CONTRIBUTING.md).

| Path | What it is |
| --- | --- |
| `packages/dsh-annotate/` | The plugin: host half, client half, injected shim and overlay |
| `packages/dsh-app-bridge/` | The fixed-mount reverse proxy |
| `examples/demo-app/` | Dependency-free fixture app used by the dev loop and tests |

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for
the build rule that trips people up (`lib/` is generated *and* committed) and the
test expectations. For a security problem, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.

## License

[MIT](LICENSE), with third-party attribution in [NOTICE](NOTICE).
