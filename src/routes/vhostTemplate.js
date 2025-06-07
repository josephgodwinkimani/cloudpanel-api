const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');
const BaseController = require('../controllers/BaseController');

/**
 * @route POST /api/vhost-templates/import
 * @desc Import vhost templates from GitHub repository
 * @access Public
 */
router.post('/import', BaseController.asyncHandler(async (req, res) => {
  try {
    const result = await cloudpanelService.importVhostTemplates();
    
    BaseController.sendSuccess(res, 'Vhost templates imported successfully', result);
  } catch (error) {
    logger.error('Failed to import vhost templates:', error);
    BaseController.sendError(res, 'Failed to import vhost templates', error.error || error.message);
  }
}));

/**
 * @route GET /api/vhost-templates/list
 * @desc List all available vhost templates
 * @access Public
 */
router.get('/list', BaseController.asyncHandler(async (req, res) => {
  try {
    const result = await cloudpanelService.listVhostTemplates();
    
    BaseController.sendSuccess(res, 'Vhost templates retrieved successfully', result);
  } catch (error) {
    logger.error('Failed to list vhost templates:', error);
    BaseController.sendError(res, 'Failed to list vhost templates', error.error || error.message);
  }
}));

/**
 * @route POST /api/vhost-templates/add
 * @desc Add a custom vhost template
 * @access Public
 */
router.post('/add', validate(schemas.addVhostTemplate), BaseController.asyncHandler(async (req, res) => {
  try {
    const { name, file } = req.body;
    const result = await cloudpanelService.addVhostTemplate(name, file);
    
    BaseController.sendSuccess(res, 'Vhost template added successfully', result);
  } catch (error) {
    logger.error('Failed to add vhost template:', error);
    BaseController.sendError(res, 'Failed to add vhost template', error.error || error.message);
  }
}));

/**
 * @route DELETE /api/vhost-templates/delete
 * @desc Delete a vhost template
 * @access Public
 */
router.delete('/delete', validate(schemas.deleteVhostTemplate), BaseController.asyncHandler(async (req, res) => {
  try {
    const { name } = req.body;
    const result = await cloudpanelService.deleteVhostTemplate(name);
    
    BaseController.sendSuccess(res, 'Vhost template deleted successfully', result);
  } catch (error) {
    logger.error('Failed to delete vhost template:', error);
    BaseController.sendError(res, 'Failed to delete vhost template', error.error || error.message);
  }
}));

/**
 * @route GET /api/vhost-templates/view/:name
 * @desc View a specific vhost template
 * @access Public
 */
router.get('/view/:name', BaseController.asyncHandler(async (req, res) => {
  try {
    const { name } = req.params;
    const result = await cloudpanelService.viewVhostTemplate(name);
    
    BaseController.sendSuccess(res, 'Vhost template retrieved successfully', result);
  } catch (error) {
    logger.error('Failed to view vhost template:', error);
    BaseController.sendError(res, 'Failed to view vhost template', error.error || error.message);
  }
}));

module.exports = router;
