/* frontend/js/checkout.js */
let currentLaptop = null;
let authData = null;

document.addEventListener('DOMContentLoaded', async () => {
    authData = getAuth(); // Fungsi dari api.js
    const urlParams = new URLSearchParams(window.location.search);
    const laptopId = urlParams.get('id');
    
    if (!laptopId) {
        window.location.href = '/dashboard-user.html';
        return;
    }
    
    document.getElementById('id_laptop').value = laptopId;
    
    // Set minimal tanggal sewa adalah hari ini
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('tgl_mulai_sewa');
    dateInput.min = today;
    dateInput.value = today;

    // Load Midtrans client key dari server
    const resKey = await apiCall('/config/client-key');
    if (resKey && resKey.status === 200) {
        const script = document.getElementById('midtransScript');
        script.src = "https://app.sandbox.midtrans.com/snap/snap.js";
        script.setAttribute('data-client-key', resKey.data.client_key);
    }

    // Load data detail laptop
    showLoader();
    const resLap = await apiCall(`/laptops/${laptopId}`);
    if (resLap && resLap.status === 200) {
        currentLaptop = resLap.data.data;
        document.getElementById('sum_merk').innerText = currentLaptop.merk_tipe;
        document.getElementById('sum_seri').innerText = `SN: ${currentLaptop.nomor_seri}`;
        document.getElementById('sum_price_per_day').innerText = formatRupiah(currentLaptop.harga_sewa_per_hari);
        calcTotal();
    } else {
        showToast("Gagal memuat detail laptop.", "error");
    }
    hideLoader();

    // Logika Autofill & Validasi KTP
    const ktpSection = document.getElementById('guestKtpSection');
    const ktpInput = document.getElementById('jaminan_ktp');
    
    if (authData && authData.user.role === 'user') {
        const u = authData.user;
        document.getElementById('nama_penyewa').value = u.nama_lengkap;
        document.getElementById('nik_penyewa').value = u.nik || '';
        document.getElementById('no_hp_penyewa').value = u.no_hp;
        document.getElementById('email_penyewa').value = u.email;
        document.getElementById('alamat_penyewa').value = u.alamat || '';
        
        // Sembunyikan upload KTP karena user login diasumsikan sudah verifikasi profil
        ktpSection.style.display = 'none';
        ktpInput.removeAttribute('required');
        document.getElementById('authStatusText').innerHTML = `Login sebagai <strong>${u.nama_lengkap}</strong>. Data otomatis terisi.`;
    } else {
        ktpInput.setAttribute('required', 'required');
        document.getElementById('authStatusText').innerHTML = `Sewa sebagai Guest. <a href="/login.html">Login</a> untuk isi otomatis.`;
    }
});

function calcTotal() {
    if (!currentLaptop) return;
    const durasi = parseInt(document.getElementById('durasi_hari').value) || 1;
    const total = durasi * currentLaptop.harga_sewa_per_hari;
    document.getElementById('sum_durasi_label').innerText = `${durasi} Hari`;
    document.getElementById('sum_total_price').innerText = formatRupiah(total);
}

async function submitCheckout() {
    const form = document.getElementById('checkoutForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const formData = new FormData(form);
    const ktpInput = document.getElementById('jaminan_ktp');

    // Validasi KTP tambahan hanya untuk Guest
    if (!authData && ktpInput.files.length === 0) {
        showToast("Harap upload foto KTP Anda.", "error");
        return;
    }

    showLoader();
    
    // 1. Kirim data Booking ke Backend
    const resBook = await apiCall('/transaksi/booking', 'POST', formData, true);
    
    if (resBook && resBook.status === 201) {
        const id_transaksi = resBook.data.data.id_transaksi;
        
        // 2. Buat Transaksi Midtrans
        const resToken = await apiCall('/payment/create-token', 'POST', { id_transaksi });
        hideLoader();
        
        if (resToken && resToken.status === 200) {
            window.snap.pay(resToken.data.snap_token, {
                onSuccess: function(result) {
                    showToast("Pembayaran Berhasil!", "success");
                    setTimeout(() => { window.location.href = '/dashboard-user.html'; }, 2000);
                },
                onPending: function(result) {
                    showToast("Menunggu pembayaran...", "warning");
                    setTimeout(() => { window.location.href = '/dashboard-user.html'; }, 2000);
                },
                onError: function(result) {
                    showToast("Gagal melakukan pembayaran.", "error");
                }
            });
        } else {
            showToast("Gagal mendapatkan token pembayaran.", "error");
        }
    } else {
        hideLoader();
        const msg = resBook?.data?.message || "Terjadi kesalahan saat booking.";
        showToast(msg, "error");
    }
}