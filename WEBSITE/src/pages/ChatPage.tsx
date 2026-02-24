import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2, Heart, RefreshCw } from 'lucide-react'
import { api } from '../api/api'
import type { ChatMessage, ProfileEntry } from '../types/api.types'

interface ChatState {
  sessionId: string
  messages: ChatMessage[]
  isTyping: boolean
  ready: boolean
  error: string
}

// ─── Typing indicator ─────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-100 rounded-2xl rounded-tl-sm w-fit">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  )
}

// ─── Single chat bubble ───────────────────────────────────────
function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-sky-500 flex items-center justify-center flex-shrink-0 mr-2 mt-auto mb-1 text-white text-xs font-bold">
          R
        </div>
      )}
      <div
        className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words
          ${isUser
            ? 'bg-gradient-to-br from-teal-600 to-sky-600 text-white rounded-br-sm'
            : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm'
          }`}
      >
        {msg.content}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
export default function ChatPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<ChatState>({
    sessionId: '',
    messages: [],
    isTyping: false,
    ready: false,
    error: '',
  })
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.messages, state.isTyping])

  useEffect(() => {
    if (state.ready) inputRef.current?.focus()
  }, [state.ready])

  // Start chat on mount
  const initChat = useCallback(async () => {
    setState(s => ({ ...s, ready: false, error: '', messages: [] }))

    const profileRaw = sessionStorage.getItem('chat_profile_data')
    const reportRaw = sessionStorage.getItem('chat_report')

    const profileData: ProfileEntry[] = profileRaw ? JSON.parse(profileRaw) : []
    const reports = reportRaw ? [JSON.parse(reportRaw)] : []

    try {
      const res = await api.chat.start({ profile_data: profileData, reports })
      setState(s => ({
        ...s,
        sessionId: res.session_id,
        messages: [{ role: 'assistant', content: res.message }],
        ready: true,
      }))
    } catch (e) {
      setState(s => ({
        ...s,
        error: `Could not connect to Remy: ${(e as Error).message}`,
        ready: false,
      }))
    }
  }, [])

  useEffect(() => { initChat() }, [initChat])

  async function sendMessage() {
    const text = inputText.trim()
    if (!text || state.isTyping || !state.sessionId) return
    setInputText('')

    const userMsg: ChatMessage = { role: 'user', content: text }
    const newHistory: ChatMessage[] = [...state.messages, userMsg]

    setState(s => ({ ...s, messages: newHistory, isTyping: true }))

    try {
      const res = await api.chat.message({
        session_id: state.sessionId,
        history: newHistory,
      })
      setState(s => ({
        ...s,
        messages: [...newHistory, { role: 'assistant', content: res.message }],
        isTyping: false,
      }))
    } catch (e) {
      setState(s => ({
        ...s,
        messages: [...newHistory, {
          role: 'assistant',
          content: "I'm sorry, I encountered an issue. Please try again.",
        }],
        isTyping: false,
        error: '',
      }))
    }
  }

  async function handleEndChat() {
    if (state.sessionId) {
      try { await api.chat.end(state.sessionId) } catch (_) { /* ignore */ }
    }
    navigate('/report')
  }

  // ─── Loading state ─────────────────────────────────────────
  if (!state.ready && !state.error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-sky-500 flex items-center justify-center shadow-lg">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-slate-700">Connecting to Remy…</h2>
            <p className="text-slate-400 mt-1 text-sm">Your AI health assistant is loading your reports</p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Error state ────────────────────────────────────────────
  if (state.error && !state.ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="card max-w-md w-full text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-semibold text-slate-700">Connection Failed</h2>
          <p className="text-slate-500 text-sm">{state.error}</p>
          <div className="flex gap-3">
            <button onClick={() => navigate('/report')} className="btn-secondary flex-1">View Report</button>
            <button onClick={initChat} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Chat UI ───────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={handleEndChat} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Report</span>
          </button>

          {/* Remy avatar */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-sky-500 flex items-center justify-center text-white text-xs font-bold">
              R
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-700">Remy</div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-xs text-slate-400">AI Health Assistant</span>
              </div>
            </div>
          </div>

          <Heart className="w-4 h-4 text-teal-400" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {/* Intro notice */}
        <div className="text-center">
          <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
            Remy has been briefed on your health assessment
          </span>
        </div>

        {state.messages.map((msg, i) => (
          <Bubble key={i} msg={msg} />
        ))}

        {state.isTyping && (
          <div className="flex justify-start animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-sky-500 flex items-center justify-center flex-shrink-0 mr-2 mt-auto mb-1 text-white text-xs font-bold">
              R
            </div>
            <TypingDots />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Disclaimer */}
      <div className="px-4 pb-1">
        <p className="text-center text-xs text-slate-300">
          AI responses are for information only. Consult a doctor for medical decisions.
        </p>
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask Remy anything about your health…"
            className="flex-1 bg-slate-100 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-300 transition-all"
            disabled={state.isTyping}
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || state.isTyping}
            className="w-11 h-11 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
          >
            {state.isTyping
              ? <Loader2 className="w-5 h-5 text-white animate-spin" />
              : <Send className="w-5 h-5 text-white" />
            }
          </button>
        </div>
      </div>
    </div>
  )
}
