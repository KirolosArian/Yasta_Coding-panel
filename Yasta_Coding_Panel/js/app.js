/**
 * YASTA_CODING PANEL — CORE APP & API CLIENT
 * Handles JWT authentication, request interceptors, toast notifications, and UI state.
 */

const YastaApp = (function() {
  const API_BASE = '/api';
  const TOKEN_KEY = 'yasta_auth_token';
  const USER_KEY = 'yasta_auth_user';

  // Toast Notification System
  function showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        ${iconSvg}
        <span>${escapeHtml(message)}</span>
      </div>
      <button style="background:none; border:none; color:rgba(255,255,255,0.6); cursor:pointer; font-size:16px;" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  // Token & User Auth Management
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function getUser() {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function logout() {
    clearAuth();
    window.location.href = 'index.html';
  }

  // Auth Guard
  function requireAuth() {
    const token = getToken();
    const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
    if (!token && !isLoginPage) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  // API Fetch Helper with Auto Bearer Injection
  async function apiFetch(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (response.status === 401) {
        // Token expired or invalid
        clearAuth();
        if (!window.location.pathname.endsWith('index.html')) {
          window.location.href = 'index.html';
        }
        throw new Error('Authentication expired. Please log in again.');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data.error || data.message || `Request failed (${response.status})`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      throw err;
    }
  }

  // Formatters
  function formatDate(dateStr) {
    if (!dateStr) return 'Never / None';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDuration(days) {
    if (days === -1 || days === 0) return 'Lifetime';
    if (days === 1) return '1 Day';
    return `${days} Days`;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // Modal helpers
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  }

  // Initialize Common Shell Components (Sidebar, Topbar)
  function initShell(activePage) {
    const user = getUser();
    if (!user && !window.location.pathname.endsWith('index.html')) {
      logout();
      return;
    }

    // Set active link in sidebar
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      if (item.getAttribute('data-page') === activePage) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Populate user profile info
    const nameEl = document.getElementById('user-profile-name');
    const roleEl = document.getElementById('user-profile-role');
    const creditEl = document.getElementById('user-credit-count');

    if (nameEl && user) nameEl.textContent = user.username || 'Admin';
    if (roleEl && user) roleEl.textContent = (user.role || 'Administrator').toUpperCase();
    if (creditEl && user) {
      if (user.role === 'reseller') {
        creditEl.textContent = `${user.credits ?? 0} Credits`;
        creditEl.style.display = 'inline-flex';
      } else {
        creditEl.textContent = 'Unlimited (Admin)';
      }
    }

    // Mobile sidebar toggle
    const toggleBtn = document.getElementById('mobile-sidebar-toggle');
    const sidebar = document.querySelector('.app-sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }

    // Close modal when clicking backdrop
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
  }

  return {
    showToast,
    getToken,
    setAuth,
    getUser,
    clearAuth,
    logout,
    requireAuth,
    apiFetch,
    formatDate,
    formatDuration,
    escapeHtml,
    openModal,
    closeModal,
    initShell
  };
})();
