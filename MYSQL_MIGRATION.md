# MySQL Migration Guide

This guide explains how to migrate from SQLite to MySQL for the CloudPanel API.

## Prerequisites

1. MySQL server installed and running
2. MySQL root access with password 'fafa'
3. Node.js and npm installed

## Migration Steps

### 1. Install Dependencies

First, install the new MySQL dependencies:

```bash
npm install
```

This will install:
- `mysql2` - MySQL client for Node.js
- `connect-mysql` - MySQL session store for Express

### 2. Setup MySQL Database

Create the MySQL database and tables:

```bash
npm run setup-mysql
```

This script will:
- Connect to MySQL as root
- Create the `cloudpanelapidb` database
- Create all necessary tables (users, setups, jobs, sessions)
- Set up proper indexes and constraints

### 3. Migrate Data (Optional)

If you have existing data in SQLite, migrate it to MySQL:

```bash
npm run migrate-to-mysql
```

This script will:
- Read data from `data/auth.db` (SQLite)
- Transfer users, setups, and jobs to MySQL
- Skip existing records to avoid duplicates
- Preserve all data relationships

### 4. Start the Application

The application will now use MySQL instead of SQLite:

```bash
npm start
```

## Database Configuration

The application is configured to use:

- **Host**: localhost
- **User**: root
- **Password**: fafa
- **Database**: cloudpanelapidb

## Changes Made

### Database Service (`src/services/database.js`)

- Replaced SQLite with MySQL using `mysql2/promise`
- Updated all database queries to use MySQL syntax
- Added connection pooling for better performance
- Implemented async/await pattern throughout
- Added automatic database initialization

### Session Store (`src/utils/sessionStore.js`)

- Added MySQL session store support
- Falls back to MySQL if Redis is not available
- Maintains backward compatibility with SQLite

### Package Dependencies

- Added `mysql2` for MySQL connectivity
- Added `connect-mysql` for session storage
- Kept `sqlite3` for migration purposes

## Table Structure

### Users Table
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL
);
```

### Setups Table
```sql
CREATE TABLE setups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NULL,
  domain_name VARCHAR(255) NOT NULL,
  php_version VARCHAR(50) NOT NULL,
  vhost_template VARCHAR(255) NOT NULL,
  site_user VARCHAR(255) NOT NULL,
  database_name VARCHAR(255) NULL,
  database_user_name VARCHAR(255) NULL,
  database_password VARCHAR(255) NULL,
  repository_url TEXT NULL,
  run_migrations BOOLEAN DEFAULT FALSE,
  run_seeders BOOLEAN DEFAULT FALSE,
  optimize_cache BOOLEAN DEFAULT FALSE,
  install_composer BOOLEAN DEFAULT FALSE,
  site_created BOOLEAN DEFAULT FALSE,
  database_created BOOLEAN DEFAULT FALSE,
  ssh_keys_copied BOOLEAN DEFAULT FALSE,
  repository_cloned BOOLEAN DEFAULT FALSE,
  env_configured BOOLEAN DEFAULT FALSE,
  laravel_setup_completed BOOLEAN DEFAULT FALSE,
  setup_status VARCHAR(50) DEFAULT 'completed',
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Jobs Table
```sql
CREATE TABLE jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  data JSON NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  priority INT DEFAULT 0,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  result JSON NULL,
  error TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL
);
```

### Sessions Table
```sql
CREATE TABLE sessions (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  expires INT(11) UNSIGNED NOT NULL,
  data TEXT
);
```

## Troubleshooting

### Connection Issues

If you get connection errors:

1. Verify MySQL is running:
   ```bash
   sudo systemctl status mysql
   ```

2. Check MySQL root password:
   ```bash
   mysql -u root -p
   ```

3. Create database manually if needed:
   ```sql
   CREATE DATABASE cloudpanelapidb;
   ```

### Migration Issues

If migration fails:

1. Check if SQLite database exists:
   ```bash
   ls -la data/auth.db
   ```

2. Verify MySQL connection:
   ```bash
   node setup-mysql.js
   ```

3. Check MySQL logs for errors:
   ```bash
   sudo tail -f /var/log/mysql/error.log
   ```

### Performance Issues

For better performance:

1. Adjust connection pool settings in `src/services/database.js`
2. Add appropriate indexes to tables
3. Consider using Redis for session storage in production

## Rollback

If you need to rollback to SQLite:

1. Stop the application
2. Restore the original `src/services/database.js` file
3. Restore the original `src/utils/sessionStore.js` file
4. Remove MySQL dependencies from `package.json`
5. Run `npm install`

## Production Considerations

For production deployment:

1. Use a dedicated MySQL user instead of root
2. Set up proper MySQL security
3. Configure connection pooling appropriately
4. Set up MySQL backups
5. Consider using Redis for session storage
6. Monitor MySQL performance

## Support

If you encounter issues:

1. Check the application logs
2. Verify MySQL configuration
3. Test database connectivity manually
4. Review the migration logs for errors 