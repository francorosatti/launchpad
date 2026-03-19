const express = require('express');
const path = require('path');
const config = require('./lib/config');
const github = require('./lib/github');
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
    res.send(layout('Dashboard', renderDashboard(cfg.org, statuses, now)));
  } catch (err) {
    res.status(500).send(layout('Error', `<h2>Error</h2><p>${err.message}</p><p>Make sure <code>gh</code> is installed and authenticated.</p>`));
  }
});

// Settings page
app.get('/settings', async (req, res) => {
  const cfg = await config.load();
  res.send(layout('Settings', renderSettings(cfg)));
});

// Save settings
app.post('/settings', async (req, res) => {
  const org = req.body.org;
  let repos = req.body.repos || [];
  if (typeof repos === 'string') repos = [repos];
  await config.save({ org, repos });
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

    res.json({ html, lastRefresh, qaNeeded, prodNeeded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3033;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Launchpad running at http://localhost:${PORT}`);
});
