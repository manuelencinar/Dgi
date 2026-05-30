import { SECTORS, COUNTRIES, WHT_DEFAULTS } from './sectors'

export function getCountry(c) {
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
    US:"América",CA:"América",BR:"América",MX:"América",CL:"América",
    GB:"Europa",DE:"Europa",FR:"Europa",ES:"Europa",NL:"Europa",IT:"Europa",
    CH:"Europa",SE:"Europa",DK:"Europa",NO:"Europa",FI:"Europa",IE:"Europa",
    BE:"Europa",AT:"Europa",PT:"Europa",
    JP:"Asia",CN:"Asia",HK:"Asia",SG:"Asia",KR:"Asia",IN:"Asia",TW:"Asia",
    AU:"Oceanía",NZ:"Oceanía",
    ZA:"África",EG:"África",NG:"África",
  }
  return map[country] || "Otros"
}

export function getCapSize(co) {
  const cap = parseFloat(co.market_cap_m)
  if(isNaN(cap)) return null
  if(cap > 200000) return "Blue chip"
  if(cap > 10000) return "Large cap"
  if(cap > 2000) return "Mid cap"
  return "Small cap"
}

export function streakBadge(streak) {
  const n = parseInt(streak)
  if(isNaN(n)||n<5) return null
  if(n>=50) return "👑"
  if(n>=35) return "🥇"
  if(n>=25) return "🥈"
  if(n>=10) return "🥉"
  return null
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
