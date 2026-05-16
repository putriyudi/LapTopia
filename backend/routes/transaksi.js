const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { verifyToken, isUser } = require('../middleware/auth');
const { uploadKTP, handleUploadError } = require('../middleware/upload');
const { checkoutLimiter } = require('../middleware/limiter');

const router = express.Router();

function hitungTotal(hargaPerHari, durasi) {
  return parseFloat(hargaPerHari) * parseInt(durasi);
}

router.post('/booking',
  checkoutLimiter,
  uploadKTP.single('jaminan_ktp'),
  handleUploadError,
  [
    body('id_laptop').isInt({ min: 1 }),
    body('nama_penyewa').trim().isLength({ min: 3 }),
    body('nik_penyewa').notEmpty().withMessage('NIK wajib diisi'),
    body('no_hp_penyewa').notEmpty().withMessage('Nomor HP wajib diisi'),
    body('alamat_penyewa').notEmpty().withMessage('Alamat wajib diisi'),
    body('email_penyewa').isEmail().normalizeEmail(),
    body('tgl_mulai_sewa').isISO8601(),
    body('durasi_hari').isInt({ min: 1, max: 90 }),
    body('payment_method').optional().trim()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      id_laptop, nama_penyewa, nik_penyewa, no_hp_penyewa,
      alamat_penyewa, email_penyewa, tgl_mulai_sewa, durasi_hari, payment_method
    } = req.body;

    let id_user_penyewa = null;
    let final_ktp_path = req.file ? req.file.path : null;

    // Cek apakah request dari user login
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        id_user_penyewa = decoded.id_user;
      } catch { /* token invalid, treat as guest */ }
    }

    try {
      if (id_user_penyewa) {
        const [userRows] = await db.query('SELECT foto_ktp_path FROM users WHERE id_user = ?', [id_user_penyewa]);
        const oldKtpPath = userRows.length ? userRows[0].foto_ktp_path : null;

        if (!final_ktp_path) {
          if (oldKtpPath) {
            final_ktp_path = oldKtpPath;
          } else {
            return res.status(400).json({ success: false, message: 'Anda belum memiliki foto KTP di profil. Harap upload foto KTP Anda.' });
          }
        } else {
          if (oldKtpPath) {
            const fs = require('fs');
            fs.unlink(oldKtpPath, (err) => { if (err) console.error('Gagal hapus KTP lama:', err); });
          }
          await db.query('UPDATE users SET foto_ktp_path = ? WHERE id_user = ?', [final_ktp_path, id_user_penyewa]);
        }
      } else {
        if (!final_ktp_path) {
          return res.status(400).json({ success: false, message: 'Foto KTP/jaminan wajib diupload untuk penyewa Guest.' });
        }
      }

      // Cek laptop tersedia
      const [laptops] = await db.query(
        'SELECT * FROM laptops WHERE id_laptop = ? AND status = "Tersedia"',
        [id_laptop]
      );
      if (!laptops.length) {
        return res.status(409).json({ success: false, message: 'Laptop tidak tersedia.' });
      }

      const laptop = laptops[0];
      const tglMulai   = new Date(tgl_mulai_sewa);
      const tglRencana = new Date(tglMulai);
      tglRencana.setDate(tglRencana.getDate() + parseInt(durasi_hari));
      const total = hitungTotal(laptop.harga_sewa_per_hari, durasi_hari);

      const [result] = await db.query(
        `INSERT INTO transaksi
          (id_user_penyewa, id_laptop, nama_penyewa, nik_penyewa, no_hp_penyewa,
           alamat_penyewa, email_penyewa, jaminan_file_path,
           tgl_mulai_sewa, durasi_hari, tgl_kembali_rencana, total_biaya, status_transaksi, payment_status, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Booking', 'pending', ?)`,
        [
          id_user_penyewa, id_laptop, nama_penyewa, nik_penyewa, no_hp_penyewa,
          alamat_penyewa, email_penyewa, final_ktp_path,
          tglMulai, parseInt(durasi_hari), tglRencana, total, payment_method
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Booking berhasil! Silakan lanjutkan pembayaran.',
        data: {
          id_transaksi:        result.insertId,
          total_biaya:         total,
          tgl_kembali_rencana: tglRencana
        }
      });
    } catch (err) {
      console.error('Booking error:', err);
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// ── RIWAYAT SEWA (user login) ─────────────────────────────
router.get('/riwayat', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.*, l.merk_tipe, l.nomor_seri, l.harga_sewa_per_hari,
              k.file_pdf_path, k.digital_hash
       FROM transaksi t
       JOIN laptops l ON l.id_laptop = t.id_laptop
       LEFT JOIN kontrak_digital k ON k.id_transaksi = t.id_transaksi
       WHERE t.id_user_penyewa = ?
       ORDER BY t.created_at DESC`,
      [req.user.id_user]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── DETAIL TRANSAKSI ──────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.*, l.merk_tipe, l.nomor_seri, l.spesifikasi, l.harga_sewa_per_hari,
              u.nama_lengkap AS kasir_nama,
              k.file_pdf_path, k.digital_hash, k.tgl_generate
       FROM transaksi t
       JOIN laptops l ON l.id_laptop = t.id_laptop
       LEFT JOIN users u ON u.id_user = t.id_kasir
       LEFT JOIN kontrak_digital k ON k.id_transaksi = t.id_transaksi
       WHERE t.id_transaksi = ?`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    const trx = rows[0];

    // User biasa hanya bisa lihat transaksinya sendiri
    if (req.user.role === 'user' && trx.id_user_penyewa !== req.user.id_user) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    res.json({ success: true, data: trx });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── DOWNLOAD KONTRAK PDF (Aman) ───────────────────────────
router.get('/kontrak/:id_transaksi', async (req, res) => {
  try {
    const { id_transaksi } = req.params;
    const { verification_token } = req.query; 
    
    // Cek kontrak di DB
    const [rows] = await db.query(
      `SELECT t.id_user_penyewa, k.file_pdf_path, k.digital_hash 
       FROM transaksi t
       JOIN kontrak_digital k ON k.id_transaksi = t.id_transaksi
       WHERE t.id_transaksi = ?`,
      [id_transaksi]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Kontrak tidak ditemukan.' });
    }

    const { id_user_penyewa, file_pdf_path, digital_hash } = rows[0];

    let isAuthorized = false;

    // 1. Cek JWT Token
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        
        // Admin / Kasir bebas akses
        if (['admin', 'kasir'].includes(decoded.role)) {
          isAuthorized = true;
        } 
        // User hanya bisa akses miliknya sendiri
        else if (decoded.role === 'user' && decoded.id_user === id_user_penyewa) {
          isAuthorized = true;
        }
      } catch (err) {
        // Lanjut cek verification_token
      }
    }

    // 2. Guest via verification_token
    if (!isAuthorized && verification_token && verification_token === digital_hash) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    // Amankan dari Path Traversal
    const path = require('path');
    const safeFilename = path.basename(file_pdf_path);
    const safePath = path.join(__dirname, '../../contracts', safeFilename);

    res.download(safePath);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;