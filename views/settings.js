function renderSettings(currentConfig) {
  const currentOrg = currentConfig?.org || '';
  const currentRepos = currentConfig?.repos || [];

  return `
    <h2>Settings</h2>
    <form id="settings-form" method="post" action="/settings">
      <label for="org-select">GitHub Organization</label>
      <select id="org-select" name="org" required>
        <option value="" disabled ${!currentOrg ? 'selected' : ''}>Loading organizations...</option>
      </select>

      <div id="repos-section" style="display: none;">
        <label>Repositories to follow</label>
        <div id="repos-filter">
          <input type="search" id="repo-search" placeholder="Filter repositories...">
        </div>
        <div id="repos-actions" style="margin-bottom: 0.5rem;">
          <a href="#" id="select-all">Select all</a> /
          <a href="#" id="select-none">Select none</a>
        </div>
        <fieldset id="repos-list">
          <p>Select an organization first.</p>
        </fieldset>
      </div>

      <button type="submit">Save</button>
    </form>

    <script>
      const currentOrg = ${JSON.stringify(currentOrg)};
      const currentRepos = ${JSON.stringify(currentRepos)};
      const orgSelect = document.getElementById('org-select');
      const reposSection = document.getElementById('repos-section');
      const reposList = document.getElementById('repos-list');
      const repoSearch = document.getElementById('repo-search');

      async function loadOrgs() {
        const res = await fetch('/api/orgs');
        const orgs = await res.json();
        orgSelect.innerHTML = '<option value="" disabled>Select an organization</option>';
        orgs.forEach(org => {
          const opt = document.createElement('option');
          opt.value = org;
          opt.textContent = org;
          if (org === currentOrg) opt.selected = true;
          orgSelect.appendChild(opt);
        });
        if (currentOrg) loadRepos(currentOrg);
      }

      async function loadRepos(org) {
        reposSection.style.display = 'block';
        reposList.innerHTML = '<p aria-busy="true">Loading repositories...</p>';
        const res = await fetch('/api/repos/' + encodeURIComponent(org));
        const repos = await res.json();
        reposList.innerHTML = '';
        repos.forEach(repo => {
          const label = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.name = 'repos';
          cb.value = repo;
          cb.className = 'repo-checkbox';
          if (org === currentOrg && currentRepos.includes(repo)) cb.checked = true;
          label.appendChild(cb);
          label.appendChild(document.createTextNode(' ' + repo));
          reposList.appendChild(label);
        });
        filterRepos();
      }

      function filterRepos() {
        const query = repoSearch.value.toLowerCase();
        reposList.querySelectorAll('label').forEach(label => {
          const name = label.textContent.trim().toLowerCase();
          label.style.display = name.includes(query) ? '' : 'none';
        });
      }

      orgSelect.addEventListener('change', () => loadRepos(orgSelect.value));
      repoSearch.addEventListener('input', filterRepos);

      document.getElementById('select-all').addEventListener('click', (e) => {
        e.preventDefault();
        reposList.querySelectorAll('.repo-checkbox').forEach(cb => {
          if (cb.closest('label').style.display !== 'none') cb.checked = true;
        });
      });

      document.getElementById('select-none').addEventListener('click', (e) => {
        e.preventDefault();
        reposList.querySelectorAll('.repo-checkbox').forEach(cb => {
          if (cb.closest('label').style.display !== 'none') cb.checked = false;
        });
      });

      loadOrgs();
    </script>`;
}

module.exports = { renderSettings };
