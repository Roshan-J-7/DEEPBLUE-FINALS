"""
profile_routes.py
=================
FastAPI router for user profile onboarding.

Endpoints:
  POST /user/profile/onboarding  — store profile answers after signup
  GET  /user/profile             — fetch stored profile (optional, for app use)

Authentication:
  All endpoints require: Authorization: Bearer <jwt_token>
  user_id is extracted from the token — never sent in request body.
"""

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any
from jose import jwt, JWTError

from app.auth.auth_config import JWT_SECRET_KEY, JWT_ALGORITHM
from app.auth.profile_db import save_profile_answers, get_profile_by_user_id, get_profile_image
from app.auth.medical_db import save_medical_answers, get_medical_by_user_id
from app.auth.reports_db import get_reports_by_user_id

# ─────────────────────────────
# Router
# ─────────────────────────────
router = APIRouter(prefix="/user", tags=["User Profile"])


# ─────────────────────────────
# JWT Helper
# ─────────────────────────────

def extract_user_id_from_request(request: Request) -> str | None:
    """
    Extract and decode JWT from Authorization header.
    Returns user_id (str) if valid, None if missing/invalid/expired.

    Header format: Authorization: Bearer <token>
    JWT payload contains: { "sub": "<user_id>", "email": "...", "exp": ... }
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")  # sub = user_id
    except JWTError:
        return None


# ─────────────────────────────
# Request Model
# ─────────────────────────────

class AnswerItem(BaseModel):
    question_id: str
    question_text: str
    answer_json: Any     # flexible: {"type": "text", "value": "..."} or {"type": "number", "value": 22} etc.


class OnboardingRequest(BaseModel):
    answer_json: list[AnswerItem]


# ─────────────────────────────
# Endpoints
# ─────────────────────────────

@router.post("/profile/onboarding", status_code=status.HTTP_200_OK)
async def onboard_profile(request: Request, body: OnboardingRequest):
    """
    Store user profile answers after signup.

    Flow:
      1. Extract user_id from JWT in Authorization header
      2. Loop through answer_json array
      3. Save each Q&A row linked to user_id in user_profiles table
      4. Return success

    Request:
      POST /user/profile/onboarding
      Authorization: Bearer <jwt_token>
      {
        "answer_json": [
          { "question_id": "full_name", "question_text": "What is your full name?",
            "answer_json": { "type": "text", "value": "Gowtham A" } },
          { "question_id": "age", "question_text": "What is your age?",
            "answer_json": { "type": "number", "value": 22 } }
        ]
      }

    Response:
      { "success": true, "message": "Profile stored successfully" }
    """
    # Step 1: Extract user_id from JWT
    user_id = extract_user_id_from_request(request)
    if not user_id:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "message": "Invalid token"}
        )

    # Step 2: Validate at least one answer exists
    if not body.answer_json:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "No profile data provided"}
        )

    # Step 3: Prepare data and save to DB
    try:
        answers = [
            {
                "question_id": item.question_id,
                "question_text": item.question_text,
                "answer_json": item.answer_json
            }
            for item in body.answer_json
        ]
        save_profile_answers(user_id=user_id, answers=answers)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "message": f"Failed to store profile: {str(e)}"}
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "message": "Profile saved successfully"}
    )


@router.get("/profile", status_code=status.HTTP_200_OK)
async def get_profile(request: Request):
    """
    Fetch stored profile for the authenticated user.

    Request:
      GET /user/profile
      Authorization: Bearer <jwt_token>

    Response:
      {
        "success": true,
        "profile": [
          { "question_id": "full_name", "question_text": "...", "answer_json": {...} },
          ...
        ]
      }
    """
    user_id = extract_user_id_from_request(request)
    if not user_id:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "message": "Invalid token"}
        )

    try:
        profile = get_profile_by_user_id(user_id)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "message": f"Failed to fetch profile: {str(e)}"}
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "profile": profile}
    )


@router.get("/profile/image", status_code=status.HTTP_200_OK)
async def get_profile_image_endpoint(request: Request):
    """
    Fetch the profile image (base64) for the authenticated user.

    Response:
      { "success": true, "profile_image": "BASE64_STRING" }
      or
      { "success": true, "profile_image": null }  (if not set)
    """
    user_id = extract_user_id_from_request(request)
    if not user_id:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "message": "Invalid token"}
        )

    try:
        image = get_profile_image(user_id)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "message": f"Failed to fetch image: {str(e)}"}
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "profile_image": image}
    )


# ─────────────────────────────────────────────────────────────────────────────
# Medical Data Onboarding
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/medical/onboarding", status_code=status.HTTP_200_OK)
async def onboard_medical(request: Request, body: OnboardingRequest):
    """
    Store user medical history answers after profile onboarding.

    Uses the same structured format as profile onboarding.
    Covers health-specific questions from questionnaire.json
    (is_compulsory=false, excluding profile fields).

    Request:
      POST /user/medical/onboarding
      Authorization: Bearer <jwt_token>
      {
        "answer_json": [
          { "question_id": "q_past_conditions",
            "question_text": "Do you have any diagnosed medical conditions?",
            "answer_json": { "type": "single_choice", "selected_option_label": "Yes" } },
          { "question_id": "q_medication_details",
            "question_text": "Please list the medications or supplements you take regularly",
            "answer_json": { "type": "text", "value": "Metformin 500mg daily" } }
        ]
      }

    Response:
      { "success": true, "message": "Medical data stored successfully" }
    """
    # Step 1: Extract user_id from JWT
    user_id = extract_user_id_from_request(request)
    if not user_id:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "message": "Invalid token"}
        )

    # Step 2: Validate payload
    if not body.answer_json:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "No medical data provided"}
        )

    # Step 3: Save to DB
    try:
        answers = [
            {
                "question_id": item.question_id,
                "question_text": item.question_text,
                "answer_json": item.answer_json
            }
            for item in body.answer_json
        ]
        save_medical_answers(user_id=user_id, answers=answers)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "message": f"Failed to store medical data: {str(e)}"}
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "message": "Medical data stored successfully"}
    )


@router.get("/medical", status_code=status.HTTP_200_OK)
async def get_medical(request: Request):
    """
    Fetch stored medical data for the authenticated user.

    Request:
      GET /user/medical
      Authorization: Bearer <jwt_token>
    """
    user_id = extract_user_id_from_request(request)
    if not user_id:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "message": "Invalid token"}
        )

    try:
        medical = get_medical_by_user_id(user_id)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "message": f"Failed to fetch medical data: {str(e)}"}
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "medical": medical}
    )


# ─────────────────────────────────────────────────────────────────────────────
# Reports
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/reports", status_code=status.HTTP_200_OK)
async def get_reports(request: Request):
    """
    Fetch all previously generated assessment reports for the authenticated user.
    Newest report first.

    Request:
      GET /user/reports
      Authorization: Bearer <jwt_token>

    Response:
      {
        "success": true,
        "reports": [
          {
            "report_id": "d4c47b3f-...",
            "assessment_topic": "fever",
            "urgency_level": "yellow_doctor_visit",
            "report_data": { ...full report JSON... },
            "created_at": "2026-02-26T10:30:00Z"
          },
          ...
        ]
      }
    """
    user_id = extract_user_id_from_request(request)
    if not user_id:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "message": "Invalid token"}
        )

    try:
        reports = get_reports_by_user_id(user_id)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "message": f"Failed to fetch reports: {str(e)}"}
        )

    # Return array directly — same JSON shape the report was originally sent to the app
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=reports
    )


# ─────────────────────────────────────────────────────────────────────────────
# Bootstrap (single call after login)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/bootstrap", status_code=status.HTTP_200_OK)
async def bootstrap(request: Request):
    """
    Single endpoint called once after login to hydrate the app's local DB.

    Returns reports, profile answers, and medical answers in one response.
    The app can clear and re-insert its local SQLDelight tables from this data.

    Request:
      GET /user/bootstrap
      Authorization: Bearer <jwt_token>

    Response:
      {
        "reports": [
          {
            "report_id": "...",
            "assessment_topic": "...",
            "urgency_level": "...",
            "report_data": { ...full report JSON... },
            "created_at": "2026-..."
          }
        ],
        "profile": [
          {
            "question_id": "q_name",
            "question_text": "Full Name",
            "answer_json": { "type": "text", "value": "John Doe" }
          }
        ],
        "medical": [
          {
            "question_id": "q_smoking",
            "question_text": "Smoking status",
            "answer_json": { "type": "single_choice", "selected_option_label": "never_smoked" }
          }
        ]
      }
    """
    user_id = extract_user_id_from_request(request)
    if not user_id:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"success": False, "message": "Invalid token"}
        )

    try:
        reports = get_reports_by_user_id(user_id)
    except Exception as e:
        reports = []
        print(f"[BOOTSTRAP] Failed to fetch reports for {user_id[:8]}: {e}")

    try:
        profile = get_profile_by_user_id(user_id)
    except Exception as e:
        profile = []
        print(f"[BOOTSTRAP] Failed to fetch profile for {user_id[:8]}: {e}")

    try:
        medical = get_medical_by_user_id(user_id)
    except Exception as e:
        medical = []
        print(f"[BOOTSTRAP] Failed to fetch medical for {user_id[:8]}: {e}")

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "reports": reports,
            "profile": profile,
            "medical": medical,
        }
    )
