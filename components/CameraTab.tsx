'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import type { AIItem } from '@/lib/types'
import { ConfidenceBadge } from './ui/ConfidenceBadge'

interface Props {
  sessionId: string
  instruction: string
  onItemsAdded: (items: AIItem[]) => void
}

export function CameraTab({ sessionId, instruction, onItemsAdded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [results, setResults] = useState<AIItem[] | null>(null)
  const [error, setError] = useState('')
  const [editItems, setEditItems] = useState<AIItem[]>([])
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    setCameraReady(false)
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => setCameraReady(true)
      }
    } catch {
      setCameraError('Camera access denied. Please allow camera permissions.')
    }
  }, [])

  useEffect(() => {
    startCamera(facingMode)
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [facingMode, startCamera])

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.85))
    setResults(null)
    setError('')
  }

  function retake() {
    setCapturedImage(null)
    setResults(null)
    setError('')
    setEditItems([])
  }

  async function analysePhoto() {
    if (!capturedImage) return
    setAnalysing(true)
    setError('')
    try {
      const blob = await (await fetch(capturedImage)).blob()
      const form = new FormData()
      form.append('image', blob, 'capture.jpg')
      form.append('sessionId', sessionId)
      if (instruction) form.append('instruction', instruction)

      const res = await fetch('/api/count/analyse', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      setResults(data.items)
      setEditItems(data.items.map((item: AIItem) => ({ ...item })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    }
    setAnalysing(false)
  }

  function updateItem(index: number, field: keyof AIItem, value: string | number) {
    setEditItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function handleAddToTotal() {
    onItemsAdded(editItems)
    retake()
  }

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#1a1a1a' }}>
          <svg width="32" height="32" fill="none" viewBox="0 0 32 32">
            <path d="M4 10a2 2 0 012-2h2l2-3h8l2 3h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V10z" stroke="#888" strokeWidth="1.5" />
            <circle cx="16" cy="17" r="4" stroke="#888" strokeWidth="1.5" />
          </svg>
        </div>
        <p className="text-white font-semibold mb-2">Camera unavailable</p>
        <p className="text-sm mb-4" style={{ color: '#888888' }}>{cameraError}</p>
        <button onClick={() => startCamera(facingMode)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#3b82f6' }}>
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Camera / Preview */}
      <div className="relative rounded-2xl overflow-hidden" style={{ background: '#000' }}>
        {!capturedImage ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full"
              style={{ display: cameraReady ? 'block' : 'none', aspectRatio: '4/3', objectFit: 'cover' }}
            />
            {!cameraReady && (
              <div className="flex items-center justify-center" style={{ aspectRatio: '4/3' }}>
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capturedImage} alt="Captured" className="w-full" style={{ aspectRatio: '4/3', objectFit: 'cover' }} />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      {!capturedImage ? (
        <div className="flex items-center justify-center gap-8">
          <div className="w-10" />
          <button
            onClick={capturePhoto}
            disabled={!cameraReady}
            className="w-20 h-20 rounded-full flex items-center justify-center border-4 border-white disabled:opacity-40 transition-opacity active:opacity-70"
            style={{ background: 'transparent' }}
          >
            <div className="w-14 h-14 rounded-full bg-white" />
          </button>
          <button
            onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: '#1a1a1a' }}
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
              <path d="M1 4v6h6M23 20v-6h-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={retake}
            className="flex-1 py-3 rounded-xl font-semibold text-white"
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            Retake
          </button>
          <button
            onClick={analysePhoto}
            disabled={analysing}
            className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
            style={{ background: '#3b82f6' }}
          >
            {analysing ? 'Analysing...' : 'Analyse'}
          </button>
        </div>
      )}

      {/* Loading state */}
      {analysing && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <div className="pulse-ring absolute inset-0 rounded-full border-2 border-blue-500 opacity-30" />
          </div>
          <p className="text-sm font-medium" style={{ color: '#888888' }}>AI is counting...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results && editItems.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold text-white">Detected Items</h3>
          {editItems.map((item, i) => (
            <div key={i} className="p-4 rounded-xl" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <input
                  value={item.name}
                  onChange={e => updateItem(i, 'name', e.target.value)}
                  className="flex-1 bg-transparent text-white font-medium outline-none border-b border-transparent focus:border-blue-500 pb-0.5"
                />
                <ConfidenceBadge confidence={item.confidence} />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updateItem(i, 'count', Math.max(0, item.count - 1))}
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl"
                  style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
                >
                  -
                </button>
                <input
                  type="number"
                  value={item.count}
                  onChange={e => updateItem(i, 'count', parseInt(e.target.value) || 0)}
                  className="flex-1 text-center text-2xl font-bold text-white bg-transparent outline-none"
                  min={0}
                />
                <button
                  onClick={() => updateItem(i, 'count', item.count + 1)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl"
                  style={{ background: '#0a0a0a', border: '1px solid #2a2a2a' }}
                >
                  +
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={handleAddToTotal}
            className="w-full py-4 rounded-xl font-semibold text-white"
            style={{ background: '#22c55e' }}
          >
            Add to Total ({editItems.reduce((s, i) => s + i.count, 0)} units)
          </button>
        </div>
      )}
    </div>
  )
}
