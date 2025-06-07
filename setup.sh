#!/bin/bash

# CloudPanel API Setup Script

echo "🚀 Setting up CloudPanel API Node.js..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if CloudPanel CLI is installed
if ! command -v clpctl &> /dev/null; then
    echo "⚠️  CloudPanel CLI (clpctl) is not found in PATH."
    echo "   Please install CloudPanel CLI first: https://www.cloudpanel.io/docs/v2/installation/"
    echo "   Or set CLPCTL_PATH environment variable to the correct path."
fi

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ Please edit .env file with your configuration"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create logs directory
mkdir -p logs

echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Make sure CloudPanel CLI is installed and accessible"
echo "3. Run 'npm run dev' to start the development server"
echo "4. Visit http://localhost:3000/health to check if the API is running"
echo "5. Visit http://localhost:3000/api/docs for API documentation"
