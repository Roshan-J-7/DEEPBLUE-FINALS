import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Send, Loader2, X, LogIn, Mic, MicOff, Volume2, VolumeX, Globe } from 'lucide-react'
import { api } from '../api/api'
import { tokenStore, languageStore } from '../store/healthStore'
import { LANGUAGES, langLabel, speechCode, translate } from '../utils/translate'
import { useT } from '../i18n/useT'

interface Bubble { role: 'user' | 'assistant'; text: string }

// ── Speech helpers ─────────────────────────────────────────────
/** Speak text using the BCP-47 speech code for the selected language */
function speakText(text: string, bcp47: string) {
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = bcp47
  utter.rate = 1
  utter.pitch = 1.1
  const doSpeak = () => {
    const voices = window.speechSynthesis.getVoices()
    const prefix = bcp47.split('-')[0]
    utter.voice =
      voices.find(v => v.lang === bcp47) ??
      voices.find(v => v.lang.startsWith(prefix)) ??
      null
    window.speechSynthesis.speak(utter)
  }
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true })
  } else {
    doSpeak()
  }
}

export default function ChatPage() {
  const navigate  = useNavigate()
  const t = useT()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [bubbles,   setBubbles]   = useState<Bubble[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(true)
  const [sending,   setSending]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [ended,       setEnded]       = useState(false)
  const [isListening,  setIsListening]  = useState(false)
  const [ttsEnabled,   setTtsEnabled]   = useState(false)
  const [currentLang,  setCurrentLang]  = useState(languageStore.get())
  const [langOpen,     setLangOpen]     = useState(false)

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
        const rawWelcome = res.message ?? "Hi, I'm Remy. How can I help you today?"
        const lang = languageStore.get()
        const welcome = lang !== 'en' ? await translate(rawWelcome, 'en', lang) : rawWelcome
        setBubbles([{ role: 'assistant', text: welcome }])
        if (ttsEnabled) speakText(welcome, speechCode(lang))
        // Handle suggestion chip prefill from HomePage
        const prefill = sessionStorage.getItem('chat_prefill')
        if (prefill) {
          sessionStorage.removeItem('chat_prefill')
          setInput(prefill)
        }
      } catch (e) {
        if (!cancelled) {
          const msg = (e as Error).message
          if (msg.includes('401')) {
            // Token expired — clear and redirect to auth
            tokenStore.clear()
            sessionStorage.setItem('auth_return_to', '/chat')
            navigate('/auth', { replace: true })
          } else {
            setError(t('couldNotConnect'))
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
      // Translate user message to English before sending to backend
      const msgForBackend = currentLang !== 'en' ? await translate(text, currentLang, 'en') : text
      const res = await api.chat.message({ session_id: sessionId, message: msgForBackend })
      // Translate bot reply back to the selected language
      const botReply = currentLang !== 'en' ? await translate(res.message, 'en', currentLang) : res.message
      setBubbles(prev => [...prev, { role: 'assistant', text: botReply }])
      if (ttsEnabled) speakText(botReply, speechCode(currentLang))
    } catch {
      setBubbles(prev => [...prev, { role: 'assistant', text: t('sorryError') }])
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
    navigate('/home')
  }

  // ── Language change ──────────────────────────────────────────
  function handleLangChange(code: string) {
    setCurrentLang(code)
    languageStore.set(code)
    setLangOpen(false)
    window.speechSynthesis.cancel()
  }

  // ── Voice input ───────────────────────────────────────────────
  function startListening() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert(t('speechNotSupported')); return }
    window.speechSynthesis.cancel()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any
    recognition.lang = speechCode(currentLang)  // BCP-47 for STT
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    setIsListening(true)
    recognition.start()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript as string
      setInput(text)
      setIsListening(false)
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend   = () => setIsListening(false)
  }

  // ── Cancel speech on unmount ──────────────────────────────────
  useEffect(() => () => { window.speechSynthesis.cancel() }, [])

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Top bar */}
      <header className="topbar flex-shrink-0">
        <button onClick={() => navigate(-1)} className="btn-ghost py-2 px-3 text-sm">
          <ChevronLeft className="w-4 h-4" /> {t('back')}
        </button>

        <div className="flex flex-col items-center">
          <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{t('remyAI')}</p>
          <p className="text-xs" style={{ color: 'var(--brand)' }}>{t('aiHealthAdvisor')}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: '#EEF4FF', color: 'var(--brand)' }}
              title={t('changeLang')}
            >
              <Globe className="w-3.5 h-3.5" />
              {langLabel(currentLang)}
            </button>
            {langOpen && (
              <div
                className="absolute right-0 top-10 z-50 rounded-2xl shadow-lg overflow-hidden"
                style={{ background: '#fff', border: '1px solid var(--border)', minWidth: '140px' }}
              >
                {LANGUAGES.map(l => (
                  <button
                    key={l.code}
                    onClick={() => handleLangChange(l.code)}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                    style={{
                      background: currentLang === l.code ? '#EEF4FF' : 'transparent',
                      color: currentLang === l.code ? 'var(--brand)' : 'var(--navy)',
                      fontWeight: currentLang === l.code ? 600 : 400,
                    }}
                  >
                    {l.flag} {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TTS toggle */}
          <button
            onClick={() => { setTtsEnabled(v => !v); if (ttsEnabled) window.speechSynthesis.cancel() }}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95"
            style={{ background: ttsEnabled ? '#EEF4FF' : '#F2F4F8', color: ttsEnabled ? 'var(--brand)' : 'var(--hint)' }}
            title={ttsEnabled ? t('voiceOn') : t('voiceOff')}
          >
            {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={handleEnd}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40"
            style={{ background: '#FFF0F0', color: '#B71C1C' }}
            disabled={ended}
            title={t('endChat')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">

        {loading && (
          <div className="flex justify-center items-center h-32 gap-3" style={{ color: 'var(--hint)' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t('connectingToRemy')}</span>
          </div>
        )}

        {error && (
          <div className="card border" style={{ borderColor: '#FFCDD2', background: '#FFF0F0', color: '#B71C1C' }}>
            <p className="text-sm">{error}</p>
            <div className="flex gap-3 mt-2">
              <button onClick={() => window.location.reload()} className="text-sm underline font-medium">
                {t('retry')}
              </button>
              <button
                onClick={() => { sessionStorage.setItem('auth_return_to', '/chat'); navigate('/auth') }}
                className="text-sm underline font-medium flex items-center gap-1"
              >
                <LogIn className="w-3.5 h-3.5" /> {t('logIn')}
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
          placeholder={loading ? t('connecting') : t('askRemyAnything')}
          disabled={loading || !!error || ended}
          className="input-field flex-1"
        />
        <div className="relative flex-shrink-0">
          {isListening && (
            <>
              <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(198,40,40,0.35)', animationDuration: '1s' }} />
              <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(198,40,40,0.2)', animationDuration: '1s', animationDelay: '0.4s' }} />
            </>
          )}
          <button
            onClick={startListening}
            disabled={loading || !!error || ended}
            className="relative w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
            style={{
              background: isListening
                ? 'linear-gradient(135deg, #C62828, #D32F2F)'
                : '#EEF4FF',
            }}
            title={isListening ? t('listening') : t('voiceInput')}
          >
            {isListening
              ? <MicOff className="w-4 h-4" style={{ color: '#fff' }} />
              : <Mic    className="w-4 h-4" style={{ color: 'var(--brand)' }} />}
          </button>
        </div>
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
