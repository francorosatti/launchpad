function renderStatusCell(org, repo, status, base, head) {
  if (status.error) {
    return `<span class="badge badge-error" title="${escapeHtml(status.error)}">N/A</span>`;
  }
  if (status.ahead_by > 0) {
    const url = `https://github.com/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    return `<a href="${url}" target="_blank" class="badge badge-deploy">${status.ahead_by} commit${status.ahead_by === 1 ? '' : 's'} behind</a>`;
  }
  return '<span class="badge badge-ok">Up to date</span>';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderBranchesCell(org, repo, count) {
  const url = `https://github.com/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/branches/all`;
  if (count === null) return '<span class="badge badge-error" title="Could not fetch">N/A</span>';
  return `<a href="${url}" target="_blank">${count}</a>`;
}

function renderVulnsCell(org, repo, count) {
  const url = `https://github.com/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/security/dependabot`;
  if (count === null) return '<span class="badge badge-error" title="Could not fetch (Dependabot may not be enabled)">N/A</span>';
  if (count === 0) return `<a href="${url}" target="_blank" class="badge badge-ok">0</a>`;
  return `<a href="${url}" target="_blank" class="badge badge-vuln">${count}</a>`;
}

function renderRow(org, repo) {
  return `<tr>
    <td><a href="https://github.com/${encodeURIComponent(org)}/${encodeURIComponent(repo.name)}" target="_blank">${escapeHtml(repo.name)}</a></td>
    <td>${renderStatusCell(org, repo.name, repo.qa, 'qa', 'development')}</td>
    <td>${renderStatusCell(org, repo.name, repo.prod, 'master', 'qa')}</td>
    <td>${renderBranchesCell(org, repo.name, repo.branches)}</td>
    <td>${renderVulnsCell(org, repo.name, repo.vulns)}</td>
  </tr>`;
}

function renderDashboard(org, statuses, lastRefresh) {
  const rows = statuses.map(repo => renderRow(org, repo)).join('\n');

  const qaNeeded = statuses.filter(r => !r.qa.error && r.qa.ahead_by > 0).length;
  const prodNeeded = statuses.filter(r => !r.prod.error && r.prod.ahead_by > 0).length;
  const totalVulns = statuses.reduce((sum, r) => sum + (r.vulns || 0), 0);

  return `
    <hgroup>
      <h2>Deploy Status</h2>
      <p>${escapeHtml(org)} &mdash; ${statuses.length} repositories</p>
    </hgroup>

    <div class="summary">
      <span class="badge badge-deploy">${qaNeeded} need QA deploy</span>
      <span class="badge badge-deploy-prod">${prodNeeded} need Prod deploy</span>
      <span id="vuln-summary" class="badge ${totalVulns > 0 ? 'badge-vuln' : 'badge-ok'}">${totalVulns} vulnerabilit${totalVulns === 1 ? 'y' : 'ies'}</span>
      <button id="refresh-btn" class="outline" onclick="refreshData()">Refresh</button>
      <small id="last-refresh">Last refreshed: ${escapeHtml(lastRefresh)}</small>
    </div>

    <figure>
      <table role="grid">
        <thead>
          <tr>
            <th>Repository</th>
            <th>QA <small>(development &rarr; qa)</small></th>
            <th>Production <small>(qa &rarr; master)</small></th>
            <th>Branches</th>
            <th>Vulnerabilities</th>
          </tr>
        </thead>
        <tbody id="status-body">
          ${rows}
        </tbody>
      </table>
    </figure>

    <script>
      async function refreshData() {
        const btn = document.getElementById('refresh-btn');
        btn.setAttribute('aria-busy', 'true');
        btn.disabled = true;
        try {
          const res = await fetch('/api/refresh');
          const data = await res.json();
          if (data.error) {
            alert('Error: ' + data.error);
            return;
          }
          document.getElementById('status-body').innerHTML = data.html;
          document.getElementById('last-refresh').textContent = 'Last refreshed: ' + data.lastRefresh;

          const summary = document.querySelector('.summary');
          summary.querySelector('.badge-deploy').textContent = data.qaNeeded + ' need QA deploy';
          summary.querySelector('.badge-deploy-prod').textContent = data.prodNeeded + ' need Prod deploy';

          const vulnBadge = document.getElementById('vuln-summary');
          vulnBadge.textContent = data.totalVulns + (data.totalVulns === 1 ? ' vulnerability' : ' vulnerabilities');
          vulnBadge.className = 'badge ' + (data.totalVulns > 0 ? 'badge-vuln' : 'badge-ok');
        } catch (err) {
          alert('Refresh failed: ' + err.message);
        } finally {
          btn.removeAttribute('aria-busy');
          btn.disabled = false;
        }
      }
    </script>`;
}

module.exports = { renderDashboard, renderRow, escapeHtml };
