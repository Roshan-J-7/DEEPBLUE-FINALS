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
