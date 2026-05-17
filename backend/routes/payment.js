// backend/routes/payment.js
const express   = require('express');
const crypto    = require('crypto');
const midtrans  = require('midtrans-client');
const db        = require('../db');
const { verifyToken } = require('../middleware/auth');
const { checkoutLimiter } = require('../middleware/limiter');

const router = express.Router();

// Setup Midtrans Snap
const snap = new midtrans.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey:    process.env.MIDTRANS_SERVER_KEY,
  clientKey:    process.env.MIDTRANS_CLIENT_KEY
});

// ── CREATE SNAP TOKEN ────────────────────────────────────
// BUG FIX: Tambah verifyToken agar hanya pemilik transaksi/kasir/admin
// yang bisa generate token pembayaran.
router.post('/create-token', checkoutLimiter, verifyToken, async (req, res) => {
  const { id_transaksi } = req.body;
  if (!id_transaksi) {
    return res.status(400).json({ success: false, message: 'id_transaksi wajib diisi.' });
  }

  try {
    const [rows] = await db.query(
      `SELECT t.*, l.merk_tipe, u.email AS user_email, u.nama_lengkap AS user_nama
       FROM transaksi t
       JOIN laptops l ON l.id_laptop = t.id_laptop
       LEFT JOIN users u ON u.id_user = t.id_user_penyewa
       WHERE t.id_transaksi = ?`,
      [id_transaksi]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    const trx = rows[0];

    // Hanya pemilik transaksi, kasir, atau admin yang boleh generate token
    if (req.user.role === 'user' && trx.id_user_penyewa !== req.user.id_user) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    if (trx.payment_status === 'paid') {
      return res.status(409).json({ success: false, message: 'Transaksi ini sudah lunas.' });
    }

    const orderId = `TRX-${id_transaksi}-${Date.now()}`;

    const parameter = {
      transaction_details: {
        order_id:     orderId,
        gross_amount: Math.round(Number(trx.total_biaya))
      },
      item_details: [{
        id:       String(trx.id_laptop),
        price:    Math.round(Number(trx.total_biaya)),
        quantity: 1,
        name:     trx.merk_tipe.substring(0, 50)
      }],
      customer_details: {
        first_name: trx.nama_penyewa,
        email:      trx.email_penyewa,
        phone:      trx.no_hp_penyewa
      },
      credit_card: { secure: true }
    };

    const transaction = await snap.createTransaction(parameter);

    // Simpan order_id ke DB
    await db.query(
      'UPDATE transaksi SET payment_order_id = ?, payment_token = ? WHERE id_transaksi = ?',
      [orderId, transaction.token, id_transaksi]
    );

    res.json({ success: true, snap_token: transaction.token, order_id: orderId });

  } catch (err) {
    console.error('Midtrans Error:', err);
    res.status(500).json({ success: false, message: err.message || 'Gagal membuat token pembayaran.' });
  }
});

// ── MIDTRANS NOTIFICATION WEBHOOK ────────────────────────
// BUG FIX: Endpoint ini HILANG dari versi asli.
//   Tanpa webhook, payment_status tidak pernah jadi 'paid' secara otomatis
//   setelah user bayar via Midtrans Snap — status selamanya 'pending'.
//
//   URL ini harus didaftarkan di Midtrans Dashboard:
//   Sandbox → Settings → Payment Notification → https://yourdomain.com/api/payment/notification
router.post('/notification', async (req, res) => {
  try {
    const notification = req.body;

    // Verifikasi signature key dari Midtrans
    const orderId       = notification.order_id;
    const statusCode    = notification.status_code;
    const grossAmount   = notification.gross_amount;
    const serverKey     = process.env.MIDTRANS_SERVER_KEY;

    const signatureKey = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
      .digest('hex');

    if (signatureKey !== notification.signature_key) {
      console.warn('Midtrans: Invalid signature key for order', orderId);
      return res.status(403).json({ success: false, message: 'Invalid signature.' });
    }

    // Cari transaksi berdasarkan payment_order_id
    const [rows] = await db.query(
      'SELECT id_transaksi, payment_status FROM transaksi WHERE payment_order_id = ?',
      [orderId]
    );

    if (!rows.length) {
      console.warn('Midtrans notification: transaksi tidak ditemukan untuk order_id:', orderId);
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    const trx            = rows[0];
    const transactionStatus = notification.transaction_status;
    const fraudStatus       = notification.fraud_status;

    let newPaymentStatus = trx.payment_status;

    if (transactionStatus === 'capture') {
      newPaymentStatus = (fraudStatus === 'accept') ? 'paid' : 'failed';
    } else if (transactionStatus === 'settlement') {
      newPaymentStatus = 'paid';
    } else if (['cancel', 'deny', 'expire'].includes(transactionStatus)) {
      newPaymentStatus = (transactionStatus === 'expire') ? 'expired' : 'failed';
    } else if (transactionStatus === 'pending') {
      newPaymentStatus = 'pending';
    }

    await db.query(
      'UPDATE transaksi SET payment_status = ?, payment_method = ? WHERE payment_order_id = ?',
      [newPaymentStatus, notification.payment_type || null, orderId]
    );

    console.log(`Midtrans: order ${orderId} → payment_status: ${newPaymentStatus}`);
    res.status(200).json({ success: true });

  } catch (err) {
    console.error('Midtrans notification error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
