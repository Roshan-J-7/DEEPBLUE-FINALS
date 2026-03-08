"""
LLM client for Cerebras API integration.
Handles API calls and response parsing for medical guidance.
"""

import json
import requests
from typing import Dict, Any, Optional
from config.settings import CEREBRAS_API_KEY, CEREBRAS_API_URL


def call_cerebras_llm(prompt: str) -> Optional[Dict[str, Any]]:
    """
    Call Cerebras LLM with the given prompt and return parsed JSON response.
    
    Args:
        prompt: The complete prompt to send to the LLM
        
    Returns:
        Parsed JSON response or None if call fails
    """
    if not CEREBRAS_API_KEY:
        return None
    
    try:
        headers = {
            "Authorization": f"Bearer {CEREBRAS_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "llama3.1-8b",
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.2,  # Low temperature for consistent medical guidance
            "max_tokens": 300,   # Keep responses concise
            "response_format": {"type": "json_object"}  # Force JSON output
        }
        
        response = requests.post(
            CEREBRAS_API_URL,
            headers=headers,
            json=payload,
            timeout=10  # 10 second timeout
        )
        
        if response.status_code == 200:
            result = response.json()
            llm_response = result["choices"][0]["message"]["content"].strip()
            
            # Parse JSON response
            try:
                parsed_response = json.loads(llm_response)
                return parsed_response
            except json.JSONDecodeError:
                # If JSON parsing fails, return a safe question
                return {
                    "type": "question",
                    "text": "Could you provide more details about your symptoms?",
                    "expected_format": "Please describe what you're experiencing"
                }
        
        # API error - return safe fallback
        return None
        
    except Exception:
        # Any error - return safe fallback  
        return None


def get_llm_response(medical_schema: Dict[str, Any], guidance: Dict[str, Any], user_message: str) -> Dict[str, Any]:
    """
    Get structured LLM response for medical guidance.
    
    Args:
        medical_schema: Patient's medical information
        guidance: Symptom guidance bundle
        user_message: User's current message
        
    Returns:
        Structured response dict with type, text, and additional fields
    """
    from app.core.llm_prompt import build_full_prompt
    
    # Build prompt
    prompt = build_full_prompt(medical_schema, guidance, user_message)
    
    # Call LLM
    llm_response = call_cerebras_llm(prompt)
    
    if llm_response and isinstance(llm_response, dict):
        # Validate response structure
        response_type = llm_response.get("type")
        if response_type in ["question", "analysis", "decision"]:
            return llm_response
    
    # Fallback response if LLM fails or returns invalid format
    return {
        "type": "question",
        "text": "Can you tell me more about your symptoms?",
        "expected_format": "Please describe what you're experiencing in detail"
    }


def generate_medical_report(responses: list, symptom_data: Optional[Dict] = None, vision_analysis: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate a structured medical report using LLM based on questionnaire responses and symptom data.
    
    Args:
        responses: List of Q&A dicts from questionnaire + follow-up questions
        symptom_data: Symptom-specific data from decision_tree.json (optional)
        vision_analysis: Gemini image analysis text (optional — present when patient uploaded an image)
        
    Returns:
        Structured medical report with patient info, summary, possible causes, advice, urgency
    """
    from datetime import datetime
    import uuid
    
    # Build comprehensive context
    context = "=== PATIENT ASSESSMENT DATA ===\n\n"
    
    # Extract key information
    chief_complaint = None
    patient_name = None
    patient_age = None
    patient_gender = None
    
    for qa in responses:
        q = qa.get("question", "")
        a = qa.get("answer", "")
        context += f"Q: {q}\nA: {a}\n\n"
        
        # Extract key fields
        if "name" in q.lower():
            patient_name = a
        elif "chief complaint" in q.lower() or "current ailment" in q.lower():
            chief_complaint = a
        elif "age" in q.lower() and not patient_age:
            patient_age = a
        elif "sex" in q.lower() or "gender" in q.lower():
            patient_gender = a
    
    # Add symptom-specific context if available
    if symptom_data:
        context += "\n=== SYMPTOM-SPECIFIC MEDICAL CONTEXT ===\n\n"
        context += f"Symptom: {symptom_data.get('label', 'Unknown')}\n"
        context += f"Default Urgency: {symptom_data.get('default_urgency', 'unknown')}\n\n"
        
        if "triage_rationale" in symptom_data:
            rationale = symptom_data["triage_rationale"]
            context += "Clinical Considerations:\n"
            for key, value in rationale.items():
                if isinstance(value, list):
                    context += f"- {key}: {', '.join(value)}\n"
                else:
                    context += f"- {key}: {value}\n"
            context += "\n"
        
        if "immediate_red_flags" in symptom_data:
            context += "RED FLAGS to watch for:\n"
            for flag in symptom_data["immediate_red_flags"]:
                context += f"- {flag}\n"
            context += "\n"
        
        if "urgency_decision_logic" in symptom_data:
            logic = symptom_data["urgency_decision_logic"]
            context += "Urgency Classification Guidelines:\n"
            for level, criteria in logic.items():
                context += f"\n{level.upper()}:\n"
                if isinstance(criteria, list):
                    for criterion in criteria:
                        context += f"  - {criterion}\n"
            context += "\n"
        
        if "advice" in symptom_data:
            advice_data = symptom_data["advice"]
            context += "Clinical Advice Guidelines:\n"
            for key, value in advice_data.items():
                if isinstance(value, list):
                    context += f"{key}:\n"
                    for item in value:
                        context += f"  - {item}\n"
                else:
                    context += f"{key}: {value}\n"

    # Add Gemini image analysis if available
    if vision_analysis:
        context += "\n=== MEDICAL IMAGE ANALYSIS (by Gemini AI) ===\n\n"
        context += vision_analysis.strip()
        context += "\n\n"
    
    # Build LLM prompt with new format
    _vision_instruction = ""
    _vision_json_field  = ""
    _vision_mandatory   = ""
    _summary_image_example = ""
    if vision_analysis:
        _vision_instruction = (
            "5. Based on the Gemini image analysis above, write ONE concise sentence "
            "in the LAST position of the summary array that tells the patient what "
            "their image indicates about their condition — in plain, natural language. "
            "Do NOT copy the raw analysis. Interpret it and state what it means clinically."
        )
        _vision_json_field = """
  "image_analysis": {{
    "gemini_findings_summary": "One-sentence summary of what the image showed",
    "correlation_with_symptoms": "How the image findings relate to the reported complaint",
    "clinical_significance": "What this may indicate clinically",
    "recommendation": "Specific follow-up recommendation based on the image"
  }},"""
        _vision_mandatory = (
            "\n- The LAST item in the summary array must be your own one-sentence interpretation "
            "of what the uploaded image indicates about the patient's condition. "
            "Write it naturally, e.g. 'The image confirms active bleeding from the right nostril, consistent with your reported nosebleed.' "
            "Do NOT paste raw analysis text."
        )
        _summary_image_example = (
            ',\n    "The image shows [your one-sentence clinical interpretation here]"'
        )

    prompt = f"""{context}

=== TASK ===
Based on the patient assessment data above, generate a comprehensive medical report in STRICT JSON format.

You are a medical AI assistant. Analyze the patient's information and provide:
1. A concise summary of key findings (3-5 bullet points)
2. Possible causes/differential diagnoses (2-3 most likely, with detailed breakdown)
3. Actionable medical advice (4-6 recommendations)
4. Urgency level determination
{_vision_instruction}

REQUIRED JSON OUTPUT FORMAT:
{{
  "assessment_topic": "{chief_complaint or 'general_health'}",{_vision_json_field}
  "summary": [
    "Brief clinical point 1",
    "Brief clinical point 2",
    "Brief clinical point 3"{_summary_image_example}
  ],
  "possible_causes": [
    {{
      "id": "condition_name_lowercase",
      "title": "Condition Name",
      "short_description": "Brief one-line description suitable for list view",
      "subtitle": "Optional context or common association",
      "severity": "mild|moderate|severe",
      "probability": 0.0-1.0,
      "detail": {{
        "about_this": [
          "Explanation point 1 about the condition",
          "Explanation point 2",
          "Explanation point 3"
        ],
        "how_common": {{
          "percentage": 60,
          "description": "6 out of 10 people with similar symptoms had this"
        }},
        "what_you_can_do_now": [
          "Specific actionable step 1",
          "Specific actionable step 2",
          "Specific actionable step 3"
        ],
        "warning": "Optional warning text if there are concerning factors"
      }}
    }}
  ],
  "advice": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2",
    "Specific actionable recommendation 3"
  ],
  "urgency_level": "red_emergency|yellow_doctor_visit|green_home_care"
}}

IMPORTANT GUIDELINES:
- Be specific and actionable in advice
- Use evidence-based recommendations
- Consider patient age and gender in assessment
- probability should sum to ~1.0 across all causes
- urgency_level must match the clinical urgency guidelines provided
- Keep language clear and patient-friendly
- "id" should be lowercase with underscores (e.g., "tension_headache", "viral_infection")
- "short_description" should be under 10 words
- "subtitle" should provide helpful context (e.g., "Often linked to stress")
- "how_common percentage" should be realistic (10-90 range)
- Do NOT include treatment recommendations requiring diagnosis{_vision_mandatory}

Generate the JSON report now:"""
    
    # Call LLM
    if not CEREBRAS_API_KEY:
        # Fallback report if no API key
        return generate_fallback_report(patient_name, patient_age, patient_gender, chief_complaint, symptom_data)
    
    try:
        headers = {
            "Authorization": f"Bearer {CEREBRAS_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "llama3.1-8b",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a medical AI assistant that generates structured medical assessment reports. Always respond in valid JSON format."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.3,
            "max_tokens": 1500,
            "response_format": {"type": "json_object"}
        }
        
        response = requests.post(
            CEREBRAS_API_URL,
            headers=headers,
            json=payload,
            timeout=15
        )
        
        if response.status_code == 200:
            result = response.json()
            llm_response = result["choices"][0]["message"]["content"].strip()
            
            # Parse JSON response
            try:
                report = json.loads(llm_response)
                
                # Add metadata
                report["report_id"] = str(uuid.uuid4())
                report["generated_at"] = datetime.utcnow().isoformat() + "Z"
                
                # Add patient info
                report["patient_info"] = {
                    "name": patient_name or "Unknown",
                    "age": _extract_age_number(patient_age),
                    "gender": patient_gender or "unknown"
                }
                
                # Ensure required fields exist
                if "assessment_topic" not in report:
                    report["assessment_topic"] = chief_complaint or "general_health"
                if "summary" not in report:
                    report["summary"] = ["Assessment completed based on provided information."]
                if "possible_causes" not in report:
                    report["possible_causes"] = []
                if "advice" not in report:
                    report["advice"] = ["Consult with a healthcare provider for personalized advice."]
                if "urgency_level" not in report:
                    default = symptom_data.get("default_urgency", "green_home_care") if symptom_data else "green_home_care"
                    report["urgency_level"] = default

                # Guarantee image_analysis is present when Gemini ran
                if vision_analysis and not report.get("image_analysis"):
                    report["image_analysis"] = {
                        "gemini_findings_summary": "Image was analysed by Gemini AI.",
                        "correlation_with_symptoms": "Findings reviewed in context of reported complaint.",
                        "clinical_significance": "Discuss image findings with your healthcare provider.",
                        "recommendation": "Show the image to your doctor during consultation.",
                    }
                    print("[REPORT] image_analysis missing from LLM — injected placeholder")

                return report
                
            except json.JSONDecodeError:
                # LLM didn't return valid JSON
                return generate_fallback_report(patient_name, patient_age, patient_gender, chief_complaint, symptom_data)
        
        # API error
        return generate_fallback_report(patient_name, patient_age, patient_gender, chief_complaint, symptom_data)
        
    except Exception as e:
        print(f"[ERROR] LLM report generation failed: {e}")
        return generate_fallback_report(patient_name, patient_age, patient_gender, chief_complaint, symptom_data)


def _extract_age_number(age_str: Optional[str]) -> int:
    """Extract numeric age from age range string."""
    if not age_str:
        return 0
    
    # Handle age ranges like "26_35", "18_25", etc.
    if "_" in age_str:
        parts = age_str.split("_")
        try:
            # Return middle of range
            return (int(parts[0]) + int(parts[1])) // 2
        except:
            pass
    
    # Handle direct numbers
    try:
        return int(age_str)
    except:
        return 0


def generate_fallback_report(patient_name: Optional[str], patient_age: Optional[str], 
                             patient_gender: Optional[str], chief_complaint: Optional[str], 
                             symptom_data: Optional[Dict]) -> Dict[str, Any]:
    """Generate a basic fallback report when LLM is unavailable."""
    from datetime import datetime
    import uuid
    
    topic = chief_complaint or "general_health"
    default_urgency = symptom_data.get("default_urgency", "green_home_care") if symptom_data else "green_home_care"
    
    report = {
        "report_id": str(uuid.uuid4()),
        "assessment_topic": topic,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "patient_info": {
            "name": patient_name or "Unknown",
            "age": _extract_age_number(patient_age),
            "gender": patient_gender or "unknown"
        },
        "summary": [
            f"Assessment received for {topic}.",
            "Your symptoms have been documented.",
            "A healthcare professional should review your case."
        ],
        "possible_causes": [
            {
                "id": "general_assessment",
                "title": "Various possible conditions",
                "short_description": "Multiple conditions could explain symptoms",
                "subtitle": "Requires professional medical evaluation",
                "severity": "unknown",
                "probability": 1.0,
                "detail": {
                    "about_this": [
                        "Multiple conditions could explain your symptoms.",
                        "A medical professional can provide accurate diagnosis.",
                        "Your specific case requires individual assessment."
                    ],
                    "how_common": {
                        "percentage": 50,
                        "description": "Varies widely based on specific symptoms and history"
                    },
                    "what_you_can_do_now": [
                        "Document any changes in your symptoms",
                        "Monitor your condition closely",
                        "Keep track of when symptoms occur",
                        "Note what makes symptoms better or worse"
                    ],
                    "warning": "Seek immediate medical attention if symptoms worsen or new concerning symptoms develop"
                }
            }
        ],
        "advice": [
            "Document any changes in your symptoms.",
            "Monitor your condition closely.",
            "Seek medical attention if symptoms worsen.",
            "Consult with a healthcare provider for proper diagnosis."
        ],
        "urgency_level": default_urgency
    }
    
    return report
