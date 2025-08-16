const MinimalSites = require("../controllers/MinimalSites");
const logger = require("../utils/logger");
const express = require("express");
const router = express.Router();

// API endpoint for JSON response
router.get("/api/sites", async (req, res) => {
    try {
        const minimalController = new MinimalSites();
        const sites = await minimalController.getSitesList();
        logger.success('Minimal sites retrieved successfully');
        res.json(sites);
    } catch (error) {
        logger.error('Failed to get minimal sites:', error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve sites list",
            error: error.message,
        });
    }
});

// Web page endpoint for HTML response
router.get("/minimal", async (req, res) => {
    try {
        const minimalController = new MinimalSites();
        const sites = await minimalController.getSitesList();
        logger.success('Minimal sites page accessed successfully');
        
        res.render('minimal-sites', {
            sitesData: sites,
            title: 'Minimal Sites - CloudPanel API'
        });
    } catch (error) {
        logger.error('Failed to load minimal sites page:', error);
        res.status(500).render('error', {
            message: "Failed to load sites page",
            error: error.message,
            title: 'Error - CloudPanel API'
        });
    }
});

module.exports = router;