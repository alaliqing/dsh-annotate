# Installation troubleshooting

[简体中文](install-troubleshooting.zh-CN.md)

Use this page when the [normal installation](../README.md#install) fails or the
panel is missing after restart. It is not a checklist for every installation.

## Permission denied (`EPERM`)

A coding agent's sandbox may not allow writes to the Harness profile or
package-manager cache outside its workspace. Check the path named in the error,
then approve the required writes for that operation or run the install command
in an external terminal. Check permissions before changing file ownership.

## CLI or profile not found

Open Desktop once to initialize its reserved `desktop` profile. Use Desktop's
bundled CLI for that profile; the standalone npm CLI cannot manage it. Adjust
the application path if Desktop is installed elsewhere. The bundled CLI includes
Node.js and pnpm.

If Desktop installed its `dsh` command on `PATH`, this is equivalent:

```sh
dsh plugin --profile desktop add dsh-annotate@0.1.14
```

For a browser started with `npx @deepseek-ai/dsh web`, use:

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-annotate@0.1.14
```

## pnpm refuses a newly published version

The README uses an exact version because pnpm 11's default 24-hour release-age
filter can make `@latest` select an older release. With bundled pnpm `11.7.0`
and default settings, the exact-version command succeeds and automatically
records a version-specific `minimumReleaseAgeExclude` entry.

If strict release-age checks refuse the version, wait for the configured period
to end. To allow a reviewed release immediately, append only that exact version
to the existing list in the active profile's
`$DSH_HOME/profiles/<profile>/pnpm-workspace.yaml`
(default `~/.dsh/profiles/<profile>/pnpm-workspace.yaml`), then retry:

```yaml
minimumReleaseAgeExclude:
  - dsh-annotate@0.1.14
```

Keep all other settings and exclusions. Remove this version's exception once
the waiting period has passed.

## Installed, but Annotate is missing or does not work

Wait for the current task to finish, then fully quit and reopen Desktop, or
restart the web profile and refresh the browser. Reloading a preview alone does
not load the updated plugin.

If the problem remains, check the active profile:

- `node_modules/dsh-annotate/package.json` has the version you installed.
- `package.json` → `dsh.profile.bundles` contains exactly one `dsh-annotate`.

For web profiles, `dsh --profile web --dump-config` should contain exactly one
`- id: dsh-annotate` row. Desktop does not support that CLI command.

After reopening, open **Annotate** (`⌘/Ctrl⇧B`), choose a local app, and save an
annotation. The package ships built files and registers its own bundle; a normal
install needs neither a build step nor a manual patch entry.

## Upgrading `0.1.2` or earlier (web)

These versions used a manual insertion in the profile's `cordis.patch.yml`:

```yaml
- insert:
    - name: dsh-annotate
```

Remove and add the package so Harness registers its bundle. Replace `web` with
your web profile name if needed:

```sh
dsh plugin --profile web remove dsh-annotate
dsh plugin --profile web add dsh-annotate@0.1.14
```

Remove only the old manual insertion from `cordis.patch.yml`, preserving other
entries. If no entries remain, write `[]` rather than leaving only comments.
Restart the profile, refresh the browser, and check for one annotation row with
`dsh --profile web --dump-config`.
