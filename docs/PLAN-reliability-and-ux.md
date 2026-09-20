# Annotation reliability and UX improvement

## Intended experience
A compact native-feeling review tool: discover a trusted local app, browse it,
mark an element, collect comments, then deliberately attach or send them.
No lost drafts, misplaced markers, false success messages, or hidden gestures.

## Implementation plan
1. Anchor markers to live elements. Escape CSS selectors; cache element identity;
   reject ambiguous fallback matches. Refresh viewport geometry for window and
   nested scrolling, resize and layout changes. Hide clipped/missing markers.
   Keep comment editors accessible without losing their drafts.
2. Separate annotations by session and full page URL. React to SPA routes,
   restore each page independently, protect Chinese IME input, report storage
   failure, and support deletion undo and keyboard-accessible markers.
3. Replace simulated composer clicks with the Harness input action contract.
   Preserve annotations until acceptance; explicit attach action; prevent duplicate
   submissions and avoid silently sending unrelated draft text.
4. Make discovery honest: include 5180, probe IPv6 fallback, periodic refresh,
   bounded concurrency and accurate counts. Validate loopback targets server-side,
   handle HTTPS and proxy failures, ship the shim and exercise packaged installs.
5. Refine visual hierarchy: compact neutral surfaces, restrained amber accents,
   visible mode labels, accessible controls, loading/error/retry states, clear
   feedback, responsive toolbar and preview controls.
6. Add assertion-based browser/host regressions for scrolling, IME, routes,
   session isolation, sending, network errors, and narrow layouts. Wire to CI.

## Compatibility boundaries
The preview changes browser origin and hostname. It is not a browser engine and
must not claim universal parity for arbitrary apps, OAuth, service workers or
self-signed HTTPS. The preview origin isolates the app's DOM and web storage from
the harness, but the app is still trusted local code rather than an adversary.
The safe path is a separate-origin preview, which is what shipped.

## Codex reference
Public browser documentation describes selecting elements and collecting
annotations, but does not document its marker geometry implementation:
https://developers.openai.com/codex/app/browser
Our anchoring implementation is based on web geometry and explicit regression
coverage, not a claim about Codex internals.

## Implemented decisions

- The preview runs on a separate loopback origin with original app paths. HTTP
  and WebSocket forwarding share the same local target policy, and the
  same-origin path proxy was removed rather than kept behind an opt-in: it could
  not isolate anything, and it exposed an unauthenticated WebSocket tunnel to any
  loopback port on the harness origin. Browser-to-host API writes validate Origin
  (scheme included). App cookies are namespaced and partitioned in Chromium.
- Marker identity uses escaped, unique selectors plus live element references;
  no arbitrary last-segment match or static-position fallback. The overlay uses
  the browser top layer and resets marker button sizing against app CSS.
  Nested wheel events reach the actual underlying scroll container.
- Host-side process adoption no longer claims an unrelated occupied port as the
  current project's server; startup timeout terminates the owned process.
- Parent-owned saved comments and draft editors use session + complete original
  URL identity. Old v1 records are retained without guessing their owner.
- Sending uses `ctx.sessions.scope` / `sessionOf` / `beginSubmission` / `prompt`
  and the explicit `accepted` response. It sends only the review, queues if busy,
  preserves composer drafts, disables duplicate submissions, and retains failures.
- Attach is a visible secondary action. The panel has honest loading/error/retry
  states, periodic discovery, deletion undo, narrow-screen layout, width mode,
  light/dark theme surfaces, keyboard focus, and an actionable no-session toast.

## Validation

- `npm run check`: builds the committed bundles, parses every first-party file,
  and validates the message catalog (both languages complete, every call-site key
  present, every host error code translatable).
- `npm test`: package contents and assertion-based Chromium integration checks.
  Includes actual wheel input, window and inner-container scrolling, layout shift,
  clipping, IME composition Enter, page and session separation, unsaved draft
  restoration after reload, receipt rejection/success, explicit attach,
  cookie/fetch/WebSocket round-trip, TLS error handling, the language switch,
  narrow UI and retries.
- Native Harness 0.1.5-rc.2: a dedicated temporary profile was booted; a temporary
  workspace/session opened the real sidebar, previewed the bundled app, saved
  an annotation and inserted its structured payload into the real composer.
  No live model invocation or provider request was made.
- Visual inspection: light, dark, narrow panel, and native Harness screenshots.
  Artifacts are in ignored `tests/shots/`.

## Remaining explicit boundaries

Remote Harness access and HTTPS reverse-proxy hosting are not supported by this
local preview origin design. Chromium is validated; other engines' partitioned
cookie handling is not, and the fallback provenance check for browsers that send
no fetch metadata is weaker than Chromium's. OAuth, service workers, strict
in-document CSP, shadow roots and canvas internals retain the documented limits.
Real provider response quality and physical OS IME interaction were not
exercised; the IME event guard is covered in the browser regression suite.
