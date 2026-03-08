"""
Twilio Voice Webhook Routes for Remy (Project Cura)
Handles incoming calls, language selection, speech gather, and call status.

All endpoints return TwiML XML. Mounted under /api/twilio/ in the FastAPI app.
"""

from fastapi import APIRouter, Request, Form
from fastapi.responses import Response
from typing import Optional
from twilio.twiml.voice_response import VoiceResponse, Gather
from twilio.rest import Client as TwilioClient

from app.call_function.call_config import (
    SUPPORTED_LANGUAGES,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER,
    TWILIO_VERIFIED_CALLER_ID,
)
from app.call_function.call_cerebras import call_cerebras_client

router = APIRouter(prefix="/api/twilio", tags=["call_function"])

# per-call language tracking
_call_languages: dict[str, str] = {}


def _twiml_response(twiml: VoiceResponse) -> Response:
    return Response(content=str(twiml), media_type="text/xml")


# ──────────────────────────────────────────────
# STEP 1  —  Incoming call → intro + press any key
# ──────────────────────────────────────────────
@router.post("/simple-call")
async def simple_call(request: Request):
    form = await request.form()
    call_sid = form.get("CallSid", "unknown")
    print(f"[Twilio] Call started: {call_sid}")

    call_cerebras_client.init_conversation(call_sid)

    twiml = VoiceResponse()
    gather = Gather(input="dtmf", action="/api/twilio/language-menu", num_digits=1, timeout=15)
    gather.say(
        "Welcome to Project Cura. I'm Remy, your personal health assistant.",
        voice="Polly.Joanna", language="en-US",
    )
    gather.pause(length=1)
    gather.say(
        "I can help you check your symptoms in English, Hindi, or Marathi.",
        voice="Polly.Joanna", language="en-US",
    )
    gather.pause(length=1)
    gather.say("Press any key to continue.", voice="Polly.Joanna", language="en-US")
    twiml.append(gather)

    twiml.say("We did not receive any input. Goodbye!", voice="Polly.Joanna", language="en-US")
    return _twiml_response(twiml)


# ──────────────────────────────────────────────
# STEP 2  —  Language selection menu
# ──────────────────────────────────────────────
@router.post("/language-menu")
async def language_menu(request: Request):
    twiml = VoiceResponse()
    gather = Gather(input="dtmf", action="/api/twilio/select-language", num_digits=1, timeout=10)
    gather.say("Please select your language.", voice="Polly.Joanna", language="en-US")
    gather.pause(length=1)
    gather.say("Press 1 for English.", voice="Polly.Joanna", language="en-US")
    gather.say("हिंदी के लिए 2 दबाएं।", voice="Polly.Aditi", language="hi-IN")
    gather.say("मराठी साठी 3 दाबा.", voice="Polly.Aditi", language="mr-IN")
    twiml.append(gather)

    # default English
    twiml.redirect("/api/twilio/select-language?Digits=1")
    return _twiml_response(twiml)


# ──────────────────────────────────────────────
# STEP 3  —  Language selected → greet & start listening
# ──────────────────────────────────────────────
@router.post("/select-language")
async def select_language(request: Request):
    form = await request.form()
    call_sid = form.get("CallSid", "unknown")
    digit = form.get("Digits") or request.query_params.get("Digits", "1")

    digit_to_lang = {"1": "en", "2": "hi", "3": "mr"}
    lang_code = digit_to_lang.get(digit, "en")
    lang = SUPPORTED_LANGUAGES.get(lang_code, SUPPORTED_LANGUAGES["en"])

    _call_languages[call_sid] = lang_code
    call_cerebras_client.init_conversation(call_sid, lang_code)
    print(f"[Twilio] Language selected: {lang['name']} ({lang_code}) for {call_sid}")

    twiml = VoiceResponse()
    twiml.say(lang["greeting"], voice=lang["twilio_voice"], language=lang["twilio_code"])

    gather = Gather(
        input="speech",
        action="/api/twilio/gather-speech",
        speech_timeout="auto",
        language=lang["twilio_code"],
        speech_model="default",
    )
    twiml.append(gather)

    twiml.say(
        "I did not hear anything. Goodbye!" if lang_code == "en" else lang["greeting"],
        voice=lang["twilio_voice"], language=lang["twilio_code"],
    )
    return _twiml_response(twiml)


# ──────────────────────────────────────────────
# STEP 4  —  Process speech → Cerebras → respond → loop
# ──────────────────────────────────────────────
@router.post("/gather-speech")
async def gather_speech(request: Request):
    form = await request.form()
    call_sid = form.get("CallSid", "unknown")
    speech_result = form.get("SpeechResult")

    lang_code = _call_languages.get(call_sid, "en")
    lang = SUPPORTED_LANGUAGES.get(lang_code, SUPPORTED_LANGUAGES["en"])

    # handle empty / missed speech
    if not speech_result or speech_result == "undefined":
        print(f"[Twilio] No speech detected for {call_sid}, re-gathering")
        no_input = {
            "en": "I didn't catch that. Could you say that again?",
            "hi": "मुझे सुनाई नहीं दिया। कृपया दोबारा बोलिए।",
            "mr": "मला ऐकू आले नाही. कृपया पुन्हा सांगा.",
        }
        twiml = VoiceResponse()
        twiml.say(no_input.get(lang_code, no_input["en"]),
                  voice=lang["twilio_voice"], language=lang["twilio_code"])
        gather = Gather(
            input="speech",
            action="/api/twilio/gather-speech",
            speech_timeout="auto",
            language=lang["twilio_code"],
            speech_model="default",
        )
        twiml.append(gather)
        twiml.say("No input received. Goodbye!" if lang_code == "en" else "Goodbye.",
                  voice=lang["twilio_voice"], language=lang["twilio_code"])
        return _twiml_response(twiml)

    print(f"[Twilio] User said ({lang['name']}): \"{speech_result}\" ({call_sid})")

    # Cerebras LLM
    ai_response = call_cerebras_client.get_response(call_sid, speech_result)
    print(f"[Twilio] Remy responding ({lang['name']}): \"{ai_response}\"")

    twiml = VoiceResponse()
    twiml.say(ai_response, voice=lang["twilio_voice"], language=lang["twilio_code"])

    # keep listening
    gather = Gather(
        input="speech",
        action="/api/twilio/gather-speech",
        speech_timeout="auto",
        language=lang["twilio_code"],
        speech_model="default",
    )
    twiml.append(gather)

    still_there = {
        "en": "Are you still there? Say something or I will hang up.",
        "hi": "क्या आप वहाँ हैं? कुछ बोलिए।",
        "mr": "तुम्ही अजून तिथे आहात का? काही तरी बोला.",
    }
    twiml.say(still_there.get(lang_code, still_there["en"]),
              voice=lang["twilio_voice"], language=lang["twilio_code"])
    return _twiml_response(twiml)


# ──────────────────────────────────────────────
# Call status callback — cleanup
# ──────────────────────────────────────────────
@router.post("/status")
async def call_status(request: Request):
    form = await request.form()
    call_sid = form.get("CallSid", "unknown")
    call_status_val = form.get("CallStatus", "unknown")

    print(f"[Twilio] Call {call_sid} status: {call_status_val}")

    if call_status_val in ("completed", "failed"):
        call_cerebras_client.clear_conversation(call_sid)
        _call_languages.pop(call_sid, None)

    return Response(status_code=200)


# ──────────────────────────────────────────────
# GET /api/twilio/languages — list supported languages
# ──────────────────────────────────────────────
@router.get("/languages")
async def list_languages():
    langs = [{"code": k, "name": v["name"]} for k, v in SUPPORTED_LANGUAGES.items()]
    return {
        "supported_languages": langs,
        "dial_keys": {"1": "English", "2": "Hindi", "3": "Marathi"},
    }


# ──────────────────────────────────────────────
# POST /api/twilio/make-call — trigger outbound call
# ──────────────────────────────────────────────
@router.post("/make-call")
async def make_call(request: Request):
    body = await request.json()
    to = body.get("to", TWILIO_VERIFIED_CALLER_ID)

    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        return {"error": "Twilio credentials not configured in .env"}

    # Determine base URL from the request (works with ngrok / AWS)
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
    base_url = f"{scheme}://{host}"

    client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    try:
        call = client.calls.create(
            url=f"{base_url}/api/twilio/simple-call",
            to=to,
            from_=TWILIO_PHONE_NUMBER,
            method="POST",
            status_callback=f"{base_url}/api/twilio/status",
            status_callback_event=["completed", "failed"],
        )
        print(f"[Twilio] Outbound call started: {call.sid}")
        return {"success": True, "call_sid": call.sid, "to": to}
    except Exception as e:
        print(f"[Twilio] Outbound call error: {e}")
        return {"error": str(e)}
