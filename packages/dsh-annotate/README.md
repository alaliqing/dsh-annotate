# dsh-annotate

Element annotation and review panel for the
[DeepSeek Harness](https://www.npmjs.com/search?q=%40deepseek-ai%2Fdsh) web
client. Open a local app you are already running, click the elements you want
changed, write a note on each, and send the whole review to the conversation as
one structured block.

This is the package README. For the architecture, the full workflow, the
annotation payload, configuration and the documented limits, see the
[repository README](https://github.com/alaliqing/dsh-annotate#readme).

## Install

Hand this line to your coding agent, or run it yourself:

```text
Install dsh-annotate: dsh plugin --profile web add dsh-annotate, then add it to the profile's cordis.patch.yml and restart dsh web.
```

```sh
dsh plugin --profile web add dsh-annotate
```

Then add the plugin to that profile's `cordis.patch.yml`:

```yaml
- insert:
    - name: dsh-annotate
```

Restart `dsh web`. No runtime dependencies, and the built files ship with the
package, so there is no build step.

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
| `cordis.patch.yml` | The profile patch this package contributes |

## Requirements

- Node.js 20 or newer.
- A restartable DeepSeek Harness web client.
- Chromium is the validated browser.

Local development only: proxy targets are restricted to loopback, so a remote
harness or a public deployment is out of scope.

## License

MIT.
