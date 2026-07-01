import { z } from 'zod'

export const confidenceSchema = z.enum(['high', 'medium', 'low'])

export const containerTypeSchema = z.enum([
  'can',
  'bottle',
  'box',
  'case',
  'carton',
  'tray',
  'pack',
  'unknown',
])

export const countTypeSchema = z.enum(['single_items', 'stack', 'pack_case', 'mixed', 'unknown'])

export const visionItemSchema = z.object({
  item_name: z.string(),
  brand_name: z.string().nullable(),
  container_type: containerTypeSchema,
  count_type: countTypeSchema,
  visible_front_count: z.number(),
  visible_rows: z.number(),
  visible_columns: z.number(),
  estimated_depth: z.number(),
  depth_confidence: confidenceSchema,
  needs_depth_confirmation: z.boolean(),
  confirmed_depth: z.number().nullable(),
  suggested_total_units: z.number(),
  total_units: z.number(),
  visible_confirmed: z.boolean().default(false),
  user_confirmed_final: z.boolean().default(false),
  confirmation_method: z
    .enum(['none', 'ai_suggestion', 'depth', 'manual', 'bulk_same_qty', 'quick_group', 'bulk_total'])
    .default('none'),
  ai_raw_total_units: z.number().optional(),
  confidence: confidenceSchema,
  reasoning_note: z.string(),
  seen_in_images: z.array(z.number()).default([]),
})

export const visionModelOutputSchema = z.object({
  items: z.array(visionItemSchema),
  total_units: z.number(),
  overall_confidence: confidenceSchema,
  needs_user_confirmation: z.boolean(),
  warnings: z.array(z.string()),
})

export type VisionItem = z.infer<typeof visionItemSchema>
export type VisionModelOutput = z.infer<typeof visionModelOutputSchema>

import { computeSuggestedTotal } from './stackCount'

function coerceContainerType(value: unknown): z.infer<typeof containerTypeSchema> {
  const allowed = containerTypeSchema.options
  if (typeof value === 'string' && allowed.includes(value as never)) {
    return value as z.infer<typeof containerTypeSchema>
  }
  const map: Record<string, z.infer<typeof containerTypeSchema>> = {
    jar: 'pack',
    pouch: 'pack',
    packet: 'pack',
    crate: 'case',
  }
  if (typeof value === 'string' && map[value]) return map[value]
  return 'unknown'
}

function normalizeItem(raw: Record<string, unknown>): Record<string, unknown> {
  if (typeof raw.visible_front_count === 'number') {
    const visible = Number(raw.visible_front_count)
    const depth = Math.max(1, Number(raw.estimated_depth ?? 1))
    const suggested = computeSuggestedTotal(visible, depth)
    const aiTotal = Number(raw.total_units ?? raw.suggested_total_units ?? suggested)
    return {
      ...raw,
      container_type: coerceContainerType(raw.container_type),
      seen_in_images: Array.isArray(raw.seen_in_images) ? raw.seen_in_images : [],
      visible_confirmed: Boolean(raw.visible_confirmed),
      user_confirmed_final: Boolean(raw.user_confirmed_final),
      suggested_total_units: suggested,
      total_units: suggested,
      confirmation_method: raw.confirmation_method ?? 'none',
      ai_raw_total_units: aiTotal !== suggested ? aiTotal : undefined,
    }
  }

  const visible = Number(raw.visible_count ?? 0)
  const packSize = Number(raw.pack_size ?? 1)
  const packQty = Number(raw.pack_quantity ?? 0)
  const visibleFront = visible > 0 ? visible : packQty > 0 ? packQty : 1
  const estimatedDepth = Number(raw.estimated_depth ?? (packSize > 1 ? packSize : 1))
  const countTypeRaw = String(raw.count_type ?? 'unknown')
  const countType =
    countTypeRaw === 'stack' || countTypeRaw === 'pack_case' || countTypeRaw === 'single_items'
      ? countTypeRaw
      : estimatedDepth > 1
        ? 'stack'
        : countTypeRaw === 'mixed'
          ? 'mixed'
          : 'unknown'

  const needsDepth =
    typeof raw.needs_depth_confirmation === 'boolean'
      ? raw.needs_depth_confirmation
      : countType === 'stack' || estimatedDepth > 1

  const suggested = computeSuggestedTotal(visibleFront, estimatedDepth)
  const aiTotal = Number(raw.total_units ?? raw.suggested_total_units ?? suggested)

  return {
    item_name: String(raw.item_name ?? 'Unknown item'),
    brand_name: raw.brand_name == null ? null : String(raw.brand_name),
    container_type: coerceContainerType(raw.container_type),
    count_type: countType,
    visible_front_count: visibleFront,
    visible_rows: Number(raw.visible_rows ?? 1),
    visible_columns: Number(raw.visible_columns ?? visibleFront),
    estimated_depth: estimatedDepth,
    depth_confidence:
      raw.depth_confidence === 'high' || raw.depth_confidence === 'low'
        ? raw.depth_confidence
        : 'medium',
    needs_depth_confirmation: needsDepth,
    confirmed_depth: typeof raw.confirmed_depth === 'number' ? raw.confirmed_depth : null,
    suggested_total_units: suggested,
    total_units: suggested,
    visible_confirmed: Boolean(raw.visible_confirmed),
    user_confirmed_final: Boolean(raw.user_confirmed_final),
    confirmation_method: raw.confirmation_method ?? 'none',
    confidence:
      raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium',
    reasoning_note: String(raw.reasoning_note ?? ''),
    seen_in_images: Array.isArray(raw.seen_in_images) ? raw.seen_in_images : [],
    ai_raw_total_units: aiTotal !== suggested ? aiTotal : undefined,
  }
}

function normalizeOutput(raw: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(raw.items)
    ? raw.items.map(item =>
        normalizeItem(typeof item === 'object' && item ? (item as Record<string, unknown>) : {}),
      )
    : []

  const total_units = items.reduce(
    (sum, item) => sum + Number(item.suggested_total_units ?? item.total_units ?? 0),
    0,
  )

  const arithmeticWarnings = items
    .filter(item => item.ai_raw_total_units !== undefined)
    .map(
      item =>
        `AI arithmetic corrected for "${item.item_name}": reported ${item.ai_raw_total_units}, using ${item.suggested_total_units} (${item.visible_front_count} × ${item.estimated_depth})`,
    )

  const needsDepth = items.some(item => Boolean(item.needs_depth_confirmation))

  return {
    ...raw,
    items,
    total_units,
    overall_confidence:
      raw.overall_confidence === 'high' || raw.overall_confidence === 'low'
        ? raw.overall_confidence
        : needsDepth
          ? 'medium'
          : 'medium',
    needs_user_confirmation:
      typeof raw.needs_user_confirmation === 'boolean'
        ? raw.needs_user_confirmation || needsDepth
        : needsDepth,
    warnings: [
      ...(Array.isArray(raw.warnings) ? raw.warnings : []),
      ...arithmeticWarnings,
    ],
  }
}

export function parseVisionModelOutput(raw: unknown): VisionModelOutput {
  const normalized =
    typeof raw === 'object' && raw
      ? normalizeOutput(raw as Record<string, unknown>)
      : raw
  return visionModelOutputSchema.parse(normalized)
}

export function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON object found in model response')
    return JSON.parse(match[0])
  }
}
