# Persistent implementation checklist

Last updated: 2026-10-18. Checkboxes record implementation, not blanket production readiness.

## Reconnaissance and decisions

- [x] Inspect empty repository, toolchain, installed runtimes and authentication.
- [x] Fetch reference READMEs, repository metadata and selected source files; inspect licenses and actual scope.
- [x] Consult official Codex, Claude Code and Antigravity automation documentation.
- [x] Record stack, isolation and provider decisions.

## Runnable desktop and execution

- [x] Electron/React/TypeScript app with isolated preload, native folder picker and local SQLite.
- [x] Main workspace, inspector, settings, provider setup, Git/source/diff views, history and dark/light themes.
- [x] Independent model selectors and task-specific model ID overrides.
- [x] Real Codex structured planning, streamed worker execution, review and manual apply gates.
- [x] Task DAG, priorities, scopes, bounded concurrency/retries/cancellation and dependency blocking.
- [x] Separate worker/integration worktrees, conflict detection and preserved original user changes.
- [x] Per-task and combined verification with actual outputs and exit statuses.
- [x] Ordered persisted events, replay, restart recovery and fresh retry workspaces.

## Prompt, skill and knowledge features

- [x] Layered prompt compiler, invariant preservation, untrusted delimiters, deduplication, redaction, token estimates and hashes.
- [x] Versioned prompt fragments, activation/rollback, preview, static comparisons and export.
- [x] Skill import/create/validate/review/enable/export, roles and versions.
- [x] Project memory classifications/deletion and lexical context selection/provenance.
- [ ] Full nested directory rule resolution and semantic conflict detection.
- [ ] Symbol indexing and optional embeddings.
- [ ] Dynamic prompt variables beyond reserved project_name/role.
- [ ] Reproducible model-backed A/B benchmark runner and task-completion metrics.
- [ ] Full Agent Skills metadata, dependency validation, usage evaluations and reviewed skill improvement proposals.

## Providers and hardening

- [x] Codex real end-to-end provider smoke verification.
- [x] Claude read-only adapter contract; local absence disclosed.
- [x] Compatible API model discovery and SSE parsing contract test.
- [x] Antigravity documented pathway researched; installation diagnostics and explicit execution blocker.
- [x] Install official agy with checksum verification; add native CLI OAuth connection controls and real status verification.
- [ ] Resolve Antigravity account/location eligibility and demonstrate a successful model request; install and verify Claude Code.
- [x] Discover the exact Gemini 3.8 Flash model IDs through official agy catalog; account access remains blocked.
- [ ] Strong sandbox for host verification/dependency provisioning and non-Codex coding providers.
- [ ] Interactive app-server per-tool approvals, provider rate-limit governors and resource-adaptive concurrency.
- [ ] Token/cost budgeting, debugger-driven repairs, richer review acceptance and safe rollback/retention controls.
- [ ] Native SQLite/WAL for large histories, multi-instance locking and disk-failure recovery.
- [ ] Full independent security audit, signed/notarized release and cross-platform acceptance.

## Release checks

- [x] TypeScript/build and deterministic core integration tests.
- [x] Real Electron UI and restart checks.
- [x] Actual real-provider smoke with original-tree preservation and approved apply.
- [x] Final package build and actual packaged-app launch, IPC and restart persistence.
- [x] Final regression (56 automated tests), strict build and formatting checks.

## Follow-up fixes

- [x] Accept `files: []` for analysis-only tasks, route them through read-only execution, and reject any attempted write without broadening their scope.
- [x] Present planner schema failures as actionable errors rather than raw JSON validation dumps.
- [x] Preserve existing Codex OAuth sessions and expose native provider sign-in and verification controls.
- [x] Review Hermes model authentication, MCP connectors, community Antigravity plugins and backend-witnessed connection states.
- [ ] Google Antigravity account/location eligibility remains an external blocker.

## v0.1.2 project setup and catalog

- [x] Automatic local Git initialization and safe initial baseline; existing history, dirty files and staged unborn indexes preserved.
- [x] GitHub skills search, pinned package preview, reviewed project installation, resource/license preservation and provenance.
- [x] Project-scoped activation, isolated worktree resources, digest verification and overwrite/symlink rejection.
- [x] Regression tests for Git setup and package boundaries.

## v0.1.3 performance and token usage

- [x] Local Graphify AST graph and bounded dependency queries, plus before/after Node CPU profiling.
- [x] Scoped, bounded context with relevant source excerpts and local import neighbors; freshness-checked bounded source cache.
- [x] Bounded supervisor test-log excerpts with complete statuses and retained full session evidence.
- [x] Batched stream persistence and rendering; lifecycle records remain immediate.
- [x] Reproducible synthetic benchmark and 50 automated regression tests.

## v0.1.4 Nexload prompt core

- [x] Pinned Nexload reasoning source manifest and compact mandatory core across provider invocations.
- [x] Role-specific profiles, bounded worker handoffs and persisted planner/worker/review core provenance.
- [x] Prompt Laboratory core inspection and validated role previews.
- [x] Immutable Aether execution boundaries, plan JSON, read-only reviews and untrusted context isolation preserved.
- [x] Core size/offline/determinism/routing regressions and 56 application tests; reference checkouts excluded from test discovery.

- [x] System/user transport separation for compatible APIs, preserved CLI prefixes, and bounded worker-result evidence for dependencies/reviews.

## v0.1.5 continuation, live graph and bidirectional text

- [x] Completed analysis can continue into an implementation plan with bounded prior deliverables and parent-session provenance.
- [x] Implementation continuations require concrete write scopes; coding and final application retain their approval gates.
- [x] Read-only analysis completes without asking users to apply an empty diff; legacy no-op reviews can continue too.
- [x] Graphify view indexes actual source symbols, live source changes and active-task/integration worktrees, with cached extraction, search, selection and scope status colors.
- [x] Graph staging excludes ignored/sensitive paths and links; extraction is code-only, local, bounded and cancelled on shutdown.
- [x] Offline Vazirmatn v33.003, automatic Persian/Arabic prose/input direction, isolated identifiers and LTR code/diffs.
- [x] Regression coverage for analysis-to-coding lifecycle, no-write enforcement, graph boundaries/cache/freshness and desktop live graph/bidi layout.

## v0.1.6 Ava companion

- [x] Pinned MIT Bloub SVG core adapted to an Aether-specific mint body and a React renderer, with complete attribution.
- [x] Live planning/work/testing/review/approval/blocked/error/completion/rest states mapped from typed run lifecycle and phase events.
- [x] English captions and a navigation action open the relevant session; the companion never approves or executes work itself.
- [x] Persisted minimize/pause controls, keyboard access, reduced-motion support, 24 fps cap, hidden-window suspension and isolated lazy-loaded avatar rendering.
- [x] Lifecycle/state/engine tests and real desktop checks for pause, collapse persistence and reduced motion.

## v0.1.7 English companion copy

- [x] Ava name, lifecycle captions and actions use English with LTR alignment.
- [x] Existing user content and bidirectional editing support are preserved.

## v0.1.8 project desktop widget

- [x] Native frameless floating activity window with Ava, project filter, completed-task history and pending work/review states.
- [x] Every stored task completion reachable through paginated history; live lifecycle updates ignore token streams.
- [x] Task/session navigation restores the main window without approving or applying changes.
- [x] Restricted widget preload/IPC, metadata-only projection, origin/frame checks and disabled renderer Node access.
- [x] Persistent visibility, project, pin, collapse and position preferences with on-screen recovery.
- [x] Unit coverage for projection, privacy boundaries, counts and pagination; native Electron coverage for real lifecycle updates and desktop controls.

## v0.1.9 coding teams

- [x] Default-on coding teams with one to three same-model read-only review helpers, bounded findings returned to the coding lead for integration.
- [x] New-plan settings snapshots preserve older approved single-agent sessions; planner/analysis/supervisor retain their existing modes.
- [x] Managed session lifecycle, shared deadline, sibling cancellation, bounded persisted helper results and live team UI.
- [x] Native recursive agents remain disabled after real installed-CLI telemetry proved incomplete.
- [x] 84 tests, desktop E2E, actual Codex team workflow through verification/review/apply, and source/packaged helper-result display verified.
- [x] Packaged v0.1.9 launch, IPC and persistence checks passed; local Graphify refreshed without model calls.

## Automatic cross-platform releases

- [x] Push/manual workflow with native Windows x64, macOS arm64/x64, and Linux x64 packaging targets.
- [x] Pinned Actions, locked dependency installs, read-only build jobs and a separate release writer.
- [x] Package-content/distribution checks, Windows/macOS packaged smoke, complete-set publication and SHA256 checksums.
- [x] Hosted build checks gate publication; every release links its exact workflow run.

## Home, session, and repository experience

- [x] First-open feature walkthrough and ChatGPT-style objective composer with four guided starters.
- [x] Persisted session pinning and deletion, with active-session deletion blocked.
- [x] Up to four user-selected prompt images copied into private app data and attached only to Codex planning invocations; deleting a session removes its copied images.
- [x] Responsive compact sidebar, project menu stacking, non-obscured session history, and local lifecycle notification tone.
- [x] Original-project Git commit and normal push controls; commits use the user's configured Git identity and pushes are never forced.
- [x] A boot-loading surface and in-app release checker that opens only a verified Aether GitHub release page.
- [x] Ava conversations can start without a repository, persist locally, and flag requests that need a reviewed project plan.
- [x] Composer defaults to Ava chat; project planning is explicit and cannot send ordinary conversation through the task-plan schema.
- [x] Ava chat messages use a reduced-motion-aware animated bubble avatar, and startup keeps a visible loading state through initial hydration.
- [x] Light mode saves and applies immediately, including chat, composer, sidebar, and boot surfaces.
- [x] Ava chat uses the companion mascot and compact user-message bubbles; the header exposes a labeled Aether update action.
- [x] Integrated IDE provides safe text editing for project files and a direct VS Code handoff for extension-backed workflows; theme colors accept bounded JSON overrides.
- [x] Prompt references accept bounded images, PDF, Word, and common text files; text references are included in planning while binary documents remain private files.
- [x] Codex CLI stream-reset failures retry twice with bounded backoff before the session fails.
- [x] Run history uses readable session cards with separated metadata, status, and accessible pin/delete controls.
- [x] Empty-state titles and descriptions remain centered despite automatic prose direction; menus use a viewport-bounded overlay layer above scrolling panels.
- [x] Navigation, activity, inspector groups, explorer, extensions and file history support collapse/expand with versioned local preferences.
- [x] Session ellipsis menus support left-click pin/delete for chats and runs; deleting a chat cannot resurrect it when a response finishes.
- [x] Startup shows only Ava, including an inline initial mascot before the React application loads.
- [x] Monaco 0.57.0 provides the lightweight Quick editor; Full IDE adds a pinned Code-OSS workbench with its own real extension host.
- [x] File saves preserve bounded private version history with optimistic revision checks and restore actions; newly applied session changes can be reversed only while their checkpoint still matches.
- [x] Graphify detects macOS Python/parser CPU mismatches, retries once with the parser's architecture, remembers successful launches, and shows a concise repair action if recovery fails.
- [x] Dedicated IDE space has Back to Aether, Explorer/file management, Git, an integrated terminal, Open VSX/VSIX extensions, and collapsible right-side project chat.
- [x] Full IDE installs on demand with checksum, archive-path and free-space checks; loopback authentication, separate no-preload WebContentsView, workspace trust, cancellation and process cleanup preserve the app boundary.
- [x] Real macOS Code-OSS acceptance saved a file, ran a terminal command, installed a VSIX through the official runtime CLI, activated its command, verified its output file and displayed the installed extension.
- [x] Planner/coder menus search runtime catalogs and labeled official aliases, cache/coalesce catalog requests, preserve capability limits, and support exact IDs. Seven real Codex models were discovered without inference.
- [x] Economy/Balanced/Thorough budgets bound chat and code/evidence context. Economy skips helper calls without changing the selected model or approval gates. Full history/logs remain saved.
- [x] Repeated supervisor log lines are folded; the reproducible long-chat fixture measured 82% fewer estimated history tokens than the prior twelve-message policy in Economy (95% versus full history). No billing or equivalent-quality guarantee is implied.
- [x] Project chat persists separately by project, supplies bounded read-only source excerpts, offers reviewed planning for changes, rejects concurrent sends to the same chat, and cancels on shutdown.
- [x] Off-screen/hidden Ava work pauses; the visible widget receives changed system-cursor coordinates outside its window without storing or forwarding them to providers.
- [x] Direct Phosphor icon imports reduce transformed modules from 5,944 to 1,501; production builds pass under a 2 GB heap cap, and CI has bounded 4 GB build headroom to address the previous macOS heap failures.
- [x] IDE extraction uses the system archive tool with bounded diagnostics, stale-stage cleanup, actionable disk/permission errors and missing-runtime detection. Regression covers a broken desktop PATH.
- [x] Single-file static website includes Aether overview, workflow, downloads and FAQ, plus the Aether meadow footer. GitHub Pages publishes the website directory without a build step.
- [x] Rebranded the landing page entirely to Aether with real product links and an Ava-led interactive hero, using the app's mascot geometry and attribution. Removed sample credits/statistics, improved footer contrast and paused off-screen/reduced-motion animation.
