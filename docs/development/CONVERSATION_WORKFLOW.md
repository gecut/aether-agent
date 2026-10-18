# Conversation coding workflow

Ava chat now keeps coding requests, plans, task progress, verification output, code review and application controls inside the same conversation, both in Workspace and in the IDE's agent pane. The planner still creates an isolated run, but the user does not need to copy their request or navigate to another page. A model's `PROJECT_WORK:` routing signal creates a plan only; it never approves execution. The conversation includes bounded historical context, with the latest request taking precedence. Completed runs accept a linked implementation follow-up; pending approval/review must be resolved before another coding request.

## Message checkpoints

Sending a project message automatically saves a version-1 Git checkpoint. Checkpoints use an app-owned worktree, a separate temporary Git index, immutable Git objects and `refs/aether/checkpoints/<chat UUID>`. No original branch, HEAD, index, working file or remote is changed. Unchanged content reuses the previous commit. Messages retain the commit and timestamp, exclusion count or a visible failure reason. Checkpoints are local and are not pushed.

Ignored files, recognized sensitive paths, detected credential strings, symlinks, binaries, oversized files and app artifacts are excluded. A checkpoint is bounded to 1,000 changed files, 2 MB per file and 20 MB total. These checks do not constitute a general secret scanner. Do not place credentials in project source.

When a message checkpoint has no exclusions, the plan uses its immutable commit as the worker baseline. Versioned run evidence separately records the original HEAD. Scoped source files are compared against checkpoint blobs before planning completes, before execution and before application. Newer scoped edits block execution/application. Existing staged work is preserved; unrelated edits are not overwritten. Applying the reviewed delta remains explicit. If checkpointing is unavailable or incomplete, existing clean-tree execution rules apply. Historical runs without checkpoint metadata retain their previous behavior. Restore retains its conservative protection against staged or subsequently modified affected files.

## Project actions and commands

**Open project** in the header exposes separate **Open terminal**, **Open folder** and **Open IDE** actions. The terminal opens the real Code-OSS terminal in Aether; first use may require setting up the IDE runtime and accepting its workspace-trust screen. It does not run a command automatically. The native IDE view is hidden while this dropdown is open so it cannot cover the menu, then restored without reloading the editor.

The menu detects package-manager/script names from bounded `package.json` and lockfile evidence. It also recognizes Cargo, Go, Python, Swift and Maven manifests and shows their conventional commands. This inspects files without executing their contents; it does not establish that the required tools are installed. Commands are also supplied as untrusted evidence to the planner, which must choose actual supported build/test commands in the reviewed plan. Arbitrary shell strings are not exposed through IPC.

## Feature verification

Detected application implementation plans require an executable test-engineer task. If the planner omits one, Aether adds a dependent task before approval with `aether-tests/` scope and the exact command `node --test aether-tests/features.test.mjs`. The worker must write JavaScript checks for requested features and affected flows, using installed browser/desktop tooling where available. Missing tooling or a missing test file fails verification; no tools are silently installed. Existing executable test-engineer tasks remain part of the plan. Other declared build/test commands continue through the existing executor and integration rerun.

This enforces a verification task and real command evidence; it cannot prove exhaustive feature coverage or make an unavailable provider capable of coding. Review each task's acceptance criteria and actual results. Tests run project code on the host, within the existing explicit approval boundary. The UI does not silently approve them. Task details, diffs, review findings and test output are expandable. Polling pauses for hidden documents and stops after terminal run states.

## Checks

`tests/project-workflow.test.ts` covers command detection and external-symlink rejection, immutable message checkpoints, original HEAD/index preservation, deletion/history, compact prompt layering, required feature-test tasks, same-chat routing/context, coding from dirty/staged checkpointed source and blocking application over newer edits. Provider execution in these tests is a deterministic fixture, not live account evidence.

`npm run test:conversation` uses a disposable Electron profile/project and local HTTP planner to check project actions, detected commands, a real Git message checkpoint, inline code/feature plans, approval gating, rejection and same-chat follow-up. It does not execute a coding provider. The real Code-OSS acceptance harness verifies the dedicated terminal button by executing a command in its disposable project, alongside file editing and extension activation. Standard build, unit tests and desktop E2E remain required.
