// backend/middleware/upload.js
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const MAX_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Storage: KTP (protected) ─────────────────────────────────
const ktpStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/ktp');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const rand = crypto.randomBytes(16).toString('hex');
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `ktp_${rand}${ext}`);
  }
});

// ── Storage: Foto Laptop (public) ────────────────────────────
const laptopStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/laptops');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const rand = crypto.randomBytes(16).toString('hex');
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `laptop_${rand}${ext}`);
  }
});

// Patch: override req.file.path ke relative setelah multer selesai
function toRelativePath(req, res, next) {
  if (req.file) {
    const projectRoot = path.join(__dirname, '../..');
    req.file.path = path.relative(projectRoot, req.file.path);
  }
  next();
}

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

// ── Upload KTP ────────────────────────────────────────────────
const _uploadKTP = multer({
  storage: ktpStorage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_SIZE }
});

const uploadKTP = {
  single: (fieldName) => [
    _uploadKTP.single(fieldName),
    toRelativePath
  ]
};

// ── Upload Foto Laptop ────────────────────────────────────────
const _uploadLaptop = multer({
  storage: laptopStorage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_SIZE }
});

// Middleware tunggal (bukan array), sudah include toRelativePath
function uploadLaptopSingle(fieldName) {
  return [
    _uploadLaptop.single(fieldName),
    toRelativePath
  ];
}

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

module.exports = { uploadKTP, uploadLaptopSingle, handleUploadError };
