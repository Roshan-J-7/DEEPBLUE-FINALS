/**
 * AssessmentPage.tsx
 *
 * Mirrors KMP app's AssessmentViewModel.handleIncomingQuestion():
 *   if (!question.is_compulsory) {
 *     stored = profileStore.get(question.question_id)
 *     if (stored) → auto-submit silently, move to next question
 *   }
 *   → show question to user
 *
 * On each user answer:
 *   sessionStore.add(qa)                   // always (cleared after report)
 *   if (!is_compulsory) profileStore.set() // permanent profile storage
 *
 * After report generated:
 *   reportsStore.insert(report)  // permanent
 *   sessionStore.clear()         // clear temp
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Loader2, Heart, ArrowLeft, CheckCircle2, X } from 'lucide-react'
import { api } from '../api/api'
import { profileStore, sessionStore, reportsStore } from '../store/healthStore'
import type { Question, SimpleQA, AnswerPayload } from '../types/api.types'

interface SessionData {
  sessionId: string
  currentQuestion: Question
  collectedQAs: SimpleQA[]
  visibleCount: number
}

type Phase = 'loading' | 'autofilling' | 'question' | 'submitting' | 'generating' | 'error'

function buildAnswerPayload(
  q: Question,
  text: string,
  selectedOption: string,
  selectedOptions: string[]
): AnswerPayload | null {
  if (q.response_type === 'text') {
    return text.trim() ? { type: 'text', value: text.trim() } : null
  }
  if (q.response_type === 'number') {
    return text.trim() ? { type: 'number', value: text.trim() } : null
  }
  if (q.response_type === 'single_choice') {
    if (!selectedOption) return null
    const opt = q.response_options?.find(o => o.id === selectedOption)
    return {
      type: 'single_choice',
      value: selectedOption,
      selected_option_id: selectedOption,
      selected_option_label: opt?.label ?? selectedOption,
    }
  }
  if (q.response_type === 'multi_choice') {
    if (selectedOptions.length === 0) return null
    const labels = selectedOptions.map(id => q.response_options?.find(o => o.id === id)?.label ?? id)
    return { type: 'multi_choice', value: labels.join(', '), selected_option_ids: selectedOptions, selected_option_labels: labels }
  }
  return null
}

function getHumanAnswer(
  q: Question,
  text: string,
  selectedOption: string,
  selectedOptions: string[]
): string {
  if (q.response_type === 'text' || q.response_type === 'number') return text.trim()
  if (q.response_type === 'single_choice') return q.response_options?.find(o => o.id === selectedOption)?.label ?? selectedOption
  if (q.response_type === 'multi_choice') return selectedOptions.map(id => q.response_options?.find(o => o.id === id)?.label ?? id).join(', ')
  return ''
}

function payloadFromStoredText(q: Question, stored: string): AnswerPayload {
  if (q.response_type === 'single_choice') {
    const opt = q.response_options?.find(o => o.label === stored || o.id === stored)
    return { type: 'single_choice', value: opt?.id ?? stored, selected_option_id: opt?.id ?? stored, selected_option_label: stored }
  }
  if (q.response_type === 'multi_choice') {
    const labels = stored.split(', ')
    const ids = labels.map(l => q.response_options?.find(o => o.label === l)?.id ?? l)
    return { type: 'multi_choice', value: stored, selected_option_ids: ids, selected_option_labels: labels }
  }
  return { type: q.response_type, value: stored }
}

export default function AssessmentPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<SessionData | null>(null)
  const [textInput, setTextInput] = useState('')
  const [selectedOption, setSelectedOption] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [error, setError] = useState('')
  const [autoFillMsg, setAutoFillMsg] = useState('')
  const [showProfileNotice, setShowProfileNotice] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const collectedQAsRef = useRef<SimpleQA[]>([])
  const sessionIdRef = useRef('')
  const visibleCountRef = useRef(0)
  const startedRef = useRef(false)

  useEffect(() => {
    if (phase === 'question') setTimeout(() => inputRef.current?.focus(), 80)
  }, [phase, session?.currentQuestion.question_id])

  // ─── handleIncomingQuestion (mirrors KMP app exactly) ──────
  const handleIncomingQuestion = useCallback(async (
    question: Question,
    currentQAs: SimpleQA[],
  ) => {
    if (!question.is_compulsory) {
      const stored = profileStore.get(question.question_id)
      if (stored) {
        if (visibleCountRef.current === 0) setShowProfileNotice(true)

        setPhase('autofilling')
        setAutoFillMsg(stored.questionText)

        const payload = payloadFromStoredText(question, stored.answerText)
        const newQA: SimpleQA = { question: question.text, answer: stored.answerText }
        const updatedQAs = [...currentQAs, newQA]
        collectedQAsRef.current = updatedQAs

        sessionStore.add({
          questionId: question.question_id,
          questionText: question.text,
          answerText: stored.answerText,
          answerPayload: payload as unknown as Record<string, unknown>,
        })

        try {
          const res = await api.assessment.answer({
            session_id: sessionIdRef.current,
            question,
            answer: payload,
          })
          if (res.status === 'completed' || !res.question) {
            await generateReport(updatedQAs)
          } else {
            await handleIncomingQuestion(res.question, updatedQAs)
          }
        } catch (e) {
          setError((e as Error).message)
          setPhase('error')
        }
        return
      }
    }

    // Show to user
    visibleCountRef.current += 1
    setSession(() => ({
      sessionId: sessionIdRef.current,
      currentQuestion: question,
      collectedQAs: currentQAs,
      visibleCount: visibleCountRef.current,
    }))
    setTextInput('')
    setSelectedOption('')
    setSelectedOptions([])
    setError('')
    setPhase('question')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const generateReport = async (qas: SimpleQA[]) => {
    setPhase('generating')
    try {
      const report = await api.assessment.report({
        session_id: sessionIdRef.current,
        responses: qas,
      })
      reportsStore.insert(report)    // permanent
      sessionStore.clear()            // temp cleared
      sessionStorage.setItem('medical_report', JSON.stringify(report))
      sessionStorage.setItem('assessment_qas', JSON.stringify(qas))
      navigate('/report')
    } catch (e) {
      setError((e as Error).message)
      setPhase('error')
    }
  }

  const startAssessment = useCallback(async () => {
    setPhase('loading')
    setError('')
    visibleCountRef.current = 0
    collectedQAsRef.current = []
    try {
      const data = await api.assessment.start()
      sessionIdRef.current = data.session_id
      await handleIncomingQuestion(data.question, [])
    } catch (e) {
      setError((e as Error).message)
      setPhase('error')
    }
  }, [handleIncomingQuestion])

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      startAssessment()
    }
  }, [startAssessment])

  async function handleSubmit() {
    if (!session) return
    const q = session.currentQuestion
    const payload = buildAnswerPayload(q, textInput, selectedOption, selectedOptions)
    if (!payload) { setError('Please provide an answer before continuing.'); return }
    setError('')
    setPhase('submitting')

    const humanAnswer = getHumanAnswer(q, textInput, selectedOption, selectedOptions)

    sessionStore.add({
      questionId: q.question_id,
      questionText: q.text,
      answerText: humanAnswer,
      answerPayload: payload as unknown as Record<string, unknown>,
    })

    // Permanent profile: save if NOT compulsory (mirrors app logic)
    if (!q.is_compulsory) {
      profileStore.set(q.question_id, q.text, humanAnswer)
    }

    const newQA: SimpleQA = { question: q.text, answer: humanAnswer }
    const updatedQAs = [...session.collectedQAs, newQA]
    collectedQAsRef.current = updatedQAs

    try {
      const res = await api.assessment.answer({ session_id: session.sessionId, question: q, answer: payload })
      if (res.status === 'completed' || !res.question) {
        await generateReport(updatedQAs)
      } else {
        setSession(s => s ? { ...s, collectedQAs: updatedQAs } : null)
        await handleIncomingQuestion(res.question, updatedQAs)
      }
    } catch (e) {
      setError((e as Error).message)
      setPhase('question')
    }
  }

  function toggleMultiOption(id: string) {
    setSelectedOptions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleEndAssessment() {
    sessionStore.clear()
    navigate('/')
  }

  const q = session?.currentQuestion

  // ─── Fullscreen loader ─────────────────────────────────────
  if (phase === 'loading' || phase === 'generating' || phase === 'autofilling') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-5 max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-600 flex items-center justify-center shadow-lg shadow-teal-200">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-700">
              {phase === 'generating' ? 'Generating your report…'
                : phase === 'autofilling' ? 'Loading your profile…'
                : 'Starting assessment…'}
            </h2>
            {phase === 'autofilling' && (
              <p className="text-slate-400 mt-1 text-sm">
                Auto-filling: <span className="italic">{autoFillMsg}</span>
              </p>
            )}
            {phase === 'generating' && (
              <p className="text-slate-400 mt-1 text-sm">AI is analysing your responses. This takes ~10 seconds.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Error ─────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="card max-w-md w-full text-center space-y-4">
          <div className="text-red-500 text-4xl">⚠️</div>
          <h2 className="text-xl font-semibold text-slate-700">Something went wrong</h2>
          <p className="text-slate-500 text-sm">{error}</p>
          <div className="flex gap-3">
            <button onClick={handleEndAssessment} className="btn-secondary flex-1">Home</button>
            <button onClick={startAssessment} className="btn-primary flex-1">Try Again</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col max-w-2xl mx-auto p-4 md:p-8 page-enter">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Home</span>
        </button>
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-teal-500" />
          <span className="text-sm font-medium text-slate-500">Assessment</span>
        </div>
        <button onClick={handleEndAssessment} className="flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors text-sm">
          <X className="w-4 h-4" />
          End
        </button>
      </div>

      {/* Profile notice — shown only on first visible question after auto-fill */}
      {showProfileNotice && (session?.visibleCount ?? 0) <= 1 && (
        <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-start gap-3 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-teal-700">
            <span className="font-medium">Profile loaded.</span>{' '}
            Your saved answers were auto-filled — only new questions are shown.
          </p>
        </div>
      )}

      {/* Progress */}
      <div className="h-1.5 bg-slate-100 rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-teal-400 to-sky-400 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(((session?.visibleCount ?? 0) / 10) * 100, 92)}%` }}
        />
      </div>

      {q && (
        <div className="flex-1 flex flex-col gap-6">
          {/* Question */}
          <div className="card space-y-2" key={q.question_id}>
            <div className="text-xs font-medium text-teal-600 uppercase tracking-wide">
              {q.is_compulsory ? 'Required' : 'Saved to your profile'}
            </div>
            <h2 className="text-xl font-semibold text-slate-800">{q.text}</h2>
          </div>

          {/* Inputs */}
          {(q.response_type === 'text' || q.response_type === 'number') && (
            <input
              ref={inputRef}
              type={q.response_type === 'number' ? 'number' : 'text'}
              value={textInput}
              onChange={e => { setTextInput(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder={q.response_type === 'number' ? 'Enter a number…' : 'Type your answer…'}
              className="input-base text-lg"
            />
          )}

          {q.response_type === 'single_choice' && q.response_options && (
            <div className="grid grid-cols-2 gap-3">
              {q.response_options.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { setSelectedOption(opt.id); setError('') }}
                  className={`p-4 rounded-xl border-2 text-left font-medium transition-all duration-150 active:scale-95
                    ${selectedOption === opt.id
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50/30'}`}
                >
                  {selectedOption === opt.id && <CheckCircle2 className="w-4 h-4 text-teal-500 mb-1" />}
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {q.response_type === 'multi_choice' && q.response_options && (
            <div className="space-y-2">
              <p className="text-sm text-slate-400">Select all that apply</p>
              <div className="grid grid-cols-2 gap-3">
                {q.response_options.map(opt => {
                  const isSel = selectedOptions.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      onClick={() => { toggleMultiOption(opt.id); setError('') }}
                      className={`p-4 rounded-xl border-2 text-left font-medium transition-all duration-150 active:scale-95
                        ${isSel
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50/30'}`}
                    >
                      {isSel && <CheckCircle2 className="w-4 h-4 text-teal-500 mb-1" />}
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={phase === 'submitting'}
            className="btn-primary flex items-center justify-center gap-2 mt-auto w-full py-4 text-base disabled:opacity-60"
          >
            {phase === 'submitting'
              ? <><Loader2 className="w-5 h-5 animate-spin" />Saving…</>
              : <>Continue <ChevronRight className="w-5 h-5" /></>}
          </button>

          <button onClick={handleEndAssessment} className="text-center text-sm text-slate-400 hover:text-red-500 transition-colors py-2">
            End Assessment
          </button>
        </div>
      )}
    </div>
  )
}
