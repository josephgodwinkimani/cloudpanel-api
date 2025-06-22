const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Middleware to log all API requests with detailed information
 */
const requestLoggingMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID().substring(0, 8);
  
  // Add request ID to request for tracking
  req.requestId = requestId;
  
  // Skip logging for frontend routes (except login/logout)
  const isFrontendRoute = (req.originalUrl.startsWith('/sites') || 
                          req.originalUrl.startsWith('/docs') || 
                          req.originalUrl.startsWith('/logs')) &&
                         !req.originalUrl.includes('/login') && 
                         !req.originalUrl.includes('/logout');
  
  if (isFrontendRoute) {
    return next();
  }
  
  // Log incoming request
  const requestDetails = {
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    headers: {
      'content-type': req.get('Content-Type'),
      'x-api-key': req.get('X-API-Key') ? '[PRESENT]' : '[MISSING]',
      'authorization': req.get('Authorization') ? '[PRESENT]' : '[MISSING]'
    },
    bodySize: req.get('Content-Length') || 0,
    hasBody: req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH'
  };

  logger.logAction('info', 'request', `Incoming ${req.method} request to ${req.originalUrl}`, requestDetails, {
    requestId: requestId
  });

  // Capture the original res.json function
  const originalJson = res.json;
  
  // Override res.json to log response
  res.json = function(data) {
    // Skip logging for frontend routes (except login/logout)
    if (isFrontendRoute) {
      return originalJson.call(this, data);
    }
    
    const executionTime = Date.now() - startTime;
    const responseDetails = {
      statusCode: res.statusCode,
      executionTime: `${executionTime}ms`,
      responseSize: JSON.stringify(data).length,
      hasData: !!data,
      success: res.statusCode >= 200 && res.statusCode < 300
    };

    if (res.statusCode >= 200 && res.statusCode < 300) {
      logger.success('request', `Request completed successfully: ${req.method} ${req.originalUrl}`, responseDetails, {
        requestId: requestId
      });
    } else if (res.statusCode >= 400) {
      logger.failure('request', `Request failed: ${req.method} ${req.originalUrl}`, {
        ...responseDetails,
        errorData: data
      }, {
        requestId: requestId
      });
    } else {
      logger.logAction('info', 'request', `Request completed: ${req.method} ${req.originalUrl}`, responseDetails, {
        requestId: requestId
      });
    }

    // Call the original res.json function
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Middleware to log authentication events
 */
const authLoggingMiddleware = (req, res, next) => {
  // Skip logging for frontend routes (except login/logout)
  const isFrontendRoute = (req.originalUrl.startsWith('/sites') || 
                          req.originalUrl.startsWith('/docs') || 
                          req.originalUrl.startsWith('/logs')) &&
                         !req.originalUrl.includes('/login') && 
                         !req.originalUrl.includes('/logout');
  
  if (isFrontendRoute) {
    return next();
  }
  
  const apiKey = req.get('X-API-Key');
  const authHeader = req.get('Authorization');
  
  const authDetails = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    hasApiKey: !!apiKey,
    hasAuthHeader: !!authHeader,
    requestId: req.requestId
  };

  if (!apiKey && !authHeader) {
    logger.warning('security', `Request without authentication: ${req.method} ${req.originalUrl}`, authDetails);
  } else {
    logger.security('info', `Authenticated request: ${req.method} ${req.originalUrl}`, authDetails);
  }

  next();
};

/**
 * Middleware to log errors
 */
const errorLoggingMiddleware = (err, req, res, next) => {
  // Skip logging for frontend routes (except login/logout)
  const isFrontendRoute = (req.originalUrl.startsWith('/sites') || 
                          req.originalUrl.startsWith('/docs') || 
                          req.originalUrl.startsWith('/logs')) &&
                         !req.originalUrl.includes('/login') && 
                         !req.originalUrl.includes('/logout');
  
  if (isFrontendRoute) {
    return next(err);
  }
  
  const errorDetails = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    error: err.message,
    stack: err.stack,
    statusCode: err.statusCode || 500,
    requestId: req.requestId
  };

  logger.failure('request', `Unhandled error in request: ${req.method} ${req.originalUrl}`, errorDetails);

  // Continue with error handling
  next(err);
};

module.exports = {
  requestLoggingMiddleware,
  authLoggingMiddleware,
  errorLoggingMiddleware
};
