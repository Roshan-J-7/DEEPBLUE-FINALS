# 🤖 AI Voice Agent — Phone Call Interface for LLM

A Node.js application that lets you have real-time voice conversations with an AI over a phone call. The system uses **Twilio** for telephony, **Cerebras** for ultra-fast LLM inference, and **Twilio's built-in Polly voices** for multilingual text-to-speech. Supports **English, Hindi, and Marathi**.

---

## 📐 Architecture

```
┌──────────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────────┐
│  Your Phone  │◄──►│   Twilio     │◄──►│  Express     │◄──►│  Cerebras  │
│  (caller)    │    │  (telephony) │    │  Server      │    │  LLM API   │
└──────────────┘    └─────────────┘    └──────────────┘    └────────────┘
                         │                    │
                         │                    ▼
                         │              ┌──────────────┐
                         └──────────────│  ngrok       │
                                        │  (tunnel)    │
                                        └──────────────┘
```

**Call flow:**
1. Server triggers an outbound call via Twilio to your phone
2. You pick up → hear an intro message → press any key to continue
3. Language menu: press 1 (English), 2 (Hindi), or 3 (Marathi)
4. You speak → Twilio transcribes (STT) → sends text to Cerebras LLM → AI response is spoken back (TTS)
5. Conversation loops until you hang up

---

## 📁 Project Structure

```
call_function/
├── .env                        # Your API keys (NOT committed to git)
├── .env.example                # Template for environment variables
├── .gitignore
├── package.json
├── src/
│   ├── index.js                # Express server + WebSocket setup
│   ├── test.js                 # Component tests
│   ├── routes/
│   │   └── twilio.js           # All call flow endpoints (TwiML)
│   └── services/
│       ├── cerebras.js         # Cerebras LLM client (OpenAI-compatible)
│       ├── googleCloud.js      # Google Cloud STT/TTS + language configs
│       ├── deepgram.js         # Deepgram STT (optional, not active)
│       ├── elevenlabs.js       # ElevenLabs TTS (optional, not active)
│       └── mediaStream.js      # WebSocket media stream handler
```

---

## 🛠 Requirements & Setup

### System Requirements

| Component | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | v18.0.0 or higher | Runtime for ES Modules |
| **npm** | v8.0.0 or higher | Package manager |
| **macOS/Linux/Windows** | Any OS | Platform (tested on macOS) |
| **ngrok** | Latest | Expose localhost to internet for Twilio webhooks |

#### Verify Installation

```bash
node --version     # Should be v18.0.0+
npm --version      # Should be v8.0.0+
npm ls --depth=0   # Lists all installed packages
```

#### Install Node.js

- **macOS (Homebrew):**
  ```bash
  brew install node
  ```
- **Linux (Ubuntu/Debian):**
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- **Windows:**
  Download from [nodejs.org](https://nodejs.org/) and run installer

#### Install ngrok

- **macOS (Homebrew):**
  ```bash
  brew install ngrok
  ngrok config add-authtoken YOUR_TOKEN  # Get token from ngrok.com
  ```
- **Other OS:**
  Download from [ngrok.com](https://ngrok.com) → authenticate → run

### API Keys Required

| Service | Purpose | Signup Link | Estimated Cost |
|---------|---------|-------------|-----------------|
| **Cerebras** | LLM inference (llama3.1-8b model) | [cloud.cerebras.ai](https://cloud.cerebras.ai/) | Free tier available (~$1 per million tokens) |
| **Twilio** | Outbound calls, Gather speech, TTS | [console.twilio.com](https://console.twilio.com/) | ~$0.02/min (US), ~$0.04/min (international) |
| **Google Cloud** | Language config library (STT/TTS reference) | [console.cloud.google.com](https://console.cloud.google.com/) | Free tier includes $300 credit |

### npm Packages — Full Dependency List

All installed automatically when you run `npm install`:

**Production Dependencies:**

| Package | Version | Size | Purpose |
|---------|---------|------|---------|
| `express` | ^4.18.2 | 51 KB | HTTP server, routing, TwiML responses |
| `twilio` | ^4.20.0 | 3.2 MB | Twilio Voice SDK for TwiML, REST API, telephony |
| `openai` | ^4.28.0 | 542 KB | OpenAI-compatible client for Cerebras API |
| `ws` | ^8.16.0 | 77 KB | WebSocket server for real-time media streaming |
| `dotenv` | ^16.4.4 | 13 KB | Load environment variables from `.env` file |
| `axios` | ^1.6.7 | 199 KB | HTTP client for REST API calls |
| `uuid` | ^9.0.1 | 16 KB | Generate unique identifiers for call tracking |
| `@google-cloud/speech` | ^7.3.0 | 297 KB | Google Cloud Speech-to-Text library (language configs) |
| `@google-cloud/text-to-speech` | ^6.4.0 | 228 KB | Google Cloud Text-to-Speech library (language configs) |
| `@deepgram/sdk` | ^3.2.0 | 89 KB | Deepgram STT SDK (optional, not active in current flow) |

**Development Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `nodemon` | ^3.0.3 | Auto-restart server during development (run with `npm run dev`) |

**Package Lock:**

```bash
npm ci  # Uses package-lock.json for exact versions (recommended for production)
```

### Recommended VS Code Extensions

For an optimal development experience, install these extensions:

| Extension | Publisher | Purpose |
|-----------|-----------|---------|
| **ES7+ React/Redux/React-Native snippets** | dsznajder.es7-react-js-snippets | JS/Node snippets |
| **Prettier** | esbenp.prettier-vscode | Code formatting |
| **ESLint** | dbaeumer.vscode-eslint | JavaScript linting |
| **Thunder Client** or **REST Client** | rangav.vscode-thunder-client OR humao.rest-client | API testing (call endpoints) |
| **Twilio CLI** (optional) | Twilio | Twilio CLI integration |
| **Error Lens** | usernamehw.errorlens | Inline error messages |

**Install from VS Code Extensions Marketplace** or via CLI:

```bash
code --install-extension dsznajder.es7-react-js-snippets
code --install-extension esbenp.prettier-vscode
code --install-extension dbaeumer.vscode-eslint
code --install-extension humao.rest-client
```

### Detailed Environment Variables (`.env`)

Create `.env` in the root directory (copy from `.env.example`):

```dotenv
# ===== Cerebras LLM API =====
CEREBRAS_API_KEY=csk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Get from: https://cloud.cerebras.ai/api-keys
# Format: csk-[alphanumeric]
# Used: Cerebras LLM API calls (llama3.1-8b model)

# ===== Twilio Telephony =====
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
# Get from: https://console.twilio.com/
# Verify personal phone number at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified
# Trial accounts: can only call verified numbers, limited to $15.50 credit

# ===== Google Cloud STT/TTS (Language Config) =====
GOOGLE_CLOUD_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Get from: https://console.cloud.google.com/apis/credentials
# Used: Language configuration reference (optional, for STT/TTS language codes)

# ===== ngrok Tunnel =====
NGROK_URL=https://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.ngrok-free.dev
# Get from: Run 'ngrok http 3000' in a separate terminal
# Copy the HTTPS URL shown, e.g., https://1234-56-789-012.ngrok-free.dev
# Used: Webhook callbacks to Twilio (TwiML responses, status updates)

# ===== LLM Configuration =====
AI_MODEL=llama3.1-8b
# Options: llama3.1-8b (default), qwen-3-235b-a22b-instruct-2507, gpt-oss-120b
# Default: llama3.1-8b (~500ms response time, good for conversation)

# ===== Server =====
PORT=3000
# Server runs on http://localhost:3000 (ngrok exposes to https://)
```

---

## 🚀 Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/Barathiraja168/callFunction.git
cd callFunction
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your API keys:

```dotenv
CEREBRAS_API_KEY=csk-xxxxx              # From cloud.cerebras.ai
TWILIO_ACCOUNT_SID=ACxxxxx             # From console.twilio.com dashboard
TWILIO_AUTH_TOKEN=xxxxx                # From console.twilio.com dashboard
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX       # Your Twilio phone number
GOOGLE_CLOUD_API_KEY=AIzaXXXXX         # From console.cloud.google.com
NGROK_URL=https://xxxx.ngrok-free.dev  # Your ngrok URL (set after step 4)
```

### 4. Start ngrok tunnel

In a **separate terminal**:

```bash
ngrok http 3000
```

Copy the `https://xxxx.ngrok-free.dev` URL and paste it into `.env` as `NGROK_URL`.

### 5. Start the server

```bash
npm start
```

You should see:

```
[Google Cloud] 3 languages supported
🤖 AI Voice Agent Server Started
📍 Server: http://0.0.0.0:3000
```

### 6. Make a call

```bash
curl -X POST http://localhost:3000/api/twilio/make-call \
  -H "Content-Type: application/json" \
  -d '{"to": "+91XXXXXXXXXX"}'
```

Replace `+91XXXXXXXXXX` with your verified phone number. Your phone will ring!

> ⚠️ **Twilio Trial accounts** can only call numbers that are verified in your Twilio console.
> Go to [Verified Caller IDs](https://console.twilio.com/us1/develop/phone-numbers/manage/verified) to add your number.

---

## 📞 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Server info and available endpoints |
| `GET` | `/health` | Health check — shows which services are configured |
| `GET` | `/api/twilio/languages` | List supported languages and dial keys |
| `POST` | `/api/twilio/make-call` | **Trigger outbound call.** Body: `{"to": "+91XXXXXXXXXX"}` |
| `POST` | `/api/twilio/simple-call` | Twilio webhook — call entry point (intro + press any key) |
| `POST` | `/api/twilio/language-menu` | Twilio webhook — language selection menu |
| `POST` | `/api/twilio/select-language` | Twilio webhook — sets language, greets user |
| `POST` | `/api/twilio/gather-speech` | Twilio webhook — speech → LLM → response loop |
| `POST` | `/api/twilio/status` | Twilio status callback — cleanup on call end |

---

## 🌐 Supported Languages

| Key | Language | Twilio Voice | STT Language Code |
|-----|----------|-------------|-------------------|
| 1 | English | Polly.Joanna | en-US |
| 2 | Hindi (हिंदी) | Polly.Aditi | hi-IN |
| 3 | Marathi (मराठी) | Polly.Aditi | mr-IN |

The Cerebras LLM is instructed to respond in the selected language via the system prompt.

---

## 🔧 How It Works — Detailed Call Flow

```
[User picks up phone]
        │
        ▼
  STEP 1: /simple-call
  "Welcome to AI Assistant, powered by premium artificial intelligence..."
  "Press any key to continue."
        │  (user presses any DTMF key)
        ▼
  STEP 2: /language-menu
  "Press 1 for English."
  "हिंदी के लिए 2 दबाएं।"
  "मराठी साठी 3 दाबा."
        │  (user presses 1, 2, or 3)
        ▼
  STEP 3: /select-language
  Sets language for the call, updates Cerebras system prompt,
  greets user in chosen language
        │
        ▼
  STEP 4: /gather-speech  ◄────────────────────────┐
  Twilio listens for speech (STT via Gather)        │
        │                                           │
        ▼                                           │
  Speech text sent to Cerebras LLM                  │
  → AI generates response (~500-800ms)              │
        │                                           │
        ▼                                           │
  Twilio speaks AI response (TTS via Polly voice)   │
        │                                           │
        └───────────────────────────────────────────┘
                  (loops until user hangs up)
```

### Key Design Decisions

- **Outbound calls only** — Twilio trial accounts cannot receive international inbound calls. The server initiates calls to verified numbers via the REST API.
- **Twilio-native STT/TTS** — Uses Twilio's `<Gather input="speech">` for speech recognition and `<Say voice="Polly.X">` for text-to-speech. No extra API round-trips to external STT/TTS providers.
- **Cerebras for speed** — Cerebras inference runs at ~500-800ms, making phone conversations feel natural and responsive.
- **Per-call conversation memory** — Each call has its own conversation history (up to 10 exchanges), tracked by Twilio's `CallSid`. Cleaned up automatically when the call ends.
- **Graceful error handling** — Undefined/empty speech results are caught and handled to prevent crash loops (a fix for a real bug encountered during development).

---

## 🔑 Getting API Keys

### Cerebras
1. Go to [cloud.cerebras.ai](https://cloud.cerebras.ai/)
2. Sign up / log in
3. Navigate to **API Keys** → Create new key
4. Copy the key (starts with `csk-`)

### Twilio
1. Go to [console.twilio.com](https://console.twilio.com/)
2. Sign up (free trial gives ~$15 credit)
3. Get a phone number (US number)
4. Copy **Account SID** and **Auth Token** from the dashboard
5. **Important:** Verify your personal phone number at [Verified Caller IDs](https://console.twilio.com/us1/develop/phone-numbers/manage/verified)

### Google Cloud
1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Enable **Cloud Speech-to-Text API** and **Cloud Text-to-Speech API**
3. Create an API key under **APIs & Services → Credentials**

### ngrok
1. Go to [ngrok.com](https://ngrok.com) and sign up (free)
2. Install: `brew install ngrok` (macOS) or download from the website
3. Authenticate: `ngrok config add-authtoken YOUR_TOKEN`
4. Run: `ngrok http 3000`

---

## ⚠️ Twilio Trial Account Limitations

| Limitation | Detail |
|-----------|--------|
| Outbound only | Can only call numbers verified in your Twilio console |
| Trial announcement | Every call starts with a Twilio trial message |
| Credit | ~$15.50 starting credit |
| Cost | ~$0.02/min (US) or ~$0.04/min (international) |

To remove these limitations, upgrade to a paid Twilio account ($20 minimum).

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| `EADDRINUSE: address already in use` | Run `lsof -ti:3000 \| xargs kill -9` then restart |
| `SpeechResult is undefined` loop | Already fixed in code — catches empty speech and re-prompts |
| Twilio says "number not in use" | Use outbound calls via `/make-call`, don't try calling the Twilio number from abroad |
| 422 error from Cerebras | Ensure model name is `llama3.1-8b` (not `llama-3.3-70b`) in `.env` |
| ngrok tunnel not working | Make sure ngrok is running, points to port 3000, and `NGROK_URL` in `.env` matches the current ngrok URL |
| Call drops after intro | Verify ngrok is running and the URL hasn't changed |
| No speech detected | Check that `speechModel: 'default'` is set — this enables broader language support in Twilio's Gather |

---

## 📝 Available Cerebras Models

| Model | Description |
|-------|-------------|
| `llama3.1-8b` | Default — fast, good for conversation (~500ms) |
| `qwen-3-235b-a22b-instruct-2507` | Large model, higher quality, slower |
| `gpt-oss-120b` | Large open-source model |

Change the model in `.env` via `AI_MODEL=your_model_name`.

---

## 📄 License

MIT
