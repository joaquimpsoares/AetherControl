const http = require('http');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

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
  });

  return { project, goal, agent, task };
}

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

function now() {
  return new Date().toISOString();
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

function renderConsoleHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Aether Console Lite</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #eef2f6;
        --panel: #ffffff;
        --panel-soft: #f8fafc;
        --border: #d8dee8;
        --border-strong: #bcc7d6;
        --text: #172033;
        --muted: #647084;
        --subtle: #8b95a6;
        --accent: #0f766e;
        --accent-dark: #0b5f59;
        --blue: #2563eb;
        --danger: #b42318;
        --warn: #b45309;
        --shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          linear-gradient(180deg, #f8fafc 0, var(--bg) 340px),
          var(--bg);
        color: var(--text);
      }
      header {
        position: sticky;
        top: 0;
        z-index: 10;
        border-bottom: 1px solid rgba(216, 222, 232, 0.84);
        background: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(14px);
      }
      .shell {
        width: min(1360px, calc(100vw - 32px));
        margin: 0 auto;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 78px;
      }
      h1, h2, h3, p { margin-top: 0; }
      h1 { margin-bottom: 4px; font-size: 26px; letter-spacing: 0; }
      h2 { font-size: 16px; margin-bottom: 14px; letter-spacing: 0; }
      h3 { font-size: 15px; margin-bottom: 10px; }
      p { color: var(--muted); margin-bottom: 0; }
      main { padding: 24px 0 44px; }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid #86efac;
        background: #ecfdf5;
        color: #166534;
        padding: 7px 11px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 800;
        white-space: nowrap;
      }
      .grid {
        display: grid;
        grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
        gap: 20px;
        align-items: start;
      }
      .stack { display: grid; gap: 16px; }
      section, .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 1px 1px rgba(15, 23, 42, 0.03);
      }
      .stack > section:first-child {
        box-shadow: var(--shadow);
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 16px;
        align-items: center;
        background: #ffffff;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 18px;
        box-shadow: var(--shadow);
      }
      .hero h2 {
        margin-bottom: 6px;
        font-size: 22px;
      }
      .hero p {
        max-width: 720px;
      }
      .hero-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      .panel-eyebrow {
        color: var(--subtle);
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      form { display: grid; gap: 12px; }
      label {
        display: grid;
        gap: 6px;
        font-size: 12px;
        font-weight: 800;
        color: #344052;
        text-transform: uppercase;
      }
      input, select {
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 10px 12px;
        font: inherit;
        background: #fbfdff;
        color: var(--text);
        outline: none;
      }
      input:focus, select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.14);
      }
      button {
        border: 0;
        border-radius: 6px;
        padding: 10px 13px;
        font: inherit;
        font-weight: 800;
        background: var(--accent);
        color: #fff;
        cursor: pointer;
        transition: background 140ms ease, transform 140ms ease, border-color 140ms ease;
      }
      button:hover { background: var(--accent-dark); transform: translateY(-1px); }
      button.secondary {
        border: 1px solid var(--border-strong);
        background: #fff;
        color: var(--text);
      }
      button.secondary:hover { background: #f8fafc; }
      button.danger { background: var(--danger); }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .metrics {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
      }
      .metric {
        background: var(--panel-soft);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px;
      }
      .metric strong {
        display: block;
        font-size: 28px;
        line-height: 1;
        margin-bottom: 6px;
      }
      .metric span {
        display: block;
        color: var(--subtle);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .list {
        display: grid;
        gap: 10px;
      }
      .item {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px;
        background: #ffffff;
      }
      .item-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
        align-items: flex-start;
      }
      .item-head strong {
        line-height: 1.25;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 8px;
        background: #e5e7eb;
        color: #374151;
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
      }
      .badge.awaiting_approval { background: #fef3c7; color: var(--warn); }
      .badge.approved { background: #dcfce7; color: #166534; }
      .badge.paused { background: #fee2e2; color: var(--danger); }
      .badge.running, .badge.queued { background: #dbeafe; color: #1d4ed8; }
      .badge.completed { background: #dcfce7; color: #166534; }
      .badge.failed { background: #fee2e2; color: var(--danger); }
      .badge.connected { background: #dbeafe; color: #1d4ed8; }
      .badge.ok { background: #dcfce7; color: #166534; }
      .badge.error { background: #fee2e2; color: var(--danger); }
      .meta {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .empty {
        border: 1px dashed var(--border);
        border-radius: 8px;
        padding: 18px;
        color: var(--muted);
        background: #fbfdff;
      }
      .toast {
        min-height: 24px;
        color: var(--accent-dark);
        font-size: 13px;
        font-weight: 700;
        margin-top: 12px;
      }
      code {
        background: #eef2f7;
        padding: 2px 6px;
        border-radius: 4px;
      }
      pre {
        margin: 10px 0 0;
        white-space: pre-wrap;
        background: #0f172a;
        color: #e5edf7;
        border-radius: 8px;
        padding: 12px;
        overflow-x: auto;
        font-size: 12px;
        line-height: 1.55;
      }
      @media (max-width: 880px) {
        .grid, .metrics { grid-template-columns: 1fr; }
        .topbar { align-items: flex-start; flex-direction: column; padding: 16px 0; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="shell topbar">
        <div>
          <h1>Aether Console Lite</h1>
          <p>Autonomy, under control. Test projects, agents, tasks, approvals, and budget gates.</p>
        </div>
        <span class="status">Core online :4100</span>
      </div>
    </header>
    <main class="shell grid">
      <div class="stack">
        <section>
          <div class="panel-eyebrow">Setup</div>
          <h2>Create Project</h2>
          <form id="project-form">
            <label>Project name
              <input name="name" value="Cash Copilot" required>
            </label>
            <label>Slug
              <input name="slug" value="cash-copilot" required>
            </label>
            <label>Daily limit
              <input name="dailyLimit" type="number" value="100" min="0" step="1">
            </label>
            <label>Approval threshold
              <input name="actionApprovalThreshold" type="number" value="25" min="0" step="1">
            </label>
            <button type="submit">Create project</button>
          </form>
        </section>

        <section>
          <div class="panel-eyebrow">Remote source</div>
          <h2>Connect GitHub Project</h2>
          <form id="github-project-form">
            <label>Project name
              <input name="name" value="Cash Copilot" required>
            </label>
            <label>Slug
              <input name="slug" value="cash-copilot" required>
            </label>
            <label>GitHub repo
              <input name="githubRepo" value="joaquimpsoares/cashpilot" placeholder="owner/repo or GitHub URL" required>
            </label>
            <label>Branch
              <input name="githubBranch" value="main">
            </label>
            <button type="submit">Create and connect</button>
          </form>
        </section>

        <section>
          <div class="panel-eyebrow">Runtime</div>
          <h2>Create Agent</h2>
          <form id="agent-form">
            <label>Project
              <select name="projectId" required></select>
            </label>
            <label>Agent name
              <input name="name" value="Marketing Agent" required>
            </label>
            <label>Type
              <select name="type">
                <option value="marketing">marketing</option>
                <option value="dev">dev</option>
                <option value="ops">ops</option>
              </select>
            </label>
            <button type="submit">Create agent</button>
          </form>
        </section>

        <section>
          <div class="panel-eyebrow">Strategy</div>
          <h2>Create Goal</h2>
          <form id="goal-form">
            <label>Project
              <select name="projectId" required></select>
            </label>
            <label>Goal title
              <input name="title" value="Grow Cash Copilot installs" required>
            </label>
            <label>Success metric
              <input name="successMetric" value="Generate 3 campaign ideas ready for review">
            </label>
            <button type="submit">Create goal</button>
          </form>
        </section>

        <section>
          <div class="panel-eyebrow">Integration</div>
          <h2>Connect Project</h2>
          <form id="connection-form">
            <label>Project
              <select name="projectId" required></select>
            </label>
            <label>Repository path
              <input name="repositoryPath" value="/home/jsoares/.openclaw/workspace/cashpilot" required>
            </label>
            <label>App URL
              <input name="appUrl" value="http://192.168.88.248:8081">
            </label>
            <label>Health URL
              <input name="healthUrl" value="">
            </label>
            <label>GitHub repo
              <input name="githubRepo" value="joaquimpsoares/cashpilot" placeholder="owner/repo or GitHub URL">
            </label>
            <label>GitHub branch
              <input name="githubBranch" value="main">
            </label>
            <label>Package path
              <input name="packagePath" value="package.json">
            </label>
            <button type="submit">Connect project</button>
          </form>
        </section>

        <section>
          <div class="panel-eyebrow">Execution</div>
          <h2>Create Task</h2>
          <form id="task-form">
            <label>Project
              <select name="projectId" required></select>
            </label>
            <label>Goal
              <select name="goalId"></select>
            </label>
            <label>Assigned agent
              <select name="assignedAgentId"></select>
            </label>
            <label>Agent type
              <select name="agentType">
                <option value="marketing">marketing</option>
                <option value="dev">dev</option>
                <option value="ops">ops</option>
              </select>
            </label>
            <label>Objective
              <input name="objective" value="Draft Google Ads campaign" required>
            </label>
            <label>Estimated cost
              <input name="estimatedCost" type="number" value="30" min="0" step="1">
            </label>
            <button type="submit">Create guarded task</button>
          </form>
        </section>
      </div>

      <div class="stack">
        <section class="hero">
          <div>
            <div class="panel-eyebrow">AetherControl</div>
            <h2>Agent control plane</h2>
            <p>Define goals, assign agents, gate risky actions, run approved work, and inspect every artifact and event from one dashboard.</p>
          </div>
          <div class="hero-actions">
            <span class="status">Core online :4100</span>
            <button class="secondary" id="refresh-button" type="button">Refresh</button>
            <button class="secondary" id="seed-button" type="button">Seed demo</button>
            <button class="danger" id="reset-button" type="button">Reset</button>
          </div>
        </section>

        <section>
          <div class="item-head">
            <h2>Control Plane</h2>
          </div>
          <div class="metrics">
            <div class="metric"><strong id="metric-projects">0</strong><span>Projects</span></div>
            <div class="metric"><strong id="metric-agents">0</strong><span>Agents</span></div>
            <div class="metric"><strong id="metric-tasks">0</strong><span>Tasks</span></div>
            <div class="metric"><strong id="metric-runs">0</strong><span>Runs</span></div>
            <div class="metric"><strong id="metric-approvals">0</strong><span>Approvals</span></div>
          </div>
          <p class="toast" id="toast"></p>
        </section>

        <section>
          <h2>Projects</h2>
          <div id="projects-list" class="list"></div>
        </section>

        <section>
          <h2>Agents</h2>
          <div id="agents-list" class="list"></div>
        </section>

        <section>
          <h2>Goals</h2>
          <div id="goals-list" class="list"></div>
        </section>

        <section>
          <h2>Tasks</h2>
          <div id="tasks-list" class="list"></div>
        </section>

        <section>
          <h2>Runs</h2>
          <div id="runs-list" class="list"></div>
        </section>

        <section>
          <h2>Artifacts</h2>
          <div id="artifacts-list" class="list"></div>
        </section>

        <section>
          <h2>Execution Log</h2>
          <div id="logs-list" class="list"></div>
        </section>
      </div>
    </main>

    <script>
      const state = { projects: [], goals: [], agents: [], tasks: [], runs: [], logs: [], artifacts: [], connectionChecks: {} };
      const toast = document.querySelector('#toast');
      const projectSelects = document.querySelectorAll('select[name="projectId"]');
      const goalSelect = document.querySelector('select[name="goalId"]');
      const agentSelect = document.querySelector('select[name="assignedAgentId"]');

      function setToast(message) {
        toast.textContent = message;
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[char]));
      }

      async function api(path, options = {}) {
        const response = await fetch(path, {
          ...options,
          headers: {
            'content-type': 'application/json',
            ...(options.headers || {}),
          },
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || 'Request failed');
        }
        return body;
      }

      function fillProjectSelects() {
        projectSelects.forEach((select) => {
          const current = select.value;
          select.innerHTML = state.projects
            .map((project) => '<option value="' + project.id + '">' + project.name + '</option>')
            .join('');
          if (current) select.value = current;
        });
      }

      function fillGoalSelect() {
        const projectId = document.querySelector('#task-form select[name="projectId"]').value;
        const goals = state.goals.filter((goal) => goal.projectId === projectId);
        goalSelect.innerHTML = '<option value="">No goal</option>' + goals
          .map((goal) => '<option value="' + goal.id + '">' + goal.title + '</option>')
          .join('');
      }

      function fillAgentSelect() {
        const projectId = document.querySelector('#task-form select[name="projectId"]').value;
        const agents = state.agents.filter((agent) => agent.projectId === projectId);
        agentSelect.innerHTML = '<option value="">Auto assign by type</option>' + agents
          .map((agent) => '<option value="' + agent.id + '">' + agent.name + ' (' + agent.type + ')</option>')
          .join('');
      }

      function renderProjects() {
        const list = document.querySelector('#projects-list');
        if (!state.projects.length) {
          list.innerHTML = '<div class="empty">Create a local project or connect a GitHub project to start controlling agents.</div>';
          return;
        }

        list.innerHTML = state.projects.map((project) => {
          return '<article class="item">' +
            '<div class="item-head"><strong>' + project.name + '</strong><span class="badge">' + project.slug + '</span></div>' +
            '<div class="meta">Budget: ' + project.budgetPolicy.currency + ' ' + project.budgetPolicy.dailyLimit + '/day, approval at ' + project.budgetPolicy.actionApprovalThreshold + '</div>' +
            renderConnection(project) +
            '<div class="meta"><code>' + project.id + '</code></div>' +
          '</article>';
        }).join('');
      }

      function renderConnection(project) {
        if (!project.connection) {
          return '<div class="meta">Not connected to a repo yet.</div>';
        }

        const check = state.connectionChecks[project.id];
        const hasLocalPath = Boolean(project.connection.repositoryPath);
        const localStatus = hasLocalPath && check
          ? '<div class="meta"><span class="badge ' + (check.repository.exists ? 'ok' : 'error') + '">' + (check.repository.exists ? 'local repo visible' : 'local repo missing') + '</span> ' + project.connection.repositoryPath + '</div>'
          : hasLocalPath
            ? '<div class="meta"><span class="badge connected">local repo configured</span> ' + project.connection.repositoryPath + '</div>'
            : '<div class="meta"><span class="badge connected">remote-only</span> No local repository path configured.</div>';
        const packageName = check && check.packageJson.name ? ' · package ' + check.packageJson.name : '';
        const gitStatus = check && check.repository.git ? ' · git repo' : '';
        const localPackage = packageName || gitStatus
          ? '<div class="meta">' + packageName + gitStatus + '</div>'
          : '';
        const githubMessage = check && check.github && check.github.error
          ? ' · ' + check.github.error + (check.github.status === 404 ? ' (set GITHUB_TOKEN if this repo is private)' : '')
          : '';
        const githubStatus = check && check.github && check.github.repo
          ? '<div class="meta"><span class="badge ' + (check.github.ok ? 'ok' : 'error') + '">' + (check.github.ok ? 'GitHub connected' : 'GitHub unavailable') + '</span> ' + check.github.repo + (check.github.defaultBranch ? ' · ' + check.github.defaultBranch : '') + '</div>'
          + (githubMessage ? '<div class="meta">' + githubMessage.slice(3) + '</div>' : '')
          : '';

        return localStatus +
          localPackage +
          githubStatus +
          '<div class="actions"><button class="secondary" data-check-connection="' + project.id + '" type="button">Check connection</button>' +
          (project.connection.appUrl ? '<a href="' + project.connection.appUrl + '" target="_blank"><button class="secondary" type="button">Open app</button></a>' : '') +
          '</div>';
      }

      function renderAgents() {
        const list = document.querySelector('#agents-list');
        if (!state.agents.length) {
          list.innerHTML = '<div class="empty">Create an agent to assign work inside a project.</div>';
          return;
        }

        list.innerHTML = state.agents.map((agent) => {
          const project = state.projects.find((item) => item.id === agent.projectId);
          return '<article class="item">' +
            '<div class="item-head"><strong>' + agent.name + '</strong><span class="badge">' + agent.type + '</span></div>' +
            '<div class="meta">Project: ' + (project ? project.name : 'Unknown project') + '</div>' +
            '<div class="actions"><button data-heartbeat="' + agent.id + '">Heartbeat</button></div>' +
            '<div class="meta"><code>' + agent.id + '</code></div>' +
          '</article>';
        }).join('');
      }

      function renderGoals() {
        const list = document.querySelector('#goals-list');
        if (!state.goals.length) {
          list.innerHTML = '<div class="empty">Create a goal so tasks have business context.</div>';
          return;
        }

        list.innerHTML = state.goals.map((goal) => {
          const project = state.projects.find((item) => item.id === goal.projectId);
          return '<article class="item">' +
            '<div class="item-head"><strong>' + goal.title + '</strong><span class="badge">' + goal.status + '</span></div>' +
            '<div class="meta">Project: ' + (project ? project.name : 'Unknown project') + '</div>' +
            '<div class="meta">Success: ' + goal.successMetric + '</div>' +
          '</article>';
        }).join('');
      }

      function renderTasks() {
        const list = document.querySelector('#tasks-list');
        if (!state.tasks.length) {
          list.innerHTML = '<div class="empty">Create a task to see Guard decisions and approvals.</div>';
          return;
        }

        list.innerHTML = state.tasks.map((task) => {
          const project = state.projects.find((item) => item.id === task.projectId);
          const goal = state.goals.find((item) => item.id === task.goalId);
          const agent = state.agents.find((item) => item.id === task.assignedAgentId);
          let actions = '';
          if (task.status === 'awaiting_approval') {
            actions = '<div class="actions"><button data-approve="' + task.id + '">Approve</button><button class="danger" data-reject="' + task.id + '">Reject</button></div>';
          }
          if (task.status === 'approved') {
            actions = '<div class="actions"><button data-run="' + task.id + '">Run agent</button></div>';
          }

          return '<article class="item">' +
            '<div class="item-head"><strong>' + task.objective + '</strong><span class="badge ' + task.status + '">' + task.status + '</span></div>' +
            '<div class="meta">' + task.agentType + ' agent · ' + (project ? project.name : 'Unknown project') + ' · Estimated cost ' + task.estimatedCost + '</div>' +
            '<div class="meta">Goal: ' + (goal ? goal.title : 'None') + ' · Assigned: ' + (agent ? agent.name : 'Auto') + '</div>' +
            actions +
          '</article>';
        }).join('');
      }

      function renderRuns() {
        const list = document.querySelector('#runs-list');
        if (!state.runs.length) {
          list.innerHTML = '<div class="empty">Task runs will appear when an agent executes approved work.</div>';
          return;
        }

        list.innerHTML = state.runs.slice().reverse().map((run) => {
          const task = state.tasks.find((item) => item.id === run.taskId);
          return '<article class="item">' +
            '<div class="item-head"><strong>' + (task ? task.objective : run.taskId) + '</strong><span class="badge ' + run.status + '">' + run.status + '</span></div>' +
            '<div class="meta">Trigger: ' + run.trigger + ' · Started: ' + (run.startedAt || 'pending') + '</div>' +
          '</article>';
        }).join('');
      }

      function renderArtifacts() {
        const list = document.querySelector('#artifacts-list');
        if (!state.artifacts.length) {
          list.innerHTML = '<div class="empty">Run an approved task to generate artifacts.</div>';
          return;
        }

        list.innerHTML = state.artifacts.slice().reverse().map((artifact) => {
          const task = state.tasks.find((item) => item.id === artifact.taskId);
          return '<article class="item">' +
            '<div class="item-head"><strong>' + artifact.title + '</strong><span class="badge">' + artifact.type + '</span></div>' +
            '<div class="meta">Task: ' + (task ? task.objective : artifact.taskId) + '</div>' +
            '<pre>' + escapeHtml(artifact.content) + '</pre>' +
          '</article>';
        }).join('');
      }

      function renderLogs() {
        const list = document.querySelector('#logs-list');
        if (!state.logs.length) {
          list.innerHTML = '<div class="empty">Execution events will appear here.</div>';
          return;
        }

        list.innerHTML = state.logs.slice().reverse().map((entry) => {
          return '<article class="item">' +
            '<div class="item-head"><strong>' + entry.event + '</strong><span class="badge">' + new Date(entry.createdAt).toLocaleTimeString() + '</span></div>' +
            '<div class="meta">' + entry.message + '</div>' +
          '</article>';
        }).join('');
      }

      function renderMetrics() {
        document.querySelector('#metric-projects').textContent = state.projects.length;
        document.querySelector('#metric-tasks').textContent = state.tasks.length;
        document.querySelector('#metric-runs').textContent = state.runs.length;
        document.querySelector('#metric-approvals').textContent = state.tasks.filter((task) => task.status === 'awaiting_approval').length;
        document.querySelector('#metric-agents').textContent = state.agents.length;
      }

      async function refresh() {
        const [projectsResponse, goalsResponse, agentsResponse, tasksResponse, runsResponse, logsResponse, artifactsResponse] = await Promise.all([
          api('/projects'),
          api('/goals'),
          api('/agents'),
          api('/tasks'),
          api('/runs'),
          api('/logs'),
          api('/artifacts'),
        ]);
        state.projects = projectsResponse.projects;
        state.goals = goalsResponse.goals;
        state.agents = agentsResponse.agents;
        state.tasks = tasksResponse.tasks;
        state.runs = runsResponse.runs;
        state.logs = logsResponse.logs;
        state.artifacts = artifactsResponse.artifacts;
        fillProjectSelects();
        fillGoalSelect();
        fillAgentSelect();
        renderProjects();
        renderAgents();
        renderGoals();
        renderTasks();
        renderRuns();
        renderArtifacts();
        renderLogs();
        renderMetrics();
      }

      document.querySelector('#project-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await api('/projects', {
          method: 'POST',
          body: JSON.stringify({
            name: form.get('name'),
            slug: form.get('slug'),
            budgetPolicy: {
              currency: 'EUR',
              weeklyLimit: 500,
              dailyLimit: Number(form.get('dailyLimit')),
              actionApprovalThreshold: Number(form.get('actionApprovalThreshold')),
            },
          }),
        });
        setToast('Project created.');
        await refresh();
      });

      document.querySelector('#github-project-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const { project } = await api('/projects', {
          method: 'POST',
          body: JSON.stringify({
            name: form.get('name'),
            slug: form.get('slug'),
          }),
        });
        const response = await api('/projects/' + project.id + '/connect', {
          method: 'POST',
          body: JSON.stringify({
            repositoryPath: '',
            appUrl: '',
            healthUrl: '',
            githubRepo: form.get('githubRepo'),
            githubBranch: form.get('githubBranch'),
            packagePath: 'package.json',
          }),
        });
        state.connectionChecks[project.id] = response.connectionCheck;
        setToast('GitHub project connected.');
        await refresh();
      });

      document.querySelector('#agent-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await api('/agents', {
          method: 'POST',
          body: JSON.stringify({
            projectId: form.get('projectId'),
            name: form.get('name'),
            type: form.get('type'),
          }),
        });
        setToast('Agent created.');
        await refresh();
      });

      document.querySelector('#goal-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await api('/goals', {
          method: 'POST',
          body: JSON.stringify({
            projectId: form.get('projectId'),
            title: form.get('title'),
            successMetric: form.get('successMetric'),
          }),
        });
        setToast('Goal created.');
        await refresh();
      });

      document.querySelector('#connection-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const projectId = form.get('projectId');
        const response = await api('/projects/' + projectId + '/connect', {
          method: 'POST',
          body: JSON.stringify({
            repositoryPath: form.get('repositoryPath'),
            appUrl: form.get('appUrl'),
            healthUrl: form.get('healthUrl'),
            githubRepo: form.get('githubRepo'),
            githubBranch: form.get('githubBranch'),
            packagePath: form.get('packagePath'),
          }),
        });
        state.connectionChecks[projectId] = response.connectionCheck;
        setToast('Project connected.');
        await refresh();
      });

      document.querySelector('#task-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await api('/tasks', {
          method: 'POST',
          body: JSON.stringify({
            projectId: form.get('projectId'),
            goalId: form.get('goalId'),
            assignedAgentId: form.get('assignedAgentId'),
            agentType: form.get('agentType'),
            objective: form.get('objective'),
            estimatedCost: Number(form.get('estimatedCost')),
          }),
        });
        setToast(response.guardDecision.reason);
        await refresh();
      });

      document.querySelector('#tasks-list').addEventListener('click', async (event) => {
        const approveId = event.target.dataset.approve;
        const rejectId = event.target.dataset.reject;
        const runId = event.target.dataset.run;
        if (!approveId && !rejectId && !runId) return;

        if (runId) {
          await api('/tasks/' + runId + '/run', { method: 'POST' });
          setToast('Agent run completed.');
          await refresh();
          return;
        }

        await api('/tasks/' + (approveId || rejectId) + '/' + (approveId ? 'approve' : 'reject'), {
          method: 'POST',
        });
        setToast(approveId ? 'Task approved.' : 'Task rejected.');
        await refresh();
      });

      document.querySelector('#agents-list').addEventListener('click', async (event) => {
        const agentId = event.target.dataset.heartbeat;
        if (!agentId) return;

        const response = await api('/agents/' + agentId + '/heartbeat', { method: 'POST' });
        setToast(response.message);
        await refresh();
      });

      document.querySelector('#projects-list').addEventListener('click', async (event) => {
        const projectId = event.target.dataset.checkConnection;
        if (!projectId) return;

        const response = await api('/projects/' + projectId + '/connection');
        state.connectionChecks[projectId] = response.connectionCheck;
        setToast(response.connectionCheck.repository.exists ? 'Project repo is visible.' : 'Project repo was not found.');
        renderProjects();
      });

      document.querySelector('#task-form select[name="projectId"]').addEventListener('change', () => {
        fillGoalSelect();
        fillAgentSelect();
      });

      document.querySelector('#refresh-button').addEventListener('click', refresh);
      document.querySelector('#seed-button').addEventListener('click', async () => {
        await api('/state/seed-demo', { method: 'POST' });
        setToast('Demo data seeded.');
        await refresh();
      });
      document.querySelector('#reset-button').addEventListener('click', async () => {
        await api('/state/reset', { method: 'POST' });
        state.connectionChecks = {};
        setToast('Demo state reset.');
        await refresh();
      });

      refresh().catch((error) => setToast(error.message));
    </script>
  </body>
</html>`;
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

function guardDecision(task, budgetPolicy) {
  if (!budgetPolicy) {
    return {
      allowed: true,
      reason: 'No budget policy configured',
      requiresManualApproval: false,
    };
  }

  if (task.estimatedCost > budgetPolicy.dailyLimit) {
    return {
      allowed: false,
      reason: 'Estimated cost exceeds daily limit',
      requiresManualApproval: true,
    };
  }

  if (task.estimatedCost >= budgetPolicy.actionApprovalThreshold) {
    return {
      allowed: false,
      reason: 'Estimated cost requires manual approval',
      requiresManualApproval: true,
    };
  }

  return {
    allowed: true,
    reason: 'Within policy limits',
    requiresManualApproval: false,
  };
}

function buildMarketingDraft(task, project) {
  const productName = project.name;
  const objective = task.objective;

  return [
    `Campaign draft for ${productName}`,
    '',
    `Objective: ${objective}`,
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
    '- This draft does not publish anything to Google Ads.',
  ].join('\n');
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
    addLog(task.id, 'marketing.guardrail', 'Marketing agent is limited to draft generation in this scaffold.');
    const artifact = createArtifact(
      task.id,
      'campaign_draft',
      'Google Ads campaign draft',
      buildMarketingDraft(task, project)
    );
    addLog(task.id, 'artifact.created', `Created artifact: ${artifact.title}`, { artifactId: artifact.id });
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
      objective: body.objective || 'Untitled task',
      estimatedCost: Number(body.estimatedCost || 0),
      status: 'pending',
      createdAt: now(),
    };
    const decision = guardDecision(task, project.budgetPolicy);

    task.status = decision.requiresManualApproval ? 'awaiting_approval' : 'approved';
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
