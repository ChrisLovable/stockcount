import type { VisionItem, VisionModelOutput } from './schema'
import type { PreparedImage } from './prepareImages'
import type { ImagePrepLog } from '@/lib/images/prepareForVision'

export type VisionProvider = 'anthropic' | 'openai' | 'gemini' | 'arbiter'

export type AgreementLevel = 'high' | 'medium' | 'low'

export interface VisionImageInput {
  images: PreparedImage[]
  instruction?: string
  burstMode: boolean
}

export interface ProviderResult {
  provider: VisionProvider
  model: string
  output: VisionModelOutput
  latencyMs: number
}

export interface AgreementResult {
  level: AgreementLevel
  agreed: boolean
  totalDiff: number
  majorPackDisagreement: boolean
  countTypeMismatch: boolean
  summary: string
}

export interface ModelOutputs {
  anthropic?: VisionModelOutput
  openai?: VisionModelOutput
  gemini?: VisionModelOutput
  arbiter?: VisionModelOutput
}

export interface ConsensusResult {
  final_items: VisionItem[]
  final_total_units: number
  overall_confidence: 'high' | 'medium' | 'low'
  needs_user_confirmation: boolean
  consensus_summary: string
  models_disagreed: boolean
  warnings: string[]
  model_outputs: ModelOutputs
  providers_used: VisionProvider[]
  agreement?: AgreementResult
  burst_image_count: number
}

export interface StoredCountAnalysis {
  final_items: VisionItem[]
  final_total_units: number
  overall_confidence: 'high' | 'medium' | 'low'
  needs_user_confirmation: boolean
  model_outputs: ModelOutputs
  consensus_summary: string
  user_corrected_items: VisionItem[] | null
  images_used: string[]
  original_images?: string[]
  image_prep_logs?: ImagePrepLog[]
  vision_mode?: string
  burst_image_count: number
  warnings: string[]
  models_disagreed: boolean
  created_at: string
}
