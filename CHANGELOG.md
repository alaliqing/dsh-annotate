# Changelog

Notable changes to `dsh-annotate` and `dsh-app-bridge`. Both packages are
versioned together; the format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

First public release. The plugin was developed as a private prototype before
this; everything below is new to the public repository in one release.

### Added

- **Right-sidebar annotation tab** for the DeepSeek Harness web client, opened
  from the conversation header button, the sidebar `+` guide, or `⌘/Ctrl⇧B`.
- **Zero-configuration local service discovery**: probes loopback listeners over
  IPv4 and IPv6, reports page titles, refreshes every five seconds while
  visible, and explains how to start a server when nothing is found.
- **Isolated loopback preview origin**, one ephemeral port per session/app, so
  root-absolute scripts, styles, SPA routes and WebSocket upgrades work without a
  path prefix while the preview DOM and web storage stay separate from the
  harness.
- **Element picking with live markers** that follow the element through window
  and nested scrolling, resizing and layout changes, and hide rather than drift
  when the element is clipped or gone.
- **Structured review payload** carrying the original URL, viewport, selector,
  match count, semantic attributes, component chain, geometry, computed styles
  and visible text.
- **Composer integration** through the harness session controller: attach the
  review to your draft, send it on its own, or `⌘/Ctrl`-click to save and send.
  A rejected send preserves the annotations; an unrelated draft is never sent.
- **Per-session, per-URL annotation storage**, so SPA navigation and multiple
  sessions keep their comments separate, with deletion undo and a comment list.
- **Bilingual UI**: English and Chinese, switchable in the panel.
- **`dsh-app-bridge`**, a standalone reverse proxy for trusted, base-prefixed
  apps that must be mounted at a fixed path on the harness origin.
- **Assertion-based Chromium regression suite** (`npm test`) covering discovery,
  origin isolation, cookie/fetch/WebSocket behaviour, Chinese IME, nested wheel
  scrolling, clipping, layout shifts, route and session separation, rejected and
  accepted sends, attaching, and narrow layouts.
- **Packaging guard** (`tests/distribution.mjs`) asserting the published tarball
  contains the host, client, shim and overlay files.
- `scripts/dev.mjs` for a one-command local harness development loop and
  `scripts/check.mjs` for build plus syntax verification.

### Known limitations

- Chromium is the validated engine.
- OAuth flows, service workers, origin allowlists and apps with hard-coded
  origins may need app-specific setup or a normal browser.
- In-document CSP that forbids inline scripts can block injection.
- Shadow DOM internals and cross-origin child frames are not selectable; canvas
  content is selectable only as a whole element.
- Remote harness instances and HTTPS reverse-proxy deployments are out of scope
  for the local preview design.

[Unreleased]: https://github.com/alaliqing/dsh-annotate/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.0
