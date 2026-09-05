/**
 * YASTA_CODING PANEL — DASHBOARD CLIENT LOGIC
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!YastaApp.requireAuth()) return;
  YastaApp.initShell('dashboard');

  const user = YastaApp.getUser();
  if (user && user.role === 'reseller') {
    // Resellers don't have access to system settings or user management
    const usersLink = document.getElementById('nav-users-link');
    const settingsLink = document.getElementById('nav-settings-link');
    if (usersLink) usersLink.style.display = 'none';
    if (settingsLink) settingsLink.style.display = 'none';
  }

  loadStats();
  loadRecentLogs();
  setupQuickGenerator();
});

async function loadStats() {
  try {
    const data = await YastaApp.apiFetch('/system/stats');
    if (data) {
      document.getElementById('stat-total-keys').textContent = data.totalKeys ?? 0;
      document.getElementById('stat-active-keys').textContent = data.activeKeys ?? 0;
      document.getElementById('stat-banned-keys').textContent = (data.bannedKeys ?? 0) + (data.expiredKeys ?? 0);
      document.getElementById('stat-today-validations').textContent = data.todayValidations ?? (data.totalLogs ?? 0);
    }
  } catch (err) {
    console.warn('Could not load system stats:', err.message);
  }
}

async function loadRecentLogs() {
  const tbody = document.getElementById('recent-logs-table-body');
  try {
    const data = await YastaApp.apiFetch('/logs?limit=5');
    const logs = data.logs || (Array.isArray(data) ? data : []);

    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-dim); padding: 20px;">No recent security events recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(log => {
      let badgeClass = 'badge-cyan';
      if (log.action?.includes('BAN') || log.action?.includes('DELETE')) badgeClass = 'badge-crimson';
      if (log.action?.includes('GENERATE') || log.action?.includes('CREATE')) badgeClass = 'badge-emerald';
      if (log.action?.includes('LOGIN') || log.action?.includes('AUTH')) badgeClass = 'badge-violet';

      return `
        <tr>
          <td><span class="badge ${badgeClass}">${YastaApp.escapeHtml(log.action || 'EVENT')}</span></td>
          <td><span style="font-weight: 600;">${YastaApp.escapeHtml(log.performedBy || log.username || 'System')}</span></td>
          <td class="text-dim" style="font-size: 0.82rem;">${YastaApp.formatDate(log.timestamp || log.createdAt)}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--accent-crimson); padding: 20px;">Failed to stream live events.</td></tr>`;
  }
}

function setupQuickGenerator() {
  const form = document.getElementById('quick-generate-form');
  const genBtn = document.getElementById('q-gen-btn');
  const resultBox = document.getElementById('quick-result');
  const keyDisplay = document.getElementById('quick-key-display');
  const copyBtn = document.getElementById('copy-quick-key-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const duration = parseInt(document.getElementById('q-duration').value, 10);
    const prefix = document.getElementById('q-prefix').value.trim() || 'YASTA';
    const note = document.getElementById('q-note').value.trim();

    genBtn.disabled = true;
    genBtn.innerHTML = `<span>Minting Key...</span>`;

    try {
      const res = await YastaApp.apiFetch('/keys', {
        method: 'POST',
        body: JSON.stringify({
          count: 1,
          duration,
          prefix,
          note,
          maxDevices: 1
        })
      });

      const mintedKey = (res.keys && res.keys[0]) || res.key;
      if (mintedKey) {
        keyDisplay.textContent = typeof mintedKey === 'object' ? mintedKey.key : mintedKey;
        resultBox.style.display = 'block';
        YastaApp.showToast('License key successfully minted!', 'success');
        loadStats(); // refresh counts
      } else {
        throw new Error('Key was not returned by the API');
      }
    } catch (err) {
      YastaApp.showToast(err.message || 'Key generation failed', 'error');
    } finally {
      genBtn.disabled = false;
      genBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        <span>Generate Key</span>
      `;
    }
  });

  copyBtn.addEventListener('click', () => {
    const text = keyDisplay.textContent;
    if (text) {
      navigator.clipboard.writeText(text);
      YastaApp.showToast('Key copied to clipboard!', 'success');
    }
  });
}
