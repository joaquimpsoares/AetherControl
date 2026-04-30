# AetherControl v1 Architecture

## Goals

- Control agents across multiple projects from one dashboard.
- Enforce budget and approval guardrails before side effects.
- Track every action with auditable logs and artifacts.

## Services

1. **Console**
   - project, agent, and task views
   - approvals inbox
   - budget dashboard
2. **Core API**
   - project, agent, and task CRUD
   - policy evaluation
   - approval workflow
3. **Flow Worker**
   - picks executable tasks from queue
   - performs connector actions
   - writes execution events and artifacts
4. **Aether Guard**
   - budget limit checks
   - action risk scoring
   - hard-stop kill switch
5. **Aether Logs**
   - append-only event stream
   - timeline search for every project, agent, and task

## Data model (v1)

- `organizations`
- `projects`
- `agents`
- `tasks`
- `task_runs`
- `policies`
- `budget_ledgers`
- `approvals`
- `artifacts`
- `audit_events`
- `integrations`

## API surface (initial)

- `POST /projects`
- `GET /projects/:projectId/overview`
- `POST /agents`
- `POST /tasks`
- `POST /tasks/:taskId/approve`
- `POST /tasks/:taskId/reject`
- `POST /budgets/check`
- `POST /integrations/:provider/sync`

## Task execution lifecycle

1. Task created with intent, constraints, and budget context.
2. Guard evaluates policy and either auto-approves or requests approval.
3. Flow worker executes approved tasks through a provider adapter.
4. Execution writes logs, usage costs, and generated artifacts.
5. Guard updates budget ledger and may pause future tasks.

## 30-day implementation plan

### Week 1

- scaffold monorepo apps/packages/workers
- define contracts for projects/agents/tasks/policies
- implement core health and project endpoints

### Week 2

- add queue-backed task execution skeleton
- implement approval states and transitions
- build Console dashboard skeleton

### Week 3

- add budget ledger model and hard-cap checks
- introduce Google Ads + RevenueCat adapter interfaces
- add audit event stream endpoints

### Week 4

- wire approvals inbox and manual action gating in Console
- complete end-to-end dry-run flow
- add smoke tests and deployment docs
