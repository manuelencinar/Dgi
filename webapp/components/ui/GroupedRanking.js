'use client'
import { useState } from 'react'
import { sC, rC, gM } from '@/lib/helpers'

function ConcentrationChart({groups,getLabel,getColor}) {
  const entries=Object.entries(groups).sort((a,b)=>b[1].length-a[1].length)
  const total=entries.reduce((s,[,v])=>s+v.length,0)
  if(total===0) return null
  return(
    <div style={{marginBottom:18,padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:12}}>
      <div style={{display:"flex",height:7,borderRadius:4,overflow:"hidden",gap:1,marginBottom:8}}>
        {entries.map(([k,v])=><div key={k} style={{width:(v.length/total*100)+"%",background:getColor(k)||"#818cf8",opacity:0.7,minWidth:2}}/>)}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {entries.map(([k,v])=>{const lb=getLabel(k),col=getColor(k)||"#818cf8";return(
          <div key={k} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#5a6480"}}>
            <div style={{width:7,height:7,borderRadius:2,background:col}}/>{lb.flag&&<span>{lb.flag}</span>}<span>{lb.name}</span>
            <span style={{color:col,fontWeight:700}}>{v.length} ({(v.length/total*100).toFixed(0)}%)</span>
          </div>
        )})}
      </div>
    </div>
  )
}

export default function GroupedRanking({groups,getLabel,getColor,emptyMsg}) {
  const [sel,setSel]=useState(null)
  const sorted=Object.entries(groups).sort((a,b)=>b[1].length-a[1].length)
  if(sorted.length===0) return <p style={{color:"#3a4260",fontSize:13,textAlign:"center",padding:"40px 0"}}>{emptyMsg}</p>
  return(
    <div>
      <ConcentrationChart groups={groups} getLabel={getLabel} getColor={getColor}/>
      <div style={{display:"grid",gap:16}}>
        {sorted.map(([key,comps])=>{
          const lb=getLabel(key),col=getColor(key)||"#818cf8",avg=comps.reduce((a,b)=>a+b.total,0)/comps.length
          return(
            <div key={key}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,paddingBottom:8,borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>{lb.flag&&<span style={{fontSize:16}}>{lb.flag}</span>}<span style={{fontSize:13,fontWeight:700,color:col}}>{lb.name}</span><span style={{fontSize:10,color:"#3a4260"}}>{comps.length} empresa{comps.length>1?"s":""}</span></div>
                <span style={{fontSize:15,fontWeight:800,color:sC(avg)}}>Ø{avg.toFixed(1)}</span>
              </div>
              <div style={{display:"grid",gap:4}}>
                {comps.map((co,i)=>(
                  <div key={co.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"rgba(255,255,255,0.02)",borderRadius:8,cursor:"pointer"}} onClick={()=>setSel(sel===co.id?null:co.id)}>
                    <span style={{fontSize:11,fontWeight:800,color:rC(i+1,comps.length),width:18,textAlign:"right",flexShrink:0}}>{i+1}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:"#e0e8f0",fontWeight:500}}>{co.name}</span>{co.ticker&&<span style={{fontSize:10,color:"#3a4260"}}>{co.ticker}</span>}</div>
                      {sel===co.id&&<div style={{marginTop:6,display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:3}}>{gM(co.sector).map(m=>{const s=co.scores[m.id];return(<div key={m.id} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#4a5270",padding:"2px 0"}}><span>{m.short}</span><span style={{color:sC(s),fontWeight:600}}>{s!=null?s+"/10":"—"}</span></div>)})}</div>}
                    </div>
                    <span style={{fontSize:18,fontWeight:800,color:sC(co.total),flexShrink:0}}>{co.total.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
