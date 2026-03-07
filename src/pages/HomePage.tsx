import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, MessageCircle, FileText, ChevronRight,
  Shield, Brain, ClipboardList, LogIn, LogOut,
  UserCircle, Settings, History, Phone,
} from 'lucide-react'
import { reportsStore, buildChatContext, tokenStore, profileStore } from '../store/healthStore'

const FEATURES = [
  { icon: ClipboardList, title: 'Smart Assessment', desc: 'Answer targeted questions and get an AI-powered medical analysis in minutes.' },
  { icon: Brain,         title: 'Detailed Report',  desc: 'Understand possible causes ranked by probability with severity levels.' },
  { icon: MessageCircle, title: 'Ask Remy AI',       desc: 'Chat with your personal AI health advisor about your report anytime.' },
  { icon: Shield,        title: 'Profile Memory',    desc: 'Your basic info is saved - no need to re-enter the same details again.' },
]

const CHIPS = [
  { label: 'I have fever',  emoji: '🌡️' },
  { label: 'Stomach hurts', emoji: '🤢' },
  { label: 'Coughing',      emoji: '😷' },
  { label: 'Chest pain',    emoji: '💙' },
  { label: 'Headache',      emoji: '🤕' },
  { label: 'Feeling tired', emoji: '😴' },
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function HomePage() {
  const navigate = useNavigate()
  const [hasReports, setHasReports] = useState(false)
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(tokenStore.isLoggedIn())
  const [userName,   setUserName]   = useState<string | null>(null)

  useEffect(() => {
    setIsLoggedIn(tokenStore.isLoggedIn())
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

  function handleChip(label: string) {
    sessionStorage.setItem('chat_prefill', label)
    navigate('/chat')
  }

  return (
    <div className="min-h-screen page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Top bar */}
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/history')}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: '#EEF4FF', color: 'var(--brand)' }}
            title="History"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: '#EEF4FF', color: 'var(--brand)' }}
            title="My Profile"
          >
            <UserCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: '#EEF4FF', color: 'var(--brand)' }}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          {isLoggedIn ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
              style={{ background: '#FFF0F0', color: '#B71C1C' }}
              title="Log out"
            >
              <LogOut className="w-3.5 h-3.5" /> Log out
            </button>
          ) : (
            <button
              onClick={() => navigate('/auth')}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
              style={{ background: '#EEF4FF', color: 'var(--brand)' }}
            >
              <LogIn className="w-3.5 h-3.5" /> Log in
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 pb-16 space-y-6 pt-6">

        {/* Hero gradient card */}
        <div
          className="rounded-3xl p-7 text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, var(--grad-start) 0%, var(--grad-end) 100%)' }}
        >
          <div className="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 bg-white" />
          <div className="absolute -right-4 -bottom-8 w-36 h-36 rounded-full opacity-10 bg-white" />
          <div className="relative space-y-4">
            <div>
              <p className="text-sm font-medium opacity-80 mb-1">
                {getGreeting()}{userName ? `, ${userName}` : ''}! 👋
              </p>
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

        {/* Symptom quick chips */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--hint)' }}>
            Quick Start
          </p>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map(c => (
              <button
                key={c.label}
                onClick={() => handleChip(c.label)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all active:scale-95"
                style={{ borderColor: 'var(--border)', color: 'var(--navy)', background: '#fff' }}
              >
                <span>{c.emoji}</span> {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Returning user block */}
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
              <button onClick={handleChatWithRemy} className="btn-primary py-3 text-sm w-full">
                <MessageCircle className="w-4 h-4" /> Ask Remy
              </button>
              <button onClick={handleViewReport} className="btn-secondary py-3 text-sm w-full">
                <FileText className="w-4 h-4" /> View Report
              </button>
            </div>
          </div>
        )}

        {/* Emergency quick-help */}
        <div
          className="rounded-2xl p-4 flex items-center justify-between gap-4"
          style={{ background: '#FFF0F0', border: '1px solid #FFCDD2' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFCDD2' }}>
              <Phone className="w-5 h-5" style={{ color: '#B71C1C' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: '#B71C1C' }}>Emergency?</p>
              <p className="text-xs" style={{ color: '#C62828' }}>Call emergency services immediately</p>
            </div>
          </div>
          <a
            href="tel:112"
            className="font-bold text-sm px-4 py-2 rounded-full whitespace-nowrap"
            style={{ background: '#B71C1C', color: '#fff' }}
          >
            Call 112
          </a>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card-sm space-y-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#EEF4FF' }}>
                <Icon className="w-5 h-5" style={{ color: 'var(--brand)' }} />
              </div>
              <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--navy)' }}>{title}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--hint)' }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* CTA bar */}
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

      </div>
    </div>
  )
}
