const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * @route POST /api/cloudpanel/basic-auth/enable
 * @desc Enable CloudPanel basic authentication
 * @access Public
 */
router.post('/basic-auth/enable', validate(schemas.enableBasicAuth), async (req, res) => {
  try {
    const { userName, password } = req.body;
    const result = await cloudpanelService.enableBasicAuth(userName, password);
    
    res.json({
      success: true,
      message: 'Basic authentication enabled successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to enable basic auth:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable basic authentication',
      details: error.error || error.message
    });
  }
});

/**
 * @route DELETE /api/cloudpanel/basic-auth/disable
 * @desc Disable CloudPanel basic authentication
 * @access Public
 */
router.delete('/basic-auth/disable', async (req, res) => {
  try {
    const result = await cloudpanelService.disableBasicAuth();
    
    res.json({
      success: true,
      message: 'Basic authentication disabled successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to disable basic auth:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable basic authentication',
      details: error.error || error.message
    });
  }
});

module.exports = router;
