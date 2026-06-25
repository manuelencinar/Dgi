'use client'
import { gM } from '@/lib/helpers'

export default function RadarChart({scores,sector,color,size=220}) {
  const ms=gM(sector),n=ms.length,cx=120,cy=120,r=82
  const pt=(i,rad)=>{const a=(Math.PI*2*i/n)-Math.PI/2;return[cx+rad*Math.cos(a),cy+rad*Math.sin(a)]}
  const poly=ms.map((_,i)=>{const[x,y]=pt(i,(scores[ms[i].id]||0)/10*r);return x+","+y}).join(" ")
  return(
    <svg viewBox="0 0 240 240" style={{width:"100%",maxWidth:size,display:"block",margin:"0 auto"}}>
      {[2,4,6,8,10].map(l=><polygon key={l} points={Array.from({length:n},(_,i)=>pt(i,l/10*r).join(",")).join(" ")} fill="none" stroke="var(--surface-3)" strokeWidth="1"/>)}
      {Array.from({length:n},(_,i)=>{const[x,y]=pt(i,r);return<line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1"/>})}
      <polygon points={poly} fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2"/>
      {ms.map((m,i)=>{const[x,y]=pt(i,r+14);return<text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="var(--text-faint)" fontFamily="Figtree,sans-serif">{m.short}</text>})}
      {ms.map((m,i)=>{const[x,y]=pt(i,(scores[m.id]||0)/10*r);return<circle key={i} cx={x} cy={y} r="2.5" fill={color}/>})}
    </svg>
  )
}
