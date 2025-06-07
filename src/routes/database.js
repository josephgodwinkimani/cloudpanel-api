const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * @route GET /api/database/master-credentials
 * @desc Show database master credentials
 * @access Public
 */
router.get('/master-credentials', async (req, res) => {
  try {
    const result = await cloudpanelService.showMasterCredentials();
    
    res.json({
      success: true,
      message: 'Master credentials retrieved successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to get master credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve master credentials',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/database/add
 * @desc Add a new database
 * @access Public
 */
router.post('/add', validate(schemas.addDatabase), async (req, res) => {
  try {
    const { domainName, databaseName, databaseUserName, databaseUserPassword } = req.body;
    const result = await cloudpanelService.addDatabase(
      domainName, 
      databaseName, 
      databaseUserName, 
      databaseUserPassword
    );
    
    res.json({
      success: true,
      message: 'Database added successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to add database:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add database',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/database/export
 * @desc Export a database
 * @access Public
 */
router.post('/export', validate(schemas.exportDatabase), async (req, res) => {
  try {
    const { databaseName, file } = req.body;
    const result = await cloudpanelService.exportDatabase(databaseName, file);
    
    res.json({
      success: true,
      message: 'Database exported successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to export database:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export database',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/database/import
 * @desc Import a database
 * @access Public
 */
router.post('/import', validate(schemas.importDatabase), async (req, res) => {
  try {
    const { databaseName, file } = req.body;
    const result = await cloudpanelService.importDatabase(databaseName, file);
    
    res.json({
      success: true,
      message: 'Database imported successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to import database:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import database',
      details: error.error || error.message
    });
  }
});

module.exports = router;
