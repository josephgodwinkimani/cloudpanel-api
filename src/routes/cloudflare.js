const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * @route POST /api/cloudflare/update-ips
 * @desc Update Cloudflare IPs
 * @access Public
 */
router.post('/update-ips', validate(schemas.updateIps), async (req, res) => {
  try {
    const result = await cloudpanelService.updateCloudflareIps();
    
    res.json({
      success: true,
      message: 'Cloudflare IPs updated successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to update Cloudflare IPs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update Cloudflare IPs',
      details: error.error || error.message
    });
  }
});

module.exports = router;
