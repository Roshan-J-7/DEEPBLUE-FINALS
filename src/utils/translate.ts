/**
 * Language definitions using BCP-47 codes for the Web Speech API.
 * STT and TTS both use these codes directly — no translation API needed.
 * The AI detects the user's language naturally and replies in the same language.
 */

export const LANGUAGES = [
  { code: 'en-US', label: 'English',    flag: '🇬🇧' },
  { code: 'hi-IN', label: 'Hindi',      flag: '🇮🇳' },
  { code: 'ta-IN', label: 'Tamil',      flag: '🇮🇳' },
  { code: 'te-IN', label: 'Telugu',     flag: '🇮🇳' },
  { code: 'ml-IN', label: 'Malayalam',  flag: '🇮🇳' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']

/** Short display name for a BCP-47 code */
export function langLabel(code: string): string {
  return LANGUAGES.find(l => l.code === code)?.label ?? code
}
