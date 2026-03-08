import cerebrasService from './services/cerebras.js';
import elevenLabsService from './services/elevenlabs.js';

/**
 * Test script for AI Voice Agent components
 */

async function testCerebras() {
  console.log('\n=== Testing Cerebras LLM ===\n');
  
  try {
    const testCallSid = 'test_call_123';
    
    // Test 1: Simple conversation
    console.log('Test 1: Simple question');
    const response1 = await cerebrasService.getResponse(
      testCallSid,
      'What is the capital of France?'
    );
    console.log('Response:', response1);
    
    // Test 2: Follow-up question
    console.log('\nTest 2: Follow-up question');
    const response2 = await cerebrasService.getResponse(
      testCallSid,
      'What is its population?'
    );
    console.log('Response:', response2);
    
    // Test 3: Medical question (relevant to your use case)
    console.log('\nTest 3: Medical question');
    const response3 = await cerebrasService.getResponse(
      testCallSid,
      'I have a headache and mild fever. What should I do?'
    );
    console.log('Response:', response3);
    
    // Clean up
    cerebrasService.clearConversation(testCallSid);
    
    console.log('\n✅ Cerebras tests passed!\n');
    
  } catch (error) {
    console.error('❌ Cerebras test failed:', error.message);
  }
}

async function testElevenLabs() {
  console.log('\n=== Testing ElevenLabs TTS ===\n');
  
  try {
    const testText = 'Hello! This is a test of the ElevenLabs text to speech system.';
    
    console.log('Generating audio for:', testText);
    const audioBuffer = await elevenLabsService.textToSpeech(testText);
    
    console.log('Audio buffer size:', audioBuffer.length, 'bytes');
    
    if (audioBuffer.length > 0) {
      console.log('\n✅ ElevenLabs test passed!\n');
    } else {
      throw new Error('Audio buffer is empty');
    }
    
  } catch (error) {
    console.error('❌ ElevenLabs test failed:', error.message);
  }
}

async function testFullPipeline() {
  console.log('\n=== Testing Full Pipeline ===\n');
  
  try {
    const testCallSid = 'test_pipeline_456';
    
    // Simulate user speech
    const userInput = 'How do I check my blood pressure at home?';
    console.log('User says:', userInput);
    
    // Get AI response
    console.log('\n1. Getting AI response from Cerebras...');
    const aiResponse = await cerebrasService.getResponse(testCallSid, userInput);
    console.log('AI response:', aiResponse);
    
    // Convert to speech
    console.log('\n2. Converting to speech with ElevenLabs...');
    const audioBuffer = await elevenLabsService.textToSpeech(aiResponse);
    console.log('Generated audio:', audioBuffer.length, 'bytes');
    
    // Clean up
    cerebrasService.clearConversation(testCallSid);
    
    console.log('\n✅ Full pipeline test passed!\n');
    console.log('Total response time: ~500-800ms expected in production');
    
  } catch (error) {
    console.error('❌ Pipeline test failed:', error.message);
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   AI Voice Agent - Component Tests    ║');
  console.log('╚════════════════════════════════════════╝');
  
  // Check API keys
  console.log('\n📋 Checking API keys...');
  console.log('   Cerebras:', process.env.CEREBRAS_API_KEY ? '✓' : '✗ MISSING');
  console.log('   ElevenLabs:', process.env.ELEVENLABS_API_KEY ? '✓' : '✗ MISSING');
  console.log('   Twilio:', process.env.TWILIO_ACCOUNT_SID ? '✓' : '✗ MISSING');
  console.log('   Deepgram:', process.env.DEEPGRAM_API_KEY ? '✓' : '✗ MISSING');
  
  if (!process.env.CEREBRAS_API_KEY) {
    console.error('\n❌ Cerebras API key is required. Please set it in .env file.\n');
    return;
  }
  
  // Run tests
  await testCerebras();
  
  if (process.env.ELEVENLABS_API_KEY) {
    await testElevenLabs();
    await testFullPipeline();
  } else {
    console.log('\n⚠️  Skipping ElevenLabs tests (API key not set)\n');
  }
  
  console.log('╔════════════════════════════════════════╗');
  console.log('║         All Tests Complete!            ║');
  console.log('╚════════════════════════════════════════╝\n');
}

// Run tests
runTests().catch(console.error);
