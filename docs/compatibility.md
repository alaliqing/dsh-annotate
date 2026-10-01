# Harness compatibility

## Native scrolling and installation: 2026-10-01

`0.1.11` retains the browser's native wheel path in marking mode. Chromium
regressions cover continuous vertical and horizontal input on smooth-scrolling
pages, container boundaries and overscroll containment, app-click isolation,
explicit exits, 50 stationary markers, and geometry changes without scrolling.
The source-linked repair also passed macOS Desktop user acceptance for scrolling
while marking.

The packed `0.1.11` candidate passed the isolated real-Harness web check with
Desktop CLI `0.2.0-rc.2` and Chromium `153.0.8010.12`: bundle activation, workspace
preview, annotation acceptance, delivery to the local model fixture, and
preservation of an unrelated composer draft.

Desktop installation was separately checked in an isolated, initialized
`desktop` profile using the bundled CLI with no external Node.js or pnpm on
`PATH`. Installation selected exactly one annotation bundle. The CLI refuses
an uninitialized Desktop profile and does not allow `--dump-config` for Desktop;
open the app once to initialize it, and use the bundled CLI for installation.
The [upstream architecture documentation](https://deepseek-harness.github.io/deepseek-harness/en/reference/)
also distinguishes the app-managed Desktop profile from profiles managed by the
public npm CLI. These checks do not extend native acceptance to Windows or Linux.

After publication, npm metadata and all ten tarball files for `0.1.11` were
verified against the tested checkout. pnpm `11.7.0` initially selected `0.1.10`
for `@latest`: its default minimum release age is 24 hours. An isolated Desktop
install of exact version `0.1.11` passed with only `dsh-annotate@0.1.11` appended
to `minimumReleaseAgeExclude`; the public npm CLI's web installation and
`--dump-config` check also passed with that version-specific exception. The
initial `0.1.12` documentation candidate was blocked before publishing by a
reload initialization race in the browser regression. `0.1.13` retains the
scrolling implementation and installation guidance, and defers readiness and
early panel messages until the layer is mounted. A streamed-document regression
exercises mode, language and draft restoration before the body loads.

## Desktop preview repair: 2026-09-30

`0.1.4` and earlier did not authenticate preview frames loaded by the actual
Desktop `dsh-app://app` renderer. A web profile launched with the Desktop CLI
does not exercise that custom scheme. `0.1.5` supports the native parent,
uses a per-preview navigation capability for its initial load and local
redirects, removes that capability from application URLs, and bypasses stale
preview asset caches on reload.

`0.1.6` also preserves the original query encoding while adding and removing
the capability, including encoded spaces and literal plus signs.

`0.1.7` marks the externally installed Cordis peer as optional because Harness
supplies the runtime and the plugin does not import that package.

`0.1.8` keeps injected scripts ASCII so localized annotation controls work on
pages without a charset declaration and pages with a legacy document encoding.
Chromium regression checks cover both cases, including saved Chinese notes.

`0.1.9` also synchronizes the actual overlay URL when reopening an unchanged
iframe source after a redirect. Regression checks reproduce the 0.1.8 failure
and verify the final address and accepted-send cleanup on the redirected page.

The `0.1.6` packed checkout passed `npm test` and the isolated real-Harness
web check below on macOS Apple Silicon with Desktop CLI `0.2.0-rc.2`, Node
`25.5.0` and Chromium `153.0.8010.12`. The model fixture received the selector
and annotation while the unrelated draft remained unsent. HTTP and Chromium
regressions also cover native frame capabilities, redirects, reloads and
changed CSS/JavaScript with immutable upstream cache headers.

The actual Desktop window was also fully restarted with this checkout. Its
`dsh-app://app` renderer opened the running type-design website and reloaded
it successfully; the application and panel URLs contained no navigation key.
The published `0.1.7` package subsequently passed a full native restart,
HTTP and workspace-file previews, annotation submission to the real DeepSeek
provider, unrelated composer-draft preservation, exact encoded queries and
hashes after redirects, and edited CSS/JavaScript after refresh despite immutable
cache headers. That check also exposed the undeclared-charset issue fixed in
`0.1.8`. These native checks are separate from automated web-profile acceptance.
Windows and Linux native windows have not been exercised.

The published `0.1.9` package passed native macOS acceptance after another full
quit and restart with Desktop CLI `0.2.0-rc.2`. Reopening the same redirect kept
the final encoded query/hash URL; Chinese controls and notes worked on an
undeclared-charset page. The real DeepSeek provider returned the requested
receipt, accepted notes and pins cleared while an unrelated composer draft
remained unsent, and reload displayed edited CSS and JavaScript despite
immutable upstream caching. Workspace-file preview, title picking and Esc
cleanup also passed. Existing Desktop and web profiles each have exactly one
`0.1.9` bundle and no peer dependency issues. Temporary, user-approved package-age
exceptions were removed after installation. These results cover macOS Apple
Silicon; Windows and Linux native acceptance remains untested.

## Packed web-profile acceptance: 2026-09-29

| Component | Tested version or environment |
| --- | --- |
| DeepSeek Harness Desktop and its CLI | `0.2.0-rc.2` |
| Bundled `@deepseek-ai/dsh-web-app` | `0.2.0-rc.2` |
| Bundled `@deepseek-ai/dsh-api-session-controller` | `0.2.0-rc.2` |
| Plugin | `0.1.3` checkout, installed from `npm pack` |
| Node.js | `25.5.0` test runner; `24.18.1` bundled desktop runtime |
| Chromium | `153.0.8010.12` |
| Host | macOS, Apple Silicon |

The Desktop app's packaged manifests identify the bundled web app and session
controller versions. Its CLI is a shell wrapper around `app.asar`, so the test
runner cannot resolve those manifests with ordinary Node module resolution.

In an isolated profile, `dsh plugin add` selected the package's declared bundle
without a manual plugin insertion. Chromium then opened Annotate, previewed a
workspace page, submitted an annotation to the real session controller, and
confirmed that the local model fixture received its context while an unrelated
composer draft remained unsent. This check used a packed checkout, not the
published npm package or a real model provider.

## Published-package upgrade acceptance: 2026-09-30

On the same Desktop `0.2.0-rc.2` installation, an existing web profile with a
source-link dependency and manual `cordis.patch.yml` insertion was upgraded to
the published `dsh-annotate@0.1.3` tarball. Updating the existing dependency
alone did not add it to `dsh.profile.bundles`; removing and adding the package
through `dsh plugin` did. With the old insertion removed, `--dump-config`
contained exactly one `- id: dsh-annotate` row. A separately started web profile
then displayed **UI annotations** and opened a running local service in its
preview. This published-package check covered installation, composition, and
the panel and preview UI; the send-to-session check above used the packed
checkout and a local model fixture.

## Earlier web-profile acceptance: 2026-09-22

| Component | Verified version |
| --- | --- |
| `@deepseek-ai/dsh` CLI | `0.1.5-rc.2` |
| `@deepseek-ai/dsh-web-app` | `0.1.5-rc.3` |
| `@deepseek-ai/dsh-api-session-controller` | `0.1.5-rc.3` |
| Node.js | `25.5.0` |
| Chromium | `153.0.8010.12` |
| Host | macOS, Apple Silicon |
| Plugin | Earlier unreleased checkout, installed from `npm pack` |

The earlier check predates the `0.1.3` bundle and peer declarations. The CLI
can resolve runtime package versions through ranges, so its version alone does
not identify every package it loads. These tables record specific tested
combinations, not a promise of support for every earlier or later Harness build.
Node 20/22/24 build checks and the ordinary Chromium suite use the repository
fixture; they are separate from native Harness acceptance.

## Reproduce the packed web-profile check

Install the repository dependencies and Chromium as described in the README.
The check also needs the official `dsh` CLI and pnpm on `PATH`:

```sh
npm run test:harness
```

For a separate CLI installation:

```sh
DSH_CLI=/absolute/path/to/node_modules/.bin/dsh npm run test:harness
```

For the macOS Desktop CLI:

```sh
DSH_CLI="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" npm run test:harness
```

The script creates its own temporary `DSH_HOME` and workspace, packs this checkout,
installs that tarball using `dsh plugin`, and asserts that the package's bundle
is selected in the new profile without a manual insertion. It then configures
the local model fixture and browser directory picker, and starts the real web
app on an available loopback port. It drives Chromium
through workspace selection, a conversation, element selection and annotation
submission. It asserts that the real session controller accepts the annotation,
the structured context reaches the model endpoint, and an unrelated composer
draft remains unsent.

The model endpoint is a local Chat Completions or DeepSeek Messages protocol
fixture, chosen from the actual request. No paid model, user credentials,
or existing profile is used. Official browser-based directory picking replaces
the native OS chooser for automation. This verifies the Harness integration and
message delivery, not real-provider authentication or model response quality.
The script stops its processes and removes its temporary home on exit. A failed
browser check leaves `tests/shots/harness-failure.png` for diagnosis.

## Unsupported combinations

- Firefox and Safari have not passed the complete cookie and preview suite.
- Remote Harness servers and HTTPS reverse-proxy deployments are outside the
  local-loopback design.
- If a Harness release changes sidebar slots or the session-controller contract,
  run the native check before claiming support. An unavailable send contract
  leaves annotations intact and offers **Add to composer** as a fallback.
