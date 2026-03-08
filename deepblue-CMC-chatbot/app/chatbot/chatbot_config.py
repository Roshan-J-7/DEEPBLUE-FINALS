"""
Chatbot Configuration
Separate configuration for the chatbot feature
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Chatbot Cerebras API Configuration (Separate from main system)
CHATBOT_CEREBRAS_API_KEY = os.getenv("CHATBOT_CEREBRAS_API_KEY")
CHATBOT_CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions"

# Model Configuration
CHATBOT_MODEL = "llama3.1-8b"  # Default model
CHATBOT_MAX_TOKENS = 1024
CHATBOT_TEMPERATURE = 0.7

# Base System Prompt for Remy — the medical triage assistant
# This is the core identity. Profile + report context gets appended at runtime.
CHATBOT_SYSTEM_PROMPT = """You are Remy, a friendly and knowledgeable medical triage assistant.

Rules you MUST follow:
- Never diagnose definitively. You are not a doctor.
- Respect the urgency level from the patient's report.
- Be calm, clear, and structured in your responses.
- Follow medical safety boundaries at all times.
- Always recommend consulting a doctor for serious concerns.
- Be empathetic, warm, and supportive.
- Keep responses concise but helpful.
- If the patient asks something outside your scope, gently redirect.
"""

# Validate API Key
if not CHATBOT_CEREBRAS_API_KEY:
    raise ValueError(
        "❌ CHATBOT_CEREBRAS_API_KEY not found in environment variables. "
        "Please set it in your .env file."
    )
