const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');

class QueueManager {
  constructor() {
    this.workerProcess = null;
    this.isAutoStart = process.env.QUEUE_AUTO_START !== 'false';
  }

  /**
   * Start the queue worker process
   */
  startWorker() {
    if (this.workerProcess) {
      logger.warn('Queue worker is already running');
      return false;
    }

    try {
      const workerPath = path.join(__dirname, '../../worker.js');
      
      this.workerProcess = spawn('node', [workerPath], {
        stdio: ['inherit', 'inherit', 'inherit'],
        env: { ...process.env }
      });

      this.workerProcess.on('exit', (code, signal) => {
        logger.info(`Queue worker exited with code ${code} and signal ${signal}`);
        this.workerProcess = null;
        
        // Auto-restart if the worker crashed and we're in auto-start mode
        if (code !== 0 && this.isAutoStart) {
          logger.info('Auto-restarting queue worker in 5 seconds...');
          setTimeout(() => {
            this.startWorker();
          }, 5000);
        }
      });

      this.workerProcess.on('error', (error) => {
        logger.error('Queue worker process error:', error);
        this.workerProcess = null;
      });

      logger.info('Queue worker started successfully');
      return true;
    } catch (error) {
      logger.error('Failed to start queue worker:', error);
      return false;
    }
  }

  /**
   * Stop the queue worker process
   */
  stopWorker() {
    if (!this.workerProcess) {
      logger.warn('Queue worker is not running');
      return false;
    }

    try {
      this.workerProcess.send('shutdown');
      
      // Force kill after 10 seconds if graceful shutdown doesn't work
      setTimeout(() => {
        if (this.workerProcess) {
          logger.warn('Force killing queue worker process');
          this.workerProcess.kill('SIGKILL');
        }
      }, 10000);

      return true;
    } catch (error) {
      logger.error('Failed to stop queue worker:', error);
      return false;
    }
  }

  /**
   * Restart the queue worker
   */
  restartWorker() {
    logger.info('Restarting queue worker...');
    this.stopWorker();
    
    setTimeout(() => {
      this.startWorker();
    }, 2000);
    
    return true;
  }

  /**
   * Get worker status
   */
  getWorkerStatus() {
    return {
      isRunning: !!this.workerProcess,
      pid: this.workerProcess ? this.workerProcess.pid : null,
      autoStart: this.isAutoStart
    };
  }

  /**
   * Initialize queue manager and auto-start worker if enabled
   */
  initialize() {
    if (this.isAutoStart) {
      logger.info('Auto-starting queue worker...');
      this.startWorker();
    } else {
      logger.info('Queue auto-start is disabled. Start manually using /api/setup/queue/start');
    }
  }
}

module.exports = new QueueManager();
