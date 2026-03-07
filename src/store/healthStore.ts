/**
 * healthStore.ts
 *
 * Web equivalent of the app's SQLDelight local database.
 * Mirrors the exact 3-table schema used in the KMP app:
 *
 *   profile_answers  → permanent, keyed by question_id (is_compulsory: false only)
 *   reports          → permanent array, newest first
 *   assessment_ctx   → temp session Q&A, cleared after report is generated
 *
 * Backend DB: PostgreSQL ("DeepBlue") — stores chat_sessions only.
 * Client DB:  localStorage — stores profile + reports + current session context.
 */

import type { MedicalReportResponse, ProfileEntry } from '../types/api.types'

// ─── Storage keys ─────────────────────────────────────────────
const PROFILE_KEY = 'HA_PROFILE_ANSWERS'   // { [question_id]: { question_text, answer_text } }
const REPORTS_KEY = 'HA_REPORTS'           // StoredReport[]
const SESSION_KEY = 'HA_SESSION_CTX'       // SessionQA[]  (cleared after report)

// ─── Types ────────────────────────────────────────────────────

export interface ProfileAnswer {
  questionId: string
  questionText: string
  answerText: string
}

export interface StoredReport {
  id: string
  generatedAt: string
  reportJson: string   // JSON.stringify(MedicalReportResponse)
}

export interface SessionQA {
  questionId: string
  questionText: string
  answerText: string
  answerPayload: Record<string, unknown>  // raw AnswerPayload for re-submitting
}

// ─────────────────────────────────────────────────────────────
// PROFILE STORE  (permanent — like profile_answers table)
// ─────────────────────────────────────────────────────────────

type ProfileMap = Record<string, { questionText: string; answerText: string }>

export const profileStore = {
  /** Save or overwrite a single profile answer */
  set(questionId: string, questionText: string, answerText: string) {
    const all = profileStore._read()
    all[questionId] = { questionText, answerText }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(all))
  },

  /** Get one answer by question_id, or null */
  get(questionId: string): { questionText: string; answerText: string } | null {
    return profileStore._read()[questionId] ?? null
  },

  /** Get all stored profile answers as ProfileEntry[] for /chat/start */
  getAll(): ProfileEntry[] {
    const map = profileStore._read()
    return Object.entries(map).map(([, v]) => ({
      question: v.questionText,
      answer: v.answerText,
    }))
  },

  /** True if any profile data has been saved */
  hasData(): boolean {
    return Object.keys(profileStore._read()).length > 0
  },

  /**
   * Fuzzy search: find the best stored answer whose question text overlaps with
   * the incoming question text. Used as a fallback when the backend question_id
   * doesn't match the key the onboarding used.
   */
  findByText(questionText: string): { questionText: string; answerText: string } | null {
    const map = profileStore._read()
    const incoming = questionText.toLowerCase()
    // Extract meaningful words (>3 chars) from the incoming question
    const words = incoming.split(/\W+/).filter(w => w.length > 3)
    let bestEntry: { questionText: string; answerText: string } | null = null
    let bestScore = 0
    for (const v of Object.values(map)) {
      const stored = v.questionText.toLowerCase()
      const score = words.filter(w => stored.includes(w)).length
      if (score > bestScore) { bestScore = score; bestEntry = v }
    }
    // Require at least 2 matching words to avoid false positives
    return bestScore >= 2 ? bestEntry : null
  },

  _read(): ProfileMap {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}')
    } catch {
      return {}
    }
  },
}

// ─────────────────────────────────────────────────────────────
// REPORTS STORE  (permanent — like reports table)
// ─────────────────────────────────────────────────────────────

export const reportsStore = {
  /** Insert or overwrite a report */
  insert(report: MedicalReportResponse) {
    const all = reportsStore._read()
    const entry: StoredReport = {
      id: report.report_id,
      generatedAt: report.generated_at,
      reportJson: JSON.stringify(report),
    }
    // Replace if same id, otherwise prepend (newest first)
    const idx = all.findIndex(r => r.id === entry.id)
    if (idx >= 0) {
      all[idx] = entry
    } else {
      all.unshift(entry)
    }
    localStorage.setItem(REPORTS_KEY, JSON.stringify(all))
  },

  /** Get all reports sorted newest first */
  getAll(): MedicalReportResponse[] {
    return reportsStore._read().map(r => JSON.parse(r.reportJson) as MedicalReportResponse)
  },

  /** Get the most recent report or null */
  getLatest(): MedicalReportResponse | null {
    const all = reportsStore._read()
    return all.length > 0 ? (JSON.parse(all[0].reportJson) as MedicalReportResponse) : null
  },

  /** True if at least one report stored */
  hasReports(): boolean {
    return reportsStore._read().length > 0
  },

  _read(): StoredReport[] {
    try {
      return JSON.parse(localStorage.getItem(REPORTS_KEY) ?? '[]')
    } catch {
      return []
    }
  },
}

// ─────────────────────────────────────────────────────────────
// SESSION CONTEXT  (temp — like AssessmentContext table)
// Cleared after report is submitted, exactly like the app does.
// ─────────────────────────────────────────────────────────────

export const sessionStore = {
  add(qa: SessionQA) {
    const all = sessionStore._read()
    const idx = all.findIndex(x => x.questionId === qa.questionId)
    if (idx >= 0) {
      all[idx] = qa
    } else {
      all.push(qa)
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(all))
  },

  getAll(): SessionQA[] {
    return sessionStore._read()
  },

  clear() {
    localStorage.removeItem(SESSION_KEY)
  },

  _read(): SessionQA[] {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) ?? '[]')
    } catch {
      return []
    }
  },
}

// ─────────────────────────────────────────────────────────────
// CHAT CONTEXT BUILDER
// Mirrors ChatRepositoryImpl.startChat():
//   1. profileLocal.getAll()
//   2. reportLocal.getAll()
//   3. mark the "current" report as is_main
// ─────────────────────────────────────────────────────────────

export function buildChatContext(currentReportId: string | null = null) {
  const profileData = profileStore.getAll()

  const reports = reportsStore.getAll().map(report => ({
    report_id: report.report_id,
    generated_at: report.generated_at,
    is_main: currentReportId
      ? report.report_id === currentReportId
      : false,
    report_data: {
      urgency_level: report.urgency_level,
      summary: report.summary,
      possible_causes: report.possible_causes,
      advice: report.advice,
    },
  }))

  // If no explicit current but we have reports, mark newest as main
  if (!currentReportId && reports.length > 0) {
    reports[0].is_main = true
  }

  return { profile_data: profileData, reports }
}

// ─────────────────────────────────────────────────────────────
// TOKEN STORE  (auth JWT — persists across sessions)
// ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'HA_AUTH_TOKEN'

export const tokenStore = {
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token)
  },

  get(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  },

  clear() {
    localStorage.removeItem(TOKEN_KEY)
  },

  isLoggedIn(): boolean {
    return !!localStorage.getItem(TOKEN_KEY)
  },
}

// ─────────────────────────────────────────────────────────────
// MEDICAL STORE  (permanent — like MedicalProfile table)
// Stores medications, allergies, conditions etc.
// ─────────────────────────────────────────────────────────────

const MEDICAL_KEY = 'HA_MEDICAL_ANSWERS'

export const medicalStore = {
  set(questionId: string, questionText: string, answerText: string) {
    const all = medicalStore._read()
    all[questionId] = { questionText, answerText }
    localStorage.setItem(MEDICAL_KEY, JSON.stringify(all))
  },

  get(questionId: string): { questionText: string; answerText: string } | null {
    return medicalStore._read()[questionId] ?? null
  },

  getAll(): ProfileEntry[] {
    const map = medicalStore._read()
    return Object.entries(map).map(([, v]) => ({
      question: v.questionText,
      answer: v.answerText,
    }))
  },

  hasData(): boolean {
    return Object.keys(medicalStore._read()).length > 0
  },

  _read(): ProfileMap {
    try {
      return JSON.parse(localStorage.getItem(MEDICAL_KEY) ?? '{}')
    } catch {
      return {}
    }
  },
}

// ─────────────────────────────────────────────────────────────
// LANGUAGE STORE  (for multilingual support)
// ─────────────────────────────────────────────────────────────

const LANG_KEY = 'HA_LANGUAGE'

export const languageStore = {
  set(lang: string) {
    localStorage.setItem(LANG_KEY, lang)
  },
  /** Returns a short language code e.g. 'en', 'hi', 'ta' */
  get(): string {
    return localStorage.getItem(LANG_KEY) ?? 'en'
  },
}

// ─────────────────────────────────────────────────────────────
// ONBOARDING FLAG  (track if new user needs onboarding)
// ─────────────────────────────────────────────────────────────

const ONBOARDED_KEY = 'HA_ONBOARDED'

export const onboardingStore = {
  markDone() { localStorage.setItem(ONBOARDED_KEY, '1') },
  isDone(): boolean { return !!localStorage.getItem(ONBOARDED_KEY) },
}
