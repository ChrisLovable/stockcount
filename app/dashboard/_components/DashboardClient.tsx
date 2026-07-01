'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { StockSession } from '@/lib/types'

const C = {
  bg: '#0a0a0a',
  card: '#1a1a1a',
  border: '#2a2a2a',
  primary: '#3b82f6',
  muted: '#888888',
  dim: '#555555',
  white: '#ffffff',
}

export default function DashboardClient() {
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
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      const { data, error } = await supabase
        .from('stock_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setSessions(data || [])
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  async function createSession(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('stock_sessions')
        .insert({
          session_name: newName.trim(),
          location: newLocation.trim() || null,
          user_id: user.id,
        })
        .select()
        .single()

      if (error) throw error
      if (data) router.push(`/count/${data.id}`)
    } catch (err) {
      console.error('Failed to create session:', err)
    } finally {
      setCreating(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.white, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          borderBottom: `1px solid ${C.border}`,
          background: 'rgba(10,10,10,0.95)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 8,
              background: C.primary,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 40 40" fill="none" aria-hidden>
              <rect x="6" y="8" width="28" height="5" rx="2" fill="white" />
              <rect x="6" y="18" width="20" height="5" rx="2" fill="white" />
              <rect x="6" y="28" width="24" height="5" rx="2" fill="white" />
            </svg>
          </span>
          <span style={{ fontWeight: 700, fontSize: 18, color: C.white }}>StockCount</span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            fontSize: 14,
            padding: '6px 12px',
            borderRadius: 8,
            color: C.muted,
            background: C.card,
            border: `1px solid ${C.border}`,
          }}
        >
          Sign out
        </button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 512, margin: '0 auto', padding: '24px 16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
            gap: 12,
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.white, margin: 0 }}>Stock Counts</h1>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              color: C.white,
              background: C.primary,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16" aria-hidden>
              <path d="M8 3v10M3 8h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New Count
          </button>
        </div>

        {showNew && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              padding: '0 16px 24px',
              background: 'rgba(0,0,0,0.8)',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 512,
                borderRadius: 16,
                padding: 24,
                background: C.card,
                border: `1px solid ${C.border}`,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.white, margin: '0 0 20px' }}>New Stock Count</h2>
              <form onSubmit={createSession} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, marginBottom: 8, color: C.muted }}>
                    Session Name *
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Weekly Count - Aisle 3"
                    required
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 12,
                      color: C.white,
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, marginBottom: 8, color: C.muted }}>
                    Location
                  </label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    placeholder="e.g. Warehouse B"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 12,
                      color: C.white,
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowNew(false)}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      borderRadius: 12,
                      fontWeight: 600,
                      color: C.white,
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      borderRadius: 12,
                      fontWeight: 600,
                      color: C.white,
                      background: C.primary,
                      opacity: creating ? 0.5 : 1,
                    }}
                  >
                    {creating ? 'Creating...' : 'Start Counting'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div
              className="spinner"
              style={{
                width: 32,
                height: 32,
                border: '2px solid #3b82f6',
                borderTopColor: 'transparent',
                borderRadius: '50%',
              }}
            />
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 16px' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: C.card,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <svg width="32" height="32" fill="none" viewBox="0 0 32 32" aria-hidden>
                <rect x="6" y="6" width="20" height="4" rx="2" fill="#2a2a2a" />
                <rect x="6" y="14" width="14" height="4" rx="2" fill="#2a2a2a" />
                <rect x="6" y="22" width="16" height="4" rx="2" fill="#2a2a2a" />
              </svg>
            </div>
            <p style={{ fontWeight: 600, color: C.white, margin: '0 0 4px' }}>No counts yet</p>
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Tap &quot;New Count&quot; to get started</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map(session => (
              <button
                key={session.id}
                type="button"
                onClick={() =>
                  router.push(
                    session.status === 'completed'
                      ? `/count/${session.id}/report`
                      : `/count/${session.id}`,
                  )
                }
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 16,
                  borderRadius: 12,
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  color: C.white,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: session.status === 'completed' ? '#22c55e' : C.primary,
                        }}
                      />
                      <span
                        style={{
                          fontWeight: 600,
                          color: C.white,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {session.session_name}
                      </span>
                    </div>
                    {session.location && (
                      <p
                        style={{
                          fontSize: 14,
                          color: C.muted,
                          margin: '0 0 8px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {session.location}
                      </p>
                    )}
                    <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>{formatDate(session.created_at)}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: C.white }}>{session.total_units}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>units</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
