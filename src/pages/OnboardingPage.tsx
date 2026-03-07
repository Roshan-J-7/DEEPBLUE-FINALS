/**
 * OnboardingPage
 * Shown to NEW users after first sign-up (mirrors KMP OnboardingProfile + OnboardingMedical).
 * Collects profile basics (name, age, gender, blood group, city) then medical history.
 * Saves to localStorage AND sends to backend via /user/profile/onboarding + /user/medical/onboarding.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Loader2, Activity, Check } from 'lucide-react'
import { api } from '../api/api'
import { profileStore, medicalStore, onboardingStore } from '../store/healthStore'

// ── Static question definitions ────────────────────────────────
const PROFILE_QUESTIONS = [
  { id: 'name',        text: 'What is your full name?',          type: 'text',          placeholder: 'e.g. Arjun Kumar' },
  { id: 'age',         text: 'How old are you?',                 type: 'number',        placeholder: 'e.g. 25' },
  { id: 'gender',      text: 'What is your gender?',             type: 'single_choice', options: ['Male', 'Female', 'Other'] },
  { id: 'blood_group', text: 'What is your blood group?',        type: 'single_choice', options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Unknown'] },
  { id: 'city',        text: 'Which city do you live in?',        type: 'text',          placeholder: 'e.g. Chennai' },
  { id: 'occupation',  text: 'What is your occupation?',         type: 'text',          placeholder: 'e.g. Software Engineer' },
] as const

const MEDICAL_QUESTIONS = [
  { id: 'conditions',  text: 'Do you have any known medical conditions?',   type: 'text', placeholder: 'e.g. Diabetes, Hypertension (or None)' },
  { id: 'medications', text: 'Are you currently taking any medications?',    type: 'text', placeholder: 'e.g. Metformin 500mg (or None)' },
  { id: 'allergies',   text: 'Do you have any allergies?',                   type: 'text', placeholder: 'e.g. Penicillin, Peanuts (or None)' },
  { id: 'surgeries',   text: 'Have you had any past surgeries or procedures?',  type: 'text', placeholder: 'e.g. Appendectomy 2018 (or None)' },
  { id: 'smoking',     text: 'Do you smoke?',                               type: 'single_choice', options: ['Never', 'Currently', 'Former smoker'] },
  { id: 'alcohol',     text: 'How often do you consume alcohol?',            type: 'single_choice', options: ['Never', 'Occasionally', 'Regularly'] },
] as const

type PQ = typeof PROFILE_QUESTIONS[number]
type MQ = typeof MEDICAL_QUESTIONS[number]
type AnyQ = PQ | MQ

type Phase = 'profile' | 'medical'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [phase,    setPhase]    = useState<Phase>('profile')
  const [stepIdx,  setStepIdx]  = useState(0)
  const [answers,  setAnswers]  = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const questions: readonly AnyQ[] = phase === 'profile' ? PROFILE_QUESTIONS : MEDICAL_QUESTIONS
  const q = questions[stepIdx]
  const answer = answers[q.id] ?? ''
  const progress = ((stepIdx + (phase === 'medical' ? PROFILE_QUESTIONS.length : 0)) /
    (PROFILE_QUESTIONS.length + MEDICAL_QUESTIONS.length)) * 100

  function setAnswer(val: string) {
    setAnswers(prev => ({ ...prev, [q.id]: val }))
    setError('')
  }

  async function handleNext() {
    if (!answer.trim() && q.type !== 'single_choice') {
      setError('Please provide an answer or type "None".')
      return
    }
    if (q.type === 'single_choice' && !answer) {
      setError('Please select an option.')
      return
    }

    // Save to local store
    if (phase === 'profile') {
      profileStore.set(q.id, q.text, answer)
    } else {
      medicalStore.set(q.id, q.text, answer)
    }

    // Move to next step or submit phase
    if (stepIdx < questions.length - 1) {
      setStepIdx(i => i + 1)
      return
    }

    // Submit this phase to backend
    setLoading(true)
    try {
      const buildAnswers = (qs: readonly AnyQ[]) =>
        qs.map(qq => ({
          question_id:   qq.id,
          question_text: qq.text,
          answer_json:   { type: 'text', value: answers[qq.id] ?? answer },
        }))

      if (phase === 'profile') {
        await api.user.profileOnboarding({ answers: buildAnswers(PROFILE_QUESTIONS) }).catch(() => null)
        setPhase('medical')
        setStepIdx(0)
      } else {
        await api.user.medicalOnboarding({ answers: buildAnswers(MEDICAL_QUESTIONS) }).catch(() => null)
        onboardingStore.markDone()
        navigate('/home', { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }

  function handleSkip() {
    if (stepIdx < questions.length - 1) {
      setStepIdx(i => i + 1)
    } else if (phase === 'profile') {
      setPhase('medical'); setStepIdx(0)
    } else {
      onboardingStore.markDone()
      navigate('/home', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex flex-col page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Header */}
      <div
        className="px-5 pt-10 pb-6 text-white"
        style={{ background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))' }}
      >
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-sm opacity-90">
              {phase === 'profile' ? 'Personal Profile' : 'Medical History'}
            </span>
          </div>
          <p className="text-xs opacity-70 mb-2">
            Step {stepIdx + 1} of {questions.length} · {phase === 'profile' ? 'Part 1' : 'Part 2'} of 2
          </p>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 max-w-lg mx-auto w-full">
        <div className="w-full space-y-6 fade-in">

          {/* Question */}
          <div className="text-center space-y-1 px-2">
            <p className="text-lg font-bold leading-snug" style={{ color: 'var(--navy)' }}>{q.text}</p>
          </div>

          {/* Input */}
          {(q.type === 'text' || q.type === 'number') && (
            <input
              type={q.type === 'number' ? 'number' : 'text'}
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNext()}
              placeholder={'placeholder' in q ? q.placeholder : ''}
              className="input-field text-center text-base w-full"
              autoFocus
            />
          )}

          {q.type === 'single_choice' && 'options' in q && (
            <div className="space-y-3">
              {q.options.map(opt => {
                const active = answer === opt
                return (
                  <button
                    key={opt}
                    onClick={() => setAnswer(opt)}
                    className="w-full text-left px-5 py-4 rounded-2xl font-medium text-sm transition-all duration-150 active:scale-[0.99] flex items-center justify-between"
                    style={{
                      background: active
                        ? 'linear-gradient(90deg, var(--grad-start), var(--grad-end))'
                        : 'var(--surface)',
                      color:  active ? '#fff' : 'var(--navy)',
                      border: `1.5px solid ${active ? 'transparent' : 'var(--border)'}`,
                    }}
                  >
                    <span>{opt}</span>
                    {active && <Check className="w-4 h-4" />}
                  </button>
                )
              })}
            </div>
          )}

          {error && (
            <p className="text-center text-sm font-medium" style={{ color: '#B71C1C' }}>{error}</p>
          )}

          <button
            onClick={handleNext}
            disabled={loading}
            className="btn-primary w-full py-4 text-sm disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              : stepIdx === questions.length - 1 && phase === 'medical'
                ? 'Finish Setup'
                : <><span>Continue</span><ChevronRight className="w-4 h-4" /></>
            }
          </button>

          <button
            onClick={handleSkip}
            className="w-full text-center text-sm font-medium py-2"
            style={{ color: 'var(--hint)' }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
