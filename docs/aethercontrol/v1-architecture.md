# AetherControl v1 Architecture

## Components

`aether-core` is the coordination service. It owns the initial HTTP surface and exposes health and future task orchestration APIs.

`aether-console` is the operator-facing console. It will consume `aether-core` APIs and render task, budget, and guardrail state.

`aether-flow` is the background worker. It will run long-lived orchestration loops and asynchronous task processing.

`aether-contracts` contains shared TypeScript types used across applications and workers.

## Initial Runtime Ports

- `aether-core`: `4100`

## Near-Term Integration Path

1. Promote shared payloads into `packages/aether-contracts`.
2. Add task creation and status endpoints to `aether-core`.
3. Wire `aether-flow` to claim and process queued tasks.
4. Build `aether-console` against the stable task and guard decision contracts.

