// reset-default-passwords.js
// Script to reset Admin and Kasir passwords to default and hash them properly.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function reset() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('🔄 Resetting default passwords...');

    const defaults = [
      { email: 'admin@laptoprent.com', password: 'Admin@1234' },
      { email: 'kasir@laptoprent.com', password: 'Kasir@1234' }
    ];

    for (const acc of defaults) {
      console.log(`Processing ${acc.email}...`);
      const hashedPassword = await bcrypt.hash(acc.password, 12);
      
      const [rows] = await connection.execute('SELECT id_user FROM users WHERE email = ?', [acc.email]);
      
      if (rows.length > 0) {
        await connection.execute('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, acc.email]);
        console.log(`✅ Updated password for ${acc.email}`);
      } else {
        console.log(`⚠️ User ${acc.email} not found in database. Please run database.sql first.`);
      }
    }

    console.log('\n✨ All default passwords have been reset and hashed.');
    console.log('You can now login with:');
    console.log('Admin: admin@laptoprent.com / Admin@1234');
    console.log('Kasir: kasir@laptoprent.com / Kasir@1234');

  } catch (error) {
    console.error('❌ Error resetting passwords:', error.message);
  } finally {
    await connection.end();
  }
}

reset();
