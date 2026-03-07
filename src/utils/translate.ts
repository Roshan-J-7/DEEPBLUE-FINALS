/**
 * Multilingual support using Google Cloud Translation API.
 *
 * LANGUAGES uses short codes (en, hi, ta, te, ml, mr) for translation.
 * Each entry also carries a BCP-47 speech code for TTS/STT.
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
  { code: 'mr', label: 'Marathi',   speechCode: 'mr-IN', flag: '🇮🇳' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']

const GCLOUD_KEY = 'AIzaSyA8sXQjY6_vqkUrhY8sUNi5DaksKXMunOg'

/** Short display label for a language code */
export function langLabel(code: string): string {
  return LANGUAGES.find(l => l.code === code)?.label ?? code
}

/** Get the BCP-47 speech code for a language (used by STT & TTS) */
export function speechCode(code: string): string {
  return LANGUAGES.find(l => l.code === code)?.speechCode ?? 'en-US'
}

/**
 * Translate a single string via Google Translate (gtx endpoint).
 * Reliable for all Indian languages, no API-enable step needed.
 * Falls back silently — returns the original text on any error.
 */
export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  if (!text.trim() || sourceLang === targetLang) return text

  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx` +
      `&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
    const res = await fetch(url)
    if (!res.ok) return text
    const data = await res.json()
    // data[0] is an array of [translatedSegment, originalSegment, ...]
    if (!Array.isArray(data?.[0])) return text
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data[0].map((seg: any) => seg[0] ?? '').join('') || text
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
  if (texts.length === 0) return []
  return Promise.all(texts.map(t => translate(t, sourceLang, targetLang)))
}

// ── Google Cloud TTS ───────────────────────────────────────────
const GCLOUD_TTS_URL = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GCLOUD_KEY}`

/** Active audio element (for cancellation) */
let _ttsAudio: HTMLAudioElement | null = null
/** Incremented on each speakText call; checked by play chain to abort stale calls */
let _ttsGeneration = 0

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

/** Call Google Cloud TTS and return a base64-encoded MP3 string */
async function synthesize(text: string, langCode: string): Promise<string> {
  const res = await fetch(GCLOUD_TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: langCode, ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  })
  if (!res.ok) throw new Error(`Google Cloud TTS error: ${res.status}`)
  const data = await res.json()
  return data.audioContent as string
}

/** Convert base64 string to an object URL for an audio blob */
function base64ToAudioUrl(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'audio/mp3' })
  return URL.createObjectURL(blob)
}

/**
 * Speak `text` using Google Cloud Text-to-Speech API.
 * Splits long text into ≤ 4500-char chunks (API limit is 5000)
 * and plays them sequentially.
 */
export async function speakText(text: string, bcp47: string) {
  cancelSpeech()
  if (!text.trim()) return

  const gen = _ttsGeneration
  const chunks = splitChunks(text, 4500)

  for (const chunk of chunks) {
    if (gen !== _ttsGeneration) return
    try {
      const b64 = await synthesize(chunk, bcp47)
      if (gen !== _ttsGeneration) return
      const url = base64ToAudioUrl(b64)
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url)
        _ttsAudio = audio
        audio.onended = () => { URL.revokeObjectURL(url); resolve() }
        audio.onerror = () => { URL.revokeObjectURL(url); reject() }
        audio.play().catch(reject)
      })
    } catch {
      // skip chunk on error, continue to next
    }
  }
  _ttsAudio = null
}

/** Cancel any ongoing speech */
export function cancelSpeech() {
  _ttsGeneration++
  if (_ttsAudio) { _ttsAudio.pause(); _ttsAudio.currentTime = 0; _ttsAudio = null }
}
