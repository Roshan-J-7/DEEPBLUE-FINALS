import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Save, UserCircle, Check } from 'lucide-react'
import { profileStore } from '../store/healthStore'
import { useT } from '../i18n/useT'

import type { TranslationKey } from '../i18n/translations'

// Canonical question definitions — single source of truth for profile fields
const PROFILE_QUESTIONS = [
  { id: 'name',        labelKey: 'fullName'    as TranslationKey, text: 'What is your full name?',       type: 'text'   as const, placeholder: 'e.g. Arjun Kumar' },
  { id: 'age',         labelKey: 'age'         as TranslationKey, text: 'How old are you?',              type: 'number' as const, placeholder: 'e.g. 25' },
  { id: 'gender',      labelKey: 'gender'      as TranslationKey, text: 'What is your gender?',          type: 'select' as const, options: ['Male', 'Female', 'Other'] },
  { id: 'blood_group', labelKey: 'bloodGroup'  as TranslationKey, text: 'What is your blood group?',     type: 'select' as const, options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Unknown'] },
  { id: 'city',        labelKey: 'city'        as TranslationKey, text: 'Which city do you live in?',    type: 'text'   as const, placeholder: 'e.g. Chennai' },
  { id: 'occupation',  labelKey: 'occupation'  as TranslationKey, text: 'What is your occupation?',      type: 'text'   as const, placeholder: 'e.g. Software Engineer' },
]

export default function ProfilePage() {
  const navigate = useNavigate()
  const t = useT()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    const initial: Record<string, string> = {}
    for (const q of PROFILE_QUESTIONS) {
      const stored = profileStore.get(q.id) ?? profileStore.findByText(q.text)
      initial[q.id] = stored?.answerText ?? ''
    }
    setValues(initial)
  }, [])

  function handleChange(id: string, value: string) {
    setValues(prev => ({ ...prev, [id]: value }))
    setSaved(false)
  }

  function handleSave() {
    for (const q of PROFILE_QUESTIONS) {
      const val = (values[q.id] ?? '').trim()
      if (val) profileStore.set(q.id, q.text, val)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const name = values['name']?.trim() || null

  return (
    <div className="min-h-screen page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Top bar */}
      <header className="topbar max-w-2xl mx-auto">
        <button onClick={() => navigate('/home')} className="btn-ghost py-2 px-3 text-sm">
          <ChevronLeft className="w-4 h-4" /> {t('back')}
        </button>
        <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{t('myProfile')}</p>
        <div className="w-20" />
      </header>

      <div className="max-w-2xl mx-auto px-5 pb-16 pt-6 space-y-5">

        {/* Header card */}
        <div
          className="rounded-3xl px-6 py-5 flex items-center gap-4 text-white"
          style={{ background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))' }}
        >
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <UserCircle className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="font-bold text-base">{name ?? t('myProfile')}</p>
            <p className="text-sm opacity-75 mt-0.5">
              {t('editDetailsBelow')}
            </p>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          {PROFILE_QUESTIONS.map(q => (
            <div key={q.id} className="card space-y-2">
              <label
                className="text-xs font-semibold uppercase tracking-wide block"
                style={{ color: 'var(--hint)' }}
              >
                {t(q.labelKey)}
              </label>

              {q.type === 'select' ? (
                <select
                  value={values[q.id] ?? ''}
                  onChange={e => handleChange(q.id, e.target.value)}
                  className="input-field text-sm w-full"
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">{t('select')}</option>
                  {q.options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={q.type === 'number' ? 'number' : 'text'}
                  value={values[q.id] ?? ''}
                  onChange={e => handleChange(q.id, e.target.value)}
                  placeholder={'placeholder' in q ? q.placeholder : ''}
                  className="input-field text-sm w-full"
                  min={q.type === 'number' ? 1 : undefined}
                  max={q.type === 'number' ? 120 : undefined}
                />
              )}
            </div>
          ))}
        </div>

        {/* Save */}
        <button onClick={handleSave} className="btn-primary w-full py-3.5 text-sm">
          {saved
            ? <><Check className="w-4 h-4" /> {t('saved')}</>
            : <><Save className="w-4 h-4" /> {t('save')}</>
          }
        </button>

      </div>
    </div>
  )
}
