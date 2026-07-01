'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { AIItem } from '@/lib/types'
import { ConfidenceBadge } from './ui/ConfidenceBadge'

interface FrameResult {
  items: AIItem[]
  total_units: number
  notes: string
}

type Status = 'idle' | 'recording' | 'extracting' | 'analysing' | 'done'

interface Props {
  sessionId: string
  instruction: string
  onItemsAdded: (items: AIItem[]) => void
}

async function extractFrames(videoBlob: Blob, intervalSeconds: number = 2): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(videoBlob)
    video.src = url
    video.muted = true

    const frames: string[] = []

    video.onloadedmetadata = () => {
      const duration = video.duration
      const times: number[] = []
      for (let t = 0; t < duration; t += intervalSeconds) {
        times.push(t)
      }

      let index = 0

      const captureFrame = () => {
        if (index >= times.length) {
          URL.revokeObjectURL(url)
          resolve(frames)
          return
        }
        video.currentTime = times[index]
        index++
      }

      video.onseeked = () => {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(video, 0, 0)
        frames.push(canvas.toDataURL('image/jpeg', 0.8))
        captureFrame()
      }

      captureFrame()
    }

    video.load()
  })
}

function mergeFrameResults(allResults: FrameResult[]): AIItem[] {
  const merged: Record<string, { count: number; confidence: 'high' | 'medium' | 'low' }> = {}

  allResults.forEach(result => {
    result.items.forEach(item => {
      const key = item.name.toLowerCase().trim()
      if (!merged[key] || item.count > merged[key].count) {
        merged[key] = { count: item.count, confidence: item.confidence }
      }
    })
  })

  return Object.entries(merged).map(([name, data]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    count: data.count,
    confidence: data.confidence,
  }))
}

export function VideoTab({ sessionId, instruction, onItemsAdded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const [status, setStatus] = useState<Status>('idle')
  const [seconds, setSeconds] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [editItems, setEditItems] = useState<AIItem[]>([])
  const [error, setError] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')

  const startPreview = useCallback(async () => {
    setCameraReady(false)
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
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
    startPreview()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startPreview])

  async function analyseFrame(dataUrl: string): Promise<FrameResult> {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const res = await fetch('/api/count/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, sessionId, instruction }),
    })
    if (!res.ok) throw new Error('Frame analysis failed')
    return res.json()
  }

  function startRecording() {
    if (!streamRef.current) return
    chunksRef.current = []
    setError('')
    setSeconds(0)
    setEditItems([])

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'

    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType })
    mediaRecorderRef.current = mediaRecorder

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    mediaRecorder.onstop = async () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())

      const videoBlob = new Blob(chunksRef.current, { type: mimeType })

      setStatus('extracting')
      let frames: string[] = []
      try {
        frames = await extractFrames(videoBlob, 2)
      } catch {
        setError('Failed to extract frames from the video.')
        setStatus('idle')
        startPreview()
        return
      }

      if (frames.length === 0) {
        setError('No frames could be extracted. Try recording for longer.')
        setStatus('idle')
        startPreview()
        return
      }

      setTotalFrames(frames.length)
      setStatus('analysing')

      const allResults: FrameResult[] = []
      for (let i = 0; i < frames.length; i++) {
        setCurrentFrame(i + 1)
        try {
          const result = await analyseFrame(frames[i])
          if (result?.items?.length) allResults.push(result)
        } catch {
          // skip failed frames, continue with rest
        }
      }

      setEditItems(mergeFrameResults(allResults))
      setStatus('done')
    }

    mediaRecorder.start(1000)
    setStatus('recording')

    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
  }

  function reset() {
    setStatus('idle')
    setSeconds(0)
    setTotalFrames(0)
    setCurrentFrame(0)
    setEditItems([])
    setError('')
    startPreview()
  }

  function updateItem(index: number, field: keyof AIItem, value: string | number) {
    setEditItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function handleAddToTotal() {
    onItemsAdded(editItems)
    reset()
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const isProcessing = status === 'extracting' || status === 'analysing'

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#1a1a1a' }}>
          <svg width="32" height="32" fill="none" viewBox="0 0 32 32">
            <rect x="2" y="8" width="20" height="16" rx="2" stroke="#888" strokeWidth="1.5" />
            <path d="M22 13l8-4v14l-8-4V13z" stroke="#888" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-white font-semibold mb-2">Camera unavailable</p>
        <p className="text-sm mb-4" style={{ color: '#888888' }}>{cameraError}</p>
        <button onClick={startPreview} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#3b82f6' }}>
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Camera preview — visible during idle and recording */}
      {status !== 'done' && !isProcessing && (
        <div className="relative rounded-2xl overflow-hidden" style={{ background: '#000' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full"
            style={{ aspectRatio: '16/9', objectFit: 'cover', display: cameraReady ? 'block' : 'none' }}
          />
          {!cameraReady && (
            <div className="flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Recording badge */}
          {status === 'recording' && (
            <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: '#000000bb' }}>
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono font-semibold">{formatTime(seconds)}</span>
            </div>
          )}
        </div>
      )}

      {/* Record / Stop controls */}
      {status === 'idle' && (
        <div className="flex flex-col items-center gap-2 py-2">
          <button
            onClick={startRecording}
            disabled={!cameraReady}
            className="flex flex-col items-center gap-3 disabled:opacity-40"
          >
            <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center transition-transform active:scale-95" style={{ borderColor: '#ef4444' }}>
              <div className="w-14 h-14 rounded-full" style={{ background: '#ef4444' }} />
            </div>
            <span className="text-sm font-medium" style={{ color: '#888888' }}>Start Recording</span>
          </button>
        </div>
      )}

      {status === 'recording' && (
        <div className="flex flex-col items-center gap-2 py-2">
          <button
            onClick={stopRecording}
            className="flex flex-col items-center gap-3"
          >
            <div className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-transform active:scale-95">
              <div className="w-8 h-8 rounded-md bg-white" />
            </div>
            <span className="text-sm font-medium" style={{ color: '#888888' }}>Stop Recording</span>
          </button>
        </div>
      )}

      {/* Extracting frames */}
      {status === 'extracting' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-white">Extracting frames from video...</p>
        </div>
      )}

      {/* Analysing frames with progress bar */}
      {status === 'analysing' && (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
          <div className="text-center w-full max-w-xs">
            <p className="text-white font-semibold mb-3">
              Analysing {currentFrame} of {totalFrames} frames...
            </p>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#2a2a2a' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ background: '#3b82f6', width: `${Math.round((currentFrame / totalFrames) * 100)}%` }}
              />
            </div>
            <p className="text-xs mt-2" style={{ color: '#888888' }}>
              {Math.round((currentFrame / totalFrames) * 100)}%
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444' }}>
          <span className="flex-1">{error}</span>
          <button onClick={reset} className="underline font-medium flex-shrink-0">Retry</button>
        </div>
      )}

      {/* Results */}
      {status === 'done' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Detected Items</h3>
            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: '#1a1a1a', color: '#888888' }}>
              {totalFrames} frame{totalFrames !== 1 ? 's' : ''} analysed
            </span>
          </div>

          {editItems.length === 0 ? (
            <div className="py-10 text-center">
              <p className="mb-1 text-white font-medium">No products detected</p>
              <p className="text-sm mb-4" style={{ color: '#888888' }}>Try recording a clearer view of the shelves.</p>
              <button onClick={reset} className="text-sm font-semibold" style={{ color: '#3b82f6' }}>
                Record again
              </button>
            </div>
          ) : (
            <>
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
              <button
                onClick={reset}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ color: '#888888' }}
              >
                Record another video
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
