# Harness compatibility

The native acceptance check on 2026-09-22 passed with this resolved combination:

| Component | Verified version |
| --- | --- |
| `@deepseek-ai/dsh` CLI | `0.1.5-rc.2` |
| `@deepseek-ai/dsh-web-app` | `0.1.5-rc.3` |
| `@deepseek-ai/dsh-api-session-controller` | `0.1.5-rc.3` |
| Node.js | `25.5.0` |
| Chromium | `153.0.8010.12` |
| Host | macOS, Apple Silicon |
| Plugin | Current unreleased checkout, installed from `npm pack` |

The CLI depends on version ranges, so installing the same CLI version can resolve
different runtime packages later. The acceptance script prints the resolved web
app and session-controller versions. This table records one tested combination,
not a promise that every earlier or later Harness build is compatible. Node
20/22/24 build checks and the ordinary Chromium suite exercise the plugin with
the repository fixture; they are separate from this native Harness check.

## Reproduce the native check

Install the repository dependencies and Chromium as described in the README.
The check also needs the official `dsh` CLI and pnpm on `PATH`:

```sh
npm run test:harness
```

For a separate CLI installation:

```sh
DSH_CLI=/absolute/path/to/node_modules/.bin/dsh npm run test:harness
```

The script creates its own temporary `DSH_HOME` and workspace, packs this checkout,
installs that tarball using `dsh plugin`, enables the plugin in the new profile,
and starts the real web app on an available loopback port. It drives Chromium
through workspace selection, a conversation, element selection and annotation
submission. It asserts that the real session controller accepts the annotation,
the structured context reaches the model endpoint, and an unrelated composer
draft remains unsent.

The model endpoint is a local protocol fixture. No paid model, user credentials,
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
