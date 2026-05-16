// backend/routes/payment.js
const express   = require('express');
const midtrans  = require('midtrans-client');
const db        = require('../db');
const { checkoutLimiter } = require('../middleware/limiter');

const router = express.Router();

// Setup Midtrans Snap (Pake Key dari .env lu)
const snap = new midtrans.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey:    process.env.MIDTRANS_SERVER_KEY,
  clientKey:    process.env.MIDTRANS_CLIENT_KEY
});

// Endpoint Create Token
router.post('/create-token', checkoutLimiter, async (req, res) => {
  const { id_transaksi } = req.body;
  if (!id_transaksi) {
    return res.status(400).json({ success: false, message: 'id_transaksi wajib diisi.' });
  }

  try {
    // Ambil data transaksi buat dapet nominal & nama laptop
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

    // Parameter yg dibutuhin Midtrans
    let parameter = {
      "transaction_details": {
        "order_id": `TRX-${id_transaksi}-${Date.now()}`, // Bikin ID Unik tiap request
        "gross_amount": Math.round(Number(trx.total_biaya))
      },
      "item_details": [{
        "id": trx.id_laptop,
        "price": Math.round(Number(trx.total_biaya)),
        "quantity": 1,
        "name": trx.merk_tipe
      }],
      "credit_card": { "secure": true }
    };

    console.log('Midtrans Params:', JSON.stringify(parameter, null, 2));

    // Generate Token
    const transaction = await snap.createTransaction(parameter);
    
    // Update payment_order_id di tabel transaksi
    await db.query(
        'UPDATE transaksi SET payment_order_id = ? WHERE id_transaksi = ?',
        [parameter.transaction_details.order_id, id_transaksi]
    );

    res.json({ 
        success: true, 
        snap_token: transaction.token 
    });

  } catch (err) {
    console.error('Midtrans Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;