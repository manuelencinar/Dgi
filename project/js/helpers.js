// Funciones de cálculo y utilidades


const { useState, useEffect, useMemo, useRef } = React;
const SECTORS = {
  general: { label:"General", color:"#818cf8", desc:"Consumo, Salud, Industrial, Tecnología", metrics:[

  { id:"yield_pct", label:"Yield actual", short:"Yield", unit:"%", placeholder:"3.5", autoFetch:true,
    hint:"Rentabilidad por dividendo actual. Óptimo DGI: 3-6%. Por encima del 10% puede indicar riesgo de recorte.",
    skipRanges:true,
    score: v => { const n=parseFloat(v); if(isNaN(n)) return null;
      if(n>=4&&n<5) return 10; if(n>=5&&n<6) return 9; if(n>=3&&n<4) return 8;
      if(n>=6&&n<8) return 7;  if(n>=2&&n<3) return 6; if(n>=8&&n<10) return 5;
      if(n>=1&&n<2) return 4;  if(n>=10&&n<12) return 3; if(n>=0.5&&n<1) return 2; return 1; },
    ranges:[] },
    { id:"div_years",   label:"Años div. consecutivos", short:"Historial", unit:"años", placeholder:"23", hint:"Años consecutivos subiendo el dividendo",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>=36)return 10;if(n>=26)return 9;if(n>=21)return 8;if(n>=16)return 7;if(n>=12)return 6;if(n>=9)return 5;if(n>=6)return 4;if(n>=4)return 3;if(n>=2)return 2;return 1;},
      ranges:[">36","26-35","21-25","16-20","12-15","9-11","6-8","4-5","2-3","<2"]},
    { id:"div_cagr5",   label:"CAGR dividendo 5a", short:"Crec.Div.", unit:"%", placeholder:"7.5", hint:"Tasa de crecimiento anual del dividendo a 5 años",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>17)return 10;if(n>13)return 9;if(n>10)return 8;if(n>8)return 7;if(n>6)return 6;if(n>4)return 5;if(n>3)return 4;if(n>2)return 3;if(n>0)return 2;return 1;},
      ranges:[">17%","13-17","10-13","8-10","6-8","4-6","3-4","2-3","0-2","<0"]},
    { id:"payout_fcf",  label:"Payout sobre FCF", short:"Payout", unit:"%", placeholder:"45", hint:"Dividendo / Free Cash Flow × 100",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<20)return 10;if(n<30)return 9;if(n<40)return 8;if(n<50)return 7;if(n<60)return 6;if(n<70)return 5;if(n<80)return 4;if(n<90)return 3;if(n<100)return 2;return 1;},
      ranges:["<20%","20-30","30-40","40-50","50-60","60-70","70-80","80-90","90-100",">100"]},
    { id:"fcf_cagr5",   label:"CAGR FCF/acc. 5a", short:"Crec.FCF", unit:"%", placeholder:"8", hint:"Crecimiento anual del Free Cash Flow por acción",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>17)return 10;if(n>13)return 9;if(n>10)return 8;if(n>8)return 7;if(n>6)return 6;if(n>4)return 5;if(n>2)return 4;if(n>0)return 3;if(n>-5)return 2;return 1;},
      ranges:[">17%","13-17","10-13","8-10","6-8","4-6","2-4","0-2","-5-0","<-5"]},
    { id:"debt_ebitda", label:"Deuda neta/EBITDA", short:"Deuda", unit:"x", placeholder:"1.5", hint:"Deuda neta / EBITDA",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<0.5)return 10;if(n<1)return 9;if(n<2)return 8;if(n<2.5)return 7;if(n<3)return 6;if(n<3.5)return 5;if(n<4)return 4;if(n<5)return 3;if(n<6)return 2;return 1;},
      ranges:["<0.5x","0.5-1","1-2","2-2.5","2.5-3","3-3.5","3.5-4","4-5","5-6",">6x"]},
    { id:"interest_cov",label:"Cobertura intereses", short:"Cobertura", unit:"x", placeholder:"12", hint:"EBIT / Gastos financieros",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>25)return 10;if(n>15)return 9;if(n>10)return 8;if(n>7)return 7;if(n>5)return 6;if(n>4)return 5;if(n>3)return 4;if(n>2)return 3;if(n>1)return 2;return 1;},
      ranges:[">25x","15-25","10-15","7-10","5-7","4-5","3-4","2-3","1-2","<1x"]},
    { id:"roic",        label:"ROIC", short:"ROIC", unit:"%", placeholder:"18", hint:"Return on Invested Capital",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>35)return 10;if(n>25)return 9;if(n>20)return 8;if(n>16)return 7;if(n>13)return 6;if(n>11)return 5;if(n>9)return 4;if(n>7)return 3;if(n>5)return 2;return 1;},
      ranges:[">35%","25-35","20-25","16-20","13-16","11-13","9-11","7-9","5-7","<5"]},
    { id:"p_fcf",       label:"Precio / FCF", short:"P/FCF", unit:"x", placeholder:"22", hint:"Capitalización bursátil / Free Cash Flow",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<10)return 10;if(n<12)return 9;if(n<15)return 8;if(n<20)return 7;if(n<25)return 6;if(n<30)return 5;if(n<35)return 4;if(n<40)return 3;if(n<50)return 2;return 1;},
      ranges:["<10x","10-12","12-15","15-20","20-25","25-30","30-35","35-40","40-50",">50x"]},
  ]},
  aseguradora: { label:"Aseguradora", color:"#f59e0b", desc:"Munich Re, Hannover Re, Allianz...", metrics:[

  { id:"yield_pct", label:"Yield actual", short:"Yield", unit:"%", placeholder:"3.5", autoFetch:true,
    hint:"Rentabilidad por dividendo actual. Óptimo DGI: 3-6%. Por encima del 10% puede indicar riesgo de recorte.",
    skipRanges:true,
    score: v => { const n=parseFloat(v); if(isNaN(n)) return null;
      if(n>=4&&n<5) return 10; if(n>=5&&n<6) return 9; if(n>=3&&n<4) return 8;
      if(n>=6&&n<8) return 7;  if(n>=2&&n<3) return 6; if(n>=8&&n<10) return 5;
      if(n>=1&&n<2) return 4;  if(n>=10&&n<12) return 3; if(n>=0.5&&n<1) return 2; return 1; },
    ranges:[] },
    { id:"div_years",   label:"Años div. consecutivos", short:"Historial", unit:"años", placeholder:"20", hint:"Años consecutivos subiendo el dividendo",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>=36)return 10;if(n>=26)return 9;if(n>=21)return 8;if(n>=16)return 7;if(n>=12)return 6;if(n>=9)return 5;if(n>=6)return 4;if(n>=4)return 3;if(n>=2)return 2;return 1;},
      ranges:[">36","26-35","21-25","16-20","12-15","9-11","6-8","4-5","2-3","<2"]},
    { id:"div_cagr5",   label:"CAGR dividendo 5a", short:"Crec.Div.", unit:"%", placeholder:"7", hint:"Tasa de crecimiento anual del dividendo a 5 años",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>17)return 10;if(n>13)return 9;if(n>10)return 8;if(n>8)return 7;if(n>6)return 6;if(n>4)return 5;if(n>3)return 4;if(n>2)return 3;if(n>0)return 2;return 1;},
      ranges:[">17%","13-17","10-13","8-10","6-8","4-6","3-4","2-3","0-2","<0"]},
    { id:"payout_earn", label:"Payout s/beneficio", short:"Payout", unit:"%", placeholder:"40", hint:"Dividendo / Beneficio neto × 100",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<25)return 10;if(n<35)return 9;if(n<40)return 8;if(n<50)return 7;if(n<60)return 6;if(n<70)return 5;if(n<80)return 4;if(n<90)return 3;if(n<100)return 2;return 1;},
      ranges:["<25%","25-35","35-40","40-50","50-60","60-70","70-80","80-90","90-100",">100"]},
    { id:"combined",    label:"Combined ratio", short:"Combined", unit:"%", placeholder:"94", hint:"Siniestros+gastos/primas. Por debajo de 100% = negocio rentable",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<88)return 10;if(n<91)return 9;if(n<94)return 8;if(n<97)return 7;if(n<100)return 6;if(n<103)return 5;if(n<106)return 4;if(n<110)return 3;if(n<115)return 2;return 1;},
      ranges:["<88%","88-91","91-94","94-97","97-100","100-103","103-106","106-110","110-115",">115%"]},
    { id:"solvency2",   label:"Solvency II ratio", short:"Solvency", unit:"%", placeholder:"220", hint:"Capital disponible / capital requerido. Mínimo regulatorio: 100%",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>250)return 10;if(n>220)return 9;if(n>190)return 8;if(n>170)return 7;if(n>150)return 6;if(n>130)return 5;if(n>115)return 4;if(n>105)return 3;if(n>100)return 2;return 1;},
      ranges:[">250%","220-250","190-220","170-190","150-170","130-150","115-130","105-115","100-105","<100%"]},
    { id:"roe",         label:"ROE", short:"ROE", unit:"%", placeholder:"15", hint:"Return on Equity",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>20)return 10;if(n>17)return 9;if(n>14)return 8;if(n>12)return 7;if(n>10)return 6;if(n>8)return 5;if(n>6)return 4;if(n>4)return 3;if(n>2)return 2;return 1;},
      ranges:[">20%","17-20","14-17","12-14","10-12","8-10","6-8","4-6","2-4","<2%"]},
    { id:"eps_cagr5",   label:"CAGR BPA 5 años", short:"Crec.BPA", unit:"%", placeholder:"8", hint:"Crecimiento anual del beneficio por acción a 5 años",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>17)return 10;if(n>13)return 9;if(n>10)return 8;if(n>8)return 7;if(n>6)return 6;if(n>4)return 5;if(n>2)return 4;if(n>0)return 3;if(n>-5)return 2;return 1;},
      ranges:[">17%","13-17","10-13","8-10","6-8","4-6","2-4","0-2","-5-0","<-5"]},
    { id:"p_book",      label:"Precio / Book", short:"P/Book", unit:"x", placeholder:"1.5", hint:"Precio de mercado / Valor en libros por acción",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<0.8)return 10;if(n<1.0)return 9;if(n<1.2)return 8;if(n<1.5)return 7;if(n<1.8)return 6;if(n<2.2)return 5;if(n<2.8)return 4;if(n<3.5)return 3;if(n<4.5)return 2;return 1;},
      ranges:["<0.8x","0.8-1","1-1.2","1.2-1.5","1.5-1.8","1.8-2.2","2.2-2.8","2.8-3.5","3.5-4.5",">4.5x"]},
  ]},
  banco: { label:"Banco", color:"#60a5fa", desc:"JPMorgan, BNP, BBVA, Santander...", metrics:[

  { id:"yield_pct", label:"Yield actual", short:"Yield", unit:"%", placeholder:"3.5", autoFetch:true,
    hint:"Rentabilidad por dividendo actual. Óptimo DGI: 3-6%. Por encima del 10% puede indicar riesgo de recorte.",
    skipRanges:true,
    score: v => { const n=parseFloat(v); if(isNaN(n)) return null;
      if(n>=4&&n<5) return 10; if(n>=5&&n<6) return 9; if(n>=3&&n<4) return 8;
      if(n>=6&&n<8) return 7;  if(n>=2&&n<3) return 6; if(n>=8&&n<10) return 5;
      if(n>=1&&n<2) return 4;  if(n>=10&&n<12) return 3; if(n>=0.5&&n<1) return 2; return 1; },
    ranges:[] },
    { id:"div_years",   label:"Años div. consecutivos", short:"Historial", unit:"años", placeholder:"15", hint:"Años consecutivos subiendo el dividendo",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>=36)return 10;if(n>=26)return 9;if(n>=21)return 8;if(n>=16)return 7;if(n>=12)return 6;if(n>=9)return 5;if(n>=6)return 4;if(n>=4)return 3;if(n>=2)return 2;return 1;},
      ranges:[">36","26-35","21-25","16-20","12-15","9-11","6-8","4-5","2-3","<2"]},
    { id:"div_cagr5",   label:"CAGR dividendo 5a", short:"Crec.Div.", unit:"%", placeholder:"6", hint:"Tasa de crecimiento anual del dividendo a 5 años",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>17)return 10;if(n>13)return 9;if(n>10)return 8;if(n>8)return 7;if(n>6)return 6;if(n>4)return 5;if(n>3)return 4;if(n>2)return 3;if(n>0)return 2;return 1;},
      ranges:[">17%","13-17","10-13","8-10","6-8","4-6","3-4","2-3","0-2","<0"]},
    { id:"payout_earn", label:"Payout s/beneficio", short:"Payout", unit:"%", placeholder:"45", hint:"Dividendo / Beneficio neto × 100",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<25)return 10;if(n<35)return 9;if(n<40)return 8;if(n<50)return 7;if(n<60)return 6;if(n<70)return 5;if(n<80)return 4;if(n<90)return 3;if(n<100)return 2;return 1;},
      ranges:["<25%","25-35","35-40","40-50","50-60","60-70","70-80","80-90","90-100",">100"]},
    { id:"cet1",        label:"CET1 ratio", short:"CET1", unit:"%", placeholder:"13", hint:"Capital de máxima calidad / activos ponderados por riesgo. Mínimo ~8%",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>18)return 10;if(n>16)return 9;if(n>14)return 8;if(n>13)return 7;if(n>12)return 6;if(n>11)return 5;if(n>10)return 4;if(n>9)return 3;if(n>8)return 2;return 1;},
      ranges:[">18%","16-18","14-16","13-14","12-13","11-12","10-11","9-10","8-9","<8%"]},
    { id:"roe",         label:"ROE", short:"ROE", unit:"%", placeholder:"12", hint:"Return on Equity",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>18)return 10;if(n>15)return 9;if(n>13)return 8;if(n>11)return 7;if(n>9)return 6;if(n>7)return 5;if(n>5)return 4;if(n>3)return 3;if(n>1)return 2;return 1;},
      ranges:[">18%","15-18","13-15","11-13","9-11","7-9","5-7","3-5","1-3","<1%"]},
    { id:"efficiency",  label:"Ratio de eficiencia", short:"Eficiencia", unit:"%", placeholder:"55", hint:"Costes / ingresos. Menor es mejor. Por debajo del 50% es excelente",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<40)return 10;if(n<45)return 9;if(n<50)return 8;if(n<55)return 7;if(n<60)return 6;if(n<65)return 5;if(n<70)return 4;if(n<75)return 3;if(n<80)return 2;return 1;},
      ranges:["<40%","40-45","45-50","50-55","55-60","60-65","65-70","70-75","75-80",">80%"]},
    { id:"npl",         label:"Ratio de morosidad", short:"Morosidad", unit:"%", placeholder:"2", hint:"Préstamos en mora / total préstamos. Menor es mejor",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<0.5)return 10;if(n<1)return 9;if(n<1.5)return 8;if(n<2)return 7;if(n<3)return 6;if(n<4)return 5;if(n<5)return 4;if(n<7)return 3;if(n<10)return 2;return 1;},
      ranges:["<0.5%","0.5-1","1-1.5","1.5-2","2-3","3-4","4-5","5-7","7-10",">10%"]},
    { id:"p_book",      label:"Precio / Book", short:"P/Book", unit:"x", placeholder:"1.0", hint:"Precio / Valor en libros. La banca suele cotizar cerca de 1x",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<0.6)return 10;if(n<0.8)return 9;if(n<1.0)return 8;if(n<1.2)return 7;if(n<1.5)return 6;if(n<1.8)return 5;if(n<2.0)return 4;if(n<2.5)return 3;if(n<3.0)return 2;return 1;},
      ranges:["<0.6x","0.6-0.8","0.8-1.0","1.0-1.2","1.2-1.5","1.5-1.8","1.8-2.0","2.0-2.5","2.5-3.0",">3.0x"]},
  ]},
  reit: { label:"REIT", color:"#34d399", desc:"Realty Income, VICI, Agree Realty...", metrics:[

  { id:"yield_pct", label:"Yield actual", short:"Yield", unit:"%", placeholder:"3.5", autoFetch:true,
    hint:"Rentabilidad por dividendo actual. Óptimo DGI: 3-6%. Por encima del 10% puede indicar riesgo de recorte.",
    skipRanges:true,
    score: v => { const n=parseFloat(v); if(isNaN(n)) return null;
      if(n>=4&&n<5) return 10; if(n>=5&&n<6) return 9; if(n>=3&&n<4) return 8;
      if(n>=6&&n<8) return 7;  if(n>=2&&n<3) return 6; if(n>=8&&n<10) return 5;
      if(n>=1&&n<2) return 4;  if(n>=10&&n<12) return 3; if(n>=0.5&&n<1) return 2; return 1; },
    ranges:[] },
    { id:"div_years",   label:"Años div. consecutivos", short:"Historial", unit:"años", placeholder:"20", hint:"Años consecutivos subiendo el dividendo",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>=36)return 10;if(n>=26)return 9;if(n>=21)return 8;if(n>=16)return 7;if(n>=12)return 6;if(n>=9)return 5;if(n>=6)return 4;if(n>=4)return 3;if(n>=2)return 2;return 1;},
      ranges:[">36","26-35","21-25","16-20","12-15","9-11","6-8","4-5","2-3","<2"]},
    { id:"div_cagr5",   label:"CAGR dividendo 5a", short:"Crec.Div.", unit:"%", placeholder:"4", hint:"Tasa de crecimiento anual del dividendo a 5 años",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>17)return 10;if(n>13)return 9;if(n>10)return 8;if(n>8)return 7;if(n>6)return 6;if(n>4)return 5;if(n>3)return 4;if(n>2)return 3;if(n>0)return 2;return 1;},
      ranges:[">17%","13-17","10-13","8-10","6-8","4-6","3-4","2-3","0-2","<0"]},
    { id:"payout_affo", label:"Payout sobre AFFO", short:"Payout", unit:"%", placeholder:"75", hint:"Dividendo / AFFO × 100. Los REITs distribuyen la mayor parte; umbral más alto que en general",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<70)return 10;if(n<75)return 9;if(n<80)return 8;if(n<83)return 7;if(n<86)return 6;if(n<89)return 5;if(n<92)return 4;if(n<95)return 3;if(n<100)return 2;return 1;},
      ranges:["<70%","70-75","75-80","80-83","83-86","86-89","89-92","92-95","95-100",">100%"]},
    { id:"affo_cagr5",  label:"CAGR AFFO/acc. 5a", short:"Crec.AFFO", unit:"%", placeholder:"5", hint:"Crecimiento anual del AFFO por acción a 5 años",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>17)return 10;if(n>13)return 9;if(n>10)return 8;if(n>8)return 7;if(n>6)return 6;if(n>4)return 5;if(n>2)return 4;if(n>0)return 3;if(n>-5)return 2;return 1;},
      ranges:[">17%","13-17","10-13","8-10","6-8","4-6","2-4","0-2","-5-0","<-5"]},
    { id:"debt_ebitda", label:"Deuda neta/EBITDA", short:"Deuda", unit:"x", placeholder:"5.5", hint:"Los REITs tienen más deuda estructuralmente. Umbrales ajustados",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<3)return 10;if(n<4)return 9;if(n<5)return 8;if(n<6)return 7;if(n<7)return 6;if(n<8)return 5;if(n<9)return 4;if(n<10)return 3;if(n<12)return 2;return 1;},
      ranges:["<3x","3-4","4-5","5-6","6-7","7-8","8-9","9-10","10-12",">12x"]},
    { id:"ltv",         label:"Loan-to-Value", short:"LTV", unit:"%", placeholder:"35", hint:"Deuda total / valor de los activos inmobiliarios",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<25)return 10;if(n<30)return 9;if(n<35)return 8;if(n<40)return 7;if(n<45)return 6;if(n<50)return 5;if(n<55)return 4;if(n<60)return 3;if(n<65)return 2;return 1;},
      ranges:["<25%","25-30","30-35","35-40","40-45","45-50","50-55","55-60","60-65",">65%"]},
    { id:"interest_cov",label:"Cobertura intereses", short:"Cobertura", unit:"x", placeholder:"4", hint:"EBIT / Gastos financieros",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>25)return 10;if(n>15)return 9;if(n>10)return 8;if(n>7)return 7;if(n>5)return 6;if(n>4)return 5;if(n>3)return 4;if(n>2)return 3;if(n>1)return 2;return 1;},
      ranges:[">25x","15-25","10-15","7-10","5-7","4-5","3-4","2-3","1-2","<1x"]},
    { id:"p_affo",      label:"Precio / AFFO", short:"P/AFFO", unit:"x", placeholder:"16", hint:"Precio de mercado / AFFO por acción",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<10)return 10;if(n<12)return 9;if(n<15)return 8;if(n<18)return 7;if(n<20)return 6;if(n<22)return 5;if(n<25)return 4;if(n<28)return 3;if(n<35)return 2;return 1;},
      ranges:["<10x","10-12","12-15","15-18","18-20","20-22","22-25","25-28","28-35",">35x"]},
  ]},
  bdc: { label:"BDC", color:"#f472b6", desc:"MAIN, Ares Capital, Hercules...", metrics:[

  { id:"yield_pct", label:"Yield actual", short:"Yield", unit:"%", placeholder:"3.5", autoFetch:true,
    hint:"Rentabilidad por dividendo actual. Óptimo DGI: 3-6%. Por encima del 10% puede indicar riesgo de recorte.",
    skipRanges:true,
    score: v => { const n=parseFloat(v); if(isNaN(n)) return null;
      if(n>=4&&n<5) return 10; if(n>=5&&n<6) return 9; if(n>=3&&n<4) return 8;
      if(n>=6&&n<8) return 7;  if(n>=2&&n<3) return 6; if(n>=8&&n<10) return 5;
      if(n>=1&&n<2) return 4;  if(n>=10&&n<12) return 3; if(n>=0.5&&n<1) return 2; return 1; },
    ranges:[] },
    { id:"div_years",   label:"Años div. consecutivos", short:"Historial", unit:"años", placeholder:"10", hint:"Años consecutivos manteniendo o subiendo el dividendo",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>=36)return 10;if(n>=26)return 9;if(n>=21)return 8;if(n>=16)return 7;if(n>=12)return 6;if(n>=9)return 5;if(n>=6)return 4;if(n>=4)return 3;if(n>=2)return 2;return 1;},
      ranges:[">36","26-35","21-25","16-20","12-15","9-11","6-8","4-5","2-3","<2"]},
    { id:"div_cagr5",   label:"CAGR dividendo 5a", short:"Crec.Div.", unit:"%", placeholder:"5", hint:"Tasa de crecimiento anual del dividendo a 5 años",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>17)return 10;if(n>13)return 9;if(n>10)return 8;if(n>8)return 7;if(n>6)return 6;if(n>4)return 5;if(n>3)return 4;if(n>2)return 3;if(n>0)return 2;return 1;},
      ranges:[">17%","13-17","10-13","8-10","6-8","4-6","3-4","2-3","0-2","<0"]},
    { id:"nii_cover",   label:"Cobertura NII", short:"NII/Div.", unit:"x", placeholder:"1.15", hint:"Net Investment Income / Dividendo. Por encima de 1x el dividendo está cubierto",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>1.4)return 10;if(n>1.3)return 9;if(n>1.2)return 8;if(n>1.15)return 7;if(n>1.1)return 6;if(n>1.05)return 5;if(n>1.0)return 4;if(n>0.95)return 3;if(n>0.9)return 2;return 1;},
      ranges:[">1.4x","1.3-1.4","1.2-1.3","1.15-1.2","1.1-1.15","1.05-1.1","1.0-1.05","0.95-1.0","0.9-0.95","<0.9x"]},
    { id:"nii_cagr5",   label:"CAGR NII/acc. 5a", short:"Crec.NII", unit:"%", placeholder:"6", hint:"Crecimiento anual del Net Investment Income por acción",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>17)return 10;if(n>13)return 9;if(n>10)return 8;if(n>8)return 7;if(n>6)return 6;if(n>4)return 5;if(n>2)return 4;if(n>0)return 3;if(n>-5)return 2;return 1;},
      ranges:[">17%","13-17","10-13","8-10","6-8","4-6","2-4","0-2","-5-0","<-5"]},
    { id:"leverage",    label:"Apalancamiento D/E", short:"D/E", unit:"x", placeholder:"1.1", hint:"Deuda / Patrimonio neto. El límite regulatorio en EE.UU. es 2x",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<0.5)return 10;if(n<0.7)return 9;if(n<0.9)return 8;if(n<1.1)return 7;if(n<1.3)return 6;if(n<1.5)return 5;if(n<1.7)return 4;if(n<1.9)return 3;if(n<2.1)return 2;return 1;},
      ranges:["<0.5x","0.5-0.7","0.7-0.9","0.9-1.1","1.1-1.3","1.3-1.5","1.5-1.7","1.7-1.9","1.9-2.1",">2.1x"]},
    { id:"nonaccrual",  label:"Non-accruals", short:"No-acru.", unit:"%", placeholder:"1.5", hint:"Préstamos en non-accrual como % de la cartera. Menor es mejor",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<0.5)return 10;if(n<1)return 9;if(n<1.5)return 8;if(n<2)return 7;if(n<3)return 6;if(n<4)return 5;if(n<5)return 4;if(n<7)return 3;if(n<10)return 2;return 1;},
      ranges:["<0.5%","0.5-1","1-1.5","1.5-2","2-3","3-4","4-5","5-7","7-10",">10%"]},
    { id:"p_nav",       label:"Precio / NAV", short:"P/NAV", unit:"x", placeholder:"1.05", hint:"Precio / Valor Neto del Activo. Cerca de 1x es razonable",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n<1.0)return 10;if(n<1.05)return 9;if(n<1.1)return 8;if(n<1.15)return 7;if(n<1.2)return 6;if(n<1.3)return 5;if(n<1.4)return 4;if(n<1.5)return 3;if(n<1.7)return 2;return 1;},
      ranges:["<1.0x","1.0-1.05","1.05-1.1","1.1-1.15","1.15-1.2","1.2-1.3","1.3-1.4","1.4-1.5","1.5-1.7",">1.7x"]},
    { id:"roe_nav",     label:"ROE sobre NAV", short:"ROE", unit:"%", placeholder:"12", hint:"Rentabilidad sobre el patrimonio neto (NAV)",
      score:v=>{const n=parseFloat(v);if(isNaN(n))return null;if(n>18)return 10;if(n>15)return 9;if(n>13)return 8;if(n>11)return 7;if(n>9)return 6;if(n>7)return 5;if(n>5)return 4;if(n>3)return 3;if(n>1)return 2;return 1;},
      ranges:[">18%","15-18","13-15","11-13","9-11","7-9","5-7","3-5","1-3","<1%"]},
  ]},
};

const COUNTRIES = [
  {code:"US",flag:"🇺🇸",name:"EE.UU."},
  {code:"ES",flag:"🇪🇸",name:"España"},
  {code:"FR",flag:"🇫🇷",name:"Francia"},
  {code:"DE",flag:"🇩🇪",name:"Alemania"},
  {code:"GB",flag:"🇬🇧",name:"Reino Unido"},
  {code:"NL",flag:"🇳🇱",name:"Países Bajos"},
  {code:"DK",flag:"🇩🇰",name:"Dinamarca"},
  {code:"SE",flag:"🇸🇪",name:"Suecia"},
  {code:"CH",flag:"🇨🇭",name:"Suiza"},
  {code:"IE",flag:"🇮🇪",name:"Irlanda"},
  {code:"IT",flag:"🇮🇹",name:"Italia"},
  {code:"JP",flag:"🇯🇵",name:"Japón"},
  {code:"AU",flag:"🇦🇺",name:"Australia"},
  {code:"CA",flag:"🇨🇦",name:"Canadá"},
  {code:"OTHER",flag:"🌍",name:"Otro"},
];
// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const ML=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const CC=["#34d399","#60a5fa","#f59e0b","#a78bfa","#f472b6"];

// Default withholding rates by origin country
const WHT_DEFAULTS={"US":15,"DE":15,"FR":12.8,"GB":0,"ES":19,"CH":35,"NL":15,"BE":30,
  "AU":30,"CA":25,"JP":20,"DK":27,"SE":30,"NO":25,"FI":30,"IE":25,"IT":26,
  "PT":25,"AT":27.5,"HK":0,"SG":0,"CN":10,"BR":15,"OTHER":0};

const DCF_CFG={
  general:{lbl:"FCF/acción",cid:"fcf_cagr5"},aseguradora:{lbl:"BPA norm.",cid:"eps_cagr5"},
  banco:{lbl:"BPA",cid:null},reit:{lbl:"AFFO/acción",cid:"affo_cagr5"},bdc:{lbl:"NII/acción",cid:"nii_cagr5"}
};
const MOS={id:"margin_safety",label:"Margen seguridad",short:"MoS",unit:"%",placeholder:"25",
  isDCF:true,skipRanges:true,hint:"DCF. Positivo=infravalorada.",
  score:v=>{const n=parseFloat(v);if(isNaN(n))return null;
    if(n>40)return 10;if(n>30)return 9;if(n>20)return 8;if(n>10)return 7;
    if(n>0)return 6;if(n>-10)return 5;if(n>-20)return 4;if(n>-30)return 3;if(n>-50)return 2;return 1;},
  ranges:[]};
Object.values(SECTORS).forEach(s=>s.metrics.push({...MOS}));

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getCountry(c){return COUNTRIES.find(x=>x.code===c)||{code:"OTHER",flag:"🌍",name:"Otro"};}
function sC(s){if(s==null)return"#3a4260";if(s>=8)return"#34d399";if(s>=6.5)return"#86efac";if(s>=5)return"#fbbf24";if(s>=3)return"#f97316";return"#f87171";}
function sBg(s){if(s==null)return"rgba(42,48,69,0.4)";if(s>=8)return"rgba(52,211,153,0.13)";if(s>=6.5)return"rgba(134,239,172,0.1)";if(s>=5)return"rgba(251,191,36,0.1)";if(s>=3)return"rgba(249,115,22,0.1)";return"rgba(248,113,113,0.1)";}
function sL(s){if(!s)return"Sin datos";if(s>=8)return"Excelente";if(s>=6.5)return"Buena";if(s>=5)return"Aceptable";if(s>=3)return"Débil";return"Muy débil";}
function rC(r,t){const top=Math.ceil(t*0.25),bot=Math.floor(t*0.75);if(r<=top)return"#34d399";if(r>bot)return"#f87171";return"#c8d0e0";}
function gM(sec){return(SECTORS[sec]||SECTORS.general).metrics;}
function cS(vals,sec){const ms=gM(sec);let tot=0,cnt=0;const sc={};ms.forEach(m=>{const v=vals[m.id];if(v!==undefined&&v!==""){const s=m.score(v);if(s!==null){sc[m.id]=s;tot+=s;cnt++;}}});return{scores:sc,total:cnt>0?tot/cnt:0,count:cnt};}
function calcDCF(cf,g1,g2,disc,term){
  const r=disc/100,tg=Math.min((term||2.5)/100,r-0.02);
  if(!cf||r<=0||r<=tg)return null;
  let iv=0,fl=parseFloat(cf);const a=g1/100,b=(g2!=null?g2:Math.max(g1/2,2))/100;
  for(let i=1;i<=5;i++){fl*=(1+a);iv+=fl/Math.pow(1+r,i);}
  for(let i=1;i<=5;i++){const gf=b-(b-tg)*(i/5);fl*=(1+gf);iv+=fl/Math.pow(1+r,5+i);}
  iv+=fl*Math.min(1/(r-tg),20)/Math.pow(1+r,10);return parseFloat(iv.toFixed(2));
}
function calcDDM(dps,g,d){const gr=g/100,dr=d/100;if(!dps||dr<=gr||dr<=0)return null;return parseFloat((dps*(1+gr)/(dr-gr)).toFixed(2));}
function autoG(vals,sec){const c=DCF_CFG[sec]||DCF_CFG.general;if(!c.cid)return null;const v=parseFloat(vals[c.cid]);return isNaN(v)?null:v;}
function getWHT(country){return WHT_DEFAULTS[country]||0;}
// Net dividend after double taxation (origin credited against destination)
function netYield(grossYield,originWHT,destWHT){
  // When dest >= origin: pays origin at source, then pays remaining (dest-origin) locally
  // When origin > dest: loses the excess — effective rate = origin
  const effective=Math.max(originWHT,destWHT)/100;
  return parseFloat((grossYield*(1-effective)).toFixed(4));
}
// 10-year projection: returns array of {year, grossDiv, netDiv, cumNet}
function project10y(investAmt,yieldPct,growthPct,originWHT,destWHT){
  if(!investAmt||!yieldPct)return null;
  const y=yieldPct/100,g=growthPct/100;
  const effective=Math.max(originWHT,destWHT)/100;
  const rows=[];let cumNet=0;
  for(let i=0;i<10;i++){
    const gross=investAmt*y*Math.pow(1+g,i);
    const net=gross*(1-effective);
    cumNet+=net;
    rows.push({year:i+1,gross:parseFloat(gross.toFixed(2)),net:parseFloat(net.toFixed(2)),cum:parseFloat(cumNet.toFixed(2))});
  }
  return rows;
}

async function fetchYahoo(ticker){
  const enc=encodeURIComponent,url="https://query1.finance.yahoo.com/v8/finance/chart/"+enc(ticker)+"?interval=1d&range=1d";
  for(const px of[u=>"https://corsproxy.io/?"+u,u=>"https://api.allorigins.win/get?url="+enc(u)]){
    try{let r=await fetch(px(url),{signal:AbortSignal.timeout(12000)});if(!r.ok)continue;
      let j=await r.json();if(typeof j.contents==="string")j=JSON.parse(j.contents);
      const m=j?.chart?.result?.[0]?.meta;
      if(m?.regularMarketPrice)return{price:m.regularMarketPrice,currency:m.currency??"",updated:new Date().toLocaleString("es-ES")};}catch(e){}
  }throw new Error("No se pudo obtener "+ticker);
}

const BTN={border:"none",borderRadius:9,padding:"10px 14px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Figtree',sans-serif"};
const INP={width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"9px 12px",color:"#fff",fontSize:14,outline:"none",fontFamily:"'Figtree',sans-serif"};
const LBL={display:"block",fontSize:10,color:"#4a5270",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.1em"};

// ─── RADAR ───────────────────────────────────────────────────────────────────
function RadarChart({scores,sector,color,size=220}){
  const ms=gM(sector),n=ms.length,cx=120,cy=120,r=82;
  const pt=(i,rad)=>{const a=(Math.PI*2*i/n)-Math.PI/2;return[cx+rad*Math.cos(a),cy+rad*Math.sin(a)];};
  const poly=ms.map((_,i)=>{const[x,y]=pt(i,(scores[ms[i].id]||0)/10*r);return x+","+y;}).join(" ");
  return(
    <svg viewBox="0 0 240 240" style={{width:"100%",maxWidth:size,display:"block",margin:"0 auto"}}>
      {[2,4,6,8,10].map(l=><polygon key={l} points={Array.from({length:n},(_,i)=>pt(i,l/10*r).join(",")).join(" ")} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>)}
      {Array.from({length:n},(_,i)=>{const[x,y]=pt(i,r);return<line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>;})}
      <polygon points={poly} fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2"/>
      {ms.map((m,i)=>{const[x,y]=pt(i,r+14);return<text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="#4a5270" fontFamily="Figtree,sans-serif">{m.short}</text>;})}
      {ms.map((m,i)=>{const[x,y]=pt(i,(scores[m.id]||0)/10*r);return<circle key={i} cx={x} cy={y} r="2.5" fill={color}/>;})}
    </svg>
  );
}

// ─── MULTI-RADAR ─────────────────────────────────────────────────────────────
function MultiRadar({companies}){
  const ms=gM(companies[0]?.sector||"general").filter(m=>!m.isDCF);
  const n=ms.length,cx=140,cy=130,r=95;
  const pt=(i,rad)=>{const a=(Math.PI*2*i/n)-Math.PI/2;return[cx+rad*Math.cos(a),cy+rad*Math.sin(a)];};
  return(
    <div>
      <svg viewBox="0 0 280 260" style={{width:"100%",display:"block"}}>
        {[2,4,6,8,10].map(l=><polygon key={l} points={Array.from({length:n},(_,i)=>pt(i,l/10*r).join(",")).join(" ")} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>)}
        {Array.from({length:n},(_,i)=>{const[x,y]=pt(i,r);return<line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>;})}
        {ms.map((m,i)=>{const[x,y]=pt(i,r+16);return<text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#4a5270" fontFamily="Figtree,sans-serif">{m.short}</text>;})}
        {companies.map((co,ci)=>{
          const col=CC[ci]||"#818cf8";
          const poly=ms.map((_,i)=>{const[x,y]=pt(i,(co.scores[ms[i].id]||0)/10*r);return x+","+y;}).join(" ");
          return(
            <React.Fragment key={co.id}>
              <polygon points={poly} fill={col} fillOpacity={0.12} stroke={col} strokeWidth="2"/>
              {ms.map((m,i)=>{const[x,y]=pt(i,(co.scores[m.id]||0)/10*r);return<circle key={i} cx={x} cy={y} r="3" fill={col}/>;})}
            </React.Fragment>
          );
        })}
      </svg>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center",marginTop:6}}>
        {companies.map((co,i)=><div key={co.id} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#c8d0e0"}}><div style={{width:12,height:3,borderRadius:2,background:CC[i]}}/>{co.name}</div>)}
      </div>
    </div>
  );
}

// ─── CONCENTRATION CHART ─────────────────────────────────────────────────────
function ConcentrationChart({groups,getLabel,getColor}){
  const entries=Object.entries(groups).sort((a,b)=>b[1].length-a[1].length);
  const total=entries.reduce((s,[,v])=>s+v.length,0);
  if(total===0)return null;
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
        );})}
      </div>
    </div>
  );
}

// ─── GROUPED RANKING ─────────────────────────────────────────────────────────
function GroupedRanking({groups,getLabel,getColor,emptyMsg}){
  const[sel,setSel]=React.useState(null);
  const sorted=Object.entries(groups).sort((a,b)=>b[1].length-a[1].length);
  if(sorted.length===0)return<p style={{color:"#3a4260",fontSize:13,textAlign:"center",padding:"40px 0"}}>{emptyMsg}</p>;
  return(
    <div>
      <ConcentrationChart groups={groups} getLabel={getLabel} getColor={getColor}/>
      <div style={{display:"grid",gap:16}}>
        {sorted.map(([key,comps])=>{
          const lb=getLabel(key),col=getColor(key)||"#818cf8",avg=comps.reduce((a,b)=>a+b.total,0)/comps.length;
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
                      {sel===co.id&&<div style={{marginTop:6,display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:3}}>{gM(co.sector).map(m=>{const s=co.scores[m.id];return(<div key={m.id} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#4a5270",padding:"2px 0"}}><span>{m.short}</span><span style={{color:sC(s),fontWeight:600}}>{s!=null?s+"/10":"—"}</span></div>);})}</div>}
                    </div>
                    <span style={{fontSize:18,fontWeight:800,color:sC(co.total),flexShrink:0}}>{co.total.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── COMPANY SEARCH (autocomplete from DICT) ──────────────────────────────────
function CompanySearch({onSelect}){
  const[q,setQ]=React.useState("");
  const results=React.useMemo(()=>{
    if(!q||q.length<2)return[];
    const ql=q.toLowerCase();
    return DICT.filter(d=>d[0].toLowerCase().includes(ql)||d[1].toLowerCase().includes(ql)).slice(0,8);
  },[q]);
  function pick(d){onSelect({name:d[0],ticker:d[1],country:d[2],currency:d[3],superSector:d[4],sectorName:d[5],sector:d[6]});setQ("");}
  return(
    <div style={{marginBottom:14}}>
      <label style={{...LBL,color:"#818cf8",marginBottom:6}}>🔍 Buscar empresa (1.278 disponibles)</label>
      <div style={{display:"flex",gap:6,marginBottom:results.length>0?8:0}}>
        <input style={{...INP,flex:1,background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.25)"}}
          placeholder="Nombre o ticker..." value={q} onChange={e=>setQ(e.target.value)}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"/>
        {q&&<button onClick={()=>setQ("")} style={{...BTN,padding:"0 12px",background:"rgba(255,255,255,0.05)",color:"#6a7090",fontSize:18}}>×</button>}
      </div>
      {results.length>0&&(
        <div style={{background:"#0f1221",border:"1px solid rgba(99,102,241,0.3)",borderRadius:10,overflow:"hidden"}}>
          {results.map((d,i)=>(
            <div key={i} onClick={()=>pick(d)} style={{padding:"10px 12px",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.04)",WebkitTapHighlightColor:"transparent"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontSize:13,fontWeight:600,color:"#e0e8f0"}}>{d[0]}</span>
                <span style={{fontSize:11,color:"#3a4260",background:"rgba(255,255,255,0.04)",padding:"1px 5px",borderRadius:4}}>{d[1]}</span>
                <span style={{fontSize:9,color:"#818cf8",background:"rgba(99,102,241,0.1)",padding:"1px 5px",borderRadius:4}}>{d[4]}</span>
              </div>
              <p style={{fontSize:10,color:"#4a5270",marginTop:2}}>{d[5]} · {d[2]} · {d[3]}</p>
            </div>
          ))}
        </div>
      )}
      {q.length>=2&&results.length===0&&<p style={{fontSize:11,color:"#4a5270",padding:"8px 0"}}>Sin resultados</p>}
    </div>
  );
}

// ─── 10-YEAR PROJECTION CHART ────────────────────────────────────────────────
function ProjectionChart({rows,investAmt}){
  if(!rows||!rows.length)return null;
  const maxVal=Math.max(...rows.map(r=>r.cum),investAmt||1);
  const W=300,H=140,PT=14,PB=28,PL=36,PR=8;
  const cW=W-PL-PR,cH=H-PT-PB,n=rows.length;
  const bW=Math.floor(cW/n*0.55),gap=(cW-bW*n)/(n+1);
  const payback=rows.findIndex(r=>r.cum>=investAmt);
  const ticks=[0,Math.round(maxVal/2),Math.round(maxVal)];
  return(
    <div>
      <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",display:"block"}}>
        {ticks.map(t=>{
          const y=PT+cH-(t/maxVal)*cH;
          return(
            <React.Fragment key={t}>
              <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
              <text x={PL-3} y={y+3} textAnchor="end" fontSize="8" fill="#3a4260" fontFamily="Figtree,sans-serif">{t>=1000?Math.round(t/100)/10+"k":t}</text>
            </React.Fragment>
          );
        })}
        {/* Investment line */}
        {investAmt&&investAmt<=maxVal&&(()=>{const y=PT+cH-(investAmt/maxVal)*cH;return<line key="inv" x1={PL} y1={y} x2={W-PR} y2={y} stroke="rgba(251,191,36,0.5)" strokeWidth="1" strokeDasharray="4 3"/>;})()}
        {rows.map((r,i)=>{
          const x=PL+gap+(bW+gap)*i;
          const hGross=Math.max((r.gross/maxVal)*cH,2),hNet=Math.max((r.net/maxVal)*cH,2);
          const hCum=Math.max((r.cum/maxVal)*cH,2);
          const isPB=payback===i;
          return(
            <React.Fragment key={i}>
              <rect x={x} y={PT+cH-hGross} width={bW} height={hGross} fill="rgba(255,255,255,0.1)" rx="2"/>
              <rect x={x} y={PT+cH-hNet} width={bW} height={hNet} fill={isPB?"#fbbf24":"#34d399"} opacity="0.8" rx="2"/>
              <text x={x+bW/2} y={H-PB+9} textAnchor="middle" fontSize="7" fill={isPB?"#fbbf24":"#4a5270"} fontFamily="Figtree,sans-serif">{r.year}</text>
            </React.Fragment>
          );
        })}
        {/* Cumulative line */}
        <polyline points={rows.map((r,i)=>{const x=PL+gap+(bW+gap)*i+bW/2,y=PT+cH-(r.cum/maxVal)*cH;return x+","+y;}).join(" ")} fill="none" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="3 2"/>
      </svg>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:10,marginTop:4}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,background:"rgba(255,255,255,0.1)",borderRadius:2}}/><span style={{color:"#6a7090"}}>Bruto</span></div>
        <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,background:"#34d399",borderRadius:2}}/><span style={{color:"#34d399"}}>Neto</span></div>
        <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:3,background:"#818cf8",borderRadius:1}}/><span style={{color:"#818cf8"}}>Acumulado neto</span></div>
        {investAmt&&<div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:2,background:"rgba(251,191,36,0.6)",borderRadius:1}}/><span style={{color:"#fbbf24"}}>Inversión inicial</span></div>}
      </div>
    </div>
  );
}

// ─── DCF SECTION ─────────────────────────────────────────────────────────────
function DCFSection({form,setForm,metrics,live}){
  const cfg=DCF_CFG[form.sector]||DCF_CFG.general;
  const di=form.dcf||{cf:"",discount:"10",terminal:"2.5",price:"",growth2:""};
  const ag=autoG(form.values,form.sector);
  function sd(p){setForm(f=>({...f,dcf:{...(f.dcf||{}), ...p}}));}
  function run(){
    const cf=parseFloat(di.cf),disc=parseFloat(di.discount||10),term=parseFloat(di.terminal||2.5),pr=parseFloat(di.price);
    const g=ag??parseFloat(di.growth??0),g2=parseFloat(di.growth2||Math.max((g||0)/2,2).toFixed(1));
    if(!cf||isNaN(g))return;
    const iv=calcDCF(cf,g,g2,disc,term);if(!iv)return;
    const mos=pr>0?parseFloat(((iv-pr)/iv*100).toFixed(1)):null;
    setForm(f=>({...f,dcf:{...(f.dcf||{}),cf:di.cf,discount:di.discount,terminal:di.terminal,price:di.price,growth2:String(g2),iv,mos},values:{...f.values,margin_safety:mos!=null?String(mos):""}}));
  }
  const s=live.scores.margin_safety,hasMos=form.values.margin_safety!=null&&form.values.margin_safety!=="";
  return(
    <div style={{padding:"12px",background:"rgba(99,102,241,0.04)",border:"1px solid "+(hasMos?sC(s)+"40":"rgba(99,102,241,0.2)"),borderRadius:12,marginTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div><span style={{fontSize:13,color:"#818cf8",fontWeight:600}}>DCF — 2 fases</span><p style={{fontSize:10,color:"#3a4260",marginTop:2}}>{cfg.lbl} <strong style={{color:"#c8d0e0"}}>por acción</strong>, no el total</p></div>
        {hasMos&&<div style={{fontSize:22,fontWeight:800,color:sC(s)}}>{parseFloat(form.values.margin_safety)>0?"+":""}{form.values.margin_safety}%</div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div><label style={LBL}>{cfg.lbl}</label><input style={INP} type="number" step="any" placeholder="ej: 1.20" value={di.cf} onChange={e=>sd({cf:e.target.value})}/></div>
        <div><label style={LBL}>Precio actual</label><input style={INP} type="number" step="any" placeholder="ej: 12.50" value={di.price} onChange={e=>sd({price:e.target.value})}/></div>
        <div><label style={LBL}>Tasa descuento %</label><input style={INP} type="number" step="0.1" value={di.discount||"10"} onChange={e=>sd({discount:e.target.value})}/></div>
        <div><label style={LBL}>Crec. terminal %</label><input style={INP} type="number" step="0.1" value={di.terminal||"2.5"} onChange={e=>sd({terminal:e.target.value})}/></div>
      </div>
      {ag!=null?<React.Fragment><p style={{fontSize:11,color:"#4a5270",marginBottom:4}}>Fase 1 CAGR: <strong style={{color:"#c8d0e0"}}>{ag}%</strong></p><div style={{marginBottom:8}}><label style={LBL}>Fase 2 crec. años 6-10% (sugerido: {Math.max((ag||0)/2,2).toFixed(1)}%)</label><input style={INP} type="number" step="0.1" placeholder={String(Math.max((ag||0)/2,2).toFixed(1))} value={di.growth2||""} onChange={e=>sd({growth2:e.target.value})}/></div></React.Fragment>
      :<div style={{marginBottom:8}}><label style={LBL}>Crecimiento proyectado %</label><input style={INP} type="number" step="0.1" placeholder="ej: 7" value={di.growth||""} onChange={e=>sd({growth:e.target.value})}/></div>}
      <button onClick={run} style={{...BTN,width:"100%",background:"rgba(99,102,241,0.25)",color:"#818cf8",fontSize:12,marginBottom:di.iv?8:0}}>↻ Calcular valor intrínseco</button>
      {di.iv&&<div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:sBg(s),borderRadius:9}}><div><p style={{fontSize:10,color:"#4a5270"}}>Valor intrínseco</p><p style={{fontSize:20,fontWeight:800,color:"#fff"}}>{di.iv}</p></div>{di.mos!=null&&<div style={{textAlign:"right"}}><p style={{fontSize:10,color:"#4a5270"}}>Margen seguridad</p><p style={{fontSize:20,fontWeight:800,color:sC(s)}}>{di.mos>0?"+":""}{di.mos}%</p></div>}</div>}
      {(form.sector==="banco"||form.sector==="aseguradora")&&(
        <div style={{marginTop:10,padding:"10px",background:"rgba(96,165,250,0.04)",border:"1px solid rgba(96,165,250,0.2)",borderRadius:10}}>
          <p style={{fontSize:12,color:"#60a5fa",fontWeight:600,marginBottom:6}}>DDM — Dividend Discount Model</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
            {[["ddmDps","DPS próx. año","0.80"],["ddmG","Crec. div. %","5"],["ddmR","Tasa desc. %","10"]].map(([k,lbl,ph])=>(
              <div key={k}><label style={LBL}>{lbl}</label><input style={{...INP,fontSize:12,padding:"6px 8px"}} type="number" step="any" placeholder={ph} value={di[k]||""} onChange={e=>sd({[k]:e.target.value})}/></div>
            ))}
          </div>
          {di.ddmDps&&di.ddmG&&di.ddmR&&(()=>{
            const iv2=calcDDM(parseFloat(di.ddmDps),parseFloat(di.ddmG),parseFloat(di.ddmR));
            const pr=parseFloat(di.price||0),mos2=iv2&&pr>0?parseFloat(((iv2-pr)/iv2*100).toFixed(1)):null;
            if(!iv2)return<p style={{fontSize:11,color:"#f87171"}}>Tasa descuento debe ser mayor que crecimiento</p>;
            return<div style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"rgba(96,165,250,0.08)",borderRadius:8}}><div><p style={{fontSize:10,color:"#4a5270"}}>Valor intrínseco DDM</p><p style={{fontSize:18,fontWeight:800,color:"#60a5fa"}}>{iv2}</p></div>{mos2!=null&&<div style={{textAlign:"right"}}><p style={{fontSize:10,color:"#4a5270"}}>Margen seguridad</p><p style={{fontSize:18,fontWeight:800,color:sC(mos2>20?8:mos2>0?6:mos2>-20?4:2)}}>{mos2>0?"+":""}{mos2}%</p></div>}</div>;
          })()}
        </div>
      )}
    </div>
  );
}

// ─── FORM ─────────────────────────────────────────────────────────────────────
function Form({initial,editingId,onSave,onCancel,destWHT}){
  const[form,setForm]=React.useState(()=>({...initial}));
  const[openH,setOpenH]=React.useState(null);
  const[showR,setShowR]=React.useState(null);
  const[showProj,setShowProj]=React.useState(false);
  const ms=React.useMemo(()=>gM(form.sector),[form.sector]);
  const live=React.useMemo(()=>cS(form.values,form.sector),[form.values,form.sector]);
  const sc=SECTORS[form.sector]||SECTORS.general;
  function applyDict(d){setForm(f=>({...f,name:d.name,ticker:d.ticker,country:d.country,sector:d.sector,_superSector:d.superSector,_sectorName:d.sectorName,_currency:d.currency,originWHT:getWHT(d.country)}));}
  function chSec(s){if(s!==form.sector)setForm(f=>({...f,sector:s,values:{}}));}
  const sV=(id,v)=>setForm(f=>({...f,values:{...f.values,[id]:v}}));
  // Projection
  const yld=parseFloat(form.values?.yield_pct)||0;
  const cagr=parseFloat(form.values?.div_cagr5)||0;
  const originWHT=form.originWHT!=null?form.originWHT:getWHT(form.country||"US");
  const dest=destWHT||19;
  const projRows=React.useMemo(()=>form._projAmt>0?project10y(form._projAmt,yld,cagr,originWHT,dest):null,[form._projAmt,yld,cagr,originWHT,dest]);
  const netY=yld>0?netYield(yld,originWHT,dest).toFixed(2):null;
  const totalNetDiv=projRows?projRows[9]?.cum:null;
  return(
    <div style={{background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"18px 16px"}}>
      <p style={{fontSize:10,color:"#4a5270",letterSpacing:"0.16em",textTransform:"uppercase",fontWeight:600,marginBottom:12}}>{editingId?"Editando":"Nueva empresa"}</p>
      {!editingId&&<CompanySearch onSelect={applyDict}/>}
      {form._sectorName&&<div style={{padding:"6px 10px",background:"rgba(99,102,241,0.06)",borderRadius:8,marginBottom:10,fontSize:11,color:"#818cf8"}}>{form._superSector} › {form._sectorName} · {form._currency}</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div><label style={LBL}>Nombre</label><input style={INP} placeholder="ej: Munich Re" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
        <div><label style={LBL}>Ticker</label><input style={INP} placeholder="ej: MUV2" value={form.ticker} onChange={e=>setForm(f=>({...f,ticker:e.target.value}))}/></div>
      </div>
      <div style={{marginBottom:10}}>
        <label style={LBL}>País</label>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {COUNTRIES.map(ct=><button key={ct.code} onClick={()=>setForm(f=>({...f,country:ct.code,originWHT:getWHT(ct.code)}))} style={{...BTN,padding:"4px 8px",fontSize:10,background:form.country===ct.code?"rgba(99,102,241,0.4)":"rgba(255,255,255,0.04)",color:form.country===ct.code?"#fff":"#5a6480",border:"1px solid "+(form.country===ct.code?"rgba(99,102,241,0.5)":"rgba(255,255,255,0.06)"),borderRadius:7}}>{ct.flag} {ct.name}</button>)}
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <label style={LBL}>Sector</label>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {Object.entries(SECTORS).map(([k,s])=><button key={k} onClick={()=>chSec(k)} style={{...BTN,padding:"6px 12px",fontSize:11,background:form.sector===k?s.color+"25":"rgba(255,255,255,0.04)",color:form.sector===k?s.color:"#5a6480",border:"1px solid "+(form.sector===k?s.color+"50":"rgba(255,255,255,0.06)"),borderRadius:8}}>{s.label}</button>)}
        </div>
        <p style={{fontSize:11,color:"#3a4260",marginTop:4,fontStyle:"italic"}}>{sc.desc}</p>
      </div>
      <div style={{marginBottom:12}}>
        <label style={LBL}>Tesis de inversión</label>
        <textarea style={{...INP,height:56,resize:"vertical",lineHeight:1.4,fontSize:12}} placeholder="¿Por qué esta empresa?" value={form.thesis||""} onChange={e=>setForm(f=>({...f,thesis:e.target.value}))}/>
      </div>
      {/* Metrics */}
      <div style={{display:"grid",gap:7}}>
        {ms.filter(m=>!m.isDCF).map(m=>{const s=live.scores[m.id],has=form.values[m.id]!==undefined&&form.values[m.id]!=="";return(
          <div key={m.id} style={{padding:"10px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid "+(has?sC(s)+"30":"rgba(255,255,255,0.04)"),borderRadius:9}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                  <span style={{fontSize:12,color:"#8090a8",fontWeight:500}}>{m.label}</span>
                  <button style={{background:"none",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"50%",color:"#4a5270",width:15,height:15,fontSize:8,cursor:"pointer",padding:0,lineHeight:"15px"}} onClick={()=>setOpenH(openH===m.id?null:m.id)}>?</button>
                </div>
                {openH===m.id&&<p style={{fontSize:11,color:"#4a5270",fontStyle:"italic",marginBottom:3}}>{m.hint}</p>}
                {!m.skipRanges&&<button style={{background:"none",border:"none",color:"#2a3a55",fontSize:10,cursor:"pointer",padding:0}} onClick={()=>setShowR(showR===m.id?null:m.id)}>{showR===m.id?"ocultar rangos":"ver rangos"}</button>}
                {!m.skipRanges&&showR===m.id&&<div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:3,marginTop:6}}>{m.ranges.map((r,i)=><div key={i} style={{background:sBg(10-i),borderRadius:5,padding:"3px 2px",textAlign:"center"}}><span style={{fontSize:11,fontWeight:800,color:sC(10-i)}}>{10-i}</span><span style={{fontSize:9,color:sC(10-i),opacity:0.75,display:"block"}}>{r}</span></div>)}</div>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <div style={{position:"relative"}}><input style={{...INP,width:80,padding:"7px 28px 7px 8px",fontSize:14}} type="number" step="any" placeholder={m.placeholder} value={form.values[m.id]??""} onChange={e=>sV(m.id,e.target.value)}/><span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:10,color:"#3a4260",pointerEvents:"none"}}>{m.unit}</span></div>
                <div style={{width:30,height:30,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0,background:sBg(s),color:sC(s),opacity:has?1:0.25}}>{has?(s!=null?s:"—"):"—"}</div>
              </div>
            </div>
          </div>
        );})}
      </div>
      <DCFSection form={form} setForm={setForm} metrics={ms} live={live}/>
      {/* Withholding taxes */}
      <div style={{marginTop:10,padding:"12px",background:"rgba(251,191,36,0.04)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:12}}>
        <p style={{fontSize:12,fontWeight:600,color:"#fbbf24",marginBottom:8}}>Retenciones fiscales</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div>
            <label style={LBL}>Retención origen % <span style={{textTransform:"none",color:"#3a4260"}}>(por defecto de {getCountry(form.country||"US").name})</span></label>
            <input style={INP} type="number" step="0.1" placeholder={String(getWHT(form.country||"US"))}
              value={form.originWHT!=null?form.originWHT:getWHT(form.country||"US")}
              onChange={e=>setForm(f=>({...f,originWHT:parseFloat(e.target.value)||0}))}/>
          </div>
          <div>
            <label style={LBL}>Tu retención destino %</label>
            <input style={INP} type="number" step="0.1" placeholder={String(dest)} value={dest} readOnly style={{...INP,opacity:0.6,cursor:"not-allowed"}}/>
            <p style={{fontSize:10,color:"#3a4260",marginTop:3}}>Cambia en ajustes globales</p>
          </div>
        </div>
        {yld>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            <div style={{padding:"8px",background:"rgba(255,255,255,0.02)",borderRadius:8,textAlign:"center"}}><p style={{fontSize:9,color:"#4a5270"}}>Yield bruto</p><p style={{fontSize:16,fontWeight:700,color:"#c8d0e0"}}>{yld}%</p></div>
            <div style={{padding:"8px",background:"rgba(255,255,255,0.02)",borderRadius:8,textAlign:"center"}}><p style={{fontSize:9,color:"#4a5270"}}>Retención efectiva</p><p style={{fontSize:16,fontWeight:700,color:"#fbbf24"}}>{Math.max(originWHT,dest)}%</p></div>
            <div style={{padding:"8px",background:"rgba(52,211,153,0.08)",borderRadius:8,textAlign:"center"}}><p style={{fontSize:9,color:"#4a5270"}}>Yield neto</p><p style={{fontSize:16,fontWeight:700,color:"#34d399"}}>{netY}%</p></div>
          </div>
        )}
      </div>
      {/* 10-year projection */}
      <div style={{marginTop:10,padding:"12px",background:"rgba(129,140,248,0.04)",border:"1px solid rgba(129,140,248,0.2)",borderRadius:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <p style={{fontSize:12,fontWeight:600,color:"#818cf8"}}>Proyección a 10 años</p>
          <button onClick={()=>setShowProj(p=>!p)} style={{...BTN,fontSize:11,padding:"4px 10px",background:"rgba(129,140,248,0.15)",color:"#818cf8"}}>{showProj?"Ocultar":"Ver"}</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:showProj?8:0}}>
          <div>
            <label style={LBL}>Importe a invertir €</label>
            <input style={INP} type="number" step="100" placeholder="ej: 10000" value={form._projAmt||""} onChange={e=>setForm(f=>({...f,_projAmt:parseFloat(e.target.value)||0}))}/>
          </div>
          {form._projAmt>0&&yld>0&&(
            <div style={{padding:"8px",background:"rgba(129,140,248,0.08)",borderRadius:8}}>
              <p style={{fontSize:9,color:"#4a5270"}}>Renta neta año 1</p>
              <p style={{fontSize:16,fontWeight:700,color:"#818cf8"}}>€{(form._projAmt*netY/100).toFixed(2)}</p>
              {projRows&&<p style={{fontSize:9,color:"#4a5270",marginTop:2}}>Total 10 años: <strong style={{color:"#a78bfa"}}>€{totalNetDiv?.toFixed(2)}</strong></p>}
            </div>
          )}
        </div>
        {showProj&&projRows&&(
          <div>
            <ProjectionChart rows={projRows} investAmt={form._projAmt}/>
            <div style={{marginTop:10,overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr>{["Año","Div. bruto","Ret.","Div. neto","Acumulado"].map(h=><th key={h} style={{textAlign:"right",padding:"4px 6px",color:"#4a5270",fontWeight:600,borderBottom:"1px solid rgba(255,255,255,0.05)"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {projRows.map(r=>(
                    <tr key={r.year}>
                      <td style={{textAlign:"right",padding:"4px 6px",color:"#818cf8",fontWeight:700}}>{r.year}</td>
                      <td style={{textAlign:"right",padding:"4px 6px",color:"#6a7090"}}>€{r.gross.toFixed(2)}</td>
                      <td style={{textAlign:"right",padding:"4px 6px",color:"#fbbf24"}}>-{(r.gross-r.net).toFixed(2)}</td>
                      <td style={{textAlign:"right",padding:"4px 6px",color:"#34d399",fontWeight:600}}>€{r.net.toFixed(2)}</td>
                      <td style={{textAlign:"right",padding:"4px 6px",color:r.cum>=form._projAmt?"#fbbf24":"#c8d0e0",fontWeight:r.cum>=form._projAmt?700:400}}>€{r.cum.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {projRows&&projRows[9]?.cum<form._projAmt&&<p style={{fontSize:11,color:"#4a5270",marginTop:6,textAlign:"center"}}>La inversión no se recupera en dividendos en 10 años</p>}
              {projRows&&projRows.findIndex(r=>r.cum>=form._projAmt)>=0&&<p style={{fontSize:12,color:"#fbbf24",marginTop:6,textAlign:"center",fontWeight:600}}>Recuperación en dividendos: año {projRows.findIndex(r=>r.cum>=form._projAmt)+1}</p>}
            </div>
          </div>
        )}
        {(!yld||yld===0)&&<p style={{fontSize:11,color:"#3a4260"}}>Introduce el Yield actual en las métricas para ver la proyección.</p>}
      </div>
      {/* Score bar */}
      {live.count>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,padding:"12px 16px",borderRadius:12,border:"1px solid "+sC(live.total)+"40",background:sBg(live.total)}}><div><p style={{fontSize:11,color:"#4a5270"}}>Nota media — {live.count}/{ms.length} métricas</p><p style={{fontSize:11,color:"#4a5270",fontStyle:"italic",marginTop:2}}>{sL(live.total)}</p></div><span style={{fontSize:36,fontWeight:800,color:sC(live.total)}}>{live.total.toFixed(1)}</span></div>}
      <div style={{display:"flex",gap:10,marginTop:12}}>
        <button onClick={()=>onSave(form)} disabled={!form.name.trim()} style={{...BTN,flex:1,background:"rgba(99,102,241,0.8)",opacity:!form.name.trim()?0.4:1}}>{editingId?"Guardar cambios":"Añadir al índice"}</button>
        <button onClick={onCancel} style={{...BTN,background:"rgba(255,255,255,0.05)"}}>Cancelar</button>
      </div>
    </div>
  );
}

function parseDivHistory(events){
  if(!events)return null;
  const byYear={};
  Object.values(events).forEach(ev=>{
    const yr=new Date(ev.date*1000).getFullYear();
    byYear[yr]=(byYear[yr]||0)+ev.amount;
  });
  return Object.entries(byYear)
    .map(([yr,dps])=>({year:parseInt(yr),dps:parseFloat(dps.toFixed(3))}))
    .sort((a,b)=>a.year-b.year).slice(-6);
}
function calcCAGR5(history){
  if(!history||history.length<2)return null;
  const curYear=new Date().getFullYear();
  // Exclude current year — only partial dividends approved so far
  const valid=history.filter(h=>h.dps>0&&h.year<curYear);
  if(valid.length<2)return null;
  const first=valid[0],last=valid[valid.length-1],yrs=last.year-first.year;
  if(yrs<=0)return null;
  return parseFloat(((Math.pow(last.dps/first.dps,1/yrs)-1)*100).toFixed(1));
}
function hasCurrentYearDiv(history){
  if(!history||!history.length)return false;
  return history.some(h=>h.year===new Date().getFullYear());
}
function isStale(co){
  if(!co.date)return false;
  const p=co.date.split("/");if(p.length!==3)return false;
  const d=new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));
  const ago=new Date();ago.setFullYear(ago.getFullYear()-1);
  return d<ago;
}
function mosColor(mos){
  if(mos==null)return"#3a4260";
  if(mos>25)return"#34d399";
  if(mos>=1)return"#fbbf24";
  return"#f87171";
}
function is1010(co){
  const y=parseFloat(co.values?.yield_pct)||0;
  const g=parseFloat(co.values?.div_cagr5)||0;
  return y+g>=10&&y>0&&g>0;
}
function streakBadge(streak){
  const s=parseInt(streak)||0;
  if(s>=35)return"🥇";
  if(s>=25)return"🥈";
  if(s>=10)return"🥉";
  return null;
}
function calcDivQuality(co,destWHT){
  let score=0,weight=0;
  const payoutInfo=getSectorPayout(co);
  if(payoutInfo){
    const{value:payout,label:pLabel}=payoutInfo;
    const isReitLike=(co.sector==="reit"||co.sector==="bdc");
    const[t1,t2,t3,t4,t5]=isReitLike?[70,80,90,100,110]:[40,50,60,70,80];
    const s=payout<t1?10:payout<t2?9:payout<t3?7:payout<t4?5:payout<t5?3:1;
    score+=s*1.5;weight+=1.5;
  }
  const debt=parseFloat(co.values?.debt_ebitda);
  if(!isNaN(debt)&&debt>=0){
    const s=debt<1?10:debt<2?8:debt<3?6:debt<4?4:2;
    score+=s;weight+=1;
  }
  const cagr=parseFloat(co.values?.div_cagr5);
  if(!isNaN(cagr)&&cagr>0){
    const s=cagr>12?10:cagr>9?9:cagr>7?8:cagr>5?6:cagr>3?4:2;
    score+=s*1.5;weight+=1.5;
  }
  const streak=parseInt(co.div_streak)||0;
  if(streak>0){
    const s=streak>=35?10:streak>=25?9:streak>=15?7:streak>=10?6:streak>=5?4:2;
    score+=s;weight+=1;
  }
  const yld=parseFloat(co.values?.yield_pct);
  if(!isNaN(yld)&&yld>0){
    const orig=co.originWHT!=null?co.originWHT:getWHT(co.country||"US");
    const ny=netYield(yld,orig,destWHT||19);
    const s=ny>5?10:ny>3.5?8:ny>2.5?6:ny>1.5?4:2;
    score+=s;weight+=1;
  }
  if(weight===0)return null;
  return parseFloat((score/weight).toFixed(1));
}
function detectMoat(co){
  let score=0;const signals=[];
  const roic=parseFloat(co.roic||co.values?.roic)||0;
  const gm=parseFloat(co.gross_margin)||0;
  const fcagr=parseFloat(co.values?.fcf_cagr5||co.fcf_cagr5)||0;
  const rcagr=parseFloat(co.revenue_cagr5)||0;
  if(roic>25){score+=35;signals.push("ROIC excepcional ("+roic.toFixed(1)+"%)");}
  else if(roic>20){score+=28;signals.push("ROIC muy elevado ("+roic.toFixed(1)+"%)");}
  else if(roic>15){score+=20;signals.push("ROIC sólido ("+roic.toFixed(1)+"%)");}
  else if(roic>10){score+=10;}
  if(gm>60){score+=25;signals.push("Alto poder de fijación de precios ("+gm.toFixed(0)+"% margen bruto)");}
  else if(gm>45){score+=18;signals.push("Márgenes brutos sólidos ("+gm.toFixed(0)+"%)");}
  else if(gm>30){score+=10;}
  else if(gm>20){score+=5;}
  const omh=co.op_margin_history||{};
  const omYears=Object.keys(omh).sort();
  if(omYears.length>=4){
    const recent=omYears.slice(-2).map(y=>omh[y]);
    const older=omYears.slice(-4,-2).map(y=>omh[y]);
    const ra=recent.reduce((a,b)=>a+b,0)/recent.length;
    const oa=older.reduce((a,b)=>a+b,0)/older.length;
    if(ra>=oa*0.97&&ra>15){score+=20;signals.push("Márgenes operativos estables o en mejora");}
    else if(ra>=oa*0.90){score+=10;}
  }
  if(fcagr>10){score+=20;signals.push("FCF creciendo con fuerza (CAGR "+fcagr.toFixed(1)+"%)");}
  else if(fcagr>5){score+=12;}
  else if(fcagr>0){score+=6;}
  if(score<20)return null;
  const width=score>=60?"wide":score>=35?"narrow":"none";
  if(width==="none")return null;
  const sources=[];
  if(gm>50&&roic>15)sources.push("Activos intangibles / marca");
  else if(gm>50)sources.push("Poder de fijación de precios");
  if(roic>20&&gm<40)sources.push("Ventaja de costes o escala");
  if(rcagr>8&&roic>15)sources.push("Posible efecto red o costes de cambio");
  if(parseFloat(co.operating_margin)>25)sources.push("Eficiencia operativa superior");
  return{width,score,signals,sources};
}
function detectErosion(co){
  const eroding=[];let totalPenalty=0;
  const check=(hist,label,threshold=3)=>{
    const yrs=Object.keys(hist||{}).sort();
    if(yrs.length<4)return;
    const recent=yrs.slice(-2).map(y=>hist[y]);
    const older=yrs.slice(-4,-2).map(y=>hist[y]);
    const ra=recent.reduce((a,b)=>a+b,0)/recent.length;
    const oa=older.reduce((a,b)=>a+b,0)/older.length;
    const decline=oa-ra;
    if(decline>threshold){
      const pen=decline>10?1.0:decline>6?0.6:0.3;
      totalPenalty=Math.max(totalPenalty,pen);
      eroding.push({metric:label,decline:parseFloat(decline.toFixed(1)),penalty:pen});
    }
  };
  check(co.op_margin_history,"Margen operativo");
  check(co.net_margin_history,"Margen neto");
  const eh=co.equity_history_m||{},nh=co.net_income_history_m||{};
  const eyrs=Object.keys(eh).filter(y=>eh[y]&&nh[y]).sort();
  if(eyrs.length>=4){
    const roicHist={};
    eyrs.forEach(y=>{if(eh[y]>0)roicHist[y]=(nh[y]/eh[y])*100;});
    check(roicHist,"ROIC estimado",4);
  }
  if(!eroding.length)return null;
  return{eroding,totalPenalty:parseFloat(totalPenalty.toFixed(2))};
}
// Returns the most appropriate payout ratio for the sector
function getPrevYearDPS(fd){
  // Use last COMPLETE year's DPS (exclude current year)
  const curYear=new Date().getFullYear();
  const hist=(fd.divHistory||[]).filter(h=>h.year<curYear&&h.dps>0);
  if(hist.length>0){
    hist.sort((a,b)=>b.year-a.year);
    return hist[0].dps;
  }
  // Fallback: fd.dps from yfinance (trailing 12m, reasonable proxy)
  return fd.dps||null;
}

function getMoatDiscount(co){
  // Moat width → discount rate:
  // Wide moat  → 8%  (predecible, bajo riesgo, inversor exige menos)
  // Narrow moat→ 10% (moderado)
  // No moat    → 12% (mayor incertidumbre, mayor exigencia)
  const moat=detectMoat(co);
  if(!moat) return 12;
  if(moat.width==="wide") return 8;
  if(moat.width==="narrow") return 10;
  return 12;
}

function getSectorPayout(co){
  const sector=co.sector||"general";
  const dps=parseFloat(co.dps)||0;
  const shares=parseFloat(co.shares_outstanding_m)||0;

  // REITs & BDCs: use operating CF as proxy for FFO/NII
  if(sector==="reit"||sector==="bdc"){
    const ocfH=co.operating_cf_history_m||{};
    const years=Object.keys(ocfH).sort().reverse();
    const ocf=years.length>0?parseFloat(ocfH[years[0]]):null; // latest year, in M
    if(ocf&&ocf>0&&shares>0){
      const ffoPerShare=ocf/shares;
      if(ffoPerShare>0) return{value:parseFloat((dps/ffoPerShare*100).toFixed(1)),label:"Payout FFO",good:true};
    }
    // fallback to EPS payout
    const pepS=parseFloat(co.payout_eps);
    if(!isNaN(pepS)&&pepS>0) return{value:pepS,label:"Payout BPA (proxy FFO)",good:false};
  }

  // Banks: payout on EPS (no FCF concept for banks)
  if(sector==="banco"){
    const peps=parseFloat(co.payout_eps);
    if(!isNaN(peps)&&peps>0) return{value:peps,label:"Payout BPA",good:true};
  }

  // Insurers, general: FCF payout first, fallback EPS
  const pfcf=parseFloat(co.payout_fcf||co.values?.payout_fcf);
  if(!isNaN(pfcf)&&pfcf>0) return{value:pfcf,label:"Payout FCF",good:true};
  const peps=parseFloat(co.payout_eps);
  if(!isNaN(peps)&&peps>0) return{value:peps,label:"Payout BPA",good:null};
  return null;
}

function getSectorDebt(co){
  const sector=co.sector||"general";
  const de=parseFloat(co.net_debt_ebitda||co.values?.debt_ebitda||co.debt_ebitda);
  if(isNaN(de)||de<0)return null;
  // Thresholds vary by sector
  const thresholds={
    banco:null,      // debt/EBITDA meaningless for banks
    utility:[2,3.5,5,6],    // more lenient: good<2, ok<3.5, warn<5, bad>=5
    reit:[3,4.5,6,7],       // REITs carry more debt by nature
    bdc:[1,2,3,4],
    general:[1,2,3,4],
    aseguradora:null  // not applicable
  };
  const t=thresholds[sector]||thresholds.general;
  if(!t)return null;
  return{value:de,thresholds:t};
}
