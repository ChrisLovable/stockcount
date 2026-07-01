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
  ai_response: AIResponse | null
  created_at: string
}

export interface AIItem {
  name: string
  count: number
  confidence: 'high' | 'medium' | 'low'
}

export interface AIResponse {
  items: AIItem[]
  total_units: number
  notes: string
}
