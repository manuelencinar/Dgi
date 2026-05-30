// App principal y punto de entrada

function App(){
  const[companies,setCompanies]=React.useState([]);
  const[tab,setTab]=React.useState("index");
  const[view,setView]=React.useState("list");
  const[editData,setEditData]=React.useState(null);
  const[editingId,setEditingId]=React.useState(null);
  const[selected,setSelected]=React.useState(null);
  const[detailCo,setDetailCo]=React.useState(null);
  const[refreshing,setRefreshing]=React.useState(false);
  const[refreshMsg,setRefreshMsg]=React.useState("");
  const[refreshAlerts,setRefreshAlerts]=React.useState([]);
  const[compareList,setCompareList]=React.useState([]);
  const[search,setSearch]=React.useState("");
  const[filterSector,setFilterSector]=React.useState(null);
  const[filterContinent,setFilterContinent]=React.useState(null);
  const[filterCapSize,setFilterCapSize]=React.useState(null);
  const[filterMoat,setFilterMoat]=React.useState(null);
  const[showFilters,setShowFilters]=React.useState(false);
  const[minScore,setMinScore]=React.useState(0);
  const[sortBy,setSortBy]=React.useState("score");
  const[destWHT,setDestWHT]=React.useState(()=>parseFloat(localStorage.getItem("dgi-dest-wht")||"19"));
  const[githubUrl,setGithubUrl]=React.useState(()=>localStorage.getItem("dgi-github-url")||"");
  const[showGithubSettings,setShowGithubSettings]=React.useState(false);
  const[showMetodologia,setShowMetodologia]=React.useState(false);
  const[showSettings,setShowSettings]=React.useState(false);
  const[fetchingFund,setFetchingFund]=React.useState(false);
  const[fundMsg,setFundMsg]=React.useState("");
  const[showWHTSettings,setShowWHTSettings]=React.useState(false);
  const fileRef=React.useRef();

  React.useEffect(()=>{
    try{
      const s=localStorage.getItem("dgi-v5");
      if(s){
        const loaded=JSON.parse(s);
        const curYear=new Date().getFullYear();

        // 1. Deduplicate by ticker
        const seen=new Set();
        let companies=loaded.filter(co=>{
          const t=(co.ticker||"").toUpperCase();
          if(!t)return true;
          if(seen.has(t))return false;
          seen.add(t);return true;
        });

        // 2. Recalculate yield + DCF for all companies that have the data
        companies=companies.map(co=>{
          const vals={...co.values};
          let dcf={...(co.dcf||{})};
          let changed=false;

          // Auto yield: last full year DPS / current price
          const price=parseFloat(co.current_price)||co.liveData?.price||null;
          const hist=(co.divHistory||[]).filter(h=>h.year<curYear&&h.dps>0);
          hist.sort((a,b)=>b.year-a.year);
          const prevDPS=hist.length>0?hist[0].dps:parseFloat(co.dps)||null;
          if(prevDPS&&price&&price>0){
            const yld=parseFloat((prevDPS/price*100).toFixed(2));
            if(vals.yield_pct!==yld){vals.yield_pct=yld;changed=true;}
          }

          // Auto DCF: calculate IV if we have CF + price + growth
          const cf=parseFloat(dcf.cf);
          const dcfPrice=parseFloat(dcf.price)||price||null;
          if(cf&&cf>0&&dcfPrice&&dcfPrice>0){
            // Set price if missing
            if(!dcf.price||parseFloat(dcf.price)<=0){dcf.price=String(dcfPrice.toFixed(2));changed=true;}
            // Set discount based on moat if not manually set or if auto
            if(!dcf.discount||dcf._autoDiscount){
              const disc=getMoatDiscount(co);
              dcf.discount=String(disc);dcf._autoDiscount=true;changed=true;
            }
            if(!dcf.terminal)dcf.terminal="3";
            // Set growth if missing
            if(!dcf.growth1||dcf._autoDiscount){
              const rawG=parseFloat(co.values?.fcf_cagr5||co.fcf_cagr5||co.div_cagr5||co.revenue_cagr5||3);
              const g=Math.min(Math.max(rawG||3,1),20);
              dcf.growth1=dcf.growth1||String(g.toFixed(1));
              dcf.growth2=dcf.growth2||String(Math.max(g*0.5,2).toFixed(1));
              changed=true;
            }
            // Always recalculate IV
            const iv=calcDCF(dcf);
            if(iv){
              const mos=Math.round((iv-dcfPrice)/iv*100);
              if(dcf.iv!==iv||dcf.mos!==mos){dcf.iv=iv;dcf.mos=mos;changed=true;}
            }
          }

          if(!changed)return co;
          const{scores,total,count}=cS(vals,co.sector);
          return{...co,values:vals,dcf,scores,total:parseFloat(total.toFixed(2)),count};
        });

        const fixed=companies.filter(Boolean);
        localStorage.setItem("dgi-v5",JSON.stringify(fixed));
        setCompanies(fixed);
      }
    }catch(e){console.error("Load error:",e);}
  },[]);
  React.useEffect(()=>{
    if(!companies.length)return;
    const last=parseInt(localStorage.getItem("dgi-last-refresh")||"0");
    if(Date.now()-last>3600000){localStorage.setItem("dgi-last-refresh",String(Date.now()));handleRefresh();}
  },[companies.length]);


  async function handleFetchFundamentals(){
    if(!githubUrl){setShowGithubSettings(true);return;}
    setFetchingFund(true);setFundMsg("Cargando fundamentales...");
    try{
      const r=await fetch(githubUrl+"?t="+Date.now(),{signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new Error("HTTP "+r.status);
      const raw=await r.text();
      const clean=raw.replace(/:\s*NaN/g,':null').replace(/:\s*Infinity/g,':null').replace(/:\s*-Infinity/g,':null');
      const data=JSON.parse(clean);
      const list=Array.isArray(data)?data:data.fundamentals||data.companies||[];
      if(!list.length)throw new Error("JSON vacío o formato incorrecto");
      // Synchronous update to get accurate count
      let updated=0;
      setCompanies(prev=>{
        const nl=prev.map(co=>{
          // Match by ticker (try with and without exchange suffix)
          const coTick=(co.ticker||"").toUpperCase();
          const fd=list.find(f=>{
            const fTick=(f.ticker||"").toUpperCase();
            return fTick&&coTick&&(fTick===coTick||fTick.split(".")[0]===coTick||coTick.split(".")[0]===fTick);
          });
          if(!fd)return co;
          updated++;
          const newVals={...co.values};
          if(fd.payout_fcf!=null)newVals.payout_fcf=fd.payout_fcf;
          if(fd.debt_ebitda!=null)newVals.debt_ebitda=fd.debt_ebitda;
          if(fd.fcf_cagr5!=null)newVals.fcf_cagr5=fd.fcf_cagr5;
          if(fd.div_cagr5!=null)newVals.div_cagr5=fd.div_cagr5;
          if(fd.roic!=null)newVals.roic=fd.roic;
          if(fd.interest_cov!=null)newVals.interest_cov=fd.interest_cov;
          // Auto-calculate yield from previous year DPS + current price
          const prevDPS=getPrevYearDPS(fd);
          const priceForYield=fd.current_price||co.liveData?.price||null;
          if(prevDPS&&priceForYield&&priceForYield>0){
            newVals.yield_pct=parseFloat((prevDPS/priceForYield*100).toFixed(2));
          } else if(fd.yield_pct!=null){
            newVals.yield_pct=fd.yield_pct;
          }
          const newDcf={...(co.dcf||{})};
          if(fd.fcf_per_share!=null)newDcf.cf=String(fd.fcf_per_share);
          const patch={values:newVals,dcf:newDcf};
          if(fd.dps!=null)patch.dps=String(fd.dps);
          if(fd.div_streak!=null)patch.div_streak=String(fd.div_streak);
          // Update country/sector from DICT if missing on existing company
          if(!co.country||co.country===""){
            const dictEntry=typeof DICT!=="undefined"?DICT.find(d=>d[1]&&d[1].toUpperCase()===(co.ticker||"").toUpperCase()):null;
            if(dictEntry){patch.country=dictEntry[2];patch.sector=dictEntry[6];patch._sectorName=dictEntry[5];patch._currency=dictEntry[3];patch._superSector=dictEntry[4];}
          }
          const extraFields=["gross_margin","operating_margin","net_margin","roa","beta",
            "pe_trailing","pe_forward","ev_ebitda","price_to_book","price_to_sales",
            "interest_coverage","current_ratio","net_debt","net_debt_ebitda","debt_to_equity",
            "revenue_cagr5","net_income_cagr5","market_cap_m","shares_outstanding_m",
            "five_yr_avg_yield","week52_high","week52_low","insider_ownership_pct",
            "inst_ownership_pct","earnings_growth_yoy","revenue_growth_yoy","payout_eps",
            "eps_trailing","eps_forward","current_price","fcf_per_share","roe",
            "op_margin_history","net_margin_history","revenue_history_m",
            "net_income_history_m","ebit_history_m","fcf_history_m",
            "total_debt_history_m","equity_history_m","net_debt_history_m"];
          extraFields.forEach(k=>{if(fd[k]!=null)patch[k]=fd[k];});
          if(fd.divHistory&&fd.divHistory.length)patch.divHistory=fd.divHistory;
          if(fd.div_streak!=null)newVals.div_years=parseInt(fd.div_streak);
          // Auto-calculate DCF if we have enough data
          const autoCF=fd.fcf_per_share;
          const autoPrice=fd.current_price||co.liveData?.price||parseFloat(co.dcf?.price)||null;
          // Growth rate: try FCF CAGR → div CAGR → revenue CAGR → default 3%
          const rawG=fd.fcf_cagr5??fd.div_cagr5??fd.revenue_cagr5??3;
          const autoG=Math.min(Math.max(parseFloat(rawG)||3,1),20);
          if(autoCF&&autoCF>0){
            // Use moat-adjusted discount rate (unless user set a custom one)
            const moatDisc=getMoatDiscount({...co,...patch});
            const userDisc=parseFloat(co.dcf?.discount);
            const discount=(!isNaN(userDisc)&&userDisc>0)?userDisc:moatDisc;
            const dcfBase={...(co.dcf||{}),cf:String(autoCF.toFixed(3)),
              discount:String(discount),terminal:co.dcf?.terminal||"3",
              growth2:co.dcf?.growth2||String(Math.max(autoG*0.5,2).toFixed(1)),
              _autoDiscount:discount===moatDisc};
            if(autoPrice&&autoPrice>0){
              dcfBase.price=String(autoPrice.toFixed(2));
              const iv=calcDCF(dcfBase);
              if(iv){
                const mos=Math.round((iv-autoPrice)/iv*100);
                dcfBase.iv=iv;dcfBase.mos=mos;
              }
            }
            patch.dcf=dcfBase;
          }
          const{scores,total,count}=cS(newVals,co.sector);
          return{...co,...patch,scores,total:parseFloat(total.toFixed(2)),count};
        });
        nl.sort((a,b)=>b.total-a.total);
        // Report after update using setTimeout to read updated count
        // Bidirectional ticker matching to prevent duplicates
        const existingTickers=nl.map(x=>(x.ticker||"").toUpperCase()).filter(Boolean);
        const tickerMatch=(a,b)=>{
          if(a===b)return true;
          const as=a.split(".")[0],bs=b.split(".")[0];
          return as===b||a===bs||as===bs;
        };
        const toAdd=list.filter(fd=>{
          if(!fd.ticker||!fd.dps)return false;
          const t=fd.ticker.toUpperCase();
          return!existingTickers.some(et=>tickerMatch(et,t));
        });
        // Deduplicate any existing duplicates
        const seenT=new Set();
        const nlDeduped=nl.filter(co=>{
          const t=(co.ticker||"").toUpperCase();
          if(!t)return true;
          if(seenT.has(t))return false;
          seenT.add(t);return true;
        });
        if(toAdd.length>0){
          const newCos=toAdd.map(fd=>createFromFund(fd,typeof DICT!=="undefined"?DICT:[]));
          const combined=[...nlDeduped,...newCos];
          combined.sort((a,b)=>b.total-a.total);
          persist(combined);
          setTimeout(()=>setFundMsg("✓ "+updated+" actualizadas + "+toAdd.length+" nuevas."),50);
          return combined;
        }
        setTimeout(()=>setFundMsg("✓ "+updated+" empresa"+(updated!==1?"s":"")+" actualizada"+(updated!==1?"s":"")+"."),50);
        persist(nl);return nl;
      });
    }catch(e){
      setFundMsg("✗ Error: "+e.message);
    }
    setFetchingFund(false);
    setTimeout(()=>setFundMsg(""),8000);
  }
  function persist(l){try{localStorage.setItem("dgi-v5",JSON.stringify(l));}catch(e){}}
  function saveDestWHT(v){const n=parseFloat(v)||19;setDestWHT(n);localStorage.setItem("dgi-dest-wht",String(n));}
  function toggleCompare(id){setCompareList(l=>l.includes(id)?l.filter(x=>x!==id):l.length<5?[...l,id]:l);}

  const filtered=React.useMemo(()=>companies.filter(co=>{
    if(filterContinent&&getContinent(co.country)!==filterContinent)return false;
    if(filterCapSize&&getCapSize(co)!==filterCapSize)return false;
    if(filterMoat){const m=detectMoat(co);const w=m?m.width:"none";if(filterMoat!==w)return false;}
    if(search&&!co.name.toLowerCase().includes(search.toLowerCase())&&!(co.ticker||"").toLowerCase().includes(search.toLowerCase()))return false;
    if(minScore>0&&co.total<minScore)return false;
    if(filterSector&&co.sector!==filterSector)return false;
    return true;
  }),[companies,search,filterSector,filterContinent,filterCapSize,filterMoat,minScore]);
  const sorted=React.useMemo(()=>{
    const arr=[...filtered];
    if(sortBy==="score") return arr.sort((a,b)=>b.total-a.total);
    if(sortBy==="rentable"){
      const get10y=co=>{
        const yld=parseFloat(co.values?.yield_pct)||0;
        if(!yld)return-1;
        const g=Math.min((parseFloat(co.values?.div_cagr5)||0)*0.85,9);
        const orig=co.originWHT!=null?co.originWHT:getWHT(co.country||"US");
        const rows=project10y(1000,yld,g,orig,destWHT||19);
        return rows?rows[9].cum:-1;
      };
      return arr.sort((a,b)=>get10y(b)-get10y(a));
    }
    if(sortBy==="barata"){
      return arr.sort((a,b)=>{
        const ma=a.dcf?.mos??-999,mb=b.dcf?.mos??-999;
        return mb-ma;
      });
    }
    if(sortBy==="divquality"){
      return arr.sort((a,b)=>{
        const qa=calcDivQuality(a,destWHT)??-1,qb=calcDivQuality(b,destWHT)??-1;
        return qb-qa;
      });
    }
    return arr;
  },[filtered,sortBy,destWHT]);
  const bySector=React.useMemo(()=>{const g={};filtered.forEach(co=>{const s=co.sector||"general";if(!g[s])g[s]=[];g[s].push(co);});return g;},[filtered]);
  const byCountry=React.useMemo(()=>{const g={};filtered.forEach(co=>{const ct=co.country||"OTHER";if(!g[ct])g[ct]=[];g[ct].push(co);});return g;},[filtered]);
  const compareCompanies=React.useMemo(()=>compareList.map(id=>companies.find(co=>co.id===id)).filter(Boolean),[compareList,companies]);
  const avgScore=sorted.length?sorted.reduce((a,b)=>a+b.total,0)/sorted.length:0;
  const availableSectors=[...new Set(companies.map(co=>co.sector))];
  const TABS=[{id:"index",label:"Índice"},{id:"sectores",label:"Sectores"},{id:"paises",label:"Países"},{id:"comparar",label:compareList.length>0?"Comparar ("+compareList.length+")":"Comparar"}];

  function handleSave(form){
    // Auto-compute yield_pct from DPS + live price if available
    const savedValues={...form.values};
    // Auto-fill div_years from div_streak
    if(form.div_streak&&parseInt(form.div_streak)>0)
      savedValues.div_years=parseInt(form.div_streak);
    const _lp=form.liveData?.price||parseFloat(form.dcf?.price)||0;
    const _cf=parseFloat(form.dcf?.cf)||0;
    if(form.dps&&parseFloat(form.dps)>0&&_lp>0)
      savedValues.yield_pct=parseFloat((parseFloat(form.dps)/_lp*100).toFixed(2));
    if(_cf>0&&_lp>0){
      if(savedValues.p_fcf===undefined||savedValues.p_fcf==="")
        savedValues.p_fcf=parseFloat((_lp/_cf).toFixed(2));
      if(savedValues.p_affo===undefined||savedValues.p_affo==="")
        savedValues.p_affo=parseFloat((_lp/_cf).toFixed(2));
    }
    // Duplicate check (only for new entries)
    if(!editingId){
      const t=(form.ticker||"").trim().toUpperCase();
      const n=form.name.trim().toLowerCase();
      const dup=companies.find(co=>(t&&co.ticker&&co.ticker.toUpperCase()===t)||co.name.trim().toLowerCase()===n);
      if(dup){alert(dup.name+" ya está en tu índice.");return;}
    }
    const{scores,total,count}=cS(savedValues,form.sector);
    const co={id:editingId||Date.now().toString(),name:form.name.trim(),ticker:(form.ticker||"").trim().toUpperCase(),sector:form.sector||"general",country:form.country||"US",values:savedValues,scores,total:parseFloat(total.toFixed(2)),count,date:new Date().toLocaleDateString("es-ES"),dcf:form.dcf||null,thesis:form.thesis||"",originWHT:form.originWHT!=null?form.originWHT:getWHT(form.country||"US"),_superSector:form._superSector||"",divHistory:form.divHistory||null,_sectorName:form._sectorName||"",_currency:form._currency||"",dps:form.dps||"",div_streak:form.div_streak||""};
    const nl=editingId?companies.map(x=>x.id===editingId?co:x):[...companies,co];
    nl.sort((a,b)=>b.total-a.total);setCompanies(nl);persist(nl);
    setEditData(null);setEditingId(null);setView("list");setSelected(co);
  }
  function handleEdit(co){setEditData({...co,values:{...co.values},dps:co.dps||"",div_streak:co.div_streak||"",divHistory:co.divHistory||null});setEditingId(co.id);setView("form");}
  function handleDelete(id){if(!confirm("¿Eliminar esta empresa?"))return;const nl=companies.filter(c=>c.id!==id);setCompanies(nl);persist(nl);if(selected?.id===id)setSelected(null);}
  function handleExport(){const blob=new Blob([JSON.stringify({version:5,exportDate:new Date().toISOString(),companies},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="mi-indice-dgi.json";a.click();URL.revokeObjectURL(url);}
  function handleImport(e){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{try{const data=JSON.parse(ev.target.result);const list=data.companies||data;if(!Array.isArray(list))throw new Error("Formato incorrecto");if(confirm("Importar "+list.length+" empresas?")){list.sort((a,b)=>b.total-a.total);setCompanies(list);persist(list);setSelected(null);}}catch(err){alert("Error: "+err.message);}};reader.readAsText(file);e.target.value="";}
  async function handleRefresh(){
    const wt=companies.filter(c=>c.ticker);if(!wt.length){setRefreshMsg("Sin tickers.");return;}
    setRefreshing(true);setRefreshMsg("Actualizando "+wt.length+"...");let ok=0,fail=0;const updated=[...companies];
    await Promise.all(wt.map(async co=>{try{const ld=await fetchYahoo(co.ticker);const idx=updated.findIndex(x=>x.id===co.id);if(idx<0)return;
      const nd={...(updated[idx].dcf||{}),price:ld.price?String(ld.price.toFixed(2)):""};const nv={...updated[idx].values};
      // Recompute yield from DPS and p_fcf from DCF cf if available
      // Recompute yield from DPS if available
      const activeDPS=parseFloat(updated[idx].dps)||0;
      if(activeDPS>0&&ld.price>0)
        nv.yield_pct=parseFloat((activeDPS/ld.price*100).toFixed(2));
      const _rcf=parseFloat(updated[idx].dcf?.cf)||0;
      if(_rcf>0&&ld.price>0){
        nv.p_fcf=parseFloat((ld.price/_rcf).toFixed(2));
        nv.p_affo=parseFloat((ld.price/_rcf).toFixed(2));
      }
      if(nd.cf&&ld.price){const g=autoG(nv,updated[idx].sector),cf=parseFloat(nd.cf),disc=parseFloat(nd.discount||10),term=parseFloat(nd.terminal||2.5),g2=parseFloat(nd.growth2||Math.max((g||0)/2,2).toFixed(1));if(g!=null&&cf){const iv=calcDCF(cf,g,g2,disc,term);if(iv){const mos=parseFloat(((iv-ld.price)/iv*100).toFixed(1));nd.iv=iv;nd.mos=mos;nv.margin_safety=String(mos);}}}
      const{scores,total:tot,count}=cS(nv,updated[idx].sector);updated[idx]={...updated[idx],dcf:nd,values:nv,scores,total:parseFloat(tot.toFixed(2)),count};ok++;}catch(err){fail++;}}));
    // Detect opportunity alerts (MoS improved ≥10 points)
    const alerts=[];
    updated.forEach(co=>{
      const prev=companies.find(x=>x.id===co.id);
      if(!prev)return;
      const oldMos=prev.dcf?.mos;const newMos=co.dcf?.mos;
      if(oldMos==null||newMos==null)return;
      const improvement=newMos-oldMos;
      if(improvement>=10)alerts.push({id:co.id,name:co.name,ticker:co.ticker,oldMos,newMos,improvement:Math.round(improvement)});
    });
    alerts.sort((a,b)=>b.improvement-a.improvement);
    if(alerts.length)setRefreshAlerts(alerts);
    updated.sort((a,b)=>b.total-a.total);setCompanies(updated);persist(updated);setRefreshing(false);
    setRefreshMsg("✓ "+ok+" actualizadas"+(fail>0?" · "+fail+" fallidas":"")+".");setTimeout(()=>setRefreshMsg(""),6000);
  }




  return(
    <div style={{minHeight:"100vh",padding:"20px 14px 80px",backgroundImage:"radial-gradient(ellipse at 70% 0%,rgba(60,30,140,0.14) 0%,transparent 50%)"}}>
      {/* HEADER */}
      <div style={{maxWidth:640,margin:"0 auto 16px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
        <div>
          <p style={{fontSize:10,letterSpacing:"0.22em",color:"#818cf8",textTransform:"uppercase",marginBottom:3,fontWeight:500}}>DGI · Scoring System</p>
          <h1 style={{fontSize:28,fontWeight:900,color:"#fff",letterSpacing:"-0.02em",lineHeight:1}}>Mi Índice</h1>
          {companies.length>0&&<p style={{fontSize:11,color:"#4a5270",marginTop:4}}>{companies.length} empresas · Ø{avgScore.toFixed(1)}</p>}
          <button onClick={()=>setShowMetodologia(true)} style={{...BTN,fontSize:10,padding:"3px 8px",background:"rgba(255,255,255,0.04)",color:"#4a5270",marginTop:4}}>ℹ️ Metodología</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
            <button onClick={handleRefresh} disabled={refreshing} style={{...BTN,fontSize:11,padding:"6px 10px",background:"rgba(99,102,241,0.15)",color:"#818cf8",opacity:refreshing?0.5:1}}>{refreshing?"⏳":"↺"} Yahoo</button>
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{display:"none"}}/>
            <button onClick={()=>setShowSettings(true)} style={{...BTN,fontSize:13,padding:"6px 11px",background:"rgba(255,255,255,0.05)",color:"#6a7090"}}>⚙️</button>
            <button onClick={()=>{setEditData(EMPTY);setEditingId(null);setView(view==="form"?"list":"form");}} style={{...BTN,fontSize:12,padding:"7px 12px",background:view==="form"?"rgba(255,255,255,0.06)":"rgba(99,102,241,0.8)"}}>{view==="form"?"Cancelar":"+ Añadir"}</button>
          </div>
        </div>
      </div>

      {refreshAlerts.length>0&&(<div style={{maxWidth:640,margin:"0 auto 12px",padding:"10px 14px",background:"rgba(52,211,153,0.07)",border:"1px solid rgba(52,211,153,0.3)",borderRadius:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><p style={{fontSize:12,fontWeight:700,color:"#34d399"}}>⚡ {refreshAlerts.length} oportunidad{refreshAlerts.length>1?"es":""}</p><button onClick={()=>setRefreshAlerts([])} style={{background:"none",border:"none",color:"#4a5270",fontSize:14,cursor:"pointer"}}>×</button></div>{refreshAlerts.map(a=>(<div key={a.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",background:"rgba(52,211,153,0.06)",borderRadius:8,marginBottom:4}}><span style={{fontSize:12,color:"#c8d0e0"}}>{a.name}</span><span style={{fontSize:12,fontWeight:700,color:mosColor(a.newMos)}}>{a.newMos>0?"+":""}{a.newMos}% (+{a.improvement}pts)</span></div>))}</div>)}
      {refreshMsg&&<div style={{maxWidth:640,margin:"0 auto 10px",padding:"8px 14px",background:"rgba(99,102,241,0.08)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:10,fontSize:12,color:"#818cf8"}}>{refreshMsg}</div>}

      {showSettings&&<SettingsPage onClose={()=>setShowSettings(false)}
        destWHT={destWHT} saveDestWHT={saveDestWHT}
        githubUrl={githubUrl} onSetGithubUrl={url=>{setGithubUrl(url);localStorage.setItem("dgi-github-url",url);}}
        onExport={handleExport} onImport={handleImport}
        onFetchFund={handleFetchFundamentals} fetchingFund={fetchingFund} fundMsg={fundMsg}
        fileRef={fileRef} companies={companies}/>}
      {showMetodologia&&<Metodologia onClose={()=>setShowMetodologia(false)}/>}
      {detailCo&&(<CompanyDetail co={detailCo} destWHT={destWHT}
        onBack={()=>setDetailCo(null)}
        onEdit={()=>{setEditData(detailCo);setEditingId(detailCo.id);setView("form");setDetailCo(null);}}
        onDelete={()=>{setCompanies(prev=>{const n=prev.filter(x=>x.id!==detailCo.id);localStorage.setItem("dgi-v5",JSON.stringify(n));return n;});setDetailCo(null);}}/>)}
      {!detailCo&&<React.Fragment>
      {view==="form"&&<div style={{maxWidth:640,margin:"0 auto 18px"}}><Form initial={editData||EMPTY} editingId={editingId} onSave={handleSave} onCancel={()=>{setEditData(null);setEditingId(null);setView("list");}} destWHT={destWHT}/></div>}

      {/* TABS */}
      <div style={{maxWidth:640,margin:"0 auto 14px",display:"flex",gap:0,background:"rgba(255,255,255,0.03)",borderRadius:10,padding:3,border:"1px solid rgba(255,255,255,0.06)"}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{...BTN,flex:1,padding:"8px 0",fontSize:11,borderRadius:8,background:tab===t.id?"rgba(99,102,241,0.4)":"transparent",color:tab===t.id?"#fff":"#4a5270"}}>{t.label}</button>)}
      </div>

      <div style={{maxWidth:640,margin:"0 auto"}}>
        {tab==="index"&&(
          <div>
            {/* ── Búsqueda ─────────────────────────────────────────── */}
            <input style={{...INP,marginBottom:8,fontSize:13}} placeholder="🔍 Buscar empresa..." value={search} onChange={e=>setSearch(e.target.value)}/>

            {/* ── Ordenar por ──────────────────────────────────────── */}
            <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:8}}>
              {[{id:"score",icon:"⭐",label:"Nota"},{id:"rentable",icon:"💰",label:"Rentables"},
                {id:"barata",icon:"🎯",label:"Baratas"},{id:"divquality",icon:"💎",label:"Dividendo"}
              ].map(opt=>(
                <button key={opt.id} onClick={()=>setSortBy(opt.id)}
                  style={{...BTN,fontSize:11,padding:"5px 10px",flex:1,
                    background:sortBy===opt.id?"rgba(99,102,241,0.3)":"rgba(255,255,255,0.04)",
                    color:sortBy===opt.id?"#818cf8":"#4a5270",
                    border:"1px solid "+(sortBy===opt.id?"rgba(99,102,241,0.4)":"rgba(255,255,255,0.06)")}}>
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>

            {/* ── Filtros desplegables ─────────────────────────── */}
            {(()=>{
              const activeFilters=[minScore>0&&"≥"+minScore,filterSector&&(SECTORS[filterSector]||SECTORS.general).label,
                filterContinent,filterCapSize,filterMoat&&(filterMoat==="wide"?"🏰 Ancho":filterMoat==="narrow"?"🧱 Estrecho":"Sin foso")
              ].filter(Boolean);
              const clearAll=()=>{setMinScore(0);setFilterSector(null);setFilterContinent(null);setFilterCapSize(null);setFilterMoat(null);};
              const PillRow=({label,color,children})=>(
                <div style={{display:"flex",alignItems:"flex-start",gap:8,paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                  <span style={{fontSize:9,color:"#3a4260",letterSpacing:"0.08em",textTransform:"uppercase",flexShrink:0,paddingTop:4,minWidth:44}}>{label}</span>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{children}</div>
                </div>
              );
              const Pill=({active,color,onClick,children})=>(
                <button onClick={onClick} style={{...BTN,fontSize:10,padding:"3px 9px",
                  background:active?color+"25":"rgba(255,255,255,0.04)",
                  color:active?color:"#4a5270",
                  border:"1px solid "+(active?color+"50":"rgba(255,255,255,0.05)")}}>
                  {children}
                </button>
              );
              return(
                <div style={{marginBottom:8}}>
                  {/* Toggle bar */}
                  <button onClick={()=>setShowFilters(f=>!f)}
                    style={{...BTN,width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",
                      padding:"7px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:11,color:"#6a7090"}}>⚙ Filtros</span>
                      {activeFilters.length>0&&activeFilters.map((f,i)=>(
                        <span key={i} style={{fontSize:10,background:"rgba(99,102,241,0.2)",color:"#818cf8",padding:"1px 6px",borderRadius:10}}>{f}</span>
                      ))}
                    </div>
                    <span style={{fontSize:10,color:"#3a4260"}}>{showFilters?"▲":"▼"}</span>
                  </button>

                  {/* Expandable panel */}
                  {showFilters&&(
                    <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 12px",display:"grid",gap:10}}>

                      <PillRow label="Nota">
                        {[5,6,7,8].map(s=><Pill key={s} active={minScore===s} color="#818cf8" onClick={()=>setMinScore(minScore===s?0:s)}>{"≥"+s}</Pill>)}
                      </PillRow>

                      {availableSectors.length>0&&<PillRow label="Sector">
                        {availableSectors.map(sk=>{const s=SECTORS[sk]||SECTORS.general;return(
                          <Pill key={sk} active={filterSector===sk} color={s.color} onClick={()=>setFilterSector(filterSector===sk?null:sk)}>{s.label}</Pill>
                        );})}
                      </PillRow>}

                      <PillRow label="Zona">
                        {["América","Europa","Asia","Oceanía","África","Otros"].map(cont=>{
                          const cnt=companies.filter(co=>getContinent(co.country)===cont).length;
                          if(!cnt)return null;
                          return <Pill key={cont} active={filterContinent===cont} color="#818cf8" onClick={()=>setFilterContinent(filterContinent===cont?null:cont)}>{cont}</Pill>;
                        })}
                      </PillRow>

                      <PillRow label="Cap">
                        {["Small cap","Mid cap","Large cap","Blue chip"].map(cap=>{
                          const cnt=companies.filter(co=>getCapSize(co)===cap).length;
                          if(!cnt)return null;
                          return <Pill key={cap} active={filterCapSize===cap} color="#fbbf24" onClick={()=>setFilterCapSize(filterCapSize===cap?null:cap)}>{cap}</Pill>;
                        })}
                      </PillRow>

                      <PillRow label="Foso">
                        {[{id:"wide",icon:"🏰",label:"Ancho"},{id:"narrow",icon:"🧱",label:"Estrecho"},{id:"none",icon:"—",label:"Sin foso"}].map(m=>(
                          <Pill key={m.id} active={filterMoat===m.id} color="#a78bfa" onClick={()=>setFilterMoat(filterMoat===m.id?null:m.id)}>{m.icon} {m.label}</Pill>
                        ))}
                      </PillRow>

                      {activeFilters.length>0&&(
                        <button onClick={clearAll} style={{...BTN,fontSize:10,padding:"4px 12px",background:"rgba(248,113,113,0.1)",color:"#f87171",border:"1px solid rgba(248,113,113,0.2)",alignSelf:"flex-start"}}>
                          ✕ Limpiar todos
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Resumen ───────────────────────────────────────────── */}
            <p style={{fontSize:10,color:"#3a4260",marginBottom:6}}>
              {filtered.length===companies.length?companies.length+" empresas":filtered.length+" de "+companies.length}
            </p>
            {companies.length===0?(
              <div style={{textAlign:"center",padding:"60px 20px"}}><p style={{fontSize:36,marginBottom:12}}>📊</p><p style={{color:"#4a5270",fontSize:14}}>Tu índice está vacío.</p><p style={{color:"#2a3045",fontSize:12,marginTop:6}}>Pulsa "+ Añadir" para empezar.</p></div>
            ):(
              <div style={{display:"grid",gap:5}}>
                {sorted.map((co,i)=><CompanyRow key={co.id} co={co} rank={i+1} total={sorted.length} sel={false} onSel={()=>setDetailCo(co)} onEdit={()=>handleEdit(co)} onDel={()=>handleDelete(co.id)} compareList={compareList} onCompare={toggleCompare}/>)}
              </div>
            )}
          </div>
        )}

        {tab==="sectores"&&<GroupedRanking groups={bySector} getLabel={k=>{const s=SECTORS[k]||SECTORS.general;return{name:s.label,flag:"" };}} getColor={k=>(SECTORS[k]||SECTORS.general).color} emptyMsg="Añade empresas para ver el ranking por sector."/>}
        {tab==="paises"&&<GroupedRanking groups={byCountry} getLabel={k=>getCountry(k)} getColor={()=>"#818cf8"} emptyMsg="Añade empresas para ver el ranking geográfico."/>}

        {tab==="comparar"&&(
          <div>
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <p style={{fontSize:10,color:"#4a5270",letterSpacing:"0.12em",textTransform:"uppercase"}}>Selecciona hasta 5 empresas</p>
                {compareList.length>0&&<button onClick={()=>setCompareList([])} style={{border:"none",borderRadius:6,padding:"3px 10px",fontSize:10,cursor:"pointer",background:"rgba(248,113,113,0.1)",color:"#f87171",fontFamily:"'Figtree',sans-serif"}}>✕ Limpiar</button>}
              </div>
              <div style={{display:"grid",gap:4}}>
                {[...companies].sort((a,b)=>b.total-a.total).map(co=>{
                  const sel=compareList.includes(co.id),si=compareList.indexOf(co.id),col=sel?CC[si]:"#3a4260";
                  const sc2=SECTORS[co.sector]||SECTORS.general;
                  return(
                    <button key={co.id} onClick={()=>toggleCompare(co.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:sel?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.02)",border:"1px solid "+(sel?col+"60":"rgba(255,255,255,0.04)"),borderRadius:9,cursor:"pointer",textAlign:"left",width:"100%",fontFamily:"'Figtree',sans-serif"}}>
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
              </div>
            </div>
            {compareCompanies.length>=2&&(
              <div>
                <div style={{height:1,background:"rgba(255,255,255,0.05)",marginBottom:16}}/>
                <MultiRadar companies={compareCompanies}/>
                <div style={{display:"grid",gap:6,marginTop:14}}>
                  {compareCompanies.map((co,i)=>{
                    const col=CC[i];
                    return(
                      <div key={co.id} style={{background:"rgba(255,255,255,0.02)",border:"1px solid "+col+"40",borderRadius:10,padding:"10px 14px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:10,height:10,borderRadius:"50%",background:col}}/><span style={{fontSize:13,fontWeight:700,color:col}}>{co.name}</span></div>
                          <span style={{fontSize:18,fontWeight:800,color:sC(co.total)}}>{co.total.toFixed(1)}</span>
                        </div>
                        {co.dcf?.iv&&<p style={{fontSize:11,color:sC(co.scores?.margin_safety)}}>IV {co.dcf.iv} · MoS {co.dcf.mos>0?"+":""}{co.dcf.mos}%</p>}
                        {co.thesis&&<p style={{fontSize:10,color:"#5a6480",fontStyle:"italic",marginTop:4}}>{co.thesis.substring(0,80)}{co.thesis.length>80?"...":""}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {compareCompanies.length<2&&compareList.length>0&&<p style={{textAlign:"center",color:"#4a5270",fontSize:13,marginTop:20}}>Selecciona al menos 2 empresas.</p>}
          </div>
        )}
      </div>
      <p style={{textAlign:"center",fontSize:10,color:"#1a2030",marginTop:28,maxWidth:640,margin:"28px auto 0"}}>Mi Índice DGI · Exporta regularmente para hacer copias de seguridad</p>
      </React.Fragment>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);


class ErrorBoundary extends React.Component{
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return{err:e};}
  render(){
    if(this.state.err)return React.createElement('div',
      {style:{background:"#1a0000",color:"#f87171",padding:"20px",fontFamily:"monospace",
       fontSize:"13px",whiteSpace:"pre-wrap",position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9999,overflow:"auto"}},
      "ERROR: "+this.state.err.message+"\n\n"+(this.state.err.stack||""));
    return this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(ErrorBoundary,null,React.createElement(App))
);
