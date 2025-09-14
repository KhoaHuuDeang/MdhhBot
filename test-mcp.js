// Test MCP server locally without Claude Code
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting MCP Database Server test...\n');

// Start MCP server
const mcpServer = spawn('node', ['mcp-server/database-server.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

// Test messages to send to MCP server
const testMessages = [
  // List tools
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  }) + '\n',

  // Get leaderboard
  JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "get_leaderboard",
      arguments: { type: "balance", limit: 5 }
    }
  }) + '\n'
];

let messageIndex = 0;

mcpServer.stdout.on('data', (data) => {
  console.log('📤 Server response:', data.toString());

  // Send next test message
  if (messageIndex < testMessages.length) {
    setTimeout(() => {
      console.log('📥 Sending:', testMessages[messageIndex].trim());
      mcpServer.stdin.write(testMessages[messageIndex]);
      messageIndex++;
    }, 1000);
  } else {
    // Test complete
    setTimeout(() => {
      console.log('\n✅ MCP Server test completed!');
      mcpServer.kill();
    }, 2000);
  }
});

mcpServer.stderr.on('data', (data) => {
  console.log('🔧 Server log:', data.toString());

  // Send first message when server is ready
  if (data.toString().includes('running on stdio') && messageIndex === 0) {
    setTimeout(() => {
      console.log('📥 Sending:', testMessages[messageIndex].trim());
      mcpServer.stdin.write(testMessages[messageIndex]);
      messageIndex++;
    }, 1000);
  }
});

mcpServer.on('close', (code) => {
  console.log(`\n🔄 MCP server exited with code ${code}`);
});