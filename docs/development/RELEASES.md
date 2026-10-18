# Automatic desktop releases

[Build and release desktop apps](../../.github/workflows/build-release.yml) runs on every push (all branches and tags) and can also be started manually from Actions. Each successful workflow run creates a separate public development prerelease, tagged `build-<GitHub run ID>`, at its exact triggering commit. The app's package version is unchanged by CI. These prereleases do not replace a stable latest release.

## Downloads

| Platform | Architecture          | Files                   |
| -------- | --------------------- | ----------------------- |
| Windows  | x64                   | NSIS EXE installer, ZIP |
| macOS    | arm64 (Apple Silicon) | DMG, ZIP                |
| macOS    | x64 (Intel)           | DMG, ZIP                |
| Linux    | x64                   | AppImage, DEB           |

Find downloads in [GitHub Releases](https://github.com/gecut/aether-agent/releases). Files are named `aether-code-<version>-<platform>-<architecture>.<extension>`. Linux uses its native architecture labels: `x86_64` for AppImage and `amd64` for DEB. Each release also has `SHA256SUMS.txt` with hashes for its eight distribution files.

macOS builds are ad-hoc signed with verified bundle integrity, but are not Developer ID signed or Apple-notarized; Windows builds are unsigned. See [macOS download and approval notes](MACOS_RELEASES.md). Publishing installers does not imply every provider/runtime is verified on every operating system. Codex is included as a pinned native runtime; Claude and Antigravity install on request, and all providers require device-local authentication, and platform-specific provider and sandbox support retains the limitations documented in [provider setup](../providers/README.md).

## In-app update checks

The app's download icon checks Aether's public GitHub release feed from the main process. It validates that the result is an Aether release URL, then offers a button that opens that exact release page. The app does not download or install a build automatically: macOS builds are not Developer ID signed or notarized and Windows builds are unsigned.

## Checks and publication

1. An Ubuntu check job installs locked dependencies, checks formatting, and runs deterministic tests without model calls.
2. Four native runner jobs each build the renderer/main process and package their platform. macOS uses separate Apple Silicon and Intel hosts. Windows/macOS run the packaged launch/IPC/restart smoke in temporary userData. On macOS the harness terminates only its disposable app process between launches to avoid Electron debugger quit races; this checks persistence without claiming graceful user-initiated shutdown. Windows uses normal Playwright app closure so its profile lock is fully released before restart. Linux checks its archive contents and distribution files; this workflow does not claim Linux desktop runtime acceptance.
3. Each job verifies the app version, renderer, preloads, WASM and licenses, runs the bundled Codex version command with an empty PATH, checks Windows sandbox helpers, excludes development harnesses, and requires both expected distribution formats. macOS additionally checks the unpacked bundle signature, DMG integrity and the signed application inside the read-only mounted DMG.
4. A publication job downloads artifacts only after every job succeeds. It requires exactly eight distributions, generates checksums, creates a draft prerelease, uploads all nine assets, and publishes only after upload succeeds. A failed upload leaves a recoverable draft. Rerunning the same workflow run first returns its release to draft, replaces the assets, then republishes the complete set.

Each action is pinned to its inspected upstream commit. Build/check jobs have read-only repository access and checkout does not persist Git credentials. Only the publication job receives `contents: write`, using the built-in `GITHUB_TOKEN`; no personal access token or signing secret is needed. Packaging uses `--publish never`; application builds cannot publish directly. No sandbox-bypass flags are introduced.

Intermediate Actions artifacts are retained for seven days; published release assets remain on GitHub until explicitly removed. New pushes have distinct release tags and do not cancel earlier pushes. Package outputs and smoke profiles are not committed to the source repository.

## Local packaging

The existing `npm run package` keeps its local macOS directory/ZIP behavior. For the CI formats, build once and invoke the appropriate native command:

```sh
npm run build
npm run prepare:providers
npx electron-builder --mac --arm64 --publish never
# On Windows: npx electron-builder --win --x64 --publish never
# On Linux: npx electron-builder --linux --x64 --publish never
node scripts/verify-package.mjs mac arm64
```

The workflow definitions follow the official [runner image labels](https://github.com/actions/runner-images), [Electron Builder platform guidance](https://www.electron.build/multi-platform-build.html), and [GitHub CLI release interface](https://cli.github.com/manual/gh_release).

The website resolves the newest complete published release from GitHub's public release feed, including prereleases. It updates platform-specific download URLs, checksums and release notes together; incomplete releases are ignored. Without JavaScript or API access, links open GitHub Releases rather than pinning users to an obsolete installer.
