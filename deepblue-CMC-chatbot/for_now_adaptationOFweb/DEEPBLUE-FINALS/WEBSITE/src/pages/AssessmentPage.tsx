import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ChevronRight, Loader2, Check, Upload, ImageIcon, Camera } from 'lucide-react'
import { api } from '../api/api'
import type { Question, AnswerPayload, ResponseOption, StoredAnswerItem } from '../types/api.types'
import { profileStore, sessionStore, reportsStore } from '../store/healthStore'

// Convert backend stored answer_json → plain text for profileStore
function answerJsonToText(aj: Record<string, unknown>): string {
  const type = aj.type as string
  if (type === 'single_choice') return (aj.selected_option_label as string) ?? ''
  if (type === 'multi_choice') return ((aj.selected_option_labels as string[]) ?? []).join(', ')
  if (type === 'number') return String(aj.value ?? '')
  return String(aj.value ?? '')
}
 
// ── Types ──────────────────────────────────────────────────────
interface SessionState {
  sessionId: string
  currentQuestion: Question
  visibleCount: number
}
type Phase = 'loading' | 'question' | 'autofilling' | 'submitting' | 'generating' | 'done' | 'error'

// ── Payload builders ───────────────────────────────────────────
function payloadFromStoredText(q: Question, storedText: string): AnswerPayload {
  if (q.response_type === 'single_choice') {
    const opt = q.response_options?.find(o => o.label.toLowerCase() === storedText.toLowerCase())
    return { type: 'single_choice', selected_option_id: opt?.id ?? storedText, selected_option_label: opt?.label ?? storedText }
  }
  if (q.response_type === 'multi_choice') {
    const labels = storedText.split(', ')
    const opts = q.response_options?.filter(o => labels.includes(o.label)) ?? []
    return { type: 'multi_choice', selected_option_ids: opts.map(o => o.id), selected_option_labels: opts.map(o => o.label) }
  }
  return { type: q.response_type, value: storedText }
}

function buildPayload(q: Question, text: string, selOpt: ResponseOption | null, selOpts: ResponseOption[]): AnswerPayload {
  if (q.response_type === 'single_choice' && selOpt)
    return { type: 'single_choice', selected_option_id: selOpt.id, selected_option_label: selOpt.label }
  if (q.response_type === 'multi_choice')
    return { type: 'multi_choice', selected_option_ids: selOpts.map(o => o.id), selected_option_labels: selOpts.map(o => o.label) }
  return { type: q.response_type, value: text }
}

function humanAnswerStr(q: Question, text: string, selOpt: ResponseOption | null, selOpts: ResponseOption[]): string {
  if (q.response_type === 'single_choice') return selOpt?.label ?? ''
  if (q.response_type === 'multi_choice')  return selOpts.map(o => o.label).join(', ')
  return text
}

// ── Main ───────────────────────────────────────────────────────
export default function AssessmentPage() {
  const navigate = useNavigate()
  const [phase,         setPhase]         = useState<Phase>('loading')
  const [session,       setSession]       = useState<SessionState | null>(null)
  const [textInput,     setTextInput]     = useState('')
  const [selOpt,        setSelOpt]        = useState<ResponseOption | null>(null)
  const [selOpts,       setSelOpts]       = useState<ResponseOption[]>([])
  const [autoFillMsg,   setAutoFillMsg]   = useState('')
  const [autoFillCount, setAutoFillCount] = useState(0)
  const [errorMsg,      setErrorMsg]      = useState('')
  const [imageFile,     setImageFile]     = useState<File | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const sessionIdRef    = useRef<string>('')
  const visibleCountRef = useRef(0)
  const startedRef      = useRef(false)
  const cameraInputRef  = useRef<HTMLInputElement>(null)

  // ── Recursive question handler (auto-fill) ─────────────────
  const handleIncomingQuestion = useCallback(async (question: Question) => {
    if (!question.is_compulsory) {
      const stored = profileStore.get(question.question_id)
      if (stored) {
        setAutoFillCount(c => c + 1)
        setPhase('autofilling')
        setAutoFillMsg(stored.questionText)

        const payload = payloadFromStoredText(question, stored.answerText)
        sessionStore.add({
          questionId:    question.question_id,
          questionText:  question.text,
          answerText:    stored.answerText,
          answerPayload: payload as unknown as Record<string, unknown>,
        })

        try {
          const res = await api.assessment.answer({ session_id: sessionIdRef.current, question, answer: payload })
          if (res.status === 'completed' || !res.question) { await generateReport() }
          else { await handleIncomingQuestion(res.question) }
        } catch (e) { setErrorMsg((e as Error).message); setPhase('error') }
        return
      }
    }

    visibleCountRef.current += 1
    setSession({
      sessionId:       sessionIdRef.current,
      currentQuestion: question,
      visibleCount:    visibleCountRef.current,
    })
    setTextInput(''); setSelOpt(null); setSelOpts([]); setErrorMsg(''); setImageFile(null)
    setPhase('question')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const generateReport = async () => {
    setPhase('generating')
    try {
      const report = await api.assessment.report({ session_id: sessionIdRef.current })
      reportsStore.insert(report)
      sessionStore.clear()
      sessionStorage.setItem('medical_report', JSON.stringify(report))
      setPhase('done')
      navigate('/report')
    } catch (e) { setErrorMsg((e as Error).message); setPhase('error') }
  }

  // Start on mount (once)
  if (!startedRef.current) {
    startedRef.current = true
    ;(async () => {
      try {
        const res = await api.assessment.start()
        sessionIdRef.current    = res.session_id
        visibleCountRef.current = 0
        // Seed profileStore from backend stored_answers (logged-in users)
        if (res.stored_answers) {
          seedProfileFromStoredAnswers(res.stored_answers)
        }
        await handleIncomingQuestion(res.question)
      } catch (e) { setErrorMsg((e as Error).message); setPhase('error') }
    })()
  }

  function seedProfileFromStoredAnswers(stored: StoredAnswerItem[]) {
    for (const sa of stored) {
      const text = answerJsonToText(sa.answer_json)
      if (text) profileStore.set(sa.question_id, sa.question_text, text)
    }
  }

  // ── Submit current question ───────────────────────────────
  const handleSubmit = async () => {
    if (!session) return
    const q = session.currentQuestion
    const valid =
      (q.response_type === 'text'          && textInput.trim()) ||
      (q.response_type === 'number'        && textInput.trim()) ||
      (q.response_type === 'single_choice' && selOpt !== null)  ||
      (q.response_type === 'multi_choice'  && selOpts.length > 0) ||
      (q.response_type === 'image')
    if (!valid) { setErrorMsg('Please provide an answer.'); return }

    setErrorMsg(''); setPhase('submitting')
    const payload = buildPayload(q, textInput, selOpt, selOpts)
    const answer  = q.response_type === 'image'
      ? (imageFile ? imageFile.name : 'skipped')
      : humanAnswerStr(q, textInput, selOpt, selOpts)

    sessionStore.add({ questionId: q.question_id, questionText: q.text, answerText: answer, answerPayload: payload as unknown as Record<string, unknown> })
    if (!q.is_compulsory) profileStore.set(q.question_id, q.text, answer)

    try {
      let res
      if (q.response_type === 'image' && imageFile) {
        // Send as multipart/form-data with image (JWT added manually)
        const { tokenStore } = await import('../store/healthStore')
        const token = tokenStore.get()
        const form = new FormData()
        form.append('session_id', sessionIdRef.current)
        form.append('question_id', q.question_id)
        form.append('question_text', q.text)
        form.append('answer_json', JSON.stringify({ type: 'image' }))
        form.append('image', imageFile)
        const headers: Record<string, string> = { 'ngrok-skip-browser-warning': 'true' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const raw = await fetch('/api/assessment/answer', { method: 'POST', body: form, headers })
        if (!raw.ok) throw new Error(`API error ${raw.status}`)
        res = await raw.json()
      } else {
        res = await api.assessment.answer({ session_id: sessionIdRef.current, question: q, answer: payload })
      }
      if (res.status === 'completed' || !res.question) { await generateReport() }
      else { await handleIncomingQuestion(res.question) }
    } catch (e) { setErrorMsg((e as Error).message); setPhase('error') }
  }

  function handleEnd() { sessionStore.clear(); navigate('/') }

  const q = session?.currentQuestion

  // ── Render ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused = session?.visibleCount  // keep session in scope
  return (
    <div className="min-h-screen flex flex-col page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Top bar */}
      <header className="topbar flex-shrink-0">
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--hint)' }}>
            {session ? `Question ${visibleCountRef.current}` : 'Starting...'}
          </p>
          <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>New Assessment</p>
        </div>
        <button
          onClick={handleEnd}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: '#EEF4FF', color: 'var(--brand)' }}
          title="End assessment"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Auto-fill notice */}
      {autoFillCount > 0 && phase === 'question' && (
        <div className="flex justify-center mt-4">
          <span className="chip-outline text-xs fade-in">
            {autoFillCount} answer{autoFillCount > 1 ? 's' : ''} pre-filled from your profile
          </span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 max-w-2xl mx-auto w-full">

        {/* Loading / auto-fill / generating states */}
        {(phase === 'loading' || phase === 'autofilling' || phase === 'generating' || phase === 'submitting') && (
          <div className="flex flex-col items-center gap-4 fade-in">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))' }}
            >
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
            <p className="font-semibold text-center" style={{ color: 'var(--navy)' }}>
              {phase === 'loading'    ? 'Starting your assessment...'  :
               phase === 'autofilling'? 'Auto-filling from profile...'  :
               phase === 'generating' ? 'Generating your report...'      :
                                        'Saving response...'}
            </p>
            {phase === 'autofilling' && autoFillMsg && (
              <p className="text-sm text-center max-w-xs" style={{ color: 'var(--hint)' }}>{autoFillMsg}</p>
            )}
            {phase === 'generating' && (
              <p className="text-sm" style={{ color: 'var(--hint)' }}>Our AI is analysing your responses.</p>
            )}
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="card w-full space-y-4 text-center fade-in">
            <p className="font-semibold" style={{ color: '#B71C1C' }}>Something went wrong</p>
            <p className="text-sm" style={{ color: 'var(--hint)' }}>{errorMsg}</p>
            <button onClick={handleEnd} className="btn-secondary text-sm">Go Home</button>
          </div>
        )}

        {/* Question */}
        {phase === 'question' && q && (
          <div className="w-full space-y-6 fade-in">

            {/* Question text */}
            <div className="text-center px-2 space-y-2">
              <p className="text-lg font-semibold leading-relaxed" style={{ color: 'var(--navy)' }}>
                {q.text}
              </p>
              {!q.is_compulsory && (
                <span className="chip-outline text-xs inline-block">Optional</span>
              )}
            </div>

            {/* Single choice */}
            {q.response_type === 'single_choice' && q.response_options && (
              <div className="space-y-3">
                {q.response_options.map(opt => {
                  const active = selOpt?.id === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelOpt(opt)}
                      className="w-full text-left px-5 py-4 rounded-2xl font-medium text-sm transition-all duration-150 active:scale-[0.99] flex items-center justify-between"
                      style={{
                        background: active
                          ? 'linear-gradient(90deg, var(--grad-start), var(--grad-end))'
                          : 'var(--surface)',
                        color:  active ? '#fff' : 'var(--navy)',
                        border: `1.5px solid ${active ? 'transparent' : 'var(--border)'}`,
                      }}
                    >
                      <span>{opt.label}</span>
                      {active && <Check className="w-4 h-4" />}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Multi choice */}
            {q.response_type === 'multi_choice' && q.response_options && (
              <div className="space-y-3">
                <p className="text-xs text-center font-medium" style={{ color: 'var(--hint)' }}>
                  Select all that apply
                </p>
                {q.response_options.map(opt => {
                  const active = selOpts.some(o => o.id === opt.id)
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelOpts(prev =>
                        active ? prev.filter(o => o.id !== opt.id) : [...prev, opt]
                      )}
                      className="w-full text-left px-5 py-4 rounded-2xl font-medium text-sm transition-all duration-150 active:scale-[0.99] flex items-center justify-between"
                      style={{
                        background: active
                          ? 'linear-gradient(90deg, var(--grad-start), var(--grad-end))'
                          : 'var(--surface)',
                        color:  active ? '#fff' : 'var(--navy)',
                        border: `1.5px solid ${active ? 'transparent' : 'var(--border)'}`,
                      }}
                    >
                      <span>{opt.label}</span>
                      {active && <Check className="w-4 h-4" />}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Text / number */}
            {(q.response_type === 'text' || q.response_type === 'number') && (
              <input
                type={q.response_type === 'number' ? 'number' : 'text'}
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder={q.response_type === 'number' ? 'Enter a number' : 'Type your answer...'}
                className="input-field text-center text-base"
                autoFocus
              />
            )}

            {/* Image upload / camera capture */}
            {q.response_type === 'image' && (
              <div className="space-y-3">
                {/* Hidden file inputs */}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => setImageFile(e.target.files?.[0] ?? null)}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={e => setImageFile(e.target.files?.[0] ?? null)}
                />

                {/* Show chosen file name OR the two action buttons */}
                {imageFile ? (
                  <div
                    className="w-full py-4 rounded-2xl font-medium text-sm flex items-center justify-center gap-3"
                    style={{ background: 'linear-gradient(90deg, var(--grad-start), var(--grad-end))', color: '#fff', border: '1.5px solid transparent' }}
                  >
                    <Check className="w-4 h-4" />{imageFile.name}
                    <button
                      onClick={() => setImageFile(null)}
                      className="ml-2 text-white/70 hover:text-white text-xs underline"
                    >Change</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className="py-4 rounded-2xl font-medium text-sm flex flex-col items-center justify-center gap-2 transition-all"
                      style={{ background: 'var(--surface)', color: 'var(--navy)', border: '1.5px dashed var(--border)' }}
                    >
                      <Upload className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                      <span>Upload photo</span>
                    </button>
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="py-4 rounded-2xl font-medium text-sm flex flex-col items-center justify-center gap-2 transition-all"
                      style={{ background: 'var(--surface)', color: 'var(--navy)', border: '1.5px dashed var(--border)' }}
                    >
                      <Camera className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                      <span>Front camera</span>
                    </button>
                  </div>
                )}

                {!imageFile && (
                  <p className="text-center text-xs" style={{ color: 'var(--hint)' }}>
                    <ImageIcon className="w-3 h-3 inline mr-1" />You can skip if no image is available
                  </p>
                )}
              </div>
            )}

            {errorMsg && (
              <p className="text-center text-sm font-medium" style={{ color: '#B71C1C' }}>{errorMsg}</p>
            )}

            <button onClick={handleSubmit} className="btn-primary w-full py-4 text-sm">
              Continue <ChevronRight className="w-4 h-4" />
            </button>

            {!q.is_compulsory && (
              <button
                onClick={() => {
                  setTextInput(''); setSelOpt(null); setSelOpts([])
                  // submit empty — backend handles skip
                  handleSubmit()
                }}
                className="w-full text-center text-sm font-medium py-2"
                style={{ color: 'var(--hint)' }}
              >
                Skip this question
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
