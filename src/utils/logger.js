const winston = require('winston');
const path = require('path');

// Create a custom format for detailed logging
const detailedFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, action, details, requestId, userId, ...meta } = info;
    
    let logMessage = `[${timestamp}] ${level.toUpperCase()}`;
    
    if (action) {
      logMessage += ` [${action}]`;
    }
    
    if (requestId) {
      logMessage += ` [REQ:${requestId}]`;
    }
    
    if (userId) {
      logMessage += ` [USER:${userId}]`;
    }
    
    logMessage += `: ${message}`;
    
    if (details && Object.keys(details).length > 0) {
      logMessage += ` | Details: ${JSON.stringify(details)}`;
    }
    
    if (Object.keys(meta).length > 0) {
      logMessage += ` | Meta: ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

const logger = winston.createLogger({
  level: 'info',
  format: detailedFormat,
  defaultMeta: { service: 'cloudpanel-api' },
  transports: [
    // General logs
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 10
    }),
    // Error logs
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Success logs
    new winston.transports.File({ 
      filename: 'logs/success.log',
      level: 'info',
      format: winston.format.combine(
        detailedFormat,
        winston.format.printf((info) => {
          // Only log success messages
          if (info.level === 'info' && (info.message.includes('success') || info.action === 'success')) {
            return info.message;
          }
          return false;
        })
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Warning logs
    new winston.transports.File({ 
      filename: 'logs/warning.log',
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Database action logs
    new winston.transports.File({ 
      filename: 'logs/database.log',
      format: winston.format.combine(
        detailedFormat,
        winston.format.printf((info) => {
          if (info.action && info.action.toLowerCase().includes('database')) {
            return info.message;
          }
          return false;
        })
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Site management logs
    new winston.transports.File({ 
      filename: 'logs/sites.log',
      format: winston.format.combine(
        detailedFormat,
        winston.format.printf((info) => {
          if (info.action && (info.action.toLowerCase().includes('site') || info.action.toLowerCase().includes('domain'))) {
            return info.message;
          }
          return false;
        })
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // User management logs
    new winston.transports.File({ 
      filename: 'logs/users.log',
      format: winston.format.combine(
        detailedFormat,
        winston.format.printf((info) => {
          if (info.action && info.action.toLowerCase().includes('user')) {
            return info.message;
          }
          return false;
        })
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Security logs
    new winston.transports.File({ 
      filename: 'logs/security.log',
      format: winston.format.combine(
        detailedFormat,
        winston.format.printf((info) => {
          if (info.action && (info.action.toLowerCase().includes('auth') || info.action.toLowerCase().includes('security') || info.action.toLowerCase().includes('login'))) {
            return info.message;
          }
          return false;
        })
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // CloudPanel CLI logs
    new winston.transports.File({ 
      filename: 'logs/cloudpanel-cli.log',
      format: winston.format.combine(
        detailedFormat,
        winston.format.printf((info) => {
          if (info.action && info.action.toLowerCase().includes('cli')) {
            return info.message;
          }
          return false;
        })
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// If we're not in production then log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Enhanced logging methods with action categorization
logger.logAction = function(level, action, message, details = {}, metadata = {}) {
  this.log(level, message, {
    action,
    details,
    ...metadata
  });
};

logger.success = function(action, message, details = {}, metadata = {}) {
  this.logAction('info', action, `✅ SUCCESS: ${message}`, details, metadata);
};

logger.failure = function(action, message, details = {}, metadata = {}) {
  this.logAction('error', action, `❌ FAILED: ${message}`, details, metadata);
};

logger.warning = function(action, message, details = {}, metadata = {}) {
  this.logAction('warn', action, `⚠️  WARNING: ${message}`, details, metadata);
};

logger.database = function(level, message, details = {}, metadata = {}) {
  this.logAction(level, 'database', message, details, metadata);
};

logger.site = function(level, message, details = {}, metadata = {}) {
  this.logAction(level, 'site', message, details, metadata);
};

logger.user = function(level, message, details = {}, metadata = {}) {
  this.logAction(level, 'user', message, details, metadata);
};

logger.security = function(level, message, details = {}, metadata = {}) {
  this.logAction(level, 'security', message, details, metadata);
};

logger.cli = function(level, message, details = {}, metadata = {}) {
  this.logAction(level, 'cli', message, details, metadata);
};

module.exports = logger;
