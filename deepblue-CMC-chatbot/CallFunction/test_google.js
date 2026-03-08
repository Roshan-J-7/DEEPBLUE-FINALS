import googleCloudService from './src/services/googleCloud.js';

async function test() {
  try {
    console.log('Testing Google Cloud TTS...');
    const audio = await googleCloudService.textToSpeech('Hello! This is a test of Google Cloud.');
    console.log('✅ Success! Audio size:', audio.length, 'bytes');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();
