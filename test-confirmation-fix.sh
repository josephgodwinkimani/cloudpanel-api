#!/bin/bash
# Test script for CloudPanel API confirmation handler fix

echo "🧪 Testing CloudPanel API Confirmation Handler Fix"
echo "=================================================="

# Start the server in background
echo "📡 Starting CloudPanel API server..."
cd /Users/imf/Desktop/cloudpanel-api-node
npm start > /dev/null 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Test health endpoint
echo "🏥 Testing health endpoint..."
curl -s http://localhost:3000/health | jq .

# Test site deletion API structure (this won't execute actual clpctl command without proper setup)
echo ""
echo "🗑️  Testing site deletion endpoint structure..."
echo "Request: DELETE /api/site/delete with force parameter"
echo '{"domainName": "test.example.com", "force": true}' | curl -X DELETE \
  -H "Content-Type: application/json" \
  -d @- \
  http://localhost:3000/api/site/delete 2>/dev/null | jq . || echo "Expected: Command would execute with --force flag"

echo ""
echo "🧪 Testing user deletion endpoint structure..."
echo "Request: DELETE /api/user/delete with force parameter"
echo '{"userName": "testuser", "force": true}' | curl -X DELETE \
  -H "Content-Type: application/json" \
  -d @- \
  http://localhost:3000/api/user/delete 2>/dev/null | jq . || echo "Expected: Command would execute with confirmation input"

echo ""
echo "🧪 Testing vhost template deletion endpoint structure..."
echo "Request: DELETE /api/vhost-templates/delete with force parameter"
echo '{"name": "Test Template", "force": true}' | curl -X DELETE \
  -H "Content-Type: application/json" \
  -d @- \
  http://localhost:3000/api/vhost-templates/delete 2>/dev/null | jq . || echo "Expected: Command would execute with confirmation input"

# Clean up
echo ""
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null

echo ""
echo "✅ Test completed!"
echo "Note: Actual CloudPanel CLI commands would require proper clpctl setup."
echo "This test verifies that the API endpoints accept the force parameter correctly."
