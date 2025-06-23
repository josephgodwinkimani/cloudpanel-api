require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const path = require("path");
const logger = require("./utils/logger");
const SessionStore = require("./utils/sessionStore");
const queueManager = require("./services/queueManager");
const {
  authenticateApiKey,
  createRateLimit,
  requestLogger,
  errorHandler,
} = require("./middleware");
const { 
  requestLoggingMiddleware, 
  authLoggingMiddleware, 
  errorLoggingMiddleware 
} = require("./middleware/logging");

// Import routes
const cloudflareRoutes = require("./routes/cloudflare");
const cloudpanelRoutes = require("./routes/cloudpanel");
const databaseRoutes = require("./routes/database");
const letsencryptRoutes = require("./routes/letsencrypt");
const siteRoutes = require("./routes/site");
const userRoutes = require("./routes/user");
const vhostTemplateRoutes = require("./routes/vhostTemplate");
const authRoutes = require("./routes/auth");
const docsRoutes = require("./routes/docs");
const setupRoutes = require("./routes/setup");
const sitesRoutes = require("./routes/sites");
const logsRoutes = require("./routes/logs");

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize session store
const sessionStore = new SessionStore();

// Set view engine and views directory
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Initialize session store and configure sessions
async function initializeApp() {
  await sessionStore.initialize();

  // Session configuration with proper store
  app.use(session(sessionStore.getSessionConfig()));

  // Security middleware with environment-based CSP configuration
  const cspConfig = {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://cdn.tailwindcss.com",
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      formAction: ["'self'"], // Allow form submissions to same origin
      connectSrc: ["'self'"], // Allow AJAX requests to same origin
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  };

  // Configure helmet for HTTP deployment - always disable HTTPS-only headers
  const helmetConfig = {
    contentSecurityPolicy: false,
    // Always disable COOP/COEP headers to avoid browser warnings over HTTP
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Keep basic security headers that work over HTTP
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
    // Never enable HSTS for HTTP deployment
    hsts: false,
    // Disable other HTTPS-only features
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true
  };

  app.use(helmet(helmetConfig));
  
  // Custom middleware for HTTP deployment
  app.use((req, res, next) => {
    // Always configure for HTTP deployment
    // Set basic security headers that work over HTTP
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Never set HTTPS-only headers for HTTP deployment
    // No HSTS, no secure transport security
    
    next();
  });

  app.use(cors());

  // Enhanced request logging with detailed tracking
  app.use(requestLoggingMiddleware);
  
  // Original request logging (keeping for compatibility)
  app.use(requestLogger);

  // Rate limiting
  const limiter = createRateLimit(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  );
  app.use("/api/", limiter);

  // Body parsing middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Authentication logging middleware
  app.use("/api/", authLoggingMiddleware);

  // Special routes without API key authentication (must be before API auth middleware)
  // Retry endpoint for frontend use - no API key required
  app.use("/api/setup", setupRoutes);

  // API authentication (optional in development)
  app.use("/api/", authenticateApiKey);

  // API routes (these need session middleware)
  app.use("/api/cloudflare", cloudflareRoutes);
  app.use("/api/cloudpanel", cloudpanelRoutes);
  app.use("/api/database", databaseRoutes);
  app.use("/api/letsencrypt", letsencryptRoutes);
  app.use("/api/site", siteRoutes);
  app.use("/api/user", userRoutes);
  app.use("/api/vhost-templates", vhostTemplateRoutes);

  // Authentication and documentation routes
  app.use("/auth", authRoutes);
  app.use("/docs", docsRoutes);
  app.use("/sites", sitesRoutes);
  app.use("/logs", logsRoutes);
  app.use("/setup", setupRoutes);

  // Enhanced error logging middleware (must be before error handler)
  app.use(errorLoggingMiddleware);

  // Redirect root to login
  app.get("/", (req, res) => {
    if (req.session && req.session.user) {
      res.redirect("/docs");
    } else {
      res.redirect("/auth/login");
    }
  });

  // Error handling middleware
  app.use(errorHandler);

  // 404 handler
  app.use("*", (req, res) => {
    // Skip logging for frontend routes (except login/logout)
    const isFrontendRoute = (req.originalUrl.startsWith('/sites') || 
                            req.originalUrl.startsWith('/docs') || 
                            req.originalUrl.startsWith('/logs')) &&
                           !req.originalUrl.includes('/login') && 
                           !req.originalUrl.includes('/logout');
    
    if (!isFrontendRoute) {
      logger.warning('request', `404 - Route not found: ${req.method} ${req.originalUrl}`, {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId
      });
    }
    
    res.status(404).json({ error: "Endpoint not found" });
  });
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "CloudPanel API Node.js",
    version: process.env.npm_package_version || "1.0.1",
  });
});

// Monitoring endpoint for server statistics
app.get("/api/monitor", (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      human: `${Math.floor(uptime / 3600)}h ${Math.floor(
        (uptime % 3600) / 60
      )}m ${Math.floor(uptime % 60)}s`,
    },
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
    },
    process: {
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || "development",
    },
  });
});

// API documentation endpoint
app.get("/api/docs", (req, res) => {
  res.json({
    name: "CloudPanel API",
    version: require("../package.json").version,
    description: "REST API wrapper for CloudPanel CLI commands",
    endpoints: {
      cloudflare: {
        "POST /api/cloudflare/update-ips": "Update Cloudflare IPs",
      },
      cloudpanel: {
        "POST /api/cloudpanel/basic-auth/enable": "Enable basic authentication",
        "DELETE /api/cloudpanel/basic-auth/disable":
          "Disable basic authentication",
      },
      database: {
        "GET /api/database/master-credentials": "Show master credentials",
        "POST /api/database/add": "Add database",
        "POST /api/database/export": "Export database",
        "POST /api/database/import": "Import database",
      },
      letsencrypt: {
        "POST /api/letsencrypt/install-certificate":
          "Install Let's Encrypt certificate",
      },
      site: {
        "POST /api/site/add/nodejs": "Add Node.js site",
        "POST /api/site/add/php": "Add PHP site",
        "POST /api/site/add/python": "Add Python site",
        "POST /api/site/add/static": "Add static site",
        "POST /api/site/add/reverse-proxy": "Add reverse proxy",
        "POST /api/site/install-certificate": "Install custom certificate",
        "DELETE /api/site/delete": "Delete site",
      },
      user: {
        "POST /api/user/add": "Add user",
        "DELETE /api/user/delete": "Delete user",
        "GET /api/user/list": "List users",
        "POST /api/user/reset-password": "Reset password",
        "POST /api/user/disable-mfa": "Disable 2FA",
      },
      vhostTemplates: {
        "POST /api/vhost-templates/import": "Import templates",
        "GET /api/vhost-templates/list": "List templates",
        "POST /api/vhost-templates/add": "Add template",
        "DELETE /api/vhost-templates/delete": "Delete template",
        "GET /api/vhost-templates/view/:name": "View template",
      },
      setup: {
        "POST /api/setup": "Setup Laravel site with PHP and database",
      },
    },
  });
});

// Export app for testing
module.exports = app;

// Graceful shutdown handler
process.on("SIGINT", async () => {
  logger.info('Shutting down application...');
  queueManager.stopWorker();
  await sessionStore.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info('Shutting down application...');
  queueManager.stopWorker();
  await sessionStore.close();
  process.exit(0);
});

// Only start server if this file is run directly
if (require.main === module) {
  initializeApp()
    .then(() => {
      // Initialize queue manager
      logger.info('Initializing queue manager...');
      queueManager.initialize();
      
      app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
        logger.info('Queue management available at:');
        logger.info('  - POST /api/setup/queue/start');
        logger.info('  - POST /api/setup/queue/stop');
        logger.info('  - POST /api/setup/queue/restart');
        logger.info('  - GET /api/setup/queue/status');
      });
    })
    .catch((error) => {
      logger.error('Failed to start application:', error);
      process.exit(1);
    });
}
