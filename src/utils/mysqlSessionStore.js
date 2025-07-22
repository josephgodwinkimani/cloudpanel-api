/**
 * Custom MySQL Session Store for Express Session
 */

const mysql = require('mysql2/promise');
const session = require('express-session');

class MySQLSessionStore extends session.Store {
  constructor(options = {}) {
    super(options);
    
    this.config = {
      host: options.host || '127.0.0.1',
      user: options.user || 'root',
      password: options.password || 'fafa',
      database: options.database || 'cloudpanelapidb',
      table: options.table || 'sessions',
      connectionLimit: options.connectionLimit || 10,
      waitForConnections: true,
      queueLimit: 0
    };
    
    this.connection = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      this.connection = mysql.createPool(this.config);
      await this.connection.getConnection();
      
      // Create sessions table if it doesn't exist
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS \`${this.config.table}\` (
          session_id VARCHAR(128) NOT NULL PRIMARY KEY,
          expires INT(11) UNSIGNED NOT NULL,
          data TEXT
        )
      `);
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing MySQL session store:', error);
      throw error;
    }
  }

  async get(sessionId, callback) {
    try {
      await this.init();
      
      const [rows] = await this.connection.execute(
        `SELECT data FROM \`${this.config.table}\` WHERE session_id = ? AND expires > ?`,
        [sessionId, Math.floor(Date.now() / 1000)]
      );

      if (rows.length === 0) {
        return callback(null, null);
      }

      const sessionData = JSON.parse(rows[0].data);
      callback(null, sessionData);
    } catch (error) {
      callback(error);
    }
  }

  async set(sessionId, session, callback) {
    try {
      await this.init();
      
      const expires = Math.floor(Date.now() / 1000) + (session.cookie.maxAge / 1000);
      const data = JSON.stringify(session);

      await this.connection.execute(
        `INSERT INTO \`${this.config.table}\` (session_id, expires, data) 
         VALUES (?, ?, ?) 
         ON DUPLICATE KEY UPDATE expires = ?, data = ?`,
        [sessionId, expires, data, expires, data]
      );

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async destroy(sessionId, callback) {
    try {
      await this.init();
      
      await this.connection.execute(
        `DELETE FROM \`${this.config.table}\` WHERE session_id = ?`,
        [sessionId]
      );

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async touch(sessionId, session, callback) {
    try {
      await this.init();
      
      const expires = Math.floor(Date.now() / 1000) + (session.cookie.maxAge / 1000);

      await this.connection.execute(
        `UPDATE \`${this.config.table}\` SET expires = ? WHERE session_id = ?`,
        [expires, sessionId]
      );

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async all(callback) {
    try {
      await this.init();
      
      const [rows] = await this.connection.execute(
        `SELECT session_id, data FROM \`${this.config.table}\` WHERE expires > ?`,
        [Math.floor(Date.now() / 1000)]
      );

      const sessions = {};
      rows.forEach(row => {
        sessions[row.session_id] = JSON.parse(row.data);
      });

      callback(null, sessions);
    } catch (error) {
      callback(error);
    }
  }

  async clear(callback) {
    try {
      await this.init();
      
      await this.connection.execute(`DELETE FROM \`${this.config.table}\``);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async length(callback) {
    try {
      await this.init();
      
      const [rows] = await this.connection.execute(
        `SELECT COUNT(*) as count FROM \`${this.config.table}\` WHERE expires > ?`,
        [Math.floor(Date.now() / 1000)]
      );

      callback(null, rows[0].count);
    } catch (error) {
      callback(error);
    }
  }

  async close() {
    if (this.connection) {
      await this.connection.end();
    }
  }
}

module.exports = MySQLSessionStore; 