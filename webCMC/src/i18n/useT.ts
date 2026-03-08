/**
 * useT() — lightweight i18n hook.
 * Reads the current language from languageStore and returns a `t(key)` function
 * that looks up the translated string from the static dictionary.
 *
 * Usage:
 *   const t = useT()
 *   <p>{t('startAssessment')}</p>
 */

import { useState, useEffect, useCallback } from 'react'
import T, { type TranslationKey, type LangKey } from './translations'
import { languageStore } from '../store/healthStore'

/** Standalone lookup — works outside React components too */
export function tStatic(key: TranslationKey, lang?: string): string {
  const l = (lang ?? languageStore.get()) as LangKey
  const entry = T[key]
  return (entry as Record<string, string>)[l] ?? (entry as Record<string, string>).en
}

/** React hook — re-renders when languageStore changes */
export function useT() {
  const [lang, setLang] = useState<LangKey>(languageStore.get() as LangKey)

  // Poll for language changes (languageStore is a plain object, not reactive)
  useEffect(() => {
    const id = setInterval(() => {
      const curr = languageStore.get() as LangKey
      setLang(prev => (prev !== curr ? curr : prev))
    }, 300)
    return () => clearInterval(id)
  }, [])

  const t = useCallback(
    (key: TranslationKey): string => {
      const entry = T[key]
      return (entry as Record<string, string>)[lang] ?? (entry as Record<string, string>).en
    },
    [lang],
  )

  return t
}
