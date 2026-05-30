'use client'
import { SECTORS, CC } from '@/lib/sectors'
import { sC, sBg, sL, gM, getCountry, getWHT, mosColor, BTN, LBL } from '@/lib/helpers'
import { netYield } from '@/lib/calculations'
import RadarChart from './charts/RadarChart'

export default function CompanyDetail({co,destWHT,onBack,onEdit,onDelete}) {
  const sc = SECTORS[co.sector]||SECTORS.general
  const ct = getCountry(co.country)
  const originWHT = co.originWHT!=null?co.originWHT:getWHT(co.country||"US")
  const yld = parseFloat(co.values?.yield_pct)||0
  const netY = yld>0?netYield(yld,originWHT,destWHT||19):null

  return(
    <div style={{maxWidth:640,margin:"0 auto"}}>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16}}>
        <button onClick={onBack} style={{...BTN,padding:"6px 12px",background:"rgba(255,255,255,0.05)",color:"#6a7090",fontSize:12}}>← Volver</button>
        <div style={{flex:1}}/>
        <button onClick={onEdit} style={{...BTN,padding:"6px 14px",fontSize:12,background:"rgba(99,102,241,0.3)",color:"#818cf8"}}>Editar</button>
        <button onClick={()=>{if(confirm("¿Eliminar "+co.name+"?"))onDelete()}} style={{...BTN,padding:"6px 12px",fontSize:12,background:"rgba(248,113,113,0.1)",color:"#f87171"}}>Eliminar</button>
      </div>

      <div style={{background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"20px 18px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <h2 style={{fontSize:20,fontWeight:900,color:"#e0e8f0",marginBottom:4}}>{co.name}</h2>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              {co.ticker&&<span style={{fontSize:11,color:"#818cf8",background:"rgba(99,102,241,0.12)",padding:"2px 7px",borderRadius:5}}>{co.ticker}</span>}
              <span style={{fontSize:10,color:sc.color,background:sc.color+"15",padding:"2px 7px",borderRadius:5}}>{sc.label}</span>
              {ct&&ct.code!=="OTHER"&&<span style={{fontSize:13}}>{ct.flag} {ct.name}</span>}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:32,fontWeight:900,color:sC(co.total),lineHeight:1}}>{co.total.toFixed(1)}</div>
            <div style={{fontSize:11,color:sC(co.total)}}>{sL(co.total)}</div>
          </div>
        </div>

        {co.thesis&&<div style={{padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:8,marginBottom:12}}><p style={{fontSize:12,color:"#8090a8",fontStyle:"italic"}}>"{co.thesis}"</p></div>}

        {/* Yield summary */}
        {yld>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            <div style={{padding:"8px",background:"rgba(255,255,255,0.02)",borderRadius:8,textAlign:"center"}}><p style={{fontSize:9,color:"#4a5270"}}>Yield bruto</p><p style={{fontSize:18,fontWeight:700,color:"#c8d0e0"}}>{yld}%</p></div>
            <div style={{padding:"8px",background:"rgba(255,255,255,0.02)",borderRadius:8,textAlign:"center"}}><p style={{fontSize:9,color:"#4a5270"}}>Retención</p><p style={{fontSize:18,fontWeight:700,color:"#fbbf24"}}>{Math.max(originWHT,destWHT||19)}%</p></div>
            <div style={{padding:"8px",background:"rgba(52,211,153,0.06)",borderRadius:8,textAlign:"center"}}><p style={{fontSize:9,color:"#4a5270"}}>Yield neto</p><p style={{fontSize:18,fontWeight:700,color:"#34d399"}}>{netY?.toFixed(2)}%</p></div>
          </div>
        )}

        {/* DCF */}
        {co.dcf?.iv&&(
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:sBg(co.scores?.margin_safety),borderRadius:9,marginBottom:12}}>
            <div><p style={{fontSize:10,color:"#4a5270"}}>Valor intrínseco DCF</p><p style={{fontSize:20,fontWeight:800,color:"#fff"}}>{co.dcf.iv}</p></div>
            {co.dcf.mos!=null&&<div style={{textAlign:"right"}}><p style={{fontSize:10,color:"#4a5270"}}>Margen seguridad</p><p style={{fontSize:20,fontWeight:800,color:sC(co.scores?.margin_safety)}}>{co.dcf.mos>0?"+":""}{co.dcf.mos}%</p></div>}
          </div>
        )}

        <RadarChart scores={co.scores||{}} sector={co.sector||"general"} color={sc.color}/>
      </div>

      {/* Metrics */}
      <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:12,padding:"14px 16px"}}>
        <p style={{fontSize:10,color:"#4a5270",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>Métricas</p>
        <div style={{display:"grid",gap:4}}>
          {gM(co.sector).map(m=>{
            const v=co.values?.[m.id],s=co.scores?.[m.id]
            if(v===undefined||v==="") return null
            return(
              <div key={m.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                <span style={{fontSize:12,color:"#6a7090"}}>{m.label}</span>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:"#c8d0e0",fontWeight:600}}>{v}{m.unit}</span>
                  <span style={{fontSize:12,fontWeight:700,color:sC(s),background:sBg(s),padding:"1px 6px",borderRadius:4}}>{s!=null?s+"/10":"—"}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
