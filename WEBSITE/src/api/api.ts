import type {
  AssessmentStartResponse,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  SubmitReportRequest,
  MedicalReportResponse,
  ChatStartRequest,
  ChatStartResponse,
  ChatMessageRequest,
  ChatMessageResponse,
} from '../types/api.types'

const BASE_URL = 'http://13.63.63.157:8000'

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ─── Assessment ────────────────────────────────────────────────

export const api = {
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

    /** POST /assessment/report — send all Q&A, receive full AI medical report */
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
    /** POST /chat/start — begin chat with Remy, passing profile + optional report */
    start(body: ChatStartRequest): Promise<ChatStartResponse> {
      return request<ChatStartResponse>('/chat/start', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    /** POST /chat/message — send message, get Remy's response */
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
}
