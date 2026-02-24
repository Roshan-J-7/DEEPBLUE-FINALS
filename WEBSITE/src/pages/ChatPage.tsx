import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Bot, User, Loader2, MessageCircle, Home } from 'lucide-react'
import { api } from '../api/api'
import type { ChatMessage } from '../types/api.types'

// ─── Types ────────────────────────────────────────────────────
interface Bubble {
  role: 'user' | 'assistant'
  text: string
}

// ─── Main ─────────────────────────────────────────────────────
export default function ChatPage() {
  const navigate = useNavigate()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  const [sessionId, setSessionId]   = useState<string | null>(null)
  const [bubbles,   setBubbles]     = useState<Bubble[]>([])
  const [history,   setHistory]     = useState<ChatMessage[]>([])
  const [input,     setInput]       = useState('')
  const [loading,   setLoading]     = useState(true) // starting session
  const [sending,   setSending]     = useState(false)
  const [error,     setError]       = useState<string | null>(null)
  const [ended,     setEnded]       = useState(false)

  // ── Start session once ────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function startSession() {
      try {
        // Read chat context built by ReportPage (via buildChatContext)
        const profileRaw  = sessionStorage.getItem('chat_profile_data')
        const reportsRaw  = sessionStorage.getItem('chat_reports')

        // Fallback: empty context (user navigated here directly)
        const profile_data = profileRaw  ? JSON.parse(profileRaw)  : []
        const reports      = reportsRaw  ? JSON.parse(reportsRaw)  : []

        const res = await api.chat.start({ profile_data, reports })
        if (cancelled) return

        setSessionId(res.session_id)

        const welcomeText = res.message ?? "Hi! I'm Remy. How can I help you today?"
        setBubbles([{ role: 'assistant', text: welcomeText }])

        const initHistory: ChatMessage[] = [{ role: 'assistant', content: welcomeText }]
        setHistory(initHistory)
      } catch (e) {
        if (!cancelled) setError('Could not start chat session. Please try again.')
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    startSession()
    return () => { cancelled = true }
  }, [])

  // ── Auto-scroll ───────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [bubbles, sending])

  // ── Send message ──────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || !sessionId || sending) return

    const userBubble: Bubble        = { role: 'user',      text }
    const userMsg:    ChatMessage    = { role: 'user',      content: text }

    setBubbles(prev => [...prev, userBubble])
    const newHistory = [...history, userMsg]
    setHistory(newHistory)
    setInput('')
    setSending(true)

    try {
      const res = await api.chat.message({ session_id: sessionId, history: newHistory })
      const replyBubble: Bubble   = { role: 'assistant', text: res.message }
      const replyMsg:    ChatMessage = { role: 'assistant', content: res.message }

      setBubbles(prev => [...prev, replyBubble])
      setHistory(prev => [...prev, replyMsg])
    } catch (e) {
      const errBubble: Bubble = { role: 'assistant', text: 'Sorry, I ran into an error. Please try again.' }
      setBubbles(prev => [...prev, errBubble])
      console.error(e)
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, sessionId, sending, history])

  // ── End chat ──────────────────────────────────────────────
  async function handleEnd() {
    setEnded(true)
    if (sessionId) {
      try { await api.chat.end(sessionId) } catch { /* best-effort */ }
    }
    // Clean up chat session storage
    sessionStorage.removeItem('chat_profile_data')
    sessionStorage.removeItem('chat_reports')
    sessionStorage.removeItem('chat_current_report_id')
    navigate('/')
  }

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white/80 backdrop-blur-sm shadow-sm flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-700 leading-tight">Remy</div>
            <div className="text-xs text-teal-500">AI Medical Advisor</div>
          </div>
        </div>

        <button
          onClick={handleEnd}
          disabled={ended}
          className="flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
          title="End chat & go home"
        >
          <Home className="w-4 h-4" />
          <span className="text-sm">End</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50">
        {/* Loading state */}
        {loading && (
          <div className="flex justify-center items-center h-32 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Connecting to Remy…</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="card border-red-200 bg-red-50 text-red-700 text-sm">
            {error}
            <button
              onClick={() => window.location.reload()}
              className="block mt-2 text-red-600 underline font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Chat bubbles */}
        {bubbles.map((b, i) => (
          <div key={i} className={`flex gap-3 ${b.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
              ${b.role === 'assistant'
                ? 'bg-gradient-to-br from-teal-400 to-sky-500'
                : 'bg-gradient-to-br from-slate-300 to-slate-400'}`}
            >
              {b.role === 'assistant'
                ? <Bot  className="w-4 h-4 text-white" />
                : <User className="w-4 h-4 text-white" />}
            </div>

            {/* Bubble */}
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm
              ${b.role === 'assistant'
                ? 'bg-white text-slate-700 rounded-tl-none'
                : 'bg-gradient-to-br from-teal-500 to-sky-500 text-white rounded-tr-none'}`}
            >
              {b.text.split('\n').map((line, j) => (
                <span key={j}>{line}{j < b.text.split('\n').length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex gap-3 items-end">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-teal-400 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-slate-100 bg-white flex gap-3 items-center">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={loading ? 'Connecting…' : 'Ask Remy anything…'}
          disabled={loading || !!error || ended}
          className="flex-1 input-field"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading || !!error || sending || ended}
          className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-sky-500 text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 active:scale-95 flex-shrink-0"
        >
          {sending
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <Send className="w-5 h-5" />}
        </button>
      </div>

      {/* Disclaimer */}
      <div className="text-center text-xs text-slate-400 py-2 bg-white flex-shrink-0 flex items-center justify-center gap-1">
        <MessageCircle className="w-3 h-3" />
        Powered by llama3.1-8b · Not a substitute for professional medical advice
      </div>
    </div>
  )
}
