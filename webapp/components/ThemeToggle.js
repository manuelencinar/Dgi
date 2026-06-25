'use client'
import { useState, useEffect } from 'react'

// Aplica el tema: fija data-theme en <html>, persiste en localStorage y ajusta el
// meta theme-color. El script anti-parpadeo de layout.js lee el mismo localStorage.
export function applyTheme(theme) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (theme === 'light') el.setAttribute('data-theme', 'light')
  else el.removeAttribute('data-theme')
  try { localStorage.setItem('theme', theme) } catch {}
  const m = document.querySelector('meta[name="theme-color"]')
  if (m) m.setAttribute('content', theme === 'light' ? '#f4f6fb' : '#080b14')
}

function readTheme() {
  try { return localStorage.getItem('theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}

// Hook para leer/cambiar el tema desde cualquier componente cliente.
export function useTheme() {
  const [theme, setTheme] = useState('dark')
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setTheme(readTheme()); setMounted(true) }, [])
  const set = next => { setTheme(next); applyTheme(next) }
  const toggle = () => set(theme === 'light' ? 'dark' : 'light')
  return { theme, setTheme: set, toggle, mounted }
}

// Botón compacto para la barra de navegación (icono sol/luna).
export default function ThemeToggle() {
  const { theme, toggle, mounted } = useTheme()
  const isLight = theme === 'light'
  return (
    <button
      onClick={toggle}
      title={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      aria-label="Cambiar tema"
      suppressHydrationWarning
      style={{
        background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
        color: 'var(--text-faint)', padding: '4px 7px', borderRadius: 7, lineHeight: 1,
      }}
    >
      {/* Hasta montar mostramos el icono del modo oscuro (por defecto) para no
          provocar mismatch de hidratación. */}
      {mounted ? (isLight ? '🌙' : '☀️') : '☀️'}
    </button>
  )
}
