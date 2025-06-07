const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * @route POST /api/site/add/nodejs
 * @desc Add a Node.js site
 * @access Public
 */
router.post('/add/nodejs', validate(schemas.addNodejsSite), async (req, res) => {
  try {
    const { domainName, nodejsVersion, appPort, siteUser, siteUserPassword } = req.body;
    const result = await cloudpanelService.addNodejsSite(
      domainName, 
      nodejsVersion, 
      appPort, 
      siteUser, 
      siteUserPassword
    );
    
    res.json({
      success: true,
      message: 'Node.js site added successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to add Node.js site:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add Node.js site',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/site/add/php
 * @desc Add a PHP site
 * @access Public
 */
router.post('/add/php', validate(schemas.addPhpSite), async (req, res) => {
  try {
    const { domainName, phpVersion, vhostTemplate, siteUser, siteUserPassword } = req.body;
    const result = await cloudpanelService.addPhpSite(
      domainName, 
      phpVersion, 
      vhostTemplate, 
      siteUser, 
      siteUserPassword
    );
    
    res.json({
      success: true,
      message: 'PHP site added successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to add PHP site:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add PHP site',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/site/add/python
 * @desc Add a Python site
 * @access Public
 */
router.post('/add/python', validate(schemas.addPythonSite), async (req, res) => {
  try {
    const { domainName, pythonVersion, appPort, siteUser, siteUserPassword } = req.body;
    const result = await cloudpanelService.addPythonSite(
      domainName, 
      pythonVersion, 
      appPort, 
      siteUser, 
      siteUserPassword
    );
    
    res.json({
      success: true,
      message: 'Python site added successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to add Python site:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add Python site',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/site/add/static
 * @desc Add a static HTML site
 * @access Public
 */
router.post('/add/static', validate(schemas.addStaticSite), async (req, res) => {
  try {
    const { domainName, siteUser, siteUserPassword } = req.body;
    const result = await cloudpanelService.addStaticSite(domainName, siteUser, siteUserPassword);
    
    res.json({
      success: true,
      message: 'Static site added successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to add static site:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add static site',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/site/add/reverse-proxy
 * @desc Add a reverse proxy
 * @access Public
 */
router.post('/add/reverse-proxy', validate(schemas.addReverseProxy), async (req, res) => {
  try {
    const { domainName, reverseProxyUrl, siteUser, siteUserPassword } = req.body;
    const result = await cloudpanelService.addReverseProxy(
      domainName, 
      reverseProxyUrl, 
      siteUser, 
      siteUserPassword
    );
    
    res.json({
      success: true,
      message: 'Reverse proxy added successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to add reverse proxy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add reverse proxy',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/site/install-certificate
 * @desc Install a custom certificate for a site
 * @access Public
 */
router.post('/install-certificate', validate(schemas.installSiteCertificate), async (req, res) => {
  try {
    const { domainName, privateKey, certificate, certificateChain } = req.body;
    const result = await cloudpanelService.installSiteCertificate(
      domainName, 
      privateKey, 
      certificate, 
      certificateChain
    );
    
    res.json({
      success: true,
      message: 'Certificate installed successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to install certificate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to install certificate',
      details: error.error || error.message
    });
  }
});

/**
 * @route DELETE /api/site/delete
 * @desc Delete a site
 * @access Public
 */
router.delete('/delete', validate(schemas.deleteSite), async (req, res) => {
  try {
    const { domainName, force } = req.body;
    const result = await cloudpanelService.deleteSite(domainName, force);
    
    res.json({
      success: true,
      message: 'Site deleted successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to delete site:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete site',
      details: error.error || error.message
    });
  }
});

module.exports = router;
