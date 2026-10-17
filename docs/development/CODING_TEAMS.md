# Coding teams

New plans enable Aether-managed Codex coding teams by default, with one review helper. Settings permits one to three helpers per writing task. The approved run snapshots this setting; older sessions without it keep single-agent execution. Planning, analysis-only tasks and the final supervisor remain single-agent.

Each coding lead first implements the approved task in its isolated worktree. Aether then starts the configured number of separate Codex review sessions concurrently, using exactly the task's selected model and reasoning configuration. Helpers inspect the same diff in a read-only sandbox with complementary correctness, acceptance/scope and maintainability briefs. Aether waits for all helpers, passes bounded findings back to a fresh coding-lead invocation, and asks it to assess findings and integrate corrections. This is a fixed bounded collaboration cycle, not recursive autonomous delegation. Helpers cannot write implementation files; the lead performs integration.

All CLI sessions disable native subagents, inherited integrations and network access, with existing approval/sandbox controls. A real experiment with installed CLI 0.163.0-alpha.10.2 exposed incomplete native exec spawn/coordination telemetry and no close-helper tool. That result was rejected. Managed sessions provide observable lifecycle without claiming unsupported native capabilities.

The renderer displays actual delegated helper states, result excerpts and handoffs in Agents & teams and the task inspector. No helper is shown before its session is scheduled. Completed helper sessions show Finished; failures fail the task and abort sibling sessions. A shared task deadline, user cancellation and process-group cleanup apply to every phase. No changes are accepted if a phase fails. Team usage sums the usage returned by every CLI invocation; it is provider-reported telemetry, not a billing estimate. Helper results are redacted, bounded and wrapped as untrusted evidence.

Leads and review helpers run in separate phases: the maximum active CLI sessions per run is parallel task leads multiplied by the greater of one and the helper count. Native recursive helpers remain disabled. Independent Aether tasks still use the existing dependency scheduler, isolated worktrees and committed dependency handoffs.

## Verification

- Unit tests cover settings compatibility, phase ordering, handoffs, parallel helper limits, same-model configuration, sandbox modes, failure/cancellation, deadlines, bounded evidence and usage aggregation.
- `npm run test:provider` uses an actual authenticated Codex runtime in a disposable project, requiring helper lifecycle/handoff evidence, passing host verification, final review and separately approved apply.
- `node scripts/e2e.mjs` verifies settings persistence in an isolated desktop profile.
- `AETHER_TEAM_DATA=/absolute/temp/aether-real-provider-.../data node scripts/team-ui.mjs` opens the retained real-provider fixture and verifies displayed helper results/handoffs. `AETHER_PACKAGE_PATH` optionally selects a packaged executable. Never use the user's real profile for acceptance.
