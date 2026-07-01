'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LandingClient() {
  const [mode, setMode] = useState<'idle' | 'login' | 'register'>('idle')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email to confirm your account.')
      setMode('idle')
    }
    setLoading(false)
  }

  if (mode === 'idle') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#0a0a0a' }}>
        <div className="w-full max-w-sm text-center">
          <div className="mb-3">
            <span className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6" style={{ background: '#3b82f6' }}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="6" y="8" width="28" height="4" rx="2" fill="white" />
                <rect x="6" y="18" width="20" height="4" rx="2" fill="white" />
                <rect x="6" y="28" width="24" height="4" rx="2" fill="white" />
                <circle cx="32" cy="30" r="6" fill="#22c55e" />
                <path d="M29 30l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tight">StockCount</h1>
          <p className="text-xl mb-10" style={{ color: '#888888' }}>Count smarter. Not harder.</p>

          {message && (
            <div className="mb-6 px-4 py-3 rounded-xl text-sm" style={{ background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}>
              {message}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode('login')}
              className="w-full py-4 rounded-xl font-semibold text-white text-base transition-opacity hover:opacity-90 active:opacity-75"
              style={{ background: '#3b82f6' }}
            >
              Log In
            </button>
            <button
              onClick={() => setMode('register')}
              className="w-full py-4 rounded-xl font-semibold text-white text-base transition-opacity hover:opacity-90 active:opacity-75"
              style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              Create Account
            </button>
          </div>
        </div>
      </main>
    )
  }

  const isLogin = mode === 'login'

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#0a0a0a' }}>
      <div className="w-full max-w-sm">
        <button
          onClick={() => { setMode('idle'); setError('') }}
          className="flex items-center gap-2 mb-8 text-sm"
          style={{ color: '#888888' }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        <h2 className="text-3xl font-bold text-white mb-2">{isLogin ? 'Welcome back' : 'Create account'}</h2>
        <p className="mb-8" style={{ color: '#888888' }}>{isLogin ? 'Sign in to your account' : 'Start counting smarter'}</p>

        <form onSubmit={isLogin ? handleLogin : handleRegister} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm mb-2" style={{ color: '#888888' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
              style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
            />
          </div>
          <div>
            <label className="block text-sm mb-2" style={{ color: '#888888' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
              style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl font-semibold text-white text-base transition-opacity hover:opacity-90 active:opacity-75 disabled:opacity-50"
            style={{ background: '#3b82f6' }}
          >
            {loading ? 'Please wait...' : isLogin ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: '#888888' }}>
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(isLogin ? 'register' : 'login'); setError('') }}
            style={{ color: '#3b82f6' }}
            className="font-medium"
          >
            {isLogin ? 'Register' : 'Log In'}
          </button>
        </p>
      </div>
    </main>
  )
}
