const bcrypt = require('bcryptjs');
const db = require('./backend/db.js');

async function resetDefaultPasswords() {
  try {
    const adminHash = await bcrypt.hash('Admin@1234', 12);
    const kasirHash = await bcrypt.hash('Kasir@1234', 12);

    await db.query(
      `UPDATE users 
       SET password = ?, role = 'admin', nama_lengkap = COALESCE(nama_lengkap, 'Administrator')
       WHERE email = 'admin@laptoprent.com'`,
      [adminHash]
    );

    await db.query(
      `UPDATE users 
       SET password = ?, role = 'kasir', nama_lengkap = COALESCE(nama_lengkap, 'Kasir LaptopRent')
       WHERE email = 'kasir@laptoprent.com'`,
      [kasirHash]
    );

    console.log('✅ Password admin dan kasir berhasil di-reset ke bcrypt.');
    console.log('Admin : admin@laptoprent.com / Admin@1234');
    console.log('Kasir : kasir@laptoprent.com / Kasir@1234');
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal reset password:', err.message);
    process.exit(1);
  }
}

resetDefaultPasswords();