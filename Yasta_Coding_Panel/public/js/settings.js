/**
 * YASTA_CODING PANEL — SYSTEM SETTINGS CONTROLLER
 */

document.addEventListener('DOMContentLoaded', () => {
  if (!YastaApp.requireAuth()) return;
  YastaApp.initShell('settings');

  const user = YastaApp.getUser();
  if (user && user.role === 'reseller') {
    YastaApp.showToast('Access restricted to Administrators.', 'error');
    window.location.href = 'dashboard.html';
    return;
  }

  loadSettings();

  // Maintenance switch listener for live warning
  const maintenanceSwitch = document.getElementById('setting-maintenance');
  const banner = document.getElementById('maintenance-banner');
  maintenanceSwitch.addEventListener('change', () => {
    banner.style.display = maintenanceSwitch.checked ? 'block' : 'none';
  });

  // Save Settings Button
  document.getElementById('save-all-settings-btn').addEventListener('click', saveSettings);

  // Test Webhook Button
  document.getElementById('test-webhook-btn').addEventListener('click', testDiscordWebhook);

  // Change Password Form
  document.getElementById('change-pass-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password-val').value;

    try {
      await YastaApp.apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      YastaApp.showToast('Password updated successfully!', 'success');
      document.getElementById('change-pass-form').reset();
    } catch (err) {
      YastaApp.showToast(err.message || 'Password update failed', 'error');
    }
  });
});

async function loadSettings() {
  try {
    const data = await YastaApp.apiFetch('/system/settings');
    if (data) {
      const maintenance = !!data.maintenanceMode;
      document.getElementById('setting-maintenance').checked = maintenance;
      document.getElementById('maintenance-banner').style.display = maintenance ? 'block' : 'none';

      document.getElementById('setting-min-version').value = data.minClientVersion || '';
      document.getElementById('setting-announcement').value = data.announcement || '';
      document.getElementById('setting-webhook-url').value = data.discordWebhookUrl || '';

      const links = data.defaultLinks || {};
      document.getElementById('setting-default-mod').value = links.modUrl || data.defaultModUrl || '';
      document.getElementById('setting-default-orig').value = links.origUrl || data.defaultOrigUrl || '';
      document.getElementById('setting-default-orig-zip').value = links.originalFoldersZipUrl || data.defaultOriginalFoldersZipUrl || '';
      document.getElementById('setting-default-custom-zip').value = links.customFoldersZipUrl || data.defaultCustomFoldersZipUrl || '';
    }
  } catch (err) {
    console.warn('Could not load current settings:', err.message);
  }
}

async function saveSettings() {
  const saveBtn = document.getElementById('save-all-settings-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  const payload = {
    maintenanceMode: document.getElementById('setting-maintenance').checked,
    minClientVersion: document.getElementById('setting-min-version').value.trim(),
    announcement: document.getElementById('setting-announcement').value.trim(),
    discordWebhookUrl: document.getElementById('setting-webhook-url').value.trim(),
    defaultLinks: {
      modUrl: document.getElementById('setting-default-mod').value.trim(),
      origUrl: document.getElementById('setting-default-orig').value.trim(),
      originalFoldersZipUrl: document.getElementById('setting-default-orig-zip').value.trim(),
      customFoldersZipUrl: document.getElementById('setting-default-custom-zip').value.trim()
    }
  };

  try {
    await YastaApp.apiFetch('/system/settings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    YastaApp.showToast('System configuration saved successfully!', 'success');
  } catch (err) {
    YastaApp.showToast(err.message || 'Failed to save settings', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      <span>Save Settings</span>
    `;
  }
}

async function testDiscordWebhook() {
  const url = document.getElementById('setting-webhook-url').value.trim();
  if (!url) {
    YastaApp.showToast('Please enter a Discord Webhook URL first.', 'error');
    return;
  }

  const btn = document.getElementById('test-webhook-btn');
  btn.disabled = true;
  btn.textContent = 'Sending Ping...';

  try {
    await YastaApp.apiFetch('/system/test-webhook', {
      method: 'POST',
      body: JSON.stringify({ webhookUrl: url })
    });
    YastaApp.showToast('Discord ping successfully dispatched!', 'success');
  } catch (err) {
    YastaApp.showToast(err.message || 'Discord ping failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
      <span>Send Test Ping</span>
    `;
  }
}
