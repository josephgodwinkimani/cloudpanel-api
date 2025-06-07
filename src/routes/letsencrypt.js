const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');
const BaseController = require('../controllers/BaseController');

/**
 * @route POST /api/letsencrypt/install-certificate
 * @desc Install Let's Encrypt certificate
 * @access Public
 */
router.post('/install-certificate', validate(schemas.installLetsEncryptCertificate), BaseController.asyncHandler(async (req, res) => {
  try {
    const { domainName, subjectAlternativeName } = req.body;
    const result = await cloudpanelService.installLetsEncryptCertificate(
      domainName, 
      subjectAlternativeName
    );
    
    BaseController.sendSuccess(res, 'Let\'s Encrypt certificate installed successfully', result);
  } catch (error) {
    logger.error('Failed to install Let\'s Encrypt certificate:', error);
    BaseController.sendError(res, 'Failed to install Let\'s Encrypt certificate', error.error || error.message);
  }
}));

module.exports = router;
