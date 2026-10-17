# Environment and development

No `.env` file is required. Never add credentials to environment examples or source control.

| Variable           | Purpose                                     | Normal usage                                            |
| ------------------ | ------------------------------------------- | ------------------------------------------------------- |
| `AETHER_DEV_URL`   | Renderer dev origin                         | Set automatically by `npm run dev` to loopback Vite     |
| `AETHER_TEST_DATA` | Isolated absolute userData directory        | Used by desktop E2E; leave unset for ordinary launch    |
| `PATH`             | Runtime executable discovery                | Include supported CLI installs                          |
| `HOME`             | Supported CLI's own authentication location | Inherited by runtime; Aether does not read login tokens |

Child environments use an explicit small allowlist, not a copy of the host environment. Aether does not forward `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, shell secrets or unrelated credentials. Compatible API keys should be entered in Settings and stored through `safeStorage`.

## Troubleshooting

- **No initial commit / not a Git repository:** Aether initializes eligible new folders and creates a safe initial baseline when the index is empty. If staged work already exists, create your first commit yourself; Aether preserves the staged index.
- **Uncommitted changes:** commit or stash your work yourself before execution. Planning and source inspection remain available.
- **CLI not found:** install the provider using its official documentation, ensure PATH is correct, then run diagnostics. Codex desktop's bundled CLI is also detected.
- **Unknown CLI flag:** the tested Codex version and required flags are listed in provider docs. Update to a compatible official runtime; do not bypass sandbox flags.
- **Unknown or unauthorized model:** clear the model ID to use a CLI default, or choose an account-supported model. Aether does not silently swap providers/models.
- **Worktree test cannot find dependencies:** inspect its path in the persisted trace/task record. Dependencies are not installed automatically. Prepare that isolated workspace manually if appropriate; a retry creates a new attempt, so dependency provisioning for fresh attempts remains a limitation of this release.
- **Context budget exceeded:** shorten role fragments, disable irrelevant skills, or reduce the objective/context. Token counts are estimates.
- **Original changed before Apply:** apply is blocked to preserve user changes. Inspect the retained integration patch and integrate manually or create a new plan against the current baseline.
- **Interrupted run:** reopen the app; the run is blocked with a reason. Retry remaining tasks where a valid plan and original baseline are still available. Worker process conversations are not resumed.

## Distribution

`npm run package` uses electron-builder to produce a macOS arm64 `.app` and ZIP in `release/`. Signing identity is disabled for development packages. The [automatic release workflow](RELEASES.md) packages Windows, macOS and Linux on native GitHub-hosted runners and publishes development prereleases after all checks pass. No signing credentials or auto-updater is configured; packaging does not establish cross-platform provider/sandbox behavior.
