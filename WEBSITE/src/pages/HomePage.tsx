import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, MessageCircle, FileText, ChevronRight, Shield, Brain, ClipboardList } from 'lucide-react'
import { reportsStore, buildChatContext } from '../store/healthStore'

const FEATURES = [
  {
    icon: ClipboardList,
    title: 'Smart Assessment',
    desc: 'Answer targeted questions and get an AI-powered medical analysis in minutes.',
  },
  {
    icon: Brain,
    title: 'Detailed Report',
    desc: 'Understand possible causes ranked by probability with severity levels.',
  },
  {
    icon: MessageCircle,
    title: 'Ask Remy AI',
    desc: 'Chat with your personal AI health advisor about your report anytime.',
  },
  {
    icon: Shield,
    title: 'Profile Memory',
    desc: 'Your basic info is saved — no need to re-enter the same details again.',
  },
]

export default function HomePage() {
  const navigate = useNavigate()
  const [hasReports, setHasReports] = useState(false)
  const [latestDate, setLatestDate] = useState<string | null>(null)

  useEffect(() => {
    const has = reportsStore.hasReports()
    setHasReports(has)
    if (has) {
      const latest = reportsStore.getLatest()
      if (latest) setLatestDate(new Date(latest.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))
    }
  }, [])

  function handleChatWithRemy() {
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

      {/* ── Top bar ── */}
      <header className="topbar max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))' }}
          >
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-base" style={{ color: 'var(--navy)' }}>HealthAssistant</span>
        </div>
        <span className="chip-outline text-xs">Web</span>
      </header>

      <div className="max-w-3xl mx-auto px-5 pb-16 space-y-6 pt-6">

        {/* ── Hero gradient card ── */}
        <div
          className="rounded-3xl p-7 text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, var(--grad-start) 0%, var(--grad-end) 100%)' }}
        >
          {/* subtle inner circle decoration */}
          <div className="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 bg-white" />
          <div className="absolute -right-4 -bottom-8 w-36 h-36 rounded-full opacity-10 bg-white" />

          <div className="relative space-y-4">
            <div>
              <p className="text-sm font-medium opacity-80 mb-1">Hello there</p>
              <h1 className="text-2xl font-bold leading-tight">How are you feeling<br />today?</h1>
            </div>
            <p className="text-sm opacity-75 leading-relaxed max-w-xs">
              Start a quick assessment and get a personalised health analysis powered by AI.
            </p>
            <button
              onClick={() => navigate('/assessment')}
              className="flex items-center gap-2 bg-white font-semibold text-sm px-6 py-3 rounded-full active:scale-95 transition-all duration-150 shadow"
              style={{ color: 'var(--navy)' }}
            >
              Start Assessment <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Returning user block ── */}
        {hasReports && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--hint)' }}>Previous check</p>
                <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>
                  {latestDate ?? 'Recent report available'}
                </p>
              </div>
              <span className="chip text-xs">Saved</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleChatWithRemy}
                className="btn-primary py-3 text-sm w-full"
              >
                <MessageCircle className="w-4 h-4" /> Ask Remy
              </button>
              <button
                onClick={handleViewReport}
                className="btn-secondary py-3 text-sm w-full"
              >
                <FileText className="w-4 h-4" /> View Report
              </button>
            </div>
          </div>
        )}

        {/* ── Quick actions row ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card-sm space-y-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: '#EEF4FF' }}
              >
                <Icon className="w-5 h-5" style={{ color: 'var(--brand)' }} />
              </div>
              <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--navy)' }}>{title}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--hint)' }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* ── CTA bar ── */}
        <div className="card flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold" style={{ color: 'var(--navy)' }}>Ready to start?</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--hint)' }}>A health check takes about 3 minutes.</p>
          </div>
          <button
            onClick={() => navigate('/assessment')}
            className="btn-primary px-8 py-3 text-sm whitespace-nowrap w-full sm:w-auto"
          >
            Begin Assessment <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <p className="text-center text-xs" style={{ color: 'var(--hint)' }}>
          For informational purposes only. Not a substitute for professional medical advice.
        </p>
      </div>
    </div>
  )
}
