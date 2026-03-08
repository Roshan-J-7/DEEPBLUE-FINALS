import WebSocket from 'ws';
import cerebrasService from './cerebras.js';
import elevenLabsService from './elevenlabs.js';

/**
 * WebSocket handler for Twilio Media Streams
 * Handles real-time audio streaming during calls
 */
class MediaStreamHandler {
  constructor() {
    this.activeCalls = new Map();
  }

  /**
   * Handle new WebSocket connection from Twilio
   */
  handleConnection(ws, callSid) {
    console.log(`[MediaStream] New connection for call: ${callSid}`);

    // Initialize call state
    this.activeCalls.set(callSid, {
      ws: ws,
      streamSid: null,
      audioBuffer: [],
      isProcessing: false,
      transcript: ''
    });

    // Initialize conversation
    cerebrasService.initConversation(callSid);

    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message);
        await this.handleMessage(callSid, msg);
      } catch (error) {
        console.error('[MediaStream] Error handling message:', error.message);
      }
    });

    ws.on('close', () => {
      this.handleClose(callSid);
    });

    ws.on('error', (error) => {
      console.error('[MediaStream] WebSocket error:', error.message);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleMessage(callSid, msg) {
    const callState = this.activeCalls.get(callSid);
    if (!callState) return;

    switch (msg.event) {
      case 'start':
        console.log(`[MediaStream] Stream started: ${msg.start.streamSid}`);
        callState.streamSid = msg.start.streamSid;
        
        // Send initial greeting
        await this.sendAIResponse(
          callSid,
          "Hello! I'm your AI assistant. How can I help you today?"
        );
        break;

      case 'media':
        // Accumulate audio data
        if (msg.media && msg.media.payload) {
          callState.audioBuffer.push(msg.media.payload);
        }
        break;

      case 'mark':
        // Mark received - can be used for synchronization
        console.log(`[MediaStream] Mark received: ${msg.mark.name}`);
        break;

      case 'stop':
        console.log(`[MediaStream] Stream stopped: ${msg.stop.streamSid}`);
        break;

      default:
        console.log(`[MediaStream] Unknown event: ${msg.event}`);
    }
  }

  /**
   * Process accumulated audio and get AI response
   */
  async processAudio(callSid) {
    const callState = this.activeCalls.get(callSid);
    if (!callState || callState.isProcessing || callState.audioBuffer.length === 0) {
      return;
    }

    try {
      callState.isProcessing = true;

      // Convert base64 audio chunks to buffer
      const audioData = Buffer.concat(
        callState.audioBuffer.map(chunk => Buffer.from(chunk, 'base64'))
      );
      
      callState.audioBuffer = [];

      // Note: Deepgram real-time transcription would go here
      // For now, we'll use a placeholder
      const transcript = await this.transcribeAudio(audioData);

      if (transcript && transcript.trim().length > 0) {
        console.log(`[MediaStream] User said: "${transcript}"`);
        
        // Get AI response from Cerebras
        const aiResponse = await cerebrasService.getResponse(callSid, transcript);
        
        // Send AI response back to caller
        await this.sendAIResponse(callSid, aiResponse);
      }

    } catch (error) {
      console.error('[MediaStream] Error processing audio:', error.message);
    } finally {
      callState.isProcessing = false;
    }
  }

  /**
   * Transcribe audio (placeholder for Deepgram integration)
   */
  async transcribeAudio(audioBuffer) {
    // In production, integrate with Deepgram live transcription
    // For now, return empty to avoid errors
    return '';
  }

  /**
   * Send AI response audio back to Twilio
   */
  async sendAIResponse(callSid, text) {
    const callState = this.activeCalls.get(callSid);
    if (!callState || !callState.ws) return;

    try {
      console.log(`[MediaStream] AI responding: "${text}"`);

      // Generate speech from text
      const audioBuffer = await elevenLabsService.textToSpeech(text);

      // Convert to base64 mulaw for Twilio
      const base64Audio = audioBuffer.toString('base64');

      // Send audio to Twilio
      const audioMessage = {
        event: 'media',
        streamSid: callState.streamSid,
        media: {
          payload: base64Audio
        }
      };

      callState.ws.send(JSON.stringify(audioMessage));

      // Send mark to know when audio finishes
      const markMessage = {
        event: 'mark',
        streamSid: callState.streamSid,
        mark: {
          name: 'audio_complete'
        }
      };

      callState.ws.send(JSON.stringify(markMessage));

    } catch (error) {
      console.error('[MediaStream] Error sending AI response:', error.message);
    }
  }

  /**
   * Handle WebSocket close
   */
  handleClose(callSid) {
    console.log(`[MediaStream] Connection closed for call: ${callSid}`);
    
    // Clean up
    cerebrasService.clearConversation(callSid);
    this.activeCalls.delete(callSid);
  }

  /**
   * Clear audio buffer for a call
   */
  clearAudioBuffer(callSid) {
    const callState = this.activeCalls.get(callSid);
    if (callState) {
      callState.audioBuffer = [];
    }
  }
}

export default new MediaStreamHandler();
