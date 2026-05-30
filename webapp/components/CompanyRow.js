'use client'
import { SECTORS } from '@/lib/sectors'
import { getWHT, getCountry, sC, rC, gM, mosColor, is1010, streakBadge, detectMoat, detectErosion, isStale, calcDivQuality, BTN } from '@/lib/helpers'
import { project10y } from '@/lib/calculations'

export default function CompanyRow({co,rank,total,onSel,onEdit,onDel,compareList,onCompare,destWHT,sortBy}) {
  const yld10=parseFloat(co.values?.yield_pct)||0
  const g10=parseFloat(co.values?.div_cagr5)||0
  const orig10=co.originWHT!=null?co.originWHT:getWHT(co.country||"US")
  let proj10=null
  const rg10=Math.min(parseFloat((g10*0.85).toFixed(2)),9)
  if(yld10>0){const rows=project10y(1000,yld10,rg10,orig10,destWHT||19);if(rows)proj10={y1:rows[0].net,total:rows[9].cum,payback:rows.findIndex(r=>r.cum>=1000)}}
  const sc=SECTORS[co.sector]||SECTORS.general,ct=getCountry(co.country)
  const rc=rC(rank,total)
  const inComp=compareList?.includes(co.id)

  return(
    <div style={{borderRadius:8,border:"1px solid rgba(255,255,255,0.04)",background:"rgba(255,255,255,0.015)",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",cursor:"pointer"}} onClick={onSel}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",width:sortBy&&sortBy!=="score"?36:16,flexShrink:0}}>
          <span style={{fontSize:11,fontWeight:800,color:rc}}>{rank}</span>
          {sortBy==="rentable"&&proj10&&<span style={{fontSize:8,color:"#34d399",lineHeight:1}}>€{proj10.total.toFixed(0)}</span>}
          {sortBy==="barata"&&co.dcf?.mos!=null&&<span style={{fontSize:8,color:mosColor(co.dcf.mos),lineHeight:1}}>{co.dcf.mos>0?"+":""}{co.dcf.mos}%</span>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:700,color:"#e0e8f0"}}>{co.name}</span>
            {co.ticker&&<span style={{fontSize:9,color:"#3a4260",background:"rgba(255,255,255,0.04)",padding:"0 3px",borderRadius:3}}>{co.ticker}</span>}
            <span style={{fontSize:8,color:sc.color,background:sc.color+"15",padding:"0 3px",borderRadius:3}}>{sc.label}</span>
            {ct&&ct.code!=="OTHER"&&<span style={{fontSize:9}}>{ct.flag}</span>}
            {is1010(co)&&<span style={{fontSize:8,color:"#fbbf24",background:"rgba(251,191,36,0.12)",padding:"0 3px",borderRadius:3}} title="Regla 10/10: yield+CAGR≥10%">⚡</span>}
            {streakBadge(co.div_streak)&&<span style={{fontSize:9}} title={co.div_streak+" años subiendo dividendo"}>{streakBadge(co.div_streak)}</span>}
            {(()=>{const m=detectMoat(co);return m?<span style={{fontSize:9}}>{m.width==="wide"?"🏰":"🧱"}</span>:null})()}
            {(()=>{const e=detectErosion(co);return e?<span style={{fontSize:8,color:"#f97316",background:"rgba(249,115,22,0.1)",padding:"0 3px",borderRadius:3}}>📉</span>:null})()}
            {isStale(co)&&<span style={{fontSize:8,color:"#f97316",background:"rgba(249,115,22,0.1)",padding:"0 3px",borderRadius:3}}>⏰ +12m</span>}
          </div>
          <div style={{display:"flex",gap:4,alignItems:"center",marginTop:2,flexWrap:"wrap"}}>
            {proj10&&<>
              <span style={{fontSize:8,color:"#3a4260"}}>€1k→</span>
              <span style={{fontSize:9,fontWeight:700,color:"#34d399"}}>€{proj10.y1.toFixed(0)}/a</span>
              <span style={{fontSize:8,color:"#2a3045"}}>·</span>
              <span style={{fontSize:9,fontWeight:600,color:proj10.total>=1000?"#fbbf24":"#8090a8"}}>€{proj10.total.toFixed(0)}/10a</span>
              {proj10.payback>=0&&<span style={{fontSize:8,color:"#fbbf24"}}>r{proj10.payback+1}</span>}
            </>}
            {(()=>{
              const price=co.liveData?.price||parseFloat(co.current_price)||null
              const mos=co.dcf?.mos
              if(!price&&mos==null) return null
              return(
                <>
                  {price&&<span style={{fontSize:13,fontWeight:700,color:"#e0e8f0",letterSpacing:"-0.01em"}}>{price.toFixed(2)}{co._currency==="EUR"?"€":co._currency==="GBP"?"£":"$"}</span>}
                  {mos!=null&&<span style={{fontSize:10,fontWeight:700,color:mosColor(mos),background:mosColor(mos)+"18",padding:"1px 5px",borderRadius:4}}>{mos>0?"+":""}{mos}%</span>}
                </>
              )
            })()}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1,flexShrink:0}}>
          <div style={{fontSize:17,fontWeight:800,color:sC(co.total),lineHeight:1}}>{co.total.toFixed(1)}</div>
          {(()=>{const dq=calcDivQuality(co,destWHT);return dq!=null?<div style={{fontSize:9,fontWeight:700,color:"#a78bfa",lineHeight:1}}>💎{dq}</div>:null})()}
        </div>
      </div>
    </div>
  )
}
