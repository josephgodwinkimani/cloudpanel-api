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
  const startTime = Date.now();
  logger.database('info', 'Retrieving database master credentials');
  
  try {
    const result = await cloudpanelService.showMasterCredentials();
    
    const executionTime = Date.now() - startTime;
    logger.success('database', 'Database master credentials retrieved successfully', {
      executionTime: `${executionTime}ms`,
      hasResult: !!result,
      resultType: typeof result
    });
    
    BaseController.sendSuccess(res, 'Master credentials retrieved successfully', result);
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.failure('database', 'Failed to retrieve database master credentials', {
      error: error.error || error.message || error,
      executionTime: `${executionTime}ms`,
      errorType: typeof error,
      exitCode: error.exitCode
    });
    
    BaseController.sendError(res, 'Failed to retrieve master credentials', error.error || error.message);
  }
}));

/**
 * @route POST /api/database/add
 * @desc Add a new database
 * @access Public
 */
router.post('/add', validate(schemas.addDatabase), BaseController.asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { domainName, databaseName, databaseUserName, databaseUserPassword } = req.body;
  const dbDetails = { domainName, databaseName, databaseUserName };
  
  logger.database('info', `Starting database creation for domain: ${domainName}`, dbDetails);
  
  try {
    const result = await cloudpanelService.addDatabase(
      domainName, 
      databaseName, 
      databaseUserName, 
      databaseUserPassword
    );
    
    const executionTime = Date.now() - startTime;
    logger.success('database', `Database created successfully for domain: ${domainName}`, {
      ...dbDetails,
      executionTime: `${executionTime}ms`,
      hasResult: !!result,
      resultType: typeof result
    });
    
    BaseController.sendSuccess(res, 'Database added successfully', result);
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.failure('database', `Database creation failed for domain: ${domainName}`, {
      ...dbDetails,
      error: error.error || error.message || error,
      executionTime: `${executionTime}ms`,
      errorType: typeof error,
      hasStderr: !!error.stderr,
      exitCode: error.exitCode
    });
    
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
