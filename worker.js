#!/usr/bin/env node

/**
 * Queue Worker for CloudPanel API
 * This script runs background jobs for Laravel site setup
 */

const path = require('path');
const jobQueue = require('./src/services/jobQueue');
const logger = require('./src/utils/logger');

// Handle graceful shutdown
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.warn('Force shutdown requested');
    process.exit(1);
  }
  
  isShuttingDown = true;
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    jobQueue.stopWorker();
    logger.info('Queue worker stopped successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Setup signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

async function startWorker() {
  try {
    logger.info('Starting CloudPanel Queue Worker...');
    
    // Start the job queue worker
    await jobQueue.startWorker(3000); // Check for jobs every 3 seconds
    
    logger.info('Queue worker started successfully');
    logger.info('Worker is now processing jobs...');
    
    // Keep the process alive
    process.on('message', (message) => {
      if (message === 'shutdown') {
        gracefulShutdown('shutdown message');
      }
    });
    
  } catch (error) {
    logger.error('Failed to start queue worker:', error);
    process.exit(1);
  }
}

// Show startup banner
console.log(`
╔══════════════════════════════════════════════════════╗
║             CloudPanel Queue Worker                 ║
║                                                      ║
║  Processing Laravel setup jobs in background        ║
║  Press Ctrl+C to stop gracefully                    ║
╚══════════════════════════════════════════════════════╝
`);

// Start the worker
startWorker().catch(error => {
  logger.error('Failed to start worker:', error);
  process.exit(1);
});
