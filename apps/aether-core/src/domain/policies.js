function guardDecision(task, budgetPolicy) {
  if (task.actionType === 'publish_google_ads_campaign' || task.actionType === 'increase_budget') {
    return {
      allowed: false,
      reason: 'Publishing or budget changes require manual approval and are not executed by this scaffold',
      requiresManualApproval: true,
      blocked: false,
      approvalLevel: 'admin',
    };
  }

  if (!budgetPolicy) {
    return {
      allowed: true,
      reason: 'No budget policy configured',
      requiresManualApproval: false,
      blocked: false,
      approvalLevel: 'none',
    };
  }

  if (task.estimatedCost > budgetPolicy.dailyLimit) {
    return {
      allowed: false,
      reason: 'Estimated cost exceeds daily limit',
      requiresManualApproval: false,
      blocked: true,
      approvalLevel: 'blocked',
    };
  }

  if (task.estimatedCost >= budgetPolicy.actionApprovalThreshold) {
    return {
      allowed: false,
      reason: 'Estimated cost requires manual approval',
      requiresManualApproval: true,
      blocked: false,
      approvalLevel: 'human',
    };
  }

  return {
    allowed: true,
    reason: 'Within policy limits',
    requiresManualApproval: false,
    blocked: false,
    approvalLevel: 'none',
  };
}

module.exports = {
  guardDecision,
};
