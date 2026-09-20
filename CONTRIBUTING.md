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
npm test        # distribution + browser regression suite
```

`npm run dev` starts the bundled fixture and a throwaway harness profile seeded
from this checkout. It requires the `dsh` CLI on `PATH`.

## The one rule that trips people up

`packages/dsh-annotate/lib/*` is **generated but committed**: the harness loads
those files directly, so an install needs no build step.

- Never edit `lib/` by hand.
- After changing anything under `packages/dsh-annotate/src/`, run
  `npm run build` and commit the regenerated files in the same commit.
- CI fails if `lib/` differs from a fresh build of `src/`, including new
  untracked files.

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

## Testing expectations

- Every behaviour change needs an assertion in `tests/reliability.mjs`, or a
  clear reason why it cannot be covered (native harness loading, for example).
- Never assert on a fixed delay for something the browser animates. Wait for
  the state you expect — see the `settled()` helper for marker geometry.
- The suite must own and close every listener and browser it opens.
- `REVIEW_TEST_PORT` moves the fixture off its default port 5180 when that port
  is busy. Never kill unrelated dev servers to make tests pass.

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
