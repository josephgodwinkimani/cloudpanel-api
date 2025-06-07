const { exec } = require('child_process');
const logger = require('../utils/logger');
const ResponseUtils = require('../utils/responseUtils');

class CloudPanelService {
  constructor() {
    this.clpctlPath = process.env.CLPCTL_PATH || 'clpctl'; // Configurable path
  }

  /**
   * Execute a CloudPanel CLI command
   * @param {string} command - The clpctl command to execute
   * @param {Array} args - Array of command arguments
   * @returns {Promise} - Promise that resolves with command output
   */
  async executeCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const fullCommand = `${this.clpctlPath} ${command} ${args.join(' ')}`;
      
      logger.info(`Executing command: ${fullCommand}`);
      
      exec(fullCommand, { timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Command failed: ${fullCommand}`, error);
          reject({
            success: false,
            error: ResponseUtils.formatError({ error: error.message, stderr }),
            command: fullCommand,
            exitCode: error.code
          });
        } else {
          logger.info(`Command succeeded: ${fullCommand}`);
          const parsedOutput = ResponseUtils.parseCliOutput(stdout);
          resolve(parsedOutput);
        }
      });
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
    return this.executeCommand('cloudflare:update:ips');
  }

  // CloudPanel methods
  async enableBasicAuth(userName, password) {
    const args = this.buildArgs({ userName, password });
    return this.executeCommand('cloudpanel:enable:basic-auth', args);
  }

  async disableBasicAuth() {
    return this.executeCommand('cloudpanel:disable:basic-auth');
  }

  // Database methods
  async showMasterCredentials() {
    return this.executeCommand('db:show:master-credentials');
  }

  async addDatabase(domainName, databaseName, databaseUserName, databaseUserPassword) {
    const args = this.buildArgs({
      domainName,
      databaseName,
      databaseUserName,
      databaseUserPassword
    });
    return this.executeCommand('db:add', args);
  }

  async exportDatabase(databaseName, file) {
    const args = this.buildArgs({ databaseName, file });
    return this.executeCommand('db:export', args);
  }

  async importDatabase(databaseName, file) {
    const args = this.buildArgs({ databaseName, file });
    return this.executeCommand('db:import', args);
  }

  // Let's Encrypt methods
  async installLetsEncryptCertificate(domainName, subjectAlternativeName = null) {
    const params = { domainName };
    if (subjectAlternativeName) {
      params.subjectAlternativeName = subjectAlternativeName;
    }
    const args = this.buildArgs(params);
    return this.executeCommand('lets-encrypt:install:certificate', args);
  }

  // Site methods
  async addNodejsSite(domainName, nodejsVersion, appPort, siteUser, siteUserPassword) {
    const args = this.buildArgs({
      domainName,
      nodejsVersion,
      appPort,
      siteUser,
      siteUserPassword
    });
    return this.executeCommand('site:add:nodejs', args);
  }

  async addPhpSite(domainName, phpVersion, vhostTemplate, siteUser, siteUserPassword) {
    const args = this.buildArgs({
      domainName,
      phpVersion,
      vhostTemplate,
      siteUser,
      siteUserPassword
    });
    return this.executeCommand('site:add:php', args);
  }

  async addPythonSite(domainName, pythonVersion, appPort, siteUser, siteUserPassword) {
    const args = this.buildArgs({
      domainName,
      pythonVersion,
      appPort,
      siteUser,
      siteUserPassword
    });
    return this.executeCommand('site:add:python', args);
  }

  async addStaticSite(domainName, siteUser, siteUserPassword) {
    const args = this.buildArgs({
      domainName,
      siteUser,
      siteUserPassword
    });
    return this.executeCommand('site:add:static', args);
  }

  async addReverseProxy(domainName, reverseProxyUrl, siteUser, siteUserPassword) {
    const args = this.buildArgs({
      domainName,
      reverseProxyUrl,
      siteUser,
      siteUserPassword
    });
    return this.executeCommand('site:add:reverse-proxy', args);
  }

  async installSiteCertificate(domainName, privateKey, certificate, certificateChain = null) {
    const params = { domainName, privateKey, certificate };
    if (certificateChain) {
      params.certificateChain = certificateChain;
    }
    const args = this.buildArgs(params);
    return this.executeCommand('site:install:certificate', args);
  }

  async deleteSite(domainName, force = false) {
    const args = this.buildArgs({ domainName });
    if (force) {
      args.push('--force');
    }
    return this.executeCommand('site:delete', args);
  }

  // User methods
  async addUser(userData) {
    const args = this.buildArgs(userData);
    return this.executeCommand('user:add', args);
  }

  async deleteUser(userName) {
    const args = this.buildArgs({ userName });
    return this.executeCommand('user:delete', args);
  }

  async listUsers() {
    return this.executeCommand('user:list');
  }

  async resetPassword(userName, password) {
    const args = this.buildArgs({ userName, password });
    return this.executeCommand('user:reset:password', args);
  }

  async disableMfa(userName) {
    const args = this.buildArgs({ userName });
    return this.executeCommand('user:disable:mfa', args);
  }

  // Vhost Template methods
  async importVhostTemplates() {
    return this.executeCommand('vhost-templates:import');
  }

  async listVhostTemplates() {
    return this.executeCommand('vhost-templates:list');
  }

  async addVhostTemplate(name, file) {
    const args = this.buildArgs({ name, file });
    return this.executeCommand('vhost-template:add', args);
  }

  async deleteVhostTemplate(name) {
    const args = this.buildArgs({ name });
    return this.executeCommand('vhost-template:delete', args);
  }

  async viewVhostTemplate(name) {
    const args = this.buildArgs({ name });
    return this.executeCommand('vhost-template:view', args);
  }
}

module.exports = new CloudPanelService();
