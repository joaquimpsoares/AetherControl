# Aether Flow Worker

Executes approved tasks with provider adapters and writes execution events.

## Responsibilities

1. Poll queue for approved tasks.
2. Resolve provider adapter and execute action.
3. Persist artifacts and usage cost.
4. Emit audit events and final task status.
5. Trigger policy re-check after each execution.
