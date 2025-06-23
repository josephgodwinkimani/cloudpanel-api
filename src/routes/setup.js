const express = require("express");
const router = express.Router();
const cloudpanelService = require("../services/cloudpanel");
const databaseService = require("../services/database");
const jobQueue = require("../services/jobQueue");
const queueManager = require("../services/queueManager");
const { validate, schemas } = require("../utils/validation");
const logger = require("../utils/logger");
const BaseController = require("../controllers/BaseController");

/**
 * @route POST /api/setup
 * @desc Queue a complete Laravel site setup with PHP and database
 * @access Public
 */
router.post(
  "/",
  validate(schemas.setupLaravel),
  BaseController.asyncHandler(async (req, res) => {
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

    const setupDetails = {
      domainName,
      phpVersion,
      vhostTemplate,
      siteUser,
      databaseName,
      databaseUserName,
      hasRepository: !!req.body.repositoryUrl
    };

    logger.site('info', `Queueing Laravel setup for domain: ${domainName}`, setupDetails);

    try {
      // Check if setup already exists for this domain
      const existingSetup = await databaseService.getSetupByDomain(domainName);
      
      if (existingSetup) {
        // Check if existing setup is still in progress
        if (existingSetup.setup_status === 'in_progress') {
          return BaseController.sendError(
            res,
            "Setup already in progress",
            `A setup for domain "${domainName}" is already in progress. Please wait for it to complete or retry the existing setup.`,
            400
          );
        }
        
        // If existing setup is failed or completed, we can allow new setup
        if (existingSetup.setup_status === 'completed') {
          logger.info(`Existing completed setup found for domain ${domainName}. New failed setup will create separate entry.`, {
            existingSetupId: existingSetup.id,
            existingStatus: existingSetup.setup_status
          });
        } else {
          logger.warn(`Existing setup found for domain ${domainName} with status: ${existingSetup.setup_status}. New setup will update the existing record.`, {
            existingSetupId: existingSetup.id,
            existingStatus: existingSetup.setup_status
          });
        }
      }

      // Prepare job data
      const jobData = {
        domainName,
        phpVersion,
        vhostTemplate,
        siteUser,
        siteUserPassword,
        databaseName,
        databaseUserName,
        databaseUserPassword,
        repositoryUrl: req.body.repositoryUrl || null,
        runMigrations: req.body.runMigrations || true,
        runSeeders: req.body.runSeeders || true,
        optimizeCache: req.body.optimizeCache || true,
        installComposer: req.body.installComposer || true,
      };

      // Add job to queue
      const job = await jobQueue.addJob('setup_laravel', jobData, 1); // High priority

      logger.success('site', `Laravel setup job queued successfully for ${domainName}`, {
        jobId: job.id,
        domainName,
        status: 'queued'
      });

      BaseController.sendSuccess(
        res,
        "Laravel setup has been queued successfully",
        {
          jobId: job.id,
          domainName,
          status: 'queued',
          message: 'Your Laravel site setup is now in progress. You can check the status using the job ID.',
          statusEndpoint: `/api/setup/job/${job.id}`,
          estimatedTime: '5-10 minutes'
        }
      );
    } catch (error) {
      logger.error("Failed to queue Laravel setup:", error);

      const errorMessage = error.message || "Unknown error occurred while queueing setup";
      const errorDetails = error.error || error.stderr || null;

      BaseController.sendError(
        res,
        "Failed to queue Laravel setup",
        errorDetails || errorMessage,
        500
      );
    }
  })
);

/**
 * @route GET /api/setup/history
 * @desc Get all setup history
 * @access Public
 */
router.get("/history", BaseController.asyncHandler(async (req, res) => {
  try {
    const setups = await databaseService.getAllSetups();
    BaseController.sendSuccess(res, "Setup history retrieved successfully", setups);
  } catch (error) {
    logger.error("Failed to retrieve setup history:", error);
    BaseController.sendError(res, "Failed to retrieve setup history", error.message, 500);
  }
}));

/**
 * @route GET /api/setup/domain/:domainName
 * @desc Get setup details for a specific domain
 * @access Public
 */
router.get("/domain/:domainName", BaseController.asyncHandler(async (req, res) => {
  try {
    const { domainName } = req.params;
    const setup = await databaseService.getSetupByDomain(domainName);
    
    if (!setup) {
      return BaseController.sendError(res, "Setup not found", `No setup found for domain: ${domainName}`, 404);
    }
    
    BaseController.sendSuccess(res, "Setup details retrieved successfully", setup);
  } catch (error) {
    logger.error("Failed to retrieve setup details:", error);
    BaseController.sendError(res, "Failed to retrieve setup details", error.message, 500);
  }
}));

/**
 * @route GET /api/setup/job/:jobId
 * @desc Get job status and details
 * @access Public
 */
router.get("/job/:jobId", BaseController.asyncHandler(async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobQueue.getJobStatus(jobId);
    
    if (!job) {
      return BaseController.sendError(res, "Job not found", `No job found with ID: ${jobId}`, 404);
    }

    // Parse job data and result if they exist
    let jobData = null;
    let jobResult = null;

    try {
      if (job.data) {
        jobData = JSON.parse(job.data);
      }
      if (job.result) {
        jobResult = JSON.parse(job.result);
      }
    } catch (parseError) {
      logger.error('Failed to parse job data/result:', parseError);
    }

    const response = {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: getJobProgress(job.status),
      data: jobData,
      result: jobResult,
      error: job.error,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at
    };

    // If job is completed, also get setup details
    if (job.status === 'completed' && jobData && jobData.domainName) {
      try {
        const setup = await databaseService.getSetupByDomain(jobData.domainName);
        if (setup) {
          response.setupDetails = setup;
        }
      } catch (setupError) {
        logger.error('Failed to get setup details:', setupError);
      }
    }
    
    BaseController.sendSuccess(res, "Job status retrieved successfully", response);
  } catch (error) {
    logger.error("Failed to retrieve job status:", error);
    BaseController.sendError(res, "Failed to retrieve job status", error.message, 500);
  }
}));

/**
 * @route GET /api/setup/jobs
 * @desc Get all jobs with optional filters
 * @access Public
 */
router.get("/jobs", BaseController.asyncHandler(async (req, res) => {
  try {
    const { status, type, limit } = req.query;
    const filters = {};
    
    if (status) filters.status = status;
    if (type) filters.type = type;
    if (limit) filters.limit = parseInt(limit);

    const jobs = await jobQueue.getJobs(filters);
    
    // Parse job data for each job
    const jobsWithParsedData = jobs.map(job => {
      let jobData = null;
      let jobResult = null;
      
      try {
        if (job.data) {
          jobData = JSON.parse(job.data);
        }
        if (job.result) {
          jobResult = JSON.parse(job.result);
        }
      } catch (parseError) {
        logger.error('Failed to parse job data/result:', parseError);
      }

      return {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: getJobProgress(job.status),
        domainName: jobData ? jobData.domainName : null,
        attempts: job.attempts,
        maxAttempts: job.max_attempts,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        completedAt: job.completed_at,
        error: job.error
      };
    });
    
    BaseController.sendSuccess(res, "Jobs retrieved successfully", {
      jobs: jobsWithParsedData,
      total: jobsWithParsedData.length,
      filters
    });
  } catch (error) {
    logger.error("Failed to retrieve jobs:", error);
    BaseController.sendError(res, "Failed to retrieve jobs", error.message, 500);
  }
}));

/**
 * @route POST /api/setup/queue/start
 * @desc Start the queue worker
 * @access Public
 */
router.post("/queue/start", BaseController.asyncHandler(async (req, res) => {
  try {
    const result = queueManager.startWorker();
    
    if (result) {
      BaseController.sendSuccess(res, "Queue worker started successfully", {
        status: 'started',
        workerStatus: queueManager.getWorkerStatus()
      });
    } else {
      BaseController.sendError(res, "Failed to start queue worker", "Worker may already be running", 400);
    }
  } catch (error) {
    logger.error("Failed to start queue worker:", error);
    BaseController.sendError(res, "Failed to start queue worker", error.message, 500);
  }
}));

/**
 * @route POST /api/setup/queue/stop
 * @desc Stop the queue worker
 * @access Public
 */
router.post("/queue/stop", BaseController.asyncHandler(async (req, res) => {
  try {
    const result = queueManager.stopWorker();
    
    if (result) {
      BaseController.sendSuccess(res, "Queue worker stopped successfully", {
        status: 'stopped',
        workerStatus: queueManager.getWorkerStatus()
      });
    } else {
      BaseController.sendError(res, "Failed to stop queue worker", "Worker may not be running", 400);
    }
  } catch (error) {
    logger.error("Failed to stop queue worker:", error);
    BaseController.sendError(res, "Failed to stop queue worker", error.message, 500);
  }
}));

/**
 * @route POST /api/setup/queue/restart
 * @desc Restart the queue worker
 * @access Public
 */
router.post("/queue/restart", BaseController.asyncHandler(async (req, res) => {
  try {
    const result = queueManager.restartWorker();
    
    if (result) {
      BaseController.sendSuccess(res, "Queue worker restarted successfully", {
        status: 'restarted',
        message: 'Worker will be restarted in a few seconds'
      });
    } else {
      BaseController.sendError(res, "Failed to restart queue worker", "Unknown error", 500);
    }
  } catch (error) {
    logger.error("Failed to restart queue worker:", error);
    BaseController.sendError(res, "Failed to restart queue worker", error.message, 500);
  }
}));

/**
 * @route GET /api/setup/queue/status
 * @desc Get queue worker status and statistics
 * @access Public
 */
router.get("/queue/status", BaseController.asyncHandler(async (req, res) => {
  try {
    const [pendingJobs, processingJobs, completedJobs, failedJobs] = await Promise.all([
      jobQueue.getJobs({ status: 'pending', limit: 100 }),
      jobQueue.getJobs({ status: 'processing', limit: 100 }),
      jobQueue.getJobs({ status: 'completed', limit: 100 }),
      jobQueue.getJobs({ status: 'failed', limit: 100 })
    ]);

    const workerStatus = queueManager.getWorkerStatus();

    const stats = {
      worker: workerStatus,
      queueStats: {
        pending: pendingJobs.length,
        processing: processingJobs.length,
        completed: completedJobs.length,
        failed: failedJobs.length,
        total: pendingJobs.length + processingJobs.length + completedJobs.length + failedJobs.length
      },
      recentJobs: {
        processing: processingJobs.slice(0, 5).map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          attempts: job.attempts,
          createdAt: job.created_at
        })),
        pending: pendingJobs.slice(0, 5).map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          scheduledAt: job.scheduled_at,
          createdAt: job.created_at
        }))
      }
    };
    
    BaseController.sendSuccess(res, "Queue status retrieved successfully", stats);
  } catch (error) {
    logger.error("Failed to retrieve queue status:", error);
    BaseController.sendError(res, "Failed to retrieve queue status", error.message, 500);
  }
}));

/**
 * @route POST /api/setup/retry/:setupId
 * @desc Retry a failed Laravel site setup
 * @access Public
 */
router.post(
  "/retry/:setupId",
  BaseController.asyncHandler(async (req, res) => {
    const { setupId } = req.params;

    try {
      // Get the existing setup record
      const existingSetup = await databaseService.getSetupById(setupId);
      
      if (!existingSetup) {
        return BaseController.sendError(
          res,
          "Setup not found",
          `No setup found with ID: ${setupId}`,
          404
        );
      }

      // Check if setup is in a state that can be retried
      if (existingSetup.setup_status === 'completed') {
        return BaseController.sendError(
          res,
          "Cannot retry completed setup",
          "This setup has already been completed successfully",
          400
        );
      }

      if (existingSetup.setup_status === 'in_progress') {
        return BaseController.sendError(
          res,
          "Setup already in progress",
          "This setup is currently running and cannot be retried",
          400
        );
      }

      const {
        domain_name: domainName,
        php_version: phpVersion,
        vhost_template: vhostTemplate,
        site_user: siteUser,
        site_user_password: siteUserPassword,
        database_name: databaseName,
        database_user_name: databaseUserName,
        database_user_password: databaseUserPassword,
        repository_url: repositoryUrl,
        run_migrations: runMigrations,
        run_seeders: runSeeders,
        optimize_cache: optimizeCache,
        install_composer: installComposer
      } = existingSetup;

      logger.site('info', `Retrying Laravel setup for domain: ${domainName}`, {
        setupId,
        domainName,
        phpVersion,
        vhostTemplate,
        siteUser,
        databaseName,
        databaseUserName
      });

      // Prepare job data
      const jobData = {
        setupId, // Include setupId to update existing record
        domainName,
        phpVersion: phpVersion || '8.3',
        vhostTemplate: vhostTemplate || 'Laravel 12',
        siteUser,
        siteUserPassword,
        databaseName,
        databaseUserName,
        databaseUserPassword,
        repositoryUrl: repositoryUrl || null,
        runMigrations: runMigrations !== null ? runMigrations : true,
        runSeeders: runSeeders !== null ? runSeeders : true,
        optimizeCache: optimizeCache !== null ? optimizeCache : true,
        installComposer: installComposer !== null ? installComposer : true,
        isRetry: true // Flag to indicate this is a retry
      };

      // Update setup status to in_progress and clear error
      await databaseService.updateSetupStatus(setupId, 'in_progress', null, null);

      // Add job to queue with high priority
      const job = await jobQueue.addJob('setup_laravel', jobData, 1);

      logger.success('site', `Laravel setup retry job queued successfully for ${domainName}`, {
        setupId,
        jobId: job.id,
        domainName,
        status: 'queued'
      });

      BaseController.sendSuccess(
        res,
        "Laravel setup retry has been queued successfully",
        {
          setupId,
          jobId: job.id,
          domainName,
          status: 'in_progress',
          message: 'Your Laravel site setup retry is now in progress. The existing record will be updated.',
          statusEndpoint: `/api/setup/job/${job.id}`,
          estimatedTime: '5-10 minutes'
        }
      );
    } catch (error) {
      logger.error("Failed to retry Laravel setup:", error);

      const errorMessage = error.message || "Unknown error occurred while retrying setup";
      const errorDetails = error.error || error.stderr || null;

      BaseController.sendError(
        res,
        "Failed to retry Laravel setup",
        errorDetails || errorMessage,
        500
      );
    }
  })
);

/**
 * @route POST /api/setup/retry-step/:setupId
 * @desc Retry a specific step of a failed Laravel site setup
 * @access Public
 */
router.post(
  "/retry-step/:setupId",
  BaseController.asyncHandler(async (req, res) => {
    const { setupId } = req.params;
    const { step } = req.body; // The specific step to retry

    try {
      // Get the existing setup record
      const existingSetup = await databaseService.getSetupById(setupId);
      
      if (!existingSetup) {
        return BaseController.sendError(
          res,
          "Setup not found",
          `No setup found with ID: ${setupId}`,
          404
        );
      }

      // Check if setup is in a state that can be retried
      if (existingSetup.setup_status === 'completed') {
        // For completed setups, only allow retry if the specific step is not completed
        // Check if the requested step is actually failed/incomplete
        const stepValue = existingSetup[step];
        
        if (stepValue === 1 || stepValue === true) {
          return BaseController.sendError(
            res,
            "Cannot retry completed step",
            `The step '${step}' has already been completed successfully`,
            400
          );
        }
        
        // Allow retry of incomplete steps even in completed setups
        logger.info(`Allowing retry of incomplete step '${step}' in completed setup`, {
          setupId,
          domainName: existingSetup.domain_name,
          step,
          stepValue,
          setupStatus: existingSetup.setup_status
        });
      }

      if (existingSetup.setup_status === 'in_progress') {
        return BaseController.sendError(
          res,
          "Setup already in progress",
          "This setup is currently running and cannot be retried",
          400
        );
      }

      // Validate step
      const validSteps = [
        'site_created',
        'database_created', 
        'ssh_keys_copied',
        'repository_cloned',
        'env_configured',
        'laravel_setup_completed'
      ];

      if (!validSteps.includes(step)) {
        return BaseController.sendError(
          res,
          "Invalid step",
          `Step must be one of: ${validSteps.join(', ')}`,
          400
        );
      }

      const {
        domain_name: domainName,
        php_version: phpVersion,
        vhost_template: vhostTemplate,
        site_user: siteUser,
        site_user_password: siteUserPassword,
        database_name: databaseName,
        database_user_name: databaseUserName,
        database_user_password: databaseUserPassword,
        repository_url: repositoryUrl,
        run_migrations: runMigrations,
        run_seeders: runSeeders,
        optimize_cache: optimizeCache,
        install_composer: installComposer
      } = existingSetup;

      logger.site('info', `Retrying step '${step}' for domain: ${domainName}`, {
        setupId,
        domainName,
        step,
        siteUser,
        databaseName,
        databaseUserName
      });

      // Prepare job data for specific step retry
      const jobData = {
        setupId, // Include setupId to update existing record
        domainName,
        phpVersion: phpVersion || '8.3',
        vhostTemplate: vhostTemplate || 'Laravel 12',
        siteUser,
        siteUserPassword,
        databaseName,
        databaseUserName,
        databaseUserPassword,
        repositoryUrl: repositoryUrl || null,
        runMigrations: runMigrations !== null ? runMigrations : true,
        runSeeders: runSeeders !== null ? runSeeders : true,
        optimizeCache: optimizeCache !== null ? optimizeCache : true,
        installComposer: installComposer !== null ? installComposer : true,
        isRetry: true,
        retryStep: step, // Specific step to retry
        currentStepStates: {
          site_created: existingSetup.site_created,
          database_created: existingSetup.database_created,
          ssh_keys_copied: existingSetup.ssh_keys_copied,
          repository_cloned: existingSetup.repository_cloned,
          env_configured: existingSetup.env_configured,
          laravel_setup_completed: existingSetup.laravel_setup_completed
        }
      };

      // Update setup status to in_progress and clear error
      await databaseService.updateSetupStatus(setupId, 'in_progress', null, null);

      // Add job to queue with high priority
      const job = await jobQueue.addJob('setup_laravel_step', jobData, 1);

      logger.success('site', `Laravel setup step '${step}' retry job queued successfully for ${domainName}`, {
        setupId,
        jobId: job.id,
        domainName,
        step,
        status: 'queued'
      });

      BaseController.sendSuccess(
        res,
        `Laravel setup step '${step}' retry has been queued successfully`,
        {
          setupId,
          jobId: job.id,
          domainName,
          step,
          status: 'in_progress',
          message: `Your Laravel site setup step '${step}' retry is now in progress. Only this specific step will be executed.`,
          statusEndpoint: `/api/setup/job/${job.id}`,
          estimatedTime: '1-3 minutes'
        }
      );
    } catch (error) {
      logger.error(`Failed to retry Laravel setup step '${step}':`, error);

      const errorMessage = error.message || "Unknown error occurred while retrying setup step";
      const errorDetails = error.error || error.stderr || null;

      BaseController.sendError(
        res,
        `Failed to retry Laravel setup step '${step}'`,
        errorDetails || errorMessage,
        500
      );
    }
  })
);

/**
 * @route POST /api/setup/cleanup-duplicates
 * @desc Clean up duplicate setups for the same domain (keep only latest)
 * @access Public
 */
router.post("/cleanup-duplicates", BaseController.asyncHandler(async (req, res) => {
  try {
    logger.info('Starting cleanup of duplicate setups...');
    const result = await databaseService.cleanupDuplicateSetups();
    
    logger.info('Duplicate cleanup completed', result);
    BaseController.sendSuccess(res, "Duplicate cleanup completed successfully", result);
  } catch (error) {
    logger.error("Failed to cleanup duplicate setups:", error);
    BaseController.sendError(res, "Failed to cleanup duplicate setups", error.message, 500);
  }
}));

// Helper function to calculate job progress
function getJobProgress(status) {
  switch (status) {
    case 'pending': return 0;
    case 'processing': return 50;
    case 'completed': return 100;
    case 'failed': return -1;
    default: return 0;
  }
}

module.exports = router;
