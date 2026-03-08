"""
Cerebras LLM client for the Call Function (Remy voice agent).
Maintains per-call conversation history, hits Cerebras API.
"""

import requests
from typing import Dict, List, Optional
from app.call_function.call_config import (
    CALL_FUNC_CEREBRAS_API_KEY,
    CALL_FUNC_CEREBRAS_API_URL,
    CALL_FUNC_CEREBRAS_MODEL,
    REMY_SYSTEM_PROMPTS,
)


class CallCerebrasClient:
    def __init__(self):
        self.api_key = CALL_FUNC_CEREBRAS_API_KEY
        self.api_url = CALL_FUNC_CEREBRAS_API_URL
        self.model = CALL_FUNC_CEREBRAS_MODEL
        # call_sid -> list of messages
        self.conversations: Dict[str, List[dict]] = {}

    # ── conversation lifecycle ──

    def init_conversation(self, call_sid: str, lang_code: str = "en"):
        prompt = REMY_SYSTEM_PROMPTS.get(lang_code, REMY_SYSTEM_PROMPTS["en"])
        self.conversations[call_sid] = [{"role": "system", "content": prompt}]

    def clear_conversation(self, call_sid: str):
        self.conversations.pop(call_sid, None)

    # ── get LLM response ──

    def get_response(self, call_sid: str, user_message: str) -> str:
        if call_sid not in self.conversations:
            self.init_conversation(call_sid)

        messages = self.conversations[call_sid]
        messages.append({"role": "user", "content": user_message})

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 200,
            "temperature": 0.7,
        }

        try:
            resp = requests.post(
                self.api_url, json=payload, headers=headers, timeout=30
            )
            resp.raise_for_status()
            ai_text = resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"[CallCerebras] Error: {e}")
            ai_text = "Sorry, I had a brief issue. Could you repeat that?"

        messages.append({"role": "assistant", "content": ai_text})

        # keep history manageable (system + last 20 msgs)
        if len(messages) > 21:
            messages.pop(1)
            messages.pop(1)

        return ai_text


# singleton
call_cerebras_client = CallCerebrasClient()
