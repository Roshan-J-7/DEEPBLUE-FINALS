import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, MessageCircle, FileText, ChevronRight,
  Shield, Brain, ClipboardList, LogIn, LogOut,
  UserCircle, Settings, History, Phone,
} from 'lucide-react'
import { reportsStore, buildChatContext, tokenStore, profileStore, bootstrapSync } from '../store/healthStore'
import { api } from '../api/api'
import { useT } from '../i18n/useT'

const FEATURES = [
  { icon: ClipboardList, tKey: 'smartAssessment' as const, dKey: 'smartAssessmentDesc' as const },
  { icon: Brain,         tKey: 'detailedReport'  as const, dKey: 'detailedReportDesc'  as const },
  { icon: MessageCircle, tKey: 'askRemyAI'       as const, dKey: 'askRemyAIDesc'       as const },
  { icon: Shield,        tKey: 'profileMemory'   as const, dKey: 'profileMemoryDesc'   as const },
]


function getGreeting(t: (k: 'goodMorning' | 'goodAfternoon' | 'goodEvening') => string) {
  const h = new Date().getHours()
  if (h < 12) return t('goodMorning')
  if (h < 17) return t('goodAfternoon')
  return t('goodEvening')
}

export default function HomePage() {
  const navigate = useNavigate()
  const t = useT()
  const [hasReports, setHasReports] = useState(false)
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(tokenStore.isLoggedIn())
  const [userName,   setUserName]   = useState<string | null>(null)

  function refreshLocalState() {
    const nameEntry = profileStore.get('name') ?? profileStore.get('full_name')
    setUserName(nameEntry?.answerText ?? null)
    const has = reportsStore.hasReports()
    setHasReports(has)
    if (has) {
      const latest = reportsStore.getLatest()
      if (latest)
        setLatestDate(
          new Date(latest.generated_at).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
          })
        )
    }
  }

  useEffect(() => {
    setIsLoggedIn(tokenStore.isLoggedIn())
    refreshLocalState()
    // If logged in, pull latest data from server then refresh UI
    if (tokenStore.isLoggedIn()) {
      bootstrapSync(api).then(refreshLocalState)
    }
  }, [])

  function handleLogout() {
    tokenStore.clear()
    setIsLoggedIn(false)
  }

  function handleChatWithRemy() {
    if (!tokenStore.isLoggedIn()) {
      const latest = reportsStore.getLatest()
      if (latest) sessionStorage.setItem('chat_current_report_id', latest.report_id)
      sessionStorage.setItem('auth_return_to', '/chat')
      navigate('/auth')
      return
    }
    const latest = reportsStore.getLatest()
    if (!latest) return
    const ctx = buildChatContext(latest.report_id)
    sessionStorage.setItem('chat_profile_data', JSON.stringify(ctx.profile_data))
    sessionStorage.setItem('chat_reports', JSON.stringify(ctx.reports))
    sessionStorage.setItem('chat_current_report_id', latest.report_id)
    navigate('/chat')
  }

  function handleViewReport() {
    const latest = reportsStore.getLatest()
    if (!latest) return
    sessionStorage.setItem('medical_report', JSON.stringify(latest))
    navigate('/report')
  }


  return (
    <div className="min-h-screen page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Top bar */}
      <header className="topbar sticky top-0 z-20 max-w-3xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))' }}>
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--navy)' }}>{t('healthAssistant')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => navigate('/history')} className="icon-btn !w-8 !h-8 !rounded-lg" title={t('history')}>
            <History className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => navigate('/profile')} className="icon-btn !w-8 !h-8 !rounded-lg" title={t('myProfile')}>
            <UserCircle className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => navigate('/settings')} className="icon-btn !w-8 !h-8 !rounded-lg" title={t('settings')}>
            <Settings className="w-3.5 h-3.5" />
          </button>
          {isLoggedIn ? (
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ml-1"
              style={{ background: '#FEF2F2', color: '#991B1B' }} title={t('logOut')}>
              <LogOut className="w-3 h-3" /> {t('logOut')}
            </button>
          ) : (
            <button onClick={() => navigate('/auth')}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ml-1"
              style={{ background: '#EFF6FF', color: 'var(--brand)' }}>
              <LogIn className="w-3 h-3" /> {t('logIn')}
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 space-y-5 pt-5">

        {/* Hero gradient card */}
        <div className="rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, var(--grad-start) 0%, #1D4ED8 50%, var(--grad-end) 100%)' }}>
          <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full opacity-[0.07] bg-white" />
          <div className="absolute right-8 -bottom-14 w-40 h-40 rounded-full opacity-[0.05] bg-white" />
          <div className="absolute left-1/2 top-0 w-72 h-72 rounded-full opacity-[0.03] bg-white -translate-x-1/2 -translate-y-1/2" />
          <div className="relative space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/70">
                {getGreeting(t)}{userName ? `, ${userName}` : ''} 👋
              </p>
              <h1 className="text-xl sm:text-2xl font-bold leading-snug">{t('howAreYouFeeling')}</h1>
            </div>
            <p className="text-sm text-white/60 leading-relaxed max-w-sm">{t('heroSubtext')}</p>
            <button onClick={() => navigate('/assessment')}
              className="flex items-center gap-2 bg-white font-semibold text-sm px-5 py-2.5 rounded-xl active:scale-[0.97] transition-all duration-150"
              style={{ color: 'var(--navy)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              {t('startAssessment')} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Returning user block */}
        {hasReports && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--hint)' }}>{t('previousCheck')}</p>
                <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>
                  {latestDate ?? t('recentReport')}
                </p>
              </div>
              <span className="chip text-xs">{t('savedChip')}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={handleChatWithRemy} className="btn-primary py-2.5 text-sm w-full">
                <MessageCircle className="w-4 h-4" /> {t('askRemy')}
              </button>
              <button onClick={handleViewReport} className="btn-secondary py-2.5 text-sm w-full">
                <FileText className="w-4 h-4" /> {t('viewReport')}
              </button>
            </div>
          </div>
        )}

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FEATURES.map(({ icon: Icon, tKey, dKey }) => (
            <div key={tKey} className="card-sm space-y-2.5 cursor-default">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)' }}>
                <Icon className="w-5 h-5" style={{ color: 'var(--brand)' }} />
              </div>
              <p className="font-semibold text-sm leading-snug" style={{ color: 'var(--navy)' }}>{t(tKey)}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--hint)' }}>{t(dKey)}</p>
            </div>
          ))}
        </div>

        {/* Emergency quick-help */}
        <div className="rounded-xl p-3.5 flex items-center justify-between gap-3"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#FECACA' }}>
              <Phone className="w-4 h-4" style={{ color: '#991B1B' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: '#991B1B' }}>{t('emergency')}</p>
              <p className="text-xs" style={{ color: '#B91C1C' }}>{t('callEmergency')}</p>
            </div>
          </div>
          <a href="tel:112"
            className="font-bold text-xs px-4 py-2 rounded-lg whitespace-nowrap transition-all active:scale-[0.97]"
            style={{ background: '#991B1B', color: '#fff' }}>
            {t('call112')}
          </a>
        </div>

        {/* CTA bar */}
        <div className="card flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{t('readyToStart')}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--hint)' }}>{t('healthCheckTime')}</p>
          </div>
          <button onClick={() => navigate('/assessment')}
            className="btn-primary px-6 py-2.5 text-sm whitespace-nowrap w-full sm:w-auto">
            {t('beginAssessment')} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
