const Joi = require('joi');

const schemas = {
  // Cloudflare schemas
  updateIps: Joi.object({
    // No parameters needed for updating IPs
  }),

  // CloudPanel Basic Auth schemas
  enableBasicAuth: Joi.object({
    userName: Joi.string().required(),
    password: Joi.string().min(6).required()
  }),

  // Database schemas
  addDatabase: Joi.object({
    domainName: Joi.string().required(),
    databaseName: Joi.string().required(),
    databaseUserName: Joi.string().required(),
    databaseUserPassword: Joi.string().min(6).required()
  }),

  exportDatabase: Joi.object({
    databaseName: Joi.string().required(),
    file: Joi.string().required()
  }),

  importDatabase: Joi.object({
    databaseName: Joi.string().required(),
    file: Joi.string().required()
  }),

  // Let's Encrypt schemas
  installLetsEncryptCertificate: Joi.object({
    domainName: Joi.string().required(),
    subjectAlternativeName: Joi.string().optional()
  }),

  // Site schemas
  addNodejsSite: Joi.object({
    domainName: Joi.string().required(),
    nodejsVersion: Joi.number().valid(12, 14, 16, 18, 20, 22).required(),
    appPort: Joi.number().min(1024).max(65535).required(),
    siteUser: Joi.string().required(),
    siteUserPassword: Joi.string().min(6).required()
  }),

  addPhpSite: Joi.object({
    domainName: Joi.string().required(),
    phpVersion: Joi.string().valid('7.4', '8.0', '8.1', '8.2', '8.3', '8.4').required(),
    vhostTemplate: Joi.string().required(),
    siteUser: Joi.string().required(),
    siteUserPassword: Joi.string().min(6).required()
  }),

  addPythonSite: Joi.object({
    domainName: Joi.string().required(),
    pythonVersion: Joi.string().valid('3.8', '3.9', '3.10', '3.11', '3.12').required(),
    appPort: Joi.number().min(1024).max(65535).required(),
    siteUser: Joi.string().required(),
    siteUserPassword: Joi.string().min(6).required()
  }),

  addStaticSite: Joi.object({
    domainName: Joi.string().required(),
    siteUser: Joi.string().required(),
    siteUserPassword: Joi.string().min(6).required()
  }),

  addReverseProxy: Joi.object({
    domainName: Joi.string().required(),
    reverseProxyUrl: Joi.string().uri().required(),
    siteUser: Joi.string().required(),
    siteUserPassword: Joi.string().min(6).required()
  }),

  installSiteCertificate: Joi.object({
    domainName: Joi.string().required(),
    privateKey: Joi.string().required(),
    certificate: Joi.string().required(),
    certificateChain: Joi.string().optional()
  }),

  deleteSite: Joi.object({
    domainName: Joi.string().required(),
    force: Joi.boolean().default(false)
  }),

  // User schemas
  addUser: Joi.object({
    userName: Joi.string().required(),
    email: Joi.string().email().required(),
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('admin', 'site-manager', 'user').required(),
    sites: Joi.string().optional(), // comma-separated list for 'user' role
    timezone: Joi.string().default('UTC'),
    status: Joi.string().valid('0', '1').default('1')
  }),

  deleteUser: Joi.object({
    userName: Joi.string().required(),
    force: Joi.boolean().default(true)
  }),

  resetPassword: Joi.object({
    userName: Joi.string().required(),
    password: Joi.string().min(6).required()
  }),

  disableMfa: Joi.object({
    userName: Joi.string().required()
  }),

  // Vhost Template schemas
  addVhostTemplate: Joi.object({
    name: Joi.string().required(),
    file: Joi.string().required() // can be file path or URL
  }),

  deleteVhostTemplate: Joi.object({
    name: Joi.string().required(),
    force: Joi.boolean().default(true)
  }),

  viewVhostTemplate: Joi.object({
    name: Joi.string().required()
  }),

  // Setup schemas
  setupLaravel: Joi.object({
    domainName: Joi.string().required(),
    phpVersion: Joi.string().valid('7.4', '8.0', '8.1', '8.2', '8.3', '8.4').default('8.3'),
    vhostTemplate: Joi.string().default('Laravel 12'),
    siteUser: Joi.string().required(),
    siteUserPassword: Joi.string().min(6).required(),
    databaseName: Joi.string().required(),
    databaseUserName: Joi.string().required(),
    databaseUserPassword: Joi.string().min(6).required(),
    repositoryUrl: Joi.string().optional(),
    runMigrations: Joi.boolean().default(true),
    runSeeders: Joi.boolean().default(true),
    optimizeCache: Joi.boolean().default(true),
    installComposer: Joi.boolean().default(true)
  })
};

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

module.exports = {
  schemas,
  validate
};
