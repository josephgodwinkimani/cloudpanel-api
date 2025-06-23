/**
 * Database service for user authentication using SQLite
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseService {
  constructor() {
    this.dbPath = path.join(__dirname, '../../data/auth.db');
    this.db = null;
    this.init();
  }

  init() {
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize SQLite database
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.createTables();
      }
    });
  }

  createTables() {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `;

    const createSetupsTable = `
      CREATE TABLE IF NOT EXISTS setups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER,
        domain_name TEXT NOT NULL,
        php_version TEXT NOT NULL,
        vhost_template TEXT NOT NULL,
        site_user TEXT NOT NULL,
        database_name TEXT,
        database_user_name TEXT,
        database_password TEXT,
        repository_url TEXT,
        run_migrations BOOLEAN DEFAULT 0,
        run_seeders BOOLEAN DEFAULT 0,
        optimize_cache BOOLEAN DEFAULT 0,
        install_composer BOOLEAN DEFAULT 0,
        site_created BOOLEAN DEFAULT 0,
        database_created BOOLEAN DEFAULT 0,
        ssh_keys_copied BOOLEAN DEFAULT 0,
        repository_cloned BOOLEAN DEFAULT 0,
        env_configured BOOLEAN DEFAULT 0,
        laravel_setup_completed BOOLEAN DEFAULT 0,
        setup_status TEXT DEFAULT 'completed',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createJobsTable = `
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        result TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `;

    this.db.run(createUsersTable, (err) => {
      if (err) {
        console.error('Error creating users table:', err.message);
      } else {
        console.log('Users table ready');
      }
    });

    this.db.run(createSetupsTable, (err) => {
      if (err) {
        console.error('Error creating setups table:', err.message);
      } else {
        console.log('Setups table ready');
        // Run migrations after table is created
        this.runMigrations();
      }
    });

    this.db.run(createJobsTable, (err) => {
      if (err) {
        console.error('Error creating jobs table:', err.message);
      } else {
        console.log('Jobs table ready');
      }
    });
  }

  // Database migrations
  runMigrations() {
    // Migration 1: Add job_id column to setups table if it doesn't exist
    this.db.all("PRAGMA table_info(setups)", (err, columns) => {
      if (err) {
        console.error('Error checking setups table structure:', err.message);
        return;
      }

      const hasJobIdColumn = columns.some(column => column.name === 'job_id');
      const hasDatabasePasswordColumn = columns.some(column => column.name === 'database_password');

      if (!hasJobIdColumn) {
        console.log('Adding job_id column to setups table...');
        this.db.run("ALTER TABLE setups ADD COLUMN job_id INTEGER", (err) => {
          if (err) {
            console.error('Error adding job_id column:', err.message);
          } else {
            console.log('Successfully added job_id column to setups table');
          }
        });
      }

      // Migration: Add database_password column if it doesn't exist
      if (!hasDatabasePasswordColumn) {
        console.log('Adding database_password column to setups table...');
        this.db.run("ALTER TABLE setups ADD COLUMN database_password TEXT", (err) => {
          if (err) {
            console.error('Error adding database_password column:', err.message);
          } else {
            console.log('Successfully added database_password column to setups table');
          }
        });
      }
    });
  }

  // Create a new user
  createUser(username, hashedPassword) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO users (username, password, created_at) 
        VALUES (?, ?, datetime('now'))
      `);
      
      stmt.run([username, hashedPassword], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            username: username,
            createdAt: new Date().toISOString()
          });
        }
      });
      
      stmt.finalize();
    });
  }

  // Find user by username
  findUserByUsername(username) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE username = ?',
        [username],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Find user by ID
  findUserById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE id = ?',
        [id],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Update user's last login
  updateLastLogin(userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET last_login = datetime(\'now\') WHERE id = ?',
        [userId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Get all users
  getAllUsers() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT id, username, created_at, last_login FROM users',
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  // Clear all users
  clearAllUsers() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM users', [], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // Setup data methods
  
  // Create a new setup record
  createSetup(setupData) {
    return new Promise((resolve, reject) => {
      // First check if job_id column exists
      this.db.all("PRAGMA table_info(setups)", (err, columns) => {
        if (err) {
          reject(err);
          return;
        }

        const hasJobIdColumn = columns.some(column => column.name === 'job_id');
        
        let query, values;
        
        if (hasJobIdColumn) {
          // Include job_id column
          query = `
            INSERT INTO setups (
              job_id, domain_name, php_version, vhost_template, site_user, 
              database_name, database_user_name, database_password, repository_url,
              run_migrations, run_seeders, optimize_cache, install_composer,
              site_created, database_created, ssh_keys_copied, 
              repository_cloned, env_configured, laravel_setup_completed,
              setup_status, error_message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `;
          
          values = [
            setupData.jobId || null,
            setupData.domainName,
            setupData.phpVersion,
            setupData.vhostTemplate,
            setupData.siteUser,
            setupData.databaseName || null,
            setupData.databaseUserName || null,
            setupData.databasePassword || null,
            setupData.repositoryUrl || null,
            setupData.runMigrations || false,
            setupData.runSeeders || false,
            setupData.optimizeCache || false,
            setupData.installComposer || false,
            setupData.siteCreated || false,
            setupData.databaseCreated || false,
            setupData.sshKeysCopied || false,
            setupData.repositoryCloned || false,
            setupData.envConfigured || false,
            setupData.laravelSetupCompleted || false,
            setupData.setupStatus || 'completed',
            setupData.errorMessage || null
          ];
        } else {
          // Exclude job_id column for backward compatibility
          query = `
            INSERT INTO setups (
              domain_name, php_version, vhost_template, site_user, 
              database_name, database_user_name, database_password, repository_url,
              run_migrations, run_seeders, optimize_cache, install_composer,
              site_created, database_created, ssh_keys_copied, 
              repository_cloned, env_configured, laravel_setup_completed,
              setup_status, error_message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `;
          
          values = [
            setupData.domainName,
            setupData.phpVersion,
            setupData.vhostTemplate,
            setupData.siteUser,
            setupData.databaseName || null,
            setupData.databaseUserName || null,
            setupData.databasePassword || null,
            setupData.repositoryUrl || null,
            setupData.runMigrations || false,
            setupData.runSeeders || false,
            setupData.optimizeCache || false,
            setupData.installComposer || false,
            setupData.siteCreated || false,
            setupData.databaseCreated || false,
            setupData.sshKeysCopied || false,
            setupData.repositoryCloned || false,
            setupData.envConfigured || false,
            setupData.laravelSetupCompleted || false,
            setupData.setupStatus || 'completed',
            setupData.errorMessage || null
          ];
        }

        const stmt = this.db.prepare(query);
        
        stmt.run(values, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              id: this.lastID,
              domainName: setupData.domainName,
              createdAt: new Date().toISOString()
            });
          }
        });
        
        stmt.finalize();
      });
    });
  }

  // Get all setups
  getAllSetups() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM setups ORDER BY created_at DESC',
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  // Get setup by domain name
  getSetupByDomain(domainName) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM setups WHERE domain_name = ? ORDER BY created_at DESC LIMIT 1',
        [domainName],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Get setup by ID
  getSetupById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM setups WHERE id = ?',
        [id],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Update setup status
  updateSetupStatus(id, status, errorMessage = null, jobId = null) {
    return new Promise((resolve, reject) => {
      const fields = ['setup_status = ?'];
      const values = [status];
      
      if (errorMessage !== null) {
        fields.push('error_message = ?');
        values.push(errorMessage);
      }
      
      if (jobId !== null) {
        fields.push('job_id = ?');
        values.push(jobId);
      }
      
      values.push(id);
      
      this.db.run(
        `UPDATE setups SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Update setup record
  updateSetup(id, updateData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(updateData[key]);
        }
      });
      
      if (fields.length === 0) {
        resolve(0);
        return;
      }
      
      values.push(id);
      
      this.db.run(
        `UPDATE setups SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Delete setup record
  deleteSetup(id) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM setups WHERE id = ?',
        [id],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Job management methods
  
  // Create a new job
  createJob(jobData) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO jobs (
          type, data, status, priority, attempts, max_attempts,
          created_at, scheduled_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `);
      
      const values = [
        jobData.type,
        jobData.data,
        jobData.status || 'pending',
        jobData.priority || 0,
        jobData.attempts || 0,
        jobData.max_attempts || 3,
        jobData.scheduled_at || new Date().toISOString()
      ];
      
      stmt.run(values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            type: jobData.type,
            status: jobData.status || 'pending',
            createdAt: new Date().toISOString()
          });
        }
      });
      
      stmt.finalize();
    });
  }

  // Get next pending job
  getNextPendingJob() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM jobs 
         WHERE status = 'pending' 
         AND datetime(scheduled_at) <= datetime('now')
         ORDER BY priority DESC, created_at ASC 
         LIMIT 1`,
        [],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Get job by ID
  getJob(jobId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM jobs WHERE id = ?',
        [jobId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Update job
  updateJob(jobId, updateData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(updateData[key]);
        }
      });
      
      if (fields.length === 0) {
        resolve(0);
        return;
      }
      
      // Always update the updated_at field
      fields.push('updated_at = datetime(\'now\')');
      values.push(jobId);
      
      this.db.run(
        `UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Get jobs with filters
  getJobs(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM jobs';
      const conditions = [];
      const values = [];

      if (filters.status) {
        conditions.push('status = ?');
        values.push(filters.status);
      }

      if (filters.type) {
        conditions.push('type = ?');
        values.push(filters.type);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        values.push(filters.limit);
      }

      this.db.all(query, values, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Delete completed jobs older than specified days
  cleanupOldJobs(daysOld = 30) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM jobs 
         WHERE status IN ('completed', 'failed') 
         AND datetime(created_at) < datetime('now', '-${daysOld} days')`,
        [],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Cleanup duplicate setups for the same domain (keep only the latest)
  cleanupDuplicateSetups() {
    return new Promise((resolve, reject) => {
      // Find domains with multiple setups
      const findDuplicatesQuery = `
        SELECT domain_name, COUNT(*) as count 
        FROM setups 
        GROUP BY domain_name 
        HAVING COUNT(*) > 1
      `;
      
      this.db.all(findDuplicatesQuery, [], (err, duplicates) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (duplicates.length === 0) {
          resolve({ cleaned: 0, message: 'No duplicate setups found' });
          return;
        }
        
        let cleanedCount = 0;
        let processedDomains = 0;
        
        // For each domain with duplicates, keep only the latest one
        duplicates.forEach((duplicate) => {
          const deleteOldQuery = `
            DELETE FROM setups 
            WHERE domain_name = ? 
            AND id NOT IN (
              SELECT id FROM setups 
              WHERE domain_name = ? 
              ORDER BY created_at DESC 
              LIMIT 1
            )
          `;
          
          this.db.run(deleteOldQuery, [duplicate.domain_name, duplicate.domain_name], function(deleteErr) {
            if (deleteErr) {
              console.error(`Error cleaning duplicates for ${duplicate.domain_name}:`, deleteErr);
            } else {
              cleanedCount += this.changes;
              console.log(`Cleaned ${this.changes} duplicate setups for domain: ${duplicate.domain_name}`);
            }
            
            processedDomains++;
            
            // If all domains processed, resolve
            if (processedDomains === duplicates.length) {
              resolve({ 
                cleaned: cleanedCount, 
                domainsProcessed: processedDomains,
                message: `Cleaned ${cleanedCount} duplicate setups across ${processedDomains} domains`
              });
            }
          });
        });
      });
    });
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService;
