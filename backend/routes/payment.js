// backend/routes/payment.js
const express = require('express');
const crypto = require('crypto');
const midtrans = require('midtrans-client');
const db = require('../db');
const { checkoutLimiter } = require('../middleware/limiter');

const router = express.Router();

// Setup Midtrans Snap menggunakan key dari .env
// Pastikan .env berisi:
// MIDTRANS_IS_PRODUCTION=false
// MIDTRANS_SERVER_KEY=server_key_midtrans_lama
// MIDTRANS_CLIENT_KEY=client_key_midtrans_lama
const snap = new midtrans.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

/**
 * CREATE SNAP TOKEN
 * Dipakai setelah transaksi/booking dibuat.
 * Tetap mempertahankan flow Midtrans lama:
 * - frontend kirim id_transaksi
 * - backend buat Snap token
 * - backend simpan payment_order_id
 * - frontend lanjut snap.pay(token)
 */
router.post('/create-token', checkoutLimiter, async (req, res) => {
  const { id_transaksi } = req.body;

  if (!id_transaksi) {
    return res.status(400).json({
      success: false,
      message: 'id_transaksi wajib diisi.'
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT 
          t.*, 
          l.merk_tipe,
          l.nomor_seri,
          u.email AS user_email,
          u.nama_lengkap AS user_nama
       FROM transaksi t
       JOIN laptops l ON l.id_laptop = t.id_laptop
       LEFT JOIN users u ON u.id_user = t.id_user_penyewa
       WHERE t.id_transaksi = ?`,
      [id_transaksi]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan.'
      });
    }

    const trx = rows[0];

    if (trx.payment_status === 'paid') {
      return res.status(409).json({
        success: false,
        message: 'Transaksi ini sudah lunas.'
      });
    }

    const orderId = `TRX-${id_transaksi}-${Date.now()}`;
    const grossAmount = Math.round(Number(trx.total_biaya || 0));

    if (!grossAmount || grossAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Total biaya transaksi tidak valid.'
      });
    }

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount
      },
      item_details: [
        {
          id: String(trx.id_laptop),
          price: grossAmount,
          quantity: 1,
          name: String(trx.merk_tipe || 'Sewa Laptop').substring(0, 50)
        }
      ],
      customer_details: {
        first_name: trx.nama_penyewa || trx.user_nama || 'Penyewa',
        email: trx.email_penyewa || trx.user_email || '',
        phone: trx.no_hp_penyewa || ''
      },
      credit_card: {
        secure: true
      }
    };

    console.log('Midtrans Params:', JSON.stringify(parameter, null, 2));

    const transaction = await snap.createTransaction(parameter);

    await db.query(
      `UPDATE transaksi 
       SET payment_order_id = ?
       WHERE id_transaksi = ?`,
      [orderId, id_transaksi]
    );

    return res.json({
      success: true,
      snap_token: transaction.token,
      redirect_url: transaction.redirect_url,
      order_id: orderId
    });
  } catch (err) {
    console.error('Midtrans Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Gagal membuat token pembayaran.'
    });
  }
});

/**
 * MIDTRANS NOTIFICATION WEBHOOK
 * Dipakai Midtrans untuk update status pembayaran otomatis.
 *
 * Untuk production/demo online, URL ini perlu didaftarkan di Dashboard Midtrans:
 * /api/payment/notification
 */
router.post('/notification', async (req, res) => {
  try {
    const notification = req.body;

    const orderId = notification.order_id;
    const statusCode = notification.status_code;
    const grossAmount = notification.gross_amount;
    const serverKey = process.env.MIDTRANS_SERVER_KEY;

    if (!orderId || !statusCode || !grossAmount || !notification.signature_key) {
      return res.status(400).json({
        success: false,
        message: 'Payload notifikasi tidak lengkap.'
      });
    }

    const signatureKey = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
      .digest('hex');

    if (signatureKey !== notification.signature_key) {
      console.warn('Midtrans invalid signature:', orderId);
      return res.status(403).json({
        success: false,
        message: 'Invalid signature.'
      });
    }

    const [rows] = await db.query(
      `SELECT id_transaksi, payment_status 
       FROM transaksi 
       WHERE payment_order_id = ?`,
      [orderId]
    );

    if (!rows.length) {
      console.warn('Transaksi tidak ditemukan untuk order_id:', orderId);
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan.'
      });
    }

    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;

    let newPaymentStatus = rows[0].payment_status || 'pending';

    if (transactionStatus === 'capture') {
      newPaymentStatus = fraudStatus === 'accept' ? 'paid' : 'failed';
    } else if (transactionStatus === 'settlement') {
      newPaymentStatus = 'paid';
    } else if (transactionStatus === 'pending') {
      newPaymentStatus = 'pending';
    } else if (transactionStatus === 'expire') {
      newPaymentStatus = 'expired';
    } else if (['cancel', 'deny'].includes(transactionStatus)) {
      newPaymentStatus = 'failed';
    }

    await db.query(
      `UPDATE transaksi 
       SET payment_status = ?, payment_method = ?
       WHERE payment_order_id = ?`,
      [newPaymentStatus, notification.payment_type || null, orderId]
    );

    console.log(`Midtrans notification: ${orderId} -> ${newPaymentStatus}`);

    return res.status(200).json({
      success: true
    });
  } catch (err) {
    console.error('Midtrans notification error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});

module.exports = router;