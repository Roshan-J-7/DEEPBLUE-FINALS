import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Loader2, Heart, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { api } from '../api/api'
import type { Question, SimpleQA, AnswerPayload } from '../types/api.types'

interface SessionData {
  sessionId: string
  currentQuestion: Question
  collectedQAs: SimpleQA[]   // human-readable Q&A for /assessment/report
  questionIndex: number
}

type Phase = 'loading' | 'question' | 'submitting' | 'generating' | 'error'

export default function AssessmentPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<SessionData | null>(null)
  const [textInput, setTextInput] = useState('')
  const [selectedOption, setSelectedOption] = useState<string>('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Start assessment on mount
  useEffect(() => {
    startAssessment()
  }, [])

  // Focus input when question changes
  useEffect(() => {
    if (phase === 'question') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [phase, session?.currentQuestion.question_id])

  async function startAssessment() {
    try {
      setPhase('loading')
      const data = await api.assessment.start()
      setSession({
        sessionId: data.session_id,
        currentQuestion: data.question,
        collectedQAs: [],
        questionIndex: 1,
      })
      setPhase('question')
    } catch (e) {
      setError(`Failed to start assessment: ${(e as Error).message}`)
      setPhase('error')
    }
  }

  function buildAnswerPayload(q: Question): AnswerPayload | null {
    if (q.response_type === 'text') {
      if (!textInput.trim()) return null
      return { type: 'text', value: textInput.trim() }
    }
    if (q.response_type === 'number') {
      if (!textInput.trim()) return null
      return { type: 'number', value: textInput.trim() }
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
      const labels = selectedOptions.map(
        id => q.response_options?.find(o => o.id === id)?.label ?? id
      )
      return {
        type: 'multi_choice',
        value: labels.join(', '),
        selected_option_ids: selectedOptions,
        selected_option_labels: labels,
      }
    }
    return null
  }

  function getHumanAnswer(q: Question): string {
    if (q.response_type === 'text' || q.response_type === 'number') {
      return textInput.trim()
    }
    if (q.response_type === 'single_choice') {
      return q.response_options?.find(o => o.id === selectedOption)?.label ?? selectedOption
    }
    if (q.response_type === 'multi_choice') {
      return selectedOptions
        .map(id => q.response_options?.find(o => o.id === id)?.label ?? id)
        .join(', ')
    }
    return ''
  }

  async function handleSubmit() {
    if (!session) return
    const q = session.currentQuestion
    const answerPayload = buildAnswerPayload(q)
    if (!answerPayload) {
      setError('Please provide an answer before continuing.')
      return
    }
    setError('')
    setPhase('submitting')

    const humanAnswer = getHumanAnswer(q)
    const newQA: SimpleQA = { question: q.text, answer: humanAnswer }
    const updatedQAs = [...session.collectedQAs, newQA]

    try {
      const res = await api.assessment.answer({
        session_id: session.sessionId,
        question: q,
        answer: answerPayload,
      })

      if (res.status === 'completed' || !res.question) {
        // All questions done - generate report
        await generateReport(session.sessionId, updatedQAs)
      } else {
        // Next question
        setSession({
          ...session,
          currentQuestion: res.question,
          collectedQAs: updatedQAs,
          questionIndex: session.questionIndex + 1,
        })
        setTextInput('')
        setSelectedOption('')
        setSelectedOptions([])
        setPhase('question')
      }
    } catch (e) {
      setError(`Error submitting answer: ${(e as Error).message}`)
      setPhase('question')
    }
  }

  async function generateReport(sessionId: string, qas: SimpleQA[]) {
    setPhase('generating')
    try {
      const report = await api.assessment.report({
        session_id: sessionId,
        responses: qas,
      })
      // Store everything in session storage for the Report page
      sessionStorage.setItem('medical_report', JSON.stringify(report))
      sessionStorage.setItem('assessment_qas', JSON.stringify(qas))
      navigate('/report')
    } catch (e) {
      setError(`Failed to generate report: ${(e as Error).message}`)
      setPhase('error')
    }
  }

  function toggleMultiOption(id: string) {
    setSelectedOptions(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const q = session?.currentQuestion

  // ─── Loading / generating ─────────────────────────────────
  if (phase === 'loading' || phase === 'generating') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-600 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-slate-700">
              {phase === 'generating' ? 'Generating your report…' : 'Starting your assessment…'}
            </h2>
            <p className="text-slate-400 mt-1 text-sm">
              {phase === 'generating'
                ? 'Analysing your responses with AI. This takes a few seconds.'
                : 'Connecting to the health server'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Error ────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="card max-w-md w-full text-center space-y-4">
          <div className="text-red-500 text-4xl">⚠️</div>
          <h2 className="text-xl font-semibold text-slate-700">Something went wrong</h2>
          <p className="text-slate-500 text-sm">{error}</p>
          <button onClick={startAssessment} className="btn-primary w-full">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // ─── Question phase ───────────────────────────────────────
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
          <span className="text-sm font-medium text-slate-500">Health Assessment</span>
        </div>
        <div className="text-sm text-slate-400">
          Q{session?.questionIndex ?? 1}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-teal-400 to-sky-400 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(((session?.questionIndex ?? 1) / 12) * 100, 95)}%` }}
        />
      </div>

      {/* Question card */}
      {q && (
        <div className="flex-1 flex flex-col gap-6">
          <div className="card space-y-2" key={q.question_id}>
            <div className="text-xs font-medium text-teal-600 uppercase tracking-wide">
              {q.is_compulsory ? 'Required' : 'Optional'}
            </div>
            <h2 className="text-xl font-semibold text-slate-800">{q.text}</h2>
          </div>

          {/* Input based on question type */}
          <div className="space-y-3">
            {/* TEXT / NUMBER */}
            {(q.response_type === 'text' || q.response_type === 'number') && (
              <input
                ref={inputRef}
                type={q.response_type === 'number' ? 'number' : 'text'}
                value={textInput}
                onChange={e => {
                  setTextInput(e.target.value)
                  setError('')
                }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder={q.response_type === 'number' ? 'Enter a number…' : 'Type your answer…'}
                className="input-base text-lg"
              />
            )}

            {/* SINGLE CHOICE */}
            {q.response_type === 'single_choice' && q.response_options && (
              <div className="grid grid-cols-2 gap-3">
                {q.response_options.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => { setSelectedOption(opt.id); setError('') }}
                    className={`p-4 rounded-xl border-2 text-left font-medium transition-all duration-150 active:scale-95
                      ${selectedOption === opt.id
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50/30'
                      }`}
                  >
                    {selectedOption === opt.id && (
                      <CheckCircle2 className="w-4 h-4 text-teal-500 mb-1" />
                    )}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* MULTI CHOICE */}
            {q.response_type === 'multi_choice' && q.response_options && (
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Select all that apply</p>
                <div className="grid grid-cols-2 gap-3">
                  {q.response_options.map(opt => {
                    const isSelected = selectedOptions.includes(opt.id)
                    return (
                      <button
                        key={opt.id}
                        onClick={() => { toggleMultiOption(opt.id); setError('') }}
                        className={`p-4 rounded-xl border-2 text-left font-medium transition-all duration-150 active:scale-95
                          ${isSelected
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50/30'
                          }`}
                      >
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-teal-500 mb-1" />}
                        <span>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</p>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={phase === 'submitting'}
            className="btn-primary flex items-center justify-center gap-2 mt-auto w-full py-4 text-base disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {phase === 'submitting' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
