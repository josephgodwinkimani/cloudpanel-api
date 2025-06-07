const express = require('express');
const router = express.Router();
const cloudpanelService = require('../services/cloudpanel');
const { validate, schemas } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * @route POST /api/user/add
 * @desc Add a new user
 * @access Public
 */
router.post('/add', validate(schemas.addUser), async (req, res) => {
  try {
    const userData = req.body;
    const result = await cloudpanelService.addUser(userData);
    
    res.json({
      success: true,
      message: 'User added successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to add user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add user',
      details: error.error || error.message
    });
  }
});

/**
 * @route DELETE /api/user/delete
 * @desc Delete a user
 * @access Public
 */
router.delete('/delete', validate(schemas.deleteUser), async (req, res) => {
  try {
    const { userName } = req.body;
    const result = await cloudpanelService.deleteUser(userName);
    
    res.json({
      success: true,
      message: 'User deleted successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to delete user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
      details: error.error || error.message
    });
  }
});

/**
 * @route GET /api/user/list
 * @desc List all users
 * @access Public
 */
router.get('/list', async (req, res) => {
  try {
    const result = await cloudpanelService.listUsers();
    
    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to list users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list users',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/user/reset-password
 * @desc Reset user password
 * @access Public
 */
router.post('/reset-password', validate(schemas.resetPassword), async (req, res) => {
  try {
    const { userName, password } = req.body;
    const result = await cloudpanelService.resetPassword(userName, password);
    
    res.json({
      success: true,
      message: 'Password reset successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to reset password:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password',
      details: error.error || error.message
    });
  }
});

/**
 * @route POST /api/user/disable-mfa
 * @desc Disable Multi-Factor Authentication for a user
 * @access Public
 */
router.post('/disable-mfa', validate(schemas.disableMfa), async (req, res) => {
  try {
    const { userName } = req.body;
    const result = await cloudpanelService.disableMfa(userName);
    
    res.json({
      success: true,
      message: 'MFA disabled successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to disable MFA:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable MFA',
      details: error.error || error.message
    });
  }
});

module.exports = router;
