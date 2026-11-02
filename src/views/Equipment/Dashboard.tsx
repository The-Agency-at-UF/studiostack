'use client'
import {useCallback,useEffect,useState,type ReactNode} from 'react'
import {PageHeader,Button} from '../../components/workspace/WorkspaceUI'
import Link from 'next/link'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {EquipmentRecord,EquipmentReport,EquipmentReservation} from '../../types/equipment'
import type {AppAlert} from '../../types/alerts'
import {reservationLabel} from './Reservations'
import {getCached,setCached} from '../../api/cache'
import '../Accounts/Administration.css'
import './Equipment.css'
type SectionErrors = { items?: string; bookings?: string; reports?: string; alerts?: string }
type CachedDashboard = { items: EquipmentRecord[]; bookings: EquipmentReservation[]; reports: EquipmentReport[]; alerts: AppAlert[] }
export default function LiveDashboard({statistics=false,production}:{statistics?:boolean;production?:ReactNode}){const c=useLiveOrganization();if(c&&statistics&&!c.admin)return <main className="administration"><h1>Statistics</h1><p>Organization administrators can view organization statistics.</p></main>;return c?<DashboardWorkspace key={c.organization.id} api={c.api} org={c.organization.id} name={c.organization.name} admin={c.admin} statistics={statistics} production={production}/>:<main className="administration"><h1>StudioStack</h1><p>Select an active organization in your account to open the workspace.</p></main>}
function DashboardWorkspace({api,org,name,admin,statistics,production}:{api:DatabaseApi;org:string;name:string;admin:boolean;statistics:boolean;production?:ReactNode}){
 const cacheKey = `dashboard:${org}`
 const cached = getCached<CachedDashboard>(cacheKey)
 const [items,setItems]=useState<EquipmentRecord[]|null>(cached?.items ?? null)
 const [bookings,setBookings]=useState<EquipmentReservation[]|null>(cached?.bookings ?? null)
 const [reports,setReports]=useState<EquipmentReport[]|null>(cached?.reports ?? null)
 const [alerts,setAlerts]=useState<AppAlert[]|null>(cached?.alerts ?? null)
 const [loading,setLoading]=useState(!cached),[globalError,setGlobalError]=useState(''),[errors,setErrors]=useState<SectionErrors>({})
 const [retrying,setRetrying]=useState<string|null>(null)

 const load=useCallback(async()=>{
  if(statistics&&!admin)return
  setLoading(true);setGlobalError('')
  const [itemsRes,bookingsRes,reportsRes,alertsRes]=await Promise.allSettled([
    allPages(after=>api.inventory(org,{limit:100,after})),
    allPages(after=>api.reservations(org,{limit:100,after})),
    allPages(after=>api.reports(org).list(after)),
    allPages(after=>api.alerts(org).list(after))
  ])
  const errs:SectionErrors={}

  if(itemsRes.status==='fulfilled'){setItems(itemsRes.value)}else{errs.items=equipmentError(itemsRes.reason)}
  if(bookingsRes.status==='fulfilled'){setBookings(bookingsRes.value)}else{errs.bookings=equipmentError(bookingsRes.reason)}
  if(reportsRes.status==='fulfilled'){setReports(reportsRes.value)}else{errs.reports=equipmentError(reportsRes.reason)}
  if(alertsRes.status==='fulfilled'){setAlerts(alertsRes.value)}else{errs.alerts=equipmentError(alertsRes.reason)}
  setErrors(errs)
  if(itemsRes.status==='fulfilled'&&bookingsRes.status==='fulfilled'){
    setCached(cacheKey,{
      items:itemsRes.value,
      bookings:bookingsRes.value,
      reports:reportsRes.status==='fulfilled'?reportsRes.value:[],
      alerts:alertsRes.status==='fulfilled'?alertsRes.value:[]
    })
  }
  if(itemsRes.status==='rejected'||bookingsRes.status==='rejected'){setGlobalError(errs.items||errs.bookings||'The service is unavailable. Refresh to check whether your changes were saved.')}
  setLoading(false)
 },[api,org,admin,statistics,cacheKey])

 useEffect(()=>{void load()},[load])
 async function refresh(){await load()}

 async function retrySection(section:'items'|'bookings'|'reports'|'alerts'){
  setRetrying(section)
  try{
    if(section==='items'){const res=await allPages(after=>api.inventory(org,{limit:100,after}));setItems(res);setErrors(p=>({...p,items:undefined}))}
    else if(section==='bookings'){const res=await allPages(after=>api.reservations(org,{limit:100,after}));setBookings(res);setErrors(p=>({...p,bookings:undefined}))}
    else if(section==='reports'){const res=await allPages(after=>api.reports(org).list(after));setReports(res);setErrors(p=>({...p,reports:undefined}))}
    else if(section==='alerts'){const res=await allPages(after=>api.alerts(org).list(after));setAlerts(res);setErrors(p=>({...p,alerts:undefined}))}
  }catch(e){setErrors(p=>({...p,[section]:equipmentError(e)}))}
  finally{setRetrying(null)}
 }

 if(statistics&&!admin)return <main className="administration"><h1>Statistics</h1><p>Organization administrators can view organization statistics.</p></main>
 const active=bookings?.filter(r=>r.status==='confirmed'&&r.fulfillmentStatus!=='returned'&&(Date.parse(r.endsAt)>Date.now()||r.fulfillmentStatus==='checked_out'))??[]
 const upcoming=active.filter(r=>Date.parse(r.endsAt)>Date.now()||r.fulfillmentStatus==='checked_out').sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))
 const overdue=active.filter(r=>r.fulfillmentStatus==='checked_out'&&Date.parse(r.endsAt)<Date.now())
 const openReports=reports?.filter(r=>r.status!=='resolved')??[]
 const unreadAlerts=alerts?.filter(a=>!a.readAt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))??[]
 const categories=[...new Set(items?.map(i=>i.category)??[])].sort()
 const months=Array.from({length:6},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-5+i);return {key:d.getFullYear()+'-'+d.getMonth(),label:d.toLocaleDateString(undefined,{month:'short',year:'numeric'}),count:bookings?.filter(r=>{const start=new Date(r.startsAt);return r.status==='confirmed'&&start.getFullYear()===d.getFullYear()&&start.getMonth()===d.getMonth()}).length??0}}),max=Math.max(1,...months.map(m=>m.count))
 const hasAnyData=items!==null&&bookings!==null

 return <main className={statistics?'administration':'dashboard-page administration live-dashboard'}>
  <PageHeader title={statistics?'Equipment statistics':'Home'} context={name} description={statistics?'Organization equipment and booking activity.':'Production, equipment, and the work that needs your attention.'} actions={<><Button disabled={loading} onClick={()=>void refresh()}>{loading?'Refreshing…':'Refresh equipment'}</Button><Link className="ws-button ws-button-primary" href={statistics?'/create-reservation/':'/production/'}>{statistics?'Book equipment':'Open production'}</Link></>}/>
  {!statistics&&production}
  {globalError&&<p role="alert">{globalError}</p>}
  {loading&&!hasAnyData&&<p className="ws-loading-delayed" role="status">Loading workspace…</p>}
  <>
    {hasAnyData&&<dl className="equipment-summary ws-stagger" aria-label={org==='preview'?'Preview workspace summary':'Live workspace summary'}>
      <div><dt>Available equipment</dt><dd>{items!==null?items.filter(i=>i.status==='available'&&!i.checkedOut).length:errors.items?'–':'…'}<small>{items!==null?`of ${items.length} items`:errors.items?'Unavailable':'Loading…'}</small></dd></div>
      <div><dt>{admin?'Active bookings':'Your active bookings'}</dt><dd>{bookings!==null?active.length:errors.bookings?'–':'…'}</dd></div>
      <div><dt>Overdue returns</dt><dd>{bookings!==null?overdue.length:errors.bookings?'–':'…'}</dd></div>
      <div><dt>Open equipment reports</dt><dd>{reports!==null?openReports.length:errors.reports?'–':'…'}</dd></div>
    </dl>}
    {statistics?<>
      <section><h2>Bookings by month</h2><p className="administration-hint">Confirmed reservations by scheduled start, including returned equipment. Cancelled bookings are excluded.</p>
        {errors.bookings?<div className="section-inline-error"><p role="alert">{errors.bookings}</p><button disabled={retrying==='bookings'} onClick={()=>retrySection('bookings')}>{retrying==='bookings'?'Retrying…':'Retry bookings'}</button></div>:bookings===null&&loading?<p className="ws-loading-delayed" role="status">Loading bookings…</p>:<ol className="equipment-chart ws-enter" aria-label="Confirmed bookings by month">{months.map(m=><li key={m.key}><span>{m.label}</span><div><span style={{width:Math.max(m.count?1:0,m.count/max*100)+'%'}}/></div><strong>{m.count}</strong></li>)}</ol>}
      </section>
      <section><h2>Equipment by category</h2>
        {errors.items?<div className="section-inline-error"><p role="alert">{errors.items}</p><button disabled={retrying==='items'} onClick={()=>retrySection('items')}>{retrying==='items'?'Retrying…':'Retry inventory'}</button></div>:items===null&&loading?<p className="ws-loading-delayed" role="status">Loading inventory…</p>:<table><thead><tr><th>Category</th><th>Total</th><th>Checked out</th><th>Out of service</th></tr></thead><tbody className="ws-stagger">{categories.map(category=>{const catItems=items!.filter(i=>i.category===category);return <tr key={category}><td>{category}</td><td>{catItems.length}</td><td>{catItems.filter(i=>i.checkedOut).length}</td><td>{catItems.filter(i=>i.status!=='available').length}</td></tr>})}</tbody></table>}
      </section>
    </>:<>
      <section><div className="equipment-section-heading"><h2>Pickup & return</h2><Link href="/reservations/">All reservations</Link></div>
        {errors.bookings?<div className="section-inline-error"><p role="alert">{errors.bookings}</p><button disabled={retrying==='bookings'} onClick={()=>retrySection('bookings')}>{retrying==='bookings'?'Retrying…':'Retry reservations'}</button></div>:bookings===null&&loading?<p className="ws-loading-delayed" role="status">Loading reservations…</p>:<><table><thead><tr><th>Reservation</th><th>When</th><th>Status</th><th>Action</th></tr></thead><tbody className="ws-stagger">{upcoming.slice(0,8).map(r=><tr key={r.id}><td><Link href={`/reservations/?reservation=${r.id}`}>{r.name}</Link></td><td>{new Date(r.startsAt).toLocaleString()}<small>Return {new Date(r.endsAt).toLocaleString()}</small></td><td>{reservationLabel(r)}{overdue.some(o=>o.id===r.id)&&<small className="equipment-overdue">Overdue</small>}</td><td><Link href={`/check-in-out/?reservation=${r.id}`}>{r.fulfillmentStatus==='checked_out'?'Return':'Pickup details'}</Link></td></tr>)}</tbody></table>{!upcoming.length&&<p className="equipment-empty">No upcoming pickups or returns.</p>}</>}
      </section>
      <section><div className="equipment-section-heading"><h2>Your unread alerts</h2><Link href="/alerts/">All alerts / email preferences</Link></div>
        {errors.alerts?<div className="section-inline-error"><p role="alert">{errors.alerts}</p><button disabled={retrying==='alerts'} onClick={()=>retrySection('alerts')}>{retrying==='alerts'?'Retrying…':'Retry alerts'}</button></div>:alerts===null&&loading?<p className="ws-loading-delayed" role="status">Loading alerts…</p>:<>
        <ul className="equipment-dashboard-alerts">{unreadAlerts.slice(0,5).map(a=><li key={a.id}><strong>{a.title}</strong><p>{a.message}</p><Link href="/alerts/">Review alert</Link></li>)}</ul>{!unreadAlerts.length&&<p className="equipment-empty">You’re caught up.</p>}</>}
      </section>
      <section><div className="equipment-section-heading"><h2>Equipment needing attention</h2><Link href="/reports/">All reports</Link></div>
        {errors.reports?<div className="section-inline-error"><p role="alert">{errors.reports}</p><button disabled={retrying==='reports'} onClick={()=>retrySection('reports')}>{retrying==='reports'?'Retrying…':'Retry reports'}</button></div>:reports===null&&loading?<p className="ws-loading-delayed" role="status">Loading reports…</p>:<>
        <ul className="administration-list">{openReports.slice(0,5).map(r=><li key={r.id}><Link href={`/report-summary/?report=${r.id}`}>{r.title}</Link><span>{r.severity} · {r.status.replaceAll('_',' ')}</span></li>)}</ul>{!openReports.length&&<p className="equipment-empty">No open equipment reports.</p>}</>}
      </section>
    </>}
  </>
 </main>
}
