import './globals.css'

export const metadata = {
  title: 'LucidAd - AI-Powered Ad Fact Checker',
  description: 'Verify advertising claims with AI-powered fact checking. Point, capture, and verify any advertisement instantly.',
  keywords: 'fact checker, advertising, AI, verification, claims',
  authors: [{ name: 'LucidAd Team' }],
  creator: 'LucidAd',
  publisher: 'LucidAd',
  robots: 'index, follow',
  openGraph: {
    title: 'LucidAd - AI-Powered Ad Fact Checker',
    description: 'Verify advertising claims with AI-powered fact checking',
    type: 'website',
    locale: 'en_US',
    siteName: 'LucidAd',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LucidAd - AI-Powered Ad Fact Checker',
    description: 'Verify advertising claims with AI-powered fact checking',
  },
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#171717',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="canonical" href="https://lucidad.netlify.app" />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
