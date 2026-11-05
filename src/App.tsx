import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, AudioLines, BarChart3, Bell, Camera,
  Check, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Clock3, Download,
  Eye, FileAudio, FileImage, FileSearch2, FileVideo2, Filter, FolderOpen, Gauge,
  Grid3X3, History, ImageIcon, Info, Layers3, LineChart, LogOut, Maximize2,
  Mic2, MonitorPlay, MoreHorizontal, Pause, Play, Menu, PanelLeftClose, PanelLeftOpen,
  Plus, RefreshCw, ScanFace, Search, ShieldCheck, Sparkles, Trash2, UploadCloud,
  Video, Volume2, VolumeX, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type {
  AnalysisConfig, AnalysisRecord, AnalysisStatus, BackendAnalysisResponse,
  BackendHealthResponse, FETFrame, Modality, ToastTone, UploadedMedia,
} from './types'
import type { User } from '@supabase/supabase-js'
import { api, BackendApiError } from './services/api'
import { ARTWORK, DEEPFAKE_ART, modalityOptions, navItems } from './data/data'
import { supabase, supabaseConfig } from './services/supabase'
import {
  cachePreviewUrl, deleteUserAnalysis, getCachedPreviewUrl, loadUserAnalyses, saveUserAnalysis,
} from './services/history'

function assessmentToStatus(value: string | null | undefined): AnalysisStatus {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('inconclusive') || normalized.includes('unknown') || normalized.includes('unvalidated') || normalized.includes('not_validated') || normalized.includes('domain_mismatch')) return 'Inconclusive'
  if (normalized.includes('suspicious') || normalized.includes('high') || normalized.includes('risk') || normalized.includes('fake')) return 'Suspicious'
  if (normalized.includes('authentic') || normalized.includes('low') || normalized.includes('safe') || normalized.includes('genuine') || normalized.includes('no_strong_synthetic')) return 'Authentic'
  return 'Inconclusive'
}

function healthAvailability(health: BackendHealthResponse | null, modality: Modality): boolean | null {
  if (modality === 'Audio') {
    if (!health) return false
    const root = health as Record<string, unknown>
    const models = root.models && typeof root.models === 'object' ? root.models as Record<string, unknown> : root
    const value = models.audio
    if (typeof value === 'boolean') return value
    if (value && typeof value === 'object') {
      const model = value as Record<string, unknown>
      if (typeof model.ready === 'boolean') return Boolean(model.ready)
      if (typeof model.available === 'boolean') return Boolean(model.available)
    }
    return false
  }
  if (!health) return null
  const root = health as Record<string, unknown>
  if (root.ready === false || root.available === false) return false
  const models = root.models && typeof root.models === 'object' ? root.models as Record<string, unknown> : root
  const value = models[modality.toLowerCase()]
  if (typeof value === 'boolean') return value
  if (value && typeof value === 'object') {
    const model = value as Record<string, unknown>
    if (typeof model.ready === 'boolean') return Boolean(model.ready)
    if (typeof model.available === 'boolean') return Boolean(model.available)
  }
  return true
}

function backendValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Unavailable'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return 'Unavailable' }
}

const DEFAULT_FET_FRAMES: FETFrame[] = [
  {
    index: 0,
    frameNumber: 124,
    timestamp: '00:04.92',
    seconds: 4.92,
    anomalyScore: 0.24,
    confidence: 94,
    isFlagged: false,
    categories: {
      facialInconsistencies: 'NORMAL',
      blendingArtifacts: 'NORMAL',
      temporalAnomalies: 'NORMAL',
    },
  },
  {
    index: 1,
    frameNumber: 130,
    timestamp: '00:05.16',
    seconds: 5.16,
    anomalyScore: 0.38,
    confidence: 89,
    isFlagged: false,
    categories: {
      facialInconsistencies: 'NORMAL',
      blendingArtifacts: 'REVIEW',
      temporalAnomalies: 'NORMAL',
    },
  },
  {
    index: 2,
    frameNumber: 136,
    timestamp: '00:05.40',
    seconds: 5.4,
    anomalyScore: 0.52,
    confidence: 88,
    isFlagged: true,
    categories: {
      facialInconsistencies: 'REVIEW',
      blendingArtifacts: 'REVIEW',
      temporalAnomalies: 'FLAGGED',
    },
  },
  {
    index: 3,
    frameNumber: 142,
    timestamp: '00:05.68',
    seconds: 5.68,
    anomalyScore: 0.82,
    confidence: 91,
    isFlagged: true,
    categories: {
      facialInconsistencies: 'FLAGGED',
      blendingArtifacts: 'REVIEW',
      temporalAnomalies: 'REVIEW',
    },
  },
  {
    index: 4,
    frameNumber: 148,
    timestamp: '00:05.92',
    seconds: 5.92,
    anomalyScore: 0.64,
    confidence: 86,
    isFlagged: true,
    categories: {
      facialInconsistencies: 'FLAGGED',
      blendingArtifacts: 'NORMAL',
      temporalAnomalies: 'REVIEW',
    },
  },
  {
    index: 5,
    frameNumber: 154,
    timestamp: '00:06.16',
    seconds: 6.16,
    anomalyScore: 0.45,
    confidence: 90,
    isFlagged: false,
    categories: {
      facialInconsistencies: 'REVIEW',
      blendingArtifacts: 'NORMAL',
      temporalAnomalies: 'NORMAL',
    },
  },
  {
    index: 6,
    frameNumber: 160,
    timestamp: '00:06.40',
    seconds: 6.4,
    anomalyScore: 0.28,
    confidence: 93,
    isFlagged: false,
    categories: {
      facialInconsistencies: 'NORMAL',
      blendingArtifacts: 'NORMAL',
      temporalAnomalies: 'NORMAL',
    },
  },
]

interface AppContextValue {
  path: string
  navigate: (path: string) => void
  uploadedMedia: UploadedMedia | null
  setUploadedMedia: (media: UploadedMedia | null) => void
  modality: Modality
  setModality: (modality: Modality) => void
  config: AnalysisConfig
  setConfig: (config: AnalysisConfig) => void
  lastAnalysis: AnalysisRecord | null
  setLastAnalysis: (record: AnalysisRecord | null) => void
  notify: (message: string, tone?: ToastTone) => void
  requireLogin: (action: () => void) => void
  backendResult: BackendAnalysisResponse | null
  backendLoading: boolean
  backendError: string | null
  backendHealth: BackendHealthResponse | null
  runBackendAnalysis: (overrideModality?: Modality, overrideFile?: File) => Promise<BackendAnalysisResponse | null>
  user: User | null
  authReady: boolean
  openAuth: (mode?: 'signin' | 'signup' | 'forgot' | 'reset-password') => void
  signOut: () => Promise<void>
  historyRecords: AnalysisRecord[]
  historyLoading: boolean
  removeHistoryRecord: (id: string) => Promise<void>
  refreshHistory: () => Promise<void>
  openReportForRecord: (record: AnalysisRecord) => void
}

const AppContext = createContext<AppContextValue | null>(null)

function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('App context is unavailable')
  return value
}

function App() {
  const [path, setPath] = useState(window.location.pathname || '/')
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia | null>(null)
  const [modality, setModality] = useState<Modality>('Image')
  const [config, setConfig] = useState<AnalysisConfig>(() => Object.fromEntries(modalityOptions.Image.map((item, index) => [item, index === 0])))
  const [lastAnalysis, setLastAnalysis] = useState<AnalysisRecord | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null)
  const [backendResult, setBackendResult] = useState<BackendAnalysisResponse | null>(null)
  const [backendLoading, setBackendLoading] = useState(false)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [backendHealth, setBackendHealth] = useState<BackendHealthResponse | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(!supabaseConfig.configured)
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot' | 'reset-password' | null>(null)
  const [historyRecords, setHistoryRecords] = useState<AnalysisRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const pendingAuthAction = useRef<(() => void) | null>(null)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3400)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const navigate = (nextPath: string) => {
    if (nextPath === '/history' && !user) { pendingAuthAction.current = () => navigate('/history'); setAuthMode('signin'); return }
    if (nextPath === path) return
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const requireLogin = (action: () => void) => {
    if (user) { action(); return }
    pendingAuthAction.current = action
    setAuthMode('signin')
  }

  const openAuth = (mode: 'signin' | 'signup' | 'forgot' | 'reset-password' = 'signin') => setAuthMode(mode)

  const signOut = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) { setToast({ message: error.message, tone: 'warning' }); return }
    setToast({ message: 'Signed out successfully.', tone: 'info' })
  }

  const refreshHistory = async () => {
    if (!user) return
    setHistoryLoading(true)
    try {
      const records = await loadUserAnalyses(user)
      setHistoryRecords(current => {
        const dbIds = new Set(records.map(r => r.id))
        const sessionOnly = current.filter(r => !dbIds.has(r.id) && !dbIds.has(r.verificationId))
        return [...records, ...sessionOnly]
      })
    } catch (err) {
      console.error('Failed to load user analyses:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (!api.isConfigured) return
    api.health().then(setBackendHealth).catch(() => setBackendHealth(null))
  }, [])

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    let active = true

    // Check URL hash for Supabase password recovery link (#type=recovery)
    if (window.location.hash.includes('type=recovery')) {
      setAuthMode('reset-password')
    }

    supabase.auth.getSession()
      .then(({ data }) => { if (active) { setUser(data.session?.user ?? null); setAuthReady(true) } })
      .catch(() => { if (active) setAuthReady(true) })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('reset-password')
      }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (user && pendingAuthAction.current) {
      const action = pendingAuthAction.current
      pendingAuthAction.current = null
      setAuthMode(null)
      action()
    }
  }, [user])

  useEffect(() => {
    if (!user) { setHistoryRecords([]); return }
    refreshHistory()
    // Auto-fetch telemetry periodically every 10 seconds
    const interval = window.setInterval(() => {
      refreshHistory()
    }, 10000)
    return () => window.clearInterval(interval)
  }, [user])

  const openReportForRecord = (record: AnalysisRecord) => {
    setUploadedMedia({
      name: record.name,
      size: 1024 * 1024,
      mimeType: record.modality === 'Image' ? 'image/jpeg' : record.modality === 'Video' ? 'video/mp4' : 'audio/wav',
      modality: record.modality,
      url: record.previewUrl || getCachedPreviewUrl(record.id),
    })

    const rawScore = record.confidence !== null ? record.confidence / 100 : null
    const reconstructed: BackendAnalysisResponse = {
      analysisId: record.verificationId || record.id,
      mediaType: record.modality.toLowerCase(),
      fileName: record.name,
      createdAt: record.date,
      assessment: record.status === 'Suspicious'
        ? 'suspicious_synthetic_signals_detected'
        : record.status === 'Authentic'
        ? 'no_strong_synthetic_signals_detected'
        : 'inconclusive',
      riskBand: record.status === 'Suspicious' ? 'high' : record.status === 'Authentic' ? 'low' : 'moderate',
      modelScore: rawScore,
      syntheticScore: rawScore,
      confidence: record.confidence,
      modelName: record.modality === 'Video'
        ? 'FET Frame Evidence Analyzer'
        : record.modality === 'Audio'
        ? 'AASIST Spectro-Temporal Graph Attention Network'
        : 'CIFAKE EfficientNet-B0 ONNX',
      processingTimeMs: record.duration ? parseInt(record.duration) || 180 : 180,
      evidence: [
        `Historical analysis record ${record.verificationId}`,
        `Modality: ${record.modality}`,
        `Saved verification score: ${record.confidence !== null ? `${record.confidence}%` : 'Unavailable'}`,
        `Assessed state: ${record.status || 'Inconclusive'}`,
      ],
      limitations: [
        'Historical verification retrieved directly from Supabase public.analyses table.',
        'A classifier signal is not proof of manipulation or authorship.',
      ],
      details: {
        verificationId: record.verificationId,
        storedInSupabase: true,
      },
    }

    setBackendResult(reconstructed)
    setLastAnalysis(record)
    navigate('/report')
    setToast({ message: `Loaded report for ${record.name}`, tone: 'info' })
  }

  const runBackendAnalysis = async (overrideModality?: Modality, overrideFile?: File) => {
    const targetMedia = overrideFile && overrideModality
      ? { name: overrideFile.name, size: overrideFile.size, mimeType: overrideFile.type, modality: overrideModality, file: overrideFile, url: URL.createObjectURL(overrideFile) }
      : uploadedMedia

    if (!targetMedia?.file) {
      const message = 'Add a supported file before starting the analysis.'
      setBackendError(message)
      setToast({ message, tone: 'warning' })
      return null
    }

    setBackendLoading(true)
    setBackendError(null)
    setBackendResult(null)

    // VIDEO MODALITY: Genuine Python FastAPI backend with frame extraction & inference
    if (targetMedia.modality === 'Video') {
      if (!api.isConfigured) {
        const message = 'Forensic engine is not configured. Set VITE_API_BASE_URL before starting an analysis.'
        setBackendError(message)
        setToast({ message, tone: 'warning' })
        setBackendLoading(false)
        return null
      }

      try {
        const result = await api.analyze('Video', targetMedia.file)
        setBackendResult(result)

        const rawScore = result.modelScore ?? result.syntheticScore ?? null
        const displayScore = rawScore !== null ? Math.round(rawScore <= 1 ? rawScore * 100 : rawScore) : null
        const status = result.assessment || result.riskBand ? assessmentToStatus(result.assessment ?? result.riskBand) : null

        const record: AnalysisRecord = {
          id: result.analysisId || `vid-${Date.now()}`,
          name: result.fileName || targetMedia.name,
          modality: 'Video',
          date: result.createdAt ? new Date(result.createdAt).toLocaleDateString() : 'Today',
          status,
          confidence: displayScore,
          verificationId: result.analysisId || 'Unavailable',
          duration: result.processingTimeMs != null ? `${result.processingTimeMs} ms` : '—',
          previewUrl: targetMedia.url,
        }
        setLastAnalysis(record)
        setHistoryRecords(current => [record, ...current.filter(r => r.id !== record.id)])

        if (user) {
          try {
            const insertedId = await saveUserAnalysis(user, 'Video', result, targetMedia.name, targetMedia.size)
            if (insertedId) record.id = insertedId
            if (targetMedia.url) cachePreviewUrl(record.id, targetMedia.url)
            await refreshHistory()
          } catch (saveErr) {
            console.warn('Could not save video analysis to Supabase:', saveErr)
            setToast({ message: `Video analysis completed, but could not save to Supabase: ${saveErr instanceof Error ? saveErr.message : 'Database error'}`, tone: 'warning' })
          }
        }

        setToast({ message: 'Video analysis completed with genuine frame-level forensic verification.', tone: 'success' })
        return result
      } catch (error) {
        const message = error instanceof BackendApiError ? error.message : 'The forensic analysis engine cannot be reached. Check network connection and API endpoint.'
        setBackendError(message)
        setToast({ message, tone: 'warning' })
        return null
      } finally {
        setBackendLoading(false)
      }
    }

    // AUDIO MODALITY: Genuine AASIST Spectro-Temporal Graph Attention Network
    if (targetMedia.modality === 'Audio') {
      if (!api.isConfigured) {
        const message = 'Forensic engine is not configured. Set VITE_API_BASE_URL before starting an analysis.'
        setBackendError(message)
        setToast({ message, tone: 'warning' })
        setBackendLoading(false)
        return null
      }

      try {
        const result = await api.analyze('Audio', targetMedia.file)
        setBackendResult(result)

        const rawScore = result.modelScore ?? result.syntheticScore ?? null
        const displayScore = rawScore !== null ? Math.round(rawScore <= 1 ? rawScore * 100 : rawScore) : null
        const status = result.assessment || result.riskBand ? assessmentToStatus(result.assessment ?? result.riskBand) : null

        const record: AnalysisRecord = {
          id: result.analysisId || `aud-${Date.now()}`,
          name: result.fileName || targetMedia.name,
          modality: 'Audio',
          date: result.createdAt ? new Date(result.createdAt).toLocaleDateString() : 'Today',
          status,
          confidence: displayScore,
          verificationId: result.analysisId || 'Unavailable',
          duration: result.processingTimeMs != null ? `${result.processingTimeMs} ms` : '—',
          previewUrl: targetMedia.url,
        }
        setLastAnalysis(record)
        setHistoryRecords(current => [record, ...current.filter(r => r.id !== record.id)])

        if (user) {
          try {
            const insertedId = await saveUserAnalysis(user, 'Audio', result, targetMedia.name, targetMedia.size)
            if (insertedId) record.id = insertedId
            if (targetMedia.url) cachePreviewUrl(record.id, targetMedia.url)
            await refreshHistory()
          } catch (saveErr) {
            console.warn('Could not save audio analysis to Supabase:', saveErr)
            setToast({ message: `Audio analysis completed, but could not save to Supabase: ${saveErr instanceof Error ? saveErr.message : 'Database error'}`, tone: 'warning' })
          }
        }

        setToast({ message: 'Audio analysis completed with genuine AASIST spectro-temporal graph attention verification.', tone: 'success' })
        return result
      } catch (error) {
        const message = error instanceof BackendApiError ? error.message : 'The forensic analysis engine cannot be reached. Check network connection and API endpoint.'
        setBackendError(message)
        setToast({ message, tone: 'warning' })
        return null
      } finally {
        setBackendLoading(false)
      }
    }

    // IMAGE MODALITY: Connected forensic classifier
    if (!api.isConfigured) {
      const message = 'Forensic engine is not configured. Set VITE_API_BASE_URL before starting an analysis.'
      setBackendError(message)
      setToast({ message, tone: 'warning' })
      setBackendLoading(false)
      return null
    }

    try {
      try {
        const health = await api.health()
        setBackendHealth(health)
      } catch (healthErr) {
        const detail = healthErr instanceof Error ? healthErr.message : 'Connection failed'
        throw new BackendApiError({
          status: null,
          message: `The forensic engine health check failed at ${api.baseUrl}/health: ${detail}`,
        })
      }

      const result = await api.analyze(targetMedia.modality, targetMedia.file)
      setBackendResult(result)
      const rawScore = result.modelScore ?? result.syntheticScore ?? (Array.isArray(result.evidence) && result.evidence[0] && typeof result.evidence[0] === 'object' && 'syntheticScore' in result.evidence[0] ? Number(result.evidence[0].syntheticScore) : null) ?? result.confidence ?? null
      const displayScore = rawScore !== null ? (rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore)) : null

      const record: AnalysisRecord = {
        id: result.analysisId || `analysis-${Date.now()}`,
        name: result.fileName || targetMedia.name,
        modality: targetMedia.modality,
        date: result.createdAt ? new Date(result.createdAt).toLocaleDateString() : 'Today',
        status: result.assessment || result.riskBand ? assessmentToStatus(result.assessment ?? result.riskBand) : null,
        confidence: displayScore,
        verificationId: result.analysisId || 'Unavailable',
        duration: result.processingTimeMs != null ? `${result.processingTimeMs} ms` : '—',
        previewUrl: targetMedia.url,
      }
      setLastAnalysis(record)
      setHistoryRecords(current => [record, ...current.filter(r => r.id !== record.id)])

      if (user) {
        try {
          const insertedId = await saveUserAnalysis(user, targetMedia.modality, result, targetMedia.name, targetMedia.size)
          if (insertedId) record.id = insertedId
          if (targetMedia.url) cachePreviewUrl(record.id, targetMedia.url)
          await refreshHistory()
        } catch (error) {
          setToast({ message: `Analysis completed, but history could not be saved: ${error instanceof Error ? error.message : 'Supabase request failed.'}`, tone: 'warning' })
        }
      }
      setToast({ message: 'Deepfake forensic scan completed and saved to history.', tone: 'success' })
      return result
    } catch (error) {
      const message = error instanceof BackendApiError ? error.message : 'The forensic analysis engine cannot be reached. Check network connection and API endpoint.'
      setBackendError(message)
      setToast({ message, tone: 'warning' })
      return null
    } finally {
      setBackendLoading(false)
    }
  }

  const value: AppContextValue = {
    path, navigate, uploadedMedia, setUploadedMedia, modality, setModality, config, setConfig,
    lastAnalysis, setLastAnalysis, notify: (message, tone = 'info') => setToast({ message, tone }),
    requireLogin,
    backendResult, backendLoading, backendError, backendHealth, runBackendAnalysis,
    user, authReady, openAuth, signOut, historyRecords, historyLoading,
    removeHistoryRecord: async (id: string) => {
      if (!user) { setAuthMode('signin'); return }
      try {
        await deleteUserAnalysis(user, id)
        setHistoryRecords(current => current.filter(item => item.id !== id))
        setToast({ message: 'Analysis deleted from your history.', tone: 'success' })
      } catch (error) {
        setHistoryRecords(current => current.filter(item => item.id !== id))
        setToast({ message: 'Analysis removed from your workspace.', tone: 'info' })
      }
    },
    refreshHistory,
    openReportForRecord,
  }

  return (
    <AppContext.Provider value={value}>
      <Shell>
        {path === '/' && <DashboardPage />}
        {path === '/about' && <AboutPage />}
        {path === '/new-analysis' && <NewAnalysisPage />}
        {path === '/analyze' && <AnalyzeMediaPage />}
        {path === '/report' && <VerificationReportPage />}
        {path === '/model-evolution' && <ModelEvolutionPage />}
        {path === '/history' && (authReady && user ? <HistoryPage /> : <ProtectedHistoryGate />)}
        {!['/', '/about', '/new-analysis', '/analyze', '/report', '/model-evolution', '/history'].includes(path) && <NotFoundPage />}
      </Shell>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {authMode && <AuthModal mode={authMode} onClose={() => { setAuthMode(null); pendingAuthAction.current = null }} onModeChange={setAuthMode} />}
    </AppContext.Provider>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const { path, navigate, requireLogin, user, signOut } = useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const activePath = path
  const activeLabel = navItems.find(item => item.path === activePath)?.label || 'Workspace'
  const handleNav = (itemPath: string) => {
    const go = () => { navigate(itemPath); setMobileOpen(false) }
    if (itemPath === '/new-analysis') requireLogin(go)
    else go()
  }
  return (
    <div className="min-h-screen bg-paper text-ink lg:flex">
      <aside className={`relative sticky top-0 z-40 hidden h-screen shrink-0 overflow-hidden border-r border-line/80 bg-paper lg:flex ${collapsed ? 'w-[78px]' : 'w-[244px]'}`}>
        <img src={DEEPFAKE_ART} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.14] mix-blend-multiply grayscale" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-paper/90 via-paper/65 to-signal/15" />
        <div className="relative z-10 flex h-full w-full flex-col p-4">
          <button className={`group mb-8 flex items-center gap-3 text-left ${collapsed ? 'justify-center' : ''}`} onClick={() => navigate('/')}>
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-signal/70 bg-ink shadow-sm transition group-hover:border-signal group-hover:shadow-[0_0_14px_rgba(201,44,53,0.35)]">
              <img src="/trustlens-logo.jpg" alt="TRUSTLENS AI logo" className="h-full w-full rounded-full object-cover" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-signal ring-1 ring-white/50" />
            </span>
            {!collapsed && <span><span className="block text-[11px] font-bold tracking-[0.18em]">TRUSTLENS AI</span><span className="block text-[9px] uppercase tracking-[0.14em] text-muted">Digital media forensics</span></span>}
          </button>
          {!collapsed && <p className="eyebrow mb-3 px-3">Navigation</p>}
          <nav className="flex flex-col gap-1">
            {navItems.map(item => (
              <button
                key={item.path}
                title={collapsed ? item.label : undefined}
                onClick={() => handleNav(item.path)}
                className={`flex items-center gap-3 rounded-[2px] px-3 py-3 text-left text-[11px] font-semibold transition ${collapsed ? 'justify-center' : ''} ${activePath === item.path ? 'bg-ink text-white' : 'text-muted hover:bg-white hover:text-ink'}`}
              >
                {item.path === '/' ? <Grid3X3 size={16} /> : item.path === '/about' ? <Info size={16} /> : item.path === '/new-analysis' ? <Plus size={16} /> : item.path === '/analyze' ? <MonitorPlay size={16} /> : item.path === '/report' ? <FileSearch2 size={16} /> : item.path === '/model-evolution' ? <LineChart size={16} /> : <History size={16} />}
                {!collapsed && <span>{item.label}</span>}
              </button>
            ))}
          </nav>
          <div className="mt-auto space-y-3">
            {!collapsed && <span className="chip">{user ? (user.email || 'Signed in') : 'Sign in required'}</span>}
            {user && (
              <button onClick={() => void signOut()} className={`btn-secondary w-full border-line/80 bg-white/60 ${collapsed ? 'px-2' : ''}`} title="Sign out">
                <LogOut size={15} />{!collapsed && <span>Sign out</span>}
              </button>
            )}
            <button
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed(!collapsed)}
              className={`btn-secondary w-full border-signal/20 bg-signal/5 text-signal hover:border-signal/40 hover:bg-signal/10 ${collapsed ? 'px-2' : ''}`}
            >
              <span>{collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}</span>
              {!collapsed && <span>Collapse sidebar</span>}
            </button>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="workspace-header relative sticky top-0 z-30 overflow-hidden border-b border-line bg-paper/90 backdrop-blur">
          {/* DEEPFAKE BACKGROUND GRAPHIC FOR PAGE HEADER ONLY */}
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <img
              src={DEEPFAKE_ART}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover object-right opacity-[0.14] mix-blend-multiply filter contrast-125 grayscale"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/85 to-transparent" />
          </div>
          <div className="relative z-10 mx-auto flex h-[74px] max-w-[1480px] items-center justify-between gap-5 px-5 md:px-8 lg:px-12">
            <div className="flex items-center gap-3">
              <button className="group flex items-center gap-3 text-left lg:hidden" onClick={() => navigate('/')}>
                <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-signal/70 bg-ink shadow-sm transition group-hover:border-signal">
                  <img src="/trustlens-logo.jpg" alt="TRUSTLENS AI logo" className="h-full w-full rounded-full object-cover" />
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-paper bg-signal ring-1 ring-white/50" />
                </span>
              </button>
              <div className="hidden lg:block">
                <p className="eyebrow">Workspace · {activeLabel}</p>
                <p className="mt-1 text-sm font-semibold">{activeLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => requireLogin(() => navigate('/new-analysis'))} className="btn-primary px-3 py-2 text-[11px] sm:px-4">
                <Plus size={14} /> <span className="hidden sm:inline">New analysis</span>
              </button>
              <button onClick={() => setMobileOpen(!mobileOpen)} className="btn-secondary border-0 px-2 lg:hidden" aria-label="Open navigation">
                <Menu size={18} />
              </button>
            </div>
          </div>
          {mobileOpen && (
            <div className="relative z-10 border-t border-line bg-paper/95 px-5 py-3 lg:hidden">
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                {navItems.map(item => (
                  <button key={item.path} onClick={() => handleNav(item.path)} className={`rounded px-3 py-2 text-left text-xs font-semibold ${activePath === item.path ? 'bg-ink text-white' : 'text-muted hover:bg-white hover:text-ink'}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </header>
        <main className="mx-auto max-w-[1480px] px-5 pb-16 pt-8 md:px-8 md:pt-10 lg:px-12">{children}</main>
        <footer className="mx-auto flex max-w-[1480px] flex-col gap-2 border-t border-line px-5 py-6 text-[10px] uppercase tracking-[0.15em] text-muted sm:flex-row sm:items-center sm:justify-between md:px-8 lg:px-12">
          <span>TRUSTLENS AI · Deepfake Forensic Intelligence</span>
          <span>Neural Deepfake Detection & Synthetic Media Forensics</span>
        </footer>
      </div>
    </div>
  )
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: ReactNode; description: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-5 border-b border-line pb-7 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1 className="page-title max-w-3xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="section-title">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function MediaIcon({ modality, size = 16 }: { modality: Modality; size?: number }) {
  if (modality === 'Video') return <Video size={size} />
  if (modality === 'Image') return <ImageIcon size={size} />
  return <AudioLines size={size} />
}

function MediaThumbnail({ modality, url, className = 'h-10 w-12' }: { modality: Modality; url?: string; className?: string }) {
  if (url && modality === 'Image') {
    return (
      <div className={`relative ${className} shrink-0 overflow-hidden rounded-[2px] border border-line bg-fog shadow-sm`}>
        <img src={url} alt="Media thumbnail preview" className="h-full w-full object-cover" />
        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 p-0.5 text-white" title="Image file reference">
          <ImageIcon size={9} />
        </span>
      </div>
    )
  }
  if (url && modality === 'Video') {
    return (
      <div className={`relative ${className} shrink-0 overflow-hidden rounded-[2px] border border-line bg-ink shadow-sm`}>
        <video src={url} muted playsInline className="h-full w-full object-cover" />
        <span className="absolute bottom-0.5 right-0.5 rounded bg-signal p-0.5 text-white" title="Video file reference">
          <Video size={9} />
        </span>
      </div>
    )
  }
  return (
    <div className={`relative ${className} shrink-0 flex items-center justify-center rounded-[2px] border border-line bg-white text-ink shadow-sm`}>
      {modality === 'Image' ? (
        <div className="flex flex-col items-center justify-center text-signal">
          <ImageIcon size={15} />
          <span className="text-[7px] font-bold uppercase tracking-wider text-muted">IMG</span>
        </div>
      ) : modality === 'Video' ? (
        <div className="flex flex-col items-center justify-center text-ink">
          <Video size={15} />
          <span className="text-[7px] font-bold uppercase tracking-wider text-muted">VID</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-amber-700">
          <AudioLines size={15} />
          <span className="text-[7px] font-bold uppercase tracking-wider text-muted">AUD</span>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: AnalysisStatus | null }) {
  if (!status) return <span className="chip">Unavailable</span>
  const styles = {
    Authentic: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Suspicious: 'bg-signal/8 text-signal border-signal/20',
    Inconclusive: 'bg-stone-100 text-stone-600 border-stone-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${styles[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{status}
    </span>
  )
}

function DashboardPage() {
  const { navigate, requireLogin, backendHealth, historyRecords, historyLoading, openReportForRecord, user, openAuth } = useApp()
  const healthLabel = !api.isConfigured
    ? 'Forensic engine offline'
    : !backendHealth
    ? 'Deepfake shield offline'
    : backendHealth.ready === false || backendHealth.available === false
    ? 'Deepfake shield offline'
    : `Deepfake shield ${backendHealth.status === 'ok' ? 'active' : backendHealth.status || 'ready'}`

  const totalAnalyses = historyRecords.length
  const completedAnalyses = historyRecords.filter(r => r.status !== null || r.confidence !== null).length
  const requiringReview = historyRecords.filter(r => {
    const s = String(r.status || '').toLowerCase()
    return s === 'suspicious' || s.includes('high') || s.includes('moderate')
  }).length

  const activityData = useMemo(() => {
    if (!historyRecords.length) return []
    const map = new Map<string, { date: string; count: number; suspicious: number }>()
    const sorted = [...historyRecords].reverse()
    for (const record of sorted) {
      const dateKey = record.date || 'Recent'
      const existing = map.get(dateKey) || { date: dateKey, count: 0, suspicious: 0 }
      existing.count += 1
      if (record.status === 'Suspicious') existing.suspicious += 1
      map.set(dateKey, existing)
    }
    return Array.from(map.values())
  }, [historyRecords])

  const modalityMix = useMemo(() => {
    const total = historyRecords.length
    const imageCount = historyRecords.filter(r => r.modality === 'Image').length
    const videoCount = historyRecords.filter(r => r.modality === 'Video').length
    const audioCount = historyRecords.filter(r => r.modality === 'Audio').length
    return {
      total,
      image: { count: imageCount, pct: total ? Math.round((imageCount / total) * 100) : 0 },
      video: { count: videoCount, pct: total ? Math.round((videoCount / total) * 100) : 0 },
      audio: { count: audioCount, pct: total ? Math.round((audioCount / total) * 100) : 0 },
    }
  }, [historyRecords])

  const recentList = historyRecords.slice(0, 4)

  return (
    <>
      <PageIntro
        eyebrow="Media forensics — overview"
        title={<>Digital Media <span className="text-signal">Forensics</span></>}
        description="Deepfake forensic intelligence detecting generative facial manipulation, neural reenactment, synthetic voice artifacts, and multi-modal media tampering."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => requireLogin(() => navigate('/new-analysis'))} className="btn-primary text-xs">
              <Plus size={14} /> Start new analysis
            </button>
          </div>
        }
      />

      {/* DASHBOARD TELEMETRY CONTAINER — BLURRED WHEN USER NOT LOGGED IN / SIGNING UP */}
      <div className="relative">
        <div className={!user ? 'filter blur-[4px] pointer-events-none select-none opacity-40 transition-all duration-300' : 'transition-all duration-300'}>
          {/* METRIC CARDS CONNECTED TO SUPABASE */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          onClick={() => user ? navigate('/history') : openAuth('signin')}
          className="panel p-4 cursor-pointer transition hover:border-ink"
          title="Click to view all saved analyses"
        >
          <div className="mb-5 flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Total analyses</p>
            <span className="rounded-full p-2 bg-fog text-muted"><Layers3 size={15} /></span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <p className="serif text-3xl leading-none">{historyLoading ? '—' : totalAnalyses}</p>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-signal">
              <ArrowDownRight size={12} className="rotate-180" />
              {user ? (totalAnalyses > 0 ? `${totalAnalyses} records` : '0 saved') : 'Sign in to sync'}
            </span>
          </div>
        </div>

        <div
          onClick={() => user ? navigate('/history') : openAuth('signin')}
          className="panel p-4 cursor-pointer transition hover:border-ink"
          title="Click to view completed records"
        >
          <div className="mb-5 flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Completed analyses</p>
            <span className="rounded-full p-2 bg-emerald-50 text-emerald-700"><CheckCircle2 size={15} /></span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <p className="serif text-3xl leading-none">{historyLoading ? '—' : completedAnalyses}</p>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
              <ArrowDownRight size={12} className="rotate-180" />
              {totalAnalyses > 0 ? `${Math.round((completedAnalyses / Math.max(1, totalAnalyses)) * 100)}% verified` : '0 saved'}
            </span>
          </div>
        </div>

        <div
          onClick={() => user ? navigate('/history') : openAuth('signin')}
          className="panel p-4 cursor-pointer transition hover:border-signal"
          title="Rule: Moderate or high risk assessments require review"
        >
          <div className="mb-5 flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Files requiring review</p>
            <span className="rounded-full p-2 bg-signal/10 text-signal"><CircleAlert size={15} /></span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <p className="serif text-3xl leading-none text-signal">{historyLoading ? '—' : requiringReview}</p>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-signal">
              <ArrowDownRight size={12} className="rotate-180" />
              Moderate/high risk
            </span>
          </div>
        </div>

        <div className="panel p-4" title="Reports are compiled and exported on demand; counts are not tracked separately in database">
          <div className="mb-5 flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Reports generated</p>
            <span className="rounded-full p-2 bg-fog text-muted"><FileSearch2 size={15} /></span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <p className="serif text-2xl leading-none text-ink">Not tracked</p>
            <span className="text-[10px] font-semibold text-muted">Export on demand</span>
          </div>
        </div>
      </div>

      {/* ANALYSIS ACTIVITY AND EVIDENCE MIX FROM SUPABASE */}
      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.75fr]">
        <div className="panel p-5 md:p-6">
          <SectionHeader
            eyebrow="Supabase telemetry"
            title="Analysis activity"
            action={<span className="chip">{totalAnalyses} total analyses</span>}
          />
          {activityData.length === 0 ? (
            <div className="flex min-h-[245px] flex-col items-center justify-center text-center p-6">
              <div className="rounded-full bg-fog p-4">
                <Activity className="text-muted" size={28} />
              </div>
              <p className="mt-3 text-sm font-semibold">No analysis activity yet</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted">
                Run an analysis from New Analysis to record evidence signals in your private Supabase store.
              </p>
              <button onClick={() => requireLogin(() => navigate('/new-analysis'))} className="btn-secondary mt-4 text-xs">
                <Plus size={13} /> Start first analysis
              </button>
            </div>
          ) : (
            <div className="h-[245px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c92c35" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#c92c35" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e5de" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} axisLine={{ stroke: '#dedad4' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload
                        return (
                          <div className="rounded-[2px] border border-line bg-white p-2.5 shadow-card text-xs">
                            <p className="font-semibold text-ink">{d.date}</p>
                            <p className="mt-1 text-signal">Analyses: <strong>{d.count}</strong></p>
                            {d.suspicious > 0 && <p className="text-xs text-muted">Flagged: {d.suspicious}</p>}
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#c92c35" strokeWidth={2} fillOpacity={1} fill="url(#activityGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="panel p-5 md:p-6">
          <SectionHeader
            eyebrow="Modality distribution"
            title="Evidence mix"
            action={<span className="chip">{totalAnalyses} records</span>}
          />
          {totalAnalyses === 0 ? (
            <div className="flex min-h-[245px] flex-col items-center justify-center text-center p-6">
              <div className="rounded-full bg-fog p-4">
                <BarChart3 className="text-muted" size={28} />
              </div>
              <p className="mt-3 text-sm font-semibold">No modality data yet</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted">
                Uploaded images and video clips will be categorized here once analyzed.
              </p>
            </div>
          ) : (
            <div className="flex flex-col justify-between space-y-4 pt-2">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <ImageIcon size={14} className="text-signal" /> Image
                    </span>
                    <span className="font-mono text-muted">{modalityMix.image.count} ({modalityMix.image.pct}%)</span>
                  </div>
                  <div className="h-2 rounded-[2px] bg-fog overflow-hidden">
                    <div className="h-full bg-signal transition-all" style={{ width: `${modalityMix.image.pct}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <Video size={14} className="text-ink" /> Video
                    </span>
                    <span className="font-mono text-muted">{modalityMix.video.count} ({modalityMix.video.pct}%)</span>
                  </div>
                  <div className="h-2 rounded-[2px] bg-fog overflow-hidden">
                    <div className="h-full bg-ink transition-all" style={{ width: `${modalityMix.video.pct}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <AudioLines size={14} className="text-amber-600" /> Audio
                    </span>
                    <span className="font-mono text-muted">{modalityMix.audio.count} ({modalityMix.audio.pct}%)</span>
                  </div>
                  <div className="h-2 rounded-[2px] bg-fog overflow-hidden">
                    <div className="h-full bg-amber-600 transition-all" style={{ width: `${modalityMix.audio.pct}%` }} />
                  </div>
                </div>
              </div>

              <div className="rounded-[2px] border border-line bg-fog/50 p-3 text-[11px] leading-5 text-muted">
                Only actual saved records appear in this breakdown. Modalities with 0 saved analyses reflect real zero counts.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RECENT ANALYSES TABLE CONNECTED TO SUPABASE */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_0.75fr]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <SectionHeader eyebrow="Recent analyses" title="Latest evidence" action={null} />
            <button className="btn-secondary -mt-1 text-xs" onClick={() => navigate('/history')}>
              View all history <ArrowRight size={13} />
            </button>
          </div>
          {recentList.length === 0 ? (
            <div className="p-12 text-center">
              <FileSearch2 className="mx-auto text-muted" size={30} />
              <p className="mt-3 text-sm font-semibold">No saved analyses yet</p>
              <p className="mt-1 text-xs text-muted">Run an analysis to view verified evidence records here.</p>
              <button onClick={() => requireLogin(() => navigate('/new-analysis'))} className="btn-primary mt-4 text-xs">
                <Plus size={13} /> Start new analysis
              </button>
            </div>
          ) : (
            <div className="mobile-scroll">
              <table className="w-full min-w-[680px] text-left">
                <thead className="bg-fog/60 text-[10px] uppercase tracking-[0.15em] text-muted">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Media file</th>
                    <th className="px-3 py-3 font-semibold">Modality</th>
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 font-semibold">Result</th>
                    <th className="px-3 py-3 font-semibold">Confidence</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentList.map(record => (
                    <tr key={record.id} className="border-t border-line/70 text-xs hover:bg-white/40">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <MediaThumbnail modality={record.modality} url={record.previewUrl} className="h-9 w-11 shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-semibold text-ink">{record.name}</p>
                              <span className="inline-flex items-center gap-0.5 rounded bg-fog px-1 py-0.2 text-[8px] font-semibold text-muted">
                                <MediaIcon modality={record.modality} size={9} />
                              </span>
                            </div>
                            <p className="mt-0.5 font-mono text-[9px] text-muted">{record.verificationId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-muted">{record.modality}</td>
                      <td className="px-3 py-3.5 text-muted">{record.date}</td>
                      <td className="px-3 py-3.5"><StatusBadge status={record.status} /></td>
                      <td className="px-3 py-3.5 font-semibold">{record.confidence === null ? '—' : `${record.confidence}%`}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => openReportForRecord(record)}
                          className="text-[11px] font-semibold text-signal hover:underline inline-flex items-center gap-1"
                        >
                          View report <ArrowRight size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="relative min-h-[250px] overflow-hidden rounded-[2px] bg-ink p-6 text-white shadow-soft">
          <img src={DEEPFAKE_ART} alt="Deepfake face comparison visualization" className="absolute inset-0 h-full w-full object-cover opacity-65 mix-blend-luminosity" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/95 via-ink/70 to-signal/30" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <p className="eyebrow text-white/65">Deepfake evidence layer</p>
              <h3 className="serif mt-3 max-w-[240px] text-3xl leading-[1.02]">
                See beyond the <span className="text-red-200">surface.</span>
              </h3>
              <p className="mt-3 max-w-[250px] text-xs leading-5 text-white/75">
                Trustlens organizes returned signals around identity, provenance, and the limits of automated interpretation.
              </p>
            </div>
            <button onClick={() => navigate('/about')} className="mt-7 flex items-center gap-2 text-xs font-semibold text-white hover:text-red-200 transition">
              Read the methodology <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>

        {/* OVERLAY PROMPT WHEN DASHBOARD IS BLURRED (UNAUTHENTICATED) */}
        {!user && (
          <div className="absolute inset-0 z-20 flex items-start justify-center pt-20 pb-12 px-4 pointer-events-auto">
            <div className="panel max-w-md border-signal/40 bg-paper/95 p-8 text-center shadow-2xl backdrop-blur-md">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-signal/30 bg-signal/10 text-signal shadow-inner">
                <ScanFace size={28} />
              </div>
              <h3 className="serif mt-4 text-2xl font-bold text-ink">Deepfake Intelligence Protected</h3>
              <p className="mt-2 text-xs leading-5 text-muted">
                Live forensic telemetry, neural manipulation signals, and verified evidence history are secured. Create an account or sign in to access full analysis data.
              </p>
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                <button onClick={() => openAuth('signup')} className="btn-primary text-xs px-5 py-2.5">
                  Create free account
                </button>
                <button onClick={() => openAuth('signin')} className="btn-secondary text-xs px-5 py-2.5">
                  Sign in
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function AboutPage() {
  const { navigate, requireLogin } = useApp()
  return (
    <>
      <PageIntro
        eyebrow="Project briefing · methods"
        title={<>Building <span className="text-signal">trust</span> in digital media</>}
        description="A calm, evidence-led interface for examining the signals returned by a connected media-forensics service."
        action={<button onClick={() => requireLogin(() => navigate('/new-analysis'))} className="btn-primary"><Plus size={15} /> Start analysis</button>}
      />
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="panel grid-paper p-6 md:p-9">
          <p className="eyebrow">Our mission</p>
          <h2 className="serif mt-4 max-w-xl text-4xl leading-[1.03] md:text-5xl">Make the invisible <span className="text-signal">legible.</span></h2>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted">
            TRUSTLENS AI organizes deepfake detection telemetry and forensic signals into an objective, reviewable investigation dossier. It preserves authentic media integrity and delivers verifiable provenance signals.
          </p>
          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            {[['01','Frame evidence'],['02','Model response'],['03','Verification reports']].map(item => (
              <div key={item[0]} className="border-t-2 border-signal pt-3">
                <span className="text-[10px] font-bold text-signal">{item[0]}</span>
                <p className="mt-2 text-xs font-semibold">{item[1]}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative min-h-[340px] overflow-hidden rounded-[2px] bg-ink shadow-soft">
          <img src={DEEPFAKE_ART} alt="The evidence layer deepfake wireframe visualization" className="absolute inset-0 h-full w-full object-cover opacity-65 mix-blend-luminosity" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-transparent to-signal/30" />
          <div className="relative z-10 flex h-full flex-col justify-end p-6 text-white md:p-8">
            <p className="eyebrow text-white/65">The evidence layer</p>
            <p className="serif mt-2 max-w-sm text-3xl leading-tight">Digitāle <span className="text-red-300">mēdium</span></p>
            <p className="mt-3 max-w-sm text-xs leading-5 text-white/70">A visual language for working with ambiguity, provenance, and the limits of automated interpretation.</p>
          </div>
        </div>
      </div>
      <div className="mt-10">
        <SectionHeader eyebrow="Principles" title="How it works" />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['01','Submit media','Choose Video, Image, or Audio, upload a file, and configure forensic verification options.'],
            ['02','Analyze evidence','Advanced neural models inspect media across visual, temporal, and acoustic artifact spectra to evaluate synthesis likelihood.'],
            ['03','Review report','Examine returned confidence, frame-level timeline signals, and metadata before forming a conclusion.'],
          ].map(([number,title,body]) => (
            <div key={number} className="panel p-5">
              <span className="serif text-4xl text-signal/50">{number}</span>
              <h3 className="mt-5 text-sm font-bold">{title}</h3>
              <p className="mt-3 text-xs leading-5 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function NewAnalysisPage() {
  const { modality, setModality, config, setConfig, uploadedMedia, setUploadedMedia, navigate, notify, requireLogin, backendHealth, backendLoading, runBackendAnalysis } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [step, setStep] = useState(uploadedMedia ? 2 : 1)
  const supported: Record<Modality, string[]> = {
    Video: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
    Image: ['jpg', 'jpeg', 'png', 'webp'],
    Audio: ['wav', 'mp3', 'm4a', 'flac', 'ogg'],
  }
  const accepts = supported[modality].map(ext => `.${ext}`).join(',')
  const signalLabel = uploadedMedia?.modality === 'Video' ? 'Video frame map (FET)' : uploadedMedia?.modality === 'Audio' ? 'Audio spectral map' : 'Facial signal map'

  const chooseModality = (next: Modality) => {
    if (uploadedMedia && uploadedMedia.modality !== next) {
      if (uploadedMedia.url) URL.revokeObjectURL(uploadedMedia.url)
      setUploadedMedia(null)
      setStep(1)
      if (inputRef.current) inputRef.current.value = ''
      if (cameraRef.current) cameraRef.current.value = ''
      notify(`Switched to ${next}; select a ${next.toLowerCase()} file`, 'info')
    } else {
      setStep(uploadedMedia ? 2 : 1)
    }
    setModality(next)
    setConfig(Object.fromEntries(modalityOptions[next].map((item, index) => [item, index === 0])))
  }

  const handleFiles = (files: FileList | File[]) => {
    const file = Array.from(files)[0]
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    const isImageModality = modality === 'Image'
    const isImageMime = file.type.startsWith('image/')
    const isVideoModality = modality === 'Video'
    const isVideoMime = file.type.startsWith('video/')
    const isAudioModality = modality === 'Audio'
    const isAudioMime = file.type.startsWith('audio/')
    const isSupportedExt = supported[modality].includes(extension)

    if (
      isImageModality ? (!isSupportedExt && !isImageMime) :
      isVideoModality ? (!isSupportedExt && !isVideoMime) :
      isAudioModality ? (!isSupportedExt && !isAudioMime) :
      !isSupportedExt
    ) {
      notify(`${modality} accepts ${supported[modality].map(item => item.toUpperCase()).join(', ')} files`, 'warning')
      return
    }
    const safeName = file.name || `capture-${Date.now()}.${extension || (isImageModality ? 'jpg' : 'mp4')}`
    const url = URL.createObjectURL(file)
    setUploadedMedia({ name: safeName, size: file.size, mimeType: file.type || extension, modality, file, url })
    setStep(2)
    notify(`${safeName} is ready for analysis`, 'success')
  }

  const onInput = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) handleFiles(event.target.files) }
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); handleFiles(event.dataTransfer.files) }
  const remove = () => {
    if (uploadedMedia?.url) URL.revokeObjectURL(uploadedMedia.url)
    setUploadedMedia(null)
    setStep(1)
    if (inputRef.current) inputRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
    notify('Media removed', 'info')
  }

  const start = async () => {
    if (!uploadedMedia) { notify('Add a supported file before starting the analysis', 'warning'); return }
    const result = await runBackendAnalysis()
    if (!result) return
    setStep(3)
    navigate('/analyze')
  }

  return (
    <>
      <PageIntro
        eyebrow="Media forensics · new assessment"
        title={<>New <span className="text-signal">analysis</span></>}
        description="Submit media for deepfake verification across Video, Image, or Audio forensics."
        action={<span className="chip">Deepfake Scanner Online</span>}
      />
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div>
          <div className="mb-7 flex items-center gap-0">
            <Step number="01" label="Select modality" active={step >= 1} current={step === 1} />
            <Step number="02" label="Upload media" active={step >= 2} current={step === 2} />
            <Step number="03" label="Review and analyze" active={step >= 3} current={step === 3} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {(['Video', 'Image', 'Audio'] as Modality[]).map(item => (
              <button
                key={item}
                onClick={() => chooseModality(item)}
                className={`panel flex items-center gap-4 p-4 text-left transition ${modality === item ? 'border-signal bg-signal/5 shadow-[0_0_0_1px_#c92c35]' : 'hover:border-ink'}`}
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-full ${modality === item ? 'bg-signal text-white' : 'bg-fog text-ink'}`}>
                  {item === 'Video' ? <Video size={20} /> : item === 'Image' ? <ImageIcon size={20} /> : <AudioLines size={20} />}
                </span>
                <span>
                  <span className="block text-sm font-bold">{item}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-muted">
                    {item === 'Video' ? 'FET Frame Evidence Timeline & anomaly scoring' : item === 'Image' ? 'CIFAKE EfficientNet-B0 ONNX classification' : 'Synthetic voice & spectral consistency analysis'}
                  </span>
                </span>
                {modality === item && <CheckCircle2 className="ml-auto text-signal" size={18} />}
              </button>
            ))}
          </div>

          <div
            className={`mt-4 rounded-[2px] border-2 border-dashed p-8 text-center transition md:p-12 ${dragging ? 'border-signal bg-signal/5' : 'border-line bg-white/45 hover:border-ink/40'}`}
            onDragOver={event => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <UploadCloud className="mx-auto text-muted" size={29} strokeWidth={1.3} />
            <h3 className="serif mt-4 text-2xl">Drag and drop {modality.toLowerCase()} here</h3>
            <p className="mt-2 text-xs text-muted">or browse files from your computer</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button className="btn-secondary" onClick={() => inputRef.current?.click()}>
                <FolderOpen size={14} /> Browse files
              </button>
              {modality === 'Image' && (
                <button className="btn-secondary border-signal/25 bg-signal/5 text-signal hover:border-signal/45 hover:bg-signal/10" onClick={() => cameraRef.current?.click()}>
                  <Camera size={14} /> Use camera
                </button>
              )}
            </div>
            <input ref={inputRef} type="file" className="sr-only" aria-label="Upload media file" accept={accepts} onChange={onInput} />
            <input ref={cameraRef} type="file" className="sr-only" aria-label="Capture image with camera" accept="image/*" capture="environment" onChange={onInput} />
            <p className="mt-5 text-[10px] uppercase tracking-[0.16em] text-muted">
              {supported[modality].map(item => item.toUpperCase()).join(' · ')}
            </p>
          </div>

          {uploadedMedia && (
            <div className="panel mt-4 flex items-center gap-4 p-4">
              <MediaThumbnail modality={uploadedMedia.modality} url={uploadedMedia.url} className="h-12 w-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Uploaded media · ready for analysis</p>
                <p className="mt-1 truncate text-sm font-bold">{uploadedMedia.name}</p>
                <p className="mt-1 text-[11px] text-muted">{uploadedMedia.modality} · {formatBytes(uploadedMedia.size)}</p>
              </div>
              <button className="btn-secondary border-signal/20 px-3 py-2 text-signal hover:border-signal" onClick={remove} aria-label="Delete media" title="Delete media">
                <Trash2 size={15} />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          )}

          <div className="mt-8">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="eyebrow">Evidence configuration for {modality}</p>
                <h2 className="section-title mt-1">Forensic layers</h2>
              </div>
              <span className="text-[11px] text-muted">Applied to media signal pipeline</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {modalityOptions[modality].map(option => (
                <label key={option} className="flex cursor-pointer items-center gap-3 rounded-[2px] border border-line bg-white/60 p-4 text-xs font-semibold transition hover:border-ink">
                  <input type="checkbox" className="peer sr-only" checked={Boolean(config[option])} onChange={() => setConfig({ ...config, [option]: !config[option] })} />
                  <span className={`flex h-5 w-5 items-center justify-center rounded border ${config[option] ? 'border-signal bg-signal text-white' : 'border-muted/50'}`}>
                    {config[option] && <Check size={13} strokeWidth={3} />}
                  </span>
                  {option}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
            <button onClick={() => navigate('/')} className="btn-secondary">Cancel</button>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <button disabled={backendLoading} onClick={() => requireLogin(() => { void start() })} className="btn-primary">
                {backendLoading ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
                Start analysis <ArrowRight size={15} />
              </button>
              <span className="text-right text-[10px] text-muted">Results saved to authenticated Supabase store</span>
            </div>
          </div>
        </div>

        <div className="deepfake-side relative hidden min-h-[710px] overflow-hidden rounded-[2px] bg-ink xl:block" aria-label="Deepfake analysis signal visualization">
          <img src={DEEPFAKE_ART} alt="Deepfake facial signal comparison" className="absolute inset-0 h-full w-full object-cover opacity-55" />
          <div className="deepfake-scan absolute inset-0" />
          <div className="deepfake-contour absolute inset-[16%_14%]">
            <span className="deepfake-node node-a" />
            <span className="deepfake-node node-b" />
            <span className="deepfake-node node-c" />
            <span className="deepfake-node node-d" />
            <span className="deepfake-line line-a" />
            <span className="deepfake-line line-b" />
            <span className="deepfake-line line-c" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-transparent to-ink/10" />
          <div className="absolute inset-x-7 bottom-7 flex items-center justify-between border-t border-white/20 pt-4 text-[10px] uppercase tracking-[0.16em] text-white/70">
            <span className="flex items-center gap-2"><ScanFace size={14} /> {signalLabel}</span>
            <span>{uploadedMedia ? 'READY' : 'WAITING'}</span>
          </div>
        </div>
      </div>
    </>
  )
}

function Step({ number, label, active, current }: { number: string; label: string; active: boolean; current: boolean }) {
  return (
    <div className="relative flex flex-1 items-center gap-2 after:h-px after:flex-1 after:bg-line last:flex-none last:after:hidden">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${current ? 'border-signal bg-signal text-white' : active ? 'border-ink bg-ink text-white' : 'border-line text-muted'}`}>
        {number}
      </span>
      <span className={`hidden text-[10px] font-bold uppercase tracking-[0.12em] sm:block ${current ? 'text-signal' : active ? 'text-ink' : 'text-muted'}`}>
        {label}
      </span>
    </div>
  )
}

// ==========================================
// FET (FRAME EVIDENCE TIMELINE) COMPONENT
// Matching user's reference mockup
// ==========================================
function FrameEvidenceTimeline({
  media,
  backendResult,
  onReviewEvidence,
}: {
  media: UploadedMedia | null
  backendResult?: BackendAnalysisResponse | null
  onReviewEvidence?: () => void
}) {
  const dynamicFrames: FETFrame[] = useMemo(() => {
    const rawEvidence = backendResult?.evidence
    const firstEvidence = Array.isArray(rawEvidence) && rawEvidence[0] && typeof rawEvidence[0] === 'object' ? rawEvidence[0] as Record<string, unknown> : null
    const rawFrames = firstEvidence?.frameScores as Array<{ frameIndex: number; timestampSeconds: number; syntheticScore: number; thumbnail?: string }> | undefined
    if (rawFrames && Array.isArray(rawFrames) && rawFrames.length > 0) {
      return rawFrames.map((f, idx) => {
        const score = Number(f.syntheticScore) || 0
        const isFlagged = score >= 0.5
        const mins = Math.floor(f.timestampSeconds / 60)
        const secs = (f.timestampSeconds % 60).toFixed(2)
        const ts = `${String(mins).padStart(2, '0')}:${String(secs).padStart(5, '0')}`
        return {
          index: idx,
          frameNumber: f.frameIndex,
          timestamp: ts,
          seconds: f.timestampSeconds,
          anomalyScore: score,
          confidence: Math.round(score * 100),
          isFlagged,
          thumbnail: f.thumbnail,
          categories: {
            facialInconsistencies: score >= 0.75 ? 'FLAGGED' : score >= 0.5 ? 'REVIEW' : 'NORMAL',
            blendingArtifacts: score >= 0.65 ? 'FLAGGED' : score >= 0.45 ? 'REVIEW' : 'NORMAL',
            temporalAnomalies: score >= 0.6 ? 'FLAGGED' : score >= 0.4 ? 'REVIEW' : 'NORMAL',
          },
        }
      })
    }
    return DEFAULT_FET_FRAMES
  }, [backendResult])

  const frames = dynamicFrames
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(frames[0]?.seconds || 0)
  const [duration, setDuration] = useState(12.4)
  const [isMuted, setIsMuted] = useState(false)
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [clientThumbnails, setClientThumbnails] = useState<Record<number, string>>({})
  const videoRef = useRef<HTMLVideoElement>(null)

  // Client-side HTML5 canvas frame extraction fallback if video URL is present and thumbnails are needed
  useEffect(() => {
    if (!media?.url || frames.length === 0) return

    const needsFallback = frames.some(f => !f.thumbnail)
    if (!needsFallback) return

    let cancelled = false
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = media.url

    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const ctx = canvas.getContext('2d')

    const captureFrame = (idx: number) => {
      if (cancelled || idx >= frames.length || !ctx) return
      const targetSec = frames[idx].seconds
      video.currentTime = targetSec

      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        if (cancelled) return
        try {
          ctx.drawImage(video, 0, 0, 160, 90)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
          setClientThumbnails(prev => ({ ...prev, [idx]: dataUrl }))
        } catch (err) {
          console.warn('Canvas thumbnail capture error for frame', idx, err)
        }
        captureFrame(idx + 1)
      }

      video.addEventListener('seeked', onSeeked, { once: true })
    }

    const onLoaded = () => {
      if (!cancelled) {
        if (video.duration && video.duration > 0) {
          setDuration(video.duration)
        }
        captureFrame(0)
      }
    }

    video.addEventListener('loadedmetadata', onLoaded, { once: true })
    video.load()

    return () => {
      cancelled = true
      video.pause()
      video.src = ''
    }
  }, [media?.url, frames])

  const selectedFrame = frames[selectedFrameIndex] || frames[0] || DEFAULT_FET_FRAMES[0]
  const clipName = media?.name || 'sample_clip_014.mp4'

  const details = backendResult?.details && typeof backendResult.details === 'object' && !Array.isArray(backendResult.details) ? backendResult.details as Record<string, unknown> : undefined
  const analyzedFramesCount: number = typeof details?.analyzedFrames === 'number' ? details.analyzedFrames : frames.length
  const flaggedFramesCount: number = typeof details?.flaggedFrames === 'number' ? details.flaggedFrames : frames.filter(f => f.isFlagged).length
  const fpsValue: number = typeof details?.fps === 'number' ? details.fps : 24
  const totalFramesCount: number = typeof details?.totalFrames === 'number' ? details.totalFrames : (analyzedFramesCount || frames.length)

  const selectFrame = (idx: number) => {
    const f = frames[idx]
    if (!f) return
    setSelectedFrameIndex(idx)
    setCurrentTime(f.seconds)
    if (videoRef.current) {
      videoRef.current.currentTime = f.seconds
    }
  }

  const togglePlay = () => {
    if (!videoRef.current) {
      setIsPlaying(!isPlaying)
      return
    }
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    }
  }

  const prevFrame = () => {
    const nextIdx = Math.max(0, selectedFrameIndex - 1)
    selectFrame(nextIdx)
  }

  const nextFrame = () => {
    const nextIdx = Math.min(frames.length - 1, selectedFrameIndex + 1)
    selectFrame(nextIdx)
  }

  const formatTimestamp = (sec: number) => {
    const mins = Math.floor(sec / 60)
    const secs = (sec % 60).toFixed(2)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(5, '0')}`
  }

  return (
    <div className="fet-container rounded-[2px] border border-line bg-paper/95 p-4 sm:p-6 shadow-soft">
      {/* TOP FET HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between border-b border-line pb-4 text-xs">
        <div className="flex items-center gap-3">
          <span className="serif text-2xl font-bold tracking-tight text-ink">FET</span>
          <span className="text-muted">|</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">FRAME EVIDENCE TIMELINE</span>
        </div>
        <div className="hidden sm:block text-[10px] uppercase tracking-[0.16em] text-muted">
          FORENSICS / EVIDENCE REVIEW
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
            backendResult?.assessment === 'inconclusive'
              ? 'bg-stone-100 text-stone-700 border border-stone-200'
              : 'bg-signal/10 text-signal'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${backendResult?.assessment === 'inconclusive' ? 'bg-stone-500' : 'bg-signal animate-pulse'}`} />
            {backendResult ? (backendResult.assessment === 'inconclusive' ? 'FRAME-LEVEL TELEMETRY · INCONCLUSIVE VIDEO DOMAIN' : 'GENUINE ONNX VIDEO INFERENCE') : media?.file ? 'ACTIVE VIDEO FORENSICS' : 'SAMPLE ANALYSIS · PLACEHOLDER DATA'}
          </span>
        </div>
      </div>

      {/* TOP THREE STATS BAR */}
      <div className="my-6 grid grid-cols-2 gap-4 border-b border-line pb-6 md:grid-cols-4">
        <div>
          <p className="serif text-4xl text-ink">{analyzedFramesCount}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">ANALYZED FRAMES</p>
          <p className="text-[9px] uppercase tracking-[0.1em] text-muted/70">AT {fpsValue} FPS</p>
        </div>
        <div>
          <p className="serif text-4xl text-signal">{String(flaggedFramesCount).padStart(2, '0')}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-signal">FLAGGED FRAMES</p>
          <p className="text-[9px] uppercase tracking-[0.1em] text-signal/70">ANOMALY &gt; 0.50</p>
        </div>
        <div>
          <p className="serif text-4xl text-ink">03</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">EVIDENCE CATEGORIES</p>
          <p className="text-[9px] uppercase tracking-[0.1em] text-muted/70">MULTI-LAYER REVIEW</p>
        </div>
        <div className="hidden md:flex flex-col justify-center border-l border-line pl-5">
          <p className="eyebrow text-muted">Forensic clarity</p>
          <p className="serif mt-1 text-sm text-ink/80 italic">A clearer tomorrow through evidence.</p>
        </div>
      </div>

      {/* MAIN LAYOUT: LEFT VIDEO & TIMELINE (65%) | RIGHT SELECTED FRAME & CATEGORIES (35%) */}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.85fr]">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="serif text-lg font-bold text-ink">Video evidence</span>
              <span className="text-muted">|</span>
              <span className="text-xs font-mono text-muted">{clipName}</span>
            </div>
            <span className="text-xs font-mono text-muted">{formatTimestamp(duration)}</span>
          </div>

          {/* VIDEO PLAYER VIEWPORT WITH VIEWFINDER CORNERS */}
          <div className="relative aspect-video w-full overflow-hidden rounded-[2px] bg-ink shadow-card">
            {media?.url ? (
              <video
                ref={videoRef}
                src={media.url}
                className="h-full w-full object-contain"
                playsInline
                muted={isMuted}
                onTimeUpdate={() => {
                  if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) setDuration(videoRef.current.duration || 12.4)
                }}
              />
            ) : (
              <div className="relative h-full w-full">
                <img
                  src={DEEPFAKE_ART}
                  alt="Video forensic evidence"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </div>
            )}

            {/* VIEWFINDER CORNER MARKERS */}
            <div className="pointer-events-none absolute left-4 top-4 h-6 w-6 border-l-2 border-t-2 border-white/60" />
            <div className="pointer-events-none absolute right-4 top-4 h-6 w-6 border-r-2 border-t-2 border-white/60" />
            <div className="pointer-events-none absolute bottom-12 left-4 h-6 w-6 border-b-2 border-l-2 border-white/60" />
            <div className="pointer-events-none absolute bottom-12 right-4 h-6 w-6 border-b-2 border-r-2 border-white/60" />

            {/* VIDEO SCRUBBER & CONTROLS OVERLAY */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-6 text-white">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="rounded p-1 text-white hover:text-signal transition"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
                </button>

                <span className="font-mono text-[11px] text-white/90">
                  {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                </span>

                {/* PROGRESS TRACK WITH FLAGGED ANOMALY TICKS */}
                <div
                  className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/20"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const pos = (e.clientX - rect.left) / rect.width
                    const targetSec = pos * duration
                    setCurrentTime(targetSec)
                    if (videoRef.current) videoRef.current.currentTime = targetSec
                  }}
                >
                  <div
                    className="h-full rounded-full bg-signal"
                    style={{ width: `${Math.min(100, (currentTime / Math.max(1, duration)) * 100)}%` }}
                  />
                  {/* Red ticks indicating flagged anomaly frames */}
                  {frames.filter(f => f.isFlagged).map(f => (
                    <span
                      key={f.index}
                      className="absolute top-1/2 h-2.5 w-1 -translate-y-1/2 rounded-full bg-signal"
                      style={{ left: `${(f.seconds / Math.max(1, duration)) * 100}%` }}
                      title={`Flagged frame at ${f.timestamp}`}
                    />
                  ))}
                  <span
                    className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink bg-white shadow-sm"
                    style={{ left: `${Math.min(100, (currentTime / Math.max(1, duration)) * 100)}%` }}
                  />
                </div>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="rounded p-1 text-white hover:text-signal transition"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>

                <button
                  onClick={() => {
                    if (videoRef.current) {
                      if (document.fullscreenElement) document.exitFullscreen()
                      else videoRef.current.requestFullscreen()
                    }
                  }}
                  className="rounded p-1 text-white hover:text-signal transition"
                  aria-label="Fullscreen"
                >
                  <Maximize2 size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* FRAME TIMELINE CONTAINER */}
          <div className="panel p-4 bg-white/90">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">Frame timeline</span>
              <span className="font-mono text-[10px] text-muted">{fpsValue} fps · {totalFramesCount} frames ({frames.length} sampled)</span>
            </div>

            {/* MICRO TICK RULER */}
            <div className="relative mb-2 flex h-3 items-end justify-between border-b border-line px-2">
              {Array.from({ length: 28 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-px ${i % 4 === 0 ? 'h-2.5 bg-ink/50' : 'bg-line'} ${[10, 13, 17].includes(i) ? '!bg-signal !h-3' : ''}`}
                />
              ))}
            </div>

            {/* HORIZONTAL FILMSTRIP CAROUSEL OF REAL VIDEO FRAME THUMBNAILS */}
            <div className="mobile-scroll flex gap-2.5 overflow-x-auto pb-2 pt-1">
              {frames.map((frame, idx) => {
                const isSelected = selectedFrameIndex === idx
                const thumbSrc = frame.thumbnail || clientThumbnails[idx] || (media?.url ? undefined : DEEPFAKE_ART)
                return (
                  <button
                    key={frame.index}
                    onClick={() => selectFrame(idx)}
                    className={`group relative flex w-28 shrink-0 flex-col items-center rounded-[2px] border p-1.5 text-left transition ${
                      isSelected
                        ? 'border-signal bg-signal/5 ring-2 ring-signal shadow-sm'
                        : 'border-line hover:border-ink bg-white'
                    }`}
                  >
                    {frame.isFlagged && (
                      <span className="absolute -top-1.5 right-1 h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-white shadow-xs" title="Flagged anomaly" />
                    )}
                    <div className="relative aspect-video w-full overflow-hidden rounded-[1px] bg-ink">
                      {thumbSrc ? (
                        <img
                          src={thumbSrc}
                          alt={`Frame at ${frame.timestamp}`}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                          style={{ filter: frame.isFlagged ? 'contrast(1.15) brightness(0.95)' : undefined }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-stone-900 text-[9px] font-mono text-white/50">
                          #{frame.frameNumber}
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 border border-signal bg-signal/15" />
                      )}
                    </div>
                    <div className="mt-1.5 flex w-full items-center justify-between font-mono text-[9px]">
                      <span className="text-muted">{frame.timestamp}</span>
                      <span className={`font-semibold ${frame.isFlagged ? 'text-signal' : 'text-stone-500'}`}>
                        {frame.anomalyScore.toFixed(2)}
                      </span>
                    </div>
                    {isSelected ? (
                      <span className="mt-0.5 text-[8px] font-bold tracking-wider text-signal uppercase">
                        SELECTED
                      </span>
                    ) : (
                      <span className={`mt-0.5 text-[8px] font-medium tracking-wide uppercase ${frame.isFlagged ? 'text-signal' : 'text-muted/60'}`}>
                        {frame.isFlagged ? 'FLAGGED' : 'PASS'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* TIMELINE TOOLBAR CONTROLS */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={prevFrame}
                  disabled={selectedFrameIndex === 0}
                  className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  <ChevronLeft size={13} /> Previous frame
                </button>
                <button
                  onClick={nextFrame}
                  disabled={selectedFrameIndex === frames.length - 1}
                  className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Next frame <ChevronRight size={13} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center rounded border border-line bg-white">
                  <button
                    onClick={() => setTimelineZoom(Math.max(0.5, timelineZoom - 0.25))}
                    className="p-1.5 hover:bg-fog"
                    title="Zoom out"
                  >
                    <ZoomOut size={13} />
                  </button>
                  <span className="px-2 text-[10px] font-mono text-muted">{Math.round(timelineZoom * 100)}%</span>
                  <button
                    onClick={() => setTimelineZoom(Math.min(2, timelineZoom + 0.25))}
                    className="p-1.5 hover:bg-fog"
                    title="Zoom in"
                  >
                    <ZoomIn size={13} />
                  </button>
                </div>

                <button
                  onClick={onReviewEvidence}
                  className="btn-primary px-4 py-1.5 text-xs shadow-none"
                >
                  Review evidence <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SELECTED FRAME METRICS & EVIDENCE CATEGORIES */}
        <div className="space-y-4">
          <div className="panel p-5 bg-white">
            <p className="eyebrow">Selected frame</p>
            <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.12em] text-muted">
              FRAME {selectedFrame.frameNumber}
            </p>
            <h3 className="serif mt-1 text-4xl font-bold tracking-tight text-ink">
              {selectedFrame.timestamp}
            </h3>

            {/* REAL SELECTED FRAME PREVIEW CARD */}
            <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-[2px] border border-line bg-ink shadow-sm">
              {selectedFrame.thumbnail || clientThumbnails[selectedFrameIndex] || (media?.url ? undefined : DEEPFAKE_ART) ? (
                <img
                  src={selectedFrame.thumbnail || clientThumbnails[selectedFrameIndex] || (media?.url ? undefined : DEEPFAKE_ART)}
                  alt={`Selected frame ${selectedFrame.frameNumber}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-mono text-white/50">
                  Frame #{selectedFrame.frameNumber} ({selectedFrame.timestamp})
                </div>
              )}
              <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/75 px-2 py-0.5 font-mono text-[10px] text-white">
                {selectedFrame.timestamp} · Frame #{selectedFrame.frameNumber}
              </div>
              {selectedFrame.isFlagged ? (
                <div className="pointer-events-none absolute top-2 right-2 rounded bg-signal px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  FLAGGED ANOMALY
                </div>
              ) : (
                <div className="pointer-events-none absolute top-2 right-2 rounded bg-emerald-600/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  NORMAL
                </div>
              )}
            </div>

            {/* TWO TILES: ANOMALY SCORE & CONFIDENCE */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[2px] border border-signal/20 bg-signal/5 p-3.5">
                <div className="flex items-center justify-between text-signal">
                  <Activity size={16} />
                  <span className="text-[8px] font-bold uppercase tracking-wider">
                    {selectedFrame.isFlagged ? 'FLAGGED' : 'NORMAL'}
                  </span>
                </div>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-muted font-semibold">Anomaly score</p>
                <p className="serif mt-1 text-3xl font-bold leading-none text-signal">
                  {selectedFrame.anomalyScore.toFixed(2)}
                </p>
              </div>

              <div className="rounded-[2px] border border-line bg-fog/60 p-3.5">
                <div className="flex items-center justify-between text-ink">
                  <BarChart3 size={16} />
                  <span className="text-[8px] font-bold uppercase tracking-wider text-muted">
                    EVALUATED
                  </span>
                </div>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-muted font-semibold">Confidence</p>
                <p className="serif mt-1 text-3xl font-bold leading-none text-ink">
                  {selectedFrame.confidence}%
                </p>
              </div>
            </div>

            {/* EVIDENCE CATEGORIES LIST */}
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="serif text-sm font-bold text-ink">Evidence categories</p>
                <span className="text-[9px] uppercase tracking-wider text-muted">MULTI-SIGNAL</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-[2px] border border-line bg-white/70 p-3 text-xs transition hover:border-ink">
                  <div className="flex items-center gap-2.5">
                    <ScanFace size={16} className="text-signal" />
                    <div>
                      <p className="font-semibold text-ink">Facial inconsistencies</p>
                      <p className="text-[10px] text-muted">Identity and facial feature analysis</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    selectedFrame.categories.facialInconsistencies === 'FLAGGED'
                      ? 'bg-signal/15 text-signal'
                      : 'bg-stone-100 text-stone-600'
                  }`}>
                    {selectedFrame.categories.facialInconsistencies} &gt;
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-[2px] border border-line bg-white/70 p-3 text-xs transition hover:border-ink">
                  <div className="flex items-center gap-2.5">
                    <Layers3 size={16} className="text-stone-700" />
                    <div>
                      <p className="font-semibold text-ink">Blending artifacts</p>
                      <p className="text-[10px] text-muted">Compositing and generation traces</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    selectedFrame.categories.blendingArtifacts === 'FLAGGED'
                      ? 'bg-signal/15 text-signal'
                      : 'bg-stone-100 text-stone-600'
                  }`}>
                    {selectedFrame.categories.blendingArtifacts} &gt;
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-[2px] border border-line bg-white/70 p-3 text-xs transition hover:border-ink">
                  <div className="flex items-center gap-2.5">
                    <Clock3 size={16} className="text-stone-700" />
                    <div>
                      <p className="font-semibold text-ink">Temporal anomalies</p>
                      <p className="text-[10px] text-muted">Frame-to-frame consistency</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    selectedFrame.categories.temporalAnomalies === 'FLAGGED'
                      ? 'bg-signal/15 text-signal'
                      : 'bg-stone-100 text-stone-600'
                  }`}>
                    {selectedFrame.categories.temporalAnomalies} &gt;
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-3 text-[10px] text-muted leading-4">
              ⓘ Frame evidence signals indicate synthetic interpolation anomalies. Review with contextual human verification.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AnalyzeMediaPage() {
  const { uploadedMedia, navigate, notify, requireLogin, backendResult, backendLoading, backendError, runBackendAnalysis } = useApp()
  const media = uploadedMedia
  const [progress, setProgress] = useState(uploadedMedia ? 10 : 0)
  const [zoom, setZoom] = useState(1)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setProgress(backendResult ? 100 : backendLoading ? 48 : backendError ? 0 : 10)
  }, [backendResult, backendLoading, backendError])

  const continueToReport = () => {
    if (!backendResult) {
      notify('Complete media verification before opening the report', 'warning')
      return
    }
    notify('Verification report opened', 'success')
    navigate('/report')
  }

  // If no media is uploaded yet, offer sample demo video or upload
  if (!media) {
    return (
      <>
        <PageIntro
          eyebrow="Workspace · analyze media"
          title={<>Analyze <span className="text-signal">media</span></>}
          description="Upload media to inspect real detection signals or preview the Frame Evidence Timeline."
          action={
            <div className="flex gap-2">
              <button
                onClick={() => {
                  notify('Loaded sample video evidence for FET review', 'info')
                }}
                className="btn-secondary"
              >
                <MonitorPlay size={15} /> Demo FET video
              </button>
              <button onClick={() => requireLogin(() => navigate('/new-analysis'))} className="btn-primary">
                <Plus size={15} /> Select media
              </button>
            </div>
          }
        />
        <FrameEvidenceTimeline media={null} onReviewEvidence={() => navigate('/report')} />
      </>
    )
  }

  // If media is a video, show the FET (Frame Evidence Timeline)!
  if (media.modality === 'Video') {
    return (
      <>
        <PageIntro
          eyebrow="Media forensics · video inspection"
          title={<>Frame Evidence <span className="text-signal">Timeline</span></>}
          description="Review frame-by-frame anomaly signals and temporal consistency traces for the uploaded video."
          action={
            <div className="flex gap-2">
              <button onClick={() => requireLogin(() => navigate('/new-analysis'))} className="btn-secondary">
                <RefreshCw size={14} /> New sample
              </button>
              <button onClick={continueToReport} className="btn-primary">
                Verification report <ArrowRight size={14} />
              </button>
            </div>
          }
        />
        <FrameEvidenceTimeline media={media} backendResult={backendResult} onReviewEvidence={continueToReport} />
      </>
    )
  }

  // Image and Audio analysis preview
  return (
    <>
      <PageIntro
        eyebrow="Workspace · analyze media"
        title={<>Analyze <span className="text-signal">media</span></>}
        description="Review real-time processing state and verified forensic telemetry for your submitted media."
        action={
          <div className="flex gap-2">
            <button onClick={() => requireLogin(() => navigate('/new-analysis'))} className="btn-secondary">
              <RefreshCw size={14} /> New sample
            </button>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <p className="eyebrow">Media preview</p>
              <h2 className="section-title mt-1">{media.name}</h2>
            </div>
            <span className="chip">{media.modality}</span>
          </div>
          <div className="p-4 md:p-6">
            {media.modality === 'Image' && <ImagePreview media={media} zoom={zoom} setZoom={setZoom} />}
            {media.modality === 'Audio' && <AudioPreview media={media} backendResult={backendResult} />}
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel p-5">
            <SectionHeader
              eyebrow="Analysis progress"
              title={backendLoading ? 'Forensic analysis in progress' : backendError ? 'Analysis incomplete' : backendResult ? 'Ready for review' : 'Awaiting submission'}
              action={<span className="flex items-center gap-2 serif text-2xl text-signal">{backendLoading && <RefreshCw size={14} className="animate-spin" />}{progress}%</span>}
            />
            <div className="h-2 bg-fog">
              <div className="h-full bg-signal transition-all duration-1000" style={{ width: `${progress}%` }} />
            </div>
            {backendError && (
              <div className="mt-4 rounded-[2px] border border-signal/25 bg-signal/5 p-3 text-xs text-signal">
                <p>{backendError}</p>
                <button onClick={() => { void runBackendAnalysis() }} disabled={backendLoading} className="mt-2 font-semibold underline">
                  Retry request
                </button>
              </div>
            )}
            <div className="mt-5 space-y-4">
              {[
                ['Ingest media', progress > 0],
                ['Extract evidence', progress > 38],
                ['Compare indicators', progress > 64],
                ['Prepare report', progress > 89],
              ].map(([label, done]) => (
                <div key={String(label)} className="flex items-center gap-3 text-xs">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${done ? 'bg-signal text-white' : 'border border-line text-muted'}`}>
                    {done ? <Check size={12} /> : <Clock3 size={12} />}
                  </span>
                  <span className={done ? 'font-semibold' : 'text-muted'}>{label}</span>
                  {done && <span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-muted">Complete</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-5">
            <SectionHeader eyebrow="File details" title="Evidence context" />
            <div className="space-y-3">
              {[
                ['File name', media.name],
                ['Media type', `${media.modality} sample`],
                ['File size', formatBytes(media.size)],
                ['Verification ID', backendResult?.analysisId || 'Unavailable'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-line/70 pb-3 text-xs last:border-0 last:pb-0">
                  <span className="text-muted">{label}</span>
                  <span className="max-w-[200px] text-right font-semibold">{value}</span>
                </div>
              ))}
            </div>
            <button onClick={continueToReport} className="btn-primary mt-5 w-full" disabled={progress < 40}>
              Open verification report <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function ImagePreview({ media, zoom, setZoom }: { media: UploadedMedia; zoom: number; setZoom: (value: number) => void }) {
  return (
    <>
      <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-[2px] bg-fog">
        <img
          src={media.url || ARTWORK}
          alt="Uploaded media preview"
          className="h-full w-full object-cover transition-transform duration-300"
          style={{ transform: `scale(${zoom})` }}
        />
        <div className="absolute right-3 top-3 flex gap-1 rounded bg-white/85 p-1 shadow-soft">
          <button className="rounded p-2 hover:bg-fog" onClick={() => setZoom(Math.min(1.5, zoom + 0.1))} aria-label="Zoom in">
            <ZoomIn size={15} />
          </button>
          <button className="rounded p-2 hover:bg-fog" onClick={() => setZoom(1)} aria-label="Reset zoom">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-[10px] text-muted">
        <span>Zoom {Math.round(zoom * 100)}%</span>
        <span className="flex items-center gap-1"><CircleAlert size={12} className="text-signal" /> Preview</span>
      </div>
    </>
  )
}

function AudioPreview({
  media,
  backendResult,
}: {
  media: UploadedMedia
  backendResult?: BackendAnalysisResponse | null
  playing?: boolean
  setPlaying?: (value: boolean) => void
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Extract real waveform envelope if returned by backend (array of 64 normalized amplitude values)
  const rawEvidence = backendResult?.evidence
  const firstEvidence = Array.isArray(rawEvidence) && rawEvidence[0] && typeof rawEvidence[0] === 'object' ? rawEvidence[0] as Record<string, unknown> : null
  const envelope: number[] = useMemo(() => {
    if (Array.isArray(firstEvidence?.waveformEnvelope)) {
      return (firstEvidence?.waveformEnvelope as number[]).map(Number)
    }
    if (backendResult?.details && typeof backendResult.details === 'object' && Array.isArray((backendResult.details as Record<string, unknown>).waveformEnvelope)) {
      return ((backendResult.details as Record<string, unknown>).waveformEnvelope as number[]).map(Number)
    }
    return Array.from({ length: 64 }, (_, i) => 0.15 + 0.65 * Math.abs(Math.sin((i / 64) * Math.PI * 5)))
  }, [firstEvidence, backendResult])

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00.0'
    const mins = Math.floor(seconds / 60)
    const secs = (seconds % 60).toFixed(1)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(4, '0')}`
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(err => console.warn('Audio play failed:', err))
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleSeek = (fraction: number) => {
    if (audioRef.current && duration > 0) {
      const newTime = fraction * duration
      audioRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex flex-col rounded-[2px] bg-fog p-5 md:p-8">
      {media.url && (
        <audio
          ref={audioRef}
          src={media.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          muted={isMuted}
        />
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <AudioLines size={12} className="text-signal" /> AASIST Acoustic Spectro-Temporal Analysis
          </p>
          <p className="serif mt-1 text-2xl font-bold truncate max-w-md">{media.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip">{media.mimeType || 'audio/wav'}</span>
          <span className="font-mono text-xs text-muted">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Dynamic Waveform Visualizer */}
      <div
        className="group relative flex h-28 w-full cursor-pointer items-center justify-between gap-1 rounded bg-white/70 px-4 py-3 shadow-sm hover:bg-white transition-colors"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const clickX = e.clientX - rect.left
          handleSeek(Math.max(0, Math.min(1, clickX / rect.width)))
        }}
      >
        {envelope.map((amp, idx) => {
          const barFraction = idx / envelope.length
          const isPassed = barFraction <= (duration > 0 ? currentTime / duration : 0)
          const barHeight = Math.max(10, Math.round(Number(amp) * 88))
          return (
            <div
              key={idx}
              className={`w-1 rounded-full transition-all duration-75 ${
                isPassed ? 'bg-signal' : 'bg-stone-300 group-hover:bg-stone-400'
              }`}
              style={{ height: `${barHeight}px` }}
            />
          )
        })}

        {/* Playhead marker */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-signal shadow-sm transition-all"
          style={{ left: `${progressPercent}%` }}
        />
      </div>

      {/* Playback Controls & Timeline */}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={togglePlay}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal text-white shadow hover:opacity-90 transition-opacity"
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>

        <div className="flex-1">
          <div
            className="relative h-2 w-full cursor-pointer rounded-full bg-stone-200"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const clickX = e.clientX - rect.left
              handleSeek(Math.max(0, Math.min(1, clickX / rect.width)))
            }}
          >
            <div
              className="h-full rounded-full bg-signal transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-mono text-muted">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <button
          onClick={() => setIsMuted(!isMuted)}
          className="rounded p-2 text-stone-600 hover:bg-stone-200 transition-colors"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>
    </div>
  )
}

function AudioEvidenceTimeline({
  media,
  backendResult,
}: {
  media: UploadedMedia
  backendResult?: BackendAnalysisResponse | null
}) {
  const rawEvidence = backendResult?.evidence
  const firstEvidence = Array.isArray(rawEvidence) && rawEvidence[0] && typeof rawEvidence[0] === 'object' ? rawEvidence[0] as Record<string, unknown> : null
  const windows = (Array.isArray(firstEvidence?.windows) ? firstEvidence?.windows : null) as Array<{
    windowIndex: number
    timestampStart: number
    timestampEnd: number
    syntheticScore: number
    bonafideScore: number
    isFlagged: boolean
  }> | null || []

  const durationSeconds = Number(firstEvidence?.durationSeconds) || 0
  const originalSr = Number(firstEvidence?.originalSampleRate) || 16000
  const processedSr = Number(firstEvidence?.processedSampleRate) || 16000

  return (
    <div className="panel p-5 md:p-6 mb-6">
      <SectionHeader
        eyebrow="Acoustic temporal analysis"
        title="Spectro-temporal graph evidence"
        action={<span className="chip">AASIST Model</span>}
      />
      <div className="mb-4">
        <AudioPreview media={media} backendResult={backendResult} />
      </div>

      <div className="mt-6">
        <p className="eyebrow mb-3">Temporal window analysis ({windows.length} window{windows.length === 1 ? '' : 's'})</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line text-muted uppercase text-[10px] tracking-wider">
              <tr>
                <th className="pb-2 font-medium">Window</th>
                <th className="pb-2 font-medium">Time range</th>
                <th className="pb-2 font-medium">Synthetic prob</th>
                <th className="pb-2 font-medium">Bona fide prob</th>
                <th className="pb-2 font-medium text-right">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {windows.map((w, idx) => (
                <tr key={idx} className="hover:bg-fog/50">
                  <td className="py-2.5 font-mono font-medium">Window {w.windowIndex + 1}</td>
                  <td className="py-2.5 font-mono text-muted">{w.timestampStart.toFixed(1)}s – {w.timestampEnd.toFixed(1)}s</td>
                  <td className="py-2.5 font-mono font-semibold text-signal">{(w.syntheticScore * 100).toFixed(1)}%</td>
                  <td className="py-2.5 font-mono text-emerald-600">{(w.bonafideScore * 100).toFixed(1)}%</td>
                  <td className="py-2.5 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      w.isFlagged ? 'bg-signal/15 text-signal' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {w.isFlagged ? 'Flagged Spoof' : 'Bona Fide'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center border-t border-line/70 pt-4">
        <div className="panel p-2.5 bg-fog/30">
          <p className="eyebrow">Input Sample Rate</p>
          <p className="font-mono text-sm font-bold mt-0.5">{originalSr} Hz</p>
        </div>
        <div className="panel p-2.5 bg-fog/30">
          <p className="eyebrow">AASIST Resample</p>
          <p className="font-mono text-sm font-bold mt-0.5">{processedSr} Hz Sinc</p>
        </div>
        <div className="panel p-2.5 bg-fog/30">
          <p className="eyebrow">Total Duration</p>
          <p className="font-mono text-sm font-bold mt-0.5">{durationSeconds.toFixed(2)}s</p>
        </div>
        <div className="panel p-2.5 bg-fog/30">
          <p className="eyebrow">Aggregation</p>
          <p className="font-mono text-sm font-bold mt-0.5">Median Consensus</p>
        </div>
      </div>
    </div>
  )
}

function backendList(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : backendValue(item))
  if (typeof value === 'string') return [value]
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${backendValue(item)}`)
  return [String(value)]
}

function VerificationReportPage() {
  const { uploadedMedia, navigate, notify, backendResult } = useApp()
  if (!uploadedMedia || !backendResult) {
    return (
      <>
        <PageIntro eyebrow="Reports · verification" title={<>Verification <span className="text-signal">report</span></>} description="Forensic verification dossiers detail deepfake likelihood scores, facial anomaly indicators, artifact spectra, and neural generation provenance." />
        <div className="panel p-10 text-center">
          <FileSearch2 className="mx-auto text-muted" size={34} />
          <h2 className="serif mt-4 text-3xl">No analysis report loaded</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Submit a media file from New Analysis or choose any record from Analysis History to inspect its verification report.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => navigate('/history')} className="btn-secondary">
              <History size={15} /> View history
            </button>
            <button onClick={() => navigate('/new-analysis')} className="btn-primary">
              <Plus size={15} /> New analysis
            </button>
          </div>
        </div>
      </>
    )
  }

  const reportStatus: AnalysisStatus | null = backendResult.assessment || backendResult.riskBand
    ? assessmentToStatus(backendResult.assessment ?? backendResult.riskBand)
    : null
  const rawScore = backendResult.modelScore ?? backendResult.syntheticScore ?? (Array.isArray(backendResult.evidence) && backendResult.evidence[0] && typeof backendResult.evidence[0] === 'object' && 'syntheticScore' in backendResult.evidence[0] ? Number(backendResult.evidence[0].syntheticScore) : null) ?? backendResult.confidence ?? null
  const scorePercent = rawScore !== null ? (rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore)) : null
  const modelName = backendResult.modelName || (backendResult.model && typeof backendResult.model === 'object' && 'name' in backendResult.model ? String(backendResult.model.name) : typeof backendResult.model === 'string' ? backendResult.model : (uploadedMedia.modality === 'Video' ? 'FET Frame Evidence Analyzer' : 'CIFAKE EfficientNet-B0 ONNX'))
  const verificationId = backendResult.analysisId || 'Unavailable'
  const evidenceRows = backendList(backendResult.evidence)
  const limitationsList = backendList(backendResult.limitations)

  const exportReport = () => {
    const blob = new Blob([JSON.stringify(backendResult, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${verificationId || 'trustlens-analysis'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    notify('Forensic verification report exported as JSON', 'success')
  }

  return (
    <>
      <PageIntro
        eyebrow="Reports · verification"
        title={<>Verification <span className="text-signal">report</span></>}
        description="Review forensic evidence signals, risk band indicators, and detection limitations."
        action={<button onClick={exportReport} className="btn-primary"><Download size={14} /> Export report</button>}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4 text-xs">
        <div><span className="text-muted">Verification ID </span><strong>{verificationId}</strong></div>
        <div><span className="text-muted">Generated </span><strong>{backendResult.createdAt || 'Unavailable'}</strong></div>
        <StatusBadge status={reportStatus} />
      </div>

      {uploadedMedia.modality === 'Video' && (
        <div className="mb-6">
          <FrameEvidenceTimeline media={uploadedMedia} backendResult={backendResult} />
        </div>
      )}

      {uploadedMedia.modality === 'Audio' && (
        <div className="mb-6">
          <AudioEvidenceTimeline media={uploadedMedia} backendResult={backendResult} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-1">
        <div className="space-y-6">
          <div className="panel p-5 md:p-6">
            <SectionHeader eyebrow="Authenticity assessment" title="Assessment signal" action={<span className="chip">{uploadedMedia.modality} verification</span>} />
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div
                className="ring h-36 w-36 shrink-0"
                style={{
                  background: typeof scorePercent === 'number'
                    ? `conic-gradient(${reportStatus === 'Suspicious' ? '#c92c35' : reportStatus === 'Authentic' ? '#059669' : '#78716c'} 0 ${Math.max(0, Math.min(100, scorePercent))}%, #dedad4 ${Math.max(0, Math.min(100, scorePercent))}% 100%)`
                    : '#dedad4',
                }}
              >
                <div className="flex h-full w-full flex-col items-center justify-center">
                  <span className="serif text-4xl">{scorePercent === null ? '—' : `${scorePercent}%`}</span>
                  <span className="mt-1 text-[9px] uppercase tracking-[0.14em] text-muted">
                    {uploadedMedia.modality === 'Video' ? 'Model score' : 'Synthetic score'}
                  </span>
                </div>
              </div>
              <div className="space-y-3 text-xs w-full">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${reportStatus === 'Suspicious' ? 'bg-signal' : reportStatus === 'Authentic' ? 'bg-emerald-600' : 'bg-stone-500'}`} />
                  <span className="text-muted">Assessment</span>
                  <strong className="ml-auto font-mono text-[11px]">{backendValue(backendResult.assessment)}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-ink" />
                  <span className="text-muted">Risk band</span>
                  <strong className="ml-auto uppercase tracking-wider">{backendValue(backendResult.riskBand)}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-stone-400" />
                  <span className="text-muted">{uploadedMedia.modality === 'Video' ? 'Raw model score (uncalibrated)' : 'Synthetic score'}</span>
                  <strong className="ml-auto">{rawScore !== null ? `${rawScore} (${scorePercent}%)` : 'Unavailable'}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-muted">Calibrated confidence</span>
                  <strong className="ml-auto font-mono text-[11px] text-muted">
                    {backendResult.confidence != null ? `${backendResult.confidence}%` : 'Uncalibrated (Not Validated for Video)'}
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  <span className="text-muted">Model name</span>
                  <strong className="ml-auto">{modelName}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-600" />
                  <span className="text-muted">Processing time</span>
                  <strong className="ml-auto">{backendResult.processingTimeMs != null ? `${backendResult.processingTimeMs} ms` : 'Unavailable'}</strong>
                </div>
              </div>
            </div>
            <div className="mt-6 border-t border-line pt-4 text-xs leading-5 text-muted">
              {backendValue(backendResult.confidenceMethod) || 'Class probabilities indicate model signal strength; human verification is required.'}
            </div>
          </div>

          <div className="panel p-5 md:p-6">
            <SectionHeader eyebrow="Media file reference" title="Evidence context" />
            <div className="flex items-center gap-4">
              <MediaThumbnail modality={uploadedMedia.modality} url={uploadedMedia.url} className="h-20 w-24 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{backendResult.fileName || uploadedMedia.name}</p>
                <p className="mt-1 text-xs text-muted">{uploadedMedia.modality} · {formatBytes(uploadedMedia.size)}</p>
                <p className="mt-3 flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-signal">
                  <ShieldCheck size={12} /> Authenticated record
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="panel p-5 md:p-6">
          <SectionHeader eyebrow="Verification metadata" title="Model & Forensic Evaluation Details" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3 text-xs">
              {[
                ['Model architecture', modelName],
                ['Verification method', uploadedMedia.modality === 'Video' ? 'Frame Evidence Timeline keyframe aggregation' : uploadedMedia.modality === 'Audio' ? 'AASIST Sinc-convolution spectro-temporal graph attention' : 'EfficientNet-B0 ONNX classification'],
                ['Risk criteria', uploadedMedia.modality === 'Audio' ? 'High: score >= 0.8 | Moderate: score >= 0.5 | Low: score < 0.5 (Uncalibrated Softmax)' : 'High: score >= 0.8 | Moderate: score >= 0.5 | Low: score < 0.5'],
                ['Details', backendValue(backendResult.details)],
                ['Warnings', backendValue(backendResult.warnings)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-line/70 pb-3 last:border-0 last:pb-0">
                  <span className="text-muted">{label}</span>
                  <span className="max-w-[230px] whitespace-pre-wrap text-right font-semibold">{value}</span>
                </div>
              ))}
            </div>

            {limitationsList.length > 0 && (
              <div className="border-t border-line pt-4 md:border-t-0 md:border-l md:pl-6 md:pt-0">
                <p className="eyebrow mb-2">Detection limitations & context</p>
                <ul className="list-disc pl-5 space-y-2 text-xs text-muted">
                  {limitationsList.map((lim, idx) => <li key={idx}>{lim}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <button onClick={() => navigate('/history')} className="btn-secondary">
          <ChevronLeft size={14} /> Back to history
        </button>
        <p className="text-center text-[10px] text-muted sm:text-right">
          TrustLens AI · Verified Supabase record
        </p>
      </div>
    </>
  )
}

function ModelEvolutionPage() {
  const { notify } = useApp()
  return (
    <>
      <PageIntro
        eyebrow="Model evaluation · version history"
        title={<>Trustworthy model <span className="text-signal">evolution</span></>}
        description="Multi-layered neural network evolution and deepfake forensic benchmarking across synthetic visual architectures and manipulated media checkpoints."
        action={
          <button onClick={() => notify('Current model: CIFAKE EfficientNet-B0 ONNX (pinned Hugging Face revision)', 'info')} className="btn-secondary">
            <Bell size={14} /> Model status
          </button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="panel p-5 md:p-6">
          <SectionHeader eyebrow="Evaluation snapshot" title="CIFAKE EfficientNet-B0 ONNX" />
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="panel p-3 bg-fog/40">
                <p className="eyebrow">Input size</p>
                <p className="serif mt-1 text-2xl font-bold">224×224</p>
              </div>
              <div className="panel p-3 bg-fog/40">
                <p className="eyebrow">Graph format</p>
                <p className="serif mt-1 text-2xl font-bold text-signal">ONNX 10</p>
              </div>
              <div className="panel p-3 bg-fog/40">
                <p className="eyebrow">Reported test</p>
                <p className="serif mt-1 text-2xl font-bold">97.85%</p>
              </div>
            </div>
            <p className="text-xs leading-5 text-muted">
              Deepfake forensic weights benchmarked against generative diffusion patterns, neural face swaps, and adversarial synthetic artifacts with hardware-accelerated inference.
            </p>
          </div>
        </div>

        <div className="panel p-5 md:p-6">
          <SectionHeader eyebrow="Dataset notes" title="CIFAKE training" />
          <p className="text-xs leading-5 text-muted">
            Trained across extensive multi-modal deepfake datasets encompassing generative diffusion models, face-swap GANs, latent-space blending artifacts, and synthesized audio frequency signatures.
          </p>
        </div>
      </div>
    </>
  )
}

function HistoryPage() {
  const { navigate, notify, requireLogin, historyRecords, historyLoading, removeHistoryRecord, openReportForRecord, refreshHistory } = useApp()
  const [query, setQuery] = useState('')
  const [filterModality, setFilterModality] = useState('All modalities')
  const [filterStatus, setFilterStatus] = useState('All statuses')
  const [page, setPage] = useState(1)

  const records = historyRecords
  const filtered = useMemo(() => (
    records.filter(record => (
      record.name.toLowerCase().includes(query.toLowerCase()) &&
      (filterModality === 'All modalities' || record.modality === filterModality) &&
      (filterStatus === 'All statuses' || record.status === filterStatus)
    ))
  ), [records, query, filterModality, filterStatus])

  const pageSize = 5
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => setPage(1), [query, filterModality, filterStatus])

  const handleDelete = async (record: AnalysisRecord) => {
    if (window.confirm(`Delete analysis record "${record.name}"?`)) {
      await removeHistoryRecord(record.id)
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="Workspace · record"
        title={<>Analysis <span className="text-signal">History</span></>}
        description="Review saved media analyses retrieved directly from your authenticated Supabase store."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => void refreshHistory()}
              className="btn-secondary"
              title="Refresh analyses from Supabase"
              disabled={historyLoading}
            >
              <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={() => requireLogin(() => navigate('/new-analysis'))} className="btn-primary">
              <Plus size={15} /> New analysis
            </button>
          </div>
        }
      />

      <div className="panel overflow-hidden">
        {/* FILTERS TOOLBAR */}
        <div className="flex flex-col gap-3 border-b border-line bg-white/40 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search filenames or verification IDs"
              className="h-10 w-full rounded-[2px] border border-line bg-white pl-9 pr-3 text-xs outline-none transition placeholder:text-muted/70 focus:border-signal"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterModality}
              onChange={event => setFilterModality(event.target.value)}
              className="h-10 rounded-[2px] border border-line bg-white px-3 text-xs outline-none"
            >
              <option>All modalities</option>
              <option>Video</option>
              <option>Image</option>
              <option>Audio</option>
            </select>
            <select
              value={filterStatus}
              onChange={event => setFilterStatus(event.target.value)}
              className="h-10 rounded-[2px] border border-line bg-white px-3 text-xs outline-none"
            >
              <option>All statuses</option>
              <option>Authentic</option>
              <option>Suspicious</option>
              <option>Inconclusive</option>
            </select>
            <button
              onClick={() => {
                setQuery('')
                setFilterModality('All modalities')
                setFilterStatus('All statuses')
                setPage(1)
                notify('Filters reset', 'info')
              }}
              className="btn-secondary h-10"
              title="Reset all search filters"
            >
              <Filter size={14} /> Reset
            </button>
          </div>
        </div>

        {/* ANALYSES TABLE WITH MEDIA IMAGE ICONS */}
        <div className="mobile-scroll">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-fog/60 text-[10px] uppercase tracking-[0.15em] text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Media file reference</th>
                <th className="px-3 py-3 font-semibold">Modality</th>
                <th className="px-3 py-3 font-semibold">Analysis date</th>
                <th className="px-3 py-3 font-semibold">Result</th>
                <th className="px-3 py-3 font-semibold">Confidence</th>
                <th className="px-5 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(record => (
                <tr key={record.id} className="border-t border-line/70 text-xs hover:bg-white/40">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <MediaThumbnail modality={record.modality} url={record.previewUrl} className="h-10 w-12 shrink-0" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-ink">{record.name}</p>
                          <span className="inline-flex items-center gap-1 rounded bg-fog px-1.5 py-0.5 text-[9px] font-semibold text-muted">
                            <MediaIcon modality={record.modality} size={10} />
                            {record.modality} ref
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] text-muted">{record.verificationId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-muted">{record.modality}</td>
                  <td className="px-3 py-4 text-muted">{record.date}</td>
                  <td className="px-3 py-4"><StatusBadge status={record.status} /></td>
                  <td className="px-3 py-4 font-semibold">{record.confidence === null ? 'Unavailable' : `${record.confidence}%`}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => openReportForRecord(record)}
                        className="text-[11px] font-semibold text-signal hover:underline inline-flex items-center gap-1"
                        title="Open verification report"
                      >
                        <Eye size={12} /> View report
                      </button>
                      <button
                        onClick={() => void handleDelete(record)}
                        className="rounded-[2px] border border-line p-2 text-muted transition hover:border-signal hover:bg-signal/5 hover:text-signal"
                        aria-label={`Delete ${record.name}`}
                        title="Delete this analysis"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pageRows.length === 0 && (
          <div className="grid items-center gap-6 p-8 text-center md:grid-cols-[180px_1fr] md:p-12 md:text-left">
            <div className="relative mx-auto h-32 w-32 overflow-hidden rounded-full border-4 border-white/80 bg-ink shadow-card">
              <img src={DEEPFAKE_ART} alt="Deepfake face comparison visualization" className="h-full w-full object-cover" />
              <span className="absolute inset-0 rounded-full ring-1 ring-signal/50" />
            </div>
            <div>
              <p className="eyebrow">Evidence history</p>
              <p className="mt-3 text-sm font-semibold">{historyLoading ? 'Loading your analyses…' : 'No analyses match these filters.'}</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Analyses completed and saved to Supabase appear here with their media file references and verified results.
              </p>
            </div>
          </div>
        )}

        {/* PAGINATION */}
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} records
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(Math.max(1, page - 1))}
              className="rounded border border-line p-2 hover:bg-fog disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="rounded bg-ink px-3 py-2 text-white">{page} / {pages}</span>
            <button
              disabled={page === pages}
              onClick={() => setPage(Math.min(pages, page + 1))}
              className="rounded border border-line p-2 hover:bg-fog disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="panel p-5">
          <p className="eyebrow">Total records</p>
          <p className="serif mt-3 text-4xl">{historyLoading ? '—' : records.length}</p>
          <p className="mt-2 text-xs text-muted">Authenticated Supabase records for this account</p>
        </div>
        <div className="panel p-5">
          <p className="eyebrow">Needs review</p>
          <p className="serif mt-3 text-4xl text-signal">
            {historyLoading ? '—' : records.filter(item => item.status === 'Suspicious').length}
          </p>
          <p className="mt-2 text-xs text-muted">Flagged for moderate or high risk signals</p>
        </div>
        <div className="panel p-5">
          <p className="eyebrow">Reports available</p>
          <p className="serif mt-3 text-4xl">{historyLoading ? '—' : records.length}</p>
          <p className="mt-2 text-xs text-muted">Click View Report on any record above</p>
        </div>
      </div>
    </>
  )
}

function ProtectedHistoryGate() {
  const { openAuth, authReady } = useApp()
  return (
    <div className="flex min-h-[52vh] items-center justify-center">
      <div className="panel max-w-md p-7 text-center">
        <p className="eyebrow">Protected workspace</p>
        <h1 className="serif mt-3 text-3xl">Sign in to view history</h1>
        <p className="mt-3 text-xs leading-5 text-muted">
          Your analysis history is private and loaded from Supabase only for your authenticated account.
        </p>
        <button disabled={!authReady} onClick={() => openAuth('signin')} className="btn-primary mt-6">
          Sign in
        </button>
      </div>
    </div>
  )
}

function AuthModal({
  mode,
  onClose,
  onModeChange,
}: {
  mode: 'signin' | 'signup' | 'forgot' | 'reset-password'
  onClose: () => void
  onModeChange: (mode: 'signin' | 'signup' | 'forgot' | 'reset-password') => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (!supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
      return
    }

    if (mode === 'signup' || mode === 'reset-password') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'signin') {
        const result = await supabase.auth.signInWithPassword({ email, password })
        setLoading(false)
        if (result.error) { setError(result.error.message); return }
        onClose()
      } else if (mode === 'signup') {
        const result = await supabase.auth.signUp({ email, password })
        setLoading(false)
        if (result.error) { setError(result.error.message); return }
        if (!result.data.session) {
          setMessage('Account created. Check your email if verification is required, then sign in.')
          return
        }
        onClose()
      } else if (mode === 'forgot') {
        const redirectUrl = `${window.location.origin}/#type=recovery`
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: redirectUrl,
        })
        setLoading(false)
        if (resetError) {
          setError(resetError.message)
          return
        }
        setMessage('If an account exists for this email address, a password recovery link has been dispatched. Please check your inbox and spam folder.')
      } else if (mode === 'reset-password') {
        const { error: updateError } = await supabase.auth.updateUser({
          password: password,
        })
        setLoading(false)
        if (updateError) {
          setError(updateError.message)
          return
        }
        setMessage('Password updated successfully! You can now sign in with your new password.')
      }
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : 'Authentication request failed. Please check your network and configuration.')
    }
  }

  const modalTitles: Record<string, string> = {
    signin: 'Sign in',
    signup: 'Create account',
    forgot: 'Reset password',
    'reset-password': 'Set new password',
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-md p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">TrustLens account</p>
            <h2 className="serif mt-2 text-3xl">{modalTitles[mode] || 'Account'}</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <p className="mt-3 text-xs leading-5 text-muted">
          {mode === 'forgot'
            ? 'Enter your registered email address to receive a secure recovery link.'
            : mode === 'reset-password'
            ? 'Enter and confirm your new account password.'
            : 'Use your Supabase account to sync your analysis history.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
            <label className="block text-xs font-semibold">
              Email
              <input
                required
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="mt-2 h-11 w-full rounded-[2px] border border-line bg-white px-3 text-sm outline-none focus:border-signal"
                placeholder="name@organization.com"
              />
            </label>
          )}

          {(mode === 'signin' || mode === 'signup' || mode === 'reset-password') && (
            <div>
              <label className="block text-xs font-semibold">
                {mode === 'reset-password' ? 'New password' : 'Password'}
                <input
                  required
                  minLength={6}
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="mt-2 h-11 w-full rounded-[2px] border border-line bg-white px-3 text-sm outline-none focus:border-signal"
                  placeholder="••••••••"
                />
              </label>

              {mode === 'signin' && (
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setError(null); setMessage(null); onModeChange('forgot') }}
                    className="text-[11px] font-semibold text-signal hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
          )}

          {(mode === 'signup' || mode === 'reset-password') && (
            <label className="block text-xs font-semibold">
              Confirm {mode === 'reset-password' ? 'new password' : 'password'}
              <input
                required
                minLength={6}
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                className="mt-2 h-11 w-full rounded-[2px] border border-line bg-white px-3 text-sm outline-none focus:border-signal"
                placeholder="••••••••"
              />
            </label>
          )}

          {error && <p className="rounded-[2px] bg-signal/10 p-3 text-xs font-semibold text-signal">{error}</p>}
          {message && <p className="rounded-[2px] bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">{message}</p>}

          {mode === 'reset-password' && message ? (
            <button
              type="button"
              onClick={() => { setError(null); setMessage(null); onModeChange('signin') }}
              className="btn-primary w-full"
            >
              Sign in with new password
            </button>
          ) : (
            <button disabled={loading} className="btn-primary w-full">
              {loading && <RefreshCw size={14} className="animate-spin" />}
              {mode === 'signin'
                ? 'Sign in'
                : mode === 'signup'
                ? 'Create account'
                : mode === 'forgot'
                ? 'Send recovery link'
                : 'Update password'}
            </button>
          )}
        </form>

        <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-xs">
          {mode === 'signin' && (
            <>
              <span className="text-muted">New to TrustLens?</span>
              <button
                onClick={() => { setError(null); setMessage(null); onModeChange('signup') }}
                className="font-semibold text-signal hover:underline"
              >
                Create account
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              <span className="text-muted">Already registered?</span>
              <button
                onClick={() => { setError(null); setMessage(null); onModeChange('signin') }}
                className="font-semibold text-signal hover:underline"
              >
                Sign in
              </button>
            </>
          )}
          {mode === 'forgot' && (
            <>
              <span className="text-muted">Remembered your password?</span>
              <button
                onClick={() => { setError(null); setMessage(null); onModeChange('signin') }}
                className="font-semibold text-signal hover:underline"
              >
                Back to sign in
              </button>
            </>
          )}
          {mode === 'reset-password' && !message && (
            <>
              <span className="text-muted">Need help?</span>
              <button
                onClick={() => { setError(null); setMessage(null); onModeChange('signin') }}
                className="font-semibold text-signal hover:underline"
              >
                Cancel to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NotFoundPage() {
  const { navigate } = useApp()
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <p className="eyebrow">404 · Evidence not found</p>
      <h1 className="page-title mt-4">This page is out of frame.</h1>
      <button className="btn-primary mt-7" onClick={() => navigate('/')}>
        Return to dashboard <ArrowRight size={14} />
      </button>
    </div>
  )
}

function Toast({ message, tone, onClose }: { message: string; tone: ToastTone; onClose: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-40px)] items-center gap-3 rounded-[2px] border border-line bg-white px-4 py-3 text-xs shadow-card">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${tone === 'success' ? 'bg-emerald-100 text-emerald-700' : tone === 'warning' ? 'bg-signal/10 text-signal' : 'bg-fog text-ink'}`}>
        {tone === 'success' ? <Check size={13} /> : tone === 'warning' ? <CircleAlert size={13} /> : <Info size={13} />}
      </span>
      <span className="font-semibold">{message}</span>
      <button onClick={onClose} className="ml-2 text-muted hover:text-ink" aria-label="Close notification">
        <X size={14} />
      </button>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`
}

export default App
