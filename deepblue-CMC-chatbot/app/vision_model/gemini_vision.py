"""
gemini_vision.py
================
Medical image analysis using the Google Gemini API.

Flow:
  1. Receive raw image bytes from the assessment endpoint.
  2. Fetch prior assessment answers, user profile, and medical history from DB.
  3. Send image + context to Gemini 1.5 Flash for medical analysis.
  4. Persist the resulting analysis text to assessment_sessions.vision_analysis.
  5. The app always receives "image received" — the analysis is stored silently.
"""

import asyncio
import os
from typing import Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

# ─────────────────────────────
# Configuration
# ─────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-2.5-flash"

_client = genai.Client(api_key=GEMINI_API_KEY)


def _build_prompt(
    prior_answers: list,
    user_profile: dict,
    medical_data: dict,
    chief_complaint: str,
) -> str:
    """Build a rich contextual prompt for Gemini image analysis."""

    lines = [
        "You are an expert medical AI assistant. A patient has shared a medical image "
        "as part of their symptom assessment. Analyse the image thoroughly and correlate "
        "your findings with the clinical context provided below.",
        "",
        "=== CHIEF COMPLAINT ===",
        chief_complaint or "Not specified",
        "",
    ]

    # Prior assessment Q&A
    if prior_answers:
        lines.append("=== PRIOR ASSESSMENT ANSWERS ===")
        for entry in prior_answers:
            q  = entry.get("question_text", entry.get("question", ""))
            a  = entry.get("answer_json", entry.get("answer", ""))
            if isinstance(a, dict):
                a = a.get("value") or a.get("selected_option_label") or str(a)
            lines.append(f"Q: {q}")
            lines.append(f"A: {a}")
        lines.append("")

    # User profile
    if user_profile:
        lines.append("=== USER PROFILE ===")
        for k, v in user_profile.items():
            if v:
                lines.append(f"{k}: {v}")
        lines.append("")

    # Medical history
    if medical_data:
        lines.append("=== MEDICAL HISTORY ===")
        for k, v in medical_data.items():
            if v:
                lines.append(f"{k}: {v}")
        lines.append("")

    lines += [
        "=== TASK ===",
        "Provide a structured medical image analysis covering:",
        "1. What is visible in the image (objective description).",
        "2. Potential medical significance of the findings.",
        "3. Correlation with the reported chief complaint and symptom history.",
        "4. Any visible red flags or warning signs.",
        "5. Recommended next steps based solely on what is visible.",
        "",
        "Keep the response concise, clinical, and patient-friendly. "
        "Do NOT make a definitive diagnosis. Use terms like 'may suggest', "
        "'consistent with', 'warrants evaluation for'.",
    ]

    return "\n".join(lines)


async def analyze_image_with_gemini(
    image_bytes: bytes,
    image_content_type: str,
    prior_answers: list,
    user_profile: dict,
    medical_data: dict,
    chief_complaint: str,
) -> str:
    """
    Send image + clinical context to Gemini and return the analysis text.

    Args:
        image_bytes:        Raw image bytes from the uploaded file.
        image_content_type: MIME type (e.g. "image/jpeg", "image/png").
        prior_answers:      List of {question_text, answer_json} dicts from assessment_db.
        user_profile:       Dict of user profile fields (age, gender, etc.).
        medical_data:       Dict of user medical history fields.
        chief_complaint:    Free-text chief complaint entered by the patient.

    Returns:
        Gemini's analysis as a plain-text string, or an error message.
    """
    try:
        prompt = _build_prompt(prior_answers, user_profile, medical_data, chief_complaint)

        image_part = types.Part.from_bytes(
            data=image_bytes,
            mime_type=image_content_type or "image/jpeg",
        )

        # Use the async client so the event loop isn't blocked
        response = await _client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=[image_part, prompt],
        )

        analysis = response.text.strip()
        print(f"[GEMINI VISION] Analysis complete ({len(analysis)} chars)")
        return analysis

    except Exception as exc:
        err_str = str(exc)
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            print("=" * 60)
            print("[GEMINI VISION] !! QUOTA LIMIT HIT !!")
            print(f"[GEMINI VISION] The Gemini API free-tier daily limit has been")
            print(f"[GEMINI VISION] exhausted. Image analysis is DISABLED until")
            print(f"[GEMINI VISION] the quota resets at midnight Pacific Time.")
            print(f"[GEMINI VISION] Model: {GEMINI_MODEL}")
            print("=" * 60)
            return "Image analysis unavailable: Gemini API daily quota exhausted. Resets at midnight PT."
        else:
            print(f"[GEMINI VISION] Analysis failed: {exc}")
            return f"Image analysis unavailable: {exc}"
