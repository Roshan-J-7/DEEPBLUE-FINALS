// LibreTranslate-based translation utility
// Falls back silently — original text is returned on any error

const LIBRE_TRANSLATE_URL = 'https://libretranslate.com/translate'

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'ml', label: 'Malayalam' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']

export async function translate(text: string, targetLang: string): Promise<string> {
  if (!text.trim() || targetLang === 'en') return text
  try {
    const response = await fetch(LIBRE_TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: 'auto',
        target: targetLang,
        format: 'text',
      }),
    })
    if (!response.ok) return text
    const data = await response.json() as { translatedText?: string }
    return data.translatedText ?? text
  } catch {
    return text
  }
}
