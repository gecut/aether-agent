# macOS download integrity and approval

Aether 0.1.10 repairs the invalid application bundle signature in earlier development downloads. The affected 0.1.9 Apple Silicon DMG failed `codesign --verify --deep --strict` with `code has no resources but signature indicates they must be present`. Its main executable retained Electron's linker signature, with no sealed bundle resources and an unbound Info.plist, because packaging explicitly disabled signing with `identity: null`.

The new package uses an explicit ad-hoc identity (`-`), signs nested Electron binaries and seals the complete application. Hardened Runtime remains enabled. The entitlements permit V8 JIT and the library loading required by an ad-hoc Electron build; the renderer sandbox, Node isolation and IPC policy are unchanged. See [electron-builder's macOS signing guidance](https://www.electron.build/v26/docs/mac/).

CI now verifies the unpacked bundle, validates the DMG checksum, mounts the final DMG read-only and verifies the actual application inside it. A broken signature fails the build before assets can be published. This integrity check is separate from the packaged desktop smoke test and Apple's Gatekeeper assessment.

## Current limitation

These are ad-hoc signed development builds, not Developer ID signed or Apple-notarized public distributions. Ad-hoc signing fixes damaged bundle integrity but does not establish an Apple-verified publisher. The local Gatekeeper assessment still rejects this ad-hoc build, so macOS can block a downloaded preview, including with a generic damaged-app alert. A normal first-open experience for public downloads requires a Developer ID Application certificate and successful notarization through an Apple Developer Program account; that account is unavailable for this project.

Use the new 0.1.10 or newer download rather than the damaged 0.1.9 DMG. Copy the app to Applications before opening it. If macOS still blocks the intact preview, consult [Apple's official instructions for reviewing an app in Privacy & Security](https://support.apple.com/102445). Any system approval is the user's decision. Aether does not remove quarantine, disable Gatekeeper, or automate security-prompt approval.

A locally built copy is also available through `npm run package`; it is signed ad-hoc and retains the same notarization limitation. Existing workspaces and saved sessions are separate from the application bundle.

## Verification

```sh
npm run build
npx electron-builder --mac --arm64 --publish never
node scripts/verify-package.mjs mac arm64
node scripts/package-smoke.mjs
```

The equivalent Intel job uses `--x64`. `verify-mac-package.mjs` can also inspect a bundle directly. Signature checks, successful local launch and DMG integrity do not prove notarization or automatic acceptance of a quarantined download.
