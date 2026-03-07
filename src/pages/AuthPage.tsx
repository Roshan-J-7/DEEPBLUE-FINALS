import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Loader2 } from 'lucide-react'
import { api } from '../api/api'
import { tokenStore, onboardingStore, bootstrapSync } from '../store/healthStore'
import { useT } from '../i18n/useT'

type Mode = 'login' | 'signup'

export default function AuthPage() {
  const navigate = useNavigate()
  const t = useT()
  const [mode,     setMode]     = useState<Mode>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Please fill in both fields.')
      return
    }
    setError(''); setSuccess(''); setLoading(true)

    try {
      if (mode === 'signup') {
        const res = await api.auth.signup({ email: email.trim(), password })
        if (!res.success) {
          setError(res.message)
        } else {
          // Auto-login after signup then send to onboarding
          const loginRes = await api.auth.login({ email: email.trim(), password })
          if (loginRes.success && loginRes.token) {
            tokenStore.set(loginRes.token)
            navigate('/onboarding', { replace: true })
          } else {
            setSuccess('Account created! Please log in.')
            setMode('login')
            setPassword('')
          }
        }
      } else {
        const res = await api.auth.login({ email: email.trim(), password })
        if (!res.success || !res.token) {
          setError(res.message || 'Login failed.')
        } else {
          tokenStore.set(res.token)
          await bootstrapSync(api)
          // Check explicit return-to first, then onboarding flag, then home
          const returnTo = sessionStorage.getItem('auth_return_to')
          sessionStorage.removeItem('auth_return_to')
          if (returnTo) {
            navigate(returnTo, { replace: true })
          } else if (!onboardingStore.isDone()) {
            navigate('/onboarding', { replace: true })
          } else {
            navigate('/home', { replace: true })
          }
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 page-enter"
      style={{ background: 'var(--bg-page)' }}>

      {/* Logo */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))' }}
        >
          <Activity className="w-7 h-7 text-white" />
        </div>
        <div className="text-center">
          <p className="font-bold text-xl" style={{ color: 'var(--navy)' }}>{t('healthAssistant')}</p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--hint)' }}>
            {mode === 'login' ? t('signInToAccount') : t('createNewAccount')}
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="card w-full max-w-sm space-y-5">

        {/* Tab toggle */}
        <div className="flex rounded-xl overflow-hidden" style={{ background: '#EEF4FF' }}>
          {(['login', 'signup'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); setSuccess('') }}
              className="flex-1 py-2.5 text-sm font-semibold transition-all"
              style={mode === m
                ? { background: 'linear-gradient(90deg, var(--grad-start), var(--grad-end))', color: '#fff', borderRadius: '0.75rem' }
                : { color: 'var(--hint)' }
              }
            >
              {m === 'login' ? t('logIn') : t('signUp')}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: 'var(--hint)' }}>{t('email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-field w-full"
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: 'var(--hint)' }}>{t('password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-field w-full"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && (
            <p className="text-sm font-medium text-center" style={{ color: '#B71C1C' }}>{error}</p>
          )}
          {success && (
            <p className="text-sm font-medium text-center" style={{ color: '#2E7D32' }}>{success}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3.5 text-sm disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('pleaseWait')}</>
              : mode === 'login' ? t('logIn') : t('createAccount')
            }
          </button>
        </form>

        <p
          className="text-center text-xs"
          style={{ color: 'var(--hint)', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}
        >
          {mode === 'login'
            ? t('noAccount')
            : t('alreadyHaveAccount')}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess('') }}
            className="font-semibold underline"
            style={{ color: 'var(--brand)' }}
          >
            {mode === 'login' ? t('signUp') : t('logIn')}
          </button>
        </p>
      </div>

      <button
        onClick={() => navigate('/home')}
        className="mt-6 text-sm font-medium"
        style={{ color: 'var(--hint)' }}
      >
        {t('backToHome')}
      </button>
    </div>
  )
}
