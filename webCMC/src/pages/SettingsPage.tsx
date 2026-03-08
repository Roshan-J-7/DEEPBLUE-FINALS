/**
 * SettingsPage
 * Mirrors KMP Settings screen: Language selector, Profile link, Medical link, Logout.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Globe, UserCircle, Stethoscope, LogOut } from 'lucide-react'
import { tokenStore, languageStore, clearAllUserData } from '../store/healthStore'
import { LANGUAGES } from '../utils/translate'
import { useT } from '../i18n/useT'

export default function SettingsPage() {
  const navigate = useNavigate()
  const t = useT()
  const [selectedLang, setSelectedLang] = useState(languageStore.get())
  const [langOpen,     setLangOpen]     = useState(false)

  function handleLangSelect(code: string) {
    setSelectedLang(code)
    languageStore.set(code)
    setLangOpen(false)
  }

  function handleLogout() {
    clearAllUserData()
    tokenStore.clear()
    navigate('/auth', { replace: true })
  }

  const currentLangLabel = LANGUAGES.find(l => l.code === selectedLang)?.label ?? 'English'

  return (
    <div className="min-h-screen page-enter" style={{ background: 'var(--bg-page)' }}>

      {/* Top bar */}
      <header className="topbar max-w-2xl mx-auto">
        <button onClick={() => navigate('/home')} className="btn-ghost py-2 px-3 text-sm">
          <ChevronLeft className="w-4 h-4" /> {t('back')}
        </button>
        <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{t('settings')}</p>
        <div className="w-20" />
      </header>

      <div className="max-w-2xl mx-auto px-5 pb-16 pt-6 space-y-3">

        {/* Language */}
        <div className="card space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--hint)' }}>{t('language')}</p>
          <button
            onClick={() => setLangOpen(v => !v)}
            className="w-full flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#EEF4FF' }}>
                <Globe className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              </div>
              <div className="text-left">
                <p className="font-medium text-sm" style={{ color: 'var(--navy)' }}>{t('appLanguage')}</p>
                <p className="text-xs" style={{ color: 'var(--hint)' }}>{currentLangLabel}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--hint)' }} />
          </button>

          {langOpen && (
            <div
              className="rounded-2xl overflow-hidden fade-in"
              style={{ border: '1.5px solid var(--border)' }}
            >
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => handleLangSelect(lang.code)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
                  style={{
                    background: selectedLang === lang.code ? '#EEF4FF' : 'var(--surface)',
                    color: selectedLang === lang.code ? 'var(--brand)' : 'var(--navy)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span>{lang.label}</span>
                  {selectedLang === lang.code && (
                    <span className="w-2 h-2 rounded-full" style={{ background: 'var(--brand)' }} />
                  )}
                </button>
              ))}
            </div>
          )}

          {selectedLang !== 'en' && (
            <p className="text-xs" style={{ color: 'var(--hint)' }}>
              {t('langHint')} {currentLangLabel}.
            </p>
          )}
        </div>

        {/* Profile */}
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--hint)' }}>{t('account')}</p>
          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#EEF4FF' }}>
                <UserCircle className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              </div>
              <div className="text-left">
                <p className="font-medium text-sm" style={{ color: 'var(--navy)' }}>{t('personalProfile')}</p>
                <p className="text-xs" style={{ color: 'var(--hint)' }}>{t('editNameAgeEtc')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--hint)' }} />
          </button>

          <div style={{ height: '1px', background: 'var(--border)', margin: '0.5rem 0' }} />

          <button
            onClick={() => navigate('/medical-profile')}
            className="w-full flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#EEF4FF' }}>
                <Stethoscope className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              </div>
              <div className="text-left">
                <p className="font-medium text-sm" style={{ color: 'var(--navy)' }}>{t('medicalHistory')}</p>
                <p className="text-xs" style={{ color: 'var(--hint)' }}>{t('conditionsMedsAllergies')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--hint)' }} />
          </button>
        </div>

        {/* Logout */}
        <div className="card">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 py-2"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#FFF0F0' }}>
              <LogOut className="w-4 h-4" style={{ color: '#B71C1C' }} />
            </div>
            <p className="font-medium text-sm" style={{ color: '#B71C1C' }}>{t('logOut')}</p>
          </button>
        </div>

      </div>
    </div>
  )
}
