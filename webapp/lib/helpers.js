import { SECTORS, COUNTRIES, WHT_DEFAULTS } from './sectors'

// Deuda/EBITDA: por encima de ~30x el múltiplo NO refleja apalancamiento real
// sino un EBITDA cercano a cero (artefacto). P.ej. Lendlease 214x, Allied 63x:
// no están endeudados 200 veces, su EBITDA es casi nulo. No mostrar el número crudo.
export const DEBT_EBITDA_ARTIFACT = 30
export function debtEbitdaIsArtifact(v) {
  const x = v != null && !isNaN(v) ? parseFloat(v) : null
  return x != null && Math.abs(x) > DEBT_EBITDA_ARTIFACT
}
// Valor saneado para SCORING/cálculos: null si es artefacto (no puntúa con basura).
export function saneDebtEbitda(v) {
  const x = v != null && !isNaN(v) ? parseFloat(v) : null
  return (x != null && Math.abs(x) <= DEBT_EBITDA_ARTIFACT) ? x : null
}
// Etiqueta para MOSTRAR: ">30× (EBITDA≈0)" si es artefacto, si no "1.5×".
export function fmtDebtEbitda(v) {
  const x = v != null && !isNaN(v) ? parseFloat(v) : null
  if (x == null) return '—'
  if (Math.abs(x) > DEBT_EBITDA_ARTIFACT) return (x < 0 ? '<−' : '>') + DEBT_EBITDA_ARTIFACT + '× (EBITDA≈0)'
  return x.toFixed(1) + '×'
}

// Fuente única bandera + nombre (español) por código de país ISO-2.
export const COUNTRY_INFO = {
  US:{flag:"🇺🇸",name:"EE.UU."}, CA:{flag:"🇨🇦",name:"Canadá"},
  MX:{flag:"🇲🇽",name:"México"}, BR:{flag:"🇧🇷",name:"Brasil"}, CL:{flag:"🇨🇱",name:"Chile"},
  AR:{flag:"🇦🇷",name:"Argentina"}, CO:{flag:"🇨🇴",name:"Colombia"}, PE:{flag:"🇵🇪",name:"Perú"},
  GB:{flag:"🇬🇧",name:"Reino Unido"}, IE:{flag:"🇮🇪",name:"Irlanda"}, FR:{flag:"🇫🇷",name:"Francia"},
  DE:{flag:"🇩🇪",name:"Alemania"}, ES:{flag:"🇪🇸",name:"España"}, IT:{flag:"🇮🇹",name:"Italia"},
  PT:{flag:"🇵🇹",name:"Portugal"}, NL:{flag:"🇳🇱",name:"Países Bajos"}, BE:{flag:"🇧🇪",name:"Bélgica"},
  CH:{flag:"🇨🇭",name:"Suiza"}, AT:{flag:"🇦🇹",name:"Austria"}, LU:{flag:"🇱🇺",name:"Luxemburgo"},
  SE:{flag:"🇸🇪",name:"Suecia"}, NO:{flag:"🇳🇴",name:"Noruega"}, DK:{flag:"🇩🇰",name:"Dinamarca"},
  FI:{flag:"🇫🇮",name:"Finlandia"}, PL:{flag:"🇵🇱",name:"Polonia"}, CZ:{flag:"🇨🇿",name:"Chequia"},
  HU:{flag:"🇭🇺",name:"Hungría"}, GR:{flag:"🇬🇷",name:"Grecia"}, RO:{flag:"🇷🇴",name:"Rumanía"},
  TR:{flag:"🇹🇷",name:"Turquía"},
  SK:{flag:"🇸🇰",name:"Eslovaquia"}, SI:{flag:"🇸🇮",name:"Eslovenia"}, EE:{flag:"🇪🇪",name:"Estonia"},
  LV:{flag:"🇱🇻",name:"Letonia"}, LT:{flag:"🇱🇹",name:"Lituania"}, HR:{flag:"🇭🇷",name:"Croacia"},
  BG:{flag:"🇧🇬",name:"Bulgaria"}, CY:{flag:"🇨🇾",name:"Chipre"}, MT:{flag:"🇲🇹",name:"Malta"},
  JP:{flag:"🇯🇵",name:"Japón"}, CN:{flag:"🇨🇳",name:"China"}, HK:{flag:"🇭🇰",name:"Hong Kong"},
  SG:{flag:"🇸🇬",name:"Singapur"}, KR:{flag:"🇰🇷",name:"Corea del Sur"}, TW:{flag:"🇹🇼",name:"Taiwán"},
  IN:{flag:"🇮🇳",name:"India"}, TH:{flag:"🇹🇭",name:"Tailandia"}, MY:{flag:"🇲🇾",name:"Malasia"},
  ID:{flag:"🇮🇩",name:"Indonesia"}, PH:{flag:"🇵🇭",name:"Filipinas"},
  AU:{flag:"🇦🇺",name:"Australia"}, NZ:{flag:"🇳🇿",name:"Nueva Zelanda"},
  ZA:{flag:"🇿🇦",name:"Sudáfrica"}, EG:{flag:"🇪🇬",name:"Egipto"}, NG:{flag:"🇳🇬",name:"Nigeria"}, KE:{flag:"🇰🇪",name:"Kenia"},
}

export function getCountry(c) {
  const k = (c || '').toUpperCase()
  if (COUNTRY_INFO[k]) return { code: k, ...COUNTRY_INFO[k] }
  return COUNTRIES.find(x => x.code === c) || {code:"OTHER",flag:"🌍",name:"Otro"}
}

export function getWHT(country) {
  return WHT_DEFAULTS[country] || 0
}

export function sC(s) {
  if(s==null) return "#3a4260"
  if(s>=8) return "#34d399"
  if(s>=6.5) return "#86efac"
  if(s>=5) return "#fbbf24"
  if(s>=3) return "#f97316"
  return "#f87171"
}

export function sBg(s) {
  if(s==null) return "rgba(42,48,69,0.4)"
  if(s>=8) return "rgba(52,211,153,0.13)"
  if(s>=6.5) return "rgba(134,239,172,0.1)"
  if(s>=5) return "rgba(251,191,36,0.1)"
  if(s>=3) return "rgba(249,115,22,0.1)"
  return "rgba(248,113,113,0.1)"
}

export function sL(s) {
  if(!s) return "Sin datos"
  if(s>=8) return "Excelente"
  if(s>=6.5) return "Buena"
  if(s>=5) return "Aceptable"
  if(s>=3) return "Débil"
  return "Muy débil"
}

export function rC(r, t) {
  const top = Math.ceil(t*0.25), bot = Math.floor(t*0.75)
  if(r<=top) return "#34d399"
  if(r>bot) return "#f87171"
  return "#c8d0e0"
}

export function gM(sec) {
  return (SECTORS[sec] || SECTORS.general).metrics
}

export function cS(vals, sec) {
  const ms = gM(sec)
  let tot=0, cnt=0
  const sc = {}
  ms.forEach(m => {
    const v = vals[m.id]
    if(v !== undefined && v !== "") {
      const s = m.score(v)
      if(s !== null) { sc[m.id]=s; tot+=s; cnt++ }
    }
  })
  return {scores:sc, total:cnt>0?tot/cnt:0, count:cnt}
}

export function mosColor(mos) {
  if(mos==null) return "#4a5270"
  if(mos>20) return "#34d399"
  if(mos>0) return "#86efac"
  if(mos>-20) return "#fbbf24"
  return "#f87171"
}

export function getContinent(country) {
  const map = {
    US:"América",CA:"América",BR:"América",MX:"América",CL:"América",AR:"América",CO:"América",PE:"América",
    GB:"Europa",DE:"Europa",FR:"Europa",ES:"Europa",NL:"Europa",IT:"Europa",
    CH:"Europa",SE:"Europa",DK:"Europa",NO:"Europa",FI:"Europa",IE:"Europa",
    BE:"Europa",AT:"Europa",PT:"Europa",LU:"Europa",PL:"Europa",CZ:"Europa",HU:"Europa",
    GR:"Europa",RO:"Europa",TR:"Europa",SK:"Europa",SI:"Europa",EE:"Europa",LV:"Europa",
    LT:"Europa",HR:"Europa",BG:"Europa",CY:"Europa",MT:"Europa",
    JP:"Asia",CN:"Asia",HK:"Asia",SG:"Asia",KR:"Asia",IN:"Asia",TW:"Asia",
    TH:"Asia",MY:"Asia",ID:"Asia",PH:"Asia",
    AU:"Oceanía",NZ:"Oceanía",
    ZA:"África",EG:"África",NG:"África",KE:"África",
  }
  return map[(country || '').toUpperCase()] || "Otros"
}

export function getCapSize(co) {
  const cap = parseFloat(co.market_cap_m)
  if(isNaN(cap)) return null
  if(cap > 200000) return "Blue chip"
  if(cap > 10000) return "Large cap"
  if(cap > 2000) return "Mid cap"
  return "Small cap"
}

// Clasificación DGI por racha de años consecutivos subiendo el dividendo.
// FUENTE ÚNICA de niveles + dibujos en toda la app (screener, comparador,
// ficha, índices y la página /aristocratas).
export const DIVIDEND_TIERS = [
  { id: 'rey',         name: 'Rey',         plural: 'Reyes',        emoji: '👑', color: '#fbbf24', min: 50 },
  { id: 'aristocrata', name: 'Aristócrata', plural: 'Aristócratas', emoji: '🏆', color: '#a78bfa', min: 25 },
  { id: 'aspirante',   name: 'Aspirante',   plural: 'Aspirantes',   emoji: '⭐', color: '#60a5fa', min: 10 },
]

// Devuelve el objeto del nivel (o null si la racha < 10).
export function dividendTierInfo(streak) {
  const n = parseInt(streak)
  if (isNaN(n)) return null
  return DIVIDEND_TIERS.find(t => n >= t.min) || null
}

// Devuelve el id del nivel: 'rey' | 'aristocrata' | 'aspirante' | null.
export function dividendTier(streak) {
  return dividendTierInfo(streak)?.id ?? null
}

// Solo el dibujo del nivel (para badges compactos). null si < 10 años.
export function streakBadge(streak) {
  return dividendTierInfo(streak)?.emoji ?? null
}

// Tendencia RECIENTE del dividendo desde el histórico anual
// [{year, dps, growth, isPartial}]. Detecta caída / congelación / recortes,
// que la racha positiva (años consecutivos subiendo) no captura.
export function dividendTrend(history) {
  const full = (history || []).filter(h => h && !h.isPartial && h.growth != null).sort((a, b) => a.year - b.year)
  if (full.length < 2) return null
  const g = full.map(h => Number(h.growth))
  let pos = 0;     for (let i = g.length - 1; i >= 0; i--) { if (g[i] > 0)  pos++;     else break }
  let down = 0;    for (let i = g.length - 1; i >= 0; i--) { if (g[i] < 0)  down++;    else break }
  let noRaise = 0; for (let i = g.length - 1; i >= 0; i--) { if (g[i] <= 0) noRaise++; else break }
  const cuts10 = full.slice(-10).filter(h => Number(h.growth) < 0).length
  return { pos, down, noRaise, cuts10, lastYear: full[full.length - 1].year, n: full.length }
}

// Badges derivadas de la tendencia: caída/congelación actual + historial de
// recortes. Devuelve [{ kind, emoji, label, color, title }].
export function dividendTrendBadges(trend) {
  if (!trend) return []
  const yrs = n => `${n} ${n === 1 ? 'año' : 'años'}`
  const out = []
  if (trend.pos === 0) {
    if (trend.down > 0) {
      out.push({ kind: 'down', emoji: '📉', label: 'Dividendo en caída', color: '#f87171',
        title: `${yrs(trend.down)} consecutivos recortando el dividendo` })
    } else if (trend.noRaise > 0) {
      out.push({ kind: 'flat', emoji: '🧊', label: 'Dividendo congelado', color: '#fbbf24',
        title: `${yrs(trend.noRaise)} sin subir el dividendo` })
    }
  }
  if (trend.cuts10 >= 3) {
    out.push({ kind: 'cuts', emoji: '⚠️', label: `${trend.cuts10} recortes en 10 años`, color: '#f87171',
      title: `Ha recortado el dividendo ${trend.cuts10} veces en los últimos 10 años — historial poco fiable para DGI` })
  }
  return out
}

export function is1010(co) {
  const y = parseFloat(co.values?.yield_pct)||0
  const g = parseFloat(co.values?.div_cagr5)||0
  return y+g >= 10
}

export function isStale(co) {
  if(!co.date) return false
  const d = new Date(co.date)
  const diff = (Date.now()-d.getTime())/(1000*60*60*24*30)
  return diff > 12
}

export function detectMoat(co) {
  const roic = parseFloat(co.roic||co.values?.roic)
  const streak = parseInt(co.div_streak||co.values?.div_years)||0
  if(isNaN(roic)) return null
  if(roic>25&&streak>=20) return {width:"wide"}
  if(roic>15&&streak>=10) return {width:"narrow"}
  return null
}

export function detectErosion(co) {
  const omh = co.op_margin_history||{}
  const years = Object.keys(omh).sort()
  if(years.length<3) return null
  const recent = omh[years[years.length-1]]
  const older = omh[years[0]]
  if(recent-older < -5) return {eroding:[{metric:"margen_op"}]}
  return null
}

export function getMoatDiscount(co) {
  const m = detectMoat(co)
  if(!m) return 10
  if(m.width==="wide") return 8
  return 9
}

export function calcDivQuality(co, destWHT) {
  const y = parseFloat(co.values?.yield_pct)||0
  const g = parseFloat(co.values?.div_cagr5)||0
  const streak = parseInt(co.div_streak||co.values?.div_years)||0
  if(!y||!g) return null
  const score = (y*0.4)+(g*0.3)+(Math.min(streak,36)/36*10*0.3)
  return parseFloat(score.toFixed(1))
}

export function getSectorDebt(co) {
  const sector = co.sector||"general"
  if(sector==="banco") return null
  const isReit = sector==="reit"||sector==="bdc"
  const val = parseFloat(co.net_debt_ebitda||co.values?.debt_ebitda)
  if(isNaN(val)) return null
  const thresholds = isReit ? [3,5,7,9] : [0.5,2,3.5,5]
  return {value:val, thresholds}
}

export function getSectorPayout(co) {
  const sector = co.sector||"general"
  const isReit = sector==="reit"||sector==="bdc"
  const isBank = sector==="banco"||sector==="aseguradora"
  if(isReit) {
    const v = parseFloat(co.values?.payout_affo||co.payout_affo)
    if(!isNaN(v)&&v>0) return {value:v, label:"Payout AFFO"}
  }
  if(isBank) {
    const v = parseFloat(co.values?.payout_earn||co.payout_eps)
    if(!isNaN(v)&&v>0) return {value:v, label:"Payout BPA"}
  }
  const v = parseFloat(co.values?.payout_fcf||co.payout_fcf)
  if(!isNaN(v)&&v>0) return {value:v, label:"Payout FCF"}
  return null
}

export function getPrevYearDPS(fd) {
  const curYear = new Date().getFullYear()
  if(fd.divHistory&&fd.divHistory.length) {
    const hist = fd.divHistory.filter(h=>h.year<curYear&&h.dps>0)
    hist.sort((a,b)=>b.year-a.year)
    if(hist.length>0) return hist[0].dps
  }
  return parseFloat(fd.dps)||null
}

export const BTN = {border:"none",borderRadius:9,padding:"10px 14px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Figtree',sans-serif"}
export const INP = {width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"9px 12px",color:"#fff",fontSize:14,outline:"none",fontFamily:"'Figtree',sans-serif"}
export const LBL = {display:"block",fontSize:10,color:"#4a5270",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.1em"}
