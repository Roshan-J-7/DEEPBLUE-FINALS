// ─── Auth Types ───────────────────────────────────────────────

export interface AuthRequest {
  email: string
  password: string
}

export interface AuthResponse {
  success: boolean
  message: string
  token?: string
}

// ─── Assessment Types ─────────────────────────────────────────

export interface ResponseOption {
  id: string
  label: string
}

export interface Question {
  question_id: string
  text: string
  response_type: 'text' | 'number' | 'single_choice' | 'multi_choice' | 'image'
  response_options?: ResponseOption[] | null
  is_compulsory: boolean
}

export interface StoredAnswerItem {
  question_id: string
  question_text: string
  answer_json: Record<string, unknown>
}

export interface AssessmentStartResponse {
  session_id: string
  question: Question
  stored_answers?: StoredAnswerItem[]
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
  session_id: string
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
  entry_point: string          // "home" | "assessment"
  main_report_id?: string | null
}

export interface ChatStartResponse {
  session_id: string
  message: string
}

export interface ChatMessageRequest {
  session_id: string
  message: string
}

export interface ChatMessageResponse {
  message: string
}

// ─── Bootstrap / Onboarding Types ────────────────────────────

export interface BootstrapAnswer {
  question_id: string
  question_text: string
  answer_json: Record<string, unknown>
}

/** Shape returned by backend GET /user/bootstrap → reports[] */
export interface BootstrapReportWrapper {
  report_id: string
  assessment_topic: string
  urgency_level: string
  created_at: string
  report_data: MedicalReportResponse
}

export interface BootstrapResponse {
  reports?: BootstrapReportWrapper[]
  profile?: BootstrapAnswer[]
  medical?: BootstrapAnswer[]
}

export interface OnboardingAnswer {
  question_id: string
  question_text: string
  answer_json: Record<string, unknown>
}

export interface OnboardingRequest {
  answer_json: OnboardingAnswer[]
}

export interface OnboardingResponse {
  success: boolean
  message: string
}
