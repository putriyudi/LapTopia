// backend/server.js — LaptopRent Main Server
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const fs      = require('fs');

const app = express();

// ── SECURITY MIDDLEWARE ───────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://app.sandbox.midtrans.com", "https://app.midtrans.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      frameSrc:   ["'self'", "https://app.sandbox.midtrans.com", "https://app.midtrans.com"],
      connectSrc: ["'self'", "https://app.sandbox.midtrans.com", "https://app.midtrans.com"],
      imgSrc:     ["'self'", "data:", "blob:", "https://*"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.APP_URL
    : ['http://localhost:3000', 'http://127.0.0.1:3000',
       'http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── PASTIKAN FOLDER ADA ───────────────────────────────────────
const dirsToEnsure = [
  path.join(__dirname, '../uploads/ktp'),
  path.join(__dirname, '../uploads/laptops'),  // ← folder foto laptop
  path.join(__dirname, '../contracts')
];
dirsToEnsure.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── STATIC FILES ──────────────────────────────────────────────
// Foto laptop bersifat publik — dapat diakses tanpa autentikasi
app.use('/uploads/laptops', express.static(path.join(__dirname, '../uploads/laptops')));

// Static frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API ROUTES ────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/laptops',   require('./routes/laptops'));
app.use('/api/transaksi', require('./routes/transaksi'));
app.use('/api/kasir',     require('./routes/kasir'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/payment',   require('./routes/payment'));
app.use('/api/otp',       require('./routes/otp'));

// ── PROTECTED FILE ENDPOINTS ──────────────────────────────────
const { verifyToken, isKasir } = require('./middleware/auth');

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

// ── MIDTRANS CLIENT KEY (untuk frontend) ─────────────────────
app.get('/api/config/client-key', (req, res) => {
  res.json({ client_key: process.env.MIDTRANS_CLIENT_KEY || '' });
});

// ── SPA FALLBACK ─────────────────────────────────────────────
app.get(/(.*)/, (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/files/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── GLOBAL ERROR HANDLER ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║          🚀  LaptopRent Server Running            ║
║   http://localhost:${PORT}                            ║
╠═══════════════════════════════════════════════════╣
║  Mode     : ${(process.env.NODE_ENV || 'development').padEnd(35)}║
║  Database : ${(process.env.DB_NAME + '@' + process.env.DB_HOST).padEnd(35)}║
╚═══════════════════════════════════════════════════╝

Akun default:
  👑 Admin  → admin@laptoprent.com  / Admin@1234
  🧑 Kasir  → kasir@laptoprent.com  / Kasir@1234
  `);
});

module.exports = app;
