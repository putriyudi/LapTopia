// backend/routes/laptops.js
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../db');
const { verifyToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// ── GET KATALOG (publik, dengan filter) ──────────────────
router.get('/', async (req, res) => {
  try {
    const {
      search, status, merk,
      harga_min, harga_max,
      sort = 'created_at', order = 'DESC',
      page = 1, limit = 12
    } = req.query;

    let where  = [];
    let params = [];

    if (search) {
      where.push('(merk_tipe LIKE ? OR spesifikasi LIKE ? OR nomor_seri LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (merk) {
      where.push('merk_tipe LIKE ?');
      params.push(`%${merk}%`);
    }
    if (harga_min) {
      where.push('harga_sewa_per_hari >= ?');
      params.push(Number(harga_min));
    }
    if (harga_max) {
      where.push('harga_sewa_per_hari <= ?');
      params.push(Number(harga_max));
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Whitelist sort columns
    const sortAllowed = ['harga_sewa_per_hari', 'merk_tipe', 'created_at', 'status'];
    const sortCol  = sortAllowed.includes(sort) ? sort : 'created_at';
    const orderDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM laptops ${whereStr}`, params
    );

    const [rows] = await db.query(
      `SELECT * FROM laptops ${whereStr} ORDER BY ${sortCol} ${orderDir} LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('GET laptops:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET SATU LAPTOP ───────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM laptops WHERE id_laptop = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Laptop tidak ditemukan.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET MERK UNIK (untuk filter dropdown) ────────────────
router.get('/meta/merks', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT SUBSTRING_INDEX(merk_tipe, ' ', 1) AS merk FROM laptops ORDER BY merk`
    );
    res.json({ success: true, data: rows.map(r => r.merk) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── CREATE LAPTOP (admin only) ────────────────────────────
router.post('/', verifyToken, isAdmin,
  [
    body('nomor_seri').trim().notEmpty(),
    body('merk_tipe').trim().notEmpty(),
    body('harga_sewa_per_hari').isFloat({ min: 0 }),
    body('status').optional().isIn(['Tersedia', 'Disewa', 'Maintenance'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { nomor_seri, merk_tipe, spesifikasi, harga_sewa_per_hari, status } = req.body;
    try {
      const [result] = await db.query(
        `INSERT INTO laptops (nomor_seri, merk_tipe, spesifikasi, harga_sewa_per_hari, status)
         VALUES (?, ?, ?, ?, ?)`,
        [nomor_seri, merk_tipe, spesifikasi || null, harga_sewa_per_hari, status || 'Tersedia']
      );
      res.status(201).json({ success: true, message: 'Laptop berhasil ditambahkan.', id_laptop: result.insertId });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'Nomor seri sudah ada.' });
      }
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// ── UPDATE LAPTOP (admin only) ────────────────────────────
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  const allowed = ['nomor_seri', 'merk_tipe', 'spesifikasi', 'harga_sewa_per_hari', 'status'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  if (!Object.keys(updates).length) {
    return res.status(400).json({ success: false, message: 'Tidak ada data.' });
  }

  try {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db.query(`UPDATE laptops SET ${fields} WHERE id_laptop = ?`, [...Object.values(updates), req.params.id]);
    res.json({ success: true, message: 'Laptop berhasil diupdate.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── DELETE LAPTOP (admin only) ────────────────────────────
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    // Cek apakah laptop sedang disewa
    const [trx] = await db.query(
      `SELECT id_transaksi FROM transaksi WHERE id_laptop = ? AND status_transaksi IN ('Booking','Aktif')`,
      [req.params.id]
    );
    if (trx.length > 0) {
      return res.status(409).json({ success: false, message: 'Laptop tidak bisa dihapus, sedang dalam transaksi aktif.' });
    }
    await db.query('DELETE FROM laptops WHERE id_laptop = ?', [req.params.id]);
    res.json({ success: true, message: 'Laptop dihapus.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;