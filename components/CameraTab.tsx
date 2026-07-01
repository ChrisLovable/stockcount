'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import type { VisionConsensusResponse } from '@/lib/types'
import { CountReviewPanel } from './CountReviewPanel'
import type { VisionItem } from '@/lib/vision/schema'

import type { VisionPrepMode } from '@/lib/images/prepareForVision'

const CAMERA_MAX_IMAGES = 10

interface Props {
  sessionId: string
  instruction: string
  visionMode: VisionPrepMode
  saving?: boolean
  onCountConfirmed: (items: VisionItem[], corrected: boolean, countImageId?: string | null) => void
}

interface CapturedPhoto {
  id: number
  dataUrl: string
}

function CapturedPhotoStrip({
  photos,
  onRemove,
  disabled,
}: {
  photos: CapturedPhoto[]
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
        Captured photos ({photos.length}/{CAMERA_MAX_IMAGES})
      </p>
      <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        {photos.map(photo => (
          <div
            key={photo.id}
            className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden"
            style={{ border: '1px solid #2a2a2a', background: '#1a1a1a' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.dataUrl} alt={`Photo ${photo.id}`} className="w-full h-full object-cover" />
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

export function CameraTab({ sessionId, instruction, visionMode, saving, onCountConfirmed }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const instructionRef = useRef(instruction)
  const photoCountRef = useRef(0)

  instructionRef.current = instruction

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([])
  const [analysing, setAnalysing] = useState(false)
  const [result, setResult] = useState<VisionConsensusResponse | null>(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState(false)

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

  // Take a photo WITHOUT stopping the camera — user can keep taking more.
  function capturePhoto() {
    if (!videoRef.current || !cameraReady) return
    if (photoCountRef.current >= CAMERA_MAX_IMAGES) return

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)

    photoCountRef.current += 1
    const id = photoCountRef.current
    setCapturedPhotos(prev => [...prev, { id, dataUrl: canvas.toDataURL('image/jpeg', 0.85) }])

    // brief shutter flash for feedback
    setFlash(true)
    setTimeout(() => setFlash(false), 120)
  }

  function removePhoto(id: number) {
    setCapturedPhotos(prev => {
      const filtered = prev.filter(p => p.id !== id)
      photoCountRef.current = filtered.length
      return filtered.map((p, i) => ({ ...p, id: i + 1 }))
    })
  }

  function clearPhotos() {
    photoCountRef.current = 0
    setCapturedPhotos([])
    setResult(null)
    setError('')
  }

  function reset() {
    clearPhotos()
    setAnalysing(false)
    startCamera(facingMode)
  }

  async function analyseAllPhotos() {
    if (capturedPhotos.length === 0) return
    setAnalysing(true)
    setError('')
    setResult(null)
    try {
      const images = capturedPhotos.map(p => p.dataUrl.replace(/^data:image\/\w+;base64,/, ''))
      const res = await fetch('/api/count/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          sessionId,
          instruction: instructionRef.current,
          burst: images.length > 1,
          visionMode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      setResult(data as VisionConsensusResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    }
    setAnalysing(false)
  }

  function handleConfirm(items: VisionItem[], corrected: boolean, countImageId?: string | null) {
    onCountConfirmed(items, corrected, countImageId)
    reset()
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

  const showLiveCamera = !result && !analysing

  return (
    <div className="flex flex-col gap-4">
      {showLiveCamera && (
        <div className="relative rounded-2xl overflow-hidden" style={{ background: '#000' }}>
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
          {flash && (
            <div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: 0.6 }} />
          )}
          {capturedPhotos.length > 0 && (
            <div
              className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-sm font-bold tabular-nums"
              style={{ background: '#000000cc', color: '#fff' }}
            >
              {capturedPhotos.length}/{CAMERA_MAX_IMAGES}
            </div>
          )}
        </div>
      )}

      {showLiveCamera && (
        <CapturedPhotoStrip photos={capturedPhotos} onRemove={removePhoto} />
      )}

      {showLiveCamera && (
        <div className="flex items-center justify-center gap-8">
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
          <button
            onClick={capturePhoto}
            disabled={!cameraReady || capturedPhotos.length >= CAMERA_MAX_IMAGES}
            className="w-20 h-20 rounded-full flex items-center justify-center border-4 border-white disabled:opacity-40 transition-opacity active:opacity-70"
            style={{ background: 'transparent' }}
          >
            <div className="w-14 h-14 rounded-full bg-white" />
          </button>
          <div className="w-10 h-10 flex items-center justify-center">
            {capturedPhotos.length > 0 && (
              <button
                onClick={clearPhotos}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: '#1a1a1a' }}
                aria-label="Clear all photos"
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {showLiveCamera && capturedPhotos.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-center" style={{ color: '#888888' }}>
            Take another photo, or analyse what you have.
          </p>
          <button
            onClick={analyseAllPhotos}
            disabled={analysing}
            className="w-full py-4 rounded-xl font-semibold text-white disabled:opacity-50"
            style={{ background: '#3b82f6' }}
          >
            Analyse {capturedPhotos.length} photo{capturedPhotos.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {showLiveCamera && capturedPhotos.length === 0 && (
        <p className="text-sm text-center" style={{ color: '#888888' }}>
          Tap the shutter to capture a photo. Take as many as you need, then analyse them together.
        </p>
      )}

      {analysing && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium" style={{ color: '#888888' }}>
            Running vision consensus across all photos...
          </p>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444' }}>
          {error}
        </div>
      )}

      {result && (
        <>
          <CountReviewPanel
            result={result}
            saving={saving}
            onConfirm={handleConfirm}
          />
          <button onClick={reset} className="w-full py-3 rounded-xl text-sm font-medium" style={{ color: '#888888' }}>
            New photos
          </button>
        </>
      )}
    </div>
  )
}
