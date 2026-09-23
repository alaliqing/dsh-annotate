# Contributing to dsh-annotate

Thanks for taking the time to help. This document covers everything you need to
build, test, and land a change.

## Requirements

- Node.js 20 or newer (CI runs 20, 22 and 24).
- Chromium for Playwright: `npx playwright install chromium`.
- [DeepSeek Harness](https://www.npmjs.com/search?q=%40deepseek-ai%2Fdsh) only if
  you want to exercise the plugin inside a real harness instance. The automated
  suite runs against a bundled fixture and needs no harness.

## Setup

```sh
npm ci
npx playwright install chromium
npm run check   # builds lib/ and syntax-checks every source file
npm test        # distribution + preview lifecycle + browser regression suite
```

For a live harness instead of the fixture, see the
[live harness loop](#live-harness-loop) below.

## The one rule that trips people up

`packages/dsh-annotate/lib/*` is **generated but committed**: the harness loads
those files directly, so an install needs no build step.

- Never edit `lib/` by hand.
- After changing anything under `packages/dsh-annotate/src/`, run
  `npm run build` and commit the regenerated files in the same commit.
- CI fails if `lib/` differs from a fresh build of `src/`, including new
  untracked files.

## Build and reload

| You changed | Do this |
| --- | --- |
| `src/client.js` or `src/i18n.js` | `npm run build`, then refresh the harness page |
| `src/overlay.js`, `src/shim.js` | `npm run build`, restart the harness (the host caches the injected sources), then reload the preview |
| `src/host.js` | `npm run build`, restart the harness |
| `packages/dsh-app-bridge/` | restart the harness (no build step) |

## Where things live

| Path | What it is |
| --- | --- |
| `packages/dsh-annotate/src/host.js` | Host half: discovery, the loopback preview proxy, the host API |
| `packages/dsh-annotate/src/client.js` | Client half: the right-sidebar tab (list face and page face) |
| `packages/dsh-annotate/src/overlay.js` | The overlay injected into the previewed page: picking, markers, comment cards |
| `packages/dsh-annotate/src/shim.js` | The shim injected into the previewed page: absolute fetch/socket URLs, origin handshake |
| `packages/dsh-annotate/src/i18n.js` | The UI message catalog (English and Chinese) |
| `packages/dsh-app-bridge/lib/index.js` | Standalone fixed-mount reverse proxy |
| `scripts/dev.mjs` | One-command local harness development loop |
| `tests/reliability.mjs` | The assertion-based browser suite (the acceptance gate) |
| `tests/preview.mjs` | Real HTTP tests for redirects, static identity, preview leases and resource cleanup |
| `tests/harness.mjs` | Optional packed-install check against the real Harness, with a local model fixture |
| `tests/distribution.mjs` | Asserts the published tarball contains every runtime file |
| `examples/demo-app/` | Zero-dependency fixture app used by the dev loop |

## Style

There is no formatter or linter to configure; match the surrounding code.

- 2-space indent, single quotes, no semicolons, LF endings.
- Keep host-side target validation explicit: the preview may only reach
  `localhost`, `127.0.0.1` and `[::1]`.
- Comment the *why*, not the *what*. Prefer deleting a stale comment over
  leaving a claim the code no longer supports.

## Internationalization

Every user-visible panel string belongs in `packages/dsh-annotate/src/i18n.js`
and is read through `t(...)`. Do not inline a literal in the UI: the panel ships
both English and Chinese, chosen by the user at runtime.

Payload labels that are sent to the model (the annotation block) come from the
same catalog. Keep both translations in sync when you add a key.

The README is published in both languages too: `README.md` and
`README.zh-CN.md`. A change to one that alters its structure, headings or claims
should be mirrored in the other in the same pull request. `CONTRIBUTING.md`,
`SECURITY.md` and `CHANGELOG.md` are English-only.

## Testing expectations

- Every behaviour change needs an assertion in the relevant browser, preview or
  native Harness suite, or a clear reason why it cannot be covered.
- Never assert on a fixed delay for something the browser animates. Wait for
  the state you expect — see the `settled()` helper for marker geometry.
- The suite must own and close every listener and browser it opens.
- `REVIEW_TEST_PORT` moves the fixture off its default port 5180 when that port
  is busy. Never kill unrelated dev servers to make tests pass.

Two environment escapes exist for unusual setups: `REVIEW_NODE_MODULES` points
at another install's `node_modules`, and `PLAYWRIGHT_MODULE` at Playwright
itself. The default suite never calls a real model: the React fixture simulates
session acceptance and rejection. `npm run test:harness` separately verifies
installation and submission in the real Harness with a local model endpoint.
It requires `dsh` (or `DSH_CLI`) and pnpm; see [the compatibility record](docs/compatibility.md).

### Documentation screenshots

The same run produces the panel screenshots used by the docs. When the panel's
chrome changes, refresh the README image from a green run:

```sh
npm test
cwebp -q 90 tests/shots/review-en.png -o docs/panel-overview.webp
```

Both READMEs point at that file. Check it for anything from your own machine
before committing it: the list shot in particular lists whatever local dev
servers you happen to be running.

## Live harness loop

`npm run dev` seeds a dedicated `dsh-annotate-dev` profile — never your daily
profile — starts the bundled fixture on 5180 and the harness on 3099, and prints
the tokenised URL. It requires the `dsh` CLI and pnpm. Use `--port` /
`--app-port` to avoid existing listeners, and `--open` to launch a browser. The
script owns both processes and stops them on exit.

Manual checks worth running after a change to the preview path:

1. Open a conversation, press `⌘/Ctrl⇧B`, and open the fixture from the list.
2. Save an annotation, scroll both the window and the nested container inside
   the fixture, and confirm the marker stays attached.
3. Switch language and confirm both the panel and the marker labels change.

## Commit and pull request conventions

Commit subjects follow the existing history: a bracketed type, then a plain
sentence.

```
[fix] keep markers attached when an inner container scrolls
[feature] add an English/Chinese language switch
[docs] describe the loopback preview origin accurately
```

A pull request is ready when:

- [ ] `npm run check` and `npm test` pass locally.
- [ ] Regenerated `lib/` files are included.
- [ ] Docs that the change invalidates are updated in the same pull request.
- [ ] New user-visible strings exist in both catalog languages.

## Reporting bugs and requesting features

Use the issue templates. For anything security-relevant, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

Contributions are accepted under the MIT license in [LICENSE](LICENSE).
