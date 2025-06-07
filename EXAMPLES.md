# CloudPanel API Examples

This document provides examples of how to use the CloudPanel API endpoints.

## Authentication

Most endpoints require authentication via API key. Include the API key in your requests:

```bash
# Via header
curl -H "X-API-Key: your-api-key-here" http://localhost:3000/api/endpoint

# Via query parameter
curl "http://localhost:3000/api/endpoint?apiKey=your-api-key-here"
```

## Cloudflare

### Update Cloudflare IPs

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/cloudflare/update-ips
```

## CloudPanel

### Enable Basic Auth

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "userName": "admin",
    "password": "securepassword123"
  }' \
  http://localhost:3000/api/cloudpanel/basic-auth/enable
```

### Disable Basic Auth

```bash
curl -X DELETE \
  -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/cloudpanel/basic-auth/disable
```

## Database

### Show Master Credentials

```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/database/master-credentials
```

### Add Database

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "domainName": "example.com",
    "databaseName": "myapp_db",
    "databaseUserName": "myapp_user",
    "databaseUserPassword": "strongpassword123"
  }' \
  http://localhost:3000/api/database/add
```

### Export Database

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "databaseName": "myapp_db",
    "file": "/tmp/backup.sql.gz"
  }' \
  http://localhost:3000/api/database/export
```

### Import Database

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "databaseName": "myapp_db",
    "file": "/tmp/backup.sql.gz"
  }' \
  http://localhost:3000/api/database/import
```

## Let's Encrypt

### Install Certificate

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "domainName": "example.com",
    "subjectAlternativeName": "www.example.com,api.example.com"
  }' \
  http://localhost:3000/api/letsencrypt/install-certificate
```

## Sites

### Add Node.js Site

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "domainName": "myapp.com",
    "nodejsVersion": 20,
    "appPort": 3000,
    "siteUser": "myapp",
    "siteUserPassword": "securepassword123"
  }' \
  http://localhost:3000/api/site/add/nodejs
```

### Add PHP Site

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "domainName": "mysite.com",
    "phpVersion": "8.4",
    "vhostTemplate": "Generic",
    "siteUser": "mysite",
    "siteUserPassword": "securepassword123"
  }' \
  http://localhost:3000/api/site/add/php
```

### Add Python Site

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "domainName": "pythonapp.com",
    "pythonVersion": "3.11",
    "appPort": 8000,
    "siteUser": "pythonapp",
    "siteUserPassword": "securepassword123"
  }' \
  http://localhost:3000/api/site/add/python
```

### Add Static Site

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "domainName": "static.com",
    "siteUser": "static",
    "siteUserPassword": "securepassword123"
  }' \
  http://localhost:3000/api/site/add/static
```

### Add Reverse Proxy

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "domainName": "proxy.com",
    "reverseProxyUrl": "http://127.0.0.1:8080",
    "siteUser": "proxy",
    "siteUserPassword": "securepassword123"
  }' \
  http://localhost:3000/api/site/add/reverse-proxy
```

### Delete Site

```bash
curl -X DELETE \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "domainName": "example.com",
    "force": false
  }' \
  http://localhost:3000/api/site/delete
```

## Users

### Add User (Admin)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "userName": "john.doe",
    "email": "john.doe@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "password": "strongpassword123",
    "role": "admin",
    "timezone": "UTC",
    "status": "1"
  }' \
  http://localhost:3000/api/user/add
```

### Add User (Site Manager)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "userName": "jane.smith",
    "email": "jane.smith@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "password": "strongpassword123",
    "role": "site-manager",
    "timezone": "UTC",
    "status": "1"
  }' \
  http://localhost:3000/api/user/add
```

### Add User (Limited to specific sites)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "userName": "bob.wilson",
    "email": "bob.wilson@example.com",
    "firstName": "Bob",
    "lastName": "Wilson",
    "password": "strongpassword123",
    "role": "user",
    "sites": "example.com,mysite.com",
    "timezone": "UTC",
    "status": "1"
  }' \
  http://localhost:3000/api/user/add
```

### List Users

```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/user/list
```

### Reset Password

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "userName": "john.doe",
    "password": "newstrongpassword123"
  }' \
  http://localhost:3000/api/user/reset-password
```

### Disable MFA

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "userName": "john.doe"
  }' \
  http://localhost:3000/api/user/disable-mfa
```

### Delete User

```bash
curl -X DELETE \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "userName": "john.doe"
  }' \
  http://localhost:3000/api/user/delete
```

## Vhost Templates

### Import Templates

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/vhost-templates/import
```

### List Templates

```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/vhost-templates/list
```

### Add Custom Template

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "name": "My Custom Template",
    "file": "/path/to/template.tpl"
  }' \
  http://localhost:3000/api/vhost-templates/add
```

### Add Template from URL

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "name": "Remote Template",
    "file": "https://raw.githubusercontent.com/user/repo/main/template.tpl"
  }' \
  http://localhost:3000/api/vhost-templates/add
```

### View Template

```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/vhost-templates/view/Generic
```

### Delete Template

```bash
curl -X DELETE \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "name": "My Custom Template"
  }' \
  http://localhost:3000/api/vhost-templates/delete
```

## Response Format

All API responses follow this format:

### Success Response

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "timestamp": "2025-06-08T10:30:00.000Z",
  "data": {
    "command": "clpctl command executed",
    "output": "Command output",
    "executedAt": "2025-06-08T10:30:00.000Z"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message",
  "timestamp": "2025-06-08T10:30:00.000Z",
  "details": "Additional error details"
}
```

## JavaScript/Node.js Examples

### Using fetch API

```javascript
const apiKey = 'your-api-key';
const baseUrl = 'http://localhost:3000/api';

// Add a Node.js site
async function addNodejsSite() {
  try {
    const response = await fetch(`${baseUrl}/site/add/nodejs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({
        domainName: 'myapp.com',
        nodejsVersion: 20,
        appPort: 3000,
        siteUser: 'myapp',
        siteUserPassword: 'securepassword123'
      })
    });

    const result = await response.json();
    console.log(result);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Using axios

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'X-API-Key': 'your-api-key'
  }
});

// List users
async function listUsers() {
  try {
    const response = await api.get('/user/list');
    console.log(response.data);
  } catch (error) {
    console.error('Error:', error.response.data);
  }
}

// Add database
async function addDatabase() {
  try {
    const response = await api.post('/database/add', {
      domainName: 'example.com',
      databaseName: 'myapp_db',
      databaseUserName: 'myapp_user',
      databaseUserPassword: 'strongpassword123'
    });
    console.log(response.data);
  } catch (error) {
    console.error('Error:', error.response.data);
  }
}
```
