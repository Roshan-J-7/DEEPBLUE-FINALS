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
/** Active fallback audio element (for cancellation) */
let _ttsAudio: HTMLAudioElement | null = null

/** Split text into chunks ≤ maxLen chars at sentence/word boundaries */
function splitChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > maxLen) {
    let idx = remaining.lastIndexOf('. ', maxLen)
    if (idx === -1) idx = remaining.lastIndexOf(' ', maxLen)
    if (idx === -1) idx = maxLen
    else idx += 1
    chunks.push(remaining.slice(0, idx).trim())
    remaining = remaining.slice(idx).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

/**
 * Play text via Google Translate TTS through our proxy.
 * Chains chunks sequentially so long text plays fully.
 */
function playViaProxy(text: string, langPrefix: string) {
  const chunks = splitChunks(text, 180)
  let idx = 0
  const playNext = () => {
    if (idx >= chunks.length) { _ttsAudio = null; return }
    const q = encodeURIComponent(chunks[idx++])
    const url = `/gtts/translate_tts?ie=UTF-8&tl=${langPrefix}&client=tw-ob&q=${q}`
    const audio = new Audio(url)
    _ttsAudio = audio
    audio.onended = playNext
    audio.onerror = playNext  // skip failed chunk, try next
    audio.play().catch(() => playNext())
  }
  playNext()
}

/**
 * Speak `text` using a BCP-47 speech code (e.g. 'ta-IN').
 * 1) Tries native speechSynthesis if a matching voice exists
 * 2) Falls back to Google Translate TTS via server proxy
 */
export function speakText(text: string, bcp47: string) {
  cancelSpeech()
  const prefix = bcp47.split('-')[0]

  const voices = window.speechSynthesis.getVoices()
  const voice =
    voices.find(v => v.lang === bcp47) ??
    voices.find(v => v.lang.startsWith(prefix)) ??
    null

  if (voice) {
    // Native voice available — use speechSynthesis (chunked for reliability)
    const chunks = splitChunks(text, 200)
    chunks.forEach(chunk => {
      const utter = new SpeechSynthesisUtterance(chunk)
      utter.lang = bcp47
      utter.voice = voice
      utter.rate = 1
      utter.pitch = 1.1
      window.speechSynthesis.speak(utter)
    })
  } else {
    // No native voice — use Google Translate TTS via proxy
    playViaProxy(text, prefix)
  }
}

/** Cancel any ongoing speech (native + fallback audio) */
export function cancelSpeech() {
  window.speechSynthesis.cancel()
  if (_ttsAudio) { _ttsAudio.pause(); _ttsAudio.currentTime = 0; _ttsAudio = null }
}
