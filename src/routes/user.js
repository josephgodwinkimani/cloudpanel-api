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

  // Find header row (contains column names)
  const headerRow = tableArray.find((row) => row.includes("User Name"));
  if (!headerRow) return [];

  // Extract headers using regex
  const headerRegex = /\|\s*([^|]+?)\s*\|/g;
  const headers = [];
  let headerMatch;
  while ((headerMatch = headerRegex.exec(headerRow)) !== null) {
    headers.push(headerMatch[1].trim());
  }

  // Find data rows (exclude separator rows with +, -, |)
  const dataRows = tableArray.filter(
    (row) =>
      row.includes("|") && !row.includes("+") && !row.includes("User Name")
  );

  // Parse each data row
  const jsonResult = dataRows.map((row) => {
    const dataRegex = /\|\s*([^|]+?)\s*\|/g;
    const values = [];
    let dataMatch;
    while ((dataMatch = dataRegex.exec(row)) !== null) {
      values.push(dataMatch[1].trim());
    }

    // Create object with headers as keys
    const userObj = {};
    headers.forEach((header, index) => {
      if (values[index]) {
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

  return jsonResult;
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
    try {
      const userData = req.body;
      const result = await cloudpanelService.addUser(userData);

      BaseController.sendSuccess(res, "User added successfully", result);
    } catch (error) {
      logger.error("Failed to add user:", error);
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
    try {
      const { userName, force } = req.body;
      const result = await cloudpanelService.deleteUser(userName, force);

      BaseController.sendSuccess(res, "User deleted successfully", result);
    } catch (error) {
      logger.error("Failed to delete user:", error);
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
