# Developing dsh-annotate

## Setup

```sh
npm ci
npx playwright install chromium
npm run check   # builds lib/, parses every file, validates the message catalog
npm test        # the acceptance gate
```

Node.js 20 or newer. `dsh` on `PATH` is only needed for the live harness loop
below; the automated suite runs against a bundled fixture.

## Build and reload

`packages/dsh-annotate/lib/*` is generated from `src/` **and committed**, because
the harness loads those files directly and an install must not need a build step.

| You changed | Do this |
| --- | --- |
| `src/client.js` or `src/i18n.js` | `npm run build`, then refresh the harness page |
| `src/overlay.js`, `src/shim.js` | `npm run build`, restart the harness (the host caches the injected sources), then reload the preview |
| `src/host.js` | `npm run build`, restart the harness |
| `packages/dsh-app-bridge/` | restart the harness (no build step) |

Never edit `lib/` by hand. CI fails when `lib/` differs from a fresh build of
`src/`, including for new untracked files.

## Tests

`npm test` runs two scripts:

- `tests/distribution.mjs` — asserts `npm pack` ships the host, client, shim and
  overlay files.
- `tests/reliability.mjs` — the assertion-based Chromium suite. It boots
  disposable loopback servers, loads the **real built client, shim and overlay**
  through a React fixture, and drives the actual UI.

The suite owns and closes every listener and browser it opens, in a `finally`.
It uses port 5180 on purpose, to catch a regression in the default discovery
list; set `REVIEW_TEST_PORT` to move it when that port is busy. Do not terminate
unrelated dev servers to make it pass.

Two environment escapes exist for unusual setups: `REVIEW_NODE_MODULES` points at
another install's `node_modules`, and `PLAYWRIGHT_MODULE` at Playwright itself.

What the suite deliberately does **not** prove: real provider/model behaviour.
The React fixture simulates session acceptance and rejection, and no model is
called. Native harness loading is a manual step.

### Writing assertions

- Every behaviour change needs an assertion here, or a stated reason it cannot
  be covered.
- Never assert on a fixed delay for something the browser animates. Wait for the
  state you expect — `settled()` in the suite is the pattern for marker geometry.
- Screenshots land in the ignored `tests/shots/`, and CI uploads them when a run
  fails.

The run also produces the panel screenshots used for documentation
(`review-list.png`, `review-en.png`, plus light/dark/narrow variants). When the
panel's chrome changes, refresh the README image from a green run:

```sh
npm test
cp tests/shots/review-en.png docs/panel-overview.png
```

Check the PNG for anything from your own machine before committing it: the list
shot in particular lists whatever local dev servers you happen to be running.

## Live harness loop

```sh
node scripts/dev.mjs
```

This seeds a dedicated `dsh-annotate-dev` profile (never your daily profile),
starts the bundled fixture on 5180 and the harness on 3099, and prints the
tokenised URL. It requires the `dsh` CLI and pnpm. Use `--port` / `--app-port`
to avoid existing listeners, and `--open` to launch a browser. The script owns
both processes and stops them on exit.

Manual checks worth running after a change to the preview path:

1. Open a conversation, press `⌘/Ctrl⇧B`, and open the fixture from the list.
2. Save an annotation, scroll both the window and the nested container inside
   the fixture, and confirm the marker stays attached.
3. Switch language and confirm both the panel and the marker labels change.
4. `legacyProxy` is gone; the only preview path is the isolated loopback origin.

## Internationalization

Every user-visible string lives in `packages/dsh-annotate/src/i18n.js` and is read
through `t('key')`. `npm run check` fails when a key is missing from either
language, when a call site uses an unknown key, or when the host returns an error
code without a matching message. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Design and boundaries

The independent preview origin is the central decision: it preserves the app's
own paths (so root-absolute assets, SPA routes and WebSocket upgrades work with
no prefix) while keeping the preview's DOM and web storage out of the harness.
It replaced an earlier same-origin proxy, which could never isolate anything.

[The reliability plan](docs/PLAN-reliability-and-ux.md) records what was built
and which boundaries were accepted. [The sidebar plan](docs/PLAN-sidebar-browser.md)
is the earlier design document; its same-origin proxy section is historical.
