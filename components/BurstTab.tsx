'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { VisionConsensusResponse } from '@/lib/types'
import { CountReviewPanel } from './CountReviewPanel'
import type { VisionItem } from '@/lib/vision/schema'

import type { VisionPrepMode } from '@/lib/images/prepareForVision'

const BURST_MAX_SECONDS = 10
const BURST_MAX_IMAGES = 10
const CAPTURE_INTERVAL_MS = 1000

interface BurstPhoto {
  id: number
  dataUrl: string
}

interface Props {
  sessionId: string
  instruction: string
  visionMode: VisionPrepMode
  saving?: boolean
  onCountConfirmed: (items: VisionItem[], corrected: boolean, countImageId?: string | null) => void
}

type AnalysisPhase =
  | 'idle'
  | 'preparing'
  | 'analysing'
  | 'consensus'
  | 'finalising'
  | 'done'

const PHASE_LABELS: Record<Exclude<AnalysisPhase, 'idle' | 'done'>, string> = {
  preparing: 'Preparing images',
  analysing: 'Analysing stock',
  consensus: 'Checking model agreement',
  finalising: 'Finalising suggested count',
}

function BurstPhotoStrip({
  photos,
  onRemove,
  disabled,
}: {
  photos: BurstPhoto[]
  onRemove: (id: number) => void
  disabled?: boolean
}) {
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.scrollLeft = stripRef.current.scrollWidth
    }
  }, [photos.length])

  if (photos.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium px-1" style={{ color: '#888888' }}>
        Captured photos ({photos.length}/{BURST_MAX_IMAGES})
      </p>
      <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        {photos.map(photo => (
          <div
            key={photo.id}
            className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden"
            style={{ border: '1px solid #2a2a2a', background: '#1a1a1a' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.dataUrl} alt={`Burst photo ${photo.id}`} className="w-full h-full object-cover" />
            <span
              className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold tabular-nums py-0.5"
              style={{ background: '#000000bb', color: '#fff' }}
            >
              {photo.id}
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(photo.id)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: '#ef4444', color: '#fff' }}
                aria-label={`Remove photo ${photo.id}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function BurstTab({ sessionId, instruction, visionMode, saving, onCountConfirmed }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const instructionRef = useRef(instruction)
  const burstCountRef = useRef(0)

  instructionRef.current = instruction

  const [status, setStatus] = useState<'idle' | 'bursting' | 'review'>('idle')
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(BURST_MAX_SECONDS)
  const [burstPhotos, setBurstPhotos] = useState<BurstPhoto[]>([])
  const [analysisError, setAnalysisError] = useState('')
  const [result, setResult] = useState<VisionConsensusResponse | null>(null)
  const [phase, setPhase] = useState<AnalysisPhase>('idle')
  const [slowMessage, setSlowMessage] = useState(false)

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
      stopBurstTimers()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPreview])

  function stopBurstTimers() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    abortRef.current?.abort()
    abortRef.current = null
  }

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return false
    if (burstCountRef.current >= BURST_MAX_IMAGES) return false

    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.drawImage(videoRef.current, 0, 0)

    burstCountRef.current += 1
    const id = burstCountRef.current
    setBurstPhotos(prev => [...prev, { id, dataUrl: canvas.toDataURL('image/jpeg', 0.75) }])
    return true
  }, [])

  function endBurst() {
    stopBurstTimers()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setStatus('review')
    setSecondsLeft(0)
  }

  function startBurst() {
    burstCountRef.current = 0
    setBurstPhotos([])
    setResult(null)
    setAnalysisError('')
    setSecondsLeft(BURST_MAX_SECONDS)
    setStatus('bursting')

    capturePhoto()

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        const next = prev - 1
        if (next <= 0) {
          endBurst()
          return 0
        }
        return next
      })

      if (burstCountRef.current >= BURST_MAX_IMAGES) {
        endBurst()
        return
      }

      capturePhoto()

      if (burstCountRef.current >= BURST_MAX_IMAGES) {
        endBurst()
      }
    }, CAPTURE_INTERVAL_MS)
  }

  function removePhoto(id: number) {
    setBurstPhotos(prev => {
      const filtered = prev.filter(p => p.id !== id)
      burstCountRef.current = filtered.length
      return filtered.map((p, i) => ({ ...p, id: i + 1 }))
    })
  }

  function reset() {
    stopBurstTimers()
    burstCountRef.current = 0
    setBurstPhotos([])
    setResult(null)
    setAnalysisError('')
    setSecondsLeft(BURST_MAX_SECONDS)
    setPhase('idle')
    setSlowMessage(false)
    setStatus('idle')
    startPreview()
  }

  async function analyseAllPhotos() {
    if (burstPhotos.length === 0) return

    setAnalysisError('')
    setResult(null)
    setPhase('preparing')
    setSlowMessage(false)
    abortRef.current = new AbortController()

    let elapsed = 0
    const progressTimer = setInterval(() => {
      elapsed += 1
      if (elapsed >= 3) setPhase('consensus')
      if (elapsed >= 6) setPhase('finalising')
      if (elapsed >= 10) setSlowMessage(true)
    }, 1000)

    try {
      await new Promise(r => setTimeout(r, 400))
      setPhase('analysing')

      const images = burstPhotos.map(p => p.dataUrl.replace(/^data:image\/\w+;base64,/, ''))
      const res = await fetch('/api/count/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          images,
          sessionId,
          instruction: instructionRef.current,
          burst: true,
          visionMode,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      setResult(data as VisionConsensusResponse)
      setPhase('done')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
      setPhase('idle')
    } finally {
      clearInterval(progressTimer)
      abortRef.current = null
    }
  }

  function handleConfirm(items: VisionItem[], corrected: boolean, countImageId?: string | null) {
    onCountConfirmed(items, corrected, countImageId)
    reset()
  }

  const isAnalysing = phase !== 'idle' && phase !== 'done'
  const phaseLabel = phase !== 'idle' && phase !== 'done' ? PHASE_LABELS[phase] : ''

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
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
      {status !== 'review' && (
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

          {status === 'bursting' && (
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: '#000000cc' }}>
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-sm font-semibold">Max 10 sec burst</span>
              </div>
              <div className="px-3 py-1.5 rounded-full tabular-nums text-white text-sm font-bold" style={{ background: '#000000cc' }}>
                {secondsLeft}s
              </div>
            </div>
          )}
        </div>
      )}

      {(status === 'bursting' || status === 'review') && (
        <BurstPhotoStrip
          photos={burstPhotos}
          onRemove={removePhoto}
          disabled={isAnalysing || !!result}
        />
      )}

      {status === 'idle' && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={startBurst}
            disabled={!cameraReady}
            className="w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: '#3b82f6' }}
          >
            Start 10 sec burst
          </button>
          <p className="text-sm text-center" style={{ color: '#888888' }}>
            Pan slowly across the shelf. One photo per second, up to {BURST_MAX_IMAGES} photos.
          </p>
        </div>
      )}

      {status === 'bursting' && (
        <button
          onClick={endBurst}
          className="w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-3"
          style={{ background: '#ef4444' }}
        >
          <div className="w-4 h-4 rounded-sm bg-white" />
          Stop early ({burstPhotos.length} photo{burstPhotos.length !== 1 ? 's' : ''})
        </button>
      )}

      {status === 'review' && !result && (
        <div className="flex flex-col gap-3">
          <div className="px-1">
            <p className="text-white font-semibold">Burst complete</p>
            <p className="text-xs mt-0.5" style={{ color: '#888888' }}>
              {burstPhotos.length} photo{burstPhotos.length !== 1 ? 's' : ''} ready · remove any bad shots, then analyse all together
            </p>
          </div>

          {analysisError && (
            <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444' }}>
              {analysisError}
            </div>
          )}

          {burstPhotos.length > 0 && !isAnalysing && (
            <button
              onClick={analyseAllPhotos}
              className="w-full py-4 rounded-xl font-semibold text-white"
              style={{ background: '#3b82f6' }}
            >
              Analyse all photos
            </button>
          )}

          {isAnalysing && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-white">
                {phase === 'preparing'
                  ? `Preparing ${burstPhotos.length} image${burstPhotos.length !== 1 ? 's' : ''}`
                  : phaseLabel}
                ...
              </p>
              {slowMessage && (
                <p className="text-sm" style={{ color: '#f59e0b' }}>Still checking stock count...</p>
              )}
            </div>
          )}

          <button onClick={reset} className="w-full py-3 rounded-xl text-sm font-medium" style={{ color: '#888888' }}>
            Burst again
          </button>
        </div>
      )}

      {result && (
        <>
          <CountReviewPanel result={result} saving={saving} onConfirm={handleConfirm} />
          <button onClick={reset} className="w-full py-3 rounded-xl text-sm font-medium" style={{ color: '#888888' }}>
            New burst
          </button>
        </>
      )}
    </div>
  )
}
