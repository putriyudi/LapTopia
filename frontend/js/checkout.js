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
    const ktpInput   = document.getElementById('jaminan_ktp');

    if (authData && authData.user.role === 'user') {
        // Load profil terbaru dari server (agar foto_ktp_path terbaca)
        const resProfile = await apiCall('/auth/profile');
        const profileData = (resProfile && resProfile.status === 200) ? resProfile.data.data : null;
        const u = profileData || authData.user;

        document.getElementById('nama_penyewa').value  = u.nama_lengkap || '';
        document.getElementById('nik_penyewa').value   = u.nik          || '';
        document.getElementById('no_hp_penyewa').value = u.no_hp        || '';
        document.getElementById('email_penyewa').value = u.email        || '';
        document.getElementById('alamat_penyewa').value = u.alamat      || '';

        // Buat KTP opsional
        ktpInput.removeAttribute('required');

        // Tampilkan status KTP tersimpan
        const hasKtp    = !!(u.foto_ktp_path);
        const ktpLabel  = document.querySelector('#guestKtpSection label');
        if (ktpLabel) {
            if (hasKtp) {
                ktpLabel.innerHTML = '📎 Ganti Foto KTP <span style="font-size:0.78rem;color:#16a34a;font-weight:600;">(KTP sudah tersimpan di profil — upload baru untuk mengganti)</span>';
            } else {
                ktpLabel.innerHTML = '📎 Upload Foto KTP Asli <span style="font-size:0.78rem;color:#d97706;font-weight:600;">(Belum ada di profil — upload sekarang)</span>';
            }
        }
        document.getElementById('authStatusText').innerHTML =
            `Login sebagai <strong>${u.nama_lengkap}</strong>. Data otomatis terisi.` +
            (hasKtp ? ' <span style="color:#16a34a;">✓ KTP tersimpan</span>' : ' <span style="color:#d97706;">⚠ KTP belum ada</span>');
    } else {
        ktpInput.setAttribute('required', 'required');
        document.getElementById('authStatusText').innerHTML =
            `Sewa sebagai Guest. <a href="/login.html">Login</a> untuk isi otomatis.`;
    }

    // Aktifkan / nonaktifkan tombol submit berdasar checkbox TnC
    const tncCheck = document.getElementById('tnc_agree');
    const btnSubmit = document.getElementById('btn-submit');
    if (tncCheck && btnSubmit) {
        function syncTncBtn() {
            btnSubmit.disabled = !tncCheck.checked;
            btnSubmit.style.opacity = tncCheck.checked ? '1' : '0.5';
            btnSubmit.style.cursor  = tncCheck.checked ? 'pointer' : 'not-allowed';
        }
        syncTncBtn(); // set initial state
        tncCheck.addEventListener('change', syncTncBtn);
    }
});

function calcTotal() {
    if (!currentLaptop) return;
    const durasi = parseInt(document.getElementById('durasi_hari').value) || 1;
    const total = durasi * currentLaptop.harga_sewa_per_hari;
    document.getElementById('sum_durasi_label').innerText = `${durasi} Hari`;
    document.getElementById('sum_total_price').innerText = formatRupiah(total);
}

// Fungsi Utama: Submit Checkout & Bayar
window.submitCheckout = async function() {
    console.log('Checkout process started...');
    const btn = document.getElementById('btn-submit');
    const form = document.getElementById('checkoutForm');
    
    if (!form.checkValidity()) {
        console.log('Form validation failed');
        form.reportValidity();
        return;
    }

    // Validasi checkbox TnC
    const tncCheck = document.getElementById('tnc_agree');
    if (tncCheck && !tncCheck.checked) {
        showToast('Harap centang persetujuan syarat & ketentuan terlebih dahulu.', 'warning');
        document.getElementById('tnc_agree').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const ktpInput = document.getElementById('jaminan_ktp');
    // Validasi KTP tambahan hanya untuk Guest
    if (!authData && ktpInput.files.length === 0) {
        showToast("Pilih foto KTP dulu ges!", "warning");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Memproses...";

    try {
        // 1. Simpan Transaksi ke Database
        const formData = new FormData(form);
        
        // Kirim data Booking ke Backend
        const resBook = await apiCall('/transaksi/booking', 'POST', formData, true);
        
        console.log('Booking Result:', resBook);
        
        if (resBook && resBook.status === 201) {
            const transId = resBook.data.data.id_transaksi;
            console.log('Transaction ID:', transId);
            
            // 2. Minta Token Midtrans pake ID transaksi yang baru dibikin
            const resToken = await apiCall('/payment/create-token', 'POST', { id_transaksi: transId });
            console.log('Token Result:', resToken);
            
            if (resToken && resToken.status === 200 && resToken.data.success) {
                console.log('Snap Token:', resToken.data.snap_token);
                // 3. Panggil Snap Pop-up Midtrans
                window.snap.pay(resToken.data.snap_token, {
                    onSuccess: function (result) {
                        showToast("Pembayaran berhasil ges! Silahkan pickup di store ya.", "success");
                        setTimeout(() => { window.location.href = '/dashboard-user.html'; }, 2500);
                    },
                    onPending: function (result) {
                        showToast("Pembayaran pending. Selesaikan segera ya!", "info");
                        setTimeout(() => { window.location.href = '/dashboard-user.html'; }, 2500);
                    },
                    onError: function (result) {
                        showToast("Yah, pembayaran gagal.", "error");
                        btn.disabled = false;
                        btn.innerText = "Lanjut Pembayaran";
                    },
                    onClose: function () {
                        showToast("Loh kok ditutup popupnya? Selesaikan pembayaran lu di Dashboard ya ges.", "warning");
                        setTimeout(() => { window.location.href = '/dashboard-user.html'; }, 2500);
                    }
                });
            } else {
                showToast("Gagal dapet token pembayaran: " + (resToken?.data?.message || "Unknown error"), "error");
                btn.disabled = false;
                btn.innerText = "Lanjut Pembayaran";
            }
        } else {
            let msg = "Gagal buat transaksi";
            if (resBook.data && resBook.data.errors) {
                msg = resBook.data.errors.map(e => `${e.path}: ${e.msg}`).join(', ');
            } else if (resBook.data && resBook.data.message) {
                msg = resBook.data.message;
            }
            throw new Error(msg);
        }

    } catch (err) {
        console.error(err);
        showToast("Error: " + err.message, "error");
        btn.disabled = false;
        btn.innerText = "Lanjut Pembayaran";
    }
}