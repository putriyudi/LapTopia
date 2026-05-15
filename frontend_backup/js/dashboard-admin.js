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
      else if (text === 'Laporan Keamanan') tabId = 'keamanan';
      else if (text === 'Lihat Website' || text === 'Logout') return;
      
      if (tabId) switchTab(tabId, link);
    });
  });
  
  const btnTambah = document.getElementById('btnTambahLaptop');
  if(btnTambah) {
    btnTambah.addEventListener('click', () => {
      document.getElementById('modalLaptopTitle').innerText = 'Tambah Laptop';
      document.getElementById('lap_id').value = '';
      document.getElementById('lap_sn').value = '';
      document.getElementById('lap_merk').value = '';
      document.getElementById('lap_spek').value = '';
      document.getElementById('lap_harga').value = '';
      document.getElementById('lap_status').value = 'Tersedia';
      document.getElementById('modalLaptop').style.display = 'flex';
    });
  }
});

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function switchTab(tabId, linkElement) {
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  if (linkElement) linkElement.classList.add('active');
  const target = document.getElementById(`tab-${tabId}`);
  if(target) target.style.display = 'block';
  
  const titles = {
    'stats': 'Statistik Dashboard',
    'laptops': 'Manajemen Laptop',
    'users': 'Manajemen Pengguna',
    'laporan': 'Laporan Keseluruhan Transaksi',
    'keamanan': 'Laporan Keamanan'
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
      tb.innerHTML += `<tr>
        <td>${l.nomor_seri}</td>
        <td>${l.merk_tipe}</td>
        <td>${formatRupiah(l.harga_sewa_per_hari)}</td>
        <td>${l.status}</td>
        <td>
          <button class="btn btn-outline" style="padding:0.2rem 0.5rem;font-size:0.8rem;" onclick="editLaptop(${l.id_laptop}, '${l.nomor_seri}', '${l.merk_tipe}', '${l.spesifikasi || ''}', ${l.harga_sewa_per_hari}, '${l.status}')">Edit</button>
          <button class="btn" style="padding:0.2rem 0.5rem;font-size:0.8rem;background:var(--error);color:white;border-color:var(--error);" onclick="deleteLaptop(${l.id_laptop})">Hapus</button>
        </td>
      </tr>`;
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
      tb.innerHTML += `<tr>
        <td>${u.id_user}</td>
        <td>${u.nama_lengkap}</td>
        <td>${u.email}</td>
        <td><span class="badge badge-secondary">${u.role}</span></td>
        <td>${formatJustDate(u.created_at)}</td>
        <td>
          <button class="btn btn-outline" style="padding:0.2rem 0.5rem;font-size:0.8rem;" onclick="editUserRole(${u.id_user}, '${u.role}')">Ubah Role</button>
          <button class="btn" style="padding:0.2rem 0.5rem;font-size:0.8rem;background:var(--error);color:white;border-color:var(--error);" onclick="deleteUser(${u.id_user})">Hapus</button>
        </td>
      </tr>`;
    });
  }
}

async function loadLaporan() {
  const dari = document.getElementById('filter_dari')?.value || '';
  const sampai = document.getElementById('filter_sampai')?.value || '';
  const status = document.getElementById('filter_status')?.value || '';
  
  let q = [];
  if (dari) q.push(`dari=${dari}`);
  if (sampai) q.push(`sampai=${sampai}`);
  if (status) q.push(`status=${status}`);
  
  const qs = q.length ? '?' + q.join('&') : '';
  
  showLoader();
  const res = await apiCall('/admin/laporan' + qs);
  hideLoader();
  const tb = document.getElementById('lapTrxTable');
  tb.innerHTML = '';
  if(res && res.status === 200) {
    res.data.data.forEach(t => {
      tb.innerHTML += `<tr><td>#${t.id_transaksi}</td><td>${t.nama_penyewa}</td><td>${t.merk_tipe}</td><td>${formatRupiah(t.total_biaya)}</td><td>${t.status_transaksi}</td><td>${formatJustDate(t.created_at)}</td></tr>`;
    });
  }
}

// Laptops Logic
async function submitLaptop() {
  const id = document.getElementById('lap_id').value;
  const data = {
    nomor_seri: document.getElementById('lap_sn').value,
    merk_tipe: document.getElementById('lap_merk').value,
    spesifikasi: document.getElementById('lap_spek').value,
    harga_sewa_per_hari: document.getElementById('lap_harga').value,
    status: document.getElementById('lap_status').value
  };
  showLoader();
  const res = await apiCall(id ? `/laptops/${id}` : '/laptops', id ? 'PUT' : 'POST', data);
  hideLoader();
  if (res && (res.status === 200 || res.status === 201)) {
    showToast(`Laptop berhasil ${id ? 'diupdate' : 'ditambahkan'}.`, 'success');
    closeModal('modalLaptop');
    loadLaptops();
  } else {
    showToast(res?.data?.message || 'Gagal menyimpan laptop', 'error');
  }
}

function editLaptop(id, sn, merk, spek, harga, status) {
  document.getElementById('modalLaptopTitle').innerText = 'Edit Laptop';
  document.getElementById('lap_id').value = id;
  document.getElementById('lap_sn').value = sn;
  document.getElementById('lap_merk').value = merk;
  document.getElementById('lap_spek').value = spek || '';
  document.getElementById('lap_harga').value = harga;
  document.getElementById('lap_status').value = status;
  document.getElementById('modalLaptop').style.display = 'flex';
}

async function deleteLaptop(id) {
  if (!confirm('Yakin ingin menghapus laptop ini?')) return;
  showLoader();
  const res = await apiCall(`/laptops/${id}`, 'DELETE');
  hideLoader();
  if (res && res.status === 200) {
    showToast('Laptop dihapus.', 'success');
    loadLaptops();
  } else {
    showToast(res?.data?.message || 'Gagal menghapus.', 'error');
  }
}

// Users Logic
function editUserRole(id, currentRole) {
  document.getElementById('usr_id').value = id;
  document.getElementById('usr_role').value = currentRole;
  document.getElementById('modalUser').style.display = 'flex';
}

async function submitUserRole() {
  const id = document.getElementById('usr_id').value;
  const role = document.getElementById('usr_role').value;
  showLoader();
  const res = await apiCall(`/admin/users/${id}/role`, 'PUT', { role });
  hideLoader();
  if (res && res.status === 200) {
    showToast('Role berhasil diubah.', 'success');
    closeModal('modalUser');
    loadUsers();
  } else {
    showToast(res?.data?.message || 'Gagal mengubah role', 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('Yakin ingin menghapus user ini?')) return;
  showLoader();
  const res = await apiCall(`/admin/users/${id}`, 'DELETE');
  hideLoader();
  if (res && res.status === 200) {
    showToast('User dihapus.', 'success');
    loadUsers();
  } else {
    showToast(res?.data?.message || 'Gagal menghapus user.', 'error');
  }
}

function openTambahKasir() {
  document.getElementById('kas_nama').value = '';
  document.getElementById('kas_email').value = '';
  document.getElementById('kas_hp').value = '';
  document.getElementById('kas_pass').value = '';
  document.getElementById('modalKasir').style.display = 'flex';
}

async function submitKasir() {
  const data = {
    nama_lengkap: document.getElementById('kas_nama').value,
    email: document.getElementById('kas_email').value,
    no_hp: document.getElementById('kas_hp').value,
    password: document.getElementById('kas_pass').value
  };
  showLoader();
  const res = await apiCall('/admin/users/kasir', 'POST', data);
  hideLoader();
  if (res && res.status === 201) {
    showToast('Akun kasir berhasil dibuat.', 'success');
    closeModal('modalKasir');
    loadUsers();
  } else {
    showToast(res?.data?.message || 'Gagal membuat kasir.', 'error');
  }
}
