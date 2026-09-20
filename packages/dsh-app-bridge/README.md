# dsh-app-bridge

Mount a local development server on the **DeepSeek Harness origin** under a
fixed path prefix, including WebSocket upgrades.

```yaml
- insert:
    - name: dsh-app-bridge
      config:
        target: http://127.0.0.1:5180   # must be a loopback http(s) URL
        prefix: /app                    # where it appears on the harness origin
        # wsPaths: ['/app/', '/app']    # optional; defaults to both spellings
        # forwardCredentials: false     # default; see below
```

Registers one prefix HTTP route (all methods, streamed both ways so SSE works)
and HTTP upgrade routes for the dev server's WebSocket (Vite's HMR socket lives
at `<base>/`). No dependencies, no client half, no build step, no state.

## When to use it

Prefer the ordinary [`dsh-annotate`](https://www.npmjs.com/package/dsh-annotate)
preview. It serves each app on its own isolated loopback origin and needs no
configuration, no prefix and no credentials decision.

Use this bridge only when an app genuinely has to live at a fixed path on the
harness origin — typically a dev server that is already base-prefixed and cannot
be served any other way. The dev server must run under the same prefix
(`vite --base=/app/`), otherwise its own asset URLs leave the prefix and land on
the harness root.

## Credentials

Because the bridged app shares the harness origin, the browser will send the
harness's own cookies and `Authorization` header to it, and the app's
`Set-Cookie` responses would be set on the harness origin. Both directions are
stripped by default. Set `forwardCredentials: true` only for a dev server you
trust to hold your harness session.

## What it is not

It is a reverse proxy and nothing more: it injects no script and adds no
annotation UI. Only loopback targets are accepted, so it cannot expose a remote
host. It is intended for trusted local development, not as a security boundary.

## License

MIT.
