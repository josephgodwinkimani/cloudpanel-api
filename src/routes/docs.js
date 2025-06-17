const express = require('express');
const router = express.Router();
const path = require('path');

// Helper function to read credentials
const readCredentials = () => {
  delete require.cache[require.resolve('../credentials.js')];
  return require('../credentials.js');
};

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// API Documentation route
router.get('/', requireAuth, (req, res) => {
  // Get credentials info for display
  const credentials = readCredentials();
  const userCount = credentials.users.length;
  
  res.render('docs', {
    user: req.session.user,
    baseUrl: `${req.protocol}://${req.get('host')}`,
    userCount: userCount,
    error: req.session.error,
    success: req.session.success
  });
  
  // Clear session messages
  delete req.session.error;
  delete req.session.success;
});

module.exports = router;
