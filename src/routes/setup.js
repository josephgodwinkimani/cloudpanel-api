const express = require("express");
const router = express.Router();
const cloudpanelService = require("../services/cloudpanel");
const { validate, schemas } = require("../utils/validation");
const logger = require("../utils/logger");
const BaseController = require("../controllers/BaseController");

/**
 * @route POST /api/setup
 * @desc Setup a complete Laravel site with PHP and database
 * @access Public
 */
router.post(
  "/",
  validate(schemas.setupLaravel),
  BaseController.asyncHandler(async (req, res) => {
    try {
      const {
        domainName,
        phpVersion = "8.3",
        vhostTemplate = "Laravel 12",
        siteUser,
        siteUserPassword,
        databaseName,
        databaseUserName,
        databaseUserPassword,
      } = req.body;

      logger.info(`Starting Laravel setup for domain: ${domainName}`);

      // Step 1: Create PHP site with Laravel
      logger.info(`Creating PHP site with Laravel for ${domainName}`);
      const siteResult = await cloudpanelService.createSiteSetup(
        domainName,
        phpVersion,
        vhostTemplate,
        siteUser,
        siteUserPassword
      );

      if (!siteResult.success) {
        throw new Error(
          `Failed to create PHP site: ${siteResult.error || "Unknown error"}`
        );
      }

      logger.info(
        `PHP site created successfully: ${JSON.stringify(siteResult)}`
      );

      // Step 2: Create database for the Laravel site
      logger.info(`Creating database for ${domainName}`);
      const dbResult = await cloudpanelService.addDatabase(
        domainName,
        databaseName,
        databaseUserName,
        databaseUserPassword
      );

      if (!dbResult.success) {
        // If database creation fails, we should clean up the site that was created
        logger.error(
          `Database creation failed, cleaning up site: ${domainName}`
        );
        try {
          await cloudpanelService.deleteSite(domainName, true);
        } catch (cleanupError) {
          logger.error(
            `Failed to cleanup site after database error: ${cleanupError.message}`
          );
        }
        throw new Error(
          `Failed to create database: ${dbResult.error || "Unknown error"}`
        );
      }

      logger.info(`Database created successfully: ${JSON.stringify(dbResult)}`);

      // Step 3: Copy SSH keys to the site user
      logger.info(`Copying SSH keys to site user: ${siteUser}`);
      const sshResult = await cloudpanelService.copySshKeysToUser(siteUser);

      if (!sshResult.success) {
        logger.error(`SSH key copy failed, but continuing with setup`);
        logger.error(`SSH error: ${sshResult.error || "Unknown error"}`);
        // SSH key copy failure is not critical, so we continue but log the error
      }

      // Step 4: Clone repository (if repositoryUrl is provided)
      let cloneResult = null;
      if (req.body.repositoryUrl) {
        logger.info(`Cloning repository for ${domainName}`);
        try {
          cloneResult = await cloudpanelService.cloneRepository(
            domainName,
            req.body.repositoryUrl,
            siteUser
          );

          if (!cloneResult.success) {
            logger.error(
              `Repository clone failed: ${cloneResult.error || "Unknown error"}`
            );
            // Repository clone failure is not critical for basic setup
          } else {
            logger.info(`Repository cloned successfully`);
          }
        } catch (cloneError) {
          logger.error(`Repository clone error: ${cloneError.message}`);
          // Continue with setup even if clone fails
        }
      }

      // Step 5: Configure Laravel .env file (if repository was cloned)
      let envResult = null;
      if (cloneResult && cloneResult.success) {
        logger.info(`Configuring Laravel .env for ${domainName}`);
        try {
          const envSettings = {
            dbHost: "localhost",
            dbDatabase: databaseName,
            dbUsername: databaseUserName,
            dbPassword: databaseUserPassword,
            appUrl: `https://${domainName}`,
            appEnv: "production",
            appDebug: "false",
          };

          envResult = await cloudpanelService.configureLaravelEnv(
            domainName,
            siteUser,
            envSettings
          );

          if (!envResult.success) {
            logger.error(
              `Laravel .env configuration failed: ${
                envResult.error || "Unknown error"
              }`
            );
          } else {
            logger.info(`Laravel .env configured successfully`);
          }
        } catch (envError) {
          logger.error(`Laravel .env configuration error: ${envError.message}`);
        }
      }

      // Step 6: Run Laravel setup commands (migrations, cache, etc.)
      let laravelSetupResult = null;
      if (envResult && envResult.success) {
        logger.info(`Running Laravel setup commands for ${domainName}`);
        try {
          const setupOptions = {
            runMigrations: req.body.runMigrations !== false,
            runSeeders: req.body.runSeeders === true,
            optimizeCache: req.body.optimizeCache !== false,
            installComposer: req.body.installComposer !== false,
          };

          laravelSetupResult = await cloudpanelService.runLaravelSetup(
            domainName,
            siteUser,
            setupOptions
          );

          if (!laravelSetupResult.success) {
            logger.error(
              `Laravel setup commands failed: ${
                laravelSetupResult.error || "Unknown error"
              }`
            );
          } else {
            logger.info(`Laravel setup commands completed successfully`);
          }
        } catch (setupError) {
          logger.error(`Laravel setup commands error: ${setupError.message}`);
        }
      }

      // Return combined result
      const result = {
        site: siteResult,
        database: dbResult,
        sshKeys: sshResult || {
          success: false,
          message: "SSH keys not copied",
        },
        repository: cloneResult || {
          success: false,
          message: "No repository specified",
        },
        environment: envResult || {
          success: false,
          message: "Laravel .env not configured",
        },
        laravelSetup: laravelSetupResult || {
          success: false,
          message: "Laravel setup not run",
        },
        setup: {
          domainName,
          phpVersion,
          vhostTemplate,
          siteUser,
          databaseName,
          databaseUserName,
          repositoryUrl: req.body.repositoryUrl || null,
          message: "Laravel site and database setup completed successfully",
        },
      };

      BaseController.sendSuccess(
        res,
        "Laravel setup completed successfully",
        result
      );
    } catch (error) {
      logger.error("Failed to setup Laravel site:", error);

      // Provide more detailed error information
      const errorMessage =
        error.message || "Unknown error occurred during setup";
      const errorDetails = error.error || error.stderr || null;

      BaseController.sendError(
        res,
        "Failed to setup Laravel site",
        errorDetails || errorMessage,
        500
      );
    }
  })
);

module.exports = router;
