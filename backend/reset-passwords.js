require('dotenv').config();
const db = require('./db');
const bcrypt = require('bcryptjs');

async function resetPasswords() {
  const conn = await db.getConnection();
  try {
    console.log('Fetching all users...');
    const [users] = await conn.query('SELECT id_user, email, password FROM users');
    
    let updatedCount = 0;
    for (let user of users) {
      // Cek apakah password sudah di-hash (bcrypt hash dimulai dengan $2a$, $2b$, $2y$)
      if (!user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
        console.log(`Hashing password for user: ${user.email}...`);
        const hashed = await bcrypt.hash(user.password, 12);
        await conn.query('UPDATE users SET password = ? WHERE id_user = ?', [hashed, user.id_user]);
        updatedCount++;
      }
    }
    
    console.log(`Successfully updated ${updatedCount} plain text passwords to bcrypt hashes.`);
  } catch (err) {
    console.error('Error resetting passwords:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

resetPasswords();
