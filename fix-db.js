const db = require('./backend/db.js');
async function fix() {
  await db.query("UPDATE users SET password = 'Admin@1234' WHERE email = 'admin@laptoprent.com'");
  await db.query("UPDATE users SET password = 'Kasir@1234' WHERE email = 'kasir@laptoprent.com'");
  console.log('Fixed passwords in DB.');
  process.exit(0);
}
fix();
