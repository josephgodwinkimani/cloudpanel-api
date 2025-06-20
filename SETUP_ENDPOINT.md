# Laravel Setup Endpoint

## Overview
The `/api/setup` endpoint is a convenient way to create a complete Laravel development environment in one API call. It combines the creation of a PHP site with Laravel configuration and a database.

## Endpoint
```
POST /api/setup
```

## Request Headers
```
Content-Type: application/json
X-API-Key: your-api-key-here
```

## Request Body
```json
{
  "domainName": "mylaravel.example.com",
  "phpVersion": "8.2",
  "vhostTemplate": "Laravel 12",
  "siteUser": "laraveluser",
  "siteUserPassword": "securepassword123",
  "databaseName": "laravel_db",
  "databaseUserName": "laravel_user",
  "databaseUserPassword": "dbpassword123"
}
```

## Parameters

### Required Parameters
- `domainName` (string): The domain name for the Laravel site
- `siteUser` (string): Username for the site user account
- `siteUserPassword` (string): Password for the site user (minimum 6 characters)
- `databaseName` (string): Name of the database to create
- `databaseUserName` (string): Username for the database user
- `databaseUserPassword` (string): Password for the database user (minimum 6 characters)

### Optional Parameters
- `phpVersion` (string): PHP version to use (default: "8.2")
  - Valid values: "7.4", "8.0", "8.1", "8.2", "8.3", "8.4"
- `vhostTemplate` (string): Virtual host template to use (default: "Laravel 11")

## Response

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Laravel setup completed successfully",
  "data": {
    "site": {
      "success": true,
      "message": "PHP site created successfully"
    },
    "database": {
      "success": true,
      "message": "Database created successfully"
    },
    "setup": {
      "domainName": "mylaravel.example.com",
      "phpVersion": "8.2",
      "vhostTemplate": "Laravel 11",
      "siteUser": "laraveluser",
      "databaseName": "laravel_db",
      "databaseUserName": "laravel_user",
      "message": "Laravel site and database setup completed successfully"
    }
  }
}
```

### Error Response (400/500)
```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error information"
}
```

## What This Endpoint Does

1. **Creates a PHP Site**: 
   - Sets up a new PHP site with the specified domain
   - Configures the specified PHP version
   - Uses the Laravel virtual host template
   - Creates a site user with the provided credentials

2. **Creates a Database**:
   - Creates a new MySQL database with the specified name
   - Creates a database user with the provided credentials
   - Associates the database with the domain

## Example Usage

### Using curl
```bash
curl -X POST http://localhost:3000/api/setup \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "domainName": "mylaravel.example.com",
    "phpVersion": "8.2",
    "siteUser": "laraveluser",
    "siteUserPassword": "securepassword123",
    "databaseName": "laravel_db",
    "databaseUserName": "laravel_user",
    "databaseUserPassword": "dbpassword123"
  }'
```

### Using JavaScript/Node.js
```javascript
const response = await fetch('http://localhost:3000/api/setup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    domainName: 'mylaravel.example.com',
    phpVersion: '8.2',
    siteUser: 'laraveluser',
    siteUserPassword: 'securepassword123',
    databaseName: 'laravel_db',
    databaseUserName: 'laravel_user',
    databaseUserPassword: 'dbpassword123'
  })
});

const result = await response.json();
console.log(result);
```

## Notes

- The endpoint requires both site creation and database creation to succeed
- If either operation fails, the entire setup will fail
- The site user and database user are separate entities
- Make sure the domain name is properly configured in your DNS
- The vhost template must exist in CloudPanel (use "Laravel 11" for modern Laravel projects)
- All passwords must be at least 6 characters long

## After Setup

After successful setup, you can:
1. Access your site at the configured domain
2. Connect to the database using the provided credentials
3. Install Laravel using Composer in the site directory
4. Configure your Laravel `.env` file with the database credentials

## Related Endpoints

- `POST /api/site/add/php` - Create PHP site only
- `POST /api/database/add` - Create database only
- `GET /api/vhost-templates/list` - List available vhost templates
