// frontend/js/checkout.js
let currentLaptop = null;
let authData = null;

document.addEventListener('DOMContentLoaded', async () => {
  authData = getAuth();
  const urlParams = new URLSearchParams(window.location.search);
  const laptopId = urlParams.get('id');
  
  if (!laptopId) {
    window.location.href = '/katalog.html';
    return;
  }
  
  document.getElementById('id_laptop').value = laptopId;
  document.getElementById('tgl_mulai_sewa').min = new Date().toISOString().split('T')[0];
  document.getElementById('tgl_mulai_sewa').value = new Date().toISOString().split('T')[0];
  
  // Load Midtrans client key
  const resKey = await apiCall('/config/client-key');
  if (resKey && resKey.status === 200) {
    const script = document.getElementById('midtransScript');
    script.src = "https://app.sandbox.midtrans.com/snap/snap.js";
    script.setAttribute('data-client-key', resKey.data.client_key);
  }
  // Load laptop detail
  showLoader();
  const resLap = await apiCall(`/laptops/${laptopId}`);
  if (resLap && resLap.status === 200) {
    currentLaptop = resLap.data.data;
    document.getElementById('sum_merk').innerText = currentLaptop.merk_tipe;
    document.getElementById('sum_seri').innerText = `SN: ${currentLaptop.nomor_seri}`;
    document.getElementById('sum_price_per_day').innerText = formatRupiah(currentLaptop.harga_sewa_per_hari);
    calcTotal();
  } else {
    alert("Laptop tidak ditemukan");
    window.location.href = '/katalog.html';
  }
  hideLoader();
  // Handle Form Autofill & KTP input requirement
  const ktpInput = document.getElementById('jaminan_ktp');
  const ktpSection = document.getElementById('guestKtpSection');
  
  if (authData && authData.user.role === 'user') {
    // Autofill
    document.getElementById('nama_penyewa').value = authData.user.nama_lengkap;
    document.getElementById('nik_penyewa').value = authData.user.nik || '';
    document.getElementById('no_hp_penyewa').value = authData.user.no_hp;
    document.getElementById('email_penyewa').value = authData.user.email;
    document.getElementById('alamat_penyewa').value = authData.user.alamat || '';
    
    // Hide KTP upload (using profile's KTP implicitly via token in backend)
    ktpSection.style.display = 'none';
    ktpInput.removeAttribute('required');
    
    document.getElementById('authStatusText').innerHTML = `Anda login sebagai <strong>${authData.user.nama_lengkap}</strong>. Data telah diisi otomatis.`;
  } else {
    ktpInput.setAttribute('required', 'required');
    document.getElementById('authStatusText').innerHTML = `Sewa sebagai Guest. <a href="/login.html">Login</a> untuk isi otomatis.`;
  }
});

function calcTotal() {
  if (!currentLaptop) return;
  const durasi = parseInt(document.getElementById('durasi_hari').value) || 0;
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
  if(ktpInput.files.length === 0) {
    document.getElementById('guestKtpSection').style.display = 'block';
    showToast("Harap upload foto KTP untuk transaksi ini.", "error");
    ktpInput.focus();
    return;
  }
  showLoader();
  // 1. Buat Booking
  const resBook = await apiCall('/transaksi/booking', 'POST', formData, true);
  hideLoader();
  
  if (resBook && resBook.status === 201) {
    const id_transaksi = resBook.data.data.id_transaksi;
    
    // 2. Minta Token Midtrans
    showLoader();
    const resToken = await apiCall('/payment/create-token', 'POST', { id_transaksi });
    hideLoader();
    
    if (resToken && resToken.status === 200) {
      const snapToken = resToken.data.snap_token;
      
      window.snap.pay(snapToken, {
        onSuccess: function(result){
          showToast("Pembayaran Berhasil!", "success");
          setTimeout(() => {
            window.location.href = authData ? '/dashboard-user.html' : '/';
          }, 2000);
        },
        onPending: function(result){
          showToast("Menunggu pembayaran...", "warning");
          setTimeout(() => {
            window.location.href = authData ? '/dashboard-user.html' : '/';
          }, 2000);
        },
        onError: function(result){
          showToast("Pembayaran gagal.", "error");
        },
        onClose: function(){
          showToast("Anda menutup popup sebelum membayar.", "warning");
          if(authData && authData.user.role === 'user') {
             setTimeout(() => { window.location.href = '/dashboard-user.html'; }, 1000);
          }
        }
      });
    } else {
      showToast(resToken?.data?.message || "Gagal membuat token pembayaran.", "error");
    }
  } else {
    if(resBook?.data?.errors) {
       showToast(resBook.data.errors[0].msg, "error");
    } else {
       showToast(resBook?.data?.message || "Gagal membuat booking.", "error");
    }
  }
}
