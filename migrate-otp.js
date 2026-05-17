// migrate-otp.js
const db = require('./backend/db');

async function migrate() {
    try {
        console.log('Migrating OTP table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS otp_ktp (
                id INT AUTO_INCREMENT PRIMARY KEY,
                otp_code VARCHAR(10) NOT NULL,
                target_role ENUM('admin', 'kasir') NOT NULL,
                is_used TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table otp_ktp created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
