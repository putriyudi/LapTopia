// backend/routes/payment.js
const express   = require('express');
const midtrans  = require('midtrans-client');
const db        = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const snap = new midtrans.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey:    process.env.MIDTRANS_SERVER_KEY,
  clientKey:    process.env.MIDTRANS_CLIENT_KEY
});

// ── CREATE PAYMENT TOKEN ──────────────────────────────────
// Dipanggil dari checkout setelah transaksi dibuat (status Booking)
router.post('/create-token', async (req, res) => {
  const { id_transaksi } = req.body;
  if (!id_transaksi) {
    return res.status(400).json({ success: false, message: 'id_transaksi wajib diisi.' });
  }

  try {
    const [rows] = await db.query(
      `SELECT t.*, l.merk_tipe
       FROM transaksi t
       JOIN laptops l ON l.id_laptop = t.id_laptop
       WHERE t.id_transaksi = ?`,
      [id_transaksi]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    const trx = rows[0];

    if (trx.payment_status === 'paid') {
      return res.status(409).json({ success: false, message: 'Transaksi ini sudah dibayar.' });
    }

    const orderId = `LRNT-${id_transaksi}-${Date.now()}`;

    const parameter = {
      transaction_details: {
        order_id:     orderId,
        gross_amount: Math.round(Number(trx.total_biaya))
      },
      item_details: [{
        id:       `LAPTOP-${trx.id_laptop}`,
        price:    Math.round(Number(trx.total_biaya)),
        quantity: 1,
        name:     `Sewa ${trx.merk_tipe} — ${trx.durasi_hari} Hari`
      }],
      customer_details: {
        first_name: trx.nama_penyewa,
        email:      trx.email_penyewa,
        phone:      trx.no_hp_penyewa
      },
      enabled_payments: [
        'gopay', 'qris', 'shopeepay', 'other_qris',
        'bank_transfer', 'bca_va', 'bni_va', 'bri_va', 'permata_va',
        'credit_card', 'cimb_clicks', 'danamon_online'
      ],
      gopay: {
        enable_callback: true,
        callback_url:    `${process.env.APP_URL}/payment/callback`
      },
      callbacks: {
        finish: `${process.env.APP_URL}/frontend/payment-finish.html`
      }
    };

    const transaction = await snap.createTransaction(parameter);

    // Simpan order_id dan token ke database
    await db.query(
      `UPDATE transaksi SET payment_order_id = ?, payment_token = ?, payment_status = 'pending'
       WHERE id_transaksi = ?`,
      [orderId, transaction.token, id_transaksi]
    );

    res.json({
      success:      true,
      snap_token:   transaction.token,
      redirect_url: transaction.redirect_url,
      order_id:     orderId
    });
  } catch (err) {
    console.error('Midtrans create token error:', err);
    res.status(500).json({ success: false, message: 'Gagal membuat token pembayaran.' });
  }
});

// ── MIDTRANS NOTIFICATION CALLBACK ───────────────────────
// Midtrans POST ke sini setelah status berubah
router.post('/callback', async (req, res) => {
  try {
    const notification = req.body;
    console.log('📩 Midtrans Callback:', JSON.stringify(notification, null, 2));

    // Verifikasi notifikasi via Midtrans API
    const statusResponse = await snap.transaction.notification(notification);
    const {
      order_id,
      transaction_status,
      fraud_status,
      payment_type
    } = statusResponse;

    // Cari transaksi by order_id
    const [rows] = await db.query(
      'SELECT id_transaksi FROM transaksi WHERE payment_order_id = ?',
      [order_id]
    );

    if (!rows.length) {
      console.warn('Order ID tidak ditemukan:', order_id);
      return res.json({ status: 'ok' });
    }

    const id_transaksi = rows[0].id_transaksi;
    let paymentStatus = 'pending';

    if (transaction_status === 'capture' && fraud_status === 'accept') {
      paymentStatus = 'paid';
    } else if (transaction_status === 'settlement') {
      paymentStatus = 'paid';
    } else if (['cancel', 'deny', 'expire'].includes(transaction_status)) {
      paymentStatus = 'failed';
    }

    await db.query(
      `UPDATE transaksi SET payment_status = ?, payment_method = ? WHERE id_transaksi = ?`,
      [paymentStatus, payment_type, id_transaksi]
    );

    console.log(`✅ Transaksi ${id_transaksi} status: ${paymentStatus}`);
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).json({ status: 'error' });
  }
});

// ── CHECK PAYMENT STATUS ──────────────────────────────────
router.get('/status/:id_transaksi', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT payment_status, payment_method, payment_order_id FROM transaksi WHERE id_transaksi = ?',
      [req.params.id_transaksi]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Tidak ditemukan.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── CLIENT KEY (untuk frontend) ───────────────────────────
router.get('/client-key', (req, res) => {
  res.json({ success: true, client_key: process.env.MIDTRANS_CLIENT_KEY });
});

module.exports = router;