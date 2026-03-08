"""
Guidance rules engine for medical symptom matching.
Loads guidance_rules.json and matches symptoms to provide structured guidance.
"""

import json
import os
from typing import Dict, List, Any


def load_guidance_rules() -> Dict[str, Any]:
    """Load guidance rules from JSON file"""
    json_path = os.path.join(os.path.dirname(__file__), "..", "data", "guidance_rules.json")
    
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(
            f"❌ CRITICAL: guidance_rules.json not found at {json_path}. "
            "This file is required for the chatbot to function."
        )
    except json.JSONDecodeError as e:
        raise ValueError(
            f"❌ CRITICAL: guidance_rules.json is invalid JSON. Error: {str(e)}"
        )
    except Exception as e:
        raise RuntimeError(
            f"❌ CRITICAL: Failed to load guidance_rules.json. Error: {str(e)}"
        )


def match_symptoms(complaint: str, symptoms_data: Dict[str, Any]) -> List[str]:
    """
    Match current complaint text against symptom keywords.
    Returns list of matched symptom names.
    """
    if not complaint:
        return []
    
    # Normalize: remove extra spaces, convert to lowercase
    complaint_normalized = " ".join(complaint.lower().strip().split())
    matched = []
    
    for symptom_name, symptom_data in symptoms_data.items():
        keywords = symptom_data.get("keywords", [])
        for keyword in keywords:
            keyword_normalized = keyword.lower().strip()
            
            # Try multiple matching strategies
            # 1. Exact match
            if keyword_normalized == complaint_normalized:
                matched.append(symptom_name)
                break
            
            # 2. Keyword is substring of complaint
            if keyword_normalized in complaint_normalized:
                matched.append(symptom_name)
                break
            
            # 3. Complaint is substring of keyword  
            if complaint_normalized in keyword_normalized:
                matched.append(symptom_name)
                break
            
            # 4. Remove spaces and try matching (headpain vs head pain)
            keyword_no_space = keyword_normalized.replace(" ", "")
            complaint_no_space = complaint_normalized.replace(" ", "")
            if keyword_no_space in complaint_no_space or complaint_no_space in keyword_no_space:
                matched.append(symptom_name)
                break
    
    return matched


def build_guidance_bundle(matched_symptoms: List[str], guidance_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build guidance bundle from matched symptoms.
    Combines all matched symptoms' guidance into single bundle.
    """
    symptoms_data = guidance_data.get("symptoms", {})
    emergency_keywords = guidance_data.get("emergency_keywords", [])
    disclaimer = guidance_data.get("disclaimer", "")
    
    # Initialize bundle
    bundle = {
        "matched_symptoms": matched_symptoms,
        "follow_up_questions": [],
        "urgency_rules": {},
        "analysis_hints": [],
        "suggested_advice": [],
        "emergency_keywords": emergency_keywords,
        "disclaimer": disclaimer
    }
    
    # If no symptoms matched, return minimal bundle
    if not matched_symptoms:
        return bundle
    
    # Combine guidance from all matched symptoms
    all_hints = []
    all_advice = []
    combined_urgency = {}
    
    for symptom_name in matched_symptoms:
        if symptom_name not in symptoms_data:
            continue
            
        symptom_data = symptoms_data[symptom_name]
        
        # Collect follow-up questions (deduplicate)
        questions = symptom_data.get("follow_up_questions", [])
        for q in questions:
            if q not in bundle["follow_up_questions"]:
                bundle["follow_up_questions"].append(q)
        
        # Collect urgency rules (merge)
        urgency = symptom_data.get("urgency_rules", {})
        for level, rule in urgency.items():
            if level not in combined_urgency:
                combined_urgency[level] = []
            combined_urgency[level].append(rule)
        
        # Collect analysis hints
        hints = symptom_data.get("analysis_hints", "")
        if hints and hints not in all_hints:
            all_hints.append(hints)
        
        # Collect suggested advice
        advice = symptom_data.get("suggested_advice", "")
        if advice and advice not in all_advice:
            all_advice.append(advice)
    
    # Flatten urgency rules (join multiple rules with " OR ")
    bundle["urgency_rules"] = {
        level: " OR ".join(rules) if len(rules) > 1 else rules[0]
        for level, rules in combined_urgency.items()
    }
    
    bundle["analysis_hints"] = all_hints
    bundle["suggested_advice"] = all_advice
    
    return bundle


def get_guidance(schema: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main function to get guidance for a medical schema.
    
    Args:
        schema: Medical schema dict with current_complaint field
        
    Returns:
        Guidance bundle dict
    """
    try:
        # Load guidance rules
        guidance_data = load_guidance_rules()
        
        # Extract current complaint
        current_complaint = schema.get("current_complaint", "")
        
        # Match symptoms
        matched_symptoms = match_symptoms(current_complaint, guidance_data.get("symptoms", {}))
        
        # Build guidance bundle
        guidance_bundle = build_guidance_bundle(matched_symptoms, guidance_data)
        
        return guidance_bundle
        
    except Exception as e:
        # Return empty guidance bundle on error (safe fallback)
        return {
            "matched_symptoms": [],
            "follow_up_questions": [],
            "urgency_rules": {},
            "analysis_hints": [],
            "suggested_advice": [],
            "emergency_keywords": [],
            "disclaimer": "Error loading guidance rules."
        }
    