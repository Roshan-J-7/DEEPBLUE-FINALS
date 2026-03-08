"""
Chatbot Client
Handles communication with Cerebras LLM API for the chatbot feature
"""

import requests
from typing import List, Dict, Optional
from app.chatbot.chatbot_config import (
    CHATBOT_CEREBRAS_API_KEY,
    CHATBOT_CEREBRAS_API_URL,
    CHATBOT_MODEL,
    CHATBOT_MAX_TOKENS,
    CHATBOT_TEMPERATURE,
    CHATBOT_SYSTEM_PROMPT
)


class ChatbotClient:
    """Client for interacting with Cerebras API"""
    
    def __init__(self):
        self.api_key = CHATBOT_CEREBRAS_API_KEY
        self.api_url = CHATBOT_CEREBRAS_API_URL
        self.model = CHATBOT_MODEL
        self.system_prompt = CHATBOT_SYSTEM_PROMPT
    
    def generate_response(
        self, 
        user_message: str, 
        conversation_history: Optional[List[Dict[str, str]]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        system_prompt_override: Optional[str] = None
    ) -> str:
        """
        Generate a chatbot response using Cerebras LLM
        
        Args:
            user_message: The user's current message
            conversation_history: Optional list of previous messages [{"role": "user"/"assistant", "content": "..."}]
            temperature: Optional temperature override
            max_tokens: Optional max_tokens override
            system_prompt_override: Optional custom system prompt (used to inject profile + report context)
        
        Returns:
            The chatbot's response as a string
        
        Raises:
            Exception: If API call fails
        """
        # Build messages array — use override if provided (for context injection)
        active_prompt = system_prompt_override if system_prompt_override else self.system_prompt
        messages = [{"role": "system", "content": active_prompt}]
        
        # Add conversation history if provided
        if conversation_history:
            messages.extend(conversation_history)
        
        # Add current user message
        messages.append({"role": "user", "content": user_message})
        
        # Prepare API request
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature or CHATBOT_TEMPERATURE,
            "max_tokens": max_tokens or CHATBOT_MAX_TOKENS
        }
        
        try:
            # Make API call
            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=90
            )
            
            response.raise_for_status()
            
            # Extract response
            data = response.json()
            assistant_message = data["choices"][0]["message"]["content"]
            
            return assistant_message
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Cerebras API Error: {str(e)}")
        except (KeyError, IndexError) as e:
            raise Exception(f"Invalid API response format: {str(e)}")


# Global chatbot client instance
chatbot_client = ChatbotClient()
