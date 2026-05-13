/* frontend/js/api.js */
const BASE_URL = '/api'; // Karena serve statis dari server yang sama
let currentUser = null;
// Helper: Tampilkan/Sembunyikan Loader
function showLoader() {
  const loader = document.getElementById('global-loader');
  if (loader) loader.classList.add('active');
}
function hideLoader() {
  const loader = document.getElementById('global-loader');
  if (loader) loader.classList.remove('active');
}
// Helper: Toast Notification
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
// Core API Call Function
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
    
    // Auto logout if unauthorized (token expired/invalid)
    if (response.status === 401 && !endpoint.includes('/login')) {
      logout();
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
// Auth Functions
function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  currentUser = user;
}
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  window.location.href = '/index.html';
}
function getAuth() {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  if (token && userStr) {
    currentUser = JSON.parse(userStr);
    return { token, user: currentUser };
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
    // Redirect based on role
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
// Format Rupiah
function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number);
}
// Format Date
function formatDate(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatJustDate(dateString) {
    if (!dateString) return '-';
    const d = new Date(dateString);
    return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric'});
}
// Initial setup on load
document.addEventListener('DOMContentLoaded', () => {
  getAuth();
  // Insert global loader if not exists
  if (!document.getElementById('global-loader')) {
    const loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loader);
  }
  
  // Setup Navbar dynamic based on auth
  updateNavbarAuth();
});
function updateNavbarAuth() {
  const authNav = document.getElementById('auth-nav');
  if (!authNav) return;
  
  const auth = getAuth();
  if (auth) {
    let dashboardLink = '/dashboard-user.html';
    if(auth.user.role === 'admin') dashboardLink = '/dashboard-admin.html';
    if(auth.user.role === 'kasir') dashboardLink = '/dashboard-kasir.html';
    
    authNav.innerHTML = `
      <span style="font-size: 0.9rem; margin-right: 1rem; color: var(--secondary-color);">Hi, <strong>${auth.user.nama_lengkap}</strong></span>
      <a href="${dashboardLink}" class="btn btn-outline" style="margin-right: 0.5rem;">Dashboard</a>
      <button onclick="logout()" class="btn btn-primary">Logout</button>
    `;
  } else {
    authNav.innerHTML = `
      <a href="/login.html" style="margin-right: 1.5rem; font-weight: 500;">Login</a>
      <a href="/register.html" class="btn btn-primary">Daftar</a>
    `;
  }
}