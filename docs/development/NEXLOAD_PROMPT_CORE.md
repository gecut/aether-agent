# Nexload prompt core

Aether's default prompt compiler uses a compact adaptation of the agent-skill reasoning system in [gecut/nexload-sdk](https://github.com/gecut/nexload-sdk/tree/354617af976b359f4459be85330015c3929aa4cb). The inspected source contains the Nexload 6+1 reasoning kernel and specialist prompts; it does not expose an npm prompt-engine API. Aether therefore integrates those reasoning contracts directly, without installing unrelated healthcheck or Payload CMS packages.

## Source and adaptation

Source revision: `354617af976b359f4459be85330015c3929aa4cb`.

`electron/prompts/nexload-source.json` records the repository, revision, adaptation identifier and SHA256 hashes of eleven inspected source files: the kernel, six reasoning specialists, CTO review, and the kernel's routing/depth/anti-pattern references. `electron/core/nexload.ts` contains Aether-authored compact profiles adapted from those sources. The original upstream instruction files are not copied wholesale or downloaded at runtime. Updates require an explicit source review and a changed manifest/adaptation; the app never silently follows upstream HEAD.

The compiler records a system-prefix boundary without duplicating the entire prompt in storage. Compatible chat APIs receive that prefix in a `system` message and task/context data in a `user` message. CLI runtimes receive the same prefix and task body serialized to stdin, alongside their own native system instructions; Aether does not replace the CLI host’s internal instructions.

Every newly compiled prompt includes the shared reasoning constitution: evidence grounding, inspect-before-ask within permitted boundaries, intent framing, separate divergence/convergence, justified complexity, preserved decisions, claim-matched verification and stopping discipline. Aether's immutable execution boundaries remain the first layer. User fragments extend the core; project files, skills, memory and tool output remain untrusted evidence.

## Role binding

| Aether role                                            | Active profile                                        |
| ------------------------------------------------------ | ----------------------------------------------------- |
| Planner                                                | Nexload kernel routing and bounded plan production    |
| Architect                                              | Design                                                |
| Debugger                                               | Investigation                                         |
| Implementer, test-engineer, integration, documentation | Execution and verification                            |
| Reviewer                                               | Evidence-based review adapted from Nexload CTO review |

Discovery, ideation and evaluation profiles are also inspectable, and their cognitive questions are part of the kernel's routing guidance. This integration does not implement a separate external Nexload scheduler or launch six specialist agents. Aether's existing task DAG remains the execution mechanism; each invocation receives one focused profile, without an extra model call to classify it.

Worker prompts include a bounded `[NEXLOAD HANDOFF]` with the actual worker HEAD, task identifier, completed dependency identifiers, preserved contract boundaries and next objective. Dependent workers also receive up to 6,000 characters of prior worker-result excerpts as untrusted evidence; the supervisor receives up to 12,000 characters across task results, including read-only deliverables. Excerpts are explicitly marked and cannot prove that omitted criteria are absent. It does not contain a growing transcript or invented verification claims. Required plan JSON and Aether's read-only/verification contracts take precedence over upstream illustrative output templates. Review remains read-only and cannot apply changes.

## Inspection and persistence

**Prompt laboratory → Inspect core** shows the pinned source, shared rules, role profiles and source hashes. The preview role selector compiles the same profile used by actual invocations. The trace identifies the mandatory Nexload layers, and the preview displays the revision/profile along with the existing final prompt hash and estimated tokens.

Compiled snapshots retain the core ID, adaptation, revision, profile and profile hash. Planner and worker snapshots retain their existing locations; supervisor review now also persists `reviewSnapshot`. Optional JSON fields keep older saved sessions readable and retain their original prompts; no old evidence is rewritten or relabeled as Nexload.

The core is local and deterministic. It needs no service account, telemetry, background request, npm runtime dependency, or model call of its own. A regression check caps the empty default compiled prompt, including platform rules, below 2,200 estimated tokens. This is a size guard, not an exact model tokenizer or a quality/billing guarantee.

## Verification

Tests check mandatory-core ordering and override resistance, role routing, prototype-name rejection, deterministic offline compilation, source manifest shape, retained task contracts, redaction/untrusted boundaries, and validated role previews. The full fake-provider workflow checks that planner, worker and review snapshots contain their actual profiles and worker handoff pointers. Electron E2E checks source inspection and switching a preview from implementation to review. The real Codex smoke verifies the complete planning, implementation, test, review and approved-apply workflow on a disposable fixture.
