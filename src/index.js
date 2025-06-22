require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const path = require("path");
const logger = require("./utils/logger");
const SessionStore = require("./utils/sessionStore");
const {
  authenticateApiKey,
  createRateLimit,
  requestLogger,
  errorHandler,
} = require("./middleware");

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

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
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
        },
      },
    })
  );
  app.use(cors());

  // Request logging
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

  // API authentication (optional in development)
  app.use("/api/", authenticateApiKey);

  // Logging middleware
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - ${req.ip}`);
    next();
  });

  // API routes (these need session middleware)
  app.use("/api/cloudflare", cloudflareRoutes);
  app.use("/api/cloudpanel", cloudpanelRoutes);
  app.use("/api/database", databaseRoutes);
  app.use("/api/letsencrypt", letsencryptRoutes);
  app.use("/api/site", siteRoutes);
  app.use("/api/user", userRoutes);
  app.use("/api/vhost-templates", vhostTemplateRoutes);
  app.use("/api/setup", setupRoutes);

  // Authentication and documentation routes
  app.use("/auth", authRoutes);
  app.use("/docs", docsRoutes);
  app.use("/sites", sitesRoutes);
  app.use("/logs", logsRoutes);
  app.use("/setup", setupRoutes);

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
  logger.info("Received SIGINT, shutting down gracefully...");
  await sessionStore.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully...");
  await sessionStore.close();
  process.exit(0);
});

// Only start server if this file is run directly
if (require.main === module) {
  initializeApp()
    .then(() => {
      app.listen(PORT, () => {
        logger.info(`CloudPanel API server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
      });
    })
    .catch((error) => {
      logger.error("Failed to initialize application:", error);
      process.exit(1);
    });
}
