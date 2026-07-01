import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ClearStaleCache } from '@/components/ClearStaleCache'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'StockCount',
  description: 'Count smarter. Not harder.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'StockCount',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body
        className={inter.className}
        style={{ background: '#0a0a0a', color: '#ffffff', minHeight: '100dvh', margin: 0 }}
      >
        <ClearStaleCache />
        {children}
      </body>
    </html>
  )
}
