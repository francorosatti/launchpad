const express = require('express');
const path = require('path');
const config = require('./lib/config');
const github = require('./lib/github');
const agent = require('./lib/agent');
const { layout } = require('./views/layout');
const { renderDashboard, renderRow } = require('./views/dashboard');
const { renderSettings } = require('./views/settings');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Dashboard
app.get('/', async (req, res) => {
  try {
    const cfg = await config.load();
    if (!cfg) return res.redirect('/settings');
    const statuses = await github.fetchAllStatuses(cfg.org, cfg.repos);
    const now = new Date().toLocaleString();
    res.send(layout('Dashboard', renderDashboard(cfg.org, statuses, now, agent.resolveReposDir(cfg), cfg.libraries || [])));
  } catch (err) {
    res.status(500).send(layout('Error', `<h2>Error</h2><p>${err.message}</p><p>Make sure <code>gh</code> is installed and authenticated.</p>`));
  }
});

// Settings page
app.get('/settings', async (req, res) => {
  const cfg = await config.load();
  res.send(layout('Settings', renderSettings(cfg, agent.DEFAULT_REPOS_DIR)));
});

// Save settings
app.post('/settings', async (req, res) => {
  const org = req.body.org;
  let repos = req.body.repos || [];
  if (typeof repos === 'string') repos = [repos];
  const reposDir = (req.body.reposDir || '').trim();
  const libraries = (req.body.libraries || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  await config.save({ org, repos, ...(reposDir ? { reposDir } : {}), ...(libraries.length ? { libraries } : {}) });
  res.redirect('/');
});

// API: list orgs
app.get('/api/orgs', async (req, res) => {
  try {
    const orgs = await github.listOrgs();
    res.json(orgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: list repos for an org
app.get('/api/repos/:org', async (req, res) => {
  try {
    const repos = await github.listRepos(req.params.org);
    res.json(repos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: refresh statuses (AJAX)
app.get('/api/refresh', async (req, res) => {
  try {
    const cfg = await config.load();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    const statuses = await github.fetchAllStatuses(cfg.org, cfg.repos);
    const lastRefresh = new Date().toLocaleString();

    const html = statuses.map(repo => renderRow(cfg.org, repo)).join('\n');
    const qaNeeded = statuses.filter(r => !r.qa.error && r.qa.ahead_by > 0).length;
    const prodNeeded = statuses.filter(r => !r.prod.error && r.prod.ahead_by > 0).length;
    const vulnTotals = statuses.reduce((acc, r) => {
      if (r.vulns) {
        acc.critical += r.vulns.critical;
        acc.high += r.vulns.high;
        acc.medium += r.vulns.medium;
        acc.low += r.vulns.low;
      }
      return acc;
    }, { critical: 0, high: 0, medium: 0, low: 0 });

    res.json({ html, lastRefresh, qaNeeded, prodNeeded, vulnTotals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoints that launch local processes must only be callable from this app's own pages.
// Requiring a JSON body forces a CORS preflight for cross-origin requests (which we never answer),
// and the Origin check rejects anything that isn't the dashboard itself.
function sameOriginJson(req, res, next) {
  const origin = req.get('origin');
  if (!req.is('application/json') || (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function parseRepoList(value, allowed) {
  if (!Array.isArray(value)) return null;
  const repos = value.filter(r => typeof r === 'string' && allowed.includes(r));
  return repos.length === value.length && repos.length > 0 ? repos : null;
}

// API: which of the selected repos are missing from the local repos folder
app.post('/api/fix-vulns/check', express.json(), sameOriginJson, async (req, res) => {
  const cfg = await config.load();
  if (!cfg) return res.status(400).json({ error: 'Not configured' });
  const repos = parseRepoList(req.body.repos, cfg.repos);
  if (!repos) return res.status(400).json({ error: 'Select at least one followed repository' });
  const reposDir = agent.resolveReposDir(cfg);
  const missing = await agent.checkLocalRepos(reposDir, repos);
  res.json({ reposDir, missing });
});

// API: open a terminal with a Claude Code session that fixes vulnerabilities in the selected repos
app.post('/api/fix-vulns', express.json({ limit: '100kb' }), sameOriginJson, async (req, res) => {
  const cfg = await config.load();
  if (!cfg) return res.status(400).json({ error: 'Not configured' });
  const prompt = typeof req.body.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) return res.status(400).json({ error: 'Prompt is empty' });
  try {
    const { command } = await agent.launchClaudeSession({ reposDir: agent.resolveReposDir(cfg), prompt });
    res.json({ ok: true, command });
  } catch (err) {
    res.status(500).json({ error: err.message, command: err.command });
  }
});

const PORT = process.env.PORT || 3033;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Launchpad running at http://localhost:${PORT}`);
});
