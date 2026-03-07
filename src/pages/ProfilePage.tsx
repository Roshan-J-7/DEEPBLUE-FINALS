import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Save, Trash2, UserCircle } from 'lucide-react'
import { profileStore } from '../store/healthStore'

interface ProfileRow {
  questionId: string
  questionText: string
  answerText: string
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const [rows,    setRows]    = useState<ProfileRow[]>([])
  const [saved,   setSaved]   = useState(false)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    const map = profileStore._read()
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
    rows.forEach(r => profileStore.set(r.questionId, r.questionText, r.answerText))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleClearAll() {
    if (!confirm('Clear all saved profile data? This cannot be undone.')) return
    localStorage.removeItem('HA_PROFILE_ANSWERS')
    setRows([])
    setCleared(true)
  }

  return (
    <div className="min-h-screen page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Top bar */}
      <header className="topbar max-w-2xl mx-auto">
        <button onClick={() => navigate('/home')} className="btn-ghost py-2 px-3 text-sm">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>My Profile</p>
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
            <p className="font-bold text-base">Saved Profile</p>
            <p className="text-sm opacity-75 mt-0.5">
              {rows.length > 0
                ? `${rows.length} answer${rows.length > 1 ? 's' : ''} stored from your questionnaire`
                : 'No profile data yet — complete an assessment first'}
            </p>
          </div>
        </div>

        {/* Empty state */}
        {rows.length === 0 && !cleared && (
          <div className="card text-center space-y-2 py-10">
            <p className="font-semibold" style={{ color: 'var(--navy)' }}>No profile data found</p>
            <p className="text-sm" style={{ color: 'var(--hint)' }}>
              Complete an assessment and your answers will be saved here automatically.
            </p>
            <button onClick={() => navigate('/assessment')} className="btn-primary mt-4 text-sm px-6 py-2.5">
              Start Assessment
            </button>
          </div>
        )}

        {cleared && (
          <div className="card text-center py-8" style={{ borderColor: '#C5E1A5', background: '#F1F8E9' }}>
            <p className="font-semibold text-sm" style={{ color: '#2E7D32' }}>Profile data cleared.</p>
          </div>
        )}

        {/* Editable rows */}
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
                  placeholder="Enter answer..."
                />
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {rows.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={handleSave}
              className="btn-primary w-full py-3.5 text-sm"
            >
              {saved ? '✓ Saved!' : <><Save className="w-4 h-4" /> Save Changes</>}
            </button>
            <button
              onClick={handleClearAll}
              className="w-full py-3 text-sm font-medium flex items-center justify-center gap-2 rounded-2xl transition-all"
              style={{ background: '#FFF0F0', color: '#B71C1C' }}
            >
              <Trash2 className="w-4 h-4" /> Clear All Profile Data
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
