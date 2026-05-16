// backend/routes/otp.js
const express = require('express');
const db = require('../db');
const { verifyToken, isAdmin, isKasir } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// ── GENERATE OTP (Admin/Kasir) ──────────────────────────
router.post('/generate', verifyToken, async (req, res) => {
    try {
        const { target_role } = req.body; // 'admin' atau 'kasir'
        
        // Logika user: Admin bisa generate untuk admin/kasir. Kasir hanya bisa generate untuk admin (sesuai request user?)
        // User request: "klo admin yang generate... hanya bs dipake untuk role admin, klo kasir yang generate itu hanya bisa digunakan untuk admin"
        // Tapi biasanya: Admin generate untuk dirinya sendiri atau orang lain.
        // Mari ikuti request user sebisa mungkin.
        
        let roleToSet = target_role;
        if (req.user.role === 'kasir') {
            roleToSet = 'admin'; // Sesuai request: "klo kasir yang generate itu hanya bisa digunakan untuk admin"
        } else if (!roleToSet) {
            roleToSet = 'admin';
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        
        await db.query(
            'INSERT INTO otp_ktp (otp_code, target_role, is_used) VALUES (?, ?, 0)',
            [otp, roleToSet]
        );

        res.json({ 
            success: true, 
            message: `OTP berhasil digenerate untuk role: ${roleToSet}`,
            otp: otp,
            target_role: roleToSet
        });
    } catch (err) {
        console.error('Generate OTP error:', err);
        res.status(500).json({ success: false, message: 'Gagal generate OTP.' });
    }
});

// ── VALIDATE OTP (Internal or via API) ──────────────────
// Ini akan dipanggil saat mau lihat KTP
router.post('/validate', verifyToken, async (req, res) => {
    try {
        const { otp } = req.body;
        
        const [rows] = await db.query(
            'SELECT * FROM otp_ktp WHERE otp_code = ? AND target_role = ? AND is_used = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)',
            [otp, req.user.role]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: 'OTP tidak valid, sudah digunakan, atau kedaluwarsa.' });
        }

        // Tandai OTP sebagai digunakan
        await db.query('UPDATE otp_ktp SET is_used = 1 WHERE id = ?', [rows[0].id]);

        res.json({ success: true, message: 'OTP valid.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
