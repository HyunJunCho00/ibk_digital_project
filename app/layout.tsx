import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'IBK 예금자보호 OX퀴즈',
  description: '예금자보호제도를 퀴즈로 배우는 i-ONE Bank 이벤트',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
