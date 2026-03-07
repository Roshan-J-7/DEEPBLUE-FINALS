import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AuthPage from './pages/AuthPage'
import AssessmentPage from './pages/AssessmentPage'
import ReportPage from './pages/ReportPage'
import ChatPage from './pages/ChatPage'

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-sky-50/30">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/assessment" element={<AssessmentPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/chat" element={<ChatPage />} />
      </Routes>
    </div>
  )
}
