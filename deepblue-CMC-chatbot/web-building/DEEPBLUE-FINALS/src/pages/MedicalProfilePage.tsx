/**
 * MedicalProfilePage
 * Edit saved medical history (conditions, medications, allergies, surgeries, smoking, alcohol).
 * Mirrors KMP Medical Profile screen.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Save, Trash2, Stethoscope } from 'lucide-react'
import { medicalStore } from '../store/healthStore'
import { useT } from '../i18n/useT'

interface ProfileRow {
  questionId: string
  questionText: string
  answerText: string
}

export default function MedicalProfilePage() {
  const navigate = useNavigate()
  const t = useT()
  const [rows,    setRows]    = useState<ProfileRow[]>([])
  const [saved,   setSaved]   = useState(false)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    const map = medicalStore._read()
    setRows(
      Object.entries(map).map(([questionId, v]) => ({
        questionId,
        questionText: v.questionText,
        answerText:   v.answerText,
      }))
    )
  }, [])

  function handleChange(questionId: string, value: string) {
    setRows(prev =>
      prev.map(r => r.questionId === questionId ? { ...r, answerText: value } : r)
    )
    setSaved(false)
  }

  function handleSave() {
    rows.forEach(r => medicalStore.set(r.questionId, r.questionText, r.answerText))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleClearAll() {
    if (!confirm(t('clearConfirm'))) return
    localStorage.removeItem('HA_MEDICAL_ANSWERS')
    setRows([])
    setCleared(true)
  }

  return (
    <div className="min-h-screen page-enter" style={{ background: 'var(--bg-page)' }}>

      <header className="topbar max-w-2xl mx-auto">
        <button onClick={() => navigate('/settings')} className="btn-ghost py-2 px-3 text-sm">
          <ChevronLeft className="w-4 h-4" /> {t('back')}
        </button>
        <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{t('medicalHistory')}</p>
        <div className="w-20" />
      </header>

      <div className="max-w-2xl mx-auto px-5 pb-16 pt-6 space-y-5">

        <div
          className="rounded-3xl px-6 py-5 flex items-center gap-4 text-white"
          style={{ background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))' }}
        >
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="font-bold text-base">{t('medicalProfile')}</p>
            <p className="text-sm opacity-75 mt-0.5">
              {rows.length > 0
                ? `${rows.length} ${t('itemsSaved')}`
                : t('noMedicalDataYet')}
            </p>
          </div>
        </div>

        {rows.length === 0 && !cleared && (
          <div className="card text-center space-y-2 py-10">
            <p className="font-semibold" style={{ color: 'var(--navy)' }}>{t('noMedicalDataFound')}</p>
            <p className="text-sm" style={{ color: 'var(--hint)' }}>
              {t('completeOnboarding')}
            </p>
          </div>
        )}

        {cleared && (
          <div className="card text-center py-8" style={{ borderColor: '#C5E1A5', background: '#F1F8E9' }}>
            <p className="font-semibold text-sm" style={{ color: '#2E7D32' }}>{t('medicalDataCleared')}</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-3">
            {rows.map(r => (
              <div key={r.questionId} className="card space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--hint)' }}>
                  {r.questionText}
                </p>
                <input
                  type="text"
                  value={r.answerText}
                  onChange={e => handleChange(r.questionId, e.target.value)}
                  className="input-field text-sm"
                  placeholder={t('enterAnswer')}
                />
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-3">
            <button onClick={handleSave} className="btn-primary w-full py-3.5 text-sm">
              {saved ? `✓ ${t('saved')}` : <><Save className="w-4 h-4" /> {t('save')}</>}
            </button>
            <button
              onClick={handleClearAll}
              className="w-full py-3 text-sm font-medium flex items-center justify-center gap-2 rounded-2xl transition-all"
              style={{ background: '#FFF0F0', color: '#B71C1C' }}
            >
              <Trash2 className="w-4 h-4" /> {t('clearAllMedical')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
