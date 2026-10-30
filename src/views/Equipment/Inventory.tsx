'use client'
import type {EquipmentRecord} from '../../types/equipment'
import {useCallback,useEffect,useMemo,useState,useRef} from 'react'
import type {FormEvent} from 'react'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import {equipmentCategories,type EquipmentCategory,type EquipmentStatus} from '../../types/database-api'
import {uploadOrganizationPhoto} from '../../api/privatePhotos'
import QRCodeGenerator from '../../components/QRCodeGenerator'
import EquipmentQrScanner from '../../components/EquipmentQrScanner'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import '../Accounts/Administration.css'
import './Equipment.css'
export default function LiveInventory(){const context=useLiveOrganization();return context?<InventoryWorkspace key={context.organization.id} api={context.api} organizationId={context.organization.id} admin={context.admin}/>:<main className="administration"><h1>Inventory</h1><p>Select an active organization in your account to view inventory.</p></main>}
function InventoryWorkspace({api,organizationId,admin}:{api:DatabaseApi;organizationId:string;admin:boolean}) {
  const cacheKey = `inventory:${organizationId}`
  const cached = useMemo(() => getCached<EquipmentRecord[]>(cacheKey), [cacheKey])
  const [items,setItems]=useState<EquipmentRecord[]>(cached ?? [])
  const [selected,setSelected]=useState<string|null>(null)
  const [adding,setAdding]=useState(false)
  const [loading,setLoading]=useState(!cached)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('')
  const load=useCallback(async()=>{
    const rows = await allPages(after=>api.inventory(organizationId,{limit:100,after}))
    setItems(rows)
    setCached(cacheKey, rows)
  },[api,organizationId,cacheKey])
  useEffect(()=>{
    let active=true
    allPages(after=>api.inventory(organizationId,{limit:100,after}))
      .then(rows=>{if(active){setItems(rows);setCached(cacheKey, rows)}})
      .catch(e=>{if(active&&!cached)setError(equipmentError(e))})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[api,organizationId,cacheKey,cached])
  const current=items.find(i=>i.id===selected),filtered=items.filter(i=>(!category||i.category===category)&&`${i.name} ${i.equipmentCode}`.toLowerCase().includes(query.toLowerCase()))
  return <main className="administration"><header><div><p className="administration-eyebrow">Equipment workspace</p><h1>Inventory</h1><p>{items.length} items · Private organization records</p></div><div className="administration-actions"><button onClick={()=>{setError('');void load().catch(e=>setError(equipmentError(e)))}}>Refresh</button>{admin&&<button onClick={()=>{setAdding(true);setSelected(null)}}>Add item</button>}</div></header>
    {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading inventory…</p>}
    <div className="administration-form"><label>Search inventory<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{equipmentCategories.map(c=><option key={c}>{c}</option>)}</select></label></div>
    {!loading&&!error&&!filtered.length&&<p className="equipment-empty">No matching equipment. {admin?'Add an item to get started.':''}</p>}
    <div className="equipment-layout"><section className="administration-table"><table><thead><tr><th>Item</th><th>Category</th><th>Condition</th><th>Service status</th></tr></thead><tbody>{filtered.map(i=><tr key={i.id}><td><button className="equipment-item-link" onClick={()=>{setSelected(i.id);setAdding(false)}}>{i.name}</button><small>{i.equipmentCode}</small></td><td>{i.category}</td><td>{i.condition}</td><td>{i.checkedOut?'Checked out':i.status}</td></tr>)}</tbody></table></section>
      {(current||adding)&&<aside className="equipment-inspector" aria-label="Equipment details"><button className="equipment-item-link" onClick={()=>{setSelected(null);setAdding(false)}}>Close details</button><h2>{current?.name??'Add equipment'}</h2>
        {current?.photoId&&<PrivatePhoto key={`${current.id}:${current.photoId}`} api={api} organizationId={organizationId} item={current}/>}
        {current&&<details><summary>Equipment QR label</summary><QRCodeGenerator equipmentID={current.equipmentCode}/></details>}
        {admin&&<ItemEditor key={current?.id??'new'} api={api} organizationId={organizationId} item={current} onSaved={async item=>{setAdding(false);setSelected(item.id);invalidateCache(`photo:${organizationId}:${item.id}`);invalidateCache(`inventory:${organizationId}`);invalidateCache('dashboard:');await load()}}/>}
      </aside>}
    </div>
  </main>
}
export function PrivatePhoto({api,organizationId,item}:{api:DatabaseApi;organizationId:string;item:EquipmentRecord}) {
  const cacheKey = `photo:${organizationId}:${item.id}`
  const cached = useMemo(() => getCached<{ url: string; expiresAt: number }>(cacheKey, 3_600_000), [cacheKey])
  const validCachedUrl = cached && cached.expiresAt > Date.now() + 10_000 ? cached.url : null
  const [url,setUrl]=useState(validCachedUrl ?? ''),[error,setError]=useState(false)
  useEffect(()=>{
    let active=true,timer:ReturnType<typeof setTimeout>;
    const load=async()=>{
      try{
        const result=await api.photo(organizationId,item.id);
        if(active){
          setUrl(result.url);
          setError(false);
          setCached(cacheKey,{url:result.url,expiresAt:Date.now()+(result.expiresIn??60)*1000});
          timer=setTimeout(()=>void load(),Math.max(10000,(result.expiresIn-10)*1000))
        }
      }catch{
        if(active){
          if(!validCachedUrl) setUrl('');
          setError(true)
        }
      }
    };
    void load();
    return()=>{active=false;clearTimeout(timer)}
  },[api,organizationId,item.id,validCachedUrl,cacheKey])
  return error&&!url?<p>Private photo is unavailable. Refresh to try again.</p>:url?<img className="equipment-photo" src={url} alt={item.name} referrerPolicy="no-referrer" onError={()=>{invalidateCache(cacheKey);setUrl('');setError(true)}}/>:<p role="status">Loading private photo…</p>
}
function ItemEditor({api,organizationId,item,onSaved}:{api:DatabaseApi;organizationId:string;item?:EquipmentRecord;onSaved:(item:EquipmentRecord)=>Promise<void>}) {
  const [code,setCode]=useState(item?.equipmentCode??''),[name,setName]=useState(item?.name??''),[category,setCategory]=useState<EquipmentCategory>(item?.category??'Camera & Accessories'),[status,setStatus]=useState<EquipmentStatus>(item?.status??'available'),[photo,setPhoto]=useState<File|null>(null),[removePhoto,setRemovePhoto]=useState(false),[scan,setScan]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const uploaded=useRef<{file:File;photoId:string}|null>(null)
  async function submit(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{let photoId=item?.photoId??undefined;if(photo){if(uploaded.current?.file!==photo){const result=await uploadOrganizationPhoto(photo,organizationId,api);uploaded.current={file:photo,photoId:result.photoId}}photoId=uploaded.current!.photoId}const saved=item?await api.updateEquipment(organizationId,item.id,{name,category,status,...(photo?{photoId}:removePhoto?{photoId:null}:{})}):await api.createEquipment(organizationId,{equipmentCode:code.trim(),name,category,...(photoId?{photoId}:{})});await onSaved(saved)}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  return <form className="equipment-editor" onSubmit={submit}><fieldset disabled={busy}><label>Equipment code<input value={code} onChange={e=>setCode(e.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,127}" maxLength={128} disabled={Boolean(item)} required/></label>{!item&&<button type="button" onClick={()=>setScan(true)}>Scan QR code</button>}{scan&&<EquipmentQrScanner onCancel={()=>setScan(false)} onCode={value=>{if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value))return false;setCode(value);setScan(false);return true}}/>}
    <label>Item name<input value={name} maxLength={120} onChange={e=>setName(e.target.value)} required/></label><label>Equipment category<select value={category} onChange={e=>setCategory(e.target.value as EquipmentCategory)}>{equipmentCategories.map(c=><option key={c}>{c}</option>)}</select></label>
    {item&&<label>Service status<select value={status} onChange={e=>setStatus(e.target.value as EquipmentStatus)}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></label>}
    <label>Equipment photo<input type="file" accept="image/*,.heic,.heif,.avif" onChange={e=>{setPhoto(e.target.files?.[0]??null);uploaded.current=null;setRemovePhoto(false)}}/></label>{item?.photoId&&!photo&&<label className="administration-checkbox"><input type="checkbox" checked={removePhoto} onChange={e=>setRemovePhoto(e.target.checked)}/>Remove current photo</label>}
    <p className="administration-hint">Photos stay private to the organization. Retire equipment to preserve its history.</p><button disabled={busy||scan}>{busy?'Saving equipment…':item?'Save equipment':'Create equipment'}</button></fieldset>{error&&<p role="alert">{error}</p>}</form>
}
