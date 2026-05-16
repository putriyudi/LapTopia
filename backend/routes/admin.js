// backend/routes/admin.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { verifyToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// ── DASHBOARD STATS ───────────────────────────────────────
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const [[laptopStats]] = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'Tersedia')   AS tersedia,
        SUM(status = 'Disewa')     AS disewa,
        SUM(status = 'Maintenance') AS maintenance
      FROM laptops
    `);

    const [[trxStats]] = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status_transaksi = 'Booking')    AS booking,
        SUM(status_transaksi = 'Aktif')      AS aktif,
        SUM(status_transaksi = 'Selesai')    AS selesai,
        SUM(status_transaksi = 'Terlambat')  AS terlambat,
        SUM(status_transaksi = 'Dibatalkan') AS dibatalkan,
        SUM(CASE WHEN payment_status = 'paid' THEN total_biaya + denda ELSE 0 END) AS total_pendapatan
      FROM transaksi
    `);

    const [[userStats]] = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(role = 'user')  AS users,
        SUM(role = 'kasir') AS kasir,
        SUM(role = 'admin') AS admin
      FROM users
    `);

    // Pendapatan 7 hari terakhir
    const [pendapatanHarian] = await db.query(`
      SELECT
        DATE(created_at) AS tanggal,
        SUM(total_biaya + denda) AS pendapatan
      FROM transaksi
      WHERE payment_status = 'paid'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY tanggal ASC
    `);

    res.json({
      success: true,
      data: { laptopStats, trxStats, userStats, pendapatanHarian }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET SEMUA USER ────────────────────────────────────────
router.get('/users', verifyToken, isAdmin, async (req, res) => {
  try {
    const { search, role, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where  = [];
    let params = [];

    if (search) {
      where.push('(nama_lengkap LIKE ? OR email LIKE ? OR username LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (role) {
      where.push('role = ?');
      params.push(role);
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM users ${whereStr}`, params
    );

    const [rows] = await db.query(
      `SELECT id_user, username, email, role, nama_lengkap, nik, no_hp, alamat, created_at
       FROM users ${whereStr}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({ success: true, data: rows, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── UPDATE ROLE USER ──────────────────────────────────────
router.put('/users/:id/role', verifyToken, isAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'kasir', 'user'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Role tidak valid.' });
  }
  // Tidak bisa ubah role diri sendiri
  if (parseInt(req.params.id) === req.user.id_user) {
    return res.status(409).json({ success: false, message: 'Tidak bisa mengubah role diri sendiri.' });
  }
  try {
    await db.query('UPDATE users SET role = ? WHERE id_user = ?', [role, req.params.id]);
    res.json({ success: true, message: 'Role berhasil diubah.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── HAPUS USER ────────────────────────────────────────────
router.delete('/users/:id', verifyToken, isAdmin, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id_user) {
    return res.status(409).json({ success: false, message: 'Tidak bisa menghapus akun sendiri.' });
  }
  try {
    await db.query('DELETE FROM users WHERE id_user = ?', [req.params.id]);
    res.json({ success: true, message: 'User dihapus.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── BUAT AKUN KASIR (admin only) ──────────────────────────
router.post('/users/kasir', verifyToken, isAdmin, async (req, res) => {
  const { email, password, nama_lengkap, no_hp, username } = req.body;
  if (!email || !password || !nama_lengkap || !no_hp) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap.' });
  }
  try {
    const hashed = await bcrypt.hash(password, 12);
    await db.query(
      `INSERT INTO users (username, email, password, role, nama_lengkap, no_hp)
       VALUES (?, ?, ?, 'kasir', ?, ?)`,
      [username || null, email, hashed, nama_lengkap, no_hp]
    );
    res.status(201).json({ success: true, message: 'Akun kasir berhasil dibuat.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
    }
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── LAPORAN TRANSAKSI ─────────────────────────────────────
router.get('/laporan', verifyToken, isAdmin, async (req, res) => {
  try {
    const { dari, sampai, status, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where  = ['1=1'];
    let params = [];

    if (dari) { where.push('t.created_at >= ?'); params.push(dari + ' 00:00:00'); }
    if (sampai) { where.push('t.created_at <= ?'); params.push(sampai + ' 23:59:59'); }
    if (status) { where.push('t.status_transaksi = ?'); params.push(status); }
    if (req.query.search) {
      where.push('t.nama_penyewa LIKE ?');
      params.push(`%${req.query.search}%`);
    }

    const whereStr = 'WHERE ' + where.join(' AND ');

    const [[{ total, total_pendapatan }]] = await db.query(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN payment_status='paid' THEN total_biaya+denda ELSE 0 END) AS total_pendapatan
       FROM transaksi t ${whereStr}`,
      params
    );

    const [rows] = await db.query(
      `SELECT t.id_transaksi, t.nama_penyewa, t.email_penyewa, t.nik_penyewa,
              l.merk_tipe, l.nomor_seri,
              t.tgl_mulai_sewa, t.durasi_hari, t.tgl_kembali_rencana, t.tgl_kembali_aktual,
              t.total_biaya, t.denda, t.status_transaksi, t.payment_status, t.payment_method,
              t.created_at,
              u.nama_lengkap AS kasir_nama
       FROM transaksi t
       JOIN laptops l ON l.id_laptop = t.id_laptop
       LEFT JOIN users u ON u.id_user = t.id_kasir
       ${whereStr}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      summary: { total, total_pendapatan },
      pagination: { total, page: Number(page), limit: Number(limit) }
    });
  } catch (err) {
    console.error('Laporan error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET SEMUA TRANSAKSI (ringkas) ─────────────────────────
router.get('/transaksi', verifyToken, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = [];
    let params = [];
    if (search) {
      where.push('t.nama_penyewa LIKE ?');
      params.push(`%${search}%`);
    }
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM transaksi t ${whereStr}`, params);
    const [rows] = await db.query(
      `SELECT t.id_transaksi, t.nama_penyewa, t.email_penyewa, l.merk_tipe,
              t.total_biaya, t.status_transaksi, t.payment_status, t.created_at
       FROM transaksi t JOIN laptops l ON l.id_laptop = t.id_laptop
       ${whereStr}
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    res.json({ success: true, data: rows, pagination: { total } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});


// -- HAPUS TRANSAKSI (admin only) --------------------------
router.delete('/transaksi/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM transaksi WHERE id_transaksi = ?', [req.params.id]);
    res.json({ success: true, message: 'Laporan transaksi berhasil dihapus.' });
  } catch (err) {
    console.error('Delete transaksi error:', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus transaksi.' });
  }
});

module.exports = router;
