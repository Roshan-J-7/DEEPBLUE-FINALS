/**
 * Multilingual support using MyMemory Translation API.
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
 * Translate text using MyMemory Translation API.
 * Falls back silently — returns the original text on any error.
 */
export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  if (!text.trim() || sourceLang === targetLang) return text
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`
    const response = await fetch(url)
    if (!response.ok) return text
    const data = await response.json()
    const translated = data?.responseData?.translatedText
    // MyMemory sometimes returns the input uppercased when it fails
    if (!translated || translated.toUpperCase() === text.toUpperCase()) return text
    return translated
  } catch {
    return text
  }
}

/**
 * Translate an array of strings in parallel.
 * Returns an array of translated strings in the same order.
 */
export async function translateBatch(
  texts: string[],
  sourceLang: string,
  targetLang: string,
): Promise<string[]> {
  if (sourceLang === targetLang) return texts
  return Promise.all(texts.map(t => translate(t, sourceLang, targetLang)))
}
