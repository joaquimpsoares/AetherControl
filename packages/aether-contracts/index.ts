export type AgentType = "planner" | "builder" | "reviewer" | "operator";

export type TaskStatus =
  | "queued"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type BudgetPolicy = {
  maxRuntimeSeconds: number;
  maxCostUsd?: number;
  requireApprovalAboveUsd?: number;
};

export type AgentTask = {
  id: string;
  type: AgentType;
  status: TaskStatus;
  title: string;
  instructions: string;
  budgetPolicy: BudgetPolicy;
  createdAt: string;
  updatedAt: string;
};

export type GuardDecision = {
  allowed: boolean;
  reason?: string;
  requiredApprovals?: string[];
};

