# Chatbot Feature

A separate chatbot feature using Cerebras LLM API with its own API key.

## 📁 Structure

```
app/chatbot/
├── __init__.py           # Module initialization
├── chatbot_config.py     # Configuration & settings  
├── chatbot_client.py     # Cerebras API client
├── chatbot_routes.py     # FastAPI endpoints
└── README.md            # This file
```

## 🔑 Configuration

The chatbot uses a **separate API key** from the main clinical decision system:

**Environment Variable:** `CHATBOT_CEREBRAS_API_KEY`  
Already set in `.env` file

## 🚀 Integration (When Ready)

To activate the chatbot endpoints, add this to `app/main.py`:

```python
from app.chatbot.chatbot_routes import router as chatbot_router

app.include_router(chatbot_router)
```

## 📡 API Endpoints

### POST /chatbot/chat
Send a message to the chatbot

**Request:**
```json
{
  "message": "Hello, how are you?",
  "conversation_history": [
    {"role": "user", "content": "Hi"},
    {"role": "assistant", "content": "Hello! How can I help?"}
  ],
  "temperature": 0.7,
  "max_tokens": 1024
}
```

**Response:**
```json
{
  "response": "I'm doing well, thank you! How can I assist you today?",
  "status": "success"
}
```

### GET /chatbot/health
Check chatbot service health

**Response:**
```json
{
  "status": "healthy",
  "service": "chatbot",
  "model": "llama3.1-8b"
}
```

## ⚙️ Settings

Customize in `chatbot_config.py`:
- `CHATBOT_MODEL` - Default: "llama3.1-8b"
- `CHATBOT_MAX_TOKENS` - Default: 1024
- `CHATBOT_TEMPERATURE` - Default: 0.7
- `CHATBOT_SYSTEM_PROMPT` - System instructions for the AI

## 🔒 Separation from Main System

- ✅ Uses separate API key (`CHATBOT_CEREBRAS_API_KEY`)
- ✅ Independent configuration
- ✅ Isolated module (no imports from `app/core/`)
- ✅ Separate API routes (`/chatbot/*`)

## 📝 Usage Example

```python
from app.chatbot.chatbot_client import chatbot_client

# Simple chat
response = chatbot_client.generate_response("What is AI?")

# Chat with history
history = [
    {"role": "user", "content": "My name is John"},
    {"role": "assistant", "content": "Nice to meet you, John!"}
]
response = chatbot_client.generate_response(
    "What's my name?", 
    conversation_history=history
)
```
