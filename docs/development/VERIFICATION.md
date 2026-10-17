# Verification record

Verified on 2026-10-17, macOS arm64, Node 24.14.0, Electron 40.10.6, installed Codex CLI 0.163.0-alpha.10.2. This records observed results; it is not a claim that all roadmap requirements are finished.

## Automated core and adapter checks

`npm test`: **35 tests passed**, 3 test files (v0.1.1).

Coverage includes immutable prompt invariants/untrusted delimiters, prompt size and secret redaction, variable resolution, skill frontmatter validation, dependency graph/cycle validation, scope locks and actual concurrent scheduling, retry bounds/dependency blocking/cancellation, symlink/path boundary checks, subprocess timeout/cancellation/environment filtering, split-chunk secret redaction, SQLite migration/reopen/event ordering, independent atomic model settings, interrupted session recovery, a deterministic complete worktree execution/approval flow, and encoded-space packaged file URL origin validation.

Provider tests launch subprocess fixtures to exercise the same Codex transport contract, sandbox/feature arguments, nonzero/structured failure handling and successful-terminal-event cleanup. A local HTTP SSE server tests compatible API discovery and split stream frames. These are contract tests; they do not establish real Anthropic, Google or external compatible API account access.

`npm run build`: TypeScript strict checks (including unused declarations) and production renderer/main/preload bundles passed. Vite reports two harmless third-party Zod pure-annotation warnings; they do not fail the build.

`npm run format:check`: passed.

## Real desktop checks

`npm run test:e2e`: passed using real Electron windows and IPC, not a browser mock. Checks cover launch, native desktop bridge, adding/reopening a local project, objective suggestion input, independently persisted planner/coder IDs, prompt version creation and compiled preview, skill validation/review/enable, project memory and full application restart. No renderer page errors were observed. Screenshots are generated under ignored `artifacts/`.

Additional visual inspection opened a real completed Codex session and rendered its persisted task graph, actual diff and individual/combined passing test results. No seeded activity or fabricated metrics are used.

## Real Codex workflow

`npm run test:provider`: passed on a temporary committed Git repository containing `value.js` and an existing failing `node:test` assertion. The real authenticated provider:

1. Returned a valid one-task JSON plan with a `value.js`-only write scope.
2. Changed `module.exports = 1` to `module.exports = 2` in an isolated worktree.
3. Returned a successful structured terminal event.
4. Passed actual per-task `node --test` verification (1 pass, 0 failures).
5. Passed the same command against the combined integration worktree.
6. Produced a real supervisor review.
7. Left the original file unchanged until explicit test-harness apply approval.
8. Applied the checked patch and persisted a completed session.

The initial real run passed, but a hardened rerun uncovered a CLI that stayed alive after emitting `turn.completed`. A regression test now reproduces that behavior. The process runner gives a successful terminal event a bounded cleanup grace period, then stops the process group while preserving the completed result. The full real workflow passed again with apps/plugins/hooks/browser/computer/image/nested-agent features explicitly disabled. No inherited plugin transport errors occurred in that rerun.

The provider occasionally logged a model-catalog refresh timeout but still executed the selected runtime default successfully. These diagnostics remain visible rather than being hidden or represented as guaranteed model discovery.

## Distribution

`npm run package` produced a local unsigned macOS arm64 application and ZIP. The actual packaged executable passed launch, IPC, independent model setting persistence and restart checks. This test also found and fixed an encoded-space file-URL origin mismatch that source development did not expose; the origin helper now has a regression test. Signing/notarization, Windows/Linux, strong host-test isolation, other real provider accounts and adversarial repository security have not been validated.

## v0.1.1 follow-up

The empty `tasks[0].files` failure is fixed by supporting an empty scope as read-only and routing its provider invocation through read-only mode. A regression test exercises the actual service path and confirms attempted writes fail rather than becoming wildcard access. Planner validation failures now produce an actionable message.

Native CLI OAuth sign-in and verification were added in Settings. Tests cover preserved Codex ChatGPT sessions, API-key-to-OAuth intent, safely quoted `.command` paths with a dedicated workspace, real-response verification versus mere model catalogs, eligibility-state classification, and stale-login rejection. The desktop E2E passes with the new provider controls present.

The official Antigravity 1.4.0 release was downloaded from Google’s installer manifest and SHA512-verified. Its actual catalog returned the Gemini 3.8 Flash high/medium/low identifiers. Interactive onboarding was completed with explicit user approval of its Terms and optional interaction-data collection disabled. A real headless request then returned the provider’s account/location eligibility error. Successful Antigravity inference/sign-in is not claimed. Codex reports an existing ChatGPT login; it was preserved.

## v0.1.2 project setup and catalog

43 automated tests cover the existing execution/provider paths plus new/unborn Git setup, binary-byte preservation, credential exclusions, existing dirty-tree and staged-index preservation, folded YAML descriptions, source failures, Git fallback, package integrity, local installation, no-overwrite/symlink boundaries, resource copying and project-scoped activation. Strict build, formatting and the desktop/restart E2E pass; its project now starts without Git and gains an initial baseline automatically.

The live catalog UI smoke searched the actual source repositories, opened a pinned Vercel web-design-guidelines package, verified the unchecked-review install gate, installed it into a disposable project, checked package content/provenance/activation, and confirmed clean Git status. GitHub returned an unauthenticated API rate-limit error during verification; the added shallow Git metadata fallback then passed the complete flow without an API key. Repository stars are marked unavailable on fallback results. No real user project received a skill during testing.

The v0.1.2 unsigned macOS package passed launch, native IPC and restart-persistence checks. Existing Codex/Antigravity connection limitations are unchanged.

## v0.1.3 performance follow-up

Graphify's installed local code-only AST extractor and Node CPU profiles identified the repeated context and stream persistence paths. The same 75-file/500-event fixture measured estimated context tokens falling from 13,334 to 1,907, synchronous output enqueue time from 413 ms to approximately 34 ms, and database exports from 501 to 9. Every event survived the clean-restart check, and selected context now included the late-file target function that the original leading-file truncation omitted. Context retrieval remained around 10–12 ms; no speedup or provider billing reduction is claimed for that step. See PERFORMANCE.md for commands, tradeoffs and fixture limits.

All 50 automated tests, strict build, formatting, and Electron UI/restart E2E passed. A real Codex workflow planned and changed a disposable value.js fixture, passed actual per-task and combined node --test checks, produced a supervisor review, preserved the original before approval, and applied the approved patch. This also exposed an ESM bundling issue in the development smoke script after the YAML dependency was added; externalizing its installed packages fixed the harness before the successful rerun.

The user's Mac was locked during delivery. The updated unsigned macOS package was therefore built separately under release/performance-v0.1.3 to preserve the currently running app/session. Its package smoke uses a disposable profile; the real desktop session requires a user relaunch after unlocking.

## v0.1.4 Nexload prompt core

The live source checkout was inspected at revision 354617af976b359f4459be85330015c3929aa4cb. The integration uses its agent-skill reasoning contracts through compact local profiles, not an invented npm prompt API. The source manifest records eleven file hashes. The built-in core, selected profile, runtime binding, source provenance and system-prefix boundary are persisted in new compiled snapshots; existing historical records remain readable.

56 application tests pass, including source/routing/size/determinism/offline checks, explicit system/user message separation for compatible APIs, exact CLI preface forwarding, and complete fake-provider execution. The latter now checks that read-only dependent tasks and the supervisor receive prior worker results as bounded untrusted evidence. Test discovery is scoped to Aether's tests directory so ignored reference checkouts cannot execute their own unrelated suites.

The Electron UI/restart E2E passed with the new core inspector, source manifest, and implementation/review profile previews. A real Codex fixture passed planning, implementation, actual per-task and combined Node tests, read-only supervisor review and approved apply. Its persisted records were inspected to confirm kernel, execution and review profiles, source revision/hash and worker handoff pointers. Existing authentication and provider eligibility limitations remain unchanged.

The final v0.1.4 unsigned macOS package passed launch, version matching, native IPC, restart persistence, pinned core inspection, and reviewer/system-prefix preview checks with a disposable profile. A final actual Codex rerun also passed after system-prefix transport and bounded worker-result handoffs were enabled, and its snapshots included the expected Nexload provenance.

## v0.1.5 live graph, continuation and bidi

All 61 tests passed, including a complete deterministic read-only analysis → linked implementation plan → approved code invocation → review → apply workflow. A continuation with only read-only scopes fails before scheduling. Existing read-only-write rejection remains covered. Graph tests exercise source/path filtering, excluded secrets and symlinks, cached unchanged reads, edit/deletion invalidation, shutdown and bounded output.

The desktop E2E passed. The additional live UI acceptance uses the actual installed Graphify CLI: real function nodes appear, editing source adds a node automatically, unchanged reads retain the extraction timestamp, search/selection work, and Persian/Arabic paragraphs and follow-up inputs use automatic direction with the bundled offline Vazirmatn font loaded. Its deterministic local HTTP planner confirms the continuation reaches plan approval and preserves prior deliverables. This fixture does not execute coding.

The actual Codex provider smoke independently continued from a seeded completed analysis fixture. It generated a concrete one-file implementation plan, executed workspace-write coding, passed the existing `node --test` test, completed a read-only supervisor review, and applied the approved one-file diff. Original project files stayed unchanged before application. This is a temporary acceptance project, not the user's saved weather project.

## v0.1.6 Ava companion

All 66 tests passed. Five companion regressions cover run-state mapping, phase-event trust, selected/background priority, review-versus-analysis approval wording, and valid changing SVG geometry from the pinned Bloub engine. The existing orchestration and no-write boundaries still pass.

Real Electron desktop regression and live UI acceptance passed. The latter verifies a completed character state, animation pause, collapse/expand, persisted minimization after reload, a real plan-approval transition to the question pose, and stable SVG geometry under reduced motion. The sidebar was adjusted so the companion participates in layout and does not cover recent-session controls. No model request was added by the companion; real provider execution code was unchanged by this UI addition.

## v0.1.8 project desktop widget

All 69 tests passed, including metadata-only activity projection, project isolation, active/attention counts and pagination through every persisted completion. Real Electron widget acceptance passed with two disposable projects and more than one page of task history. A local controlled planner drove actual initializing and approval transitions; the popup updated without provider-token streaming or account usage. Native checks covered always-on-top, disabled Node integration, unsupported command rejection, task navigation, pin/collapse/hide and persisted preferences. Desktop regression also passed with the new second window present.

The final v0.1.8 packaged app also passed the full widget acceptance fixture, including main-window close/reopen navigation to a newly created session, project/pin/collapse persistence and off-screen recovery. The packaged launch/IPC/restart smoke passed independently. The widget test harness is excluded from the shipped app.

## v0.1.9 coding teams

All 84 application tests passed, including 20 focused managed-team/provider tests. The latter execute fake CLI subprocesses to verify separate workspace-write draft, same-model read-only helper review and workspace-write integration sessions, bounded parallelism, cancellation, a shared deadline, untrusted result handoffs and aggregated usage. Desktop E2E verifies helper-limit settings persist.

An actual authenticated Codex workflow continued a disposable design fixture into an approved coding plan. The lead changed only value.js, a separate same-model helper inspected its diff and returned findings, and the lead assessed them before Aether ran the existing Node test. Worker/integration tests, read-only supervisor review and separately approved apply all passed. A fixed system-only shell PATH lets Git and basic file tools work without inheriting environment secrets. The retained final evidence is in the temporary aether-real-provider-Nn21fo fixture, outside the app source and real user data.

Source and packaged Electron acceptance displayed those persisted helper states, result excerpts and collaboration handoffs. Packaged v0.1.9 launch, IPC and restart persistence passed in a fresh profile. Native exec subagents remain disabled: an initial real experiment lacked spawn/close telemetry, so it was rejected rather than presented as a working native integration. The delivered implementation uses Aether-managed sessions with explicit lifecycle. The local code-only Graphify refresh produced 592 nodes and 1,626 edges without model usage.
