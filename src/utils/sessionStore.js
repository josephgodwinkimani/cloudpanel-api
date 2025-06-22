const session = require("express-session");
const redis = require("redis");
const RedisStore = require("connect-redis").default;
const SQLiteStore = require("connect-sqlite3")(session);
const path = require("path");
const fs = require("fs");
const logger = require("./logger");

class SessionStore {
  constructor() {
    this.store = null;
    this.redisClient = null;
  }

  async initialize() {
    try {
      // Check if Redis is available
      if (process.env.REDIS_URL || process.env.REDIS_HOST) {
        await this.initializeRedisStore();
      } else {
        this.initializeSQLiteStore();
      }
    } catch (error) {
      logger.warn(
        "Failed to initialize Redis store, falling back to SQLite store:",
        error.message
      );
      this.initializeSQLiteStore();
    }
  }

  async initializeRedisStore() {
    // Create Redis client
    const redisConfig = {
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379,
      },
    };

    // Add password if provided
    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }

    // Use Redis URL if provided (takes precedence)
    if (process.env.REDIS_URL) {
      this.redisClient = redis.createClient({
        url: process.env.REDIS_URL,
      });
    } else {
      this.redisClient = redis.createClient(redisConfig);
    }

    // Handle Redis connection events
    this.redisClient.on("error", (err) => {
      logger.error("Redis client error:", err);
    });

    this.redisClient.on("connect", () => {
      logger.info("Connected to Redis server");
    });

    this.redisClient.on("ready", () => {
      logger.info("Redis client ready");
    });

    this.redisClient.on("end", () => {
      logger.warn("Redis connection ended");
    });

    // Connect to Redis
    await this.redisClient.connect();

    // Create Redis store
    this.store = new RedisStore({
      client: this.redisClient,
      prefix: "cloudpanel:sess:",
      ttl: 24 * 60 * 60, // 24 hours in seconds
    });

    logger.info("Redis session store initialized successfully");
  }

  initializeSQLiteStore() {
    // Ensure sessions directory exists
    const sessionsDir = path.join(process.cwd(), "sessions");
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    // Create SQLite store
    this.store = new SQLiteStore({
      db: "sessions.db",
      dir: sessionsDir,
      table: "sessions",
      concurrentDB: true,
    });

    logger.info("SQLite session store initialized successfully");
    logger.info(
      `Session database location: ${path.join(sessionsDir, "sessions.db")}`
    );
  }

  initializeMemoryStore() {
    // Use memory store as fallback (deprecated)
    this.store = new session.MemoryStore();

    if (process.env.NODE_ENV === "production") {
      logger.warn(
        "WARNING: Using MemoryStore in production is not recommended. Consider setting up Redis or use SQLite (default)."
      );
      logger.warn(
        "To use Redis, set REDIS_URL or REDIS_HOST environment variable."
      );
    } else {
      logger.info("Using memory store for sessions (development mode)");
    }
  }

  getSessionConfig() {
    return {
      store: this.store,
      secret:
        process.env.SESSION_SECRET ||
        "cloudpanel-api-secret-key-change-in-production",
      resave: false,
      saveUninitialized: false,
      rolling: true, // Reset expiry on activity
      cookie: {
        secure:
          process.env.NODE_ENV === "production" &&
          !process.env.DISABLE_SECURE_COOKIES &&
          process.env.FORCE_HTTP !== "true",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: "lax",
      },
    };
  }

  async close() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        logger.info("Redis connection closed");
      } catch (error) {
        logger.error("Error closing Redis connection:", error);
      }
    }
  }
}

module.exports = SessionStore;
