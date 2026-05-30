// Salud financiera, insights, foso económico

function FinancialHealth({co}){
  const items=[];
  const add=(score,weight,label,detail,good)=>items.push({score,weight,label,detail,good});
  const sector=co.sector||"general";
  const isBank=sector==="banco";
  const isReit=sector==="reit"||sector==="bdc";
  const isInsurer=sector==="aseguradora";
  const isUtility=sector==="utility";

  // ── Deuda ────────────────────────────────────────────────────────────
  const debtInfo=getSectorDebt(co);
  if(debtInfo){
    const{value:de,thresholds:t}=debtInfo;
    if(de<t[0])add(100,2,"Deuda neta muy baja","Deuda neta "+de.toFixed(1)+"x EBITDA",true);
    else if(de<t[1])add(80,2,"Deuda controlada","Deuda neta "+de.toFixed(1)+"x EBITDA",true);
    else if(de<t[2])add(50,2,"Deuda moderada","Deuda neta "+de.toFixed(1)+"x EBITDA",null);
    else if(de<t[3])add(25,2,"Deuda elevada","Deuda neta "+de.toFixed(1)+"x EBITDA",false);
    else add(5,2,"Deuda muy alta","Deuda neta "+de.toFixed(1)+"x EBITDA",false);
  }

  // ── Banco: ROE + ROA + capital ────────────────────────────────────────
  if(isBank){
    const roe=parseFloat(co.roe||co.roic);
    if(!isNaN(roe)&&roe>0){
      if(roe>15)add(100,3,"ROE excelente","ROE "+roe.toFixed(1)+"% — rentabilidad superior",true);
      else if(roe>12)add(80,3,"Buen ROE","ROE "+roe.toFixed(1)+"%",true);
      else if(roe>8)add(55,3,"ROE moderado","ROE "+roe.toFixed(1)+"%",null);
      else add(20,3,"ROE bajo","ROE "+roe.toFixed(1)+"%",false);
    }
    const roa=parseFloat(co.roa);
    if(!isNaN(roa)&&roa>0){
      if(roa>1.5)add(100,2,"ROA excelente","ROA "+roa.toFixed(2)+"%",true);
      else if(roa>1)add(80,2,"Buen ROA","ROA "+roa.toFixed(2)+"%",true);
      else if(roa>0.5)add(50,2,"ROA ajustado","ROA "+roa.toFixed(2)+"%",null);
      else add(20,2,"ROA bajo","ROA "+roa.toFixed(2)+"%",false);
    }
    // Capital ratio proxy (equity/assets)
    const eqH=co.equity_history_m||{},asH=co.total_assets_history_m||{};
    const yrs=Object.keys(eqH).filter(y=>asH[y]).sort().reverse();
    if(yrs.length>0){
      const capR=eqH[yrs[0]]/asH[yrs[0]]*100;
      if(capR>10)add(100,2,"Ratio de capital sólido","Capital/activos "+capR.toFixed(1)+"%",true);
      else if(capR>7)add(70,2,"Capital adecuado","Capital/activos "+capR.toFixed(1)+"%",null);
      else add(30,2,"Capital ajustado","Capital/activos "+capR.toFixed(1)+"%",false);
    }
  } else {
    // ── Cobertura de intereses (no aplica a bancos) ─────────────────────
    const ic=parseFloat(co.interest_coverage||co.values?.interest_cov);
    if(!isNaN(ic)&&ic>0){
      if(ic>15)add(100,2,"Cobertura de intereses excelente",ic.toFixed(1)+"x",true);
      else if(ic>8)add(80,2,"Buena cobertura de intereses",ic.toFixed(1)+"x",true);
      else if(ic>4)add(55,2,"Cobertura de intereses ajustada",ic.toFixed(1)+"x",null);
      else add(20,2,"Cobertura de intereses baja",ic.toFixed(1)+"x — riesgo de impago",false);
    }
  }

  // ── Payout (métrica adaptada por sector) ─────────────────────────────
  const payoutInfo=getSectorPayout(co);
  if(payoutInfo){
    const{value:pf,label:pLabel}=payoutInfo;
    const isFFO=pLabel.includes("FFO")||pLabel.includes("BPA");
    // REITs/BDCs pay out 90%+ by law — thresholds are more lenient
    const [t1,t2,t3,t4]=isReit?[70,85,95,110]:[40,60,75,90];
    if(pf<t1)add(100,2,pLabel+" muy sostenible",pLabel+" "+pf.toFixed(0)+"%",true);
    else if(pf<t2)add(80,2,pLabel+" sostenible",pLabel+" "+pf.toFixed(0)+"%",true);
    else if(pf<t3)add(50,2,pLabel+" elevado",pLabel+" "+pf.toFixed(0)+"%",null);
    else if(pf<t4)add(20,2,pLabel+" muy alto",pLabel+" "+pf.toFixed(0)+"%",false);
    else add(5,2,pLabel+" insostenible",pLabel+" "+pf.toFixed(0)+"%",false);
  }

  // ── Liquidez (no aplica a bancos/aseguradoras) ────────────────────────
  if(!isBank&&!isInsurer){
    const cr=parseFloat(co.current_ratio);
    if(!isNaN(cr)&&cr>0){
      if(cr>2)add(90,1,"Liquidez sólida","Ratio corriente "+cr.toFixed(1),true);
      else if(cr>1.2)add(65,1,"Liquidez aceptable","Ratio corriente "+cr.toFixed(1),null);
      else if(cr<1)add(20,1,"Liquidez ajustada","Ratio corriente "+cr.toFixed(1),false);
      else add(40,1,"Liquidez justa","Ratio corriente "+cr.toFixed(1),null);
    }
  }

  // ── ROE / ROIC (adaptado) ─────────────────────────────────────────────
  if(!isBank){
    const roic=parseFloat(co.roic||co.values?.roic);
    if(!isNaN(roic)&&roic>0&&roic<200){
      if(roic>20)add(100,2,"ROIC excelente","ROIC "+roic.toFixed(1)+"%",true);
      else if(roic>12)add(75,2,"Buen ROIC","ROIC "+roic.toFixed(1)+"%",true);
      else if(roic>8)add(50,2,"ROIC moderado","ROIC "+roic.toFixed(1)+"%",null);
      else add(20,2,"ROIC bajo","ROIC "+roic.toFixed(1)+"%",false);
    }
  }

  // ── Crecimiento FCF u OCF ─────────────────────────────────────────────
  const fcagr=parseFloat(co.values?.fcf_cagr5||co.fcf_cagr5);
  if(!isNaN(fcagr)){
    const label=isReit||isBank?"CAGR flujo operativo":"CAGR FCF";
    if(fcagr>10)add(100,2,label+" excelente","CAGR "+fcagr.toFixed(1)+"%",true);
    else if(fcagr>5)add(75,2,label+" sólido","CAGR "+fcagr.toFixed(1)+"%",true);
    else if(fcagr>0)add(50,2,label+" estable","CAGR "+fcagr.toFixed(1)+"%",null);
    else add(15,2,label+" negativo","CAGR "+fcagr.toFixed(1)+"%",false);
  }

  // ── Tendencia de márgenes ─────────────────────────────────────────────
  const omh=co.op_margin_history||{};
  const omYears=Object.keys(omh).sort();
  if(omYears.length>=3){
    const recent=omh[omYears[omYears.length-1]];
    const older=omh[omYears[0]];
    const diff=recent-older;
    if(diff>3)add(90,1,"Márgenes en expansión","Margen op. +"+diff.toFixed(1)+"pp",true);
    else if(diff>-2)add(65,1,"Márgenes estables","Margen operativo consistente",null);
    else add(20,1,"Márgenes en compresión","Margen op. "+diff.toFixed(1)+"pp",false);
  }

  if(items.length===0)return null;

  const totalWeight=items.reduce((a,b)=>a+b.weight,0);
  const healthScore=Math.round(items.reduce((a,b)=>a+b.score*b.weight,0)/totalWeight);

  // SVG gauge
  const needleAngle=180+healthScore*1.8; // -90 (red) to +90 (green)
  const rad=needleAngle*Math.PI/180;
  const nx=50+38*Math.cos(rad);
  const ny=52+38*Math.sin(rad);

  const gColor=healthScore>=70?"#34d399":healthScore>=40?"#fbbf24":"#f87171";
  const gLabel=healthScore>=75?"Excelente":healthScore>=60?"Buena":healthScore>=40?"Regular":healthScore>=20?"Débil":"Crítica";

  return(
    <div style={{marginBottom:12,padding:"14px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12}}>
      <p style={{fontSize:10,color:"#4a5270",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:12}}>Salud financiera</p>
      {/* Gauge SVG */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:12}}>
        <svg viewBox="0 0 100 60" style={{width:180,height:108}}>
          {/* Background arcs */}
          <path d="M12,52 A38,38 0 0,1 88,52" fill="none" stroke="rgba(248,113,113,0.25)" strokeWidth="8" strokeLinecap="round"/>
          <path d="M12,52 A38,38 0 0,1 50,14" fill="none" stroke="rgba(251,191,36,0.25)" strokeWidth="8" strokeLinecap="round"/>
          <path d="M50,14 A38,38 0 0,1 88,52" fill="none" stroke="rgba(52,211,153,0.25)" strokeWidth="8" strokeLinecap="round"/>
          {/* Active arc */}
          <path d={"M12,52 A38,38 0 0,1 "+nx.toFixed(1)+","+ny.toFixed(1)} fill="none" stroke={gColor} strokeWidth="8" strokeLinecap="round"/>
          {/* Needle */}
          <line x1="50" y1="52" x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke={gColor} strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="50" cy="52" r="4" fill={gColor}/>
          {/* Labels */}
          <text x="8" y="58" fontSize="7" fill="#f87171" textAnchor="middle">0</text>
          <text x="50" y="11" fontSize="7" fill="#fbbf24" textAnchor="middle">50</text>
          <text x="92" y="58" fontSize="7" fill="#34d399" textAnchor="middle">100</text>
        </svg>
        <div style={{textAlign:"center",marginTop:-8}}>
          <p style={{fontSize:28,fontWeight:900,color:gColor,lineHeight:1}}>{healthScore}</p>
          <p style={{fontSize:12,color:gColor,fontWeight:600}}>{gLabel}</p>
        </div>
      </div>
      {/* Reasons */}
      <div style={{display:"grid",gap:4}}>
        {items.sort((a,b)=>a.score-b.score).map((item,i)=>(
          <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 8px",background:"rgba(255,255,255,0.02)",borderRadius:7,borderLeft:"3px solid "+(item.good===true?"#34d399":item.good===false?"#f87171":"#fbbf24")}}>
            <span style={{fontSize:12,flexShrink:0}}>{item.good===true?"✅":item.good===false?"❌":"⚠️"}</span>
            <div>
              <p style={{fontSize:11,fontWeight:600,color:"#c8d0e0"}}>{item.label}</p>
              <p style={{fontSize:10,color:"#5a6480"}}>{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function generateInsights(co){
  const v=co.values||{},d=co.dcf||{};
  const tips=[];
  const add=(type,text)=>tips.push({type,text});
  const nd=parseFloat(co.net_debt);
  if(!isNaN(nd)&&nd<0)add("green","Tiene más efectivo que deuda en balance");
  const nde=parseFloat(co.net_debt_ebitda||v.debt_ebitda);
  if(!isNaN(nde)){
    if(nde<1)add("green","Deuda neta muy controlada ("+nde.toFixed(1)+"x EBITDA)");
    else if(nde<2)add("yellow","Deuda moderada ("+nde.toFixed(1)+"x EBITDA)");
    else if(nde>3.5)add("red","Deuda elevada ("+nde.toFixed(1)+"x EBITDA)");
  }
  const ic=parseFloat(co.interest_coverage||v.interest_cov);
  if(!isNaN(ic)&&ic>0){
    if(ic>15)add("green","Cobertura de intereses excelente ("+ic.toFixed(1)+"x)");
    else if(ic>5)add("green","Buena cobertura de intereses ("+ic.toFixed(1)+"x)");
    else if(ic<3)add("red","Cobertura de intereses baja ("+ic.toFixed(1)+"x)");
  }
  const cr=parseFloat(co.current_ratio);
  if(!isNaN(cr)){
    if(cr>2)add("green","Liquidez holgada (ratio corriente "+cr.toFixed(1)+")");
    else if(cr<1)add("red","Liquidez ajustada (ratio corriente "+cr.toFixed(1)+")");
  }
  const streak=parseInt(co.div_streak||v.div_years)||0;
  if(streak>=35)add("green","Más de 35 años consecutivos subiendo el dividendo 🥇");
  else if(streak>=25)add("green","Aristócrata del dividendo: "+streak+" años consecutivos 🥈");
  else if(streak>=10)add("green",streak+" años consecutivos de crecimiento del dividendo 🥉");
  else if(streak>0)add("yellow",streak+" años subiendo el dividendo — historial en construcción");
  const cagr=parseFloat(co.div_cagr5||v.div_cagr5);
  if(!isNaN(cagr)&&cagr>0){
    if(cagr>=12)add("green","Dividendo creciendo a doble dígito (CAGR "+cagr+"%)");
    else if(cagr>=7)add("green","Buen crecimiento del dividendo (CAGR "+cagr+"%)");
    else if(cagr<2)add("yellow","Crecimiento del dividendo lento (CAGR "+cagr+"%)");
  }
  const pfcf=parseFloat(co.payout_fcf||v.payout_fcf);
  if(!isNaN(pfcf)&&pfcf>0){
    if(pfcf<40)add("green","Payout sobre FCF muy sostenible ("+pfcf.toFixed(0)+"%)");
    else if(pfcf<65)add("green","Payout sobre FCF razonable ("+pfcf.toFixed(0)+"%)");
    else if(pfcf>90)add("red","Payout sobre FCF elevado — dividendo en riesgo ("+pfcf.toFixed(0)+"%)");
    else if(pfcf>75)add("yellow","Payout sobre FCF alto ("+pfcf.toFixed(0)+"%)");
  }
  const peps=parseFloat(co.payout_eps);
  if(!isNaN(peps)&&peps>100)add("red","El dividendo supera el beneficio por acción (payout EPS "+peps.toFixed(0)+"%)");
  const roic=parseFloat(co.roic||v.roic);
  if(!isNaN(roic)&&roic>0){
    if(roic>40)add("yellow","ROIC muy elevado ("+roic.toFixed(1)+"%) — puede reflejar intangibles no capitalizados o estructura de capital atípica. Comparar con peers del sector.");
    else if(roic>20)add("green","ROIC excelente ("+roic.toFixed(1)+"%) — negocio muy rentable");
    else if(roic>12)add("green","Buen ROIC ("+roic.toFixed(1)+"%)");
    else if(roic<6)add("yellow","ROIC por debajo de la media ("+roic.toFixed(1)+"%)");
  }
  const gm=parseFloat(co.gross_margin);
  if(!isNaN(gm)){
    if(gm>60)add("green","Márgenes brutos elevados ("+gm.toFixed(0)+"%) — ventaja competitiva");
    else if(gm<20)add("yellow","Márgenes brutos ajustados ("+gm.toFixed(0)+"%)");
  }
  const opMargin=parseFloat(co.operating_margin);
  if(!isNaN(opMargin)){
    if(opMargin>25)add("green","Margen operativo sólido ("+opMargin.toFixed(0)+"%)");
    else if(opMargin<8)add("yellow","Margen operativo estrecho ("+opMargin.toFixed(0)+"%)");
  }
  const nm=parseFloat(co.net_margin);
  if(!isNaN(nm)&&nm<5&&nm>0)add("yellow","Margen neto ajustado ("+nm.toFixed(1)+"%)");
  const rcagr=parseFloat(co.revenue_cagr5);
  if(!isNaN(rcagr)){
    if(rcagr>10)add("green","Ingresos creciendo con fuerza (CAGR "+rcagr.toFixed(1)+"%)");
    else if(rcagr>5)add("green","Crecimiento de ingresos estable (CAGR "+rcagr.toFixed(1)+"%)");
    else if(rcagr<0)add("red","Ingresos en declive (CAGR "+rcagr.toFixed(1)+"%)");
  }
  const fcagr=parseFloat(co.fcf_cagr5||v.fcf_cagr5);
  if(!isNaN(fcagr)&&fcagr>10)add("green","FCF creciendo con fuerza (CAGR "+fcagr.toFixed(1)+"%)");
  const mos=parseFloat(d.mos);
  if(!isNaN(mos)){
    if(mos>30)add("green","Gran margen de seguridad vs valor intrínseco (+"+mos.toFixed(0)+"%)");
    else if(mos>10)add("green","Cotiza por debajo de valor intrínseco (+"+mos.toFixed(0)+"%)");
    else if(mos<-20)add("red","Cotiza significativamente por encima del valor intrínseco ("+mos.toFixed(0)+"%)");
  }
  const pe=parseFloat(co.pe_trailing);
  if(!isNaN(pe)&&pe>0){
    if(pe<13)add("green","PER atractivo ("+pe.toFixed(1)+"x)");
    else if(pe>35)add("yellow","PER elevado ("+pe.toFixed(1)+"x)");
  }
  const eveb=parseFloat(co.ev_ebitda);
  if(!isNaN(eveb)&&eveb>0){
    if(eveb<8)add("green","EV/EBITDA razonable ("+eveb.toFixed(1)+"x)");
    else if(eveb>20)add("yellow","EV/EBITDA elevado ("+eveb.toFixed(1)+"x)");
  }
  const price=co.liveData?.price||parseFloat(co.current_price)||0;
  const high52=parseFloat(co.week52_high);
  const low52=parseFloat(co.week52_low);
  if(price>0&&!isNaN(high52)&&high52>0){
    const distHigh=(high52-price)/high52*100;
    if(distHigh>20)add("green","Cotiza un "+distHigh.toFixed(0)+"% por debajo de máximos anuales");
    else if(distHigh<5)add("yellow","Cerca de máximos anuales ("+distHigh.toFixed(0)+"% por debajo)");
  }
  if(price>0&&!isNaN(low52)&&low52>0){
    const distLow=(price-low52)/low52*100;
    if(distLow<10)add("yellow","Cotiza cerca de mínimos anuales (+"+distLow.toFixed(0)+"%)");
  }
  const roicVal=parseFloat(co.roic||co.values?.roic)||0;
  const beta=parseFloat(co.beta);
  if(!isNaN(beta)){
    if(beta<0.6)add("green","Baja volatilidad — beta "+beta.toFixed(2)+" (muy defensiva)");
    else if(beta<0.9)add("green","Volatilidad moderada — beta "+beta.toFixed(2));
    else if(beta>1.4)add("yellow","Alta volatilidad — beta "+beta.toFixed(2));
  }
  return tips;
}

