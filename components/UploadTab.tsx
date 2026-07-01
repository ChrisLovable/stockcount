'use client'

import { useRef, useState } from 'react'
import type { VisionConsensusResponse } from '@/lib/types'
import { CountReviewPanel } from './CountReviewPanel'
import type { VisionItem } from '@/lib/vision/schema'

import type { VisionPrepMode } from '@/lib/images/prepareForVision'

interface Props {
  sessionId: string
  instruction: string
  visionMode: VisionPrepMode
  saving?: boolean
  onCountConfirmed: (items: VisionItem[], corrected: boolean, countImageId?: string | null) => void
}

export function UploadTab({ sessionId, instruction, visionMode, saving, onCountConfirmed }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [result, setResult] = useState<VisionConsensusResponse | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  function selectFile(file: File) {
    if (!file.type.match(/image\/(jpeg|png|webp)/)) {
      setError('Please upload a JPG, PNG, or WEBP image')
      return
    }
    setError('')
    setResult(null)
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function analyseSelected() {
    if (!selectedFile) return
    setAnalysing(true)
    setError('')
    setResult(null)
    try {
      const form = new FormData()
      form.append('image', selectedFile)
      form.append('sessionId', sessionId)
      form.append('visionMode', visionMode)
      if (instruction) form.append('instruction', instruction)

      const res = await fetch('/api/count/analyse', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      setResult(data as VisionConsensusResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    }
    setAnalysing(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) selectFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) selectFile(file)
  }

  function reset() {
    setPreview(null)
    setSelectedFile(null)
    setResult(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleConfirm(items: VisionItem[], corrected: boolean, countImageId?: string | null) {
    onCountConfirmed(items, corrected, countImageId)
    reset()
  }

  return (
    <div className="flex flex-col gap-4">
      {!preview ? (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center gap-3 rounded-2xl cursor-pointer transition-colors"
          style={{
            minHeight: 220,
            border: `2px dashed ${dragging ? '#3b82f6' : '#2a2a2a'}`,
            background: dragging ? '#3b82f610' : '#1a1a1a',
          }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#0a0a0a' }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="17 8 12 3 7 8" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="3" x2="12" y2="15" stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-center">
            <p className="font-semibold text-white mb-1">Tap to upload image</p>
            <p className="text-sm" style={{ color: '#888888' }}>JPG, PNG, WEBP</p>
          </div>
        </div>
      ) : (
        <div className="relative rounded-2xl overflow-hidden" style={{ background: '#000' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="w-full" style={{ maxHeight: 300, objectFit: 'contain' }} />
          {!result && (
            <button
              onClick={reset}
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: '#000000aa' }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                <path d="M12 4L4 12M4 4l8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      )}

      {preview && !result && (
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 py-3 rounded-xl font-semibold text-white"
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            Choose another
          </button>
          <button
            onClick={analyseSelected}
            disabled={analysing}
            className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
            style={{ background: '#3b82f6' }}
          >
            {analysing ? 'Analysing...' : 'Analyse'}
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {analysing && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium" style={{ color: '#888888' }}>
            Running vision consensus...
          </p>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444' }}>
          {error}
        </div>
      )}

      {result && (
        <CountReviewPanel result={result} saving={saving} onConfirm={handleConfirm} />
      )}
    </div>
  )
}
