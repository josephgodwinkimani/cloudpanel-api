/**
 * Test script to verify MySQL connection
 */

const mysql = require('mysql2/promise');

const config = {
  host: '127.0.0.1',
  user: 'root',
  password: 'fafa',
  database: 'cloudpanelapidb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

async function testConnection() {
  let connection = null;

  try {
    console.log('Testing MySQL connection...');
    
    // Create connection pool
    connection = mysql.createPool(config);
    
    // Test connection
    await connection.getConnection();
    console.log('✅ MySQL connection successful!');
    
    // Test database operations
    console.log('\nTesting database operations...');
    
    // Test users table
    const [users] = await connection.execute('SELECT COUNT(*) as count FROM users');
    console.log(`✅ Users table accessible: ${users[0].count} users found`);
    
    // Test setups table
    const [setups] = await connection.execute('SELECT COUNT(*) as count FROM setups');
    console.log(`✅ Setups table accessible: ${setups[0].count} setups found`);
    
    // Test jobs table
    const [jobs] = await connection.execute('SELECT COUNT(*) as count FROM jobs');
    console.log(`✅ Jobs table accessible: ${jobs[0].count} jobs found`);
    
    // Test sessions table
    const [sessions] = await connection.execute('SELECT COUNT(*) as count FROM sessions');
    console.log(`✅ Sessions table accessible: ${sessions[0].count} sessions found`);
    
    console.log('\n🎉 All database tests passed!');
    
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 Possible solutions:');
      console.log('1. Check MySQL root password');
      console.log('2. Run: mysql -u root -p');
      console.log('3. Verify password is "fafa"');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Possible solutions:');
      console.log('1. Check if MySQL is running');
      console.log('2. Run: sudo systemctl status mysql');
      console.log('3. Start MySQL: sudo systemctl start mysql');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('\n💡 Possible solutions:');
      console.log('1. Run setup script: npm run setup-mysql');
      console.log('2. Create database manually');
    }
    
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('\nMySQL connection closed');
    }
  }
}

// Run test if this script is executed directly
if (require.main === module) {
  testConnection()
    .then(() => {
      console.log('\n✅ Connection test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Connection test failed!');
      process.exit(1);
    });
}

module.exports = { testConnection }; 