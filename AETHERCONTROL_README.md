# AetherControl

**AetherControl = The control plane for autonomous agents.**

Tagline: **Autonomy, under control.**

## Product layers

- **AetherControl (platform)**
- **Projects** (cash-copilot, future apps)
- **Agents** (marketing, dev, ops)
- **Tasks** (campaigns, posts, updates)
- **Policies** (budget, approvals, limits)

## Internal component names

- **AetherControl Core** -> backend/control plane API
- **Aether Console** -> web dashboard
- **Aether Agents** -> agent runtime workers
- **Aether Guard** -> budget + approval policy engine
- **Aether Flow** -> task orchestration + execution queue
- **Aether Logs** -> audit stream + timeline

## Monorepo scaffold

- `apps/aether-console` - dashboard shell
- `apps/aether-core` - control plane API shell
- `workers/aether-flow` - orchestration worker shell
- `packages/aether-contracts` - shared agent/task/policy contracts
- `docs/aethercontrol/v1-architecture.md` - v1 architecture and rollout

## Next steps

1. Implement persistent storage (Postgres) and migrations.
2. Add Redis queue and worker retry policies.
3. Add auth and role-based access control.
4. Implement budget guardrails and approval gates.
5. Enable first integrations (Google Ads + RevenueCat).

## Quick start

```bash
npm run dev --prefix apps/aether-core
```

Health check: `http://localhost:4100/health` after starting `apps/aether-core/src/server.js`.
