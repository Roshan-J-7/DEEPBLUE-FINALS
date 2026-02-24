import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, MessageCircle, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, Info, TrendingUp, Lightbulb, Home
} from 'lucide-react'
import type { MedicalReportResponse, PossibleCause } from '../types/api.types'
import { buildChatContext } from '../store/healthStore'

// ── Urgency config ────────────────────────────────────────────
function getUrgency(level: string) {
  const l = (level ?? '').toLowerCase()
  if (l.includes('red')    || l.includes('emergency'))
    return { cls: 'urgency-red',    label: 'Emergency',  dot: '#EF5350', icon: AlertTriangle }
  if (l.includes('orange') || l.includes('urgent'))
    return { cls: 'urgency-orange', label: 'Urgent',     dot: '#FF9800', icon: AlertTriangle }
  if (l.includes('yellow') || l.includes('doctor'))
    return { cls: 'urgency-yellow', label: 'See a Doctor', dot: '#FFC107', icon: Info }
  return   { cls: 'urgency-green',  label: 'Self-Care',  dot: '#66BB6A', icon: CheckCircle }
}

function severityChip(sev: string) {
  if (sev === 'severe')   return { bg: '#FFF0F0', color: '#B71C1C', border: '#FFCDD2' }
  if (sev === 'moderate') return { bg: '#FFF8F0', color: '#E65100', border: '#FFE0B2' }
  return                         { bg: '#F1F8E9', color: '#2E7D32', border: '#C5E1A5' }
}

// ── Cause Card ────────────────────────────────────────────────
function CauseCard({ cause, index }: { cause: PossibleCause; index: number }) {
  const [open, setOpen] = useState(index === 0)
  const pct = Math.round(cause.probability * 100)
  const sev = severityChip(cause.severity)

  return (
    <div className="card space-y-4">
      {/* Header row */}
      <div className="flex gap-4 items-start">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
          style={{ background: '#EEF4FF', color: 'var(--brand)' }}
        >
          {index + 1}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{cause.title}</span>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full border"
              style={{ background: sev.bg, color: sev.color, borderColor: sev.border }}
            >
              {cause.severity}
            </span>
          </div>
          {cause.subtitle && (
            <p className="text-xs" style={{ color: 'var(--hint)' }}>{cause.subtitle}</p>
          )}
          <p className="text-sm" style={{ color: '#4B5563' }}>{cause.short_description}</p>
        </div>
      </div>

      {/* Probability bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-medium">
          <span style={{ color: 'var(--hint)' }}>Probability</span>
          <span style={{ color: 'var(--brand)' }}>{pct}%</span>
        </div>
        <div className="h-2 rounded-full" style={{ background: '#EEF4FF' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, var(--grad-start), var(--grad-end))',
            }}
          />
        </div>
      </div>

      {/* Toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs font-semibold transition-colors"
        style={{ color: 'var(--brand)' }}
      >
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {open ? 'Hide details' : 'Show details'}
      </button>

      {/* Details */}
      {open && (
        <div className="border-t pt-4 space-y-4 fade-in" style={{ borderColor: 'var(--border)' }}>
          {cause.detail.about_this?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--hint)' }}>
                About this condition
              </p>
              <ul className="space-y-1.5">
                {cause.detail.about_this.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm" style={{ color: '#374151' }}>
                    <span style={{ color: 'var(--blue-mid)' }} className="mt-0.5 flex-shrink-0">–</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cause.detail.what_you_can_do_now?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--hint)' }}>
                What you can do now
              </p>
              <ul className="space-y-1.5">
                {cause.detail.what_you_can_do_now.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm" style={{ color: '#374151' }}>
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--brand)' }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cause.detail.warning && (
            <div
              className="flex gap-3 rounded-xl p-3"
              style={{ background: '#FFF0F0', border: '1px solid #FFCDD2' }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#B71C1C' }} />
              <p className="text-sm" style={{ color: '#B71C1C' }}>{cause.detail.warning}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function ReportPage() {
  const navigate = useNavigate()
  const [report, setReport] = useState<MedicalReportResponse | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('medical_report')
    if (!raw) { navigate('/'); return }
    setReport(JSON.parse(raw))
  }, [navigate])

  if (!report) return null

  const urgency = getUrgency(report.urgency_level)
  const UIcon = urgency.icon

  function handleChat() {
    const ctx = buildChatContext(report!.report_id)
    sessionStorage.setItem('chat_profile_data', JSON.stringify(ctx.profile_data))
    sessionStorage.setItem('chat_reports', JSON.stringify(ctx.reports))
    sessionStorage.setItem('chat_current_report_id', report!.report_id)
    navigate('/chat')
  }

  return (
    <div className="min-h-screen page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Top bar */}
      <header className="topbar sticky top-0 z-10">
        <button
          onClick={() => navigate('/')}
          className="btn-ghost py-2 px-3 text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Home
        </button>
        <span className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>Health Report</span>
        <div className="w-16" />
      </header>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5 pb-16">

        {/* Urgency banner */}
        <div className={`rounded-2xl p-4 flex items-center gap-4 ${urgency.cls}`}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/30">
            <UIcon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Urgency Level</p>
            <p className="font-bold text-base">{urgency.label}</p>
          </div>
          <div className="w-3 h-3 rounded-full flex-shrink-0 animate-pulse" style={{ background: urgency.dot }} />
        </div>

        {/* Patient info */}
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--hint)' }}>
            Patient Info
          </p>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Name',   val: report.patient_info.name },
              { label: 'Age',    val: String(report.patient_info.age) },
              { label: 'Gender', val: report.patient_info.gender },
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-xs mb-0.5" style={{ color: 'var(--hint)' }}>{label}</p>
                <p className="font-semibold text-sm capitalize" style={{ color: 'var(--navy)' }}>{val}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--hint)' }}>
            Topic: <span className="font-medium capitalize" style={{ color: 'var(--brand)' }}>{report.assessment_topic}</span>
            &nbsp;·&nbsp;{new Date(report.generated_at).toLocaleString()}
          </div>
        </div>

        {/* Summary */}
        {report.summary?.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              <span className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>Summary</span>
            </div>
            <ul className="space-y-2">
              {report.summary.map((item, i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: '#374151' }}>
                  <span className="font-bold flex-shrink-0 mt-0.5" style={{ color: 'var(--blue-mid)' }}>→</span>
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
              <Info className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              <span className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>Possible Causes</span>
              <span className="chip-outline ml-1">{report.possible_causes.length}</span>
            </div>
            {report.possible_causes.map((c, i) => (
              <CauseCard key={c.id} cause={c} index={i} />
            ))}
          </div>
        )}

        {/* Advice */}
        {report.advice?.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4" style={{ color: '#F59E0B' }} />
              <span className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>Recommendations</span>
            </div>
            <ul className="space-y-2">
              {report.advice.map((item, i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: '#374151' }}>
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--brand)' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Chat CTA */}
        <div
          className="rounded-2xl p-6 text-white space-y-4"
          style={{ background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))' }}
        >
          <div>
            <p className="font-bold text-base mb-1">Ask Remy AI</p>
            <p className="text-sm opacity-80">
              Have questions about your report? Remy already knows your results and history.
            </p>
          </div>
          <button
            onClick={handleChat}
            className="flex items-center justify-center gap-2 w-full bg-white font-semibold text-sm px-6 py-3 rounded-full active:scale-95 transition-all"
            style={{ color: 'var(--navy)' }}
          >
            <MessageCircle className="w-4 h-4" /> Chat with Remy
          </button>
        </div>

        {/* End */}
        <button onClick={() => navigate('/')} className="btn-secondary w-full py-3 text-sm">
          <Home className="w-4 h-4" /> End Assessment
        </button>

        <p className="text-center text-xs pb-4" style={{ color: 'var(--hint)' }}>
          For informational purposes only. Always consult a qualified healthcare professional.
        </p>
      </div>
    </div>
  )
}
