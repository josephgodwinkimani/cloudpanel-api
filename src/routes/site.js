const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');
const BaseController = require('../controllers/BaseController');

/**
 * @route POST /api/site/add/nodejs
 * @desc Add a Node.js site
 * @access Public
 */
router.post('/add/nodejs', validate(schemas.addNodejsSite), BaseController.asyncHandler(async (req, res) => {
  try {
    const { domainName, nodejsVersion, appPort, siteUser, siteUserPassword } = req.body;
    const result = await cloudpanelService.addNodejsSite(
      domainName, 
      nodejsVersion, 
      appPort, 
      siteUser, 
      siteUserPassword
    );
    
    BaseController.sendSuccess(res, 'Node.js site added successfully', result);
  } catch (error) {
    logger.error('Failed to add Node.js site:', error);
    BaseController.sendError(res, 'Failed to add Node.js site', error.error || error.message);
  }
}));

/**
 * @route POST /api/site/add/php
 * @desc Add a PHP site
 * @access Public
 */
router.post('/add/php', validate(schemas.addPhpSite), BaseController.asyncHandler(async (req, res) => {
  try {
    const { domainName, phpVersion, vhostTemplate, siteUser, siteUserPassword } = req.body;
    const result = await cloudpanelService.addPhpSite(
      domainName, 
      phpVersion, 
      vhostTemplate, 
      siteUser, 
      siteUserPassword
    );
    
    BaseController.sendSuccess(res, 'PHP site added successfully', result);
  } catch (error) {
    logger.error('Failed to add PHP site:', error);
    BaseController.sendError(res, 'Failed to add PHP site', error.error || error.message);
  }
}));

/**
 * @route POST /api/site/add/python
 * @desc Add a Python site
 * @access Public
 */
router.post('/add/python', validate(schemas.addPythonSite), BaseController.asyncHandler(async (req, res) => {
  try {
    const { domainName, pythonVersion, appPort, siteUser, siteUserPassword } = req.body;
    const result = await cloudpanelService.addPythonSite(
      domainName, 
      pythonVersion, 
      appPort, 
      siteUser, 
      siteUserPassword
    );
    
    BaseController.sendSuccess(res, 'Python site added successfully', result);
  } catch (error) {
    logger.error('Failed to add Python site:', error);
    BaseController.sendError(res, 'Failed to add Python site', error.error || error.message);
  }
}));

/**
 * @route POST /api/site/add/static
 * @desc Add a static HTML site
 * @access Public
 */
router.post('/add/static', validate(schemas.addStaticSite), BaseController.asyncHandler(async (req, res) => {
  try {
    const { domainName, siteUser, siteUserPassword } = req.body;
    const result = await cloudpanelService.addStaticSite(domainName, siteUser, siteUserPassword);
    
    BaseController.sendSuccess(res, 'Static site added successfully', result);
  } catch (error) {
    logger.error('Failed to add static site:', error);
    BaseController.sendError(res, 'Failed to add static site', error.error || error.message);
  }
}));

/**
 * @route POST /api/site/add/reverse-proxy
 * @desc Add a reverse proxy
 * @access Public
 */
router.post('/add/reverse-proxy', validate(schemas.addReverseProxy), BaseController.asyncHandler(async (req, res) => {
  try {
    const { domainName, reverseProxyUrl, siteUser, siteUserPassword } = req.body;
    const result = await cloudpanelService.addReverseProxy(
      domainName, 
      reverseProxyUrl, 
      siteUser, 
      siteUserPassword
    );
    
    BaseController.sendSuccess(res, 'Reverse proxy added successfully', result);
  } catch (error) {
    logger.error('Failed to add reverse proxy:', error);
    BaseController.sendError(res, 'Failed to add reverse proxy', error.error || error.message);
  }
}));

/**
 * @route POST /api/site/install-certificate
 * @desc Install a custom certificate for a site
 * @access Public
 */
router.post('/install-certificate', validate(schemas.installSiteCertificate), BaseController.asyncHandler(async (req, res) => {
  try {
    const { domainName, privateKey, certificate, certificateChain } = req.body;
    const result = await cloudpanelService.installSiteCertificate(
      domainName, 
      privateKey, 
      certificate, 
      certificateChain
    );
    
    BaseController.sendSuccess(res, 'Certificate installed successfully', result);
  } catch (error) {
    logger.error('Failed to install certificate:', error);
    BaseController.sendError(res, 'Failed to install certificate', error.error || error.message);
  }
}));

/**
 * @route DELETE /api/site/delete
 * @desc Delete a site
 * @access Public
 */
router.delete('/delete', validate(schemas.deleteSite), BaseController.asyncHandler(async (req, res) => {
  try {
    const { domainName, force } = req.body;
    const result = await cloudpanelService.deleteSite(domainName, force);
    
    BaseController.sendSuccess(res, 'Site deleted successfully', result);
  } catch (error) {
    logger.error('Failed to delete site:', error);
    BaseController.sendError(res, 'Failed to delete site', error.error || error.message);
  }
}));

module.exports = router;
