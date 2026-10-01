# dsh-annotate

Element annotation and review panel for the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Desktop and web
client. Open a local app you are already running, click the elements you want
changed, write a note on each, and send the whole review to the conversation as
one structured block.

This is the package README. For the architecture, the full workflow, the
annotation payload, configuration and the documented limits, see the
[repository README](https://github.com/alaliqing/dsh-annotate#readme).

## Install

Give a coding agent this prompt:

```text
Read https://github.com/alaliqing/dsh-annotate and install dsh-annotate into the current local Harness profile following its README. Preserve existing configuration and keep the current task running. Report the installed version and explain how to restart after the task finishes.
```

The commands below install `0.1.14` and can also upgrade an existing install.

### Desktop (macOS)

Open Desktop once to initialize its profile. It can stay open during installation.
Use its bundled CLI; with the app installed in `/Applications`:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-annotate@0.1.14
```

Adjust the app path if needed. After the current task finishes, **fully quit and
reopen Desktop**, then click **Annotate** or press `⌘/Ctrl⇧B`.

### Web

With the web CLI, Node.js 20+ and pnpm available, run:

```sh
dsh plugin --profile web add dsh-annotate@0.1.14
```

Replace `web` with your profile name if needed. After the current task finishes,
restart that profile and refresh the browser, then open **Annotate**.

If installation fails, the panel is missing after restart, or you are upgrading
`0.1.2` or earlier, see [installation troubleshooting](https://github.com/alaliqing/dsh-annotate/blob/main/docs/install-troubleshooting.md).
See [compatibility](https://github.com/alaliqing/dsh-annotate/blob/main/docs/compatibility.md) for tested versions.

## What you get

- A sidebar tab (**Annotate**, `⌘/Ctrl⇧B`) listing the local development servers
  that are actually running, with page titles, refreshed every five seconds.
- Each app opens on its own isolated loopback preview origin, at its original
  paths, so root-absolute assets, SPA routes and WebSocket upgrades just work.
- Click an element to write a note. Markers follow the element through window and
  nested scrolling, resizing and layout shifts, and hide when the element is
  clipped or gone.
- Mark mode keeps native vertical and horizontal scrolling, including container
  scroll chaining and overscroll containment.
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
| `cordis.patch.yml` | Bundle layer that activates the plugin automatically |

## Compatibility

Chromium is the validated browser. A restartable, local DeepSeek Harness
Desktop or web client is required. Desktop preview support starts at `0.1.5`.

See the [compatibility record](https://github.com/alaliqing/dsh-annotate/blob/main/docs/compatibility.md)
for the tested environment and validation limits.

Local development only: proxy targets are restricted to loopback, so a remote
harness or a public deployment is out of scope.

## License

MIT.
