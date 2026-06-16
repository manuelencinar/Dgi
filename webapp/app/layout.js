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
        {/* Quita el contorno blanco de foco que el navegador dibuja sobre los
            gráficos de recharts al hacer hover/click (cartera, radar, etc.). */}
        <style dangerouslySetInnerHTML={{ __html: `
          .recharts-wrapper:focus,.recharts-wrapper:focus-visible,
          .recharts-surface,.recharts-surface:focus,.recharts-surface:focus-visible,
          .recharts-wrapper svg:focus,.recharts-wrapper *:focus,.recharts-wrapper *:focus-visible,
          .recharts-sector:focus,.recharts-layer:focus,.recharts-pie:focus{outline:none!important;}
        ` }} />
      </head>
      <body className={figtree.className} style={{background:"#080b14",color:"#c8d0e0",margin:0,padding:0,WebkitFontSmoothing:"antialiased"}} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
