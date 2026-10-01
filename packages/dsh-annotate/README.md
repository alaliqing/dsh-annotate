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
Read https://github.com/alaliqing/dsh-annotate and install its latest published version into the active local DeepSeek Harness profile. Use Desktop's bundled CLI for its desktop profile, or the web CLI for the browser profile. Preserve existing configuration and do not stop an active conversation. Explain any required Desktop initialization or full quit before installing, verify the installation, then explain how to restart Harness and open Annotate.
```

For Desktop, open the app once to initialize its profile, then fully quit it
before installing. Use **Desktop's bundled CLI**; the standalone npm CLI cannot
manage the reserved `desktop` profile.

On macOS, with the app installed in `/Applications`:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-annotate@latest
```

Adjust the path if needed. The bundled CLI uses Desktop's Node.js and pnpm
runtimes. If Desktop has installed its `dsh` command on `PATH`, the shorter
`dsh plugin --profile desktop add dsh-annotate@latest` is equivalent.

For the browser, use a web CLI with Node.js 20+ and pnpm on `PATH`:

```sh
dsh plugin --profile web add dsh-annotate@latest
```

Replace `web` with your actual profile name if you use a custom web profile.
For an existing `0.1.3` or newer install, the same command upgrades the package,
including an installation linked to a local checkout.

**Installing a newly published release:** pnpm 11 defaults to a 24-hour
minimum release age, so `@latest` can select an older version during that window.
Wait until the window expires, or, after checking the exact release you intend
to install, append only that version to `minimumReleaseAgeExclude` in the active
profile's `$DSH_HOME/profiles/<profile>/pnpm-workspace.yaml` (default
`~/.dsh/profiles/<profile>/pnpm-workspace.yaml`). For this release:

```yaml
minimumReleaseAgeExclude:
  - dsh-annotate@0.1.12
```

Keep existing settings and exclusions. Then use the appropriate install command
above with `dsh-annotate@0.1.12` instead of `dsh-annotate@latest`, and check the
installed `node_modules/dsh-annotate/package.json` version. Remove the added
exception once the waiting period has passed.

After installing or upgrading, **fully quit and reopen Desktop**, or restart the
web profile and refresh the browser; reloading the preview alone does not reload
the plugin. Desktop preview support requires `dsh-annotate` `0.1.5` or newer.
The legacy upgrade example below is for web installations; replace `web` with
your actual web profile name if needed. Desktop is managed by the app and does
not support the CLI's `--dump-config` command.

For a new install, version `0.1.3` and later registers and enables its own
bundle. Version `0.1.2` and earlier used this manual entry in
`$DSH_HOME/profiles/web/cordis.patch.yml` (default
`~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - name: dsh-annotate
```

When upgrading an existing `0.1.2` or earlier installation, remove and add the
package so DSH registers its new bundle; updating the existing dependency alone
may leave it out of the profile's bundle list:

```sh
dsh plugin --profile web remove dsh-annotate
dsh plugin --profile web add dsh-annotate@latest
```

Remove only the old manual insertion from `cordis.patch.yml` and keep all other
profile entries. If no patch entries remain, use `[]` rather than a comments-only
file. Check for exactly one `- id: dsh-annotate` row with
`dsh --profile web --dump-config`. Restart the web profile and refresh the
browser, then click **Annotate** or press `⌘/Ctrl⇧B`.
If you run the browser with `npx @deepseek-ai/dsh web`, use
`npx @deepseek-ai/dsh plugin --profile web add dsh-annotate@latest` to install.
The package ships built files; no build step is needed.

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
