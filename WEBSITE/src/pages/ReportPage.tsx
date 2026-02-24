import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, MessageCircle, AlertTriangle, CheckCircle, Info,
  ChevronDown, ChevronUp, Heart, TrendingUp, Lightbulb, User
} from 'lucide-react'
import type { MedicalReportResponse, PossibleCause, SimpleQA } from '../types/api.types'

// ─── Urgency helpers ────────────────────────────────────────
function urgencyConfig(level: string) {
  const l = level?.toLowerCase() ?? ''
  if (l.includes('red') || l.includes('emergency')) {
    return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', dot: 'bg-red-500', label: 'Emergency', icon: AlertTriangle }
  }
  if (l.includes('orange') || l.includes('urgent')) {
    return { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', dot: 'bg-orange-400', label: 'Urgent', icon: AlertTriangle }
  }
  if (l.includes('yellow') || l.includes('doctor')) {
    return { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', dot: 'bg-yellow-400', label: 'See a Doctor', icon: Info }
  }
  return { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', dot: 'bg-green-500', label: 'Self-Care', icon: CheckCircle }
}

function severityColor(severity: string) {
  if (severity === 'severe') return 'text-red-600 bg-red-50 border-red-200'
  if (severity === 'moderate') return 'text-orange-600 bg-orange-50 border-orange-200'
  return 'text-green-600 bg-green-50 border-green-200'
}

// ─── Cause card with expand/collapse ─────────────────────────
function CauseCard({ cause, index }: { cause: PossibleCause; index: number }) {
  const [expanded, setExpanded] = useState(index === 0)
  const prob = Math.round(cause.probability * 100)

  return (
    <div className="card space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-1 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 font-bold text-slate-500 text-sm">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-800">{cause.title}</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${severityColor(cause.severity)}`}>
              {cause.severity}
            </span>
          </div>
          {cause.subtitle && <p className="text-xs text-slate-400 mt-0.5">{cause.subtitle}</p>}
          <p className="text-sm text-slate-500 mt-1">{cause.short_description}</p>
        </div>
      </div>

      {/* Probability bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Probability</span>
          <span className="font-medium text-slate-600">{prob}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-400 to-sky-400 transition-all duration-700"
            style={{ width: `${prob}%` }}
          />
        </div>
      </div>

      {/* Expand/collapse detail */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-teal-600 text-sm font-medium hover:text-teal-700 transition-colors"
      >
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 pt-3 space-y-3 animate-fade-in">
          {/* About */}
          {cause.detail.about_this?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">About this condition</p>
              <ul className="space-y-1">
                {cause.detail.about_this.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <span className="text-teal-400 mt-0.5 flex-shrink-0">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What to do now */}
          {cause.detail.what_you_can_do_now?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">What you can do now</p>
              <ul className="space-y-1">
                {cause.detail.what_you_can_do_now.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <CheckCircle className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warning */}
          {cause.detail.warning && (
            <div className="flex gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{cause.detail.warning}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
export default function ReportPage() {
  const navigate = useNavigate()
  const [report, setReport] = useState<MedicalReportResponse | null>(null)
  const [qas, setQAs] = useState<SimpleQA[]>([])

  useEffect(() => {
    const raw = sessionStorage.getItem('medical_report')
    const rawQAs = sessionStorage.getItem('assessment_qas')
    if (!raw) {
      navigate('/')
      return
    }
    setReport(JSON.parse(raw))
    if (rawQAs) setQAs(JSON.parse(rawQAs))
  }, [navigate])

  if (!report) return null

  const urgency = urgencyConfig(report.urgency_level)
  const UrgencyIcon = urgency.icon

  function handleChatWithRemy() {
    // Pass profile_data (from QAs) and the report to chat page
    sessionStorage.setItem('chat_profile_data', JSON.stringify(
      qas.map(qa => ({ question: qa.question, answer: qa.answer }))
    ))
    sessionStorage.setItem('chat_report', JSON.stringify({
      is_main: true,
      generated_at: report!.generated_at,
      report_data: {
        urgency_level: report!.urgency_level,
        summary: report!.summary,
        possible_causes: report!.possible_causes,
        advice: report!.advice,
      }
    }))
    navigate('/chat')
  }

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-8 space-y-6 page-enter">
      {/* Back */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Home</span>
        </button>
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-teal-500" />
          <span className="text-sm font-medium text-slate-500">Medical Report</span>
        </div>
        <div />
      </div>

      {/* Urgency banner */}
      <div className={`rounded-2xl border-2 p-5 ${urgency.bg} ${urgency.border}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${urgency.bg}`}>
            <UrgencyIcon className={`w-5 h-5 ${urgency.text}`} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Urgency Level</div>
            <div className={`text-lg font-bold ${urgency.text}`}>{urgency.label}</div>
          </div>
          <div className={`ml-auto w-3 h-3 rounded-full ${urgency.dot} animate-pulse`} />
        </div>
      </div>

      {/* Patient info */}
      <div className="card">
        <div className="flex items-center gap-3 mb-3">
          <User className="w-5 h-5 text-slate-400" />
          <span className="font-semibold text-slate-700">Patient Info</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Name', val: report.patient_info.name },
            { label: 'Age', val: String(report.patient_info.age) },
            { label: 'Gender', val: report.patient_info.gender },
          ].map(({ label, val }) => (
            <div key={label}>
              <div className="text-xs text-slate-400 mb-0.5">{label}</div>
              <div className="font-medium text-slate-700 capitalize">{val}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
          Topic: <span className="font-medium text-slate-600 capitalize">{report.assessment_topic}</span>
          &nbsp;·&nbsp;
          {new Date(report.generated_at).toLocaleString()}
        </div>
      </div>

      {/* Summary */}
      {report.summary?.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="w-5 h-5 text-teal-500" />
            <span className="font-semibold text-slate-700">Summary</span>
          </div>
          <ul className="space-y-2">
            {report.summary.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-600">
                <span className="text-teal-400 mt-0.5 flex-shrink-0">→</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Possible causes */}
      {report.possible_causes?.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-sky-500" />
            <h2 className="font-semibold text-slate-700">Possible Causes</h2>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{report.possible_causes.length}</span>
          </div>
          {report.possible_causes.map((cause, i) => (
            <CauseCard key={cause.id} cause={cause} index={i} />
          ))}
        </div>
      )}

      {/* Advice */}
      {report.advice?.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold text-slate-700">Advice</span>
          </div>
          <ul className="space-y-2">
            {report.advice.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-600">
                <CheckCircle className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Chat with Remy CTA */}
      <div className="card bg-gradient-to-br from-teal-600 to-sky-600 text-white space-y-4">
        <div className="space-y-1">
          <h3 className="font-bold text-lg">Chat with Remy</h3>
          <p className="text-teal-100 text-sm">
            Have questions about your report? Remy, your AI health assistant, already knows your results and can help.
          </p>
        </div>
        <button
          onClick={handleChatWithRemy}
          className="flex items-center justify-center gap-2 w-full bg-white text-teal-700 font-semibold px-6 py-3 rounded-xl hover:bg-teal-50 transition-colors active:scale-95"
        >
          <MessageCircle className="w-5 h-5" />
          Chat with Remy
        </button>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-slate-400 text-center pb-8">
        ⚕️ For informational purposes only. Always consult a qualified healthcare professional for medical advice.
      </p>
    </div>
  )
}
