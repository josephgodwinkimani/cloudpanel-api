const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const { Client } = require("ssh2");
const logger = require("../utils/logger");
const { requireAuth } = require("../middleware");
const cloudpanel = require("../services/cloudpanel");
const databaseService = require("../services/database");

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

// Middleware to require authentication for all routes
router.use(requireAuth);

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
            if (userStats.isDirectory() && 
                !["mysql", "setup", "clp", "lost+found", ".git"].includes(user) &&
                !user.startsWith(".")) {
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
      const files = allFiles.filter(file => !file.startsWith('.'));
      
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

    return {
      domain: domainName,
      user: userName,
      type: frameworkInfo.type,
      framework: frameworkInfo.framework,
      ssl: hasSSL,
      path: domainPath,
      created: stats.birthtime,
      modified: stats.mtime,
      size: await getDirSize(domainPath),
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
      created: new Date(),
      modified: new Date(),
      size: 0,
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
      // Production mode - Local execution with recursive calculation
      return await calculateDirSizeRecursive(dirPath);
    }
  } catch (error) {
    logger.warn(
      `Error calculating directory size for ${dirPath}: ${error.message}`
    );
    return 0;
  }
}

// Recursive function to calculate directory size in production mode
async function calculateDirSizeRecursive(dirPath, maxDepth = 3, currentDepth = 0) {
  try {
    let totalSize = 0;
    
    // Prevent infinite recursion and excessive depth
    if (currentDepth > maxDepth) {
      return 0;
    }
    
    const items = await fs.readdir(dirPath);
    
    // Process items in batches to avoid overwhelming the system
    const batchSize = 50;
    for (let i = 0; i < Math.min(items.length, 500); i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      for (const item of batch) {
        try {
          // Skip hidden files and directories for performance
          if (item.startsWith('.')) {
            continue;
          }
          
          const itemPath = path.join(dirPath, item);
          const stats = await fs.stat(itemPath);
          
          if (stats.isFile()) {
            totalSize += stats.size;
          } else if (stats.isDirectory()) {
            // Recursively calculate subdirectory size with depth limit
            const subDirSize = await calculateDirSizeRecursive(itemPath, maxDepth, currentDepth + 1);
            totalSize += subDirSize;
          }
        } catch (err) {
          // Skip files/directories we can't access
          continue;
        }
      }
    }
    
    return totalSize;
  } catch (error) {
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
    const sitesWithSetupInfo = sites.map(site => {
      const setupInfo = setupData.find(setup => setup.domain_name === site.domain);
      return {
        ...site,
        setupInfo: setupInfo || null,
        hasSetupInfo: !!setupInfo
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

// API endpoint to get sites data as JSON
router.get("/api/list", async (req, res) => {
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), 30000); // 30 second timeout
    });

    const sites = await Promise.race([getSitesList(), timeoutPromise]);

    res.json({
      success: true,
      message: "Sites retrieved successfully",
      data: sites,
      total: sites.length,
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
      setupRecords = allSetups.filter(setup => setup.domain_name === domain);
      logger.info(`Found ${setupRecords.length} setup record(s) for domain: ${domain}`);
    } catch (dbError) {
      logger.warn(`Failed to check setup records for ${domain}: ${dbError.message}`);
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
            const deletedCount = await databaseService.deleteSetup(setupRecord.id);
            if (deletedCount > 0) {
              deletedSetupRecords++;
              logger.info(`Deleted setup record ID ${setupRecord.id} for domain: ${domain}`);
            }
          }
          
          if (deletedSetupRecords > 0) {
            logger.success(`Deleted ${deletedSetupRecords} setup record(s) for domain: ${domain}`);
          }
        } catch (dbError) {
          logger.error(`Failed to delete setup records for ${domain}: ${dbError.message}`);
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
    const setupData = await databaseService.getAllSetups();
    
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
      setupData: setupData,
      user: req.session.user,
      baseUrl: `${req.protocol}://${req.get("host")}`,
      formatFileSize: formatFileSize,
      process: {
        env: {
          VPS_HOST: process.env.VPS_HOST || null,
          NODE_ENV: process.env.NODE_ENV || 'development'
        }
      }
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
    const setupData = await databaseService.getAllSetups();
    res.json({
      success: true,
      message: "Setup history retrieved successfully",
      data: setupData,
      total: setupData.length,
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
    const setupToDelete = setupData.find(setup => setup.id === parseInt(id));
    
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
      try {
        logger.info(`Attempting to delete site from CloudPanel: ${setupToDelete.domain_name}`);
        
        // Try to delete the site from CloudPanel
        const deleteResult = await cloudpanel.deleteSite(setupToDelete.domain_name, true);
        
        if (deleteResult && typeof deleteResult === 'string' && deleteResult.includes("has been deleted")) {
          cloudPanelResult = { success: true, message: deleteResult };
          cloudPanelMessage = `Site '${setupToDelete.domain_name}' successfully deleted from CloudPanel.`;
          logger.success(`Site ${setupToDelete.domain_name} deleted from CloudPanel successfully`);
        } else if (deleteResult && deleteResult.error) {
          // Site deletion failed, but continue with database deletion
          cloudPanelResult = { success: false, error: deleteResult.error };
          if (deleteResult.error.includes("not found") || 
              deleteResult.error.includes("does not exist") ||
              deleteResult.error.includes("No site found")) {
            cloudPanelMessage = `Site '${setupToDelete.domain_name}' not found in CloudPanel (may have been deleted manually).`;
          } else {
            cloudPanelMessage = `Failed to delete site '${setupToDelete.domain_name}' from CloudPanel: ${deleteResult.error}`;
          }
          logger.warn(`CloudPanel site deletion warning for ${setupToDelete.domain_name}: ${deleteResult.error}`);
        } else {
          cloudPanelResult = { success: false, error: "Unknown response from CloudPanel" };
          cloudPanelMessage = `Unexpected response when deleting site '${setupToDelete.domain_name}' from CloudPanel.`;
          logger.warn(`Unexpected CloudPanel response for ${setupToDelete.domain_name}: ${deleteResult}`);
        }
      } catch (cloudPanelError) {
        // CloudPanel deletion failed, but continue with database deletion
        cloudPanelResult = { success: false, error: cloudPanelError.message };
        if (cloudPanelError.message && 
            (cloudPanelError.message.includes("not found") || 
             cloudPanelError.message.includes("does not exist") ||
             cloudPanelError.message.includes("No site found"))) {
          cloudPanelMessage = `Site '${setupToDelete.domain_name}' not found in CloudPanel (may have been deleted manually).`;
        } else {
          cloudPanelMessage = `Error deleting site '${setupToDelete.domain_name}' from CloudPanel: ${cloudPanelError.message}`;
        }
        logger.error(`CloudPanel deletion error for ${setupToDelete.domain_name}: ${cloudPanelError.message}`);
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

    logger.info(`Setup record deleted from database: ID ${id}, Domain: ${setupToDelete.domain_name}`);

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
          created_at: setupToDelete.created_at
        }
      }
    };

    if (deleteFromCloudPanel) {
      responseData.cloudPanel = cloudPanelResult || { 
        success: false, 
        message: "CloudPanel deletion was not attempted" 
      };
    }

    res.json({
      success: true,
      message: responseMessage,
      data: responseData
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

module.exports = router;
