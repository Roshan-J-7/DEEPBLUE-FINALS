"""
LLM prompt engineering for medical guidance assistant.
Contains system prompts and context injection logic.
"""

def build_system_prompt() -> str:
    """Build the core system prompt for the medical guidance assistant"""
    return """You are a medical guidance assistant. You are NOT a doctor and do NOT diagnose.

Your role:
- Ask follow-up questions before giving advice
- Use provided guidance as suggestions, not rules
- DO NOT contradict urgency classifications
- Be concise and helpful
- Always ask clarifying questions first, then provide guidance

Response format: You MUST respond with valid JSON in one of these formats:

1. To ask a follow-up question:
{
  "type": "question",
  "text": "What is your temperature?",
  "expected_format": "Eg: 101°F"
}

2. To provide analysis and guidance:
{
  "type": "analysis", 
  "summary": "Based on your symptoms...",
  "urgency": "self_care|doctor_visit|emergency",
  "advice": ["Rest and stay hydrated", "Monitor symptoms"]
}

3. To offer next steps:
{
  "type": "decision",
  "text": "Would you like a summary report or continue chatting?",
  "options": ["Generate report", "Continue"]
}

Always respond with valid JSON only."""


def build_context_prompt(medical_schema: dict, guidance: dict, user_message: str) -> str:
    """Build context prompt with medical schema, guidance, and user message"""
    
    # Extract key information from medical schema
    demographics = medical_schema.get("demographics", {})
    age = demographics.get("age", "unknown")
    gender = demographics.get("gender", "unknown")
    current_complaint = medical_schema.get("current_complaint", "none specified")
    medical_history = medical_schema.get("medical_history", [])
    pregnancy_status = medical_schema.get("pregnancy_status")
    
    # Extract guidance information
    matched_symptoms = guidance.get("matched_symptoms", [])
    follow_up_questions = guidance.get("follow_up_questions", [])
    urgency_rules = guidance.get("urgency_rules", {})
    analysis_hints = guidance.get("analysis_hints", [])
    suggested_advice = guidance.get("suggested_advice", [])
    emergency_keywords = guidance.get("emergency_keywords", [])
    
    context = f"""
PATIENT CONTEXT:
- Age: {age}
- Gender: {gender}
- Current complaint: {current_complaint}
- Medical history: {', '.join(medical_history) if medical_history else 'none'}
- Pregnancy status: {pregnancy_status or 'not applicable'}

MATCHED SYMPTOMS: {', '.join(matched_symptoms)}

SUGGESTED FOLLOW-UP QUESTIONS:
{chr(10).join([f"- {q}" for q in follow_up_questions[:3]])}

URGENCY GUIDELINES:
- Self-care: {urgency_rules.get('self_care', 'N/A')}
- Doctor visit: {urgency_rules.get('doctor_visit', 'N/A')}
- Emergency: {urgency_rules.get('emergency', 'N/A')}

ANALYSIS HINTS:
{chr(10).join([f"- {hint}" for hint in analysis_hints])}

SUGGESTED ADVICE:
{chr(10).join([f"- {advice}" for advice in suggested_advice])}

EMERGENCY KEYWORDS TO WATCH FOR:
{', '.join(emergency_keywords[:10])}

USER'S CURRENT MESSAGE: "{user_message}"

Instructions:
1. If this is early in the conversation or you need more information, ask a relevant follow-up question
2. If you have enough information, provide analysis with appropriate urgency level
3. Use the guidance above as suggestions, not strict rules
4. Do NOT diagnose or make definitive medical statements
5. If user mentions emergency keywords, classify as "emergency" urgency
"""
    
    return context


def build_full_prompt(medical_schema: dict, guidance: dict, user_message: str) -> str:
    """Build complete prompt by combining system prompt and context"""
    system_prompt = build_system_prompt()
    context_prompt = build_context_prompt(medical_schema, guidance, user_message)
    
    return f"{system_prompt}\n\n{context_prompt}"