const databaseService = require("./database");
const logger = require("../utils/logger");
const cloudpanelService = require("./cloudpanel");

class JobQueue {
  constructor() {
    this.isProcessing = false;
    this.processingInterval = null;
  }

  /**
   * Add a new job to the queue
   */
  async addJob(type, data, priority = 0) {
    try {
      const job = {
        type,
        data: JSON.stringify(data),
        status: "pending",
        priority,
        attempts: 0,
        max_attempts: 3,
        created_at: new Date().toISOString(),
        scheduled_at: new Date().toISOString(),
      };

      const result = await databaseService.createJob(job);
      logger.info(`Job added to queue: ${type} with ID: ${result.id}`, {
        jobId: result.id,
        type,
        data,
      });

      return result;
    } catch (error) {
      logger.error("Failed to add job to queue:", error);
      throw error;
    }
  }

  /**
   * Get next pending job from queue
   */
  async getNextJob() {
    try {
      return await databaseService.getNextPendingJob();
    } catch (error) {
      logger.error("Failed to get next job:", error);
      return null;
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId, status, result = null, error = null) {
    try {
      const updateData = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (result) {
        updateData.result = JSON.stringify(result);
      }

      if (error) {
        updateData.error =
          typeof error === "string" ? error : JSON.stringify(error);
      }

      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }

      await databaseService.updateJob(jobId, updateData);
      logger.info(`Job ${jobId} status updated to: ${status}`);
    } catch (updateError) {
      logger.error(`Failed to update job ${jobId} status:`, updateError);
    }
  }

  /**
   * Process setup job
   */
  async processSetupJob(job) {
    const startTime = Date.now();
    const data = JSON.parse(job.data);

    logger.info(
      `Processing setup job ${job.id} for domain: ${data.domainName}`
    );

    // Initialize setup tracking object
    const setupTracking = {
      jobId: job.id,
      domainName: data.domainName,
      phpVersion: data.phpVersion,
      vhostTemplate: data.vhostTemplate,
      siteUser: data.siteUser,
      databaseName: data.databaseName,
      databaseUserName: data.databaseUserName,
      databasePassword: data.databaseUserPassword, // Map to correct field name
      repositoryUrl: data.repositoryUrl || null,
      runMigrations: data.runMigrations || false,
      runSeeders: data.runSeeders || false,
      optimizeCache: data.optimizeCache || false,
      installComposer: data.installComposer || false,
      siteCreated: false,
      databaseCreated: false,
      sshKeysCopied: false,
      repositoryCloned: false,
      envConfigured: false,
      laravelSetupCompleted: false,
      setupStatus: "in_progress",
      errorMessage: null,
    };

    // Function to save setup data regardless of success or failure
    const saveSetupData = async (status, errorMessage = null) => {
      setupTracking.setupStatus = status;
      setupTracking.errorMessage = errorMessage;
      
      try {
        const savedSetup = await databaseService.createSetup(setupTracking);
        logger.info(`Setup data saved to database with ID: ${savedSetup.id}`, {
          jobId: job.id,
          status: status,
          errorMessage: errorMessage
        });
        return savedSetup;
      } catch (dbError) {
        logger.error(
          `Failed to save setup data to database: ${dbError.message}`,
          { jobId: job.id, status: status }
        );
        return null;
      }
    };

    try {
      // Step 1: Create PHP site with Laravel
      logger.site(
        "info",
        `Step 1: Creating PHP site with Laravel for ${data.domainName}`,
        {
          jobId: job.id,
          domainName: data.domainName,
          phpVersion: data.phpVersion,
          vhostTemplate: data.vhostTemplate,
          siteUser: data.siteUser,
        }
      );

      const siteResult = await cloudpanelService.createSiteSetup(
        data.domainName,
        data.phpVersion,
        data.vhostTemplate,
        data.siteUser,
        data.siteUserPassword
      );

      if (!siteResult.success) {
        throw new Error(
          `Site creation failed: ${siteResult.error || "Unknown error"}`
        );
      }

      logger.success(
        "site",
        `Laravel PHP site created successfully for ${data.domainName}`,
        {
          jobId: job.id,
          domainName: data.domainName,
          step: "1 - Site Creation",
        }
      );

      setupTracking.siteCreated = true;

      // Step 2: Create database
      logger.info(`Creating database for ${data.domainName}`, {
        jobId: job.id,
      });
      const dbResult = await cloudpanelService.createDatabaseSetup(
        data.domainName,
        data.databaseName,
        data.databaseUserName,
        data.databaseUserPassword
      );

      if (!dbResult.success) {
        // Cleanup site if database creation fails
        try {
          await cloudpanelService.deleteSite(data.domainName, true);
        } catch (cleanupError) {
          logger.error(
            `Failed to cleanup site after database error: ${cleanupError.message}`,
            { jobId: job.id }
          );
        }
        throw new Error(
          `Database creation failed: ${dbResult.error || "Unknown error"}`
        );
      }

      logger.info(`Database created successfully`, {
        jobId: job.id,
        databaseName: data.databaseName,
      });
      setupTracking.databaseCreated = true;

      // Step 3: Copy SSH keys
      logger.info(`Copying SSH keys to site user: ${data.siteUser}`, {
        jobId: job.id,
      });
      const sshResult = await cloudpanelService.copySshKeysToUser(
        data.siteUser
      );

      if (!sshResult.success) {
        logger.error(`SSH key copy failed, but continuing with setup`, {
          jobId: job.id,
          error: sshResult.error,
        });
      } else {
        setupTracking.sshKeysCopied = true;
      }

      // Step 4: Clone repository (if provided)
      let cloneResult = null;
      if (data.repositoryUrl) {
        logger.info(`Cloning repository for ${data.domainName}`, {
          jobId: job.id,
        });
        try {
          cloneResult = await cloudpanelService.cloneRepository(
            data.domainName,
            data.repositoryUrl,
            data.siteUser
          );

          if (cloneResult.success) {
            logger.info(`Repository cloned successfully`, { jobId: job.id });
            setupTracking.repositoryCloned = true;
          } else {
            logger.error(`Repository clone failed: ${cloneResult.error}`, {
              jobId: job.id,
            });
          }
        } catch (cloneError) {
          logger.error(`Repository clone error: ${cloneError.message}`, {
            jobId: job.id,
          });
        }
      }

      // Step 5: Configure Laravel .env
      let envResult = null;
      if (cloneResult && cloneResult.success) {
        logger.info(`Configuring Laravel .env for ${data.domainName}`, {
          jobId: job.id,
        });
        try {
          const envSettings = {
            dbHost: "localhost",
            dbDatabase: data.databaseName,
            dbUsername: data.databaseUserName,
            dbPassword: data.databaseUserPassword,
            appUrl: `https://${data.domainName}`,
            appEnv: "production",
            appDebug: "false",
          };

          envResult = await cloudpanelService.configureLaravelEnv(
            data.domainName,
            data.siteUser,
            envSettings
          );

          if (envResult.success) {
            logger.info(`Laravel .env configured successfully`, {
              jobId: job.id,
            });
            setupTracking.envConfigured = true;
          } else {
            logger.error(
              `Laravel .env configuration failed: ${envResult.error}`,
              { jobId: job.id }
            );
          }
        } catch (envError) {
          logger.error(
            `Laravel .env configuration error: ${envError.message}`,
            { jobId: job.id }
          );
        }
      }

      // Step 6: Run Laravel setup commands
      let laravelSetupResult = null;
      if (envResult && envResult.success) {
        logger.info(`Running Laravel setup commands for ${data.domainName}`, {
          jobId: job.id,
        });
        try {
          const setupOptions = {
            runMigrations: data.runMigrations === true,
            runSeeders: data.runSeeders === true,
            optimizeCache: data.optimizeCache === true,
            installComposer: data.installComposer === true,
          };

          laravelSetupResult = await cloudpanelService.runLaravelSetup(
            data.domainName,
            data.siteUser,
            setupOptions
          );

          if (laravelSetupResult.success) {
            logger.info(`Laravel setup commands completed successfully`, {
              jobId: job.id,
            });
            setupTracking.laravelSetupCompleted = true;
          } else {
            logger.error(
              `Laravel setup commands failed: ${laravelSetupResult.error}`,
              { jobId: job.id }
            );
          }
        } catch (setupError) {
          logger.error(`Laravel setup commands error: ${setupError.message}`, {
            jobId: job.id,
          });
        }
      }

      // Mark setup as completed and save to database
      const savedSetup = await saveSetupData("completed");

      const result = {
        setupId: savedSetup ? savedSetup.id : null,
        domainName: data.domainName,
        status: "completed",
        executionTime: Date.now() - startTime,
        steps: {
          siteCreated: setupTracking.siteCreated,
          databaseCreated: setupTracking.databaseCreated,
          sshKeysCopied: setupTracking.sshKeysCopied,
          repositoryCloned: setupTracking.repositoryCloned,
          envConfigured: setupTracking.envConfigured,
          laravelSetupCompleted: setupTracking.laravelSetupCompleted,
        },
      };

      await this.updateJobStatus(job.id, "completed", result);
      return result;
    } catch (error) {
      logger.error(`Setup job ${job.id} failed:`, error);

      // Always save failed setup data to database with error message
      const savedSetup = await saveSetupData("failed", error.message || "Unknown error occurred during setup");

      // Create result object for failed job
      const result = {
        setupId: savedSetup ? savedSetup.id : null,
        domainName: data.domainName,
        status: "failed",
        executionTime: Date.now() - startTime,
        errorMessage: error.message || "Unknown error occurred during setup",
        steps: {
          siteCreated: setupTracking.siteCreated,
          databaseCreated: setupTracking.databaseCreated,
          sshKeysCopied: setupTracking.sshKeysCopied,
          repositoryCloned: setupTracking.repositoryCloned,
          envConfigured: setupTracking.envConfigured,
          laravelSetupCompleted: setupTracking.laravelSetupCompleted,
        },
      };

      await this.updateJobStatus(job.id, "failed", result, error.message);
      throw error;
    }
  }

  /**
   * Process a single job
   */
  async processJob(job) {
    try {
      await this.updateJobStatus(job.id, "processing");

      let result;
      switch (job.type) {
        case "setup_laravel":
          result = await this.processSetupJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      return result;
    } catch (error) {
      // Increment attempts
      const attempts = (job.attempts || 0) + 1;

      if (attempts >= job.max_attempts) {
        await this.updateJobStatus(job.id, "failed", null, error.message);
        logger.error(
          `Job ${job.id} failed permanently after ${attempts} attempts:`,
          error
        );
      } else {
        // Reschedule for retry
        const retryDelay = Math.pow(2, attempts) * 60000; // Exponential backoff
        const scheduledAt = new Date(Date.now() + retryDelay).toISOString();

        await databaseService.updateJob(job.id, {
          status: "pending",
          attempts,
          scheduled_at: scheduledAt,
          error: error.message,
        });

        logger.warn(
          `Job ${job.id} failed, retrying in ${
            retryDelay / 1000
          } seconds (attempt ${attempts}/${job.max_attempts}):`,
          error
        );
      }

      throw error;
    }
  }

  /**
   * Start the queue worker
   */
  async startWorker(intervalMs = 5000) {
    if (this.isProcessing) {
      logger.warn("Queue worker is already running");
      return;
    }

    this.isProcessing = true;
    logger.info("Starting queue worker...");

    this.processingInterval = setInterval(async () => {
      try {
        const job = await this.getNextJob();

        if (job) {
          logger.info(`Processing job ${job.id} of type: ${job.type}`);
          await this.processJob(job);
        }
      } catch (error) {
        logger.error("Error in queue worker:", error);
      }
    }, intervalMs);

    logger.info(`Queue worker started with ${intervalMs}ms interval`);
  }

  /**
   * Stop the queue worker
   */
  stopWorker() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    this.isProcessing = false;
    logger.info("Queue worker stopped");
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    try {
      return await databaseService.getJob(jobId);
    } catch (error) {
      logger.error(`Failed to get job status for ID ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Get all jobs with optional filters
   */
  async getJobs(filters = {}) {
    try {
      return await databaseService.getJobs(filters);
    } catch (error) {
      logger.error("Failed to get jobs:", error);
      return [];
    }
  }
}

module.exports = new JobQueue();
