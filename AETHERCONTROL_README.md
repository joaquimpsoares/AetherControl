# AetherControl

AetherControl is a monorepo scaffold for coordinating agents, console workflows, shared contracts, and background flow workers.

## Workspace Layout

- `apps/aether-core`: Core HTTP service.
- `apps/aether-console`: Console application scaffold.
- `workers/aether-flow`: Background worker scaffold.
- `packages/aether-contracts`: Shared TypeScript contracts.
- `docs/aethercontrol`: Architecture and export notes.

## Quick Start

Run the core service:

```bash
node apps/aether-core/src/server.js
```

Run the flow worker:

```bash
node workers/aether-flow/src/worker.js
```

