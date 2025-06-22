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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level || '';
    const type = req.query.type || '';
    const action = req.query.action || '';
    const search = req.query.search || '';
    
    const logsData = await getLogs({ page, limit, level, type, action, search });
    res.render("logs", { 
      logs: logsData.logs,
      pagination: logsData.pagination,
      filters: { level, type, action, search },
      title: "System Logs"
    });
  } catch (error) {
    // Skip frontend error logging
    res.status(500).render("error", { 
      error: "Failed to load logs",
      message: "Unable to retrieve system logs at this time."
    });
  }
});

// API endpoint to get logs data
router.get("/api", isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level || '';
    const type = req.query.type || '';
    const action = req.query.action || '';
    const search = req.query.search || '';
    
    const logsData = await getLogs({ page, limit, level, type, action, search });
    res.json({ 
      success: true, 
      logs: logsData.logs,
      pagination: logsData.pagination,
      filters: { level, type, action, search }
    });
  } catch (error) {
    // Skip frontend error logging
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch logs" 
    });
  }
});

// API endpoint to test log files connection
router.get("/api/test-connection", isAuthenticated, async (req, res) => {
  try {
    const logFiles = [
      'logs/combined.log',
      'logs/error.log',
      'logs/success.log',
      'logs/warning.log',
      'logs/database.log',
      'logs/sites.log',
      'logs/users.log',
      'logs/security.log',
      'logs/cloudpanel-cli.log'
    ];
    
    const testResults = [];
    let allExists = true;
    
    for (const logFile of logFiles) {
      try {
        const stats = await fs.stat(logFile);
        testResults.push({
          file: logFile,
          exists: true,
          size: stats.size,
          modified: stats.mtime
        });
      } catch (error) {
        testResults.push({
          file: logFile,
          exists: false,
          error: error.message
        });
        allExists = false;
      }
    }
    
    res.json({
      success: allExists,
      mode: allExists ? 'CloudPanel API Logs' : 'Partial Log Files',
      testResults: testResults,
      output: `Tested ${logFiles.length} log files, ${testResults.filter(r => r.exists).length} found`
    });
  } catch (error) {
    // Skip frontend error logging
    res.json({
      success: false,
      mode: 'Error',
      error: error.message
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
    // Skip frontend error logging
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
    // Skip frontend error logging
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
    // Skip frontend error logging
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Function to read and parse project logs
// Function to read and parse project logs from our enhanced logging system
async function getLogs(options = {}) {
  const { page = 1, limit = 50, level = '', type = '', action = '', search = '' } = options;
  const logs = [];
  
  try {
    // Define log files to read in order of priority
    const logFiles = [
      { path: 'logs/combined.log', type: 'application', priority: 1 },
      { path: 'logs/error.log', type: 'error', priority: 2 },
      { path: 'logs/warning.log', type: 'warning', priority: 3 },
      { path: 'logs/success.log', type: 'success', priority: 4 },
      { path: 'logs/database.log', type: 'database', priority: 5 },
      { path: 'logs/sites.log', type: 'sites', priority: 6 },
      { path: 'logs/users.log', type: 'users', priority: 7 },
      { path: 'logs/security.log', type: 'security', priority: 8 },
      { path: 'logs/cloudpanel-cli.log', type: 'cli', priority: 9 }
    ];

    let totalLogsRead = 0;

    for (const logFile of logFiles) {
      try {
        const logContent = await fs.readFile(logFile.path, 'utf8');
        const lines = logContent.split('\n').filter(line => line.trim() !== '').slice(-200); // Last 200 lines per file
        
        for (const line of lines) {
          try {
            // Skip lines that only contain "false" or are just boolean values
            if (line.trim() === 'false' || 
                line.trim() === 'true' || 
                line.trim() === 'null' || 
                line.trim() === 'undefined' ||
                line.trim() === '{}' ||
                line.trim() === '[]' ||
                line.trim().length < 10) { // Skip very short lines that are likely not real log entries
              continue;
            }
            
            // Parse our new detailed log format
            // Format: [timestamp] LEVEL [action] [REQ:requestId] [USER:userId]: message | Details: {...} | Meta: {...}
            const logMatch = line.match(/^\[(.+?)\] (\w+)(?:\s\[(.+?)\])?(?:\s\[REQ:(.+?)\])?(?:\s\[USER:(.+?)\])?: (.+?)(?:\s\|\sDetails:\s(.+?))?(?:\s\|\sMeta:\s(.+?))?$/);
            
            if (logMatch) {
              const [, timestamp, level, action, requestId, userId, message, details, meta] = logMatch;
              
              // Skip if message is just "false" or similar
              if (message.trim() === 'false' || 
                  message.trim() === 'true' || 
                  message.trim() === 'null' ||
                  message.trim() === 'undefined' ||
                  message.trim().length < 5) {
                continue;
              }
              
              let parsedDetails = {};
              let parsedMeta = {};
              
              try {
                if (details) parsedDetails = JSON.parse(details);
                if (meta) parsedMeta = JSON.parse(meta);
              } catch (e) {
                // If JSON parse fails, keep as string
                if (details) parsedDetails = { raw: details };
                if (meta) parsedMeta = { raw: meta };
              }
              
              logs.push({
                timestamp: new Date(timestamp).toISOString(),
                level: level.toLowerCase(),
                action: action || getActionFromMessage(message),
                message: message,
                type: logFile.type,
                source: logFile.path.replace('logs/', '').replace('.log', ''),
                requestId: requestId,
                userId: userId,
                details: parsedDetails,
                meta: parsedMeta,
                priority: logFile.priority
              });
              totalLogsRead++;
            } else {
              // Try to parse as JSON (winston format)
              try {
                const logEntry = JSON.parse(line);
                
                // Skip if message is just "false" or similar
                if (logEntry.message && (logEntry.message.trim() === 'false' || 
                    logEntry.message.trim() === 'true' || 
                    logEntry.message.trim() === 'null' ||
                    logEntry.message.trim() === 'undefined' ||
                    logEntry.message.trim().length < 5)) {
                  continue;
                }
                
                logs.push({
                  timestamp: logEntry.timestamp || new Date().toISOString(),
                  level: logEntry.level || 'info',
                  action: logEntry.action || getActionFromMessage(logEntry.message),
                  message: logEntry.message || line,
                  type: logFile.type,
                  source: logFile.path.replace('logs/', '').replace('.log', ''),
                  details: logEntry.details || {},
                  meta: logEntry.meta || {},
                  priority: logFile.priority
                });
                totalLogsRead++;
              } catch (jsonError) {
                // Fallback for lines that don't match any format
                // Skip if line is just "false" or similar
                if (line.trim() === 'false' || 
                    line.trim() === 'true' || 
                    line.trim() === 'null' || 
                    line.trim() === 'undefined' ||
                    line.trim() === '{}' ||
                    line.trim() === '[]' ||
                    line.trim().length < 10) {
                  continue;
                }
                
                logs.push({
                  timestamp: new Date().toISOString(),
                  level: logFile.type === 'error' ? 'error' : 'info',
                  action: getActionFromMessage(line),
                  message: line,
                  type: logFile.type,
                  source: logFile.path.replace('logs/', '').replace('.log', ''),
                  priority: logFile.priority
                });
                totalLogsRead++;
              }
            }
          } catch (parseError) {
            // Skip malformed log lines
            console.warn(`Failed to parse log line: ${line}`);
          }
        }
      } catch (fileError) {
        // If log file doesn't exist, add a placeholder entry
        if (fileError.code !== 'ENOENT') {
          logs.push({
            timestamp: new Date().toISOString(),
            level: 'warning',
            action: 'Log File Error',
            message: `Unable to read ${logFile.path}: ${fileError.message}`,
            type: 'system',
            source: 'log-reader',
            priority: 999
          });
        }
      }
    }

    // Add some recent mock data if no logs exist
    if (totalLogsRead === 0) {
      const mockLogs = generateMockLogs();
      logs.push(...mockLogs);
    }

    // Sort logs by timestamp (newest first)
    let sortedLogs = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply filters
    if (level) {
      sortedLogs = sortedLogs.filter(log => log.level === level);
    }
    
    if (type) {
      sortedLogs = sortedLogs.filter(log => log.type === type);
    }
    
    if (action) {
      sortedLogs = sortedLogs.filter(log => log.action === action);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      sortedLogs = sortedLogs.filter(log => 
        log.message.toLowerCase().includes(searchLower) ||
        log.action.toLowerCase().includes(searchLower) ||
        log.source.toLowerCase().includes(searchLower)
      );
    }

    // Calculate pagination
    const totalLogs = sortedLogs.length;
    const totalPages = Math.ceil(totalLogs / limit);
    const offset = (page - 1) * limit;
    const paginatedLogs = sortedLogs.slice(offset, offset + limit);

    return {
      logs: paginatedLogs,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalLogs: totalLogs,
        limit: limit,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null
      }
    };

  } catch (error) {
    // Skip frontend error logging
    return {
      logs: [{
        timestamp: new Date().toISOString(),
        level: "error",
        message: `Error reading logs: ${error.message}`,
        action: "System Error",
        type: "error",
        source: "system"
      }],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalLogs: 1,
        limit: limit,
        hasNext: false,
        hasPrev: false,
        nextPage: null,
        prevPage: null
      }
    };
  }
}

// Helper function to determine action from message content
function getActionFromMessage(message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('cli') || lowerMessage.includes('command') || lowerMessage.includes('clpctl')) return 'CloudPanel CLI';
  if (lowerMessage.includes('site') || lowerMessage.includes('domain') || lowerMessage.includes('vhost')) return 'Site Management';
  if (lowerMessage.includes('database') || lowerMessage.includes('db:') || lowerMessage.includes('mysql')) return 'Database';
  if (lowerMessage.includes('user') || lowerMessage.includes('auth') || lowerMessage.includes('login')) return 'User Management';
  if (lowerMessage.includes('ssl') || lowerMessage.includes('certificate') || lowerMessage.includes('tls')) return 'SSL Certificate';
  if (lowerMessage.includes('api') || lowerMessage.includes('request') || lowerMessage.includes('endpoint')) return 'API Request';
  if (lowerMessage.includes('session') || lowerMessage.includes('login') || lowerMessage.includes('logout')) return 'Authentication';
  if (lowerMessage.includes('error') || lowerMessage.includes('failed') || lowerMessage.includes('❌')) return 'Error';
  if (lowerMessage.includes('success') || lowerMessage.includes('completed') || lowerMessage.includes('✅')) return 'Success';
  if (lowerMessage.includes('server') || lowerMessage.includes('start') || lowerMessage.includes('listening')) return 'Server Start';
  if (lowerMessage.includes('warning') || lowerMessage.includes('⚠️')) return 'Warning';
  if (lowerMessage.includes('security') || lowerMessage.includes('basic-auth')) return 'Security';
  
  return 'System';
}

// Generate mock logs for demonstration when no real logs exist
function generateMockLogs() {
  const mockActions = [
    { action: "API Request", level: "info", message: "✅ SUCCESS: GET /sites - Retrieved comprehensive site list with 15 active domains including SSL status and traffic analytics", type: "application" },
    { action: "Authentication", level: "info", message: "✅ SUCCESS: User authentication successful - Admin user logged in from 192.168.1.100 using session-based authentication", type: "security" },
    { action: "Site Management", level: "info", message: "✅ SUCCESS: New site creation completed for domain 'example.com' with PHP 8.1 configuration and SSL certificate", type: "sites" },
    { action: "CloudPanel CLI", level: "info", message: "✅ SUCCESS: CloudPanel CLI command executed successfully - Site created with Nginx vhost configuration and database setup", type: "cli" },
    { action: "Database", level: "info", message: "✅ SUCCESS: Database connection established successfully - Authentication and session stores initialized with 250 active sessions", type: "database" },
    { action: "Session", level: "info", message: "✅ SUCCESS: User session created with 24-hour expiration - Session store updated with encrypted user data and permissions", type: "security" },
    { action: "SSL Certificate", level: "info", message: "✅ SUCCESS: Let's Encrypt SSL certificate installed successfully for domain example.com - Certificate valid for 90 days", type: "sites" },
    { action: "User Management", level: "info", message: "✅ SUCCESS: New user account created with admin privileges - User 'john.doe' added to CloudPanel with full system access", type: "users" },
    { action: "API Request", level: "warning", message: "⚠️ WARNING: Rate limit approaching for IP 192.168.1.100 - 95% of hourly API requests consumed, 12 requests remaining", type: "application" },
    { action: "Security", level: "warning", message: "⚠️ WARNING: Multiple failed login attempts detected from IP 203.0.113.1 - Account temporarily locked for security", type: "security" },
    { action: "Database", level: "error", message: "❌ FAILED: Database connection timeout occurred during backup operation - Automatic retry scheduled in 30 seconds", type: "database" },
    { action: "CloudPanel CLI", level: "error", message: "❌ FAILED: Site deletion failed for domain 'test.com' - Domain has active SSL certificate that must be removed first", type: "cli" }
  ];

  return mockActions.map((log, index) => ({
    timestamp: new Date(Date.now() - (index * 300000)).toISOString(), // 5 minutes apart
    level: log.level,
    action: log.action,
    message: log.message,
    type: log.type,
    source: 'mock-data',
    details: {
      mockData: true,
      generated: new Date().toISOString(),
      index: index
    },
    meta: {
      service: 'cloudpanel-api',
      environment: 'development',
      version: '1.0.0'
    }
  }));
}

module.exports = router;
