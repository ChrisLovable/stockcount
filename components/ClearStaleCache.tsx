'use client'

import { useEffect } from 'react'

/** Clears stale PWA caches / service workers that cause 404 chunk errors after dev restarts. */
export function ClearStaleCache() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister())
      })
    }
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    }
  }, [])

  return null
}
