/* frontend/js/katalog.js */
let currentPage = 1;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inisialisasi Auth Nav (Pastikan tombol dashboard/logout muncul)
    if (typeof updateAuthNav === 'function') {
        updateAuthNav(); 
    }

    // 2. Load Metadata Merk
    const resMerk = await apiCall('/laptops/meta/merks');
    if (resMerk && resMerk.status === 200) {
        const merkSelect = document.getElementById('merk');
        resMerk.data.data.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.innerText = m;
            merkSelect.appendChild(opt);
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
        
        data.forEach(laptop => {
            const isTersedia = laptop.status === 'Tersedia';
            const btnClass = isTersedia ? 'btn-primary' : 'btn-outline';
            const btnText = isTersedia ? 'Sewa Sekarang' : laptop.status;
            
            // Render kartu laptop
            const card = document.createElement('div');
            card.className = 'card laptop-card';
            card.innerHTML = `
                <div class="laptop-image-placeholder">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 60px; opacity: 0.3;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                </div>
                <div class="laptop-content">
                    <div class="laptop-title">${laptop.merk_tipe}</div>
                    <div class="laptop-spec">${laptop.spesifikasi || '-'}</div>
                    <div class="laptop-price">${formatRupiah(laptop.harga_sewa_per_hari)} <span>/ hari</span></div>
                </div>
            `;

            // Buat tombol secara manual untuk menghindari CSP Error
            const btn = document.createElement('button');
            btn.className = `btn ${btnClass}`;
            btn.style.width = '100%';
            btn.innerText = btnText;
            
            if (isTersedia) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const auth = getAuth(); // Cek login dari api.js
                    if (!auth) {
                        alert("Kamu harus punya akun dulu untuk menyewa.");
                        window.location.href = '/register.html';
                    } else {
                        window.location.href = `/checkout.html?id=${laptop.id_laptop}`;
                    }
                });
            } else {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            }

            card.querySelector('.laptop-content').appendChild(btn);
            grid.appendChild(card);
        });
        
        renderPagination(pagination);
    }
}

// Handler Pagination tanpa onclick
function renderPagination(pg) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    if (pg.pages <= 1) return;
    
    for (let i = 1; i <= pg.pages; i++) {
        const btn = document.createElement('button');
        btn.className = `btn ${i === pg.page ? 'btn-primary' : 'btn-outline'}`;
        btn.style.padding = '0.4rem 0.8rem';
        btn.innerText = i;
        btn.addEventListener('click', () => loadKatalog(i));
        container.appendChild(btn);
    }
}