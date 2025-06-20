#!/bin/bash

# Test script for Laravel setup endpoint
# This script tests the /api/setup endpoint

echo "Testing Laravel Setup Endpoint..."

# Configuration
API_BASE_URL="http://localhost:3000"
API_KEY="your-api-key-here"
DOMAIN_NAME="laravel-test.example.com"
SITE_USER="laraveluser"
SITE_PASSWORD="securepassword123"
DB_NAME="laravel_db"
DB_USER="laravel_user"
DB_PASSWORD="dbpassword123"

# Test data
JSON_DATA='{
  "domainName": "'$DOMAIN_NAME'",
  "phpVersion": "8.2",
  "vhostTemplate": "Laravel 11",
  "siteUser": "'$SITE_USER'",
  "siteUserPassword": "'$SITE_PASSWORD'",
  "databaseName": "'$DB_NAME'",
  "databaseUserName": "'$DB_USER'",
  "databaseUserPassword": "'$DB_PASSWORD'"
}'

echo "Sending request to setup Laravel site..."
echo "Domain: $DOMAIN_NAME"
echo "PHP Version: 8.2"
echo "Database: $DB_NAME"
echo ""

# Make the API request
curl -X POST \
  "$API_BASE_URL/api/setup" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "$JSON_DATA" \
  -w "\nHTTP Status: %{http_code}\n" \
  --silent --show-error

echo ""
echo "Setup test completed!"
