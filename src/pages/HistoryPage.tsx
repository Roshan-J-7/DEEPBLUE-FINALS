/**
 * HistoryPage
 * Shows all saved medical reports (mirrors KMP History tab).
 * Pulls from reportsStore + optionally syncs from /user/reports.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, FileText, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { reportsStore, tokenStore, bootstrapSync } from '../store/healthStore'
import { api } from '../api/api'
import type { MedicalReportResponse } from '../types/api.types'
import { useT } from '../i18n/useT'

function urgencyStyle(level: string) {
  const l = level?.toLowerCase() ?? ''
  if (l.includes('emergency'))       return { bg: '#FFF0F0', color: '#B71C1C', label: 'Emergency' }
  if (l.includes('doctor'))          return { bg: '#FFF8F0', color: '#E65100', label: 'See a Doctor' }
  if (l.includes('self') || l.includes('green')) return { bg: '#F1F8E9', color: '#2E7D32', label: 'Self Care' }
  return { bg: '#EEF4FF', color: 'var(--brand)', label: level }
}

export default function HistoryPage() {
  const navigate  = useNavigate()
  const t = useT()
  const [reports, setReports] = useState<MedicalReportResponse[]>([])
  const [syncing, setSyncing] = useState(false)

  // Auto-sync reports from server on mount, then refresh local state
  useEffect(() => {
    setReports(reportsStore.getAll())
    if (tokenStore.isLoggedIn()) {
      setSyncing(true)
      bootstrapSync(api).then(() => {
        setReports(reportsStore.getAll())
      }).finally(() => setSyncing(false))
    }
  }, [])

  async function handleSync() {
    if (!tokenStore.isLoggedIn()) return
    setSyncing(true)
    try {
      const fetched = await api.user.reports()
      if (Array.isArray(fetched)) {
        fetched.forEach(r => reportsStore.insert(r))
        setReports(reportsStore.getAll())
      }
    } catch { /* ignore */ }
    finally { setSyncing(false) }
  }

  function openReport(r: MedicalReportResponse) {
    sessionStorage.setItem('medical_report', JSON.stringify(r))
    navigate('/report')
  }

  return (
    <div className="min-h-screen page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Top bar */}
      <header className="topbar max-w-2xl mx-auto">
        <button onClick={() => navigate('/home')} className="btn-ghost py-2 px-3 text-sm">
          <ChevronLeft className="w-4 h-4" /> {t('back')}
        </button>
        <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{t('assessmentHistory')}</p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40"
          style={{ background: '#EEF4FF', color: 'var(--brand)' }}
          title={t('syncFromServer')}
        >
          {syncing
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-5 pb-16 pt-6 space-y-3">

        {reports.length === 0 && (
          <div className="card text-center space-y-2 py-12">
            <FileText className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--hint)' }} />
            <p className="font-semibold" style={{ color: 'var(--navy)' }}>{t('noReportsYet')}</p>
            <p className="text-sm" style={{ color: 'var(--hint)' }}>
              {t('completeAssessmentToSee')}
            </p>
            <button onClick={() => navigate('/assessment')} className="btn-primary mt-4 text-sm px-6 py-2.5">
              {t('startAssessment')}
            </button>
          </div>
        )}

        {reports.map(r => {
          const urg = urgencyStyle(r.urgency_level)
          const date = new Date(r.generated_at).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
          })
          return (
            <button
              key={r.report_id}
              onClick={() => openReport(r)}
              className="card w-full text-left flex items-center justify-between gap-4 active:scale-[0.99] transition-all"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: urg.bg }}
                >
                  <FileText className="w-5 h-5" style={{ color: urg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--navy)' }}>
                    {r.assessment_topic ?? t('healthAssessmentFallback')}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>{date}</p>
                  <span
                    className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-1.5"
                    style={{ background: urg.bg, color: urg.color }}
                  >
                    {urg.label}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--hint)' }} />
            </button>
          )
        })}

      </div>
    </div>
  )
}
