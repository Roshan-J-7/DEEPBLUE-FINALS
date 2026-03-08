"""
Structured medical schema builder.
Converts questionnaire answers into canonical medical schema.
"""

MEDICAL_SCHEMA_TEMPLATE = {
    "demographics": {
        "age": None,
        "gender": None
    },
    "medical_history": [],
    "current_complaint": None,
    "symptom_duration": None,
    "red_flags": [],
    "allergies": [],
    "medications": [],
    "pregnancy_status": None
}

# Dynamic fields that can be updated during LLM interactions
DYNAMIC_FIELDS = {
    "observations": [],          # facts learned from LLM Q&A
    "follow_up_answers": {},     # answers to LLM questions
    "derived_findings": [],      # LLM-inferred (non-diagnostic)
    "llm_advice": [],            # advice given so far
    "urgency": None,             # self_care | doctor_visit | emergency
    "confidence": None           # 0–1
}


def normalize_value(value):
    """Normalize a value (lowercase, trim)"""
    if isinstance(value, str):
        return value.lower().strip()
    return value


def parse_medical_history(history_text):
    """Parse medical history text into a list"""
    if not history_text:
        return []
    
    history_text = normalize_value(history_text)
    
    if history_text in ["none", "no", "nothing", "n/a"]:
        return []
    
    # Split by common separators and clean up
    items = []
    for separator in [",", ";", "and", "&"]:
        if separator in history_text:
            items = [item.strip() for item in history_text.split(separator)]
            break
    else:
        # No separators found, treat as single item
        items = [history_text]
    
    # Filter out empty strings and normalize
    return [item for item in items if item and item not in ["none", "no", "nothing"]]


def build_medical_schema(answers: dict) -> dict:
    """
    Build medical schema from questionnaire answers.
    
    Args:
        answers: Dictionary of questionnaire answers
        
    Returns:
        Medical schema dictionary based on template with dynamic fields
    """
    # Start with template copy
    import copy
    schema = copy.deepcopy(MEDICAL_SCHEMA_TEMPLATE)
    
    # Add dynamic fields to schema
    schema.update(copy.deepcopy(DYNAMIC_FIELDS))
    
    # Map questionnaire answers to schema fields
    if "q_age" in answers:
        age_text = answers["q_age"]
        # Try to extract number from age text
        if isinstance(age_text, str):
            import re
            age_match = re.search(r'\d+', age_text)
            if age_match:
                schema["demographics"]["age"] = int(age_match.group())
        elif isinstance(age_text, (int, float)):
            schema["demographics"]["age"] = int(age_text)
    
    if "q_gender" in answers:
        schema["demographics"]["gender"] = normalize_value(answers["q_gender"])
    
    if "q_condition_details" in answers:
        schema["medical_history"] = parse_medical_history(answers["q_condition_details"])
    elif "q_past_conditions" in answers:
        val = answers["q_past_conditions"]
        if val and normalize_value(val) not in ["no", "none"]:
            schema["medical_history"] = ["unspecified conditions (patient confirmed yes)"]
    
    if "q_current_ailment" in answers:
        schema["current_complaint"] = normalize_value(answers["q_current_ailment"])
    
    if "q_pregnant" in answers:
        schema["pregnancy_status"] = normalize_value(answers["q_pregnant"])
    
    return schema