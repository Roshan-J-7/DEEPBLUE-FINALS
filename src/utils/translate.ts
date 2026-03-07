/**
 * Multilingual support using LibreTranslate API.
 *
 * LANGUAGES uses short codes (en, hi, ta, te, ml) for translation.
 * Each entry also carries a BCP-47 speech code for Web Speech API (STT/TTS).
 *
 * Flow:
 *   User message → translate(msg, selectedLang, 'en') → send to backend
 *   Bot reply    → translate(reply, 'en', selectedLang) → display
 *   If selectedLang === 'en', skip translation entirely.
 */

export const LANGUAGES = [
  { code: 'en', label: 'English',    speechCode: 'en-US', flag: '🇬🇧' },
  { code: 'hi', label: 'Hindi',      speechCode: 'hi-IN', flag: '🇮🇳' },
  { code: 'ta', label: 'Tamil',      speechCode: 'ta-IN', flag: '🇮🇳' },
  { code: 'te', label: 'Telugu',     speechCode: 'te-IN', flag: '🇮🇳' },
  { code: 'ml', label: 'Malayalam',  speechCode: 'ml-IN', flag: '🇮🇳' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']

/** Short display label for a language code */
export function langLabel(code: string): string {
  return LANGUAGES.find(l => l.code === code)?.label ?? code
}

/** Get the BCP-47 speech code for a language (used by STT & TTS) */
export function speechCode(code: string): string {
  return LANGUAGES.find(l => l.code === code)?.speechCode ?? 'en-US'
}

/**
 * Translate text using LibreTranslate.
 * Falls back silently — returns the original text on any error.
 */
export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  if (!text.trim() || sourceLang === targetLang) return text
  try {
    const response = await fetch('https://libretranslate.de/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text',
      }),
    })
    if (!response.ok) return text
    const data = (await response.json()) as { translatedText?: string }
    return data.translatedText ?? text
  } catch {
    return text
  }
}
