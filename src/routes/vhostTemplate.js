const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * @route POST /api/vhost-templates/import
 * @desc Import vhost templates from GitHub repository
 * @access Public
 */
router.post('/import', async (req, res) => {
  try {
    const result = await cloudpanelService.importVhostTemplates();
    
    res.json({
      success: true,
      message: 'Vhost templates imported successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to import vhost templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import vhost templates',
      details: error.error || error.message
    });
  }
});

/**
 * @route GET /api/vhost-templates/list
 * @desc List all available vhost templates
 * @access Public
 */
router.get('/list', async (req, res) => {
  try {
    const result = await cloudpanelService.listVhostTemplates();
    
    res.json({
      success: true,
      message: 'Vhost templates retrieved successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to list vhost templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list vhost templates',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/vhost-templates/add
 * @desc Add a custom vhost template
 * @access Public
 */
router.post('/add', validate(schemas.addVhostTemplate), async (req, res) => {
  try {
    const { name, file } = req.body;
    const result = await cloudpanelService.addVhostTemplate(name, file);
    
    res.json({
      success: true,
      message: 'Vhost template added successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to add vhost template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add vhost template',
      details: error.error || error.message
    });
  }
});

/**
 * @route DELETE /api/vhost-templates/delete
 * @desc Delete a vhost template
 * @access Public
 */
router.delete('/delete', validate(schemas.deleteVhostTemplate), async (req, res) => {
  try {
    const { name } = req.body;
    const result = await cloudpanelService.deleteVhostTemplate(name);
    
    res.json({
      success: true,
      message: 'Vhost template deleted successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to delete vhost template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete vhost template',
      details: error.error || error.message
    });
  }
});

/**
 * @route GET /api/vhost-templates/view/:name
 * @desc View a specific vhost template
 * @access Public
 */
router.get('/view/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await cloudpanelService.viewVhostTemplate(name);
    
    res.json({
      success: true,
      message: 'Vhost template retrieved successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to view vhost template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to view vhost template',
      details: error.error || error.message
    });
  }
});

module.exports = router;
