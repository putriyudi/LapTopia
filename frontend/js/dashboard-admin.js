// frontend/js/dashboard-admin.js
document.addEventListener('DOMContentLoaded', () => {
  const auth = requireAuth(['admin']);
  if (!auth) return;
  document.getElementById('adminName').innerText = `Admin: ${auth.nama_lengkap}`;
  loadStats();
  
  // Add event listeners for sidebar links
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const text = link.innerText.trim();
      let tabId = '';
      if (text === 'Statistik') tabId = 'stats';
      else if (text === 'Kelola Laptop') tabId = 'laptops';
      else if (text === 'Kelola User') tabId = 'users';
      else if (text === 'Laporan Transaksi') tabId = 'laporan';
      else if (text === 'Lihat Website' || text === 'Logout') return;
      
      if (tabId) switchTab(tabId, link);
    });
  });
});

function switchTab(tabId, linkElement) {
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  if (linkElement) linkElement.classList.add('active');
  document.getElementById(`tab-${tabId}`).style.display = 'block';
  
  const titles = {
    'stats': 'Statistik Dashboard',
    'laptops': 'Manajemen Laptop',
    'users': 'Manajemen Pengguna',
    'laporan': 'Laporan Keseluruhan Transaksi'
  };
  document.getElementById('pageTitle').innerText = titles[tabId];
  if(tabId === 'stats') loadStats();
  if(tabId === 'laptops') loadLaptops();
  if(tabId === 'users') loadUsers();
  if(tabId === 'laporan') loadLaporan();
}

async function loadStats() {
  showLoader();
  const res = await apiCall('/admin/stats');
  hideLoader();
  if (res && res.status === 200) {
    const d = res.data.data;
    document.getElementById('st_pendapatan').innerText = formatRupiah(d.trxStats.total_pendapatan || 0);
    document.getElementById('st_trx_aktif').innerText = d.trxStats.aktif || 0;
    document.getElementById('st_lap_sewa').innerText = d.laptopStats.disewa || 0;
    document.getElementById('st_users').innerText = d.userStats.total || 0;
  }
}

async function loadLaptops() {
  showLoader();
  const res = await apiCall('/laptops?limit=50');
  hideLoader();
  const tb = document.getElementById('lapTable');
  tb.innerHTML = '';
  if(res && res.status === 200) {
    res.data.data.forEach(l => {
      tb.innerHTML += `<tr><td>${l.nomor_seri}</td><td>${l.merk_tipe}</td><td>${formatRupiah(l.harga_sewa_per_hari)}</td><td>${l.status}</td></tr>`;
    });
  }
}

async function loadUsers() {
  showLoader();
  const res = await apiCall('/admin/users');
  hideLoader();
  const tb = document.getElementById('usrTable');
  tb.innerHTML = '';
  if(res && res.status === 200) {
    res.data.data.forEach(u => {
      tb.innerHTML += `<tr><td>${u.id_user}</td><td>${u.nama_lengkap}</td><td>${u.email}</td><td><span class="badge badge-secondary">${u.role}</span></td><td>${formatJustDate(u.created_at)}</td></tr>`;
    });
  }
}

async function loadLaporan() {
  showLoader();
  const res = await apiCall('/admin/transaksi');
  hideLoader();
  const tb = document.getElementById('lapTrxTable');
  tb.innerHTML = '';
  if(res && res.status === 200) {
    res.data.data.forEach(t => {
      tb.innerHTML += `<tr><td>#${t.id_transaksi}</td><td>${t.nama_penyewa}</td><td>${t.merk_tipe}</td><td>${formatRupiah(t.total_biaya)}</td><td>${t.status_transaksi}</td><td>${formatJustDate(t.created_at)}</td></tr>`;
    });
  }
}
