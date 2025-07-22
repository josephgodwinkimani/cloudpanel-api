/**
 * Migration script to transfer data from SQLite to MySQL
 * Run this script once to migrate existing data
 */

const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// SQLite database path
const sqliteDbPath = path.join(__dirname, 'data/auth.db');

// MySQL configuration
const mysqlConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: 'fafa',
  database: 'cloudpanelapidb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

async function migrateData() {
  let sqliteDb = null;
  let mysqlConnection = null;

  try {
    console.log('Starting migration from SQLite to MySQL...');

    // Check if SQLite database exists
    if (!fs.existsSync(sqliteDbPath)) {
      console.log('SQLite database not found. Nothing to migrate.');
      return;
    }

    // Connect to SQLite
    sqliteDb = new sqlite3.Database(sqliteDbPath);
    console.log('Connected to SQLite database');

    // Connect to MySQL
    mysqlConnection = mysql.createPool(mysqlConfig);
    await mysqlConnection.getConnection();
    console.log('Connected to MySQL database');

    // Migrate users
    await migrateUsers(sqliteDb, mysqlConnection);

    // Migrate setups
    await migrateSetups(sqliteDb, mysqlConnection);

    // Migrate jobs
    await migrateJobs(sqliteDb, mysqlConnection);

    console.log('\nMigration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    // Close connections
    if (sqliteDb) {
      sqliteDb.close();
      console.log('SQLite connection closed');
    }
    if (mysqlConnection) {
      await mysqlConnection.end();
      console.log('MySQL connection closed');
    }
  }
}

async function migrateUsers(sqliteDb, mysqlConnection) {
  return new Promise((resolve, reject) => {
    console.log('\nMigrating users...');
    
    sqliteDb.all('SELECT * FROM users', async (err, users) => {
      if (err) {
        reject(err);
        return;
      }

      if (users.length === 0) {
        console.log('No users to migrate');
        resolve();
        return;
      }

      let migratedCount = 0;
      let skippedCount = 0;

      for (const user of users) {
        try {
          // Check if user already exists in MySQL
          const [existingUsers] = await mysqlConnection.execute(
            'SELECT id FROM users WHERE username = ?',
            [user.username]
          );

          if (existingUsers.length > 0) {
            console.log(`User '${user.username}' already exists in MySQL, skipping...`);
            skippedCount++;
            continue;
          }

          // Convert datetime strings to MySQL format
          const convertDateTime = (dateStr) => {
            if (!dateStr) return null;
            // Convert ISO string to MySQL datetime format
            return new Date(dateStr).toISOString().slice(0, 19).replace('T', ' ');
          };

          // Insert user into MySQL
          await mysqlConnection.execute(
            'INSERT INTO users (id, username, password, created_at, last_login) VALUES (?, ?, ?, ?, ?)',
            [
              user.id,
              user.username,
              user.password,
              convertDateTime(user.created_at),
              convertDateTime(user.last_login)
            ]
          );

          console.log(`Migrated user: ${user.username}`);
          migratedCount++;

        } catch (error) {
          console.error(`Error migrating user ${user.username}:`, error.message);
        }
      }

      console.log(`Users migration completed: ${migratedCount} migrated, ${skippedCount} skipped`);
      resolve();
    });
  });
}

async function migrateSetups(sqliteDb, mysqlConnection) {
  return new Promise((resolve, reject) => {
    console.log('\nMigrating setups...');
    
    sqliteDb.all('SELECT * FROM setups', async (err, setups) => {
      if (err) {
        reject(err);
        return;
      }

      if (setups.length === 0) {
        console.log('No setups to migrate');
        resolve();
        return;
      }

      let migratedCount = 0;
      let skippedCount = 0;

      for (const setup of setups) {
        try {
          // Check if setup already exists in MySQL
          const [existingSetups] = await mysqlConnection.execute(
            'SELECT id FROM setups WHERE id = ?',
            [setup.id]
          );

          if (existingSetups.length > 0) {
            console.log(`Setup ID ${setup.id} already exists in MySQL, skipping...`);
            skippedCount++;
            continue;
          }

          // Convert datetime strings to MySQL format
          const convertDateTime = (dateStr) => {
            if (!dateStr) return null;
            // Convert ISO string to MySQL datetime format
            return new Date(dateStr).toISOString().slice(0, 19).replace('T', ' ');
          };

          // Insert setup into MySQL
          await mysqlConnection.execute(
            `INSERT INTO setups (
              id, job_id, domain_name, php_version, vhost_template, site_user,
              database_name, database_user_name, database_password, repository_url,
              run_migrations, run_seeders, optimize_cache, install_composer,
              site_created, database_created, ssh_keys_copied, repository_cloned,
              env_configured, laravel_setup_completed, setup_status, error_message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              setup.id,
              setup.job_id || null,
              setup.domain_name,
              setup.php_version,
              setup.vhost_template,
              setup.site_user,
              setup.database_name,
              setup.database_user_name,
              setup.database_password,
              setup.repository_url,
              setup.run_migrations ? true : false,
              setup.run_seeders ? true : false,
              setup.optimize_cache ? true : false,
              setup.install_composer ? true : false,
              setup.site_created ? true : false,
              setup.database_created ? true : false,
              setup.ssh_keys_copied ? true : false,
              setup.repository_cloned ? true : false,
              setup.env_configured ? true : false,
              setup.laravel_setup_completed ? true : false,
              setup.setup_status,
              setup.error_message,
              convertDateTime(setup.created_at)
            ]
          );

          console.log(`Migrated setup: ${setup.domain_name} (ID: ${setup.id})`);
          migratedCount++;

        } catch (error) {
          console.error(`Error migrating setup ID ${setup.id}:`, error.message);
        }
      }

      console.log(`Setups migration completed: ${migratedCount} migrated, ${skippedCount} skipped`);
      resolve();
    });
  });
}

async function migrateJobs(sqliteDb, mysqlConnection) {
  return new Promise((resolve, reject) => {
    console.log('\nMigrating jobs...');
    
    sqliteDb.all('SELECT * FROM jobs', async (err, jobs) => {
      if (err) {
        reject(err);
        return;
      }

      if (jobs.length === 0) {
        console.log('No jobs to migrate');
        resolve();
        return;
      }

      let migratedCount = 0;
      let skippedCount = 0;

      for (const job of jobs) {
        try {
          // Check if job already exists in MySQL
          const [existingJobs] = await mysqlConnection.execute(
            'SELECT id FROM jobs WHERE id = ?',
            [job.id]
          );

          if (existingJobs.length > 0) {
            console.log(`Job ID ${job.id} already exists in MySQL, skipping...`);
            skippedCount++;
            continue;
          }

          // Parse JSON data
          let data = job.data;
          let result = job.result;
          
          try {
            if (typeof data === 'string') {
              data = JSON.parse(data);
            }
            if (typeof result === 'string' && result) {
              result = JSON.parse(result);
            }
          } catch (parseError) {
            console.warn(`Warning: Could not parse JSON for job ID ${job.id}:`, parseError.message);
            data = { raw_data: job.data };
            result = job.result ? { raw_result: job.result } : null;
          }

          // Convert datetime strings to MySQL format
          const convertDateTime = (dateStr) => {
            if (!dateStr) return null;
            // Convert ISO string to MySQL datetime format
            return new Date(dateStr).toISOString().slice(0, 19).replace('T', ' ');
          };

          // Insert job into MySQL
          await mysqlConnection.execute(
            `INSERT INTO jobs (
              id, type, data, status, priority, attempts, max_attempts,
              result, error, created_at, updated_at, scheduled_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              job.id,
              job.type,
              JSON.stringify(data),
              job.status,
              job.priority,
              job.attempts,
              job.max_attempts,
              result ? JSON.stringify(result) : null,
              job.error,
              convertDateTime(job.created_at),
              convertDateTime(job.updated_at),
              convertDateTime(job.scheduled_at),
              convertDateTime(job.completed_at)
            ]
          );

          console.log(`Migrated job: ${job.type} (ID: ${job.id})`);
          migratedCount++;

        } catch (error) {
          console.error(`Error migrating job ID ${job.id}:`, error.message);
        }
      }

      console.log(`Jobs migration completed: ${migratedCount} migrated, ${skippedCount} skipped`);
      resolve();
    });
  });
}

// Run migration if this script is executed directly
if (require.main === module) {
  migrateData()
    .then(() => {
      console.log('\nMigration script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nMigration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateData }; 