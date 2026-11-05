export type Modality = 'Video' | 'Image' | 'Audio'
export type AnalysisStatus = 'Authentic' | 'Suspicious' | 'Inconclusive'
export type ToastTone = 'success' | 'info' | 'warning'

export interface UploadedMedia {
  name: string
  size: number
  mimeType: string
  modality: Modality
  url?: string
  file?: File
}

export interface AnalysisRecord {
  id: string
  name: string
  modality: Modality
  date: string
  status: AnalysisStatus | null
  confidence: number | null
  verificationId: string
  duration: string
  previewUrl?: string
}

export interface AnalysisConfig {
  [key: string]: boolean
}

export interface EvidenceItem {
  title: string
  description: string
  severity: 'high' | 'medium' | 'low'
}

export interface VerificationReport {
  verificationId: string
  media: UploadedMedia
  status: AnalysisStatus | null
  confidence: number
  analyzedAt: string
  evidence: EvidenceItem[]
}

export interface FETFrame {
  index: number
  frameNumber: number
  timestamp: string
  seconds: number
  anomalyScore: number
  confidence: number
  isFlagged: boolean
  thumbnail?: string
  categories: {
    facialInconsistencies: 'FLAGGED' | 'REVIEW' | 'NORMAL'
    blendingArtifacts: 'FLAGGED' | 'REVIEW' | 'NORMAL'
    temporalAnomalies: 'FLAGGED' | 'REVIEW' | 'NORMAL'
  }
}

export interface BackendAnalysisResponse {
  analysisId?: string | null
  mediaType?: string | null
  fileName?: string | null
  fileSizeBytes?: number | null
  createdAt?: string | null
  processingTimeMs?: number | null
  assessment?: string | null
  riskBand?: string | null
  modelScore?: number | null
  syntheticScore?: number | null
  confidence?: number | null
  confidenceMethod?: string | null
  evidence?: unknown[] | Record<string, unknown> | string | null
  details?: unknown[] | Record<string, unknown> | string | null
  limitations?: unknown[] | Record<string, unknown> | string | null
  warnings?: unknown[] | Record<string, unknown> | string | null
  model?: string | Record<string, unknown> | null
  modelName?: string | null
}

export interface BackendHealthResponse {
  status?: string | null
  [key: string]: unknown
}

export interface ApiErrorInfo {
  status: number | null
  message: string
}
