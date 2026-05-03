import type { Metadata, Viewport } from 'next'
import '@/styles/globals.css'
import { AuthProvider } from '@/lib/auth-context'

export const metadata: Metadata = {
  title: '詠 / yomu',
  description: '言葉と音声の総合クリエイティブツール — 蒸留・コーパス・組詩・歌集・読み上げ',
  appleWebApp: {
    capable: true,
    title: '詠',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: '詠 / yomu',
    description: '言葉と音声の総合クリエイティブツール',
    siteName: '詠 / yomu',
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '詠 / yomu',
    description: '言葉と音声の総合クリエイティブツール',
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
