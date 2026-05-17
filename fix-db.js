// fix-db.js
// Script darurat: reset password admin & kasir ke default,
// di-hash dengan bcrypt (cost=12) agar bisa login.
//
// Jalankan: node fix-db.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db     = require('./backend/db');
const bcrypt = require('bcryptjs');

async function fix() {
  const conn = await db.getConnection();
  try {
    console.log('🔄 Mereset password default ke bcrypt hash...');

    const accounts = [
      { email: 'admin@laptoprent.com', password: 'Admin@1234' },
      { email: 'kasir@laptoprent.com', password: 'Kasir@1234' }
    ];

    for (const acc of accounts) {
      const hashed = await bcrypt.hash(acc.password, 12);
      const [result] = await conn.query(
        'UPDATE users SET password = ? WHERE email = ?',
        [hashed, acc.email]
      );
      if (result.affectedRows > 0) {
        console.log(`✅ Password ${acc.email} berhasil di-reset.`);
      } else {
        console.log(`⚠️  ${acc.email} tidak ditemukan. Pastikan database.sql sudah diimport.`);
      }
    }

    console.log('\n✨ Selesai. Login dengan:');
    console.log('   Admin: admin@laptoprent.com / Admin@1234');
    console.log('   Kasir: kasir@laptoprent.com / Kasir@1234');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    conn.release();
    process.exit(0);
  }
}

fix();
