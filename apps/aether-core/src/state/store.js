const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'aethercontrol-state.json');

const state = {
  projects: new Map(),
  goals: new Map(),
  agents: new Map(),
  tasks: new Map(),
  runs: new Map(),
  logs: [],
  artifacts: new Map(),
};

function now() {
  return new Date().toISOString();
}

function serializeMap(map) {
  return [...map.values()];
}

function hydrateMap(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

function serializeState() {
  return {
    projects: serializeMap(state.projects),
    goals: serializeMap(state.goals),
    agents: serializeMap(state.agents),
    tasks: serializeMap(state.tasks),
    runs: serializeMap(state.runs),
    logs: state.logs,
    artifacts: serializeMap(state.artifacts),
  };
}

function loadState() {
  if (!fs.existsSync(DATA_FILE)) {
    return;
  }

  const savedState = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  state.projects = hydrateMap(savedState.projects);
  state.goals = hydrateMap(savedState.goals);
  state.agents = hydrateMap(savedState.agents);
  state.tasks = hydrateMap(savedState.tasks);
  state.runs = hydrateMap(savedState.runs);
  state.logs = savedState.logs || [];
  state.artifacts = hydrateMap(savedState.artifacts);
}

function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(serializeState(), null, 2));
}

function resetState() {
  state.projects = new Map();
  state.goals = new Map();
  state.agents = new Map();
  state.tasks = new Map();
  state.runs = new Map();
  state.logs = [];
  state.artifacts = new Map();
  saveState();
}

function addLog(taskId, event, message, metadata = {}) {
  const entry = {
    id: randomUUID(),
    taskId,
    event,
    message,
    metadata,
    createdAt: now(),
  };

  state.logs.push(entry);
  saveState();
  return entry;
}

function createArtifact(taskId, type, title, content) {
  const artifact = {
    id: randomUUID(),
    taskId,
    type,
    title,
    content,
    createdAt: now(),
  };

  state.artifacts.set(artifact.id, artifact);
  saveState();
  return artifact;
}

function listArtifactsForTask(taskId) {
  return [...state.artifacts.values()].filter((artifact) => artifact.taskId === taskId);
}

function createRun(taskId, trigger) {
  const run = {
    id: randomUUID(),
    taskId,
    trigger,
    status: 'queued',
    startedAt: null,
    completedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };

  state.runs.set(run.id, run);
  saveState();
  return run;
}

function seedDemoState() {
  resetState();

  const project = {
    id: randomUUID(),
    name: 'Cash Copilot',
    slug: 'cash-copilot',
    budgetPolicy: {
      currency: 'EUR',
      weeklyLimit: 500,
      dailyLimit: 100,
      actionApprovalThreshold: 25,
    },
    connection: {
      repositoryPath: '/home/jsoares/.openclaw/workspace/cashpilot',
      appUrl: 'http://192.168.88.248:8081',
      healthUrl: '',
      githubRepo: 'joaquimpsoares/cashpilot',
      githubBranch: 'main',
      packagePath: 'package.json',
      connectedAt: now(),
    },
    createdAt: now(),
  };
  const goal = {
    id: randomUUID(),
    projectId: project.id,
    title: 'Grow Cash Copilot installs',
    successMetric: 'Generate 3 campaign ideas ready for review',
    status: 'active',
    createdAt: now(),
  };
  const agent = {
    id: randomUUID(),
    projectId: project.id,
    type: 'marketing',
    name: 'Marketing Agent',
    createdAt: now(),
  };
  const task = {
    id: randomUUID(),
    projectId: project.id,
    goalId: goal.id,
    assignedAgentId: agent.id,
    agentType: 'marketing',
    actionType: 'generate_campaign_draft',
    objective: 'Draft Google Ads campaign',
    estimatedCost: 12,
    status: 'approved',
    createdAt: now(),
  };

  state.projects.set(project.id, project);
  state.goals.set(goal.id, goal);
  state.agents.set(agent.id, agent);
  state.tasks.set(task.id, task);
  saveState();
  addLog(task.id, 'task.created', `Task created for ${task.agentType} agent.`);
  addLog(task.id, 'guard.decision', 'Within policy limits', {
    allowed: true,
    reason: 'Within policy limits',
    requiresManualApproval: false,
    blocked: false,
    approvalLevel: 'none',
  });

  return { project, goal, agent, task };
}

module.exports = {
  addLog,
  createArtifact,
  createRun,
  listArtifactsForTask,
  loadState,
  now,
  resetState,
  saveState,
  seedDemoState,
  state,
};
