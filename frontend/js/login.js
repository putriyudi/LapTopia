// frontend/js/login.js
document.addEventListener('DOMContentLoaded', () => {
  redirectIfAuthenticated();
  
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    showLoader();
    const res = await apiCall('/auth/login', 'POST', { email, password });
    hideLoader();
    
    if (res.status === 200 && res.data.success) {
      setAuth(res.data.token, res.data.user);
      showToast('Login berhasil!', 'success');
      setTimeout(() => {
        if (res.data.user.role === 'admin') window.location.href = '/admin/';
        else if (res.data.user.role === 'kasir') window.location.href = '/kasir/';
        else window.location.href = '/index.html';
      }, 1500);
    } else {
      showToast(res.data.message || 'Login gagal', 'error');
    }
  });
});
