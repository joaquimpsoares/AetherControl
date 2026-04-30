const http = require('http');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { guardDecision } = require('./domain/policies');
const { runTask } = require('./domain/executors');
const { renderConsoleHtml } = require('./ui/consoleHtml');
const {
  addLog,
  loadState,
  now,
  resetState,
  saveState,
  seedDemoState,
  state,
} = require('./state/store');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
  });
  res.end(html);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let rawBody = '';

    req.on('data', (chunk) => {
      rawBody += chunk;
    });

    req.on('end', () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseGitHubRepo(value) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const sshMatch = trimmed.match(/github[^:]*:([^/]+)\/(.+?)(?:\.git)?$/);
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?(?:\/)?$/);
  const shorthandMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  const match = sshMatch || urlMatch || shorthandMatch;

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ''),
  };
}

async function fetchGitHubJson(url) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'aethercontrol-core',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(4000),
  });
  const body = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function inspectGitHubConnection(connection) {
  const parsed = parseGitHubRepo(connection.githubRepo);
  const result = {
    repo: connection.githubRepo || null,
    parsed,
    ok: false,
    status: null,
    private: null,
    defaultBranch: null,
    description: null,
    packageJson: {
      exists: false,
      path: connection.packagePath || 'package.json',
      name: null,
      scripts: [],
    },
    error: null,
  };

  if (!parsed) {
    result.error = 'GitHub repo must look like owner/repo or a GitHub URL';
    return result;
  }

  try {
    const repoResponse = await fetchGitHubJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
    result.ok = repoResponse.ok;
    result.status = repoResponse.status;

    if (!repoResponse.ok) {
      result.error = repoResponse.body.message || 'GitHub repo lookup failed';
      return result;
    }

    result.private = repoResponse.body.private;
    result.defaultBranch = repoResponse.body.default_branch;
    result.description = repoResponse.body.description;

    const packagePath = encodeURIComponent(result.packageJson.path).replace(/%2F/g, '/');
    const contentsResponse = await fetchGitHubJson(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${packagePath}?ref=${encodeURIComponent(connection.githubBranch || result.defaultBranch)}`
    );

    if (contentsResponse.ok && contentsResponse.body.content) {
      const packageBody = Buffer.from(contentsResponse.body.content, 'base64').toString('utf8');
      const parsedPackage = JSON.parse(packageBody);
      result.packageJson = {
        exists: true,
        path: result.packageJson.path,
        name: parsedPackage.name || null,
        scripts: Object.keys(parsedPackage.scripts || {}),
      };
    }
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

function listTasksForProject(projectId) {
  return [...state.tasks.values()].filter((task) => task.projectId === projectId);
}

function overview(projectId) {
  const project = state.projects.get(projectId);

  if (!project) {
    return null;
  }

  const tasks = listTasksForProject(projectId);

  return {
    project,
    stats: {
      agents: [...state.agents.values()].filter((agent) => agent.projectId === projectId).length,
      goals: [...state.goals.values()].filter((goal) => goal.projectId === projectId).length,
      tasks: tasks.length,
      pendingApprovals: tasks.filter((task) => task.status === 'awaiting_approval').length,
      runningTasks: tasks.filter((task) => task.status === 'running').length,
    },
    recentTasks: tasks.slice(-5).reverse(),
  };
}

async function inspectProjectConnection(project) {
  const connection = project.connection || {};
  const repositoryPath = connection.repositoryPath || '';
  const packageJsonPath = path.join(repositoryPath, 'package.json');
  const repository = {
    path: repositoryPath,
    exists: repositoryPath ? fs.existsSync(repositoryPath) : false,
    git: repositoryPath ? fs.existsSync(path.join(repositoryPath, '.git')) : false,
  };
  let packageJson = {
    exists: false,
    name: null,
    scripts: [],
  };

  if (fs.existsSync(packageJsonPath)) {
    const parsedPackage = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson = {
      exists: true,
      name: parsedPackage.name || null,
      scripts: Object.keys(parsedPackage.scripts || {}),
    };
  }

  const health = {
    url: connection.healthUrl || null,
    ok: null,
    status: null,
    error: null,
  };

  if (connection.healthUrl) {
    try {
      const response = await fetch(connection.healthUrl, {
        signal: AbortSignal.timeout(2000),
      });
      health.ok = response.ok;
      health.status = response.status;
    } catch (error) {
      health.ok = false;
      health.error = error.message;
    }
  }

  return {
    repository,
    packageJson,
    github: await inspectGitHubConnection(connection),
    appUrl: connection.appUrl || null,
    health,
    checkedAt: now(),
  };
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    sendHtml(res, 200, renderConsoleHtml());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok', service: 'aether-core' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/state/reset') {
    resetState();
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/state/seed-demo') {
    sendJson(res, 200, { status: 'ok', demo: seedDemoState() });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/projects') {
    sendJson(res, 200, { projects: [...state.projects.values()] });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/agents') {
    sendJson(res, 200, { agents: [...state.agents.values()] });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/goals') {
    sendJson(res, 200, { goals: [...state.goals.values()] });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/goals') {
    const body = await readJson(req);
    const project = state.projects.get(body.projectId);

    if (!project) {
      sendJson(res, 400, { error: 'Valid projectId is required' });
      return;
    }

    const goal = {
      id: randomUUID(),
      projectId: project.id,
      title: body.title || 'Untitled goal',
      successMetric: body.successMetric || 'No success metric set',
      status: 'active',
      createdAt: now(),
    };

    state.goals.set(goal.id, goal);
    saveState();
    sendJson(res, 201, { goal });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/projects') {
    const body = await readJson(req);
    const project = {
      id: randomUUID(),
      name: body.name || 'Untitled project',
      slug: body.slug || `project-${state.projects.size + 1}`,
      budgetPolicy: body.budgetPolicy || {
        currency: 'EUR',
        weeklyLimit: 500,
        dailyLimit: 100,
        actionApprovalThreshold: 25,
      },
      createdAt: now(),
    };

    state.projects.set(project.id, project);
    saveState();
    sendJson(res, 201, { project });
    return;
  }

  const overviewMatch = url.pathname.match(/^\/projects\/([^/]+)\/overview$/);
  if (req.method === 'GET' && overviewMatch) {
    const payload = overview(overviewMatch[1]);

    if (!payload) {
      sendJson(res, 404, { error: 'Project not found' });
      return;
    }

    sendJson(res, 200, payload);
    return;
  }

  const connectMatch = url.pathname.match(/^\/projects\/([^/]+)\/connect$/);
  if (req.method === 'POST' && connectMatch) {
    const project = state.projects.get(connectMatch[1]);

    if (!project) {
      sendJson(res, 404, { error: 'Project not found' });
      return;
    }

    const body = await readJson(req);
    project.connection = {
      repositoryPath: body.repositoryPath || '',
      appUrl: body.appUrl || '',
      healthUrl: body.healthUrl || '',
      githubRepo: body.githubRepo || '',
      githubBranch: body.githubBranch || '',
      packagePath: body.packagePath || 'package.json',
      connectedAt: now(),
    };

    const connectionCheck = await inspectProjectConnection(project);
    saveState();
    sendJson(res, 200, { project, connectionCheck });
    return;
  }

  const connectionMatch = url.pathname.match(/^\/projects\/([^/]+)\/connection$/);
  if (req.method === 'GET' && connectionMatch) {
    const project = state.projects.get(connectionMatch[1]);

    if (!project) {
      sendJson(res, 404, { error: 'Project not found' });
      return;
    }

    if (!project.connection) {
      sendJson(res, 400, { error: 'Project is not connected yet' });
      return;
    }

    sendJson(res, 200, { connectionCheck: await inspectProjectConnection(project) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/agents') {
    const body = await readJson(req);
    const project = state.projects.get(body.projectId);

    if (!project) {
      sendJson(res, 400, { error: 'Valid projectId is required' });
      return;
    }

    const agent = {
      id: randomUUID(),
      projectId: project.id,
      type: body.type || 'marketing',
      name: body.name || 'New agent',
      createdAt: now(),
    };

    state.agents.set(agent.id, agent);
    saveState();
    sendJson(res, 201, { agent });
    return;
  }

  const heartbeatMatch = url.pathname.match(/^\/agents\/([^/]+)\/heartbeat$/);
  if (req.method === 'POST' && heartbeatMatch) {
    const agent = state.agents.get(heartbeatMatch[1]);

    if (!agent) {
      sendJson(res, 404, { error: 'Agent not found' });
      return;
    }

    const task = [...state.tasks.values()].find((candidate) => {
      return candidate.status === 'approved'
        && candidate.projectId === agent.projectId
        && (candidate.assignedAgentId === agent.id || (!candidate.assignedAgentId && candidate.agentType === agent.type));
    });

    if (!task) {
      const message = `${agent.name} heartbeat received. No approved work is available.`;
      sendJson(res, 200, { agent, message, task: null });
      return;
    }

    sendJson(res, 200, {
      agent,
      message: `${agent.name} picked up approved work and completed a run.`,
      ...(await runTask(task, 'heartbeat')),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/tasks') {
    const body = await readJson(req);
    const project = state.projects.get(body.projectId);

    if (!project) {
      sendJson(res, 400, { error: 'Valid projectId is required' });
      return;
    }

    const task = {
      id: randomUUID(),
      projectId: project.id,
      goalId: body.goalId || null,
      assignedAgentId: body.assignedAgentId || null,
      agentType: body.agentType || 'marketing',
      actionType: body.actionType || 'generate_campaign_draft',
      objective: body.objective || 'Untitled task',
      estimatedCost: Number(body.estimatedCost || 0),
      status: 'pending',
      createdAt: now(),
    };
    const decision = guardDecision(task, project.budgetPolicy);

    task.status = decision.blocked ? 'blocked' : decision.requiresManualApproval ? 'awaiting_approval' : 'approved';
    state.tasks.set(task.id, task);
    saveState();
    addLog(task.id, 'task.created', `Task created for ${task.agentType} agent.`);
    addLog(task.id, 'guard.decision', decision.reason, decision);

    sendJson(res, 201, { task, guardDecision: decision });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/tasks') {
    sendJson(res, 200, { tasks: [...state.tasks.values()] });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/runs') {
    sendJson(res, 200, { runs: [...state.runs.values()] });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/logs') {
    sendJson(res, 200, { logs: state.logs });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/artifacts') {
    sendJson(res, 200, { artifacts: [...state.artifacts.values()] });
    return;
  }

  const taskRunMatch = url.pathname.match(/^\/tasks\/([^/]+)\/run$/);
  if (req.method === 'POST' && taskRunMatch) {
    const task = state.tasks.get(taskRunMatch[1]);

    if (!task) {
      sendJson(res, 404, { error: 'Task not found' });
      return;
    }

    try {
      sendJson(res, 200, await runTask(task));
    } catch (error) {
      addLog(task.id, 'task.failed', error.message);
      task.status = 'failed';
      task.updatedAt = now();
      saveState();
      sendJson(res, 400, { error: error.message, task });
    }
    return;
  }

  const taskActionMatch = url.pathname.match(/^\/tasks\/([^/]+)\/(approve|reject)$/);
  if (req.method === 'POST' && taskActionMatch) {
    const [, taskId, action] = taskActionMatch;
    const task = state.tasks.get(taskId);

    if (!task) {
      sendJson(res, 404, { error: 'Task not found' });
      return;
    }

    task.status = action === 'approve' ? 'approved' : 'paused';
    task.updatedAt = now();
    saveState();
    addLog(
      task.id,
      action === 'approve' ? 'task.approved' : 'task.rejected',
      action === 'approve' ? 'Task manually approved.' : 'Task rejected and paused.'
    );
    sendJson(res, 200, { task });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/budgets/check') {
    const body = await readJson(req);
    const project = state.projects.get(body.projectId);

    if (!project) {
      sendJson(res, 400, { error: 'Valid projectId is required' });
      return;
    }

    const task = {
      estimatedCost: Number(body.estimatedCost || 0),
    };

    sendJson(res, 200, { guardDecision: guardDecision(task, project.budgetPolicy) });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    console.error(error);
    sendJson(res, 500, { error: 'Internal server error' });
  });
});

const port = process.env.PORT || 4100;
loadState();
server.listen(port, () => {
  console.log(`Aether Core listening on ${port}`);
});
