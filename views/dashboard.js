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

function renderVulnsCell(org, repo, vulns) {
  const url = `https://github.com/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/security/dependabot`;
  if (vulns === null) return '<span class="badge badge-error" title="Could not fetch (Dependabot may not be enabled)">N/A</span>';
  const total = vulns.critical + vulns.high + vulns.medium + vulns.low;
  if (total === 0) return `<a href="${url}" target="_blank" class="badge badge-ok">0</a>`;
  const parts = [];
  if (vulns.critical) parts.push(`<a href="${url}?q=is%3Aopen+severity%3Acritical" target="_blank" class="badge badge-vuln-critical">${vulns.critical} critical</a>`);
  if (vulns.high) parts.push(`<a href="${url}?q=is%3Aopen+severity%3Ahigh" target="_blank" class="badge badge-vuln-high">${vulns.high} high</a>`);
  if (vulns.medium) parts.push(`<a href="${url}?q=is%3Aopen+severity%3Amedium" target="_blank" class="badge badge-vuln-medium">${vulns.medium} medium</a>`);
  if (vulns.low) parts.push(`<a href="${url}?q=is%3Aopen+severity%3Alow" target="_blank" class="badge badge-vuln-low">${vulns.low} low</a>`);
  return parts.join(' ');
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
  const vulnTotals = statuses.reduce((acc, r) => {
    if (r.vulns) {
      acc.critical += r.vulns.critical;
      acc.high += r.vulns.high;
      acc.medium += r.vulns.medium;
      acc.low += r.vulns.low;
    }
    return acc;
  }, { critical: 0, high: 0, medium: 0, low: 0 });
  const totalVulns = vulnTotals.critical + vulnTotals.high + vulnTotals.medium + vulnTotals.low;

  return `
    <hgroup>
      <h2>Deploy Status</h2>
      <p>${escapeHtml(org)} &mdash; ${statuses.length} repositories</p>
    </hgroup>

    <div class="summary">
      <span class="badge badge-deploy">${qaNeeded} need QA deploy</span>
      <span class="badge badge-deploy-prod">${prodNeeded} need Prod deploy</span>
      <span id="vuln-summary">${totalVulns === 0
        ? '<span class="badge badge-ok">0 vulnerabilities</span>'
        : [
            vulnTotals.critical ? `<span class="badge badge-vuln-critical">${vulnTotals.critical} critical</span>` : '',
            vulnTotals.high ? `<span class="badge badge-vuln-high">${vulnTotals.high} high</span>` : '',
            vulnTotals.medium ? `<span class="badge badge-vuln-medium">${vulnTotals.medium} medium</span>` : '',
            vulnTotals.low ? `<span class="badge badge-vuln-low">${vulnTotals.low} low</span>` : '',
          ].filter(Boolean).join(' ')
      }</span>
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

          const vulnSummary = document.getElementById('vuln-summary');
          const vt = data.vulnTotals;
          const vTotal = vt.critical + vt.high + vt.medium + vt.low;
          if (vTotal === 0) {
            vulnSummary.innerHTML = '<span class="badge badge-ok">0 vulnerabilities</span>';
          } else {
            const parts = [];
            if (vt.critical) parts.push('<span class="badge badge-vuln-critical">' + vt.critical + ' critical</span>');
            if (vt.high) parts.push('<span class="badge badge-vuln-high">' + vt.high + ' high</span>');
            if (vt.medium) parts.push('<span class="badge badge-vuln-medium">' + vt.medium + ' medium</span>');
            if (vt.low) parts.push('<span class="badge badge-vuln-low">' + vt.low + ' low</span>');
            vulnSummary.innerHTML = parts.join(' ');
          }
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
