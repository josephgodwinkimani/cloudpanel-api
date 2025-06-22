const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');
const BaseController = require('../controllers/BaseController');

/**
 * @route POST /api/cloudpanel/basic-auth/enable
 * @desc Enable CloudPanel basic authentication
 * @access Public
 */
router.post('/basic-auth/enable', validate(schemas.enableBasicAuth), BaseController.asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { userName, password } = req.body;
  const authDetails = { userName };
  
  logger.security('info', `Starting basic authentication enable for user: ${userName}`, authDetails);
  
  try {
    const result = await cloudpanelService.enableBasicAuth(userName, password);
    
    const executionTime = Date.now() - startTime;
    logger.success('security', `Basic authentication enabled successfully for user: ${userName}`, {
      ...authDetails,
      executionTime: `${executionTime}ms`,
      hasResult: !!result,
      resultType: typeof result
    });
    
    BaseController.sendSuccess(res, 'Basic authentication enabled successfully', result);
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.failure('security', `Basic authentication enable failed for user: ${userName}`, {
      ...authDetails,
      error: error.error || error.message || error,
      executionTime: `${executionTime}ms`,
      errorType: typeof error,
      hasStderr: !!error.stderr,
      exitCode: error.exitCode
    });
    
    BaseController.sendError(res, 'Failed to enable basic authentication', error.error || error.message);
  }
}));

/**
 * @route DELETE /api/cloudpanel/basic-auth/disable
 * @desc Disable CloudPanel basic authentication
 * @access Public
 */
router.delete('/basic-auth/disable', BaseController.asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  logger.security('info', 'Starting basic authentication disable process');
  
  try {
    const result = await cloudpanelService.disableBasicAuth();
    
    const executionTime = Date.now() - startTime;
    logger.success('security', 'Basic authentication disabled successfully', {
      executionTime: `${executionTime}ms`,
      hasResult: !!result,
      resultType: typeof result
    });
    
    BaseController.sendSuccess(res, 'Basic authentication disabled successfully', result);
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.failure('security', 'Basic authentication disable failed', {
      error: error.error || error.message || error,
      executionTime: `${executionTime}ms`,
      errorType: typeof error,
      hasStderr: !!error.stderr,
      exitCode: error.exitCode
    });
    
    BaseController.sendError(res, 'Failed to disable basic authentication', error.error || error.message);
  }
}));

module.exports = router;
