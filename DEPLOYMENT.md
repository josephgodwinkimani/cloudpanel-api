# CloudPanel API Deployment Guide

This guide covers different deployment scenarios for the CloudPanel API.

## Prerequisites

1. **CloudPanel Installation**: CloudPanel must be installed on the target server
2. **Node.js**: Version 18+ required
3. **CloudPanel CLI**: The `clpctl` command must be available

## Deployment Options

### 1. Direct Server Deployment

#### Step 1: Prepare the Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or install via nvm for user-level installation
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

#### Step 2: Deploy the Application

```bash
# Clone or copy your project
git clone <your-repo> cloudpanel-api
cd cloudpanel-api

# Install dependencies
npm ci --production

# Create logs directory
mkdir -p logs

# Set up environment
cp .env.example .env
nano .env  # Edit configuration
```

#### Step 3: Configure Environment

```bash
# .env file example for production
NODE_ENV=production
PORT=3000
CLPCTL_PATH=/usr/local/bin/clpctl
API_KEY=your-secure-api-key-here
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
```

#### Step 4: Set Up Process Management

**Using PM2 (Recommended):**

```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'cloudpanel-api',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
}
EOF

# Start the application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
```

**Using systemd:**

```bash
# Create systemd service file
sudo tee /etc/systemd/system/cloudpanel-api.service > /dev/null << EOF
[Unit]
Description=CloudPanel API Service
Documentation=https://github.com/your-repo/cloudpanel-api
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/cloudpanel-api
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
KillMode=mixed
KillSignal=SIGINT
TimeoutStopSec=5
SyslogIdentifier=cloudpanel-api
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
sudo systemctl enable cloudpanel-api
sudo systemctl start cloudpanel-api
sudo systemctl status cloudpanel-api
```

### 2. Docker Deployment

#### Step 1: Build the Image

```bash
# Build the Docker image
docker build -t cloudpanel-api .

# Or using docker-compose
docker-compose build
```

#### Step 2: Run with Docker Compose

```bash
# Start the service
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop the service
docker-compose down
```

#### Step 3: Custom Docker Compose for Production

```yaml
version: '3.8'

services:
  cloudpanel-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - API_KEY=${API_KEY}
    volumes:
      - ./logs:/app/logs
      - /usr/local/bin/clpctl:/usr/local/bin/clpctl:ro
      - /etc/ssl:/etc/ssl:ro  # If SSL certificates are needed
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

  # Optional: Add a reverse proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/ssl:ro
    depends_on:
      - cloudpanel-api
    restart: unless-stopped
```

### 3. Reverse Proxy Setup

#### Nginx Configuration

```nginx
# /etc/nginx/sites-available/cloudpanel-api
server {
    listen 80;
    server_name api.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /path/to/ssl/certificate.crt;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Health check endpoint (no rate limiting)
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }
}
```

#### Apache Configuration

```apache
# /etc/apache2/sites-available/cloudpanel-api.conf
<VirtualHost *:80>
    ServerName api.yourdomain.com
    Redirect permanent / https://api.yourdomain.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName api.yourdomain.com
    
    SSLEngine on
    SSLCertificateFile /path/to/ssl/certificate.crt
    SSLCertificateKeyFile /path/to/ssl/private.key
    
    # Security headers
    Header always set X-Frame-Options DENY
    Header always set X-Content-Type-Options nosniff
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    
    ProxyPreserveHost On
    ProxyRequests Off
    
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
    
    ProxyPassReverse / http://127.0.0.1:3000/
    ProxyPassReverseAdjustHeaders On
</VirtualHost>
```

## Security Considerations

### 1. API Key Management

```bash
# Generate a secure API key
API_KEY=$(openssl rand -hex 32)
echo "API_KEY=$API_KEY" >> .env
```

### 2. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw allow 8443/tcp # CloudPanel (if needed)
sudo ufw enable

# If running API directly on port 3000
sudo ufw allow 3000/tcp
```

### 3. User Permissions

```bash
# Create dedicated user
sudo useradd -r -s /bin/false cloudpanel-api

# Set proper permissions
sudo chown -R cloudpanel-api:cloudpanel-api /path/to/cloudpanel-api
sudo chmod -R 755 /path/to/cloudpanel-api
sudo chmod 600 /path/to/cloudpanel-api/.env
```

### 4. Logging and Monitoring

```bash
# Set up log rotation
sudo tee /etc/logrotate.d/cloudpanel-api > /dev/null << EOF
/path/to/cloudpanel-api/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 cloudpanel-api cloudpanel-api
    postrotate
        systemctl reload cloudpanel-api || pm2 reload cloudpanel-api
    endscript
}
EOF
```

## Monitoring and Health Checks

### 1. Health Check Script

```bash
#!/bin/bash
# /usr/local/bin/check-cloudpanel-api.sh

API_URL="http://localhost:3000/health"
TIMEOUT=10

response=$(curl -s -w "%{http_code}" -m $TIMEOUT "$API_URL" -o /dev/null)

if [ "$response" = "200" ]; then
    echo "CloudPanel API is healthy"
    exit 0
else
    echo "CloudPanel API is unhealthy (HTTP $response)"
    exit 1
fi
```

### 2. Cron Job for Health Checks

```bash
# Add to crontab
*/5 * * * * /usr/local/bin/check-cloudpanel-api.sh || systemctl restart cloudpanel-api
```

## Backup and Maintenance

### 1. Backup Script

```bash
#!/bin/bash
# backup-cloudpanel-api.sh

BACKUP_DIR="/backup/cloudpanel-api"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup application
tar -czf "$BACKUP_DIR/cloudpanel-api-$DATE.tar.gz" \
    --exclude=node_modules \
    --exclude=logs \
    /path/to/cloudpanel-api

# Backup logs (last 30 days)
find /path/to/cloudpanel-api/logs -name "*.log" -mtime -30 | \
    tar -czf "$BACKUP_DIR/logs-$DATE.tar.gz" -T -

# Clean old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
```

### 2. Update Process

```bash
#!/bin/bash
# update-cloudpanel-api.sh

cd /path/to/cloudpanel-api

# Backup current version
tar -czf ../cloudpanel-api-backup-$(date +%Y%m%d).tar.gz .

# Pull updates
git pull

# Install dependencies
npm ci --production

# Restart service
if command -v pm2 > /dev/null; then
    pm2 reload cloudpanel-api
else
    sudo systemctl restart cloudpanel-api
fi

# Verify health
sleep 5
curl -f http://localhost:3000/health || {
    echo "Health check failed, rolling back..."
    # Rollback logic here
    exit 1
}

echo "Update completed successfully"
```

## Troubleshooting

### Common Issues

1. **Permission Denied for clpctl**
   ```bash
   # Ensure the API user has sudo access for clpctl
   sudo usermod -aG sudo cloudpanel-api
   ```

2. **Port Already in Use**
   ```bash
   # Find process using port 3000
   sudo lsof -i :3000
   # Kill the process or change the port
   ```

3. **CloudPanel CLI Not Found**
   ```bash
   # Find clpctl location
   which clpctl
   # Update CLPCTL_PATH in .env
   ```

4. **Memory Issues**
   ```bash
   # Monitor memory usage
   pm2 monit
   # Adjust memory limits in ecosystem.config.js
   ```

### Log Analysis

```bash
# View application logs
tail -f logs/combined.log

# PM2 logs
pm2 logs cloudpanel-api

# System logs
sudo journalctl -u cloudpanel-api -f

# Error analysis
grep -i error logs/error.log | tail -20
```
