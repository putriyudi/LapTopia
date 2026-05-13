// backend/routes/auth.js
const express   = require('express');
const bcrypt    = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db        = require('../db');
const { signToken, verifyToken } = require('../middleware/auth');
const { uploadKTP, handleUploadError } = require('../middleware/upload');

const router = express.Router();

// ── REGISTER (user only) ──────────────────────────────────
router.post('/register',
  uploadKTP.single('foto_ktp'),
  handleUploadError,
  [
    body('email').isEmail().normalizeEmail().withMessage('Email tidak valid'),
    body('password').isLength({ min: 8 }).withMessage('Password minimal 8 karakter')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .withMessage('Password harus ada huruf besar, kecil, angka, dan simbol (@$!%*?&)'),
    body('nama_lengkap').trim().isLength({ min: 3 }).withMessage('Nama lengkap minimal 3 karakter'),
    body('no_hp').trim().isMobilePhone('id-ID').withMessage('Nomor HP format Indonesia tidak valid (contoh: 08123456789)'),
    body('nik').optional().isLength({ min: 16, max: 16 }).withMessage('NIK harus 16 digit')
      .isNumeric().withMessage('NIK hanya boleh angka')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password, nama_lengkap, no_hp, nik, username, alamat } = req.body;
    const foto_ktp_path = req.file ? req.file.path : null;

    try {
      // Cek email duplikat
      const [existing] = await db.query('SELECT id_user FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
      }

      // Hash password
      const hashed = password;

      const [result] = await db.query(
        `INSERT INTO users (username, email, password, role, nama_lengkap, nik, no_hp, alamat, foto_ktp_path)
         VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?)`,
        [username || null, email, hashed, nama_lengkap, nik || null, no_hp, alamat || null, foto_ktp_path]
      );

      res.status(201).json({
        success: true,
        message: 'Registrasi berhasil! Silakan login.',
        id_user: result.insertId
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
  }
);

// ── LOGIN ─────────────────────────────────────────────────
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const [rows] = await db.query(
        'SELECT id_user, email, password, role, nama_lengkap, no_hp, nik, alamat FROM users WHERE email = ?',
        [email]
      );

      if (rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Email atau password salah.' });
      }

      const user = rows[0];
      const match = password === user.password;
      if (!match) {
        return res.status(401).json({ success: false, message: 'Email atau password salah.' });
      }

      const token = signToken({
        id_user:      user.id_user,
        email:        user.email,
        role:         user.role,
        nama_lengkap: user.nama_lengkap
      });

      res.json({
        success: true,
        message: 'Login berhasil.',
        token,
        user: {
          id_user:      user.id_user,
          email:        user.email,
          role:         user.role,
          nama_lengkap: user.nama_lengkap,
          no_hp:        user.no_hp,
          nik:          user.nik,
          alamat:       user.alamat
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
  }
);

// ── GET PROFILE ───────────────────────────────────────────
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id_user, username, email, role, nama_lengkap, nik, no_hp, alamat, created_at FROM users WHERE id_user = ?',
      [req.user.id_user]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── UPDATE PROFILE ────────────────────────────────────────
router.put('/profile', verifyToken,
  uploadKTP.single('foto_ktp'),
  handleUploadError,
  async (req, res) => {
    const { nama_lengkap, no_hp, nik, alamat, username } = req.body;
    const updates = {};

    if (nama_lengkap) updates.nama_lengkap = nama_lengkap;
    if (no_hp)        updates.no_hp = no_hp;
    if (nik)          updates.nik = nik;
    if (alamat)       updates.alamat = alamat;
    if (username)     updates.username = username;
    if (req.file)     updates.foto_ktp_path = req.file.path;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data yang diupdate.' });
    }

    try {
      const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(updates), req.user.id_user];
      await db.query(`UPDATE users SET ${fields} WHERE id_user = ?`, values);
      res.json({ success: true, message: 'Profil berhasil diupdate.' });
    } catch (err) {
      console.error('Update profile error:', err);
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// ── CHANGE PASSWORD ───────────────────────────────────────
router.put('/change-password', verifyToken,
  [
    body('old_password').notEmpty(),
    body('new_password').isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .withMessage('Password baru harus min 8 karakter, huruf besar, kecil, angka, simbol')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { old_password, new_password } = req.body;
    try {
      const [rows] = await db.query('SELECT password FROM users WHERE id_user = ?', [req.user.id_user]);
      const match = await bcrypt.compare(old_password, rows[0].password);
      if (!match) {
        return res.status(401).json({ success: false, message: 'Password lama salah.' });
      }
      const hashed = await bcrypt.hash(new_password, 12);
      await db.query('UPDATE users SET password = ? WHERE id_user = ?', [hashed, req.user.id_user]);
      res.json({ success: true, message: 'Password berhasil diubah.' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

module.exports = router;