const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const { Client } = require("ssh2");
const { exec } = require("child_process");
const { promisify } = require("util");
const logger = require("../utils/logger");
const { requireAuth } = require("../middleware");
const cloudpanel = require("../services/cloudpanel");
const databaseService = require("../services/database");
const jobQueue = require("../services/jobQueue");

const router = express.Router();

// Framework mapping table for standardized naming
const FRAMEWORK_TYPES = {
  // PHP Frameworks
  Laravel: { type: "PHP", framework: "Laravel" },
  Symfony: { type: "PHP", framework: "Symfony" },
  CodeIgniter: { type: "PHP", framework: "CodeIgniter" },
  CakePHP: { type: "PHP", framework: "CakePHP" },
  Zend: { type: "PHP", framework: "Zend" },
  Yii: { type: "PHP", framework: "Yii" },
  Phalcon: { type: "PHP", framework: "Phalcon" },
  Slim: { type: "PHP", framework: "Slim" },
  Lumen: { type: "PHP", framework: "Lumen" },

  // CMS
  WordPress: { type: "CMS", framework: "WordPress" },
  Drupal: { type: "CMS", framework: "Drupal" },
  Joomla: { type: "CMS", framework: "Joomla" },
  Magento: { type: "CMS", framework: "Magento" },
  PrestaShop: { type: "CMS", framework: "PrestaShop" },
  OpenCart: { type: "CMS", framework: "OpenCart" },

  // JavaScript/Node.js
  Express: { type: "Node.js", framework: "Express" },
  "Next.js": { type: "React", framework: "Next.js" },
  "Nuxt.js": { type: "Vue.js", framework: "Nuxt.js" },
  Gatsby: { type: "React", framework: "Gatsby" },
  React: { type: "JavaScript", framework: "React" },
  "Vue.js": { type: "JavaScript", framework: "Vue.js" },
  Angular: { type: "JavaScript", framework: "Angular" },
  Svelte: { type: "JavaScript", framework: "Svelte" },
  Astro: { type: "JavaScript", framework: "Astro" },
  SvelteKit: { type: "JavaScript", framework: "SvelteKit" },
  Remix: { type: "React", framework: "Remix" },
  NestJS: { type: "Node.js", framework: "NestJS" },
  Fastify: { type: "Node.js", framework: "Fastify" },
  Koa: { type: "Node.js", framework: "Koa" },
  Hapi: { type: "Node.js", framework: "Hapi" },

  // Python
  Django: { type: "Python", framework: "Django" },
  Flask: { type: "Python", framework: "Flask" },
  FastAPI: { type: "Python", framework: "FastAPI" },
  Pyramid: { type: "Python", framework: "Pyramid" },
  Tornado: { type: "Python", framework: "Tornado" },
  Bottle: { type: "Python", framework: "Bottle" },
  Sanic: { type: "Python", framework: "Sanic" },
  Starlette: { type: "Python", framework: "Starlette" },

  // Other Languages
  "Ruby on Rails": { type: "Ruby", framework: "Rails" },
  Sinatra: { type: "Ruby", framework: "Sinatra" },
  Go: { type: "Go", framework: "Go" },
  Gin: { type: "Go", framework: "Gin" },
  Echo: { type: "Go", framework: "Echo" },
  Fiber: { type: "Go", framework: "Fiber" },
  Rust: { type: "Rust", framework: "Rust" },
  Actix: { type: "Rust", framework: "Actix" },
  Rocket: { type: "Rust", framework: "Rocket" },
  Warp: { type: "Rust", framework: "Warp" },
  Phoenix: { type: "Elixir", framework: "Phoenix" },

  // Static Site Generators
  Jekyll: { type: "Static", framework: "Jekyll" },
  Hugo: { type: "Static", framework: "Hugo" },
  Hexo: { type: "Static", framework: "Hexo" },
  VuePress: { type: "Static", framework: "VuePress" },
  Docusaurus: { type: "Static", framework: "Docusaurus" },
  GitBook: { type: "Static", framework: "GitBook" },
  Eleventy: { type: "Static", framework: "Eleventy" },
  "11ty": { type: "Static", framework: "11ty" },

  // Basic Types
  PHP: { type: "PHP", framework: null },
  HTML: { type: "Static", framework: null },
  JavaScript: { type: "JavaScript", framework: null },
  "Node.js": { type: "Node.js", framework: null },
  Python: { type: "Python", framework: null },
  Static: { type: "Static", framework: null },
  Unknown: { type: "Unknown", framework: null },
};

// SSH configuration for development mode
const isDevelopment = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

const sshConfig = {
  host: process.env.VPS_HOST || "localhost",
  user: process.env.VPS_USER || "root",
  port: process.env.VPS_PORT || 22,
  password: process.env.VPS_PASSWORD || null,
};

// Validate SSH configuration in development mode
function validateSshConfig() {
  // In production mode, SSH config is not required
  if (!isDevelopment) {
    return true;
  }

  if (!sshConfig.host) {
    logger.error("Development mode requires VPS_HOST environment variable");
    return false;
  }

  if (!sshConfig.user) {
    logger.error("Development mode requires VPS_USER environment variable");
    return false;
  }

  if (!sshConfig.password) {
    logger.error("Development mode requires VPS_PASSWORD environment variable");
    return false;
  }

  return true;
}

// Global SSH connection for reuse
let globalSshConnection = null;
let connectionPromise = null;

// Create or reuse SSH connection with retry logic
async function getSshConnection(retryCount = 0) {
  if (globalSshConnection && globalSshConnection.isConnected) {
    return globalSshConnection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = new Promise((resolve, reject) => {
    const conn = new Client();

    // Set a timeout for the connection
    const connectionTimeout = setTimeout(() => {
      conn.destroy();
      reject(new Error("SSH connection timeout"));
    }, 10000); // 10 second timeout

    conn
      .on("ready", () => {
        clearTimeout(connectionTimeout);
        conn.isConnected = true;
        globalSshConnection = conn;
        connectionPromise = null;
        resolve(conn);
      })
      .on("error", (err) => {
        clearTimeout(connectionTimeout);
        conn.isConnected = false;
        globalSshConnection = null;
        connectionPromise = null;

        // Retry logic for connection failures
        if (retryCount < 2) {
          setTimeout(() => {
            getSshConnection(retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, 1000 * (retryCount + 1)); // Exponential backoff
        } else {
          reject(err);
        }
      })
      .on("close", () => {
        clearTimeout(connectionTimeout);
        conn.isConnected = false;
        globalSshConnection = null;
        connectionPromise = null;
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

  return connectionPromise;
}

// Execute command via SSH with connection reuse
async function executeSshCommand(command) {
  const conn = await getSshConnection();

  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
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
}

// Read directory via SSH or locally
async function readDirectory(dirPath) {
  if (isDevelopment) {
    try {
      const command = `ls -la "${dirPath}" 2>/dev/null || echo "DIRECTORY_NOT_FOUND"`;
      const result = await executeSshCommand(command);
      if (result.output.includes("DIRECTORY_NOT_FOUND")) {
        throw new Error("Directory not found");
      }

      // Parse ls output to get directory listing
      const lines = result.output.trim().split("\n");
      const entries = [];

      for (const line of lines) {
        // Skip total line and current/parent directory entries
        if (
          line.startsWith("total") ||
          line.includes(" . ") ||
          line.includes(" .. ")
        ) {
          continue;
        }

        // Parse ls -la output
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 9) {
          const permissions = parts[0];
          const name = parts.slice(8).join(" ");

          // Check if it's a directory
          if (permissions.startsWith("d")) {
            entries.push(name);
          }
        }
      }

      return entries;
    } catch (error) {
      throw new Error(`SSH readdir failed: ${error.message}`);
    }
  } else {
    // Production mode - Local execution
    try {
      const items = await fs.readdir(dirPath);

      // In production mode, we want to return all items (both files and directories)
      // The filtering will be done by the caller using getStats()
      return items;
    } catch (error) {
      throw new Error(`Local readdir failed: ${error.message}`);
    }
  }
}

// Get file/directory stats via SSH or locally
async function getStats(filePath) {
  if (isDevelopment) {
    try {
      const command = `stat -c "%Y %Z %s %F" "${filePath}" 2>/dev/null || echo "STAT_ERROR"`;
      const result = await executeSshCommand(command);

      if (result.output.includes("STAT_ERROR")) {
        throw new Error("File not found");
      }

      const parts = result.output.trim().split(" ");
      const mtime = new Date(parseInt(parts[0]) * 1000);
      const birthtime = new Date(parseInt(parts[1]) * 1000);
      const size = parseInt(parts[2]);
      const type = parts.slice(3).join(" ");

      return {
        isDirectory: () => type.includes("directory"),
        isFile: () => type.includes("regular file"),
        mtime,
        birthtime,
        size,
      };
    } catch (error) {
      throw new Error(`SSH stat failed: ${error.message}`);
    }
  } else {
    // Production mode - Local execution
    return await fs.stat(filePath);
  }
}

// Check if path exists via SSH or locally
async function pathExists(filePath) {
  if (isDevelopment) {
    try {
      const command = `test -e "${filePath}" && echo "EXISTS" || echo "NOT_EXISTS"`;
      const result = await executeSshCommand(command);
      return result.output.trim() === "EXISTS";
    } catch (error) {
      return false;
    }
  } else {
    // Production mode - Local execution
    try {
      await fs.stat(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Middleware to require authentication for all routes except API endpoints
router.use((req, res, next) => {
  // Skip authentication for API endpoints
  if (req.path.startsWith('/api/')) {
    return next();
  }
  return requireAuth(req, res, next);
});

// Get all sites from /home directory structure (optimized for SSH)
async function getSitesList() {
  try {
    const sites = [];

    if (isDevelopment) {
      // Validate SSH configuration in development mode
      if (!validateSshConfig()) {
        throw new Error("Invalid SSH configuration for development mode");
      }

      // First, let's debug by checking what directories exist
      const debugCommand = `ls -la /home/`;
      const debugResult = await executeSshCommand(debugCommand);

      // Simplified approach - check each known user directory
      const checkUsersCommand = `
        for user_dir in /home/*; do
          if [ -d "$user_dir" ]; then
            user=$(basename "$user_dir")
            echo "USER_FOUND:$user"
          fi
        done
      `;

      const usersResult = await executeSshCommand(checkUsersCommand);
      const userLines = usersResult.output
        .split("\n")
        .filter((line) => line.startsWith("USER_FOUND:"));

      for (const userLine of userLines) {
        const user = userLine.replace("USER_FOUND:", "");

        // Skip system directories
        if (["mysql", "setup", "clp"].includes(user)) continue;

        // Check for htdocs and domains
        const domainsCommand = `
          htdocs_path="/home/${user}/htdocs"
          if [ -d "$htdocs_path" ]; then
            for domain_path in "$htdocs_path"/*; do
              if [ -d "$domain_path" ]; then
                domain=$(basename "$domain_path")
                
                # Get basic file info
                stat_output=$(stat -c "%Y %Z %s" "$domain_path" 2>/dev/null || echo "0 0 0")
                
                # Determine site type with more comprehensive and accurate checks
                site_type="Static"
                site_framework=""
                
                # Priority 1: Check for Laravel (most specific PHP framework)
                if [ -f "$domain_path/artisan" ] && [ -f "$domain_path/composer.json" ]; then
                  if grep -q "laravel/framework" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Laravel"
                  elif [ -d "$domain_path/app" ] && [ -d "$domain_path/config" ] && [ -d "$domain_path/resources" ]; then
                    site_type="Laravel"
                  elif grep -q "lumen" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Lumen"
                  else
                    site_type="PHP"
                  fi
                
                # Priority 2: WordPress (most common CMS)
                elif [ -f "$domain_path/wp-config.php" ] || [ -f "$domain_path/wp-config-sample.php" ] || \
                     ([ -d "$domain_path/wp-content" ] && [ -d "$domain_path/wp-includes" ]); then
                  site_type="WordPress"
                
                # Priority 3: Other PHP frameworks via composer.json
                elif [ -f "$domain_path/composer.json" ]; then
                  if grep -q "symfony/framework\\|symfony/symfony" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Symfony"
                  elif grep -q "codeigniter4/framework\\|codeigniter/framework" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="CodeIgniter"
                  elif grep -q "cakephp/cakephp" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="CakePHP"
                  elif grep -q "zendframework\\|laminas" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Zend"
                  elif grep -q "yiisoft/yii2" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Yii"
                  elif grep -q "phalcon" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Phalcon"
                  elif grep -q "slim/slim" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Slim"
                  else
                    site_type="PHP"
                  fi
                
                # Priority 4: Node.js applications
                elif [ -f "$domain_path/package.json" ]; then
                  if grep -q "\\"next\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Next.js"
                  elif grep -q "\\"nuxt\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Nuxt.js"
                  elif grep -q "\\"@remix-run\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Remix"
                  elif grep -q "\\"gatsby\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Gatsby"
                  elif grep -q "\\"@nestjs\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="NestJS"
                  elif grep -q "\\"fastify\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Fastify"
                  elif grep -q "\\"koa\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Koa"
                  elif grep -q "\\"@hapi\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Hapi"
                  elif grep -q "\\"express\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Express"
                  elif grep -q "\\"react\\"\\|\\"@types/react\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="React"
                  elif grep -q "\\"vue\\"\\|\\"@vue\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Vue.js"
                  elif grep -q "\\"@angular\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Angular"
                  elif grep -q "\\"svelte\\"" "$domain_path/package.json" 2>/dev/null; then
                    if grep -q "\\"@sveltejs/kit\\"" "$domain_path/package.json" 2>/dev/null; then
                      site_type="SvelteKit"
                    else
                      site_type="Svelte"
                    fi
                  elif grep -q "\\"astro\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Astro"
                  elif grep -q "\\"@11ty/eleventy\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Eleventy"
                  else
                    site_type="Node.js"
                  fi
                
                # Priority 5: Python applications
                elif [ -f "$domain_path/requirements.txt" ] || [ -f "$domain_path/Pipfile" ] || [ -f "$domain_path/pyproject.toml" ]; then
                  if [ -f "$domain_path/manage.py" ]; then
                    site_type="Django"
                  elif grep -q "django\\|Django" "$domain_path/requirements.txt" 2>/dev/null || \
                       grep -q "django\\|Django" "$domain_path/Pipfile" 2>/dev/null; then
                    site_type="Django"
                  elif grep -q "flask\\|Flask" "$domain_path/requirements.txt" 2>/dev/null || \
                       grep -q "flask\\|Flask" "$domain_path/Pipfile" 2>/dev/null; then
                    site_type="Flask"
                  elif grep -q "fastapi\\|FastAPI" "$domain_path/requirements.txt" 2>/dev/null || \
                       grep -q "fastapi\\|FastAPI" "$domain_path/Pipfile" 2>/dev/null; then
                    site_type="FastAPI"
                  elif grep -q "pyramid" "$domain_path/requirements.txt" 2>/dev/null; then
                    site_type="Pyramid"
                  elif grep -q "tornado" "$domain_path/requirements.txt" 2>/dev/null; then
                    site_type="Tornado"
                  elif grep -q "bottle" "$domain_path/requirements.txt" 2>/dev/null; then
                    site_type="Bottle"
                  elif grep -q "sanic" "$domain_path/requirements.txt" 2>/dev/null; then
                    site_type="Sanic"
                  elif grep -q "starlette" "$domain_path/requirements.txt" 2>/dev/null; then
                    site_type="Starlette"
                  else
                    site_type="Python"
                  fi
                
                # Priority 6: Ruby applications
                elif [ -f "$domain_path/Gemfile" ]; then
                  if grep -q "rails\\|Rails" "$domain_path/Gemfile" 2>/dev/null; then
                    site_type="Ruby on Rails"
                  elif grep -q "sinatra" "$domain_path/Gemfile" 2>/dev/null; then
                    site_type="Sinatra"
                  else
                    site_type="Ruby"
                  fi
                
                # Priority 7: Go applications
                elif [ -f "$domain_path/go.mod" ]; then
                  if grep -q "gin-gonic/gin" "$domain_path/go.mod" 2>/dev/null; then
                    site_type="Gin"
                  elif grep -q "labstack/echo" "$domain_path/go.mod" 2>/dev/null; then
                    site_type="Echo"
                  elif grep -q "gofiber/fiber" "$domain_path/go.mod" 2>/dev/null; then
                    site_type="Fiber"
                  else
                    site_type="Go"
                  fi
                
                # Priority 8: Rust applications
                elif [ -f "$domain_path/Cargo.toml" ]; then
                  if grep -q "actix-web" "$domain_path/Cargo.toml" 2>/dev/null; then
                    site_type="Actix"
                  elif grep -q "rocket" "$domain_path/Cargo.toml" 2>/dev/null; then
                    site_type="Rocket"
                  elif grep -q "warp" "$domain_path/Cargo.toml" 2>/dev/null; then
                    site_type="Warp"
                  else
                    site_type="Rust"
                  fi
                
                # Priority 9: Elixir/Phoenix
                elif [ -f "$domain_path/mix.exs" ]; then
                  site_type="Phoenix"
                
                # Priority 10: Other CMS by directory structure
                elif [ -d "$domain_path/sites/all" ] && [ -f "$domain_path/index.php" ]; then
                  site_type="Drupal"
                elif [ -d "$domain_path/administrator" ] && [ -f "$domain_path/index.php" ] && [ -d "$domain_path/components" ]; then
                  site_type="Joomla"
                elif [ -f "$domain_path/app/etc/local.xml" ] || [ -f "$domain_path/app/etc/env.php" ]; then
                  site_type="Magento"
                elif [ -d "$domain_path/config" ] && [ -f "$domain_path/index.php" ] && [ -d "$domain_path/classes" ]; then
                  site_type="PrestaShop"
                elif [ -d "$domain_path/system" ] && [ -d "$domain_path/catalog" ] && [ -f "$domain_path/index.php" ]; then
                  site_type="OpenCart"
                elif [ -d "$domain_path/system" ] && [ -d "$domain_path/application" ] && [ -f "$domain_path/index.php" ]; then
                  site_type="CodeIgniter"
                elif [ -d "$domain_path/lib/Cake" ] || [ -d "$domain_path/cake" ]; then
                  site_type="CakePHP"
                
                # Priority 11: Static site generators
                elif [ -f "$domain_path/_config.yml" ]; then
                  if [ -d "$domain_path/_posts" ]; then
                    site_type="Jekyll"
                  else
                    site_type="Jekyll"
                  fi
                elif [ -f "$domain_path/gatsby-config.js" ] || [ -f "$domain_path/gatsby-config.ts" ]; then
                  site_type="Gatsby"
                elif [ -f "$domain_path/docusaurus.config.js" ] || [ -f "$domain_path/docusaurus.config.ts" ]; then
                  site_type="Docusaurus"
                elif [ -f "$domain_path/config.toml" ] || [ -f "$domain_path/config.yaml" ] || [ -f "$domain_path/config.yml" ]; then
                  if [ -d "$domain_path/content" ]; then
                    site_type="Hugo"
                  fi
                elif [ -f "$domain_path/.vuepress/config.js" ] || [ -d "$domain_path/.vuepress" ]; then
                  site_type="VuePress"
                elif [ -f "$domain_path/.eleventy.js" ] || [ -f "$domain_path/eleventy.config.js" ]; then
                  site_type="Eleventy"
                elif [ -f "$domain_path/_config.js" ] && [ -d "$domain_path/source" ]; then
                  site_type="Hexo"
                
                # Priority 12: Basic language detection
                elif [ -f "$domain_path/index.php" ] || find "$domain_path" -maxdepth 2 -name "*.php" -type f | head -1 | grep -q ".php"; then
                  site_type="PHP"
                elif [ -f "$domain_path/index.html" ] || [ -f "$domain_path/index.htm" ]; then
                  if find "$domain_path" -maxdepth 2 -name "*.js" -type f | head -1 | grep -q ".js"; then
                    site_type="JavaScript"
                  else
                    site_type="HTML"
                  fi
                elif find "$domain_path" -maxdepth 2 -name "*.js" -type f | head -1 | grep -q ".js"; then
                  site_type="JavaScript"
                fi
                
                # Check SSL
                ssl_status="false"
                if [ -d "/etc/letsencrypt/live/$domain" ]; then
                  ssl_status="true"
                fi
                
                # Get directory size
                dir_size=$(du -sb "$domain_path" 2>/dev/null | cut -f1 || echo "0")
                
                echo "SITE_DATA|${user}|$domain|$domain_path|$site_type|$ssl_status|$stat_output|$dir_size"
              fi
            done
          fi
        `;

        try {
          const domainsResult = await executeSshCommand(domainsCommand);
          const domainLines = domainsResult.output
            .split("\n")
            .filter((line) => line.startsWith("SITE_DATA|"));

          for (const domainLine of domainLines) {
            try {
              const parts = domainLine.replace("SITE_DATA|", "").split("|");
              if (parts.length >= 7) {
                const [
                  userName,
                  domainName,
                  domainPath,
                  siteType,
                  sslStatus,
                  statData,
                  dirSize,
                ] = parts;
                const [mtime, birthtime, size] = statData.split(" ");

                // Get standardized framework information
                const frameworkInfo = getFrameworkInfo(siteType);

                const siteInfo = {
                  domain: domainName,
                  user: userName,
                  type: frameworkInfo.type,
                  framework: frameworkInfo.framework,
                  ssl: sslStatus === "true",
                  path: domainPath,
                  created: new Date(parseInt(birthtime) * 1000),
                  modified: new Date(parseInt(mtime) * 1000),
                  size: parseInt(dirSize) || 0,
                };

                sites.push(siteInfo);
              }
            } catch (err) {
              // Skip error logging for frontend access
            }
          }
        } catch (err) {
          // Skip error logging for frontend access
        }
      }
    } else {
      try {
        let homeDir = "/home";

        // Check if /home directory exists, fallback to alternative paths
        if (!(await pathExists(homeDir))) {
          logger.warn(
            "Home directory /home does not exist, trying alternatives..."
          );

          // Try alternative paths commonly used in different environments
          const alternatives = [
            "/var/www/html",
            "/opt/cloudpanel/home",
            "./data/sites",
          ];
          let found = false;

          for (const altPath of alternatives) {
            if (await pathExists(altPath)) {
              homeDir = altPath;
              found = true;
              break;
            }
          }

          if (!found) {
            logger.warn(
              "No valid home directory found, returning empty sites list"
            );
            return sites;
          }
        }

        const allUsers = await readDirectory(homeDir);

        // Filter to only get valid user directories (not files like .gitignore)
        const users = [];
        for (const user of allUsers) {
          try {
            const userPath = path.posix.join(homeDir, user);
            const userStats = await getStats(userPath);

            // Only include if it's a directory and not a system/hidden directory
            if (
              userStats.isDirectory() &&
              !["mysql", "setup", "clp", "lost+found", ".git"].includes(user) &&
              !user.startsWith(".")
            ) {
              users.push(user);
            }
          } catch (err) {
            // Skip entries we can't stat or that don't exist
            continue;
          }
        }

        for (const user of users) {
          const userPath = path.posix.join(homeDir, user);

          // Check different possible site directory structures
          const possibleSiteDirs = ["htdocs", "public_html", "www", "sites"];
          let sitesDir = null;

          for (const dir of possibleSiteDirs) {
            const candidatePath = path.posix.join(userPath, dir);
            if (await pathExists(candidatePath)) {
              sitesDir = candidatePath;
              break;
            }
          }

          if (!sitesDir) {
            continue;
          }

          try {
            const allDomains = await readDirectory(sitesDir);

            // Filter to only get valid domain directories (not files like .gitignore)
            const domains = [];
            for (const domain of allDomains) {
              try {
                const domainPath = path.posix.join(sitesDir, domain);
                const domainStats = await getStats(domainPath);

                // Only include if it's a directory and not a hidden file
                if (domainStats.isDirectory() && !domain.startsWith(".")) {
                  domains.push(domain);
                }
              } catch (err) {
                // Skip entries we can't stat or that don't exist
                continue;
              }
            }

            for (const domain of domains) {
              try {
                const domainPath = path.posix.join(sitesDir, domain);
                const domainInfo = await getDomainInfo(
                  domainPath,
                  domain,
                  user
                );
                sites.push(domainInfo);
              } catch (err) {
                // Skip domains we can't access
                logger.warn(
                  `Cannot access domain ${domain} for user ${user}: ${err.message}`
                );
              }
            }
          } catch (err) {
            // Skip users without sites directory or permission issues
            logger.warn(
              `Cannot access sites directory for user ${user}: ${err.message}`
            );
          }
        }
      } catch (error) {
        logger.error(
          `Error reading sites in production mode: ${error.message}`
        );
        throw new Error("Failed to read sites directory in production");
      }
    }

    return sites;
  } catch (error) {
    logger.error(`Error in getSitesList: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);
    throw error;
  }
}

// Get detailed information about a domain
async function getDomainInfo(domainPath, domainName, userName) {
  try {
    const stats = await getStats(domainPath);

    // Comprehensive site type detection
    let siteType = "Static";
    let hasSSL = false;

    try {
      const allFiles = await readDirectory(domainPath);

      // Filter out hidden files and directories for site type detection
      const files = allFiles.filter((file) => !file.startsWith("."));

      siteType = await detectSiteType(domainPath, files);
    } catch (err) {
      // Can't read directory contents
      logger.warn(
        `Can't read domain directory contents for ${domainName}: ${err.message}`
      );
    }

    // Check SSL certificate (basic check)
    const sslPath = `/etc/letsencrypt/live/${domainName}`;
    try {
      if (await pathExists(sslPath)) {
        hasSSL = true;
      }
    } catch (err) {
      // No SSL certificate found
    }

    // Get standardized framework information
    const frameworkInfo = getFrameworkInfo(siteType);

    // Extract values from .env file and other configuration files
    const databaseName =
      (await extractEnvValue(domainPath, "DB_DATABASE")) ||
      (await extractEnvValue(domainPath, "DATABASE_NAME")) ||
      (await extractEnvValue(domainPath, "DB_NAME")) ||
      (await extractEnvValue(domainPath, "database"));
    const databaseUser =
      (await extractEnvValue(domainPath, "DB_USERNAME")) ||
      (await extractEnvValue(domainPath, "DATABASE_USER")) ||
      (await extractEnvValue(domainPath, "DB_USER")) ||
      (await extractEnvValue(domainPath, "username"));
    const databasePassword =
      (await extractEnvValue(domainPath, "DB_PASSWORD")) ||
      (await extractEnvValue(domainPath, "DATABASE_PASSWORD")) ||
      (await extractEnvValue(domainPath, "DB_PASS")) ||
      (await extractEnvValue(domainPath, "password"));
    const appKey =
      (await extractEnvValue(domainPath, "APP_KEY")) ||
      (await extractEnvValue(domainPath, "APP_SECRET")) ||
      (await extractEnvValue(domainPath, "SECRET_KEY")) ||
      (await extractEnvValue(domainPath, "AUTH_KEY")) ||
      (await extractEnvValue(domainPath, "SECURE_AUTH_KEY"));

    // Debug logging for environment variables
    logger.debug(`Domain ${domainName} env extraction:`, {
      database: databaseName,
      database_user: databaseUser,
      database_password: databasePassword ? "***HIDDEN***" : null,
      app_key: appKey ? "***HIDDEN***" : null,
      path: domainPath
    });

    // Get backup information
    const databaseBackup = await getDatabaseBackupInfo(userName);
    const siteBackup = await getSiteBackupInfo(userName);

    return {
      domain: domainName,
      user: userName,
      type: frameworkInfo.type,
      framework: frameworkInfo.framework,
      ssl: hasSSL,
      path: domainPath,
      database: databaseName,
      database_user: databaseUser,
      database_password: databasePassword,
      app_key: appKey,
      created: stats.birthtime,
      modified: stats.mtime,
      size: await getDirSize(domainPath),
      database_backup: databaseBackup,
      site_backup: siteBackup,
    };
  } catch (error) {
    logger.warn(
      `Error getting domain info for ${domainName}: ${error.message}`
    );
    return {
      domain: domainName,
      user: userName,
      type: "Unknown",
      framework: null,
      ssl: false,
      path: domainPath,
      database: null,
      database_user: null,
      database_password: null,
      app_key: null,
      created: new Date(),
      modified: new Date(),
      size: 0,
      database_backup: null,
      site_backup: null,
    };
  }
}

// Comprehensive site type detection function with framework table integration
async function detectSiteType(domainPath, files) {
  try {
    // Helper function to check if file contains specific content
    const checkFileContent = async (filePath, searchText) => {
      try {
        if (isDevelopment) {
          const command = `grep -q "${searchText}" "${filePath}" 2>/dev/null && echo "FOUND" || echo "NOT_FOUND"`;
          const result = await executeSshCommand(command);
          return result.output.trim() === "FOUND";
        } else {
          const content = await fs.readFile(filePath, "utf-8");
          return content.includes(searchText);
        }
      } catch (err) {
        return false;
      }
    };

    // Helper function to check if directory exists
    const dirExists = async (dirPath) => {
      return await pathExists(dirPath);
    };

    // Helper function to check multiple patterns in a file
    const checkMultiplePatterns = async (filePath, patterns) => {
      for (const pattern of patterns) {
        if (await checkFileContent(filePath, pattern)) {
          return true;
        }
      }
      return false;
    };

    // Priority 1: Laravel (most specific PHP framework)
    if (files.includes("artisan") && files.includes("composer.json")) {
      const composerPath = path.posix.join(domainPath, "composer.json");
      if (
        (await checkFileContent(composerPath, "laravel/framework")) ||
        ((await dirExists(path.posix.join(domainPath, "app"))) &&
          (await dirExists(path.posix.join(domainPath, "config"))) &&
          (await dirExists(path.posix.join(domainPath, "resources"))))
      ) {
        return "Laravel";
      } else if (await checkFileContent(composerPath, "lumen")) {
        return "Lumen";
      } else {
        return "PHP";
      }
    }

    // Priority 2: WordPress (most common CMS)
    if (
      files.includes("wp-config.php") ||
      files.includes("wp-config-sample.php") ||
      ((await dirExists(path.posix.join(domainPath, "wp-content"))) &&
        (await dirExists(path.posix.join(domainPath, "wp-includes"))))
    ) {
      return "WordPress";
    }

    // Priority 3: Other PHP frameworks via composer.json
    if (files.includes("composer.json")) {
      const composerPath = path.posix.join(domainPath, "composer.json");

      if (
        await checkMultiplePatterns(composerPath, [
          "symfony/framework",
          "symfony/symfony",
        ])
      ) {
        return "Symfony";
      }
      if (
        await checkMultiplePatterns(composerPath, [
          "codeigniter4/framework",
          "codeigniter/framework",
        ])
      ) {
        return "CodeIgniter";
      }
      if (await checkFileContent(composerPath, "cakephp/cakephp")) {
        return "CakePHP";
      }
      if (
        await checkMultiplePatterns(composerPath, ["zendframework", "laminas"])
      ) {
        return "Zend";
      }
      if (await checkFileContent(composerPath, "yiisoft/yii2")) {
        return "Yii";
      }
      if (await checkFileContent(composerPath, "phalcon")) {
        return "Phalcon";
      }
      if (await checkFileContent(composerPath, "slim/slim")) {
        return "Slim";
      }

      // If has composer.json but no specific framework, it's still PHP
      return "PHP";
    }

    // Priority 4: Node.js applications
    if (files.includes("package.json")) {
      const packagePath = path.posix.join(domainPath, "package.json");

      if (await checkFileContent(packagePath, '"next"')) return "Next.js";
      if (await checkFileContent(packagePath, '"nuxt"')) return "Nuxt.js";
      if (await checkFileContent(packagePath, '"@remix-run"')) return "Remix";
      if (await checkFileContent(packagePath, '"gatsby"')) return "Gatsby";
      if (await checkFileContent(packagePath, '"@nestjs"')) return "NestJS";
      if (await checkFileContent(packagePath, '"fastify"')) return "Fastify";
      if (await checkFileContent(packagePath, '"koa"')) return "Koa";
      if (await checkFileContent(packagePath, '"@hapi"')) return "Hapi";
      if (await checkFileContent(packagePath, '"express"')) return "Express";
      if (
        await checkMultiplePatterns(packagePath, ['"react"', '"@types/react"'])
      )
        return "React";
      if (await checkMultiplePatterns(packagePath, ['"vue"', '"@vue"']))
        return "Vue.js";
      if (await checkFileContent(packagePath, '"@angular"')) return "Angular";

      if (await checkFileContent(packagePath, '"svelte"')) {
        if (await checkFileContent(packagePath, '"@sveltejs/kit"')) {
          return "SvelteKit";
        }
        return "Svelte";
      }

      if (await checkFileContent(packagePath, '"astro"')) return "Astro";
      if (await checkFileContent(packagePath, '"@11ty/eleventy"'))
        return "Eleventy";

      return "Node.js";
    }

    // Priority 5: Python applications
    if (
      files.includes("requirements.txt") ||
      files.includes("Pipfile") ||
      files.includes("pyproject.toml")
    ) {
      if (files.includes("manage.py")) return "Django";

      const reqPath = path.posix.join(domainPath, "requirements.txt");
      const pipfilePath = path.posix.join(domainPath, "Pipfile");

      if (
        (await checkMultiplePatterns(reqPath, ["django", "Django"])) ||
        (await checkMultiplePatterns(pipfilePath, ["django", "Django"]))
      ) {
        return "Django";
      }
      if (
        (await checkMultiplePatterns(reqPath, ["flask", "Flask"])) ||
        (await checkMultiplePatterns(pipfilePath, ["flask", "Flask"]))
      ) {
        return "Flask";
      }
      if (
        (await checkMultiplePatterns(reqPath, ["fastapi", "FastAPI"])) ||
        (await checkMultiplePatterns(pipfilePath, ["fastapi", "FastAPI"]))
      ) {
        return "FastAPI";
      }
      if (await checkFileContent(reqPath, "pyramid")) return "Pyramid";
      if (await checkFileContent(reqPath, "tornado")) return "Tornado";
      if (await checkFileContent(reqPath, "bottle")) return "Bottle";
      if (await checkFileContent(reqPath, "sanic")) return "Sanic";
      if (await checkFileContent(reqPath, "starlette")) return "Starlette";

      return "Python";
    }

    // Priority 6: Ruby applications
    if (files.includes("Gemfile")) {
      const gemfilePath = path.posix.join(domainPath, "Gemfile");
      if (await checkMultiplePatterns(gemfilePath, ["rails", "Rails"])) {
        return "Ruby on Rails";
      }
      if (await checkFileContent(gemfilePath, "sinatra")) {
        return "Sinatra";
      }
      return "Ruby";
    }

    // Priority 7: Go applications
    if (files.includes("go.mod")) {
      const goModPath = path.posix.join(domainPath, "go.mod");
      if (await checkFileContent(goModPath, "gin-gonic/gin")) return "Gin";
      if (await checkFileContent(goModPath, "labstack/echo")) return "Echo";
      if (await checkFileContent(goModPath, "gofiber/fiber")) return "Fiber";
      return "Go";
    }

    // Priority 8: Rust applications
    if (files.includes("Cargo.toml")) {
      const cargoPath = path.posix.join(domainPath, "Cargo.toml");
      if (await checkFileContent(cargoPath, "actix-web")) return "Actix";
      if (await checkFileContent(cargoPath, "rocket")) return "Rocket";
      if (await checkFileContent(cargoPath, "warp")) return "Warp";
      return "Rust";
    }

    // Priority 9: Elixir/Phoenix
    if (files.includes("mix.exs")) {
      return "Phoenix";
    }

    // Priority 10: Other CMS by directory structure
    if (
      (await dirExists(path.posix.join(domainPath, "sites/all"))) &&
      files.includes("index.php")
    ) {
      return "Drupal";
    }
    if (
      (await dirExists(path.posix.join(domainPath, "administrator"))) &&
      files.includes("index.php") &&
      (await dirExists(path.posix.join(domainPath, "components")))
    ) {
      return "Joomla";
    }
    if (
      (await pathExists(path.posix.join(domainPath, "app/etc/local.xml"))) ||
      (await pathExists(path.posix.join(domainPath, "app/etc/env.php")))
    ) {
      return "Magento";
    }
    if (
      (await dirExists(path.posix.join(domainPath, "config"))) &&
      files.includes("index.php") &&
      (await dirExists(path.posix.join(domainPath, "classes")))
    ) {
      return "PrestaShop";
    }
    if (
      (await dirExists(path.posix.join(domainPath, "system"))) &&
      (await dirExists(path.posix.join(domainPath, "catalog"))) &&
      files.includes("index.php")
    ) {
      return "OpenCart";
    }
    if (
      (await dirExists(path.posix.join(domainPath, "system"))) &&
      (await dirExists(path.posix.join(domainPath, "application"))) &&
      files.includes("index.php")
    ) {
      return "CodeIgniter";
    }
    if (
      (await dirExists(path.posix.join(domainPath, "lib/Cake"))) ||
      (await dirExists(path.posix.join(domainPath, "cake")))
    ) {
      return "CakePHP";
    }

    // Priority 11: Static site generators
    if (files.includes("_config.yml")) {
      return "Jekyll";
    }
    if (
      files.includes("gatsby-config.js") ||
      files.includes("gatsby-config.ts")
    ) {
      return "Gatsby";
    }
    if (
      files.includes("docusaurus.config.js") ||
      files.includes("docusaurus.config.ts")
    ) {
      return "Docusaurus";
    }
    if (
      (files.includes("config.toml") ||
        files.includes("config.yaml") ||
        files.includes("config.yml")) &&
      (await dirExists(path.posix.join(domainPath, "content")))
    ) {
      return "Hugo";
    }
    if (
      (await pathExists(path.posix.join(domainPath, ".vuepress/config.js"))) ||
      (await dirExists(path.posix.join(domainPath, ".vuepress")))
    ) {
      return "VuePress";
    }
    if (
      files.includes(".eleventy.js") ||
      files.includes("eleventy.config.js")
    ) {
      return "Eleventy";
    }
    if (
      files.includes("_config.js") &&
      (await dirExists(path.posix.join(domainPath, "source")))
    ) {
      return "Hexo";
    }

    // Priority 12: Basic language detection
    if (
      files.includes("index.php") ||
      files.some((file) => file.endsWith(".php"))
    ) {
      return "PHP";
    }

    if (files.includes("index.html") || files.includes("index.htm")) {
      if (files.some((file) => file.endsWith(".js"))) {
        return "JavaScript";
      }
      return "HTML";
    }

    if (files.some((file) => file.endsWith(".js"))) {
      return "JavaScript";
    }

    return "Static";
  } catch (error) {
    logger.warn(`Error detecting site type: ${error.message}`);
    return "Unknown";
  }
}

// Function to get standardized framework information
function getFrameworkInfo(detectedType) {
  const frameworkData = FRAMEWORK_TYPES[detectedType];
  if (frameworkData) {
    return {
      type: frameworkData.type,
      framework: frameworkData.framework || detectedType,
    };
  }

  // Fallback for unknown types
  return {
    type: detectedType,
    framework: null,
  };
}

// Calculate directory size (optimized version)
async function getDirSize(dirPath) {
  try {
    if (isDevelopment) {
      // Use SSH to get directory size
      const command = `du -sb "${dirPath}" 2>/dev/null | cut -f1 || echo "0"`;
      const result = await executeSshCommand(command);
      return parseInt(result.output.trim()) || 0;
    } else {
      // Production mode - Use native du command for accurate size calculation
      try {
        const execAsync = promisify(exec);

        // Use du command which is more accurate and efficient than recursive JS
        const { stdout } = await execAsync(
          `du -sb "${dirPath}" 2>/dev/null || echo "0"`
        );
        const size = parseInt(stdout.trim().split("\t")[0]) || 0;

        logger.debug(`Directory size for ${dirPath}: ${size} bytes`);
        return size;
      } catch (duError) {
        logger.warn(
          `du command failed for ${dirPath}, falling back to recursive calculation: ${duError.message}`
        );
        // Fallback to improved recursive calculation
        return await calculateDirSizeRecursive(dirPath);
      }
    }
  } catch (error) {
    logger.warn(
      `Error calculating directory size for ${dirPath}: ${error.message}`
    );
    return 0;
  }
}

// Improved recursive function to calculate directory size in production mode
async function calculateDirSizeRecursive(dirPath, visitedInodes = new Set()) {
  try {
    let totalSize = 0;

    // Get directory stats to check for hardlinks/symlinks
    let dirStats;
    try {
      dirStats = await fs.stat(dirPath);

      // Prevent infinite loops from hardlinks and circular symlinks
      const inodeKey = `${dirStats.dev}-${dirStats.ino}`;
      if (visitedInodes.has(inodeKey)) {
        logger.debug(`Skipping already visited directory: ${dirPath}`);
        return 0;
      }
      visitedInodes.add(inodeKey);
    } catch (statError) {
      logger.warn(`Cannot stat directory ${dirPath}: ${statError.message}`);
      return 0;
    }

    let items;
    try {
      items = await fs.readdir(dirPath);
    } catch (readError) {
      logger.warn(`Cannot read directory ${dirPath}: ${readError.message}`);
      return 0;
    }

    // Process all items without artificial limitations
    for (const item of items) {
      try {
        const itemPath = path.join(dirPath, item);
        let stats;

        // Use lstat to get symlink info without following it
        try {
          stats = await fs.lstat(itemPath);
        } catch (statError) {
          // Skip files/directories we can't access
          continue;
        }

        if (stats.isFile()) {
          totalSize += stats.size;
        } else if (stats.isDirectory() && !stats.isSymbolicLink()) {
          // Recursively calculate subdirectory size
          // Pass the visitedInodes set to prevent infinite loops
          const subDirSize = await calculateDirSizeRecursive(
            itemPath,
            visitedInodes
          );
          totalSize += subDirSize;
        } else if (stats.isSymbolicLink()) {
          // For symlinks, add the size of the link itself (not the target)
          totalSize += stats.size;
        }
      } catch (err) {
        // Skip files/directories we can't access
        logger.debug(
          `Skipping inaccessible item ${item} in ${dirPath}: ${err.message}`
        );
        continue;
      }
    }

    return totalSize;
  } catch (error) {
    logger.warn(
      `Error in calculateDirSizeRecursive for ${dirPath}: ${error.message}`
    );
    return 0;
  }
}

// Clean up SSH connection
function cleanupSshConnection() {
  if (globalSshConnection && globalSshConnection.isConnected) {
    globalSshConnection.end();
    globalSshConnection = null;
    connectionPromise = null;
  }
}

// Cleanup on process exit
process.on("SIGINT", cleanupSshConnection);
process.on("SIGTERM", cleanupSshConnection);

// Route to display sites list page
router.get("/", async (req, res) => {
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), 30000); // 30 second timeout
    });

    const sites = await Promise.race([getSitesList(), timeoutPromise]);

    // Get setup data from database
    let setupData = [];
    try {
      setupData = await databaseService.getAllSetups();
    } catch (error) {
      logger.error(`Error getting setup data: ${error.message}`);
      // Continue without setup data if database is not available
    }

    // Merge setup data with sites data
    const sitesWithSetupInfo = sites.map((site) => {
      // Find all setups for this domain
      const domainSetups = setupData.filter(
        (setup) => setup.domain_name === site.domain
      );

      let setupInfo = null;
      if (domainSetups.length > 0) {
        // Priority: completed > in_progress > failed
        // This ensures completed status is always shown when multiple entries exist
        setupInfo =
          domainSetups.find((setup) => setup.setup_status === "completed") ||
          domainSetups.find((setup) => setup.setup_status === "in_progress") ||
          domainSetups.find((setup) => setup.setup_status === "failed");

        // Log when multiple entries exist for debugging
        if (domainSetups.length > 1) {
          const statuses = domainSetups.map((s) => s.setup_status).join(", ");
          logger.info(
            `Multiple setup entries found for domain ${site.domain}: [${statuses}]. Showing: ${setupInfo.setup_status}`,
            {
              domain: site.domain,
              totalEntries: domainSetups.length,
              selectedStatus: setupInfo.setup_status,
              allStatuses: statuses,
            }
          );
        }
      }

      return {
        ...site,
        setupInfo: setupInfo || null,
        hasSetupInfo: !!setupInfo,
      };
    });

    // Helper function for formatting file size
    const formatFileSize = (bytes) => {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    res.render("sites", {
      title: "Site Lists",
      sites: sitesWithSetupInfo,
      setupData: setupData,
      user: req.session.user,
      baseUrl: `${req.protocol}://${req.get("host")}`,
      formatFileSize: formatFileSize,
    });
  } catch (error) {
    logger.error(`Error loading sites list: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);

    // Clean up connection on error (development mode only)
    if (isDevelopment) {
      cleanupSshConnection();
    }

    res.status(500).render("error", {
      title: "Error",
      message: "Failed to load sites list",
      error: error.message,
    });
  }
});

// API endpoint to get sites data as JSON with pagination
router.get("/api/list", async (req, res) => {
  try {
    // Extract pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || 'domain';
    const sortOrder = req.query.sortOrder || 'asc';

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), 30000); // 30 second timeout
    });

    const result = await Promise.race([getSitesListAll(page, limit, sortBy, sortOrder), timeoutPromise]);

    res.json({
      success: true,
      message: "Sites retrieved successfully",
      data: result.sites,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error(`Error in API sites list: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);

    // Clean up connection on error (development mode only)
    if (isDevelopment) {
      cleanupSshConnection();
    }

    res.status(500).json({
      success: false,
      message: "Failed to retrieve sites list",
      error: error.message,
    });
  }
});

// API endpoint to get site details
router.get("/api/:domain", async (req, res) => {
  try {
    const { domain } = req.params;
    const sites = await getSitesList();
    const site = sites.find((s) => s.domain === domain);

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    res.json({
      success: true,
      message: "Site details retrieved successfully",
      data: site,
    });
  } catch (error) {
    logger.error(
      `Error getting site details for ${req.params.domain}: ${error.message}`
    );
    res.status(500).json({
      success: false,
      message: "Failed to retrieve site details",
      error: error.message,
    });
  }
});

// API endpoint to delete a site
router.delete("/api/:domain", requireAuth, async (req, res) => {
  try {
    const { domain } = req.params;
    const { force = true } = req.body; // Optional force parameter from request body

    // Log the deletion attempt
    logger.info(`Attempting to delete site: ${domain}`);

    // Validate domain parameter
    if (!domain || typeof domain !== "string" || domain.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Invalid domain parameter",
        error: "Domain is required and must be a non-empty string",
      });
    }

    // Check if site exists before deletion
    const sites = await getSitesList();
    const site = sites.find((s) => s.domain === domain);

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
        error: `No site found with domain: ${domain}`,
      });
    }

    // Check if there are setup records for this domain in the database
    let setupRecords = [];
    try {
      const allSetups = await databaseService.getAllSetups();
      setupRecords = allSetups.filter((setup) => setup.domain_name === domain);
      logger.info(
        `Found ${setupRecords.length} setup record(s) for domain: ${domain}`
      );
    } catch (dbError) {
      logger.warn(
        `Failed to check setup records for ${domain}: ${dbError.message}`
      );
    }

    // Execute the site deletion using CloudPanel service
    const result = await cloudpanel.deleteSite(domain, force);
    console.log(result);

    if (result.includes("has been deleted")) {
      logger.success(`Site ${domain} deleted successfully from CloudPanel`);

      // Also delete setup records from database if they exist
      let deletedSetupRecords = 0;
      if (setupRecords.length > 0) {
        try {
          for (const setupRecord of setupRecords) {
            const deletedCount = await databaseService.deleteSetup(
              setupRecord.id
            );
            if (deletedCount > 0) {
              deletedSetupRecords++;
              logger.info(
                `Deleted setup record ID ${setupRecord.id} for domain: ${domain}`
              );
            }
          }

          if (deletedSetupRecords > 0) {
            logger.success(
              `Deleted ${deletedSetupRecords} setup record(s) for domain: ${domain}`
            );
          }
        } catch (dbError) {
          logger.error(
            `Failed to delete setup records for ${domain}: ${dbError.message}`
          );
          // Continue with success response even if database cleanup fails
        }
      }

      // Prepare success response
      let responseMessage = `Site ${domain} has been deleted successfully`;
      if (deletedSetupRecords > 0) {
        responseMessage += ` and ${deletedSetupRecords} related setup record(s) have been removed from database`;
      }

      res.json({
        success: true,
        message: responseMessage,
        data: {
          domain: domain,
          deletedAt: new Date().toISOString(),
          setupRecordsDeleted: deletedSetupRecords,
          ...result.data,
        },
      });
    } else {
      logger.error(`Failed to delete site ${domain}: ${result.error}`);
      res.status(500).json({
        success: false,
        message: `Failed to delete site ${domain}`,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error(`Error deleting site ${req.params.domain}: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to delete site",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});


// Route to display setup history page
router.get("/setup-history", async (req, res) => {
  try {
    // Get all setup records from database
    const setupData = await databaseService.getAllSetups();
    // Get all sites with timeout protection
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), 30000); // 30 second timeout
    });
    const sites = await Promise.race([getSitesList(), timeoutPromise]);
    // Create sets for efficient lookup
    const sitesDomains = new Set(sites.map((site) => site.domain));
    const dbDomains = new Set(setupData.map((setup) => setup.domain_name));

    // Find domains that exist in database but not in sites
    const domainsToDelete = [...dbDomains].filter(
      (domain) => !sitesDomains.has(domain)
    );

    // Delete records for non-existent domains
    if (domainsToDelete.length > 0) {
      logger.info(
        `Found ${domainsToDelete.length} database records to delete for non-existent domains`
      );

      for (const domain of domainsToDelete) {
        // Find all setup records for this domain
        const recordsToDelete = setupData.filter(
          (setup) => setup.domain_name === domain
        );

        for (const record of recordsToDelete) {
          try {
            await databaseService.deleteSetup(record.id);
            logger.success(
              `Deleted setup record ID ${record.id} for non-existent domain: ${domain}`
            );
          } catch (deleteError) {
            logger.error(
              `Failed to delete setup record ID ${record.id} for domain ${domain}: ${deleteError.message}`
            );
          }
        }
      }

      // Refresh setup data after deletions
      const updatedSetupData = await databaseService.getAllSetups();
      setupData.length = 0;
      setupData.push(...updatedSetupData);
    }

    // Synchronize setup data with sites data - add comprehensive site information
    const setupDataWithSiteInfo = setupData.map((setup) => {
      const site = sites.find((s) => s.domain === setup.domain_name);

      if (site) {
        // Site exists - add comprehensive site information
        return {
          ...setup,
          siteUser: site.user,
          siteType: site.type,
          siteFramework: site.framework,
          sitePath: site.path,
          siteSSL: site.ssl,
          siteCreated: site.created,
          siteModified: site.modified,
          siteSize: site.size,
          siteExists: true,
          // Keep the original site_user from database if it exists, otherwise use from sites
          siteUserFromDB: setup.site_user || site.user,
        };
      } else {
        // Site doesn't exist in filesystem but has database record
        return {
          ...setup,
          siteUser: setup.site_user || null, // Use database value if available
          siteType: null,
          siteFramework: null,
          sitePath: null,
          siteSSL: false,
          siteCreated: null,
          siteModified: null,
          siteSize: 0,
          siteExists: false,
          siteUserFromDB: setup.site_user || null,
        };
      }
    });

    // Also add sites that don't have setup records (new sites) - only Laravel sites
    const sitesWithoutSetup = sites.filter(
      (site) =>
        !setupData.some((setup) => setup.domain_name === site.domain) &&
        site.type === "PHP" &&
        site.framework === "Laravel"
    );

    // Create setup-like records for sites without setup history (Laravel only)
    const sitesAsSetupRecords = sitesWithoutSetup.map((site) => ({
      id: null, // No database ID since it's not in setup table
      job_id: null,
      domain_name: site.domain,
      php_version: "8.3", // Default PHP version for Laravel
      vhost_template: "Laravel 12", // Default template for Laravel
      site_user: site.user,
      database_name: null,
      database_user_name: null,
      database_password: null,
      repository_url: null,
      run_migrations: false,
      run_seeders: false,
      optimize_cache: false,
      install_composer: false,
      site_created: true, // Site exists, so it was created
      database_created: false,
      ssh_keys_copied: false,
      repository_cloned: false,
      env_configured: false,
      laravel_setup_completed: false,
      setup_status: "manual", // Indicate this was created manually, not through our setup process
      error_message: null,
      created_at: site.created,
      // Additional site information
      siteUser: site.user,
      siteType: site.type,
      siteFramework: site.framework,
      sitePath: site.path,
      siteSSL: site.ssl,
      siteCreated: site.created,
      siteModified: site.modified,
      siteSize: site.size,
      siteExists: true,
      siteUserFromDB: site.user,
    }));

    // Combine setup records with sites that don't have setup records
    const allSetupData = [...setupDataWithSiteInfo, ...sitesAsSetupRecords];

    // Helper function for formatting file size
    const formatFileSize = (bytes) => {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    res.render("setup-history", {
      title: "Setup History",
      setupData: allSetupData,
      user: req.session.user,
      baseUrl: `${req.protocol}://${req.get("host")}`,
      formatFileSize: formatFileSize,
      process: {
        env: {
          VPS_HOST: process.env.VPS_HOST || null,
          NODE_ENV: process.env.NODE_ENV || "development",
        },
      },
    });
  } catch (error) {
    logger.error(`Error loading setup history: ${error.message}`);
    res.status(500).render("error", {
      title: "Error",
      message: "Failed to load setup history",
      error: error.message,
    });
  }
});

// API endpoint to get setup history as JSON
router.get("/api/setup-history", async (req, res) => {
  try {
    // Get all setup records from database
    const setupData = await databaseService.getAllSetups();

    // Get all sites with timeout protection
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), 30000); // 30 second timeout
    });
    const sites = await Promise.race([getSitesList(), timeoutPromise]);

    // Synchronize setup data with sites data - add comprehensive site information
    const setupDataWithSiteInfo = setupData.map((setup) => {
      const site = sites.find((s) => s.domain === setup.domain_name);

      if (site) {
        // Site exists - add comprehensive site information
        return {
          ...setup,
          siteUser: site.user,
          siteType: site.type,
          siteFramework: site.framework,
          sitePath: site.path,
          siteSSL: site.ssl,
          siteCreated: site.created,
          siteModified: site.modified,
          siteSize: site.size,
          siteExists: true,
          // Keep the original site_user from database if it exists, otherwise use from sites
          siteUserFromDB: setup.site_user || site.user,
        };
      } else {
        // Site doesn't exist in filesystem but has database record
        return {
          ...setup,
          siteUser: setup.site_user || null, // Use database value if available
          siteType: null,
          siteFramework: null,
          sitePath: null,
          siteSSL: false,
          siteCreated: null,
          siteModified: null,
          siteSize: 0,
          siteExists: false,
          siteUserFromDB: setup.site_user || null,
        };
      }
    });

    // Also add sites that don't have setup records (new sites)
    const sitesWithoutSetup = sites.filter(
      (site) => !setupData.some((setup) => setup.domain_name === site.domain)
    );

    // Create setup-like records for sites without setup history
    const sitesAsSetupRecords = sitesWithoutSetup.map((site) => ({
      id: null, // No database ID since it's not in setup table
      job_id: null,
      domain_name: site.domain,
      php_version: null,
      vhost_template: null,
      site_user: site.user,
      database_name: null,
      database_user_name: null,
      database_password: null,
      repository_url: null,
      run_migrations: false,
      run_seeders: false,
      optimize_cache: false,
      install_composer: false,
      site_created: true, // Site exists, so it was created
      database_created: false,
      ssh_keys_copied: false,
      repository_cloned: false,
      env_configured: false,
      laravel_setup_completed: false,
      setup_status: "manual", // Indicate this was created manually, not through our setup process
      error_message: null,
      created_at: site.created,
      // Additional site information
      siteUser: site.user,
      siteType: site.type,
      siteFramework: site.framework,
      sitePath: site.path,
      siteSSL: site.ssl,
      siteCreated: site.created,
      siteModified: site.modified,
      siteSize: site.size,
      siteExists: true,
      siteUserFromDB: site.user,
    }));

    // Combine setup records with sites that don't have setup records
    const allSetupData = [...setupDataWithSiteInfo, ...sitesAsSetupRecords];

    res.json({
      success: true,
      message: "Setup history retrieved successfully",
      data: allSetupData,
      total: allSetupData.length,
      summary: {
        totalSites: sites.length,
        totalSetupRecords: setupData.length,
        sitesWithSetup: setupDataWithSiteInfo.filter((s) => s.siteExists)
          .length,
        sitesWithoutSetup: sitesWithoutSetup.length,
        orphanedSetupRecords: setupDataWithSiteInfo.filter((s) => !s.siteExists)
          .length,
      },
    });
  } catch (error) {
    logger.error(`Error in API setup history: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve setup history",
      error: error.message,
    });
  }
});

// API endpoint to delete a setup record
router.delete("/api/setup-history/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { deleteFromCloudPanel = true } = req.body; // Optional parameter to also delete from CloudPanel

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid setup ID provided",
      });
    }

    // Check if setup exists and get its details
    const setupData = await databaseService.getAllSetups();
    const setupToDelete = setupData.find((setup) => setup.id === parseInt(id));

    if (!setupToDelete) {
      return res.status(404).json({
        success: false,
        message: "Setup record not found",
      });
    }

    let cloudPanelResult = null;
    let cloudPanelMessage = "";

    // If requested, also try to delete from CloudPanel
    if (deleteFromCloudPanel && setupToDelete.domain_name) {
      // Only delete from CloudPanel if setup status is "completed"
      if (setupToDelete.setup_status === "completed") {
        try {
          logger.info(
            `Setup status is completed. Attempting to delete site from CloudPanel: ${setupToDelete.domain_name}`
          );

          // Try to delete the site from CloudPanel
          const deleteResult = await cloudpanel.deleteSite(
            setupToDelete.domain_name,
            true
          );

          if (
            deleteResult &&
            typeof deleteResult === "string" &&
            deleteResult.includes("has been deleted")
          ) {
            cloudPanelResult = { success: true, message: deleteResult };
            cloudPanelMessage = `Site '${setupToDelete.domain_name}' successfully deleted from CloudPanel.`;
            logger.success(
              `Site ${setupToDelete.domain_name} deleted from CloudPanel successfully`
            );
          } else if (deleteResult && deleteResult.error) {
            // Site deletion failed, but continue with database deletion
            cloudPanelResult = { success: false, error: deleteResult.error };
            if (
              deleteResult.error.includes("not found") ||
              deleteResult.error.includes("does not exist") ||
              deleteResult.error.includes("No site found")
            ) {
              cloudPanelMessage = `Site '${setupToDelete.domain_name}' not found in CloudPanel (may have been deleted manually).`;
            } else {
              cloudPanelMessage = `Failed to delete site '${setupToDelete.domain_name}' from CloudPanel: ${deleteResult.error}`;
            }
            logger.warn(
              `CloudPanel site deletion warning for ${setupToDelete.domain_name}: ${deleteResult.error}`
            );
          } else {
            cloudPanelResult = {
              success: false,
              error: "Unknown response from CloudPanel",
            };
            cloudPanelMessage = `Unexpected response when deleting site '${setupToDelete.domain_name}' from CloudPanel.`;
            logger.warn(
              `Unexpected CloudPanel response for ${setupToDelete.domain_name}: ${deleteResult}`
            );
          }
        } catch (cloudPanelError) {
          // CloudPanel deletion failed, but continue with database deletion
          cloudPanelResult = { success: false, error: cloudPanelError.message };
          if (
            cloudPanelError.message &&
            (cloudPanelError.message.includes("not found") ||
              cloudPanelError.message.includes("does not exist") ||
              cloudPanelError.message.includes("No site found"))
          ) {
            cloudPanelMessage = `Site '${setupToDelete.domain_name}' not found in CloudPanel (may have been deleted manually).`;
          } else {
            cloudPanelMessage = `Error deleting site '${setupToDelete.domain_name}' from CloudPanel: ${cloudPanelError.message}`;
          }
          logger.error(
            `CloudPanel deletion error for ${setupToDelete.domain_name}: ${cloudPanelError.message}`
          );
        }
      } else {
        // Setup status is not completed, skip CloudPanel deletion
        cloudPanelResult = { success: true, skipped: true };
        cloudPanelMessage = `Setup status is '${setupToDelete.setup_status}', skipping CloudPanel deletion for '${setupToDelete.domain_name}'.`;
        logger.info(
          `Skipping CloudPanel deletion for ${setupToDelete.domain_name} - setup status: ${setupToDelete.setup_status}`
        );
      }
    }

    // Delete the setup record from database
    const deletedCount = await databaseService.deleteSetup(parseInt(id));

    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Setup record not found or already deleted from database",
      });
    }

    logger.info(
      `Setup record deleted from database: ID ${id}, Domain: ${setupToDelete.domain_name}`
    );

    // Prepare response message
    let responseMessage = "Setup record deleted successfully from database.";
    if (deleteFromCloudPanel) {
      responseMessage += ` ${cloudPanelMessage}`;
    }

    // Prepare response data
    const responseData = {
      database: {
        success: true,
        message: "Setup record deleted from database successfully",
        deletedSetup: {
          id: setupToDelete.id,
          domain_name: setupToDelete.domain_name,
          created_at: setupToDelete.created_at,
        },
      },
    };

    if (deleteFromCloudPanel) {
      responseData.cloudPanel = cloudPanelResult || {
        success: false,
        message: "CloudPanel deletion was not attempted",
      };
    }

    res.json({
      success: true,
      message: responseMessage,
      data: responseData,
    });
  } catch (error) {
    logger.error(`Error deleting setup record: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to delete setup record",
      error: error.message,
    });
  }
});

// Route to check cronjob permissions for a user
router.post("/check-cronjob-permissions", requireAuth, async (req, res) => {
  try {
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    logger.info(`Checking cronjob permissions for user: ${userName}`);

    // Execute crontab -e command for the user to check permissions
    const command = `su - ${userName} -c 'crontab -l'`;

    let result;
    if (isDevelopment) {
      const sshResult = await executeSshCommand(command);
      logger.info(sshResult);
      result = {
        success: true,
        hasPermission: true,
        message: "User has cronjob permissions",
        output: sshResult.output || "Permission check completed",
      };
    } else {
      // Execute locally in production
      const execAsync = promisify(exec);
      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: 30000, // 30 second timeout
          env: { ...process.env },
        });
        result = {
          success: true,
          hasPermission: true,
          message: "User has cronjob permissions",
          output: stdout || "Permission check completed",
        };
      } catch (error) {
        // Check if the error is "Operation not permitted"
        if (error.stderr && error.stderr.includes("Operation not permitted")) {
          result = {
            success: true,
            hasPermission: false,
            message: "User does not have cronjob permissions",
            error: "Operation not permitted",
            stderr: error.stderr,
          };
        } else if (error.stderr && error.stderr.includes("no crontab for")) {
          result = {
            success: true,
            hasPermission: true,
            message: "User has cronjob permissions",
            error: "No crontab for",
            stderr: error.stderr,
          };
        } else {
          // Other errors
          result = {
            success: false,
            hasPermission: false,
            message: "Failed to check cronjob permissions",
            error: error.message,
            stderr: error.stderr,
          };
        }
      }
    }

    res.json(result);
  } catch (error) {
    logger.error("Failed to check cronjob permissions:", error);
    if (error.stderr && error.stderr.includes("no crontab for")) {
      return res.status(200).json({
        success: true,
        hasPermission: true,
        message: "User has cronjob permissions",
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to check cronjob permissions",
      error: error.message,
    });
  }
});

// Route to grant cronjob permissions for a user
router.post("/grant-cronjob-permissions", requireAuth, async (req, res) => {
  try {
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    logger.info(`Granting cronjob permissions for user: ${userName}`);

    // Commands to grant cronjob permissions
    // First, ensure the crontab file exists and has correct ownership
    // chown u295s18019:crontab /var/spool/cron/crontabs/u295s18019
    // chmod 600 /var/spool/cron/crontabs/u295s18019

    const touchCommand = `touch /var/spool/cron/crontabs/${userName}`;
    const chownCommand = `chown ${userName}:crontab /var/spool/cron/crontabs/${userName}`;
    const chmodCommand = `chmod 600 /var/spool/cron/crontabs/${userName}`;

    // Alternative approach: add user to crontab group if it exists
    const usermodCommand = `usermod -a -G crontab ${userName}`;

    let result;
    if (isDevelopment) {
      // Execute commands via SSH
      try {
        const touchResult = await executeSshCommand(touchCommand);
        const chownResult = await executeSshCommand(chownCommand);
        const chmodResult = await executeSshCommand(chmodCommand);

        let usermodResult = null;

        result = {
          success: true,
          hasPermission: true,
          message: "Cronjob permissions granted successfully",
          output: `touch: ${touchResult.output || "OK"}, chown: ${
            chownResult.output || "OK"
          }, chmod: ${chmodResult.output || "OK"}${
            usermodResult
              ? `, usermod: ${usermodResult.output || "OK"}`
              : ", usermod: skipped (group not found)"
          }`,
        };
      } catch (error) {
        result = {
          success: false,
          hasPermission: false,
          message: "Failed to grant cronjob permissions",
          error: error.message || error,
        };
      }
    } else {
      // Execute locally in production
      const execAsync = promisify(exec);
      try {
        // Execute touch command to ensure file exists
        const touchResult = await execAsync(touchCommand, {
          timeout: 30000,
          env: { ...process.env },
        });

        // Execute chown command
        const chownResult = await execAsync(chownCommand, {
          timeout: 30000,
          env: { ...process.env },
        });

        // Execute chmod command
        const chmodResult = await execAsync(chmodCommand, {
          timeout: 30000,
          env: { ...process.env },
        });

        // Try to add user to crontab group (this might fail if group doesn't exist, which is OK)
        let usermodResult = null;
        try {
          usermodResult = await execAsync(usermodCommand, {
            timeout: 30000,
            env: { ...process.env },
          });
        } catch (usermodError) {
          // Ignore usermod errors - group might not exist
          logger.info(
            `usermod command failed (this is normal if crontab group doesn't exist): ${usermodError.message}`
          );
        }

        result = {
          success: true,
          hasPermission: true,
          message: "Cronjob permissions granted successfully",
          output: `touch: ${touchResult.stdout || "OK"}, chown: ${
            chownResult.stdout || "OK"
          }, chmod: ${chmodResult.stdout || "OK"}${
            usermodResult
              ? `, usermod: ${usermodResult.stdout || "OK"}`
              : ", usermod: skipped (group not found)"
          }`,
        };
      } catch (error) {
        result = {
          success: false,
          hasPermission: false,
          message: "Failed to grant cronjob permissions",
          error: error.message,
          stderr: error.stderr,
        };
      }
    }

    res.json(result);
  } catch (error) {
    logger.error("Failed to grant cronjob permissions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to grant cronjob permissions",
      error: error.message,
    });
  }
});

// Route to perform git pull for a specific site (background processing)
router.post(
  "/:siteUser/:domainName/git-pull",
  requireAuth,
  async (req, res) => {
    const jobQueue = require("../services/jobQueue");

    try {
      const { siteUser, domainName } = req.params;

      // Validate parameters
      if (!siteUser || !domainName) {
        return res.status(400).json({
          success: false,
          message: "Site user and domain name are required",
        });
      }

      logger.info(
        `Git pull requested for domain: ${domainName}, user: ${siteUser}`
      );

      // Construct the site path for validation
      const sitePath = `/home/${siteUser}/htdocs/${domainName}`;

      // Quick validation - check if site directory exists and is a git repository
      const checkGitCommand = `su - ${siteUser} -c 'if [ -d "${sitePath}" ]; then cd "${sitePath}" && if [ -d ".git" ]; then echo "GIT_REPO_EXISTS"; else echo "NOT_A_GIT_REPO"; fi; else echo "SITE_NOT_FOUND"; fi'`;

      let checkResult;
      if (isDevelopment) {
        const sshResult = await executeSshCommand(checkGitCommand);
        checkResult = sshResult.output || sshResult.stdout || "";
      } else {
        // In production, execute locally
        const execAsync = promisify(exec);
        const result = await execAsync(checkGitCommand);
        checkResult = result.stdout.trim();
      }

      // Ensure checkResult is a string
      if (typeof checkResult !== "string") {
        checkResult = String(checkResult);
      }

      // Handle validation errors immediately
      if (checkResult.includes("SITE_NOT_FOUND")) {
        return res.status(404).json({
          success: false,
          message: `Site directory not found: ${sitePath}`,
          details: {
            sitePath,
            siteUser,
            domainName,
          },
        });
      }

      if (checkResult.includes("NOT_A_GIT_REPO")) {
        return res.status(400).json({
          success: false,
          message: `Directory exists but is not a git repository: ${sitePath}`,
          details: {
            sitePath,
            siteUser,
            domainName,
            suggestion:
              "This site was not created from a git repository or the .git directory is missing",
          },
        });
      }

      // If it's a valid git repository, add job to queue
      if (checkResult.includes("GIT_REPO_EXISTS")) {
        // Create job data
        const jobData = {
          siteUser,
          domainName,
          sitePath,
          timestamp: new Date().toISOString(),
        };

        // Add job to queue with high priority (0 = highest priority)
        const job = await jobQueue.addJob("git_pull", jobData, 0);

        logger.info(
          `Git pull job queued for domain: ${domainName}, job ID: ${job.id}`
        );

        return res.json({
          success: true,
          message: `Git pull job has been queued and will be processed in the background`,
          jobId: job.id,
          details: {
            sitePath,
            siteUser,
            domainName,
            jobType: "git_pull",
            queuePosition: "High priority",
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Fallback case
      return res.status(500).json({
        success: false,
        message: "Unexpected error occurred while checking git repository",
        details: {
          checkResult,
          sitePath,
          siteUser,
          domainName,
        },
      });
    } catch (error) {
      logger.error(
        `Error queuing git pull for ${req.params.domainName}: ${error.message}`
      );

      return res.status(500).json({
        success: false,
        message: "Failed to queue git pull job",
        error: error.message,
        details: {
          siteUser: req.params.siteUser,
          domainName: req.params.domainName,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

// Batch git pull for completed sites
router.post("/batch-git-pull", requireAuth, async (req, res) => {
  try {
    const { sites } = req.body;
    if (!Array.isArray(sites) || sites.length === 0) {
      return res
        .status(400)
        .json({ error: "No sites provided for batch git pull" });
    }

    // Add git pull jobs to queue for each site
    const jobPromises = sites.map((site) => {
      const sitePath = `/home/${site.siteUser}/htdocs/${site.domain}`;
      const jobData = {
        siteUser: site.siteUser,
        domainName: site.domain,
        sitePath: sitePath,
        timestamp: new Date().toISOString(),
      };
      return jobQueue.addJob("git_pull", jobData, 0); // Priority 1 for background tasks
    });

    await Promise.all(jobPromises);

    res.json({
      message: "Batch git pull jobs queued successfully",
      jobCount: sites.length,
    });
  } catch (error) {
    logger.error("Error in batch git pull:", error);
    res.status(500).json({ error: "Failed to queue batch git pull jobs" });
  }
});

// Route to check and fix crontab permissions for all users in batch
router.post(
  "/batch-check-cronjob-permissions",
  requireAuth,
  async (req, res) => {
    try {
      logger.info(
        "Starting batch crontab permission check and fix for all users"
      );

      // Get all unique users from sites filesystem only (not from database)
      let allUsers = [];
      try {
        let sites = await getSitesList();
        sites = sites.filter((site) => site.framework === "Laravel");
        const uniqueUsers = new Set();

        sites.forEach((site) => {
          if (site.user) {
            uniqueUsers.add(site.user);
          }
        });

        allUsers = Array.from(uniqueUsers);
        logger.info(
          `Found ${allUsers.length} unique users from sites filesystem for batch crontab permission check`
        );
      } catch (sitesError) {
        logger.warn(`Failed to get users from sites: ${sitesError.message}`);
        // Continue with empty user list
      }

      if (allUsers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No users found for batch crontab permission check",
          data: {
            totalUsers: 0,
            processedUsers: 0,
            successfulChecks: 0,
            failedChecks: 0,
            usersWithPermissions: 0,
            usersWithoutPermissions: 0,
            usersFixed: 0,
            results: [],
          },
        });
      }

      const results = [];
      let successfulChecks = 0;
      let failedChecks = 0;
      let usersWithPermissions = 0;
      let usersWithoutPermissions = 0;
      let usersFixed = 0;

      // Process each user
      for (const userName of allUsers) {
        try {
          logger.info(`Processing crontab permissions for user: ${userName}`);

          // Step 1: Check current permissions
          const checkCommand = `su - ${userName} -c 'crontab -l'`;
          let checkResult;

          if (isDevelopment) {
            try {
              const sshResult = await executeSshCommand(checkCommand);
              checkResult = {
                success: true,
                hasPermission: true,
                message: "User has cronjob permissions",
                output: sshResult.output || "Permission check completed",
              };
            } catch (sshError) {
              // Check if the error is "Operation not permitted"
              if (
                sshError.stderr &&
                sshError.stderr.includes("Operation not permitted")
              ) {
                logger.error(`Operation not permitted for user: ${userName}`);
                checkResult = {
                  success: true,
                  hasPermission: false,
                  message: "User does not have cronjob permissions",
                  error: "Operation not permitted",
                  stderr: sshError.stderr,
                };
              } else if (
                sshError.stderr &&
                sshError.stderr.includes("no crontab for")
              ) {
                checkResult = {
                  success: true,
                  hasPermission: true,
                  message: "User has cronjob permissions",
                  error: "No crontab for",
                  stderr: sshError.stderr,
                };
              } else {
                checkResult = {
                  success: false,
                  hasPermission: false,
                  message: "Failed to check cronjob permissions",
                  error: sshError.message,
                  stderr: sshError.stderr,
                };
              }
            }
          } else {
            // Execute locally in production
            const execAsync = promisify(exec);
            try {
              const { stdout, stderr } = await execAsync(checkCommand, {
                timeout: 30000,
                env: { ...process.env },
              });

              checkResult = {
                success: true,
                hasPermission: true,
                message: "User has cronjob permissions",
                output: stdout || "Permission check completed",
              };
            } catch (error) {
              // Check if the error is "Operation not permitted"
              if (
                error.stderr &&
                error.stderr.includes("Operation not permitted")
              ) {
                checkResult = {
                  success: true,
                  hasPermission: false,
                  message: "User does not have cronjob permissions",
                  error: "Operation not permitted",
                  stderr: error.stderr,
                };
              } else if (
                error.stderr &&
                error.stderr.includes("no crontab for")
              ) {
                checkResult = {
                  success: true,
                  hasPermission: true,
                  message: "User has cronjob permissions",
                  error: "No crontab for",
                  stderr: error.stderr,
                };
              } else {
                checkResult = {
                  success: false,
                  hasPermission: false,
                  message: "Failed to check cronjob permissions",
                  error: error.message,
                  stderr: error.stderr,
                };
              }
            }
          }

          // Step 2: If user doesn't have permissions, try to fix them
          let fixResult = null;
          if (checkResult.success && !checkResult.hasPermission) {
            logger.info(
              `Attempting to fix crontab permissions for user: ${userName}`
            );

            // Commands to grant cronjob permissions
            const touchCommand = `touch /var/spool/cron/crontabs/${userName}`;
            const chownCommand = `chown ${userName}:crontab /var/spool/cron/crontabs/${userName}`;
            const chmodCommand = `chmod 600 /var/spool/cron/crontabs/${userName}`;
            // const usermodCommand = `usermod -a -G crontab ${userName}`;

            try {
              if (isDevelopment) {
                // Execute commands via SSH
                const touchResult = await executeSshCommand(touchCommand);
                const chownResult = await executeSshCommand(chownCommand);
                const chmodResult = await executeSshCommand(chmodCommand);

                let usermodResult = null;
                // try {
                //   usermodResult = await executeSshCommand(usermodCommand);
                // } catch (usermodError) {
                //   // Ignore usermod errors - group might not exist
                //   logger.info(`usermod command failed for ${userName} (this is normal if crontab group doesn't exist): ${usermodError.message}`);
                // }

                fixResult = {
                  success: true,
                  message: "Cronjob permissions granted successfully",
                  output: `touch: ${touchResult.output || "OK"}, chown: ${
                    chownResult.output || "OK"
                  }, chmod: ${chmodResult.output || "OK"}${
                    usermodResult
                      ? `, usermod: ${usermodResult.output || "OK"}`
                      : ", usermod: skipped (group not found)"
                  }`,
                };
              } else {
                // Execute locally in production
                const execAsync = promisify(exec);

                // Execute touch command to ensure file exists
                const touchResult = await execAsync(touchCommand, {
                  timeout: 30000,
                  env: { ...process.env },
                });

                // Execute chown command
                const chownResult = await execAsync(chownCommand, {
                  timeout: 30000,
                  env: { ...process.env },
                });

                // Execute chmod command
                const chmodResult = await execAsync(chmodCommand, {
                  timeout: 30000,
                  env: { ...process.env },
                });

                // Try to add user to crontab group (this might fail if group doesn't exist, which is OK)
                let usermodResult = null;
                try {
                  usermodResult = await execAsync(usermodCommand, {
                    timeout: 30000,
                    env: { ...process.env },
                  });
                } catch (usermodError) {
                  // Ignore usermod errors - group might not exist
                  logger.info(
                    `usermod command failed for ${userName} (this is normal if crontab group doesn't exist): ${usermodError.message}`
                  );
                }

                fixResult = {
                  success: true,
                  message: "Cronjob permissions granted successfully",
                  output: `touch: ${touchResult.stdout || "OK"}, chown: ${
                    chownResult.stdout || "OK"
                  }, chmod: ${chmodResult.stdout || "OK"}${
                    usermodResult
                      ? `, usermod: ${usermodResult.stdout || "OK"}`
                      : ", usermod: skipped (group not found)"
                  }`,
                };
              }

              usersFixed++;
              logger.success(
                `Successfully fixed crontab permissions for user: ${userName}`
              );
            } catch (fixError) {
              fixResult = {
                success: false,
                message: "Failed to grant cronjob permissions",
                error: fixError.message || fixError,
                stderr: fixError.stderr,
              };
              logger.error(
                `Failed to fix crontab permissions for user ${userName}: ${fixError.message}`
              );
            }
          }

          // Step 3: Verify permissions after fix (if fix was attempted)
          let finalCheckResult = null;
          if (fixResult && fixResult.success) {
            logger.info(
              `Verifying crontab permissions for user after fix: ${userName}`
            );

            // Wait a moment for changes to take effect
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const verifyCommand = `su - ${userName} -c 'crontab -l'`;

            try {
              if (isDevelopment) {
                const sshResult = await executeSshCommand(verifyCommand);
                finalCheckResult = {
                  success: true,
                  hasPermission: true,
                  message:
                    "User now has cronjob permissions (verified after fix)",
                  output:
                    sshResult.output || "Permission verification completed",
                };
              } else {
                const execAsync = promisify(exec);
                const { stdout, stderr } = await execAsync(verifyCommand, {
                  timeout: 30000,
                  env: { ...process.env },
                });

                finalCheckResult = {
                  success: true,
                  hasPermission: true,
                  message:
                    "User now has cronjob permissions (verified after fix)",
                  output: stdout || "Permission verification completed",
                };
              }
            } catch (verifyError) {
              finalCheckResult = {
                success: false,
                hasPermission: false,
                message:
                  "User still does not have cronjob permissions after fix attempt",
                error: verifyError.message,
                stderr: verifyError.stderr,
              };
            }
          }

          // Compile result for this user
          const userResult = {
            userName,
            initialCheck: checkResult,
            fixAttempt: fixResult,
            finalCheck: finalCheckResult,
            status: checkResult.success
              ? checkResult.hasPermission
                ? "has_permissions"
                : fixResult && fixResult.success
                ? "fixed"
                : "failed_to_fix"
              : "check_failed",
          };

          results.push(userResult);
          successfulChecks++;

          if (checkResult.hasPermission) {
            usersWithPermissions++;
          } else {
            usersWithoutPermissions++;
          }

          logger.info(
            `Completed processing for user ${userName}: ${userResult.status}`
          );
        } catch (userError) {
          logger.error(
            `Error processing user ${userName}: ${userError.message}`
          );
          failedChecks++;

          results.push({
            userName,
            error: userError.message,
            status: "error",
          });
        }
      }

      // Prepare summary
      const summary = {
        totalUsers: allUsers.length,
        processedUsers: results.length,
        successfulChecks,
        failedChecks,
        usersWithPermissions,
        usersWithoutPermissions,
        usersFixed,
        successRate:
          allUsers.length > 0
            ? ((successfulChecks / allUsers.length) * 100).toFixed(1)
            : 0,
      };

      logger.success(
        `Batch crontab permission check completed. Summary: ${JSON.stringify(
          summary
        )}`
      );

      res.json({
        success: true,
        message: `Batch crontab permission check completed for ${allUsers.length} users`,
        data: {
          ...summary,
          results,
        },
      });
    } catch (error) {
      logger.error("Failed to perform batch crontab permission check:", error);
      res.status(500).json({
        success: false,
        message: "Failed to perform batch crontab permission check",
        error: error.message,
      });
    }
  }
);

async function getSitesListAll(page = 1, limit = 10, sortBy = 'domain', sortOrder = 'asc') {
  try {
    const sites = [];
    
    // Validate pagination parameters
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.max(1, Math.min(100, parseInt(limit) || 10)); // Max 100 items per page
    sortBy = ['domain', 'user', 'type', 'created', 'modified', 'size'].includes(sortBy) ? sortBy : 'domain';
    sortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'asc';

    if (isDevelopment) {
      // Validate SSH configuration in development mode
      if (!validateSshConfig()) {
        throw new Error("Invalid SSH configuration for development mode");
      }

      // First, let's debug by checking what directories exist
      const debugCommand = `ls -la /home/`;
      const debugResult = await executeSshCommand(debugCommand);

      // Simplified approach - check each known user directory
      const checkUsersCommand = `
        for user_dir in /home/*; do
          if [ -d "$user_dir" ]; then
            user=$(basename "$user_dir")
            echo "USER_FOUND:$user"
          fi
        done
        `;

      const usersResult = await executeSshCommand(checkUsersCommand);
      const userLines = usersResult.output
        .split("\n")
        .filter((line) => line.startsWith("USER_FOUND:"));

      for (const userLine of userLines) {
        const user = userLine.replace("USER_FOUND:", "");

        // Skip system directories
        if (["mysql", "setup", "clp"].includes(user)) continue;

        // Check for htdocs and domains
        const domainsCommand = `
          htdocs_path="/home/${user}/htdocs"
          if [ -d "$htdocs_path" ]; then
            for domain_path in "$htdocs_path"/*; do
              if [ -d "$domain_path" ]; then
                domain=$(basename "$domain_path")
                
                # Get basic file info
                stat_output=$(stat -c "%Y %Z %s" "$domain_path" 2>/dev/null || echo "0 0 0")
                
                # Determine site type with more comprehensive and accurate checks
                site_type="Static"
                site_framework=""
                
                # Priority 1: Check for Laravel (most specific PHP framework)
                if [ -f "$domain_path/artisan" ] && [ -f "$domain_path/composer.json" ]; then
                  if grep -q "laravel/framework" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Laravel"
                  elif [ -d "$domain_path/app" ] && [ -d "$domain_path/config" ] && [ -d "$domain_path/resources" ]; then
                    site_type="Laravel"
                  elif grep -q "lumen" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Lumen"
                  else
                    site_type="PHP"
                  fi
                
                # Priority 2: WordPress (most common CMS)
                elif [ -f "$domain_path/wp-config.php" ] || [ -f "$domain_path/wp-config-sample.php" ] || \
                     ([ -d "$domain_path/wp-content" ] && [ -d "$domain_path/wp-includes" ]); then
                  site_type="WordPress"
                
                # Priority 3: Other PHP frameworks via composer.json
                elif [ -f "$domain_path/composer.json" ]; then
                  if grep -q "symfony/framework\\|symfony/symfony" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Symfony"
                  elif grep -q "codeigniter4/framework\\|codeigniter/framework" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="CodeIgniter"
                  elif grep -q "cakephp/cakephp" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="CakePHP"
                  elif grep -q "zendframework\\|laminas" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Zend"
                  elif grep -q "yiisoft/yii2" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Yii"
                  elif grep -q "phalcon" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Phalcon"
                  elif grep -q "slim/slim" "$domain_path/composer.json" 2>/dev/null; then
                    site_type="Slim"
                  else
                    site_type="PHP"
                  fi
                
                # Priority 4: Node.js applications
                elif [ -f "$domain_path/package.json" ]; then
                  if grep -q "\\"next\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Next.js"
                  elif grep -q "\\"nuxt\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Nuxt.js"
                  elif grep -q "\\"@remix-run\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Remix"
                  elif grep -q "\\"gatsby\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Gatsby"
                  elif grep -q "\\"@nestjs\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="NestJS"
                  elif grep -q "\\"fastify\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Fastify"
                  elif grep -q "\\"koa\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Koa"
                  elif grep -q "\\"@hapi\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Hapi"
                  elif grep -q "\\"express\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Express"
                  elif grep -q "\\"react\\"\\|\\"@types/react\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="React"
                  elif grep -q "\\"vue\\"\\|\\"@vue\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Vue.js"
                  elif grep -q "\\"@angular\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Angular"
                  elif grep -q "\\"svelte\\"" "$domain_path/package.json" 2>/dev/null; then
                    if grep -q "\\"@sveltejs/kit\\"" "$domain_path/package.json" 2>/dev/null; then
                      site_type="SvelteKit"
                    else
                      site_type="Svelte"
                    fi
                  elif grep -q "\\"astro\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Astro"
                  elif grep -q "\\"@11ty/eleventy\\"" "$domain_path/package.json" 2>/dev/null; then
                    site_type="Eleventy"
                  else
                    site_type="Node.js"
                  fi
                
                # Priority 5: Python applications
                elif [ -f "$domain_path/requirements.txt" ] || [ -f "$domain_path/Pipfile" ] || [ -f "$domain_path/pyproject.toml" ]; then
                  if [ -f "$domain_path/manage.py" ]; then
                    site_type="Django"
                  elif grep -q "django\\|Django" "$domain_path/requirements.txt" 2>/dev/null || \
                       grep -q "django\\|Django" "$domain_path/Pipfile" 2>/dev/null; then
                    site_type="Django"
                  elif grep -q "flask\\|Flask" "$domain_path/requirements.txt" 2>/dev/null || \
                       grep -q "flask\\|Flask" "$domain_path/Pipfile" 2>/dev/null; then
                    site_type="Flask"
                  elif grep -q "fastapi\\|FastAPI" "$domain_path/requirements.txt" 2>/dev/null || \
                       grep -q "fastapi\\|FastAPI" "$domain_path/Pipfile" 2>/dev/null; then
                    site_type="FastAPI"
                  elif grep -q "pyramid" "$domain_path/requirements.txt" 2>/dev/null; then
                    site_type="Pyramid"
                  elif grep -q "tornado" "$domain_path/requirements.txt" 2>/dev/null; then
                    site_type="Tornado"
                  elif grep -q "bottle" "$domain_path/requirements.txt" 2>/dev/null; then
                    site_type="Bottle"
                  elif grep -q "sanic" "$domain_path/requirements.txt" 2>/dev/null; then
                    site_type="Sanic"
                  elif grep -q "starlette" "$domain_path/requirements.txt" 2>/dev/null; then
                    site_type="Starlette"
                  else
                    site_type="Python"
                  fi
                
                # Priority 6: Ruby applications
                elif [ -f "$domain_path/Gemfile" ]; then
                  if grep -q "rails\\|Rails" "$domain_path/Gemfile" 2>/dev/null; then
                    site_type="Ruby on Rails"
                  elif grep -q "sinatra" "$domain_path/Gemfile" 2>/dev/null; then
                    site_type="Sinatra"
                  else
                    site_type="Ruby"
                  fi
                
                # Priority 7: Go applications
                elif [ -f "$domain_path/go.mod" ]; then
                  if grep -q "gin-gonic/gin" "$domain_path/go.mod" 2>/dev/null; then
                    site_type="Gin"
                  elif grep -q "labstack/echo" "$domain_path/go.mod" 2>/dev/null; then
                    site_type="Echo"
                  elif grep -q "gofiber/fiber" "$domain_path/go.mod" 2>/dev/null; then
                    site_type="Fiber"
                  else
                    site_type="Go"
                  fi
                
                # Priority 8: Rust applications
                elif [ -f "$domain_path/Cargo.toml" ]; then
                  if grep -q "actix-web" "$domain_path/Cargo.toml" 2>/dev/null; then
                    site_type="Actix"
                  elif grep -q "rocket" "$domain_path/Cargo.toml" 2>/dev/null; then
                    site_type="Rocket"
                  elif grep -q "warp" "$domain_path/Cargo.toml" 2>/dev/null; then
                    site_type="Warp"
                  else
                    site_type="Rust"
                  fi
                
                # Priority 9: Elixir/Phoenix
                elif [ -f "$domain_path/mix.exs" ]; then
                  site_type="Phoenix"
                
                # Priority 10: Other CMS by directory structure
                elif [ -d "$domain_path/sites/all" ] && [ -f "$domain_path/index.php" ]; then
                  site_type="Drupal"
                elif [ -d "$domain_path/administrator" ] && [ -f "$domain_path/index.php" ] && [ -d "$domain_path/components" ]; then
                  site_type="Joomla"
                elif [ -f "$domain_path/app/etc/local.xml" ] || [ -f "$domain_path/app/etc/env.php" ]; then
                  site_type="Magento"
                elif [ -d "$domain_path/config" ] && [ -f "$domain_path/index.php" ] && [ -d "$domain_path/classes" ]; then
                  site_type="PrestaShop"
                elif [ -d "$domain_path/system" ] && [ -d "$domain_path/catalog" ] && [ -f "$domain_path/index.php" ]; then
                  site_type="OpenCart"
                elif [ -d "$domain_path/system" ] && [ -d "$domain_path/application" ] && [ -f "$domain_path/index.php" ]; then
                  site_type="CodeIgniter"
                elif [ -d "$domain_path/lib/Cake" ] || [ -d "$domain_path/cake" ]; then
                  site_type="CakePHP"
                
                # Priority 11: Static site generators
                elif [ -f "$domain_path/_config.yml" ]; then
                  if [ -d "$domain_path/_posts" ]; then
                    site_type="Jekyll"
                  else
                    site_type="Jekyll"
                  fi
                elif [ -f "$domain_path/gatsby-config.js" ] || [ -f "$domain_path/gatsby-config.ts" ]; then
                  site_type="Gatsby"
                elif [ -f "$domain_path/docusaurus.config.js" ] || [ -f "$domain_path/docusaurus.config.ts" ]; then
                  site_type="Docusaurus"
                elif [ -f "$domain_path/config.toml" ] || [ -f "$domain_path/config.yaml" ] || [ -f "$domain_path/config.yml" ]; then
                  if [ -d "$domain_path/content" ]; then
                    site_type="Hugo"
                  fi
                elif [ -f "$domain_path/.vuepress/config.js" ] || [ -d "$domain_path/.vuepress" ]; then
                  site_type="VuePress"
                elif [ -f "$domain_path/.eleventy.js" ] || [ -f "$domain_path/eleventy.config.js" ]; then
                  site_type="Eleventy"
                elif [ -f "$domain_path/_config.js" ] && [ -d "$domain_path/source" ]; then
                  site_type="Hexo"
                
                # Priority 12: Basic language detection
                elif [ -f "$domain_path/index.php" ] || find "$domain_path" -maxdepth 2 -name "*.php" -type f | head -1 | grep -q ".php"; then
                  site_type="PHP"
                elif [ -f "$domain_path/index.html" ] || [ -f "$domain_path/index.htm" ]; then
                  if find "$domain_path" -maxdepth 2 -name "*.js" -type f | head -1 | grep -q ".js"; then
                    site_type="JavaScript"
                  else
                    site_type="HTML"
                  fi
                elif find "$domain_path" -maxdepth 2 -name "*.js" -type f | head -1 | grep -q ".js"; then
                  site_type="JavaScript"
                fi
                
                # Check SSL
                ssl_status="false"
                if [ -d "/etc/letsencrypt/live/$domain" ]; then
                  ssl_status="true"
                fi
                
                # Get directory size
                dir_size=$(du -sb "$domain_path" 2>/dev/null | cut -f1 || echo "0")
                
                echo "SITE_DATA|${user}|$domain|$domain_path|$site_type|$ssl_status|$stat_output|$dir_size"
              fi
            done
          fi
        `;

        try {
          const domainsResult = await executeSshCommand(domainsCommand);
          const domainLines = domainsResult.output
            .split("\n")
            .filter((line) => line.startsWith("SITE_DATA|"));

          for (const domainLine of domainLines) {
            try {
              const parts = domainLine.replace("SITE_DATA|", "").split("|");
              if (parts.length >= 7) {
                const [
                  userName,
                  domainName,
                  domainPath,
                  siteType,
                  sslStatus,
                  statData,
                  dirSize,
                ] = parts;
                const [mtime, birthtime, size] = statData.split(" ");

                // Get standardized framework information
                const frameworkInfo = getFrameworkInfo(siteType);

                // Extract values from .env file
                const databaseName =
                  (await extractEnvValue(domainPath, "DB_DATABASE")) ||
                  (await extractEnvValue(domainPath, "DATABASE_NAME")) ||
                  (await extractEnvValue(domainPath, "DB_NAME"));
                const databaseUser =
                  (await extractEnvValue(domainPath, "DB_USERNAME")) ||
                  (await extractEnvValue(domainPath, "DATABASE_USER")) ||
                  (await extractEnvValue(domainPath, "DB_USER"));
                const databasePassword =
                  (await extractEnvValue(domainPath, "DB_PASSWORD")) ||
                  (await extractEnvValue(domainPath, "DATABASE_PASSWORD")) ||
                  (await extractEnvValue(domainPath, "DB_PASS"));
                const appKey =
                  (await extractEnvValue(domainPath, "APP_KEY")) ||
                  (await extractEnvValue(domainPath, "APP_SECRET")) ||
                  (await extractEnvValue(domainPath, "SECRET_KEY"));

                const siteInfo = {
                  user: userName,
                  domain: domainName,
                  type: frameworkInfo.type,
                  framework: frameworkInfo.framework,
                  ssl: sslStatus === "true",
                  path: domainPath,
                  database: databaseName,
                  database_user: databaseUser,
                  database_password: databasePassword,
                  app_key: appKey,
                  created: new Date(parseInt(birthtime) * 1000),
                  modified: new Date(parseInt(mtime) * 1000),
                  size: parseInt(dirSize) || 0,
                };

                sites.push(siteInfo);
              }
            } catch (err) {
              // Skip error logging for frontend access
            }
          }
        } catch (err) {
          // Skip error logging for frontend access
        }
      }
    } else {
      // Production environment - use direct file system access
      try {
        const homeDir = "/home";
        
        // Check if /home directory exists
        if (!(await pathExists(homeDir))) {
          logger.warn("Home directory /home does not exist, returning empty sites list");
          return {
            sites: [],
            pagination: {
              current_page: page,
              per_page: limit,
              total_items: 0,
              total_pages: 0,
              has_next_page: false,
              has_prev_page: false,
              next_page: null,
              prev_page: null,
              start_index: 0,
              end_index: 0
            }
          };
        }

        const allUsers = await readDirectory(homeDir);

        // Filter to only get valid user directories
        const users = [];
        for (const user of allUsers) {
          try {
            const userPath = path.posix.join(homeDir, user);
            const userStats = await getStats(userPath);

            // Only include if it's a directory and not a system/hidden directory
            if (
              userStats.isDirectory() &&
              !["mysql", "setup", "clp", "lost+found", ".git"].includes(user) &&
              !user.startsWith(".")
            ) {
              users.push(user);
            }
          } catch (err) {
            // Skip entries we can't stat or that don't exist
            continue;
          }
        }

        for (const user of users) {
          const userPath = path.posix.join(homeDir, user);

          // Check for htdocs directory (standard CloudPanel structure)
          const htdocsPath = path.posix.join(userPath, "htdocs");
          if (!(await pathExists(htdocsPath))) {
            continue;
          }

          try {
            const allDomains = await readDirectory(htdocsPath);

            // Filter to only get valid domain directories
            const domains = [];
            for (const domain of allDomains) {
              try {
                const domainPath = path.posix.join(htdocsPath, domain);
                const domainStats = await getStats(domainPath);

                // Only include if it's a directory and not a hidden file
                if (domainStats.isDirectory() && !domain.startsWith(".")) {
                  domains.push(domain);
                }
              } catch (err) {
                // Skip entries we can't stat or that don't exist
                continue;
              }
            }

            for (const domain of domains) {
              try {
                const domainPath = path.posix.join(htdocsPath, domain);
                
                // Get domain info using the existing getDomainInfo function
                // This already includes environment variable extraction
                const domainInfo = await getDomainInfo(domainPath, domain, user);
                
                // Use the domain info directly since it already contains all necessary data
                sites.push(domainInfo);
              } catch (err) {
                // Skip domains we can't access
                logger.warn(
                  `Cannot access domain ${domain} for user ${user}: ${err.message}`
                );
              }
            }
          } catch (err) {
            // Skip users without htdocs directory or permission issues
            logger.warn(
              `Cannot access htdocs directory for user ${user}: ${err.message}`
            );
          }
        }
      } catch (error) {
        logger.error(
          `Error reading sites in production mode: ${error.message}`
        );
        throw new Error("Failed to read sites directory in production");
      }
    }

    // Sort sites based on parameters
    sites.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      // Handle date sorting
      if (sortBy === 'created' || sortBy === 'modified') {
        aValue = aValue instanceof Date ? aValue.getTime() : 0;
        bValue = bValue instanceof Date ? bValue.getTime() : 0;
      }
      
      // Handle string sorting (case-insensitive)
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    // Calculate pagination
    const totalSites = sites.length;
    const totalPages = Math.ceil(totalSites / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedSites = sites.slice(startIndex, endIndex);

    // Build pagination metadata
    const pagination = {
      current_page: page,
      per_page: limit,
      total_items: totalSites,
      total_pages: totalPages,
      has_next_page: page < totalPages,
      has_prev_page: page > 1,
      next_page: page < totalPages ? page + 1 : null,
      prev_page: page > 1 ? page - 1 : null,
      start_index: startIndex + 1,
      end_index: Math.min(endIndex, totalSites)
    };

    return {
      sites: paginatedSites,
      pagination: pagination
    };
  } catch (error) {
    logger.error(`Error in getSitesList: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);
    throw error;
  }
}
router.get("/api/setup-history/sync-to-db", async (req, res) => {
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), 120000); // 2 minute timeout for backup operations
    });
    console.log("sync-to-db");
    // Get sites data first (get all sites without pagination for sync operation)
    const result = await Promise.race([getSitesListAll(1, 1000, 'domain', 'asc'), timeoutPromise]);
    const sites = result.sites; // Extract sites from the paginated result
    
    // Debug logging
    logger.debug(`Sites response structure: ${JSON.stringify(result, null, 2)}`);
    
    // Check if sites data exists and has the expected structure
    if (!sites || !Array.isArray(sites)) {
      logger.error('Invalid sites data structure received');
      return res.status(500).json({
        success: false,
        message: "Invalid sites data structure",
        error: "Sites data is not in expected format",
        debug_info: {
          sites_exists: !!sites,
          sites_is_array: !!(sites && Array.isArray(sites)),
          sites_length: sites ? sites.length : null,
          sites_structure: sites ? (Array.isArray(sites) ? 'array' : typeof sites) : null
        }
      });
    }
    
    // Extract unique usernames from sites data
    const usernames = [...new Set(sites.map(site => site.user))];
    
    // Save database backups for all users using existing backup info from sites_data
    const backupResults = [];
    for (const userName of usernames) {
      try {
        logger.debug(`Processing backup for user: ${userName}`);
        logger.debug(`Current working directory: ${process.cwd()}`);
        
        // Find the site data for this user to get existing backup info
        const userSite = sites.find(site => site.user === userName);
        
        if (userSite && userSite.database_backup && userSite.database_backup.exists) {
          // Use existing backup info to save to local
          const backupPath = userSite.database_backup.path;
          const backupSize = userSite.database_backup.size;
          
          logger.debug(`Found existing backup for ${userName}: ${backupPath}`);
          
          const localBackupDir = path.join(process.cwd(), 'backups', userName);
          const localFilePath = path.join(localBackupDir, 'db.sql.gz');
          
          // Create local backup directory if it doesn't exist
          const fs = require('fs');
          try {
            await fs.promises.access(path.dirname(localBackupDir));
          } catch {
            await fs.promises.mkdir(path.dirname(localBackupDir), { recursive: true });
          }
          try {
            await fs.promises.access(localBackupDir);
          } catch {
            await fs.promises.mkdir(localBackupDir, { recursive: true });
          }
          
          // Remove existing backup file
          try {
            await fs.promises.access(localFilePath);
            await fs.promises.unlink(localFilePath);
            logger.debug(`Removed existing backup file: ${localFilePath}`);
          } catch {
            // File doesn't exist, continue
          }
          
          // Copy backup file to local
          try {
            await fs.promises.copyFile(backupPath, localFilePath);
            
            // Verify file was copied successfully
            const stats = await fs.promises.stat(localFilePath);
            
            backupResults.push({
              user: userName,
              success: true,
              local_path: localFilePath,
              size: stats.size,
              message: `Database backup saved for ${userName}`
            });
            logger.debug(`Successfully saved backup for ${userName}: ${localFilePath}, size: ${stats.size} bytes`);
          } catch (copyError) {
            logger.error(`Failed to copy backup for ${userName}: ${copyError.message}`);
            backupResults.push({
              user: userName,
              success: false,
              message: `Failed to copy backup for ${userName}: ${copyError.message}`
            });
          }
        } else {
          backupResults.push({
            user: userName,
            success: false,
            message: `No database backup found for ${userName}`
          });
          logger.debug(`No backup found for ${userName}`);
        }
      } catch (backupError) {
        backupResults.push({
          user: userName,
          success: false,
          message: `Failed to save backup for ${userName}: ${backupError.message}`
        });
        logger.error(`Error saving backup for ${userName}: ${backupError.message}`);
        logger.error(`Error stack: ${backupError.stack}`);
      }
    }
    
    return res.json({
      success: true,
      message: "Setup history synced and database backups saved",
      sites_count: sites.length,
      users_count: usernames.length,
      backup_results: backupResults,
      sites_data: sites
    });
  } catch (error) {
    logger.error(`Error in setup-history sync: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to sync sites data and save backups",
      error: error.message,
    });
  }
});

// Get backup statistics for all users
router.get("/backup-statistics", async (req, res) => {
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), 30000); // 30 second timeout
    });
    const stats = await Promise.race([getBackupStatistics(), timeoutPromise]);
    
    // Helper function for formatting file size
    const formatFileSize = (bytes) => {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    // Add formatted sizes to the response
    const response = {
      ...stats,
      total_database_backup_size_formatted: formatFileSize(stats.total_database_backup_size),
      total_site_backup_size_formatted: formatFileSize(stats.total_site_backup_size),
      total_backup_size: stats.total_database_backup_size + stats.total_site_backup_size,
      total_backup_size_formatted: formatFileSize(stats.total_database_backup_size + stats.total_site_backup_size),
      backup_coverage: {
        database: stats.total_users > 0 ? Math.round((stats.users_with_database_backups / stats.total_users) * 100) : 0,
        site: stats.total_users > 0 ? Math.round((stats.users_with_site_backups / stats.total_users) * 100) : 0
      }
    };

    return res.json(response);
  } catch (error) {
    logger.error(`Error getting backup statistics: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to get backup statistics",
      error: error.message,
    });
  }
});

// Save backup to local project directory
router.post("/save-backup", async (req, res) => {
  try {
    const { userName, backupType = 'database' } = req.body;

    // Validate input
    if (!userName) {
      return res.status(400).json({
        success: false,
        message: "userName is required"
      });
    }

    if (!['database', 'site'].includes(backupType)) {
      return res.status(400).json({
        success: false,
        message: "backupType must be 'database' or 'site'"
      });
    }

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), 120000); // 2 minute timeout for file operations
    });

    const result = await Promise.race([saveBackupToLocal(userName, backupType), timeoutPromise]);

    if (result) {
      // Helper function for formatting file size
      const formatFileSize = (bytes) => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
      };

      return res.json({
        success: true,
        message: `${backupType} backup saved successfully for user ${userName}`,
        data: {
          ...result,
          size_formatted: formatFileSize(result.size)
        }
      });
    } else {
      return res.status(404).json({
        success: false,
        message: `No ${backupType} backup found for user ${userName}`
      });
    }
  } catch (error) {
    logger.error(`Error saving backup: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to save backup",
      error: error.message,
    });
  }
});

// Get list of local backups
router.get("/local-backups", async (req, res) => {
  try {
    const { userName } = req.query;
    const localBackupDir = path.join(__dirname, '../../backups');

    if (!fs.existsSync(localBackupDir)) {
      return res.json({
        success: true,
        message: "No local backups found",
        data: {
          backups: [],
          total_size: 0,
          total_size_formatted: "0 Bytes"
        }
      });
    }

    const backups = [];
    let totalSize = 0;

    if (userName) {
      // Get backups for specific user
      const userBackupDir = path.join(localBackupDir, userName);
      if (fs.existsSync(userBackupDir)) {
        const userFiles = await fs.readdir(userBackupDir);
        for (const file of userFiles) {
          const filePath = path.join(userBackupDir, file);
          try {
            const stats = await fs.stat(filePath);
            const backupInfo = {
              user: userName,
              file: file,
              path: filePath,
              size: stats.size,
              modified: stats.mtime,
              type: file.startsWith('database_') ? 'database' : 'site'
            };
            backups.push(backupInfo);
            totalSize += stats.size;
          } catch (statError) {
            logger.warn(`Cannot stat backup file ${filePath}: ${statError.message}`);
          }
        }
      }
    } else {
      // Get all backups for all users
      const users = await fs.readdir(localBackupDir);
      for (const user of users) {
        const userBackupDir = path.join(localBackupDir, user);
        try {
          const userStats = await fs.stat(userBackupDir);
          if (userStats.isDirectory()) {
            const userFiles = await fs.readdir(userBackupDir);
            for (const file of userFiles) {
              const filePath = path.join(userBackupDir, file);
              try {
                const stats = await fs.stat(filePath);
                const backupInfo = {
                  user: user,
                  file: file,
                  path: filePath,
                  size: stats.size,
                  modified: stats.mtime,
                  type: file.startsWith('database_') ? 'database' : 'site'
                };
                backups.push(backupInfo);
                totalSize += stats.size;
              } catch (statError) {
                logger.warn(`Cannot stat backup file ${filePath}: ${statError.message}`);
              }
            }
          }
        } catch (userStatError) {
          logger.warn(`Cannot stat user backup directory ${userBackupDir}: ${userStatError.message}`);
        }
      }
    }

    // Helper function for formatting file size
    const formatFileSize = (bytes) => {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    // Sort backups by modification date (newest first)
    backups.sort((a, b) => b.modified - a.modified);

    return res.json({
      success: true,
      message: `Found ${backups.length} local backup(s)`,
      data: {
        backups: backups.map(backup => ({
          ...backup,
          size_formatted: formatFileSize(backup.size)
        })),
        total_size: totalSize,
        total_size_formatted: formatFileSize(totalSize),
        user_filter: userName || 'all'
      }
    });
  } catch (error) {
    logger.error(`Error getting local backups: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to get local backups",
      error: error.message,
    });
  }
});

// Delete local backup
router.delete("/local-backup", async (req, res) => {
  try {
    const { userName, fileName } = req.body;

    // Validate input
    if (!userName || !fileName) {
      return res.status(400).json({
        success: false,
        message: "userName and fileName are required"
      });
    }

    const localBackupDir = path.join(process.cwd(), 'backups', userName);
    const filePath = path.join(localBackupDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: `Backup file ${fileName} not found for user ${userName}`
      });
    }

    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.unlink(filePath);
      }

      logger.info(`Deleted local backup: ${filePath}`);

      return res.json({
        success: true,
        message: `Backup ${fileName} deleted successfully for user ${userName}`,
        data: {
          deleted_file: fileName,
          user: userName,
          deleted_at: new Date()
        }
      });
    } catch (deleteError) {
      logger.error(`Failed to delete backup ${filePath}: ${deleteError.message}`);
      return res.status(500).json({
        success: false,
        message: "Failed to delete backup file",
        error: deleteError.message
      });
    }
  } catch (error) {
    logger.error(`Error deleting local backup: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to delete local backup",
      error: error.message,
    });
  }
});

// Save all backups for a specific user
router.post("/save-all-backups", async (req, res) => {
  try {
    const { userName } = req.body;

    // Validate input
    if (!userName) {
      return res.status(400).json({
        success: false,
        message: "userName is required"
      });
    }

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), 300000); // 5 minute timeout for multiple operations
    });

    const results = await Promise.race([
      Promise.all([
        saveBackupToLocal(userName, 'database'),
        saveBackupToLocal(userName, 'site')
      ]),
      timeoutPromise
    ]);

    const [databaseResult, siteResult] = results;
    const savedBackups = [];

    if (databaseResult) {
      savedBackups.push({
        type: 'database',
        ...databaseResult
      });
    }

    if (siteResult) {
      savedBackups.push({
        type: 'site',
        ...siteResult
      });
    }

    // Helper function for formatting file size
    const formatFileSize = (bytes) => {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    const totalSize = savedBackups.reduce((sum, backup) => sum + backup.size, 0);

    return res.json({
      success: true,
      message: `Saved ${savedBackups.length} backup(s) for user ${userName}`,
      data: {
        user: userName,
        saved_backups: savedBackups.map(backup => ({
          ...backup,
          size_formatted: formatFileSize(backup.size)
        })),
        total_size: totalSize,
        total_size_formatted: formatFileSize(totalSize)
      }
    });
  } catch (error) {
    logger.error(`Error saving all backups: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to save backups",
      error: error.message,
    });
  }
});

// Helper function to get the latest backup file from a directory
async function getLatestBackupFile(backupPath) {
  try {
    if (isDevelopment) {
      // Use SSH to find the latest backup file
      const command = `find "${backupPath}" -type f \\( -name "*.sql.gz" -o -name "*.sql" -o -name "*.tar.gz" -o -name "*.tar" -o -name "*.zip" -o -name "*.gz" -o -name "backup.sql" -o -name "backup.sql.gz" \\) 2>/dev/null | sort -r | head -1`;
      const result = await executeSshCommand(command);
      
      if (result.output && result.output.trim() && !result.output.includes("No such file")) {
        return result.output.trim();
      }
    } else {
      // Use local file system in production mode
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);
      
      try {
        const { stdout } = await execAsync(
          `find "${backupPath}" -type f \\( -name "*.sql.gz" -o -name "*.sql" -o -name "*.tar.gz" -o -name "*.tar" -o -name "*.zip" -o -name "*.gz" -o -name "backup.sql" -o -name "backup.sql.gz" \\) 2>/dev/null | sort -r | head -1`
        );
        
        if (stdout && stdout.trim()) {
          return stdout.trim();
        }
      } catch (execError) {
        logger.debug(`No backup files found in ${backupPath}: ${execError.message}`);
      }
    }
    
    return null;
  } catch (error) {
    logger.debug(`Error finding latest backup in ${backupPath}: ${error.message}`);
    return null;
  }
}

// Helper function to get the latest backup folder and find backup file inside it
async function getLatestBackupFromFolder(backupPath) {
  try {
    logger.debug(`Searching for latest backup in: ${backupPath}`);
    
    if (isDevelopment) {
      // First, get all subdirectories in the backup path
      const subdirsCommand = `find "${backupPath}" -maxdepth 1 -type d | grep -v "^${backupPath}$" | head -1`;
      const subdirsResult = await executeSshCommand(subdirsCommand);
      
      logger.debug(`Subdirs command result: ${subdirsResult.output}`);
      
      if (subdirsResult.output && subdirsResult.output.trim()) {
        const subdir = subdirsResult.output.trim();
        const subdirPath = subdir; // subdir already contains full path
        
        logger.debug(`Subdir found: ${subdir}, searching in: ${subdirPath}`);
        
        // Now get the latest date folder
        const folderCommand = `ls -1 "${subdirPath}" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort -r | head -1`;
        const folderResult = await executeSshCommand(folderCommand);
        
        logger.debug(`Folder command result: ${folderResult.output}`);
        
        if (folderResult.output && folderResult.output.trim()) {
          const latestFolder = folderResult.output.trim();
          const folderPath = `${subdirPath}/${latestFolder}`;
          
          logger.debug(`Latest folder found: ${latestFolder}, searching in: ${folderPath}`);
          
          // Now find backup file inside the latest folder
          const fileCommand = `find "${folderPath}" -type f \\( -name "*.sql.gz" -o -name "*.sql" -o -name "*.tar.gz" -o -name "*.tar" -o -name "*.zip" -o -name "*.gz" -o -name "backup.sql" -o -name "backup.sql.gz" -o -name "*_*.sql.gz" \\) 2>/dev/null | sort -r | head -1`;
          const fileResult = await executeSshCommand(fileCommand);
          
          logger.debug(`File command result: ${fileResult.output}`);
          
          if (fileResult.output && fileResult.output.trim() && !fileResult.output.includes("No such file")) {
            const foundFile = fileResult.output.trim();
            logger.debug(`Found backup file: ${foundFile}`);
            return foundFile;
          }
        }
      }
    } else {
      // Production mode - use local file system
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);
      
      try {
        // First, get all subdirectories in the backup path
        const { stdout: subdirsStdout } = await execAsync(
          `find "${backupPath}" -maxdepth 1 -type d | grep -v "^${backupPath}$" | head -1`
        );
        
        logger.debug(`Production subdirs command result: ${subdirsStdout}`);
        
        if (subdirsStdout && subdirsStdout.trim()) {
          const subdir = subdirsStdout.trim();
          const subdirPath = subdir; // subdir already contains full path
          
          logger.debug(`Production subdir found: ${subdir}, searching in: ${subdirPath}`);
          
          // Now get the latest date folder
          const { stdout: folderStdout } = await execAsync(
            `ls -1 "${subdirPath}" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort -r | head -1`
          );
          
          logger.debug(`Production folder command result: ${folderStdout}`);
          
          if (folderStdout && folderStdout.trim()) {
            const latestFolder = folderStdout.trim();
            const folderPath = `${subdirPath}/${latestFolder}`;
            
            logger.debug(`Production latest folder found: ${latestFolder}, searching in: ${folderPath}`);
            
            // Now find backup file inside the latest folder
            const { stdout: fileStdout } = await execAsync(
              `find "${folderPath}" -type f \\( -name "*.sql.gz" -o -name "*.sql" -o -name "*.tar.gz" -o -name "*.tar" -o -name "*.zip" -o -name "*.gz" -o -name "backup.sql" -o -name "backup.sql.gz" -o -name "*_*.sql.gz" \\) 2>/dev/null | sort -r | head -1`
            );
            
            logger.debug(`Production file command result: ${fileStdout}`);
            
            if (fileStdout && fileStdout.trim()) {
              const foundFile = fileStdout.trim();
              logger.debug(`Production found backup file: ${foundFile}`);
              return foundFile;
            }
          }
        }
      } catch (execError) {
        logger.debug(`No backup folders or files found in ${backupPath}: ${execError.message}`);
        logger.debug(`Exec error details: ${JSON.stringify(execError)}`);
      }
    }
    
    return null;
  } catch (error) {
    logger.debug(`Error finding latest backup folder in ${backupPath}: ${error.message}`);
    return null;
  }
}

// Helper function to get database backup information
async function getDatabaseBackupInfo(userName) {
  try {
    const backupPath = `/home/${userName}/backups/databases`;
    
    if (isDevelopment) {
      // Check if backup directory exists via SSH
      const checkCommand = `[ -d "${backupPath}" ] && echo "EXISTS" || echo "NOT_EXISTS"`;
      const checkResult = await executeSshCommand(checkCommand);
      
      if (checkResult.output.trim() !== "EXISTS") {
        return null;
      }
      
      // Get the latest backup file from the latest folder
      const latestBackup = await getLatestBackupFromFolder(backupPath);
      
      if (latestBackup) {
        // Get file size and modification time
        const statCommand = `stat -c "%s %Y" "${latestBackup}" 2>/dev/null || echo "0 0"`;
        const statResult = await executeSshCommand(statCommand);
        const [size, mtime] = statResult.output.trim().split(" ");
        
        return {
          path: latestBackup,
          size: parseInt(size) || 0,
          modified: new Date(parseInt(mtime) * 1000),
          exists: true
        };
      }
    } else {
      // Production mode - use local file system
      if (!(await pathExists(backupPath))) {
        return null;
      }
      
      const latestBackup = await getLatestBackupFromFolder(backupPath);
      
      if (latestBackup) {
        try {
          const stats = await fs.stat(latestBackup);
          return {
            path: latestBackup,
            size: stats.size,
            modified: stats.mtime,
            exists: true
          };
        } catch (statError) {
          logger.debug(`Error getting stats for ${latestBackup}: ${statError.message}`);
        }
      }
    }
    
    return null;
  } catch (error) {
    logger.debug(`Error getting database backup info for ${userName}: ${error.message}`);
    return null;
  }
}

// Helper function to save backup file to local project directory
async function saveBackupToLocal(userName, backupType = 'database') {
  try {
    logger.debug(`saveBackupToLocal called for user: ${userName}, type: ${backupType}`);
    logger.debug(`Current working directory: ${process.cwd()}`);
    logger.debug(`__dirname: ${__dirname}`);
    
    const localBackupDir = path.join(process.cwd(), 'backups', userName);
    const remoteBackupPath = backupType === 'database' 
      ? `/home/${userName}/backups/databases`
      : `/home/${userName}/backups`;
    
    logger.debug(`Local backup dir: ${localBackupDir}`);
    logger.debug(`Remote backup path: ${remoteBackupPath}`);
    logger.debug(`isDevelopment: ${isDevelopment}`);

    // Create local backup directory if it doesn't exist
    if (!fs.existsSync(path.dirname(localBackupDir))) {
      await fs.promises.mkdir(path.dirname(localBackupDir), { recursive: true });
    }
    if (!fs.existsSync(localBackupDir)) {
      await fs.promises.mkdir(localBackupDir, { recursive: true });
    }

    // Get the latest backup file/folder from remote
    let latestBackup = null;
    if (backupType === 'database') {
      latestBackup = await getLatestBackupFromFolder(remoteBackupPath);
    } else {
      // For site backups, get the latest folder
      if (isDevelopment) {
        const findCommand = `find "${remoteBackupPath}" -maxdepth 1 -type d -not -name "databases" -not -name "backups" | sort -r | head -1`;
        const result = await executeSshCommand(findCommand);
        if (result.output && result.output.trim() && !result.output.includes("No such file")) {
          latestBackup = result.output.trim();
        }
      } else {
        const { exec } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(exec);
        
        try {
          const { stdout } = await execAsync(
            `find "${remoteBackupPath}" -maxdepth 1 -type d -not -name "databases" -not -name "backups" | sort -r | head -1`
          );
          if (stdout && stdout.trim()) {
            latestBackup = stdout.trim();
          }
        } catch (execError) {
          logger.debug(`No site backup folders found in ${remoteBackupPath}: ${execError.message}`);
        }
      }
    }

    if (!latestBackup) {
      logger.warn(`No ${backupType} backup found for user ${userName}`);
      logger.debug(`Backup path checked: ${remoteBackupPath}`);
      logger.debug(`isDevelopment: ${isDevelopment}`);
      return null;
    }
    
    logger.debug(`Found latest backup: ${latestBackup}`);

    // Generate local filename - use db.sql.gz for database backups
    let localFileName;
    if (backupType === 'database') {
      localFileName = 'db.sql.gz';
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = path.basename(latestBackup);
      localFileName = `${backupType}_${backupName}_${timestamp}`;
    }
    const localFilePath = path.join(localBackupDir, localFileName);

    // Remove existing backup files of the same type
    const existingFiles = await fs.promises.readdir(localBackupDir);
    for (const file of existingFiles) {
      let shouldRemove = false;
      if (backupType === 'database' && file === 'db.sql.gz') {
        shouldRemove = true;
      } else if (backupType !== 'database' && file.startsWith(`${backupType}_`)) {
        shouldRemove = true;
      }
      
      if (shouldRemove) {
        const filePath = path.join(localBackupDir, file);
        try {
          const stats = await fs.promises.stat(filePath);
          if (stats.isDirectory()) {
            await fs.promises.rm(filePath, { recursive: true, force: true });
          } else {
            await fs.promises.unlink(filePath);
          }
          logger.debug(`Removed existing ${backupType} backup: ${file}`);
        } catch (removeError) {
          logger.warn(`Failed to remove existing backup ${file}: ${removeError.message}`);
        }
      }
    }

    // Copy backup from remote to local
    if (isDevelopment) {
      // Use SSH to copy file
      const copyCommand = backupType === 'database' 
        ? `cp "${latestBackup}" "/tmp/db.sql.gz" && echo "COPIED:/tmp/db.sql.gz"`
        : `cp -r "${latestBackup}" "/tmp/${localFileName}" && echo "COPIED:/tmp/${localFileName}"`;
      
      const copyResult = await executeSshCommand(copyCommand);
      if (copyResult.output.includes("COPIED:")) {
        const tempPath = copyResult.output.split("COPIED:")[1].trim();
        
        // Download file from remote to local
        const downloadCommand = backupType === 'database'
          ? `scp ${sshConfig.user}@${sshConfig.host}:"${tempPath}" "${localFilePath}"`
          : `scp ${sshConfig.user}@${sshConfig.host}:"${tempPath}" "${localFilePath}"`;
        const { exec } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(exec);
        
        try {
          await execAsync(downloadCommand);
          
          // Clean up temp file on remote
          const tempFileToRemove = backupType === 'database' ? '/tmp/db.sql.gz' : tempPath;
          await executeSshCommand(`rm -rf "${tempFileToRemove}"`);
          
          logger.info(`Successfully saved ${backupType} backup for ${userName} to ${localFilePath}`);
          return {
            local_path: localFilePath,
            remote_path: latestBackup,
            size: (await fs.promises.stat(localFilePath)).size,
            saved_at: new Date(),
            type: backupType
          };
        } catch (downloadError) {
          logger.error(`Failed to download ${backupType} backup for ${userName}: ${downloadError.message}`);
          return null;
        }
      }
    } else {
      // Production mode - direct file copy
      try {
        if (backupType === 'database') {
          // Copy file
          await fs.promises.copyFile(latestBackup, localFilePath);
        } else {
          // Copy directory
          const { exec } = require("child_process");
          const { promisify } = require("util");
          const execAsync = promisify(exec);
          
          await execAsync(`cp -r "${latestBackup}" "${localFilePath}"`);
        }
        
        logger.info(`Successfully saved ${backupType} backup for ${userName} to ${localFilePath}`);
        return {
          local_path: localFilePath,
          remote_path: latestBackup,
          size: (await fs.promises.stat(localFilePath)).size,
          saved_at: new Date(),
          type: backupType
        };
      } catch (copyError) {
        logger.error(`Failed to copy ${backupType} backup for ${userName}: ${copyError.message}`);
        return null;
      }
    }

    return null;
  } catch (error) {
    logger.error(`Error saving ${backupType} backup for ${userName}: ${error.message}`);
    return null;
  }
}

// Helper function to get backup statistics for all users
async function getBackupStatistics() {
  try {
    const homeDir = "/home";
    const stats = {
      total_users: 0,
      users_with_database_backups: 0,
      users_with_site_backups: 0,
      total_database_backup_size: 0,
      total_site_backup_size: 0,
      latest_backup_date: null,
      backup_summary: []
    };

    if (isDevelopment) {
      // Use SSH to get backup statistics
      const command = `
        total_users=0
        db_backup_users=0
        site_backup_users=0
        total_db_size=0
        total_site_size=0
        latest_date=0
        
        for user_dir in /home/*; do
          if [ -d "$user_dir" ]; then
            user=$(basename "$user_dir")
            if [[ ! "mysql setup clp" =~ $user ]]; then
              ((total_users++))
              
              # Check database backups
              db_backup_path="/home/$user/backups/databases"
              if [ -d "$db_backup_path" ]; then
                latest_db=$(find "$db_backup_path" -type f \\( -name "*.sql.gz" -o -name "*.sql" -o -name "*.tar.gz" -o -name "*.tar" -o -name "*.zip" -o -name "*.gz" -o -name "backup.sql" -o -name "backup.sql.gz" \\) 2>/dev/null | sort -r | head -1)
                if [ -n "$latest_db" ]; then
                  ((db_backup_users++))
                  db_size=$(stat -c "%s" "$latest_db" 2>/dev/null || echo "0")
                  total_db_size=$((total_db_size + db_size))
                  db_date=$(stat -c "%Y" "$latest_db" 2>/dev/null || echo "0")
                  if [ $db_date -gt $latest_date ]; then
                    latest_date=$db_date
                  fi
                fi
              fi
              
              # Check site backups
              site_backup_path="/home/$user/backups"
              if [ -d "$site_backup_path" ]; then
                latest_site=$(find "$site_backup_path" -maxdepth 1 -type d -not -name "databases" -not -name "backups" | sort -r | head -1)
                if [ -n "$latest_site" ]; then
                  ((site_backup_users++))
                  site_size=$(du -sb "$latest_site" 2>/dev/null | cut -f1 || echo "0")
                  total_site_size=$((total_site_size + site_size))
                  site_date=$(stat -c "%Y" "$latest_site" 2>/dev/null || echo "0")
                  if [ $site_date -gt $latest_date ]; then
                    latest_date=$site_date
                  fi
                fi
              fi
            fi
          fi
        done
        
        echo "STATS:$total_users:$db_backup_users:$site_backup_users:$total_db_size:$total_site_size:$latest_date"
      `;
      
      const result = await executeSshCommand(command);
      const statLine = result.output.split("\n").find(line => line.startsWith("STATS:"));
      
      if (statLine) {
        const [, totalUsers, dbBackupUsers, siteBackupUsers, totalDbSize, totalSiteSize, latestDate] = statLine.split(":");
        stats.total_users = parseInt(totalUsers) || 0;
        stats.users_with_database_backups = parseInt(dbBackupUsers) || 0;
        stats.users_with_site_backups = parseInt(siteBackupUsers) || 0;
        stats.total_database_backup_size = parseInt(totalDbSize) || 0;
        stats.total_site_backup_size = parseInt(totalSiteSize) || 0;
        stats.latest_backup_date = latestDate && latestDate !== "0" ? new Date(parseInt(latestDate) * 1000) : null;
      }
    } else {
      // Production mode - use local file system
      if (!(await pathExists(homeDir))) {
        return stats;
      }

      const allUsers = await readDirectory(homeDir);
      
      for (const user of allUsers) {
        try {
          const userPath = path.posix.join(homeDir, user);
          const userStats = await getStats(userPath);

          if (
            userStats.isDirectory() &&
            !["mysql", "setup", "clp", "lost+found", ".git"].includes(user) &&
            !user.startsWith(".")
          ) {
            stats.total_users++;
            
            // Check database backups
            const dbBackup = await getDatabaseBackupInfo(user);
            if (dbBackup) {
              stats.users_with_database_backups++;
              stats.total_database_backup_size += dbBackup.size;
              if (!stats.latest_backup_date || dbBackup.modified > stats.latest_backup_date) {
                stats.latest_backup_date = dbBackup.modified;
              }
            }
            
            // Check site backups
            const siteBackup = await getSiteBackupInfo(user);
            if (siteBackup) {
              stats.users_with_site_backups++;
              stats.total_site_backup_size += siteBackup.size;
              if (!stats.latest_backup_date || siteBackup.modified > stats.latest_backup_date) {
                stats.latest_backup_date = siteBackup.modified;
              }
            }
          }
        } catch (err) {
          // Skip entries we can't access
          continue;
        }
      }
    }

    return stats;
  } catch (error) {
    logger.error(`Error getting backup statistics: ${error.message}`);
    return {
      total_users: 0,
      users_with_database_backups: 0,
      users_with_site_backups: 0,
      total_database_backup_size: 0,
      total_site_backup_size: 0,
      latest_backup_date: null,
      backup_summary: []
    };
  }
}

// Helper function to get site backup information
async function getSiteBackupInfo(userName) {
  try {
    const backupPath = `/home/${userName}/backups`;
    
    if (isDevelopment) {
      // Check if backup directory exists via SSH
      const checkCommand = `[ -d "${backupPath}" ] && echo "EXISTS" || echo "NOT_EXISTS"`;
      const checkResult = await executeSshCommand(checkCommand);
      
      if (checkResult.output.trim() !== "EXISTS") {
        return null;
      }
      
      // Find the latest backup folder (excluding databases folder)
      const findCommand = `find "${backupPath}" -maxdepth 1 -type d -not -name "databases" -not -name "backups" | sort -r | head -1`;
      const findResult = await executeSshCommand(findCommand);
      
      if (findResult.output && findResult.output.trim() && !findResult.output.includes("No such file")) {
        const latestFolder = findResult.output.trim();
        
        // Get folder size and modification time
        const statCommand = `du -sb "${latestFolder}" 2>/dev/null | cut -f1 || echo "0"`;
        const sizeResult = await executeSshCommand(statCommand);
        const size = parseInt(sizeResult.output.trim()) || 0;
        
        const mtimeCommand = `stat -c "%Y" "${latestFolder}" 2>/dev/null || echo "0"`;
        const mtimeResult = await executeSshCommand(mtimeCommand);
        const mtime = parseInt(mtimeResult.output.trim()) || 0;
        
        return {
          path: latestFolder,
          size: size,
          modified: new Date(mtime * 1000),
          exists: true
        };
      }
    } else {
      // Production mode - use local file system
      if (!(await pathExists(backupPath))) {
        return null;
      }
      
      try {
        const { exec } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(exec);
        
        // Find the latest backup folder (excluding databases folder)
        const { stdout } = await execAsync(
          `find "${backupPath}" -maxdepth 1 -type d -not -name "databases" -not -name "backups" | sort -r | head -1`
        );
        
        if (stdout && stdout.trim()) {
          const latestFolder = stdout.trim();
          
          // Get folder size
          const { stdout: sizeOutput } = await execAsync(`du -sb "${latestFolder}" 2>/dev/null | cut -f1 || echo "0"`);
          const size = parseInt(sizeOutput.trim()) || 0;
          
          // Get folder stats
          const stats = await fs.stat(latestFolder);
          
          return {
            path: latestFolder,
            size: size,
            modified: stats.mtime,
            exists: true
          };
        }
      } catch (execError) {
        logger.debug(`Error finding site backup for ${userName}: ${execError.message}`);
      }
    }
    
    return null;
  } catch (error) {
    logger.debug(`Error getting site backup info for ${userName}: ${error.message}`);
    return null;
  }
}

// Helper function to extract values from .env files and other configuration files
async function extractEnvValue(projectPath, key) {
  try {
    // Try multiple possible configuration file locations
    const possibleConfigPaths = [
      // .env files
      path.posix.join(projectPath, ".env"),
      path.posix.join(projectPath, "..", ".env"),
      path.posix.join(projectPath, "public", ".env"),
      path.posix.join(projectPath, "app", ".env"),
      path.posix.join(projectPath, "config", ".env"),
      path.posix.join(projectPath, ".env.local"),
      path.posix.join(projectPath, ".env.production"),
      path.posix.join(projectPath, ".env.example"),
      // Other common config files
      path.posix.join(projectPath, "config", "database.php"),
      path.posix.join(projectPath, "config", "app.php"),
      path.posix.join(projectPath, "wp-config.php"),
      path.posix.join(projectPath, "application", "config", "database.php"),
    ];

    let configPath = null;
    for (const configFile of possibleConfigPaths) {
      if (await pathExists(configFile)) {
        configPath = configFile;
        break;
      }
    }

    if (!configPath) {
      logger.debug(`No configuration file found in ${projectPath} or parent directories`);
      return null;
    }

    if (isDevelopment) {
      // Use SSH grep command in development mode
      const grepCommand = `grep -E "(^${key}=|['\"]${key}['\"]\\s*=>\\s*['\"])" "${configPath}" | head -1 | sed -E "s/.*${key}[=:]+\\s*['\"]?([^'\"]*)['\"]?.*/\\1/"`;
      const result = await executeSshCommand(grepCommand);

      if (result.output && result.output.trim()) {
        return result.output.trim();
      }
    } else {
      // Use local file system in production mode
      try {
        const content = await fs.readFile(configPath, "utf-8");
        const lines = content.split("\n");

        for (const line of lines) {
          // Skip comments and empty lines
          if (line.trim() && !line.trim().startsWith("#") && !line.trim().startsWith("//")) {
            // Check for .env format: KEY=value
            if (line.startsWith(`${key}=`)) {
              const value = line.substring(key.length + 1).trim();
              const cleanValue = value.replace(/^["']|["']$/g, "");
              logger.debug(`Found ${key}=${cleanValue} in ${configPath}`);
              return cleanValue;
            }
            
            // Check for PHP array format: 'KEY' => 'value' or "KEY" => "value"
            const phpPattern = new RegExp(`['"]${key}['"]\\s*=>\\s*['"]([^'"]*)['"]`);
            const phpMatch = line.match(phpPattern);
            if (phpMatch) {
              const cleanValue = phpMatch[1];
              logger.debug(`Found ${key}=${cleanValue} in ${configPath} (PHP format)`);
              return cleanValue;
            }
            
            // Check for define() format: define('KEY', 'value')
            const definePattern = new RegExp(`define\\s*\\(\\s*['"]${key}['"]\\s*,\\s*['"]([^'"]*)['"]`);
            const defineMatch = line.match(definePattern);
            if (defineMatch) {
              const cleanValue = defineMatch[1];
              logger.debug(`Found ${key}=${cleanValue} in ${configPath} (define format)`);
              return cleanValue;
            }
          }
        }
        
        logger.debug(`Key ${key} not found in ${configPath}`);
      } catch (readError) {
        logger.warn(
          `Error reading configuration file at ${configPath}: ${readError.message}`
        );
      }
    }

    return null;
  } catch (error) {
    logger.debug(`Error in extractEnvValue for ${key} in ${projectPath}: ${error.message}`);
    return null;
  }
}

// Download backup file
router.get("/api/download-backup/:userName", async (req, res) => {
  try {
    const { userName } = req.params;
    const { type = 'database' } = req.query;
    
    // Validate input
    if (!userName) {
      return res.status(400).json({
        success: false,
        message: "userName is required"
      });
    }
    
    if (!['database', 'site'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "type must be 'database' or 'site'"
      });
    }
    
    // Determine file path based on type
    let fileName;
    if (type === 'database') {
      fileName = 'db.sql.gz';
    } else {
      fileName = 'db.tar.gz';
    }
    
    const filePath = path.join(process.cwd(), 'backups', userName, fileName);
    
    // Check if file exists
    try {
      await fs.promises.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: `Backup file not found for user ${userName}`
      });
    }
    
    // Get file stats
    const stats = await fs.promises.stat(filePath);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${userName}_${type}_backup_${new Date().toISOString().split('T')[0]}.${type === 'database' ? 'sql.gz' : 'tar.gz'}"`);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    // Handle stream errors
    fileStream.on('error', (error) => {
      logger.error(`Error streaming backup file for ${userName}: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Error streaming backup file"
        });
      }
    });
    
  } catch (error) {
    logger.error(`Error downloading backup: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to download backup",
      error: error.message,
    });
  }
});

// List available backup files
router.get("/api/database/list-backups", async (req, res) => {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    
    // Check if backup directory exists
    try {
      await fs.promises.access(backupDir);
    } catch (error) {
      return res.json({
        success: true,
        message: "No backup directory found",
        backups: []
      });
    }
    
    // Get all user directories
    const userDirs = await fs.promises.readdir(backupDir);
    const backups = [];
    
    for (const userDir of userDirs) {
      const userPath = path.join(backupDir, userDir);
      const userStats = await fs.promises.stat(userPath);
      
      if (userStats.isDirectory()) {
        const userBackups = [];
        
        // Check for database backup
        const dbBackupPath = path.join(userPath, 'db.sql.gz');
        try {
          await fs.promises.access(dbBackupPath);
          const dbStats = await fs.promises.stat(dbBackupPath);
          userBackups.push({
            type: 'database',
            filename: 'db.sql.gz',
            size: dbStats.size,
            modified: dbStats.mtime,
            download_url: `/sites/api/download-backup/${userDir}?type=database`
          });
        } catch (error) {
          // Database backup not found
        }
        
        // Check for site backup
        const siteBackupPath = path.join(userPath, 'db.tar.gz');
        try {
          await fs.promises.access(siteBackupPath);
          const siteStats = await fs.promises.stat(siteBackupPath);
          userBackups.push({
            type: 'site',
            filename: 'db.tar.gz',
            size: siteStats.size,
            modified: siteStats.mtime,
            download_url: `/sites/api/download-backup/${userDir}?type=site`
          });
        } catch (error) {
          // Site backup not found
        }
        
        if (userBackups.length > 0) {
          backups.push({
            user: userDir,
            backups: userBackups
          });
        }
      }
    }
    
    return res.json({
      success: true,
      message: "Backup files listed successfully",
      backups: backups
    });
    
  } catch (error) {
    logger.error(`Error listing backups: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to list backups",
      error: error.message,
    });
  }
});

module.exports = router;
