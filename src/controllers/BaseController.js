const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const logger = require('../utils/logger');

/**
 * Base controller class for common functionality
 */
class BaseController {
  /**
   * Handle async route operations with error handling
   * @param {Function} fn - Async function to execute
   * @returns {Function} - Express middleware function
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Send success response
   * @param {Object} res - Express response object
   * @param {string} message - Success message
   * @param {*} data - Response data
   * @param {number} statusCode - HTTP status code
   */
  static sendSuccess(res, message, data = null, statusCode = 200) {
    const response = {
      success: true,
      message,
      timestamp: new Date().toISOString()
    };

    if (data !== null) {
      response.data = data;
    }

    res.status(statusCode).json(response);
  }

  /**
   * Send error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {*} details - Error details
   * @param {number} statusCode - HTTP status code
   */
  static sendError(res, message, details = null, statusCode = 500) {
    const response = {
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    };

    if (details !== null) {
      response.details = details;
    }

    logger.error(`API Error: ${message}`, { details, statusCode });
    res.status(statusCode).json(response);
  }

  /**
   * Execute CloudPanel command with standardized response
   * @param {Object} res - Express response object
   * @param {Function} commandFn - CloudPanel service function
   * @param {string} successMessage - Success message
   * @param {string} errorMessage - Error message
   */
  static async executeCommand(res, commandFn, successMessage, errorMessage) {
    try {
      const result = await commandFn();
      this.sendSuccess(res, successMessage, result);
    } catch (error) {
      this.sendError(res, errorMessage, error.error || error.message);
    }
  }
}

module.exports = BaseController;
