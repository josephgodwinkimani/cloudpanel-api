/**
 * Setup script to create MySQL database and user for CloudPanel API
 * Run this script once to set up the MySQL database
 */

const mysql = require('mysql2/promise');

// MySQL root configuration (adjust as needed)
const rootConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: 'fafa',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Database configuration
const dbConfig = {
  database: 'cloudpanelapidb',
  user: 'root',
  password: 'fafa'
};

async function setupMySQL() {
  let connection = null;

  try {
    console.log('Setting up MySQL database for CloudPanel API...');

    // Connect to MySQL as root
    connection = mysql.createPool(rootConfig);
    await connection.getConnection();
    console.log('Connected to MySQL as root');

    // Create database if it doesn't exist
    console.log(`Creating database '${dbConfig.database}' if it doesn't exist...`);
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    console.log(`Database '${dbConfig.database}' is ready`);

    // Use the database
    await connection.query(`USE \`${dbConfig.database}\``);
    console.log(`Using database '${dbConfig.database}'`);

    // Create tables
    console.log('Creating tables...');
    
    // Users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL
      )
    `);
    console.log('Users table created');

    // Setups table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS setups (
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
      )
    `);
    console.log('Setups table created');

    // Jobs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS jobs (
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
      )
    `);
    console.log('Jobs table created');

    // Sessions table (for MySQL session store)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(128) NOT NULL PRIMARY KEY,
        expires INT(11) UNSIGNED NOT NULL,
        data TEXT
      )
    `);
    console.log('Sessions table created');

    console.log('\nMySQL setup completed successfully!');
    console.log('\nDatabase configuration:');
    console.log(`  Host: localhost`);
    console.log(`  Database: ${dbConfig.database}`);
    console.log(`  User: ${dbConfig.user}`);
    console.log(`  Password: ${dbConfig.password}`);

  } catch (error) {
    console.error('MySQL setup failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('MySQL connection closed');
    }
  }
}

// Run setup if this script is executed directly
if (require.main === module) {
  setupMySQL()
    .then(() => {
      console.log('\nSetup script completed successfully!');
      console.log('You can now run the migration script to transfer data from SQLite:');
      console.log('  node migrate-to-mysql.js');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nSetup script failed:', error);
      process.exit(1);
    });
}

module.exports = { setupMySQL }; 