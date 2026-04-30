# AetherControl changes location

The scaffold is now at repository root-level paths:

- `AETHERCONTROL_README.md`
- `aethercontrol.package.json`
- `aethercontrol.tsconfig.base.json`
- `apps/aether-core/src/server.js`
- `apps/aether-console/package.json`
- `workers/aether-flow/src/worker.js`
- `packages/aether-contracts/index.ts`
- `docs/aethercontrol/v1-architecture.md`

## Quick verify commands

```bash
pwd
git log --oneline -n 5
find apps/aether-core workers/aether-flow packages/aether-contracts docs/aethercontrol -maxdepth 3 -type f | sort
```
