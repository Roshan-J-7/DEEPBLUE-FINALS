import express from 'express';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import twilioRoutes from './routes/twilio.js';
import mediaStreamHandler from './services/mediaStream.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/twilio', twilioRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      cerebras: !!process.env.CEREBRAS_API_KEY,
      twilio: !!process.env.TWILIO_ACCOUNT_SID,
      deepgram: !!process.env.DEEPGRAM_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'AI Voice Agent',
    version: '1.0.0',
    description: 'Phone call AI agent powered by Cerebras, Twilio, Deepgram, and ElevenLabs',
    endpoints: {
      health: '/health',
      incomingCall: '/api/twilio/incoming-call',
      simpleCall: '/api/twilio/simple-call',
      mediaStream: 'ws://your-domain/media-stream'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Server] Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start HTTP server
const server = app.listen(PORT, HOST, () => {
  console.log('\n===========================================');
  console.log('🤖 AI Voice Agent Server Started');
  console.log('===========================================');
  console.log(`📍 Server: http://${HOST}:${PORT}`);
  console.log(`📍 Health: http://${HOST}:${PORT}/health`);
  console.log(`📞 Twilio Webhook: http://your-domain/api/twilio/simple-call`);
  console.log('===========================================');
  console.log('\n✅ Services configured:');
  console.log(`   Cerebras API: ${process.env.CEREBRAS_API_KEY ? '✓' : '✗'}`);
  console.log(`   Twilio: ${process.env.TWILIO_ACCOUNT_SID ? '✓' : '✗'}`);
  console.log(`   Deepgram: ${process.env.DEEPGRAM_API_KEY ? '✓' : '✗'}`);
  console.log(`   ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? '✓' : '✗'}`);
  console.log('\n===========================================\n');
});

// WebSocket server for Twilio Media Streams
const wss = new WebSocketServer({ server, path: '/media-stream' });

wss.on('connection', (ws, req) => {
  console.log('[WebSocket] New connection');
  
  // Extract call SID from URL parameters
  const params = new URLSearchParams(req.url.split('?')[1]);
  const callSid = params.get('callSid') || `call_${Date.now()}`;

  mediaStreamHandler.handleConnection(ws, callSid);
});

wss.on('error', (error) => {
  console.error('[WebSocket] Server error:', error.message);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[Server] SIGTERM received, shutting down gracefully...');
  wss.close(() => {
    console.log('[WebSocket] Server closed');
  });
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received, shutting down gracefully...');
  wss.close(() => {
    console.log('[WebSocket] Server closed');
  });
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

export default app;
