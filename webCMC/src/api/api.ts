import type {
  AuthRequest,
  AuthResponse,
  AssessmentStartResponse,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  SubmitReportRequest,
  MedicalReportResponse,
  ChatStartRequest,
  ChatStartResponse,
  ChatMessageRequest,
  ChatMessageResponse,
  BootstrapResponse,
  OnboardingRequest,
  OnboardingResponse,
} from '../types/api.types'
import { tokenStore } from '../store/healthStore'

const BASE_URL = '/api'

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = tokenStore.get()
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {}

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader, ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ─── Auth ──────────────────────────────────────────────────────

async function authRequest(path: string, body: AuthRequest): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  try {
    return await res.json() as AuthResponse
  } catch {
    return { success: false, message: `Server error (${res.status})` }
  }
}

export const api = {
  auth: {
    signup(body: AuthRequest): Promise<AuthResponse> {
      return authRequest('/auth/signup', body)
    },

    login(body: AuthRequest): Promise<AuthResponse> {
      return authRequest('/auth/login', body)
    },
  },

  // ─── Assessment ────────────────────────────────────────────────

  assessment: {
    /** GET /assessment/start — creates session and returns first question */
    start(): Promise<AssessmentStartResponse> {
      return request<AssessmentStartResponse>('/assessment/start')
    },

    /** POST /assessment/answer — submit answer, get next question or "completed" */
    answer(body: SubmitAnswerRequest): Promise<SubmitAnswerResponse> {
      return request<SubmitAnswerResponse>('/assessment/answer', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    /** POST /assessment/report — session_id only; backend reconstructs from DB */
    report(body: SubmitReportRequest): Promise<MedicalReportResponse> {
      return request<MedicalReportResponse>('/assessment/report', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    /** POST /assessment/end — cleanup session */
    end(session_id: string): Promise<void> {
      return request<void>('/assessment/end', {
        method: 'POST',
        body: JSON.stringify({ session_id }),
      })
    },
  },

  chat: {
    /** POST /chat/start — begin chat with Remy (requires JWT) */
    start(body: ChatStartRequest): Promise<ChatStartResponse> {
      return request<ChatStartResponse>('/chat/start', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    /** POST /chat/message — send message, get Remy's response (requires JWT) */
    message(body: ChatMessageRequest): Promise<ChatMessageResponse> {
      return request<ChatMessageResponse>('/chat/message', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    /** POST /chat/end — delete session from server */
    end(session_id: string): Promise<void> {
      return request<void>('/chat/end', {
        method: 'POST',
        body: JSON.stringify({ session_id }),
      })
    },
  },

  // ─── User ──────────────────────────────────────────────────────

  user: {
    /** GET /user/bootstrap — sync all user data after login */
    bootstrap(): Promise<BootstrapResponse> {
      return request<BootstrapResponse>('/user/bootstrap')
    },

    /** GET /user/reports — all past reports for this user */
    reports(): Promise<MedicalReportResponse[]> {
      return request<MedicalReportResponse[]>('/user/reports')
    },

    /** POST /user/profile/onboarding — save profile answers */
    profileOnboarding(body: OnboardingRequest): Promise<OnboardingResponse> {
      return request<OnboardingResponse>('/user/profile/onboarding', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    /** POST /user/medical/onboarding — save medical answers */
    medicalOnboarding(body: OnboardingRequest): Promise<OnboardingResponse> {
      return request<OnboardingResponse>('/user/medical/onboarding', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },
  },
}
