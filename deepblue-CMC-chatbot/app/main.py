from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
import json
import os
import re
from dotenv import load_dotenv
from jose import jwt, JWTError

load_dotenv()

app = FastAPI(title="Healthcare Chatbot", version="0.2.0")

# ─────────────────────────────
# CORS Configuration
# ─────────────────────────────
_cors_origins_raw = os.getenv("CORS_ALLOWED_ORIGINS", "*")
_cors_origins = ["*"] if _cors_origins_raw.strip() == "*" else [
    o.strip() for o in _cors_origins_raw.split(",") if o.strip()
]
# allow_credentials=True is incompatible with wildcard origin per CORS spec
_cors_credentials = _cors_origins != ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────
# Include Chatbot Routes
# ─────────────────────────────
from app.chatbot.chatbot_routes import router as chatbot_router
from app.chatbot.chatbot_db import init_chat_db
app.include_router(chatbot_router)

# ─────────────────────────────
# Include Auth Routes  (/auth/signup  /auth/login)
# ─────────────────────────────
from app.auth.auth_routes import router as auth_router
from app.auth.auth_db import init_auth_db
app.include_router(auth_router)

# ─────────────────────────────
# Include Profile Routes  (/user/profile/onboarding  /user/profile)
# ─────────────────────────────
from app.auth.profile_routes import router as profile_router
from app.auth.profile_db import init_profile_db
from app.auth.medical_db import init_medical_db
from app.auth.reports_db import init_reports_db, save_report
app.include_router(profile_router)

# ─────────────────────────────
# Include Call Function Routes  (/api/twilio/*)
# ─────────────────────────────
from app.call_function.call_routes import router as call_function_router
app.include_router(call_function_router)

# Vision routes are handled inline in this file (no separate router)


@app.on_event("startup")
async def startup_event():
    """Initialize database tables on startup"""
    # Initialize auth DB FIRST (users table — other tables reference it via FK)
    init_auth_db()
    # Initialize chatbot DB (chat_sessions + chat_messages tables)
    init_chat_db()
    # Initialize profile DB (user_profiles table — linked to users via FK)
    init_profile_db()
    # Initialize medical DB (user_medical_data table — linked to users via FK)
    init_medical_db()
    # Initialize reports DB (reports table — stores all generated assessment reports)
    init_reports_db()
    # Initialize assessment DB (assessment_sessions + assessment_session_answers tables)
    from app.auth.assessment_db import init_assessment_db
    init_assessment_db()
    
    # Vision model uses Gemini API (lazy init — no preloading needed)


# ─────────────────────────────
# DTOs
# ─────────────────────────────

class ContextRequest(BaseModel):
    session_id: str
    user_choice: str  # "new_user" | "existing_user"
    questionnaire_context: Optional[dict] = None
    medical_report: Optional[dict] = None


class AnswerOption(BaseModel):
    id: str
    label: str


class QuestionBlock(BaseModel):
    question_id: str
    text: str
    type: str
    input_mode: Optional[str] = "buttons"
    input_hint: Optional[str] = None


class Progress(BaseModel):
    current: int
    total: int


class AssessmentResponse(BaseModel):
    session_id: str
    phase: str

    # INIT
    request_context: Optional[bool] = None
    request_questionnaire: Optional[bool] = None
    supported_phases: Optional[List[str]] = None

    # predefined
    question: Optional[QuestionBlock] = None
    options: Optional[List[AnswerOption]] = None
    progress: Optional[Progress] = None

    # llm
    message: Optional[str] = None


class AnswerValue(BaseModel):
    type: str
    value: str


class AnswerRequest(BaseModel):
    session_id: str
    phase: str
    question_id: Optional[str] = None
    answer: Optional[AnswerValue] = None
    user_message: Optional[str] = None  # For LLM phase


# ─────────────────────────────
# PRODUCTION API MODELS
# ─────────────────────────────

class Question(BaseModel):
    question_id: str
    text: str
    response_type: str  # "text", "number", "single_choice", "multi_choice", "image"
    response_options: Optional[List[Dict[str, str]]] = None
    is_compulsory: bool  # True = user must manually enter; False = app can auto-populate from profile


class StoredAnswer(BaseModel):
    question_id: str
    question_text: str
    answer_json: Dict[str, Any]


class AssessmentStartResponse(BaseModel):
    session_id: str
    question: Question
    stored_answers: List[StoredAnswer] = []


class AnswerRequest(BaseModel):
    session_id: str
    question_id: str
    question_text: str
    answer_json: Dict[str, Any]  # {type, value} | {type, selected_option_label} | etc.


class AnswerResponse(BaseModel):
    session_id: str
    status: str = "next"  # "next" | "completed" | "error" — never null
    question: Optional[Question] = None
    rag_error: Optional[str] = None  # populated when RAG pipeline fails (testing feedback)


class QAPair(BaseModel):
    question: Question
    answer: Dict[str, Any]


class SimpleQA(BaseModel):
    question: str
    answer: str


class ReportRequest(BaseModel):
    session_id: str


class EndSessionRequest(BaseModel):
    session_id: str


class EndSessionResponse(BaseModel):
    status: str  # "ended" or "not_found"


class ReportResponse(BaseModel):
    report_id: str
    summary: str


class CauseDetail(BaseModel):
    about_this: List[str]
    how_common: Dict[str, Any]  # {percentage: 60, description: "..."}
    what_you_can_do_now: List[str]
    warning: Optional[str] = None


class PossibleCause(BaseModel):
    id: str  # unique stable ID like "tension_headache"
    title: str
    short_description: str
    severity: str
    probability: float
    subtitle: Optional[str] = None
    detail: CauseDetail


class PatientInfo(BaseModel):
    name: str
    age: int
    gender: str


class MedicalReportResponse(BaseModel):
    report_id: str
    assessment_topic: str
    generated_at: str
    patient_info: PatientInfo
    summary: List[str]
    possible_causes: List[PossibleCause]
    advice: List[str]
    urgency_level: str
    image_analysis: Optional[Dict[str, Any]] = None  # Populated when patient uploaded an image


# ─────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────

def load_questionnaire():
    """Load questionnaire from JSON file"""
    json_path = os.path.join(os.path.dirname(__file__), "data", "questionnaire.json")
    with open(json_path, "r") as f:
        return json.load(f)


def load_decision_tree():
    """
    Load decision tree — merges generated_decision_tree.json (RAG-generated)
    with decision_tree.json (static fallback).  RAG entries take priority.
    Falls back to static-only if rag_adapter fails to import.
    """
    try:
        from app.core.rag_adapter import load_merged_tree
        return load_merged_tree()
    except Exception as _e:
        print(f"[DECISION TREE] rag_adapter unavailable ({_e}), loading static only")
        json_path = os.path.join(os.path.dirname(__file__), "data", "rag_model", "decision_tree.json")
        with open(json_path, "r") as f:
            return json.load(f)


def _norm(text: str) -> str:
    """Strip non-alphanumeric chars and lowercase — used for exact id/label matching."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def detect_symptom(complaint_text: str) -> Optional[Dict[str, Any]]:
    """
    Match chief complaint text against the decision tree.

    Priority order:
      1. Exact match against symptom_id or label (normalised, ignoring punctuation/spaces).
         e.g. user types "rashes" → matches symptom_id "rashes" directly.
      2. Whole-word keyword match using regex word boundaries.
         e.g. keyword "dengue" matches complaint "dengue fever" but
         keyword "rash" does NOT match complaint "rashes" (no word boundary after h).

    Whole-word matching prevents co-symptoms like "rash" inside dengue_fever
    from hijacking unrelated chief complaints such as "rashes".
    """
    if not complaint_text:
        return None

    complaint_lower = complaint_text.lower().strip()
    complaint_norm  = _norm(complaint_lower)
    decision_tree   = load_decision_tree()
    symptoms        = decision_tree["symptom_decision_tree"]["symptoms"]

    # ── Pass 1: exact id / label match ──────────────────────────────────
    for symptom in symptoms:
        if (_norm(symptom["symptom_id"]) == complaint_norm or
                _norm(symptom.get("label", "")) == complaint_norm):
            print(f"\n🔍 SYMPTOM DETECTED (exact id/label): '{complaint_text}' → {symptom['symptom_id']}")
            return {
                "symptom_id": symptom["symptom_id"],
                "label": symptom["label"],
                "matched_keyword": complaint_text,
                "default_urgency": symptom.get("default_urgency", "yellow_doctor_visit"),
            }

    # ── Pass 2: whole-word keyword match ────────────────────────────────
    for symptom in symptoms:
        for keyword in symptom.get("keywords", []):
            pattern = r"\b" + re.escape(keyword.lower()) + r"\b"
            if re.search(pattern, complaint_lower):
                print(f"\n🔍 SYMPTOM DETECTED (keyword): '{keyword}' → {symptom['symptom_id']}")
                return {
                    "symptom_id": symptom["symptom_id"],
                    "label": symptom["label"],
                    "matched_keyword": keyword,
                    "default_urgency": symptom.get("default_urgency", "yellow_doctor_visit"),
                }

    print(f"\n⚠️  NO SYMPTOM MATCH: Could not match '{complaint_text}' to any keyword — RAG will run")
    return None


# In-memory session storage - stores questionnaire responses
session_store = {}  # {session_id: [{"question": "...", "answer": "..."}, ...]}

# Follow-up question responses storage
followup_store = {}  # {session_id: [{"question": "...", "answer": "..."}, ...]}

# Conversation history for LLM phase (stores all chat turns)
conversation_history = {}

# Session storage for questionnaire flow
sessions = {}

# Session storage for follow-up questions flow
followup_sessions = {}  # {session_id: {"symptom": "...", "current_index": 0, "questions": [...]}}


def cleanup_session(session_id: str) -> bool:
    """Remove session data when chat is complete. Returns True if session existed."""
    found = False
    
    if session_id in sessions:
        del sessions[session_id]
        found = True
    
    if session_id in conversation_history:
        del conversation_history[session_id]
        found = True
    
    if session_id in session_store:
        del session_store[session_id]
        found = True
    
    if session_id in followup_sessions:
        del followup_sessions[session_id]
        found = True
    
    if session_id in followup_store:
        del followup_store[session_id]
        found = True
    
    if found:
        print(f"[CLEANUP] Session {session_id} removed from all stores")
    
    return found


def _restore_session_from_db(session_id: str) -> bool:
    """
    Rebuild in-memory session from DB after a server restart.
    Returns True if session found and restored, False otherwise.
    """
    try:
        from app.auth.assessment_db import get_session_by_id, get_session_answers

        db_sess = get_session_by_id(session_id)
        if not db_sess:
            return False

        raw_answers = get_session_answers(session_id)  # {question_id: answer_json_dict}

        answers_dict: Dict[str, Any] = {}
        for qid, aj in raw_answers.items():
            t = aj.get("type", "text") if isinstance(aj, dict) else "text"
            if t == "number":
                v = aj.get("value")
            elif t == "single_choice":
                v = aj.get("selected_option_label",
                           aj.get("selected_option_id", aj.get("value", "")))
            elif t == "multi_choice":
                v = ", ".join(aj.get("selected_option_labels", []))
            elif t == "image":
                v = "image received"
            else:
                v = aj.get("value", "") if isinstance(aj, dict) else str(aj)
            answers_dict[qid] = v

        phase = db_sess.get("phase", "questionnaire")
        detected_symptom_id = db_sess.get("detected_symptom")

        followup_qs = None
        followup_keys: list = []
        followup_index = 0
        detected_symptom = None

        if detected_symptom_id:
            decision_tree = load_decision_tree()
            for s in decision_tree["symptom_decision_tree"]["symptoms"]:
                if s["symptom_id"] == detected_symptom_id:
                    followup_qs = s.get("followup_questions")
                    detected_symptom = {
                        "symptom_id": s["symptom_id"],
                        "label": s.get("label", s["symptom_id"]),
                        "matched_keyword": answers_dict.get("q_current_ailment", ""),
                        "default_urgency": s.get("default_urgency", "yellow_doctor_visit"),
                    }
                    break

        if followup_qs:
            followup_keys = list(followup_qs.keys())
            answered_followup = sum(1 for k in followup_keys if k in answers_dict)
            followup_index = answered_followup

        questionnaire = load_questionnaire()
        all_q_ids = [q["id"] for q in questionnaire["questions"]]
        answered_q_count = sum(1 for qid in all_q_ids if qid in answers_dict)

        sessions[session_id] = {
            "answers": answers_dict,
            "current_index": answered_q_count,
            "total_questions": len(all_q_ids),
            "phase": phase,
            "followup_questions": followup_qs,
            "followup_keys": followup_keys,
            "followup_index": followup_index,
            "detected_symptom": detected_symptom,
        }

        print(f"[SESSION RESTORE] Rebuilt {session_id[:8]}... from DB "
              f"(phase={phase}, {len(answers_dict)} answers)")
        return True

    except Exception as exc:
        print(f"[SESSION RESTORE] Could not restore {session_id[:8]}...: {exc}")
        return False


def _opt_label(opt: str) -> str:
    """
    Return the display label for an option string.
    RAG/decision-tree options are already human-readable (contain spaces, hyphens,
    or mixed case) — leave them untouched.
    Questionnaire options are snake_case ids — convert to Title Case.
    """
    if " " in opt or "-" in opt or any(c.isupper() for c in opt):
        return opt
    return opt.replace("_", " ").title()


def build_question_response(question_data: dict) -> Question:
    """Convert questionnaire format to app's expected format"""
    response_type_map = {
        "text": "text",
        "number": "number",
        "single_choice": "single_choice",
        "multi_choice": "multi_choice",
        "image": "image"
    }
    
    question = Question(
        question_id=question_data["id"],
        text=question_data["text"],
        response_type=response_type_map.get(question_data["type"], "text"),
        response_options=None,
        is_compulsory=question_data.get("is_compulsory", False)  # Default to False if not specified
    )
    
    # Add options if single_choice or multi_choice.
    # RAG/decision-tree options are already human-readable display strings
    # (e.g. "1-3 days", "Physical activity") — preserve them as-is.
    # Questionnaire options are snake_case ids — convert those.
    if question_data["type"] in ["single_choice", "multi_choice"]:
        question.response_options = [
            {"id": opt, "label": _opt_label(opt)}
            for opt in question_data["options"]
        ]

    return question


def extract_assessment_topic(answers: dict) -> str:
    """Extract assessment topic from user's chief complaint"""
    chief_complaint = answers.get("q_current_ailment", "")
    if chief_complaint:
        # Simple extraction - use the complaint as topic
        return chief_complaint.lower().strip()
    return "general_health"


# ─────────────────────────────
# PRODUCTION ENDPOINTS
# ─────────────────────────────

@app.get("/assessment/start", response_model=AssessmentStartResponse)
def start_assessment(request: Request):
    """
    Start assessment and return:
      - session_id
      - first question
      - stored_answers: all Q&A previously saved for this user
        (merged from user_profiles + user_medical_data tables)

    JWT is optional — if valid, stored answers are returned so the app
    can auto-populate answers from local cache without extra API calls.
    If no/invalid JWT, stored_answers is empty and app collects everything fresh.
    """
    from app.auth.auth_config import JWT_SECRET_KEY, JWT_ALGORITHM
    from app.auth.profile_db import get_profile_by_user_id
    from app.auth.medical_db import get_medical_by_user_id

    session_id = str(uuid.uuid4())
    questionnaire = load_questionnaire()
    first_q = questionnaire["questions"][0]

    # Build question response
    question = build_question_response(first_q)

    # ── Fetch stored answers + create DB session if JWT present ───────
    stored_answers = []
    auth_header = request.headers.get("Authorization", "")

    print(f"[START] Auth header present: {bool(auth_header)}")

    if not auth_header.startswith("Bearer "):
        print("[START] WARNING: No Bearer token in Authorization header — stored_answers will be empty")
    else:
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
            print(f"[START] JWT decoded OK — user_id: {user_id}")

            if not user_id:
                print("[START] WARNING: JWT has no 'sub' field — stored_answers will be empty")
            else:
                # Create DB session and use the DB-generated session_id
                try:
                    from app.auth.assessment_db import create_session as _create_assessment_session
                    db_sess = _create_assessment_session(user_id)
                    session_id = str(db_sess["session_id"])
                    print(f"[START] DB session created — session_id: {session_id[:8]}...")
                except Exception as db_err:
                    print(f"[START] DB session creation failed: {db_err} — using in-memory UUID")

                profile_rows = get_profile_by_user_id(user_id)
                medical_rows = get_medical_by_user_id(user_id)
                print(f"[START] Profile rows: {len(profile_rows)} | Medical rows: {len(medical_rows)}")

                for row in profile_rows + medical_rows:
                    stored_answers.append(StoredAnswer(
                        question_id=row["question_id"],
                        question_text=row["question_text"],
                        answer_json=row["answer_json"]
                    ))
        except JWTError as e:
            print(f"[START] JWT decode error: {e} — stored_answers will be empty")
        except Exception as e:
            print(f"[START] DB fetch error: {e} — stored_answers will be empty")

    # Initialize in-memory session (uses DB session_id if JWT was valid, else uuid4)
    sessions[session_id] = {
        "answers": {},
        "current_index": 0,
        "total_questions": len(questionnaire["questions"]),
        "phase": "questionnaire",  # "questionnaire" or "followup"
        "followup_questions": None,  # Will be populated after questionnaire
        "followup_index": 0,
        "detected_symptom": None
    }

    print(f"\n[START] New session: {session_id[:8]}...")
    print(f"[START] First question: {first_q['id']}")
    print(f"[START] Stored answers returned: {len(stored_answers)}\n")

    return AssessmentStartResponse(
        session_id=session_id,
        question=question,
        stored_answers=stored_answers
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Safe validation error handler — never tries to decode binary request bodies."""
    try:
        errors = exc.errors()
        # Strip any 'input' field that might contain binary bytes
        safe_errors = []
        for e in errors:
            safe_e = {k: v for k, v in e.items() if k != "input"}
            safe_e["msg"] = str(e.get("msg", ""))
            safe_errors.append(safe_e)
        return JSONResponse(status_code=422, content={"detail": safe_errors})
    except Exception:
        return JSONResponse(status_code=422, content={"detail": "Validation error"})


# ─────────────────────────────────────────────────────────────────────────────
# Cerebras: decide if ailment needs an image before asking q_image_upload
# ─────────────────────────────────────────────────────────────────────────────

async def _check_image_needed(ailment: str) -> bool:
    """
    Ask Cerebras whether the given ailment benefits from a medical image.
    Returns True (ask image question) or False (skip it).
    Falls back to True on any error so we never incorrectly skip.
    """
    import asyncio as _asyncio
    import requests as _requests
    from config.settings import CEREBRAS_API_KEY, CEREBRAS_API_URL

    if not CEREBRAS_API_KEY:
        return True  # no key → safe default: ask image

    prompt = (
        f"A patient reported their chief complaint as: '{ailment}'.\n"
        "Would a medical photograph or image of the affected area help a doctor "
        "diagnose this condition? Answer with ONLY the single word yes or no."
    )

    def _call():
        try:
            resp = _requests.post(
                CEREBRAS_API_URL,
                headers={
                    "Authorization": f"Bearer {CEREBRAS_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama3.1-8b",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.0,
                    "max_tokens": 5,
                },
                timeout=8,
            )
            if resp.status_code == 200:
                answer = resp.json()["choices"][0]["message"]["content"].strip().lower()
                return answer.startswith("yes")
        except Exception:
            pass
        return True  # fallback: ask image

    loop = _asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _call)
    decision = "NEEDED" if result else "NOT NEEDED"
    print(f"[IMAGE CHECK] Cerebras says image {decision} for ailment: '{ailment}'")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Gemini Vision Analysis — background helper (called inside submit_answer)
# ─────────────────────────────────────────────────────────────────────────────

async def _run_gemini_analysis(
    session_id: str,
    image_bytes: bytes,
    image_content_type: str,
    user_id: Optional[str],
    current_answers: dict,
) -> None:
    """
    Background coroutine:
      1. Fetch prior DB answers + user profile + medical history.
      2. Call Gemini with image + context.
      3. Persist result to assessment_sessions.vision_analysis.
    Never raises — all errors are logged.
    """
    try:
        from app.vision_model.gemini_vision import analyze_image_with_gemini
        from app.auth.assessment_db import (
            get_session_answers_full, save_vision_analysis
        )
        from app.auth.profile_db  import get_profile_by_user_id
        from app.auth.medical_db  import get_medical_by_user_id

        # 1. Prior Q&A from DB
        try:
            prior_answers = get_session_answers_full(session_id)
        except Exception:
            prior_answers = []

        # 2. User profile
        user_profile: dict = {}
        if user_id:
            try:
                rows = get_profile_by_user_id(user_id)
                user_profile = rows[0] if rows else {}
            except Exception:
                pass

        # 3. Medical history
        medical_data: dict = {}
        if user_id:
            try:
                rows = get_medical_by_user_id(user_id)
                medical_data = rows[0] if rows else {}
            except Exception:
                pass

        # 4. Chief complaint from in-memory answers (fast path)
        chief_complaint = current_answers.get("q_current_ailment", "")

        print(f"[GEMINI VISION] Starting analysis for session {session_id[:8]}...")

        # 5. Call Gemini
        analysis_text = await analyze_image_with_gemini(
            image_bytes        = image_bytes,
            image_content_type = image_content_type,
            prior_answers      = prior_answers,
            user_profile       = user_profile,
            medical_data       = medical_data,
            chief_complaint    = chief_complaint,
        )

        # 6. Persist
        save_vision_analysis(session_id, analysis_text)
        print(f"[GEMINI VISION] Analysis saved for session {session_id[:8]}")

    except Exception as exc:
        print(f"[GEMINI VISION] Background task error: {exc}")


@app.post("/assessment/answer", response_model=AnswerResponse)
async def submit_answer(request: Request):
    """
    Handle answer and return next question.

    Accepts BOTH content types so the app can auto-answer with JSON
    and manually answer (with optional image) via multipart/form-data:
      • application/json  → {session_id, question_id, question_text, answer_json}
      • multipart/form-data → same fields as form parts + optional `image` file
    """
    content_type = request.headers.get("content-type", "")

    # ── Parse fields depending on content type ──────────────────────────
    image_bytes: Optional[bytes] = None
    image_filename: Optional[str] = None
    image_content_type: Optional[str] = None

    if "application/json" in content_type:
        body = await request.json()
        session_id = body["session_id"]
        # Support both formats:
        #   Old: { question_id, question_text, answer_json }
        #   New (frontend): { question: {question_id, text, ...}, answer: {...} }
        if "question_id" in body:
            question_id = body["question_id"]
            question_text = body["question_text"]
            answer_data: Dict[str, Any] = body["answer_json"]
        else:
            q_obj = body.get("question", {})
            question_id = q_obj.get("question_id", "")
            question_text = q_obj.get("text", "")
            answer_data: Dict[str, Any] = body.get("answer", {})
        if isinstance(answer_data, str):
            answer_data = json.loads(answer_data)
    else:
        # multipart/form-data (or url-encoded)
        form = await request.form()
        session_id = form["session_id"]
        # Support both flat and nested formats
        if "question_id" in form:
            question_id = form["question_id"]
            question_text = form.get("question_text", "")
            answer_data = json.loads(form.get("answer_json", "{}"))
        else:
            _q_obj = json.loads(form.get("question", "{}"))
            question_id = _q_obj.get("question_id", form.get("question_id", ""))
            question_text = _q_obj.get("text", form.get("question_text", ""))
            answer_data = json.loads(form.get("answer_json", form.get("answer", "{}")))
        # Check for optional image upload
        img = form.get("image")
        if img and hasattr(img, "read"):
            image_bytes = await img.read()
            image_filename = getattr(img, "filename", None)
            image_content_type = getattr(img, "content_type", None)

    # ── Validate session exists ─────────────────────────────────────────
    if session_id not in sessions:
        if not _restore_session_from_db(session_id):
            print(f"[ERROR] Session {session_id[:8]}... not found in memory or DB")
            return AnswerResponse(
                session_id=session_id,
                status="error"
            )

    # ── Handle optional image — call Gemini async, store in DB, return "image received" ──
    if image_bytes:
        size_kb = len(image_bytes) / 1024
        print(f"[IMAGE] Session {session_id[:8]}... received: {image_filename} "
              f"({image_content_type}, {size_kb:.1f} KB) — launching Gemini analysis")
        answer_data["image_description"] = "image received"

        # Extract user_id from JWT (best-effort)
        _user_id_for_vision: Optional[str] = None
        try:
            from app.auth.auth_config import JWT_SECRET_KEY, JWT_ALGORITHM
            _auth_hdr = request.headers.get("Authorization", "")
            if _auth_hdr.startswith("Bearer "):
                _tok = _auth_hdr.split(" ", 1)[1].strip()
                _payload = jwt.decode(_tok, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
                _user_id_for_vision = _payload.get("sub")
        except Exception:
            pass

        # Fire background Gemini analysis (non-blocking)
        import asyncio as _asyncio
        _asyncio.create_task(_run_gemini_analysis(
            session_id        = session_id,
            image_bytes       = image_bytes,
            image_content_type= image_content_type or "image/jpeg",
            user_id           = _user_id_for_vision,
            current_answers   = sessions[session_id].get("answers", {}),
        ))
    # ────────────────────────────────────────────────────────────────────

    # Extract answer value based on type
    if answer_data.get("type") == "number":
        answer_value = answer_data.get("value")
    elif answer_data.get("type") == "single_choice":
        answer_value = answer_data.get("selected_option_label", answer_data.get("selected_option_id", answer_data.get("value")))
    elif answer_data.get("type") == "multi_choice":
        answer_value = ", ".join(answer_data.get("selected_option_labels", []))
    elif answer_data.get("type") == "image":
        answer_value = "image received"
    else:
        answer_value = answer_data.get("value", "")

    sessions[session_id]["answers"][question_id] = answer_value

    # Persist answer to DB (best-effort)
    try:
        from app.auth.assessment_db import save_session_answer as _save_session_answer
        _save_session_answer(session_id, question_id, question_text, answer_data)
    except Exception as _db_err:
        print(f"[ANSWER] DB save skipped for {question_id}: {_db_err}")

    print(f"[ANSWER] Session {session_id[:8]}... answered {question_id}: {answer_value}")
    
    # Get session phase
    phase = sessions[session_id].get("phase", "questionnaire")
    
    if phase == "questionnaire":
        # QUESTIONNAIRE PHASE
        questionnaire = load_questionnaire()
        all_questions = questionnaire["questions"].copy()
        
        # Check for conditional questions (female → pregnancy/menstrual)
        answers = sessions[session_id]["answers"]
        gender = answers.get("q_gender")
        if gender and gender.lower() == "female":
            conditional = questionnaire.get("conditional", {}).get("q_gender=female", [])
            all_questions.extend(conditional)
        
        # Find next question
        current_index = sessions[session_id]["current_index"]
        next_index = current_index + 1
        
        # Check if questionnaire is complete
        if next_index >= len(all_questions):
            print(f"\n{'='*60}")
            print(f"✅ QUESTIONNAIRE COMPLETE")
            print(f"{'='*60}")
            
            # Detect symptom from chief complaint
            chief_complaint = answers.get("q_current_ailment", "")
            detected = detect_symptom(chief_complaint) if chief_complaint else None
            
            if detected:
                symptom_id = detected["symptom_id"]
                print(f"🔍 Detected symptom: {detected['label']} ({symptom_id})")
                print(f"🔄 Transitioning to FOLLOW-UP questions...\n")
                
                # Load follow-up questions for detected symptom
                decision_tree = load_decision_tree()
                symptoms = decision_tree["symptom_decision_tree"]["symptoms"]
                symptom_data = next((s for s in symptoms if s["symptom_id"] == symptom_id), None)
                
                if symptom_data and "followup_questions" in symptom_data:
                    followup_qs = symptom_data["followup_questions"]
                    question_keys = list(followup_qs.keys())
                    
                    # Update session to follow-up phase
                    sessions[session_id]["phase"] = "followup"
                    sessions[session_id]["followup_questions"] = followup_qs
                    sessions[session_id]["followup_keys"] = question_keys
                    sessions[session_id]["followup_index"] = 0
                    sessions[session_id]["detected_symptom"] = detected

                    # Update DB session phase + detected symptom (best-effort)
                    try:
                        from app.auth.assessment_db import update_session_phase as _update_phase
                        _update_phase(session_id, "followup", detected["symptom_id"])
                    except Exception as _db_err:
                        print(f"[ANSWER] DB phase update skipped: {_db_err}")
                    
                    # Return first follow-up question
                    first_key = question_keys[0]
                    first_q_data = followup_qs[first_key]
                    
                    question = Question(
                        question_id=first_key,
                        text=first_q_data["question"],
                        response_type=first_q_data["type"],
                        response_options=[
                            {"id": opt, "label": _opt_label(opt)}
                            for opt in first_q_data.get("options", [])
                        ] if "options" in first_q_data else None,
                        is_compulsory=True  # Follow-up questions are always compulsory
                    )
                    
                    print(f"[FOLLOWUP] Question 1/{len(question_keys)}: {first_key}\n")
                    
                    return AnswerResponse(
                        session_id=session_id,
                        question=question
                    )
            
            # ── No keyword match — try RAG pipeline ────────────────────────
            if chief_complaint:
                print(f"\n{'='*60}")
                print(f"🤖 RAG PIPELINE: no keyword match for '{chief_complaint}'")
                print(f"   Running RAG to generate followup questions...")
                print(f"{'='*60}\n")

                try:
                    from app.core.rag_adapter import run_rag_for_symptom
                    rag_node, rag_error = run_rag_for_symptom(chief_complaint)
                except Exception as _rag_import_err:
                    rag_node, rag_error = None, str(_rag_import_err)

                if rag_error:
                    print(f"[RAG] Failed: {rag_error}")
                    return AnswerResponse(
                        session_id=session_id,
                        status="error",
                        rag_error=f"RAG pipeline could not generate questions: {rag_error}"
                    )

                if rag_node and "followup_questions" in rag_node:
                    followup_qs = rag_node["followup_questions"]
                    question_keys = list(followup_qs.keys())

                    rag_detected = {
                        "symptom_id": rag_node["symptom_id"],
                        "label": rag_node.get("label", rag_node["symptom_id"]),
                        "matched_keyword": chief_complaint,
                        "default_urgency": rag_node.get("default_urgency", "yellow_doctor_visit")
                    }

                    sessions[session_id]["phase"] = "followup"
                    sessions[session_id]["followup_questions"] = followup_qs
                    sessions[session_id]["followup_keys"] = question_keys
                    sessions[session_id]["followup_index"] = 0
                    sessions[session_id]["detected_symptom"] = rag_detected

                    try:
                        from app.auth.assessment_db import update_session_phase as _update_phase
                        _update_phase(session_id, "followup", rag_node["symptom_id"])
                    except Exception as _db_err:
                        print(f"[ANSWER] DB phase update skipped: {_db_err}")

                    first_key = question_keys[0]
                    first_q_data = followup_qs[first_key]

                    question = Question(
                        question_id=first_key,
                        text=first_q_data["question"],
                        response_type=first_q_data["type"],
                        response_options=[
                            {"id": opt, "label": _opt_label(opt)}
                            for opt in first_q_data.get("options", [])
                        ] if "options" in first_q_data else None,
                        is_compulsory=True
                    )

                    print(f"[RAG] ✓ Using RAG followup questions — "
                          f"1/{len(question_keys)}: {first_key}\n")

                    return AnswerResponse(
                        session_id=session_id,
                        question=question
                    )

            # No symptom detected and RAG not triggered (empty complaint)
            print(f"⚠️  No symptom detected, no follow-up questions available")
            print(f"📊 Ready for final report\n")

            return AnswerResponse(
                session_id=session_id,
                status="completed"
            )
        
        # Return next questionnaire question
        # ── If we just answered q_current_ailment and the next question is
        #    q_image_upload, ask Cerebras whether an image is actually needed.
        #    If not, skip straight past q_image_upload.
        next_q = all_questions[next_index]
        if question_id == "q_current_ailment" and next_q["id"] == "q_image_upload":
            image_needed = await _check_image_needed(answer_value)
            if not image_needed:
                # Skip the image question
                next_index += 1
                print(f"[IMAGE CHECK] Skipping q_image_upload — image not needed for '{answer_value}'")
                if next_index >= len(all_questions):
                    return AnswerResponse(session_id=session_id, status="completed")
                next_q = all_questions[next_index]

        sessions[session_id]["current_index"] = next_index
        question = build_question_response(next_q)
        
        print(f"[NEXT] Session {session_id[:8]}... question {next_index + 1}/{len(all_questions)}: {next_q['id']}")
        
        return AnswerResponse(
            session_id=session_id,
            question=question
        )
    
    else:
        # FOLLOW-UP PHASE
        followup_qs = sessions[session_id]["followup_questions"]
        question_keys = sessions[session_id]["followup_keys"]
        current_index = sessions[session_id]["followup_index"]
        
        # Move to next follow-up question
        next_index = current_index + 1
        
        # Check if follow-ups are complete
        if next_index >= len(question_keys):
            print(f"\n{'='*60}")
            print(f"✅ FOLLOW-UP QUESTIONS COMPLETE")
            print(f"📊 Ready for final report with ALL questions\n")
            print(f"{'='*60}\n")
            
            return AnswerResponse(
                session_id=session_id,
                status="completed"
            )
        
        # Return next follow-up question
        sessions[session_id]["followup_index"] = next_index
        next_key = question_keys[next_index]
        next_q_data = followup_qs[next_key]
        
        question = Question(
            question_id=next_key,
            text=next_q_data["question"],
            response_type=next_q_data["type"],
            response_options=[
                {"id": opt, "label": _opt_label(opt)}
                for opt in next_q_data.get("options", [])
            ] if "options" in next_q_data else None,
            is_compulsory=True  # Follow-up questions are always compulsory
        )
        
        print(f"[FOLLOWUP] Session {session_id[:8]}... question {next_index + 1}/{len(question_keys)}: {next_key}\n")
        
        return AnswerResponse(
            session_id=session_id,
            question=question
        )


@app.post("/assessment/report", response_model=MedicalReportResponse)
def receive_report(req: ReportRequest, request: Request):
    """Generate a medical report from the completed session.
    Reconstructs all Q&A from the in-memory sessions dict using session_id.
    If JWT is present, the report is also persisted to the reports table."""
    from app.core.llm_client import generate_medical_report

    session_id = req.session_id

    print(f"\n{'='*60}")
    print(f"📊 ASSESSMENT REPORT REQUEST")
    print(f"{'='*60}")
    print(f"Session ID: {session_id}")

    # ── Reconstruct responses from in-memory session ──────────────────
    if session_id not in sessions:
        if not _restore_session_from_db(session_id):
            print(f"[REPORT] ERROR: session {session_id[:8]}... not found in memory or DB")
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Session not found. Please start a new assessment.")

    session = sessions[session_id]
    answers_dict = session.get("answers", {})  # {question_id: answer_text}

    # Build a question_id → question_text lookup from questionnaire + followup
    questionnaire = load_questionnaire()
    q_text_map = {}
    for q in questionnaire["questions"]:
        q_text_map[q["id"]] = q["text"]
    for q in questionnaire.get("conditional", {}).get("q_gender=female", []):
        q_text_map[q["id"]] = q["text"]

    followup_qs = session.get("followup_questions") or {}
    for qid, qdata in followup_qs.items():
        q_text_map[qid] = qdata["question"]

    # Build responses_data list for LLM
    responses_data = []
    for qid, answer_value in answers_dict.items():
        responses_data.append({
            "question": q_text_map.get(qid, qid),
            "answer": str(answer_value) if answer_value is not None else ""
        })

    print(f"Total Responses reconstructed: {len(responses_data)}")
    print(f"{'='*60}\n")

    for i, qa in enumerate(responses_data, 1):
        print(f"  {i}. Q: {qa['question']}")
        print(f"     A: {qa['answer']}")

    # ── Symptom data from session (already detected during answer phase) ──
    detected_symptom_raw = session.get("detected_symptom")
    symptom_data = None
    if detected_symptom_raw:
        symptom_id = detected_symptom_raw.get("symptom_id")
        decision_tree = load_decision_tree()
        for s in decision_tree["symptom_decision_tree"]["symptoms"]:
            if s["symptom_id"] == symptom_id:
                symptom_data = s
                break
        print(f"🎯 Detected Symptom: {detected_symptom_raw.get('label')}")

    # ── Generate medical report ───────────────────────────────────────
    # Fetch Gemini vision analysis (if an image was submitted during assessment)
    vision_analysis: Optional[str] = None
    try:
        from app.auth.assessment_db import get_vision_analysis as _get_vision_analysis
        vision_analysis = _get_vision_analysis(session_id)
        if vision_analysis:
            print(f"[REPORT] Vision analysis found ({len(vision_analysis)} chars) — included in report")
        else:
            print("[REPORT] No vision analysis found for this session")
    except Exception as _va_err:
        print(f"[REPORT] Could not fetch vision analysis: {_va_err}")

    print(f"\n🤖 Generating medical report using LLM...")
    medical_report = generate_medical_report(responses_data, symptom_data, vision_analysis)

    print(f"\n{'='*60}")
    print(f"✅ MEDICAL REPORT GENERATED")
    print(f"Topic: {medical_report.get('assessment_topic', 'N/A')}")
    print(f"Urgency: {medical_report.get('urgency_level', 'N/A')}")
    print(f"{'='*60}\n")

    report_response = MedicalReportResponse(**medical_report)

    # Mark DB session as completed (best-effort)
    try:
        from app.auth.assessment_db import complete_session as _complete_session
        _complete_session(session_id)
        print(f"[REPORT] DB session marked completed: {session_id[:8]}...")
    except Exception as _db_err:
        print(f"[REPORT] DB complete_session skipped: {_db_err}")

    # ── Persist to DB if JWT present ──────────────────────────────────
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from jose import jwt as _jwt, JWTError as _JWTError
        from app.auth.auth_config import JWT_SECRET_KEY, JWT_ALGORITHM
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = _jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
            if user_id:
                save_report(user_id=user_id, report=report_response.dict())
                print(f"[REPORT] Persisted to DB for user {user_id[:8]}...")
            else:
                print("[REPORT] JWT has no 'sub' — report not persisted")
        except _JWTError as e:
            print(f"[REPORT] JWT decode error: {e} — report not persisted")
        except Exception as e:
            print(f"[REPORT] DB save error: {e} — report not persisted (still returned to app)")
    else:
        print("[REPORT] No JWT — report generated but not persisted")

    return report_response


# ═════════════════════════════════════════════════════════════
# SYMPTOM DETECTION & FOLLOW-UP QUESTIONS
# ═════════════════════════════════════════════════════════════

@app.get("/symptom/detect")
def detect_symptom_endpoint(complaint: str):
    """Detect symptom from chief complaint text using keyword matching"""
    if not complaint or not complaint.strip():
        return {"error": "Complaint text is required"}
    
    result = detect_symptom(complaint)
    
    if result:
        return {
            "detected": True,
            "symptom_id": result["symptom_id"],
            "label": result["label"],
            "matched_keyword": result["matched_keyword"],
            "default_urgency": result["default_urgency"],
            "next_step": f"Call /followup/start?symptom={result['symptom_id']}"
        }
    else:
        return {
            "detected": False,
            "message": "No matching symptom found. Available symptoms: chest_pain, fever, headache",
            "suggestion": "User may need general medical consultation without symptom-specific questions"
        }


@app.get("/followup/start")
def start_followup(symptom: str):
    """Start symptom-specific follow-up questions from decision tree"""
    decision_tree = load_decision_tree()
    symptoms = decision_tree["symptom_decision_tree"]["symptoms"]
    
    # Find the matching symptom
    symptom_data = None
    for s in symptoms:
        if s["symptom_id"] == symptom:
            symptom_data = s
            break
    
    if not symptom_data:
        return {"error": f"Symptom '{symptom}' not found. Valid options: chest_pain, fever, headache"}
    
    # Extract follow-up questions
    followup_questions = symptom_data["followup_questions"]
    question_keys = list(followup_questions.keys())
    
    if not question_keys:
        return {"error": "No follow-up questions found for this symptom"}
    
    # Create session
    session_id = str(uuid.uuid4())
    first_question_key = question_keys[0]
    first_question_data = followup_questions[first_question_key]
    
    # Store session state
    followup_sessions[session_id] = {
        "symptom": symptom,
        "symptom_label": symptom_data["label"],
        "current_index": 0,
        "question_keys": question_keys,
        "all_questions": followup_questions,
        "responses": []
    }
    
    print(f"\n[FOLLOWUP START] Session: {session_id[:8]}... | Symptom: {symptom}")
    print(f"[FOLLOWUP START] First question: {first_question_key}\n")
    
    # Build response in EXACT same format as /assessment/start
    response = {
        "session_id": session_id,
        "question": {
            "question_id": first_question_key,
            "text": first_question_data["question"],
            "response_type": first_question_data["type"]
        },
        "is_last": len(question_keys) == 1
    }
    
    # Add response_options if present
    if "options" in first_question_data:
        options = []
        for opt in first_question_data["options"]:
            options.append({
                "id": opt,
                "label": _opt_label(opt)
            })
        response["question"]["response_options"] = options
    
    return response


@app.post("/followup/answer")
def answer_followup(req: AnswerRequest):
    """Submit answer to follow-up question and get next question"""
    session_id = req.session_id
    
    if session_id not in followup_sessions:
        print(f"[ERROR] Follow-up session {session_id[:8]}... not found")
        return {"error": "Session not found"}
    
    session = followup_sessions[session_id]
    current_index = session["current_index"]
    question_keys = session["question_keys"]
    all_questions = session["all_questions"]
    
    # Store the answer
    current_question_key = question_keys[current_index]
    session["responses"].append({
        "question": req.question,
        "answer": req.answer
    })
    
    print(f"[FOLLOWUP ANSWER] Session {session_id[:8]}... answered {current_question_key}: {req.answer}")
    
    # Move to next question
    current_index += 1
    session["current_index"] = current_index
    
    # Check if we're done
    if current_index >= len(question_keys):
        print(f"[FOLLOWUP COMPLETE] Session {session_id[:8]}... finished all {len(question_keys)} questions")
        return {
            "session_id": session_id,
            "question": {
                "question_id": "complete",
                "text": "Follow-up questions completed. Please submit your report.",
                "response_type": "text"
            },
            "is_last": True
        }
    
    # Get next question
    next_question_key = question_keys[current_index]
    next_question_data = all_questions[next_question_key]
    
    print(f"[FOLLOWUP NEXT] Session {session_id[:8]}... question {current_index + 1}/{len(question_keys)}: {next_question_key}")
    
    # Build response
    response = {
        "session_id": session_id,
        "question": {
            "question_id": next_question_key,
            "text": next_question_data["question"],
            "response_type": next_question_data["type"]
        },
        "is_last": (current_index == len(question_keys) - 1)
    }
    
    # Add response_options if present
    if "options" in next_question_data:
        options = []
        for opt in next_question_data["options"]:
            options.append({
                "id": opt,
                "label": _opt_label(opt)
            })
        response["question"]["response_options"] = options
    
    return response


@app.post("/followup/report", response_model=ReportResponse)
def receive_followup_report(req: ReportRequest):
    """Receive completed follow-up question responses"""
    # Generate session_id if not provided
    session_id = req.session_id or str(uuid.uuid4())
    
    print(f"\n{'='*60}")
    print(f"📊 FOLLOW-UP REPORT RECEIVED")
    print(f"{'='*60}")
    print(f"Session ID: {session_id}")
    print(f"Total Responses: {len(req.responses)}")
    print(f"{'='*60}\n")
    
    # Store responses in follow-up store
    followup_store[session_id] = [qa.dict() for qa in req.responses]
    
    # Print all responses for verification
    for i, qa in enumerate(req.responses, 1):
        print(f"  {i}. Q: {qa.question}")
        print(f"     A: {qa.answer}")
    
    print(f"\n{'='*60}")
    print(f"✅ Stored {len(req.responses)} follow-up responses for session {session_id[:8]}...")
    print(f"📦 Storage: followup_store['{session_id[:8]}...']")
    print(f"{'='*60}\n")
    
    return ReportResponse(
        report_id=session_id,
        summary=f"Follow-up assessment completed with {len(req.responses)} responses. Ready for analysis."
    )


# LEGACY ENDPOINT (kept for backward compatibility)
@app.post("/session/context", response_model=AssessmentResponse)
def receive_context(req: ContextRequest):
    """Receive context and start questionnaire or handle completed questionnaire"""
    global current_context, current_session_id
    
    # If questionnaire_context is provided, it means questionnaire is complete
    if req.questionnaire_context:
        print("\n" + "="*60)
        print("📋 QUESTIONNAIRE ANSWERS RECEIVED:")
        print("="*60)
        print(f"Session ID: {req.session_id}")
        print(f"User Choice: {req.user_choice}")
        print("\nAnswers:")
        for q_id, answer in req.questionnaire_context.items():
            print(f"  {q_id}: {answer}")
        print("="*60 + "\n")
        
        # TESTING MODE: Store only latest context (overwrites previous)
        current_context = {
            "session_id": req.session_id,
            "user_choice": req.user_choice,
            "answers": req.questionnaire_context
        }
        current_session_id = req.session_id
        
        print(f"✅ Context stored in RAM at: current_context variable")
        print(f"   Access via GET /debug/context to view\n")
        print(f"📊 Parsed Answers:")
        for k, v in req.questionnaire_context.items():
            print(f"   {k} = {v}")
        print()
        
        # Transition to LLM phase
        return AssessmentResponse(
            session_id=req.session_id,
            phase="llm",
            message="Thanks. I'll ask a few questions to better understand your condition."
        )
    
    # Initialize session storage for new user
    current_session_id = req.session_id
    sessions[req.session_id] = {
        "answers": {},
        "user_choice": req.user_choice
    }
    
    # Load questionnaire
    questionnaire = load_questionnaire()
    first_question = questionnaire["questions"][0]
    
    # Calculate total questions (base questions only for now)
    total_questions = len(questionnaire["questions"])
    
    # Build response
    question_block = QuestionBlock(
        question_id=first_question["id"],
        text=first_question["text"],
        type=first_question["type"]
    )
    
    options = None
    if first_question["type"] == "single_choice":
        question_block.input_mode = "buttons"
        options = [
            AnswerOption(id=opt, label=_opt_label(opt))
            for opt in first_question["options"]
        ]
    else:
        question_block.input_hint = first_question.get("hint", "")
    
    return AssessmentResponse(
        session_id=req.session_id,
        phase="predefined",
        question=question_block,
        options=options,
        progress=Progress(current=1, total=total_questions)
    )


# ─────────────────────────────
# ANSWER HANDLING
# ─────────────────────────────

@app.post("/chat", response_model=AssessmentResponse)
def submit_answer(req: AnswerRequest):
    """Handle questionnaire answers"""
    print("CHAT:", req.dict())
    
    # ─── PREDEFINED PHASE
    if req.phase == "predefined":
        
        # Get or initialize session
        if req.session_id not in sessions:
            sessions[req.session_id] = {"answers": {}}
        
        # Store the answer
        if req.question_id:
            sessions[req.session_id]["answers"][req.question_id] = req.answer.value
        
        # Load questionnaire
        questionnaire = load_questionnaire()
        all_questions = questionnaire["questions"].copy()
        answers = sessions[req.session_id]["answers"]
        
        # Check if we need to add conditional questions
        if "q_gender" in answers and answers["q_gender"] == "female":
            conditional_questions = questionnaire.get("conditional", {}).get("q_gender=female", [])
            all_questions.extend(conditional_questions)
        
        # Find current question index
        current_index = -1
        for i, q in enumerate(all_questions):
            if q["id"] == req.question_id:
                current_index = i
                break
        
        # Get next question
        next_index = current_index + 1
        
        # Check if questionnaire is complete
        if next_index >= len(all_questions):
            # Request questionnaire context from app
            return AssessmentResponse(
                session_id=req.session_id,
                phase="predefined",
                request_context=True,
                request_questionnaire=True
            )
        
        # Get next question
        next_question = all_questions[next_index]
        
        # Build question block
        question_block = QuestionBlock(
            question_id=next_question["id"],
            text=next_question["text"],
            type=next_question["type"]
        )
        
        options = None
        if next_question["type"] == "single_choice":
            question_block.input_mode = "buttons"
            options = [
                AnswerOption(id=opt, label=_opt_label(opt))
                for opt in next_question["options"]
            ]
        else:
            question_block.input_hint = next_question.get("hint", "")
        
        return AssessmentResponse(
            session_id=req.session_id,
            phase="predefined",
            question=question_block,
            options=options,
            progress=Progress(current=next_index + 1, total=len(all_questions))
        )
    
    # ─── LLM PHASE - Conversational Medical Guidance
    if req.phase == "llm":
        print(f"\n[LLM] Request received: user_message='{req.user_message}'")
        
        # Access stored context
        if not current_context:
            return AssessmentResponse(
                session_id=req.session_id,
                phase="end",
                message="Session expired. Please start over."
            )
        
        answers = current_context["answers"]
        user_msg = req.user_message or ""
        
        print(f"[LLM] Session {req.session_id[:8]}... has history: {req.session_id in conversation_history}")
        
        # Initialize conversation history for this session (FIRST TIME ONLY)
        if req.session_id not in conversation_history:
            # Build medical schema from questionnaire
            from app.core.medical_schema import build_medical_schema
            from app.core.guidance_engine import load_guidance_rules, match_symptoms, build_guidance_bundle
            
            schema = build_medical_schema(answers)
            guidance_data = load_guidance_rules()
            
            # Match symptoms
            current_complaint = schema.get("current_complaint", "")
            matched_symptoms = match_symptoms(current_complaint, guidance_data.get("symptoms", {}))
            guidance_bundle = build_guidance_bundle(matched_symptoms, guidance_data)
            
            print(f"\n{'='*60}")
            print(f"[LLM INIT] Current complaint: '{current_complaint}'")
            print(f"[LLM INIT] Matched symptoms: {matched_symptoms}")
            print(f"[LLM INIT] Guidance questions available: {len(guidance_bundle.get('follow_up_questions', []))}")
            if guidance_bundle.get('follow_up_questions'):
                for i, q in enumerate(guidance_bundle['follow_up_questions'][:3], 1):
                    print(f"[LLM INIT]   Q{i}: {q}")
            print(f"{'='*60}\n")
            
            # Store for this session
            conversation_history[req.session_id] = {
                "schema": schema,
                "guidance": guidance_bundle,
                "messages": [],
                "question_count": 0
            }
            
            # Get first question from guidance rules or LLM
            follow_up_questions = guidance_bundle.get("follow_up_questions", [])
            
            if follow_up_questions and current_complaint:
                # Use first follow-up question from guidance rules
                first_question = follow_up_questions[0]
                intro = f"I see you're experiencing {current_complaint}. "
                first_msg = intro + first_question
                
                conversation_history[req.session_id]["messages"].append({
                    "role": "assistant",
                    "content": first_msg
                })
                conversation_history[req.session_id]["question_count"] = 1
                
                print(f"[LLM] Asking question 1: {first_question}")
                
                return AssessmentResponse(
                    session_id=req.session_id,
                    phase="llm",
                    message=first_msg
                )
            else:
                # No matched symptoms - ask LLM to generate question
                from app.core.llm_client import get_llm_response
                
                context_prompt = f"Patient's complaint: {current_complaint or 'not specified'}. Ask relevant follow-up question."
                llm_resp = get_llm_response(schema, guidance_bundle, context_prompt)
                
                first_msg = llm_resp.get("text", "Can you describe your symptoms in more detail?")
                
                conversation_history[req.session_id]["messages"].append({
                    "role": "assistant",
                    "content": first_msg
                })
                
                return AssessmentResponse(
                    session_id=req.session_id,
                    phase="llm",
                    message=first_msg
                )
        
        # Subsequent LLM turns - user has sent an answer
        if user_msg:
            session_data = conversation_history[req.session_id]
            
            # Store user message
            session_data["messages"].append({
                "role": "user",
                "content": user_msg
            })
            
            print(f"\n[LLM] Turn #{(len(session_data['messages']) + 1)//2}")
            print(f"[LLM] User: {user_msg}")
            
            # Continue asking questions
            follow_up_questions = session_data["guidance"].get("follow_up_questions", [])
            current_q_idx = session_data.get("question_count", 0)
            
            print(f"[LLM] Question count: {current_q_idx}, Available guidance questions: {len(follow_up_questions)}")
            
            # Check if we have more predefined questions from guidance rules
            if current_q_idx < len(follow_up_questions):
                next_question = follow_up_questions[current_q_idx]
                
                session_data["messages"].append({
                    "role": "assistant",
                    "content": next_question
                })
                session_data["question_count"] = current_q_idx + 1
                
                print(f"[LLM] Asking guidance question #{current_q_idx + 1}: {next_question}")
                
                return AssessmentResponse(
                    session_id=req.session_id,
                    phase="llm",
                    message=next_question
                )
            else:
                # No more predefined questions - use LLM to either ask more or analyze
                from app.core.llm_client import get_llm_response
                
                # Build conversation context
                conv_text = "\n".join([
                    f"{msg['role']}: {msg['content']}" 
                    for msg in session_data["messages"][-6:]  # Last 6 messages
                ])
                
                prompt = f"Conversation:\n{conv_text}\n\nBased on this info about their {session_data['schema'].get('current_complaint', 'condition')}, either ask ONE more relevant clarifying question OR provide analysis with urgency and advice if you have enough information."
                
                print(f"[LLM] No more guidance questions. Calling LLM for next step...")
                
                llm_resp = get_llm_response(
                    session_data["schema"],
                    session_data["guidance"],
                    prompt
                )
                
                if llm_resp.get("type") == "question":
                    next_question = llm_resp.get("text", "Is there anything else about your symptoms?")
                    
                    session_data["messages"].append({
                        "role": "assistant",
                        "content": next_question
                    })
                    session_data["question_count"] = current_q_idx + 1
                    
                    print(f"[LLM] LLM-generated question: {next_question}")
                    
                    return AssessmentResponse(
                        session_id=req.session_id,
                        phase="llm",
                        message=next_question
                    )
                else:
                    # LLM wants to provide analysis
                    summary = llm_resp.get("summary", "Based on your symptoms...")
                    advice = llm_resp.get("advice", ["Rest and monitor", "See a doctor if symptoms worsen"])
                    urgency = llm_resp.get("urgency", "self_care")
                    
                    full_msg = f"## Summary\n{summary}\n\n"
                    full_msg += f"**Urgency:** {urgency.replace('_', ' ').title()}\n\n"
                    full_msg += "## What to do:\n" + "\n".join([f"• {a}" for a in advice])
                    full_msg += "\n\n*This is general guidance. Consult a healthcare provider for personalized advice.*"
                    
                    print(f"[LLM] Analysis complete. Ending session.")
                    
                    cleanup_session(req.session_id)
                    
                    return AssessmentResponse(
                        session_id=req.session_id,
                        phase="end",
                        message=full_msg
                    )
        
        # Shouldn't reach here - initialization should have returned OR user should have sent message
        print(f"[LLM] WARNING: Reached unexpected fallback!")
        print(f"[LLM] user_msg: '{user_msg}', session in history: {req.session_id in conversation_history}")
        return AssessmentResponse(
            session_id=req.session_id,
            phase="end",
            message="An error occurred. Please restart the conversation."
        )
    
    # ─── END
    return AssessmentResponse(
        session_id=req.session_id,
        phase="end",
        message="Assessment completed. Take care."
    )


@app.post("/assessment/end", response_model=EndSessionResponse)
def end_assessment(request: EndSessionRequest):
    """
    End assessment session and cleanup all related data.
    
    Removes session from:
    - In-memory session stores (sessions, session_store)
    - Follow-up question stores (followup_sessions, followup_store)
    - LLM conversation history (conversation_history)
    
    Returns:
    - {"status": "ended"} if session was found and cleaned
    - {"status": "not_found"} if session didn't exist
    """
    session_existed = cleanup_session(request.session_id)

    # Expire DB session (best-effort)
    try:
        from app.auth.assessment_db import expire_session as _expire_session
        _expire_session(request.session_id)
    except Exception as _db_err:
        print(f"[END] DB expire_session skipped: {_db_err}")

    if session_existed:
        return EndSessionResponse(status="ended")
    else:
        return EndSessionResponse(status="not_found")


@app.post("/session/end")
def end_session(request: Dict[str, str]):
    """Cleanup session when user closes or completes chat (legacy endpoint)"""
    session_id = request.get("session_id")
    if not session_id:
        return {"status": "error", "message": "session_id required"}
    
    cleanup_session(session_id)
    return {"status": "ok", "message": f"Session {session_id[:8]}... ended and cleaned up"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/debug/sessions")
def view_all_sessions():
    """View all stored sessions"""
    return {
        "status": "ok",
        "active_sessions": list(session_store.keys()),
        "session_count": len(session_store),
        "sessions": session_store
    }


@app.get("/debug/session/{session_id}")
def view_session_data(session_id: str):
    """View specific session data"""
    if session_id not in session_store:
        return {
            "status": "not_found",
            "message": f"Session {session_id} not found in storage",
            "session_id": session_id
        }
    
    return {
        "status": "ok",
        "session_id": session_id,
        "response_count": len(session_store[session_id]),
        "responses": session_store[session_id]
    }


@app.get("/debug/conversation/{session_id}")
def view_conversation(session_id: str):
    """View conversation history for a session (TESTING MODE)"""
    if session_id not in conversation_history:
        return {
            "status": "empty",
            "message": "No conversation found for this session",
            "session_id": session_id
        }
    
    session_data = conversation_history[session_id]
    return {
        "status": "ok",
        "session_id": session_id,
        "medical_schema": session_data.get("schema"),
        "matched_symptoms": session_data.get("guidance", {}).get("matched_symptoms", []),
        "conversation": session_data.get("messages", []),
        "turn_count": len(session_data.get("messages", [])) // 2
    }
