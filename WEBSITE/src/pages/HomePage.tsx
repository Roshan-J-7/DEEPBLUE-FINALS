import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Brain, MessageCircle, Shield, Star,
  ChevronRight, Heart, FileText, Sparkles
} from 'lucide-react'
import { reportsStore, buildChatContext } from '../store/healthStore'

// ─── Feature cards data ────────────────────────────────────────
const FEATURES = [
  {
    icon: Brain,
    color: 'text-purple-500',
    bg:    'bg-purple-50',
    title: 'AI-Powered Assessment',
    desc:  'Answer a guided questionnaire and receive an intelligent medical analysis.',
  },
  {
    icon: Activity,
    color: 'text-teal-500',
    bg:    'bg-teal-50',
    title: 'Detailed Health Report',
    desc:  'Get possible causes, severity levels, and personalised advice.',
  },
  {
    icon: MessageCircle,
    color: 'text-sky-500',
    bg:    'bg-sky-50',
    title: 'Chat with Remy',
    desc:  'Ask follow-up questions about your report with an AI medical advisor.',
  },
  {
    icon: Shield,
    color: 'text-green-500',
    bg:    'bg-green-50',
    title: 'Profile Memory',
    desc:  'Your name, age, and basic details are saved so you skip repeat questions.',
  },
]

// ─── Main Page ─────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate()
  const [hasReports, setHasReports] = useState(false)
  const [latestDate, setLatestDate]  = useState<string | null>(null)

  useEffect(() => {
    const has = reportsStore.hasReports()
    setHasReports(has)
    if (has) {
      const latest = reportsStore.getLatest()
      if (latest) {
        setLatestDate(new Date(latest.generated_at).toLocaleDateString())
      }
    }
  }, [])

  function handleChatWithPreviousReport() {
    const latest = reportsStore.getLatest()
    if (!latest) return
    const ctx = buildChatContext(latest.report_id)
    sessionStorage.setItem('chat_profile_data',       JSON.stringify(ctx.profile_data))
    sessionStorage.setItem('chat_reports',             JSON.stringify(ctx.reports))
    sessionStorage.setItem('chat_current_report_id',   latest.report_id)
    navigate('/chat')
  }

  function handleViewLatestReport() {
    const latest = reportsStore.getLatest()
    if (!latest) return
    sessionStorage.setItem('medical_report', JSON.stringify(latest))
    navigate('/report')
  }

  return (
    <div className="min-h-screen page-enter">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        {/* Decorative blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-teal-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-2xl mx-auto px-6 pt-16 pb-14 text-center space-y-6">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center shadow-lg">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">HealthAssistant</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-extrabold leading-tight">
              Your AI-Powered<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-sky-400">
                Health Companion
              </span>
            </h1>
            <p className="text-slate-300 text-lg max-w-md mx-auto">
              Answer a few questions and receive a detailed medical analysis — backed by AI, powered by care.
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={() => navigate('/assessment')}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-sky-500 text-white font-semibold px-8 py-3.5 rounded-2xl shadow-lg shadow-teal-500/30 hover:opacity-90 active:scale-95 transition-all"
            >
              <Activity className="w-5 h-5" />
              Start Assessment
              <ChevronRight className="w-4 h-4" />
            </button>

            {hasReports && (
              <button
                onClick={handleViewLatestReport}
                className="flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-6 py-3.5 rounded-2xl hover:bg-white/20 active:scale-95 transition-all"
              >
                <FileText className="w-5 h-5" />
                View Last Report
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Returning user: Chat with Remy ─────────────────── */}
      {hasReports && (
        <div className="max-w-2xl mx-auto px-4 -mt-5">
          <div className="card bg-gradient-to-r from-teal-600 to-sky-600 text-white shadow-xl shadow-teal-500/20 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-lg">Welcome back!</span>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Previous report found</span>
                </div>
                <p className="text-teal-100 text-sm mt-1">
                  Remy remembers your last assessment
                  {latestDate ? ` from ${latestDate}` : ''}.
                  Ask any follow-up questions.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleChatWithPreviousReport}
                className="flex-1 flex items-center justify-center gap-2 bg-white text-teal-700 font-semibold py-3 rounded-xl hover:bg-teal-50 active:scale-95 transition-all"
              >
                <MessageCircle className="w-5 h-5" />
                Chat with Remy
              </button>
              <button
                onClick={() => navigate('/assessment')}
                className="flex-1 flex items-center justify-center gap-2 bg-white/15 border border-white/30 text-white font-semibold py-3 rounded-xl hover:bg-white/25 active:scale-95 transition-all"
              >
                <Activity className="w-4 h-4" />
                New Assessment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Features ──────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-5">
        <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
          What HealthAssistant offers
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map(({ icon: Icon, color, bg, title, desc }) => (
            <div key={title} className="card hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <h3 className="font-semibold text-slate-700 mb-1">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom CTA ────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pb-16 text-center space-y-4">
        <p className="text-slate-500 text-sm">Ready to get started?</p>
        <button
          onClick={() => navigate('/assessment')}
          className="btn-primary px-10 py-3.5 text-base font-semibold"
        >
          Start Your Free Assessment
        </button>
        <p className="text-xs text-slate-400">
          ⚕️ For informational purposes only. Not a substitute for professional medical advice.
        </p>
      </div>
    </div>
  )
}
