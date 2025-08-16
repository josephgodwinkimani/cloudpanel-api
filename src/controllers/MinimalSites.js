const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class MinimalSites {
    async getSitesList() {
        try {
            const sites = [];
            try {
                let homeDir = "/home";
                const allUsers = await this.readDirectory(homeDir);
                // Filter to only get valid user directories (not files like .gitignore)
                const users = [];
                for (const user of allUsers) {
                    try {
                        const userPath = path.posix.join(homeDir, user);
                        const userStats = await this.getStats(userPath);

                        // Only include if it's a directory and not a system/hidden directory
                        if (
                            userStats.isDirectory() &&
                            !["mysql", "setup", "clp", "lost+found", "micronode", "mikronode", ".git"].includes(user) &&
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
                    const possibleSiteDirs = ["htdocs"];
                    let sitesDir = null;

                    for (const dir of possibleSiteDirs) {
                        const candidatePath = path.posix.join(userPath, dir);
                        if (await this.pathExists(candidatePath)) {
                            sitesDir = candidatePath;
                            break;
                        }
                    }

                    if (!sitesDir) {
                        continue;
                    }

                    try {
                        const allDomains = await this.readDirectory(sitesDir);

                        // Filter to only get valid domain directories (not files like .gitignore)
                        const domains = [];
                        for (const domain of allDomains) {
                            try {
                                const domainPath = path.posix.join(sitesDir, domain);
                                const domainStats = await this.getStats(domainPath);

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
                                const stats = await this.getStats(domainPath)
                                sites.push({
                                    domain: domain,
                                    user: user,
                                    path: domainPath,
                                    created: stats.birthtime,
                                    modified: stats.mtime,
                                });
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
            ///filter by created desc
            sites.sort((a, b) => {
                return b.created - a.created;
            });
            return sites;
        } catch (error) {
            logger.error(`Error in getSitesList: ${error.message}`);
            logger.error(`Stack trace: ${error.stack}`);
            throw error;
        }
    }

    async readDirectory(dirPath) {

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

    async getStats(filePath) {
        // Production mode - Local execution
        return await fs.stat(filePath);
    }

    async pathExists(filePath) {

        // Production mode - Local execution
        try {
            await fs.stat(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = MinimalSites;
