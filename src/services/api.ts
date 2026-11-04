import type { ApiErrorInfo, BackendAnalysisResponse, BackendHealthResponse, Modality } from '../types'

const configuredBaseUrl = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  (import.meta.env.NEXT_PUBLIC_API_BASE_URL as string | undefined)?.trim() ||
  'http://127.0.0.1:8000/api/v1'
)
const API_URL = configuredBaseUrl.replace(/\/$/, '')
const REQUEST_TIMEOUT_MS = 120000

export class BackendApiError extends Error {
  status: number | null
  info: ApiErrorInfo

  constructor(info: ApiErrorInfo) {
    super(info.message)
    this.name = 'BackendApiError'
    this.status = info.status
    this.info = info
  }
}

function messageForStatus(status: number) {
  const messages: Record<number, string> = {
    400: 'The backend rejected this media as invalid. Check the file and try again.',
    413: 'This file is too large for the backend to process.',
    415: 'This file format is not supported by the backend.',
    422: 'The backend could not validate this media. Check the file and try again.',
    500: 'The backend encountered an error while processing this media.',
    503: 'Detection model unavailable. Please retry shortly.',
    504: 'The backend request timed out. Please retry.',
  }
  return messages[status] || `The backend request failed (HTTP ${status}).`
}

async function readError(response: Response) {
  let detail = ''
  try {
    const body = await response.json() as { detail?: unknown; message?: unknown }
    const value = body.detail ?? body.message
    detail = typeof value === 'string' ? value : ''
  } catch {
    // The response may not contain JSON.
  }
  return detail ? `${messageForStatus(response.status)} ${detail}` : messageForStatus(response.status)
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new BackendApiError({ status: null, message: 'Backend is not configured. Set VITE_API_BASE_URL to connect FastAPI.' })
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const url = `${API_URL}${path}`

  try {
    const response = await fetch(url, {
      mode: 'cors',
      ...init,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new BackendApiError({ status: response.status, message: await readError(response) })
    }

    return await response.json() as T
  } catch (err) {
    if (err instanceof BackendApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new BackendApiError({ status: 504, message: messageForStatus(504) })
    }
    console.error(`[TrustLens API] Request failed for ${url}:`, err)
    throw new BackendApiError({
      status: null,
      message: `The backend cannot be reached at ${url}. Check that FastAPI is running on port 8000 and CORS allows origin ${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}.`,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

function endpointFor(modality: Modality) {
  return modality === 'Image' ? '/analyze/image' : modality === 'Video' ? '/analyze/video' : '/analyze/audio'
}

export const api = {
  isConfigured: Boolean(API_URL),
  baseUrl: API_URL,
  health: () => requestJson<BackendHealthResponse>('/health'),
  analyze: (modality: Modality, file: File) => {
    const body = new FormData()
    body.append('file', file)
    return requestJson<BackendAnalysisResponse>(endpointFor(modality), { method: 'POST', body })
  },
}

export const apiConfig = { baseUrl: API_URL, configured: Boolean(API_URL) }
