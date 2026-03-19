const mysql = require('mysql2/promise');
require('dotenv').config();

async function findUsers() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD || 'Z23t94?mm'
  });
  
  const [dbs] = await conn.query('SHOW DATABASES');
  for (const row of dbs) {
    const db = row.Database;
    if (['information_schema', 'mysql', 'performance_schema', 'sys'].includes(db)) continue;
    
    try {
      await conn.query('USE `' + db + '`');
      const [tables] = await conn.query('SHOW TABLES');
      const tableNames = tables.map(t => Object.values(t)[0]);
      
      if (tableNames.includes('users')) {
        const [users] = await conn.query('SELECT name, email, role FROM users LIMIT 3');
        if (users.length > 0) {
          console.log('\n--- FOUND EXISTING USERS IN DATABASE:', db, '---');
          console.table(users);
        }
      }
    } catch (e) {}
  }
  process.exit(0);
}
findUsers();
