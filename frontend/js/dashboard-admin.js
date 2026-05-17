// frontend/js/dashboard-admin.js
document.addEventListener('DOMContentLoaded', () => {
  const auth = requireAuth(['admin']);
  if (!auth) return;
  document.getElementById('adminName').innerText = `Admin: ${auth.nama_lengkap}`;
  loadStats();
  
  // Add event listeners for sidebar links
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const text = link.innerText.trim();
      if (text === 'Lihat Website') return;
      if (text === 'Logout') {
        window.logout();
        return;
      }
      e.preventDefault();
      const textTrim = link.innerText.trim();
      let tabId = 'stats';
      if (textTrim === 'Kelola Laptop') tabId = 'laptops';
      else if (textTrim === 'Kelola User') tabId = 'users';
      else if (textTrim === 'Laporan Transaksi') tabId = 'laporan';
      else if (textTrim === 'Laporan Keamanan') tabId = 'keamanan';
      else if (textTrim === 'Otorisasi KTP') tabId = 'otp';
      
      if (tabId) switchTab(tabId, link);
    });
  });
  
  // ── Tombol Tambah Laptop ─────────────────────────────────
  // PERUBAHAN: Reset juga field foto saat buka modal tambah
  const btnTambah = document.getElementById('btnTambahLaptop');
  if (btnTambah) {
    btnTambah.addEventListener('click', () => {
      document.getElementById('modalLaptopTitle').innerText = 'Tambah Laptop';
      document.getElementById('lap_id').value = '';
      document.getElementById('lap_sn').value = '';
      document.getElementById('lap_merk').value = '';
      document.getElementById('lap_spek').value = '';
      document.getElementById('lap_harga').value = '';
      document.getElementById('lap_status').value = 'Tersedia';
      // Reset foto
      document.getElementById('lap_foto').value = '';
      document.getElementById('lap_foto_existing').value = '';
      document.getElementById('lap_foto_preview_wrap').style.display = 'none';
      document.getElementById('lap_foto_hint').style.display = 'none';
      document.getElementById('lap_foto_label').innerHTML =
        'Foto Laptop <span style="font-size:0.78rem;color:#94a3b8;">(jpg, jpeg, png, webp · opsional)</span>';
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
  if (target) target.style.display = 'block';
  
  const titles = {
    'stats': 'Statistik Dashboard',
    'laptops': 'Manajemen Laptop',
    'users': 'Manajemen Pengguna',
    'laporan': 'Laporan Keseluruhan Transaksi',
    'keamanan': 'Laporan Keamanan',
    'otp': 'Otorisasi Akses KTP'
  };
  document.getElementById('pageTitle').innerText = titles[tabId];
  if (tabId === 'stats') loadStats();
  if (tabId === 'laptops') loadLaptops();
  if (tabId === 'users') loadUsers();
  if (tabId === 'laporan') loadLaporan();
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

// ── Load Laptops ─────────────────────────────────────────────
// PERUBAHAN: Kirim foto_laptop ke editLaptop via data-attribute agar aman dari
//            karakter spesial (slash, dll) yang bisa membreak inline onclick string.
async function loadLaptops() {
  showLoader();
  const res = await apiCall('/laptops?limit=50');
  hideLoader();
  const tb = document.getElementById('lapTable');
  tb.innerHTML = '';
  if (res && res.status === 200) {
    res.data.data.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escHTMLAdmin(l.nomor_seri)}</td>
        <td>${escHTMLAdmin(l.merk_tipe)}</td>
        <td>${formatRupiah(l.harga_sewa_per_hari)}</td>
        <td>${escHTMLAdmin(l.status)}</td>
        <td>
          <button class="btn btn-outline"
                  style="padding:0.2rem 0.5rem;font-size:0.8rem;"
                  data-id="${l.id_laptop}"
                  data-sn="${escAttr(l.nomor_seri)}"
                  data-merk="${escAttr(l.merk_tipe)}"
                  data-spek="${escAttr(l.spesifikasi || '')}"
                  data-harga="${l.harga_sewa_per_hari}"
                  data-status="${escAttr(l.status)}"
                  data-foto="${escAttr(l.foto_laptop || '')}">Edit</button>
          <button class="btn"
                  style="padding:0.2rem 0.5rem;font-size:0.8rem;background:var(--error);color:white;border-color:var(--error);"
                  data-del-id="${l.id_laptop}">Hapus</button>
        </td>
      `;

      // Bind Edit button
      tr.querySelector('[data-id]').addEventListener('click', function () {
        editLaptop(
          this.dataset.id,
          this.dataset.sn,
          this.dataset.merk,
          this.dataset.spek,
          this.dataset.harga,
          this.dataset.status,
          this.dataset.foto
        );
      });

      // Bind Hapus button
      tr.querySelector('[data-del-id]').addEventListener('click', function () {
        deleteLaptop(this.dataset.delId);
      });

      tb.appendChild(tr);
    });
  }
}

// Helper escape untuk innerHTML (bukan onclick string lagi)
function escHTMLAdmin(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

async function loadUsers() {
  showLoader();
  const res = await apiCall('/admin/users');
  hideLoader();
  const tb = document.getElementById('usrTable');
  tb.innerHTML = '';
  if (res && res.status === 200) {
    res.data.data.forEach(u => {
      tb.innerHTML += `<tr>
        <td>${u.id_user}</td>
        <td>${escHTMLAdmin(u.nama_lengkap)}</td>
        <td>${escHTMLAdmin(u.email)}</td>
        <td><span class="badge badge-secondary">${escHTMLAdmin(u.role)}</span></td>
        <td>${formatJustDate(u.created_at)}</td>
        <td>
          <button class="btn btn-outline" style="padding:0.2rem 0.5rem;font-size:0.8rem;" onclick="editUserRole(${u.id_user}, '${u.role}')">Ubah Role</button>
          <button class="btn" style="padding:0.2rem 0.5rem;font-size:0.8rem;background:var(--error);color:white;border-color:var(--error);" onclick="deleteUser(${u.id_user})">Hapus</button>
        </td>
      </tr>`;
    });
  }
}

let searchTimeout;
window.loadLaporan = async function() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const search = document.getElementById('search_laporan').value;
    const dari = document.getElementById('filter_dari').value;
    const sampai = document.getElementById('filter_sampai').value;
    const status = document.getElementById('filter_status').value;
    
    const tbody = document.getElementById('lapTrxTable');
    tbody.style.opacity = '0.6';

    const res = await apiCall(`/admin/laporan?search=${search}&dari=${dari}&sampai=${sampai}&status=${status}`);
    tbody.style.opacity = '1';

    if (res && res.status === 200) {
      const data = res.data.data;
      tbody.innerHTML = '';
      if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center">Tidak ada laporan ditemukan.</td></tr>`;
        return;
      }
      data.forEach((trx, index) => {
        tbody.innerHTML += `
          <tr>
            <td>${index + 1}</td>
            <td>${escHTMLAdmin(trx.nama_penyewa)}<br><small>${escHTMLAdmin(trx.email_penyewa)}</small></td>
            <td>${escHTMLAdmin(trx.merk_tipe)}</td>
            <td>${formatRupiah(trx.total_biaya)}</td>
            <td><span class="badge ${trx.status_transaksi === 'Selesai' ? 'badge-success' : 'badge-warning'}">${escHTMLAdmin(trx.status_transaksi)}</span></td>
            <td>${formatJustDate(trx.created_at)}</td>
            <td><button class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="lihatDetailAdmin(${trx.id_transaksi})">Detail</button></td>
          </tr>
        `;
      });
    }
  }, 300);
}

window.lihatDetailAdmin = async function(id) {
    showLoader();
    const dari = document.getElementById('filter_dari')?.value || '';
    const sampai = document.getElementById('filter_sampai')?.value || '';
    const status = document.getElementById('filter_status')?.value || '';
    
    let q = [];
    if (dari) q.push(`dari=${dari}`);
    if (sampai) q.push(`sampai=${sampai}`);
    if (status) q.push(`status=${status}`);
    const qs = q.length ? '?' + q.join('&') : '';
    
    const res = await apiCall('/admin/laporan' + qs); 
    hideLoader();
    
    if (res && res.status === 200) {
        const trx = res.data.data.find(t => t.id_transaksi == id);
        if (!trx) return showToast("Data tidak ditemukan", "error");
        
        const content = document.getElementById('detailContent');
        content.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                <div>
                    <p><strong>ID Transaksi:</strong> #${trx.id_transaksi}</p>
                    <p><strong>Nama:</strong> ${escHTMLAdmin(trx.nama_penyewa)}</p>
                    <p><strong>NIK:</strong> ${escHTMLAdmin(trx.nik_penyewa)}</p>
                    <p><strong>No HP:</strong> ${escHTMLAdmin(trx.no_hp_penyewa || '-')}</p>
                    <p><strong>Email:</strong> ${escHTMLAdmin(trx.email_penyewa)}</p>
                </div>
                <div>
                    <p><strong>Laptop:</strong> ${escHTMLAdmin(trx.merk_tipe)}</p>
                    <p><strong>SN:</strong> ${escHTMLAdmin(trx.nomor_seri)}</p>
                    <p><strong>Tgl Sewa:</strong> ${formatJustDate(trx.tgl_mulai_sewa)}</p>
                    <p><strong>Durasi:</strong> ${trx.durasi_hari} Hari</p>
                    <p><strong>Total:</strong> ${formatRupiah(trx.total_biaya)}</p>
                </div>
            </div>
            <hr style="margin: 1rem 0; border-top: 1px solid var(--border-color);">
            <p style="margin-bottom: 0.5rem;"><strong>Foto KTP / Jaminan:</strong></p>
            <div style="position:relative; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; overflow: hidden; min-height: 220px; display: flex; align-items: center; justify-content: center;">
                <img id="detailKtpImg" src="" 
                     style="width: 100%; height: 220px; object-fit: cover; border-radius: 10px; cursor: zoom-in; display: none;">
                <div id="ktpPlaceholder" style="text-align: center; padding: 2rem;">
                    <img src="https://cdn-icons-png.flaticon.com/512/2550/2550371.png" style="width: 48px; margin: 0 auto 1rem; opacity: 0.6;">
                    <p style="font-size: 0.85rem; color: #64748b; font-weight: 600; margin-bottom: 1.25rem;">Foto KTP Terkunci Keamanan</p>
                    <button class="btn btn-primary" style="padding: 0.5rem 1.25rem; font-size: 0.85rem;" onclick="openOTPModal(${trx.id_transaksi})">Buka Akses KTP</button>
                </div>
            </div>
            <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.75rem; text-align: center;">Otorisasi diperlukan untuk mematuhi kebijakan privasi data.</p>
            <div style="margin-top: 1.5rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
                <button class="btn" style="background: var(--error); color: white; border-color: var(--error);" onclick="deleteTransaksiAdmin(${trx.id_transaksi})">Hapus Laporan</button>
                <button class="btn btn-outline" onclick="closeModal('modalDetail')">Tutup</button>
            </div>
        `;

        document.getElementById('modalDetail').style.display = 'flex';
    }
}

window.openOTPModal = function(id_transaksi) {
    const modal = document.getElementById('modalOTP');
    const input = document.getElementById('otp_input');
    const btn = document.getElementById('btnConfirmOTP');
    
    input.value = '';
    modal.style.display = 'flex';
    input.focus();

    btn.onclick = async () => {
        const otp = input.value;
        if (!otp || otp.length < 6) return showToast('Masukkan 6 digit OTP', 'warning');

        showLoader();
        const token = localStorage.getItem('token');
        const img = document.getElementById('detailKtpImg');
        const placeholder = document.getElementById('ktpPlaceholder');

        try {
            const response = await fetch(`/api/kasir/ktp/${id_transaksi}?otp=${otp}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || 'OTP tidak valid atau kedaluwarsa');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            img.src = url;
            img.style.display = 'block';
            placeholder.style.display = 'none';
            img.onclick = () => openZoom(url);
            
            closeModal('modalOTP');
            showToast('Akses KTP diberikan.', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoader();
        }
    };
}

let currentZoom = 1;
window.openZoom = function(src) {
    const modal = document.getElementById('modalZoom');
    const img = document.getElementById('zoomImg');
    img.src = src;
    currentZoom = 1;
    img.style.transform = `scale(${currentZoom})`;
    modal.style.display = 'flex';
}

window.zoomImage = function(delta) {
    currentZoom += delta;
    if (currentZoom < 0.5) currentZoom = 0.5;
    if (currentZoom > 3) currentZoom = 3;
    document.getElementById('zoomImg').style.transform = `scale(${currentZoom})`;
}

window.resetZoom = function() {
    currentZoom = 1;
    document.getElementById('zoomImg').style.transform = `scale(${currentZoom})`;
}

window.generateOTP = async function(role) {
    showLoader();
    const res = await apiCall('/otp/generate', 'POST', { target_role: role });
    hideLoader();
    if (res && res.status === 200) {
        const display = document.getElementById(`otp-${role}-display`);
        display.innerText = res.data.otp;
        display.style.color = role === 'admin' ? 'var(--primary)' : '#0f172a';
        showToast(`OTP untuk ${role} berhasil dibuat.`, 'success');
    } else {
        showToast('Gagal generate OTP.', 'error');
    }
}

window.deleteTransaksiAdmin = async function(id) {
  showConfirm(
    'Hapus Transaksi',
    'Apakah Anda yakin ingin menghapus laporan transaksi ini? Tindakan ini tidak dapat dibatalkan.',
    'Ya, Hapus',
    'Batal',
    async () => {
      showLoader();
      const res = await apiCall(`/admin/transaksi/${id}`, 'DELETE');
      hideLoader();
      if (res && res.status === 200) {
          showToast('Transaksi berhasil dihapus.', 'success');
          closeModal('modalDetail');
          loadLaporan();
          loadStats();
      } else {
          showToast(res?.data?.message || 'Gagal menghapus transaksi', 'error');
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════
//  LAPTOPS LOGIC — PERUBAHAN UTAMA
// ══════════════════════════════════════════════════════════════

// Preview foto yang dipilih user di input file
window.previewFotoLaptop = function(input) {
  const file = input.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = document.getElementById('lap_foto_preview');
  const wrap = document.getElementById('lap_foto_preview_wrap');
  img.src = url;
  wrap.style.display = 'block';
  document.getElementById('lap_foto_preview_wrap')
    .querySelector('label').innerText = 'Preview Foto Baru';
};

// Submit laptop — gunakan FormData agar bisa kirim file sekaligus field teks
async function submitLaptop() {
  const id = document.getElementById('lap_id').value;
  const fileInput = document.getElementById('lap_foto');
  const file = fileInput.files[0];

  // Validasi tipe file di sisi client (double-check sebelum kirim)
  if (file) {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      return showToast('Foto harus berformat jpg, jpeg, png, atau webp.', 'error');
    }
  }

  const formData = new FormData();
  formData.append('nomor_seri', document.getElementById('lap_sn').value);
  formData.append('merk_tipe', document.getElementById('lap_merk').value);
  formData.append('spesifikasi', document.getElementById('lap_spek').value);
  formData.append('harga_sewa_per_hari', document.getElementById('lap_harga').value);
  formData.append('status', document.getElementById('lap_status').value);
  if (file) {
    formData.append('foto_laptop', file);
  }

  showLoader();
  // isFormData = true → apiCall tidak set Content-Type (biar browser set boundary otomatis)
  const res = await apiCall(
    id ? `/laptops/${id}` : '/laptops',
    id ? 'PUT' : 'POST',
    formData,
    true
  );
  hideLoader();

  if (res && (res.status === 200 || res.status === 201)) {
    showToast(`Laptop berhasil ${id ? 'diupdate' : 'ditambahkan'}.`, 'success');
    closeModal('modalLaptop');
    loadLaptops();
  } else {
    showToast(res?.data?.message || 'Gagal menyimpan laptop', 'error');
  }
}

// Buka modal edit laptop — tampilkan foto lama jika ada
function editLaptop(id, sn, merk, spek, harga, status, foto) {
  document.getElementById('modalLaptopTitle').innerText = 'Edit Laptop';
  document.getElementById('lap_id').value = id;
  document.getElementById('lap_sn').value = sn;
  document.getElementById('lap_merk').value = merk;
  document.getElementById('lap_spek').value = spek || '';
  document.getElementById('lap_harga').value = harga;
  document.getElementById('lap_status').value = status;

  // Reset input file (pastikan tidak membawa file sesi sebelumnya)
  document.getElementById('lap_foto').value = '';
  document.getElementById('lap_foto_existing').value = foto || '';

  const previewWrap = document.getElementById('lap_foto_preview_wrap');
  const previewImg  = document.getElementById('lap_foto_preview');
  const hint        = document.getElementById('lap_foto_hint');
  const fotoLabel   = document.getElementById('lap_foto_label');

  if (foto) {
    // Ada foto lama → tampilkan preview dan hint "kosongkan jika tidak ingin ganti"
    previewImg.src = `/${foto}`;
    previewWrap.style.display = 'block';
    previewWrap.querySelector('label').innerText = 'Foto Saat Ini';
    hint.style.display = 'block';
    fotoLabel.innerHTML = 'Ganti Foto <span style="font-size:0.78rem;color:#94a3b8;">(jpg, jpeg, png, webp · opsional)</span>';
  } else {
    // Belum ada foto
    previewWrap.style.display = 'none';
    hint.style.display = 'none';
    fotoLabel.innerHTML = 'Foto Laptop <span style="font-size:0.78rem;color:#94a3b8;">(jpg, jpeg, png, webp · opsional)</span>';
  }

  document.getElementById('modalLaptop').style.display = 'flex';
}

async function deleteLaptop(id) {
  showConfirm(
    'Hapus Laptop',
    'Yakin ingin menghapus laptop ini?',
    'Ya, Hapus',
    'Batal',
    async () => {
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
  );
}

// ── Users Logic ───────────────────────────────────────────────
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
  showConfirm(
    'Hapus Pengguna',
    'Yakin ingin menghapus user ini?',
    'Ya, Hapus',
    'Batal',
    async () => {
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
  );
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
