import { useState } from 'react'
import { dateTimeLabel } from '../../format'
import type { BriefCommand, ProductionBrief, SoftHold } from '../../types/production'
import { softHoldsFor } from '../../production/readiness'
export default function SoftHolds({brief,canPropose,disabled,onAction,embedded=false}:{embedded?:boolean;brief:ProductionBrief;canPropose:boolean;disabled:boolean;onAction:(command:Omit<BriefCommand,'version'|'requestId'>)=>unknown}) {
  const [holds,setHolds]=useState(()=>softHoldsFor(brief).map(h=>({...h,id:h.id==='projected'?crypto.randomUUID():h.id})))
  const [start,setStart]=useState(''),[end,setEnd]=useState(''),[error,setError]=useState('')
  const add=()=>{if(!start||!end||Date.parse(end)<=Date.parse(start)){setError('Choose a start and a later end.');return}setHolds(v=>[...v,{id:crypto.randomUUID(),startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString()}]);setStart('');setEnd('');setError('')}
  return <section className={embedded?'production-step-dates':'production-settings'}><h3>Proposed dates / soft holds</h3><p>Client Services proposes options. Production leadership confirms the final date. Soft holds do not reserve equipment or crew.</p>
    {softHoldsFor(brief).length===0&&!canPropose&&<p>No dates proposed.</p>}
    <ul>{(canPropose?holds:softHoldsFor(brief)).map((h:SoftHold)=><li key={h.id}>{dateTimeLabel(h.startsAt)} – {dateTimeLabel(h.endsAt)} (Unconfirmed) {canPropose&&<button type="button" disabled={disabled} onClick={()=>setHolds(v=>v.filter(item=>item.id!==h.id))} aria-label={`Remove soft hold ${dateTimeLabel(h.startsAt)}`}>Remove</button>}</li>)}</ul>
    {canPropose&&<><div className="production-fields"><label>Soft hold starts<input type="datetime-local" value={start} disabled={disabled} onChange={e=>setStart(e.target.value)}/></label><label>Soft hold ends<input type="datetime-local" min={start} value={end} disabled={disabled} onChange={e=>setEnd(e.target.value)}/></label></div><p className="production-muted">Times use your device’s timezone. Add up to 10 options, then save proposals.</p>{error&&<p role="alert">{error}</p>}<div className="production-row-actions"><button type="button" disabled={disabled||holds.length>=10} onClick={add}>+ Add soft hold</button><button type="button" disabled={disabled} onClick={()=>onAction({action:'propose_dates',softHolds:holds})}>Save date proposals</button></div></>}
    {brief.shootStartsAt&&<p className="production-confirmed">Confirmed: {dateTimeLabel(brief.shootStartsAt)} – {dateTimeLabel(brief.shootEndsAt!)}</p>}
  </section>
}
