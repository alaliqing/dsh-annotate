# dsh-app-bridge

Reverse-proxy a local dev server onto the **DeepSeek Harness origin**, so a
previewed page is Same-Origin with the harness and its DOM can be read.

```yaml
- insert:
    - name: dsh-app-bridge
      config:
        target: http://127.0.0.1:5180   # where the dev server listens
        prefix: /app                    # where it appears on the harness origin
        # wsPaths: ['/app/', '/app']    # optional; defaults to both spellings
```

Registers one prefix HTTP route (all methods, streamed both ways so SSE works)
and HTTP upgrade routes for the dev server's WebSocket (Vite's HMR socket lives
at `<base>/`). No dependencies, no client half, no state.

**Why it exists**: sandboxed iframes cannot read a cross-origin document, and a
dev server on another port always is cross-origin. Serving it through the
harness origin is the only way an in-harness overlay can reach it.

The dev server must run under the same prefix (`vite --base=/app/`), otherwise
its own asset URLs leave the prefix and land on the harness root.
