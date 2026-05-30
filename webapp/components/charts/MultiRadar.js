'use client'
import { CC } from '@/lib/sectors'
import { gM } from '@/lib/helpers'

export default function MultiRadar({companies}) {
  const ms=gM(companies[0]?.sector||"general").filter(m=>!m.isDCF)
  const n=ms.length,cx=140,cy=130,r=95
  const pt=(i,rad)=>{const a=(Math.PI*2*i/n)-Math.PI/2;return[cx+rad*Math.cos(a),cy+rad*Math.sin(a)]}
  return(
    <div>
      <svg viewBox="0 0 280 260" style={{width:"100%",display:"block"}}>
        {[2,4,6,8,10].map(l=><polygon key={l} points={Array.from({length:n},(_,i)=>pt(i,l/10*r).join(",")).join(" ")} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>)}
        {Array.from({length:n},(_,i)=>{const[x,y]=pt(i,r);return<line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>})}
        {ms.map((m,i)=>{const[x,y]=pt(i,r+16);return<text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#4a5270" fontFamily="Figtree,sans-serif">{m.short}</text>})}
        {companies.map((co,ci)=>{
          const col=CC[ci]||"#818cf8"
          const poly=ms.map((_,i)=>{const[x,y]=pt(i,(co.scores[ms[i].id]||0)/10*r);return x+","+y}).join(" ")
          return(
            <g key={co.id}>
              <polygon points={poly} fill={col} fillOpacity={0.12} stroke={col} strokeWidth="2"/>
              {ms.map((m,i)=>{const[x,y]=pt(i,(co.scores[m.id]||0)/10*r);return<circle key={i} cx={x} cy={y} r="3" fill={col}/>})}
            </g>
          )
        })}
      </svg>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center",marginTop:6}}>
        {companies.map((co,i)=>(
          <div key={co.id} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#c8d0e0"}}>
            <div style={{width:12,height:3,borderRadius:2,background:CC[i]}}/>
            {co.name}
          </div>
        ))}
      </div>
    </div>
  )
}
