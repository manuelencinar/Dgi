import { Figtree } from 'next/font/google'

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400','500','600','700','800','900'],
  display: 'swap',
})

export const metadata = {
  title: 'Mi Índice DGI',
  description: 'Plataforma para inversores de dividendos crecientes',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#080b14"/>
      </head>
      <body className={figtree.className} style={{background:"#080b14",color:"#c8d0e0",margin:0,padding:0,WebkitFontSmoothing:"antialiased"}} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
