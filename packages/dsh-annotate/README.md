# dsh-annotate

Element annotation and review panel for the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web
client. Open a local app you are already running, click the elements you want
changed, write a note on each, and send the whole review to the conversation as
one structured block.

This is the package README. For the architecture, the full workflow, the
annotation payload, configuration and the documented limits, see the
[repository README](https://github.com/alaliqing/dsh-annotate#readme).

## Install

Give a coding agent this prompt:

```text
Read https://github.com/alaliqing/dsh-annotate and install its latest published version into the local DeepSeek Harness web profile. Preserve existing configuration and do not stop the current Harness session. Verify the installation, then explain how to restart Harness and open Annotate.
```

Or install manually with Node.js 20+, the `dsh` CLI, and pnpm on `PATH`:

```sh
dsh plugin --profile web add dsh-annotate
```

The current package needs a profile entry in
`$DSH_HOME/profiles/web/cordis.patch.yml` (default
`~/.dsh/profiles/web/cordis.patch.yml`). Keep existing entries and add this only
once:

```yaml
- insert:
    - name: dsh-annotate
```

Check for `dsh-annotate` with `dsh --profile web --dump-config`. Restart the web
profile and refresh the browser, then click **Annotate** or press `⌘/Ctrl⇧B`.
If you use `npx @deepseek-ai/dsh web`, replace `dsh` above with
`npx @deepseek-ai/dsh`. The package ships built files; no build step is needed.

## What you get

- A sidebar tab (**Annotate**, `⌘/Ctrl⇧B`) listing the local development servers
  that are actually running, with page titles, refreshed every five seconds.
- Each app opens on its own isolated loopback preview origin, at its original
  paths, so root-absolute assets, SPA routes and WebSocket upgrades just work.
- Click an element to write a note. Markers follow the element through window and
  nested scrolling, resizing and layout shifts, and hide when the element is
  clipped or gone.
- **Send annotations** sends the review alone; **Add to composer** merges it into
  your draft. A rejected send keeps the annotations, and your draft and
  attachments are never sent by accident.
- Structured payloads: original URL, viewport, selector and match count,
  semantic anchors, component chain, geometry, computed styles and visible text.
- English and Chinese, switchable in the toolbar.

## Package contents

| File | Role |
| --- | --- |
| `lib/index.js` | Host half: discovery, the loopback preview proxy, the host API |
| `lib/client.js` | Client half: the sidebar tab |
| `lib/shim.js` | Injected into previewed documents: URL and socket mapping, navigation reports |
| `lib/overlay.js` | Injected into previewed documents: picking, markers, comment cards |
| `cordis.patch.yml` | Activation example to add to the web profile manually |

## Compatibility

Chromium is the validated browser. A restartable, local DeepSeek Harness web
client is required.

A packed unreleased checkout passed a native check with Harness CLI
`0.1.5-rc.2`, web app and session controller `0.1.5-rc.3`; that check did not
install npm `0.1.1`. See the [compatibility record](https://github.com/alaliqing/dsh-annotate/blob/main/docs/compatibility.md)
for the environment and validation limits.

Local development only: proxy targets are restricted to loopback, so a remote
harness or a public deployment is out of scope.

## License

MIT.
