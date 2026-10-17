# ADR 001: Electron, React and TypeScript with local SQLite

Status: accepted, 2026-10-17.

The repository was empty (no manifests, source, commits or local instructions). The environment is macOS arm64, Node 24.14.0, npm 11.9.0, Git and Codex CLI 0.163.0-alpha.10.2. Rust/cargo, Claude Code and `agy` were absent.

Electron is chosen over the preferred Tauri route because it provides native folder/save dialogs, isolated renderer/preload IPC, OS secret encryption, direct supported CLI subprocess integration, and a distributable app with the installed toolchain. It costs more runtime/disk memory than a system-webview app; no arbitrary resource guarantees are claimed. A Rust toolchain is not installed solely to scaffold an untested wrapper.

React handles presentation; TypeScript/Zod define runtime boundaries. `sql.js` provides real SQLite without native ABI rebuilding across Electron and Node test runtimes. Atomic DB exports are simple and portable for this release, but native SQLite/WAL will be preferable for larger histories and robust multi-writer support.

Codex `exec --json` is the first real runtime. It offers a bounded supported CLI workflow and preserves existing authentication. App-server is a future transport for persistent conversations and fine-grained interactive tool approval; the application's adapter boundary permits that migration.
