/**
 * YASTA_CODING PANEL — USER MANAGEMENT CONTROLLER
 */

let allUsers = [];

document.addEventListener('DOMContentLoaded', () => {
  if (!YastaApp.requireAuth()) return;
  YastaApp.initShell('manage-user');

  const currentUser = YastaApp.getUser();
  if (currentUser && currentUser.role === 'reseller') {
    YastaApp.showToast('Access restricted to Administrators.', 'error');
    window.location.href = 'dashboard.html';
    return;
  }

  loadUsers();

  document.getElementById('open-user-modal-btn').addEventListener('click', () => {
    YastaApp.openModal('user-modal');
  });

  // Create User
  document.getElementById('user-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const role = document.getElementById('new-role').value;
    const credits = parseInt(document.getElementById('new-credits').value, 10) || 0;

    const submitBtn = document.getElementById('new-user-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
      await YastaApp.apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role, credits })
      });

      YastaApp.showToast(`User ${username} created successfully!`, 'success');
      YastaApp.closeModal('user-modal');
      document.getElementById('user-modal-form').reset();
      loadUsers();
    } catch (err) {
      YastaApp.showToast(err.message || 'Failed to create user', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create User';
    }
  });

  // Add / Adjust Credits
  document.getElementById('credit-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('credit-username').value;
    const amount = parseInt(document.getElementById('credit-amount').value, 10);

    if (isNaN(amount) || amount === 0) {
      YastaApp.showToast('Please specify a non-zero credit amount', 'error');
      return;
    }

    try {
      await YastaApp.apiFetch(`/users/${encodeURIComponent(username)}/credits`, {
        method: 'POST',
        body: JSON.stringify({ amount })
      });

      YastaApp.showToast(`Updated credits for ${username}`, 'success');
      YastaApp.closeModal('credit-modal');
      loadUsers();
    } catch (err) {
      YastaApp.showToast(err.message || 'Credit adjustment failed', 'error');
    }
  });
});

async function loadUsers() {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 36px;">Loading users...</td></tr>`;

  try {
    const data = await YastaApp.apiFetch('/users');
    allUsers = data.users || (Array.isArray(data) ? data : []);
    renderUsersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--accent-crimson); padding: 36px;">Failed to load users: ${YastaApp.escapeHtml(err.message)}</td></tr>`;
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!allUsers.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 36px;">No users found in database.</td></tr>`;
    return;
  }

  tbody.innerHTML = allUsers.map(user => {
    const isBanned = user.isBanned || user.status === 'banned';
    const roleClass = user.role === 'admin' ? 'badge-cyan' : 'badge-violet';

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: #fff;">${YastaApp.escapeHtml(user.username)}</div>
        </td>
        <td>
          <span class="badge ${roleClass}">${YastaApp.escapeHtml((user.role || 'reseller').toUpperCase())}</span>
        </td>
        <td>
          <span style="font-weight: 700; color: var(--accent-emerald);">
            ${user.role === 'admin' ? 'Unlimited' : (user.credits ?? 0)}
          </span>
        </td>
        <td>
          <span style="font-size: 0.9rem;">${user.keysCount ?? user.keysGenerated ?? 0}</span>
        </td>
        <td>
          <span class="badge ${isBanned ? 'badge-crimson' : 'badge-emerald'}">
            ${isBanned ? 'BANNED' : 'ACTIVE'}
          </span>
        </td>
        <td style="font-size: 0.82rem; color: var(--text-muted);">${YastaApp.formatDate(user.createdAt)}</td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            ${user.role === 'reseller' ? `
              <button class="btn btn-secondary btn-sm" onclick="openCreditModal('${YastaApp.escapeHtml(user.username)}')">
                Credits
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" onclick="toggleBanUser('${YastaApp.escapeHtml(user.username)}', ${isBanned})">
              ${isBanned ? 'Unban' : 'Ban'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteUser('${YastaApp.escapeHtml(user.username)}')">
              &times;
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openCreditModal(username) {
  document.getElementById('credit-username').value = username;
  document.getElementById('credit-target-display').textContent = username;
  document.getElementById('credit-amount').value = '';
  YastaApp.openModal('credit-modal');
}

async function toggleBanUser(username, isCurrentlyBanned) {
  try {
    await YastaApp.apiFetch(`/users/${encodeURIComponent(username)}/ban`, {
      method: 'POST',
      body: JSON.stringify({ banned: !isCurrentlyBanned })
    });
    YastaApp.showToast(`User status updated`, 'success');
    loadUsers();
  } catch (err) {
    YastaApp.showToast(err.message || 'Status update failed', 'error');
  }
}

async function deleteUser(username) {
  if (!confirm(`Delete operator account ${username}? This cannot be undone.`)) {
    return;
  }

  try {
    await YastaApp.apiFetch(`/users/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    });
    YastaApp.showToast(`User deleted`, 'success');
    loadUsers();
  } catch (err) {
    YastaApp.showToast(err.message || 'Delete failed', 'error');
  }
}
