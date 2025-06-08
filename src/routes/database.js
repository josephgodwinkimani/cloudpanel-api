const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');
const BaseController = require('../controllers/BaseController');

/**
 * @route GET /api/database/master-credentials
 * @desc Show database master credentials
 * @access Public
 */
router.get('/master-credentials', BaseController.asyncHandler(async (req, res) => {
  try {
    const result = await cloudpanelService.showMasterCredentials();
    
    BaseController.sendSuccess(res, 'Master credentials retrieved successfully', result);
  } catch (error) {
    logger.error('Failed to get master credentials:', error);
    BaseController.sendError(res, 'Failed to retrieve master credentials', error.error || error.message);
  }
}));

/**
 * @route POST /api/database/add
 * @desc Add a new database
 * @access Public
 */
router.post('/add', validate(schemas.addDatabase), BaseController.asyncHandler(async (req, res) => {
  try {
    const { domainName, databaseName, databaseUserName, databaseUserPassword } = req.body;
    const result = await cloudpanelService.addDatabase(
      domainName, 
      databaseName, 
      databaseUserName, 
      databaseUserPassword
    );
    
    BaseController.sendSuccess(res, 'Database added successfully', result);
  } catch (error) {
    logger.error('Failed to add database:', error);
    BaseController.sendError(res, 'Failed to add database', error.error || error.message);
  }
}));

/**
 * @route POST /api/database/export
 * @desc Export a database
 * @access Public
 */
router.post('/export', validate(schemas.exportDatabase), BaseController.asyncHandler(async (req, res) => {
  try {
    const { databaseName, file } = req.body;
    const result = await cloudpanelService.exportDatabase(databaseName, file);
    
    BaseController.sendSuccess(res, 'Database exported successfully', result);
  } catch (error) {
    logger.error('Failed to export database:', error);
    BaseController.sendError(res, 'Failed to export database', error.error || error.message);
  }
}));

/**
 * @route POST /api/database/import
 * @desc Import a database
 * @access Public
 */
router.post('/import', validate(schemas.importDatabase), BaseController.asyncHandler(async (req, res) => {
  try {
    const { databaseName, file } = req.body;
    const result = await cloudpanelService.importDatabase(databaseName, file);
    
    BaseController.sendSuccess(res, 'Database imported successfully', result);
  } catch (error) {
    logger.error('Failed to import database:', error);
    BaseController.sendError(res, 'Failed to import database', error.error || error.message);
  }
}));

module.exports = router;
