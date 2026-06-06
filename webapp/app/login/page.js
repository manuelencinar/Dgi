'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const MESSAGES = {
  watchlist: 'Regístrate para seguir empresas y recibir alertas',
}

const BTN = {border:"none",borderRadius:9,padding:"12px 20px",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",width:"100%"}
const INP = {width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"11px 14px",color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit",marginBottom:10}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" style={{flexShrink:0}}>
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
  </svg>
)

const Divider = () => (
  <div style={{display:"flex",alignItems:"center",gap:12,margin:"16px 0"}}>
    <div style={{flex:1,height:1,background:"rgba(255,255,255,0.07)"}}/>
    <span style={{fontSize:11,color:"#3a4260"}}>o continúa con email</span>
    <div style={{flex:1,height:1,background:"rgba(255,255,255,0.07)"}}/>
  </div>
)

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [next, setNext] = useState('')
  const router = useRouter()

  // Leemos ?msg= y ?next= de la URL sin useSearchParams (evita el Suspense obligatorio).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const msg = params.get('msg')
    if (msg && MESSAGES[msg]) setNotice(MESSAGES[msg])
    const n = params.get('next')
    if (n && n.startsWith('/')) setNext(n)
  }, [])

  async function handleGoogleLogin() {
    setGoogleLoading(true); setError('')
    const supabase = createClient()
    const callback = next ? `/auth/callback?next=${encodeURIComponent(next)}` : '/auth/callback'
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${callback}` }
    })
    if(error) { setError(error.message); setGoogleLoading(false) }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if(error) { setError(error.message); setLoading(false) }
    else router.push(next || '/app')
  }

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"32px 28px"}}>
        <h1 style={{fontSize:22,fontWeight:800,color:"#e0e8f0",marginBottom:6}}>Mi Índice DGI</h1>
        <p style={{fontSize:13,color:"#4a5270",marginBottom:24}}>Inicia sesión para acceder a tu cartera</p>

        {notice && (
          <div style={{fontSize:12,color:"#818cf8",background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.25)",borderRadius:8,padding:"10px 12px",marginBottom:16}}>
            {notice}
          </div>
        )}

        <button onClick={handleGoogleLogin} disabled={googleLoading}
          style={{...BTN,display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"#e0e8f0",marginBottom:0}}>
          <GoogleIcon/>
          {googleLoading ? "Redirigiendo..." : "Continuar con Google"}
        </button>

        <Divider/>

        <form onSubmit={handleLogin}>
          <input style={INP} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/>
          <input style={INP} type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/>
          {error && <p style={{fontSize:12,color:"#f87171",marginBottom:10}}>{error}</p>}
          <button type="submit" style={{...BTN,background:loading?"rgba(99,102,241,0.4)":"rgba(99,102,241,0.8)"}} disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p style={{fontSize:12,color:"#4a5270",textAlign:"center",marginTop:16}}>
          ¿Sin cuenta?{' '}
          <a href="/register" style={{color:"#818cf8",textDecoration:"none"}}>Regístrate gratis</a>
        </p>
      </div>
    </div>
  )
}
