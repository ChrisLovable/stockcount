'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { StockSession, StockItem } from '@/lib/types'

export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<StockSession | null>(null)
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function loadReport() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const [{ data: sessionData }, { data: itemsData }] = await Promise.all([
      supabase.from('stock_sessions').select('*').eq('id', sessionId).eq('user_id', user.id).single(),
      supabase.from('stock_items').select('*').eq('session_id', sessionId).eq('user_id', user.id).order('created_at'),
    ])

    if (!sessionData) { router.push('/dashboard'); return }
    setSession(sessionData)
    setItems(itemsData || [])
    setLoading(false)
  }

  async function downloadPDF() {
    setDownloading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    try {
      const res = await fetch('/api/report/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userId: user.id }),
      })
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stockcount-${session?.session_name?.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    }
    setDownloading(false)
  }

  function handleShare() {
    const text = `StockCount Report: ${session?.session_name}\nTotal: ${session?.total_units} units\n${new Date().toLocaleDateString()}`
    if (navigator.share) {
      navigator.share({ title: 'StockCount Report', text })
    } else {
      navigator.clipboard.writeText(text)
      alert('Report summary copied to clipboard')
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const grandTotal = items.reduce((s, i) => s + i.count, 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b" style={{ background: '#0a0a0aee', borderColor: '#2a2a2a', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => router.push('/dashboard')} className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0" style={{ background: '#1a1a1a' }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
            <path d="M10 3L5 8l5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="font-bold text-white text-lg truncate flex-1">Report</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Session info */}
        <div className="p-5 rounded-2xl" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <h2 className="text-xl font-bold text-white mb-1">{session?.session_name}</h2>
          {session?.location && <p className="text-sm mb-3" style={{ color: '#888888' }}>{session.location}</p>}
          <p className="text-xs mb-4" style={{ color: '#555555' }}>
            {session?.created_at ? formatDate(session.created_at) : ''}
          </p>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl text-center" style={{ background: '#0a0a0a', flex: 1 }}>
              <div className="text-3xl font-bold text-white">{grandTotal}</div>
              <div className="text-xs mt-1" style={{ color: '#888888' }}>Total Units</div>
            </div>
            <div className="p-3 rounded-xl text-center" style={{ background: '#0a0a0a', flex: 1 }}>
              <div className="text-3xl font-bold text-white">{items.length}</div>
              <div className="text-xs mt-1" style={{ color: '#888888' }}>Products</div>
            </div>
            <div className="p-3 rounded-xl text-center" style={{ background: '#0a0a0a', flex: 1 }}>
              <span className="inline-block text-xs font-semibold px-2 py-1 rounded-full" style={{
                background: session?.status === 'completed' ? '#22c55e22' : '#3b82f622',
                color: session?.status === 'completed' ? '#22c55e' : '#3b82f6',
              }}>
                {session?.status === 'completed' ? 'Complete' : 'In Progress'}
              </span>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #2a2a2a' }}>
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a' }}>
            <span className="flex-1 text-xs font-semibold uppercase tracking-wider" style={{ color: '#888888' }}>Product</span>
            <span className="w-16 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: '#888888' }}>Count</span>
            <span className="w-20 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: '#888888' }}>Adjusted</span>
          </div>
          {items.length === 0 ? (
            <div className="flex items-center justify-center py-12" style={{ background: '#1a1a1a' }}>
              <p className="text-sm" style={{ color: '#888888' }}>No items recorded</p>
            </div>
          ) : (
            items.map((item, i) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ background: i % 2 === 0 ? '#1a1a1a' : '#161616', borderBottom: i < items.length - 1 ? '1px solid #2a2a2a' : 'none' }}
              >
                <span className="flex-1 text-white text-sm font-medium truncate">{item.product_name}</span>
                <span className="w-16 text-right text-white font-bold">{item.count}</span>
                <span className="w-20 text-right text-xs" style={{ color: item.manually_adjusted ? '#f59e0b' : '#555555' }}>
                  {item.manually_adjusted ? 'Yes' : '—'}
                </span>
              </div>
            ))
          )}
          {items.length > 0 && (
            <div
              className="flex items-center gap-3 px-4 py-4"
              style={{ background: '#1a1a1a', borderTop: '2px solid #2a2a2a' }}
            >
              <span className="flex-1 font-bold text-white">Grand Total</span>
              <span className="w-16 text-right font-bold text-white text-lg">{grandTotal}</span>
              <span className="w-20" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={downloadPDF}
            disabled={downloading}
            className="flex-1 py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: '#3b82f6' }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="7 10 12 15 17 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {downloading ? 'Generating...' : 'Download PDF'}
          </button>
          <button
            onClick={handleShare}
            className="flex-1 py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <circle cx="18" cy="5" r="3" stroke="white" strokeWidth="1.5" />
              <circle cx="6" cy="12" r="3" stroke="white" strokeWidth="1.5" />
              <circle cx="18" cy="19" r="3" stroke="white" strokeWidth="1.5" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Share
          </button>
        </div>
      </div>
    </div>
  )
}
