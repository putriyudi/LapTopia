/* frontend/js/api.js */
const BASE_URL = '/api'; 
let currentUser = null;

// --- Helper UI Functions ---

function showLoader() {
  const loader = document.getElementById('global-loader');
  if (loader) loader.classList.add('active');
}

function hideLoader() {
  const loader = document.getElementById('global-loader');
  if (loader) loader.classList.remove('active');
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const title = document.createElement('div');
  title.style.cssText = 'font-weight: 700; font-size: 0.9rem; color: #0f172a; margin-bottom: 0.15rem;';
  title.textContent = type === 'success' ? 'Berhasil' : type === 'error' ? 'Gagal' : type === 'warning' ? 'Perhatian' : 'Info';

  const body = document.createElement('div');
  body.style.cssText = 'font-size: 0.85rem; color: #64748b; white-space: pre-line;';
  body.textContent = String(message || '');

  toast.appendChild(title);
  toast.appendChild(body);
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(12px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- Core API Call Function ---

async function apiCall(endpoint, method = 'GET', body = null, isFormData = false) {
  const token = localStorage.getItem('token');
  const headers = {};
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!isFormData && body) {
    headers['Content-Type'] = 'application/json';
  }
  const options = {
    method,
    headers
  };
  if (body) {
    options.body = isFormData ? body : JSON.stringify(body);
  }
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    
    // Auto logout jika token expired (401)
    if (response.status === 401 && !endpoint.includes('/login')) {
      window.logout();
      return null;
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
       const data = await response.json();
       return { status: response.status, data };
    } else if (contentType && contentType.indexOf("application/pdf") !== -1) {
        const blob = await response.blob();
        return { status: response.status, data: blob, isFile: true };
    } else {
        return { status: response.status, data: await response.text() };
    }
  } catch (error) {
    console.error('API Error:', error);
    showToast('Terjadi kesalahan koneksi server.', 'error');
    return { status: 500, data: { success: false, message: 'Network error' } };
  }
}

// --- Auth Functions ---

function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  currentUser = user;
}

/**
 * Logout Global: Menghapus sesi dan membersihkan storage
 */
window.logout = function(skipConfirm = false) {
  const performLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    
    if (typeof showToast === 'function') {
      showToast('Berhasil keluar. Sampai jumpa!', 'success');
    }
    
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 1000);
  };

  if (skipConfirm) {
    performLogout();
  } else {
    showConfirm(
      'Konfirmasi Logout',
      'Apakah Anda yakin ingin keluar dari LapTopia?',
      'Ya, Keluar',
      'Batal',
      performLogout
    );
  }
};

function getAuth() {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  if (token && userStr) {
    try {
      currentUser = JSON.parse(userStr);
      return { token, user: currentUser };
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Middleware: Route Guards
function requireAuth(allowedRoles = []) {
  const auth = getAuth();
  if (!auth) {
    window.location.href = '/login.html';
    return null;
  }
  
  if (allowedRoles.length > 0 && !allowedRoles.includes(auth.user.role)) {
    if (auth.user.role === 'admin') window.location.href = '/admin/';
    else if (auth.user.role === 'kasir') window.location.href = '/kasir/';
    else window.location.href = '/index.html';
    return null;
  }
  return auth.user;
}

function redirectIfAuthenticated() {
  const auth = getAuth();
  if (auth) {
    if (auth.user.role === 'admin') window.location.href = '/admin/';
    else if (auth.user.role === 'kasir') window.location.href = '/kasir/';
    else window.location.href = '/index.html';
  }
}

// --- Utils ---

function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number);
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatJustDate(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
}

// --- Initial Setup & Navbar Auth ---

document.addEventListener('DOMContentLoaded', () => {
  getAuth();
  
  // Buat loader global jika belum ada
  if (!document.getElementById('global-loader')) {
    const loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loader);
  }
  
  // Update tampilan navbar (Login/Logout)
  window.updateNavbarAuth();
});

/**
 * Custom Confirmation Modal
 */
function showConfirm(title, message, okText, cancelText, onConfirm) {
  let modal = document.getElementById('global-confirm-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'global-confirm-modal';
    modal.className = 'toast-container'; // Reuse toast-container for centering
    modal.style.cssText = 'display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:20000; justify-content:center; align-items:center;';
    modal.innerHTML = `
      <div class="card" style="width: 320px; padding: 2rem; text-align: center; border-radius: 16px;">
        <div style="font-size: 1.5rem; margin-bottom: 1rem;">ℹ️</div>
        <h3 id="confirm-title" style="font-size: 1.1rem; margin-bottom: 0.5rem;"></h3>
        <p id="confirm-msg" style="font-size: 0.85rem; color: #64748b; margin-bottom: 1.5rem;"></p>
        <div style="display: flex; gap: 0.5rem;">
          <button id="confirm-cancel" class="btn btn-outline" style="flex: 1"></button>
          <button id="confirm-ok" class="btn btn-primary" style="flex: 1"></button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('confirm-title').innerText = title;
  document.getElementById('confirm-msg').innerText = message;
  document.getElementById('confirm-ok').innerText = okText;
  document.getElementById('confirm-cancel').innerText = cancelText;

  modal.style.display = 'flex';

  document.getElementById('confirm-ok').onclick = () => {
    modal.style.display = 'none';
    if (onConfirm) onConfirm();
  };
  document.getElementById('confirm-cancel').onclick = () => {
    modal.style.display = 'none';
  };
}

/**
 * Memperbarui tampilan navbar secara dinamis berdasarkan status login.
 * Menggunakan Event Listener untuk mencegah error CSP (Content Security Policy).
 */
window.updateNavbarAuth = function() {
  const authNav = document.getElementById('auth-nav');
  if (!authNav) return;
  
  const auth = getAuth();
  authNav.innerHTML = ''; // Bersihkan navbar

  if (auth) {
    let dashboardLink = '/dashboard-user.html';
    if(auth.user.role === 'admin') dashboardLink = '/admin/';
    if(auth.user.role === 'kasir') dashboardLink = '/kasir/';
    
    // Nama User
    const span = document.createElement('span');
    span.className = 'navbar-user-chip';
    span.style.cssText = "font-size: 0.9rem; margin-right: 1rem; color: #475569;";
    span.textContent = `Hi, ${auth.user.username || auth.user.nama_lengkap || 'User'}`;
    
    // Link Dashboard
    const aDash = document.createElement('a');
    aDash.href = dashboardLink;
    aDash.className = "btn btn-outline";
    aDash.style.marginRight = "0.5rem";
    aDash.innerText = "Dashboard";

    // Tombol Logout
    const btnLogout = document.createElement('button');
    btnLogout.className = "btn btn-primary";
    btnLogout.innerText = "Logout";
    btnLogout.addEventListener('click', () => {
        showToast("Mengeluarkan akun...", "info");
        setTimeout(() => {
            window.logout(true); // Kirim true untuk skip confirm internal
        }, 1000);
    });

    authNav.appendChild(span);
    authNav.appendChild(aDash);
    authNav.appendChild(btnLogout);

  } else {
    // Tampilan jika belum login
    const login = document.createElement('a');
    login.href = '/login.html';
    login.className = 'nav-auth-link';
    login.textContent = 'Login';

    const register = document.createElement('a');
    register.href = '/register.html';
    register.className = 'btn btn-primary';
    register.textContent = 'Daftar';
    register.style.color = '#ffffff';

    authNav.appendChild(login);
    authNav.appendChild(register);
  }
};

// Backward-compatible alias untuk file lama yang masih memanggil updateAuthNav().
window.updateAuthNav = window.updateNavbarAuth;
