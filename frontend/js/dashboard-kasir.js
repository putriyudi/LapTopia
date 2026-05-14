// frontend/js/dashboard-kasir.js
document.addEventListener('DOMContentLoaded', () => {
  const auth = requireAuth(['kasir', 'admin']);
  if (!auth) return;
  document.getElementById('kasirName').innerText = `Kasir: ${auth.nama_lengkap}`;
  loadBookings();
});

async function loadBookings() {
  const status = document.getElementById('filterStatus').value;
  const url = status ? `/kasir/bookings?status=${status}` : `/kasir/bookings`;
  
  showLoader();
  const res = await apiCall(url);
  hideLoader();
  const tbody = document.getElementById('posTable');
  tbody.innerHTML = '';
  if (res && res.status === 200) {
    const data = res.data.data;
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center">Tidak ada transaksi ditemukan.</td></tr>`;
      return;
    }
    data.forEach(trx => {
      let statusBadge = `<span class="badge badge-secondary">${trx.status_transaksi}</span>`;
      if(trx.status_transaksi === 'Aktif') statusBadge = `<span class="badge badge-primary">Aktif</span>`;
      else if(trx.status_transaksi === 'Booking') statusBadge = `<span class="badge badge-warning">Booking</span>`;
      else if(trx.status_transaksi === 'Selesai') statusBadge = `<span class="badge badge-success">Selesai</span>`;
      
      let paymentBadge = '';
      if(trx.payment_status === 'paid') paymentBadge = `<span class="badge badge-success mt-1" style="display:inline-block; font-size:0.75rem;">Lunas (${trx.payment_method || '-'})</span>`;
      else paymentBadge = `<span class="badge badge-warning mt-1" style="display:inline-block; font-size:0.75rem;">Pending (${trx.payment_method || '-'})</span>`;
      
      let actionBtns = `<button class="btn btn-outline mb-1" style="padding:0.3rem 0.6rem; font-size:0.75rem; border-color:var(--border-color); color:var(--text-color);" onclick="lihatKTP(${trx.id_transaksi})">Preview KTP</button><br>`;
      
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
          <td>#${trx.id_transaksi}</td>
          <td>
            <div style="font-weight:600;">${trx.nama_penyewa}</div>
            <div style="font-size:0.8rem; color:var(--text-muted)">${trx.no_hp_penyewa}</div>
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
}

async function konfirmasiBayar(id) {
  if(!confirm('Yakin ingin mengonfirmasi pembayaran transaksi ini?')) return;
  showLoader();
  const res = await apiCall(`/kasir/konfirmasi-pembayaran/${id}`, 'POST');
  hideLoader();
  if(res && res.status === 200) {
    showToast("Pembayaran dikonfirmasi.", "success");
    loadBookings();
  } else {
    showToast(res.data.message || "Gagal konfirmasi.", "error");
  }
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
    showToast(res.data.message || "Gagal proses.", "error");
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
    showToast(res.data.message || "Gagal proses.", "error");
  }
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}
