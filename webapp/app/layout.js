import { Figtree } from 'next/font/google'
import Analytics from '@/components/Analytics'
import CookieNotice from '@/components/CookieNotice'

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400','500','600','700','800','900'],
  display: 'swap',
})

export const metadata = {
  title: 'EverDiv',
  description: 'Plataforma para inversores de dividendos crecientes',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#080b14"/>
        {/* Script anti-parpadeo: fija el tema (data-theme) ANTES del primer paint
            leyéndolo de localStorage, para que no haya destello de color al cargar. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){try{var t=localStorage.getItem('theme');
            if(t==='light'){document.documentElement.setAttribute('data-theme','light');
              var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#f4f6fb');}
          }catch(e){}})();
        ` }} />
        {/* Variables de tema (claro/oscuro) + el fix de foco de recharts. El modo
            oscuro es el por defecto (:root); el claro se activa con [data-theme="light"].
            Va en <style> inline porque globals.css no está importado en el árbol. */}
        <style dangerouslySetInnerHTML={{ __html: `
          :root{
            --bg:#080b14;--bg-elev:#0b0f1a;
            --surface:rgba(255,255,255,0.02);--surface-2:rgba(255,255,255,0.04);--surface-3:rgba(255,255,255,0.06);
            --border:rgba(255,255,255,0.07);--border-strong:rgba(255,255,255,0.10);
            --text-strong:#e0e8f0;--text:#c8d0e0;--text-muted:#8090a8;--text-faint:#4a5270;--text-faintest:#2e3a55;
            --accent:#818cf8;--accent-bg:rgba(99,102,241,0.12);
            --positive:#34d399;--positive-soft:#86efac;--negative:#f87171;--warning:#fbbf24;
            --nav-bg:rgba(8,11,20,0.92);--scrollbar:#1a2035;
          }
          [data-theme="light"]{
            --bg:#f4f6fb;--bg-elev:#ffffff;
            --surface:#ffffff;--surface-2:#eef2f8;--surface-3:#e3e9f2;
            --border:rgba(15,23,42,0.10);--border-strong:rgba(15,23,42,0.16);
            --text-strong:#0b1220;--text:#1f2a3d;--text-muted:#51607a;--text-faint:#76839a;--text-faintest:#9aa6ba;
            --accent:#4f46e5;--accent-bg:rgba(79,70,229,0.10);
            --positive:#059669;--positive-soft:#15803d;--negative:#dc2626;--warning:#b45309;
            --nav-bg:rgba(255,255,255,0.85);--scrollbar:#c7d0dd;
          }
          .recharts-wrapper:focus,.recharts-wrapper:focus-visible,
          .recharts-surface,.recharts-surface:focus,.recharts-surface:focus-visible,
          .recharts-wrapper svg:focus,.recharts-wrapper *:focus,.recharts-wrapper *:focus-visible,
          .recharts-sector:focus,.recharts-layer:focus,.recharts-pie:focus{outline:none!important;}
          /* var() NO se resuelve en atributos de presentación SVG (fill=/stroke=) en
             algunos navegadores → cae a negro (gráficos oscuros en modo claro). Estas
             reglas CSS, que SÍ resuelven var() y ganan al atributo, tematizan todos los
             SVG (recharts y custom) sin tocar los componentes. */
          [fill="var(--bg)"]{fill:var(--bg)}[stroke="var(--bg)"]{stroke:var(--bg)}
          [fill="var(--bg-elev)"]{fill:var(--bg-elev)}[stroke="var(--bg-elev)"]{stroke:var(--bg-elev)}
          [fill="var(--surface)"]{fill:var(--surface)}[stroke="var(--surface)"]{stroke:var(--surface)}
          [fill="var(--surface-2)"]{fill:var(--surface-2)}[stroke="var(--surface-2)"]{stroke:var(--surface-2)}
          [fill="var(--surface-3)"]{fill:var(--surface-3)}[stroke="var(--surface-3)"]{stroke:var(--surface-3)}
          [fill="var(--border)"]{fill:var(--border)}[stroke="var(--border)"]{stroke:var(--border)}
          [fill="var(--border-strong)"]{fill:var(--border-strong)}[stroke="var(--border-strong)"]{stroke:var(--border-strong)}
          [fill="var(--text-strong)"]{fill:var(--text-strong)}[stroke="var(--text-strong)"]{stroke:var(--text-strong)}
          [fill="var(--text)"]{fill:var(--text)}[stroke="var(--text)"]{stroke:var(--text)}
          [fill="var(--text-muted)"]{fill:var(--text-muted)}[stroke="var(--text-muted)"]{stroke:var(--text-muted)}
          [fill="var(--text-faint)"]{fill:var(--text-faint)}[stroke="var(--text-faint)"]{stroke:var(--text-faint)}
          [fill="var(--text-faintest)"]{fill:var(--text-faintest)}[stroke="var(--text-faintest)"]{stroke:var(--text-faintest)}
          [fill="var(--accent)"]{fill:var(--accent)}[stroke="var(--accent)"]{stroke:var(--accent)}
          [fill="var(--positive)"]{fill:var(--positive)}[stroke="var(--positive)"]{stroke:var(--positive)}
          [fill="var(--positive-soft)"]{fill:var(--positive-soft)}[stroke="var(--positive-soft)"]{stroke:var(--positive-soft)}
          [fill="var(--negative)"]{fill:var(--negative)}[stroke="var(--negative)"]{stroke:var(--negative)}
          [fill="var(--warning)"]{fill:var(--warning)}[stroke="var(--warning)"]{stroke:var(--warning)}
          [stop-color="var(--accent)"]{stop-color:var(--accent)}
        ` }} />
      </head>
      <body className={figtree.className} style={{background:"var(--bg)",color:"var(--text)",margin:0,padding:0,WebkitFontSmoothing:"antialiased"}} suppressHydrationWarning>
        {children}
        <CookieNotice />
        <Analytics />
      </body>
    </html>
  )
}
