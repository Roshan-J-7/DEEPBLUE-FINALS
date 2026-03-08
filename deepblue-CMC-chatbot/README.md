# Healthcare Chatbot Backend

A FastAPI-based medical assessment chatbot backend that provides intelligent questionnaire flows, symptom-based follow-up questions, and AI-powered medical report generation using Cerebras LLM.

## 🚀 Features

- **Dynamic Questionnaire Flow**: 25+ medical questions with conditional logic
- **Smart Question Prioritization**: `is_compulsory` field enables apps to auto-populate non-critical questions from user profiles
- **Symptom-Based Follow-ups**: Automatic symptom detection triggers relevant follow-up questions from decision tree
- **AI Medical Reports**: Structured medical reports with nested cause details, patient info, and actionable advice
- **LLM Conversational Guidance**: Real-time medical guidance using Cerebras AI (llama3.1-8b)
- **RESTful API**: Clean endpoints for assessment flow and report generation

## 📋 Prerequisites

- Python 3.11+
- Cerebras API Key ([Get one here](https://cloud.cerebras.ai/))

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/PratyushSowrirajan/deepblue-CMC-chatbot.git
   cd deepblue-CMC-chatbot
   ```

2. **Create virtual environment**
   ```bash
   python -m venv .venv
   .venv\Scripts\activate  # Windows
   # or
   source .venv/bin/activate  # Linux/Mac
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   CEREBRAS_API_KEY=your_cerebras_api_key_here
   ```

## 🏃 Running the Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Server will start at: `http://localhost:8000`

API Documentation: `http://localhost:8000/docs`

## 🔌 API Endpoints

### 1. Start Assessment
```http
GET /assessment/start
```

**Response:**
```json
{
  "session_id": "uuid",
  "question": {
    "question_id": "q_name",
    "text": "What is your name?",
    "type": "free_text",
    "is_compulsory": false
  },
  "total_questions": 27,
  "status": "in_progress"
}
```

### 2. Submit Answer
```http
POST /assessment/answer
```

**Request Body:**
```json
{
  "session_id": "uuid",
  "question_id": "q_name",
  "answer": "John Doe"
}
```

**Response (Next Question):**
```json
{
  "session_id": "uuid",
  "question": {
    "question_id": "q_age",
    "text": "What is your age?",
    "type": "single_choice",
    "is_compulsory": false,
    "options": ["under_18", "18_25", "26_35", ...]
  },
  "current_question": 2,
  "total_questions": 27,
  "status": "in_progress"
}
```

**Response (Completed):**
```json
{
  "session_id": "uuid",
  "status": "completed",
  "message": "Assessment complete. Request /assessment/report"
}
```

### 3. Generate Medical Report
```http
POST /assessment/report
```

**Request Body:**
```json
{
  "session_id": "uuid"
}
```

**Response:**
```json
{
  "report_id": "uuid",
  "assessment_topic": "headache",
  "generated_at": "2026-02-17T10:30:00Z",
  "patient_info": {
    "name": "John Doe",
    "age": 30,
    "gender": "male"
  },
  "summary": [
    "Patient reports persistent headache for 3 days",
    "Pain rated 7/10, worsening pattern",
    "No significant medical history"
  ],
  "possible_causes": [
    {
      "id": "tension_headache",
      "title": "Tension Headache",
      "short_description": "Can usually be managed at home",
      "subtitle": "Often linked to stress",
      "severity": "mild",
      "probability": 0.6,
      "detail": {
        "about_this": [
          "Tension headaches are the most common type of headache",
          "Usually caused by muscle tension in the head and neck",
          "Often triggered by stress, poor posture, or fatigue"
        ],
        "how_common": {
          "percentage": 60,
          "description": "6 out of 10 people with similar symptoms"
        },
        "what_you_can_do_now": [
          "Take over-the-counter pain relievers (ibuprofen, acetaminophen)",
          "Apply warm compress to neck and shoulders",
          "Practice relaxation techniques or meditation",
          "Ensure proper hydration"
        ],
        "warning": "Seek immediate care if headache is sudden and severe"
      }
    }
  ],
  "advice": [
    "Monitor symptoms for next 24-48 hours",
    "Stay well hydrated",
    "Get adequate rest",
    "Consult doctor if symptoms worsen"
  ],
  "urgency_level": "green_home_care"  // or "yellow_doctor_visit" or "red_emergency"
}
```

## 📂 Project Structure

```
healthcare-chatbot/
├── .env                          # Environment variables (API keys)
├── requirements.txt              # Python dependencies
├── app/
│   ├── main.py                  # FastAPI application & endpoints
│   ├── core/
│   │   ├── llm_client.py        # Cerebras LLM integration
│   │   ├── llm_prompt.py        # LLM prompt templates
│   │   ├── guidance_engine.py   # Symptom matching & guidance
│   │   └── medical_schema.py    # Medical data schema builder
│   └── data/
│       ├── questionnaire.json   # 25+ questions with is_compulsory
│       ├── decision_tree.json   # Symptom-based follow-ups
│       └── guidance_rules.json  # Medical guidance rules
└── config/
    └── settings.py              # Configuration loader
```

## 🔑 Key Features Explained

### is_compulsory Field
- Questions marked `is_compulsory: true` must be answered every session (symptom-related)
- Questions marked `is_compulsory: false` can be auto-populated from user profile (demographics, medical history)
- This enables apps to optimize UX by pre-filling non-critical data

**Compulsory Questions (7):**
- Current ailment/symptoms
- Symptom onset & duration
- Severity & pattern
- Associated symptoms
- Pain location

**Non-Compulsory Questions (18):**
- Name, age, gender
- Medical history
- Medications & allergies
- Lifestyle factors

### Conditional Questions
Female patients receive 2 additional questions:
- Pregnancy status
- Menstrual cycle regularity

### Symptom Detection & Follow-ups
System automatically detects symptoms from "current ailment" answer and triggers relevant follow-up questions based on decision tree:
- **Fever**: Temperature, chills, duration, etc.
- **Chest Pain**: Location, radiation, breathing impact, etc.
- **Headache**: Type, location, triggers, etc.

### AI Medical Reports
Generated using Cerebras LLM with:
- Structured nested format matching app UI requirements
- Patient demographics extraction
- Evidence-based differential diagnoses
- Actionable self-care advice
- Urgency classification (red/yellow/green)

## 🔧 Configuration

### Environment Variables (.env)
```env
CEREBRAS_API_KEY=your_api_key_here
```

### Cerebras LLM Settings
- **Model**: `llama3.1-8b`
- **Temperature**: `0.3` (balanced between accuracy and creativity)
- **Max Tokens**: `1500`
- **Response Format**: JSON

## 🧪 Testing

Test the API using the interactive documentation:
```
http://localhost:8000/docs
```

Or use curl:
```bash
# Start assessment
curl http://localhost:8000/assessment/start

# Submit answer
curl -X POST http://localhost:8000/assessment/answer \
  -H "Content-Type: application/json" \
  -d '{"session_id": "your-session-id", "question_id": "q_name", "answer": "John"}'

# Generate report
curl -X POST http://localhost:8000/assessment/report \
  -H "Content-Type: application/json" \
  -d '{"session_id": "your-session-id"}'
```

## 🔐 Security Notes

- Never commit `.env` file to version control
- Keep Cerebras API key confidential
- Use environment variables for all sensitive data
- Implement rate limiting in production
- Add authentication/authorization for production use

## 🚧 Roadmap

- [ ] Add database persistence (currently in-memory)
- [ ] Implement user authentication
- [ ] Add more symptoms to decision tree
- [ ] Multi-language support
- [ ] Medical report PDF generation
- [ ] Integration with EHR systems

## 📝 License

This project is for educational/demonstration purposes.

## 👥 Contributors

- Pratyush Sowrirajan ([@PratyushSowrirajan](https://github.com/PratyushSowrirajan))

## 🆘 Support

For issues, questions, or contributions, please open an issue on GitHub.

## ⚠️ Medical Disclaimer

This chatbot is for informational purposes only and does not provide medical advice, diagnosis, or treatment. Always consult with qualified healthcare professionals for medical decisions.

---

**Built with ❤️ using FastAPI and Cerebras AI**
