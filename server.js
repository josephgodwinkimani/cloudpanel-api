#!/usr/bin/env node

/**
 * Production server startup script
 * Sets production environment variables and starts the server
 */

// Set production environment
process.env.NODE_ENV = 'production';

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
require('./src/index.js');
