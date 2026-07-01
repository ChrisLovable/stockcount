'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CameraTab } from '@/components/CameraTab'
import { UploadTab } from '@/components/UploadTab'
import type { StockSession, AIItem } from '@/lib/types'

export default function CountPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<StockSession | null>(null)
  const [tab, setTab] = useState<'camera' | 'upload'>('camera')
  const [total, setTotal] = useState(0)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)

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

  async function handleItemsAdded(items: AIItem[]) {
    if (!user || !session) return
    setSaving(true)
    try {
      const res = await fetch('/api/count/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, items, userId: user.id }),
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
        {(['camera', 'upload'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize transition-colors"
            style={{
              background: tab === t ? '#3b82f6' : 'transparent',
              color: tab === t ? '#fff' : '#888888',
            }}
          >
            {t === 'camera' ? '📷 Camera' : '📁 Upload'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 py-4 overflow-y-auto">
        {saving && (
          <div className="mb-3 px-3 py-2 rounded-lg text-sm flex items-center gap-2" style={{ background: '#3b82f622', color: '#3b82f6' }}>
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            Saving to session...
          </div>
        )}

        {tab === 'camera' ? (
          <CameraTab sessionId={sessionId} onItemsAdded={handleItemsAdded} />
        ) : (
          <UploadTab sessionId={sessionId} onItemsAdded={handleItemsAdded} />
        )}
      </div>
    </div>
  )
}
