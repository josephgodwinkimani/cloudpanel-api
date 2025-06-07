# CloudPanel API Node.js

Node.js API wrapper for CloudPanel CLI commands. This API provides a RESTful interface to manage CloudPanel operations programmatically.

## Features

- **Cloudflare Management**: Update IPs
- **CloudPanel Security**: Enable/disable basic auth
- **Database Operations**: Add, export, import databases, manage credentials
- **SSL Certificates**: Install Let's Encrypt certificates
- **Site Management**: Add/delete various types of sites (Node.js, PHP, Python, Static, Reverse Proxy)
- **User Management**: Add, delete, list users, reset passwords, manage 2FA
- **Vhost Templates**: Import, list, add, delete, view templates

## Installation

```bash
npm install
```

## Usage

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Cloudflare
- `POST /api/cloudflare/update-ips` - Update Cloudflare IPs

### CloudPanel
- `POST /api/cloudpanel/basic-auth/enable` - Enable basic auth
- `DELETE /api/cloudpanel/basic-auth/disable` - Disable basic auth

### Database
- `GET /api/database/master-credentials` - Show master credentials
- `POST /api/database/add` - Add database
- `POST /api/database/export` - Export database
- `POST /api/database/import` - Import database

### Let's Encrypt
- `POST /api/letsencrypt/install-certificate` - Install Let's Encrypt certificate

### Sites
- `POST /api/site/add/nodejs` - Add Node.js site
- `POST /api/site/add/php` - Add PHP site
- `POST /api/site/add/python` - Add Python site
- `POST /api/site/add/static` - Add static site
- `POST /api/site/add/reverse-proxy` - Add reverse proxy
- `POST /api/site/install-certificate` - Install custom certificate
- `DELETE /api/site/delete` - Delete site

### Users
- `POST /api/user/add` - Add user
- `DELETE /api/user/delete` - Delete user
- `GET /api/user/list` - List users
- `POST /api/user/reset-password` - Reset password
- `POST /api/user/disable-mfa` - Disable 2FA

### Vhost Templates
- `POST /api/vhost-templates/import` - Import templates
- `GET /api/vhost-templates/list` - List templates
- `POST /api/vhost-templates/add` - Add template
- `DELETE /api/vhost-templates/delete` - Delete template
- `GET /api/vhost-templates/view` - View template

## Environment Variables

```bash
PORT=3000
NODE_ENV=development
```

## Security

- CORS enabled
- Helmet security headers
- Rate limiting
- Input validation with Joi

## 📊 Monitoring

The API provides built-in monitoring capabilities:

### Health Check
```bash
curl http://localhost:3000/health
```

### Server Statistics
```bash
curl http://localhost:3000/api/monitor
```

Returns detailed server metrics including:
- Uptime information
- Memory usage statistics
- Process information
- Environment details

## 🧪 Testing

### Run Test Suite
```bash
npm test
```

### API Integration Testing
```bash
# Make test script executable
chmod +x test-api.sh

# Run comprehensive API tests
./test-api.sh
```

The test script includes:
- Core endpoint validation
- Input validation testing
- Error handling verification
- Rate limiting checks
- Mock CloudPanel operations

## License

MIT
