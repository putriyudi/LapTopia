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
      
      let actionBtns = '';
      
      if (trx.status_transaksi === 'Booking' && trx.payment_status === 'paid') {
        actionBtns = `<button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="openSerahTerima(${trx.id_transaksi})">Serah Terima</button>`;
      } else if (trx.status_transaksi === 'Aktif' || trx.status_transaksi === 'Terlambat') {
        actionBtns = `<button class="btn btn-success" style="padding:0.4rem 0.8rem; font-size:0.8rem; background:var(--success); border-color:var(--success); color:white;" onclick="openPengembalian(${trx.id_transaksi})">Kembalikan</button>
                      <a href="/api/kasir/kontrak/${trx.id_transaksi}" class="btn btn-outline" style="padding:0.4rem 0.8rem; font-size:0.8rem; margin-left:0.5rem;" target="_blank">Unduh Kontrak</a>`;
      } else if (trx.status_transaksi === 'Selesai') {
        actionBtns = `<a href="/api/kasir/kontrak/${trx.id_transaksi}" class="btn btn-outline" style="padding:0.4rem 0.8rem; font-size:0.8rem;" target="_blank">Lihat Kontrak</a>`;
      } else if (trx.status_transaksi === 'Booking' && trx.payment_status !== 'paid') {
         actionBtns = `<span class="text-muted" style="font-size:0.8rem;">Menunggu Pembayaran</span>`;
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
          <td>${statusBadge}</td>
          <td>${actionBtns}</td>
        </tr>
      `;
    });
  }
}

function openSerahTerima(id) {
  document.getElementById('st_id_transaksi').value = id;
  document.getElementById('st_jaminan_fisik').value = '';
  document.getElementById('modalSerahTerima').style.display = 'flex';
}

async function submitSerahTerima() {
  const id = document.getElementById('st_id_transaksi').value;
  const jaminan = document.getElementById('st_jaminan_fisik').value;
  if(!jaminan) {
    showToast("Pilih jenis jaminan fisik", "warning");
    return;
  }
  showLoader();
  const res = await apiCall(`/kasir/serah-terima/${id}`, 'POST', { jaminan_fisik: jaminan });
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
  document.getElementById('pg_denda').value = '0';
  document.getElementById('modalPengembalian').style.display = 'flex';
}

async function submitPengembalian() {
  const id = document.getElementById('pg_id_transaksi').value;
  const kondisi = document.getElementById('pg_kondisi').value;
  const denda = document.getElementById('pg_denda').value;
  showLoader();
  const res = await apiCall(`/kasir/pengembalian/${id}`, 'POST', { kondisi_catatan: kondisi, denda_tambahan: Number(denda) });
  hideLoader();
  if(res && res.status === 200) {
    showToast("Pengembalian berhasil diproses.", "success");
    closeModal('modalPengembalian');
    loadBookings();
  } else {
    showToast(res.data.message || "Gagal proses.", "error");
  }
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}
