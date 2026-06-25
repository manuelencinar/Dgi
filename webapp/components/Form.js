'use client'
import { useState, useMemo } from 'react'
import { SECTORS, COUNTRIES, DCF_CFG } from '@/lib/sectors'
import { cS, getWHT, getCountry, gM, sC, sBg, BTN, INP, LBL } from '@/lib/helpers'
import { calcDCF, calcDDM, autoG, netYield, project10y } from '@/lib/calculations'
import { DICT } from '@/data/dict'

function CompanySearch({onSelect}) {
  const [q,setQ] = useState("")
  const results = useMemo(()=>{
    if(!q||q.length<2) return []
    const ql=q.toLowerCase()
    return DICT.filter(d=>d[0].toLowerCase().includes(ql)||d[1].toLowerCase().includes(ql)).slice(0,8)
  },[q])
  function pick(d){onSelect({name:d[0],ticker:d[1],country:d[2],currency:d[3],superSector:d[4],sectorName:d[5],sector:d[6]});setQ("")}
  return(
    <div style={{marginBottom:14}}>
      <label style={{...LBL,color:"var(--accent)",marginBottom:6}}>🔍 Buscar empresa ({DICT.length} disponibles)</label>
      <div style={{display:"flex",gap:6,marginBottom:results.length>0?8:0}}>
        <input style={{...INP,flex:1,background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.25)"}}
          placeholder="Nombre o ticker..." value={q} onChange={e=>setQ(e.target.value)} autoComplete="off" autoCorrect="off" spellCheck="false"/>
        {q&&<button onClick={()=>setQ("")} style={{...BTN,padding:"0 12px",background:"var(--surface-3)",color:"var(--text-muted)",fontSize:18}}>×</button>}
      </div>
      {results.length>0&&(
        <div style={{background:"var(--bg-elev)",border:"1px solid rgba(99,102,241,0.3)",borderRadius:10,overflow:"hidden"}}>
          {results.map((d,i)=>(
            <div key={i} onClick={()=>pick(d)} style={{padding:"10px 12px",cursor:"pointer",borderBottom:"1px solid var(--surface-2)"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text-strong)"}}>{d[0]}</span>
                <span style={{fontSize:11,color:"var(--text-faintest)",background:"var(--surface-2)",padding:"1px 5px",borderRadius:4}}>{d[1]}</span>
                <span style={{fontSize:9,color:"var(--accent)",background:"rgba(99,102,241,0.1)",padding:"1px 5px",borderRadius:4}}>{d[4]}</span>
              </div>
              <p style={{fontSize:10,color:"var(--text-faint)",marginTop:2}}>{d[5]} · {d[2]} · {d[3]}</p>
            </div>
          ))}
        </div>
      )}
      {q.length>=2&&results.length===0&&<p style={{fontSize:11,color:"var(--text-faint)",padding:"8px 0"}}>Sin resultados</p>}
    </div>
  )
}

function DCFSection({form,setForm,live}) {
  const cfg = DCF_CFG[form.sector]||DCF_CFG.general
  const di = form.dcf||{cf:"",discount:"10",terminal:"2.5",price:"",growth2:""}
  const ag = autoG(form.values,form.sector)
  function sd(p){setForm(f=>({...f,dcf:{...(f.dcf||{}),...p}}))}
  function run(){
    const cf=parseFloat(di.cf),disc=parseFloat(di.discount||10),term=parseFloat(di.terminal||2.5),pr=parseFloat(di.price)
    const g=ag??parseFloat(di.growth??0),g2=parseFloat(di.growth2||Math.max((g||0)/2,2).toFixed(1))
    if(!cf||isNaN(g)) return
    const iv=calcDCF({cf,growth1:g,growth2:g2,discount:disc,terminal:term})
    if(!iv) return
    const mos=pr>0?parseFloat(((iv-pr)/iv*100).toFixed(1)):null
    setForm(f=>({...f,dcf:{...(f.dcf||{}),cf:di.cf,discount:di.discount,terminal:di.terminal,price:di.price,growth2:String(g2),iv,mos},values:{...f.values,margin_safety:mos!=null?String(mos):""}}))
  }
  const s=live.scores?.margin_safety,hasMos=form.values?.margin_safety!=null&&form.values?.margin_safety!==""
  return(
    <div style={{padding:"12px",background:"rgba(99,102,241,0.04)",border:"1px solid "+(hasMos?sC(s)+"40":"rgba(99,102,241,0.2)"),borderRadius:12,marginTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div><span style={{fontSize:13,color:"var(--accent)",fontWeight:600}}>DCF — 2 fases</span><p style={{fontSize:10,color:"var(--text-faintest)",marginTop:2}}>{cfg.lbl} <strong style={{color:"var(--text)"}}>por acción</strong></p></div>
        {hasMos&&<div style={{fontSize:22,fontWeight:800,color:sC(s)}}>{parseFloat(form.values.margin_safety)>0?"+":""}{form.values.margin_safety}%</div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div><label style={LBL}>{cfg.lbl}</label><input style={INP} type="number" step="any" placeholder="ej: 1.20" value={di.cf} onChange={e=>sd({cf:e.target.value})}/></div>
        <div><label style={LBL}>Precio actual</label><input style={INP} type="number" step="any" placeholder="ej: 12.50" value={di.price} onChange={e=>sd({price:e.target.value})}/></div>
        <div><label style={LBL}>Tasa descuento %</label><input style={INP} type="number" step="0.1" value={di.discount||"10"} onChange={e=>sd({discount:e.target.value})}/></div>
        <div><label style={LBL}>Crec. terminal %</label><input style={INP} type="number" step="0.1" value={di.terminal||"2.5"} onChange={e=>sd({terminal:e.target.value})}/></div>
      </div>
      {ag!=null?(
        <>
          <p style={{fontSize:11,color:"var(--text-faint)",marginBottom:4}}>Fase 1 CAGR: <strong style={{color:"var(--text)"}}>{ag}%</strong></p>
          <div style={{marginBottom:8}}><label style={LBL}>Fase 2 crec. años 6-10% (sugerido: {Math.max((ag||0)/2,2).toFixed(1)}%)</label><input style={INP} type="number" step="0.1" placeholder={String(Math.max((ag||0)/2,2).toFixed(1))} value={di.growth2||""} onChange={e=>sd({growth2:e.target.value})}/></div>
        </>
      ):(
        <div style={{marginBottom:8}}><label style={LBL}>Crecimiento proyectado %</label><input style={INP} type="number" step="0.1" placeholder="ej: 7" value={di.growth||""} onChange={e=>sd({growth:e.target.value})}/></div>
      )}
      <button onClick={run} style={{...BTN,width:"100%",background:"rgba(99,102,241,0.25)",color:"var(--accent)",fontSize:12,marginBottom:di.iv?8:0}}>↻ Calcular valor intrínseco</button>
      {di.iv&&(
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:sBg(s),borderRadius:9}}>
          <div><p style={{fontSize:10,color:"var(--text-faint)"}}>Valor intrínseco</p><p style={{fontSize:20,fontWeight:800,color:"#fff"}}>{di.iv}</p></div>
          {di.mos!=null&&<div style={{textAlign:"right"}}><p style={{fontSize:10,color:"var(--text-faint)"}}>Margen seguridad</p><p style={{fontSize:20,fontWeight:800,color:sC(s)}}>{di.mos>0?"+":""}{di.mos}%</p></div>}
        </div>
      )}
    </div>
  )
}

export default function Form({initial,editingId,onSave,onCancel,destWHT}) {
  const [form,setForm] = useState(()=>({...initial}))
  const [openH,setOpenH] = useState(null)
  const [showR,setShowR] = useState(null)
  const [showProj,setShowProj] = useState(false)
  const ms = useMemo(()=>gM(form.sector),[form.sector])
  const live = useMemo(()=>cS(form.values,form.sector),[form.values,form.sector])
  const sc = SECTORS[form.sector]||SECTORS.general
  const yld = parseFloat(form.values?.yield_pct)||0
  const cagr = parseFloat(form.values?.div_cagr5)||0
  const originWHT = form.originWHT!=null?form.originWHT:getWHT(form.country||"US")
  const dest = destWHT||19
  const projRows = useMemo(()=>form._projAmt>0?project10y(form._projAmt,yld,cagr,originWHT,dest):null,[form._projAmt,yld,cagr,originWHT,dest])
  const netY = yld>0?netYield(yld,originWHT,dest).toFixed(2):null

  function applyDict(d){setForm(f=>({...f,name:d.name,ticker:d.ticker,country:d.country,sector:d.sector,_superSector:d.superSector,_sectorName:d.sectorName,_currency:d.currency,originWHT:getWHT(d.country)}))}
  function chSec(s){if(s!==form.sector)setForm(f=>({...f,sector:s,values:{}}))}
  const sV=(id,v)=>setForm(f=>({...f,values:{...f.values,[id]:v}}))

  return(
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:"18px 16px"}}>
      <p style={{fontSize:10,color:"var(--text-faint)",letterSpacing:"0.16em",textTransform:"uppercase",fontWeight:600,marginBottom:12}}>{editingId?"Editando":"Nueva empresa"}</p>
      {!editingId&&<CompanySearch onSelect={applyDict}/>}
      {form._sectorName&&<div style={{padding:"6px 10px",background:"rgba(99,102,241,0.06)",borderRadius:8,marginBottom:10,fontSize:11,color:"var(--accent)"}}>{form._superSector} › {form._sectorName} · {form._currency}</div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div><label style={LBL}>Nombre</label><input style={INP} placeholder="ej: Munich Re" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
        <div><label style={LBL}>Ticker</label><input style={INP} placeholder="ej: MUV2" value={form.ticker||""} onChange={e=>setForm(f=>({...f,ticker:e.target.value}))}/></div>
      </div>

      <div style={{marginBottom:10}}>
        <label style={LBL}>País</label>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {COUNTRIES.map(ct=>(
            <button key={ct.code} onClick={()=>setForm(f=>({...f,country:ct.code,originWHT:getWHT(ct.code)}))}
              style={{...BTN,padding:"4px 8px",fontSize:10,borderRadius:7,
                background:form.country===ct.code?"rgba(99,102,241,0.4)":"var(--surface-2)",
                color:form.country===ct.code?"#fff":"var(--text-muted)",
                border:"1px solid "+(form.country===ct.code?"rgba(99,102,241,0.5)":"var(--border)")}}>
              {ct.flag} {ct.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{marginBottom:10}}>
        <label style={LBL}>Sector</label>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {Object.entries(SECTORS).map(([k,s])=>(
            <button key={k} onClick={()=>chSec(k)}
              style={{...BTN,padding:"6px 12px",fontSize:11,borderRadius:8,
                background:form.sector===k?s.color+"25":"var(--surface-2)",
                color:form.sector===k?s.color:"var(--text-muted)",
                border:"1px solid "+(form.sector===k?s.color+"50":"var(--border)")}}>
              {s.label}
            </button>
          ))}
        </div>
        <p style={{fontSize:11,color:"var(--text-faintest)",marginTop:4,fontStyle:"italic"}}>{sc.desc}</p>
      </div>

      <div style={{marginBottom:12}}>
        <label style={LBL}>Tesis de inversión</label>
        <textarea style={{...INP,height:56,resize:"vertical",lineHeight:1.4,fontSize:12}} placeholder="¿Por qué esta empresa?" value={form.thesis||""} onChange={e=>setForm(f=>({...f,thesis:e.target.value}))}/>
      </div>

      {/* Metrics */}
      <div style={{display:"grid",gap:7}}>
        {ms.filter(m=>!m.isDCF).map(m=>{
          const s=live.scores[m.id],has=form.values[m.id]!==undefined&&form.values[m.id]!==""
          return(
            <div key={m.id} style={{padding:"10px 12px",background:"var(--surface)",border:"1px solid "+(has?sC(s)+"30":"var(--surface-2)"),borderRadius:9}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                    <span style={{fontSize:12,color:"var(--text-muted)",fontWeight:500}}>{m.label}</span>
                    <button style={{background:"none",border:"1px solid var(--surface-3)",borderRadius:"50%",color:"var(--text-faint)",width:15,height:15,fontSize:8,cursor:"pointer",padding:0,lineHeight:"15px"}} onClick={()=>setOpenH(openH===m.id?null:m.id)}>?</button>
                  </div>
                  {openH===m.id&&<p style={{fontSize:11,color:"var(--text-faint)",fontStyle:"italic",marginBottom:3}}>{m.hint}</p>}
                  {!m.skipRanges&&<button style={{background:"none",border:"none",color:"var(--text-faintest)",fontSize:10,cursor:"pointer",padding:0}} onClick={()=>setShowR(showR===m.id?null:m.id)}>{showR===m.id?"ocultar rangos":"ver rangos"}</button>}
                  {!m.skipRanges&&showR===m.id&&(
                    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:3,marginTop:6}}>
                      {m.ranges.map((r,i)=>(
                        <div key={i} style={{background:sBg(10-i),borderRadius:5,padding:"3px 2px",textAlign:"center"}}>
                          <span style={{fontSize:11,fontWeight:800,color:sC(10-i)}}>{10-i}</span>
                          <span style={{fontSize:9,color:sC(10-i),opacity:0.75,display:"block"}}>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  <div style={{position:"relative"}}>
                    <input style={{...INP,width:80,padding:"7px 28px 7px 8px",fontSize:14}} type="number" step="any" placeholder={m.placeholder} value={form.values[m.id]??""} onChange={e=>sV(m.id,e.target.value)}/>
                    <span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:10,color:"var(--text-faintest)",pointerEvents:"none"}}>{m.unit}</span>
                  </div>
                  <div style={{width:30,height:30,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0,background:sBg(s),color:sC(s),opacity:has?1:0.25}}>{has?(s!=null?s:"—"):"—"}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <DCFSection form={form} setForm={setForm} live={live}/>

      {/* Retenciones */}
      <div style={{marginTop:10,padding:"12px",background:"rgba(251,191,36,0.04)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:12}}>
        <p style={{fontSize:12,fontWeight:600,color:"var(--warning)",marginBottom:8}}>Retenciones fiscales</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div>
            <label style={LBL}>Retención origen % ({getCountry(form.country||"US").name})</label>
            <input style={INP} type="number" step="0.1" placeholder={String(getWHT(form.country||"US"))} value={form.originWHT!=null?form.originWHT:getWHT(form.country||"US")} onChange={e=>setForm(f=>({...f,originWHT:parseFloat(e.target.value)||0}))}/>
          </div>
          <div>
            <label style={LBL}>Tu retención destino %</label>
            <input style={{...INP,opacity:0.6,cursor:"not-allowed"}} type="number" value={dest} readOnly/>
            <p style={{fontSize:10,color:"var(--text-faintest)",marginTop:3}}>Cambia en ajustes globales</p>
          </div>
        </div>
        {yld>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            <div style={{padding:"8px",background:"var(--surface)",borderRadius:8,textAlign:"center"}}><p style={{fontSize:9,color:"var(--text-faint)"}}>Yield bruto</p><p style={{fontSize:16,fontWeight:700,color:"var(--text)"}}>{yld}%</p></div>
            <div style={{padding:"8px",background:"var(--surface)",borderRadius:8,textAlign:"center"}}><p style={{fontSize:9,color:"var(--text-faint)"}}>Retención efectiva</p><p style={{fontSize:16,fontWeight:700,color:"var(--warning)"}}>{Math.max(originWHT,dest)}%</p></div>
            <div style={{padding:"8px",background:"rgba(52,211,153,0.08)",borderRadius:8,textAlign:"center"}}><p style={{fontSize:9,color:"var(--text-faint)"}}>Yield neto</p><p style={{fontSize:16,fontWeight:700,color:"var(--positive)"}}>{netY}%</p></div>
          </div>
        )}
      </div>

      {/* Proyección 10 años */}
      <div style={{marginTop:10,padding:"12px",background:"rgba(129,140,248,0.04)",border:"1px solid rgba(129,140,248,0.2)",borderRadius:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <p style={{fontSize:12,fontWeight:600,color:"var(--accent)"}}>Proyección a 10 años</p>
          <button onClick={()=>setShowProj(p=>!p)} style={{...BTN,fontSize:11,padding:"4px 10px",background:"rgba(129,140,248,0.15)",color:"var(--accent)"}}>{showProj?"Ocultar":"Ver"}</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div>
            <label style={LBL}>Importe a invertir €</label>
            <input style={INP} type="number" step="100" placeholder="ej: 10000" value={form._projAmt||""} onChange={e=>setForm(f=>({...f,_projAmt:parseFloat(e.target.value)||0}))}/>
          </div>
          {form._projAmt>0&&yld>0&&netY&&(
            <div style={{padding:"8px",background:"rgba(129,140,248,0.08)",borderRadius:8}}>
              <p style={{fontSize:9,color:"var(--text-faint)"}}>Renta neta año 1</p>
              <p style={{fontSize:16,fontWeight:700,color:"var(--accent)"}}>€{(form._projAmt*parseFloat(netY)/100).toFixed(2)}</p>
              {projRows&&<p style={{fontSize:9,color:"var(--text-faint)",marginTop:2}}>Total 10 años: <strong style={{color:"#a78bfa"}}>€{projRows[9]?.cum?.toFixed(2)}</strong></p>}
            </div>
          )}
        </div>
        {(!yld||yld===0)&&<p style={{fontSize:11,color:"var(--text-faintest)",marginTop:4}}>Introduce el Yield actual para ver la proyección.</p>}
      </div>

      {/* Botones */}
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button onClick={onCancel} style={{...BTN,flex:1,background:"var(--surface-3)",color:"var(--text-muted)",fontSize:13}}>Cancelar</button>
        <button onClick={()=>onSave(form)} style={{...BTN,flex:2,background:"var(--accent)",fontSize:13}} disabled={!form.name?.trim()}>
          {editingId?"Actualizar":"Guardar empresa"}
        </button>
      </div>
    </div>
  )
}
