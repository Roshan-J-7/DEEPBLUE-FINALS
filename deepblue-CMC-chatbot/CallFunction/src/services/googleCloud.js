import speech from '@google-cloud/speech';
import textToSpeech from '@google-cloud/text-to-speech';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Google Cloud Speech-to-Text and Text-to-Speech Service
 * High-quality, cost-effective alternative to Deepgram and ElevenLabs
 */
/**
 * Supported languages with STT and TTS voice configurations
 */
const SUPPORTED_LANGUAGES = {
  'en': {
    name: 'English',
    sttCode: 'en-US',
    ttsCode: 'en-US',
    ttsVoice: 'en-US-Neural2-F',
    twilioCode: 'en-US',
    twilioVoice: 'Polly.Joanna',
    greeting: 'You selected English. How can I help you today?',
  },
  'hi': {
    name: 'Hindi',
    sttCode: 'hi-IN',
    ttsCode: 'hi-IN',
    ttsVoice: 'hi-IN-Neural2-A',
    twilioCode: 'hi-IN',
    twilioVoice: 'Polly.Aditi',
    greeting: 'आपने हिंदी चुनी है। मैं आज आपकी कैसे मदद कर सकता हूँ?',
  },
  'mr': {
    name: 'Marathi',
    sttCode: 'mr-IN',
    ttsCode: 'mr-IN',
    ttsVoice: 'mr-IN-Neural2-A',
    twilioCode: 'mr-IN',
    twilioVoice: 'Polly.Aditi',
    greeting: 'तुम्ही मराठी निवडली आहे. मी आज तुम्हाला कशी मदत करू शकतो?',
  },
};

class GoogleCloudService {
  constructor() {
    this.apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    this.languages = SUPPORTED_LANGUAGES;
    
    // Initialize clients with API key
    const clientConfig = this.apiKey ? {
      apiKey: this.apiKey
    } : {};

    try {
      this.speechClient = new speech.SpeechClient(clientConfig);
      this.ttsClient = new textToSpeech.TextToSpeechClient(clientConfig);
      console.log('[Google Cloud] Services initialized');
      console.log(`[Google Cloud] ${Object.keys(SUPPORTED_LANGUAGES).length} languages supported`);
    } catch (error) {
      console.error('[Google Cloud] Initialization error:', error.message);
    }
  }

  /**
   * Get language config by code
   */
  getLanguage(langCode) {
    return this.languages[langCode] || this.languages['en'];
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages() {
    return this.languages;
  }

  /**
   * Speech-to-Text: Transcribe audio buffer
   */
  async transcribeAudio(audioBuffer, options = {}) {
    try {
      if (!this.speechClient) {
        throw new Error('Google Cloud Speech client not initialized');
      }

      console.log('[Google STT] Transcribing audio...');
      const startTime = Date.now();

      const audio = {
        content: audioBuffer.toString('base64'),
      };

      const config = {
        encoding: options.encoding || 'MULAW',
        sampleRateHertz: options.sampleRate || 8000,
        languageCode: options.language || 'en-US',
        enableAutomaticPunctuation: true,
        model: 'phone_call',
      };

      const request = {
        audio: audio,
        config: config,
      };

      const [response] = await this.speechClient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      const latency = Date.now() - startTime;
      console.log(`[Google STT] Transcribed in ${latency}ms: "${transcription}"`);

      return {
        transcript: transcription,
        confidence: response.results[0]?.alternatives[0]?.confidence || 0,
        words: response.results[0]?.alternatives[0]?.words || []
      };

    } catch (error) {
      console.error('[Google STT] Transcription error:', error.message);
      throw new Error('Failed to transcribe audio');
    }
  }

  /**
   * Text-to-Speech: Convert text to audio
   */
  async textToSpeech(text, options = {}) {
    try {
      if (!this.ttsClient) {
        throw new Error('Google Cloud TTS client not initialized');
      }

      console.log(`[Google TTS] Generating speech for: "${text.substring(0, 50)}..."`);
      const startTime = Date.now();

      const request = {
        input: { text: text },
        voice: {
          languageCode: options.languageCode || 'en-US',
          name: options.voiceName || 'en-US-Neural2-F', // Female neural voice
          ssmlGender: options.gender || 'FEMALE',
        },
        audioConfig: {
          audioEncoding: options.encoding || 'MULAW',
          sampleRateHertz: options.sampleRate || 8000,
          speakingRate: options.speakingRate || 1.0,
          pitch: options.pitch || 0.0,
        },
      };

      const [response] = await this.ttsClient.synthesizeSpeech(request);
      
      const latency = Date.now() - startTime;
      console.log(`[Google TTS] Audio generated in ${latency}ms`);

      return Buffer.from(response.audioContent);

    } catch (error) {
      console.error('[Google TTS] Error:', error.message);
      throw new Error('Failed to generate speech');
    }
  }

  /**
   * Stream-based STT for real-time transcription
   */
  createStreamingRecognition(options = {}) {
    try {
      if (!this.speechClient) {
        throw new Error('Google Cloud Speech client not initialized');
      }

      console.log('[Google STT] Creating streaming recognition...');

      const config = {
        encoding: options.encoding || 'MULAW',
        sampleRateHertz: options.sampleRate || 8000,
        languageCode: options.language || 'en-US',
        enableAutomaticPunctuation: true,
        model: 'phone_call',
        interimResults: true,
      };

      const request = {
        config: config,
        interimResults: true,
      };

      const recognizeStream = this.speechClient
        .streamingRecognize(request)
        .on('error', console.error)
        .on('data', data => {
          if (data.results[0] && data.results[0].alternatives[0]) {
            console.log(`[Google STT] ${data.results[0].isFinal ? 'Final' : 'Interim'}: ${data.results[0].alternatives[0].transcript}`);
          }
        });

      return recognizeStream;

    } catch (error) {
      console.error('[Google STT] Stream error:', error.message);
      throw error;
    }
  }

  /**
   * List available voices
   */
  async listVoices(languageCode = 'en-US') {
    try {
      if (!this.ttsClient) {
        throw new Error('Google Cloud TTS client not initialized');
      }

      const [response] = await this.ttsClient.listVoices({
        languageCode: languageCode,
      });

      return response.voices;

    } catch (error) {
      console.error('[Google TTS] Error listing voices:', error.message);
      throw error;
    }
  }
}

export default new GoogleCloudService();
