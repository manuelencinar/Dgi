// Componentes React: CompanyRow, CompanyDetail, SettingsPage, Metodologia

function CompanyRow({co,rank,total,sel,onSel,onEdit,onDel,compareList,onCompare,destWHT,sortBy}){
  // 10-year projection on €1,000 simulated investment
  const yld10=parseFloat(co.values?.yield_pct)||0;
  const g10=parseFloat(co.values?.div_cagr5)||0;
  const orig10=co.originWHT!=null?co.originWHT:getWHT(co.country||"US");
  let proj10=null;
  const rg10=Math.min(parseFloat((g10*0.85).toFixed(2)),9);
  if(yld10>0){const rows=project10y(1000,yld10,rg10,orig10,destWHT||19);if(rows)proj10={y1:rows[0].net,total:rows[9].cum,payback:rows.findIndex(r=>r.cum>=1000)};}
  const sc=SECTORS[co.sector]||SECTORS.general,ct=getCountry(co.country);
  const ms=gM(co.sector),rc=rC(rank,total);
  const inComp=compareList?.includes(co.id);
  return(
    <div style={{borderRadius:8,border:"1px solid "+(sel?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.04)"),background:"rgba(255,255,255,0.015)",overflow:"hidden"}}>
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
            {(()=>{const m=detectMoat(co);return m?<span style={{fontSize:9,title:m.width==="wide"?"Foso económico ancho":"Foso económico estrecho"}}>{m.width==="wide"?"🏰":"🧱"}</span>:null;})()}
            {(()=>{const e=detectErosion(co);return e?<span style={{fontSize:8,color:"#f97316",background:"rgba(249,115,22,0.1)",padding:"0 3px",borderRadius:3}} title={"Erosión: "+e.eroding.map(x=>x.metric).join(", ")}>📉</span>:null;})()}
            {isStale(co)&&<span style={{fontSize:8,color:"#f97316",background:"rgba(249,115,22,0.1)",padding:"0 3px",borderRadius:3}} title={"Última actualización: "+co.date}>⏰ +12m</span>}
          </div>
          <div style={{display:"flex",gap:4,alignItems:"center",marginTop:2,flexWrap:"wrap"}}>
            {proj10&&<React.Fragment>
              <span style={{fontSize:8,color:"#3a4260"}}>€1k→</span>
              <span style={{fontSize:9,fontWeight:700,color:"#34d399"}}>€{proj10.y1.toFixed(0)}/a</span>
              <span style={{fontSize:8,color:"#2a3045"}}>·</span>
              <span style={{fontSize:9,fontWeight:600,color:proj10.total>=1000?"#fbbf24":"#8090a8"}}>€{proj10.total.toFixed(0)}/10a</span>
              {proj10.payback>=0&&<span style={{fontSize:8,color:"#fbbf24"}}>r{proj10.payback+1}</span>}
            </React.Fragment>}
            {(()=>{
              const price=co.liveData?.price||parseFloat(co.current_price)||null;
              const mos=co.dcf?.mos;
              if(!price&&mos==null)return null;
              return(
                <React.Fragment>
                  {price&&<span style={{fontSize:13,fontWeight:700,color:"#e0e8f0",letterSpacing:"-0.01em"}}>
                    {price.toFixed(2)}{co._currency==="EUR"?"€":co._currency==="GBP"?"£":"$"}
                  </span>}
                  {mos!=null&&<span style={{fontSize:10,fontWeight:700,color:mosColor(mos),
                    background:mosColor(mos)+"18",padding:"1px 5px",borderRadius:4}}>
                    {mos>0?"+":""}{mos}%
                  </span>}
                </React.Fragment>
              );
            })()}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1,flexShrink:0}}>
          <div style={{fontSize:17,fontWeight:800,color:sC(co.total),lineHeight:1}}>{co.total.toFixed(1)}</div>
          {(()=>{const dq=calcDivQuality(co,destWHT);return dq!=null?<div style={{fontSize:9,fontWeight:700,color:"#a78bfa",lineHeight:1}}>💎{dq}</div>:null;})()}
        </div>
      </div>

    </div>
  );
}

// ─── EMPTY + APP ─────────────────────────────────────────────────────────────
function CompareSelector({companies,compareList,toggleCompare}){
  const[q,setQ]=React.useState("");
  const results=React.useMemo(()=>{
    const base=[...companies].sort((a,b)=>b.total-a.total);
    if(!q)return base;
    const ql=q.toLowerCase();
    return base.filter(co=>co.name.toLowerCase().includes(ql)||(co.ticker||"").toLowerCase().includes(ql));
  },[companies,q]);
  return(
    <React.Fragment>
      <input style={{...INP,marginBottom:8,fontSize:13}} placeholder="🔍 Buscar en tu índice..."
        value={q} onChange={e=>setQ(e.target.value)} autoComplete="off"/>
      <div style={{display:"grid",gap:4}}>
        {results.map(co=>{
          const sel=compareList.includes(co.id),si=compareList.indexOf(co.id),col=sel?CC[si]:"#3a4260";
          const sc2=SECTORS[co.sector]||SECTORS.general;
          return(
            <button key={co.id} onClick={()=>toggleCompare(co.id)}
              style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:sel?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.02)",border:"1px solid "+(sel?col+"60":"rgba(255,255,255,0.04)"),borderRadius:9,cursor:"pointer",textAlign:"left",width:"100%",fontFamily:"'Figtree',sans-serif"}}>
              <div style={{width:20,height:20,borderRadius:"50%",border:"2px solid "+(sel?col:"rgba(255,255,255,0.15)"),background:sel?col:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#000",fontSize:10,fontWeight:800}}>{sel?si+1:""}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,fontWeight:700,color:sel?col:"#c8d0e0"}}>{co.name}</span>
                  {co.ticker&&<span style={{fontSize:10,color:"#3a4260"}}>{co.ticker}</span>}
                  <span style={{fontSize:9,color:sc2.color,background:sc2.color+"15",padding:"1px 5px",borderRadius:3}}>{sc2.label}</span>
                </div>
              </div>
              <span style={{fontSize:16,fontWeight:800,color:sC(co.total),flexShrink:0}}>{co.total.toFixed(1)}</span>
            </button>
          );
        })}
        {companies.length===0&&<p style={{fontSize:12,color:"#3a4260",textAlign:"center",padding:"20px 0"}}>Tu índice está vacío.</p>}
      </div>
    </React.Fragment>
  );
}

function SettingsPage({onClose,destWHT,saveDestWHT,githubUrl,onSetGithubUrl,
  onExport,onImport,onFetchFund,fetchingFund,fundMsg,fileRef,companies}){
  const[gu,setGu]=React.useState(githubUrl);
  const[wht,setWht]=React.useState(String(destWHT));
  const S={padding:"14px",borderRadius:14,marginBottom:0};
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:200,background:"#080b14",overflowY:"auto"}}>
      <div style={{maxWidth:640,margin:"0 auto",padding:"0 14px 80px"}}>
        <div style={{position:"sticky",top:0,background:"rgba(8,11,20,0.97)",borderBottom:"1px solid rgba(255,255,255,0.06)",padding:"12px 0",marginBottom:20,display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onClose} style={{...BTN,padding:"6px 10px",background:"rgba(255,255,255,0.05)",color:"#c8d0e0",fontSize:16}}>{"←"}</button>
          <div>
            <h2 style={{fontSize:18,fontWeight:800,color:"#e0e8f0"}}>⚙️ Ajustes</h2>
            <p style={{fontSize:10,color:"#4a5270"}}>{companies.length} empresas en el índice</p>
          </div>
        </div>
        <div style={{display:"grid",gap:14}}>
          <div style={{...S,background:"rgba(99,102,241,0.04)",border:"1px solid rgba(99,102,241,0.15)"}}>
            <p style={{fontSize:11,fontWeight:700,color:"#818cf8",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:12}}>Datos del índice</p>
            <div style={{display:"grid",gap:8}}>
              <button onClick={onExport} disabled={!companies.length} style={{...BTN,width:"100%",background:"rgba(99,102,241,0.12)",color:"#818cf8",opacity:!companies.length?0.4:1,textAlign:"left",padding:"12px 14px"}}>
                <p style={{fontSize:13,fontWeight:600}}>{"📤 Exportar índice"}</p>
                <p style={{fontSize:11,color:"#4a5270",marginTop:2,fontWeight:400}}>Descarga una copia de seguridad JSON</p>
              </button>
              <button onClick={()=>fileRef.current.click()} style={{...BTN,width:"100%",background:"rgba(99,102,241,0.12)",color:"#818cf8",textAlign:"left",padding:"12px 14px"}}>
                <p style={{fontSize:13,fontWeight:600}}>{"📥 Importar índice"}</p>
                <p style={{fontSize:11,color:"#4a5270",marginTop:2,fontWeight:400}}>Carga un fichero JSON exportado anteriormente</p>
              </button>
            </div>
          </div>
          <div style={{...S,background:"rgba(52,211,153,0.03)",border:"1px solid rgba(52,211,153,0.15)"}}>
            <p style={{fontSize:11,fontWeight:700,color:"#34d399",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>Fundamentales desde GitHub</p>
            <input style={{...INP,marginBottom:8,fontSize:12}} placeholder="https://raw.githubusercontent.com/..."
              value={gu} onChange={e=>setGu(e.target.value)}/>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <button onClick={()=>onSetGithubUrl(gu)} style={{...BTN,flex:1,background:"rgba(52,211,153,0.12)",color:"#34d399",fontSize:12}}>{"💾 Guardar"}</button>
              <button onClick={()=>{onSetGithubUrl(gu);onFetchFund();}} disabled={!gu||fetchingFund}
                style={{...BTN,flex:1,background:"rgba(52,211,153,0.25)",color:"#34d399",fontSize:12,opacity:!gu||fetchingFund?0.5:1}}>
                {fetchingFund?"⏳ Cargando...":"↺ Cargar fundamentales"}
              </button>
            </div>
            {fundMsg&&<p style={{fontSize:11,color:"#34d399"}}>{fundMsg}</p>}
          </div>
          <div style={{...S,background:"rgba(251,191,36,0.03)",border:"1px solid rgba(251,191,36,0.15)"}}>
            <p style={{fontSize:11,fontWeight:700,color:"#fbbf24",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>Retención fiscal destino</p>
            <p style={{fontSize:11,color:"#4a5270",marginBottom:8}}>España: 19% {"(≤€6k)"} · 21% {"(≤€50k)"} · 23% {"(más)"}</p>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[19,21,23].map(v=><button key={v} onClick={()=>{setWht(String(v));saveDestWHT(v);}}
                style={{...BTN,flex:1,fontSize:13,background:destWHT===v?"rgba(251,191,36,0.3)":"rgba(255,255,255,0.05)",color:destWHT===v?"#fbbf24":"#6a7090"}}>{v}%</button>)}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input style={{...INP,flex:1,fontSize:13}} type="number" step="0.1" placeholder="Otro %" value={wht} onChange={e=>setWht(e.target.value)}/>
              <button onClick={()=>saveDestWHT(parseFloat(wht)||19)} style={{...BTN,background:"rgba(251,191,36,0.2)",color:"#fbbf24",fontSize:12}}>Aplicar</button>
            </div>
            <p style={{fontSize:10,color:"#3a4260",marginTop:6}}>Retención actual: <strong style={{color:"#fbbf24"}}>{destWHT}%</strong></p>
          </div>
          <div style={{...S,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)"}}>
            <p style={{fontSize:11,fontWeight:700,color:"#4a5270",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Acerca de</p>
            <p style={{fontSize:11,color:"#3a4260",lineHeight:1.6}}>Mi Índice DGI · Herramienta de análisis para inversión en dividendos crecientes. Precios via Yahoo Finance. Fundamentales actualizables desde GitHub.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metodologia({onClose}){
  const sections=[
    {title:"Scoring DGI",color:"#818cf8",items:[
      {metric:"Nota DGI",calc:"Media ponderada de todas las métricas introducidas manualmente (1-10 cada una). Cada sector tiene su propio conjunto de métricas relevantes.",limit:"Solo refleja los datos que el usuario ha introducido. Sin datos, sin nota."},
      {metric:"Calidad del dividendo (💎)",calc:"Pondera: payout FCF (×1.5), deuda/EBITDA (×1), CAGR dividendo (×1.5), racha consecutiva (×1), yield neto (×1).",limit:"Requiere que los campos relevantes estén rellenos."},
      {metric:"Regla 10/10 (⚡)",calc:"Yield actual + CAGR dividendo ≥ 10%. Indica retorno total estimado del dividendo.",limit:"Simplificación — no garantiza retorno futuro."},
    ]},
    {title:"Rentabilidad",color:"#34d399",items:[
      {metric:"ROIC",calc:"NOPAT / Capital Invertido ajustado. NOPAT = EBIT × (1 − tasa impositiva real). Capital Invertido = Deuda + Patrimonio − Efectivo operativo (1.5% de ingresos). Se excluye el efectivo excedente para no distorsionar empresas con mucha caja.",limit:"ROIC >40% puede indicar intangibles no capitalizados (marca, IP) o estructura de capital atípica. Comparar siempre con peers del mismo sector."},
      {metric:"ROE",calc:"Beneficio neto / Patrimonio neto. Más simple que el ROIC — no ajusta por deuda ni efectivo.",limit:"Se distorsiona con recompras de acciones masivas (reduce el patrimonio artificialmente)."},
      {metric:"ROA",calc:"Beneficio neto / Activos totales. Mide eficiencia del uso de activos.",limit:"Varía mucho por sector — comparar solo entre empresas similares."},
      {metric:"Márgenes",calc:"Bruto = (Ingresos−COGS)/Ingresos. Operativo = EBIT/Ingresos. Neto = Beneficio neto/Ingresos.",limit:"Fuente: income statement anual vía Yahoo Finance."},
    ]},
    {title:"Dividendo",color:"#fbbf24",items:[
      {metric:"DPS",calc:"Dividendo por acción anual introducido por el usuario. El yield se calcula automáticamente: DPS / Precio actual.",limit:"El usuario es responsable de mantener el DPS actualizado."},
      {metric:"CAGR dividendo",calc:"Calculado del historial DPS introducido manualmente: ((DPS_final/DPS_inicial)^(1/años)−1)×100. Con descuento del 15% para proyecciones futuras.",limit:"Basado en historial pasado — no garantiza crecimiento futuro."},
      {metric:"Payout FCF",calc:"DPS×acciones / FCF total. Mide qué porcentaje del FCF se destina a dividendos.",limit:"FCF puede ser volátil año a año por inversiones extraordinarias."},
      {metric:"Proyección 10 años",calc:"Sobre €1.000 invertidos: dividendo año 1 = inversión × yield neto. Crece al CAGR ajustado (−15%, máx 9%) durante 10 años. Retención efectiva = máximo entre retención origen y destino.",limit:"Estimación orientativa. No incluye variación del precio de la acción."},
    ]},
    {title:"Deuda y Liquidez",color:"#f87171",items:[
      {metric:"Deuda/EBITDA",calc:"Deuda total bruta / EBITDA. Indica cuántos años de beneficio operativo se necesitan para cubrir la deuda.",limit:"La versión 'neta' (Deuda Neta/EBITDA) resta solo el efectivo operativo, más precisa para empresas con mucha caja."},
      {metric:"Cobertura de intereses",calc:"EBIT / Gastos financieros. Mide cuántas veces el beneficio operativo cubre los intereses de la deuda.",limit:"Fuente: income statement anual. Puede variar significativamente entre años."},
      {metric:"Ratio corriente",calc:"Activo corriente / Pasivo corriente. Mide liquidez a corto plazo.",limit:"<1 indica posibles problemas de liquidez. >3 puede indicar capital ocioso."},
    ]},
    {title:"Valoración",color:"#60a5fa",items:[
      {metric:"DCF (Valor Intrínseco)",calc:"Modelo de flujo de caja descontado a 2 fases: 5 años al CAGR histórico, 5 años de transición al crecimiento terminal. Terminal value cap: 20× FCF final.",limit:"Muy sensible a los inputs. Usar como referencia, no como verdad absoluta."},
      {metric:"Margen de seguridad",calc:"(Valor intrínseco − Precio actual) / Valor intrínseco × 100. Verde >25%, amarillo 1-25%, rojo <0%.",limit:"Depende de la calidad de los inputs del DCF."},
      {metric:"P/FCF y P/AFFO",calc:"Precio actual / FCF por acción. Se calcula automáticamente si tienes precio en directo y FCF/acción en el DCF.",limit:""},
    ]},
    {title:"Foso Económico",color:"#a78bfa",items:[
      {metric:"Detección de foso (🏰🧱)",calc:"Algoritmo que puntúa (0-100): ROIC (0-35 pts), margen bruto (0-25 pts), estabilidad de márgenes históricos (0-20 pts), CAGR FCF (0-20 pts). Ancho ≥60, Estrecho ≥35.",limit:"Estimación cuantitativa. Un foso real incluye factores cualitativos (marca, red, regulación) que no aparecen en los números."},
      {metric:"Erosión del foso (📉)",calc:"Compara media de últimos 2 años vs 2 años anteriores en márgenes operativos y ROIC estimado. Penalización: 0.3 pts si caída >3pp, 0.6 pts si >6pp, 1.0 pt si >10pp.",limit:"Requiere series históricas cargadas desde GitHub. Sin esos datos no se muestra."},
    ]},
    {title:"Fuentes de datos",color:"#4a5270",items:[
      {metric:"Precios en directo",calc:"Yahoo Finance v8/finance/chart vía proxy CORS. Se refresca manualmente con el botón ↺ Yahoo.",limit:"Puede fallar si Yahoo bloquea el proxy. Solo para referencia — no usar para órdenes de mercado."},
      {metric:"Fundamentales",calc:"Generados con yfinance (Python) y cargados desde GitHub. Fuente primaria: estados financieros anuales de Yahoo Finance.",limit:"Datos anuales — no se actualizan en tiempo real. Actualizar tras cada temporada de resultados."},
    ]},
  ];
  const[open,setOpen]=React.useState(null);
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:200,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"0",overflowY:"auto"}}>
      <div style={{width:"100%",maxWidth:640,background:"#080b14",minHeight:"100vh",padding:"16px 14px 80px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,position:"sticky",top:0,background:"#080b14",padding:"4px 0 12px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800,color:"#e0e8f0"}}>ℹ️ Metodología</h2>
            <p style={{fontSize:10,color:"#4a5270",marginTop:2}}>Cómo se calculan las métricas de esta app</p>
          </div>
          <button onClick={onClose} style={{...BTN,padding:"6px 12px",background:"rgba(255,255,255,0.05)",color:"#6a7090",fontSize:16}}>×</button>
        </div>
        <div style={{display:"grid",gap:10}}>
          {sections.map((sec,si)=>(
            <div key={si} style={{border:"1px solid "+sec.color+"30",borderRadius:12,overflow:"hidden"}}>
              <button onClick={()=>setOpen(open===si?null:si)}
                style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:sec.color+"10",border:"none",cursor:"pointer",fontFamily:"'Figtree',sans-serif"}}>
                <span style={{fontSize:13,fontWeight:700,color:sec.color}}>{sec.title}</span>
                <span style={{fontSize:12,color:sec.color}}>{open===si?"▲":"▼"}</span>
              </button>
              {open===si&&(
                <div style={{padding:"10px 14px",display:"grid",gap:10}}>
                  {sec.items.map((item,ii)=>(
                    <div key={ii} style={{padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:9,borderLeft:"3px solid "+sec.color+"60"}}>
                      <p style={{fontSize:12,fontWeight:700,color:"#c8d0e0",marginBottom:4}}>{item.metric}</p>
                      <p style={{fontSize:11,color:"#8090a8",lineHeight:1.5,marginBottom:item.limit?6:0}}>{item.calc}</p>
                      {item.limit&&<p style={{fontSize:10,color:"#f97316",fontStyle:"italic",lineHeight:1.4}}>⚠ {item.limit}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompanyDetail({co,onBack,onEdit,onDelete,destWHT}){
  const sc=SECTORS[co.sector]||SECTORS.general;
  const ct=getCountry(co.country);
  const ms=gM(co.sector);
  const tips=generateInsights(co);
  const colors={"green":"#34d399","yellow":"#fbbf24","red":"#f87171"};
  const bg={"green":"rgba(52,211,153,0.07)","yellow":"rgba(251,191,36,0.07)","red":"rgba(248,113,113,0.07)"};
  const icons={"green":"✅","yellow":"⚠️","red":"❌"};
  const dq=calcDivQuality(co,destWHT);
  const yld10=parseFloat(co.values?.yield_pct)||0;
  const g10=Math.min((parseFloat(co.values?.div_cagr5)||0)*0.85,9);
  const orig10=co.originWHT!=null?co.originWHT:getWHT(co.country||"US");
  const proj10=yld10>0?project10y(1000,yld10,g10,orig10,destWHT||19):null;
  const hist=co.divHistory||[];
  const maxDPS=hist.length?Math.max(...hist.map(h=>h.dps),0.01):1;
  const cagr5=calcCAGR5(hist);

  return(
    <div style={{minHeight:"100vh",background:"#080b14"}}>
      {/* Header */}
      <div style={{position:"sticky",top:0,zIndex:50,background:"rgba(8,11,20,0.95)",backdropFilter:"blur(10px)",borderBottom:"1px solid rgba(255,255,255,0.06)",padding:"10px 14px"}}>
        <div style={{maxWidth:640,margin:"0 auto",display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onBack} style={{...BTN,padding:"6px 10px",background:"rgba(255,255,255,0.05)",color:"#c8d0e0",fontSize:16,flexShrink:0}}>←</button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span style={{fontSize:15,fontWeight:800,color:"#e0e8f0"}}>{co.name}</span>
              {co.ticker&&<span style={{fontSize:11,color:"#3a4260",background:"rgba(255,255,255,0.05)",padding:"1px 6px",borderRadius:4}}>{co.ticker}</span>}
              {ct&&ct.code!=="OTHER"&&<span style={{fontSize:13}}>{ct.flag}</span>}
              {is1010(co)&&<span style={{fontSize:10,color:"#fbbf24"}}>⚡</span>}
              {streakBadge(co.div_streak)&&<span style={{fontSize:13}}>{streakBadge(co.div_streak)}</span>}
            </div>
            <div style={{display:"flex",gap:5,marginTop:2,flexWrap:"wrap"}}>
              <span style={{fontSize:9,color:sc.color,background:sc.color+"15",padding:"0 5px",borderRadius:3}}>{sc.label}</span>
              {co._sectorName&&<span style={{fontSize:9,color:"#3a4260"}}>{co._sectorName}</span>}
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            {(()=>{
            const erosion=detectErosion(co);
            const adjScore=erosion?Math.max(0,co.total-erosion.totalPenalty):co.total;
            const penalized=erosion&&erosion.totalPenalty>0;
            return(
              <React.Fragment>
                <div style={{fontSize:24,fontWeight:900,color:sC(adjScore),lineHeight:1}}>
                  {adjScore.toFixed(1)}
                  {penalized&&<span style={{fontSize:11,color:"#f97316",marginLeft:3}}>(-{erosion.totalPenalty})</span>}
                </div>
              </React.Fragment>
            );
          })()}
            {dq!=null&&<div style={{fontSize:10,color:"#a78bfa"}}>💎{dq}</div>}
          </div>
        </div>
      </div>

      <div style={{maxWidth:640,margin:"0 auto",padding:"14px 14px 80px"}}>

        {/* Moat + Erosion */}
      {(()=>{
        const moat=detectMoat(co);
        const erosion=detectErosion(co);
        if(!moat&&!erosion)return null;
        return(
          <div style={{marginBottom:12,display:"grid",gap:8}}>
            {moat&&(
              <div style={{padding:"12px 14px",background:moat.width==="wide"?"rgba(52,211,153,0.06)":"rgba(251,191,36,0.06)",border:"1px solid "+(moat.width==="wide"?"rgba(52,211,153,0.25)":"rgba(251,191,36,0.25)"),borderRadius:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:18}}>{moat.width==="wide"?"🏰":"🧱"}</span>
                  <div>
                    <p style={{fontSize:13,fontWeight:700,color:moat.width==="wide"?"#34d399":"#fbbf24"}}>Foso económico {moat.width==="wide"?"ancho":"estrecho"}</p>
                    <p style={{fontSize:10,color:"#4a5270"}}>Puntuación: {moat.score}/100</p>
                  </div>
                </div>
                {moat.sources.length>0&&(
                  <div style={{marginBottom:6}}>
                    <p style={{fontSize:9,color:"#4a5270",marginBottom:4}}>POSIBLE ORIGEN</p>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {moat.sources.map((s,i)=><span key={i} style={{fontSize:10,color:"#c8d0e0",background:"rgba(255,255,255,0.05)",padding:"2px 8px",borderRadius:12}}>{s}</span>)}
                    </div>
                  </div>
                )}
                <p style={{fontSize:9,color:"#4a5270",marginBottom:4}}>SEÑALES DETECTADAS</p>
                <div style={{display:"grid",gap:3}}>
                  {moat.signals.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#8090a8"}}><span style={{color:moat.width==="wide"?"#34d399":"#fbbf24",fontSize:12}}>✦</span>{s}</div>)}
                </div>
                <p style={{fontSize:9,color:"#3a4260",marginTop:8,fontStyle:"italic"}}>Basado en ROIC, márgenes y tendencias históricas. Verificar siempre con análisis cualitativo.</p>
              </div>
            )}
            {erosion&&(
              <div style={{padding:"12px 14px",background:"rgba(249,115,22,0.06)",border:"1px solid rgba(249,115,22,0.3)",borderRadius:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:16}}>📉</span>
                  <div>
                    <p style={{fontSize:13,fontWeight:700,color:"#f97316"}}>Posible erosión del foso</p>
                    <p style={{fontSize:10,color:"#4a5270"}}>Penalización aplicada: -{erosion.totalPenalty} puntos sobre nota DGI</p>
                  </div>
                </div>
                <div style={{display:"grid",gap:4}}>
                  {erosion.eroding.map((e,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 10px",background:"rgba(249,115,22,0.06)",borderRadius:7}}>
                      <span style={{fontSize:11,color:"#c8d0e0"}}>{e.metric}</span>
                      <span style={{fontSize:11,color:"#f97316",fontWeight:600}}>-{e.decline.toFixed(1)} pp en últimos 2 años</span>
                    </div>
                  ))}
                </div>
                <p style={{fontSize:9,color:"#3a4260",marginTop:8,fontStyle:"italic"}}>La nota DGI se ajusta a la baja si el negocio está perdiendo ventaja competitiva. Requiere el historial de series cargado desde GitHub.</p>
              </div>
            )}
          </div>
        );
      })()}
      {/* Price hero */}
        {(()=>{
          const price=co.liveData?.price||parseFloat(co.current_price)||null;
          const mos=co.dcf?.mos;
          const iv=co.dcf?.iv;
          const curr=co._currency==="EUR"?"€":co._currency==="GBP"?"£":"$";
          const w52h=parseFloat(co.week52_high);
          const w52l=parseFloat(co.week52_low);
          const pct52=(price&&!isNaN(w52h)&&!isNaN(w52l)&&w52h>w52l)?Math.round((price-w52l)/(w52h-w52l)*100):null;
          if(!price&&mos==null)return null;
          return(
            <div style={{marginBottom:14,padding:"14px 16px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:price&&pct52!=null?10:0}}>
                <div>
                  <p style={{fontSize:10,color:"#4a5270",marginBottom:2}}>Precio actual</p>
                  {price&&<p style={{fontSize:38,fontWeight:900,color:"#fff",letterSpacing:"-0.02em",lineHeight:1}}>
                    {price.toFixed(2)}{curr}
                  </p>}
                  {co.liveData?.updated&&<p style={{fontSize:9,color:"#3a4260",marginTop:4}}>{co.liveData.updated}</p>}
                </div>
                <div style={{textAlign:"right",marginTop:2}}>
                  {mos!=null&&<div style={{display:"inline-block",padding:"7px 12px",background:mosColor(mos)+"18",border:"1px solid "+mosColor(mos)+"45",borderRadius:10,marginBottom:6}}>
                    <p style={{fontSize:9,color:"#4a5270",marginBottom:1}}>Margen seguridad</p>
                    <p style={{fontSize:24,fontWeight:800,color:mosColor(mos),lineHeight:1}}>{mos>0?"+":""}{mos}%</p>
                  </div>}
                  {iv&&<p style={{fontSize:11,color:"#4a5270"}}>
                  Valor intrínseco: <strong style={{color:"#c8d0e0"}}>{iv}{curr}</strong>
                  {co.dcf?._autoDiscount&&<span style={{fontSize:9,color:"#4a5270",marginLeft:4}}>
                    · {co.dcf.discount}% {detectMoat(co)?("foso "+(detectMoat(co).width==="wide"?"ancho":"estrecho")):"sin foso"}
                  </span>}
                </p>}
                </div>
              </div>
              {price&&!isNaN(w52h)&&!isNaN(w52l)&&w52h>w52l&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:9,color:"#3a4260"}}>{curr}{w52l.toFixed(2)} mín</span>
                    <span style={{fontSize:9,color:"#4a5270"}}>Rango 52 semanas</span>
                    <span style={{fontSize:9,color:"#3a4260"}}>{curr}{w52h.toFixed(2)} máx</span>
                  </div>
                  <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,position:"relative"}}>
                    <div style={{position:"absolute",left:Math.min(Math.max(pct52,2),98)+"%",top:-3,width:10,height:10,borderRadius:"50%",background:mosColor(mos),transform:"translateX(-50%)",boxShadow:"0 0 8px "+mosColor(mos)+"80"}}/>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Projection */}
        {proj10&&(
          <div style={{marginBottom:12,padding:"12px 14px",background:"rgba(129,140,248,0.05)",border:"1px solid rgba(129,140,248,0.15)",borderRadius:12}}>
            <p style={{fontSize:10,color:"#818cf8",fontWeight:600,marginBottom:8}}>Proyección · €1.000 invertidos</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:10}}>
              <div style={{textAlign:"center"}}><p style={{fontSize:9,color:"#4a5270"}}>Año 1 neto</p><p style={{fontSize:16,fontWeight:700,color:"#818cf8"}}>€{proj10[0].net.toFixed(0)}</p></div>
              <div style={{textAlign:"center"}}><p style={{fontSize:9,color:"#4a5270"}}>Año 10 neto</p><p style={{fontSize:16,fontWeight:700,color:"#a78bfa"}}>€{proj10[9].net.toFixed(0)}</p></div>
              <div style={{textAlign:"center"}}><p style={{fontSize:9,color:"#4a5270"}}>Total 10 años</p><p style={{fontSize:16,fontWeight:700,color:proj10[9].cum>=1000?"#fbbf24":"#c8d0e0"}}>€{proj10[9].cum.toFixed(0)}</p></div>
            </div>
            <ProjectionChart rows={proj10} investAmt={1000}/>
            {proj10[9].cum>=1000&&<p style={{fontSize:11,color:"#fbbf24",textAlign:"center",marginTop:6,fontWeight:600}}>Recuperación en dividendos: año {proj10.findIndex(r=>r.cum>=1000)+1}</p>}
          </div>
        )}

        {<FinancialHealth co={co}/>}
        {/* Insights */}
        {tips.length>0&&(
          <div style={{marginBottom:12}}>
            <p style={{fontSize:9,color:"#4a5270",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Análisis fundamental</p>
            <div style={{display:"grid",gap:4}}>
              {tips.map((t,i)=>(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:7,padding:"7px 10px",background:bg[t.type],borderRadius:8,border:"1px solid "+colors[t.type]+"25"}}>
                  <span style={{fontSize:12,flexShrink:0}}>{icons[t.type]}</span>
                  <span style={{fontSize:12,color:"#c8d0e0",lineHeight:1.4}}>{t.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Radar + Metrics */}
        <div style={{marginBottom:12,padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12}}>
          <p style={{fontSize:9,color:"#4a5270",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Scoring DGI</p>
          <RadarChart scores={co.scores} sector={co.sector} color={sC(co.total)}/>
          <div style={{marginTop:10,display:"grid",gap:3}}>
            {ms.map(m=>{const v=co.values[m.id],s=co.scores[m.id];return(
              <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 4px",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:11,color:"#5a6480"}}>{m.label}</span>{m.isDCF&&<span style={{fontSize:9,color:"#818cf8",background:"rgba(99,102,241,0.1)",padding:"1px 4px",borderRadius:3}}>DCF</span>}</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:11,color:"#3a4260"}}>{v!==undefined&&v!==""?v+m.unit:"—"}</span><div style={{width:26,height:26,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,background:sBg(s),color:sC(s)}}>{s??"—"}</div></div>
              </div>
            );})}
          </div>
        </div>

        {/* Dividend history */}
        {hist.length>=2&&(
          <div style={{marginBottom:12,padding:"12px 14px",background:"rgba(52,211,153,0.04)",border:"1px solid rgba(52,211,153,0.15)",borderRadius:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <p style={{fontSize:10,color:"#34d399",fontWeight:600}}>Historial DPS</p>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
              {cagr5!=null&&<p style={{fontSize:10,fontWeight:700,color:cagr5>=0?"#34d399":"#f87171"}}>CAGR {cagr5>=0?"+":""}{cagr5}%</p>}
              {cagr5!=null&&hasCurrentYearDiv(hist)&&<p style={{fontSize:9,color:"#4a5270"}}>excl. {new Date().getFullYear()}</p>}
            </div>
            </div>
            <div style={{overflowX:"auto"}}>
              <div style={{minWidth:hist.length*34+"px"}}>
                {/* Fila 1: etiquetas DPS — posición fija */}
                <div style={{display:"flex",marginBottom:3}}>
                  {hist.map((h,i)=>{
                    const prev=i>0?hist[i-1].dps:null;
                    const grew=prev!=null&&h.dps>prev,shrk=prev!=null&&h.dps<prev;
                    const col=grew?"#34d399":shrk?"#f87171":"#8090a8";
                    return <div key={h.year} style={{flex:1,minWidth:32,textAlign:"center",fontSize:9,fontWeight:600,color:col,lineHeight:1.2}}>{h.dps.toFixed(2)}</div>;
                  })}
                </div>
                {/* Fila 2: barras — altura proporcional */}
                <div style={{display:"flex",alignItems:"flex-end",height:90,gap:3}}>
                  {hist.map((h,i)=>{
                    const curYear=new Date().getFullYear();
                    const isCurrent=h.year===curYear;
                    const prev=i>0?hist[i-1].dps:null;
                    const grew=prev!=null&&h.dps>prev,shrk=prev!=null&&h.dps<prev;
                    const col=isCurrent?"rgba(106,112,144,0.4)":grew?"#34d399":shrk?"#f87171":"rgba(255,255,255,0.2)";
                    const barH=Math.max(Math.round(h.dps/maxDPS*88),4);
                    return <div key={h.year} style={{flex:1,minWidth:28,height:barH+"px",background:col,borderRadius:"3px 3px 0 0",border:isCurrent?"1px dashed #4a5270":"none",boxSizing:"border-box"}}/>;
                  })}
                </div>
                {/* Fila 3: años — posición fija */}
                <div style={{display:"flex",gap:3,marginTop:3}}>
                  {hist.map((h,i)=><div key={h.year} style={{flex:1,minWidth:28,textAlign:"center",fontSize:8,color:"#4a5270"}}>{String(h.year).slice(2)}</div>)}
                </div>
              </div>
            </div>
            {hasCurrentYearDiv(hist)&&(
              <p style={{fontSize:9,color:"#4a5270",marginTop:6,fontStyle:"italic",lineHeight:1.4}}>
                * {new Date().getFullYear()} solo incluye dividendos aprobados hasta la fecha. El CAGR se calcula excluyendo este año para no distorsionar el histórico.
              </p>
            )}
          </div>
        )}

        {/* Thesis */}
        {co.thesis&&(
          <div style={{marginBottom:12,padding:"10px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:10}}>
            <p style={{fontSize:9,color:"#4a5270",marginBottom:4}}>📝 Tesis de inversión</p>
            <p style={{fontSize:12,color:"#8090a8",lineHeight:1.5}}>{co.thesis}</p>
          </div>
        )}

        {/* Actions */}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onEdit} style={{...BTN,flex:1,background:"rgba(99,102,241,0.2)",color:"#818cf8"}}>✏️ Editar</button>
          <button onClick={onDelete} style={{...BTN,background:"rgba(248,113,113,0.1)",color:"#f87171"}}>🗑 Eliminar</button>
        </div>
      </div>
    </div>
  );
}

const EMPTY={name:"",ticker:"",sector:"general",country:"US",values:{},dcf:{cf:"",discount:"10",terminal:"2.5",price:"",growth2:""},thesis:"",history:[],originWHT:null,dps:"",div_streak:""};




const CONTINENT_MAP={
  // América del Norte
  US:"América",CA:"América",MX:"América",
  // América del Sur y Central
  BR:"América",CL:"América",CO:"América",PE:"América",AR:"América",UY:"América",
  EC:"América",VE:"América",PY:"América",BO:"América",CR:"América",PA:"América",
  // Europa Occidental
  GB:"Europa",ES:"Europa",FR:"Europa",DE:"Europa",IT:"Europa",NL:"Europa",
  BE:"Europa",CH:"Europa",AT:"Europa",PT:"Europa",IE:"Europa",LU:"Europa",
  SE:"Europa",NO:"Europa",DK:"Europa",FI:"Europa",IS:"Europa",
  // Europa del Sur y Este
  GR:"Europa",PL:"Europa",CZ:"Europa",HU:"Europa",RO:"Europa",SK:"Europa",
  HR:"Europa",SI:"Europa",RS:"Europa",BG:"Europa",EE:"Europa",LV:"Europa",
  LT:"Europa",MT:"Europa",CY:"Europa",
  // Asia Oriental
  JP:"Asia",KR:"Asia",HK:"Asia",SG:"Asia",TW:"Asia",CN:"Asia",
  // Asia del Sur y Sudeste
  IN:"Asia",TH:"Asia",MY:"Asia",ID:"Asia",PH:"Asia",VN:"Asia",PK:"Asia",
  BD:"Asia",
  // Oriente Medio y África del Norte
  IL:"Asia",AE:"Asia",SA:"Asia",QA:"Asia",KW:"Asia",BH:"Asia",
  EG:"África",MA:"África",NG:"África",KE:"África",ZA:"África",
  GH:"África",TZ:"África",
  // Oceanía
  AU:"Oceanía",NZ:"Oceanía",
};
function getContinent(country){return CONTINENT_MAP[country]||"Otros";}
function getCapSize(co){
  const m=parseFloat(co.market_cap_m);
  if(isNaN(m)||m<=0)return null;
  if(m<2000)return"Small cap";
  if(m<10000)return"Mid cap";
  if(m<100000)return"Large cap";
  return"Blue chip";
}
function createFromFund(fd,dict){
  const ticker=(fd.ticker||"").toUpperCase();
  const dictEntry=dict?dict.find(d=>d[1]&&d[1].toUpperCase()===ticker):null;
  const name=dictEntry?dictEntry[0]:(fd.name||ticker);
  const country=dictEntry?dictEntry[2]:(fd.country||"US");
  const sector=dictEntry?dictEntry[6]:"general";
  const sectorName=dictEntry?dictEntry[5]:"";
  const currency=dictEntry?dictEntry[3]:"USD";
  const superSector=dictEntry?dictEntry[4]:"";
  const vals={};
  if(fd.div_cagr5!=null)vals.div_cagr5=fd.div_cagr5;
  if(fd.div_streak!=null)vals.div_years=parseInt(fd.div_streak);
  if(fd.payout_fcf!=null)vals.payout_fcf=fd.payout_fcf;
  if(fd.fcf_cagr5!=null)vals.fcf_cagr5=fd.fcf_cagr5;
  if(fd.debt_ebitda!=null)vals.debt_ebitda=fd.debt_ebitda;
  if(fd.interest_coverage!=null)vals.interest_cov=fd.interest_coverage;
  if(fd.roic!=null)vals.roic=fd.roic;
  // Auto yield from previous year DPS
  const _prevDPS=getPrevYearDPS(fd);
  const _price=fd.current_price||null;
  if(_prevDPS&&_price&&_price>0)vals.yield_pct=parseFloat((_prevDPS/_price*100).toFixed(2));
  const{scores,total,count}=cS(vals,sector);
  // Auto-calculate DCF for new entries
  const autoDCF=(()=>{
    const cf=fd.fcf_per_share;
    const price=fd.current_price||null;
    const rawG=fd.fcf_cagr5??fd.div_cagr5??fd.revenue_cagr5??3;
    const g=Math.min(Math.max(parseFloat(rawG)||3,1),20);
    if(!cf||cf<=0)return{cf:cf?String(cf):""};
    // Estimate moat from available data to set discount rate
    const tempCo={roic:fd.roic,gross_margin:fd.gross_margin,
      operating_margin:fd.operating_margin,op_margin_history:fd.op_margin_history,
      values:{fcf_cagr5:fd.fcf_cagr5},revenue_cagr5:fd.revenue_cagr5};
    const moatDisc=getMoatDiscount(tempCo);
    const base={cf:String(cf.toFixed(3)),discount:String(moatDisc),terminal:"3",
                growth2:String(Math.max(g*0.5,2).toFixed(1)),_autoDiscount:true};
    if(price&&price>0){
      base.price=String(price.toFixed(2));
      const iv=calcDCF(base);
      if(iv){base.iv=iv;base.mos=Math.round((iv-price)/iv*100);}
    }
    return base;
  })();
  const co={
    id:"fund-"+ticker+"-"+(Date.now()%99999),
    name,ticker:fd.ticker,sector,country,
    values:vals,scores,total:parseFloat(total.toFixed(2)),count,
    date:new Date().toLocaleDateString("es-ES"),
    dps:fd.dps?String(fd.dps):"",
    div_streak:fd.div_streak?String(fd.div_streak):"",
    divHistory:fd.divHistory||[],
    dcf:autoDCF,
    thesis:"",originWHT:null,liveData:null,
    _sectorName:sectorName,_currency:currency,_superSector:superSector
  };
  const extraFields=["gross_margin","operating_margin","net_margin","roa","beta","roe",
    "pe_trailing","pe_forward","ev_ebitda","price_to_book","price_to_sales",
    "interest_coverage","current_ratio","net_debt","net_debt_ebitda","debt_to_equity",
    "revenue_cagr5","net_income_cagr5","market_cap_m","week52_high","week52_low",
    "payout_eps","eps_trailing","eps_forward","current_price","five_yr_avg_yield",
    "op_margin_history","net_margin_history","revenue_history_m","net_income_history_m",
    "ebit_history_m","fcf_history_m","total_debt_history_m","equity_history_m","net_debt_history_m"];
  extraFields.forEach(k=>{if(fd[k]!=null)co[k]=fd[k];});
  return co;
}
