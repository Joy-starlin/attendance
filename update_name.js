const mysql = require('mysql2/promise');
require('dotenv').config();

async function renameAdmin() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD || 'Z23t94?mm',
    database: 'bugema_attendance'
  });
  
  await conn.execute('UPDATE users SET name = ? WHERE email = ?', [
    'Fred Mutabazi',
    'admin@bugema.ac.ug'
  ]);
  
  console.log('Renamed admin account to Fred Mutabazi.');
  process.exit(0);
}
renameAdmin();
