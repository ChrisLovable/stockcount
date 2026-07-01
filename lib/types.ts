import type { VisionItem } from '@/lib/vision/schema'
import type { ModelOutputs } from '@/lib/vision/types'

export interface VisionConsensusResponse {
  count_image_id?: string | null
  final_items: VisionItem[]
  final_total_units: number
  overall_confidence: 'high' | 'medium' | 'low'
  needs_user_confirmation: boolean
  consensus_summary: string
  models_disagreed: boolean
  warnings: string[]
  model_outputs: ModelOutputs
  providers_used?: string[]
  burst_image_count?: number
  images_used?: string[]
}

export interface StockSession {
  id: string
  user_id: string
  session_name: string
  location: string | null
  status: 'in_progress' | 'completed'
  total_units: number
  created_at: string
  completed_at: string | null
}

export interface StockItem {
  id: string
  session_id: string
  user_id: string
  product_name: string
  count: number
  confidence: 'high' | 'medium' | 'low'
  image_url: string | null
  notes: string | null
  manually_adjusted: boolean
  created_at: string
}

export interface CountImage {
  id: string
  session_id: string
  user_id: string
  image_url: string
  ai_response: Record<string, unknown> | null
  created_at: string
}

/** @deprecated Use VisionItem via consensus response */
export interface AIItem {
  name: string
  count: number
  confidence: 'high' | 'medium' | 'low'
}

export function visionItemsToSaveRows(items: VisionItem[]) {
  return items.map(item => {
    const depthNote = item.confirmed_depth
      ? `depth ${item.confirmed_depth}`
      : item.estimated_depth > 1
        ? `est. depth ${item.estimated_depth}`
        : null
    const visibleNote =
      item.visible_front_count > 0 ? `visible front ${item.visible_front_count}` : null
    const notes = [item.reasoning_note, visibleNote, depthNote].filter(Boolean).join(' · ')

    return {
      name: item.brand_name ? `${item.brand_name} ${item.item_name}` : item.item_name,
      count: item.total_units,
      confidence: item.confidence,
      notes,
      manually_adjusted: item.user_confirmed_final,
    }
  })
}
