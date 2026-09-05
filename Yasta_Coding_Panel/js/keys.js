/**
 * YASTA_CODING PANEL — KEYS MANAGEMENT CONTROLLER
 */

let allKeys = [];

document.addEventListener('DOMContentLoaded', () => {
  if (!YastaApp.requireAuth()) return;
  YastaApp.initShell('keys');

  const user = YastaApp.getUser();
  if (user && user.role === 'reseller') {
    const usersLink = document.getElementById('nav-users-link');
    const settingsLink = document.getElementById('nav-settings-link');
    if (usersLink) usersLink.style.display = 'none';
    if (settingsLink) settingsLink.style.display = 'none';
  }

  loadKeys();

  // Search and Filter Events
  document.getElementById('search-input').addEventListener('input', renderKeysTable);
  document.getElementById('status-filter').addEventListener('change', renderKeysTable);
  document.getElementById('refresh-keys-btn').addEventListener('click', loadKeys);

  // Modal triggers
  document.getElementById('open-gen-modal-btn').addEventListener('click', () => {
    YastaApp.openModal('gen-modal');
  });

  document.getElementById('export-keys-btn').addEventListener('click', () => {
    YastaApp.openModal('export-modal');
  });

  // Bulk Generator Form Submit
  document.getElementById('gen-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const count = parseInt(document.getElementById('modal-gen-count').value, 10) || 1;
    const prefix = document.getElementById('modal-gen-prefix').value.trim() || 'YASTA';
    const duration = parseInt(document.getElementById('modal-gen-duration').value, 10);
    const maxDevices = parseInt(document.getElementById('modal-gen-devices').value, 10) || 1;
    const note = document.getElementById('modal-gen-note').value.trim();

    const links = {
      modUrl: document.getElementById('modal-gen-mod-url').value.trim(),
      origUrl: document.getElementById('modal-gen-orig-url').value.trim(),
      originalFoldersZipUrl: document.getElementById('modal-gen-orig-zip').value.trim(),
      customFoldersZipUrl: document.getElementById('modal-gen-custom-zip').value.trim()
    };

    const submitBtn = document.getElementById('gen-modal-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Minting...';

    try {
      await YastaApp.apiFetch('/keys', {
        method: 'POST',
        body: JSON.stringify({
          count,
          prefix,
          duration,
          maxDevices,
          note,
          links
        })
      });

      YastaApp.showToast(`Successfully minted ${count} license key(s)!`, 'success');
      YastaApp.closeModal('gen-modal');
      document.getElementById('gen-modal-form').reset();
      loadKeys();
    } catch (err) {
      YastaApp.showToast(err.message || 'Key generation failed', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate Keys';
    }
  });

  // Link Attachments Form Submit
  document.getElementById('links-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyId = document.getElementById('links-key-id').value;
    const payload = {
      links: {
        modUrl: document.getElementById('edit-modUrl').value.trim(),
        origUrl: document.getElementById('edit-origUrl').value.trim(),
        originalFoldersZipUrl: document.getElementById('edit-originalFoldersZipUrl').value.trim(),
        customFoldersZipUrl: document.getElementById('edit-customFoldersZipUrl').value.trim()
      }
    };

    try {
      await YastaApp.apiFetch(`/keys/${encodeURIComponent(keyId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      YastaApp.showToast('Link attachments updated!', 'success');
      YastaApp.closeModal('links-modal');
      loadKeys();
    } catch (err) {
      YastaApp.showToast(err.message || 'Failed to update links', 'error');
    }
  });
});

async function loadKeys() {
  const tbody = document.getElementById('keys-table-body');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 36px;">Refreshing database...</td></tr>`;

  try {
    const data = await YastaApp.apiFetch('/keys');
    allKeys = data.keys || (Array.isArray(data) ? data : []);
    renderKeysTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--accent-crimson); padding: 36px;">Failed to load keys: ${YastaApp.escapeHtml(err.message)}</td></tr>`;
  }
}

function getFilteredKeys() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const statusFilter = document.getElementById('status-filter').value;

  return allKeys.filter(item => {
    // Status check
    const status = (item.status || 'unused').toLowerCase();
    if (statusFilter !== 'all' && status !== statusFilter) {
      return false;
    }

    // Search query check
    if (query) {
      const matchKey = item.key?.toLowerCase().includes(query);
      const matchNote = item.note?.toLowerCase().includes(query);
      const matchHwid = Array.isArray(item.hwid) 
        ? item.hwid.some(h => h?.toLowerCase().includes(query))
        : (item.hwid?.toLowerCase() || '').includes(query);
      return matchKey || matchNote || matchHwid;
    }

    return true;
  });
}

function renderKeysTable() {
  const tbody = document.getElementById('keys-table-body');
  const filtered = getFilteredKeys();

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 36px;">No keys match the selected criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    // Status badge
    let statusClass = 'badge-cyan';
    const status = item.status || (item.hwid ? 'active' : 'unused');
    if (status === 'active') statusClass = 'badge-emerald';
    else if (status === 'banned') statusClass = 'badge-crimson';
    else if (status === 'expired') statusClass = 'badge-amber';

    // HWID list
    const hwidList = Array.isArray(item.hwid) ? item.hwid : (item.hwid ? [item.hwid] : []);
    const deviceLimit = item.maxDevices || 1;
    const deviceCount = hwidList.length;

    // Links check
    const hasCustomLinks = item.links && (item.links.modUrl || item.links.origUrl || item.links.originalFoldersZipUrl || item.links.customFoldersZipUrl);

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="key-code">${YastaApp.escapeHtml(item.key)}</span>
            <button class="btn btn-secondary btn-sm btn-icon" title="Copy Key" onclick="copyText('${YastaApp.escapeHtml(item.key)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
          ${item.note ? `<div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;">Note: ${YastaApp.escapeHtml(item.note)}</div>` : ''}
        </td>
        <td>${YastaApp.formatDuration(item.duration)}</td>
        <td style="font-size: 0.84rem; color: var(--text-muted);">${YastaApp.formatDate(item.expiresAt)}</td>
        <td>
          <span style="font-size: 0.85rem; font-weight: 600;">${deviceCount} / ${deviceLimit} Devices</span>
          ${deviceCount > 0 ? `<div class="mono text-dim" style="font-size: 0.75rem;">${hwidList.map(h => h.substring(0, 10) + '...').join(', ')}</div>` : ''}
        </td>
        <td><span class="badge ${statusClass}">${status.toUpperCase()}</span></td>
        <td>
          <button class="badge ${hasCustomLinks ? 'badge-violet' : 'badge-cyan'}" style="cursor: pointer; border-style: dashed;" onclick="openLinksEditor('${YastaApp.escapeHtml(item.key)}')">
            ${hasCustomLinks ? 'Custom Links' : 'Default / None'}
          </button>
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" title="Reset HWID" onclick="resetKeyHwid('${YastaApp.escapeHtml(item.key)}')">
              HWID
            </button>
            <button class="btn btn-secondary btn-sm" title="Toggle Ban" onclick="toggleBanKey('${YastaApp.escapeHtml(item.key)}', '${status}')">
              ${status === 'banned' ? 'Unban' : 'Ban'}
            </button>
            <button class="btn btn-danger btn-sm" title="Delete Key" onclick="deleteKey('${YastaApp.escapeHtml(item.key)}')">
              &times;
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function copyText(text) {
  navigator.clipboard.writeText(text);
  YastaApp.showToast('Copied to clipboard!', 'success');
}

function openLinksEditor(keyStr) {
  const item = allKeys.find(k => k.key === keyStr);
  if (!item) return;

  document.getElementById('links-key-id').value = item.key;
  document.getElementById('links-key-display').textContent = item.key;

  const links = item.links || {};
  document.getElementById('edit-modUrl').value = links.modUrl || '';
  document.getElementById('edit-origUrl').value = links.origUrl || '';
  document.getElementById('edit-originalFoldersZipUrl').value = links.originalFoldersZipUrl || '';
  document.getElementById('edit-customFoldersZipUrl').value = links.customFoldersZipUrl || '';

  YastaApp.openModal('links-modal');
}

async function resetKeyHwid(keyStr) {
  if (!confirm(`Are you sure you want to reset hardware ID binding for key:\n${keyStr}?`)) {
    return;
  }

  try {
    await YastaApp.apiFetch(`/keys/${encodeURIComponent(keyStr)}/reset-hwid`, {
      method: 'POST'
    });
    YastaApp.showToast(`Hardware ID reset successfully!`, 'success');
    loadKeys();
  } catch (err) {
    YastaApp.showToast(err.message || 'HWID reset failed', 'error');
  }
}

async function toggleBanKey(keyStr, currentStatus) {
  const newStatus = currentStatus === 'banned' ? 'active' : 'banned';
  try {
    await YastaApp.apiFetch(`/keys/${encodeURIComponent(keyStr)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    YastaApp.showToast(`Key status changed to ${newStatus}`, 'success');
    loadKeys();
  } catch (err) {
    YastaApp.showToast(err.message || 'Status update failed', 'error');
  }
}

async function deleteKey(keyStr) {
  if (!confirm(`Permanently delete key:\n${keyStr}? This action cannot be undone.`)) {
    return;
  }

  try {
    await YastaApp.apiFetch(`/keys/${encodeURIComponent(keyStr)}`, {
      method: 'DELETE'
    });
    YastaApp.showToast('Key deleted', 'success');
    loadKeys();
  } catch (err) {
    YastaApp.showToast(err.message || 'Delete failed', 'error');
  }
}

function exportCurrentKeys(format) {
  const list = getFilteredKeys();
  if (!list.length) {
    YastaApp.showToast('No keys available to export', 'error');
    return;
  }

  let content = '';
  let filename = `yasta_keys_${Date.now()}`;
  let mimeType = 'text/plain';

  if (format === 'txt') {
    content = list.map(k => k.key).join('\n');
    filename += '.txt';
  } else if (format === 'csv') {
    content = 'Key,Duration,Status,Devices,ExpiresAt,Note\n' +
      list.map(k => `"${k.key}",${k.duration},"${k.status || 'unused'}",${Array.isArray(k.hwid) ? k.hwid.length : (k.hwid ? 1 : 0)},"${k.expiresAt || ''}","${k.note || ''}"`).join('\n');
    filename += '.csv';
    mimeType = 'text/csv';
  } else if (format === 'json') {
    content = JSON.stringify(list, null, 2);
    filename += '.json';
    mimeType = 'application/json';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  YastaApp.closeModal('export-modal');
  YastaApp.showToast(`Exported ${list.length} keys to ${filename}`, 'success');
}
