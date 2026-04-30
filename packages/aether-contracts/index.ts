export type AgentType = 'marketing' | 'dev' | 'ops';

export type TaskStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'approved'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'paused';

export interface BudgetPolicy {
  currency: 'EUR' | 'USD';
  weeklyLimit: number;
  dailyLimit: number;
  actionApprovalThreshold: number;
}

export interface AgentTask {
  id: string;
  projectId: string;
  agentType: AgentType;
  status: TaskStatus;
  objective: string;
  estimatedCost: number;
  createdAt: string;
}

export interface GuardDecision {
  allowed: boolean;
  reason: string;
  requiresManualApproval: boolean;
}
