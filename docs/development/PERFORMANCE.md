# Performance and prompt context

Graphify's local AST extractor mapped the application before optimization (311 extracted symbols, 819 edges). Its bounded queries identified the Service → context/compiler and Service → Store/event/flush paths. Node CPU profiles on the same fixture showed synchronous database file writes dominating the original streaming path. No semantic extraction, hosted graph service, API key or extra model call was used for that analysis.

## Measured comparison

The fixture contains 75 files, a scoped order calculation near the end of its source file, a local currency dependency, project rules, and unrelated source files. The persistence fixture emits 500 output chunks and a lifecycle checkpoint against a database containing saved history. Both implementations use the same inputs. Results from this machine:

| Measurement                                | Before | After |
| ------------------------------------------ | -----: | ----: |
| Context characters                         | 40,000 | 5,713 |
| Estimated context tokens (UTF-8 bytes / 3) | 13,334 | 1,907 |
| Includes scoped target function            |     No |   Yes |
| Includes project rules                     |    Yes |   Yes |
| Database file exports                      |    501 |     9 |
| Synchronous output enqueue time            | 413 ms | 34 ms |
| Events restored after clean restart        |    501 |   501 |

This fixture uses 86% fewer estimated context tokens and 98% fewer database exports. These are reproducible local fixture results, not a model-quality benchmark, exact tokenizer count, or guarantee of equivalent provider billing savings. Context retrieval latency was roughly 10–12 ms in these runs; it did not show a reliable speed improvement. The streaming write reduction is the measured runtime improvement.

## Delivered behavior

Context selection prioritizes ancestor AGENTS.md files, assigned file scopes, objective matches and up to three relative JavaScript/TypeScript import neighbors. Larger files contribute labeled relevant line excerpts instead of only their first 5,000 characters. Context is capped at 18,000 characters for planning, 14,000 for workers, and 12,000 for review before adding the diff. A 64-file/2 MB content cache checks canonical paths and filesystem identity, size and modification/change timestamps on every use. Missing, changed, sensitive, oversized, binary and external symlink targets do not reuse stale cached content. This lightweight runtime selector is heuristic; Graphify itself is a developer analysis tool, not a packaged runtime requirement. Other import languages, aliases and computed imports are not resolved.

Supervisor test summaries preserve every command, exit status and duration, use an 8,000-character total output-excerpt budget, and prioritize failed-test output. Full logs remain persisted and visible in the session. Platform invariants, scope contracts, acceptance criteria and explicit review/apply gates are unchanged.

Stream output remains ordered in SQLite memory and is exported on a 200 ms timer or after 64 chunks. Run/settings mutations and lifecycle checkpoints export immediately, as does orderly shutdown. Forced termination can lose the final unflushed output chunks; it does not defer lifecycle records. The renderer batches visible output for 50 ms and requests full snapshots for lifecycle/state events rather than every streaming chunk.

## Reproduce

Run `npm run analyze:graph` with the already-installed Graphify CLI. It uses code-only extraction without LLM calls and writes ignored artifacts under `artifacts/graphify/graphify-out/`. Query it with:

```sh
graphify query 'context compile Service Store event flush' --graph artifacts/graphify/graphify-out/graph.json --budget 1200
```

Run `npm run benchmark` for current synthetic measurements and a Node CPU profile in `artifacts/`. During this change, before/after JSON was saved as `artifacts/performance-before.json` and `artifacts/performance-after.json`; compare an existing baseline with `npm run benchmark -- artifacts/performance-after.json artifacts/performance-before.json`. Benchmarks create and remove disposable temporary data. The baseline must be captured from the older implementation; running the current code twice measures two current runs.

`tests/performance.test.ts` checks excerpt relevance, direct dependency selection, ancestor instructions, cache invalidation, credential/path boundaries, output batching/checkpoints, final-tail shutdown persistence and complete test-status preservation. Existing end-to-end orchestration, Electron UI/restart, and actual Codex smoke checks cover execution behavior.

Graphify source and local-only extraction behavior: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify).
