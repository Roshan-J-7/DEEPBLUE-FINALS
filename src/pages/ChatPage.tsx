import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Send, Loader2, X, LogIn } from 'lucide-react'
import { api } from '../api/api'
import { tokenStore } from '../store/healthStore'

interface Bubble { role: 'user' | 'assistant'; text: string }

export default function ChatPage() {
  const navigate  = useNavigate()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [bubbles,   setBubbles]   = useState<Bubble[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(true)
  const [sending,   setSending]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [ended,     setEnded]     = useState(false)

  // ── Auth guard ────────────────────────────────────────────
  useEffect(() => {
    if (!tokenStore.isLoggedIn()) {
      sessionStorage.setItem('auth_return_to', '/chat')
      navigate('/auth', { replace: true })
    }
  }, [navigate])

  // ── Start session ─────────────────────────────────────────
  useEffect(() => {
    if (!tokenStore.isLoggedIn()) return
    let cancelled = false
    ;(async () => {
      try {
        const main_report_id = sessionStorage.getItem('chat_current_report_id') || null
        const entry_point    = main_report_id ? 'assessment' : 'home'

        const res = await api.chat.start({ entry_point, main_report_id })
        if (cancelled) return

        setSessionId(res.session_id)
        const welcome = res.message ?? "Hi, I'm Remy. How can I help you today?"
        setBubbles([{ role: 'assistant', text: welcome }])
      } catch (e) {
        if (!cancelled) {
          const msg = (e as Error).message
          if (msg.includes('401')) {
            // Token expired — clear and redirect to auth
            tokenStore.clear()
            sessionStorage.setItem('auth_return_to', '/chat')
            navigate('/auth', { replace: true })
          } else {
            setError('Could not connect to Remy. Please try again.')
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [navigate])

  // ── Auto-scroll ───────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [bubbles, sending])

  // ── Send ──────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || !sessionId || sending || ended) return

    setBubbles(prev => [...prev, { role: 'user', text }])
    setInput('')
    setSending(true)

    try {
      const res = await api.chat.message({ session_id: sessionId, message: text })
      setBubbles(prev => [...prev, { role: 'assistant', text: res.message }])
    } catch {
      setBubbles(prev => [...prev, { role: 'assistant', text: 'Sorry, I ran into an error. Please try again.' }])
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, sessionId, sending, ended])

  // ── End ───────────────────────────────────────────────────
  async function handleEnd() {
    setEnded(true)
    if (sessionId) { try { await api.chat.end(sessionId) } catch { /* ignore */ } }
    sessionStorage.removeItem('chat_profile_data')
    sessionStorage.removeItem('chat_reports')
    sessionStorage.removeItem('chat_current_report_id')
    navigate('/')
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Top bar */}
      <header className="topbar flex-shrink-0">
        <button onClick={() => navigate(-1)} className="btn-ghost py-2 px-3 text-sm">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex flex-col items-center">
          <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>Remy AI</p>
          <p className="text-xs" style={{ color: 'var(--brand)' }}>AI Health Advisor</p>
        </div>

        <button
          onClick={handleEnd}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40"
          style={{ background: '#FFF0F0', color: '#B71C1C' }}
          disabled={ended}
          title="End chat"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">

        {loading && (
          <div className="flex justify-center items-center h-32 gap-3" style={{ color: 'var(--hint)' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Connecting to Remy...</span>
          </div>
        )}

        {error && (
          <div className="card border" style={{ borderColor: '#FFCDD2', background: '#FFF0F0', color: '#B71C1C' }}>
            <p className="text-sm">{error}</p>
            <div className="flex gap-3 mt-2">
              <button onClick={() => window.location.reload()} className="text-sm underline font-medium">
                Retry
              </button>
              <button
                onClick={() => { sessionStorage.setItem('auth_return_to', '/chat'); navigate('/auth') }}
                className="text-sm underline font-medium flex items-center gap-1"
              >
                <LogIn className="w-3.5 h-3.5" /> Log in
              </button>
            </div>
          </div>
        )}

        {bubbles.map((b, i) => (
          <div key={i} className={`flex gap-3 ${b.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
              style={{
                background: b.role === 'assistant'
                  ? 'linear-gradient(135deg, var(--grad-start), var(--grad-end))'
                  : '#CBD5E1',
              }}
            >
              {b.role === 'assistant' ? 'R' : 'U'}
            </div>

            {/* Bubble */}
            <div
              className="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
              style={
                b.role === 'user'
                  ? {
                      background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))',
                      color: '#fff',
                      borderTopRightRadius: '4px',
                    }
                  : {
                      background: '#F2F4F8',
                      color: 'var(--navy)',
                      borderTopLeftRadius: '4px',
                    }
              }
            >
              {b.text.split('\n').map((line, j, arr) => (
                <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex gap-3 items-end">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))' }}
            >
              R
            </div>
            <div
              className="rounded-2xl rounded-tl-[4px] px-4 py-3"
              style={{ background: '#F2F4F8' }}
            >
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: 'var(--blue-mid)', animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex-shrink-0 px-4 py-3 flex gap-3 items-center bg-white"
        style={{ borderTop: '1px solid var(--border)', boxShadow: '0 -2px 12px rgba(15,40,84,0.06)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={loading ? 'Connecting...' : 'Ask Remy anything...'}
          disabled={loading || !!error || ended}
          className="input-field flex-1"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading || !!error || sending || ended}
          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))' }}
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>


    </div>
  )
}
