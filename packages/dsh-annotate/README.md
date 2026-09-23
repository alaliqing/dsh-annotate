# dsh-annotate

Element annotation and review panel for the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web
client. Open a local app you are already running, click the elements you want
changed, write a note on each, and send the whole review to the conversation as
one structured block.

This is the package README. For the architecture, the full workflow, the
annotation payload, configuration and the documented limits, see the
[repository README](https://github.com/alaliqing/dsh-annotate#readme).

## Quick start

### Ask your coding agent

Copy this into an agent with access to the machine running Harness:

```text
Install dsh-annotate for my local DeepSeek Harness web profile.
1. Check Node.js 20+, pnpm, and the dsh CLI used to launch the web client. Run `dsh plugin --profile web add dsh-annotate`. If the web client uses `npx @deepseek-ai/dsh`, use that in place of `dsh` for these commands.
2. The package currently needs manual activation. Preserve the existing `$DSH_HOME/profiles/web/cordis.patch.yml` (default `~/.dsh/profiles/web/cordis.patch.yml`). Add a top-level `- insert:` entry containing `- name: dsh-annotate` only if absent.
3. Run `dsh --profile web --dump-config` and confirm that dsh-annotate appears. Report the install and configuration results.
4. Do not stop the Harness session you are using. Tell me to restart the web profile and refresh the browser, then open Annotate with ⌘/Ctrl⇧B or the conversation-header button.
```

### Install manually

You need Node.js 20+, the `dsh` CLI, and pnpm on `PATH`. If you launch Harness
with `npx @deepseek-ai/dsh web`, replace `dsh` in the commands below with
`npx @deepseek-ai/dsh`.

```sh
dsh plugin --profile web add dsh-annotate
```

The current package installs as a dependency; it does not enable itself as a
Harness bundle. Open `$DSH_HOME/profiles/web/cordis.patch.yml` (normally
`~/.dsh/profiles/web/cordis.patch.yml`) and add this entry without replacing
existing entries or adding it twice:

```yaml
- insert:
    - name: dsh-annotate
```

Check the effective configuration:

```sh
dsh --profile web --dump-config
```

Confirm that the output includes `dsh-annotate`. Restart the web profile and
refresh the browser, then open a conversation and click **Annotate** in its
header or press `⌘/Ctrl⇧B`. If you are installing from a Harness conversation,
finish the configuration before restarting that session. The built files ship
with the package, so there is no build step.

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

## Requirements

- Node.js 20 or newer.
- pnpm on `PATH` for `dsh plugin`.
- A restartable DeepSeek Harness web client.
- Chromium is the validated browser.

A packed unreleased checkout passed a native check with Harness CLI
`0.1.5-rc.2`, web app and session controller `0.1.5-rc.3`; that check did not
install npm `0.1.1`. See the [compatibility record](https://github.com/alaliqing/dsh-annotate/blob/main/docs/compatibility.md)
for the environment and validation limits.

Local development only: proxy targets are restricted to loopback, so a remote
harness or a public deployment is out of scope.

## License

MIT.
