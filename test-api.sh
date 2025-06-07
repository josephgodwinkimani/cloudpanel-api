#!/bin/bash

# CloudPanel API Test Suite
# Comprehensive testing script for all API endpoints

API_BASE="http://localhost:3000"
API_KEY="your-api-key-here"

echo "🚀 CloudPanel API Test Suite"
echo "============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0

# Function to run a test
run_test() {
    local test_name="$1"
    local endpoint="$2"
    local method="$3"
    local data="$4"
    local expected_status="${5:-200}"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -n "Testing: $test_name ... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "%{http_code}" -o /tmp/api_response.json "$API_BASE$endpoint")
    else
        response=$(curl -s -w "%{http_code}" -o /tmp/api_response.json -X "$method" \
            -H "Content-Type: application/json" \
            -H "X-API-Key: $API_KEY" \
            -d "$data" \
            "$API_BASE$endpoint")
    fi
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}FAIL${NC} (Expected: $expected_status, Got: $response)"
        if [ -f /tmp/api_response.json ]; then
            echo "Response: $(cat /tmp/api_response.json)"
        fi
    fi
}

echo -e "${BLUE}=== Core Endpoints ===${NC}"

# Test health endpoint
run_test "Health Check" "/health" "GET"

# Test API documentation
run_test "API Documentation" "/api/docs" "GET"

# Test monitoring endpoint
run_test "Server Monitoring" "/api/monitor" "GET"

# Test 404 handling
run_test "404 Handler" "/nonexistent" "GET" "" "404"

echo ""
echo -e "${BLUE}=== Validation Tests ===${NC}"

# Test validation errors
run_test "Invalid Node.js Site Data" "/api/site/add/nodejs" "POST" '{"domainName":"test.com"}' "400"

run_test "Invalid Email Format" "/api/user/add" "POST" '{"userName":"test","email":"invalid","firstName":"Test","lastName":"User","password":"password123","role":"admin"}' "400"

run_test "Invalid PHP Version" "/api/site/add/php" "POST" '{"domainName":"test.com","phpVersion":"9.0","vhostTemplate":"Generic","siteUser":"test","siteUserPassword":"pass123"}' "400"

echo ""
echo -e "${BLUE}=== CloudPanel Operations (Mock Tests) ===${NC}"

# Test Cloudflare operations
run_test "Update Cloudflare IPs" "/api/cloudflare/update-ips" "POST" '{}' "200"

# Test CloudPanel basic auth
run_test "Enable Basic Auth" "/api/cloudpanel/basic-auth/enable" "POST" '{"userName":"admin","password":"password123"}' "200"

# Test database operations
run_test "Add Database" "/api/database/add" "POST" '{"domainName":"test.com","databaseName":"testdb","databaseUserName":"testuser","databaseUserPassword":"password123"}' "200"

# Test Let's Encrypt
run_test "Install SSL Certificate" "/api/letsencrypt/install" "POST" '{"domainNames":["test.com","www.test.com"],"email":"admin@test.com"}' "200"

# Test site operations
run_test "Add Node.js Site" "/api/site/add/nodejs" "POST" '{"domainName":"test.com","nodejsVersion":20,"appPort":3000,"siteUser":"testuser","siteUserPassword":"password123"}' "200"

run_test "Add PHP Site" "/api/site/add/php" "POST" '{"domainName":"php-test.com","phpVersion":"8.2","vhostTemplate":"Generic","siteUser":"phpuser","siteUserPassword":"password123"}' "200"

# Test user operations
run_test "Add User" "/api/user/add" "POST" '{"userName":"newuser","email":"user@example.com","firstName":"New","lastName":"User","password":"password123","role":"user"}' "200"

run_test "List Users" "/api/user/list" "GET"

# Test vhost template operations
run_test "List Vhost Templates" "/api/vhost-template/list" "GET"

echo ""
echo -e "${BLUE}=== Rate Limiting Test ===${NC}"

# Test rate limiting (send multiple requests quickly)
echo -n "Testing rate limiting ... "
rate_limit_exceeded=false
for i in {1..15}; do
    response=$(curl -s -w "%{http_code}" -o /dev/null "$API_BASE/health")
    if [ "$response" = "429" ]; then
        rate_limit_exceeded=true
        break
    fi
    sleep 0.1
done

if [ "$rate_limit_exceeded" = true ]; then
    echo -e "${GREEN}PASS${NC} (Rate limiting active)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}SKIP${NC} (Rate limiting not triggered)"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""
echo -e "${BLUE}=== Test Summary ===${NC}"
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
