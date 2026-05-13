// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_this';

// Verifikasi JWT token dari header Authorization
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan. Silakan login.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id_user, email, role, nama_lengkap }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Sesi habis. Silakan login ulang.' });
    }
    return res.status(403).json({ success: false, message: 'Token tidak valid.' });
  }
}

// Role guard factory
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Akses ditolak. Diperlukan role: ${roles.join(' atau ')}.`
      });
    }
    next();
  };
}

// Shorthand guards
const isAdmin  = requireRole('admin');
const isKasir  = requireRole('kasir', 'admin');
const isUser   = requireRole('user', 'kasir', 'admin');

// Generate JWT
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

module.exports = { verifyToken, requireRole, isAdmin, isKasir, isUser, signToken };