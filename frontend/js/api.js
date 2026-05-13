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
  toast.innerHTML = `
    <div>
      <div style="font-weight: 600; font-size: 0.9rem;">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
      <div style="font-size: 0.85rem; color: #64748b;">${message}</div>
    </div>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
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
window.logout = function() {
  console.log("Menjalankan proses logout...");
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  
  // Arahkan ke beranda
  window.location.href = '/index.html';
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
    if (auth.user.role === 'admin') window.location.href = '/dashboard-admin.html';
    else if (auth.user.role === 'kasir') window.location.href = '/dashboard-kasir.html';
    else window.location.href = '/dashboard-user.html';
    return null;
  }
  return auth.user;
}

function redirectIfAuthenticated() {
  const auth = getAuth();
  if (auth) {
    if (auth.user.role === 'admin') window.location.href = '/dashboard-admin.html';
    else if (auth.user.role === 'kasir') window.location.href = '/dashboard-kasir.html';
    else window.location.href = '/dashboard-user.html';
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
    if(auth.user.role === 'admin') dashboardLink = '/dashboard-admin.html';
    if(auth.user.role === 'kasir') dashboardLink = '/dashboard-kasir.html';
    
    // Nama User
    const span = document.createElement('span');
    span.style.cssText = "font-size: 0.9rem; margin-right: 1rem; color: #475569;";
    span.innerHTML = `Hi, <strong>${auth.user.nama_lengkap}</strong>`;
    
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
    // Pasang listener manual agar tidak diblokir browser
    btnLogout.addEventListener('click', () => {
        if(confirm('Apakah Anda yakin ingin keluar?')) {
            window.logout();
        }
    });

    authNav.appendChild(span);
    authNav.appendChild(aDash);
    authNav.appendChild(btnLogout);

  } else {
    // Tampilan jika belum login
    authNav.innerHTML = `
      <a href="/login.html" style="margin-right: 1.5rem; font-weight: 500;">Login</a>
      <a href="/register.html" class="btn btn-primary">Daftar</a>
    `;
  }
};