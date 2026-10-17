# ADR 002: Isolated changes and two explicit review gates

Status: accepted, 2026-10-17.

Plan approval authorizes concrete task scopes and verification commands. Each task receives a detached app-owned Git worktree from a fixed baseline plus dependency commits. File-scope locks bound concurrent contention; workers cannot overwrite each other's workspaces. Out-of-scope diffs fail before integration.

The application commits only inside its own worktrees and serializes cherry-picks into an integration worktree. Dependencies are replayed in topological order. Both individual and combined verification evidence are recorded. Conflicts fail visibly; only the conflicted app-owned cherry-pick is aborted. The original repository remains untouched until final diff approval.

A clean original baseline is required. Supporting dirty-baseline snapshots safely is deferred. Apply revalidates original HEAD and dirty state, checks the patch and then applies it. No automatic commit, stash, reset, cleanup, push, deployment or publication touches the original repository.

Retained worktrees favor recovery over automatic cleanup. A reviewed retention/removal interface remains on the roadmap. Verification currently runs host project code after plan approval, so a worktree is not advertised as a security sandbox.
