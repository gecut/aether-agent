# Provider setup and capability status

## Searchable model selection

Planner/coder pickers search models across installed providers and show their source. Codex uses the official app-server `initialize`/`model/list` protocol without starting an inference turn; the local runtime returned seven models and their supported reasoning efforts in 271 ms. Catalog discovery is cached for five minutes with concurrent request coalescing. Normal inference still uses the existing `exec` provider contract and approval boundaries.

Antigravity's `agy models` runs only on demand, with a ten-second deadline, so a stalled Google catalog no longer holds up startup diagnostics. Claude choices are official documented aliases, labeled as published rather than discovered account models; they remain disabled if the local runtime/role is unavailable. Compatible APIs use their configured `/models` endpoint. Refresh and exact-ID entry are available. A listed model does not prove account entitlement or enable unsupported coding capabilities. This machine still lacks Claude Code and has Antigravity eligibility restrictions.

Context modes change request size and helper use, not the user's selected provider/model. See [research and measured context reductions](../development/EFFICIENCY_RESEARCH.md).

| Provider              | Path                                             | Available behavior                                                                       | Verification here                                                                                            |
| --------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| OpenAI Codex          | Official `codex exec --json` CLI                 | Planning, isolated coding, read-only review, real events, cancellation                   | Authenticated CLI and complete real smoke workflow passed                                                    |
| Anthropic Claude Code | Official `claude -p --output-format stream-json` | Read-only prompt-based planning/review, tools disabled                                   | Adapter contract exists; runtime not installed, real integration unverified                                  |
| Google Antigravity    | Documented `agy` headless CLI                    | OAuth setup, model discovery and real connection verification; coding execution disabled | Official agy 1.4.0 installed; model IDs discovered; actual inference blocked by account/location eligibility |
| Compatible API        | `/models`, `/chat/completions` SSE               | Planning/review; no coding tools                                                         | Local HTTP contract test passed; no external service/account assumed                                         |

## Codex

Install and authenticate the official CLI using [OpenAI setup](https://developers.openai.com/codex/cli/). Aether searches PATH, standard Homebrew/local paths, and the installed Codex desktop app CLI bundle. Run `codex login` yourself if diagnostics show missing authentication. No API key is required for a supported saved CLI login.

The tested installation is 0.163.0-alpha.10.2. Required flags include `exec`, `--json`, `--ignore-user-config`, supported sandbox policies, and feature-disable overrides. Older/incompatible CLIs may fail with actionable stderr; Aether never falls back to bypassing permissions. Use an empty model identifier to retain the runtime default, or enter an exact account-supported identifier. There is no fabricated model catalog or context-window value. Reasoning effort is passed as a provider configuration override.

Planning/review use `read-only`; coding uses `workspace-write`. New approved coding plans default to Aether-managed teams: a coding lead implements, one to three same-model read-only helpers review concurrently, and the lead integrates their bounded findings. Every phase uses separate official CLI sessions; native recursive agents remain disabled because the installed exec stream omits required lifecycle evidence. See [coding teams](../development/CODING_TEAMS.md) for limits and verification. Apps, plugins, hooks and browser/computer/image tools remain disabled. Aether passes scoped prompts, not all host environment variables. Codex command shells receive a fixed system-only PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) so Git and basic file tools work without inheriting host secrets. Initial testing found inherited plugin discovery even with an empty `mcp_servers` override; explicit feature disabling was added and retested. No unsupported private app endpoints are used.

See [official noninteractive mode](https://developers.openai.com/codex/noninteractive/), [SDK](https://developers.openai.com/codex/sdk/), and [app-server](https://developers.openai.com/codex/app-server/). The first release uses the CLI, not app-server; Aether's approvals happen before plan execution and before final apply, not as fabricated per-tool CLI prompts.

## Claude Code

Install and log in using [official instructions](https://code.claude.com/docs/en/overview). The adapter uses the documented [programmatic interface](https://code.claude.com/docs/en/headless), JSON event output and optional explicit model selection. Built-in tools and MCP servers are disabled for the read-only planning/review path; selected repository context is supplied by Aether. Coding intentionally throws an explanatory error until an independently verified filesystem/command sandbox is available. This Mac has no `claude` executable, so do not treat unit tests as proof of real Anthropic connectivity.

## Antigravity

The current official docs describe [headless execution](https://www.antigravity.google/docs/cli/headless): `agy -p`, `stream-json` output, structured JSON schemas and model discovery through `agy models`. This is a documented CLI pathway, not an invented API. The official agy 1.4.0 CLI is now installed from Google’s release artifact with SHA512 verification. Its catalog lists `gemini-3.8-flash-high`, `gemini-3.8-flash-medium`, and `gemini-3.8-flash-low`. Catalog discovery does not prove account eligibility: an actual request returned “not currently available in your location.” Settings exposes native Google OAuth setup and a separate bounded verification action, with eligibility errors shown as blocked. No private RPC, desktop scraping or undocumented compatibility mechanism is adopted. Installation alone does not enable execution; sandbox semantics and a real run must pass verification first.

## Compatible API

In Settings, set a complete OpenAI-compatible base URL, for example `http://127.0.0.1:11434/v1`. Configure an exact model ID. Aether probes `/models` and streams `/chat/completions`. Supply a credential only if needed; it is encrypted through the OS secret store. Remote URLs require HTTPS. A local test SSE server verifies parsing, split event frames, discovery and capability limits. No file or shell tools are invented for the generic API adapter.

## Manual real-provider acceptance

Use a new temporary repository with one committed source file and an existing regression test. Ask for a one-line repair, inspect and approve its plan, verify real streamed provider events, inspect the actual test exit status, confirm the original file is unchanged, review the combined diff, then approve application. Close/reopen Aether and verify the session/evidence remain. `npm run test:provider` automates this narrow acceptance path for Codex only and prints retained evidence paths.

## OAuth from Aether Settings

**Sign in with ChatGPT** preserves an existing CLI ChatGPT login; otherwise it opens the official `codex login` browser flow in Terminal. **Sign in with Google** opens the interactive official `agy` CLI in a dedicated empty workspace. Complete its onboarding and Google browser consent, close the terminal, and click **Verify connection**. Antigravity verification makes a small model request; the model catalog alone cannot establish a working login. No provider refresh tokens are copied into Aether.

This Mac already has a working Codex ChatGPT login. Antigravity’s local setup was attempted with the user’s approval of its Terms and opt-out from optional interaction data collection, but the real request was blocked by its account/location eligibility check. Aether does not claim that login or execution succeeded. See the [Hermes connector review](HERMES_CONNECTORS.md) for the source research and contract distinctions.

## Continuing analysis into coding

Read-only tasks (`files: []`) use the review transport and cannot write files. A completed analysis now offers **Continue to implementation**, with optional follow-up instructions. This creates a separate, linked plan carrying bounded prior deliverables; it does not widen the previous task scopes. The continuation must contain at least one concrete file-writing task, and **Approve & run** still authorizes coding. Empty-diff legacy reviews can continue directly; sessions with pending changes must finish application first. New read-only analyses complete after review without an empty apply step.

Graphify is a separate local AST indexing process, not a model provider. Its live view polls source metadata every four seconds while visible and invokes `graphify extract --code-only --no-cluster` only after changes or explicit refresh. No graph extraction results are automatically added to provider prompts. `npm run test:live-ui` verifies the real local CLI and desktop interaction; `npm run test:provider` verifies an actual Codex continuation from a seeded analysis fixture through planning, coding, tests, review and application in a temporary project.

## Ava status companion

Ava uses the existing typed run lifecycle and persisted phase events. Planning, working, tests, supervisor review, approval, blocked, failed, completed and cancelled sessions have distinct poses/captions. The question pose means a real approval gate; arbitrary question marks in provider output do not create a new user-input request. The companion opens the relevant session for user action and never approves plans, applies changes or calls a provider. Background animation uses the local vendored Bloub core and requires no account, network or extra model tokens.

## Project desktop activity widget

The floating desktop widget reads persisted task/session status and receives batched lifecycle updates. It shows completions, active work, pending approvals, reviews and failures per project or across all projects. It uses no extra model requests and does not forward token streams, prompts, model configuration, diffs or worker output into its renderer. Clicking an item restores the main app and selects the session/task; coding approval and application still occur in the main app. Closing the main window leaves the app running for the widget; Quit explicitly stops provider work. Hide the popup with its X and reopen it with **Show desktop widget** in the main header.

## Cross-platform downloads

The [release workflow](../development/RELEASES.md) packages Windows, macOS and Linux applications on each push. Artifacts contain the desktop application; they do not bundle provider CLIs, OAuth sessions or credentials. Successful packaging and desktop launch do not establish provider inference, executable discovery or sandbox behavior on a new OS. The real Codex coding evidence above was obtained on macOS; Windows/Linux provider execution remains to be verified independently.

## Conversation planning and feature checks (0.1.11)

Ava's chat uses the immutable Aether/Nexload prefix plus compact reviewed working practices, with source provenance described in [Prompt core](../development/NEXLOAD_PROMPT_CORE.md). This does not substitute leaked vendor identities/tool contracts for actual provider capabilities. CLI providers retain their host policies, and compatible chat does not gain coding tools.

A project-code request can create an approval-gated plan inside the same chat/IDE agent pane. Bounded conversation reference is passed as untrusted evidence. Local message checkpoints provide an immutable coding baseline without modifying the project's branch/index; source changes are checked before execution/application. No coding happens merely because the chat router returns `PROJECT_WORK:`. Detected commands guide the planner, and detected application plans receive an executable feature-verification task if one is missing. These commands remain visible in the plan and use the existing approved host-test executor. See [Conversation workflow](../development/CONVERSATION_WORKFLOW.md) for limits and fixture verification.
