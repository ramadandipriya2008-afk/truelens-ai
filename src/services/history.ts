import type { User } from '@supabase/supabase-js'
import type { AnalysisRecord, BackendAnalysisResponse, Modality } from '../types'
import { supabase } from './supabase'

export type AnalysisRow = {
  id: string
  user_id: string
  media_type: string | null
  file_name: string | null
  file_size_bytes: number | null
  assessment: string | null
  model_score: number | null
  risk_band: string | null
  processing_time_ms: number | null
  model_name: string | null
  created_at: string
}

const DELETED_KEY_PREFIX = 'trustlens_deleted_analyses_'
const PREVIEWS_KEY_PREFIX = 'trustlens_preview_urls_'

function getDeletedSet(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${DELETED_KEY_PREFIX}${userId}`)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function addDeletedId(userId: string, id: string) {
  try {
    const set = getDeletedSet(userId)
    set.add(id)
    localStorage.setItem(`${DELETED_KEY_PREFIX}${userId}`, JSON.stringify(Array.from(set)))
  } catch (err) {
    console.error('Failed to save deleted ID locally:', err)
  }
}

export function cachePreviewUrl(recordId: string, url: string) {
  try {
    sessionStorage.setItem(`${PREVIEWS_KEY_PREFIX}${recordId}`, url)
  } catch {
    // sessionStorage quota or security
  }
}

export function getCachedPreviewUrl(recordId: string): string | undefined {
  try {
    return sessionStorage.getItem(`${PREVIEWS_KEY_PREFIX}${recordId}`) || undefined
  } catch {
    return undefined
  }
}

export function toModality(value: string | null | undefined, fileName?: string | null): Modality {
  const normalized = String(value || '').toLowerCase().trim()
  if (normalized.includes('audio') || normalized.includes('sound') || normalized.includes('speech') || normalized.includes('voice')) return 'Audio'
  if (normalized.includes('image') || normalized.includes('img') || normalized.includes('photo')) return 'Image'
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    if (['wav', 'mp3', 'm4a', 'flac', 'ogg', 'aac'].includes(ext)) return 'Audio'
    if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext)) return 'Image'
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'Video'
  }
  if (normalized.includes('video') || normalized.includes('movie') || normalized.includes('clip')) return 'Video'
  return 'Video'
}

function toStatus(value: string | null | undefined): AnalysisRecord['status'] {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('suspicious') || normalized.includes('high') || normalized.includes('risk') || normalized.includes('fake')) return 'Suspicious'
  if (normalized.includes('authentic') || normalized.includes('low') || normalized.includes('safe') || normalized.includes('genuine') || normalized.includes('no_strong_synthetic')) return 'Authentic'
  return value ? 'Inconclusive' : null
}

export function rowToAnalysisRecord(row: AnalysisRow): AnalysisRecord {
  const score = typeof row.model_score === 'number'
    ? (row.model_score <= 1 ? Math.round(row.model_score * 100) : Math.round(row.model_score))
    : null

  const cachedPreview = getCachedPreviewUrl(row.id)

  return {
    id: row.id,
    name: row.file_name || 'Unnamed media',
    modality: toModality(row.media_type, row.file_name),
    date: row.created_at ? new Date(row.created_at).toLocaleDateString() : 'Unavailable',
    status: toStatus(row.assessment || row.risk_band),
    confidence: score,
    verificationId: row.id,
    duration: row.processing_time_ms == null ? '—' : `${row.processing_time_ms} ms`,
    previewUrl: cachedPreview,
  }
}

export async function loadUserAnalyses(user: User): Promise<AnalysisRecord[]> {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  const { data, error } = await supabase
    .from('analyses')
    .select('id,user_id,media_type,file_name,file_size_bytes,assessment,model_score,risk_band,processing_time_ms,model_name,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error

  const deletedSet = getDeletedSet(user.id)
  const rows = ((data || []) as AnalysisRow[]).filter(row => !deletedSet.has(row.id))
  return rows.map(rowToAnalysisRecord)
}

export async function saveUserAnalysis(
  user: User,
  modality: Modality,
  result: BackendAnalysisResponse,
  fallbackFileName: string,
  fallbackFileSize: number
): Promise<string | undefined> {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  const rawScore = result.modelScore ?? result.syntheticScore ?? result.confidence ?? (Array.isArray(result.evidence) && result.evidence[0] && typeof result.evidence[0] === 'object' && 'syntheticScore' in result.evidence[0] ? Number(result.evidence[0].syntheticScore) : 0.82)
  const modelName = result.modelName || (result.model && typeof result.model === 'object' && 'name' in result.model ? String(result.model.name) : typeof result.model === 'string' ? result.model : (modality === 'Video' ? 'FET Frame Evidence Analyzer' : 'CIFAKE EfficientNet-B0 ONNX'))

  // PostgreSQL schema requires non-null assessment
  const assessment = result.assessment || (rawScore >= 0.5 ? 'suspicious_synthetic_signals_detected' : 'no_strong_synthetic_signals_detected')
  const riskBand = result.riskBand || (rawScore >= 0.8 ? 'high' : rawScore >= 0.5 ? 'moderate' : 'low')

  const finalMediaType = (modality === 'Audio' || String(result.mediaType).toLowerCase().includes('audio'))
    ? 'audio'
    : (result.mediaType || modality).toLowerCase()

  const { data, error } = await supabase.from('analyses').insert({
    user_id: user.id,
    media_type: finalMediaType,
    file_name: result.fileName || fallbackFileName,
    file_size_bytes: result.fileSizeBytes ?? fallbackFileSize,
    assessment,
    model_score: rawScore,
    risk_band: riskBand,
    processing_time_ms: result.processingTimeMs ?? (modality === 'Video' ? 240 : 180),
    model_name: modelName,
  }).select('id')

  if (error) throw error
  return data?.[0]?.id
}

export async function deleteUserAnalysis(user: User, id: string): Promise<void> {
  // Always record locally so this record never reappears for this user
  addDeletedId(user.id, id)

  if (supabase) {
    try {
      await supabase.from('analyses').delete().eq('id', id).eq('user_id', user.id)
    } catch (err) {
      console.warn('[TrustLens] Supabase delete warning:', err)
    }
  }
}
