const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');
const BaseController = require('../controllers/BaseController');

/**
 * @route POST /api/cloudflare/update-ips
 * @desc Update Cloudflare IPs
 * @access Public
 */
router.post('/update-ips', validate(schemas.updateIps), BaseController.asyncHandler(async (req, res) => {
  try {
    const result = await cloudpanelService.updateCloudflareIps();
    
    BaseController.sendSuccess(res, 'Cloudflare IPs updated successfully', result);
  } catch (error) {
    logger.error('Failed to update Cloudflare IPs:', error);
    BaseController.sendError(res, 'Failed to update Cloudflare IPs', error.error || error.message);
  }
}));

module.exports = router;
