const { execFile } = require('node:child_process');

function gh(args) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

async function listOrgs() {
  const [orgsJson, userJson] = await Promise.all([
    gh(['api', '/user/orgs', '--jq', '.[].login']),
    gh(['api', '/user', '--jq', '.login']),
  ]);

  const orgs = orgsJson ? orgsJson.split('\n').filter(Boolean) : [];
  const user = userJson.trim();
  if (user && !orgs.includes(user)) {
    orgs.unshift(user);
  }
  return orgs;
}

async function listRepos(org) {
  let json;
  try {
    json = await gh(['api', '--paginate', `/orgs/${encodeURIComponent(org)}/repos`, '--jq', '.[].name']);
  } catch {
    json = await gh(['api', '--paginate', `/users/${encodeURIComponent(org)}/repos`, '--jq', '.[].name']);
  }
  const repos = json ? json.split('\n').filter(Boolean) : [];
  repos.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return repos;
}

async function compareStatus(org, repo, base, head) {
  try {
    const json = await gh([
      'api',
      `/repos/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
      '--jq', '{status, ahead_by, behind_by, total_commits}',
    ]);
    return JSON.parse(json);
  } catch (err) {
    return { error: err.message.split('\n')[0] };
  }
}

async function branchCount(org, repo) {
  try {
    const json = await gh([
      'api', '--paginate',
      `/repos/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/branches`,
      '--jq', 'length',
    ]);
    return json.split('\n').filter(Boolean).reduce((sum, n) => sum + parseInt(n, 10), 0);
  } catch {
    return null;
  }
}

async function vulnerabilityCount(org, repo) {
  try {
    const json = await gh([
      'api', '--paginate',
      `/repos/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/dependabot/alerts`,
      '--jq', '.[].security_vulnerability.severity',
      '-X', 'GET',
      '-f', 'state=open',
    ]);
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const line of json.split('\n').filter(Boolean)) {
      if (counts.hasOwnProperty(line)) counts[line]++;
    }
    return counts;
  } catch {
    return null;
  }
}

async function fetchAllStatuses(org, repos) {
  const results = await Promise.allSettled(
    repos.map(async (repo) => {
      const [qa, prod, branches, vulns] = await Promise.all([
        compareStatus(org, repo, 'qa', 'development'),
        compareStatus(org, repo, 'master', 'qa'),
        branchCount(org, repo),
        vulnerabilityCount(org, repo),
      ]);
      return { name: repo, qa, prod, branches, vulns };
    })
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      name: repos[i],
      qa: { error: result.reason?.message || 'Unknown error' },
      prod: { error: result.reason?.message || 'Unknown error' },
    };
  });
}

module.exports = { listOrgs, listRepos, compareStatus, fetchAllStatuses };
