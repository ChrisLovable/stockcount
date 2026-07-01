'use client'

import { useMemo, useState } from 'react'
import type { VisionConsensusResponse } from '@/lib/types'
import type { VisionItem } from '@/lib/vision/schema'
import {
  aiSuggestedTotalUnits,
  applyBulkManualTotal,
  applyConfirmedDepth,
  applyDepthToAll,
  applyManualGroupQuantity,
  applyQuickGroupToExisting,
  applySameQuantityToAll,
  canSaveAll,
  confirmAllAiSuggestions,
  finalizeItemsForSave,
  getCalculationMethodLabel,
  mergeGroups,
  prepareItemsForReview,
  renameGroup,
  splitGroup,
  sumAiSuggestedTotalUnits,
  sumConfirmedTotalUnits,
  validateItemForSave,
} from '@/lib/vision/stackCount'
import { ConfidenceBadge } from './ui/ConfidenceBadge'

interface Props {
  result: VisionConsensusResponse
  saving?: boolean
  onConfirm: (items: VisionItem[], corrected: boolean, countImageId?: string | null) => void
}

function itemLabel(item: VisionItem): string {
  return item.brand_name ? `${item.brand_name} ${item.item_name}` : item.item_name
}

function ModelSection({
  title,
  output,
}: {
  title: string
  output: VisionConsensusResponse['model_outputs'][keyof VisionConsensusResponse['model_outputs']]
}) {
  const [open, setOpen] = useState(false)
  if (!output) return null

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-white">{title}</span>
        <span className="text-xs tabular-nums" style={{ color: '#888888' }}>
          {output.total_units} units · {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <pre className="px-4 pb-4 text-xs overflow-x-auto whitespace-pre-wrap" style={{ color: '#a3a3a3' }}>
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  )
}

const btn = (active = false, color = '#3b82f6') => ({
  padding: '8px 12px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: active ? color : '#0a0a0a',
  border: `1px solid ${active ? color : '#2a2a2a'}`,
  whiteSpace: 'nowrap' as const,
})

export function CountReviewPanel({ result, saving, onConfirm }: Props) {
  const [items, setItems] = useState<VisionItem[]>(() => prepareItemsForReview(result.final_items))
  const [visibleDrafts, setVisibleDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(result.final_items.map((item, i) => [i, String(item.visible_front_count)])),
  )
  const [quickGroups, setQuickGroups] = useState(String(result.final_items.length || 4))
  const [quickPerGroup, setQuickPerGroup] = useState('8')
  const [bulkSameQty, setBulkSameQty] = useState('8')
  const [manualTotal, setManualTotal] = useState('')
  const [customDepthIndex, setCustomDepthIndex] = useState<number | null>(null)
  const [customDepthValue, setCustomDepthValue] = useState('4')
  const [renameIndex, setRenameIndex] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [mergeFrom, setMergeFrom] = useState<number | null>(null)
  const [manualFinalIndex, setManualFinalIndex] = useState<number | null>(null)
  const [manualFinalValue, setManualFinalValue] = useState('0')

  const confirmedTotal = useMemo(() => sumConfirmedTotalUnits(items), [items])
  const aiSuggestedTotal = useMemo(() => sumAiSuggestedTotalUnits(items), [items])
  const readyToSave = canSaveAll(items)
  const quickTotal = (parseInt(quickGroups, 10) || 0) * (parseInt(quickPerGroup, 10) || 0)

  function visibleAt(index: number, item: VisionItem) {
    return parseInt(visibleDrafts[index] ?? '0', 10) || item.visible_front_count
  }

  function setAllItems(next: VisionItem[]) {
    setItems(next)
    setVisibleDrafts(Object.fromEntries(next.map((item, i) => [i, String(item.visible_front_count)])))
  }

  function handleDepth(index: number, depth: number) {
    setCustomDepthIndex(null)
    setManualFinalIndex(null)
    const visible = visibleAt(index, items[index])
    setItems(prev =>
      prev.map((item, i) =>
        i === index ? applyConfirmedDepth(item, depth, visible) : item,
      ),
    )
    setVisibleDrafts(prev => ({ ...prev, [index]: String(visible) }))
  }

  function handleManualFinal(index: number) {
    const qty = parseInt(manualFinalValue, 10) || 0
    setItems(prev => prev.map((item, i) => (i === index ? applyManualGroupQuantity(item, qty) : item)))
    setManualFinalIndex(null)
  }

  function handleSave() {
    if (!readyToSave) return
    onConfirm(finalizeItemsForSave(items), true, result.count_image_id)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary */}
      <div className="p-4 rounded-xl" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-xs" style={{ color: '#888' }}>AI suggested total</p>
            <p className="text-2xl font-bold tabular-nums text-white">{aiSuggestedTotal}</p>
            <p className="text-xs" style={{ color: '#888' }}>not saved unless confirmed</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: '#888' }}>Your confirmed total</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: readyToSave ? '#22c55e' : '#888' }}>
              {confirmedTotal}
            </p>
            <p className="text-xs" style={{ color: '#888' }}>stock units to save</p>
          </div>
        </div>
        <ConfidenceBadge confidence={result.overall_confidence} />
        <p className="text-sm mt-2" style={{ color: '#a3a3a3' }}>{result.consensus_summary}</p>
      </div>

      {/* Bulk actions */}
      <div className="p-4 rounded-xl flex flex-col gap-2" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <p className="text-sm font-semibold text-white">Quick confirm</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" style={btn(false, '#22c55e')} onClick={() => setAllItems(confirmAllAiSuggestions(items))}>
            Confirm AI suggestion
          </button>
          <button type="button" style={btn()} onClick={() => setAllItems(applyDepthToAll(items, 1))}>
            Apply depth 1 to all
          </button>
          <button type="button" style={btn()} onClick={() => setAllItems(applyDepthToAll(items, 2))}>
            Apply depth 2 to all
          </button>
          <button type="button" style={btn()} onClick={() => setAllItems(applyDepthToAll(items, 3))}>
            Apply depth 3 to all
          </button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="number"
            min={0}
            value={bulkSameQty}
            onChange={e => setBulkSameQty(e.target.value)}
            className="w-20 px-2 py-2 rounded-lg text-white outline-none"
            style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
          />
          <button
            type="button"
            style={btn()}
            onClick={() => setAllItems(applySameQuantityToAll(items, parseInt(bulkSameQty, 10) || 0))}
          >
            Set same qty per group
          </button>
          <input
            type="number"
            min={0}
            placeholder="Total"
            value={manualTotal}
            onChange={e => setManualTotal(e.target.value)}
            className="w-24 px-2 py-2 rounded-lg text-white outline-none"
            style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
          />
          <button
            type="button"
            style={btn()}
            onClick={() => setAllItems(applyBulkManualTotal(parseInt(manualTotal, 10) || 0, items[0]))}
          >
            Manual total override
          </button>
        </div>
      </div>

      {/* Quick group count */}
      <div className="p-4 rounded-xl" style={{ background: '#1a1a1a', border: '1px solid #3b82f6' }}>
        <p className="text-sm font-semibold text-white mb-3">Quick group count</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs" style={{ color: '#888' }}>Number of product groups</label>
            <input
              type="number"
              min={1}
              value={quickGroups}
              onChange={e => setQuickGroups(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg text-white outline-none"
              style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
            />
          </div>
          <div>
            <label className="text-xs" style={{ color: '#888' }}>Quantity per group</label>
            <input
              type="number"
              min={0}
              value={quickPerGroup}
              onChange={e => setQuickPerGroup(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg text-white outline-none"
              style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
            />
          </div>
        </div>
        <p className="text-sm mb-3" style={{ color: '#a3a3a3' }}>
          Total: <span className="text-white font-bold tabular-nums">{quickTotal}</span> units
          <span className="text-xs ml-1">({quickGroups} × {quickPerGroup})</span>
        </p>
        <button
          type="button"
          style={btn(false, '#22c55e')}
          onClick={() =>
            setAllItems(
              applyQuickGroupToExisting(
                items,
                parseInt(quickGroups, 10) || 1,
                parseInt(quickPerGroup, 10) || 0,
              ),
            )
          }
        >
          Use this count
        </button>
      </div>

      {/* Product groups */}
      <h3 className="font-semibold text-white">Product groups ({items.length})</h3>
      {items.map((item, i) => {
        const suggested = aiSuggestedTotalUnits(item)
        const visible = visibleAt(i, item)
        const validationError = validateItemForSave(item)

        return (
          <div key={i} className="p-4 rounded-xl" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                {renameIndex === i ? (
                  <div className="flex gap-2">
                    <input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      className="flex-1 px-2 py-1 rounded text-white outline-none"
                      style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
                    />
                    <button
                      type="button"
                      style={btn(false, '#22c55e')}
                      onClick={() => {
                        setItems(prev => prev.map((it, idx) => (idx === i ? renameGroup(it, renameValue) : it)))
                        setRenameIndex(null)
                      }}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <p className="text-white font-medium">{itemLabel(item)}</p>
                )}
                <p className="text-xs capitalize mt-0.5" style={{ color: '#888' }}>
                  {item.container_type} · {item.count_type.replace('_', ' ')}
                </p>
              </div>
              <ConfidenceBadge confidence={item.confidence} />
            </div>

            {item.ai_raw_total_units !== undefined && (
              <p className="text-xs mb-2 px-2 py-1 rounded" style={{ background: '#f59e0b22', color: '#f59e0b' }}>
                AI reported {item.ai_raw_total_units} — corrected to {suggested} ({item.visible_front_count} × {item.estimated_depth})
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 mb-3 text-sm rounded-lg p-3" style={{ background: '#0a0a0a' }}>
              <div>
                <p className="text-xs" style={{ color: '#888' }}>Visible</p>
                <input
                  type="number"
                  min={0}
                  value={visibleDrafts[i] ?? String(item.visible_front_count)}
                  onChange={e => setVisibleDrafts(prev => ({ ...prev, [i]: e.target.value }))}
                  className="w-full bg-transparent text-white font-bold tabular-nums outline-none"
                />
              </div>
              <div>
                <p className="text-xs" style={{ color: '#888' }}>Est. depth</p>
                <p className="text-white font-bold">{item.estimated_depth}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: '#888' }}>AI suggested</p>
                <p className="text-white font-bold tabular-nums">{suggested}</p>
              </div>
            </div>

            {/* One-tap depth */}
            <div className="flex flex-wrap gap-2 mb-3">
              {[1, 2, 3].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDepth(i, d)}
                  style={btn(item.confirmed_depth === d && item.user_confirmed_final)}
                >
                  {d} deep ({visible * d})
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCustomDepthIndex(customDepthIndex === i ? null : i)
                  setCustomDepthValue(String(item.estimated_depth || 4))
                }}
                style={btn(customDepthIndex === i)}
              >
                Custom
              </button>
            </div>
            {customDepthIndex === i && (
              <div className="flex gap-2 mb-3">
                <input
                  type="number"
                  min={1}
                  value={customDepthValue}
                  onChange={e => setCustomDepthValue(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg text-white outline-none"
                  style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
                />
                <button
                  type="button"
                  style={btn(false, '#3b82f6')}
                  onClick={() => handleDepth(i, parseInt(customDepthValue, 10) || 1)}
                >
                  Apply
                </button>
              </div>
            )}

            {/* Group controls */}
            <div className="flex flex-wrap gap-2 mb-3 text-xs">
              <button type="button" style={btn()} onClick={() => { setRenameIndex(i); setRenameValue(itemLabel(item)) }}>
                Rename
              </button>
              <button
                type="button"
                style={btn()}
                onClick={() => {
                  const [a, b] = splitGroup(item)
                  setItems(prev => [...prev.slice(0, i), a, b, ...prev.slice(i + 1)])
                }}
              >
                Split
              </button>
              <button
                type="button"
                style={btn(mergeFrom === i, '#f59e0b')}
                onClick={() => {
                  if (mergeFrom === null) setMergeFrom(i)
                  else if (mergeFrom === i) setMergeFrom(null)
                  else {
                    const merged = mergeGroups(items[mergeFrom], item)
                    const lo = Math.min(mergeFrom, i)
                    const hi = Math.max(mergeFrom, i)
                    setAllItems([...items.slice(0, lo), merged, ...items.slice(hi + 1)])
                    setMergeFrom(null)
                  }
                }}
              >
                {mergeFrom === i ? 'Cancel merge' : mergeFrom !== null ? 'Merge here' : 'Merge'}
              </button>
              <button
                type="button"
                style={btn(false, '#ef4444')}
                onClick={() => setAllItems(items.filter((_, idx) => idx !== i))}
              >
                Delete
              </button>
              <button
                type="button"
                style={btn(manualFinalIndex === i)}
                onClick={() => {
                  setManualFinalIndex(manualFinalIndex === i ? null : i)
                  setManualFinalValue(String(item.user_confirmed_final ? item.total_units : suggested))
                }}
              >
                Manual final
              </button>
            </div>
            {manualFinalIndex === i && (
              <div className="flex gap-2 mb-3">
                <input
                  type="number"
                  min={0}
                  value={manualFinalValue}
                  onChange={e => setManualFinalValue(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg text-white font-bold outline-none"
                  style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
                />
                <button type="button" style={btn(false, '#22c55e')} onClick={() => handleManualFinal(i)}>
                  Confirm
                </button>
              </div>
            )}

            {/* Confirmed status */}
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: item.user_confirmed_final ? '#22c55e18' : '#f59e0b18',
                border: `1px solid ${item.user_confirmed_final ? '#22c55e44' : '#f59e0b44'}`,
              }}
            >
              <p className="text-xs" style={{ color: '#888' }}>Confirmed final</p>
              <p className="font-bold tabular-nums" style={{ color: item.user_confirmed_final ? '#22c55e' : '#f59e0b' }}>
                {item.user_confirmed_final ? `${item.total_units} units` : '—'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#888' }}>
                Method: {getCalculationMethodLabel(item)}
              </p>
              {validationError && item.user_confirmed_final && (
                <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{validationError}</p>
              )}
            </div>
          </div>
        )
      })}

      <div className="flex justify-between px-4 py-3 rounded-xl" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <span className="font-semibold text-white">Save total</span>
        <span className="text-2xl font-bold tabular-nums" style={{ color: readyToSave ? '#22c55e' : '#888' }}>
          {confirmedTotal} units
        </span>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !readyToSave}
        className="w-full py-4 rounded-xl font-semibold text-white disabled:opacity-40"
        style={{ background: '#22c55e' }}
      >
        {saving ? 'Saving...' : readyToSave ? `Save confirmed count (${confirmedTotal})` : 'Confirm count to save'}
      </button>

      {/* Debug */}
      <div className="flex flex-col gap-2 pt-2">
        <p className="text-xs font-medium px-1" style={{ color: '#888' }}>Debug</p>
        <div className="px-3 py-2 rounded-lg text-xs space-y-1" style={{ background: '#1a1a1a', color: '#a3a3a3' }}>
          <p>AI suggested total: {aiSuggestedTotal}</p>
          <p>User confirmed total: {confirmedTotal}</p>
          {items.map((item, i) => (
            <p key={i}>
              {itemLabel(item)}: {item.user_confirmed_final ? item.total_units : '—'} — {getCalculationMethodLabel(item)}
            </p>
          ))}
        </div>
        <ModelSection title="Claude" output={result.model_outputs.anthropic} />
      </div>
    </div>
  )
}
