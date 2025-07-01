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
        let savedSetup;
        
        // If this is a retry (setupId provided), update existing record
        if (data.isRetry && data.setupId) {
          // Check current setup status before updating
          const currentSetup = await databaseService.getSetupById(data.setupId);
          
          if (!currentSetup) {
            logger.error(`Setup with ID ${data.setupId} not found`, {
              jobId: job.id
            });
            return null;
          }

          // Only allow updates for failed or in_progress setups
          // Don't update completed setups unless the new status is also completed
          if (currentSetup.setup_status === 'completed' && status !== 'completed') {
            logger.warn(`Skipping update for completed setup ID: ${data.setupId}. Cannot downgrade from completed to ${status}`, {
              jobId: job.id,
              currentStatus: currentSetup.setup_status,
              newStatus: status
            });
            return { id: data.setupId, isUpdate: false, skipped: true };
          }

          const updateData = {
            job_id: job.id,
            setup_status: status,
            error_message: errorMessage,
            site_created: setupTracking.siteCreated ? 1 : 0,
            database_created: setupTracking.databaseCreated ? 1 : 0,
            ssh_keys_copied: setupTracking.sshKeysCopied ? 1 : 0,
            repository_cloned: setupTracking.repositoryCloned ? 1 : 0,
            env_configured: setupTracking.envConfigured ? 1 : 0,
            laravel_setup_completed: setupTracking.laravelSetupCompleted ? 1 : 0
          };
          
          await databaseService.updateSetup(data.setupId, updateData);
          savedSetup = { id: data.setupId, isUpdate: true };
          
          logger.info(`Setup data updated in database with ID: ${data.setupId}`, {
            jobId: job.id,
            status: status,
            errorMessage: errorMessage,
            isRetry: true,
            previousStatus: currentSetup.setup_status
          });
        } else {
          // Check if setup already exists for this domain
          const existingSetup = await databaseService.getSetupByDomain(data.domainName);
          
          if (existingSetup) {
            // Rule 1: If existing setup is completed, create new failed entry (don't update completed)
            if (existingSetup.setup_status === 'completed' && status !== 'completed') {
              logger.info(`Creating new failed setup entry for domain ${data.domainName} because existing setup is completed`, {
                jobId: job.id,
                existingSetupId: existingSetup.id,
                existingStatus: existingSetup.setup_status,
                newStatus: status
              });
              
              // Create new setup record for failed attempt
              savedSetup = await databaseService.createSetup(setupTracking);
              logger.info(`New failed setup created with ID: ${savedSetup.id} for domain: ${data.domainName}`, {
                jobId: job.id,
                status: status,
                errorMessage: errorMessage,
                reason: 'existing_completed'
              });
            } 
            // Rule 2: If existing setup is failed/in_progress, update it
            else if (existingSetup.setup_status === 'failed' || existingSetup.setup_status === 'in_progress') {
              const updateData = {
                job_id: job.id,
                setup_status: status,
                error_message: errorMessage,
                site_created: setupTracking.siteCreated ? 1 : 0,
                database_created: setupTracking.databaseCreated ? 1 : 0,
                ssh_keys_copied: setupTracking.sshKeysCopied ? 1 : 0,
                repository_cloned: setupTracking.repositoryCloned ? 1 : 0,
                env_configured: setupTracking.envConfigured ? 1 : 0,
                laravel_setup_completed: setupTracking.laravelSetupCompleted ? 1 : 0
              };
              
              await databaseService.updateSetup(existingSetup.id, updateData);
              savedSetup = { id: existingSetup.id, isUpdate: true };
              
              logger.info(`Updated existing failed/in_progress setup with ID: ${existingSetup.id} for domain: ${data.domainName}`, {
                jobId: job.id,
                status: status,
                errorMessage: errorMessage,
                previousStatus: existingSetup.setup_status,
                reason: 'update_failed'
              });
            }
            // Rule 3: If trying to update completed with completed, allow update
            else if (existingSetup.setup_status === 'completed' && status === 'completed') {
              const updateData = {
                job_id: job.id,
                setup_status: status,
                error_message: errorMessage,
                site_created: setupTracking.siteCreated ? 1 : 0,
                database_created: setupTracking.databaseCreated ? 1 : 0,
                ssh_keys_copied: setupTracking.sshKeysCopied ? 1 : 0,
                repository_cloned: setupTracking.repositoryCloned ? 1 : 0,
                env_configured: setupTracking.envConfigured ? 1 : 0,
                laravel_setup_completed: setupTracking.laravelSetupCompleted ? 1 : 0
              };
              
              await databaseService.updateSetup(existingSetup.id, updateData);
              savedSetup = { id: existingSetup.id, isUpdate: true };
              
              logger.info(`Updated completed setup with ID: ${existingSetup.id} for domain: ${data.domainName}`, {
                jobId: job.id,
                status: status,
                errorMessage: errorMessage,
                previousStatus: existingSetup.setup_status,
                reason: 'update_completed'
              });
            }
          } else {
            // Create new setup record only if none exists
            savedSetup = await databaseService.createSetup(setupTracking);
            logger.info(`Setup data saved to database with ID: ${savedSetup.id}`, {
              jobId: job.id,
              status: status,
              errorMessage: errorMessage,
              isRetry: false
            });
          }
        }
        
        return savedSetup;
      } catch (dbError) {
        logger.error(
          `Failed to save setup data to database: ${dbError.message}`,
          { jobId: job.id, status: status, isRetry: data.isRetry || false }
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
   * Process a specific step of Laravel setup job
   */
  async processSetupStepJob(job) {
    const data = JSON.parse(job.data);
    const startTime = Date.now();

    logger.info(`Starting Laravel setup step '${data.retryStep}' job for domain: ${data.domainName}`, {
      jobId: job.id,
      step: data.retryStep,
      domainName: data.domainName,
      isRetry: data.isRetry
    });

    // Initialize tracking with current states
    const setupTracking = {
      jobId: job.id,
      domainName: data.domainName,
      phpVersion: data.phpVersion,
      vhostTemplate: data.vhostTemplate,
      siteUser: data.siteUser,
      siteUserPassword: data.siteUserPassword,
      databaseName: data.databaseName,
      databaseUserName: data.databaseUserName,
      databaseUserPassword: data.databaseUserPassword,
      repositoryUrl: data.repositoryUrl,
      runMigrations: data.runMigrations,
      runSeeders: data.runSeeders,
      optimizeCache: data.optimizeCache,
      installComposer: data.installComposer,
      setupStatus: "in_progress",
      errorMessage: null,
      // Start with current states from database
      siteCreated: data.currentStepStates.site_created || false,
      databaseCreated: data.currentStepStates.database_created || false,
      sshKeysCopied: data.currentStepStates.ssh_keys_copied || false,
      repositoryCloned: data.currentStepStates.repository_cloned || false,
      envConfigured: data.currentStepStates.env_configured || false,
      laravelSetupCompleted: data.currentStepStates.laravel_setup_completed || false,
    };

    const cloudpanelService = require("./cloudpanel");
    const databaseService = require("./database");

         // Function to save setup data regardless of success or failure
     const saveSetupData = async (status, errorMessage = null) => {
       setupTracking.setupStatus = status;
       setupTracking.errorMessage = errorMessage;
       
       try {
         // Check current setup status before updating
         const currentSetup = await databaseService.getSetupById(data.setupId);
         
         if (!currentSetup) {
           logger.error(`Setup with ID ${data.setupId} not found`, {
             jobId: job.id,
             step: data.retryStep
           });
           return null;
         }

         // For step retry, we can update completed setups but only to improve individual steps
         // Rule: Allow step retry on completed setups to fix individual failed steps
         // The overall status logic will be handled after step execution
         
         // Update existing record since this is always a step retry
         const updateData = {
           job_id: job.id,
           setup_status: status,
           error_message: errorMessage,
           site_created: setupTracking.siteCreated ? 1 : 0,
           database_created: setupTracking.databaseCreated ? 1 : 0,
           ssh_keys_copied: setupTracking.sshKeysCopied ? 1 : 0,
           repository_cloned: setupTracking.repositoryCloned ? 1 : 0,
           env_configured: setupTracking.envConfigured ? 1 : 0,
           laravel_setup_completed: setupTracking.laravelSetupCompleted ? 1 : 0
         };
         
         await databaseService.updateSetup(data.setupId, updateData);
         
         logger.info(`Setup step '${data.retryStep}' data updated in database with ID: ${data.setupId}`, {
           jobId: job.id,
           step: data.retryStep,
           status: status,
           errorMessage: errorMessage,
           isStepRetry: true,
           previousStatus: currentSetup.setup_status
         });
         
         return { id: data.setupId, isUpdate: true };
       } catch (dbError) {
         logger.error(
           `Failed to save setup step data to database: ${dbError.message}`,
           { jobId: job.id, step: data.retryStep, status: status }
         );
         return null;
       }
     };

    try {
      const step = data.retryStep;
      
      logger.site(
        "info",
        `Executing individual step: ${step} for ${data.domainName}`,
        {
          jobId: job.id,
          domainName: data.domainName,
          step: step,
          currentStates: data.currentStepStates
        }
      );

      // Execute specific step based on retryStep
      switch (step) {
        case 'site_created':
          logger.info(`Retrying Step 1: Creating PHP site with Laravel for ${data.domainName}`, {
            jobId: job.id,
            step: step
          });

          const siteResult = await cloudpanelService.createSiteSetup(
            data.domainName,
            data.phpVersion,
            data.vhostTemplate,
            data.siteUser,
            data.siteUserPassword
          );

          if (!siteResult.success) {
            throw new Error(`Site creation failed: ${siteResult.error || "Unknown error"}`);
          }

          setupTracking.siteCreated = true;
          logger.success("site", `Laravel PHP site created successfully for ${data.domainName}`, {
            jobId: job.id,
            step: step
          });
          break;

        case 'database_created':
          logger.info(`Retrying Step 2: Creating database for ${data.domainName}`, {
            jobId: job.id,
            step: step
          });

          const dbResult = await cloudpanelService.createDatabaseSetup(
            data.domainName,
            data.databaseName,
            data.databaseUserName,
            data.databaseUserPassword
          );

          if (!dbResult.success) {
            throw new Error(`Database creation failed: ${dbResult.error || "Unknown error"}`);
          }

          setupTracking.databaseCreated = true;
          logger.success("site", `Database created successfully for ${data.domainName}`, {
            jobId: job.id,
            step: step,
            databaseName: data.databaseName
          });
          break;

        case 'ssh_keys_copied':
          logger.info(`Retrying Step 3: Copying SSH keys to site user: ${data.siteUser}`, {
            jobId: job.id,
            step: step
          });

          const sshResult = await cloudpanelService.copySshKeysToUser(data.siteUser);

          if (!sshResult.success) {
            throw new Error(`SSH key copy failed: ${sshResult.error || "Unknown error"}`);
          }

          setupTracking.sshKeysCopied = true;
          logger.success("site", `SSH keys copied successfully for ${data.siteUser}`, {
            jobId: job.id,
            step: step
          });
          break;

        case 'repository_cloned':
          if (!data.repositoryUrl) {
            throw new Error("Repository URL is required for repository cloning step");
          }

          logger.info(`Retrying Step 4: Cloning repository for ${data.domainName}`, {
            jobId: job.id,
            step: step,
            repositoryUrl: data.repositoryUrl
          });

          const cloneResult = await cloudpanelService.cloneRepository(
            data.domainName,
            data.repositoryUrl,
            data.siteUser
          );

          if (!cloneResult.success) {
            throw new Error(`Repository clone failed: ${cloneResult.error || "Unknown error"}`);
          }

          setupTracking.repositoryCloned = true;
          logger.success("site", `Repository cloned successfully for ${data.domainName}`, {
            jobId: job.id,
            step: step
          });
          break;

        case 'env_configured':
          logger.info(`Retrying Step 5: Configuring Laravel .env for ${data.domainName}`, {
            jobId: job.id,
            step: step
          });

          const envSettings = {
            dbHost: "localhost",
            dbDatabase: data.databaseName,
            dbUsername: data.databaseUserName,
            dbPassword: data.databaseUserPassword,
            appUrl: `https://${data.domainName}`,
            appEnv: "production",
            appDebug: "false",
          };

          const envResult = await cloudpanelService.configureLaravelEnv(
            data.domainName,
            data.siteUser,
            envSettings
          );

          if (!envResult.success) {
            throw new Error(`Laravel .env configuration failed: ${envResult.error || "Unknown error"}`);
          }

          setupTracking.envConfigured = true;
          logger.success("site", `Laravel .env configured successfully for ${data.domainName}`, {
            jobId: job.id,
            step: step
          });
          break;

        case 'laravel_setup_completed':
          logger.info(`Retrying Step 6: Running Laravel setup commands for ${data.domainName}`, {
            jobId: job.id,
            step: step
          });

          const setupOptions = {
            runMigrations: data.runMigrations === true,
            runSeeders: data.runSeeders === true,
            optimizeCache: data.optimizeCache === true,
            installComposer: data.installComposer === true,
          };

          const laravelSetupResult = await cloudpanelService.runLaravelSetup(
            data.domainName,
            data.siteUser,
            setupOptions
          );

          if (!laravelSetupResult.success) {
            throw new Error(`Laravel setup commands failed: ${laravelSetupResult.error || "Unknown error"}`);
          }

          setupTracking.laravelSetupCompleted = true;
          logger.success("site", `Laravel setup commands completed successfully for ${data.domainName}`, {
            jobId: job.id,
            step: step
          });
          break;

        default:
          throw new Error(`Unknown setup step: ${step}`);
      }

             // Check if all steps are now completed
       const allStepsCompleted = setupTracking.siteCreated && 
                                setupTracking.databaseCreated && 
                                setupTracking.sshKeysCopied && 
                                setupTracking.repositoryCloned && 
                                setupTracking.envConfigured && 
                                setupTracking.laravelSetupCompleted;

       // Determine final status based on step completion and current status
       let finalStatus;
       const currentSetup = await databaseService.getSetupById(data.setupId);
       
       if (allStepsCompleted) {
         finalStatus = "completed";
       } else {
         // For step retry: 
         // - If original setup was completed, keep it completed (individual step may still fail)
         // - If original setup was failed/in_progress, mark as failed
         if (currentSetup && currentSetup.setup_status === 'completed') {
           finalStatus = 'completed'; // Don't downgrade completed status
           logger.info(`Keeping completed status for setup ${data.setupId} despite individual step retry result`, {
             jobId: job.id,
             step: data.retryStep,
             allStepsCompleted
           });
         } else {
           finalStatus = 'failed';
         }
       }
       
       const savedSetup = await saveSetupData(finalStatus);

      const result = {
        setupId: savedSetup ? savedSetup.id : null,
        domainName: data.domainName,
        step: step,
        status: "completed",
        overallStatus: finalStatus,
        allStepsCompleted: allStepsCompleted,
        executionTime: Date.now() - startTime,
        stepResult: `Step '${step}' completed successfully`,
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
      logger.error(`Setup step job ${job.id} failed for step '${data.retryStep}':`, error);

      // Save failed setup data to database with error message
      const savedSetup = await saveSetupData("failed", error.message || "Unknown error occurred during step execution");

      // Create result object for failed step job
      const result = {
        setupId: savedSetup ? savedSetup.id : null,
        domainName: data.domainName,
        step: data.retryStep,
        status: "failed",
        executionTime: Date.now() - startTime,
        errorMessage: error.message || "Unknown error occurred during step execution",
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
   * Process git pull job
   */
  async processGitPullJob(job) {
    const startTime = Date.now();
    const data = JSON.parse(job.data);
    const { siteUser, domainName, sitePath } = data;

    logger.info(
      `Processing git pull job ${job.id} for domain: ${domainName}`
    );

    try {
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);

      // SSH configuration
      const sshCommand = "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null";
      
      // Development mode check
      const isDevelopment = process.env.NODE_ENV === "development";

      // Import SSH execution function from sites.js - reuse existing infrastructure
      const { Client } = require("ssh2");
      
      // SSH configuration for development mode (same as sites.js)
      const sshConfig = {
        host: process.env.VPS_HOST || "localhost",
        user: process.env.VPS_USER || "root",
        port: process.env.VPS_PORT || 22,
        password: process.env.VPS_PASSWORD || null,
      };

      // Validate SSH configuration in development mode
      const validateSshConfig = () => {
        if (!isDevelopment) {
          return true;
        }

        if (!sshConfig.host) {
          throw new Error("Development mode requires VPS_HOST environment variable");
        }

        if (!sshConfig.user) {
          throw new Error("Development mode requires VPS_USER environment variable");
        }

        if (!sshConfig.password) {
          throw new Error("Development mode requires VPS_PASSWORD environment variable");
        }

        return true;
      };

      // Create SSH connection (similar to sites.js)
      const getSshConnection = () => {
        return new Promise((resolve, reject) => {
          const conn = new Client();

          const connectionTimeout = setTimeout(() => {
            conn.destroy();
            reject(new Error("SSH connection timeout"));
          }, 10000);

          conn
            .on("ready", () => {
              clearTimeout(connectionTimeout);
              conn.isConnected = true;
              resolve(conn);
            })
            .on("error", (err) => {
              clearTimeout(connectionTimeout);
              reject(err);
            })
            .connect({
              host: sshConfig.host,
              port: sshConfig.port,
              username: sshConfig.user,
              password: sshConfig.password,
              readyTimeout: 10000,
              keepaliveInterval: 30000,
              keepaliveCountMax: 3,
            });
        });
      };

      // Execute SSH command (similar to sites.js)
      const executeSshCommand = async (command) => {
        if (!isDevelopment) {
          throw new Error("SSH execution only available in development mode");
        }

        // Validate SSH configuration
        validateSshConfig();

        const conn = await getSshConnection();

        return new Promise((resolve, reject) => {
          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              return reject({
                success: false,
                error: `SSH exec error: ${err.message}`,
                command: command,
              });
            }

            let stdout = "";
            let stderr = "";

            stream
              .on("close", (code, signal) => {
                conn.end();
                if (code !== 0) {
                  reject({
                    success: false,
                    error: `Command failed with exit code ${code}`,
                    stdout,
                    stderr,
                    command: command,
                    exitCode: code,
                  });
                } else {
                  resolve({
                    success: true,
                    output: stdout,
                    stderr,
                    command: command,
                    exitCode: code,
                  });
                }
              })
              .on("data", (data) => {
                stdout += data.toString();
              })
              .stderr.on("data", (data) => {
                stderr += data.toString();
              });
          });
        });
      };

      // Step 1: Get current branch and remote info
      logger.info(`Getting git info for ${domainName}...`);
      const gitInfoCommand = `su - ${siteUser} -c 'cd "${sitePath}" && echo "=== Current Branch ===" && GIT_SSH_COMMAND="${sshCommand}" git branch --show-current && echo "=== Remote Info ===" && GIT_SSH_COMMAND="${sshCommand}" git remote -v && echo "=== Status Before Pull ===" && GIT_SSH_COMMAND="${sshCommand}" git status --porcelain'`;

      let gitInfo;
      if (isDevelopment) {
        const sshResult = await executeSshCommand(gitInfoCommand);
        gitInfo = sshResult.output || "";
      } else {
        const result = await execAsync(gitInfoCommand);
        gitInfo = result.stdout;
      }

      // Step 2: Perform the actual git pull
      logger.info(`Performing git pull for ${domainName}...`);
      const gitPullCommand = `su - ${siteUser} -c 'cd "${sitePath}" && GIT_SSH_COMMAND="${sshCommand}" git pull origin \$(git branch --show-current) 2>&1'`;

      let pullResult;
      if (isDevelopment) {
        const sshResult = await executeSshCommand(gitPullCommand);
        pullResult = sshResult.output || "";
      } else {
        try {
          const result = await execAsync(gitPullCommand);
          pullResult = result.stdout;
        } catch (error) {
          // Git pull might fail but still provide useful output in stderr
          pullResult = error.stdout + "\n" + error.stderr;
        }
      }

      // Step 3: Run Laravel optimization commands if it's a Laravel project
      logger.info(`Running optimizations for ${domainName}...`);
      let optimizationResult = "";
      const laravelOptimizeCommand = `su - ${siteUser} -c 'cd "${sitePath}" && if [ -f "artisan" ]; then echo "=== Running Laravel optimizations ===" && composer install --no-dev --optimize-autoloader --quiet 2>&1 && php artisan optimize:clear 2>&1 && echo "Laravel optimizations completed"; else echo "Not a Laravel project, skipping optimizations"; fi'`;
      
      if (isDevelopment) {
        const sshResult = await executeSshCommand(laravelOptimizeCommand);
        optimizationResult = sshResult.output || "";
      } else {
        try {
          const result = await execAsync(laravelOptimizeCommand);
          optimizationResult = result.stdout;
        } catch (error) {
          optimizationResult = `Optimization error: ${error.stdout}\n${error.stderr}`;
        }
      }

      // Step 4: Get status after pull
      logger.info(`Getting final status for ${domainName}...`);
      const gitStatusAfterCommand = `su - ${siteUser} -c 'cd "${sitePath}" && echo "=== Status After Pull ===" && GIT_SSH_COMMAND="${sshCommand}" git status --porcelain && echo "=== Latest Commits ===" && GIT_SSH_COMMAND="${sshCommand}" git log --oneline -5'`;

      let statusAfter;
      if (isDevelopment) {
        const sshResult = await executeSshCommand(gitStatusAfterCommand);
        statusAfter = sshResult.output || "";
      } else {
        const result = await execAsync(gitStatusAfterCommand);
        statusAfter = result.stdout;
      }

      // Check if pull was successful
      const isSuccessful =
        pullResult.includes("Already up to date") ||
        pullResult.includes("Fast-forward") ||
        pullResult.includes("Updating") ||
        (!pullResult.toLowerCase().includes("error") && !pullResult.toLowerCase().includes("fatal"));

      const result = {
        domainName,
        siteUser,
        sitePath,
        status: isSuccessful ? "completed" : "completed_with_issues",
        executionTime: Date.now() - startTime,
        gitInfo: gitInfo?.trim(),
        pullOutput: pullResult?.trim(),
        optimizationOutput: optimizationResult?.trim(),
        statusAfter: statusAfter?.trim(),
        timestamp: new Date().toISOString(),
      };

      logger.info(
        `Git pull job ${job.id} ${isSuccessful ? "completed successfully" : "completed with issues"} for ${domainName}`
      );

      await this.updateJobStatus(job.id, "completed", result);
      return result;
    } catch (error) {
      logger.error(`Git pull job ${job.id} failed for domain ${domainName}:`, error);

      const result = {
        domainName,
        siteUser,
        sitePath,
        status: "failed",
        executionTime: Date.now() - startTime,
        errorMessage: error.message || "Unknown error occurred during git pull",
        timestamp: new Date().toISOString(),
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
        case "setup_laravel_step":
          result = await this.processSetupStepJob(job);
          break;
        case "git_pull":
          result = await this.processGitPullJob(job);
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
