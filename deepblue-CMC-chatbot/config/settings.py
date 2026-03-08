import os
from dotenv import load_dotenv
# Load environment variables from .env file
load_dotenv()
# Cerebras API configuration
CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY")
CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions"