/**
 * Migration script to transfer users from credentials.js to SQLite database
 * Run this script once to migrate existing users
 */

const databaseService = require('./src/services/database');
const credentials = require('./src/credentials');

async function migrateUsers() {
  try {
    console.log('Starting user migration from credentials.js to SQLite...');
    
    if (!credentials.users || credentials.users.length === 0) {
      console.log('No users found in credentials.js to migrate.');
      return;
    }
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const user of credentials.users) {
      try {
        // Check if user already exists in database
        const existingUser = await databaseService.findUserByUsername(user.username);
        
        if (existingUser) {
          console.log(`User '${user.username}' already exists in database, skipping...`);
          skippedCount++;
          continue;
        }
        
        // Create user in database (password is already hashed)
        await databaseService.createUser(user.username, user.password);
        
        // Update last login if it exists
        if (user.lastLogin) {
          const newUser = await databaseService.findUserByUsername(user.username);
          await databaseService.updateLastLogin(newUser.id);
        }
        
        console.log(`Migrated user: ${user.username}`);
        migratedCount++;
        
      } catch (error) {
        console.error(`Error migrating user ${user.username}:`, error.message);
      }
    }
    
    console.log(`\nMigration completed!`);
    console.log(`- Migrated users: ${migratedCount}`);
    console.log(`- Skipped users: ${skippedCount}`);
    console.log(`- Total users in credentials.js: ${credentials.users.length}`);
    
    // Verify migration
    const allUsers = await databaseService.getAllUsers();
    console.log(`- Total users now in database: ${allUsers.length}`);
    
    console.log('\nYou can now safely remove or rename credentials.js file.');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Close database connection
    databaseService.close();
  }
}

// Run migration
migrateUsers();
