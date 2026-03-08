#!/bin/bash

# AI Voice Agent - Quick Start Script using Cloudflare Tunnel (no signup needed!)

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  🤖 AI Voice Agent - Starting Up...     ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Kill any existing processes
echo "🧹 Cleaning up old processes..."
pkill cloudflared 2>/dev/null
pkill -f "node src/index.js" 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1

# Start the Node.js server
echo "🚀 Starting AI server on port 3000..."
node src/index.js > server.log 2>&1 &
SERVER_PID=$!
sleep 3

# Check server
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Server is running!"
else
    echo "❌ Server failed to start! Check server.log"
    cat server.log
    exit 1
fi

# Start Cloudflare Tunnel
echo ""
echo "🌐 Starting Cloudflare tunnel (no signup needed)..."
cloudflared tunnel --url http://localhost:3000 --logfile /tmp/cf_tunnel.log &
CF_PID=$!

# Wait for tunnel URL
echo "⏳ Waiting for tunnel URL..."
sleep 10

# Extract URL
TUNNEL_URL=$(grep -o 'https://[^ ]*\.trycloudflare\.com' /tmp/cf_tunnel.log | head -1)

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ Could not get tunnel URL. Check /tmp/cf_tunnel.log"
    cat /tmp/cf_tunnel.log | tail -5
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║  ✅ EVERYTHING IS RUNNING!                                      ║"
echo "║                                                                  ║"
echo "║  📞 YOUR NUMBER: (870) 444-8842                                 ║"
echo "║                                                                  ║"
echo "║  🌐 PUBLIC URL:                                                  ║"
echo "║  $TUNNEL_URL   ║"
echo "║                                                                  ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║                                                                  ║"
echo "║  👉 COPY THESE INTO TWILIO:                                     ║"
echo "║                                                                  ║"
echo "║  A CALL COMES IN:                                               ║"
echo "║  $TUNNEL_URL/api/twilio/simple-call   ║"
echo "║                                                                  ║"
echo "║  CALL STATUS CHANGES:                                           ║"
echo "║  $TUNNEL_URL/api/twilio/status        ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "🎯 Go to Twilio → Phone Numbers → Active numbers → (870) 444-8842"
echo "   Paste the webhook URLs above and click SAVE"
echo "   Then CALL (870) 444-8842 and talk to your AI! 🤖📞"
echo ""
echo "Press Ctrl+C to stop everything."
echo ""

# Keep running
wait $CF_PID
