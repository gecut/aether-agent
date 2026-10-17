# Hermes connector and OAuth review

Reviewed upstream Hermes source and docs on 2026-10-17. This is a research/adaptation record; Hermes and its community plugins were not installed into Aether.

## What Hermes separates

Hermes distinguishes model-provider authentication, MCP tool-server authorization, and messaging/gateway connectors. These are separate contracts. A Google or ChatGPT model login does not grant access to Drive, Slack, GitHub, or arbitrary MCP servers.

The current source has:

- `hermes_cli/auth_codex.py`: a Hermes-owned Codex OAuth grant/refresh store; its source warns against sharing rotating refresh tokens with the Codex CLI. Aether instead invokes the official CLI and leaves token ownership/refresh there; it never copies the grant.
- `agent/transports/codex_app_server.py`: an official app-server transport, distinct from a raw model HTTP provider. Aether retains the supported exec transport for now.
- `tools/connectors/contract.py`: backend-witnessed pending/initiated/connected/failed/expired states. UI initiation alone does not establish a working connection. Aether uses its own smaller typed connection state and requires an actual provider check.
- `tools/connectors/mcp_oauth.py`: MCP OAuth callback workers, authorization/probe separation, cancellation, and protection against older attempts overwriting newer grants. MCP initialization and tool discovery failures are distinct from successful authorization.
- `website/docs/user-guide/features/mcp.md`: remote MCP OAuth 2.1 discovery/PKCE, dynamic or explicit client registration, token refresh, and a loopback callback. These apply to tool connectors, not the Antigravity coding runtime.

Sources: [Hermes source](https://github.com/nousresearch/hermes-agent), [MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp), [connector contract](https://github.com/nousresearch/hermes-agent/blob/main/tools/connectors/contract.py), [Codex auth source](https://github.com/nousresearch/hermes-agent/blob/main/hermes_cli/auth_codex.py).

## Antigravity integrations found

The upstream community catalog lists both [antigravity-agy](https://github.com/nousresearch/hermes-agent/blob/main/plugin-catalog/antigravity-agy.yaml) and [antigravity-oauth](https://github.com/nousresearch/hermes-agent/blob/main/plugin-catalog/antigravity-oauth.yaml). They route requests through Google's official `agy` CLI. They are community plugins, not a Google OAuth SDK endorsement or proof of account eligibility.

The catalog descriptions differ in credential handling: one leaves credentials entirely with the CLI; the other describes temporary HOME/keychain/token-file linking/copy fallbacks. Aether does not adopt credential copying, keychain linking, private endpoints, provider impersonation, automatic plugin installation, or warm process pools. The official CLI performs sign-in and keeps its credentials in its own store.

## Aether behavior added

- Settings provides **Sign in with ChatGPT**, **Sign in with Google**, and **Verify connection**.
- Login opens a mode-0700 local `.command` file in Terminal with a fixed official CLI command, safely quoted paths, and an empty dedicated login workspace. No keys or tokens are embedded. API-key environment variables are cleared only inside this sign-in shell so the requested path is OAuth.
- Codex's existing ChatGPT session is preserved; a login browser is not opened needlessly. API-key-only sessions are not misrepresented as a ChatGPT OAuth login.
- Antigravity sign-in uses interactive `agy --mode plan --sandbox`. The user completes provider onboarding, trust decisions, Terms and browser consent. Aether does not accept Terms or change telemetry preferences automatically.
- Connection state is distinct from installed-runtime detection. Antigravity is marked connected only after a tiny actual authenticated request returns the expected response. Its `models` catalog is displayed as discovery, never as proof of entitlement.
- Eligibility/location failures are recorded as **blocked**, not as a successful login or a request for API keys. No region/account-policy bypass is attempted.
- Connection checks are bounded and canceled when Aether closes. An explicitly opened interactive sign-in Terminal belongs to the user; its message asks the user to close it when finished.

A general MCP tool-connector manager is still separate future work. Checking Hermes did not silently enable external tool accounts or import its full permissions/configuration.

## Context optimization

Graphify is used as a local development analysis tool. It is not a provider, connector, hosted dependency, or authentication bridge. Runtime context now selects bounded scope-aware source excerpts and direct relative import neighbors; platform constraints and approval gates remain intact. Provider usage counters and exact billing are not inferred from the local context byte/token estimate. Complete supervisor test logs remain in session evidence while prompts receive bounded excerpts.

## Nexload prompt foundation

Every agent task invocation now receives Aether's pinned Nexload-based reasoning core and the selected role profile through the shared compiler. This is an adaptation of Nexload Agent Skills, not a provider transport or authentication system. Codex, compatible planning/review APIs and any future verified adapters share the same prompt foundation; their actual capabilities, OAuth state and sandbox boundaries remain independent. Required structured plan responses and read-only reviews remain enforced by Aether's invocation contracts.

Compatible chat APIs receive the compiled core as a system message and task/source data as a separate user message. CLI transports serialize the same two pieces in their supported input stream and retain their native host instructions. Adapter tests verify both contracts.
