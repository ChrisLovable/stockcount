import type { VisionItem } from './schema'

export type ConfirmationMethod =
  | 'none'
  | 'ai_suggestion'
  | 'depth'
  | 'manual'
  | 'bulk_same_qty'
  | 'quick_group'
  | 'bulk_total'

export function computeSuggestedTotal(visible: number, depth: number): number {
  return Math.max(0, Math.round(visible)) * Math.max(1, Math.round(depth))
}

function itemLabel(item: VisionItem): string {
  return item.brand_name ? `${item.brand_name} ${item.item_name}` : item.item_name
}

/** AI suggestion — always visible × estimated_depth. */
export function aiSuggestedTotalUnits(item: VisionItem): number {
  return item.suggested_total_units
}

export function hasAiArithmeticError(item: VisionItem): boolean {
  return item.ai_raw_total_units !== undefined
}

export function sumConfirmedTotalUnits(items: VisionItem[]): number {
  return items
    .filter(item => item.user_confirmed_final)
    .reduce((sum, item) => sum + item.total_units, 0)
}

export function sumAiSuggestedTotalUnits(items: VisionItem[]): number {
  return items.reduce((sum, item) => sum + item.suggested_total_units, 0)
}

export function isItemReadyToSave(item: VisionItem): boolean {
  return item.user_confirmed_final
}

export function canSaveAll(items: VisionItem[]): boolean {
  return items.length > 0 && items.every(isItemReadyToSave)
}

export function prepareItemsForReview(items: VisionItem[]): VisionItem[] {
  return items.map(item => ({
    ...item,
    visible_confirmed: false,
    user_confirmed_final: false,
    confirmed_depth: null,
    confirmation_method: 'none' as ConfirmationMethod,
    total_units: 0,
  }))
}

export function getCalculationMethodLabel(item: VisionItem): string {
  if (!item.user_confirmed_final) return 'Not confirmed'
  switch (item.confirmation_method) {
    case 'ai_suggestion':
      return `AI suggestion (${item.visible_front_count} × ${item.estimated_depth})`
    case 'depth':
      return `Visible × depth (${item.visible_front_count} × ${item.confirmed_depth})`
    case 'manual':
      return 'Manual final count'
    case 'bulk_same_qty':
      return `Bulk same quantity (${item.total_units} per group)`
    case 'quick_group':
      return `Quick group count (${item.total_units} per group)`
    case 'bulk_total':
      return 'Manual total override'
    default:
      return 'Unknown'
  }
}

function withConfirmed(
  item: VisionItem,
  total: number,
  method: ConfirmationMethod,
  depth: number | null,
): VisionItem {
  return {
    ...item,
    visible_confirmed: true,
    user_confirmed_final: true,
    confirmed_depth: depth,
    total_units: total,
    needs_depth_confirmation: false,
    confirmation_method: method,
  }
}

export function applyConfirmedDepth(
  item: VisionItem,
  depth: number,
  visibleOverride?: number,
): VisionItem {
  const visible = Math.max(0, Math.round(visibleOverride ?? item.visible_front_count))
  const confirmed = Math.max(1, Math.round(depth))
  return withConfirmed(
    { ...item, visible_front_count: visible },
    computeSuggestedTotal(visible, confirmed),
    'depth',
    confirmed,
  )
}

export function confirmAiSuggestion(item: VisionItem, visibleOverride?: number): VisionItem {
  const visible = Math.max(0, Math.round(visibleOverride ?? item.visible_front_count))
  const depth = Math.max(1, Math.round(item.estimated_depth))
  return withConfirmed(
    { ...item, visible_front_count: visible },
    computeSuggestedTotal(visible, depth),
    'ai_suggestion',
    depth,
  )
}

export function applyManualGroupQuantity(item: VisionItem, quantity: number): VisionItem {
  const total = Math.max(0, Math.round(quantity))
  const depth =
    item.visible_front_count > 0
      ? Math.max(1, Math.round(total / item.visible_front_count))
      : 1
  return withConfirmed({ ...item, visible_confirmed: true }, total, 'manual', depth)
}

export function confirmAllAiSuggestions(items: VisionItem[]): VisionItem[] {
  return items.map(item => confirmAiSuggestion(item))
}

export function applyDepthToAll(items: VisionItem[], depth: number): VisionItem[] {
  return items.map(item => applyConfirmedDepth(item, depth))
}

export function applySameQuantityToAll(items: VisionItem[], quantity: number): VisionItem[] {
  return items.map(item =>
    withConfirmed(item, Math.max(0, Math.round(quantity)), 'bulk_same_qty', null),
  )
}

export function createQuickGroupItems(
  groupCount: number,
  quantityPerGroup: number,
  template?: VisionItem,
): VisionItem[] {
  const groups = Math.max(1, Math.round(groupCount))
  const perGroup = Math.max(0, Math.round(quantityPerGroup))
  const base = template ?? {
    item_name: 'Product group',
    brand_name: null,
    container_type: 'unknown' as const,
    count_type: 'stack' as const,
    visible_front_count: perGroup,
    visible_rows: 1,
    visible_columns: perGroup,
    estimated_depth: 1,
    depth_confidence: 'low' as const,
    needs_depth_confirmation: false,
    confirmed_depth: 1,
    suggested_total_units: perGroup,
    total_units: perGroup,
    visible_confirmed: true,
    user_confirmed_final: true,
    confirmation_method: 'quick_group' as ConfirmationMethod,
    confidence: 'high' as const,
    reasoning_note: 'User quick group count',
    seen_in_images: [],
  }

  return Array.from({ length: groups }, (_, i) =>
    withConfirmed(
      {
        ...base,
        item_name: `Product group ${i + 1}`,
        brand_name: null,
        visible_front_count: perGroup,
        visible_columns: perGroup,
        suggested_total_units: perGroup,
        reasoning_note: `Quick count: ${groups} groups × ${perGroup} units`,
      },
      perGroup,
      'quick_group',
      1,
    ),
  )
}

export function applyQuickGroupToExisting(
  items: VisionItem[],
  groupCount: number,
  quantityPerGroup: number,
): VisionItem[] {
  const groups = Math.max(1, Math.round(groupCount))
  const perGroup = Math.max(0, Math.round(quantityPerGroup))

  if (items.length === groups) {
    return items.map((item, i) =>
      withConfirmed(
        {
          ...item,
          visible_front_count: perGroup,
          visible_columns: perGroup,
          suggested_total_units: perGroup,
          reasoning_note: `Quick count: group ${i + 1} = ${perGroup} units`,
        },
        perGroup,
        'quick_group',
        1,
      ),
    )
  }

  return createQuickGroupItems(groups, perGroup, items[0])
}

export function applyBulkManualTotal(total: number, template?: VisionItem): VisionItem[] {
  const t = Math.max(0, Math.round(total))
  const item = template ?? createQuickGroupItems(1, t)[0]
  return [
    withConfirmed(
      {
        ...item,
        item_name: 'Manual stock count',
        brand_name: null,
        visible_front_count: t,
        suggested_total_units: t,
        reasoning_note: `Manual total override: ${t} units`,
      },
      t,
      'bulk_total',
      1,
    ),
  ]
}

export function renameGroup(item: VisionItem, name: string): VisionItem {
  const trimmed = name.trim()
  if (!trimmed) return item
  const parts = trimmed.split(/\s+/)
  if (parts.length > 1 && parts[0].length <= 20) {
    return { ...item, brand_name: parts[0], item_name: parts.slice(1).join(' ') }
  }
  return { ...item, brand_name: null, item_name: trimmed }
}

export function splitGroup(item: VisionItem): [VisionItem, VisionItem] {
  const half = Math.ceil(item.visible_front_count / 2)
  const rest = Math.max(0, item.visible_front_count - half)
  const mk = (suffix: string, visible: number): VisionItem => ({
    ...item,
    item_name: `${item.item_name} (${suffix})`,
    visible_front_count: visible,
    visible_columns: visible,
    suggested_total_units: computeSuggestedTotal(visible, item.estimated_depth),
    user_confirmed_final: false,
    confirmed_depth: null,
    confirmation_method: 'none',
    total_units: 0,
    visible_confirmed: false,
  })
  return [mk('A', half), mk('B', rest)]
}

export function mergeGroups(a: VisionItem, b: VisionItem): VisionItem {
  const visible = a.visible_front_count + b.visible_front_count
  const depth = Math.max(a.estimated_depth, b.estimated_depth)
  return {
    ...a,
    item_name: a.brand_name && b.brand_name && a.brand_name === b.brand_name
      ? `${a.item_name} + ${b.item_name}`
      : `${itemLabel(a)} + ${itemLabel(b)}`,
    brand_name: a.brand_name || b.brand_name,
    visible_front_count: visible,
    visible_columns: visible,
    estimated_depth: depth,
    suggested_total_units: computeSuggestedTotal(visible, depth),
    reasoning_note: `Merged: ${a.reasoning_note}`,
    user_confirmed_final: false,
    confirmed_depth: null,
    confirmation_method: 'none',
    total_units: 0,
    visible_confirmed: false,
  }
}

export function finalizeItemsForSave(items: VisionItem[]): VisionItem[] {
  if (!canSaveAll(items)) {
    throw new Error('Confirm stock count before saving')
  }
  return items.map(item => {
    if (item.confirmation_method === 'manual' || item.confirmation_method === 'bulk_same_qty' || item.confirmation_method === 'quick_group' || item.confirmation_method === 'bulk_total') {
      return item
    }
    if (item.confirmation_method === 'depth' && item.confirmed_depth !== null) {
      const expected = computeSuggestedTotal(item.visible_front_count, item.confirmed_depth)
      if (item.total_units !== expected) {
        return { ...item, total_units: expected }
      }
    }
    return item
  })
}

export function validateItemForSave(item: VisionItem): string | null {
  if (!item.user_confirmed_final) return 'Not confirmed'
  if (item.confirmation_method === 'depth' && item.confirmed_depth !== null) {
    const expected = computeSuggestedTotal(item.visible_front_count, item.confirmed_depth)
    if (item.total_units !== expected) {
      return `Count mismatch: ${item.visible_front_count} × ${item.confirmed_depth} ≠ ${item.total_units}`
    }
  }
  if (item.confirmation_method === 'ai_suggestion') {
    const expected = computeSuggestedTotal(item.visible_front_count, item.estimated_depth)
    if (item.total_units !== expected) {
      return `AI suggestion mismatch: expected ${expected}, got ${item.total_units}`
    }
  }
  if (item.total_units < 0 || !Number.isFinite(item.total_units)) {
    return 'Invalid total_units'
  }
  return null
}

/**
 * Server-side re-validation of a batch of user-corrected items before persisting.
 * Mirrors validateItemForSave + canSaveAll but designed to run outside React state,
 * on whatever payload the client actually sent to the API.
 * Returns a list of error strings; empty array means the batch is safe to save.
 */
export function validateItemsForServerSave(items: VisionItem[]): string[] {
  if (!items.length) return ['No items provided']
  const errors: string[] = []
  items.forEach((item, i) => {
    const err = validateItemForSave(item)
    if (err) errors.push(`Group ${i + 1} (${item.item_name}): ${err}`)
  })
  return errors
}
