#!/bin/bash

# CloudPanel API Deployment Script using PM2
# Author: iamfafakkk
# Description: Automated deployment script for CloudPanel API using PM2

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="cloudpanel-api"
APP_DIR="/root/cloudpanel-api"
BACKUP_DIR="/root/backup/cloudpanel-api"
USER="root"
PORT=3000
GIT_REPO="https://github.com/iamfafakkk/cloudpanel-api.git"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root since the application will be deployed to /root/cloudpanel-api"
        error "Please run with: sudo ./deploy.sh"
        exit 1
    fi
}

# Load NVM environment
load_nvm() {
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
}

# Install Node.js using NVM
install_nodejs() {
    log "Checking Node.js installation..."
    
    # Check if NVM is installed
    if [[ ! -s "$HOME/.nvm/nvm.sh" ]]; then
        log "NVM not found. Installing NVM..."
        
        # Download and install NVM
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        
        # Source NVM
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
        
        success "NVM installed successfully"
    else
        log "NVM is already installed"
        # Source NVM
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log "Node.js not found. Installing Node.js LTS using NVM..."
        nvm install --lts
        nvm use --lts
        nvm alias default lts/*
        success "Node.js LTS installed successfully"
    else
        # Check Node.js version
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $NODE_VERSION -lt 22 ]]; then
            warning "Node.js version $(node -v) is below required version 22. Installing Node.js 22..."
            nvm install 22
            nvm use 22
            nvm alias default 22
            success "Node.js 22 installed and set as default"
        else
            success "Node.js $(node -v) meets requirements"
        fi
    fi
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Git
    if ! command -v git &> /dev/null; then
        error "Git is not installed. Please install Git first."
        exit 1
    fi
    
    # Install/Check Node.js using NVM
    install_nodejs
    
    # Check npm (should be available after Node.js installation)
    if ! command -v npm &> /dev/null; then
        error "npm is not installed after Node.js installation"
        exit 1
    fi
    
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        warning "PM2 is not installed. Installing PM2..."
        npm install -g pm2
    fi
    
    # Check CloudPanel CLI
    if ! command -v clpctl &> /dev/null; then
        warning "clpctl not found in PATH. Make sure to configure CLPCTL_PATH in .env"
    fi
    
    # Check curl for health checks
    if ! command -v curl &> /dev/null; then
        warning "curl is not installed. Health checks may not work properly."
    fi
    
    # Check UFW for firewall management
    if ! command -v ufw &> /dev/null; then
        warning "UFW is not installed. Firewall configuration will be skipped."
        warning "Please manually configure your firewall to allow the application port."
    fi
    
    success "Prerequisites check completed"
}

# Clone or update project from Git
clone_or_update_project() {
    log "Checking project repository..."
    
    # Create application directory if it doesn't exist
    if [[ ! -d "$APP_DIR" ]]; then
        log "Creating application directory: $APP_DIR"
        mkdir -p "$APP_DIR"
    fi
    
    # Check if it's a git repository
    if [[ -d "$APP_DIR/.git" ]]; then
        log "Git repository found. Updating from remote..."
        cd "$APP_DIR"
        
        # Reset any local changes that might interfere
        log "Resetting local changes..."
        git reset --hard HEAD
        git clean -fd
        
        # Fetch latest changes
        git fetch origin --prune
        
        # Check if there are changes
        LOCAL=$(git rev-parse HEAD)
        REMOTE=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null)
        
        if [[ "$LOCAL" != "$REMOTE" ]]; then
            log "New changes detected. Pulling latest code..."
            git pull origin main 2>/dev/null || git pull origin master 2>/dev/null
            
            # Clear application cache files
            log "Clearing application cache..."
            rm -rf logs/*.log 2>/dev/null || true
            rm -rf sessions/*.db 2>/dev/null || true
            
            success "Repository updated successfully with cache cleared"
        else
            log "Repository is already up to date"
        fi
    else
        # Check if directory is empty or only has basic files
        if [[ ! -f "$APP_DIR/package.json" ]]; then
            # Check if we're running from a project directory
            if [[ -f "package.json" ]] && [[ "$(pwd)" != "$APP_DIR" ]]; then
                log "Copying current project files to $APP_DIR"
                cp -r . "$APP_DIR/"
                cd "$APP_DIR"
                success "Project files copied successfully"
            else
                log "No project found. Cloning from Git repository..."
                
                # Remove directory and clone fresh
                rm -rf "$APP_DIR"
                git clone "$GIT_REPO" "$APP_DIR"
                cd "$APP_DIR"
                success "Repository cloned successfully"
            fi
        else
            log "Project files already exist in $APP_DIR"
            cd "$APP_DIR"
        fi
    fi
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    # Clone or update project first
    clone_or_update_project
    
    # Create logs and backup directories
    mkdir -p logs
    mkdir -p "$BACKUP_DIR"
    
    success "Directories created and positioned in $APP_DIR"
}

# Install dependencies
install_dependencies() {
    log "Installing dependencies..."
    
    # Ensure NVM is loaded
    load_nvm
    
    # Clear npm cache to prevent stale packages
    log "Clearing npm cache..."
    npm cache clean --force
    
    # Remove node_modules and package-lock.json to ensure fresh install
    if [[ -d node_modules ]]; then
        log "Removing existing node_modules..."
        rm -rf node_modules
    fi
    
    # Remove package-lock.json to ensure fresh dependency resolution
    if [[ -f package-lock.json ]]; then
        log "Removing package-lock.json for fresh dependency resolution..."
        rm -f package-lock.json
    fi
    
    # Fresh install
    log "Installing fresh dependencies..."
    npm install --production --no-cache
    
    success "Dependencies installed fresh"
}

# Setup environment
setup_environment() {
    log "Setting up environment..."
    
    if [[ ! -f .env ]]; then
        if [[ -f .env.example ]]; then
            cp .env.example .env
            success "Created .env from .env.example"
            
            # Interactive configuration
            configure_environment
        else
            error ".env.example not found. Please create .env file manually."
            exit 1
        fi
    else
        log "Environment file already exists"
        
        # Check if critical values are still default/empty
        if grep -q "your-secure-api-key-here\|API_KEY=$" .env 2>/dev/null; then
            warning "Default API key detected in .env file"
            read -p "Do you want to reconfigure the environment? (y/N): " -r
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                configure_environment
            fi
        fi
    fi
    
    success "Environment setup completed"
}

# Configure environment interactively
configure_environment() {
    log "Configuring environment variables..."
    
    echo
    echo -e "${BLUE}=== Environment Configuration ===${NC}"
    echo "Please provide the following configuration values:"
    echo
    
    # Get current values from .env if they exist
    current_port=$(grep "^PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "3000")
    current_api_key=$(grep "^API_KEY=" .env 2>/dev/null | cut -d'=' -f2 || echo "")
    
    # Display current configuration if it exists
    if [[ -f .env ]]; then
        echo -e "${BLUE}Current configuration:${NC}"
        echo -e "Port: $current_port"
        if [[ -n "$current_api_key" && "$current_api_key" != "your-secure-api-key-here" ]]; then
            echo -e "API Key: ${current_api_key:0:8}... (existing)"
        else
            echo -e "API Key: not configured"
        fi
        echo
    fi
    
    # Configure PORT
    while true; do
        read -p "Enter the application port (current: $current_port): " new_port
        
        # Use current port if empty input
        if [[ -z "$new_port" ]]; then
            new_port="$current_port"
        fi
        
        # Validate port number
        if [[ "$new_port" =~ ^[0-9]+$ ]] && [ "$new_port" -ge 1 ] && [ "$new_port" -le 65535 ]; then
            # Check if port is already in use
            if command -v lsof >/dev/null 2>&1 && lsof -Pi :$new_port -sTCP:LISTEN -t >/dev/null 2>&1; then
                warning "Port $new_port is currently in use by another process."
                read -p "Do you want to use this port anyway? (y/N): " -r
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    break
                fi
            else
                break
            fi
        else
            error "Invalid port number. Please enter a number between 1 and 65535."
        fi
    done
    
    # Configure API_KEY
    while true; do
        echo
        echo "API Key options:"
        echo "1. Generate a secure random API key (recommended)"
        echo "2. Enter your own API key"
        if [[ -n "$current_api_key" && "$current_api_key" != "your-secure-api-key-here" ]]; then
            echo "3. Keep current API key"
            read -p "Choose an option (1-3): " api_choice
        else
            read -p "Choose an option (1-2): " api_choice
        fi
        
        case $api_choice in
            1)
                new_api_key=$(openssl rand -hex 32 2>/dev/null || head /dev/urandom | tr -dc A-Za-z0-9 | head -c 64)
                echo "Generated API key: $new_api_key"
                break
                ;;
            2)
                read -p "Enter your API key: " new_api_key
                if [[ -n "$new_api_key" ]]; then
                    break
                else
                    error "API key cannot be empty."
                fi
                ;;
            3)
                if [[ -n "$current_api_key" && "$current_api_key" != "your-secure-api-key-here" ]]; then
                    new_api_key="$current_api_key"
                    echo "Keeping current API key"
                    break
                else
                    error "Invalid option. Current API key is not available."
                fi
                ;;
            *)
                if [[ -n "$current_api_key" && "$current_api_key" != "your-secure-api-key-here" ]]; then
                    error "Invalid option. Please choose 1, 2, or 3."
                else
                    error "Invalid option. Please choose 1 or 2."
                fi
                ;;
        esac
    done
    
    # Display configuration summary
    echo
    echo -e "${BLUE}=== Configuration Summary ===${NC}"
    echo -e "${BLUE}Port:${NC} $new_port"
    echo -e "${BLUE}API Key:${NC} ${new_api_key:0:8}... (truncated for security)"
    echo
    
    read -p "Proceed with this configuration? (Y/n): " -r
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        log "Configuration cancelled. Restarting configuration..."
        configure_environment
        return
    fi
    
    # Update .env file
    log "Updating .env file with new configuration..."
    
    # Update PORT
    if grep -q "^PORT=" .env; then
        sed -i.bak "s/^PORT=.*/PORT=$new_port/" .env
    else
        echo "PORT=$new_port" >> .env
    fi
    
    # Update API_KEY
    if grep -q "^API_KEY=" .env; then
        sed -i.bak "s/^API_KEY=.*/API_KEY=$new_api_key/" .env
    else
        echo "API_KEY=$new_api_key" >> .env
    fi
    
    # Remove backup file
    rm -f .env.bak
    
    # Update PORT variable for this script
    PORT="$new_port"
    
    # Configure UFW firewall for the selected port
    configure_ufw_port "$new_port"
    
    echo
    success "Environment configuration completed!"
    echo -e "${BLUE}Port:${NC} $new_port"
    echo -e "${BLUE}API Key:${NC} ${new_api_key:0:8}... (truncated for security)"
    echo
}

# Configure UFW firewall for application port
configure_ufw_port() {
    local port="$1"
    
    # Check if UFW is installed
    if ! command -v ufw &> /dev/null; then
        warning "UFW is not installed. Skipping firewall configuration."
        warning "Please manually configure your firewall to allow port $port"
        return 0
    fi
    
    log "Configuring UFW firewall for port $port..."
    
    # Check if UFW is active
    if ! ufw status | grep -q "Status: active"; then
        warning "UFW is not active. Firewall rules will be added but not enforced."
        read -p "Do you want to enable UFW firewall? (y/N): " -r
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log "Enabling UFW firewall..."
            ufw --force enable
            success "UFW firewall enabled"
        else
            log "UFW will remain inactive. Rules added but not enforced."
        fi
    fi
    
    # Check if port is already allowed
    if ufw status numbered | grep -q ":$port "; then
        log "Port $port is already allowed in UFW"
    else
        log "Adding UFW rule to allow port $port..."
        ufw allow "$port"/tcp
        success "UFW rule added: Allow port $port/tcp"
    fi
    
    # Show current UFW status
    log "Current UFW status:"
    ufw status numbered | grep -E "(Status:|$port)" || echo "No rules found for port $port"
}

# Create PM2 ecosystem file
create_pm2_config() {
    log "Creating PM2 ecosystem configuration..."
    
    # Get the current port from .env file
    local config_port=$(grep "^PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "3000")
    
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'cloudpanel-api',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: ${config_port}
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: ${config_port}
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    watch: false,
    ignore_watch: [
      'node_modules',
      'logs',
      '.git'
    ],
    restart_delay: 1000,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 3000
  }]
}
EOF
    
    success "PM2 ecosystem configuration created with port $config_port"
}

# Backup current deployment
backup_current() {
    # Ensure NVM is loaded
    load_nvm
    
    if pm2 list | grep -q "$APP_NAME"; then
        log "Creating backup of current deployment..."
        
        # Ensure we're in the correct directory
        cd "$APP_DIR" 2>/dev/null || {
            warning "Cannot access application directory for backup: $APP_DIR"
            return 0
        }
        
        local backup_file="$BACKUP_DIR/cloudpanel-api-backup-$(date +%Y%m%d_%H%M%S).tar.gz"
        tar -czf "$backup_file" \
            --exclude=node_modules \
            --exclude=logs \
            --exclude=.git \
            .
        
        success "Backup created: $backup_file"
    else
        log "No existing deployment found, skipping backup"
    fi
}

# Stop existing PM2 process
stop_existing() {
    # Ensure NVM is loaded
    load_nvm
    
    if pm2 list | grep -q "$APP_NAME"; then
        log "Stopping existing PM2 process..."
        pm2 stop "$APP_NAME" || true
        pm2 delete "$APP_NAME" || true
        
        # Clear PM2 logs and cache
        log "Clearing PM2 logs and cache..."
        pm2 flush "$APP_NAME" 2>/dev/null || true
        
        success "Existing process stopped and cache cleared"
    else
        log "No existing PM2 process found"
    fi
}

# Start application with PM2
start_application() {
    log "Starting application with PM2..."
    
    # Ensure NVM is loaded
    load_nvm
    
    # Start the application
    pm2 start ecosystem.config.js --env production
    
    # Save PM2 configuration
    pm2 save
    
    success "Application started with PM2"
}

# Setup PM2 startup script
setup_pm2_startup() {
    log "Setting up PM2 startup script..."
    
    # Ensure NVM is loaded
    load_nvm
    
    # This will show the command to run as root
    pm2 startup | grep -E "sudo.*pm2 startup" || true
    
    warning "Please run the sudo command shown above to enable PM2 startup on boot"
    success "PM2 startup configuration generated"
}

# Health check
health_check() {
    log "Performing health check..."
    
    # Ensure NVM is loaded
    load_nvm
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1; then
            success "Health check passed! Application is running on port $PORT"
            return 0
        fi
        
        log "Health check attempt $attempt/$max_attempts failed, waiting..."
        sleep 2
        ((attempt++))
    done
    
    error "Health check failed after $max_attempts attempts"
    
    # Show PM2 logs for debugging
    warning "Showing PM2 logs for debugging:"
    pm2 logs "$APP_NAME" --lines 20
    
    return 1
}

# Clean old backups
cleanup_backups() {
    log "Cleaning up old backups (keeping last 10)..."
    
    if [[ -d "$BACKUP_DIR" ]]; then
        find "$BACKUP_DIR" -name "*.tar.gz" -type f | \
        sort -r | \
        tail -n +11 | \
        xargs rm -f
        
        success "Old backups cleaned up"
    fi
}

# Clear all application caches
clear_all_caches() {
    log "Clearing all application caches..."
    
    # Ensure we're in the application directory
    cd "$APP_DIR" 2>/dev/null || return 1
    
    # Clear npm cache
    if command -v npm &> /dev/null; then
        log "Clearing npm cache..."
        npm cache clean --force 2>/dev/null || true
    fi
    
    # Clear Node.js require cache by restarting
    if command -v pm2 &> /dev/null; then
        load_nvm
        if pm2 list | grep -q "$APP_NAME"; then
            log "Restarting application to clear require cache..."
            pm2 restart "$APP_NAME" 2>/dev/null || true
        fi
    fi
    
    # Clear application logs (optional)
    log "Clearing application logs..."
    > logs/combined.log 2>/dev/null || true
    > logs/error.log 2>/dev/null || true
    
    # Clear PM2 logs
    if command -v pm2 &> /dev/null; then
        load_nvm
        pm2 flush "$APP_NAME" 2>/dev/null || true
    fi
    
    # Clear sessions if they exist
    if [[ -f sessions/sessions.db ]]; then
        log "Clearing session cache..."
        > sessions/sessions.db 2>/dev/null || true
    fi
    
    success "All caches cleared"
}

# Show deployment information
show_info() {
    echo
    success "=== Deployment Completed Successfully ==="
    echo
    echo -e "${BLUE}Application:${NC} $APP_NAME"
    echo -e "${BLUE}Repository:${NC} $GIT_REPO"
    echo -e "${BLUE}Directory:${NC} $APP_DIR"
    echo -e "${BLUE}Port:${NC} $PORT"
    echo -e "${BLUE}Environment:${NC} production"
    echo -e "${BLUE}Process Manager:${NC} PM2"
    echo -e "${BLUE}User:${NC} $USER"
    echo
    echo -e "${BLUE}Useful PM2 commands:${NC}"
    echo "  pm2 list                    - Show all processes"
    echo "  pm2 logs $APP_NAME         - Show logs"
    echo "  pm2 monit                   - Monitor processes"
    echo "  pm2 restart $APP_NAME      - Restart application"
    echo "  pm2 reload $APP_NAME       - Zero-downtime reload"
    echo "  pm2 stop $APP_NAME         - Stop application"
    echo
    echo -e "${BLUE}Deployment commands:${NC}"
    echo "  sudo ./deploy.sh update     - Update from Git and reload"
    echo "  sudo ./deploy.sh backup     - Create manual backup"
    echo "  sudo ./deploy.sh health     - Check application health"
    echo
    echo -e "${BLUE}Health check:${NC} curl http://localhost:$PORT/health"
    echo -e "${BLUE}Application files:${NC} $APP_DIR"
    echo -e "${BLUE}Logs directory:${NC} $APP_DIR/logs"
    echo -e "${BLUE}Backup directory:${NC} $BACKUP_DIR"
    echo
}

# Rollback function
rollback() {
    error "Deployment failed, attempting rollback..."
    
    # Ensure NVM is loaded
    load_nvm
    
    # Stop the failed deployment
    pm2 stop "$APP_NAME" 2>/dev/null || true
    pm2 delete "$APP_NAME" 2>/dev/null || true
    
    # Ensure we're in the correct directory
    cd "$APP_DIR" 2>/dev/null || {
        error "Cannot access application directory: $APP_DIR"
        return 1
    }
    
    # Find the latest backup
    local latest_backup=$(find "$BACKUP_DIR" -name "*.tar.gz" -type f | sort -r | head -1)
    
    if [[ -n "$latest_backup" ]]; then
        warning "Rolling back to: $latest_backup"
        tar -xzf "$latest_backup" -C "$APP_DIR"
        pm2 start ecosystem.config.js --env production
        warning "Rollback completed"
    else
        error "No backup found for rollback"
    fi
}

# Main deployment function
main() {
    log "Starting CloudPanel API deployment with PM2..."
    
    # Trap errors for rollback
    trap 'rollback' ERR
    
    check_root
    check_prerequisites
    create_directories
    backup_current
    stop_existing
    install_dependencies
    setup_environment
    create_pm2_config
    start_application
    
    # Remove error trap before health check
    trap - ERR
    
    if health_check; then
        setup_pm2_startup
        cleanup_backups
        show_info
        success "Deployment completed successfully!"
    else
        error "Deployment failed during health check"
        rollback
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    "start")
        load_nvm
        cd "$APP_DIR" 2>/dev/null || { error "Application directory not found: $APP_DIR"; exit 1; }
        pm2 start ecosystem.config.js --env production
        ;;
    "stop")
        load_nvm
        pm2 stop "$APP_NAME"
        ;;
    "restart")
        load_nvm
        pm2 restart "$APP_NAME"
        ;;
    "reload")
        load_nvm
        pm2 reload "$APP_NAME"
        ;;
    "logs")
        load_nvm
        pm2 logs "$APP_NAME"
        ;;
    "status")
        load_nvm
        pm2 list
        ;;
    "health")
        curl -f "http://localhost:$PORT/health" && echo "✓ Healthy" || echo "✗ Unhealthy"
        ;;
    "backup")
        backup_current
        ;;
    "cache")
        clear_all_caches
        ;;
    "update")
        log "Updating project from Git repository..."
        
        # Stop the application first to prevent file locks
        load_nvm
        if pm2 list | grep -q "$APP_NAME"; then
            log "Stopping application for update..."
            pm2 stop "$APP_NAME"
        fi
        
        # Update project
        clone_or_update_project
        
        # Force fresh dependency install
        install_dependencies
        
        # Recreate PM2 config to ensure latest settings
        create_pm2_config
        
        # Clear PM2 cache and restart fresh
        log "Clearing PM2 cache..."
        pm2 kill 2>/dev/null || true
        sleep 2
        
        # Start application
        pm2 start ecosystem.config.js --env production
        pm2 save
        
        # Verify deployment
        if health_check; then
            success "Project updated and deployed successfully"
        else
            error "Update failed during health check"
            rollback
            exit 1
        fi
        ;;
    "help"|"-h"|"--help")
        echo "CloudPanel API Deployment Script"
        echo "Deploys CloudPanel API to /root/cloudpanel-api using PM2"
        echo "Automatically installs Node.js 22+ using NVM if needed"
        echo "Automatically clones project from Git repository if not present"
        echo
        echo "Usage: sudo $0 [COMMAND]"
        echo
        echo "Commands:"
        echo "  (no args)  Deploy the application"
        echo "  start      Start the application"
        echo "  stop       Stop the application"
        echo "  restart    Restart the application"
        echo "  reload     Zero-downtime reload"
        echo "  update     Update project from Git and reload (clears cache)"
        echo "  logs       Show application logs"
        echo "  status     Show PM2 status"
        echo "  health     Check application health"
        echo "  backup     Create backup"
        echo "  cache      Clear all application caches"
        echo "  help       Show this help message"
        echo
        echo "Features:"
        echo "  - Automatic Git clone/update from repository"
        echo "  - Automatic Node.js 22+ installation via NVM"
        echo "  - PM2 process management with clustering"
        echo "  - Automatic backup and rollback"
        echo "  - Health checks and monitoring"
        echo "  - Cache clearing and dependency refresh"
        echo
        echo "Repository: $GIT_REPO"
        echo "Note: This script must be run as root (use sudo)"
        echo "Application will be deployed to: /root/cloudpanel-api"
        echo "Backups will be stored in: /root/backup/cloudpanel-api"
        ;;
    *)
        main
        ;;
esac
