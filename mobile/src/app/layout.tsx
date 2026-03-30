import './globals.css'
import { Poppins } from 'next/font/google'
import { Toaster } from 'sonner'
import ClientLayout from './ClientLayout'
import type { Viewport, Metadata } from 'next'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'IQ:capture',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'IQ:capture',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/icon.png',
  },
  manifest: '/manifest.json',
  other: {
    'theme-color': '#2276aa',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} font-sans antialiased bg-iq-light text-iq-dark`}>
        <ClientLayout>{children}</ClientLayout>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  )
}
