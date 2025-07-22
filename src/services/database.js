/**
 * Database service for user authentication using MySQL
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

class DatabaseService {
  constructor() {
    this.connection = null;
    this.config = {
      host: '127.0.0.1',
      user: 'root',
      password: 'fafa',
      database: 'cloudpanelapidb',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      return;
    }

    try {
      // Create connection pool
      this.connection = mysql.createPool(this.config);
      
      // Test connection
      await this.connection.getConnection();
      console.log('Connected to MySQL database');
      
      // Create tables
      await this.createTables();
      
      this.initialized = true;
    } catch (err) {
      console.error('Error connecting to MySQL database:', err.message);
      throw err;
    }
  }

  async createTables() {
    try {
      const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP NULL
        )
      `;

      const createSetupsTable = `
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
      `;

      const createJobsTable = `
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
      `;

      await this.connection.execute(createUsersTable);
      console.log('Users table ready');

      await this.connection.execute(createSetupsTable);
      console.log('Setups table ready');

      await this.connection.execute(createJobsTable);
      console.log('Jobs table ready');

      // Run migrations
      await this.runMigrations();
    } catch (err) {
      console.error('Error creating tables:', err.message);
      throw err;
    }
  }

  // Database migrations
  async runMigrations() {
    try {
      // Check if job_id column exists in setups table
      const [columns] = await this.connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'setups' AND COLUMN_NAME = 'job_id'
      `, [this.config.database]);

      if (columns.length === 0) {
        console.log('Adding job_id column to setups table...');
        await this.connection.execute('ALTER TABLE setups ADD COLUMN job_id INT NULL');
        console.log('Successfully added job_id column to setups table');
      }

      // Check if database_password column exists
      const [passwordColumns] = await this.connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'setups' AND COLUMN_NAME = 'database_password'
      `, [this.config.database]);

      if (passwordColumns.length === 0) {
        console.log('Adding database_password column to setups table...');
        await this.connection.execute('ALTER TABLE setups ADD COLUMN database_password VARCHAR(255) NULL');
        console.log('Successfully added database_password column to setups table');
      }
    } catch (err) {
      console.error('Error running migrations:', err.message);
      throw err;
    }
  }

  // Create a new user
  async createUser(username, hashedPassword) {
    await this.init();
    try {
      const [result] = await this.connection.execute(
        'INSERT INTO users (username, password, created_at) VALUES (?, ?, NOW())',
        [username, hashedPassword]
      );

      return {
        id: result.insertId,
        username: username,
        createdAt: new Date().toISOString()
      };
    } catch (err) {
      throw err;
    }
  }

  // Find user by username
  async findUserByUsername(username) {
    await this.init();
    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM users WHERE username = ?',
        [username]
      );
      return rows[0] || null;
    } catch (err) {
      throw err;
    }
  }

  // Find user by ID
  async findUserById(id) {
    await this.init();
    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      return rows[0] || null;
    } catch (err) {
      throw err;
    }
  }

  // Update last login
  async updateLastLogin(userId) {
    await this.init();
    try {
      await this.connection.execute(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [userId]
      );
    } catch (err) {
      throw err;
    }
  }

  // Get all users
  async getAllUsers() {
    await this.init();
    try {
      const [rows] = await this.connection.execute('SELECT * FROM users ORDER BY created_at DESC');
      return rows;
    } catch (err) {
      throw err;
    }
  }

  // Clear all users
  async clearAllUsers() {
    await this.init();
    try {
      await this.connection.execute('DELETE FROM users');
    } catch (err) {
      throw err;
    }
  }

  // Setup data methods
  
  // Create a new setup record
  async createSetup(setupData) {
    await this.init();
    try {
      // Check if job_id column exists
      const [columns] = await this.connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'setups' AND COLUMN_NAME = 'job_id'
      `, [this.config.database]);

      const hasJobIdColumn = columns.length > 0;
      
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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

      const [result] = await this.connection.execute(query, values);
      
      return {
        id: result.insertId,
        domainName: setupData.domainName,
        createdAt: new Date().toISOString()
      };
    } catch (err) {
      throw err;
    }
  }

  // Get all setups
  async getAllSetups() {
    await this.init();
    try {
      const [rows] = await this.connection.execute('SELECT * FROM setups ORDER BY created_at DESC');
      return rows;
    } catch (err) {
      throw err;
    }
  }

  // Get setup by domain name
  async getSetupByDomain(domainName) {
    await this.init();
    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM setups WHERE domain_name = ? ORDER BY created_at DESC LIMIT 1',
        [domainName]
      );
      return rows[0] || null;
    } catch (err) {
      throw err;
    }
  }

  // Get setup by ID
  async getSetupById(id) {
    await this.init();
    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM setups WHERE id = ?',
        [id]
      );
      return rows[0] || null;
    } catch (err) {
      throw err;
    }
  }

  // Update setup status
  async updateSetupStatus(id, status, errorMessage = null, jobId = null) {
    await this.init();
    try {
      const [columns] = await this.connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'setups' AND COLUMN_NAME = 'job_id'
      `, [this.config.database]);

      const hasJobIdColumn = columns.length > 0;
      
      if (hasJobIdColumn && jobId !== null) {
        await this.connection.execute(
          'UPDATE setups SET setup_status = ?, error_message = ?, job_id = ? WHERE id = ?',
          [status, errorMessage, jobId, id]
        );
      } else {
        await this.connection.execute(
          'UPDATE setups SET setup_status = ?, error_message = ? WHERE id = ?',
          [status, errorMessage, id]
        );
      }
    } catch (err) {
      throw err;
    }
  }

  // Update setup
  async updateSetup(id, updateData) {
    await this.init();
    try {
      const fields = [];
      const values = [];

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(updateData[key]);
        }
      });

      if (fields.length === 0) {
        return;
      }

      values.push(id);
      const query = `UPDATE setups SET ${fields.join(', ')} WHERE id = ?`;
      
      await this.connection.execute(query, values);
    } catch (err) {
      throw err;
    }
  }

  // Delete setup
  async deleteSetup(id) {
    await this.init();
    try {
      await this.connection.execute('DELETE FROM setups WHERE id = ?', [id]);
    } catch (err) {
      throw err;
    }
  }

  // Job queue methods

  // Create a new job
  async createJob(jobData) {
    await this.init();
    try {
      const [result] = await this.connection.execute(
        `INSERT INTO jobs (
          type, data, status, priority, attempts, max_attempts, 
          result, error, created_at, updated_at, scheduled_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW(), ?)`,
        [
          jobData.type,
          JSON.stringify(jobData.data),
          jobData.status || 'pending',
          jobData.priority || 0,
          jobData.attempts || 0,
          jobData.maxAttempts || 3,
          jobData.result ? JSON.stringify(jobData.result) : null,
          jobData.error || null,
          jobData.completedAt || null
        ]
      );

      return {
        id: result.insertId,
        type: jobData.type,
        status: jobData.status || 'pending'
      };
    } catch (err) {
      throw err;
    }
  }

  // Get next pending job
  async getNextPendingJob() {
    await this.init();
    try {
      const [rows] = await this.connection.execute(
        `SELECT * FROM jobs 
         WHERE status = 'pending' 
         AND scheduled_at <= NOW()
         ORDER BY priority DESC, created_at ASC 
         LIMIT 1`
      );
      return rows[0] || null;
    } catch (err) {
      throw err;
    }
  }

  // Get job by ID
  async getJob(jobId) {
    await this.init();
    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM jobs WHERE id = ?',
        [jobId]
      );
      return rows[0] || null;
    } catch (err) {
      throw err;
    }
  }

  // Update job
  async updateJob(jobId, updateData) {
    await this.init();
    try {
      const fields = [];
      const values = [];

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          if (key === 'data' || key === 'result') {
            fields.push(`${key} = ?`);
            values.push(JSON.stringify(updateData[key]));
          } else {
            fields.push(`${key} = ?`);
            values.push(updateData[key]);
          }
        }
      });

      if (fields.length === 0) {
        return;
      }

      // Always update the updated_at field
      fields.push('updated_at = NOW()');
      values.push(jobId);
      
      const query = `UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`;
      
      await this.connection.execute(query, values);
    } catch (err) {
      throw err;
    }
  }

  // Get jobs with filters
  async getJobs(filters = {}) {
    await this.init();
    try {
      let query = 'SELECT * FROM jobs WHERE 1=1';
      const values = [];

      if (filters.status) {
        query += ' AND status = ?';
        values.push(filters.status);
      }

      if (filters.type) {
        query += ' AND type = ?';
        values.push(filters.type);
      }

      if (filters.limit) {
        query += ' ORDER BY created_at DESC LIMIT ?';
        values.push(filters.limit);
      } else {
        query += ' ORDER BY created_at DESC';
      }

      const [rows] = await this.connection.execute(query, values);
      return rows;
    } catch (err) {
      throw err;
    }
  }

  // Cleanup old jobs
  async cleanupOldJobs(daysOld = 30) {
    await this.init();
    try {
      await this.connection.execute(
        'DELETE FROM jobs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
        [daysOld]
      );
    } catch (err) {
      throw err;
    }
  }

  // Cleanup duplicate setups
  async cleanupDuplicateSetups() {
    await this.init();
    try {
      // Delete duplicate setups keeping only the latest one for each domain
      await this.connection.execute(`
        DELETE s1 FROM setups s1
        INNER JOIN setups s2 
        WHERE s1.id < s2.id 
        AND s1.domain_name = s2.domain_name
      `);
    } catch (err) {
      throw err;
    }
  }

  // Close database connection
  async close() {
    try {
      if (this.connection) {
        await this.connection.end();
        console.log('Database connection closed');
      }
    } catch (err) {
      console.error('Error closing database:', err.message);
    }
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService;
