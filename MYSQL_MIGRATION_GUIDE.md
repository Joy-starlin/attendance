# ============================================================
# MySQL Migration Guide for Bugema University Attendance System
# ============================================================

## STEP 1: Install MySQL

### Windows:
1. Download MySQL Installer from https://dev.mysql.com/downloads/installer/
2. Run installer, choose "Server only" or "Full" installation
3. Set root password during installation (remember this!)
4. MySQL will run as a service on port 3306

### Verify Installation:
```bash
mysql --version
```

## STEP 2: Install MySQL Node.js Driver

```bash
cd "c:/Users/Jaylo/Downloads/Biometric"
npm install mysql2
```

## STEP 3: Create MySQL Database

Open MySQL command line or MySQL Workbench:

```sql
-- Create database
CREATE DATABASE bugema_attendance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user (optional but recommended)
CREATE USER 'bugema_user'@'localhost' IDENTIFIED BY 'your_password_here';
GRANT ALL PRIVILEGES ON bugema_attendance.* TO 'bugema_user'@'localhost';
FLUSH PRIVILEGES;
```

## STEP 4: Update Environment Variables

Edit `.env` file:

```env
# MySQL Database
DATABASE_URL=mysql://bugema_user:your_password_here@localhost:3306/bugema_attendance
# OR for root user:
# DATABASE_URL=mysql://root:root_password@localhost:3306/bugema_attendance
```

## STEP 5: Run the Migration

```bash
node migrate-to-mysql.js
```

This will create all tables and insert sample data.

## STEP 6: Start the Server

```bash
node mysql-server.js
```

## MySQL vs SQLite Differences

| Feature | SQLite | MySQL |
|---------|--------|-------|
| Auto-increment | INTEGER PRIMARY KEY | INT AUTO_INCREMENT |
| UUID | TEXT | CHAR(36) |
| Boolean | INTEGER (0/1) | TINYINT(1) |
| Timestamps | TEXT/datetime | TIMESTAMP/DATETIME |
| Foreign Keys | Limited | Full support |

## Troubleshooting

### Error: "Can't connect to MySQL server"
- Check if MySQL service is running
- Verify port 3306 is not blocked
- Check firewall settings

### Error: "Access denied"
- Verify username/password in DATABASE_URL
- Check user permissions: `SHOW GRANTS FOR 'user'@'localhost'`

### Error: "Database doesn't exist"
- Create database manually first
- Check database name spelling

## Production Deployment

For production, use environment variables and connection pooling:

```env
DATABASE_URL=mysql://user:pass@host:3306/database?ssl-mode=REQUIRED
DB_POOL_SIZE=10
DB_TIMEOUT=60000
```

## Backup & Restore

### Backup:
```bash
mysqldump -u root -p bugema_attendance > backup.sql
```

### Restore:
```bash
mysql -u root -p bugema_attendance < backup.sql
```
