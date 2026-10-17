# Automatic desktop releases

[Build and release desktop apps](../../.github/workflows/build-release.yml) runs on every push (all branches and tags) and can also be started manually from Actions. Each successful workflow run creates a separate public development prerelease, tagged `build-<GitHub run ID>`, at its exact triggering commit. The app's package version is unchanged by CI. These prereleases do not replace a stable latest release.

## Downloads

| Platform | Architecture          | Files                   |
| -------- | --------------------- | ----------------------- |
| Windows  | x64                   | NSIS EXE installer, ZIP |
| macOS    | arm64 (Apple Silicon) | DMG, ZIP                |
| macOS    | x64 (Intel)           | DMG, ZIP                |
| Linux    | x64                   | AppImage, DEB           |

Find downloads in [GitHub Releases](https://github.com/gecut/aether-agent/releases). Files are named `aether-code-<version>-<platform>-<architecture>.<extension>`. Each release also has `SHA256SUMS.txt` with hashes for its eight distribution files.

Builds are unsigned; macOS is not notarized. Publishing installers does not imply every provider/runtime is verified on every operating system. CLI providers must be installed and authenticated separately, and platform-specific provider and sandbox support retains the limitations documented in [provider setup](../providers/README.md).

## Checks and publication

1. An Ubuntu check job installs locked dependencies, checks formatting, and runs deterministic tests without model calls.
2. Four native runner jobs each build the renderer/main process and package their platform. macOS uses separate Apple Silicon and Intel hosts. Windows/macOS run the packaged launch/IPC/restart smoke in temporary userData. Linux checks its archive contents and distribution files; this workflow does not claim Linux desktop runtime acceptance.
3. Each job verifies the app version, renderer, preloads, WASM and licenses, excludes development harnesses, and requires both expected distribution formats.
4. A publication job downloads artifacts only after every job succeeds. It requires exactly eight distributions, generates checksums, creates a draft prerelease, uploads all nine assets, and publishes only after upload succeeds. A failed upload leaves a recoverable draft. Rerunning the same workflow run replaces the assets on that run's release.

Each action is pinned to its inspected upstream commit. Build/check jobs have read-only repository access and checkout does not persist Git credentials. Only the publication job receives `contents: write`, using the built-in `GITHUB_TOKEN`; no personal access token or signing secret is needed. Packaging uses `--publish never`; application builds cannot publish directly. No sandbox-bypass flags are introduced.

Intermediate Actions artifacts are retained for seven days; published release assets remain on GitHub until explicitly removed. New pushes have distinct release tags and do not cancel earlier pushes. Package outputs and smoke profiles are not committed to the source repository.

## Local packaging

The existing `npm run package` keeps its local macOS directory/ZIP behavior. For the CI formats, build once and invoke the appropriate native command:

```sh
npm run build
npx electron-builder --mac --arm64 --publish never
# On Windows: npx electron-builder --win --x64 --publish never
# On Linux: npx electron-builder --linux --x64 --publish never
node scripts/verify-package.mjs mac arm64
```

The workflow definitions follow the official [runner image labels](https://github.com/actions/runner-images), [Electron Builder platform guidance](https://www.electron.build/multi-platform-build.html), and [GitHub CLI release interface](https://cli.github.com/manual/gh_release).
