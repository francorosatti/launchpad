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

function vulnTotal(vulns) {
  return vulns ? vulns.critical + vulns.high + vulns.medium + vulns.low : 0;
}

function renderRow(org, repo) {
  const total = vulnTotal(repo.vulns);
  return `<tr>
    <td><input type="checkbox" class="repo-select" value="${escapeHtml(repo.name)}" data-vulns="${total}" aria-label="Select ${escapeHtml(repo.name)}"></td>
    <td><a href="https://github.com/${encodeURIComponent(org)}/${encodeURIComponent(repo.name)}" target="_blank">${escapeHtml(repo.name)}</a></td>
    <td>${renderStatusCell(org, repo.name, repo.qa, 'qa', 'development')}</td>
    <td>${renderStatusCell(org, repo.name, repo.prod, 'master', 'qa')}</td>
    <td>${renderBranchesCell(org, repo.name, repo.branches)}</td>
    <td>${renderVulnsCell(org, repo.name, repo.vulns)}</td>
  </tr>`;
}

function renderDashboard(org, statuses, lastRefresh, reposDir, libraries = []) {
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
      <button id="fix-vulns-btn" onclick="openFixDialog()" disabled>Fix vulnerabilities</button>
      <small id="last-refresh">Last refreshed: ${escapeHtml(lastRefresh)}</small>
    </div>

    <figure>
      <table role="grid">
        <thead>
          <tr>
            <th class="select-col"><input type="checkbox" id="select-all-repos" aria-label="Select all repositories"></th>
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

    <dialog id="fix-dialog">
      <article>
        <header>
          <button aria-label="Close" rel="prev" onclick="closeFixDialog()"></button>
          <h3>Fix vulnerabilities</h3>
        </header>
        <p>Opens a terminal in <code>${escapeHtml(reposDir)}</code> with a Claude Code session running this prompt. Edit it before launching if needed. Shared libraries (set in Settings) are fixed and released first.</p>
        <p id="fix-missing" class="fix-warning" hidden></p>
        <textarea id="fix-prompt" rows="20" spellcheck="false"></textarea>
        <p id="fix-result" hidden></p>
        <footer>
          <button class="secondary" onclick="closeFixDialog()">Cancel</button>
          <button id="fix-launch-btn" onclick="launchFix()">Launch Claude Code</button>
        </footer>
      </article>
    </dialog>

    <script>
      const LIBRARIES = ${JSON.stringify(libraries).replace(/</g, "\\u003c")};

      const STEPS = [
        'For each repo do:',
        '- pull latest version of qa branch',
        '- create a worktree',
        '- check all the vulnerabilities reported by dependabot on github.',
        '- start by doing a npm audit fix, then analyze what are still open and fix them too.',
        '- be careful if anything needs major updates, let me know and approve.',
        '- run local testing to make sure each project is healthy in terms of lint, tests, etc.',
        '- rebase on top of latest qa, open a PR.',
      ];

      const OTHER = [
        'Other instructions:',
        '- Use subagents for each repo with latest Sonnet model',
        '- Use this session only to coordinate and interact with me',
      ];

      // Shared libraries go first: the other repos can only drop the vulnerabilities that
      // come through a library once a fixed version of it has been released.
      function buildPrompt(repos) {
        const libs = repos.filter(r => LIBRARIES.includes(r));
        const others = repos.filter(r => !LIBRARIES.includes(r));
        if (!libs.length) {
          return [
            'This folder contains all my repos, I need you to do a task only in the following ones:',
            '',
            ...others.map(r => '- ' + r),
            '',
            ...STEPS,
            '',
            ...OTHER,
            '',
          ].join('\\n');
        }
        const lines = [
          'This folder contains all my repos, I need you to do a task only in the following ones:',
          '',
          'Shared libraries (other repos depend on these):',
          ...libs.map(r => '- ' + r),
        ];
        if (others.length) lines.push('', 'Repos that may depend on them:', ...others.map(r => '- ' + r));
        lines.push(
          '',
          ...STEPS,
          '',
          'Order of work:',
          '1. Fix the shared libraries first. Do not start any other repo until step 3.',
          '   - Use a conventional commit message (e.g. "fix(deps): resolve dependabot vulnerabilities") so semantic-release publishes a new patch version.',
          '   - When the library PR is open, stop and tell me. I will merge it and release it (qa -> master).',
          '2. Wait until I confirm the release, then check the new version is actually published and that it has no open vulnerabilities.',
        );
        if (others.length) {
          lines.push(
            '3. Then fix the other repos. In each one that depends on a shared library, update it to the new version as part of the same PR, and check that the vulnerabilities coming from the library are gone.',
          );
        }
        lines.push('', ...OTHER, '');
        return lines.join('\\n');
      }

      function selectedRepos() {
        return [...document.querySelectorAll('.repo-select:checked')].map(cb => cb.value);
      }

      function updateSelectionUi() {
        const all = document.querySelectorAll('.repo-select');
        const checked = selectedRepos().length;
        const btn = document.getElementById('fix-vulns-btn');
        btn.disabled = checked === 0;
        btn.textContent = checked ? 'Fix vulnerabilities (' + checked + ')' : 'Fix vulnerabilities';
        const master = document.getElementById('select-all-repos');
        master.checked = all.length > 0 && checked === all.length;
        master.indeterminate = checked > 0 && checked < all.length;
      }

      // Pre-select repos with open alerts; keep the user's choices across refreshes.
      let userSelection = null;
      function applySelection() {
        document.querySelectorAll('.repo-select').forEach(cb => {
          cb.checked = userSelection ? userSelection.has(cb.value) : Number(cb.dataset.vulns) > 0;
        });
        updateSelectionUi();
      }

      document.getElementById('status-body').addEventListener('change', (e) => {
        if (!e.target.classList.contains('repo-select')) return;
        userSelection = new Set(selectedRepos());
        updateSelectionUi();
      });

      document.getElementById('select-all-repos').addEventListener('change', (e) => {
        document.querySelectorAll('.repo-select').forEach(cb => { cb.checked = e.target.checked; });
        userSelection = new Set(selectedRepos());
        updateSelectionUi();
      });

      async function postJson(url, body) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({ error: 'Unexpected response (' + res.status + ')' }));
        if (!res.ok && !data.error) data.error = 'Request failed (' + res.status + ')';
        return data;
      }

      async function openFixDialog() {
        const repos = selectedRepos();
        if (!repos.length) return;
        document.getElementById('fix-prompt').value = buildPrompt(repos);
        const result = document.getElementById('fix-result');
        result.hidden = true;
        result.innerHTML = '';
        const launchBtn = document.getElementById('fix-launch-btn');
        launchBtn.disabled = false;
        const warning = document.getElementById('fix-missing');
        warning.hidden = true;
        document.getElementById('fix-dialog').showModal();

        const check = await postJson('/api/fix-vulns/check', { repos });
        if (check.error) {
          warning.textContent = check.error;
          warning.hidden = false;
        } else if (check.missing.length) {
          warning.textContent = 'Not cloned in ' + check.reposDir + ': ' + check.missing.join(', ') + '. Claude will not find these unless you clone them first.';
          warning.hidden = false;
        }
      }

      function closeFixDialog() {
        document.getElementById('fix-dialog').close();
      }

      async function launchFix() {
        const btn = document.getElementById('fix-launch-btn');
        const result = document.getElementById('fix-result');
        btn.setAttribute('aria-busy', 'true');
        btn.disabled = true;
        try {
          const data = await postJson('/api/fix-vulns', { prompt: document.getElementById('fix-prompt').value });
          result.hidden = false;
          result.innerHTML = '';
          if (data.error) {
            result.className = 'fix-warning';
            result.append('Could not launch: ' + data.error);
            btn.disabled = false;
          } else {
            result.className = 'fix-ok';
            result.append('Claude Code started in a new terminal window.');
          }
          if (data.command) {
            const pre = document.createElement('pre');
            pre.textContent = data.command;
            result.append(document.createElement('br'), 'To run it manually:', pre);
          }
        } catch (err) {
          result.hidden = false;
          result.className = 'fix-warning';
          result.textContent = 'Could not launch: ' + err.message;
          btn.disabled = false;
        } finally {
          btn.removeAttribute('aria-busy');
        }
      }

      applySelection();

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
          applySelection();
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
