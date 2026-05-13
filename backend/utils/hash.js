// backend/middleware/upload.js
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const MAX_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

// Pastikan folder ada
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Storage engine — simpan ke /uploads/ktp/ dengan nama random
const ktpStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/ktp');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Nama file: random hex agar tidak bisa ditebak
    const rand = crypto.randomBytes(16).toString('hex');
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `ktp_${rand}${ext}`);
  }
});

// Filter — hanya gambar
function imageFilter(req, file, cb) {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) {
    return cb(new Error('Hanya file gambar yang diperbolehkan (jpg, jpeg, png, webp)'));
  }
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('MIME type tidak valid'));
  }
  cb(null, true);
}

const uploadKTP = multer({
  storage: ktpStorage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_SIZE }
});

// Error handler untuk Multer
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `Ukuran file terlalu besar. Maksimal ${process.env.MAX_FILE_SIZE_MB || 5}MB.`
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
}

module.exports = { uploadKTP, handleUploadError };