// backend/middleware/limiter.js
const rateLimit = require('express-rate-limit');

// Limiter untuk Checkout (5 kali dalam 15 menit)
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Terlalu banyak mencoba checkout. Silahkan tunggu 15 menit untuk mencoba kembali.' }
});

// Limiter untuk Auth (20 kali dalam 15 menit - lebih longgar)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi setelah 15 menit.' }
});

module.exports = { checkoutLimiter, authLimiter };
