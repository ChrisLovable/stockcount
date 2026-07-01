'use client'

import { useRef, useState } from 'react'
import type { AIItem } from '@/lib/types'
import { ConfidenceBadge } from './ui/ConfidenceBadge'

interface Props {
  sessionId: string
  instruction: string
  onItemsAdded: (items: AIItem[]) => void
}

export function UploadTab({ sessionId, instruction, onItemsAdded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [results, setResults] = useState<AIItem[] | null>(null)
  const [editItems, setEditItems] = useState<AIItem[]>([])
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  async function analyseFile(file: File) {
    if (!file.type.match(/image\/(jpeg|png|webp)/)) {
      setError('Please upload a JPG, PNG, or WEBP image')
      return
    }
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setAnalysing(true)
    setError('')
    setResults(null)
    try {
      const form = new FormData()
      form.append('image', file)
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) analyseFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) analyseFile(file)
  }

  function updateItem(index: number, field: keyof AIItem, value: string | number) {
    setEditItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function handleAddToTotal() {
    onItemsAdded(editItems)
    setPreview(null)
    setResults(null)
    setEditItems([])
    setError('')
  }

  function reset() {
    setPreview(null)
    setResults(null)
    setEditItems([])
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
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
          <button
            onClick={reset}
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: '#000000aa' }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
              <path d="M12 4L4 12M4 4l8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
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

      {/* Loading */}
      {analysing && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
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
