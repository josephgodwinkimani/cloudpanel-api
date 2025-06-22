const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * API Key authentication middleware
 */
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.header('X-API-Key') || req.query.apiKey;
  const validApiKey = process.env.API_KEY;

  // Log debugging information (without exposing actual keys)
  logger.info(`API Key Authentication - Environment: ${process.env.NODE_ENV}`);
  logger.info(`API Key present in request: ${!!apiKey}`);
  logger.info(`Valid API Key configured: ${!!validApiKey}`);

  // Skip authentication in development if no API key is set
  if (process.env.NODE_ENV === 'development' && !validApiKey) {
    logger.info('Skipping API key validation in development (no API key configured)');
    return next();
  }

  if (!validApiKey) {
    logger.error('No API key configured in environment variables');
    return res.status(500).json({
      success: false,
      error: 'Server configuration error - API key not configured'
    });
  }

  if (!apiKey) {
    logger.warn(`Missing API key in request from ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Missing API key. Please provide X-API-Key header or apiKey query parameter.'
    });
  }

  if (apiKey !== validApiKey) {
    logger.warn(`Invalid API key attempt from ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid API key'
    });
  }

  logger.info(`Successful API key authentication from ${req.ip}`);
  next();
};

/**
 * Enhanced rate limiting for different endpoint types
 */
const createRateLimit = (windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests') => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

/**
 * Strict rate limiting for destructive operations
 */
const strictRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  10, // 10 requests per hour
  'Too many destructive operations - please wait before trying again'
);

/**
 * Moderate rate limiting for resource creation
 */
const moderateRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  50, // 50 requests per 15 minutes
  'Too many resource creation requests'
);

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Skip logging for frontend routes (except login/logout)
  const isFrontendRoute = (req.originalUrl.startsWith('/sites') || 
                          req.originalUrl.startsWith('/docs') || 
                          req.originalUrl.startsWith('/logs')) &&
                         !req.originalUrl.includes('/login') && 
                         !req.originalUrl.includes('/logout');
  
  if (isFrontendRoute) {
    return next();
  }
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
};

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  // Joi validation error
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: err.details.map(detail => detail.message)
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Authentication middleware for web routes
 */
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

module.exports = {
  authenticateApiKey,
  requireAuth,
  createRateLimit,
  strictRateLimit,
  moderateRateLimit,
  requestLogger,
  errorHandler
};
