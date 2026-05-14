/* frontend/js/dashboard-user.js */

/**
 * Fungsi logout global agar tetap bisa dipanggil jika ada elemen HTML 
 * yang masih menggunakan atribut onclick.
 */
window.logout = function() {
    if (confirm('Apakah Anda yakin ingin keluar dari LaptopRent?')) {
        // Menghapus data dari localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        if (typeof showToast === 'function') {
            showToast('Berhasil keluar. Sampai jumpa!', 'success');
        }

        // Redirect ke halaman utama
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 800);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    /**
     * 1. Proteksi Halaman & Inisialisasi Auth
     */
    const user = requireAuth(['user']); 
    if (!user) return;

    // Menampilkan sapaan nama di topbar
    const userGreeting = document.getElementById('userGreeting');
    if (userGreeting) {
        userGreeting.innerText = `Hi, ${user.nama_lengkap}`;
    }
    
    // Load data awal (Default Tab: Riwayat)
    loadRiwayat();
    loadProfileData();

    /**
     * 2. Navigasi Tab (Mencegah Error CSP)
     * Mengikat event listener ke ID elemen sidebar daripada menggunakan onclick di HTML.
     */
    const navMapping = {
        'nav-riwayat': 'riwayat',
        'nav-sewa': 'sewa',
        'nav-profil': 'profil'
    };

    Object.keys(navMapping).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab(navMapping[id]);
            });
        }
    });

    // Event listener untuk tombol logout khusus
    document.getElementById('nav-logout')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.logout();
    });

    /**
     * 3. Handler Form Update Profil
     */
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(profileForm);
            
            // Validasi file: Jangan kirim foto_ktp jika input file kosong
            const ktpField = formData.get('foto_ktp');
            if (ktpField && ktpField.size === 0) {
                formData.delete('foto_ktp');
            }

            if (typeof showLoader === 'function') showLoader();
            const res = await apiCall('/auth/profile', 'PUT', formData, true);
            if (typeof hideLoader === 'function') hideLoader();
            
            if (res && res.status === 200) {
                showToast('Profil berhasil diperbarui.', 'success');
                loadProfileData(); 
            } else {
                showToast(res?.data?.message || 'Gagal memperbarui profil.', 'error');
            }
        });
    }
});

/**
 * Fungsi Navigasi Tab (Riwayat vs Sewa vs Profil)
 */
function switchTab(tabId) {
    const tabs = ['riwayat', 'sewa', 'profil'];
    
    tabs.forEach(id => {
        const tabEl = document.getElementById(`tab-${id}`);
        if (tabEl) {
            tabEl.style.display = (id === tabId) ? 'block' : 'none';
        }
    });
    
    // Update active class di sidebar
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active');
        if (link.id === `nav-${tabId}`) {
            link.classList.add('active');
        }
    });

    // Update judul halaman di topbar dan muat data yang sesuai
    const pageTitle = document.getElementById('pageTitle');
    if (tabId === 'riwayat') {
        if (pageTitle) pageTitle.innerText = 'Riwayat Sewa';
        loadRiwayat();
    } else if (tabId === 'sewa') {
        if (pageTitle) pageTitle.innerText = 'Sewa Laptop Baru';
        loadCatalog();
    } else {
        if (pageTitle) pageTitle.innerText = 'Profil Saya';
        loadProfileData();
    }
}

/**
 * Mengambil data katalog laptop tersedia
 */
/**
 * Mengambil data katalog laptop tersedia
 */
async function loadCatalog() {
    const grid = document.getElementById('catalogGrid');
    if (!grid) return;

    grid.innerHTML = '<p class="text-center">Memuat katalog...</p>';
    
    const res = await apiCall('/laptops');
    grid.innerHTML = '';

    if (res && res.status === 200) {
        const laptops = res.data.data || [];
        const availableLaptops = laptops.filter(lp => lp.status === 'Tersedia');

        if (availableLaptops.length === 0) {
            grid.innerHTML = '<p class="text-center">Tidak ada unit tersedia saat ini.</p>';
            return;
        }

        availableLaptops.forEach(lp => {
            // Kita gunakan class 'btn-sewa-action' dan data-id, bukan onclick lagi
            grid.innerHTML += `
                <div class="laptop-card">
                    <img src="${lp.image_url || '/uploads/default.png'}" onerror="this.src='/uploads/default.png'">
                    <div class="laptop-info">
                        <h4>${lp.merk_tipe}</h4>
                        <div class="laptop-price">${formatRupiah(lp.harga_sewa_per_hari)}<span style="font-size:0.7rem; color:#64748b">/hari</span></div>
                        <p class="laptop-spec">${lp.spesifikasi || '-'}</p>
                        <button type="button" class="btn btn-primary btn-block btn-sewa-action" data-id="${lp.id_laptop}">
                            Sewa Sekarang
                        </button>
                    </div>
                </div>
            `;
        });

        // AKTIVASI TOMBOL: Pasang event listener setelah grid diisi
        const buttons = grid.querySelectorAll('.btn-sewa-action');
        buttons.forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const id = this.getAttribute('data-id');
                console.log("Mengarahkan ke checkout untuk ID:", id); // Cek di console
                window.location.href = `/checkout.html?id=${id}`;
            });
        });

    } else {
        grid.innerHTML = '<p class="text-center text-danger">Gagal memuat katalog.</p>';
    }
}

/**
 * Mengambil data riwayat sewa user
 */
async function loadRiwayat() {
    const tbody = document.getElementById('riwayatTable');
    if (!tbody) return;

    const res = await apiCall('/transaksi/riwayat');
    tbody.innerHTML = '';
    
    if (res && res.status === 200) {
        const data = res.data.data || [];
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center">Belum ada riwayat penyewaan.</td></tr>`;
            return;
        }

        data.forEach(trx => {
            const statusClass = trx.status_transaksi?.toLowerCase() === 'aktif' ? 'success' : 'info';
            tbody.innerHTML += `
                <tr>
                    <td>#${trx.id_transaksi}</td>
                    <td>
                        <div style="font-weight:600;">${trx.merk_tipe}</div>
                        <div style="font-size:0.8rem; color:#64748b">Total: ${formatRupiah(trx.total_biaya)}</div>
                    </td>
                    <td>${formatDate(trx.tgl_mulai_sewa)}</td>
                    <td>${trx.durasi_hari} Hari</td>
                    <td><span class="badge ${trx.payment_status === 'paid' ? 'success' : 'warning'}">${(trx.payment_status || 'pending').toUpperCase()}</span></td>
                    <td><span class="badge ${statusClass}">${trx.status_transaksi || 'Proses'}</span></td>
                    <td>${trx.file_pdf_path ? `<button class="btn btn-outline" style="padding:0.2rem 0.5rem; font-size:0.8rem" onclick="lihatKontrakUser(${trx.id_transaksi})">Unduh PDF</button>` : '-'}</td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Gagal memuat data riwayat. Pastikan tabel "kontrak_digital" sudah dibuat.</td></tr>`;
    }
}

/**
 * Mengambil data profil user
 */
async function loadProfileData() {
    const res = await apiCall('/auth/profile');
    if (res && res.status === 200) {
        const u = res.data.data;
        const mapping = {
            'prof_nama': u.nama_lengkap,
            'prof_hp': u.no_hp,
            'prof_alamat': u.alamat || ''
        };

        for (const [id, value] of Object.entries(mapping)) {
            const input = document.getElementById(id);
            if (input) input.value = value;
        }
    }
}

/**
 * Mengunduh/melihat kontrak dari sisi user
 */
window.lihatKontrakUser = function(id) {
    const token = localStorage.getItem('token');
    if (typeof showLoader === 'function') showLoader();
    fetch(`/api/transaksi/kontrak/${id}`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(async res => {
            if (typeof hideLoader === 'function') hideLoader();
            if(res.ok) {
                const blob = await res.blob();
                window.open(URL.createObjectURL(blob), '_blank');
            } else {
                showToast("Akses ditolak atau kontrak belum tersedia.", "warning");
            }
        })
        .catch(() => {
            if (typeof hideLoader === 'function') hideLoader();
            showToast("Terjadi kesalahan saat mengunduh kontrak.", "error");
        });
}