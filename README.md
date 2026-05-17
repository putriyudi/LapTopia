# 🖥️ LapTopia — POS Rental Laptop

Aplikasi Point-of-Sale rental laptop berbasis web dengan fitur:
- **Multi-role**: Admin, Kasir, User
- **Payment Gateway**: Midtrans Sandbox (Snap)
- **Kontrak PDF Digital** dengan hash SHA-256
- **Dashboard** Admin, Kasir, dan User
- **Manajemen laptop**, booking, serah-terima, pengembalian
- **Laporan transaksi** dengan filter tanggal & status
- **Security**: JWT, bcrypt, helmet, rate-limiter, CORS, input validation

---

## 📋 Prasyarat

| Kebutuhan | Versi Minimum |
|-----------|---------------|
| Node.js   | 18.x atau lebih baru |
| MySQL     | 8.0 atau MariaDB 10.6 |
| npm       | 9.x |

---

## 🚀 Langkah Instalasi

### 1. Clone / Ekstrak Project

```bash
# Jika dari ZIP:
unzip LapTopia-main.zip
cd LapTopia-main
```

### 2. Install Dependencies

```bash
npm install
```

Perintah ini akan menginstall semua dependencies termasuk `nodemon` (dev).

### 3. Konfigurasi Environment

```bash
cp .env.example .env
```

Buka `.env` dan isi semua nilai:

```env
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000

# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password_mysql_anda
DB_NAME=laptoprent

# JWT — generate dengan:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=random_string_64_karakter_minimal

# Midtrans Sandbox (lihat bagian Testing Midtrans)
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxx

MAX_FILE_SIZE_MB=5
```

### 4. Import Database

Buka MySQL client (phpMyAdmin, DBeaver, atau terminal):

```bash
mysql -u root -p < database.sql
```

Atau via MySQL terminal:

```sql
SOURCE /path/ke/LapTopia-main/database.sql;
```

> **Catatan**: Script SQL sudah menyertakan `CREATE DATABASE IF NOT EXISTS laptoprent`
> dan seed data dengan password yang sudah di-hash bcrypt.
> Aman dijalankan ulang (menggunakan `INSERT IGNORE`).

### 5. Jalankan Server

**Development** (auto-restart dengan nodemon):
```bash
npm run dev
```

**Production**:
```bash
npm start
```

Server berjalan di: **http://localhost:3000**

---

## 🔑 Akun Default

| Role  | Email                        | Password    |
|-------|------------------------------|-------------|
| Admin | admin@laptoprent.com         | Admin@1234  |
| Kasir | kasir@laptoprent.com         | Kasir@1234  |

> Password sudah di-hash bcrypt di `database.sql`. Jika login gagal, jalankan:
> ```bash
> node fix-db.js
> ```

---

## 🌐 Halaman Aplikasi

| Halaman | URL | Akses |
|---------|-----|-------|
| Landing / Katalog | http://localhost:3000 | Publik |
| Login | http://localhost:3000/login.html | Publik |
| Register | http://localhost:3000/register.html | Publik |
| Katalog Laptop | http://localhost:3000/katalog.html | Publik |
| Checkout | http://localhost:3000/checkout.html?id={id_laptop} | Publik / User |
| Dashboard User | http://localhost:3000/dashboard-user.html | User |
| Dashboard Kasir | http://localhost:3000/kasir/ | Kasir, Admin |
| Dashboard Admin | http://localhost:3000/admin/ | Admin |

---

## 💳 Testing Midtrans Sandbox

### Setup
1. Daftar di https://dashboard.sandbox.midtrans.com
2. Login → Settings → Access Keys
3. Salin **Sandbox Server Key** dan **Client Key** ke `.env`

### Kartu Test (Sandbox)

| Keterangan | Nomor Kartu | CVV | Expired |
|------------|-------------|-----|---------|
| Sukses | 4811 1111 1111 1114 | 123 | 01/25 |
| Ditolak | 4911 1111 1111 1113 | 123 | 01/25 |
| Challenge (OTP) | 4050 0000 0000 1234 | 123 | 01/25 |

### Webhook Midtrans (Development)

Untuk menerima notifikasi pembayaran secara lokal, gunakan [ngrok](https://ngrok.com):

```bash
# Install ngrok, lalu:
ngrok http 3000

# Copy URL ngrok, misal: https://abc123.ngrok.io
# Masukkan ke Midtrans Dashboard:
# Settings → Configuration → Payment Notification URL:
# https://abc123.ngrok.io/api/payment/notification
```

> Tanpa webhook, konfirmasi pembayaran dilakukan **manual oleh Kasir** via:
> Dashboard Kasir → Daftar Booking → Konfirmasi Pembayaran

### Alur Testing Lengkap

```
1. Buka http://localhost:3000/katalog.html
2. Pilih laptop → Klik "Sewa Sekarang"
3. Isi form checkout → Klik "Lanjutkan Pembayaran"
4. Bayar via Midtrans Snap (gunakan kartu test di atas)
5. Login sebagai Kasir → Lihat booking baru
6. Klik "Konfirmasi Pembayaran" (jika tanpa webhook)
7. Klik "Serah Terima" → Generate kontrak PDF
8. Download kontrak PDF
9. Proses "Pengembalian" saat laptop kembali
10. Login Admin → Lihat laporan transaksi
```

---

## 📁 Struktur Project

```
LapTopia-main/
├── backend/
│   ├── server.js              # Entry point Express
│   ├── db.js                  # MySQL connection pool
│   ├── middleware/
│   │   ├── auth.js            # JWT verify, role guard
│   │   ├── limiter.js         # Rate limiter
│   │   └── upload.js          # Multer KTP upload
│   ├── routes/
│   │   ├── auth.js            # /api/auth/*
│   │   ├── laptops.js         # /api/laptops/*
│   │   ├── transaksi.js       # /api/transaksi/*
│   │   ├── kasir.js           # /api/kasir/*
│   │   ├── admin.js           # /api/admin/*
│   │   ├── payment.js         # /api/payment/* + webhook Midtrans
│   │   └── otp.js             # /api/otp/*
│   └── utils/
│       ├── contract.js        # Generate PDF kontrak
│       └── hash.js            # bcrypt helpers
├── frontend/
│   ├── index.html             # Landing page
│   ├── login.html
│   ├── register.html
│   ├── katalog.html
│   ├── checkout.html
│   ├── dashboard-user.html
│   ├── admin/index.html       # Dashboard admin
│   ├── kasir/index.html       # Dashboard kasir
│   ├── css/style.css
│   └── js/
│       ├── api.js             # Core API client & auth helpers
│       ├── login.js
│       ├── register.js
│       ├── katalog.js
│       ├── checkout.js
│       ├── dashboard-user.js
│       ├── dashboard-admin.js
│       └── dashboard-kasir.js
├── contracts/                 # PDF kontrak (auto-created)
├── uploads/ktp/               # Foto KTP (auto-created)
├── database.sql               # Schema + seed data
├── .env.example               # Template environment
├── fix-db.js                  # Script reset password
├── reset-default-passwords.js # Script reset password (alternatif)
├── package.json
└── README.md
```

---

## 🔒 Fitur Keamanan

| Fitur | Implementasi |
|-------|-------------|
| Autentikasi | JWT (7 hari) |
| Password | bcrypt cost=12 |
| Role Guard | Admin / Kasir / User |
| Rate Limiting | 20 req/15min (auth), 5 req/15min (checkout) |
| HTTP Headers | Helmet (CSP, HSTS, etc.) |
| Input Validation | express-validator |
| File Upload | Multer — hanya jpg/png/webp, maks 5MB |
| Path Traversal | `path.basename()` sebelum serve file |
| SQL Injection | Parameterized queries (mysql2) |
| CORS | Whitelist origin |
| Webhook Verification | Signature key SHA-512 (Midtrans) |
| Kontrak Integritas | SHA-256 hash pada PDF + data |

---

## 🛠️ Script Utility

```bash
# Reset password default ke bcrypt hash (jika login gagal)
node fix-db.js

# Alternatif reset password
node reset-default-passwords.js

# Migrate tabel OTP (sudah termasuk di database.sql)
node migrate-otp.js
```

---

## ❓ Troubleshooting

**Login selalu gagal:**
```bash
node fix-db.js
```

**Error: ER_NO_SUCH_TABLE 'otp_ktp':**
```bash
mysql -u root -p laptoprent < database.sql
# atau:
node migrate-otp.js
```

**Error: ENOENT uploads/ktp:**
```bash
mkdir -p uploads/ktp contracts
```

**Midtrans: Invalid server key:**
- Pastikan `.env` sudah berisi `MIDTRANS_SERVER_KEY` dan `MIDTRANS_CLIENT_KEY`
- Pastikan menggunakan key Sandbox (prefix `SB-`)

**Port 3000 sudah terpakai:**
```bash
PORT=3001 npm run dev
```
