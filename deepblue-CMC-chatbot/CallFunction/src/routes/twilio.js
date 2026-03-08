import express from 'express';
import twilio from 'twilio';
import cerebrasService from '../services/cerebras.js';
import googleCloudService from '../services/googleCloud.js';

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// Track language per call
const callLanguages = new Map();

// ──────────────────────────────────────────────────────
// STEP 1: Call starts here — Intro + Press any key
// ──────────────────────────────────────────────────────
router.post('/simple-call', async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    console.log(`[Twilio] Call started: ${callSid}`);

    cerebrasService.initConversation(callSid);

    const twiml = new VoiceResponse();

    // Intro message — press any key to continue
    const gather = twiml.gather({
      input: 'dtmf',
      action: '/api/twilio/language-menu',
      numDigits: 1,
      timeout: 15
    });

    gather.say({ voice: 'Polly.Joanna', language: 'en-US' },
      'Welcome to AI Assistant, powered by premium artificial intelligence.');
    gather.pause({ length: 1 });
    gather.say({ voice: 'Polly.Joanna', language: 'en-US' },
      'This service uses advanced language models to have natural conversations with you in multiple languages.');
    gather.pause({ length: 1 });
    gather.say({ voice: 'Polly.Joanna', language: 'en-US' },
      'Press any key to continue.');

    // If no key pressed, repeat
    twiml.say({ voice: 'Polly.Joanna', language: 'en-US' },
      'We did not receive any input. Goodbye!');

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('[Twilio] Error in simple call:', error.message);
    const twiml = new VoiceResponse();
    twiml.say('Sorry, an error occurred. Goodbye.');
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// ──────────────────────────────────────────────────────
// STEP 2: Language selection menu
// ──────────────────────────────────────────────────────
router.post('/language-menu', async (req, res) => {
  try {
    const twiml = new VoiceResponse();

    const gather = twiml.gather({
      input: 'dtmf',
      action: '/api/twilio/select-language',
      numDigits: 1,
      timeout: 10
    });

    gather.say({ voice: 'Polly.Joanna', language: 'en-US' },
      'Please select your language.');
    gather.pause({ length: 1 });
    gather.say({ voice: 'Polly.Joanna', language: 'en-US' },
      'Press 1 for English.');
    gather.say({ voice: 'Polly.Aditi', language: 'hi-IN' },
      '\u0939\u093f\u0902\u0926\u0940 \u0915\u0947 \u0932\u093f\u090f 2 \u0926\u092c\u093e\u090f\u0902\u0964');
    gather.say({ voice: 'Polly.Aditi', language: 'mr-IN' },
      '\u092e\u0930\u093e\u0920\u0940 \u0938\u093e\u0920\u0940 4 \u0926\u093e\u092c\u093e.');

    // Default to English if no input
    twiml.redirect('/api/twilio/select-language?Digits=1');

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('[Twilio] Error in language menu:', error.message);
    const twiml = new VoiceResponse();
    twiml.say('Sorry, an error occurred.');
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// ──────────────────────────────────────────────────────
// STEP 3: Language selected → greet and start chatting
// ──────────────────────────────────────────────────────
router.post('/select-language', async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const digit = req.body.Digits || req.query.Digits || '1';

    const digitToLang = { '1': 'en', '2': 'hi', '3': 'mr' };
    const langCode = digitToLang[digit] || 'en';
    const lang = googleCloudService.getLanguage(langCode);

    callLanguages.set(callSid, langCode);
    console.log(`[Twilio] Language selected: ${lang.name} (${langCode}) for ${callSid}`);

    // Set system prompt for the selected language
    const langPrompt = langCode === 'en'
      ? 'You are a helpful AI assistant speaking on the phone. Keep responses concise (1-2 sentences) and conversational.'
      : `You are a helpful AI assistant speaking on the phone. ALWAYS respond ONLY in ${lang.name}. Keep responses concise (1-2 sentences) and conversational. The user speaks ${lang.name}.`;

    cerebrasService.conversations.set(callSid, [
      { role: 'system', content: langPrompt }
    ]);

    const twiml = new VoiceResponse();

    // Greet in selected language
    twiml.say({ voice: lang.twilioVoice, language: lang.twilioCode }, lang.greeting);

    // Start listening
    twiml.gather({
      input: 'speech',
      action: '/api/twilio/gather-speech',
      speechTimeout: 'auto',
      language: lang.twilioCode,
      speechModel: 'default'
    });

    // If no speech
    twiml.say({ voice: lang.twilioVoice, language: lang.twilioCode },
      langCode === 'en' ? 'I did not hear anything. Goodbye!' : lang.greeting);

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('[Twilio] Error selecting language:', error.message);
    const twiml = new VoiceResponse();
    twiml.say('Sorry, an error occurred.');
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// ──────────────────────────────────────────────────────
// STEP 4: Process speech → Cerebras → respond → loop
// ──────────────────────────────────────────────────────
router.post('/gather-speech', async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const speechResult = req.body.SpeechResult;

    const langCode = callLanguages.get(callSid) || 'en';
    const lang = googleCloudService.getLanguage(langCode);

    // FIX: Handle undefined/empty speech (this caused the crash before)
    if (!speechResult || speechResult === 'undefined') {
      console.log(`[Twilio] No speech detected for ${callSid}, re-gathering`);
      const twiml = new VoiceResponse();

      const noInputMsg = {
        'en': 'I didn\'t catch that. Could you say that again?',
        'hi': '\u092e\u0941\u091d\u0947 \u0938\u0941\u0928\u093e\u0908 \u0928\u0939\u0940\u0902 \u0926\u093f\u092f\u093e\u0964 \u0915\u0943\u092a\u092f\u093e \u0926\u094b\u092c\u093e\u0930\u093e \u092c\u094b\u0932\u093f\u090f\u0964',
        'mr': '\u092e\u0932\u093e \u0910\u0915\u0942 \u0906\u0932\u0947 \u0928\u093e\u0939\u0940. \u0915\u0943\u092a\u092f\u093e \u092a\u0941\u0928\u094d\u0939\u093e \u0938\u093e\u0902\u0917\u093e.',
      };

      twiml.say({ voice: lang.twilioVoice, language: lang.twilioCode },
        noInputMsg[langCode] || noInputMsg['en']);

      twiml.gather({
        input: 'speech',
        action: '/api/twilio/gather-speech',
        speechTimeout: 'auto',
        language: lang.twilioCode,
        speechModel: 'default'
      });

      twiml.say({ voice: lang.twilioVoice, language: lang.twilioCode },
        langCode === 'en' ? 'No input received. Goodbye!' : 'Goodbye.');

      res.type('text/xml');
      return res.send(twiml.toString());
    }

    console.log(`[Twilio] User said (${lang.name}): "${speechResult}" (${callSid})`);

    // Get AI response from Cerebras
    const aiResponse = await cerebrasService.getResponse(callSid, speechResult);
    console.log(`[Twilio] AI responding (${lang.name}): "${aiResponse}"`);

    const twiml = new VoiceResponse();

    // Speak AI response
    twiml.say({ voice: lang.twilioVoice, language: lang.twilioCode }, aiResponse);

    // Continue listening
    twiml.gather({
      input: 'speech',
      action: '/api/twilio/gather-speech',
      speechTimeout: 'auto',
      language: lang.twilioCode,
      speechModel: 'default'
    });

    // Fallback
    const stillThereMsg = {
      'en': 'Are you still there? Say something or I will hang up.',
      'hi': '\u0915\u094d\u092f\u093e \u0906\u092a \u0935\u0939\u093e\u0901 \u0939\u0948\u0902? \u0915\u0941\u091b \u092c\u094b\u0932\u093f\u090f\u0964',
      'mr': '\u0924\u0941\u092e\u094d\u0939\u0940 \u0905\u091c\u0942\u0928 \u0924\u093f\u0925\u0947 \u0906\u0939\u093e\u0924 \u0915\u093e? \u0915\u093e\u0939\u0940 \u0924\u0930\u0940 \u092c\u094b\u0932\u093e.',
    };
    twiml.say({ voice: lang.twilioVoice, language: lang.twilioCode },
      stillThereMsg[langCode] || stillThereMsg['en']);

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('[Twilio] Error processing speech:', error.message);
    const langCode = callLanguages.get(req.body.CallSid) || 'en';
    const lang = googleCloudService.getLanguage(langCode);
    const twiml = new VoiceResponse();

    const errorMsg = {
      'en': 'Sorry, I had trouble processing that. Please try again.',
      'hi': '\u0915\u094d\u0937\u092e\u093e \u0915\u0930\u0947\u0902, \u0915\u0941\u091b \u0938\u092e\u0938\u094d\u092f\u093e \u0939\u0941\u0908\u0964 \u0915\u0943\u092a\u092f\u093e \u0926\u094b\u092c\u093e\u0930\u093e \u092c\u094b\u0932\u093f\u090f\u0964',
      'mr': '\u092e\u093e\u092b \u0915\u0930\u093e, \u0938\u092e\u0938\u094d\u092f\u093e \u0906\u0932\u0940. \u0915\u0943\u092a\u092f\u093e \u092a\u0941\u0928\u094d\u0939\u093e \u092c\u094b\u0932\u093e.',
    };
    twiml.say({ voice: lang.twilioVoice, language: lang.twilioCode },
      errorMsg[langCode] || errorMsg['en']);

    twiml.gather({
      input: 'speech',
      action: '/api/twilio/gather-speech',
      speechTimeout: 'auto',
      language: lang.twilioCode,
      speechModel: 'default'
    });

    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// ──────────────────────────────────────────────────────
// Call status callback — cleanup
// ──────────────────────────────────────────────────────
router.post('/status', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  console.log(`[Twilio] Call ${callSid} status: ${callStatus}`);

  if (callStatus === 'completed' || callStatus === 'failed') {
    cerebrasService.clearConversation(callSid);
    callLanguages.delete(callSid);
  }

  res.sendStatus(200);
});

// ──────────────────────────────────────────────────────
// GET /languages — list supported languages
// ──────────────────────────────────────────────────────
router.get('/languages', (req, res) => {
  const langs = googleCloudService.getSupportedLanguages();
  const list = Object.entries(langs).map(([code, lang]) => ({
    code,
    name: lang.name,
  }));
  res.json({ supported_languages: list, dial_keys: { '1': 'English', '2': 'Hindi', '3': 'Marathi' } });
});

// ──────────────────────────────────────────────────────
// POST /make-call — trigger outbound call
// Body: { to: "+919384843883" }
// ──────────────────────────────────────────────────────
router.post('/make-call', async (req, res) => {
  try {
    const { to } = req.body;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    const ngrokUrl = process.env.NGROK_URL || 'https://skinned-candis-agriculturally.ngrok-free.dev';

    const client = twilio(accountSid, authToken);

    const call = await client.calls.create({
      url: `${ngrokUrl}/api/twilio/simple-call`,
      to: to || '+919384843883',
      from,
      method: 'POST',
      statusCallback: `${ngrokUrl}/api/twilio/status`,
      statusCallbackEvent: ['completed', 'failed']
    });

    console.log(`[Twilio] Outbound call started: ${call.sid}`);
    res.json({ success: true, callSid: call.sid, to: to || '+919384843883' });

  } catch (error) {
    console.error('[Twilio] Outbound call error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
