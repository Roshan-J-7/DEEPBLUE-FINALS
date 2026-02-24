// ─── Assessment Types ─────────────────────────────────────────

export interface ResponseOption {
  id: string
  label: string
}

export interface Question {
  question_id: string
  text: string
  response_type: 'text' | 'number' | 'single_choice' | 'multi_choice'
  response_options?: ResponseOption[] | null
  is_compulsory: boolean
}

export interface AssessmentStartResponse {
  session_id: string
  question: Question
}

export interface AnswerPayload {
  type: string
  value?: string
  selected_option_id?: string
  selected_option_label?: string
  selected_option_ids?: string[]
  selected_option_labels?: string[]
}

export interface SubmitAnswerRequest {
  session_id: string
  question: Question
  answer: AnswerPayload
}

export interface SubmitAnswerResponse {
  session_id: string
  status?: string    // "completed" when done
  question?: Question
}

// ─── Report Types ─────────────────────────────────────────────

export interface SimpleQA {
  question: string
  answer: string
}

export interface SubmitReportRequest {
  session_id?: string
  responses: SimpleQA[]
}

export interface CauseDetail {
  about_this: string[]
  how_common: { percentage?: number; description?: string }
  what_you_can_do_now: string[]
  warning?: string
}

export interface PossibleCause {
  id: string
  title: string
  short_description: string
  severity: 'mild' | 'moderate' | 'severe' | string
  probability: number
  subtitle?: string
  detail: CauseDetail
}

export interface PatientInfo {
  name: string
  age: number
  gender: string
}

export interface MedicalReportResponse {
  report_id: string
  assessment_topic: string
  generated_at: string
  patient_info: PatientInfo
  summary: string[]
  possible_causes: PossibleCause[]
  advice: string[]
  urgency_level: string
}

// ─── Chat Types ───────────────────────────────────────────────

export interface ProfileEntry {
  question: string
  answer: string
}

export interface ChatStartRequest {
  profile_data: ProfileEntry[]
  reports: Record<string, unknown>[]
}

export interface ChatStartResponse {
  session_id: string
  message: string
  is_first: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatMessageRequest {
  session_id: string
  history: ChatMessage[]
}

export interface ChatMessageResponse {
  message: string
}
