// frontend/js/register.js
document.addEventListener('DOMContentLoaded', () => {
  redirectIfAuthenticated();
  
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const form = document.getElementById('registerForm');
    const formData = new FormData(form);
    
    showLoader();
    const res = await apiCall('/auth/register', 'POST', formData, true);
    hideLoader();
    
    console.log('Register response:', res);
    
    if (res.status === 201) {
      showToast('Registrasi berhasil! Silakan login.', 'success');
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 2000);
    } else {
      if (res.data.errors && res.data.errors.length > 0) {
        // Tampilkan semua validation errors
        const errorMsg = res.data.errors.map(e => e.msg).join('\n');
        console.error('Validation errors:', errorMsg);
        showToast(errorMsg, 'error');
      } else {
        const errorMsg = res.data.message || 'Gagal registrasi. Cek console untuk detail.';
        console.error('Register error:', res.data);
        showToast(errorMsg, 'error');
      }
    }
  });
});
