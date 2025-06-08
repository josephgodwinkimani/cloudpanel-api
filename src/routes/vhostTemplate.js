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
  const headerRow = tableArray.find((row) => row.includes("Name"));
  if (!headerRow) return [];

  // Extract headers by splitting on | and filtering
  const headers = headerRow
    .split('|')
    .map(part => part.trim())
    .filter(part => part !== '');

  // Find data rows (exclude separator rows with +, -, |)
  const dataRows = tableArray.filter(
    (row) => row.includes("|") && !row.includes("+") && !row.includes("Name")
  );

  // Parse each data row
  const jsonResult = dataRows.map((row) => {
    // Split by | and remove first and last empty elements
    const parts = row.split('|');
    const values = parts.slice(1, -1).map(part => part.trim());

    // Ensure we have exactly the same number of values as headers
    while (values.length < headers.length) {
      values.push("");
    }

    // Create object with headers as keys
    const templateObj = {};
    headers.forEach((header, index) => {
      // Convert header to camelCase
      const key = header
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\s(.)/g, (match, letter) => letter.toUpperCase());

      // Handle empty values properly - use null instead of empty string
      const value = values[index] || "";
      templateObj[key] = value === "" ? null : value;
    });

    return templateObj;
  });

  return jsonResult;
};
/**
 * @route POST /api/vhost-templates/import
 * @desc Import vhost templates from GitHub repository
 * @access Public
 */
router.post(
  "/import",
  BaseController.asyncHandler(async (req, res) => {
    try {
      const result = await cloudpanelService.importVhostTemplates();

      BaseController.sendSuccess(
        res,
        "Vhost templates imported successfully",
        result
      );
    } catch (error) {
      logger.error("Failed to import vhost templates:", error);
      BaseController.sendError(
        res,
        "Failed to import vhost templates",
        error.error || error.message
      );
    }
  })
);

/**
 * @route GET /api/vhost-templates/list
 * @desc List all available vhost templates
 * @access Public
 */
router.get(
  "/list",
  BaseController.asyncHandler(async (req, res) => {
    try {
      const result = await cloudpanelService.listVhostTemplates();

      const templates = parseTableToJson(result);
      BaseController.sendSuccess(
        res,
        "Vhost templates retrieved successfully",
        templates
      );
    } catch (error) {
      logger.error("Failed to list vhost templates:", error);
      BaseController.sendError(
        res,
        "Failed to list vhost templates",
        error.error || error.message
      );
    }
  })
);

/**
 * @route POST /api/vhost-templates/add
 * @desc Add a custom vhost template
 * @access Public
 */
router.post(
  "/add",
  validate(schemas.addVhostTemplate),
  BaseController.asyncHandler(async (req, res) => {
    try {
      const { name, file } = req.body;
      const result = await cloudpanelService.addVhostTemplate(name, file);

      BaseController.sendSuccess(
        res,
        "Vhost template added successfully",
        result
      );
    } catch (error) {
      logger.error("Failed to add vhost template:", error);
      BaseController.sendError(
        res,
        "Failed to add vhost template",
        error.error || error.message
      );
    }
  })
);

/**
 * @route DELETE /api/vhost-templates/delete
 * @desc Delete a vhost template
 * @access Public
 */
router.delete(
  "/delete",
  validate(schemas.deleteVhostTemplate),
  BaseController.asyncHandler(async (req, res) => {
    try {
      const { name, force } = req.body;
      const result = await cloudpanelService.deleteVhostTemplate(name, force);

      BaseController.sendSuccess(
        res,
        "Vhost template deleted successfully",
        result
      );
    } catch (error) {
      logger.error("Failed to delete vhost template:", error);
      BaseController.sendError(
        res,
        "Failed to delete vhost template",
        error.error || error.message
      );
    }
  })
);

/**
 * @route GET /api/vhost-templates/view/:name
 * @desc View a specific vhost template
 * @access Public
 */
router.get(
  "/view/:name",
  BaseController.asyncHandler(async (req, res) => {
    try {
      const { name } = req.params;
      const result = await cloudpanelService.viewVhostTemplate(name);

      BaseController.sendSuccess(
        res,
        "Vhost template retrieved successfully",
        result
      );
    } catch (error) {
      logger.error("Failed to view vhost template:", error);
      BaseController.sendError(
        res,
        "Failed to view vhost template",
        error.error || error.message
      );
    }
  })
);

module.exports = router;
