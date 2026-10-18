# Security boundaries

Aether executes coding tools locally. Only use it on repositories and test commands you trust. This release is not a hardened environment for hostile repositories.

## Enforcement

- The renderer has `contextIsolation`, Chromium sandboxing and web security enabled, no Node integration, a restrictive CSP, no remote HTML, denied browser permissions, denied new windows, and blocked navigation.
- The preload exposes a single validated command bridge and event subscription. The main process checks sender, main frame, origin, command payload size, and schemas. Unknown commands fail; there is no unrestricted shell IPC endpoint.
- Subprocesses use argument arrays with `shell: false`, a small environment allowlist, timeout/output caps, AbortSignals, process-group termination and escalation. Host API keys and arbitrary environment variables are not forwarded.
- Codex uses `workspace-write` for workers, `read-only` for planning/review, `approval_policy=never`, network disabled for worker shell tools, an empty shell environment inheritance policy, and explicit disabling of inherited apps/plugins/hooks/browser/computer/image/nested-agent features. CLI/account policy still determines the available runtime sandbox. Aether does not use dangerous sandbox-bypass flags.
- Worktrees isolate changes from the original project. Post-execution file scope checks reject out-of-scope and sensitive changes. These checks detect violations after they occur inside an isolated worktree; they are not a filesystem access-control sandbox.
- The app requires a clean committed original baseline to execute. Before applying, it rechecks HEAD and dirty state and runs `git apply --check`. It never resets, cleans, stashes, overwrites, commits, pushes, deploys or publishes the original repository automatically.
- Per-task and combined verification commands come from an explicit finite allowlist and appear in the plan before approval. **These commands execute repository code on the host outside Codex's sandbox.** Their arguments are fixed, but package scripts themselves can do anything the local user can do. Isolation of verification in containers/OS sandboxes is a remaining production gate.
- Source previews and context collection enforce canonical path boundaries including symlinks. `.env`, private keys, auth/credential files, dependency/generated directories and selected sensitive paths are excluded by default. Git ignore rules govern untracked file enumeration. This is a heuristic exclusion policy, not a guarantee that arbitrary source never contains secrets.
- Recognized key/token/password patterns are redacted before log persistence and prompt snapshots. Original patch content is kept to apply exact source changes; source/diffs may contain sensitive content the detector cannot recognize. Review your code before using a remote model. No remote telemetry collector is configured by Aether.

## Credentials

CLI accounts stay in their own supported credential stores. Aether invokes the user-authenticated runtime and does not inspect its tokens. Compatible API credentials are stored only as Electron `safeStorage` ciphertext under the application's private data directory. They are never returned to the renderer, embedded in prompts, or written to project configuration. Remote compatible APIs require HTTPS; HTTP is accepted only on loopback. Credentials in endpoint URLs are rejected.

The metadata database is not encrypted. Treat userData and retained worktrees as private source artifacts. File permissions are 0600 for the DB and encrypted key; the data directory is 0700. Protect local backups and do not commit these files. Keychain/OS account access remains a trust boundary.

## Prompts and skills

Platform invariants cannot be replaced by project instructions or skill imports. Untrusted context is delimited and its provenance is included. Imports stay disabled; reviewed versions need an explicit enable action. Importing a skill never runs installation scripts or expands capabilities. Natural language safeguards do not prevent all prompt injection; isolated processes, the provider sandbox, review gates and filesystem validation provide the execution boundary.

## Known gaps before broad production use

Verify the Codex sandbox on each supported platform/version; sandbox verification commands; audit project-level CLI configuration behavior; implement multi-process SQLite locking and robust disk-full recovery; add structured secret detection, dependency provisioning isolation, optional encrypted histories, retention controls, signed updates and signed/notarized releases. Aether has no automatic background startup or scheduling daemon. Closing the app cancels its workers; worktree files are deliberately retained.

Report defects privately to the repository maintainer. Do not include API keys, private source code or account tokens in bug reports.

## Automatic repository setup and catalog packages

Opening a new project authorizes a local Git initial baseline. Existing repositories with history and staged unborn indexes are preserved. Baseline staging uses the inspected bytes, excludes recognized credentials, sensitive/generated paths, symlinks and oversized files, and does not run Git hooks or signing helpers. Secret detection is heuristic. No Git remote is created or contacted.

The public catalog is restricted to OpenAI, Anthropic and Vercel repositories. Search sends no project contents; packages are pinned to source commits and blob hashes. Installation requires an explicit reviewed action, is project scoped, preserves available source licenses, refuses existing paths and symbolic links, and copies resource files without executable permissions or setup-script execution. Packages are locally ignored by Git, and enabled package hashes are verified before copying resources into task worktrees. Skill instructions remain untrusted prompt material and do not grant capabilities. Download/file limits and source failures are surfaced.

## Optional Telegram remote decisions

Telegram is opt-in and uses an outbound Bot API connection, not a local inbound server. A dedicated bot token is stored outside SQLite with OS encryption; Linux `basic_text` fallback is refused. Pairing requires a random ten-minute code in a private DM and recipient confirmation in the desktop app. Notifications send project/task status to this recipient; requested reviews include file paths, patches and verification evidence. Recognized credential patterns are redacted, but heuristic redaction cannot guarantee source confidentiality. Consider that content before consenting to Telegram sharing.

Remote decisions default to disabled. When enabled, fixed action buttons require the paired sender/chat, original delivered message, an unexpired random persisted token, and a matching fingerprint of the current plan, execution configuration, scopes, model selection, patch and verification evidence. Full reviews are delivered before approval/apply buttons are issued; oversized reviews require the desktop app. Tokens are durably consumed before dispatch and never replayed automatically after an interruption. Decisions are recorded in run evidence and go through existing execution/apply checks. Freeform Telegram text cannot execute code, change scopes, create runs, commit or push. The app must remain running; pause/disconnect stops polling and remote commands. A bot must not be shared with other consumers or webhooks.
