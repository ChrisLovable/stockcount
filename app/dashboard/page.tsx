'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { StockSession } from '@/lib/types'

export default function DashboardPage() {
  const [sessions, setSessions] = useState<StockSession[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [creating, setCreating] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadSessions() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data } = await supabase
      .from('stock_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setSessions(data || [])
    setLoading(false)
  }

  async function createSession(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('stock_sessions')
      .insert({ session_name: newName.trim(), location: newLocation.trim() || null, user_id: user.id })
      .select()
      .single()

    if (data) {
      router.push(`/count/${data.id}`)
    }
    setCreating(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 border-b" style={{ background: '#0a0a0aee', borderColor: '#2a2a2a', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: '#3b82f6' }}>
            <svg width="16" height="16" viewBox="0 0 40 40" fill="none">
              <rect x="6" y="8" width="28" height="5" rx="2" fill="white" />
              <rect x="6" y="18" width="20" height="5" rx="2" fill="white" />
              <rect x="6" y="28" width="24" height="5" rx="2" fill="white" />
            </svg>
          </span>
          <span className="font-bold text-white text-lg">StockCount</span>
        </div>
        <button onClick={handleSignOut} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: '#888888', background: '#1a1a1a' }}>
          Sign out
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Stock Counts</h1>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-white text-sm"
            style={{ background: '#3b82f6' }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
              <path d="M8 3v10M3 8h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New Count
          </button>
        </div>

        {/* New session modal */}
        {showNew && (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6" style={{ background: '#000000cc' }}>
            <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <h2 className="text-xl font-bold text-white mb-5">New Stock Count</h2>
              <form onSubmit={createSession} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm mb-2" style={{ color: '#888888' }}>Session Name *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Weekly Count - Aisle 3"
                    required
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2" style={{ color: '#888888' }}>Location</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    placeholder="e.g. Warehouse B"
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNew(false)}
                    className="flex-1 py-3 rounded-xl font-semibold text-white"
                    style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                    style={{ background: '#3b82f6' }}
                  >
                    {creating ? 'Creating...' : 'Start Counting'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Sessions list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#1a1a1a' }}>
              <svg width="32" height="32" fill="none" viewBox="0 0 32 32">
                <rect x="6" y="6" width="20" height="4" rx="2" fill="#2a2a2a" />
                <rect x="6" y="14" width="14" height="4" rx="2" fill="#2a2a2a" />
                <rect x="6" y="22" width="16" height="4" rx="2" fill="#2a2a2a" />
              </svg>
            </div>
            <p className="font-semibold text-white mb-1">No counts yet</p>
            <p className="text-sm" style={{ color: '#888888' }}>Tap &quot;New Count&quot; to get started</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => router.push(session.status === 'completed' ? `/count/${session.id}/report` : `/count/${session.id}`)}
                className="w-full text-left p-4 rounded-xl transition-opacity hover:opacity-80"
                style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${session.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`} />
                      <span className="font-semibold text-white truncate">{session.session_name}</span>
                    </div>
                    {session.location && (
                      <p className="text-sm mb-2 truncate" style={{ color: '#888888' }}>{session.location}</p>
                    )}
                    <p className="text-xs" style={{ color: '#555555' }}>{formatDate(session.created_at)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold text-white">{session.total_units}</div>
                    <div className="text-xs" style={{ color: '#888888' }}>units</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
