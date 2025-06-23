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
