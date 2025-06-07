# CloudPanel API Node.js

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![GitHub Repository](https://img.shields.io/badge/GitHub-iamfafakkk/cloudpanel--api-blue)](https://github.com/iamfafakkk/cloudpanel-api.git)

A comprehensive Node.js API wrapper for CloudPanel CLI commands. This RESTful API provides programmatic access to all CloudPanel server management operations, making it easy to integrate CloudPanel functionality into your applications and automation workflows.

## ✨ Features

- 🌐 **Cloudflare Management**: Update and sync IP addresses
- 🔐 **CloudPanel Security**: Enable/disable basic authentication
- 🗄️ **Database Operations**: Create, import, export, and manage databases
- 🔒 **SSL/TLS Certificates**: Install Let's Encrypt and custom certificates
- 🌍 **Site Management**: Deploy Node.js, PHP, Python, static sites, and reverse proxies
- 👥 **User Administration**: Complete user lifecycle management
- 📋 **Vhost Templates**: Custom template management and deployment
- ⚡ **Smart Confirmation Handling**: Automatic handling of CLI confirmation prompts (no more hanging commands!)
- 🔄 **Force Mode Support**: Optional force mode for deletion operations
- 🚀 **Production Ready**: Built for automated deployment and CI/CD workflows

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- CloudPanel installed on your server
- CloudPanel CLI (`clpctl`) available in PATH

### Installation

```bash
# Clone the repository
git clone https://github.com/iamfafakkk/cloudpanel-api.git
cd cloudpanel-api

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

### Docker Installation

```bash
# Clone the repository
git clone https://github.com/iamfafakkk/cloudpanel-api.git
cd cloudpanel-api

# Start with Docker Compose
docker-compose up -d
```

## 📖 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication
```bash
# Include API key in headers (when enabled)
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/endpoint
```

### 🌐 Cloudflare Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/cloudflare/update-ips` | Update Cloudflare IP addresses |

### 🔐 CloudPanel Security
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/cloudpanel/basic-auth/enable` | Enable basic authentication |
| `DELETE` | `/cloudpanel/basic-auth/disable` | Disable basic authentication |

### 🗄️ Database Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/database/master-credentials` | Get master database credentials |
| `POST` | `/database/add` | Create new database |
| `POST` | `/database/export` | Export database |
| `POST` | `/database/import` | Import database |

### 🔒 SSL/TLS Certificates  
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/letsencrypt/install` | Install Let's Encrypt certificate |

### 🌍 Site Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/site/add/nodejs` | Create Node.js application site |
| `POST` | `/site/add/php` | Create PHP website |
| `POST` | `/site/add/python` | Create Python application site |
| `POST` | `/site/add/static` | Create static website |
| `POST` | `/site/add/reverse-proxy` | Create reverse proxy site |
| `DELETE` | `/site/delete` | Delete existing site |

### 👤 User Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/user/list` | List all users |
| `POST` | `/user/add` | Create new user |
| `DELETE` | `/user/delete` | Delete user |
| `POST` | `/user/reset-password` | Reset user password |
| `POST` | `/user/enable-2fa` | Enable two-factor authentication |
| `DELETE` | `/user/disable-2fa` | Disable two-factor authentication |

### 📄 Vhost Template Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/vhost-template/list` | List available templates |
| `POST` | `/vhost-template/import` | Import new template |
| `POST` | `/vhost-template/add` | Create custom template |
| `DELETE` | `/vhost-template/delete` | Delete template |
| `GET` | `/vhost-template/view` | View template content |
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

### Live API Documentation
```bash
curl http://localhost:3000/api/docs
```

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

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Server Configuration
NODE_ENV=development
PORT=3000

# CloudPanel Configuration
CLPCTL_PATH=clpctl

# Security (optional)
API_KEY=your-secure-api-key-here
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

### Security Features

- **API Key Authentication**: Optional but recommended for production
- **Rate Limiting**: Configurable request throttling
- **Input Validation**: Joi schema validation for all endpoints
- **Security Headers**: Helmet.js security middleware
- **CORS Support**: Configurable cross-origin policies

## 📚 Documentation

- **[API Examples](EXAMPLES.md)**: Complete usage examples with curl commands
- **[Deployment Guide](DEPLOYMENT.md)**: Production deployment instructions
- **[Project Status](PROJECT_STATUS.md)**: Development progress and features

## 🐳 Docker Deployment

### Using Docker Compose
```bash
docker-compose up -d
```

### Manual Docker Build
```bash
docker build -t cloudpanel-api .
docker run -p 3000:3000 cloudpanel-api
```

## 📋 API Usage Examples

### Create a Node.js Site
```bash
curl -X POST http://localhost:3000/api/site/add/nodejs \
  -H "Content-Type: application/json" \
  -d '{
    "domainName": "myapp.com",
    "nodejsVersion": 20,
    "appPort": 3000,
    "siteUser": "myuser",
    "siteUserPassword": "securepass123"
  }'
```

### Install SSL Certificate
```bash
curl -X POST http://localhost:3000/api/letsencrypt/install \
  -H "Content-Type: application/json" \
  -d '{
    "domainNames": ["myapp.com", "www.myapp.com"],
    "email": "admin@myapp.com"
  }'
```

### Add Database
```bash
curl -X POST http://localhost:3000/api/database/add \
  -H "Content-Type: application/json" \
  -d '{
    "domainName": "myapp.com",
    "databaseName": "myapp_db",
    "databaseUserName": "dbuser",
    "databaseUserPassword": "dbpass123"
  }'
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **GitHub Issues**: [Create an issue](https://github.com/iamfafakkk/cloudpanel-api/issues)
- **Documentation**: Check the docs in this repository
- **CloudPanel Docs**: [Official CloudPanel Documentation](https://www.cloudpanel.io/docs/)

## 🙏 Acknowledgments

- [CloudPanel](https://cloudpanel.io/) for providing the excellent server management platform
- The Node.js and Express.js communities for the robust ecosystem
- All contributors who help improve this project

---

**Made with ❤️ for the CloudPanel community**
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
