/* frontend/js/katalog.js */
let currentPage = 1;

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[char]));
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inisialisasi Auth Nav
    if (typeof updateNavbarAuth === 'function') {
        updateNavbarAuth();
    } else if (typeof updateAuthNav === 'function') {
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

    const filterButton = document.querySelector('.filter-sidebar .btn-primary');
    if (filterButton) {
        filterButton.addEventListener('click', (e) => {
            e.preventDefault();
            loadKatalog(1);
        });
    }

    ['search', 'merk', 'status'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const eventName = id === 'search' ? 'keydown' : 'change';
        el.addEventListener(eventName, (e) => {
            if (id !== 'search' || e.key === 'Enter') {
                e.preventDefault();
                loadKatalog(1);
            }
        });
    });
    
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

        if (!data || data.length === 0) {
            grid.innerHTML = `<div class="card empty-state" style="grid-column:1/-1;"><div class="card-body text-center"><h3>Tidak ada laptop ditemukan</h3><p class="text-muted">Coba ubah kata kunci pencarian atau filter status.</p></div></div>`;
            renderPagination(pagination);
            return;
        }
        
        data.forEach(laptop => {
            const isTersedia = laptop.status === 'Tersedia';
            const btnClass = isTersedia ? 'btn-primary' : 'btn-outline';
            const btnText = isTersedia ? 'Sewa Sekarang' : laptop.status;
            const statusClass = isTersedia ? 'badge-success' : laptop.status === 'Maintenance' ? 'badge-warning' : 'badge-secondary';
            const merkTipe = escapeHTML(laptop.merk_tipe);
            const spesifikasi = escapeHTML(laptop.spesifikasi || '-');
            
            // ── PERUBAHAN: Tampilkan foto laptop jika ada, fallback ke placeholder SVG ──
            const fotoHTML = laptop.foto_laptop
                ? `<img
                     src="/${escapeHTML(laptop.foto_laptop)}"
                     alt="${merkTipe}"
                     style="width:100%; height:100%; object-fit:cover; border-radius:8px 8px 0 0;"
                     onerror="this.parentElement.innerHTML='<svg fill=\\'none\\' stroke=\\'currentColor\\' viewBox=\\'0 0 24 24\\' style=\\'width:60px;opacity:0.3;\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'1.5\\' d=\\'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z\\'></path></svg>'">`
                : `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 60px; opacity: 0.3;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>`;

            const card = document.createElement('div');
            card.className = 'card laptop-card';
            card.innerHTML = `
                <div class="laptop-image-placeholder" style="${laptop.foto_laptop ? 'padding:0; overflow:hidden; height:180px;' : ''}">
                    ${fotoHTML}
                </div>
                <div class="laptop-content">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:.65rem;">
                        <div class="laptop-title">${merkTipe}</div>
                        <span class="badge ${statusClass}">${escapeHTML(laptop.status)}</span>
                    </div>
                    <div class="laptop-spec">${spesifikasi}</div>
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
                    const auth = getAuth();
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
    } else {
        document.getElementById('totalItems').innerText = 'Gagal memuat katalog';
        grid.innerHTML = `<div class="card empty-state" style="grid-column:1/-1;"><div class="card-body text-center"><h3>Gagal memuat data</h3><p class="text-muted">Periksa koneksi server/database, lalu coba refresh halaman.</p></div></div>`;
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
