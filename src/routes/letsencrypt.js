const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * @route POST /api/letsencrypt/install-certificate
 * @desc Install Let's Encrypt certificate
 * @access Public
 */
router.post('/install-certificate', validate(schemas.installLetsEncryptCertificate), async (req, res) => {
  try {
    const { domainName, subjectAlternativeName } = req.body;
    const result = await cloudpanelService.installLetsEncryptCertificate(
      domainName, 
      subjectAlternativeName
    );
    
    res.json({
      success: true,
      message: 'Let\'s Encrypt certificate installed successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to install Let\'s Encrypt certificate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to install Let\'s Encrypt certificate',
      details: error.error || error.message
    });
  }
});

module.exports = router;
