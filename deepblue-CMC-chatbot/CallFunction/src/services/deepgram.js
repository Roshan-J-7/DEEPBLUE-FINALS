import { createClient } from '@deepgram/sdk';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Deepgram Speech-to-Text Service
 * Handles real-time audio transcription
 */
class DeepgramService {
  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY;
    this.client = null;
    
    if (this.apiKey) {
      this.client = createClient(this.apiKey);
    }
  }

  /**
   * Transcribe audio buffer
   */
  async transcribeAudio(audioBuffer, options = {}) {
    try {
      if (!this.client) {
        throw new Error('Deepgram API key not configured');
      }

      console.log('[Deepgram] Transcribing audio...');
      const startTime = Date.now();

      const { result, error } = await this.client.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: options.model || 'nova-2',
          language: options.language || 'en-US',
          punctuate: true,
          utterances: false,
          diarize: false,
        }
      );

      if (error) {
        throw error;
      }

      const latency = Date.now() - startTime;
      const transcript = result.results?.channels[0]?.alternatives[0]?.transcript || '';
      
      console.log(`[Deepgram] Transcribed in ${latency}ms: "${transcript}"`);

      return {
        transcript,
        confidence: result.results?.channels[0]?.alternatives[0]?.confidence || 0,
        words: result.results?.channels[0]?.alternatives[0]?.words || []
      };

    } catch (error) {
      console.error('[Deepgram] Transcription error:', error.message);
      throw new Error('Failed to transcribe audio');
    }
  }

  /**
   * Create live transcription connection (WebSocket)
   */
  createLiveTranscription(options = {}) {
    if (!this.client) {
      throw new Error('Deepgram API key not configured');
    }

    console.log('[Deepgram] Creating live transcription connection...');

    const connection = this.client.listen.live({
      model: options.model || 'nova-2',
      language: options.language || 'en-US',
      punctuate: true,
      interim_results: true,
      encoding: options.encoding || 'mulaw',
      sample_rate: options.sampleRate || 8000,
      channels: 1
    });

    return connection;
  }

  /**
   * Process audio chunk for live transcription
   */
  async processAudioChunk(connection, audioChunk) {
    try {
      if (connection && audioChunk) {
        connection.send(audioChunk);
      }
    } catch (error) {
      console.error('[Deepgram] Error processing audio chunk:', error.message);
    }
  }

  /**
   * Close live transcription connection
   */
  closeLiveTranscription(connection) {
    try {
      if (connection) {
        connection.finish();
        console.log('[Deepgram] Live transcription connection closed');
      }
    } catch (error) {
      console.error('[Deepgram] Error closing connection:', error.message);
    }
  }
}

export default new DeepgramService();
