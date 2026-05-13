// backend/server.js — LaptopRent Main Server
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const fs         = require('fs');

const app = express();

// ── SECURITY MIDDLEWARE ───────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.APP_URL
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500'],
  credentials: true
}));

// Rate limiter global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak request. Coba lagi setelah 15 menit.' }
}));

// Rate limiter ketat untuk auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi setelah 15 menit.' }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── STATIC FILES ──────────────────────────────────────────
// Frontend pages (publik)
app.use(express.static(path.join(__dirname, '../frontend')));

// ⚠️  PENTING: Upload & contracts TIDAK diekspos publik lewat static!
// Akses hanya via endpoint protected di bawah

// ── API ROUTES ────────────────────────────────────────────
// app.use('/api/auth',      authLimiter); // Dinonaktifkan sementara untuk testing
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/laptops',   require('./routes/laptops'));
app.use('/api/transaksi', require('./routes/transaksi'));
app.use('/api/kasir',     require('./routes/kasir'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/payment',   require('./routes/payment'));

// ── PROTECTED FILE ENDPOINTS ──────────────────────────────
const { verifyToken, isKasir, isAdmin } = require('./middleware/auth');

// Download kontrak PDF (kasir/admin saja)
app.get('/files/kontrak/:filename', verifyToken, isKasir, (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(__dirname, '../contracts', safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File tidak ditemukan.' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.sendFile(filePath);
});

// Preview foto KTP (kasir/admin saja)
app.get('/files/ktp/:filename', verifyToken, isKasir, (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(__dirname, '../uploads/ktp', safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File tidak ditemukan.' });
  }
  res.sendFile(filePath);
});

// ── MIDTRANS SNAP CLIENT KEY (untuk frontend) ─────────────
app.get('/api/config/client-key', (req, res) => {
  res.json({ client_key: process.env.MIDTRANS_CLIENT_KEY });
});

// ── SPA FALLBACK (semua route ke index.html) ─────────────
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── GLOBAL ERROR HANDLER ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── START ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║        🚀  LaptopRent Server Running          ║
║   http://localhost:${PORT}                        ║
╠═══════════════════════════════════════════════╣
║  Mode     : ${process.env.NODE_ENV || 'development'}                       ║
║  Database : ${process.env.DB_NAME}@${process.env.DB_HOST}           ║
╚═══════════════════════════════════════════════╝

Akun default:
  👑 Admin  → admin@laptoprent.com  / Admin@1234
  🧑 Kasir  → kasir@laptoprent.com  / Kasir@1234
  `);
});

module.exports = app;