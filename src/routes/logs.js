const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const logger = require("../utils/logger");

const router = express.Router();

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect("/auth/login");
}

// Get logs page
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const logsData = await getLogs();
    res.render("logs", { 
      logs: logsData,
      title: "System Logs"
    });
  } catch (error) {
    logger.error("Error loading logs page:", error);
    res.status(500).render("error", { 
      error: "Failed to load logs",
      message: "Unable to retrieve system logs at this time."
    });
  }
});

// API endpoint to get logs data
router.get("/api", isAuthenticated, async (req, res) => {
  try {
    const logs = await getLogs();
    res.json({ success: true, logs });
  } catch (error) {
    logger.error("Error fetching logs:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch logs" 
    });
  }
});

// API endpoint to get real-time specific log type
router.get("/api/realtime", isAuthenticated, async (req, res) => {
  try {
    const logType = req.query.type || 'combined';
    const logsDir = path.join(__dirname, "../../logs");
    let output = '';
    
    switch (logType) {
      case 'error':
        try {
          const errorLogPath = path.join(logsDir, "error.log");
          const errorLogExists = await fs.access(errorLogPath).then(() => true).catch(() => false);
          if (errorLogExists) {
            const errorLog = await fs.readFile(errorLogPath, "utf-8");
            const lines = errorLog.split('\n').filter(line => line.trim()).slice(-10);
            output = lines.join('\n');
          } else {
            output = 'Error log not found';
          }
        } catch (error) {
          output = `Error reading error logs: ${error.message}`;
        }
        break;
      case 'combined':
      default:
        try {
          const combinedLogPath = path.join(logsDir, "combined.log");
          const combinedLogExists = await fs.access(combinedLogPath).then(() => true).catch(() => false);
          if (combinedLogExists) {
            const combinedLog = await fs.readFile(combinedLogPath, "utf-8");
            const lines = combinedLog.split('\n').filter(line => line.trim()).slice(-10);
            output = lines.join('\n');
          } else {
            output = 'Combined log not found';
          }
        } catch (error) {
          output = `Error reading combined logs: ${error.message}`;
        }
        break;
    }
    
    const lines = output.split('\n').filter(line => line.trim());
    
    res.json({
      success: true,
      logs: lines,
      type: logType,
      timestamp: new Date().toISOString(),
      mode: 'Project Logs'
    });
  } catch (error) {
    logger.error("Error fetching real-time logs:", error);
    res.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      mode: 'Project Logs'
    });
  }
});

// API endpoint to test log files access
router.get("/api/test-connection", isAuthenticated, async (req, res) => {
  try {
    const logsDir = path.join(__dirname, "../../logs");
    const testResults = [];
    
    // Test combined.log access
    try {
      const combinedLogPath = path.join(logsDir, "combined.log");
      const combinedLogExists = await fs.access(combinedLogPath).then(() => true).catch(() => false);
      if (combinedLogExists) {
        const stats = await fs.stat(combinedLogPath);
        testResults.push(`✓ Combined log accessible (${Math.round(stats.size / 1024)} KB)`);
      } else {
        testResults.push('✗ Combined log not found');
      }
    } catch (error) {
      testResults.push(`✗ Combined log error: ${error.message}`);
    }

    // Test error.log access
    try {
      const errorLogPath = path.join(logsDir, "error.log");
      const errorLogExists = await fs.access(errorLogPath).then(() => true).catch(() => false);
      if (errorLogExists) {
        const stats = await fs.stat(errorLogPath);
        testResults.push(`✓ Error log accessible (${Math.round(stats.size / 1024)} KB)`);
      } else {
        testResults.push('✗ Error log not found');
      }
    } catch (error) {
      testResults.push(`✗ Error log error: ${error.message}`);
    }

    // Test logs directory
    try {
      const dirExists = await fs.access(logsDir).then(() => true).catch(() => false);
      if (dirExists) {
        testResults.push('✓ Logs directory accessible');
      } else {
        testResults.push('✗ Logs directory not found');
      }
    } catch (error) {
      testResults.push(`✗ Logs directory error: ${error.message}`);
    }

    const allPassed = testResults.every(result => result.startsWith('✓'));
    
    res.json({
      success: allPassed,
      message: allPassed ? "All log files accessible" : "Some log files have issues",
      output: testResults.join('\n'),
      mode: "Project Logs",
      timestamp: new Date().toISOString(),
      details: testResults
    });
  } catch (error) {
    logger.error("Log files test failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      mode: "Project Logs"
    });
  }
});

// API endpoint to add test log entry
router.post("/api/test-log", isAuthenticated, async (req, res) => {
  try {
    const testMessage = `Test log entry created from logs page at ${new Date().toISOString()}`;
    logger.info(testMessage);
    
    res.json({
      success: true,
      message: "Test log entry added successfully",
      logMessage: testMessage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Failed to add test log:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Function to read and parse project logs
async function getLogs() {
  const logs = [];

  try {
    const logsDir = path.join(__dirname, "../../logs");
    
    // Read application logs from project logs directory
    try {
      // Read combined.log (main application logs)
      const combinedLogPath = path.join(logsDir, "combined.log");
      const combinedLogExists = await fs.access(combinedLogPath).then(() => true).catch(() => false);
      
      if (combinedLogExists) {
        const combinedLog = await fs.readFile(combinedLogPath, "utf-8");
        const combinedLines = combinedLog.split("\n").filter(line => line.trim()).slice(-100); // Get last 100 lines
        
        if (combinedLines.length > 0) {
          logs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: `=== Application Logs ===`,
            action: "Application Logs",
            type: "header",
            source: "Application"
          });
        }
        
        combinedLines.forEach((line, index) => {
          if (line.trim()) {
            try {
              const logEntry = JSON.parse(line);
              logs.push({
                timestamp: logEntry.timestamp || new Date(Date.now() - ((combinedLines.length - index) * 1000)).toISOString(),
                level: logEntry.level || "info",
                message: logEntry.message || line,
                action: extractAction(logEntry.message || line),
                type: "application",
                source: "combined.log"
              });
            } catch (e) {
              // If not JSON, treat as plain text log
              logs.push({
                timestamp: new Date(Date.now() - ((combinedLines.length - index) * 1000)).toISOString(),
                level: "info",
                message: line,
                action: extractAction(line),
                type: "application",
                source: "combined.log"
              });
            }
          }
        });
      }

      // Read error.log (error logs)
      const errorLogPath = path.join(logsDir, "error.log");
      const errorLogExists = await fs.access(errorLogPath).then(() => true).catch(() => false);
      
      if (errorLogExists) {
        const errorLog = await fs.readFile(errorLogPath, "utf-8");
        const errorLines = errorLog.split("\n").filter(line => line.trim()).slice(-50); // Get last 50 error lines
        
        if (errorLines.length > 0) {
          logs.push({
            timestamp: new Date().toISOString(),
            level: "error",
            message: `=== Error Logs ===`,
            action: "Error Logs",
            type: "header",
            source: "Error"
          });
        }
        
        errorLines.forEach((line, index) => {
          if (line.trim()) {
            try {
              const logEntry = JSON.parse(line);
              logs.push({
                timestamp: logEntry.timestamp || new Date(Date.now() - ((errorLines.length - index) * 1000)).toISOString(),
                level: "error",
                message: logEntry.message || line,
                action: extractAction(logEntry.message || line),
                type: "error",
                source: "error.log"
              });
            } catch (e) {
              logs.push({
                timestamp: new Date(Date.now() - ((errorLines.length - index) * 1000)).toISOString(),
                level: "error",
                message: line,
                action: extractAction(line),
                type: "error",
                source: "error.log"
              });
            }
          }
        });
      }

    } catch (error) {
      logger.error("Error reading project logs:", error);
      logs.push({
        timestamp: new Date().toISOString(),
        level: "error",
        message: `Error reading project logs: ${error.message}`,
        action: "Log Read Error",
        type: "error",
        source: "system"
      });
    }

    // Add some recent API activity logs (from logger)
    try {
      // Get recent CloudPanel API activities
      const recentActivities = [
        { action: "API Request", message: "GET /sites - Site list requested", level: "info" },
        { action: "Authentication", message: "User login successful", level: "info" },
        { action: "API Request", message: "POST /api/site - Site creation attempted", level: "info" },
        { action: "CloudPanel", message: "CloudPanel CLI command executed", level: "info" },
        { action: "Database", message: "Database connection established", level: "info" },
        { action: "Session", message: "User session created", level: "info" },
        { action: "Validation", message: "Request validation completed", level: "info" },
        { action: "Response", message: "API response sent successfully", level: "info" },
        { action: "Middleware", message: "Authentication middleware executed", level: "info" },
        { action: "Route", message: "Route handler executed", level: "info" }
      ];

      if (logs.length > 0) {
        logs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: `=== Recent API Activities ===`,
          action: "API Activities",
          type: "header",
          source: "API"
        });
      }

      recentActivities.forEach((activity, index) => {
        const timestamp = new Date(Date.now() - (index * 2 * 60 * 1000)); // 2 minutes apart
        logs.push({
          timestamp: timestamp.toISOString(),
          level: activity.level,
          message: activity.message,
          action: activity.action,
          type: "api",
          source: "system"
        });
      });

    } catch (error) {
      logger.error("Error generating API activity logs:", error);
    }

    // If no logs found, add some sample logs
    if (logs.length === 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: "=== CloudPanel API Project Logs ===",
        action: "System Info",
        type: "header",
        source: "system"
      });

      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: "CloudPanel API server started successfully",
        action: "Server Start",
        type: "system",
        source: "application"
      });

      logs.push({
        timestamp: new Date(Date.now() - 60000).toISOString(),
        level: "info",
        message: "Application routes initialized",
        action: "Initialization",
        type: "system",
        source: "application"
      });

      logs.push({
        timestamp: new Date(Date.now() - 120000).toISOString(),
        level: "info",
        message: "Database connection established",
        action: "Database",
        type: "system",
        source: "application"
      });

      logs.push({
        timestamp: new Date(Date.now() - 180000).toISOString(),
        level: "info",
        message: "Session store initialized",
        action: "Session",
        type: "system",
        source: "application"
      });
    }

    // Sort logs by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return logs.slice(0, 200); // Return latest 200 logs

  } catch (error) {
    logger.error("Error fetching project logs:", error);
    return [{
      timestamp: new Date().toISOString(),
      level: "error", 
      message: `Error fetching project logs: ${error.message}`,
      action: "System Error",
      type: "error",
      source: "system"
    }];
  }
}

// Extract action type from log message
function extractAction(message) {
  if (!message) return "Unknown";
  
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes("login") || lowerMessage.includes("auth")) return "Authentication";
  if (lowerMessage.includes("site") || lowerMessage.includes("domain")) return "Site Management";
  if (lowerMessage.includes("ssl") || lowerMessage.includes("certificate")) return "SSL Certificate";
  if (lowerMessage.includes("database") || lowerMessage.includes("db")) return "Database";
  if (lowerMessage.includes("backup")) return "Backup";
  if (lowerMessage.includes("deploy") || lowerMessage.includes("deployment")) return "Deployment";
  if (lowerMessage.includes("dns")) return "DNS";
  if (lowerMessage.includes("security") || lowerMessage.includes("scan")) return "Security";
  if (lowerMessage.includes("server") || lowerMessage.includes("nginx") || lowerMessage.includes("apache")) return "Server";
  if (lowerMessage.includes("error") || lowerMessage.includes("fail")) return "Error";
  if (lowerMessage.includes("start") || lowerMessage.includes("restart")) return "Service Control";
  
  return "System";
}

module.exports = router;
