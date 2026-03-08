import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * ElevenLabs Text-to-Speech Service
 * Generates high-quality voice audio
 */
class ElevenLabsService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel voice
    this.baseURL = 'https://api.elevenlabs.io/v1';
  }

  /**
   * Convert text to speech
   */
  async textToSpeech(text, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('ElevenLabs API key not configured');
      }

      console.log(`[ElevenLabs] Generating speech for: "${text.substring(0, 50)}..."`);
      const startTime = Date.now();

      const response = await axios.post(
        `${this.baseURL}/text-to-speech/${this.voiceId}`,
        {
          text: text,
          model_id: options.model || 'eleven_turbo_v2', // Fast model for real-time
          voice_settings: {
            stability: options.stability || 0.5,
            similarity_boost: options.similarity || 0.75,
            style: options.style || 0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'arraybuffer'
        }
      );

      const latency = Date.now() - startTime;
      console.log(`[ElevenLabs] Audio generated in ${latency}ms`);

      return Buffer.from(response.data);

    } catch (error) {
      console.error('[ElevenLabs] TTS error:', error.response?.data || error.message);
      throw new Error('Failed to generate speech');
    }
  }

  /**
   * Convert text to speech with streaming (for real-time)
   */
  async textToSpeechStream(text, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('ElevenLabs API key not configured');
      }

      console.log(`[ElevenLabs] Streaming speech for: "${text.substring(0, 50)}..."`);

      const response = await axios.post(
        `${this.baseURL}/text-to-speech/${this.voiceId}/stream`,
        {
          text: text,
          model_id: 'eleven_turbo_v2',
          voice_settings: {
            stability: options.stability || 0.5,
            similarity_boost: options.similarity || 0.75,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'stream'
        }
      );

      return response.data;

    } catch (error) {
      console.error('[ElevenLabs] Stream TTS error:', error.response?.data || error.message);
      throw new Error('Failed to stream speech');
    }
  }

  /**
   * Get available voices
   */
  async getVoices() {
    try {
      if (!this.apiKey) {
        throw new Error('ElevenLabs API key not configured');
      }

      const response = await axios.get(`${this.baseURL}/voices`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      return response.data.voices;

    } catch (error) {
      console.error('[ElevenLabs] Error fetching voices:', error.message);
      throw error;
    }
  }

  /**
   * Set voice for the agent
   */
  setVoice(voiceId) {
    this.voiceId = voiceId;
    console.log(`[ElevenLabs] Voice set to: ${voiceId}`);
  }
}

export default new ElevenLabsService();
