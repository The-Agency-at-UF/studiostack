import {PreviewError} from './errors'
/** IndexedDB keeps actual local files across refreshes, without uploading them. */
const memory=new Map<string,Blob>(),urls=new Map<string,string>()
let opening:Promise<IDBDatabase>|undefined
function database(){
 if(!opening)opening=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('studiostack-preview-files',1)
  request.onupgradeneeded=()=>request.result.createObjectStore('files')
  request.onsuccess=()=>resolve(request.result)
  request.onerror=()=>{opening=undefined;reject(new PreviewError('Local file storage is unavailable.'))}
 })
 return opening
}
export async function storePreviewFile(key:string,file:Blob){
 if(typeof indexedDB==='undefined'){memory.set(key,file);return}
 const db=await database()
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new PreviewError('The file could not be saved locally. Check available browser storage.'));tx.onabort=()=>reject(new PreviewError('Local file save was cancelled.'))})
 const previous=urls.get(key);if(previous){URL.revokeObjectURL(previous);urls.delete(key)}
}
export async function readPreviewFile(key:string):Promise<Blob>{
 if(typeof indexedDB==='undefined'){const file=memory.get(key);if(!file)throw new PreviewError('The local file is unavailable.');return file}
 const db=await database()
 return new Promise((resolve,reject)=>{const request=db.transaction('files').objectStore('files').get(key);request.onsuccess=()=>request.result instanceof Blob?resolve(request.result):reject(new PreviewError('The local file is unavailable.'));request.onerror=()=>reject(new PreviewError('The local file could not be read.'))})
}
export async function previewFileUrl(key:string){
 const file=await readPreviewFile(key)
 if(!urls.has(key))urls.set(key,URL.createObjectURL(file))
 return {url:urls.get(key)!,expiresIn:3600}
}
export const previewAttachmentKey=(briefId:string,id:string)=>`brief:${briefId}:${id}`
export const previewPhotoKey=(id:string)=>`photo:${id}`
