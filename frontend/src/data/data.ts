import type { Modality } from '../types'

export const ARTWORK = '/deepfake-face.jpg'
export const DEEPFAKE_ART = '/deepfake-face.jpg'

export const navItems = [
  { label: 'Dashboard', path: '/' },
  { label: 'About', path: '/about' },
  { label: 'Analyze Media', path: '/analyze' },
  { label: 'Verification Report', path: '/report' },
  { label: 'Model Evolution', path: '/model-evolution' },
  { label: 'Analysis History', path: '/history' },
]

export const modalityOptions: Record<Modality, string[]> = {
  Video: ['Frame Evidence', 'Facial Consistency', 'Temporal Consistency'],
  Image: ['Visual Manipulation', 'Image Artifacts', 'Metadata Examination'],
  Audio: ['Synthetic Speech Indicators', 'Audio Artifacts', 'Voice Consistency'],
}
