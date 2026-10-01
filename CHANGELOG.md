# Changelog

Notable changes to `dsh-annotate`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`dsh-app-bridge` is frozen at 0.1.0: that version stays on the registry and in
this repository, and the release workflow no longer publishes it. Its history
is the 0.1.0 entry below.

## [Unreleased]

## [0.1.11] - 2026-10-01

### Fixed

- Keep native wheel scrolling while marking elements. Continuous input no longer
  loses scroll distance on pages using `scroll-behavior: smooth`; horizontal
  scrolling, container boundaries and overscroll containment follow the browser.
- Share clipping and element measurements within one animation frame, read
  geometry before updating the overlay, and leave unchanged marker styles and
  readouts alone. Markers still follow layout and transform changes.

### Changed

- Clarify installation and upgrades in the repository's English/Chinese README
  and npm package README, including Desktop initialization and its bundled CLI,
  custom web profile names, local-link upgrades and the required Harness restart.
- Add native scroll and marker-workload regression checks to CI and publication.

## [0.1.10] - 2026-09-30

### Fixed

- Keep marking mode active after Enter or Save so another element can be
  annotated immediately. Esc and the Mark button still exit marking mode;
  Cmd/Ctrl-click still saves and sends the batch.
- Show the language switch target in the toolbar: EN in the Chinese UI and
  中 in the English UI, with matching tooltips and accessible labels.

## [0.1.9] - 2026-09-30

### Fixed

- Follow the overlay's actual page URL when reusing an existing iframe after
  a redirect. Annotation storage, submitted context and accepted-send cleanup
  stay aligned even when reopening the same redirect address.

## [0.1.8] - 2026-09-30

### Fixed

- Keep injected scripts ASCII so Chinese annotation labels and Unicode
  configuration remain correct on pages without a charset declaration or with
  a legacy document encoding. The application's encoding is unchanged.

## [0.1.7] - 2026-09-30

### Fixed

- Mark Cordis as an optional peer: Harness supplies its runtime, and the plugin
  does not import an external Cordis package. Desktop and web profiles no longer
  report a missing mandatory peer when installing the plugin.

## [0.1.6] - 2026-09-30

### Fixed

- Preserve the exact encoding of application query strings when adding and
  removing the Desktop frame capability, including redirects and file previews.
  Encoded spaces and literal plus signs keep their original URL identities.

## [0.1.5] - 2026-09-30

### Fixed

- Desktop previews now authenticate the initial iframe load from `dsh-app://app`,
  including local redirects, while retaining loopback and request-origin guards.
- The navigation capability is removed before app scripts run and is never
  forwarded in upstream URLs or Referer headers, or included in annotation URLs.
- Reloading the preview fetches current HTML, CSS and JavaScript even when the
  development server advertises immutable caching or stale validators.
- Installation instructions now cover the Desktop profile and full app restart.

## [0.1.4] - 2026-09-29

### Changed

- Documented migration of legacy linked installations to the self-activating bundle.

## [0.1.3] - 2026-09-29

### Added

- Declared the bundle patch and export so `dsh plugin add` automatically selects
  and enables the plugin in a profile without a manual insertion.

## [0.1.2] - 2026-09-23

### Added

- `npm run test:harness` verifies a packed install, workspace preview and
  annotation delivery through the real Harness using a local model fixture.
- A compatibility record names the verified CLI and resolved runtime versions.

### Fixed

- Saving a comment now leaves annotation mode. Numbered markers show the saved
  comment without opening the editor, and clicking elsewhere closes the comment
  without starting another annotation.
- Static previews identify each HTML document independently and preserve query
  strings and initial hash routes, keeping saved annotations on the correct page.
- Absolute and protocol-relative redirects to the upstream app stay on the
  preview origin and retain the annotation overlay.
- Preview leases release listeners when panels close or switch apps, preserve
  other windows' active previews, and reclaim abandoned previews after inactivity.
  Sequential sessions no longer exhaust a cumulative 24-preview limit.
- Internal static servers no longer appear as detected development services;
  concurrent requests share one static server and unused servers are closed.
- Corrected the security policy's retired configuration reference, the issue
  template's architecture link, and the installation requirements.

## [0.1.1] - 2026-09-22

### Changed

- The package README opens with the single install line to hand to a coding
  agent, matching the repository README.

### Security

- Releases are published from CI through npm trusted publishing (OIDC), so
  versions from here on carry a provenance attestation. 0.1.0 was published by
  hand and has none.

## [0.1.0] - 2026-09-21

First public release. The plugin was developed as a private prototype before
this; everything below is new to the public repository in one release.

### Added

- **Right-sidebar annotation tab** for the DeepSeek Harness web client, opened
  from the conversation header button, the sidebar `+` guide, or `⌘/Ctrl⇧B`.
- **Zero-configuration local service discovery**: probes loopback listeners over
  IPv4 and IPv6, reports page titles, refreshes every five seconds while
  visible, and explains how to start a server when nothing is found.
- **Workspace-first ranking.** A listening service is claimed by the
  conversation's workspace when the owning process was started inside it
  (`lsof` PID, then `/proc` or `lsof` for the working directory), shown as
  **This project**, and ranked above everything else. Ports the workspace names
  in `package.json` or a Vite config are marked **Configured port** and rank
  next; the common-port preference follows.
- **Static page previews.** `index.html` at the workspace root, or a page under
  `dist/`, `build/`, `out/` or `public/`, is offered in the service list. The
  plugin serves that directory itself on a loopback origin — read-only, `GET`/
  `HEAD` only, inside the workspace, no dotfiles, 64 MiB per file, unknown
  client-side routes falling back to `index.html` — and previews it through the
  same proxy, so it is annotatable with no dev server running. The preview keeps
  the file's own address (with any hash route) as the page identity.
- **`detect.staticFiles`** to turn the static-page listing off, matching the
  existing `detect.staticPorts`.
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

[0.1.11]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.11
[0.1.10]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.10
[0.1.9]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.9
[0.1.8]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.8
[0.1.7]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.7
[0.1.6]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.6
[0.1.5]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.5
[0.1.4]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.4
[0.1.3]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.3
[0.1.2]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.2
[0.1.1]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.1
[0.1.0]: https://github.com/alaliqing/dsh-annotate/releases/tag/v0.1.0
