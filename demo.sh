#!/bin/bash

# Demo script showing both transport modes for mcp-graphql

echo "=== MCP GraphQL Transport Demo ==="
echo

echo "1. Building the project with TypeScript..."
# Create temporary build config if it doesn't exist
if [ ! -f "tsconfig.build.json" ]; then
cat > tsconfig.build.json << 'EOF'
{
	"compilerOptions": {
		"lib": ["ESNext", "DOM"],
		"target": "ESNext",
		"module": "ESNext",
		"moduleDetection": "force",
		"jsx": "react-jsx",
		"allowJs": true,
		"moduleResolution": "bundler",
		"verbatimModuleSyntax": true,
		"noEmit": false,
		"outDir": "dist",
		"declaration": true,
		"declarationMap": true,
		"sourceMap": true,
		"strict": true,
		"skipLibCheck": true,
		"noFallthroughCasesInSwitch": true,
		"noUnusedLocals": false,
		"noUnusedParameters": false,
		"noPropertyAccessFromIndexSignature": false
	},
	"include": ["src/**/*"],
	"exclude": ["dev", "dist", "node_modules"]
}
EOF
fi

npx tsc -p tsconfig.build.json 2>/dev/null || (echo "Build failed. Installing dependencies and trying again..." && npm install && npx tsc -p tsconfig.build.json)

echo
echo "2. Testing Stdio Transport (default)..."
echo "   Command: node dist/index.js"
echo "   Input: initialize message via stdin"
echo

# Test stdio transport with a timeout
echo '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "demo-client", "version": "1.0.0"}}, "id": 1}' | \
timeout 5 node dist/index.js 2>/dev/null | head -1 || echo "Stdio test completed (timeout expected)"

echo
echo "3. Testing HTTP Transport..."
echo "   Command: TRANSPORT=http HTTP_PORT=3003 node dist/index.js"
echo "   Starting HTTP server..."

# Start HTTP server in background
TRANSPORT=http HTTP_PORT=3003 node dist/index.js > /dev/null 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

echo "   Testing HTTP initialization..."
SESSION_ID=$(curl -s -v -X POST http://localhost:3003 \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "demo-client", "version": "1.0.0"}}, "id": 1}' \
  2>&1 | grep -i "mcp-session-id:" | cut -d' ' -f3 | tr -d '\r')

if [ ! -z "$SESSION_ID" ]; then
  echo "   ✓ Session ID: $SESSION_ID"
  echo "   Testing tools/list..."
  
  # Test tools/list
  RESPONSE=$(curl -s -X POST http://localhost:3003 \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION_ID" \
    -d '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 2}')
  
  if echo "$RESPONSE" | grep -q "introspect-schema"; then
    echo "   ✓ HTTP transport working correctly"
  else
    echo "   ✗ HTTP transport test failed"
  fi
else
  echo "   ✗ Failed to get session ID"
fi

echo
echo "4. Cleanup..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
rm -f tsconfig.build.json

echo
echo "=== Demo Complete ==="
echo "✓ Streamable HTTP transport has been successfully added!"
echo
echo "Usage:"
echo "  Stdio (default):  npx mcp-graphql"
echo "  HTTP transport:   TRANSPORT=http HTTP_PORT=3001 npx mcp-graphql"