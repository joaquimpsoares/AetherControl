const {
  addLog,
  createArtifact,
  createRun,
  listArtifactsForTask,
  now,
  saveState,
  state,
} = require('../state/store');

function buildFallbackMarketingDraft(task, project) {
  const action = task.actionType || 'generate_campaign_draft';
  return [
    `Campaign draft for ${project.name}`,
    '',
    `Action: ${action}`,
    `Objective: ${task.objective}`,
    '',
    'Audience:',
    '- People actively looking for better personal finance control',
    '- Users comparing budgeting, cash flow, and subscription management tools',
    '',
    'Ad groups:',
    '1. Cash flow control',
    '   Keywords: cash flow app, money control app, budget alerts',
    '2. Subscription visibility',
    '   Keywords: subscription tracker, recurring payments app, revenue forecast',
    '',
    'Draft ads:',
    'Headline 1: Know Where Your Cash Goes',
    'Headline 2: Smarter Budget Control',
    'Description: Track spend, subscriptions, and cash flow before problems appear.',
    '',
    'Guardrail:',
    `- Estimated spend for this task: ${task.estimatedCost}`,
    '- This scaffold produces controlled drafts and preparation artifacts only.',
    '- It does not publish anything to Google Ads or change live budgets.',
  ].join('\n');
}

async function generateMarketingDraft(task, project) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      content: buildFallbackMarketingDraft(task, project),
      provider: 'fallback',
    };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AETHER_OPENAI_MODEL || 'gpt-5.2',
      instructions: [
        'You are AetherControl Marketing Agent.',
        'Generate safe marketing campaign drafts and preparation artifacts only.',
        'Do not claim that anything has been published or changed in an external ad account.',
        'Return concise, structured plain text with the requested action output, rationale, risks, and guardrails.',
      ].join(' '),
      input: [
        `Project: ${project.name}`,
        `Action: ${task.actionType || 'generate_campaign_draft'}`,
        `Objective: ${task.objective}`,
        `Estimated cost: ${task.estimatedCost}`,
      ].join('\n'),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI draft generation failed: ${response.status} ${body.slice(0, 240)}`);
  }

  const body = await response.json();
  return {
    content: body.output_text || buildFallbackMarketingDraft(task, project),
    provider: 'openai',
    responseId: body.id,
  };
}

async function runTask(task, trigger = 'manual') {
  const project = state.projects.get(task.projectId);

  if (!project) {
    throw new Error('Project not found');
  }

  if (task.status !== 'approved') {
    throw new Error('Task must be approved before it can run');
  }

  const run = createRun(task.id, trigger);

  task.status = 'queued';
  task.updatedAt = now();
  run.status = 'queued';
  run.updatedAt = now();
  saveState();
  addLog(task.id, 'task.queued', 'Task moved into Aether Flow queue.', { runId: run.id, trigger });

  task.status = 'running';
  task.startedAt = now();
  task.updatedAt = now();
  run.status = 'running';
  run.startedAt = now();
  run.updatedAt = now();
  saveState();
  addLog(task.id, 'task.running', `${task.agentType} agent started execution.`, { runId: run.id });

  if (task.agentType === 'marketing') {
    addLog(task.id, 'marketing.guardrail', 'Marketing agent is limited to draft and preparation artifacts in this scaffold.');
    const draft = await generateMarketingDraft(task, project);
    const title = task.actionType === 'prepare_google_ads_change'
      ? 'Prepared Google Ads change proposal'
      : task.actionType === 'generate_keyword_plan'
        ? 'Keyword plan draft'
        : task.actionType === 'generate_ad_copy'
          ? 'Ad copy draft'
          : draft.provider === 'openai'
            ? 'AI-generated Google Ads campaign draft'
            : 'Google Ads campaign draft';
    const artifact = createArtifact(
      task.id,
      task.actionType || 'campaign_draft',
      title,
      draft.content
    );
    addLog(task.id, 'artifact.created', `Created artifact: ${artifact.title}`, {
      artifactId: artifact.id,
      provider: draft.provider,
      responseId: draft.responseId || null,
    });
  } else {
    const artifact = createArtifact(
      task.id,
      'execution_note',
      `${task.agentType} agent execution note`,
      `${task.agentType} execution is stubbed. Objective: ${task.objective}`
    );
    addLog(task.id, 'artifact.created', `Created artifact: ${artifact.title}`, { artifactId: artifact.id });
  }

  task.status = 'completed';
  task.completedAt = now();
  task.updatedAt = now();
  run.status = 'completed';
  run.completedAt = now();
  run.updatedAt = now();
  saveState();
  addLog(task.id, 'task.completed', 'Agent execution completed.', { runId: run.id });

  return {
    task,
    run,
    logs: state.logs.filter((entry) => entry.taskId === task.id),
    artifacts: listArtifactsForTask(task.id),
  };
}

module.exports = {
  buildFallbackMarketingDraft,
  generateMarketingDraft,
  runTask,
};
