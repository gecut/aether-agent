# Contributing

Use Node.js 24+, run `npm ci`, then `npm run dev`. Source code is TypeScript; the desktop main/preload processes are bundled with esbuild and the renderer with Vite. Keep the provider boundary independent of UI details.

Before submitting a change:

```sh
npm run format
npm run build
npm test
npm run test:e2e
```

Run `npm run test:provider` only when you intentionally want to exercise a real authenticated Codex account. Tests under `tests/` are deterministic and do not contact model services. Add regression coverage for lifecycle, security, persistence and orchestration changes. Add a new migration for schema changes; never silently reinterpret stored state.

Do not replace user data, silently enable integrations, add secrets to fixtures, or report stubbed output as provider verification. New coding adapters must document sandbox behavior and pass real integration checks before coding is enabled. Preserve primary source links and license notices when adopting upstream components.
