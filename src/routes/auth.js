const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

// Import database service
const databaseService = require('../services/database');

// Create credential route
router.get('/create-credential', (req, res) => {
  res.render('create-credential', { 
    error: req.session.error,
    success: req.session.success
  });
  
  // Clear session messages
  delete req.session.error;
  delete req.session.success;
});

router.post('/create-credential', async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;
    
    // Validation
    if (!username || !password || !confirmPassword) {
      req.session.error = 'All fields are required';
      return res.redirect('/auth/create-credential');
    }
    
    if (username.length < 3) {
      req.session.error = 'Username must be at least 3 characters long';
      return res.redirect('/auth/create-credential');
    }
    
    if (password.length < 6) {
      req.session.error = 'Password must be at least 6 characters long';
      return res.redirect('/auth/create-credential');
    }
    
    if (password !== confirmPassword) {
      req.session.error = 'Passwords do not match';
      return res.redirect('/auth/create-credential');
    }
    
    // Check if username already exists
    const existingUser = await databaseService.findUserByUsername(username);
    if (existingUser) {
      req.session.error = 'Username already exists';
      return res.redirect('/auth/create-credential');
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create new user in database
    await databaseService.createUser(username, hashedPassword);
    
    req.session.success = 'Account created successfully! You can now login.';
    res.redirect('/auth/login');
    
  } catch (error) {
    console.error('Error creating credential:', error);
    req.session.error = 'An error occurred while creating the account';
    res.redirect('/auth/create-credential');
  }
});

// Login routes
router.get('/login', (req, res) => {
  // If already logged in, redirect to docs
  if (req.session.user) {
    return res.redirect('/docs');
  }
  
  // Check for special messages
  let successMessage = req.session.success;
  if (req.query.message === 'credentials-cleared') {
    successMessage = 'All credentials have been cleared successfully.';
  }
  
  res.render('login', { 
    error: req.session.error,
    success: successMessage
  });
  
  // Clear session messages
  delete req.session.error;
  delete req.session.success;
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      req.session.error = 'Username and password are required';
      return res.redirect('/auth/login');
    }
    
    // Find user in database
    const user = await databaseService.findUserByUsername(username);
    if (!user) {
      req.session.error = 'Invalid username or password';
      return res.redirect('/auth/login');
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      req.session.error = 'Invalid username or password';
      return res.redirect('/auth/login');
    }
    
    // Update last login
    await databaseService.updateLastLogin(user.id);
    
    // Set session
    req.session.user = {
      id: user.id,
      username: user.username
    };
    
    res.redirect('/docs');
    
  } catch (error) {
    console.error('Error during login:', error);
    req.session.error = 'An error occurred during login';
    res.redirect('/auth/login');
  }
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth/login');
  });
});

// Clear all credentials route (admin function)
router.post('/clear-credentials', async (req, res) => {
  try {
    const { confirmClear } = req.body;
    
    if (confirmClear === 'YES_CLEAR_ALL') {
      // Clear all users from database
      await databaseService.clearAllUsers();
      
      // Destroy session
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
        res.redirect('/auth/login?message=credentials-cleared');
      });
    } else {
      req.session.error = 'Invalid confirmation. Credentials not cleared.';
      res.redirect('/docs');
    }
  } catch (error) {
    console.error('Error clearing credentials:', error);
    req.session.error = 'An error occurred while clearing credentials';
    res.redirect('/docs');
  }
});

module.exports = router;
