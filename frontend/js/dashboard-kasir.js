// frontend/js/dashboard-kasir.js
document.addEventListener('DOMContentLoaded', () => {
  const auth = requireAuth(['kasir', 'admin']);
  if (!auth) return;
  document.getElementById('kasirName').innerText = `Kasir: ${auth.nama_lengkap}`;
  // Sidebar Navigation
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const id = link.id;
      if (id === 'link-pos') {
        switchTab('pos', link);
      } else if (id === 'link-otp') {
        switchTab('otp', link);
      } else if (id === 'link-yolo') {
        switchTab('yolo', link);
      }
    });
  });

  loadBookings();
});

function switchTab(tabId, activeLink) {
  document.querySelectorAll('.dashboard-main > div').forEach(div => div.style.display = 'none');
  document.getElementById(`tab-${tabId}`).style.display = 'block';
  
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  if (activeLink) activeLink.classList.add('active');
  
  const titles = {
    'pos': 'Manajemen Transaksi POS',
    'otp': 'Otorisasi Akses KTP',
    'yolo': 'Deteksi Keaslian Rupiah AI'
  };
  document.getElementById('pageTitle').innerText = titles[tabId];

  // Stop camera if leaving the YOLO tab to save battery and webcam locks
  if (tabId !== 'yolo') {
    if (typeof stopCamera === 'function') {
      stopCamera();
    }
  } else {
    // If opening the YOLO tab, initialize model if not done yet
    if (typeof initYolo === 'function') {
      initYolo();
    }
  }
}

let searchTimeout;
async function loadBookings() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const status = document.getElementById('filterStatus').value;
    const search = document.getElementById('searchName').value;
    
    let url = `/kasir/bookings?limit=100`;
    if (status) url += `&status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    
    const tbody = document.getElementById('posTable');
    tbody.style.opacity = '0.6';
    const res = await apiCall(url);
    tbody.style.opacity = '1';
    
    if (res && res.status === 200) {
      const data = res.data.data;
      tbody.innerHTML = '';
      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center">Tidak ada transaksi ditemukan.</td></tr>`;
        return;
      }
      data.forEach((trx, index) => {
        let statusBadge = `<span class="badge badge-secondary">${trx.status_transaksi}</span>`;
        if(trx.status_transaksi === 'Aktif') statusBadge = `<span class="badge badge-primary">Aktif</span>`;
        else if(trx.status_transaksi === 'Booking') statusBadge = `<span class="badge badge-warning">Booking</span>`;
        else if(trx.status_transaksi === 'Selesai') statusBadge = `<span class="badge badge-success">Selesai</span>`;
        
        let paymentBadge = '';
        if(trx.payment_status === 'paid') paymentBadge = `<span class="badge badge-success mt-1" style="display:inline-block; font-size:0.75rem;">Lunas (${trx.payment_method || '-'})</span>`;
        else paymentBadge = `<span class="badge badge-warning mt-1" style="display:inline-block; font-size:0.75rem;">Pending (${trx.payment_method || '-'})</span>`;
        
        let actionBtns = `<button class="btn btn-outline mb-1" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="lihatDetail(${trx.id_transaksi})">Lihat Detail</button><br>`;
        
        if (trx.status_transaksi === 'Booking') {
          if (trx.payment_status !== 'paid') {
            actionBtns += `<button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.8rem; margin-top:0.3rem;" onclick="konfirmasiBayar(${trx.id_transaksi})">Konfirmasi Bayar</button>`;
          } else {
            actionBtns += `<button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.8rem; background:var(--success); border-color:var(--success); margin-top:0.3rem;" onclick="openSerahTerima(${trx.id_transaksi})">Serah Terima</button>`;
          }
        } else if (trx.status_transaksi === 'Aktif' || trx.status_transaksi === 'Terlambat') {
          actionBtns += `<button class="btn btn-success" style="padding:0.4rem 0.8rem; font-size:0.8rem; background:var(--success); border-color:var(--success); color:white; margin-top:0.3rem;" onclick="openPengembalian(${trx.id_transaksi})">Kembalikan</button>
                          <button class="btn btn-outline" style="padding:0.4rem 0.8rem; font-size:0.8rem; margin-left:0.5rem; margin-top:0.3rem;" onclick="lihatKontrak(${trx.id_transaksi})">Unduh Kontrak</button>`;
        } else if (trx.status_transaksi === 'Selesai') {
          actionBtns += `<button class="btn btn-outline" style="padding:0.4rem 0.8rem; font-size:0.8rem; margin-top:0.3rem;" onclick="lihatKontrak(${trx.id_transaksi})">Lihat Kontrak</button>`;
        }
        
        tbody.innerHTML += `
          <tr>
            <td>${index + 1}</td>
            <td>
              <div style="font-weight:600;">${trx.nama_penyewa}</div>
              <div style="font-size:0.8rem; color:var(--text-muted)">${trx.no_hp_penyewa || '-'}</div>
            </td>
            <td>
              <div style="font-weight:600;">${trx.merk_tipe}</div>
              <div style="font-size:0.8rem; color:var(--text-muted)">SN: ${trx.nomor_seri}</div>
            </td>
            <td>${formatJustDate(trx.tgl_kembali_rencana)}</td>
            <td>${statusBadge}<br>${paymentBadge}</td>
            <td>${actionBtns}</td>
          </tr>
        `;
      });
    }
  }, 300);
}

// Fungsi Lihat Detail Lengkap (Pop-up)
window.lihatDetail = async function(id) {
    showLoader();
    const resDetail = await apiCall(`/kasir/bookings`); 
    hideLoader();
    
    if(resDetail && resDetail.status === 200) {
        const trx = resDetail.data.data.find(t => t.id_transaksi == id);
        if(!trx) return showToast("Data tidak ditemukan", "error");
        
        const content = document.getElementById('detailContent');
        
        // Desain dibikin lebih minimalis dan fokus ke data penting (No TMI)
        content.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                <div>
                    <h5 style="color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Info Pelanggan</h5>
                    <p><strong>Nama:</strong> ${trx.nama_penyewa}</p>
                    <p><strong>Kontak:</strong> ${trx.no_hp_penyewa}</p>
                    <p><strong>NIK:</strong> ${trx.nik_penyewa}</p>
                </div>
                <div>
                    <h5 style="color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Info Sewa</h5>
                    <p><strong>Unit:</strong> ${trx.merk_tipe}</p>
                    <p><strong>Durasi:</strong> ${trx.durasi_hari} Hari</p>
                    <p><strong>Total:</strong> ${formatRupiah(trx.total_biaya)}</p>
                </div>
            </div>
            
            <hr style="margin: 1.25rem 0; border-top: 1px solid var(--border-color);">
            
            <div style="position:relative; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; min-height: 180px; display: flex; align-items: center; justify-content: center;">
                <img id="detailKtpImg" src="" style="width: 100%; height: 200px; object-fit: cover; cursor: zoom-in; display: none;">
                <div id="ktpPlaceholder" style="text-align: center; padding: 2rem;">
                    <p style="font-size: 0.85rem; color: #64748b; font-weight: 600; margin-bottom: 0.8rem;">Otorisasi Diperlukan</p>
                    <button class="btn btn-primary" style="padding: 0.4rem 1rem; font-size: 0.8rem;" onclick="openOTPModal(${trx.id_transaksi})">Masukkan Kode OTP</button>
                </div>
            </div>
            
            <div style="margin-top: 1.5rem; text-align: right;">
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
                throw new Error(errData.message || 'OTP tidak valid');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            img.src = url;
            img.style.display = 'block';
            placeholder.style.display = 'none';
            
            // Zoom functionality
            img.onclick = () => openZoom(url);
            
            closeModal('modalOTP');
            showToast('Akses KTP terbuka.', 'success');
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
        const display = document.getElementById('otp-display');
        display.innerText = res.data.otp;
        showToast('OTP berhasil dibuat.', 'success');
    } else {
        showToast('Gagal generate OTP.', 'error');
    }
}

async function konfirmasiBayar(id) {
  showConfirm(
    'Konfirmasi Pembayaran',
    'Yakin ingin mengonfirmasi pembayaran transaksi ini?',
    'Ya, Konfirmasi',
    'Batal',
    async () => {
      showLoader();
      const res = await apiCall(`/kasir/konfirmasi-pembayaran/${id}`, 'POST');
      hideLoader();
      if(res && res.status === 200) {
        showToast("Pembayaran dikonfirmasi.", "success");
        loadBookings();
      } else {
        showToast(res?.data?.message || "Gagal konfirmasi.", "error");
      }
    }
  );
}

async function lihatKTP(id) {
  showLoader();
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/kasir/ktp/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    hideLoader();
    if (response.ok) {
      const blob = await response.blob();
      document.getElementById('ktpImage').src = URL.createObjectURL(blob);
      document.getElementById('modalKTP').style.display = 'flex';
    } else {
      showToast("KTP tidak ditemukan atau akses ditolak.", "error");
    }
  } catch (e) {
    hideLoader();
    showToast("Error mengambil KTP.", "error");
  }
}

function lihatKontrak(id) {
  const token = localStorage.getItem('token');
  fetch(`/api/kasir/kontrak/${id}`, { headers: { 'Authorization': `Bearer ${token}` } })
    .then(async res => {
      if(res.ok) {
        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), '_blank');
      } else {
        showToast("Kontrak belum tersedia.", "warning");
      }
    });
}

async function openSerahTerima(id) {
  document.getElementById('st_id_transaksi').value = id;
  document.getElementById('st_jaminan_fisik').value = '';
  document.getElementById('modalSerahTerima').style.display = 'flex';
  
  const select = document.getElementById('st_id_laptop_aktual');
  select.innerHTML = '<option value="">-- Gunakan Unit Booking Awal --</option>';
  const res = await apiCall('/laptops?status=Tersedia&limit=100');
  if (res && res.status === 200) {
    res.data.data.forEach(l => {
      select.innerHTML += `<option value="${l.id_laptop}">${l.merk_tipe} (SN: ${l.nomor_seri})</option>`;
    });
  }
}

async function submitSerahTerima() {
  const id = document.getElementById('st_id_transaksi').value;
  const jaminan = document.getElementById('st_jaminan_fisik').value;
  const idAktual = document.getElementById('st_id_laptop_aktual').value;
  if(!jaminan) {
    showToast("Pilih jenis jaminan fisik", "warning");
    return;
  }
  showLoader();
  const payload = { jaminan_fisik: jaminan };
  if(idAktual) payload.id_laptop_aktual = idAktual;
  
  const res = await apiCall(`/kasir/serah-terima/${id}`, 'POST', payload);
  hideLoader();
  if(res && res.status === 200) {
    showToast("Serah terima berhasil. Kontrak digenerate.", "success");
    closeModal('modalSerahTerima');
    loadBookings();
  } else {
    showToast(res?.data?.message || "Gagal proses.", "error");
  }
}

function openPengembalian(id) {
  document.getElementById('pg_id_transaksi').value = id;
  document.getElementById('pg_kondisi').value = '';
  document.getElementById('pg_status_unit').value = 'Tersedia';
  document.getElementById('pg_denda').value = '0';
  document.getElementById('modalPengembalian').style.display = 'flex';
}

async function submitPengembalian() {
  const id = document.getElementById('pg_id_transaksi').value;
  const kondisi = document.getElementById('pg_kondisi').value;
  const statusUnit = document.getElementById('pg_status_unit').value;
  const denda = document.getElementById('pg_denda').value;
  showLoader();
  const res = await apiCall(`/kasir/pengembalian/${id}`, 'POST', { kondisi_catatan: kondisi, status_unit: statusUnit, denda_tambahan: Number(denda) });
  hideLoader();
  if(res && res.status === 200) {
    let msg = `Pengembalian berhasil.\n`;
    if(res.data.data.terlambat) msg += `Denda Terlambat: Rp ${res.data.data.denda_otomatis.toLocaleString('id-ID')}\n`;
    if(res.data.data.total_denda > 0) msg += `Total Denda: Rp ${res.data.data.total_denda.toLocaleString('id-ID')}`;
    
    showToast(msg, "success");
    closeModal('modalPengembalian');
    loadBookings();
  } else {
    showToast(res?.data?.message || "Gagal proses.", "error");
  }
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}
