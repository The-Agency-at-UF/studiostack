'use client'
import { DetailPanel, Select, Skeleton, StatusLabel, LoadError, Notice, Button, WorkspaceTabs, FieldError } from '../../components/workspace/WorkspaceUI'
import { Pagination } from '../../components/workspace/Pagination'
import { usePagination } from '../../components/workspace/usePagination'
import {useToast} from '../../components/workspace/Toast'
import {HiOutlineMagnifyingGlass,HiOutlineXMark,HiOutlinePlus} from 'react-icons/hi2'
import type {EquipmentRecord} from '../../types/equipment'
import {useCallback,useEffect,useMemo,useState,useRef} from 'react'
import type {FormEvent} from 'react'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import {equipmentCategories,equipmentColors,type EquipmentCategory,type EquipmentStatus} from '../../types/database-api'
import {uploadOrganizationPhoto} from '../../api/privatePhotos'
import QRCodeGenerator from '../../components/QRCodeGenerator'
import EquipmentQrScanner from '../../components/EquipmentQrScanner'
import ScanHandoff from './ScanHandoff'
import {PhotoThumbnail,PrivatePhoto} from './EquipmentPhoto'
import {generatedEquipmentCode,sameEquipmentCode} from './equipmentCode'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import ConfirmDialog from '../../components/workspace/ConfirmDialog'
import {useUnsavedGuard} from '../../components/workspace/useUnsavedGuard'
import { tabPanelProps } from '../../components/workspace/tabs'
export default function LiveInventory(){const context=useLiveOrganization();return context?<InventoryWorkspace key={context.organization.id} api={context.api} organizationId={context.organization.id} admin={context.admin}/>:<main className="administration"><h1>Equipment</h1><p>Select an active organization in your account to view equipment.</p></main>}
function InventoryWorkspace({api,organizationId,admin}:{api:DatabaseApi;organizationId:string;admin:boolean}) {
  const toast=useToast()
  const cacheKey = `inventory:${organizationId}`
  const cached = useMemo(() => getCached<EquipmentRecord[]>(cacheKey), [cacheKey])
  const [items,setItems]=useState<EquipmentRecord[]>(cached ?? [])
  const [selected,setSelected]=useState<string|null>(null)
  const [adding,setAdding]=useState(false)
  const [addCode,setAddCode]=useState('')
  const [added,setAdded]=useState('')
  const [scanning,setScanning]=useState(false)
  const [loading,setLoading]=useState(!cached)
  const [error,setError]=useState('')
  // The last load failed. With nothing cached the counts read "–", never "0 items".
  const [loadFailed,setLoadFailed]=useState('')
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('')
  const [reported,setReported]=useState<Set<string>>(new Set())
  useEffect(()=>{
    let active=true
    allPages(after=>api.reports(organizationId).list(after))
      .then(rows=>{if(active)setReported(new Set(rows.filter(r=>r.status!=='resolved').map(r=>r.equipmentId)))})
      .catch(()=>{/* The badge is a hint; the list still works without it. */})
    return()=>{active=false}
  },[api,organizationId])
  const load=useCallback(async()=>{
    const rows = await allPages(after=>api.inventory(organizationId,{limit:100,after}))
    setItems(rows)
    setCached(cacheKey, rows)
  },[api,organizationId,cacheKey])
  useEffect(()=>{
    let active=true
    allPages(after=>api.inventory(organizationId,{limit:100,after}))
      .then(rows=>{if(active){setItems(rows);setCached(cacheKey, rows);setLoadFailed('')}})
      .catch(e=>{if(active)setLoadFailed(equipmentError(e,'load'))})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[api,organizationId,cacheKey,cached])
  // /inventory/?add=CODE opens the add form for a label scanned elsewhere (Pickup & return).
  useEffect(()=>{const code=new URLSearchParams(window.location.search).get('add');if(code&&admin){setAddCode(code);setAdding(true)}},[admin])
  const [view,setView]=useState<InventoryView>('all')
  const [refreshing,setRefreshing]=useState(false)
  const current=items.find(i=>i.id===selected)
  const counts=useMemo(()=>Object.fromEntries(inventoryViews.map(([id])=>[id,items.filter(i=>matchesView(i,id)).length])) as Record<InventoryView,number>,[items])
  const needle=query.trim().toLowerCase()
  // Sorted by name so a long list is scannable; the Item header says so (aria-sort).
  const filtered=items.filter(i=>matchesView(i,view)&&(!category||i.category===category)&&`${i.name} ${i.equipmentCode}`.toLowerCase().includes(needle)).sort((a,b)=>a.name.localeCompare(b.name))
  const {pageRows,pagination}=usePagination(filtered,[organizationId,view,category,needle])
  const filtering=Boolean(needle||category)
  // Unsaved edits in the equipment form hold row switches, closing and leaving until the person agrees.
  const [editorDirty,setEditorDirty]=useState(false),[pendingLeave,setPendingLeave]=useState<(()=>void)|null>(null)
  const guard=(go:()=>void)=>{if(editorDirty)setPendingLeave(()=>go);else go()}
  useUnsavedGuard(editorDirty,proceed=>setPendingLeave(()=>proceed))
  // Opening details moves focus (and the view, on narrow screens where the panel sits below the list) to its heading;
  // closing returns focus to the row that opened it.
  const panelHeading=useRef<HTMLHeadingElement>(null),returnTo=useRef<string|null>(null)
  useEffect(()=>{if(!selected&&!adding){const id=returnTo.current;returnTo.current=null;if(id)document.querySelector<HTMLElement>(`[data-item="${id}"]`)?.focus();return}
    const heading=panelHeading.current;if(!heading)return;heading.scrollIntoView?.({block:'start',behavior:'smooth'});heading.focus({preventScroll:true})},[selected,adding])
  const closeDetails=()=>guard(()=>{returnTo.current=selected;setEditorDirty(false);setSelected(null);setAdding(false);setAdded('')})
  const inspect=(id:string)=>{if(id===selected)return;guard(()=>{setEditorDirty(false);setSelected(id);setAdding(false);setAdded('')})}
  const refresh=async()=>{setError('');setRefreshing(true);try{await load();setLoadFailed('')}catch(e){setLoadFailed(equipmentError(e,'load'))}finally{setRefreshing(false)}}
  const unknown=Boolean(loadFailed)&&!items.length
  return <main className="administration workspace-surface inventory-workspace">
    {pendingLeave&&<ConfirmDialog title="Discard unsaved equipment changes?" description="Your edits to this equipment haven’t been saved." confirmLabel="Discard changes" cancelLabel="Keep editing" onCancel={()=>setPendingLeave(null)} onConfirm={()=>{const go=pendingLeave;setPendingLeave(null);setEditorDirty(false);go()}}/>}
    <header>
      <div><h1>Equipment</h1></div>
      <div className="administration-actions">
        <button type="button" onClick={()=>void refresh()} disabled={refreshing} aria-busy={refreshing}>{refreshing?'Refreshing…':'Refresh'}</button>
        <button type="button" onClick={()=>setScanning(true)}>Scan equipment</button>
        {admin&&<Button variant="primary" onClick={()=>{setAdding(true);setAddCode('');setAdded('');setSelected(null)}}><HiOutlinePlus aria-hidden="true"/>Add item</Button>}
      </div>
    </header>
    {error&&<p role="alert" className="inventory-error">{error}</p>}
    {loadFailed&&items.length>0&&<Notice kind="warning" action={<Button onClick={()=>void refresh()} disabled={refreshing}>{refreshing?'Retrying…':'Retry'}</Button>}>Showing the equipment list saved on this device; it may be out of date. {loadFailed}</Notice>}
    {scanning&&<ScanHandoff api={api} organizationId={organizationId} items={items} admin={admin} onClose={()=>setScanning(false)} onAdd={code=>{setScanning(false);setAddCode(code);setAdded('');setAdding(true);setSelected(null)}} onSaved={async()=>{for(const key of ['fulfillment','reservations','inventory','dashboard','reports'])invalidateCache(`${key}:${organizationId}`);await load().catch(e=>setError(equipmentError(e)))}}/>}
    <WorkspaceTabs className="inventory-tabs" label="Equipment views" active={view} onChange={value=>setView(value as InventoryView)} items={inventoryViews.map(([value,label])=>({value,label}))} counts={!loading&&!unknown?counts:undefined}/>
    <div className="inventory-toolbar">
      <label className="inventory-search"><span className="ws-sr-only">Search equipment</span><HiOutlineMagnifyingGlass aria-hidden="true"/><input type="search" placeholder="Search by name or code" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label className="inventory-category"><span className="ws-sr-only">Category</span><Select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{equipmentCategories.map(c=><option key={c}>{c}</option>)}</Select></label>
      {!loading&&!unknown&&<p className="inventory-result-count" aria-live="polite">{filtering?`${filtered.length} of ${plural(counts[view],'item')}`:plural(filtered.length,'item')}</p>}
      {filtering&&<button type="button" className="inventory-clear" onClick={()=>{setQuery('');setCategory('')}}>Clear filters</button>}
    </div>
    <div className="equipment-layout">
      <section className="administration-table inventory-table" {...tabPanelProps('Equipment views',view)}>
        {loading?<Skeleton label="Loading equipment…" variant="row" count={5}/>:filtered.length?<table>
          <thead><tr><th scope="col" aria-sort="ascending">Item <span className="ws-sr-only">(A to Z)</span></th><th scope="col">Category</th><th scope="col">Condition</th><th scope="col">Status</th></tr></thead>
          <tbody className="ws-stagger">{pageRows.map(i=>{const status=serviceStatus(i);return <tr key={i.id} className={i.id===selected?'is-selected':undefined} onClick={()=>inspect(i.id)}>
            <td><div className="inventory-item"><PhotoThumbnail api={api} organizationId={organizationId} item={i}/><div><button type="button" className="equipment-item-link" data-item={i.id} aria-current={i.id===selected?'true':undefined} onClick={e=>{e.stopPropagation();inspect(i.id)}}>{i.name}</button><small className="inventory-code">{i.equipmentCode}</small></div></div></td>
            <td>{i.category}{i.colorTag&&<small className="equipment-color-tag"><span className={`equipment-color equipment-color-${i.colorTag}`} aria-hidden="true"/>{i.colorTag}</small>}</td>
            <td><span className={`inventory-condition inventory-condition-${i.condition}`}>{capitalize(i.condition)}</span>{reported.has(i.id)&&<a className="inventory-open-report" href="/reports/" onClick={e=>e.stopPropagation()}>Open report</a>}</td>
            <td><StatusLabel tone={status.tone}>{status.label}</StatusLabel></td>
          </tr>})}</tbody>
        </table>:unknown?<LoadError what="Equipment" message={loadFailed} onRetry={()=>void refresh()} retrying={refreshing}/>:<div className="inventory-empty">
          {items.length?<><p>No equipment matches these filters.</p>{filtering?<button type="button" onClick={()=>{setQuery('');setCategory('')}}>Clear filters</button>:<button type="button" onClick={()=>setView('all')}>Show all equipment</button>}</>
          :<><p>No equipment yet.</p><span>{admin?'Add an item or scan an existing label to start tracking equipment.':'An organization admin can add equipment for this organization.'}</span></>}
        </div>}
        {!loading&&<Pagination label="Equipment" pagination={pagination}/>}
      </section>
      {(current||adding)&&<DetailPanel className="equipment-inspector" label="Equipment details">
        <div className="inventory-inspector-head">
          <div><h2 ref={panelHeading} tabIndex={-1}>{current?.name??'Add equipment'}</h2>{current&&<p>{current.equipmentCode} ({current.category})</p>}</div>
          <button type="button" className="inventory-close ws-inspector-close" aria-label="Close details" onClick={closeDetails}><HiOutlineXMark aria-hidden="true"/></button>
        </div>
        {current&&<dl className="inventory-facts"><div><dt>Status</dt><dd><StatusLabel tone={serviceStatus(current).tone}>{serviceStatus(current).label}</StatusLabel></dd></div><div><dt>Condition</dt><dd className={`inventory-condition inventory-condition-${current.condition}`}>{capitalize(current.condition)}</dd></div></dl>}
        {current?.photoId&&<PrivatePhoto key={`${current.id}:${current.photoId}`} api={api} organizationId={organizationId} item={current}/>}
        {current&&added===current.id&&<p role="status" className="inventory-added">{current.name} added. Download its QR label and attach it so it can be scanned at pickup and return.</p>}
        {current&&<details className="inventory-label" open={added===current.id}><summary>Equipment QR label</summary><QRCodeGenerator equipmentID={current.equipmentCode}/></details>}
        {admin&&<>{current&&<h3 className="inventory-editor-heading">Edit details</h3>}<ItemEditor key={current?.id??'new:'+addCode} onDirtyChange={setEditorDirty} api={api} organizationId={organizationId} items={items} item={current} initialCode={addCode} onSaved={async item=>{if(!current)setAdded(item.id);setAdding(false);setSelected(item.id);invalidateCache(`photo:${organizationId}:${item.id}`);invalidateCache(`inventory:${organizationId}`);invalidateCache('dashboard:');if(current)toast.success(`${item.name} saved.`,{id:'equipment'});try{await load()}catch{toast.error('Equipment saved, but the list could not reload. Refresh to see the latest.',{id:'equipment-reload'})}}}/></>}
      </DetailPanel>}
    </div>
  </main>
}
type InventoryView='all'|'ready'|'out'|'service'
const inventoryViews:[InventoryView,string][]=[['all','All equipment'],['ready','Available'],['out','Checked out'],['service','Maintenance']]
function matchesView(item:EquipmentRecord,view:InventoryView){return view==='all'||view==='out'&&item.checkedOut||view==='ready'&&!item.checkedOut&&item.status==='available'||view==='service'&&item.status==='maintenance'}
function serviceStatus(item:EquipmentRecord):{label:string;tone:'neutral'|'accent'|'success'|'warning'}{if(item.checkedOut)return {label:'Checked out',tone:'accent'};if(item.status==='maintenance')return {label:'Maintenance',tone:'warning'};if(item.status==='retired')return {label:'Archive',tone:'neutral'};return {label:'Available',tone:'success'}}
const capitalize=(value?:string|null)=>value?value.charAt(0).toUpperCase()+value.slice(1):"Not recorded"
const plural=(count:number,noun:string)=>`${count} ${noun}${count===1?'':'s'}`
/** Suggests a label code for gear that has no QR label yet, such as LIG-7K2Q for a light. */
function ItemEditor({api,organizationId,items,item:loadedItem,initialCode='',onSaved,onDirtyChange}:{api:DatabaseApi;organizationId:string;items:EquipmentRecord[];item?:EquipmentRecord;initialCode?:string;onSaved:(item:EquipmentRecord)=>Promise<void>;onDirtyChange?:(dirty:boolean)=>void}) {
  const [item]=useState(loadedItem)
  const [code,setCode]=useState(item?.equipmentCode??initialCode),[name,setName]=useState(item?.name??''),[category,setCategory]=useState<EquipmentCategory>(item?.category??'Camera & Accessories'),[status,setStatus]=useState<EquipmentStatus>(item?.status??'available'),[colorTag,setColorTag]=useState(item?.colorTag??''),[photo,setPhoto]=useState<File|null>(null),[removePhoto,setRemovePhoto]=useState(false),[scan,setScan]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const uploaded=useRef<{file:File;photoId:string}|null>(null)
  // Unsaved edits hold row switches and navigation (see the workspace's guard).
  const dirty=Boolean(photo)||removePhoto||(item?name!==item.name||category!==item.category||status!==item.status||colorTag!==(item.colorTag??''):Boolean(name.trim()))
  useEffect(()=>{onDirtyChange?.(dirty)},[dirty,onDirtyChange])
  // Each mistake is shown next to its field and named on it (aria-invalid / aria-describedby), not in a browser bubble.
  const [fieldError,setFieldError]=useState<{field:'code'|'name';message:string}|null>(null)
  const codeRule=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
  async function submit(e:FormEvent){e.preventDefault();if(busy||unchanged)return;setFieldError(null)
    const cleanName=name.trim(),cleanCode=code.trim().toUpperCase()
    if(!item&&!cleanCode){setFieldError({field:'code',message:'Enter an equipment code, scan a label or generate a code.'});return}
    if(!item&&!codeRule.test(cleanCode)){setFieldError({field:'code',message:'Use letters, numbers, dot, dash or underscore, starting with a letter or number. No spaces.'});return}
    if(!cleanName){setFieldError({field:'name',message:'Enter an item name.'});return}
    if(!item&&items.some(existing=>sameEquipmentCode(existing.equipmentCode,cleanCode))){setFieldError({field:'code',message:'That equipment code already exists.'});return}
    setBusy(true);setError('');try{let photoId=item?.photoId??undefined;if(photo){if(uploaded.current?.file!==photo){const result=await uploadOrganizationPhoto(photo,organizationId,api);uploaded.current={file:photo,photoId:result.photoId}}photoId=uploaded.current!.photoId}const saved=item?await api.updateEquipment(organizationId,item.id,{version:item.version,
    ...(name.trim()!==item.name?{name:cleanName}:{}),...(category!==item.category?{category}:{}),...(status!==item.status?{status}:{}),
    ...(colorTag!==(item.colorTag??'')?{colorTag:colorTag?colorTag as typeof equipmentColors[number]:null}:{}),
    ...(photo?{photoId}:removePhoto?{photoId:null}:{})}):await api.createEquipment(organizationId,{equipmentCode:cleanCode,name:cleanName,category,...(colorTag?{colorTag:colorTag as typeof equipmentColors[number]}:{}),...(photoId?{photoId}:{})});onDirtyChange?.(false);await onSaved(saved)}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  const unchanged = item && name.trim()===item.name && category===item.category && status===item.status && colorTag===(item.colorTag??'') && !photo && !removePhoto
  const invalid=(field:'code'|'name')=>fieldError?.field===field?{'aria-invalid':true as const,'aria-describedby':`item-${field}-error`}:{}
  return <form className="equipment-editor" noValidate onSubmit={submit}><fieldset disabled={busy}><label>Equipment code<input value={code} onChange={e=>{setCode(e.target.value);setFieldError(null)}} maxLength={128} disabled={Boolean(item)} autoCapitalize="characters" spellCheck={false} required {...invalid('code')}/></label>{fieldError?.field==='code'&&<FieldError id="item-code-error">{fieldError.message}</FieldError>}{!item&&<><button type="button" onClick={()=>setScan(true)}>Scan existing label</button><button type="button" onClick={()=>setCode(generatedEquipmentCode(category))}>Generate new code</button><p className="administration-hint">Scan a label already on the equipment, or generate a code and print its QR label after saving.</p></>}{scan&&<EquipmentQrScanner onCancel={()=>setScan(false)} rejectedMessage="That QR code isn’t an equipment label. Labels use letters, numbers, dot, dash or underscore." onCode={value=>{if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value))return false;setCode(value);setScan(false);return true}}/>}
    <label>Item name<input value={name} maxLength={120} onChange={e=>{setName(e.target.value);setFieldError(null)}} required {...invalid('name')}/></label>{fieldError?.field==='name'&&<FieldError id="item-name-error">{fieldError.message}</FieldError>}<label>Equipment category<Select value={category} onChange={e=>setCategory(e.target.value as EquipmentCategory)}>{equipmentCategories.map(c=><option key={c}>{c}</option>)}</Select></label>
    <label>Color tag<Select value={colorTag} onChange={e=>setColorTag(e.target.value)}><option value="">No color tag</option>{equipmentColors.map(c=><option key={c} value={c}>{c}</option>)}</Select></label>
    {item&&<label>Service status<Select value={status} onChange={e=>setStatus(e.target.value as EquipmentStatus)}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="retired">Archive</option></Select></label>}
    {<label>Equipment photo<input type="file" accept="image/*,.heic,.heif,.avif" onChange={e=>{setPhoto(e.target.files?.[0]??null);uploaded.current=null;setRemovePhoto(false)}}/></label>}{item?.photoId&&!photo&&<label className="administration-checkbox"><input type="checkbox" checked={removePhoto} onChange={e=>setRemovePhoto(e.target.checked)}/>Remove current photo</label>}
    <p className="administration-hint">Photos stay private to the organization. Archive equipment to preserve its history. Record breakage in Equipment reports or during return.</p><button className="ws-button-primary" disabled={busy||scan||Boolean(unchanged)}>{busy?'Saving equipment…':item?'Save equipment':'Create equipment'}</button></fieldset>{error&&<p role="alert">{error}</p>}</form>
}
