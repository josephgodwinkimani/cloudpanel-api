const express = require("express");
const router = express.Router();
const cloudpanelService = require("../services/cloudpanel");
const { validate, schemas } = require("../utils/validation");
const logger = require("../utils/logger");
const BaseController = require("../controllers/BaseController");

const parseTableToJson = (tableArray) => {
  if (!Array.isArray(tableArray) || tableArray.length < 3) {
    return [];
  }

  // Find header row (contains column names and is surrounded by separators)
  let headerRow = null;
  let headerIndex = -1;
  
  for (let i = 0; i < tableArray.length; i++) {
    const row = tableArray[i];
    // Look for header row that contains column names and pipes
    if (row.includes("User Name") && row.includes("|") && !row.includes("+")) {
      headerRow = row;
      headerIndex = i;
      break;
    }
  }
  
  if (!headerRow) return [];

  // Extract headers - split by | and clean up
  const headerParts = headerRow.split("|").map(part => part.trim()).filter(part => part.length > 0);
  
  // Find all data rows (contain | but not + and are not the header row)
  const dataRows = tableArray.filter((row, index) => 
    row.includes("|") && 
    !row.includes("+") && 
    index !== headerIndex && 
    row.trim().length > 0
  );

  // Parse each data row
  const jsonResult = dataRows.map((row) => {
    // Split by | and clean up
    const values = row.split("|").map(part => part.trim()).filter(part => part.length > 0);
    
    // Create object with headers as keys
    const userObj = {};
    headerParts.forEach((header, index) => {
      if (values[index] !== undefined) {
        // Convert header to camelCase
        const key = header
          .toLowerCase()
          .replace(/[^a-zA-Z0-9]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\s(.)/g, (match, letter) => letter.toUpperCase());
        userObj[key] = values[index];
      }
    });

    return userObj;
  });

  return jsonResult.filter(obj => Object.keys(obj).length > 0);
};
/**
 * @route POST /api/user/add
 * @desc Add a new user
 * @access Public
 */
router.post(
  "/add",
  validate(schemas.addUser),
  BaseController.asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const userDetails = {
      userName: req.body.userName,
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      role: req.body.role,
      status: req.body.status,
      timezone: req.body.timezone,
      sites: req.body.sites
    };
    
    logger.user('info', `Starting user creation process for: ${req.body.userName}`, userDetails);
    
    try {
      const userData = req.body;
      const result = await cloudpanelService.addUser(userData);
      
      const executionTime = Date.now() - startTime;
      logger.success('user', `User created successfully: ${req.body.userName}`, {
        ...userDetails,
        executionTime: `${executionTime}ms`,
        resultType: typeof result,
        hasOutput: !!result.output
      });

      BaseController.sendSuccess(res, "User added successfully", result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.failure('user', `User creation failed for: ${req.body.userName}`, {
        ...userDetails,
        error: error.error || error.message || error,
        executionTime: `${executionTime}ms`,
        errorType: typeof error,
        hasStderr: !!error.stderr,
        exitCode: error.exitCode
      });
      
      BaseController.sendError(
        res,
        "Failed to add user",
        error.error || error.message
      );
    }
  })
);

/**
 * @route DELETE /api/user/delete
 * @desc Delete a user
 * @access Public
 */
router.delete(
  "/delete",
  validate(schemas.deleteUser),
  BaseController.asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const { userName, force } = req.body;
    const deleteDetails = { userName, force: force || true };
    
    logger.user('info', `Starting user deletion process for: ${userName}`, deleteDetails);
    
    try {
      const result = await cloudpanelService.deleteUser(userName, force);
      
      const executionTime = Date.now() - startTime;
      logger.success('user', `User deleted successfully: ${userName}`, {
        ...deleteDetails,
        executionTime: `${executionTime}ms`,
        resultType: typeof result,
        hasOutput: !!result.output
      });

      BaseController.sendSuccess(res, "User deleted successfully", result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.failure('user', `User deletion failed for: ${userName}`, {
        ...deleteDetails,
        error: error.error || error.message || error,
        executionTime: `${executionTime}ms`,
        errorType: typeof error,
        hasStderr: !!error.stderr,
        exitCode: error.exitCode
      });
      
      BaseController.sendError(
        res,
        "Failed to delete user",
        error.error || error.message
      );
    }
  })
);

/**
 * @route GET /api/user/list
 * @desc List all users
 * @access Public
 */
router.get(
  "/list",
  BaseController.asyncHandler(async (req, res) => {
    try {
      const result = await cloudpanelService.listUsers();

      const users = parseTableToJson(result);
      BaseController.sendSuccess(res, "Users retrieved successfully", users);
    } catch (error) {
      logger.error("Failed to list users:", error);
      BaseController.sendError(
        res,
        "Failed to list users",
        error.error || error.message
      );
    }
  })
);

/**
 * @route POST /api/user/reset-password
 * @desc Reset user password
 * @access Public
 */
router.post(
  "/reset-password",
  validate(schemas.resetPassword),
  BaseController.asyncHandler(async (req, res) => {
    try {
      const { userName, password } = req.body;
      const result = await cloudpanelService.resetPassword(userName, password);

      BaseController.sendSuccess(res, "Password reset successfully", result);
    } catch (error) {
      logger.error("Failed to reset password:", error);
      BaseController.sendError(
        res,
        "Failed to reset password",
        error.error || error.message
      );
    }
  })
);

/**
 * @route POST /api/user/disable-mfa
 * @desc Disable Multi-Factor Authentication for a user
 * @access Public
 */
router.post(
  "/disable-mfa",
  validate(schemas.disableMfa),
  BaseController.asyncHandler(async (req, res) => {
    try {
      const { userName } = req.body;
      const result = await cloudpanelService.disableMfa(userName);

      BaseController.sendSuccess(res, "MFA disabled successfully", result);
    } catch (error) {
      logger.error("Failed to disable MFA:", error);
      BaseController.sendError(
        res,
        "Failed to disable MFA",
        error.error || error.message
      );
    }
  })
);

module.exports = router;
