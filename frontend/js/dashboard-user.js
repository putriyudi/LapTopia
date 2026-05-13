// frontend/js/dashboard-user.js
document.addEventListener('DOMContentLoaded', () => {
  const auth = requireAuth(['user']);
  if (!auth) return;
  document.getElementById('userGreeting').innerText = `Halo, ${auth.nama_lengkap}`;
  loadRiwayat();
  loadProfileData();
  // Setup profile form listener
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = document.getElementById('profileForm');
    const formData = new FormData(form);
    
    // Remove empty file so backend doesn't complain if not updating
    if (formData.get('foto_ktp').size === 0) {
      formData.delete('foto_ktp');
    }
    showLoader();
    const res = await apiCall('/auth/profile', 'PUT', formData, true);
    hideLoader();
    
    if (res && res.status === 200) {
      showToast('Profil berhasil diupdate.', 'success');
    } else {
      showToast('Gagal update profil.', 'error');
    }
  });
});

function switchTab(tabId) {
  document.getElementById('tab-riwayat').style.display = 'none';
  document.getElementById('tab-profil').style.display = 'none';
  
  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(`tab-${tabId}`).style.display = 'block';
  
  if(tabId === 'riwayat') {
    document.getElementById('pageTitle').innerText = 'Riwayat Sewa';
    loadRiwayat();
  } else {
    document.getElementById('pageTitle').innerText = 'Profil Saya';
  }
}

async function loadRiwayat() {
  const res = await apiCall('/transaksi/riwayat');
  const tbody = document.getElementById('riwayatTable');
  tbody.innerHTML = '';
  
  if (res && res.status === 200) {
    if (res.data.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">Belum ada riwayat sewa.</td></tr>`;
      return;
    }
    res.data.data.forEach(trx => {
      let paymentBadge = `<span class="badge badge-warning">Pending</span>`;
      if(trx.payment_status === 'paid') paymentBadge = `<span class="badge badge-success">Lunas</span>`;
      else if(trx.payment_status === 'failed') paymentBadge = `<span class="badge badge-danger">Gagal</span>`;
      let statusBadge = `<span class="badge badge-secondary">${trx.status_transaksi}</span>`;
      if(trx.status_transaksi === 'Aktif') statusBadge = `<span class="badge badge-primary">Aktif</span>`;
      else if(trx.status_transaksi === 'Selesai') statusBadge = `<span class="badge badge-success">Selesai</span>`;
      else if(trx.status_transaksi === 'Terlambat') statusBadge = `<span class="badge badge-danger">Terlambat</span>`;
      let contractAction = '-';
      // User tidak bisa download dari /files/kontrak secara langsung (protected kasir/admin),
      // tapi jika sistem butuh user download kontrak, harusnya ada route khusus user. 
      // Di backend, route '/files/kontrak/:filename' hanya untuk `verifyToken, isKasir`.
      // Oleh karena itu, user saat ini tidak bisa download secara API. 
      // Kita tampilkan status "Sudah Digenerate" saja atau minta admin di UI.
      if (trx.digital_hash) {
        contractAction = `<span style="font-size:0.8rem; color:var(--success);">Tersedia (Hash: ${trx.digital_hash.substring(0,8)}...)</span>`;
      }
      tbody.innerHTML += `
        <tr>
          <td>#${trx.id_transaksi}</td>
          <td>
            <div style="font-weight:600;">${trx.merk_tipe}</div>
            <div style="font-size:0.8rem; color:var(--text-muted)">Total: ${formatRupiah(trx.total_biaya)}</div>
          </td>
          <td>${formatDate(trx.tgl_mulai_sewa)}</td>
          <td>${trx.durasi_hari} Hari</td>
          <td>${paymentBadge}</td>
          <td>${statusBadge}</td>
          <td>${contractAction}</td>
        </tr>
      `;
    });
  }
}

async function loadProfileData() {
  const res = await apiCall('/auth/profile');
  if (res && res.status === 200) {
    const u = res.data.data;
    document.getElementById('prof_nama').value = u.nama_lengkap;
    document.getElementById('prof_hp').value = u.no_hp;
    document.getElementById('prof_alamat').value = u.alamat || '';
  }
}
