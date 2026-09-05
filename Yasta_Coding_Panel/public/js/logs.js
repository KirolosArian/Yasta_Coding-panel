/**
 * YASTA_CODING PANEL — AUDIT LOGS CONTROLLER
 */

let allLogs = [];

document.addEventListener('DOMContentLoaded', () => {
  if (!YastaApp.requireAuth()) return;
  YastaApp.initShell('logs');

  const user = YastaApp.getUser();
  if (user && user.role === 'reseller') {
    const usersLink = document.getElementById('nav-users-link');
    const settingsLink = document.getElementById('nav-settings-link');
    if (usersLink) usersLink.style.display = 'none';
    if (settingsLink) settingsLink.style.display = 'none';
  }

  loadLogs();

  document.getElementById('log-search-input').addEventListener('input', renderLogsTable);
  document.getElementById('log-action-filter').addEventListener('change', renderLogsTable);
  document.getElementById('refresh-logs-btn').addEventListener('click', loadLogs);
});

async function loadLogs() {
  const tbody = document.getElementById('logs-table-body');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 36px;">Streaming audit logs...</td></tr>`;

  try {
    const data = await YastaApp.apiFetch('/logs?limit=100');
    allLogs = data.logs || (Array.isArray(data) ? data : []);
    renderLogsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--accent-crimson); padding: 36px;">Failed to stream audit logs: ${YastaApp.escapeHtml(err.message)}</td></tr>`;
  }
}

function renderLogsTable() {
  const tbody = document.getElementById('logs-table-body');
  const query = document.getElementById('log-search-input').value.toLowerCase().trim();
  const filterAction = document.getElementById('log-action-filter').value;

  const filtered = allLogs.filter(log => {
    // Action filter
    const action = (log.action || '').toUpperCase();
    if (filterAction !== 'all') {
      if (!action.includes(filterAction)) return false;
    }

    // Search query
    if (query) {
      const matchAction = action.toLowerCase().includes(query);
      const matchActor = (log.performedBy || log.username || '').toLowerCase().includes(query);
      const matchIp = (log.ipAddress || log.ip || '').toLowerCase().includes(query);
      const matchTarget = (log.targetId || '').toLowerCase().includes(query);
      const matchDetails = typeof log.details === 'object' ? JSON.stringify(log.details).toLowerCase().includes(query) : (log.details || '').toLowerCase().includes(query);
      return matchAction || matchActor || matchIp || matchTarget || matchDetails;
    }

    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 36px;">No audit events matching current criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(log => {
    const action = log.action || 'EVENT';
    let badgeClass = 'badge-cyan';
    if (action.includes('BAN') || action.includes('DELETE') || action.includes('FAIL')) badgeClass = 'badge-crimson';
    else if (action.includes('CREATE') || action.includes('GENERATE') || action.includes('SUCCESS')) badgeClass = 'badge-emerald';
    else if (action.includes('LOGIN') || action.includes('AUTH')) badgeClass = 'badge-violet';

    let detailsPreview = '';
    if (typeof log.details === 'object') {
      detailsPreview = JSON.stringify(log.details);
    } else {
      detailsPreview = log.details || '-';
    }

    return `
      <tr>
        <td><span class="badge ${badgeClass}">${YastaApp.escapeHtml(action)}</span></td>
        <td><span style="font-weight: 600; color: #fff;">${YastaApp.escapeHtml(log.performedBy || log.username || 'System')}</span></td>
        <td><span class="mono" style="font-size: 0.84rem; color: var(--text-muted);">${YastaApp.escapeHtml(log.ipAddress || log.ip || '127.0.0.1')}</span></td>
        <td><span class="mono text-cyan" style="font-size: 0.84rem;">${YastaApp.escapeHtml(log.targetId || '-')}</span></td>
        <td style="font-size: 0.82rem; color: var(--text-dim);">${YastaApp.formatDate(log.timestamp || log.createdAt)}</td>
        <td style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.82rem; color: var(--text-muted);" title="${YastaApp.escapeHtml(detailsPreview)}">
          ${YastaApp.escapeHtml(detailsPreview)}
        </td>
      </tr>
    `;
  }).join('');
}
