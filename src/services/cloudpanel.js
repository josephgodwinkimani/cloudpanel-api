const { exec } = require("child_process");
const logger = require("../utils/logger");
const ResponseUtils = require("../utils/responseUtils");

class CloudPanelService {
  constructor() {
    this.clpctlPath = process.env.CLPCTL_PATH || "clpctl"; // Configurable path
  }

  /**
   * Execute a CloudPanel CLI command
   * @param {string} command - The clpctl command to execute
   * @param {Array} args - Array of command arguments
   * @param {Object} options - Additional options for command execution
   * @returns {Promise} - Promise that resolves with command output
   */
  async executeCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const fullCommand = `${this.clpctlPath} ${command} ${args.join(" ")}`;

      logger.info(`Executing command: ${fullCommand}`);

      // For commands that might require confirmation, we can provide input
      const execOptions = {
        timeout: 60000,
        ...options,
      };

      const childProcess = exec(
        fullCommand,
        execOptions,
        (error, stdout, stderr) => {
          if (error) {
            logger.error(`Command failed: ${fullCommand}`, error);
            reject({
              success: false,
              error: ResponseUtils.formatError({
                error: error.message,
                stderr,
              }),
              command: fullCommand,
              exitCode: error.code,
            });
          } else {
            logger.info(`Command succeeded: ${fullCommand}`);
            const parsedOutput = ResponseUtils.parseCliOutput(stdout);
            resolve(parsedOutput);
          }
        }
      );

      // If input is provided for interactive commands, send it
      if (options.input) {
        childProcess.stdin.write(options.input);
        childProcess.stdin.end();
      }
    });
  }

  /**
   * Build command arguments from object
   * @param {Object} params - Parameters object
   * @returns {Array} - Array of formatted command arguments
   */
  buildArgs(params) {
    const args = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        args.push(`--${key}=${value}`);
      }
    }
    return args;
  }

  // Cloudflare methods
  async updateCloudflareIps() {
    return this.executeCommand("cloudflare:update:ips");
  }

  // CloudPanel methods
  async enableBasicAuth(userName, password) {
    const args = this.buildArgs({ userName, password });
    return this.executeCommand("cloudpanel:enable:basic-auth", args);
  }

  async disableBasicAuth() {
    return this.executeCommand("cloudpanel:disable:basic-auth");
  }

  // Database methods
  async showMasterCredentials() {
    return this.executeCommand("db:show:master-credentials");
  }

  async addDatabase(
    domainName,
    databaseName,
    databaseUserName,
    databaseUserPassword
  ) {
    const args = this.buildArgs({
      domainName,
      databaseName,
      databaseUserName,
      databaseUserPassword,
    });
    return this.executeCommand("db:add", args);
  }

  async exportDatabase(databaseName, file) {
    const args = this.buildArgs({ databaseName, file });
    return this.executeCommand("db:export", args);
  }

  async importDatabase(databaseName, file) {
    const args = this.buildArgs({ databaseName, file });
    return this.executeCommand("db:import", args);
  }

  // Let's Encrypt methods
  async installLetsEncryptCertificate(
    domainName,
    subjectAlternativeName = null
  ) {
    const params = { domainName };
    if (subjectAlternativeName) {
      params.subjectAlternativeName = subjectAlternativeName;
    }
    const args = this.buildArgs(params);
    return this.executeCommand("lets-encrypt:install:certificate", args);
  }

  // Site methods
  async addNodejsSite(
    domainName,
    nodejsVersion,
    appPort,
    siteUser,
    siteUserPassword
  ) {
    const args = this.buildArgs({
      domainName,
      nodejsVersion,
      appPort,
      siteUser,
      siteUserPassword,
    });
    return this.executeCommand("site:add:nodejs", args);
  }

  async addPhpSite(
    domainName,
    phpVersion,
    vhostTemplate,
    siteUser,
    siteUserPassword
  ) {
    const args = this.buildArgs({
      domainName,
      phpVersion,
      vhostTemplate,
      siteUser,
      siteUserPassword,
    });
    return this.executeCommand("site:add:php", args);
  }

  async addPythonSite(
    domainName,
    pythonVersion,
    appPort,
    siteUser,
    siteUserPassword
  ) {
    const args = this.buildArgs({
      domainName,
      pythonVersion,
      appPort,
      siteUser,
      siteUserPassword,
    });
    return this.executeCommand("site:add:python", args);
  }

  async addStaticSite(domainName, siteUser, siteUserPassword) {
    const args = this.buildArgs({
      domainName,
      siteUser,
      siteUserPassword,
    });
    return this.executeCommand("site:add:static", args);
  }

  async addReverseProxy(
    domainName,
    reverseProxyUrl,
    siteUser,
    siteUserPassword
  ) {
    const args = this.buildArgs({
      domainName,
      reverseProxyUrl,
      siteUser,
      siteUserPassword,
    });
    return this.executeCommand("site:add:reverse-proxy", args);
  }

  async installSiteCertificate(
    domainName,
    privateKey,
    certificate,
    certificateChain = null
  ) {
    const params = { domainName, privateKey, certificate };
    if (certificateChain) {
      params.certificateChain = certificateChain;
    }
    const args = this.buildArgs(params);
    return this.executeCommand("site:install:certificate", args);
  }

  async deleteSite(domainName, force = true) {
    const args = this.buildArgs({ domainName });

    // Always use force by default to avoid hanging on confirmation prompt
    // In an API context, we don't want interactive prompts
    if (force) {
      args.push("--force");
      return this.executeCommand("site:delete", args);
    } else {
      // If force is explicitly set to false, provide "yes" as input for confirmation
      return this.executeCommand("site:delete", args, { input: "yes\n" });
    }
  }

  // User methods
  async addUser(userData) {
    const args = this.buildArgs(userData);
    return this.executeCommand("user:add", args);
  }

  async deleteUser(userName, force = true) {
    const args = this.buildArgs({ userName });

    // Always use force by default for API consistency
    // Note: Check if user:delete command supports --force flag
    if (force) {
      // Some delete commands may not support --force, so we'll try with input first
      return this.executeCommand("user:delete", args, { input: "yes\n" });
    } else {
      return this.executeCommand("user:delete", args, { input: "yes\n" });
    }
  }

  async listUsers() {
    return this.executeCommand("user:list");
  }

  async resetPassword(userName, password) {
    const args = this.buildArgs({ userName, password });
    return this.executeCommand("user:reset:password", args);
  }

  async disableMfa(userName) {
    const args = this.buildArgs({ userName });
    return this.executeCommand("user:disable:mfa", args);
  }

  // Vhost Template methods
  async importVhostTemplates() {
    return this.executeCommand("vhost-templates:import");
  }

  async listVhostTemplates() {
    return this.executeCommand("vhost-templates:list");
  }

  async addVhostTemplate(name, file) {
    const args = this.buildArgs({ name, file });
    return this.executeCommand("vhost-template:add", args);
  }

  async deleteVhostTemplate(name, force = true) {
    const args = this.buildArgs({ name });

    // Provide confirmation input to avoid hanging on prompts
    if (force) {
      return this.executeCommand("vhost-template:delete", args, {
        input: "yes\n",
      });
    } else {
      return this.executeCommand("vhost-template:delete", args, {
        input: "yes\n",
      });
    }
  }

  async viewVhostTemplate(name) {
    const args = this.buildArgs({ name });
    return this.executeCommand("vhost-template:view", args);
  }

  async copySshKeysToUser(siteUser) {
    // Create SSH directory and copy keys from root to site user
    const commands = [
      `sudo mkdir -p /home/${siteUser}/.ssh`,
      `sudo cp /root/.ssh/id_ed25519 /home/${siteUser}/.ssh/id_ed25519`,
      `sudo cp /root/.ssh/id_ed25519.pub /home/${siteUser}/.ssh/id_ed25519.pub`,
      `sudo chown -R ${siteUser}:${siteUser} /home/${siteUser}/.ssh`,
      `sudo chmod 700 /home/${siteUser}/.ssh`,
      `sudo chmod 600 /home/${siteUser}/.ssh/id_ed25519`,
      `sudo chmod 644 /home/${siteUser}/.ssh/id_ed25519.pub`,
    ];

    const combinedCommand = commands.join(" && ");

    return new Promise((resolve, reject) => {
      exec(combinedCommand, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          logger.error(`SSH key copy failed for user ${siteUser}:`, error);
          reject({
            success: false,
            error: ResponseUtils.formatError({
              error: error.message,
              stderr,
            }),
            command: combinedCommand,
            exitCode: error.code,
          });
        } else {
          logger.info(`SSH keys successfully copied to user ${siteUser}`);
          resolve({
            success: true,
            message: `SSH keys copied to user ${siteUser}`,
            output: stdout,
          });
        }
      });
    });
  }

  /**
   * Clone a repository into the specified domain's htdocs directory
   * @param {string} domainName - The domain name for the site
   * @param {string} repositoryUrl - The URL of the repository to clone (ssh clone only)
   * @param {string} siteUser - The user under which to run the command
   * @returns {Promise} - Promise that resolves with command output
   */
  async cloneRepository(domainName, repositoryUrl, siteUser) {
    // rm -rf .[^.]* 2>/dev/null
    
    const sshCommand = 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null';
    const command = `su - ${siteUser} -c 'cd /home/${siteUser}/htdocs/${domainName} && GIT_SSH_COMMAND="${sshCommand}" git clone ${repositoryUrl} .'`;
    // const commandExample = `su - bill -c 'cd /home/bill/htdocs/bill.aksess.my.id && GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" git clone git@github.com:iamfafakkk/segamas.git .'`;

    return new Promise((resolve, reject) => {
      exec(command, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Repository clone failed for ${domainName}:`, error);
          reject({
            success: false,
            error: ResponseUtils.formatError({
              error: error.message,
              stderr,
            }),
            command: command,
            exitCode: error.code,
          });
        } else {
          logger.info(`Repository cloned successfully for ${domainName}`);
          resolve({
            success: true,
            message: `Repository cloned successfully to ${domainName}`,
            output: stdout,
            command: command,
          });
        }
      });
    });
  }

  /**
   * Configure Laravel .env file with database and app settings
   * @param {string} domainName - The domain name for the site
   * @param {string} siteUser - The site user
   * @param {Object} envSettings - Environment settings object
   * @returns {Promise} - Promise that resolves with command output
   */
  async configureLaravelEnv(domainName, siteUser, envSettings) {
    const {
      dbHost = "localhost",
      dbDatabase,
      dbUsername,
      dbPassword,
      appUrl = `https://${domainName}`,
      appEnv = "production",
      appDebug = "false",
    } = envSettings;

    // Create the sed commands to update .env file
    const envUpdates = [
      `s/^APP_ENV=.*/APP_ENV=${appEnv}/`,
      `s/^APP_DEBUG=.*/APP_DEBUG=${appDebug}/`,
      `s/^APP_URL=.*/APP_URL=${appUrl}/`,
      `s/^DB_HOST=.*/DB_HOST=${dbHost}/`,
      `s/^DB_DATABASE=.*/DB_DATABASE=${dbDatabase}/`,
      `s/^DB_USERNAME=.*/DB_USERNAME=${dbUsername}/`,
      `s/^DB_PASSWORD=.*/DB_PASSWORD=${dbPassword}/`,
    ];

    const sedCommand = envUpdates
      .map((update) => `sed -i '${update}'`)
      .join(" && ");
    const command = `sudo -u ${siteUser} bash -c 'cd /home/${siteUser}/htdocs/${domainName} && cp .env.example .env && ${sedCommand} .env && php artisan key:generate'`;

    return new Promise((resolve, reject) => {
      exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
          logger.error(
            `Laravel .env configuration failed for ${domainName}:`,
            error
          );
          reject({
            success: false,
            error: ResponseUtils.formatError({
              error: error.message,
              stderr,
            }),
            command: command,
            exitCode: error.code,
          });
        } else {
          logger.info(`Laravel .env configured successfully for ${domainName}`);
          resolve({
            success: true,
            message: `Laravel .env configured successfully for ${domainName}`,
            output: stdout,
            command: command,
          });
        }
      });
    });
  }

  /**
   * Run Laravel post-setup commands (migrations, cache, etc.)
   * @param {string} domainName - The domain name for the site
   * @param {string} siteUser - The site user
   * @param {Object} options - Options for Laravel setup
   * @returns {Promise} - Promise that resolves with command output
   */
  async runLaravelSetup(domainName, siteUser, options = {}) {
    const {
      runMigrations = true,
      runSeeders = false,
      optimizeCache = true,
      installComposer = true,
    } = options;

    const commands = [];

    // Base command prefix
    const baseCommand = `sudo -u ${siteUser} bash -c 'cd /home/${siteUser}/htdocs/${domainName}`;
    // const baseCommandExample = `sudo -u bill bash -c 'cd /home/bill/htdocs/bill.aksess.my.id && composer install --optimize-autoloader --no-dev && php artisan migrate --force && php artisan db:seed --force && php artisan config:cache && php artisan route:cache && php artisan view:cache'`;

    // Install composer dependencies
    if (installComposer) {
      commands.push(
        `${baseCommand} && composer install --optimize-autoloader --no-dev'`
      );
    }

    // Run migrations
    if (runMigrations) {
      commands.push(`${baseCommand} && php artisan migrate --force'`);
    }

    // Run seeders
    if (runSeeders) {
      commands.push(`${baseCommand} && php artisan db:seed --force'`);
    }

    // Optimize cache
    if (optimizeCache) {
      commands.push(
        `${baseCommand} && php artisan config:cache && php artisan route:cache && php artisan view:cache'`
      );
    }

    const fullCommand = commands.join(" && ");

    return new Promise((resolve, reject) => {
      exec(fullCommand, { timeout: 180000 }, (error, stdout, stderr) => {
        if (error) {
          logger.error(
            `Laravel setup commands failed for ${domainName}:`,
            error
          );
          reject({
            success: false,
            error: ResponseUtils.formatError({
              error: error.message,
              stderr,
            }),
            command: fullCommand,
            exitCode: error.code,
          });
        } else {
          logger.info(`Laravel setup completed successfully for ${domainName}`);
          resolve({
            success: true,
            message: `Laravel setup completed successfully for ${domainName}`,
            output: stdout,
            command: fullCommand,
          });
        }
      });
    });
  }
}

module.exports = new CloudPanelService();
