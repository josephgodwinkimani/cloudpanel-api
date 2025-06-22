const logger = require('./logger');

/**
 * Utility class to track and log CloudPanel operations with detailed context
 */
class CloudPanelLogger {
  constructor() {
    this.operationCounter = 0;
  }

  /**
   * Generate a unique operation ID
   */
  generateOperationId() {
    this.operationCounter++;
    return `op_${Date.now()}_${this.operationCounter}`;
  }

  /**
   * Log site-related operations
   */
  logSiteOperation(type, operation, details = {}) {
    const operationId = this.generateOperationId();
    
    const siteContext = {
      operationId,
      operationType: type, // 'create', 'delete', 'update', 'configure'
      operation,
      timestamp: new Date().toISOString(),
      ...details
    };

    switch (type) {
      case 'create':
        logger.site('info', `Site creation initiated: ${operation}`, siteContext);
        break;
      case 'delete':
        logger.site('info', `Site deletion initiated: ${operation}`, siteContext);
        break;
      case 'success':
        logger.success('site', `Site operation completed successfully: ${operation}`, siteContext);
        break;
      case 'error':
        logger.failure('site', `Site operation failed: ${operation}`, siteContext);
        break;
      default:
        logger.site('info', `Site operation: ${operation}`, siteContext);
    }

    return operationId;
  }

  /**
   * Log database-related operations
   */
  logDatabaseOperation(type, operation, details = {}) {
    const operationId = this.generateOperationId();
    
    const dbContext = {
      operationId,
      operationType: type,
      operation,
      timestamp: new Date().toISOString(),
      ...details
    };

    switch (type) {
      case 'create':
        logger.database('info', `Database creation initiated: ${operation}`, dbContext);
        break;
      case 'delete':
        logger.database('info', `Database deletion initiated: ${operation}`, dbContext);
        break;
      case 'export':
        logger.database('info', `Database export initiated: ${operation}`, dbContext);
        break;
      case 'import':
        logger.database('info', `Database import initiated: ${operation}`, dbContext);
        break;
      case 'success':
        logger.success('database', `Database operation completed successfully: ${operation}`, dbContext);
        break;
      case 'error':
        logger.failure('database', `Database operation failed: ${operation}`, dbContext);
        break;
      default:
        logger.database('info', `Database operation: ${operation}`, dbContext);
    }

    return operationId;
  }

  /**
   * Log user-related operations
   */
  logUserOperation(type, operation, details = {}) {
    const operationId = this.generateOperationId();
    
    const userContext = {
      operationId,
      operationType: type,
      operation,
      timestamp: new Date().toISOString(),
      ...details
    };

    switch (type) {
      case 'create':
        logger.user('info', `User creation initiated: ${operation}`, userContext);
        break;
      case 'delete':
        logger.user('info', `User deletion initiated: ${operation}`, userContext);
        break;
      case 'password_reset':
        logger.user('info', `Password reset initiated: ${operation}`, userContext);
        break;
      case 'mfa_disable':
        logger.user('info', `MFA disable initiated: ${operation}`, userContext);
        break;
      case 'success':
        logger.success('user', `User operation completed successfully: ${operation}`, userContext);
        break;
      case 'error':
        logger.failure('user', `User operation failed: ${operation}`, userContext);
        break;
      default:
        logger.user('info', `User operation: ${operation}`, userContext);
    }

    return operationId;
  }

  /**
   * Log security-related operations
   */
  logSecurityOperation(type, operation, details = {}) {
    const operationId = this.generateOperationId();
    
    const securityContext = {
      operationId,
      operationType: type,
      operation,
      timestamp: new Date().toISOString(),
      ...details
    };

    switch (type) {
      case 'auth_enable':
        logger.security('info', `Authentication enable initiated: ${operation}`, securityContext);
        break;
      case 'auth_disable':
        logger.security('info', `Authentication disable initiated: ${operation}`, securityContext);
        break;
      case 'ssl_install':
        logger.security('info', `SSL certificate installation initiated: ${operation}`, securityContext);
        break;
      case 'login_attempt':
        logger.security('info', `Login attempt: ${operation}`, securityContext);
        break;
      case 'access_denied':
        logger.security('warn', `Access denied: ${operation}`, securityContext);
        break;
      case 'success':
        logger.success('security', `Security operation completed successfully: ${operation}`, securityContext);
        break;
      case 'error':
        logger.failure('security', `Security operation failed: ${operation}`, securityContext);
        break;
      default:
        logger.security('info', `Security operation: ${operation}`, securityContext);
    }

    return operationId;
  }

  /**
   * Log CLI command executions
   */
  logCliExecution(type, command, details = {}) {
    const operationId = this.generateOperationId();
    
    const cliContext = {
      operationId,
      commandType: type,
      command,
      timestamp: new Date().toISOString(),
      ...details
    };

    switch (type) {
      case 'start':
        logger.cli('info', `CLI command execution started: ${command}`, cliContext);
        break;
      case 'ssh_start':
        logger.cli('info', `SSH CLI command execution started: ${command}`, cliContext);
        break;
      case 'local_start':
        logger.cli('info', `Local CLI command execution started: ${command}`, cliContext);
        break;
      case 'success':
        logger.success('cli', `CLI command executed successfully: ${command}`, cliContext);
        break;
      case 'error':
        logger.failure('cli', `CLI command execution failed: ${command}`, cliContext);
        break;
      case 'timeout':
        logger.failure('cli', `CLI command execution timed out: ${command}`, cliContext);
        break;
      default:
        logger.cli('info', `CLI command: ${command}`, cliContext);
    }

    return operationId;
  }

  /**
   * Log application lifecycle events
   */
  logAppEvent(type, event, details = {}) {
    const appContext = {
      eventType: type,
      event,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...details
    };

    switch (type) {
      case 'startup':
        logger.success('startup', `Application event: ${event}`, appContext);
        break;
      case 'shutdown':
        logger.logAction('info', 'shutdown', `Application event: ${event}`, appContext);
        break;
      case 'error':
        logger.failure('startup', `Application error: ${event}`, appContext);
        break;
      case 'warning':
        logger.warning('startup', `Application warning: ${event}`, appContext);
        break;
      default:
        logger.logAction('info', 'startup', `Application event: ${event}`, appContext);
    }
  }

  /**
   * Log repository operations (git clone, etc.)
   */
  logRepositoryOperation(type, operation, details = {}) {
    const operationId = this.generateOperationId();
    
    const repoContext = {
      operationId,
      operationType: type,
      operation,
      timestamp: new Date().toISOString(),
      ...details
    };

    switch (type) {
      case 'clone':
        logger.site('info', `Repository clone initiated: ${operation}`, repoContext);
        break;
      case 'pull':
        logger.site('info', `Repository pull initiated: ${operation}`, repoContext);
        break;
      case 'success':
        logger.success('site', `Repository operation completed successfully: ${operation}`, repoContext);
        break;
      case 'error':
        logger.failure('site', `Repository operation failed: ${operation}`, repoContext);
        break;
      default:
        logger.site('info', `Repository operation: ${operation}`, repoContext);
    }

    return operationId;
  }

  /**
   * Log Laravel-specific operations
   */
  logLaravelOperation(type, operation, details = {}) {
    const operationId = this.generateOperationId();
    
    const laravelContext = {
      operationId,
      operationType: type,
      operation,
      timestamp: new Date().toISOString(),
      framework: 'Laravel',
      ...details
    };

    switch (type) {
      case 'setup':
        logger.site('info', `Laravel setup initiated: ${operation}`, laravelContext);
        break;
      case 'env_config':
        logger.site('info', `Laravel environment configuration: ${operation}`, laravelContext);
        break;
      case 'migration':
        logger.site('info', `Laravel migration: ${operation}`, laravelContext);
        break;
      case 'composer':
        logger.site('info', `Laravel composer operation: ${operation}`, laravelContext);
        break;
      case 'success':
        logger.success('site', `Laravel operation completed successfully: ${operation}`, laravelContext);
        break;
      case 'error':
        logger.failure('site', `Laravel operation failed: ${operation}`, laravelContext);
        break;
      default:
        logger.site('info', `Laravel operation: ${operation}`, laravelContext);
    }

    return operationId;
  }

  /**
   * Create a performance timer for tracking operation duration
   */
  createTimer(operationName, category = 'general') {
    const startTime = Date.now();
    const operationId = this.generateOperationId();

    logger.logAction('info', category, `Timer started for operation: ${operationName}`, {
      operationId,
      operationName,
      startTime: new Date(startTime).toISOString()
    });

    return {
      operationId,
      end: (additionalDetails = {}) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        logger.logAction('info', category, `Timer ended for operation: ${operationName}`, {
          operationId,
          operationName,
          duration: `${duration}ms`,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          ...additionalDetails
        });

        return duration;
      }
    };
  }
}

// Export singleton instance
module.exports = new CloudPanelLogger();
