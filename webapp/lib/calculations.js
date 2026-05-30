import { DCF_CFG } from './sectors'
import { getWHT, cS } from './helpers'

export function calcDCF(dcfObj) {
  const cf = parseFloat(dcfObj.cf)
  const g1 = parseFloat(dcfObj.growth1||dcfObj.growth||0)
  const g2 = parseFloat(dcfObj.growth2||Math.max((g1||0)/2,2))
  const disc = parseFloat(dcfObj.discount||10)
  const term = parseFloat(dcfObj.terminal||2.5)
  const r = disc/100, tg = Math.min(term/100, r-0.02)
  if(!cf||r<=0||r<=tg) return null
  let iv=0, fl=cf
  const a=g1/100, b=g2/100
  for(let i=1;i<=5;i++){fl*=(1+a);iv+=fl/Math.pow(1+r,i);}
  for(let i=1;i<=5;i++){const gf=b-(b-tg)*(i/5);fl*=(1+gf);iv+=fl/Math.pow(1+r,5+i);}
  iv+=fl*Math.min(1/(r-tg),20)/Math.pow(1+r,10)
  return parseFloat(iv.toFixed(2))
}

export function calcDDM(dps, g, d) {
  const gr=g/100, dr=d/100
  if(!dps||dr<=gr||dr<=0) return null
  return parseFloat((dps*(1+gr)/(dr-gr)).toFixed(2))
}

export function autoG(vals, sec) {
  const c = DCF_CFG[sec]||DCF_CFG.general
  if(!c.cid) return null
  const v = parseFloat(vals[c.cid])
  return isNaN(v) ? null : v
}

export function netYield(grossYield, originWHT, destWHT) {
  const effective = Math.max(originWHT, destWHT)/100
  return parseFloat((grossYield*(1-effective)).toFixed(4))
}

export function project10y(investAmt, yieldPct, growthPct, originWHT, destWHT) {
  if(!investAmt||!yieldPct) return null
  const y=yieldPct/100, g=growthPct/100
  const effective=Math.max(originWHT,destWHT)/100
  const rows=[]
  let cumNet=0
  for(let i=0;i<10;i++){
    const gross=investAmt*y*Math.pow(1+g,i)
    const net=gross*(1-effective)
    cumNet+=net
    rows.push({year:i+1,gross:parseFloat(gross.toFixed(2)),net:parseFloat(net.toFixed(2)),cum:parseFloat(cumNet.toFixed(2))})
  }
  return rows
}

export async function fetchYahoo(ticker) {
  const enc=encodeURIComponent
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+enc(ticker)+"?interval=1d&range=1d"
  for(const px of[u=>"https://corsproxy.io/?"+u, u=>"https://api.allorigins.win/get?url="+enc(u)]){
    try{
      let r=await fetch(px(url),{signal:AbortSignal.timeout(12000)})
      if(!r.ok) continue
      let j=await r.json()
      if(typeof j.contents==="string") j=JSON.parse(j.contents)
      const m=j?.chart?.result?.[0]?.meta
      if(m?.regularMarketPrice) return {price:m.regularMarketPrice,currency:m.currency??"",updated:new Date().toLocaleString("es-ES")}
    }catch(e){}
  }
  throw new Error("No se pudo obtener "+ticker)
}

export function recalcCompany(co) {
  const { scores, total, count } = cS(co.values||{}, co.sector||"general")
  return { ...co, scores, total: parseFloat(total.toFixed(2)), count }
}

export function createFromFund(fd, DICT) {
  const ticker = (fd.ticker||"").toUpperCase()
  const dictEntry = DICT.find(d => d[1]&&d[1].toUpperCase()===ticker)
  const vals = {}
  if(fd.payout_fcf!=null) vals.payout_fcf=fd.payout_fcf
  if(fd.debt_ebitda!=null) vals.debt_ebitda=fd.debt_ebitda
  if(fd.fcf_cagr5!=null) vals.fcf_cagr5=fd.fcf_cagr5
  if(fd.div_cagr5!=null) vals.div_cagr5=fd.div_cagr5
  if(fd.roic!=null) vals.roic=fd.roic
  if(fd.interest_cov!=null) vals.interest_cov=fd.interest_cov
  if(fd.div_streak!=null) vals.div_years=parseInt(fd.div_streak)
  if(fd.yield_pct!=null) vals.yield_pct=fd.yield_pct

  const sector = dictEntry?.[6]||"general"
  const { scores, total, count } = cS(vals, sector)

  return {
    id: crypto.randomUUID(),
    name: fd.name||fd.ticker,
    ticker: fd.ticker,
    country: dictEntry?.[2]||"US",
    sector,
    _superSector: dictEntry?.[4]||"",
    _sectorName: dictEntry?.[5]||"",
    _currency: dictEntry?.[3]||"USD",
    originWHT: getWHT(dictEntry?.[2]||"US"),
    values: vals,
    dcf: {},
    div_streak: fd.div_streak,
    dps: fd.dps,
    scores, total: parseFloat(total.toFixed(2)), count,
    date: new Date().toISOString().slice(0,10),
    ...Object.fromEntries(
      ["gross_margin","operating_margin","net_margin","roa","beta","pe_trailing","pe_forward",
       "ev_ebitda","current_ratio","net_debt","revenue_cagr5","market_cap_m","current_price",
       "fcf_per_share","roe","week52_high","week52_low","divHistory"]
      .filter(k=>fd[k]!=null).map(k=>[k,fd[k]])
    )
  }
}
