// backend/routes/kasir.js
const express  = require('express');
const path     = require('path');
const db       = require('../db');
const { verifyToken, isKasir } = require('../middleware/auth');
const { generateKontrak }      = require('../utils/contract');

const router = express.Router();

// ── GET SEMUA BOOKING (Kasir dashboard) ───────────────────
router.get('/bookings', verifyToken, isKasir, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where  = [];
    let params = [];

    if (status) {
      where.push('t.status_transaksi = ?');
      params.push(status);
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM transaksi t ${whereStr}`, params
    );

    const [rows] = await db.query(
      `SELECT t.*, l.merk_tipe, l.nomor_seri, l.status AS laptop_status
       FROM transaksi t
       JOIN laptops l ON l.id_laptop = t.id_laptop
       ${whereStr}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({ success: true, data: rows, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    console.error('GET bookings kasir:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── VERIFIKASI & SERAH TERIMA ────────────────────────────
// Kasir mengkonfirmasi KTP asli OK + memilih unit laptop
// Status: Booking → Aktif, Laptop: Tersedia → Disewa
router.post('/serah-terima/:id_transaksi', verifyToken, isKasir, async (req, res) => {
  const { id_transaksi } = req.params;
  const { jaminan_fisik, id_laptop_aktual } = req.body; // Kasir bisa assign unit fisik beda

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Cek transaksi
    const [[trx]] = await conn.query(
      'SELECT * FROM transaksi WHERE id_transaksi = ? FOR UPDATE',
      [id_transaksi]
    );

    if (!trx) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    if (trx.status_transaksi !== 'Booking') {
      await conn.rollback();
      return res.status(409).json({ success: false, message: `Status transaksi saat ini: ${trx.status_transaksi}. Serah terima hanya untuk status Booking.` });
    }

    if (trx.payment_status !== 'paid') {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Pembayaran belum dikonfirmasi.' });
    }

    let final_id_laptop = trx.id_laptop;

    // Jika Kasir mengubah unit fisik (misal unit yg dibooking bermasalah)
    if (id_laptop_aktual && id_laptop_aktual != trx.id_laptop) {
      // Pastikan unit baru tersedia
      const [[newLaptop]] = await conn.query('SELECT status FROM laptops WHERE id_laptop = ? FOR UPDATE', [id_laptop_aktual]);
      if (!newLaptop || newLaptop.status !== 'Tersedia') {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Unit laptop pengganti tidak tersedia atau tidak ditemukan.' });
      }
      final_id_laptop = id_laptop_aktual;
    }

    // Update transaksi → Aktif
    await conn.query(
      `UPDATE transaksi
       SET status_transaksi = 'Aktif',
           id_kasir = ?,
           jaminan_fisik = ?,
           id_laptop = ?
       WHERE id_transaksi = ?`,
      [req.user.id_user, jaminan_fisik || null, final_id_laptop, id_transaksi]
    );

    // Update laptop → Disewa
    await conn.query(
      `UPDATE laptops SET status = 'Disewa' WHERE id_laptop = ?`,
      [final_id_laptop]
    );

    // Jika unit diganti, rilis laptop lama kembali ke Tersedia
    if (final_id_laptop != trx.id_laptop) {
      await conn.query(
        `UPDATE laptops SET status = 'Tersedia' WHERE id_laptop = ?`,
        [trx.id_laptop]
      );
    }

    await conn.commit();

    // Generate kontrak PDF
    const [laptopRows] = await conn.query('SELECT * FROM laptops WHERE id_laptop = ?', [final_id_laptop]);
    const laptop = laptopRows[0];

    const kontrakData = {
      ...trx,
      merk_tipe:    laptop.merk_tipe,
      nomor_seri:   laptop.nomor_seri,
      spesifikasi:  laptop.spesifikasi,
      kasir_nama:   req.user.nama_lengkap,
      jaminan_fisik
    };

    const { filePath, filename, hash } = await generateKontrak(kontrakData);
    const relativePath = path.relative(path.join(__dirname, '../../'), filePath);

    // Simpan atau update kontrak digital
    await db.query(
      `INSERT INTO kontrak_digital (id_transaksi, file_pdf_path, digital_hash)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE file_pdf_path = VALUES(file_pdf_path), digital_hash = VALUES(digital_hash)`,
      [id_transaksi, relativePath, hash]
    );

    res.json({
      success: true,
      message: 'Serah terima berhasil. Kontrak digital telah digenerate.',
      data: { filename, hash }
    });
  } catch (err) {
    await conn.rollback();
    console.error('Serah terima error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
  }
});

// ── PROSES PENGEMBALIAN ───────────────────────────────────
// Status: Aktif/Terlambat → Selesai, Laptop: Disewa → Tersedia / Maintenance
router.post('/pengembalian/:id_transaksi', verifyToken, isKasir, async (req, res) => {
  const { id_transaksi } = req.params;
  const { kondisi_catatan, denda_tambahan = 0, status_unit = 'Tersedia' } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[trx]] = await conn.query(
      'SELECT * FROM transaksi WHERE id_transaksi = ? FOR UPDATE',
      [id_transaksi]
    );

    if (!trx) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    if (!['Aktif', 'Terlambat'].includes(trx.status_transaksi)) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: `Status saat ini: ${trx.status_transaksi}. Hanya Aktif/Terlambat yang bisa diproses.`
      });
    }

    const now       = new Date();
    const rencana   = new Date(trx.tgl_kembali_rencana);
    
    // Gunakan tanggal tanpa jam agar hitungan terlambat lebih adil
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rencanaDay = new Date(rencana.getFullYear(), rencana.getMonth(), rencana.getDate());
    const terlambat = nowDay > rencanaDay;

    // Hitung denda otomatis (10% harga per hari × hari terlambat)
    let dendaAuto = 0;
    if (terlambat) {
      const hariTerlambat = Math.ceil((nowDay - rencanaDay) / (1000 * 60 * 60 * 24));
      const [laptopRows] = await conn.query('SELECT harga_sewa_per_hari FROM laptops WHERE id_laptop = ?', [trx.id_laptop]);
      dendaAuto = hariTerlambat * parseFloat(laptopRows[0].harga_sewa_per_hari) * 0.1;
    }

    const totalDenda = dendaAuto + Number(denda_tambahan);

    await conn.query(
      `UPDATE transaksi
       SET status_transaksi = 'Selesai',
           tgl_kembali_aktual = NOW(),
           denda = ?
       WHERE id_transaksi = ?`,
      [totalDenda, id_transaksi]
    );

    // Laptop kembali Tersedia atau Maintenance
    const finalStatusUnit = ['Tersedia', 'Maintenance'].includes(status_unit) ? status_unit : 'Tersedia';
    await conn.query(
      `UPDATE laptops SET status = ? WHERE id_laptop = ?`,
      [finalStatusUnit, trx.id_laptop]
    );

    await conn.commit();

    res.json({
      success: true,
      message: 'Pengembalian berhasil diproses.',
      data: {
        tgl_kembali_aktual: now,
        terlambat,
        denda_otomatis: dendaAuto,
        denda_tambahan: Number(denda_tambahan),
        total_denda: totalDenda
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('Pengembalian error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
  }
});

// ── LIHAT KTP (Protected Blob URL) ────────────────────────
router.get('/ktp/:id_transaksi', verifyToken, isKasir, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT jaminan_file_path FROM transaksi WHERE id_transaksi = ?', [req.params.id_transaksi]);
    if (!rows.length || !rows[0].jaminan_file_path) {
      return res.status(404).json({ success: false, message: 'KTP tidak ditemukan.' });
    }
    const filePath = path.join(__dirname, '../../', rows[0].jaminan_file_path);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── DOWNLOAD KONTRAK PDF ──────────────────────────────────
router.get('/kontrak/:id_transaksi', verifyToken, isKasir, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM kontrak_digital WHERE id_transaksi = ?',
      [req.params.id_transaksi]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Kontrak belum digenerate.' });
    }

    // Amankan dari Path Traversal
    const safeFilename = path.basename(rows[0].file_pdf_path);
    const filePath = path.join(__dirname, '../../contracts', safeFilename);
    
    res.download(filePath);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── CRON-LIKE: Tandai transaksi terlambat ─────────────────
router.post('/check-terlambat', verifyToken, isKasir, async (req, res) => {
  try {
    const [result] = await db.query(
      `UPDATE transaksi
       SET status_transaksi = 'Terlambat'
       WHERE status_transaksi = 'Aktif'
         AND tgl_kembali_rencana < NOW()`
    );
    res.json({ success: true, message: `${result.affectedRows} transaksi ditandai Terlambat.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── KONFIRMASI PEMBAYARAN MANUAL ──────────────────────────
// Kasir mengonfirmasi pembayaran jika Midtrans gagal atau bayar cash
router.post('/konfirmasi-pembayaran/:id_transaksi', verifyToken, isKasir, async (req, res) => {
  const { id_transaksi } = req.params;
  try {
    const [result] = await db.query(
      `UPDATE transaksi
       SET payment_status = 'paid'
       WHERE id_transaksi = ? AND status_transaksi = 'Booking'`,
      [id_transaksi]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan atau tidak dalam status Booking.' });
    }

    res.json({ success: true, message: 'Pembayaran berhasil dikonfirmasi secara manual.' });
  } catch (err) {
    console.error('Konfirmasi pembayaran error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;