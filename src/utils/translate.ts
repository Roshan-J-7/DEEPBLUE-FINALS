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
 * Automatically splits long texts into ≤490-char chunks (at sentence boundaries)
 * to stay within the 500-char API limit.
 * Falls back silently — returns the original text on any error.
 */
export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  if (!text.trim() || sourceLang === targetLang) return text

  // Split into chunks ≤ 490 chars at sentence boundaries
  const MAX = 490
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > MAX) {
    let splitIdx = remaining.lastIndexOf('. ', MAX)
    if (splitIdx === -1) splitIdx = remaining.lastIndexOf(' ', MAX)
    if (splitIdx === -1) splitIdx = MAX
    else splitIdx += 1 // include the space/period
    chunks.push(remaining.slice(0, splitIdx).trim())
    remaining = remaining.slice(splitIdx).trim()
  }
  if (remaining) chunks.push(remaining)

  try {
    const translated = await Promise.all(
      chunks.map(async (chunk) => {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${sourceLang}|${targetLang}`
        const response = await fetch(url)
        if (!response.ok) return chunk
        const data = await response.json()
        const result = data?.responseData?.translatedText
        if (!result || result.toUpperCase() === chunk.toUpperCase()) return chunk
        return result
      })
    )
    return translated.join(' ')
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

// ── TTS helpers ────────────────────────────────────────────────
/**
 * Speak `text` using a BCP-47 speech code (e.g. 'ta-IN').
 * Always uses native speechSynthesis — Chrome/Edge have cloud voices
 * for Indian languages that work even without an explicit voice match.
 * Long text is split into ~200-char chunks to avoid silent truncation.
 */
export function speakText(text: string, bcp47: string) {
  cancelSpeech()
  const prefix = bcp47.split('-')[0]

  // Split long text into manageable chunks (speechSynthesis can silently
  // truncate very long utterances on some platforms)
  const MAX_CHUNK = 200
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > MAX_CHUNK) {
    let idx = remaining.lastIndexOf('. ', MAX_CHUNK)
    if (idx === -1) idx = remaining.lastIndexOf(' ', MAX_CHUNK)
    if (idx === -1) idx = MAX_CHUNK
    else idx += 1
    chunks.push(remaining.slice(0, idx).trim())
    remaining = remaining.slice(idx).trim()
  }
  if (remaining) chunks.push(remaining)

  const doSpeak = () => {
    const voices = window.speechSynthesis.getVoices()
    const voice =
      voices.find(v => v.lang === bcp47) ??
      voices.find(v => v.lang.startsWith(prefix)) ??
      null

    chunks.forEach((chunk) => {
      const utter = new SpeechSynthesisUtterance(chunk)
      utter.lang = bcp47
      if (voice) utter.voice = voice
      utter.rate = 1
      utter.pitch = 1.1
      window.speechSynthesis.speak(utter)
    })
  }

  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true })
    // Some browsers never fire voiceschanged — retry after a short delay
    setTimeout(() => {
      if (window.speechSynthesis.getVoices().length === 0) doSpeak()
    }, 250)
  } else {
    doSpeak()
  }
}

/** Cancel any ongoing speech */
export function cancelSpeech() {
  window.speechSynthesis.cancel()
}
