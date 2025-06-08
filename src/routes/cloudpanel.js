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
  try {
    const { userName, password } = req.body;
    const result = await cloudpanelService.enableBasicAuth(userName, password);
    
    BaseController.sendSuccess(res, 'Basic authentication enabled successfully', result);
  } catch (error) {
    logger.error('Failed to enable basic auth:', error);
    BaseController.sendError(res, 'Failed to enable basic authentication', error.error || error.message);
  }
}));

/**
 * @route DELETE /api/cloudpanel/basic-auth/disable
 * @desc Disable CloudPanel basic authentication
 * @access Public
 */
router.delete('/basic-auth/disable', BaseController.asyncHandler(async (req, res) => {
  try {
    const result = await cloudpanelService.disableBasicAuth();
    
    BaseController.sendSuccess(res, 'Basic authentication disabled successfully', result);
  } catch (error) {
    logger.error('Failed to disable basic auth:', error);
    BaseController.sendError(res, 'Failed to disable basic authentication', error.error || error.message);
  }
}));

module.exports = router;
