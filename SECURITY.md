# Security policy

## The trust model, in one paragraph

`dsh-annotate` is local development tooling. It injects a script into pages it
proxies and it can, when explicitly configured, start a process for you. The
preview deliberately removes framing and content-security headers so a local app
can be annotated from inside the harness. Treat it as you would a dev server:
point it at code you already trust, and do not expose the harness port to other
machines or to the public internet.

## What the plugin does constrain

- Proxy targets are restricted to loopback literals: `localhost`, `127.0.0.1`
  and `[::1]`. External hosts, credentials in the URL, and the harness itself are
  rejected.
- Host API writes are rejected unless they come from the harness's own origin.
- Preview pages run on a dedicated loopback origin, so they cannot read harness
  DOM or harness web storage.
- App cookies are namespaced; unprefixed cookies are not forwarded. The optional
  `dsh-app-bridge` strips cookies and `Authorization` by default because it shares
  the Harness origin. Isolated previews preserve the app's HTTP authorization.
- No untrusted certificate is ever accepted silently: an HTTPS upstream with an
  untrusted certificate fails visibly.

## Known limits

These are documented product boundaries, not undisclosed gaps:

- The separate `dsh-app-bridge` package mounts trusted apps on the Harness origin
  and has weaker isolation than `dsh-annotate`'s default preview origin.
- An app you have chosen to preview is trusted code running in your browser, with
  the same access any page on that origin would have.
- Shadow DOM internals and cross-origin child frames are not selectable.
- Chromium is the validated engine; other engines differ on partitioned cookies
  and on the fetch-metadata headers used for cross-site request rejection.

## Reporting a vulnerability

Do not open a public issue for a security problem. Report it privately, either
through GitHub's [private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, or by email to <alaliqing@gmail.com>.

Please include the version, the affected file or endpoint, and a minimal
reproduction. Expect an initial response within a week. Once a fix is available
it will be released, and the report credited in the release notes unless you ask
otherwise.

## Supported versions

The project is pre-1.0: only the latest published version receives fixes.
