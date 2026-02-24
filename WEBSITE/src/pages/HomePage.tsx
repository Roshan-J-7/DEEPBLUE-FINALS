import { useNavigate } from 'react-router-dom'
import { Activity, Shield, Brain, ChevronRight, Heart, Stethoscope } from 'lucide-react'

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-slate-800">HealthAssistant</span>
        </div>
        <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">AI Powered</span>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 page-enter">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-teal-500 to-sky-500 flex items-center justify-center shadow-xl shadow-teal-200">
              <Stethoscope className="w-12 h-12 text-white" />
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-800 leading-tight">
              Your AI Health <br />
              <span className="bg-gradient-to-r from-teal-600 to-sky-500 bg-clip-text text-transparent">
                Assessment Guide
              </span>
            </h1>
            <p className="text-lg text-slate-500 max-w-lg mx-auto">
              Get a personalized medical report based on your symptoms. Then chat with Remy, 
              your AI medical assistant, for guidance.
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/assessment')}
              className="btn-primary flex items-center justify-center gap-2 text-lg px-8 py-4"
            >
              Start Assessment
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
            <div className="card flex flex-col items-center text-center p-5 space-y-3">
              <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center">
                <Activity className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-700">Smart Assessment</div>
                <div className="text-sm text-slate-400 mt-1">Adaptive questionnaire tailored to your symptoms</div>
              </div>
            </div>

            <div className="card flex flex-col items-center text-center p-5 space-y-3">
              <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center">
                <Brain className="w-6 h-6 text-sky-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-700">AI Medical Report</div>
                <div className="text-sm text-slate-400 mt-1">Possible causes, urgency level & advice</div>
              </div>
            </div>

            <div className="card flex flex-col items-center text-center p-5 space-y-3">
              <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center">
                <Shield className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-700">Chat with Remy</div>
                <div className="text-sm text-slate-400 mt-1">Your personal AI health assistant</div>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            ⚕️ For informational purposes only. Always consult a qualified healthcare professional 
            for medical advice, diagnosis, or treatment.
          </p>
        </div>
      </main>
    </div>
  )
}
