const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetPasswords() {
  const hash = bcrypt.hashSync('password123', 10);
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD || 'Z23t94?mm',
    database: 'bugema_attendance'
  });
  
  await conn.execute('UPDATE users SET password_hash = ? WHERE email IN (?, ?)', [
    hash,
    'admin@bugema.ac.ug',
    'jaylojoy123@gmail.com'
  ]);
  
  console.log('Passwords updated to password123 for existing users.');
  process.exit(0);
}
resetPasswords();
