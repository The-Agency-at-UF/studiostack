'use client'
import {HiOutlineCamera} from 'react-icons/hi2'
import {useEffect,useMemo,useRef,useState} from 'react'
import type {EquipmentRecord} from '../../types/equipment'
import type {DatabaseApi} from './live'
import {getCached,setCached,invalidateCache} from '../../api/cache'
/** Small list photo, fetched only once its row scrolls into view and shared with the inspector's photo cache. */
export function PhotoThumbnail({api,organizationId,item}:{api:DatabaseApi;organizationId:string;item:EquipmentRecord}) {
  const cacheKey=`photo:${organizationId}:${item.id}`
  const ref=useRef<HTMLSpanElement>(null)
  const [url,setUrl]=useState(()=>{const cached=item.photoId?getCached<{url:string;expiresAt:number}>(cacheKey,3_600_000):null;return cached&&cached.expiresAt>Date.now()+10_000?cached.url:''})
  const [visible,setVisible]=useState(false)
  useEffect(()=>{
    const node=ref.current
    if(!item.photoId||url||!node)return
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return}
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect()}},{rootMargin:'200px'})
    observer.observe(node)
    return()=>observer.disconnect()
  },[item.photoId,url])
  useEffect(()=>{
    if(!visible||!item.photoId||url)return
    let active=true
    api.photo(organizationId,item.id).then(result=>{if(!active)return;setCached(cacheKey,{url:result.url,expiresAt:Date.now()+(result.expiresIn??60)*1000});setUrl(result.url)}).catch(()=>{})
    return()=>{active=false}
  },[visible,item.photoId,item.id,url,api,organizationId,cacheKey])
  return <span ref={ref} className="inventory-thumb" aria-hidden="true">{url?<img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>{invalidateCache(cacheKey);setUrl('')}}/>:<HiOutlineCamera/>}</span>
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
