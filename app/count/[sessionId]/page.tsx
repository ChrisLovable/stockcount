'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CameraTab } from '@/components/CameraTab'
import { UploadTab } from '@/components/UploadTab'
import { BurstTab } from '@/components/BurstTab'
import type { StockSession } from '@/lib/types'
import { visionItemsToSaveRows } from '@/lib/types'
import type { VisionItem } from '@/lib/vision/schema'

import type { VisionPrepMode } from '@/lib/images/prepareForVision'

const TABS = [
  { id: 'camera', label: '📷 Camera' },
  { id: 'burst',  label: '⚡ Burst'  },
  { id: 'upload', label: '📁 Upload' },
] as const

type Tab = typeof TABS[number]['id']

export default function CountPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<StockSession | null>(null)
  const [tab, setTab] = useState<Tab>('camera')
  const [total, setTotal] = useState(0)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [instruction, setInstruction] = useState('')
  const [visionMode, setVisionMode] = useState<VisionPrepMode>('deep')

  useEffect(() => {
    if (tab === 'burst') setVisionMode('fast')
    else setVisionMode('deep')
  }, [tab])

  useEffect(() => {
    loadSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function loadSession() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setUser(user)

    const { data } = await supabase
      .from('stock_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (!data) { router.push('/dashboard'); return }
    setSession(data)
    setTotal(data.total_units)
  }

  async function handleCountConfirmed(
    items: VisionItem[],
    corrected: boolean,
    countImageId?: string | null,
  ) {
    if (!user || !session) return
    setSaving(true)
    try {
      const rows = visionItemsToSaveRows(items).map(row => ({
        ...row,
        manually_adjusted: corrected,
      }))
      const res = await fetch('/api/count/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          items: rows,
          userId: user.id,
          countImageId,
          userCorrected: corrected,
          userCorrectedItems: corrected ? items : undefined,
        }),
      })
      const data = await res.json()
      if (data.session) setTotal(data.session.total_units)
    } catch (err) {
      console.error('Save failed:', err)
    }
    setSaving(false)
  }

  async function handleDone() {
    if (!user || !session) return
    await supabase
      .from('stock_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', user.id)
    router.push(`/count/${sessionId}/report`)
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0a0a' }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b"
        style={{ background: '#0a0a0aee', borderColor: '#2a2a2a', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/dashboard')} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg" style={{ background: '#1a1a1a' }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                <path d="M10 3L5 8l5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h1 className="font-semibold text-white truncate">{session.session_name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <div className="text-right">
            <div className="text-xl font-bold text-white">{total}</div>
            <div className="text-xs" style={{ color: '#888888' }}>units</div>
          </div>
          <button
            onClick={handleDone}
            className="px-4 py-2 rounded-xl font-semibold text-sm text-white"
            style={{ background: '#22c55e' }}
          >
            Done
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mt-4 rounded-xl p-1 gap-1" style={{ background: '#1a1a1a' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: tab === t.id ? '#3b82f6' : 'transparent',
              color: tab === t.id ? '#fff' : '#888888',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Vision quality mode */}
      <div className="px-4 pt-3">
        <label className="block text-xs mb-1.5" style={{ color: '#888888' }}>
          Analysis mode
        </label>
        <div className="flex rounded-xl p-1 gap-1" style={{ background: '#1a1a1a' }}>
          {([
            { id: 'fast' as const, label: 'Fast Count', hint: '1024px · 70% quality' },
            { id: 'deep' as const, label: 'Deep Check', hint: '1280px · 80% quality' },
          ]).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setVisionMode(m.id)}
              className="flex-1 py-2.5 px-2 rounded-lg text-left transition-colors"
              style={{
                background: visionMode === m.id ? '#3b82f6' : 'transparent',
              }}
            >
              <span className="block text-sm font-semibold" style={{ color: visionMode === m.id ? '#fff' : '#ccc' }}>
                {m.label}
              </span>
              <span className="block text-[10px] mt-0.5" style={{ color: visionMode === m.id ? '#dbeafe' : '#666' }}>
                {m.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Instruction input — shared across all tabs */}
      <div className="px-4 pt-3">
        <label className="block text-xs mb-1.5" style={{ color: '#888888' }}>
          Notes for this count (optional)
        </label>
        <textarea
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder={'e.g. Aisle 3 — snack shelf top row only\nSingle shelf section — do not combine aisles\nEnd cap display — cereal boxes'}
          rows={2}
          className="w-full text-white text-sm outline-none resize-none placeholder-gray-600 focus:ring-1 focus:ring-blue-500"
          style={{
            background: '#1a1a1a',
            border: '0.5px solid #333',
            borderRadius: '10px',
            padding: '10px 12px',
            fontFamily: 'inherit',
            lineHeight: '1.5',
          }}
        />
        {/* Quick-select chips */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[
            'Single shelf only',
            'Full aisle section',
            'End cap display',
            'Loose items only',
            'Cases / cartons',
            'Cooler shelf',
          ].map(chip => (
            <button
              key={chip}
              onClick={() => setInstruction(prev => prev === chip ? '' : chip)}
              className="text-xs px-2.5 py-1 rounded-full transition-colors"
              style={{
                background: instruction === chip ? '#3b82f6' : '#1a1a1a',
                border: `0.5px solid ${instruction === chip ? '#3b82f6' : '#333'}`,
                color: instruction === chip ? '#fff' : '#888888',
                whiteSpace: 'nowrap',
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 py-4 overflow-y-auto">
        {saving && (
          <div className="mb-3 px-3 py-2 rounded-lg text-sm flex items-center gap-2" style={{ background: '#3b82f622', color: '#3b82f6' }}>
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            Saving to session...
          </div>
        )}

        {tab === 'camera' && (
          <CameraTab
            sessionId={sessionId}
            instruction={instruction}
            visionMode={visionMode}
            saving={saving}
            onCountConfirmed={handleCountConfirmed}
          />
        )}
        {tab === 'burst' && (
          <BurstTab
            sessionId={sessionId}
            instruction={instruction}
            visionMode={visionMode}
            saving={saving}
            onCountConfirmed={handleCountConfirmed}
          />
        )}
        {tab === 'upload' && (
          <UploadTab
            sessionId={sessionId}
            instruction={instruction}
            visionMode={visionMode}
            saving={saving}
            onCountConfirmed={handleCountConfirmed}
          />
        )}
      </div>
    </div>
  )
}
