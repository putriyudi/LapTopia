// frontend/js/katalog.js
let currentPage = 1;

document.addEventListener('DOMContentLoaded', async () => {
  // Load merks
  const resMerk = await apiCall('/laptops/meta/merks');
  if (resMerk && resMerk.status === 200) {
    const merkSelect = document.getElementById('merk');
    resMerk.data.data.forEach(m => {
      merkSelect.innerHTML += `<option value="${m}">${m}</option>`;
    });
  }
  
  loadKatalog(1);
});

async function loadKatalog(page = 1) {
  currentPage = page;
  const search = document.getElementById('search').value;
  const merk = document.getElementById('merk').value;
  const status = document.getElementById('status').value;
  
  let query = `?page=${page}&limit=9`;
  if (search) query += `&search=${encodeURIComponent(search)}`;
  if (merk) query += `&merk=${encodeURIComponent(merk)}`;
  if (status) query += `&status=${encodeURIComponent(status)}`;
  
  showLoader();
  const res = await apiCall(`/laptops${query}`);
  hideLoader();
  
  const grid = document.getElementById('katalogGrid');
  grid.innerHTML = '';
  
  if (res && res.status === 200) {
    const { data, pagination } = res.data;
    document.getElementById('totalItems').innerText = `${pagination.total} Laptop Ditemukan`;
    
    if (data.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">Tidak ada laptop yang sesuai dengan filter.</div>`;
    }
    
    data.forEach(laptop => {
      const isTersedia = laptop.status === 'Tersedia';
      const btnClass = isTersedia ? 'btn-primary' : 'btn-outline';
      const btnText = isTersedia ? 'Sewa Sekarang' : laptop.status;
      const btnAction = isTersedia ? `window.location.href='/checkout.html?id=${laptop.id_laptop}'` : '';
      const disabled = !isTersedia ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';
      
      grid.innerHTML += `
        <div class="card laptop-card">
          <div class="laptop-image-placeholder">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 60px; height: 60px; opacity: 0.5;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
          </div>
          <div class="laptop-content">
            <div class="laptop-title">${laptop.merk_tipe}</div>
            <div class="laptop-spec">${laptop.spesifikasi || '-'}</div>
            <div class="laptop-price">${formatRupiah(laptop.harga_sewa_per_hari)} <span>/ hari</span></div>
            <button class="btn ${btnClass}" style="width: 100%" onclick="${btnAction}" ${disabled}>
              ${btnText}
            </button>
          </div>
        </div>
      `;
    });
    
    renderPagination(pagination);
  }
}

function renderPagination(pg) {
  const container = document.getElementById('pagination');
  container.innerHTML = '';
  if (pg.pages <= 1) return;
  
  for (let i = 1; i <= pg.pages; i++) {
    container.innerHTML += `
      <button class="btn ${i === pg.page ? 'btn-primary' : 'btn-outline'}" 
              style="padding: 0.4rem 0.8rem;" 
              onclick="loadKatalog(${i})">
        ${i}
      </button>
    `;
  }
}
